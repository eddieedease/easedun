import { computed, signal } from '@angular/core';
import { LevelData } from '../core/models';
import { createRng } from './rng';
import { DX, DY, Dir, Scenario, buildScenario, key } from './scenario';

export interface Hero {
  name: string;
  cls: string;
  icon: string;
  hp: number;
  maxHp: number;
  attack: [number, number];
}

export type RunStatus = 'playing' | 'won' | 'lost';

const VIEW_DEPTH = 5;

/** All state of a single run. UI components read its signals. */
export class GameEngine {
  readonly scenario: Scenario;
  private readonly rng;

  readonly pos = signal({ x: 0, y: 0, dir: 0 as Dir });
  readonly party = signal<Hero[]>([
    { name: 'Brakka', cls: 'Fighter', icon: '🛡️', hp: 30, maxHp: 30, attack: [3, 7] },
    { name: 'Ysolde', cls: 'Ranger', icon: '🏹', hp: 22, maxHp: 22, attack: [2, 6] },
    { name: 'Mordu', cls: 'Mage', icon: '🔮', hp: 16, maxHp: 16, attack: [4, 8] },
    { name: 'Pip', cls: 'Thief', icon: '🗡️', hp: 18, maxHp: 18, attack: [2, 5] },
  ]);
  readonly gold = signal(0);
  readonly potions = signal(1);
  readonly steps = signal(0);
  readonly status = signal<RunStatus>('playing');
  readonly log = signal<string[]>([]);
  /** Bumped whenever cells/encounters change so canvases know to redraw. */
  readonly worldVersion = signal(0);
  readonly explored = new Set<string>();

  readonly alive = computed(() => this.party().filter((h) => h.hp > 0));

  constructor(level: LevelData, seed: number) {
    this.scenario = buildScenario(level, seed);
    this.rng = createRng(seed ^ 0x5eed);
    const { x, y, dir } = this.scenario.start;
    this.pos.set({ x, y, dir });
    this.explore();
    this.say(`You descend into the dungeon. (seed ${seed})`);
  }

  isWall(x: number, y: number) {
    return this.scenario.walls[y]?.[x] ?? true;
  }

  encounterAt(x: number, y: number) {
    return this.scenario.encounters.get(key(x, y));
  }

  turn(delta: -1 | 1) {
    if (this.status() !== 'playing') return;
    this.pos.update((p) => ({ ...p, dir: ((p.dir + delta + 4) % 4) as Dir }));
    this.explore();
  }

  /** Moves relative to facing: 0 forward, 1 right, 2 back, 3 left. */
  move(relative: 0 | 1 | 2 | 3) {
    if (this.status() !== 'playing') return;
    const p = this.pos();
    const d = (p.dir + relative) % 4;
    const nx = p.x + DX[d];
    const ny = p.y + DY[d];
    if (this.isWall(nx, ny)) {
      this.say('Solid stone blocks the way.');
      return;
    }
    const enc = this.encounterAt(nx, ny);
    if (enc?.kind === 'monster') {
      this.fight(nx, ny);
      return;
    }
    this.pos.set({ ...p, x: nx, y: ny });
    this.steps.update((s) => s + 1);
    this.explore();
    this.enterCell(nx, ny);
  }

  drinkPotion() {
    if (this.status() !== 'playing' || this.potions() < 1) return;
    const wounded = this.alive().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!wounded || wounded.hp === wounded.maxHp) {
      this.say('Nobody needs healing.');
      return;
    }
    this.potions.update((n) => n - 1);
    this.damage(wounded, -12);
    this.say(`${wounded.name} drinks a potion and feels better.`);
  }

  private enterCell(x: number, y: number) {
    const enc = this.encounterAt(x, y);
    if (enc?.kind === 'treasure') {
      this.gold.update((g) => g + enc.gold);
      if (enc.potion) this.potions.update((n) => n + 1);
      this.say(`You find ${enc.gold} gold${enc.potion ? ' and a healing potion' : ''}!`);
      this.removeEncounter(x, y);
    } else if (enc?.kind === 'trap' && !enc.revealed) {
      enc.revealed = true;
      const victim = this.rng.pick(this.alive());
      this.damage(victim, enc.damage);
      this.say(`A trap springs! ${victim.name} takes ${enc.damage} damage.`);
      this.worldVersion.update((v) => v + 1);
    }
    const { exit } = this.scenario;
    if (x === exit.x && y === exit.y && this.status() === 'playing') {
      this.status.set('won');
      this.say(`You found the stairs down! Gold: ${this.gold()}, steps: ${this.steps()}.`);
    }
  }

  private fight(x: number, y: number) {
    const enc = this.encounterAt(x, y);
    if (enc?.kind !== 'monster') return;
    // The front two living heroes strike.
    let dealt = 0;
    for (const hero of this.alive().slice(0, 2)) {
      dealt += this.rng.int(...hero.attack);
    }
    enc.hp -= dealt;
    if (enc.hp <= 0) {
      const loot = this.rng.int(...enc.type.gold);
      this.gold.update((g) => g + loot);
      this.removeEncounter(x, y);
      this.say(`You slay the ${enc.type.name} and loot ${loot} gold.`);
      return;
    }
    const victim = this.rng.pick(this.alive());
    const hit = this.rng.int(...enc.type.attack);
    this.damage(victim, hit);
    this.say(`You hit the ${enc.type.name} for ${dealt}. It strikes ${victim.name} for ${hit}.`);
    this.worldVersion.update((v) => v + 1);
  }

  private damage(target: Hero, amount: number) {
    this.party.update((party) =>
      party.map((h) => (h === target ? { ...h, hp: Math.max(0, Math.min(h.maxHp, h.hp - amount)) } : h)),
    );
    const fallen = this.party().find((h) => h.name === target.name && h.hp === 0);
    if (fallen) this.say(`${fallen.name} has fallen!`);
    if (this.alive().length === 0) {
      this.status.set('lost');
      this.say('Your party has perished. The dungeon claims another band of heroes.');
    }
  }

  private removeEncounter(x: number, y: number) {
    this.scenario.encounters.delete(key(x, y));
    this.worldVersion.update((v) => v + 1);
  }

  /** Reveals the cells around the party and down the corridor ahead. */
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
