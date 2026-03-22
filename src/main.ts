/**
 * CellPlan — main entry point.
 *
 * Wires up the grid, renderer, search, room program, and UI controls.
 */

import { cellsToFeet } from './grid';
import { placeWall, WallMove } from './walls';
import { createOneBedroom, UnitSetup } from './testcase';
import { SearchState, searchStep, runSearch } from './search';
import { setupCanvas, render, RendererOptions } from './renderer';
import { RoomProgram, defaultOneBedProgram } from './program';
import { findRegions, matchRooms, MatchResult } from './matcher';

let canvas: HTMLCanvasElement;
let options: RendererOptions;
let unit: UnitSetup;
let state: SearchState;
let wallHistory: WallMove[] = [];
let program: RoomProgram;
let lastMatch: MatchResult | null = null;

function init(): void {
  canvas = document.getElementById('grid-canvas') as HTMLCanvasElement;
  const btnGenerate = document.getElementById('btn-generate') as HTMLButtonElement;
  const btnStep = document.getElementById('btn-step') as HTMLButtonElement;
  const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

  program = defaultOneBedProgram();
  buildProgramUI();
  reset();

  btnGenerate.addEventListener('click', () => {
    readProgramUI();
    reset();
    const moves = runSearch(state, 6);
    wallHistory = moves;
    runMatcher();
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
      runMatcher();
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

function buildProgramUI(): void {
  const list = document.getElementById('room-list')!;
  list.innerHTML = '';

  for (let i = 0; i < program.rooms.length; i++) {
    const room = program.rooms[i];
    const row = document.createElement('div');
    row.className = 'room-row';
    row.innerHTML = `
      <input type="checkbox" id="room-${i}" ${room.enabled ? 'checked' : ''}>
      <label for="room-${i}">${room.name}</label>
      <input type="number" id="room-area-${i}" value="${room.minArea}" min="0" step="10">
      <span class="unit">sf min</span>
      <span id="room-status-${i}" style="width:80px;text-align:right;font-size:11px;"></span>
    `;
    list.appendChild(row);
  }
}

function readProgramUI(): void {
  for (let i = 0; i < program.rooms.length; i++) {
    const cb = document.getElementById(`room-${i}`) as HTMLInputElement;
    const area = document.getElementById(`room-area-${i}`) as HTMLInputElement;
    program.rooms[i].enabled = cb.checked;
    program.rooms[i].minArea = parseInt(area.value) || 0;
  }
}

function runMatcher(): void {
  const regions = findRegions(state.grid, state.interiorBounds);
  readProgramUI();
  lastMatch = matchRooms(regions, program);
  updateRoomStatus();
}

function updateRoomStatus(): void {
  if (!lastMatch) return;
  for (let i = 0; i < program.rooms.length; i++) {
    const el = document.getElementById(`room-status-${i}`);
    if (!el) continue;

    const match = lastMatch.matches.find(m => m.room.name === program.rooms[i].name);
    if (!match || !program.rooms[i].enabled) {
      el.textContent = '';
      el.className = '';
    } else if (!match.region) {
      el.textContent = 'missing';
      el.className = 'room-miss';
    } else if (match.meetsArea) {
      el.textContent = `${match.region.areaSF} sf`;
      el.className = 'room-match';
    } else {
      el.textContent = `${match.region.areaSF} sf (small)`;
      el.className = 'room-miss';
    }
  }
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
  lastMatch = null;
  updateRoomStatus();
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
  html += `(~${Math.round(interiorW * interiorH / 9)} sf)`;

  if (wallHistory.length > 0 && lastMatch) {
    html += ` | <strong>Score:</strong> ${lastMatch.score}`;
    html += `<br><strong>Walls:</strong> ${wallHistory.length}`;

    // Show matched rooms
    html += `<br><br><strong>Matched Rooms:</strong>`;
    for (const m of lastMatch.matches) {
      const status = !m.region ? 'not found' :
        m.meetsArea ? `${m.region.areaSF} sf` : `${m.region.areaSF} sf (needs ${m.room.minArea})`;
      const cls = (!m.region || !m.meetsArea) ? 'room-miss' : 'room-match';
      html += `<div class="step"><span class="${cls}">${m.room.name}: ${status}</span></div>`;
    }

    if (lastMatch.unmatched.length > 0) {
      html += `<br><strong>Unassigned regions:</strong> ${lastMatch.unmatched.length}`;
      for (const r of lastMatch.unmatched) {
        html += `<div class="step">${r.areaSF} sf region</div>`;
      }
    }
  }

  if (message) {
    html += `<br><em>${message}</em>`;
  }

  info.innerHTML = html;
}

init();
