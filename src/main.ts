/**
 * CellPlan — main entry point.
 *
 * Wires up the grid, renderer, search, room program, and UI controls.
 */

import { cellsToFeet } from './grid';
import { placeWall, WallMove } from './walls';
import { createOneBedroom, UnitSetup } from './testcase';
import { SearchState, searchStep, runSearch } from './search';
import { setupCanvas, render, renderLabels, RendererOptions, RoomLabel } from './renderer';
import { RoomProgram, defaultOneBedProgram } from './program';
import { findRegions, matchRooms, MatchResult } from './matcher';
import { scoreAllReferences, ReferencePlan } from './references';

let canvas: HTMLCanvasElement;
let options: RendererOptions;
let unit: UnitSetup;
let state: SearchState;
let wallHistory: WallMove[] = [];
let program: RoomProgram;
let lastMatch: MatchResult | null = null;
let refResults: Array<{ plan: ReferencePlan; result: MatchResult }> = [];
let refIndex = -1; // -1 = not viewing a reference

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
    refIndex = -1;
    updateRefNav();
    reset();
    state.program = program;
    const moves = runSearch(state, 8);
    wallHistory = moves;
    runMatcher();
    renderGrid();

    // Compare against reference baseline
    if (refResults.length === 0) {
      refResults = scoreAllReferences(program);
    }
    const bestRef = refResults.length > 0 ? refResults[0].result.score : 0;
    const genScore = lastMatch?.score ?? 0;
    const comparison = genScore >= bestRef
      ? `Generated score ${genScore} >= best reference ${bestRef}`
      : `Generated score ${genScore} < best reference ${bestRef} (${refResults[0]?.plan.name})`;
    updateInfo(comparison);
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
    refIndex = -1;
    updateRefNav();
    reset();
    renderGrid();
    updateInfo();
  });

  const btnRefs = document.getElementById('btn-refs') as HTMLButtonElement;
  const btnRefPrev = document.getElementById('btn-ref-prev') as HTMLButtonElement;
  const btnRefNext = document.getElementById('btn-ref-next') as HTMLButtonElement;

  btnRefs.addEventListener('click', () => {
    readProgramUI();
    refResults = scoreAllReferences(program);
    refIndex = 0;
    loadReferencePlan(refIndex);
  });

  btnRefPrev.addEventListener('click', () => {
    if (refResults.length === 0 || refIndex <= 0) return;
    refIndex--;
    loadReferencePlan(refIndex);
  });

  btnRefNext.addEventListener('click', () => {
    if (refResults.length === 0 || refIndex >= refResults.length - 1) return;
    refIndex++;
    loadReferencePlan(refIndex);
  });
}

function loadReferencePlan(idx: number): void {
  const { plan, result } = refResults[idx];

  // Rebuild grid with this plan's walls
  unit = createOneBedroom();
  state = {
    grid: unit.grid,
    entryX: unit.entryX,
    entryY: unit.entryY,
    walls: [],
    interiorBounds: unit.interiorBounds,
  };
  for (const wall of plan.walls) {
    placeWall(state.grid, wall);
    state.walls.push(wall);
  }
  wallHistory = [...plan.walls];
  lastMatch = result;

  options = setupCanvas(canvas, unit.grid, { cellSize: 6, showGrid: true });
  updateRoomStatus();
  renderGrid();
  updateInfo(`Reference: ${plan.name} — ${plan.description}`);
  updateRefNav();
}

function updateRefNav(): void {
  const label = document.getElementById('ref-label')!;
  const btnPrev = document.getElementById('btn-ref-prev') as HTMLButtonElement;
  const btnNext = document.getElementById('btn-ref-next') as HTMLButtonElement;

  if (refIndex < 0 || refResults.length === 0) {
    label.textContent = '';
    btnPrev.disabled = true;
    btnNext.disabled = true;
    return;
  }

  label.textContent = `${refIndex + 1} / ${refResults.length}`;
  btnPrev.disabled = refIndex <= 0;
  btnNext.disabled = refIndex >= refResults.length - 1;
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
    const minW = cellsToFeetLabel(Math.min(room.minWidth, room.minDepth));
    const minD = cellsToFeetLabel(Math.max(room.minWidth, room.minDepth));
    const row = document.createElement('div');
    row.className = 'room-row';

    let closetHTML = '';
    if (room.needsCloset) {
      closetHTML = `
        <select id="room-closet-${i}" style="background:#333;color:#e0e0e0;border:1px solid #555;border-radius:3px;font-size:11px;padding:1px 4px;">
          <option value="walk-in" ${room.closetType === 'walk-in' ? 'selected' : ''}>walk-in closet</option>
          <option value="reach-in" ${room.closetType === 'reach-in' ? 'selected' : ''}>reach-in closet</option>
        </select>
      `;
    }

    let shapeHTML = '';
    if (room.shapeOption) {
      shapeHTML = `
        <select id="room-shape-${i}" style="background:#333;color:#e0e0e0;border:1px solid #555;border-radius:3px;font-size:11px;padding:1px 4px;">
          <option value="rectangle" ${room.shapeOption === 'rectangle' ? 'selected' : ''}>rectangle</option>
          <option value="square" ${room.shapeOption === 'square' ? 'selected' : ''}>square</option>
        </select>
      `;
    }

    row.innerHTML = `
      <input type="checkbox" id="room-${i}" ${room.enabled ? 'checked' : ''}>
      <label for="room-${i}">${room.name}</label>
      ${closetHTML}${shapeHTML}
      <span class="min-label">min ${minW} x ${minD}</span>
      <span id="room-status-${i}" style="width:140px;text-align:right;font-size:11px;"></span>
    `;
    list.appendChild(row);
  }
}

function readProgramUI(): void {
  for (let i = 0; i < program.rooms.length; i++) {
    const cb = document.getElementById(`room-${i}`) as HTMLInputElement;
    program.rooms[i].enabled = cb.checked;

    if (program.rooms[i].needsCloset) {
      const sel = document.getElementById(`room-closet-${i}`) as HTMLSelectElement;
      if (sel) {
        program.rooms[i].closetType = sel.value as 'walk-in' | 'reach-in';
      }
    }

    if (program.rooms[i].shapeOption !== undefined) {
      const sel = document.getElementById(`room-shape-${i}`) as HTMLSelectElement;
      if (sel) {
        const shape = sel.value as 'rectangle' | 'square';
        program.rooms[i].shapeOption = shape;
        // Swap to alternate dimensions when shape changes
        if (shape === 'square' && program.rooms[i].altMinWidth !== undefined) {
          program.rooms[i].minWidth = program.rooms[i].altMinWidth!;
          program.rooms[i].minDepth = program.rooms[i].altMinDepth!;
        } else {
          // Reset to defaults — need to get originals
          const defaults = defaultOneBedProgram();
          program.rooms[i].minWidth = defaults.rooms[i].minWidth;
          program.rooms[i].minDepth = defaults.rooms[i].minDepth;
        }
      }
    }
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
      const feet = `${cellsToFeetLabel(match.region.width)} x ${cellsToFeetLabel(match.region.depth)}`;

      if (dimOk && closetOk && adjOk) {
        el.textContent = `${feet} (${match.region.areaSF} sf)`;
        el.className = 'room-match';
      } else {
        let issues = [];
        if (!dimOk) issues.push('small');
        if (!closetOk) issues.push('no closet');
        if (!adjOk) issues.push('not adj');
        el.textContent = `${feet} — ${issues.join(', ')}`;
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
  // Draw room labels if we have match results
  if (lastMatch) {
    const labels: RoomLabel[] = [];
    for (const m of lastMatch.matches) {
      if (!m.region) continue;
      const dimOk = m.meetsWidth && m.meetsDepth;
      const closetOk = !m.room.needsCloset || m.hasCloset;
      const adjOk = m.room.adjacentTo.length === 0 || m.adjacencyMet;
      labels.push({
        name: m.room.name,
        region: m.region,
        ok: dimOk && closetOk && adjOk,
      });
    }
    renderLabels(canvas, state.grid, options, labels);
  }
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
      const size = `${cellsToFeetLabel(m.region.width)} x ${cellsToFeetLabel(m.region.depth)} (${m.region.areaSF} sf)`;
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
        html += `<div class="step">${cellsToFeetLabel(r.width)} x ${cellsToFeetLabel(r.depth)} (${r.areaSF} sf)</div>`;
      }
    }
  }

  if (message) {
    html += `<br><em>${message}</em>`;
  }

  info.innerHTML = html;
}

init();
