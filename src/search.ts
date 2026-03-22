/**
 * Monte Carlo search — walls first, rooms emerge.
 *
 * No prescriptive architect logic. Instead:
 * 1. Place random valid walls (random position, orientation, door)
 * 2. Score the resulting layout against the room program
 * 3. Repeat hundreds of times
 * 4. Keep the best layout
 *
 * The 4" grid + brute-force search finds layouts a human wouldn't try.
 */

import { Grid, cloneGrid } from './grid';
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
 * Generate a single random wall within the interior.
 * No architect logic — pure random placement.
 */
function randomWall(state: SearchState): WallMove | null {
  const { xMin, xMax, yMin, yMax } = state.interiorBounds;

  // Random orientation
  const horizontal = Math.random() < 0.5;

  // Find anchor points (exterior walls + existing walls)
  const existingV = state.walls.filter(w => w.orientation === 'vertical').map(w => w.start.x);
  const existingH = state.walls.filter(w => w.orientation === 'horizontal').map(w => w.start.y);
  const anchorXs = [xMin - 1, xMax + 1, ...existingV].sort((a, b) => a - b);
  const anchorYs = [yMin - 1, yMax + 1, ...existingH].sort((a, b) => a - b);

  if (horizontal) {
    // Pick a random y position
    const y = yMin + 6 + Math.floor(Math.random() * (yMax - yMin - 12));

    // Pick a random horizontal span (between two vertical anchors, or full width)
    const useFullSpan = Math.random() < 0.3;
    let startX: number, endX: number;

    if (useFullSpan || anchorXs.length <= 2) {
      startX = xMin;
      endX = xMax;
    } else {
      // Pick two adjacent vertical anchors
      const idx = Math.floor(Math.random() * (anchorXs.length - 1));
      startX = anchorXs[idx] + 1;
      endX = anchorXs[idx + 1] - 1;
    }

    if (endX - startX < 6) return null;
    const wallLen = endX - startX + 1;
    const doorPos = Math.floor(Math.random() * Math.max(1, wallLen - 9));

    return {
      orientation: 'horizontal',
      thickness: 1,
      start: { x: startX, y },
      end: { x: endX, y },
      openings: [doorPos],
      label: `H-wall at y=${y}`,
    };
  } else {
    // Pick a random x position
    const x = xMin + 6 + Math.floor(Math.random() * (xMax - xMin - 12));

    const useFullSpan = Math.random() < 0.3;
    let startY: number, endY: number;

    if (useFullSpan || anchorYs.length <= 2) {
      startY = yMin;
      endY = yMax;
    } else {
      const idx = Math.floor(Math.random() * (anchorYs.length - 1));
      startY = anchorYs[idx] + 1;
      endY = anchorYs[idx + 1] - 1;
    }

    if (endY - startY < 6) return null;
    const wallLen = endY - startY + 1;
    const doorPos = Math.floor(Math.random() * Math.max(1, wallLen - 9));

    return {
      orientation: 'vertical',
      thickness: 1,
      start: { x, y: startY },
      end: { x, y: endY },
      openings: [doorPos],
      label: `V-wall at x=${x}`,
    };
  }
}

/**
 * Guided wall generation based on empirical floor plan analysis.
 *
 * 9 real 1BR layouts all follow the same wall hierarchy:
 *   Wall 1: Vertical divider — full height, splits unit into 2 bays (35-65%)
 *   Wall 2: Horizontal in one bay — separates glass room from services
 *   Wall 3: Horizontal in other bay — same
 *   Wall 4+: Subdivision walls — closets, bath partition, utility
 *
 * Each wall position is randomized within its structural role.
 */
function guidedWall(state: SearchState, wallIndex: number): WallMove | null {
  const { xMin, xMax, yMin, yMax } = state.interiorBounds;
  const interiorW = xMax - xMin + 1; // ~68 cells
  const interiorD = yMax - yMin + 1; // ~92 cells

  if (wallIndex === 0) {
    // Wall 1: Primary vertical divider — creates two bays
    // Position at 35-65% of width (randomized)
    const minFrac = 0.35, maxFrac = 0.65;
    const x = xMin + Math.floor(interiorW * (minFrac + Math.random() * (maxFrac - minFrac)));

    // Full height, door somewhere in the middle
    const wallLen = yMax - yMin + 1;
    const doorPos = Math.floor(wallLen * (0.3 + Math.random() * 0.4)); // door in middle 40%

    return {
      orientation: 'vertical',
      thickness: 1,
      start: { x, y: yMin },
      end: { x, y: yMax },
      openings: [doorPos],
      label: `V-divider at x=${x}`,
    };
  }

  if (wallIndex === 1 || wallIndex === 2) {
    // Wall 2-3: Horizontal walls within each bay
    // Separates glass-side rooms (bedroom/living) from corridor-side services
    // Position at 35-60% of depth from glass (glass rooms get the bigger portion)
    const existingV = state.walls.filter(w => w.orientation === 'vertical');
    if (existingV.length === 0) return randomWall(state);

    const vWallX = existingV[0].start.x;

    // Which bay? Wall 2 = left bay, Wall 3 = right bay (or randomize)
    let startX: number, endX: number;
    if (wallIndex === 1) {
      // Left bay
      startX = xMin;
      endX = vWallX - 1;
    } else {
      // Right bay
      startX = vWallX + 1;
      endX = xMax;
    }

    if (endX - startX < 6) return randomWall(state);

    // Y position: 35-60% of depth from glass (y=0 is glass)
    const minDepthFrac = 0.35, maxDepthFrac = 0.60;
    const y = yMin + Math.floor(interiorD * (minDepthFrac + Math.random() * (maxDepthFrac - minDepthFrac)));

    const wallLen = endX - startX + 1;
    const doorPos = Math.floor(Math.random() * Math.max(1, wallLen - 9));

    return {
      orientation: 'horizontal',
      thickness: 1,
      start: { x: startX, y },
      end: { x: endX, y },
      openings: [doorPos],
      label: `H-bay${wallIndex} at y=${y}`,
    };
  }

  // Wall 4+: Subdivision walls (closets, bath partition, etc.)
  // Use random placement within existing structure
  return randomWall(state);
}

/**
 * Try to place a random valid wall. Returns the move if successful, null if not.
 */
function tryRandomWall(state: SearchState): WallMove | null {
  // Try a few random walls until one is valid
  for (let attempt = 0; attempt < 10; attempt++) {
    const move = randomWall(state);
    if (!move) continue;

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

    // Valid wall — keep it
    return move;
  }

  return null;
}

/**
 * Run one random trial: place N random walls and score.
 */
function runTrial(state: SearchState, numWalls: number): { moves: WallMove[]; score: number } {
  const moves: WallMove[] = [];

  for (let i = 0; i < numWalls; i++) {
    const move = tryRandomWall(state);
    if (!move) continue; // skip this wall, try next

    placeWall(state.grid, move);
    state.walls.push(move);
    moves.push(move);
  }

  const score = scoreProgramMatch(state);
  return { moves, score };
}

/**
 * Run a guided trial: use the wall hierarchy from real floor plans.
 * First 3 walls follow the canonical pattern, rest are random.
 */
function runGuidedTrial(state: SearchState, numWalls: number): { moves: WallMove[]; score: number } {
  const moves: WallMove[] = [];

  for (let i = 0; i < numWalls; i++) {
    // First 3 walls use guided placement, rest use random
    const generator = i < 3
      ? () => guidedWall(state, i)
      : () => randomWall(state);

    let move: WallMove | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generator();
      if (!candidate) continue;

      const validation = validateWallMove(state.grid, candidate);
      if (!validation.valid) continue;

      const gapCheck = checkMinGap(state.grid, candidate);
      if (!gapCheck.valid) continue;

      const filled = placeWall(state.grid, candidate);
      const connected = checkConnectivity(state.grid, state.entryX, state.entryY);

      if (!connected) {
        undoWall(state.grid, filled);
        continue;
      }

      move = candidate;
      break;
    }

    if (!move) continue;

    // Wall was already placed in the validation loop above
    state.walls.push(move);
    moves.push(move);
  }

  const score = scoreProgramMatch(state);
  return { moves, score };
}

/**
 * One search step for the Step button — place one random valid wall.
 */
export function searchStep(state: SearchState): WallMove | null {
  return tryRandomWall(state);
}

/**
 * Monte Carlo search: run many trials, keep the best.
 * 70% guided trials (wall hierarchy from real floor plans) + 30% pure random.
 */
export function runSearch(state: SearchState, maxSteps: number = 8): WallMove[] {
  const TRIALS = 300;
  let bestMoves: WallMove[] = [];
  let bestScore = -Infinity;

  const origGrid = cloneGrid(state.grid);
  const origWalls = [...state.walls];

  for (let trial = 0; trial < TRIALS; trial++) {
    // Reset
    state.grid = cloneGrid(origGrid);
    state.walls = [...origWalls];

    // Guided trials use 4-6 walls (3 structural + 1-3 subdivision)
    // Random trials use 4-maxSteps walls
    const useGuided = trial < TRIALS * 0.7;
    const numWalls = useGuided
      ? 4 + Math.floor(Math.random() * 3) // 4-6 walls
      : 4 + Math.floor(Math.random() * (maxSteps - 3));

    const result = useGuided
      ? runGuidedTrial(state, numWalls)
      : runTrial(state, numWalls);

    if (result.score > bestScore) {
      bestScore = result.score;
      bestMoves = result.moves;
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
