import { ActorDef, ActorKind, EnemyDef, EnemyStats, EnemyTrait, LevelData } from '../core/models';
import { THEMES } from './themes';

export function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export const KIND_LABELS: Record<ActorKind, string> = {
  npc: 'Character',
  enemy: 'Enemy',
  item: 'Item',
  terminal: 'Terminal / sign',
  trigger: 'Story trigger',
};

export function newActor(kind: ActorKind): ActorDef {
  const base: ActorDef = {
    id: newId(kind),
    name: KIND_LABELS[kind],
    kind,
    sprite: { npc: '🧑‍🎤', enemy: '🤖', item: '📦', terminal: '📟', trigger: '💬' }[kind],
    dialogue: [],
  };
  if (kind === 'enemy') Object.assign(base, { hp: 12, attack: [2, 5], hostile: true, drops: [] });
  if (kind !== 'item') base.dialogue = [{ id: 'start', text: '', choices: [] }];
  return base;
}

export function emptyLevel(width = 20, height = 16): LevelData {
  const rows = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.')).join(''),
  );
  rows[1] = '#S' + rows[1].slice(2);
  rows[height - 2] = rows[height - 2].slice(0, width - 2) + 'E#';
  return {
    version: 2,
    width,
    height,
    rows,
    theme: 'neon-night',
    story: { intro: '', outro: 'You made it out.', exitFlag: '', exitLockedText: 'The way is blocked.' },
    actors: [],
    placements: [],
    spawnChance: 0.5,
    randomPool: [],
    encounterRate: 0,
    encounterPool: [],
  };
}

/** Accepts current and older (v1 dungeon) level data and returns the current format. */
export function normalizeLevel(raw: unknown): LevelData {
  const d = (raw ?? {}) as Record<string, any>;
  if (d['version'] === 2) {
    const base = emptyLevel(d['width'], d['height']);
    return {
      ...base,
      ...d,
      theme: d['theme'] in THEMES ? d['theme'] : 'neon-night',
      story: { ...base.story, ...d['story'] },
    } as LevelData;
  }

  // v1: '#.SE?MT' cells with a weighted monster/treasure/trap table.
  const level = emptyLevel(d['width'] ?? 12, d['height'] ?? 10);
  const thug: ActorDef = { ...newActor('enemy'), id: 'thug', name: 'Street thug', sprite: '🦹', dialogue: [] };
  const cache: ActorDef = { ...newActor('item'), id: 'creds', name: 'Credstick', sprite: '💳', credits: 20 };
  level.actors = [thug, cache];
  level.rows = (d['rows'] as string[]).map((row, y) =>
    [...row]
      .map((c, x) => {
        if (c === 'M' || c === 'T') {
          level.placements.push({ x, y, actor: c === 'M' ? thug.id : cache.id });
          return '.';
        }
        return c;
      })
      .join(''),
  );
  level.spawnChance = d['scenario']?.spawnChance ?? 0.5;
  level.randomPool = [
    { actor: thug.id, weight: d['scenario']?.weights?.monster ?? 3 },
    { actor: cache.id, weight: d['scenario']?.weights?.treasure ?? 2 },
  ];
  return level;
}

export const TRAIT_INFO: Record<EnemyTrait, { label: string; hint: string }> = {
  evasive: { label: 'Evasive', hint: 'Dodges a quarter of your attacks.' },
  brutal: { label: 'Brutal', hint: '20% chance of a double-damage critical hit.' },
  regenerates: { label: 'Regenerates', hint: 'Heals 2 HP after each of its turns.' },
  leech: { label: 'Leech', hint: 'Heals for half the damage it deals.' },
  cowardly: { label: 'Cowardly', hint: 'Runs away below 25% HP (no loot).' },
};

export function defaultEnemyStats(): EnemyStats {
  return { hp: 12, attack: [2, 5], defense: 0, credits: [0, 5], traits: [], intro: '', defeat: '', size: 32 };
}

/** A level actor that stands for a bestiary enemy. */
export function actorFromEnemy(enemy: EnemyDef): ActorDef {
  return { ...newActor('enemy'), name: enemy.name, sprite: '👾', enemyRef: enemy.id, dialogue: [] };
}

/** Copies look and stats from the bestiary onto actors that refer to it (for play). */
export function applyBestiary(level: LevelData, enemies: EnemyDef[] = []): LevelData {
  const byId = new Map(enemies.map((e) => [e.id, e]));
  return {
    ...level,
    actors: level.actors.map((a) => {
      const e = a.enemyRef ? byId.get(a.enemyRef) : undefined;
      if (!e) return a;
      return {
        ...a,
        name: e.name,
        image: e.image,
        hp: e.data.hp,
        attack: e.data.attack,
        defense: e.data.defense,
        traits: e.data.traits,
        creditDrop: e.data.credits,
        introLine: e.data.intro,
        defeatLine: e.data.defeat,
      };
    }),
  };
}
