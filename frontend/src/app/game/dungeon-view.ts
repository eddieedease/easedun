import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  viewChild,
} from '@angular/core';
import { GameEngine } from './engine';
import { DX, DY } from './scenario';

// Internal resolution; the canvas is scaled up with pixelated rendering for a retro look.
const W = 400;
const H = 250;
const FOCAL = (W / 2) / Math.tan((62 * Math.PI) / 180 / 2);
const MAX_DEPTH = 6;
/** Camera sits behind the centre of its cell so the side walls of the current cell are visible. */
const CAM_BACK = 0.6;
const NEAR = 0.05;

type Pt = [number, number];

/**
 * First-person view in the style of classic grid crawlers.
 * Cells are drawn back-to-front (painter's algorithm) with a simple perspective projection.
 */
@Component({
  selector: 'app-dungeon-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas [width]="w" [height]="h" aria-label="First-person view of the dungeon"></canvas>`,
  styles: `
    :host { display: block; background: #000; }
    canvas { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; image-rendering: pixelated; }
  `,
})
export class DungeonView {
  readonly engine = input.required<GameEngine>();
  protected readonly w = W;
  protected readonly h = H;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    afterRenderEffect(() => {
      const engine = this.engine();
      engine.worldVersion();
      const pos = engine.pos();
      const ctx = this.canvas().nativeElement.getContext('2d');
      if (ctx) draw(ctx, engine, pos.x, pos.y, pos.dir);
    });
  }
}

function project(x: number, z: number, y: number): Pt {
  const zz = Math.max(z, NEAR);
  return [W / 2 + (x * FOCAL) / zz, H / 2 + (y * FOCAL) / zz];
}

/** Fog: 1 near the party, fading to 0 in the distance. */
function light(z: number) {
  return Math.max(0, Math.min(1, 1.35 - z / (MAX_DEPTH - 0.5)));
}

function shade([r, g, b]: number[], l: number) {
  return `rgb(${Math.round(r * l)},${Math.round(g * l)},${Math.round(b * l)})`;
}

function poly(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string, stroke?: string) {
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  for (const p of pts.slice(1)) ctx.lineTo(...p);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

/** Clips a horizontal segment (x0,z0)-(x1,z1) to the near plane. */
function clip(x0: number, z0: number, x1: number, z1: number): [number, number, number, number] | null {
  if (z0 < NEAR && z1 < NEAR) return null;
  if (z0 < NEAR) {
    const t = (NEAR - z0) / (z1 - z0);
    return [x0 + (x1 - x0) * t, NEAR, x1, z1];
  }
  if (z1 < NEAR) {
    const t = (NEAR - z1) / (z0 - z1);
    return [x0, z0, x1 + (x0 - x1) * t, NEAR];
  }
  return [x0, z0, x1, z1];
}

const WALL = [118, 112, 128];
const WALL_SIDE = [92, 86, 102];
const MORTAR = 'rgba(0,0,0,0.35)';

/** Draws a vertical wall face between two floor points, with a brick pattern. */
function wallFace(ctx: CanvasRenderingContext2D, x0: number, z0: number, x1: number, z1: number, base: number[]) {
  const c = clip(x0, z0, x1, z1);
  if (!c) return;
  [x0, z0, x1, z1] = c;
  const l = light((z0 + z1) / 2);
  poly(ctx, [project(x0, z0, -0.5), project(x1, z1, -0.5), project(x1, z1, 0.5), project(x0, z0, 0.5)], shade(base, l));

  ctx.strokeStyle = MORTAR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const rows = 5;
  for (let r = 1; r < rows; r++) {
    const y = -0.5 + r / rows;
    ctx.moveTo(...project(x0, z0, y));
    ctx.lineTo(...project(x1, z1, y));
  }
  for (let r = 0; r < rows; r++) {
    const yTop = -0.5 + r / rows;
    const yBot = yTop + 1 / rows;
    for (const u of r % 2 ? [0.25, 0.75] : [0.5]) {
      const x = x0 + (x1 - x0) * u;
      const z = z0 + (z1 - z0) * u;
      ctx.moveTo(...project(x, z, yTop));
      ctx.lineTo(...project(x, z, yBot));
    }
  }
  ctx.stroke();
}

function floorAndCeiling(ctx: CanvasRenderingContext2D, cx: number, cz: number) {
  const zn = Math.max(cz - 0.5, NEAR);
  const zf = cz + 0.5;
  const l = light(cz);
  const floor: Pt[] = [project(cx - 0.5, zn, 0.5), project(cx + 0.5, zn, 0.5), project(cx + 0.5, zf, 0.5), project(cx - 0.5, zf, 0.5)];
  const ceil: Pt[] = [project(cx - 0.5, zn, -0.5), project(cx + 0.5, zn, -0.5), project(cx + 0.5, zf, -0.5), project(cx - 0.5, zf, -0.5)];
  poly(ctx, floor, shade([84, 74, 64], l), shade([40, 34, 30], l));
  poly(ctx, ceil, shade([44, 40, 48], l), shade([24, 22, 28], l));
}

function sprite(ctx: CanvasRenderingContext2D, icon: string, cx: number, cz: number, size: number, yOffset = 0.1) {
  const [sx, sy] = project(cx, cz, yOffset);
  const px = (size * FOCAL) / cz;
  ctx.globalAlpha = Math.max(0.25, light(cz));
  ctx.font = `${px}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, sx, sy);
  ctx.globalAlpha = 1;
}

function exitPortal(ctx: CanvasRenderingContext2D, cx: number, cz: number) {
  const [sx, sy] = project(cx, cz, 0.5);
  const rx = (0.32 * FOCAL) / cz;
  const ry = (0.1 * FOCAL) / cz;
  const g = ctx.createRadialGradient(sx, sy, 1, sx, sy, rx);
  g.addColorStop(0, 'rgba(160,220,255,0.95)');
  g.addColorStop(1, 'rgba(40,90,200,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  sprite(ctx, '✨', cx, cz, 0.25, 0.2);
}

function draw(ctx: CanvasRenderingContext2D, engine: GameEngine, px: number, py: number, dir: number) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Unit vectors in grid space for "forward" and "right" relative to facing.
  const fx = DX[dir];
  const fy = DY[dir];
  const rx = DX[(dir + 1) % 4];
  const ry = DY[(dir + 1) % 4];
  const { exit } = engine.scenario;

  for (let f = MAX_DEPTH; f >= 0; f--) {
    const z = f + CAM_BACK;
    const width = f + 2;
    // Outside columns first so nearer-to-centre faces overlap them.
    const laterals: number[] = [];
    for (let r = width; r >= 1; r--) laterals.push(-r, r);
    laterals.push(0);

    for (const r of laterals) {
      const gx = px + fx * f + rx * r;
      const gy = py + fy * f + ry * r;
      if (engine.isWall(gx, gy)) {
        if (f > 0) wallFace(ctx, r - 0.5, z - 0.5, r + 0.5, z - 0.5, WALL);
        if (r < 0) wallFace(ctx, r + 0.5, z - 0.5, r + 0.5, z + 0.5, WALL_SIDE);
        if (r > 0) wallFace(ctx, r - 0.5, z + 0.5, r - 0.5, z - 0.5, WALL_SIDE);
        continue;
      }
      floorAndCeiling(ctx, r, z);
      if (gx === exit.x && gy === exit.y) exitPortal(ctx, r, z);
      const enc = engine.encounterAt(gx, gy);
      if (f === 0 || !enc) continue;
      if (enc.kind === 'monster') sprite(ctx, enc.type.icon, r, z, 0.55);
      else if (enc.kind === 'treasure') sprite(ctx, '💰', r, z, 0.3, 0.32);
      else if (enc.revealed) sprite(ctx, '⚙️', r, z, 0.22, 0.4);
    }
  }

  // Warm torchlight vignette.
  const g = ctx.createRadialGradient(W / 2, H * 0.7, H * 0.2, W / 2, H / 2, W * 0.75);
  g.addColorStop(0, 'rgba(255,170,80,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
