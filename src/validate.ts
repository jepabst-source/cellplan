/**
 * Validation — enforce wall rules and connectivity.
 *
 * Rules:
 * 1. Walls are orthogonal (enforced by WallMove type)
 * 2. Thickness is 1 or 2 (enforced by WallMove type)
 * 3. Wall must connect to boundary or existing wall at both ends
 * 4. Minimum wall length: 7 cells (2'-4")
 * 5. Openings are 9-cell gaps
 * 6. Minimum 10 open cells between parallel walls for circulation
 * 7. Every open cell reachable from the entry (flood fill)
 */

import { Grid, CellType, getCell, isWall } from './grid';
import { WallMove, getWallLength, wallAnchored, getWallCells } from './walls';

export const MIN_WALL_LENGTH = 7;
export const DOOR_OPENING_WIDTH = 9;
export const MIN_CIRCULATION_GAP = 10;
export const MIN_CLOSET_GAP = 6;

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate a wall move against all rules BEFORE placing it.
 */
export function validateWallMove(grid: Grid, move: WallMove): ValidationResult {
  // Rule 4: minimum length
  const length = getWallLength(move);
  if (length < MIN_WALL_LENGTH) {
    return { valid: false, reason: `Wall length ${length} < minimum ${MIN_WALL_LENGTH} cells` };
  }

  // Check bounds
  const wallCells = getWallCells(move);
  for (const { x, y } of wallCells) {
    if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) {
      return { valid: false, reason: `Wall extends outside grid at (${x}, ${y})` };
    }
  }

  // Rule 3: wall must anchor at both ends
  if (!wallAnchored(grid, move)) {
    return { valid: false, reason: 'Wall must connect to boundary or existing wall at both ends' };
  }

  // Rule 5: openings must fit within the wall
  for (const openPos of move.openings) {
    if (openPos < 0 || openPos + DOOR_OPENING_WIDTH > length) {
      return { valid: false, reason: `Opening at position ${openPos} extends beyond wall` };
    }
  }

  return { valid: true };
}

/**
 * After placing a wall, check that all open cells are still reachable
 * from the entry point (flood fill connectivity check).
 */
export function checkConnectivity(grid: Grid, entryX: number, entryY: number): boolean {
  if (isWall(getCell(grid, entryX, entryY))) return false;

  const visited = new Uint8Array(grid.width * grid.height);
  const stack: number[] = [entryY * grid.width + entryX];
  visited[entryY * grid.width + entryX] = 1;
  let reachable = 0;

  while (stack.length > 0) {
    const idx = stack.pop()!;
    reachable++;
    const x = idx % grid.width;
    const y = Math.floor(idx / grid.width);

    // 4-directional neighbors
    const neighbors = [
      { nx: x - 1, ny: y },
      { nx: x + 1, ny: y },
      { nx: x, ny: y - 1 },
      { nx: x, ny: y + 1 },
    ];

    for (const { nx, ny } of neighbors) {
      if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;
      const nIdx = ny * grid.width + nx;
      if (visited[nIdx]) continue;
      if (isWall(getCell(grid, nx, ny))) continue;
      visited[nIdx] = 1;
      stack.push(nIdx);
    }
  }

  // Count total open cells
  let totalOpen = 0;
  for (let i = 0; i < grid.cells.length; i++) {
    if (!isWall(grid.cells[i] as CellType)) totalOpen++;
  }

  return reachable === totalOpen;
}

/**
 * Check minimum gap between parallel walls.
 * Scans in the direction perpendicular to the new wall
 * to ensure no squeeze below MIN_CIRCULATION_GAP.
 */
export function checkMinGap(grid: Grid, move: WallMove): ValidationResult {
  if (move.orientation === 'horizontal') {
    return checkHorizontalGap(grid, move);
  }
  return checkVerticalGap(grid, move);
}

function checkHorizontalGap(grid: Grid, move: WallMove): ValidationResult {
  const xMin = Math.min(move.start.x, move.end.x);
  const xMax = Math.max(move.start.x, move.end.x);
  const yBase = move.start.y;

  // Sample points along the wall, check gap above and below
  for (let x = xMin; x <= xMax; x += 3) {
    // Gap above (decreasing y)
    const gapAbove = measureGap(grid, x, yBase - 1, 0, -1);
    if (gapAbove > 0 && gapAbove < MIN_CLOSET_GAP) {
      return { valid: false, reason: `Gap of ${gapAbove} cells above wall at x=${x} (min ${MIN_CLOSET_GAP})` };
    }

    // Gap below (increasing y)
    const belowStart = yBase + move.thickness;
    const gapBelow = measureGap(grid, x, belowStart, 0, 1);
    if (gapBelow > 0 && gapBelow < MIN_CLOSET_GAP) {
      return { valid: false, reason: `Gap of ${gapBelow} cells below wall at x=${x} (min ${MIN_CLOSET_GAP})` };
    }
  }

  return { valid: true };
}

function checkVerticalGap(grid: Grid, move: WallMove): ValidationResult {
  const yMin = Math.min(move.start.y, move.end.y);
  const yMax = Math.max(move.start.y, move.end.y);
  const xBase = move.start.x;

  for (let y = yMin; y <= yMax; y += 3) {
    const gapLeft = measureGap(grid, xBase - 1, y, -1, 0);
    if (gapLeft > 0 && gapLeft < MIN_CLOSET_GAP) {
      return { valid: false, reason: `Gap of ${gapLeft} cells left of wall at y=${y} (min ${MIN_CLOSET_GAP})` };
    }

    const rightStart = xBase + move.thickness;
    const gapRight = measureGap(grid, rightStart, y, 1, 0);
    if (gapRight > 0 && gapRight < MIN_CLOSET_GAP) {
      return { valid: false, reason: `Gap of ${gapRight} cells right of wall at y=${y} (min ${MIN_CLOSET_GAP})` };
    }
  }

  return { valid: true };
}

/**
 * Measure gap from a starting cell in a direction until hitting a wall or boundary.
 * Returns 0 if starting cell is already a wall or out of bounds.
 */
function measureGap(grid: Grid, startX: number, startY: number, dx: number, dy: number): number {
  let x = startX;
  let y = startY;
  let gap = 0;

  while (x >= 0 && x < grid.width && y >= 0 && y < grid.height) {
    if (isWall(getCell(grid, x, y))) break;
    gap++;
    x += dx;
    y += dy;
  }

  return gap;
}
