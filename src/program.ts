/**
 * Room program — defines what rooms the unit needs.
 *
 * Dimensions are in cells (3 cells = 1 foot, 1 cell = 4 inches).
 * Each room has minimum width/depth, placement preferences, and rules.
 */

export interface RoomRequirement {
  name: string;
  enabled: boolean;
  minWidth: number;         // cells — shortest dimension
  minDepth: number;         // cells — longest dimension
  prefersGlass: boolean;    // should touch the glass wall (south)
  prefersCorridor: boolean; // kept for data structure, not scored
  needsCloset: boolean;     // must have an adjacent closet-sized region
  closetType: 'none' | 'reach-in' | 'walk-in'; // user selects closet type
  shapeOption?: 'rectangle' | 'square'; // for rooms with shape variants (e.g. bathroom)
  altMinWidth?: number;     // alternate min width when shape changes
  altMinDepth?: number;     // alternate min depth when shape changes
  adjacentTo: string[];     // must be adjacent to these rooms (by name), or share same region
  canShareWith: string[];   // can share same open region with these rooms (open concept)
}

export interface ClosetSpec {
  minWidth: number;   // cells — along the wall
  minDepth: number;   // cells — perpendicular to wall
}

export interface RoomProgram {
  rooms: RoomRequirement[];
  // A bedroom closet can be either type:
  walkInCloset: ClosetSpec;   // 16x16 cells (5'-4" x 5'-4")
  reachInCloset: ClosetSpec;  // 9 wide x 6 deep (3'-0" x 2'-0")
}

export function defaultOneBedProgram(): RoomProgram {
  return {
    walkInCloset: { minWidth: 16, minDepth: 16 },   // 5'-4" x 5'-4"
    reachInCloset: { minWidth: 9, minDepth: 6 },     // 3'-0" x 2'-0"
    rooms: [
      {
        name: 'Living/Dining',
        enabled: true,
        minWidth: 33,          // 11'-0"
        minDepth: 33,          // 11'-0"
        prefersGlass: true,
        prefersCorridor: false,
        needsCloset: false,
        closetType: 'none',
        adjacentTo: ['Kitchen'],
        canShareWith: ['Kitchen'],  // open concept kitchen/living
      },
      {
        name: 'Bedroom',
        enabled: true,
        minWidth: 30,          // 10'-0"
        minDepth: 30,          // 10'-0"
        prefersGlass: true,
        prefersCorridor: false,
        needsCloset: true,
        closetType: 'walk-in',
        adjacentTo: [],
        canShareWith: [],
      },
      {
        name: 'Kitchen',
        enabled: true,
        minWidth: 24,          // 8'-0"
        minDepth: 18,          // 6'-0"
        prefersGlass: false,   // sits behind living room, borrows light
        prefersCorridor: false,
        needsCloset: false,
        closetType: 'none',
        adjacentTo: ['Living/Dining'],
        canShareWith: ['Living/Dining'],  // open concept
      },
      {
        name: 'Bathroom',
        enabled: true,
        minWidth: 16,          // 5'-4" (rectangle option)
        minDepth: 26,          // 8'-8" (rectangle option)
        prefersGlass: false,
        prefersCorridor: false,
        needsCloset: false,
        closetType: 'none',
        adjacentTo: [],
        canShareWith: [],
        shapeOption: 'rectangle',
        altMinWidth: 25,       // 8'-4" (square option)
        altMinDepth: 25,       // 8'-4" (square option)
      },
      {
        name: 'Entry/Closet',
        enabled: true,
        minWidth: 6,           // 2'-0"
        minDepth: 9,           // 3'-0"
        prefersGlass: false,
        prefersCorridor: false,
        needsCloset: false,
        closetType: 'none',
        adjacentTo: [],
        canShareWith: [],
      },
      {
        name: 'Laundry Closet',
        enabled: true,
        minWidth: 9,           // 3'-0"
        minDepth: 9,           // 3'-0"
        prefersGlass: false,
        prefersCorridor: false,
        needsCloset: false,
        closetType: 'none',
        adjacentTo: [],
        canShareWith: [],
      },
      {
        name: 'Utility Closet',
        enabled: true,
        minWidth: 9,           // 3'-0"
        minDepth: 9,           // 3'-0"
        prefersGlass: false,
        prefersCorridor: false,
        needsCloset: false,
        closetType: 'none',
        adjacentTo: [],
        canShareWith: [],
      },
    ],
  };
}
