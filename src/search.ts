/**
 * Tree search — explore wall placements using architectural heuristics.
 *
 * The search generates candidate walls at each step, scores them,
 * and picks the best. Backtracking occurs when no valid wall exists.
 */

import { Grid, getCell, isWall, cellsToFeet } from './grid';
import { WallMove, placeWall, undoWall } from './walls';
import { validateWallMove, checkConnectivity, checkMinGap } from './validate';

export interface SearchState {
  grid: Grid;
  entryX: number;
  entryY: number;
  walls: WallMove[];
  interiorBounds: { xMin: number; xMax: number; yMin: number; yMax: number };
}

export interface SpaceInfo {
  area: number;         // cells
  touchesGlass: boolean;
  touchesCorridor: boolean;
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
  aspectRatio: number;
}

/**
 * Generate candidate wall moves for the current state.
 * Uses architectural knowledge to produce sensible candidates.
 */
export function generateCandidates(state: SearchState): WallMove[] {
  const candidates: WallMove[] = [];
  const { xMin, xMax, yMin, yMax } = state.interiorBounds;
  const step = state.walls.length;

  if (step === 0) {
    // Step 1: Vertical wall splitting the glass frontage into two bays.
    // Try positions around the 12-foot module (36 cells from each side).
    candidates.push(...generateVerticalSplits(state, xMin, xMax, yMin, yMax));
  } else if (step === 1) {
    // Step 2: Horizontal wall on one side separating living from service zone.
    // Runs from corridor side, ~40-60% of depth.
    candidates.push(...generateHorizontalServiceWalls(state, xMin, xMax, yMin, yMax));
  } else if (step === 2) {
    // Step 3: Horizontal wall on the other side.
    candidates.push(...generateSecondHorizontalWalls(state, xMin, xMax, yMin, yMax));
  } else {
    // Steps 4+: Subdivide service zones with short walls.
    candidates.push(...generateSubdivisionWalls(state, xMin, xMax, yMin, yMax));
  }

  return candidates;
}

function generateVerticalSplits(_state: SearchState, xMin: number, xMax: number, yMin: number, yMax: number): WallMove[] {
  const moves: WallMove[] = [];
  const interiorWidth = xMax - xMin + 1;

  // Try splitting at 12-foot increments (36 cells) and nearby positions
  const center = xMin + Math.floor(interiorWidth / 2);
  const tryPositions = [
    center - 2, center - 1, center, center + 1, center + 2,
    xMin + 36 - 1, xMin + 36, xMin + 36 + 1, // 12' from left
  ];

  const seen = new Set<number>();
  for (const x of tryPositions) {
    if (x <= xMin + MIN_BAY || x >= xMax - MIN_BAY) continue;
    if (seen.has(x)) continue;
    seen.add(x);

    moves.push({
      orientation: 'vertical',
      thickness: 1,
      start: { x, y: yMin },
      end: { x, y: yMax },
      openings: [],
      label: `Vertical split at x=${x} (${cellsToFeet(x - xMin)} from left wall)`,
    });
  }

  return moves;
}

// Minimum bay width in cells (roughly 8 feet = 24 cells)
const MIN_BAY = 24;

function generateHorizontalServiceWalls(state: SearchState, xMin: number, xMax: number, yMin: number, yMax: number): WallMove[] {
  const moves: WallMove[] = [];
  const interiorDepth = yMax - yMin + 1;

  // The first vertical wall divides the unit into two bays.
  // Place a horizontal wall in one bay, from corridor side (top) going ~40-60% of depth.
  const vertWall = state.walls[0];
  const splitX = vertWall.start.x;

  // Service zone depth: 40-60% from corridor (top)
  for (let pct = 40; pct <= 60; pct += 5) {
    const serviceDepth = Math.round(interiorDepth * pct / 100);
    const wallY = yMax - serviceDepth;

    if (wallY <= yMin + MIN_BAY || wallY >= yMax - MIN_BAY) continue;

    // Left bay: horizontal wall from left exterior to the vertical split
    moves.push({
      orientation: 'horizontal',
      thickness: 1,
      start: { x: xMin, y: wallY },
      end: { x: splitX, y: wallY },
      openings: [Math.floor((splitX - xMin - 9) / 2)],
      label: `Left bay service wall at y=${wallY} (${cellsToFeet(yMax - wallY)} from corridor)`,
    });

    // Right bay
    moves.push({
      orientation: 'horizontal',
      thickness: 1,
      start: { x: splitX, y: wallY },
      end: { x: xMax, y: wallY },
      openings: [Math.floor((xMax - splitX - 9) / 2)],
      label: `Right bay service wall at y=${wallY} (${cellsToFeet(yMax - wallY)} from corridor)`,
    });
  }

  return moves;
}

function generateSecondHorizontalWalls(state: SearchState, xMin: number, xMax: number, yMin: number, yMax: number): WallMove[] {
  const moves: WallMove[] = [];
  const interiorDepth = yMax - yMin + 1;
  const vertWall = state.walls[0];
  const splitX = vertWall.start.x;
  const firstHorizWall = state.walls[1];

  // Determine which bay the first horizontal wall was in
  const firstWallInLeftBay = firstHorizWall.end.x <= splitX + 1;

  for (let pct = 35; pct <= 65; pct += 5) {
    const serviceDepth = Math.round(interiorDepth * pct / 100);
    const wallY = yMax - serviceDepth;

    if (wallY <= yMin + MIN_BAY || wallY >= yMax - MIN_BAY) continue;

    if (firstWallInLeftBay) {
      // Place in right bay
      moves.push({
        orientation: 'horizontal',
        thickness: 1,
        start: { x: splitX, y: wallY },
        end: { x: xMax, y: wallY },
        openings: [Math.floor((xMax - splitX - 9) / 2)],
        label: `Right bay service wall at y=${wallY}`,
      });
    } else {
      // Place in left bay
      moves.push({
        orientation: 'horizontal',
        thickness: 1,
        start: { x: xMin, y: wallY },
        end: { x: splitX, y: wallY },
        openings: [Math.floor((splitX - xMin - 9) / 2)],
        label: `Left bay service wall at y=${wallY}`,
      });
    }
  }

  return moves;
}

function generateSubdivisionWalls(state: SearchState, xMin: number, xMax: number, yMin: number, yMax: number): WallMove[] {
  const moves: WallMove[] = [];

  // Find open regions in the service zone (corridor side) and subdivide them
  // Look for the largest open rectangular regions and propose splits
  const regions = findOpenRegions(state.grid, xMin, xMax, yMin, yMax);

  for (const region of regions) {
    const rWidth = region.xMax - region.xMin + 1;
    const rHeight = region.yMax - region.yMin + 1;

    // Skip regions that are already small enough (< 20 cells in either dimension)
    if (rWidth < 20 && rHeight < 20) continue;

    // Try vertical splits within this region
    if (rWidth > 20) {
      const mid = region.xMin + Math.floor(rWidth / 2);
      moves.push({
        orientation: 'vertical',
        thickness: 1,
        start: { x: mid, y: region.yMin },
        end: { x: mid, y: region.yMax },
        openings: [Math.max(0, Math.floor((rHeight - 9) / 2))],
        label: `Subdivide region vertically at x=${mid}`,
      });
    }

    // Try horizontal splits
    if (rHeight > 20) {
      const mid = region.yMin + Math.floor(rHeight / 2);
      moves.push({
        orientation: 'horizontal',
        thickness: 1,
        start: { x: region.xMin, y: mid },
        end: { x: region.xMax, y: mid },
        openings: [Math.max(0, Math.floor((rWidth - 9) / 2))],
        label: `Subdivide region horizontally at y=${mid}`,
      });
    }
  }

  return moves;
}

/**
 * Find large open rectangular regions in the grid.
 * Simple approach: scan for runs of open cells and group them.
 */
function findOpenRegions(grid: Grid, xMin: number, xMax: number, yMin: number, yMax: number): Array<{ xMin: number; xMax: number; yMin: number; yMax: number }> {
  const regions: Array<{ xMin: number; xMax: number; yMin: number; yMax: number }> = [];
  const visited = new Uint8Array(grid.width * grid.height);

  for (let y = yMin; y <= yMax; y += 6) {
    for (let x = xMin; x <= xMax; x += 6) {
      const idx = y * grid.width + x;
      if (visited[idx] || isWall(getCell(grid, x, y))) continue;

      // Flood-fill to find connected open region, track bounding box
      const stack = [idx];
      visited[idx] = 1;
      let rXMin = x, rXMax = x, rYMin = y, rYMax = y;

      while (stack.length > 0) {
        const ci = stack.pop()!;
        const cx = ci % grid.width;
        const cy = Math.floor(ci / grid.width);
        if (cx < rXMin) rXMin = cx;
        if (cx > rXMax) rXMax = cx;
        if (cy < rYMin) rYMin = cy;
        if (cy > rYMax) rYMax = cy;

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < xMin || nx > xMax || ny < yMin || ny > yMax) continue;
          const ni = ny * grid.width + nx;
          if (visited[ni] || isWall(getCell(grid, nx, ny))) continue;
          visited[ni] = 1;
          stack.push(ni);
        }
      }

      const width = rXMax - rXMin + 1;
      const height = rYMax - rYMin + 1;
      if (width > 14 && height > 14) {
        regions.push({ xMin: rXMin, xMax: rXMax, yMin: rYMin, yMax: rYMax });
      }
    }
  }

  return regions;
}

/**
 * Score a grid state after a wall has been placed.
 * Higher = better.
 */
export function scoreState(state: SearchState): number {
  let score = 0;
  const { xMin, xMax, yMin, yMax } = state.interiorBounds;

  const regions = findOpenRegions(state.grid, xMin, xMax, yMin, yMax);

  for (const region of regions) {
    const w = region.xMax - region.xMin + 1;
    const h = region.yMax - region.yMin + 1;
    const area = w * h;
    const ratio = Math.max(w / h, h / w);

    // Penalize extreme aspect ratios (unless small = closet/corridor)
    if (area > 200 && ratio > 3) {
      score -= 20;
    } else if (ratio < 2) {
      score += 10; // Good proportions
    }

    // Reward glass access for large spaces
    if (region.yMin <= yMin + 2 && area > 300) {
      score += 30; // Large space touches glass — good
    }

    // Reward service clustering near corridor
    if (region.yMax >= yMax - 2 && area < 400) {
      score += 15; // Small space near corridor — good for service
    }
  }

  // Reward having 2-3 distinct regions (typical for mid-placement)
  if (regions.length >= 2 && regions.length <= 6) {
    score += 10;
  }

  return score;
}

/**
 * Run one step of the search: generate candidates, validate, score, pick best.
 * Returns the chosen wall move, or null if no valid move exists.
 */
export function searchStep(state: SearchState): WallMove | null {
  const candidates = generateCandidates(state);
  if (candidates.length === 0) return null;

  let bestMove: WallMove | null = null;
  let bestScore = -Infinity;

  for (const move of candidates) {
    // Validate
    const validation = validateWallMove(state.grid, move);
    if (!validation.valid) continue;

    // Check min gap
    const gapCheck = checkMinGap(state.grid, move);
    if (!gapCheck.valid) continue;

    // Tentatively place, check connectivity, score
    const filled = placeWall(state.grid, move);
    const connected = checkConnectivity(state.grid, state.entryX, state.entryY);

    if (!connected) {
      undoWall(state.grid, filled);
      continue;
    }

    const score = scoreState(state);
    undoWall(state.grid, filled);

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

/**
 * Run the full search: place walls one at a time until complete.
 * Returns the sequence of wall moves.
 */
export function runSearch(state: SearchState, maxSteps: number = 6): WallMove[] {
  const moves: WallMove[] = [];

  for (let i = 0; i < maxSteps; i++) {
    const move = searchStep(state);
    if (!move) break;

    placeWall(state.grid, move);
    state.walls.push(move);
    moves.push(move);
  }

  return moves;
}
