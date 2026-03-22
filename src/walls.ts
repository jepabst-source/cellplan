/**
 * Walls — wall placement as discrete moves on the grid.
 *
 * A wall is a line of filled cells. Placing a wall = filling cells.
 * Backtracking = restoring cells to open.
 */

import { Grid, CellType, setCell, getCell, isWall } from './grid';

export type Orientation = 'horizontal' | 'vertical';

export interface WallMove {
  orientation: Orientation;
  thickness: 1 | 2;           // 1 = interior (4"), 2 = exterior/party (8")
  start: { x: number; y: number };
  end: { x: number; y: number };
  openings: number[];          // positions along the wall where 9-cell door gaps occur
  label?: string;              // optional description for debugging
}

/**
 * Get all cells that a wall move would fill (excluding openings).
 */
export function getWallCells(move: WallMove): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];

  if (move.orientation === 'horizontal') {
    const xMin = Math.min(move.start.x, move.end.x);
    const xMax = Math.max(move.start.x, move.end.x);
    const yBase = move.start.y;

    // Build set of opening positions
    const openSet = new Set<number>();
    for (const openPos of move.openings) {
      for (let i = 0; i < 9; i++) {
        openSet.add(openPos + i);
      }
    }

    for (let x = xMin; x <= xMax; x++) {
      const posAlongWall = x - xMin;
      if (openSet.has(posAlongWall)) continue;
      for (let t = 0; t < move.thickness; t++) {
        cells.push({ x, y: yBase + t });
      }
    }
  } else {
    const yMin = Math.min(move.start.y, move.end.y);
    const yMax = Math.max(move.start.y, move.end.y);
    const xBase = move.start.x;

    const openSet = new Set<number>();
    for (const openPos of move.openings) {
      for (let i = 0; i < 9; i++) {
        openSet.add(openPos + i);
      }
    }

    for (let y = yMin; y <= yMax; y++) {
      const posAlongWall = y - yMin;
      if (openSet.has(posAlongWall)) continue;
      for (let t = 0; t < move.thickness; t++) {
        cells.push({ x: xBase + t, y });
      }
    }
  }

  return cells;
}

/**
 * Get the length of a wall in cells.
 */
export function getWallLength(move: WallMove): number {
  if (move.orientation === 'horizontal') {
    return Math.abs(move.end.x - move.start.x) + 1;
  }
  return Math.abs(move.end.y - move.start.y) + 1;
}

/**
 * Place a wall on the grid. Returns the cells that were filled
 * (for undo purposes).
 */
export function placeWall(grid: Grid, move: WallMove): Array<{ x: number; y: number; prev: CellType }> {
  const filled: Array<{ x: number; y: number; prev: CellType }> = [];
  const wallCells = getWallCells(move);

  for (const { x, y } of wallCells) {
    if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) continue;
    const prev = getCell(grid, x, y);
    setCell(grid, x, y, CellType.Wall);
    filled.push({ x, y, prev });
  }

  return filled;
}

/**
 * Undo a wall placement — restore cells to their previous state.
 */
export function undoWall(grid: Grid, filled: Array<{ x: number; y: number; prev: CellType }>): void {
  for (const { x, y, prev } of filled) {
    setCell(grid, x, y, prev);
  }
}

/**
 * Check if a wall connects to the boundary or an existing wall at both ends.
 */
export function wallAnchored(grid: Grid, move: WallMove): boolean {
  return isAnchored(grid, move.start.x, move.start.y, move.orientation, move.thickness)
      && isAnchored(grid, move.end.x, move.end.y, move.orientation, move.thickness);
}

function isAnchored(grid: Grid, x: number, y: number, orientation: Orientation, thickness: number): boolean {
  // At or adjacent to boundary (within exterior wall thickness)?
  const EXT = 2; // exterior wall thickness in cells
  if (x <= EXT || x >= grid.width - 1 - EXT || y <= EXT || y >= grid.height - 1 - EXT) return true;

  // Touching an existing wall (at endpoint, adjacent, or perpendicular)?
  if (orientation === 'horizontal') {
    for (let t = 0; t < thickness; t++) {
      // Check the endpoint cell itself (T-connection into existing wall)
      if (isWall(getCell(grid, x, y + t))) return true;
      // Check left and right of endpoint
      if (x > 0 && isWall(getCell(grid, x - 1, y + t))) return true;
      if (x < grid.width - 1 && isWall(getCell(grid, x + 1, y + t))) return true;
    }
  } else {
    for (let t = 0; t < thickness; t++) {
      // Check the endpoint cell itself
      if (isWall(getCell(grid, x + t, y))) return true;
      if (y > 0 && isWall(getCell(grid, x + t, y - 1))) return true;
      if (y < grid.height - 1 && isWall(getCell(grid, x + t, y + 1))) return true;
    }
  }

  return false;
}
