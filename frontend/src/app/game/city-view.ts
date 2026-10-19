import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { GameEngine } from './engine';
import { Camera, CityRenderer, VIEW_H, VIEW_W } from './raycaster';
import { THEMES } from './themes';

const MOVE_MS = 220;
const TURN_MS = 200;
const BUMP_MS = 160;
/** The eye sits behind the centre of its cell, like classic crawlers, so a wall ahead isn't in your face. */
const EYE_BACK = 0.35;

const dirAngle = (dir: number) => ((dir - 1) * Math.PI) / 2;
const ease = (t: number) => t * t * (3 - 2 * t);

interface Tween {
  from: { x: number; y: number; angle: number };
  to: { x: number; y: number; angle: number };
  start: number;
  duration: number;
  walking: boolean;
  bump: boolean;
}

/**
 * First-person street view. The engine moves in whole cells; this component
 * animates the camera between them so walking and turning feel smooth.
 */
@Component({
  selector: 'app-city-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas [width]="w" [height]="h" aria-label="First-person view of the street"></canvas>`,
  styles: `
    :host { display: block; background: #000; }
    canvas { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; image-rendering: pixelated; }
  `,
})
export class CityView {
  readonly engine = input.required<GameEngine>();
  /** Fires when an animation finishes, so queued input can run. */
  readonly settled = output<void>();

  protected readonly w = VIEW_W;
  protected readonly h = VIEW_H;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private renderer: CityRenderer | null = null;
  private cam: Camera = { x: 0, y: 0, angle: 0, bob: 0 };
  private target = { x: 0, y: 0, angle: 0 };
  private tween: Tween | null = null;
  private frame = 0;

  constructor() {
    effect(() => {
      const engine = this.engine();
      untracked(() => this.reset(engine));
    });
    // Start a tween whenever the engine position changes.
    effect(() => {
      const p = this.engine().pos();
      untracked(() => this.retarget(p.x, p.y, p.dir));
    });

    const loop = (time: number) => {
      this.frame = requestAnimationFrame(loop);
      this.tick(time);
    };
    this.frame = requestAnimationFrame(loop);
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  get animating() {
    return this.tween !== null;
  }

  /** Small forward nudge when walking into something. */
  bump() {
    if (this.tween) return;
    const t = this.target;
    this.tween = {
      from: { ...t },
      to: { x: t.x + Math.cos(t.angle) * 0.12, y: t.y + Math.sin(t.angle) * 0.12, angle: t.angle },
      start: performance.now(),
      duration: BUMP_MS,
      walking: false,
      bump: true,
    };
  }

  private reset(engine: GameEngine) {
    this.renderer = new CityRenderer(THEMES[engine.level.theme], engine.scenario.seed);
    const p = engine.pos();
    this.target = { x: p.x + 0.5, y: p.y + 0.5, angle: dirAngle(p.dir) };
    this.cam = { ...this.target, bob: 0 };
    this.tween = null;
  }

  private retarget(x: number, y: number, dir: number) {
    const tx = x + 0.5;
    const ty = y + 0.5;
    // Turn the short way round, keeping the angle continuous.
    let delta = dirAngle(dir) - this.target.angle;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const next = { x: tx, y: ty, angle: this.target.angle + delta };
    if (next.x === this.target.x && next.y === this.target.y && next.angle === this.target.angle) return;
    const walking = next.x !== this.target.x || next.y !== this.target.y;
    this.tween = {
      from: { x: this.cam.x, y: this.cam.y, angle: this.cam.angle },
      to: next,
      start: performance.now(),
      duration: walking ? MOVE_MS : TURN_MS,
      walking,
      bump: false,
    };
    this.target = next;
  }

  private tick(time: number) {
    const tw = this.tween;
    if (tw) {
      const raw = Math.min(1, (performance.now() - tw.start) / tw.duration);
      // A bump goes out and comes back.
      const t = tw.bump ? Math.sin(raw * Math.PI) : ease(raw);
      this.cam.x = tw.from.x + (tw.to.x - tw.from.x) * t;
      this.cam.y = tw.from.y + (tw.to.y - tw.from.y) * t;
      this.cam.angle = tw.from.angle + (tw.to.angle - tw.from.angle) * t;
      this.cam.bob = tw.walking ? Math.sin(raw * Math.PI) * 5 : 0;
      if (raw >= 1) {
        if (tw.bump) Object.assign(this.cam, tw.from);
        this.tween = null;
        this.settled.emit();
      }
    }
    const ctx = this.canvas().nativeElement.getContext('2d');
    const engine = this.engine();
    if (!ctx || !this.renderer) return;
    const s = engine.scenario;
    const eye = {
      ...this.cam,
      x: this.cam.x - Math.cos(this.cam.angle) * EYE_BACK,
      y: this.cam.y - Math.sin(this.cam.angle) * EYE_BACK,
    };
    this.renderer.render(ctx, { walls: s.walls, width: s.width, height: s.height, actors: s.actors.values(), exit: s.exit }, eye, time);
  }
}
