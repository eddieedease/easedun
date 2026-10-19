import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  numberAttribute,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Auth } from '../core/auth';
import { Automap } from '../game/automap';
import { DungeonView } from '../game/dungeon-view';
import { GameEngine } from '../game/engine';
import { randomSeed } from '../game/rng';

const KEYS: Record<string, (e: GameEngine) => void> = {
  ArrowUp: (e) => e.move(0),
  w: (e) => e.move(0),
  ArrowDown: (e) => e.move(2),
  s: (e) => e.move(2),
  a: (e) => e.move(3),
  d: (e) => e.move(1),
  ArrowLeft: (e) => e.turn(-1),
  q: (e) => e.turn(-1),
  ArrowRight: (e) => e.turn(1),
  e: (e) => e.turn(1),
  h: (e) => e.drinkPotion(),
};

@Component({
  selector: 'app-play',
  imports: [DungeonView, Automap, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  templateUrl: './play.html',
  styleUrl: './play.scss',
})
export class PlayPage {
  private readonly api = inject(Api);
  protected readonly auth = inject(Auth);

  /** Route param, bound via withComponentInputBinding. */
  readonly id = input.required({ transform: numberAttribute });
  /** Optional ?seed= query param to replay a specific scenario. */
  readonly seed = input(undefined, { transform: (v: string | undefined) => (v ? Number(v) : undefined) });

  protected readonly level = resource({
    params: () => ({ id: this.id() }),
    loader: ({ params }) => this.api.level(params.id),
  });

  protected readonly engine = signal<GameEngine | null>(null);
  protected readonly lastLog = computed(() => this.engine()?.log().slice(-6) ?? []);

  constructor() {
    effect(() => {
      const level = this.level.value();
      const seed = this.seed() ?? randomSeed();
      // The engine reads its own signals while setting up; don't let this effect track them.
      if (level) untracked(() => this.engine.set(new GameEngine(level.data, seed)));
    });
  }

  protected restart(sameSeed: boolean) {
    const level = this.level.value();
    const current = this.engine();
    if (level && current) {
      this.engine.set(new GameEngine(level.data, sameSeed ? current.scenario.seed : randomSeed()));
    }
  }

  protected onKey(event: KeyboardEvent) {
    const engine = this.engine();
    const target = event.target;
    if (!engine) return;
    if (target instanceof Element && target.closest('input, textarea, select')) return;
    const action = KEYS[event.key] ?? KEYS[event.key.toLowerCase()];
    if (action) {
      event.preventDefault();
      action(engine);
    }
  }

  protected message(e: unknown) {
    return errorMessage(e);
  }

  protected hpPercent(hp: number, max: number) {
    return `${Math.round((hp / max) * 100)}%`;
  }
}
