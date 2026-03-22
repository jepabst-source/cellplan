/**
 * Room program — defines what rooms the unit needs.
 *
 * Each room has a name, minimum area (sf), and placement preferences.
 */

export interface RoomRequirement {
  name: string;
  enabled: boolean;
  minArea: number;        // square feet
  prefersGlass: boolean;  // should touch the glass wall (south)
  prefersCorridor: boolean; // should be near corridor (north)
}

export interface RoomProgram {
  rooms: RoomRequirement[];
}

export function defaultOneBedProgram(): RoomProgram {
  return {
    rooms: [
      { name: 'Living/Dining', enabled: true, minArea: 150, prefersGlass: true, prefersCorridor: false },
      { name: 'Bedroom',       enabled: true, minArea: 120, prefersGlass: true, prefersCorridor: false },
      { name: 'Kitchen',       enabled: true, minArea: 50,  prefersGlass: false, prefersCorridor: true },
      { name: 'Bathroom',      enabled: true, minArea: 40,  prefersGlass: false, prefersCorridor: true },
      { name: 'Entry/Closet',  enabled: true, minArea: 20,  prefersGlass: false, prefersCorridor: true },
    ],
  };
}
