/**
 * Room matcher — assigns emerged regions to room requirements.
 *
 * After walls are placed, open regions are detected and matched
 * to the room program using placement preferences, dimensions, and rules.
 */

import { Grid, CellType, isWall, getCell, setCell, cloneGrid } from './grid';
import { RoomProgram, RoomRequirement } from './program';
import { WallMove } from './walls';

export interface Region {
  xMin: number; xMax: number;
  yMin: number; yMax: number;
  width: number;          // cells (xMax - xMin + 1)
  depth: number;          // cells (yMax - yMin + 1)
  area: number;           // cell count (actual, from flood fill)
  areaSF: number;         // square feet (cells / 9)
  touchesGlass: boolean;  // touches south wall (y near interior yMin)
  touchesCorridor: boolean; // touches north wall (y near interior yMax)
}

export interface RoomMatch {
  room: RoomRequirement;
  region: Region | null;
  meetsWidth: boolean;
  meetsDepth: boolean;
  hasCloset: boolean;     // true if closet found adjacent (when required)
  closetRegion: Region | null;
  adjacencyMet: boolean;  // true if all adjacentTo requirements are met
}

export interface MatchResult {
  matches: RoomMatch[];
  unmatched: Region[];
  score: number;
}

/**
 * Find all open regions by flood-filling with doors closed.
 * Temporarily fills door openings so each room is a distinct region.
 */
export function findRegions(grid: Grid, bounds: { xMin: number; xMax: number; yMin: number; yMax: number }, walls?: WallMove[]): Region[] {
  // Clone grid and close all door openings to find distinct rooms
  const closedGrid = walls ? closeDoors(grid, walls) : grid;
  return findRegionsInGrid(closedGrid, bounds);
}

/**
 * Temporarily close door openings in interior walls.
 */
function closeDoors(grid: Grid, walls: WallMove[]): Grid {
  const closed = cloneGrid(grid);
  for (const wall of walls) {
    if (wall.openings.length === 0) continue;
    const xMin = Math.min(wall.start.x, wall.end.x);
    const yMin = Math.min(wall.start.y, wall.end.y);

    for (const openPos of wall.openings) {
      for (let i = 0; i < 9; i++) {
        for (let t = 0; t < wall.thickness; t++) {
          if (wall.orientation === 'horizontal') {
            const x = xMin + openPos + i;
            const y = wall.start.y + t;
            if (x >= 0 && x < closed.width && y >= 0 && y < closed.height) {
              setCell(closed, x, y, CellType.Wall);
            }
          } else {
            const x = wall.start.x + t;
            const y = yMin + openPos + i;
            if (x >= 0 && x < closed.width && y >= 0 && y < closed.height) {
              setCell(closed, x, y, CellType.Wall);
            }
          }
        }
      }
    }
  }
  return closed;
}

function findRegionsInGrid(grid: Grid, bounds: { xMin: number; xMax: number; yMin: number; yMax: number }): Region[] {
  const regions: Region[] = [];
  const visited = new Uint8Array(grid.width * grid.height);
  const { xMin, xMax, yMin, yMax } = bounds;

  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const idx = y * grid.width + x;
      if (visited[idx] || isWall(getCell(grid, x, y))) continue;

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

      const w = rXMax - rXMin + 1;
      const d = rYMax - rYMin + 1;

      regions.push({
        xMin: rXMin, xMax: rXMax,
        yMin: rYMin, yMax: rYMax,
        width: w,
        depth: d,
        area: cellCount,
        areaSF: Math.round(cellCount / 9),
        touchesGlass: rYMin <= yMin + 1,
        touchesCorridor: rYMax >= yMax - 1,
      });
    }
  }

  regions.sort((a, b) => b.area - a.area);
  return regions;
}

/**
 * Check if a region meets minimum dimension requirements.
 * Uses the smaller dimension as width and larger as depth,
 * so orientation doesn't matter.
 */
function meetsDimensions(region: Region, minWidth: number, minDepth: number): { meetsWidth: boolean; meetsDepth: boolean } {
  const short = Math.min(region.width, region.depth);
  const long = Math.max(region.width, region.depth);
  const reqShort = Math.min(minWidth, minDepth);
  const reqLong = Math.max(minWidth, minDepth);
  return {
    meetsWidth: short >= reqShort,
    meetsDepth: long >= reqLong,
  };
}

/**
 * Check if a region has an adjacent closet-sized region.
 * A closet is a small region that shares a wall boundary with the room.
 */
function findAdjacentCloset(
  roomRegion: Region,
  allRegions: Region[],
  available: Set<number>,
  program: RoomProgram,
  closetType: 'walk-in' | 'reach-in' | 'none',
): { found: boolean; index: number; region: Region | null } {
  // Get the spec for the requested closet type
  const spec = closetType === 'walk-in' ? program.walkInCloset : program.reachInCloset;
  const reqShort = Math.min(spec.minWidth, spec.minDepth);
  const reqLong = Math.max(spec.minWidth, spec.minDepth);

  for (let i = 0; i < allRegions.length; i++) {
    if (!available.has(i)) continue;
    const r = allRegions[i];
    const short = Math.min(r.width, r.depth);
    const long = Math.max(r.width, r.depth);

    if (short < reqShort || long < reqLong) continue;
    if (!isAdjacent(roomRegion, r)) continue;

    return { found: true, index: i, region: r };
  }
  return { found: false, index: -1, region: null };
}

/**
 * Check if two regions are adjacent (share a wall boundary).
 * They are adjacent if their bounding boxes are separated by
 * exactly a wall thickness (1-2 cells) in one direction and
 * overlap in the other direction.
 */
function isAdjacent(a: Region, b: Region): boolean {
  const wallGap = 3; // max gap to consider adjacent (accounts for wall thickness)

  // Check horizontal adjacency (side by side)
  const hGap1 = b.xMin - a.xMax;
  const hGap2 = a.xMin - b.xMax;
  if ((hGap1 > 0 && hGap1 <= wallGap) || (hGap2 > 0 && hGap2 <= wallGap)) {
    // They're horizontally adjacent — check vertical overlap
    if (a.yMin <= b.yMax && b.yMin <= a.yMax) return true;
  }

  // Check vertical adjacency (above/below)
  const vGap1 = b.yMin - a.yMax;
  const vGap2 = a.yMin - b.yMax;
  if ((vGap1 > 0 && vGap1 <= wallGap) || (vGap2 > 0 && vGap2 <= wallGap)) {
    // They're vertically adjacent — check horizontal overlap
    if (a.xMin <= b.xMax && b.xMin <= a.xMax) return true;
  }

  return false;
}

/**
 * Match regions to room requirements.
 *
 * Strategy:
 * 1. Glass-preferring rooms get the largest glass-touching regions
 * 2. Corridor-preferring rooms get corridor-touching regions
 * 3. Remaining rooms get remaining regions by size
 * 4. Closet requirements checked after primary assignment
 */
export function matchRooms(regions: Region[], program: RoomProgram): MatchResult {
  const enabledRooms = program.rooms.filter(r => r.enabled);
  const available = new Set(regions.map((_, i) => i));
  const matches: RoomMatch[] = [];

  // Pass 1: Glass-preferring rooms — largest glass-touching regions first
  const glassRooms = enabledRooms.filter(r => r.prefersGlass);
  const glassRegions = regions
    .map((r, i) => ({ region: r, index: i }))
    .filter(r => r.region.touchesGlass);

  for (const room of glassRooms) {
    const best = glassRegions.find(r => available.has(r.index));
    if (best) {
      available.delete(best.index);
      const dims = meetsDimensions(best.region, room.minWidth, room.minDepth);

      let hasCloset = !room.needsCloset; // true if not needed
      let closetRegion: Region | null = null;
      if (room.needsCloset) {
        const closet = findAdjacentCloset(best.region, regions, available, program, room.closetType);
        hasCloset = closet.found;
        if (closet.found) {
          available.delete(closet.index);
          closetRegion = closet.region;
        }
      }

      matches.push({
        room,
        region: best.region,
        meetsWidth: dims.meetsWidth,
        meetsDepth: dims.meetsDepth,
        hasCloset,
        closetRegion,
        adjacencyMet: true, // checked after all rooms assigned
      });
    } else {
      matches.push({ room, region: null, meetsWidth: false, meetsDepth: false, hasCloset: false, closetRegion: null, adjacencyMet: false });
    }
  }

  // Pass 2: All remaining rooms — best-fit by size
  const otherRooms = enabledRooms.filter(r => !r.prefersGlass);
  for (const room of otherRooms) {
    const remaining = regions
      .map((r, i) => ({ region: r, index: i }))
      .filter(r => available.has(r.index));

    // Prefer region that meets dimensions; among those, prefer smallest (best fit)
    const fitting = remaining
      .filter(r => {
        const d = meetsDimensions(r.region, room.minWidth, room.minDepth);
        return d.meetsWidth && d.meetsDepth;
      })
      .sort((a, b) => a.region.area - b.region.area);

    const best = fitting[0] || remaining[0];
    if (best) {
      available.delete(best.index);
      const dims = meetsDimensions(best.region, room.minWidth, room.minDepth);
      matches.push({
        room,
        region: best.region,
        meetsWidth: dims.meetsWidth,
        meetsDepth: dims.meetsDepth,
        hasCloset: !room.needsCloset,
        closetRegion: null,
        adjacencyMet: true, // checked below
      });
    } else {
      matches.push({ room, region: null, meetsWidth: false, meetsDepth: false, hasCloset: false, closetRegion: null, adjacencyMet: false });
    }
  }

  // Pass 4: Check adjacency requirements
  // Two rooms are "adjacent" if they share the same region (open plan)
  // or their regions are physically adjacent (separated by a wall with a door)
  for (const m of matches) {
    if (!m.region || m.room.adjacentTo.length === 0) continue;

    m.adjacencyMet = m.room.adjacentTo.every(targetName => {
      const target = matches.find(t => t.room.name === targetName);
      if (!target || !target.region) return false;

      // Same region = open plan (no wall between them)
      if (m.region === target.region) return true;

      // Adjacent regions = separated by wall but next to each other
      return isAdjacent(m.region!, target.region!);
    });
  }

  const unmatched = regions.filter((_, i) => available.has(i));

  // Scoring
  let score = 0;
  for (const m of matches) {
    if (!m.region) {
      score -= 50;
      continue;
    }

    // Dimension checks
    if (m.meetsWidth && m.meetsDepth) {
      score += 30;
    } else if (m.meetsWidth || m.meetsDepth) {
      score -= 10;
    } else {
      score -= 25;
    }

    // Placement bonus
    if (m.room.prefersGlass && m.region.touchesGlass) score += 20;

    // Closet rule
    if (m.room.needsCloset) {
      score += m.hasCloset ? 15 : -30;
    }

    // Adjacency rule
    if (m.room.adjacentTo.length > 0) {
      score += m.adjacencyMet ? 15 : -25;
    }
  }

  if (unmatched.length > 1) {
    score -= unmatched.length * 5;
  }

  return { matches, unmatched, score };
}
