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
    state.program = program;
    const moves = runSearch(state, 8);
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

function cellsToFeetLabel(cells: number): string {
  const feet = Math.floor(cells / 3);
  const rem = (cells % 3) * 4;
  return rem === 0 ? `${feet}'` : `${feet}'-${rem}"`;
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
      <label for="room-${i}">${room.name}${room.needsCloset ? ' +closet' : ''}</label>
      <input type="number" id="room-w-${i}" value="${room.minWidth}" min="0" step="3" title="min width (cells)">
      <span class="unit">x</span>
      <input type="number" id="room-d-${i}" value="${room.minDepth}" min="0" step="3" title="min depth (cells)">
      <span class="unit">cells</span>
      <span id="room-status-${i}" style="width:120px;text-align:right;font-size:11px;"></span>
    `;
    list.appendChild(row);
  }
}

function readProgramUI(): void {
  for (let i = 0; i < program.rooms.length; i++) {
    const cb = document.getElementById(`room-${i}`) as HTMLInputElement;
    const w = document.getElementById(`room-w-${i}`) as HTMLInputElement;
    const d = document.getElementById(`room-d-${i}`) as HTMLInputElement;
    program.rooms[i].enabled = cb.checked;
    program.rooms[i].minWidth = parseInt(w.value) || 0;
    program.rooms[i].minDepth = parseInt(d.value) || 0;
  }
}

function runMatcher(): void {
  const regions = findRegions(state.grid, state.interiorBounds, state.walls);
  readProgramUI();
  lastMatch = matchRooms(regions, program);
  updateRoomStatus();
}

function updateRoomStatus(): void {
  if (!lastMatch) {
    for (let i = 0; i < program.rooms.length; i++) {
      const el = document.getElementById(`room-status-${i}`);
      if (el) { el.textContent = ''; el.className = ''; }
    }
    return;
  }

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
    } else {
      const dimOk = match.meetsWidth && match.meetsDepth;
      const closetOk = !match.room.needsCloset || match.hasCloset;
      const adjOk = match.room.adjacentTo.length === 0 || match.adjacencyMet;
      const size = `${match.region.width}x${match.region.depth}`;
      const feet = `${cellsToFeetLabel(match.region.width)}x${cellsToFeetLabel(match.region.depth)}`;

      if (dimOk && closetOk && adjOk) {
        el.textContent = `${size} (${feet})`;
        el.className = 'room-match';
      } else {
        let issues = [];
        if (!dimOk) issues.push('small');
        if (!closetOk) issues.push('no closet');
        if (!adjOk) issues.push('not adjacent');
        el.textContent = `${size} — ${issues.join(', ')}`;
        el.className = 'room-miss';
      }
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
    html += ` | <strong>Walls:</strong> ${wallHistory.length}`;

    // Show matched rooms
    html += `<br><br><strong>Matched Rooms:</strong>`;
    for (const m of lastMatch.matches) {
      if (!m.region) {
        html += `<div class="step"><span class="room-miss">${m.room.name}: not found</span></div>`;
        continue;
      }
      const dimOk = m.meetsWidth && m.meetsDepth;
      const closetOk = !m.room.needsCloset || m.hasCloset;
      const adjOk = m.room.adjacentTo.length === 0 || m.adjacencyMet;
      const ok = dimOk && closetOk && adjOk;
      const cls = ok ? 'room-match' : 'room-miss';
      const size = `${m.region.areaSF} sf (${cellsToFeetLabel(m.region.width)} x ${cellsToFeetLabel(m.region.depth)})`;
      let extra = '';
      if (m.room.needsCloset) {
        extra = m.hasCloset ? ' + closet' : ' — NO CLOSET';
      }
      if (m.room.adjacentTo.length > 0 && !adjOk) {
        extra += ` — NOT ADJ TO ${m.room.adjacentTo.join(', ')}`;
      }
      html += `<div class="step"><span class="${cls}">${m.room.name}: ${size}${extra}</span></div>`;
    }

    if (lastMatch.unmatched.length > 0) {
      html += `<br><strong>Unassigned:</strong>`;
      for (const r of lastMatch.unmatched) {
        html += `<div class="step">${r.areaSF} sf (${cellsToFeetLabel(r.width)} x ${cellsToFeetLabel(r.depth)})</div>`;
      }
    }
  }

  if (message) {
    html += `<br><em>${message}</em>`;
  }

  info.innerHTML = html;
}

init();
