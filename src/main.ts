/**
 * CellPlan — main entry point.
 *
 * Wires up the grid, renderer, search, and UI controls.
 */

import { cellsToFeet } from './grid';
import { placeWall, WallMove } from './walls';
import { createOneBedroom, UnitSetup } from './testcase';
import { SearchState, searchStep, runSearch, scoreState } from './search';
import { setupCanvas, render, RendererOptions } from './renderer';

let canvas: HTMLCanvasElement;
let options: RendererOptions;
let unit: UnitSetup;
let state: SearchState;
let wallHistory: WallMove[] = [];

function init(): void {
  canvas = document.getElementById('grid-canvas') as HTMLCanvasElement;
  const btnGenerate = document.getElementById('btn-generate') as HTMLButtonElement;
  const btnStep = document.getElementById('btn-step') as HTMLButtonElement;
  const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

  reset();

  btnGenerate.addEventListener('click', () => {
    reset();
    const moves = runSearch(state, 6);
    wallHistory = moves;
    renderGrid();
    updateInfo();
    btnStep.disabled = true;
  });

  btnStep.addEventListener('click', () => {
    const move = searchStep(state);
    if (move) {
      placeWall(state.grid, move);
      state.walls.push(move);
      wallHistory.push(move);
      renderGrid();
      updateInfo();
    } else {
      updateInfo('No valid wall placement found.');
    }
  });

  btnReset.addEventListener('click', () => {
    reset();
    renderGrid();
    updateInfo();
  });
}

function reset(): void {
  unit = createOneBedroom();
  state = {
    grid: unit.grid,
    entryX: unit.entryX,
    entryY: unit.entryY,
    walls: [],
    interiorBounds: unit.interiorBounds,
  };
  wallHistory = [];
  if (canvas) {
    options = setupCanvas(canvas, unit.grid, { cellSize: 6, showGrid: true });
    renderGrid();
    updateInfo();
    (document.getElementById('btn-step') as HTMLButtonElement).disabled = false;
  }
}

function renderGrid(): void {
  render(canvas, state.grid, options);
}

function updateInfo(message?: string): void {
  const info = document.getElementById('info')!;
  const { xMin, xMax, yMin, yMax } = state.interiorBounds;
  const interiorW = xMax - xMin + 1;
  const interiorH = yMax - yMin + 1;

  let html = `<strong>Interior:</strong> ${cellsToFeet(interiorW)} × ${cellsToFeet(interiorH)} `;
  html += `(${interiorW}×${interiorH} cells, ~${Math.round(interiorW * interiorH / 9)} sf)`;

  if (wallHistory.length > 0) {
    html += `<br><strong>Walls placed:</strong> ${wallHistory.length}`;
    html += ` | <strong>Score:</strong> ${scoreState(state)}`;
    for (let i = 0; i < wallHistory.length; i++) {
      const w = wallHistory[i];
      html += `<div class="step">${i + 1}. ${w.label || `${w.orientation} wall`}`;
      html += ` — ${w.thickness === 1 ? '4"' : '8"'} thick`;
      html += `, ${w.openings.length} opening${w.openings.length !== 1 ? 's' : ''}`;
      html += `</div>`;
    }
  }

  if (message) {
    html += `<br><em>${message}</em>`;
  }

  info.innerHTML = html;
}

init();
