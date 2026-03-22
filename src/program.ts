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
  prefersCorridor: boolean; // should be near corridor (north)
  needsCloset: boolean;     // must have an adjacent closet-sized region
  adjacentTo: string[];     // must be adjacent to these rooms (by name), or share same region
}

export interface RoomProgram {
  rooms: RoomRequirement[];
  closetMinDepth: number;   // cells — minimum closet depth (default 6 = 2')
  closetMinWidth: number;   // cells — minimum closet width (default 9 = 3')
}

export function defaultOneBedProgram(): RoomProgram {
  return {
    closetMinDepth: 16,  // walk-in closet: 5'-4" min each direction
    closetMinWidth: 16,  // walk-in closet: 5'-4" min each direction
    rooms: [
      {
        name: 'Living/Dining',
        enabled: true,
        minWidth: 44,          // ~14'-8"
        minDepth: 44,          // ~14'-8"
        prefersGlass: true,
        prefersCorridor: false,
        needsCloset: false,
        adjacentTo: ['Kitchen'],  // living room must be adjacent to kitchen
      },
      {
        name: 'Bedroom',
        enabled: true,
        minWidth: 40,          // ~13'-4"
        minDepth: 40,          // ~13'-4"
        prefersGlass: true,
        prefersCorridor: false,
        needsCloset: true,     // bedrooms need a closet
        adjacentTo: [],
      },
      {
        name: 'Kitchen',
        enabled: true,
        minWidth: 24,          // 8'-0"
        minDepth: 18,          // 6'-0"
        prefersGlass: false,
        prefersCorridor: true,
        needsCloset: false,
        adjacentTo: ['Living/Dining'],  // kitchen must be adjacent to living room
      },
      {
        name: 'Bathroom',
        enabled: true,
        minWidth: 17,          // 5'-8"
        minDepth: 21,          // 7'-0"
        prefersGlass: false,
        prefersCorridor: true,
        needsCloset: false,
        adjacentTo: [],
      },
      {
        name: 'Entry/Closet',
        enabled: true,
        minWidth: 9,           // 3'-0"
        minDepth: 12,          // 4'-0"
        prefersGlass: false,
        prefersCorridor: true,
        needsCloset: false,
        adjacentTo: [],
      },
      {
        name: 'Laundry Closet',
        enabled: true,
        minWidth: 9,           // 3'-0"
        minDepth: 9,           // 3'-0"
        prefersGlass: false,
        prefersCorridor: true,
        needsCloset: false,
        adjacentTo: [],
      },
      {
        name: 'Utility Closet',
        enabled: true,
        minWidth: 9,           // 3'-0"
        minDepth: 9,           // 3'-0"
        prefersGlass: false,
        prefersCorridor: true,
        needsCloset: false,
        adjacentTo: [],
      },
    ],
  };
}
