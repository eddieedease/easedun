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
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Auth } from '../core/auth';
import { Automap } from '../game/automap';
import { CityView } from '../game/city-view';
import { DialogueBox } from '../game/dialogue-box';
import { GameEngine } from '../game/engine';
import { KIND_LABELS, normalizeLevel } from '../game/level-format';
import { randomSeed } from '../game/rng';

type Action = (e: GameEngine) => void;
type Command = 'forward' | 'back' | 'strafeLeft' | 'strafeRight' | 'turnLeft' | 'turnRight' | 'talk' | 'attack';

const KEYS: Record<string, Command> = {
  arrowup: 'forward',
  w: 'forward',
  arrowdown: 'back',
  s: 'back',
  a: 'strafeLeft',
  d: 'strafeRight',
  arrowleft: 'turnLeft',
  q: 'turnLeft',
  arrowright: 'turnRight',
  e: 'turnRight',
  f: 'talk',
  ' ': 'talk',
  x: 'attack',
};

@Component({
  selector: 'app-play',
  imports: [CityView, Automap, DialogueBox, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  templateUrl: './play.html',
  styleUrl: './play.scss',
})
export class PlayPage {
  private readonly api = inject(Api);
  protected readonly auth = inject(Auth);
  protected readonly kindLabels = KIND_LABELS;

  /** Route param, bound via withComponentInputBinding. */
  readonly id = input.required({ transform: numberAttribute });
  /** Optional ?seed= query param to replay a specific scenario. */
  readonly seed = input(undefined, { transform: (v: string | undefined) => (v ? Number(v) : undefined) });

  protected readonly level = resource({
    params: () => ({ id: this.id() }),
    loader: async ({ params }) => {
      const level = await this.api.level(params.id);
      return { ...level, data: normalizeLevel(level.data) };
    },
  });

  protected readonly engine = signal<GameEngine | null>(null);
  protected readonly lastLog = computed(() => this.engine()?.log().slice(-7) ?? []);
  protected readonly emptySlots = computed(() => Array.from({ length: Math.max(0, 8 - (this.engine()?.inventory().length ?? 0)) }));
  private readonly view = viewChild(CityView);
  private readonly dialogueBox = viewChild(DialogueBox);
  /** One queued action while an animation is playing, so held keys keep walking smoothly. */
  private queued: Action | null = null;

  constructor() {
    effect(() => {
      const level = this.level.value();
      const seed = this.seed() ?? randomSeed();
      // The engine reads its own signals while setting up; don't let this effect track them.
      if (level) untracked(() => this.engine.set(new GameEngine(level.data, seed)));
    });
  }

  protected act(action: Action) {
    const engine = this.engine();
    if (!engine) return;
    if (this.view()?.animating) {
      this.queued = action;
      return;
    }
    action(engine);
  }

  protected onSettled() {
    const engine = this.engine();
    const next = this.queued;
    this.queued = null;
    if (engine && next) next(engine);
  }

  protected command(cmd: Command) {
    const walk = (relative: 0 | 1 | 2 | 3) => (e: GameEngine) => {
      // Walked into a wall: a little bump so it doesn't feel like a dead key.
      if (e.move(relative) === 'wall') this.view()?.bump();
    };
    const actions: Record<Command, Action> = {
      forward: walk(0),
      strafeRight: walk(1),
      back: walk(2),
      strafeLeft: walk(3),
      turnLeft: (e) => e.turn(-1),
      turnRight: (e) => e.turn(1),
      talk: (e) => e.interact(),
      attack: (e) => e.attack(),
    };
    this.act(actions[cmd]);
  }

  protected restart(sameSeed: boolean) {
    const level = this.level.value();
    const current = this.engine();
    if (level && current) {
      this.queued = null;
      this.engine.set(new GameEngine(level.data, sameSeed ? current.scenario.seed : randomSeed()));
    }
  }

  protected onKey(event: KeyboardEvent) {
    const engine = this.engine();
    const target = event.target;
    if (!engine || event.ctrlKey || event.metaKey || event.altKey) return;
    if (target instanceof Element && target.closest('input, textarea, select')) return;
    const k = event.key.toLowerCase();

    if (engine.dialogue()) {
      const box = this.dialogueBox();
      if (box && !box.done() && (k === ' ' || k === 'enter')) {
        box.skip();
      } else if (/^[1-9]$/.test(k)) {
        engine.choose(Number(k) - 1);
      } else if ((k === ' ' || k === 'enter') && engine.dialogue()!.options.length === 1) {
        engine.choose(0);
      } else {
        return;
      }
      event.preventDefault();
      return;
    }

    const cmd = KEYS[k];
    if (cmd) {
      event.preventDefault();
      this.command(cmd);
    } else if (/^[1-9]$/.test(k)) {
      engine.useItem(Number(k) - 1);
    }
  }

  protected message(e: unknown) {
    return errorMessage(e);
  }

  protected percent(value: number, max: number) {
    return `${Math.max(0, Math.round((value / max) * 100))}%`;
  }
}
