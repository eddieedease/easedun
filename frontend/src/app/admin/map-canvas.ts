import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LevelData } from '../core/models';

const ZOOMS = [4, 6, 8, 10, 12, 16, 20, 24, 32];

export const CELL_COLORS: Record<string, string> = {
  '#': '#3a2f63',
  '.': '#141826',
  S: '#13603a',
  E: '#0b5a80',
  '?': '#6b4a00',
};

/** Zoomable canvas grid for painting large maps. Emits cell coordinates; the parent applies the tool. */
@Component({
  selector: 'app-map-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <button class="btn" (click)="zoomBy(-1)" aria-label="Zoom out">−</button>
      <span>{{ cell() }}px</span>
      <button class="btn" (click)="zoomBy(1)" aria-label="Zoom in">+</button>
      <span class="coords">{{ hover() }}</span>
    </div>
    <div class="scroll">
      <canvas
        #canvas
        [width]="data().width * cell()"
        [height]="data().height * cell()"
        (pointerdown)="down($event)"
        (pointermove)="move($event)"
        (pointerup)="painting = false"
        (pointercancel)="painting = false"
        (pointerleave)="hover.set('')"
      ></canvas>
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .bar { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .bar .btn { padding: 0 12px; }
    .coords { margin-left: auto; color: var(--muted); font-size: .85em; }
    .scroll { overflow: auto; max-height: 70vh; border: 1px solid var(--edge-light); background: #000; }
    canvas { display: block; cursor: crosshair; touch-action: none; }
  `,
})
export class MapCanvas {
  readonly data = input.required<LevelData>();
  readonly paint = output<{ x: number; y: number; first: boolean }>();

  protected readonly zoomIndex = signal<number | null>(null);
  protected readonly cell = computed(() => {
    const i = this.zoomIndex();
    if (i !== null) return ZOOMS[i];
    // Default: fit roughly 760px wide.
    const fit = Math.floor(760 / this.data().width);
    return ZOOMS.filter((z) => z <= fit).at(-1) ?? ZOOMS[0];
  });
  protected readonly hover = signal('');
  protected painting = false;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    afterRenderEffect(() => {
      const ctx = this.canvas().nativeElement.getContext('2d');
      if (ctx) draw(ctx, this.data(), this.cell());
    });
  }

  protected zoomBy(step: number) {
    const current = this.zoomIndex() ?? ZOOMS.indexOf(this.cell());
    this.zoomIndex.set(Math.max(0, Math.min(ZOOMS.length - 1, current + step)));
  }

  private cellAt(e: PointerEvent) {
    const c = this.cell();
    const x = Math.floor(e.offsetX / c);
    const y = Math.floor(e.offsetY / c);
    const d = this.data();
    return x >= 0 && y >= 0 && x < d.width && y < d.height ? { x, y } : null;
  }

  protected down(e: PointerEvent) {
    const p = this.cellAt(e);
    if (!p) return;
    this.painting = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    this.paint.emit({ ...p, first: true });
  }

  protected move(e: PointerEvent) {
    const p = this.cellAt(e);
    this.hover.set(p ? `${p.x}, ${p.y}` : '');
    if (p && this.painting) this.paint.emit({ ...p, first: false });
  }
}

function draw(ctx: CanvasRenderingContext2D, d: LevelData, cell: number) {
  ctx.clearRect(0, 0, d.width * cell, d.height * cell);
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      const c = d.rows[y][x];
      ctx.fillStyle = CELL_COLORS[c] ?? '#000';
      ctx.fillRect(x * cell, y * cell, cell, cell);
      if (c !== '#' && c !== '.' && cell >= 10) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${cell * 0.6}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c, x * cell + cell / 2, y * cell + cell / 2 + 1);
      }
    }
  }
  if (cell >= 8) {
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
    ctx.beginPath();
    for (let x = 0; x <= d.width; x++) {
      ctx.moveTo(x * cell + 0.5, 0);
      ctx.lineTo(x * cell + 0.5, d.height * cell);
    }
    for (let y = 0; y <= d.height; y++) {
      ctx.moveTo(0, y * cell + 0.5);
      ctx.lineTo(d.width * cell, y * cell + 0.5);
    }
    ctx.stroke();
  }
  const sprites = new Map(d.actors.map((a) => [a.id, a]));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${cell * 0.8}px serif`;
  for (const p of d.placements) {
    const actor = sprites.get(p.actor);
    const cx = p.x * cell + cell / 2;
    const cy = p.y * cell + cell / 2;
    if (cell >= 10 && actor) {
      ctx.fillText(actor.kind === 'trigger' ? '💬' : actor.sprite, cx, cy + 1);
    } else {
      ctx.fillStyle = actor?.kind === 'enemy' ? '#ff2b6a' : '#00f0ff';
      ctx.fillRect(cx - cell / 4, cy - cell / 4, cell / 2, cell / 2);
    }
  }
}
