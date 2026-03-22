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
 * One search step for the Step button — place one random valid wall.
 */
export function searchStep(state: SearchState): WallMove | null {
  return tryRandomWall(state);
}

/**
 * Monte Carlo search: run many random trials, keep the best.
 */
export function runSearch(state: SearchState, maxSteps: number = 8): WallMove[] {
  const TRIALS = 200;
  let bestMoves: WallMove[] = [];
  let bestScore = -Infinity;

  const origGrid = cloneGrid(state.grid);
  const origWalls = [...state.walls];

  for (let trial = 0; trial < TRIALS; trial++) {
    // Reset
    state.grid = cloneGrid(origGrid);
    state.walls = [...origWalls];

    // Random number of walls per trial (vary between 4 and maxSteps)
    const numWalls = 4 + Math.floor(Math.random() * (maxSteps - 3));

    const result = runTrial(state, numWalls);

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
