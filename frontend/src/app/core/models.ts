export type Role = 'admin' | 'player';

export interface User {
  id: number;
  username: string;
  role: Role;
}

/** Grid cells: '#' building, '.' street, 'S' possible start, 'E' possible exit, '?' random spot. */
export type CellChar = '#' | '.' | 'S' | 'E' | '?';

export type ThemeId = 'neon-night' | 'acid-rain' | 'corpo' | 'rust-slums';

export type ActorKind = 'npc' | 'enemy' | 'item' | 'terminal' | 'trigger';

/** A gate on a dialogue node or choice. All set fields must hold. */
export interface Condition {
  flag?: string;
  notFlag?: string;
  /** Actor id of an item that must be in the inventory. */
  item?: string;
  minCredits?: number;
}

export type Effect =
  | { type: 'setFlag'; flag: string }
  | { type: 'clearFlag'; flag: string }
  | { type: 'giveItem'; item: string }
  | { type: 'takeItem'; item: string }
  | { type: 'credits'; amount: number }
  | { type: 'heal'; amount: number }
  | { type: 'fight' }
  | { type: 'remove' }
  | { type: 'endLevel' };

export type EffectType = Effect['type'];

export interface DialogueChoice {
  label: string;
  /** Node to jump to; empty closes the conversation. */
  next: string;
  requires?: Condition;
  effects: Effect[];
  /** Hide this choice after it has been picked once (per character, per run). */
  once?: boolean;
}

export interface DialogueNode {
  id: string;
  text: string;
  /** Start nodes are tried top to bottom; the first one whose condition holds opens the conversation. */
  requires?: Condition;
  choices: DialogueChoice[];
}

/**
 * Everything that can stand on a street cell: people, enemies, pick-ups,
 * terminals and invisible story triggers. Defined once in the level's library,
 * then placed on the map or put in the random pool.
 */
export interface ActorDef {
  id: string;
  name: string;
  kind: ActorKind;
  /** Emoji (placeholder art). */
  sprite: string;
  dialogue: DialogueNode[];
  // Enemies
  hp?: number;
  attack?: [number, number];
  hostile?: boolean;
  /** Item actor ids dropped on defeat. */
  drops?: string[];
  /** Flag set on defeat, handy for story progress. */
  defeatFlag?: string;
  // Items
  heal?: number;
  attackBonus?: number;
  /** Credits added on pickup instead of going into the inventory. */
  credits?: number;
}

export interface Placement {
  x: number;
  y: number;
  actor: string;
}

export interface StoryConfig {
  intro: string;
  outro: string;
  /** If set, the exit only works once this flag is set. */
  exitFlag: string;
  exitLockedText: string;
}

export interface LevelData {
  version: 2;
  width: number;
  height: number;
  rows: string[];
  theme: ThemeId;
  story: StoryConfig;
  actors: ActorDef[];
  placements: Placement[];
  /** Chance (0–1) that a '?' cell spawns something from the random pool. */
  spawnChance: number;
  randomPool: { actor: string; weight: number }[];
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
