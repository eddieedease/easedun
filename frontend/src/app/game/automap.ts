import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { GameEngine } from './engine';
import { key } from './scenario';

const SIZE = 240;
const ZOOMS = [6, 9, 12, 16, 22, 30];
const MARKS: Record<string, [string, string]> = {
  npc: ['●', '#00b8d4'],
  enemy: ['!', '#ff2b6a'],
  item: ['◆', '#d4a000'],
  terminal: ['▣', '#8a5cff'],
};

/**
 * Automap that only shows explored cells. "Fit" zooms out as the explored
 * area grows; the +/- buttons switch to a fixed zoom centred on the player.
 */
@Component({
  selector: 'app-automap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas #canvas [width]="size" [height]="size" aria-label="Map of explored area"></canvas>
    <div class="zoom">
      <button class="btn" (click)="zoomBy(-1)" title="Zoom out" aria-label="Zoom out">−</button>
      <button class="btn" (click)="zoom.set(null)" [class.active]="zoom() === null" title="Fit explored area">Fit</button>
      <button class="btn" (click)="zoomBy(1)" title="Zoom in" aria-label="Zoom in">+</button>
    </div>
  `,
  styles: `
    :host { display: block; }
    canvas { display: block; width: 100%; height: auto; aspect-ratio: 1; image-rendering: pixelated; }
    .zoom { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 4px; margin-top: 6px; }
    .zoom .btn { padding: 2px 0; }
    .zoom .active { border-color: var(--neon-cyan); }
  `,
})
export class Automap {
  readonly engine = input.required<GameEngine>();
  protected readonly size = SIZE;
  /** Cell size in pixels, or null to fit the explored area. */
  protected readonly zoom = signal<number | null>(null);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private lastFit = 12;

  constructor() {
    afterRenderEffect(() => {
      const engine = this.engine();
      engine.worldVersion();
      const pos = engine.pos();
      const zoom = this.zoom();
      const ctx = this.canvas().nativeElement.getContext('2d');
      if (ctx) this.lastFit = drawMap(ctx, engine, pos.x, pos.y, pos.dir, zoom);
    });
  }

  protected zoomBy(step: 1 | -1) {
    const current = this.zoom() ?? this.lastFit;
    const idx = ZOOMS.findIndex((z) => z >= current);
    const base = idx === -1 ? ZOOMS.length - 1 : idx;
    this.zoom.set(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, base + step))]);
  }
}

/** Draws the map and returns the cell size used. */
function drawMap(ctx: CanvasRenderingContext2D, engine: GameEngine, px: number, py: number, dir: number, zoom: number | null) {
  const { width, height, exit, actors } = engine.scenario;
  const cells: [number, number][] = [];
  let minX = px, maxX = px, minY = py, maxY = py;
  for (const k of engine.explored) {
    const [x, y] = k.split(',').map(Number);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    cells.push([x, y]);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }

  let cell: number;
  let offX: number;
  let offY: number;
  if (zoom === null) {
    const span = Math.max(9, maxX - minX + 1, maxY - minY + 1) + 1;
    cell = Math.max(3, Math.floor(SIZE / span));
    offX = Math.floor((SIZE - (maxX - minX + 1) * cell) / 2) - minX * cell;
    offY = Math.floor((SIZE - (maxY - minY + 1) * cell) / 2) - minY * cell;
  } else {
    cell = zoom;
    offX = Math.floor(SIZE / 2 - (px + 0.5) * cell);
    offY = Math.floor(SIZE / 2 - (py + 0.5) * cell);
  }

  ctx.fillStyle = '#05040b';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.max(7, cell * 0.75)}px monospace`;

  for (const [x, y] of cells) {
    const sx = offX + x * cell;
    const sy = offY + y * cell;
    if (sx < -cell || sy < -cell || sx > SIZE || sy > SIZE) continue;
    if (engine.isWall(x, y)) {
      ctx.fillStyle = '#2a1f4a';
      ctx.fillRect(sx, sy, cell, cell);
      ctx.strokeStyle = 'rgba(255, 43, 214, 0.35)';
      ctx.strokeRect(sx + 0.5, sy + 0.5, cell - 1, cell - 1);
      continue;
    }
    ctx.fillStyle = '#121624';
    ctx.fillRect(sx, sy, cell, cell);

    const actor = actors.get(key(x, y));
    const mark = x === exit.x && y === exit.y ? (['▼', '#00f0ff'] as const) : actor ? MARKS[actor.def.kind] : undefined;
    if (mark) {
      ctx.fillStyle = mark[1];
      ctx.fillText(mark[0], sx + cell / 2, sy + cell / 2 + 1);
    }
  }

  // Player arrow.
  ctx.save();
  ctx.translate(offX + px * cell + cell / 2, offY + py * cell + cell / 2);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.fillStyle = '#f5f000';
  ctx.shadowColor = '#f5f000';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(0, -cell * 0.42);
  ctx.lineTo(cell * 0.34, cell * 0.34);
  ctx.lineTo(0, cell * 0.16);
  ctx.lineTo(-cell * 0.34, cell * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  return cell;
}
