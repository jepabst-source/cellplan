/**
 * Tree search — explore wall placements using the room program matcher.
 *
 * The search generates candidate walls, scores each layout using the
 * room matcher, and picks the best. Randomness ensures variety.
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

/**
 * Score using the room program matcher (doors closed).
 */
function scoreProgramMatch(state: SearchState): number {
  const program = state.program || defaultOneBedProgram();
  const regions = findRegions(state.grid, state.interiorBounds, state.walls);
  const result = matchRooms(regions, program);
  return result.score;
}

/**
 * Generate all candidate wall moves for the current state.
 * Produces a wide variety of positions with randomness.
 */
function generateCandidates(state: SearchState): WallMove[] {
  const candidates: WallMove[] = [];
  const { xMin, xMax, yMin, yMax } = state.interiorBounds;

  // Find existing wall positions to anchor from
  const existingVerticals = state.walls
    .filter(w => w.orientation === 'vertical')
    .map(w => w.start.x);
  const existingHorizontals = state.walls
    .filter(w => w.orientation === 'horizontal')
    .map(w => w.start.y);

  // Collect all anchor x positions (exterior walls + existing vertical walls)
  const anchorXs = [xMin - 1, xMax + 1, ...existingVerticals];
  const anchorYs = [yMin - 1, yMax + 1, ...existingHorizontals];

  // For each pair of adjacent vertical anchors, try horizontal walls between them
  const sortedXs = [...new Set(anchorXs)].sort((a, b) => a - b);
  for (let i = 0; i < sortedXs.length - 1; i++) {
    const leftX = sortedXs[i] + 1;
    const rightX = sortedXs[i + 1] - 1;
    if (rightX - leftX < 6) continue; // too narrow for a wall segment

    const segWidth = rightX - leftX + 1;

    // Try horizontal walls at various y positions within this bay
    for (let pct = 25; pct <= 75; pct += 5) {
      const wallY = yMin + Math.round((yMax - yMin) * pct / 100);
      // Add random jitter (-3 to +3 cells)
      const jitter = Math.floor(Math.random() * 7) - 3;
      const y = Math.max(yMin + 7, Math.min(yMax - 7, wallY + jitter));

      // Try different door positions
      const doorPositions = [
        Math.floor((segWidth - 9) * 0.3),
        Math.floor((segWidth - 9) * 0.5),
        Math.floor((segWidth - 9) * 0.7),
      ].filter(d => d >= 0);

      for (const doorPos of doorPositions) {
        candidates.push({
          orientation: 'horizontal',
          thickness: 1,
          start: { x: leftX, y },
          end: { x: rightX, y },
          openings: [doorPos],
          label: `H-wall y=${y} in bay x=${leftX}-${rightX}`,
        });
      }
    }
  }

  // For each pair of adjacent horizontal anchors, try vertical walls between them
  const sortedYs = [...new Set(anchorYs)].sort((a, b) => a - b);
  for (let i = 0; i < sortedYs.length - 1; i++) {
    const topY = sortedYs[i] + 1;
    const bottomY = sortedYs[i + 1] - 1;
    if (bottomY - topY < 6) continue;

    const segHeight = bottomY - topY + 1;

    for (let pct = 25; pct <= 75; pct += 5) {
      const wallX = xMin + Math.round((xMax - xMin) * pct / 100);
      const jitter = Math.floor(Math.random() * 7) - 3;
      const x = Math.max(xMin + 7, Math.min(xMax - 7, wallX + jitter));

      const doorPositions = [
        Math.floor((segHeight - 9) * 0.3),
        Math.floor((segHeight - 9) * 0.5),
        Math.floor((segHeight - 9) * 0.7),
      ].filter(d => d >= 0);

      for (const doorPos of doorPositions) {
        candidates.push({
          orientation: 'vertical',
          thickness: 1,
          start: { x, y: topY },
          end: { x, y: bottomY },
          openings: [doorPos],
          label: `V-wall x=${x} in bay y=${topY}-${bottomY}`,
        });
      }
    }
  }

  // Also try full-span walls (crossing entire interior)
  // Vertical full-span
  for (let pct = 30; pct <= 70; pct += 5) {
    const x = xMin + Math.round((xMax - xMin) * pct / 100);
    const jitter = Math.floor(Math.random() * 5) - 2;
    const wallX = Math.max(xMin + 7, Math.min(xMax - 7, x + jitter));
    const wallHeight = yMax - yMin + 1;

    const doorPositions = [
      Math.floor((wallHeight - 9) * 0.3),
      Math.floor((wallHeight - 9) * 0.5),
      Math.floor((wallHeight - 9) * 0.7),
    ];

    for (const doorPos of doorPositions) {
      candidates.push({
        orientation: 'vertical',
        thickness: 1,
        start: { x: wallX, y: yMin },
        end: { x: wallX, y: yMax },
        openings: [doorPos],
        label: `Full V-split at x=${wallX} (${cellsToFeet(wallX - xMin)} from left)`,
      });
    }
  }

  // Horizontal full-span
  for (let pct = 30; pct <= 70; pct += 5) {
    const y = yMin + Math.round((yMax - yMin) * pct / 100);
    const jitter = Math.floor(Math.random() * 5) - 2;
    const wallY = Math.max(yMin + 7, Math.min(yMax - 7, y + jitter));
    const wallWidth = xMax - xMin + 1;

    const doorPositions = [
      Math.floor((wallWidth - 9) * 0.3),
      Math.floor((wallWidth - 9) * 0.5),
      Math.floor((wallWidth - 9) * 0.7),
    ];

    for (const doorPos of doorPositions) {
      candidates.push({
        orientation: 'horizontal',
        thickness: 1,
        start: { x: xMin, y: wallY },
        end: { x: xMax, y: wallY },
        openings: [doorPos],
        label: `Full H-split at y=${wallY} (${cellsToFeet(wallY - yMin)} from glass)`,
      });
    }
  }

  return candidates;
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

    // Score using the room program matcher
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
 * Tries several random layouts and returns the best one.
 */
export function runSearch(state: SearchState, maxSteps: number = 8): WallMove[] {
  const ATTEMPTS = 5;
  let bestMoves: WallMove[] = [];
  let bestScore = -Infinity;

  // Save original grid
  const origGrid = cloneGrid(state.grid);
  const origWalls = [...state.walls];

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // Reset to original state
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

    // Score final layout
    const score = scoreProgramMatch(state);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = moves;
    }
  }

  // Replay best moves on the grid
  state.grid = cloneGrid(origGrid);
  state.walls = [...origWalls];
  for (const move of bestMoves) {
    placeWall(state.grid, move);
    state.walls.push(move);
  }

  return bestMoves;
}
