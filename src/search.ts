/**
 * Tree search — architect-logic wall placement.
 *
 * Thinks like an architect:
 * 1. First: divide the glass frontage between living & bedroom (vertical split)
 * 2. Then: separate service zone from living spaces (horizontal walls)
 * 3. Then: subdivide service zones into kitchen, bath, closets
 */

import { Grid, cloneGrid, cellsToFeet } from './grid';
import { WallMove, placeWall, undoWall } from './walls';
import { validateWallMove, checkConnectivity, checkMinGap } from './validate';
import { findRegions, matchRooms } from './matcher';
import { RoomProgram, defaultOneBedProgram } from './program';

export interface SearchState {
  grid: Grid;
  entryX: number;
  entryY: number;
  walls: WallMove[];
  interiorBounds: { xMin: number; xMax: number; yMin: number; yMax: number };
  program?: RoomProgram;
}

function scoreProgramMatch(state: SearchState): number {
  const program = state.program || defaultOneBedProgram();
  const regions = findRegions(state.grid, state.interiorBounds, state.walls);
  const result = matchRooms(regions, program);
  return result.score;
}

/**
 * Phase 1: Vertical split along the glass wall.
 * An architect looks at the glass frontage and decides where to divide
 * living from bedroom. Position is driven by the room program minimums.
 */
function generateGlassSplits(state: SearchState): WallMove[] {
  const moves: WallMove[] = [];
  const { xMin, xMax, yMin, yMax } = state.interiorBounds;
  const program = state.program || defaultOneBedProgram();
  const wallHeight = yMax - yMin + 1;

  // Find glass-preferring rooms — bedroom has priority over kitchen for glass
  const living = program.rooms.find(r => r.enabled && r.name === 'Living/Dining' && r.prefersGlass);
  const bedroom = program.rooms.find(r => r.enabled && r.name === 'Bedroom' && r.prefersGlass);

  const interiorWidth = xMax - xMin + 1;
  const positions: number[] = [];

  if (living && bedroom) {
    // Both need glass frontage. Bedroom takes precedent if space is tight.
    // Try: living on left, bedroom on right
    for (let offset = -3; offset <= 6; offset += 3) {
      const x = xMin + living.minWidth + offset;
      if (x > xMin + 6 && x < xMax - bedroom.minWidth) {
        positions.push(x);
      }
    }

    // Try: bedroom on left, living on right
    for (let offset = -3; offset <= 6; offset += 3) {
      const x = xMin + bedroom.minWidth + offset;
      if (x > xMin + 6 && x < xMax - living.minWidth) {
        positions.push(x);
      }
    }

    // If not enough room for both at minimum, give bedroom its min
    // and living gets whatever's left
    if (positions.length === 0) {
      positions.push(xMin + bedroom.minWidth);
      positions.push(xMax - bedroom.minWidth);
    }
  }

  // Also try center and common proportions for variety
  const center = xMin + Math.floor(interiorWidth / 2);
  positions.push(center - 2, center, center + 2);
  positions.push(xMin + Math.floor(interiorWidth * 0.4));
  positions.push(xMin + Math.floor(interiorWidth * 0.6));

  // Add jitter for variety
  const jittered: number[] = [];
  for (const p of positions) {
    const j = Math.floor(Math.random() * 5) - 2;
    const x = Math.max(xMin + 6, Math.min(xMax - 6, p + j));
    jittered.push(x);
  }

  const seen = new Set<number>();
  for (const x of jittered) {
    if (seen.has(x)) continue;
    seen.add(x);

    // Door positions along the wall height
    const doorPositions = [
      Math.floor((wallHeight - 9) * 0.3),
      Math.floor((wallHeight - 9) * 0.5),
      Math.floor((wallHeight - 9) * 0.7),
    ];

    for (const doorPos of doorPositions) {
      moves.push({
        orientation: 'vertical',
        thickness: 1,
        start: { x, y: yMin },
        end: { x, y: yMax },
        openings: [doorPos],
        label: `Glass split at x=${x} (${cellsToFeet(x - xMin)} from left)`,
      });
    }
  }

  return moves;
}

/**
 * Phase 2: Horizontal walls to separate service zone from living spaces.
 * Creates the back-of-house (kitchen, bath, closets) behind the living spaces.
 */
function generateServiceWalls(state: SearchState): WallMove[] {
  const moves: WallMove[] = [];
  const { xMin, xMax, yMin, yMax } = state.interiorBounds;
  const program = state.program || defaultOneBedProgram();

  // Find the vertical split wall to know the bays
  const vertWalls = state.walls.filter(w => w.orientation === 'vertical');
  if (vertWalls.length === 0) return moves;

  const splitX = vertWalls[0].start.x;

  // Find glass rooms to determine how deep the living spaces need to be
  const glassRooms = program.rooms.filter(r => r.enabled && r.prefersGlass);
  const minLivingDepth = Math.max(...glassRooms.map(r => r.minDepth), 24);

  // The horizontal wall goes at a y position that gives glass rooms their min depth
  // Living/bedroom depth is measured from glass (yMin) upward
  const bays = [
    { left: xMin, right: splitX, label: 'left' },
    { left: splitX, right: xMax, label: 'right' },
  ];

  for (const bay of bays) {
    const bayWidth = bay.right - bay.left + 1;
    if (bayWidth < 6) continue;

    // Try different service wall positions
    for (let depth = minLivingDepth; depth <= minLivingDepth + 12; depth += 3) {
      const wallY = yMin + depth;
      const jitter = Math.floor(Math.random() * 5) - 2;
      const y = Math.max(yMin + 6, Math.min(yMax - 6, wallY + jitter));

      const segWidth = bay.right - bay.left + 1;
      const doorPositions = [
        Math.floor((segWidth - 9) * 0.3),
        Math.floor((segWidth - 9) * 0.5),
        Math.floor((segWidth - 9) * 0.7),
      ].filter(d => d >= 0);

      for (const doorPos of doorPositions) {
        moves.push({
          orientation: 'horizontal',
          thickness: 1,
          start: { x: bay.left, y },
          end: { x: bay.right, y },
          openings: [doorPos],
          label: `Service wall in ${bay.label} bay at y=${y}`,
        });
      }
    }
  }

  return moves;
}

/**
 * Phase 3: Subdivide remaining regions into smaller rooms.
 * Creates kitchen, bathroom, closets from the service zones.
 */
function generateSubdivisions(state: SearchState): WallMove[] {
  const moves: WallMove[] = [];
  const { xMin, xMax, yMin, yMax } = state.interiorBounds;

  // Find existing wall positions to determine bays
  const anchorXs = [xMin - 1, xMax + 1, ...state.walls.filter(w => w.orientation === 'vertical').map(w => w.start.x)];
  const anchorYs = [yMin - 1, yMax + 1, ...state.walls.filter(w => w.orientation === 'horizontal').map(w => w.start.y)];

  const sortedXs = [...new Set(anchorXs)].sort((a, b) => a - b);
  const sortedYs = [...new Set(anchorYs)].sort((a, b) => a - b);

  // Only subdivide the service zones (corridor side), not the glass zones.
  // The glass zones house living/bedroom and should not be cut up.
  // Identify service zone: compartments that don't touch the glass wall (yMin).
  const program = state.program || defaultOneBedProgram();
  const smallestRoomMin = Math.min(
    ...program.rooms.filter(r => r.enabled).map(r => Math.min(r.minWidth, r.minDepth))
  );

  // Try horizontal subdivisions within each bay (service zone only)
  for (let xi = 0; xi < sortedXs.length - 1; xi++) {
    const leftX = sortedXs[xi] + 1;
    const rightX = sortedXs[xi + 1] - 1;
    if (rightX - leftX < 6) continue;
    const segWidth = rightX - leftX + 1;

    for (let yi = 0; yi < sortedYs.length - 1; yi++) {
      const topY = sortedYs[yi] + 1;
      const botY = sortedYs[yi + 1] - 1;
      const compartmentHeight = botY - topY + 1;

      // Skip glass-touching compartments (these are living/bedroom zones)
      if (topY <= yMin + 2) continue;

      if (compartmentHeight < smallestRoomMin * 2 + 1) continue;

      // Try splitting this compartment
      for (let pct = 30; pct <= 70; pct += 10) {
        const y = topY + Math.round((botY - topY) * pct / 100);
        const jitter = Math.floor(Math.random() * 5) - 2;
        const wallY = Math.max(topY + 6, Math.min(botY - 6, y + jitter));

        const doorPositions = [
          Math.floor((segWidth - 9) * 0.3),
          Math.floor((segWidth - 9) * 0.5),
        ].filter(d => d >= 0);

        for (const doorPos of doorPositions) {
          moves.push({
            orientation: 'horizontal',
            thickness: 1,
            start: { x: leftX, y: wallY },
            end: { x: rightX, y: wallY },
            openings: [doorPos],
            label: `Subdivide H at y=${wallY}`,
          });
        }
      }
    }
  }

  // Try vertical subdivisions within each bay
  for (let yi = 0; yi < sortedYs.length - 1; yi++) {
    const topY = sortedYs[yi] + 1;
    const botY = sortedYs[yi + 1] - 1;
    if (botY - topY < 6) continue;
    const segHeight = botY - topY + 1;

    for (let xi = 0; xi < sortedXs.length - 1; xi++) {
      const leftX = sortedXs[xi] + 1;
      const rightX = sortedXs[xi + 1] - 1;
      const compartmentWidth = rightX - leftX + 1;

      // Skip glass-touching compartments
      if (topY <= yMin + 2) continue;

      if (compartmentWidth < smallestRoomMin * 2 + 1) continue;

      for (let pct = 30; pct <= 70; pct += 10) {
        const x = leftX + Math.round((rightX - leftX) * pct / 100);
        const jitter = Math.floor(Math.random() * 5) - 2;
        const wallX = Math.max(leftX + 6, Math.min(rightX - 6, x + jitter));

        const doorPositions = [
          Math.floor((segHeight - 9) * 0.3),
          Math.floor((segHeight - 9) * 0.5),
        ].filter(d => d >= 0);

        for (const doorPos of doorPositions) {
          moves.push({
            orientation: 'vertical',
            thickness: 1,
            start: { x: wallX, y: topY },
            end: { x: wallX, y: botY },
            openings: [doorPos],
            label: `Subdivide V at x=${wallX}`,
          });
        }
      }
    }
  }

  return moves;
}

/**
 * Generate candidates based on current phase.
 */
function generateCandidates(state: SearchState): WallMove[] {
  const step = state.walls.length;

  if (step === 0) {
    // Phase 1: Split the glass frontage
    return generateGlassSplits(state);
  } else if (step <= 2) {
    // Phase 2: Create service walls in each bay
    return generateServiceWalls(state);
  } else {
    // Phase 3: Subdivide into individual rooms
    return generateSubdivisions(state);
  }
}

/**
 * Run one step: generate candidates, validate, score with matcher, pick best.
 */
export function searchStep(state: SearchState): WallMove | null {
  const candidates = generateCandidates(state);
  if (candidates.length === 0) return null;

  let bestMove: WallMove | null = null;
  let bestScore = -Infinity;

  for (const move of candidates) {
    const validation = validateWallMove(state.grid, move);
    if (!validation.valid) continue;

    const gapCheck = checkMinGap(state.grid, move);
    if (!gapCheck.valid) continue;

    const filled = placeWall(state.grid, move);
    const connected = checkConnectivity(state.grid, state.entryX, state.entryY);

    if (!connected) {
      undoWall(state.grid, filled);
      continue;
    }

    state.walls.push(move);
    const score = scoreProgramMatch(state);
    state.walls.pop();
    undoWall(state.grid, filled);

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

/**
 * Run the full search with multiple random attempts.
 * Each attempt follows architect logic: glass split → service walls → subdivisions.
 */
export function runSearch(state: SearchState, maxSteps: number = 8): WallMove[] {
  const ATTEMPTS = 8;
  let bestMoves: WallMove[] = [];
  let bestScore = -Infinity;

  const origGrid = cloneGrid(state.grid);
  const origWalls = [...state.walls];

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    state.grid = cloneGrid(origGrid);
    state.walls = [...origWalls];

    const moves: WallMove[] = [];

    for (let i = 0; i < maxSteps; i++) {
      const move = searchStep(state);
      if (!move) break;

      placeWall(state.grid, move);
      state.walls.push(move);
      moves.push(move);
    }

    const score = scoreProgramMatch(state);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = moves;
    }
  }

  // Replay best
  state.grid = cloneGrid(origGrid);
  state.walls = [...origWalls];
  for (const move of bestMoves) {
    placeWall(state.grid, move);
    state.walls.push(move);
  }

  return bestMoves;
}
