import { ChangeDetectionStrategy, Component, DestroyRef, WritableSignal, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { GameEngine } from './engine';

interface Floater {
  id: number;
  text: string;
  side: 'enemy' | 'player';
  kind: 'dmg' | 'heal' | 'miss';
}

/**
 * Old-school encounter screen drawn over the street view: a flashing wipe,
 * the enemy up close, HP plates and a FIGHT / TALK / ITEM / RUN menu.
 * The engine drives the beats; this component only animates them.
 */
@Component({
  selector: 'app-battle-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './battle-screen.html',
  styleUrl: './battle-screen.scss',
})
export class BattleScreen {
  readonly engine = input.required<GameEngine>();

  protected readonly battle = computed(() => this.engine().battle());
  protected readonly menu = signal<'main' | 'items'>('main');
  protected readonly canAct = computed(() => this.battle()?.phase === 'menu' && !this.engine().dialogue());
  protected readonly enemyHit = signal(false);
  protected readonly playerHurt = signal(false);
  protected readonly floaters = signal<Floater[]>([]);
  private floaterId = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    effect(() => {
      const fx = this.engine().fx();
      if (!fx) return;
      untracked(() => {
        if (fx.type === 'playerHit') {
          this.pulse(this.enemyHit, 260);
          this.float(`-${fx.amount}`, 'enemy', 'dmg');
        } else if (fx.type === 'enemyHit') {
          this.pulse(this.playerHurt, 420);
          this.float(`-${fx.amount}`, 'player', 'dmg');
        } else if (fx.type === 'heal' && this.battle()) {
          this.float(`+${fx.amount}`, 'player', 'heal');
        } else if (fx.type === 'fail') {
          this.float('blocked!', 'player', 'miss');
        }
      });
    });
    // Back to the main menu whenever a new turn starts.
    effect(() => {
      if (this.battle()?.phase !== 'menu') untracked(() => this.menu.set('main'));
    });
    inject(DestroyRef).onDestroy(() => this.timers.forEach(clearTimeout));
  }

  /** Menu shortcut from the keyboard: 1–4 on the main menu, item number on the item menu. */
  select(n: number) {
    if (!this.canAct()) return;
    if (this.menu() === 'items') {
      if (n === 0) this.menu.set('main');
      else this.useItem(n - 1);
      return;
    }
    [() => this.fight(), () => this.talk(), () => this.openItems(), () => this.run()][n - 1]?.();
  }

  back() {
    this.menu.set('main');
  }

  protected fight() {
    this.engine().battleFight();
  }

  protected talk() {
    this.engine().battleTalk();
  }

  protected openItems() {
    this.menu.set('items');
  }

  protected useItem(i: number) {
    const entry = this.engine().healingItems()[i];
    if (entry) this.engine().battleItem(entry.index);
  }

  protected run() {
    this.engine().battleRun();
  }

  protected percent(value: number, max: number) {
    return `${Math.max(0, Math.round((value / Math.max(1, max)) * 100))}%`;
  }

  private pulse(flag: WritableSignal<boolean>, ms: number) {
    flag.set(true);
    this.timers.push(setTimeout(() => flag.set(false), ms));
  }

  private float(text: string, side: Floater['side'], kind: Floater['kind']) {
    const id = ++this.floaterId;
    this.floaters.update((f) => [...f, { id, text, side, kind }]);
    this.timers.push(setTimeout(() => this.floaters.update((f) => f.filter((x) => x.id !== id)), 900));
  }
}
