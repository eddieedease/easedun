import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  viewChild,
} from '@angular/core';
import { GameEngine } from './engine';
import { key } from './scenario';

const SIZE = 220;
const MIN_SPAN = 7;

/**
 * Parchment automap that only shows explored cells.
 * It zooms out as the explored area grows, so the map "expands as you go".
 */
@Component({
  selector: 'app-automap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas [width]="size" [height]="size" aria-label="Map of explored area"></canvas>`,
  styles: `
    :host { display: block; }
    canvas { display: block; width: 100%; height: auto; aspect-ratio: 1; image-rendering: pixelated; }
  `,
})
export class Automap {
  readonly engine = input.required<GameEngine>();
  protected readonly size = SIZE;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    afterRenderEffect(() => {
      const engine = this.engine();
      engine.worldVersion();
      const pos = engine.pos();
      const ctx = this.canvas().nativeElement.getContext('2d');
      if (ctx) drawMap(ctx, engine, pos.x, pos.y, pos.dir);
    });
  }
}

function drawMap(ctx: CanvasRenderingContext2D, engine: GameEngine, px: number, py: number, dir: number) {
  const { width, height, exit } = engine.scenario;
  let minX = px, maxX = px, minY = py, maxY = py;
  for (const k of engine.explored) {
    const [x, y] = k.split(',').map(Number);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const span = Math.max(MIN_SPAN, maxX - minX + 1, maxY - minY + 1) + 1;
  const cell = Math.floor(SIZE / span);
  const offX = Math.floor((SIZE - (maxX - minX + 1) * cell) / 2) - minX * cell;
  const offY = Math.floor((SIZE - (maxY - minY + 1) * cell) / 2) - minY * cell;

  ctx.fillStyle = '#c9b38a';
  ctx.fillRect(0, 0, SIZE, SIZE);

  for (const k of engine.explored) {
    const [x, y] = k.split(',').map(Number);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const sx = offX + x * cell;
    const sy = offY + y * cell;
    if (engine.isWall(x, y)) {
      ctx.fillStyle = '#5a4630';
      ctx.fillRect(sx, sy, cell, cell);
      continue;
    }
    ctx.fillStyle = '#e8d8b0';
    ctx.fillRect(sx, sy, cell, cell);
    ctx.strokeStyle = 'rgba(90,70,48,0.25)';
    ctx.strokeRect(sx + 0.5, sy + 0.5, cell - 1, cell - 1);

    const enc = engine.scenario.encounters.get(key(x, y));
    let mark = '';
    if (x === exit.x && y === exit.y) mark = '▼';
    else if (enc?.kind === 'monster') mark = '!';
    else if (enc?.kind === 'treasure') mark = '$';
    else if (enc?.kind === 'trap' && enc.revealed) mark = '^';
    if (mark) {
      ctx.fillStyle = mark === '!' ? '#a02818' : mark === '▼' ? '#1e4fa0' : '#5a4630';
      ctx.font = `bold ${Math.max(8, cell * 0.7)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mark, sx + cell / 2, sy + cell / 2 + 1);
    }
  }

  // Party arrow.
  const cx = offX + px * cell + cell / 2;
  const cy = offY + py * cell + cell / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.fillStyle = '#c8501e';
  ctx.beginPath();
  ctx.moveTo(0, -cell * 0.4);
  ctx.lineTo(cell * 0.32, cell * 0.32);
  ctx.lineTo(0, cell * 0.15);
  ctx.lineTo(-cell * 0.32, cell * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
