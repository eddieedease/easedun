import { LevelData } from '../core/models';
import { Rng, createRng } from './rng';

export type Dir = 0 | 1 | 2 | 3; // N, E, S, W
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export interface MonsterType {
  name: string;
  icon: string;
  hp: number;
  attack: [number, number];
  gold: [number, number];
}

export const MONSTERS: MonsterType[] = [
  { name: 'Giant Rat', icon: '🐀', hp: 6, attack: [1, 3], gold: [1, 5] },
  { name: 'Cave Spider', icon: '🕷️', hp: 9, attack: [2, 4], gold: [3, 8] },
  { name: 'Skeleton', icon: '💀', hp: 14, attack: [2, 6], gold: [5, 15] },
  { name: 'Ogre', icon: '👹', hp: 24, attack: [4, 9], gold: [15, 40] },
];

export type Encounter =
  | { kind: 'monster'; type: MonsterType; hp: number }
  | { kind: 'treasure'; gold: number; potion: boolean }
  | { kind: 'trap'; damage: number; revealed: boolean };

/** A concrete, randomized playthrough generated from level data + seed. */
export interface Scenario {
  seed: number;
  width: number;
  height: number;
  walls: boolean[][];
  exit: { x: number; y: number };
  start: { x: number; y: number; dir: Dir };
  encounters: Map<string, Encounter>;
}

export const key = (x: number, y: number) => `${x},${y}`;

/**
 * Turns an editor level into one playthrough:
 *  - one of the 'S' cells becomes the start, one of the 'E' cells the real exit
 *  - each '?' rolls against spawnChance and the weighted encounter table
 *  - 'M' and 'T' always spawn, but their exact monster/loot is rolled
 */
export function buildScenario(level: LevelData, seed: number): Scenario {
  const rng = createRng(seed);
  const starts: [number, number][] = [];
  const exits: [number, number][] = [];
  const walls: boolean[][] = [];
  const encounters = new Map<string, Encounter>();

  for (let y = 0; y < level.height; y++) {
    walls.push([]);
    for (let x = 0; x < level.width; x++) {
      const c = level.rows[y][x];
      walls[y].push(c === '#');
      if (c === 'S') starts.push([x, y]);
      else if (c === 'E') exits.push([x, y]);
      else if (c === 'M') encounters.set(key(x, y), rollMonster(rng));
      else if (c === 'T') encounters.set(key(x, y), rollTreasure(rng));
      else if (c === '?' && rng.next() < level.scenario.spawnChance) {
        const kind = rng.weighted(level.scenario.weights);
        if (kind === 'monster') encounters.set(key(x, y), rollMonster(rng));
        if (kind === 'treasure') encounters.set(key(x, y), rollTreasure(rng));
        if (kind === 'trap') encounters.set(key(x, y), { kind: 'trap', damage: rng.int(2, 6), revealed: false });
      }
    }
  }

  const [sx, sy] = rng.pick(starts);
  const [ex, ey] = rng.pick(exits);
  const isOpen = (x: number, y: number) => !(walls[y]?.[x] ?? true);
  // Face an open corridor if there is one.
  const openDirs = ([0, 1, 2, 3] as Dir[]).filter((d) => isOpen(sx + DX[d], sy + DY[d]));
  const dir = openDirs.length ? rng.pick(openDirs) : 0;
  encounters.delete(key(sx, sy));

  return {
    seed,
    width: level.width,
    height: level.height,
    walls,
    exit: { x: ex, y: ey },
    start: { x: sx, y: sy, dir },
    encounters,
  };
}

function rollMonster(rng: Rng): Encounter {
  const type = rng.pick(MONSTERS);
  return { kind: 'monster', type, hp: type.hp };
}

function rollTreasure(rng: Rng): Encounter {
  return { kind: 'treasure', gold: rng.int(5, 30), potion: rng.next() < 0.35 };
}
