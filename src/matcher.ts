/**
 * Room matcher — assigns emerged regions to room requirements.
 *
 * After walls are placed, open regions are detected and matched
 * to the room program using placement preferences and area.
 */

import { Grid, isWall, getCell } from './grid';
import { RoomProgram, RoomRequirement } from './program';

export interface Region {
  xMin: number; xMax: number;
  yMin: number; yMax: number;
  area: number;           // cell count
  areaSF: number;         // square feet (cells / 9)
  touchesGlass: boolean;  // touches south wall (y = yMin of interior)
  touchesCorridor: boolean; // touches north wall (y = yMax of interior)
}

export interface RoomMatch {
  room: RoomRequirement;
  region: Region | null;    // null = no region matched
  meetsArea: boolean;
}

export interface MatchResult {
  matches: RoomMatch[];
  unmatched: Region[];      // regions not assigned to any room
  score: number;
}

/**
 * Find all open regions in the interior using flood fill.
 */
export function findRegions(grid: Grid, bounds: { xMin: number; xMax: number; yMin: number; yMax: number }): Region[] {
  const regions: Region[] = [];
  const visited = new Uint8Array(grid.width * grid.height);
  const { xMin, xMax, yMin, yMax } = bounds;

  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const idx = y * grid.width + x;
      if (visited[idx] || isWall(getCell(grid, x, y))) continue;

      // Flood fill to find connected region
      const stack = [idx];
      visited[idx] = 1;
      let rXMin = x, rXMax = x, rYMin = y, rYMax = y;
      let cellCount = 0;

      while (stack.length > 0) {
        const ci = stack.pop()!;
        const cx = ci % grid.width;
        const cy = Math.floor(ci / grid.width);
        cellCount++;
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

      regions.push({
        xMin: rXMin, xMax: rXMax,
        yMin: rYMin, yMax: rYMax,
        area: cellCount,
        areaSF: Math.round(cellCount / 9),
        touchesGlass: rYMin <= yMin + 1,
        touchesCorridor: rYMax >= yMax - 1,
      });
    }
  }

  // Sort by area descending
  regions.sort((a, b) => b.area - a.area);
  return regions;
}

/**
 * Match regions to room requirements using a greedy approach.
 *
 * Strategy:
 * 1. Glass-preferring rooms get the largest glass-touching regions
 * 2. Corridor-preferring rooms get corridor-touching regions
 * 3. Remaining rooms get remaining regions by size
 */
export function matchRooms(regions: Region[], program: RoomProgram): MatchResult {
  const enabledRooms = program.rooms.filter(r => r.enabled);
  const available = new Set(regions.map((_, i) => i));
  const matches: RoomMatch[] = [];

  // Pass 1: Glass-preferring rooms — largest glass-touching regions first
  const glassRooms = enabledRooms.filter(r => r.prefersGlass);
  const glassRegions = regions
    .map((r, i) => ({ region: r, index: i }))
    .filter(r => r.region.touchesGlass && available.has(r.index));

  for (const room of glassRooms) {
    const best = glassRegions.find(r => available.has(r.index));
    if (best) {
      available.delete(best.index);
      matches.push({
        room,
        region: best.region,
        meetsArea: best.region.areaSF >= room.minArea,
      });
    } else {
      matches.push({ room, region: null, meetsArea: false });
    }
  }

  // Pass 2: Corridor-preferring rooms — smallest corridor-touching regions
  const corridorRooms = enabledRooms.filter(r => r.prefersCorridor);
  const corridorRegions = regions
    .map((r, i) => ({ region: r, index: i }))
    .filter(r => r.region.touchesCorridor && available.has(r.index))
    .sort((a, b) => a.region.area - b.region.area); // smallest first for service rooms

  for (const room of corridorRooms) {
    // Find smallest corridor region that meets min area
    const best = corridorRegions.find(r => available.has(r.index) && r.region.areaSF >= room.minArea)
      || corridorRegions.find(r => available.has(r.index));
    if (best) {
      available.delete(best.index);
      matches.push({
        room,
        region: best.region,
        meetsArea: best.region.areaSF >= room.minArea,
      });
    } else {
      matches.push({ room, region: null, meetsArea: false });
    }
  }

  // Pass 3: Any remaining rooms get remaining regions
  const otherRooms = enabledRooms.filter(r => !r.prefersGlass && !r.prefersCorridor);
  for (const room of otherRooms) {
    const remaining = regions
      .map((r, i) => ({ region: r, index: i }))
      .filter(r => available.has(r.index));
    if (remaining.length > 0) {
      const best = remaining[0]; // largest remaining
      available.delete(best.index);
      matches.push({
        room,
        region: best.region,
        meetsArea: best.region.areaSF >= room.minArea,
      });
    } else {
      matches.push({ room, region: null, meetsArea: false });
    }
  }

  // Unmatched regions
  const unmatched = regions.filter((_, i) => available.has(i));

  // Score
  let score = 0;
  for (const m of matches) {
    if (!m.region) {
      score -= 50; // Missing room entirely
    } else if (m.meetsArea) {
      score += 30; // Room meets minimum area
      // Bonus for correct placement
      if (m.room.prefersGlass && m.region.touchesGlass) score += 20;
      if (m.room.prefersCorridor && m.region.touchesCorridor) score += 20;
    } else {
      score -= 20; // Room too small
    }
  }

  // Penalize too many leftover regions (wasted space / over-subdivided)
  if (unmatched.length > 1) {
    score -= unmatched.length * 5;
  }

  return { matches, unmatched, score };
}
