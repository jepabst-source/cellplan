/**
 * Reference plans — 9 real 1BR layouts digitized onto the 4" grid.
 *
 * Each plan is a set of WallMove objects that reproduce the wall layout
 * of a real floor plan. All plans share the same 24' × 32' unit shell
 * (72 × 96 cells, 2-cell exterior walls).
 *
 * Interior bounds: x=2..69 (68 cells = 22'-8"), y=2..93 (92 cells = 30'-8")
 * Glass (south) at y=0..1, Corridor (north) at y=94..95.
 *
 * Dimensions are derived from analysis of 9 real 1BR condo plans:
 *   - Bay splits range 35-65% of width
 *   - Horizontal splits range 35-60% of depth from glass
 *   - Living + Kitchen always in same bay
 *   - Bedroom + Bathroom always in same bay
 *   - Service rooms (kitchen, bath, closets) behind glass rooms
 */

import { WallMove } from './walls';
import { createOneBedroom } from './testcase';
import { placeWall } from './walls';
import { findRegions, matchRooms, MatchResult } from './matcher';
import { defaultOneBedProgram, RoomProgram } from './program';

export interface ReferencePlan {
  name: string;
  description: string;
  walls: WallMove[];
}

// Interior bounds (constant for all plans)
const X_MIN = 2;
const X_MAX = 69;
const Y_MIN = 2;
const Y_MAX = 93;

/**
 * Plan 1: Classic 50/50 — balanced bays, moderate depth split.
 * Living 11' x 15', Kitchen 11' x 12', Bedroom 11' x 14', Bath 11' x 7'
 */
const plan1: ReferencePlan = {
  name: 'Plan 1 — Classic 50/50',
  description: 'Balanced bays, living and bedroom roughly equal width',
  walls: [
    // Wall 1: Vertical divider at center (x=36)
    {
      orientation: 'vertical', thickness: 1,
      start: { x: 36, y: Y_MIN }, end: { x: 36, y: Y_MAX },
      openings: [40], label: 'V-divider center',
    },
    // Wall 2: Horizontal in left bay at y=47 (~49% depth) — living/kitchen split
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: X_MIN, y: 47 }, end: { x: 35, y: 47 },
      openings: [10], label: 'H-left living/kitchen',
    },
    // Wall 3: Horizontal in right bay at y=44 (~46% depth) — bedroom/services
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 37, y: 44 }, end: { x: X_MAX, y: 44 },
      openings: [8], label: 'H-right bedroom/services',
    },
    // Wall 4: Horizontal in right service area at y=66 — bathroom/closets split
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 37, y: 66 }, end: { x: X_MAX, y: 66 },
      openings: [5], label: 'H-right bath/closets',
    },
  ],
};

/**
 * Plan 2: Wide Living Bay (60/40) — living gets more glass.
 * Living 13'-4" x 16', Kitchen 13'-4" x 11', Bedroom 9' x 14'
 */
const plan2: ReferencePlan = {
  name: 'Plan 2 — Wide Living',
  description: '60/40 split favoring living bay',
  walls: [
    {
      orientation: 'vertical', thickness: 1,
      start: { x: 42, y: Y_MIN }, end: { x: 42, y: Y_MAX },
      openings: [38], label: 'V-divider 60%',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: X_MIN, y: 50 }, end: { x: 41, y: 50 },
      openings: [15], label: 'H-left living/kitchen',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 43, y: 44 }, end: { x: X_MAX, y: 44 },
      openings: [6], label: 'H-right bedroom/services',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 43, y: 64 }, end: { x: X_MAX, y: 64 },
      openings: [4], label: 'H-right bath/closets',
    },
  ],
};

/**
 * Plan 3: Wide Bedroom Bay (40/60) — bedroom gets more glass.
 * Living 9'-4" x 16', Bedroom 13' x 15', Kitchen 9'-4" x 11'
 */
const plan3: ReferencePlan = {
  name: 'Plan 3 — Wide Bedroom',
  description: '40/60 split favoring bedroom bay',
  walls: [
    {
      orientation: 'vertical', thickness: 1,
      start: { x: 30, y: Y_MIN }, end: { x: 30, y: Y_MAX },
      openings: [42], label: 'V-divider 40%',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: X_MIN, y: 50 }, end: { x: 29, y: 50 },
      openings: [8], label: 'H-left living/kitchen',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 31, y: 46 }, end: { x: X_MAX, y: 46 },
      openings: [12], label: 'H-right bedroom/services',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 31, y: 68 }, end: { x: X_MAX, y: 68 },
      openings: [6], label: 'H-right bath/closets',
    },
  ],
};

/**
 * Plan 4: Deep Living — glass rooms take 55% of depth.
 * Living 11' x 17', Kitchen 11' x 10', Bedroom 11' x 17'
 */
const plan4: ReferencePlan = {
  name: 'Plan 4 — Deep Living',
  description: 'Glass rooms extend deeper into unit (55% depth)',
  walls: [
    {
      orientation: 'vertical', thickness: 1,
      start: { x: 36, y: Y_MIN }, end: { x: 36, y: Y_MAX },
      openings: [45], label: 'V-divider center',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: X_MIN, y: 53 }, end: { x: 35, y: 53 },
      openings: [10], label: 'H-left deep living',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 37, y: 53 }, end: { x: X_MAX, y: 53 },
      openings: [8], label: 'H-right deep bedroom',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 37, y: 72 }, end: { x: X_MAX, y: 72 },
      openings: [5], label: 'H-right bath/closets',
    },
  ],
};

/**
 * Plan 5: Shallow Living — glass rooms take only 38% of depth.
 * Bigger service zones.
 * Living 11' x 12', Kitchen 11' x 15', Bedroom 11' x 12'
 */
const plan5: ReferencePlan = {
  name: 'Plan 5 — Shallow Living',
  description: 'Compact glass rooms (38% depth), larger service zones',
  walls: [
    {
      orientation: 'vertical', thickness: 1,
      start: { x: 36, y: Y_MIN }, end: { x: 36, y: Y_MAX },
      openings: [30], label: 'V-divider center',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: X_MIN, y: 37 }, end: { x: 35, y: 37 },
      openings: [10], label: 'H-left shallow living',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 37, y: 37 }, end: { x: X_MAX, y: 37 },
      openings: [8], label: 'H-right shallow bedroom',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 37, y: 60 }, end: { x: X_MAX, y: 60 },
      openings: [5], label: 'H-right bath/closets',
    },
  ],
};

/**
 * Plan 6: Offset Split — asymmetric horizontal walls.
 * Living bay deeper, bedroom bay shallower. Common when kitchen is compact.
 */
const plan6: ReferencePlan = {
  name: 'Plan 6 — Offset Split',
  description: 'Living bay goes deeper (55%), bedroom bay shallower (40%)',
  walls: [
    {
      orientation: 'vertical', thickness: 1,
      start: { x: 34, y: Y_MIN }, end: { x: 34, y: Y_MAX },
      openings: [38], label: 'V-divider 47%',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: X_MIN, y: 53 }, end: { x: 33, y: 53 },
      openings: [8], label: 'H-left deep living',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 35, y: 40 }, end: { x: X_MAX, y: 40 },
      openings: [10], label: 'H-right shallow bedroom',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 35, y: 62 }, end: { x: X_MAX, y: 62 },
      openings: [5], label: 'H-right bath/closets',
    },
  ],
};

/**
 * Plan 7: With Closet Wall — bedroom bay has a vertical subdivision
 * for walk-in closet.
 */
const plan7: ReferencePlan = {
  name: 'Plan 7 — Closet Partition',
  description: '50/50 with closet subdivision in bedroom bay',
  walls: [
    {
      orientation: 'vertical', thickness: 1,
      start: { x: 36, y: Y_MIN }, end: { x: 36, y: Y_MAX },
      openings: [40], label: 'V-divider center',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: X_MIN, y: 48 }, end: { x: 35, y: 48 },
      openings: [10], label: 'H-left living/kitchen',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 37, y: 46 }, end: { x: X_MAX, y: 46 },
      openings: [8], label: 'H-right bedroom/services',
    },
    // Closet partition: vertical wall in bedroom service zone
    {
      orientation: 'vertical', thickness: 1,
      start: { x: 53, y: 47 }, end: { x: 53, y: 65 },
      openings: [4], label: 'V-closet partition',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 37, y: 65 }, end: { x: X_MAX, y: 65 },
      openings: [5], label: 'H-right bath/closets',
    },
  ],
};

/**
 * Plan 8: 45/55 Split — slightly wider bedroom bay.
 * Compact kitchen, generous bedroom.
 */
const plan8: ReferencePlan = {
  name: 'Plan 8 — Compact Kitchen',
  description: '45/55 split, compact kitchen behind living',
  walls: [
    {
      orientation: 'vertical', thickness: 1,
      start: { x: 33, y: Y_MIN }, end: { x: 33, y: Y_MAX },
      openings: [35], label: 'V-divider 45%',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: X_MIN, y: 52 }, end: { x: 32, y: 52 },
      openings: [8], label: 'H-left living/kitchen',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 34, y: 45 }, end: { x: X_MAX, y: 45 },
      openings: [10], label: 'H-right bedroom/services',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 34, y: 67 }, end: { x: X_MAX, y: 67 },
      openings: [6], label: 'H-right bath/closets',
    },
  ],
};

/**
 * Plan 9: 55/45 Split — wider living bay.
 * Large living/dining, slightly narrower bedroom.
 */
const plan9: ReferencePlan = {
  name: 'Plan 9 — Large Living',
  description: '55/45 split, generous living and dining area',
  walls: [
    {
      orientation: 'vertical', thickness: 1,
      start: { x: 40, y: Y_MIN }, end: { x: 40, y: Y_MAX },
      openings: [42], label: 'V-divider 55%',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: X_MIN, y: 48 }, end: { x: 39, y: 48 },
      openings: [12], label: 'H-left living/kitchen',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 41, y: 44 }, end: { x: X_MAX, y: 44 },
      openings: [7], label: 'H-right bedroom/services',
    },
    {
      orientation: 'horizontal', thickness: 1,
      start: { x: 41, y: 64 }, end: { x: X_MAX, y: 64 },
      openings: [4], label: 'H-right bath/closets',
    },
  ],
};

/** All 9 reference plans. */
export const referencePlans: ReferencePlan[] = [
  plan1, plan2, plan3, plan4, plan5, plan6, plan7, plan8, plan9,
];

/**
 * Score a reference plan: build the grid, place walls, find regions, match rooms.
 * Returns the full match result plus the regions for inspection.
 */
export function scoreReferencePlan(
  plan: ReferencePlan,
  program?: RoomProgram,
): MatchResult {
  const prog = program || defaultOneBedProgram();
  const { grid, interiorBounds } = createOneBedroom();

  // Place all walls
  for (const wall of plan.walls) {
    placeWall(grid, wall);
  }

  // Find regions and match
  const regions = findRegions(grid, interiorBounds, plan.walls);
  return matchRooms(regions, prog);
}

/**
 * Score all 9 reference plans. Returns sorted results (best first).
 */
export function scoreAllReferences(program?: RoomProgram): Array<{
  plan: ReferencePlan;
  result: MatchResult;
}> {
  const results = referencePlans.map(plan => ({
    plan,
    result: scoreReferencePlan(plan, program),
  }));

  results.sort((a, b) => b.result.score - a.result.score);
  return results;
}
