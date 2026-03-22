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
  adjacentTo: string[];     // must be adjacent to these rooms (by name), or share same region
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
        minWidth: 44,          // ~14'-8"
        minDepth: 44,          // ~14'-8"
        prefersGlass: true,
        prefersCorridor: false,
        needsCloset: false,
        closetType: 'none',
        adjacentTo: ['Kitchen'],
      },
      {
        name: 'Bedroom',
        enabled: true,
        minWidth: 40,          // ~13'-4"
        minDepth: 40,          // ~13'-4"
        prefersGlass: true,
        prefersCorridor: false,
        needsCloset: true,
        closetType: 'walk-in', // user can change to 'reach-in'
        adjacentTo: [],
      },
      {
        name: 'Kitchen',
        enabled: true,
        minWidth: 24,          // 8'-0"
        minDepth: 18,          // 6'-0"
        prefersGlass: false,
        prefersCorridor: false,
        needsCloset: false,
        closetType: 'none',
        adjacentTo: ['Living/Dining'],
      },
      {
        name: 'Bathroom',
        enabled: true,
        minWidth: 17,          // 5'-8"
        minDepth: 21,          // 7'-0"
        prefersGlass: false,
        prefersCorridor: false,
        needsCloset: false,
        closetType: 'none',
        adjacentTo: [],
      },
      {
        name: 'Entry/Closet',
        enabled: true,
        minWidth: 9,           // 3'-0"
        minDepth: 12,          // 4'-0"
        prefersGlass: false,
        prefersCorridor: false,
        needsCloset: false,
        closetType: 'none',
        adjacentTo: [],
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
      },
    ],
  };
}
