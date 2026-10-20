import { computed, signal } from '@angular/core';
import { ActorDef, Condition, DialogueChoice, DialogueNode, Effect, LevelData } from '../core/models';
import { createRng } from './rng';
import { ActorInstance, DX, DY, Dir, Scenario, buildScenario, isBlocking, key } from './scenario';

export type RunStatus = 'playing' | 'won' | 'lost';

/** What the dialogue box shows. */
export interface DialogueView {
  speaker: string;
  sprite: string;
  text: string;
  options: string[];
}

interface DialogueContext {
  actor: ActorInstance | null;
  /** null = narration with a single "Continue". */
  choices: DialogueChoice[] | null;
  onClose?: () => void;
}

const VIEW_DEPTH = 7;
const BASE_ATTACK: [number, number] = [2, 6];

/** All state of a single run. UI components read its signals. */
export class GameEngine {
  readonly scenario: Scenario;
  private readonly rng;
  private readonly defs: Map<string, ActorDef>;

  readonly pos = signal({ x: 0, y: 0, dir: 0 as Dir });
  readonly hp = signal(40);
  readonly maxHp = 40;
  readonly credits = signal(0);
  readonly inventory = signal<ActorDef[]>([]);
  readonly flags = signal<ReadonlySet<string>>(new Set());
  readonly status = signal<RunStatus>('playing');
  readonly log = signal<string[]>([]);
  readonly dialogue = signal<DialogueView | null>(null);
  /** Bumped whenever actors or explored cells change so canvases know to redraw. */
  readonly worldVersion = signal(0);
  readonly explored = new Set<string>();
  private context: DialogueContext | null = null;
  /** "Only once" choices already picked, per actor instance. */
  private readonly usedChoices = new Map<number, Set<DialogueChoice>>();

  /** The actor directly in front of the player, if any. */
  readonly facing = computed(() => {
    this.worldVersion();
    const { x, y, dir } = this.pos();
    return this.actorAt(x + DX[dir], y + DY[dir]) ?? null;
  });

  readonly attackPower = computed(() => {
    const bonus = Math.max(0, ...this.inventory().map((i) => i.attackBonus ?? 0));
    return [BASE_ATTACK[0] + bonus, BASE_ATTACK[1] + bonus] as [number, number];
  });

  constructor(readonly level: LevelData, seed: number) {
    this.scenario = buildScenario(level, seed);
    this.defs = new Map(level.actors.map((a) => [a.id, a]));
    this.rng = createRng(seed ^ 0x5eed);
    const { x, y, dir } = this.scenario.start;
    this.pos.set({ x, y, dir });
    this.explore();
    this.say(`Run started (seed ${seed}).`);
    if (level.story.intro.trim()) this.narrate('', '🌃', level.story.intro);
  }

  get busy() {
    return this.status() !== 'playing' || this.dialogue() !== null;
  }

  isWall(x: number, y: number) {
    return this.scenario.walls[y]?.[x] ?? true;
  }

  actorAt(x: number, y: number) {
    return this.scenario.actors.get(key(x, y));
  }

  turn(delta: -1 | 1) {
    if (this.busy) return;
    this.pos.update((p) => ({ ...p, dir: ((p.dir + delta + 4) % 4) as Dir }));
    this.explore();
  }

  /** Moves relative to facing: 0 forward, 1 right, 2 back, 3 left. */
  move(relative: 0 | 1 | 2 | 3): 'moved' | 'wall' | 'actor' | 'busy' {
    if (this.busy) return 'busy';
    const p = this.pos();
    const d = (p.dir + relative) % 4;
    const nx = p.x + DX[d];
    const ny = p.y + DY[d];
    if (this.isWall(nx, ny)) {
      this.say('A wall of concrete and neon blocks the way.');
      return 'wall';
    }
    const actor = this.actorAt(nx, ny);
    if (actor && isBlocking(actor)) {
      if (relative === 0) this.engage(actor);
      else this.say(`${actor.def.name} is in the way.`);
      return 'actor';
    }
    this.pos.set({ ...p, x: nx, y: ny });
    this.explore();
    this.enterCell(nx, ny);
    return 'moved';
  }

  /** Talk to / use whatever is in front of the player. */
  interact() {
    if (this.busy) return;
    const actor = this.facing();
    if (actor) this.engage(actor);
    else this.say('Nothing here but rain.');
  }

  attack() {
    if (this.busy) return;
    const actor = this.facing();
    if (actor?.def.kind !== 'enemy') {
      this.say(actor ? `You can't fight ${actor.def.name}.` : 'You swing at empty air.');
      return;
    }
    actor.hostile = true;
    this.fightRound(actor);
  }

  useItem(index: number) {
    if (this.busy) return;
    const item = this.inventory()[index];
    if (!item?.heal) {
      if (item) this.say(`${item.name}: ${item.attackBonus ? `+${item.attackBonus} attack while carried.` : 'nothing to use it on here.'}`);
      return;
    }
    if (this.hp() === this.maxHp) {
      this.say('You are already at full health.');
      return;
    }
    this.inventory.update((inv) => inv.filter((_, i) => i !== index));
    this.changeHp(item.heal);
    this.say(`You use the ${item.name} (+${item.heal} HP).`);
  }

  choose(index: number) {
    const ctx = this.context;
    if (!ctx) return;
    if (ctx.choices === null || ctx.choices.length === 0) {
      this.closeDialogue();
      return;
    }
    const choice = ctx.choices[index];
    if (!choice) return;
    if (choice.once && ctx.actor) {
      const used = this.usedChoices.get(ctx.actor.uid) ?? new Set();
      this.usedChoices.set(ctx.actor.uid, used.add(choice));
    }
    this.closeDialogue(false);
    for (const effect of choice.effects) this.applyEffect(effect, ctx.actor);
    const next = ctx.actor?.def.dialogue.find((n) => n.id === choice.next);
    if (next && ctx.actor && this.status() === 'playing' && this.dialogue() === null) {
      this.openNode(ctx.actor, next);
    } else if (this.dialogue() === null) {
      ctx.onClose?.();
    }
  }

  // ---- internals ----------------------------------------------------------

  private engage(actor: ActorInstance) {
    if (actor.def.kind === 'enemy' && (actor.hostile || !this.startNode(actor))) {
      actor.hostile = true;
      this.fightRound(actor);
      return;
    }
    const node = this.startNode(actor);
    if (node) this.openNode(actor, node);
    else this.say(`${actor.def.name} has nothing to say.`);
  }

  private startNode(actor: ActorInstance): DialogueNode | undefined {
    return actor.def.dialogue.find((n) => n.text.trim() && this.check(n.requires));
  }

  private openNode(actor: ActorInstance, node: DialogueNode) {
    const used = this.usedChoices.get(actor.uid);
    const choices = node.choices.filter((c) => this.check(c.requires) && !used?.has(c));
    this.context = { actor, choices };
    this.dialogue.set({
      speaker: actor.def.name,
      sprite: actor.def.sprite,
      text: node.text,
      options: choices.length ? choices.map((c) => c.label) : ['[End]'],
    });
  }

  private narrate(speaker: string, sprite: string, text: string, onClose?: () => void) {
    this.context = { actor: null, choices: null, onClose };
    this.dialogue.set({ speaker, sprite, text, options: ['[Continue]'] });
  }

  private closeDialogue(runOnClose = true) {
    const ctx = this.context;
    this.context = null;
    this.dialogue.set(null);
    if (runOnClose) ctx?.onClose?.();
  }

  private check(c?: Condition) {
    if (!c) return true;
    const flags = this.flags();
    if (c.flag && !flags.has(c.flag)) return false;
    if (c.notFlag && flags.has(c.notFlag)) return false;
    if (c.item && !this.inventory().some((i) => i.id === c.item)) return false;
    if (c.minCredits && this.credits() < c.minCredits) return false;
    return true;
  }

  private applyEffect(e: Effect, actor: ActorInstance | null) {
    switch (e.type) {
      case 'setFlag':
        this.flags.update((f) => new Set(f).add(e.flag));
        break;
      case 'clearFlag':
        this.flags.update((f) => {
          const next = new Set(f);
          next.delete(e.flag);
          return next;
        });
        break;
      case 'giveItem':
        this.gainItem(this.defs.get(e.item));
        break;
      case 'takeItem': {
        const inv = this.inventory();
        const i = inv.findIndex((it) => it.id === e.item);
        if (i >= 0) {
          this.inventory.set(inv.filter((_, j) => j !== i));
          this.say(`You hand over the ${inv[i].name}.`);
        }
        break;
      }
      case 'credits':
        this.credits.update((c) => Math.max(0, c + e.amount));
        this.say(e.amount >= 0 ? `+${e.amount} credits.` : `You pay ${-e.amount} credits.`);
        break;
      case 'heal':
        this.changeHp(e.amount);
        break;
      case 'fight':
        if (actor) {
          actor.hostile = true;
          this.say(`${actor.def.name} turns hostile!`);
          this.worldVersion.update((v) => v + 1);
        }
        break;
      case 'remove':
        if (actor) this.removeActor(actor);
        break;
      case 'endLevel':
        this.win();
        break;
    }
  }

  private gainItem(def: ActorDef | undefined) {
    if (!def) return;
    if (def.credits) {
      this.credits.update((c) => c + def.credits!);
      this.say(`${def.name}: +${def.credits} credits.`);
    } else {
      this.inventory.update((inv) => [...inv, def]);
      this.say(`You got: ${def.name}.`);
    }
  }

  private enterCell(x: number, y: number) {
    const actor = this.actorAt(x, y);
    if (actor?.def.kind === 'item') {
      this.removeActor(actor);
      this.gainItem(actor.def);
      const node = this.startNode(actor);
      if (node) this.openNode(actor, node);
    } else if (actor?.def.kind === 'trigger') {
      this.removeActor(actor);
      const node = this.startNode(actor);
      if (node) this.openNode(actor, node);
    }
    const { exit } = this.scenario;
    if (x === exit.x && y === exit.y && this.status() === 'playing') {
      const flag = this.level.story.exitFlag.trim();
      if (flag && !this.flags().has(flag)) {
        if (this.dialogue() === null) this.narrate('', '⛔', this.level.story.exitLockedText || 'The way is blocked.');
      } else {
        this.win();
      }
    }
  }

  private win() {
    if (this.status() !== 'playing') return;
    this.closeDialogue(false);
    this.status.set('won');
    this.say(`Level complete! Credits: ${this.credits()}.`);
  }

  private fightRound(enemy: ActorInstance) {
    const dealt = this.rng.int(...this.attackPower());
    enemy.hp -= dealt;
    if (enemy.hp <= 0) {
      this.say(`You take down ${enemy.def.name} (${dealt} dmg).`);
      this.removeActor(enemy);
      for (const drop of enemy.def.drops ?? []) this.gainItem(this.defs.get(drop));
      if (enemy.def.defeatFlag) this.flags.update((f) => new Set(f).add(enemy.def.defeatFlag!));
      return;
    }
    const [lo, hi] = enemy.def.attack ?? [1, 3];
    const hit = this.rng.int(lo, hi);
    this.say(`You hit ${enemy.def.name} for ${dealt}. It hits back for ${hit}.`);
    this.changeHp(-hit);
    this.worldVersion.update((v) => v + 1);
  }

  private changeHp(delta: number) {
    this.hp.update((hp) => Math.max(0, Math.min(this.maxHp, hp + delta)));
    if (delta < 0 && this.hp() === 0 && this.status() === 'playing') {
      this.closeDialogue(false);
      this.status.set('lost');
      this.say('You flatline on the wet asphalt.');
    }
  }

  private removeActor(actor: ActorInstance) {
    this.scenario.actors.delete(key(actor.x, actor.y));
    this.worldVersion.update((v) => v + 1);
  }

  /** Reveals the cells around the player and down the street ahead. */
  private explore() {
    const { x, y, dir } = this.pos();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.explored.add(key(x + dx, y + dy));
    let cx = x;
    let cy = y;
    for (let i = 0; i < VIEW_DEPTH && !this.isWall(cx, cy); i++) {
      cx += DX[dir];
      cy += DY[dir];
      this.explored.add(key(cx, cy));
      this.explored.add(key(cx + DX[(dir + 1) % 4], cy + DY[(dir + 1) % 4]));
      this.explored.add(key(cx + DX[(dir + 3) % 4], cy + DY[(dir + 3) % 4]));
    }
    this.worldVersion.update((v) => v + 1);
  }

  private say(message: string) {
    this.log.update((log) => [...log.slice(-49), message]);
  }
}
