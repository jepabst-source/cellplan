/**
 * Test case — 24' × 32' one-bedroom unit.
 *
 * 72 cells wide × 96 cells deep.
 * 2-cell exterior walls on all sides.
 * South edge (y=0) = glass.
 * North edge (y=max) = corridor with 9-cell entry opening.
 */

import { Grid, CellType, createGrid, setCell, feetToCells } from './grid';

export interface UnitSetup {
  grid: Grid;
  entryX: number;
  entryY: number;
  interiorBounds: {
    xMin: number; xMax: number;
    yMin: number; yMax: number;
  };
}

export function createOneBedroom(): UnitSetup {
  const width = feetToCells(24);   // 72
  const height = feetToCells(32);  // 96
  const grid = createGrid(width, height);
  const extWall = 2; // 2-cell exterior walls (8")

  // South wall (glass) — bottom, y = 0..1
  for (let x = 0; x < width; x++) {
    for (let t = 0; t < extWall; t++) {
      setCell(grid, x, t, CellType.Glass);
    }
  }

  // North wall (corridor) — top, y = height-2..height-1
  for (let x = 0; x < width; x++) {
    for (let t = 0; t < extWall; t++) {
      setCell(grid, x, height - 1 - t, CellType.Corridor);
    }
  }

  // West wall — left, x = 0..1
  for (let y = 0; y < height; y++) {
    for (let t = 0; t < extWall; t++) {
      setCell(grid, t, y, CellType.Wall);
    }
  }

  // East wall — right, x = width-2..width-1
  for (let y = 0; y < height; y++) {
    for (let t = 0; t < extWall; t++) {
      setCell(grid, width - 1 - t, y, CellType.Wall);
    }
  }

  // Entry door opening: 9-cell gap centered in north wall
  const entryCenter = Math.floor(width / 2);
  const entryStart = entryCenter - 4; // 9 cells wide
  for (let x = entryStart; x < entryStart + 9; x++) {
    for (let t = 0; t < extWall; t++) {
      setCell(grid, x, height - 1 - t, CellType.Open);
    }
  }

  // Entry point is center of the opening, at the inner edge of the north wall
  const entryX = entryCenter;
  const entryY = height - 1 - extWall; // just inside the corridor wall

  return {
    grid,
    entryX,
    entryY,
    interiorBounds: {
      xMin: extWall,
      xMax: width - 1 - extWall,
      yMin: extWall,
      yMax: height - 1 - extWall,
    },
  };
}
