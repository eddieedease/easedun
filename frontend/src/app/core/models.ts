export type Role = 'admin' | 'player';

export interface User {
  id: number;
  username: string;
  role: Role;
}

/**
 * Cells: '#' wall, '.' floor, 'S' possible start, 'E' possible exit,
 * '?' random spot, 'M' fixed monster, 'T' fixed treasure.
 */
export type CellChar = '#' | '.' | 'S' | 'E' | '?' | 'M' | 'T';

export interface ScenarioConfig {
  /** Chance (0–1) that a '?' spot spawns something. */
  spawnChance: number;
  weights: { monster: number; treasure: number; trap: number };
}

export interface LevelData {
  width: number;
  height: number;
  rows: string[];
  scenario: ScenarioConfig;
}

export interface LevelSummary {
  id: number;
  name: string;
  description: string;
  published: boolean;
  updatedAt: string;
}

export interface Level extends LevelSummary {
  data: LevelData;
}

export interface LevelInput {
  name: string;
  description: string;
  published: boolean;
  data: LevelData;
}
