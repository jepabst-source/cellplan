/**
 * Grid — the 4-inch cell floor plan grid.
 *
 * Each cell is 4" × 4". 3 cells = 1 foot. 9 cells = 1 sq ft.
 * Cell values: 0 = open, 1 = wall, 2 = glass wall, 3 = corridor wall.
 */

export const CELL_INCHES = 4;
export const CELLS_PER_FOOT = 3;

export enum CellType {
  Open = 0,
  Wall = 1,
  Glass = 2,
  Corridor = 3,
}

export interface Grid {
  width: number;   // cells
  height: number;  // cells
  cells: Uint8Array; // flat array, row-major: cells[y * width + x]
}

export function createGrid(width: number, height: number): Grid {
  return {
    width,
    height,
    cells: new Uint8Array(width * height),
  };
}

export function getCell(grid: Grid, x: number, y: number): CellType {
  return grid.cells[y * grid.width + x] as CellType;
}

export function setCell(grid: Grid, x: number, y: number, value: CellType): void {
  grid.cells[y * grid.width + x] = value;
}

export function isWall(cell: CellType): boolean {
  return cell !== CellType.Open;
}

export function cloneGrid(grid: Grid): Grid {
  return {
    width: grid.width,
    height: grid.height,
    cells: new Uint8Array(grid.cells),
  };
}

export function feetToCells(feet: number): number {
  return feet * CELLS_PER_FOOT;
}

export function cellsToFeet(cells: number): string {
  const feet = Math.floor(cells / CELLS_PER_FOOT);
  const remainingCells = cells % CELLS_PER_FOOT;
  const inches = remainingCells * CELL_INCHES;
  if (inches === 0) return `${feet}'-0"`;
  return `${feet}'-${inches}"`;
}
