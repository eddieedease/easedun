import { ActorDef, LevelData } from '../core/models';
import { createRng } from './rng';

export type Dir = 0 | 1 | 2 | 3; // N, E, S, W
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export const key = (x: number, y: number) => `${x},${y}`;

/** An actor living on the map during one run. */
export interface ActorInstance {
  uid: number;
  def: ActorDef;
  x: number;
  y: number;
  hp: number;
  hostile: boolean;
  /** performance.now() timestamp until which the sprite flashes after a hit. */
  flashUntil?: number;
}

export const isBlocking = (a: ActorInstance) => a.def.kind !== 'item' && a.def.kind !== 'trigger';

/**
 * Not drawn in the view or on the map: story triggers, and enemies that are
 * hostile on sight, which lurk unseen and ambush the player old-school style.
 */
export const isHidden = (a: ActorInstance) => a.def.kind === 'trigger' || (a.def.kind === 'enemy' && !!a.def.hostile);

/** A concrete playthrough generated from level data + seed. */
export interface Scenario {
  seed: number;
  width: number;
  height: number;
  walls: boolean[][];
  exit: { x: number; y: number };
  start: { x: number; y: number; dir: Dir };
  actors: Map<string, ActorInstance>;
}

/**
 * Turns an editor level into one playthrough:
 *  - one of the 'S' cells becomes the start, one of the 'E' cells the real exit
 *  - placed actors always appear
 *  - each '?' rolls against spawnChance, then picks from the weighted random pool
 */
export function buildScenario(level: LevelData, seed: number): Scenario {
  const rng = createRng(seed);
  const defs = new Map(level.actors.map((a) => [a.id, a]));
  const starts: [number, number][] = [];
  const exits: [number, number][] = [];
  const randoms: [number, number][] = [];
  const walls: boolean[][] = [];
  const actors = new Map<string, ActorInstance>();
  let uid = 0;

  const spawn = (def: ActorDef | undefined, x: number, y: number) => {
    if (!def) return;
    actors.set(key(x, y), { uid: uid++, def, x, y, hp: def.hp ?? 1, hostile: !!def.hostile });
  };

  for (let y = 0; y < level.height; y++) {
    walls.push([]);
    for (let x = 0; x < level.width; x++) {
      const c = level.rows[y][x];
      walls[y].push(c === '#');
      if (c === 'S') starts.push([x, y]);
      else if (c === 'E') exits.push([x, y]);
      else if (c === '?') randoms.push([x, y]);
    }
  }

  for (const p of level.placements) spawn(defs.get(p.actor), p.x, p.y);

  const pool = Object.fromEntries(level.randomPool.map((r, i) => [i, r.weight])) as Record<string, number>;
  for (const [x, y] of randoms) {
    if (actors.has(key(x, y)) || rng.next() >= level.spawnChance) continue;
    const pick = rng.weighted(pool);
    if (pick !== null) spawn(defs.get(level.randomPool[Number(pick)].actor), x, y);
  }

  const [sx, sy] = rng.pick(starts);
  const [ex, ey] = rng.pick(exits);
  const isOpen = (x: number, y: number) => !(walls[y]?.[x] ?? true);
  const openDirs = ([0, 1, 2, 3] as Dir[]).filter((d) => isOpen(sx + DX[d], sy + DY[d]));
  actors.delete(key(sx, sy));

  return {
    seed,
    width: level.width,
    height: level.height,
    walls,
    exit: { x: ex, y: ey },
    start: { x: sx, y: sy, dir: openDirs.length ? rng.pick(openDirs) : 0 },
    actors,
  };
}
