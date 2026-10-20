import { ActorInstance, isHidden } from './scenario';
import { City, TEX_W, buildCity, faceColumn, sampleFacade } from './city';
import { pack, skyline } from './textures';
import { Theme } from './themes';

export const VIEW_W = 480;
export const VIEW_H = 300;
const PLANE = 0.66; // half-width of the camera plane => ~67° FOV
const PROJ = VIEW_W / 2 / PLANE;
const EYE = 0.18; // eye height in cells (~1.8 m if a cell is ~10 m)
const SPRITE_SIZE = 0.26; // a bit taller than a real person, so faces stay readable

export interface Camera {
  x: number;
  y: number;
  angle: number;
  /** Vertical horizon offset in pixels (head bob). */
  bob: number;
}

export interface WorldView {
  walls: boolean[][];
  width: number;
  height: number;
  actors: Iterable<ActorInstance>;
  exit: { x: number; y: number };
}

interface Drop {
  x: number;
  y: number;
  speed: number;
  len: number;
}

/**
 * Wolfenstein-style raycaster tuned for a city: tall textured buildings,
 * an open sky with skyline, wet streets with sidewalks, fog and rain.
 */
export class CityRenderer {
  private readonly image: ImageData;
  private readonly buf: Uint32Array;
  private readonly zbuf = new Float32Array(VIEW_W);
  private readonly city: City;
  private readonly glowOut = new Uint8Array(1);
  private readonly wallGrid: Uint8Array;
  private readonly gridW: number;
  private readonly gridH: number;
  private readonly puddles = makePuddles();
  /** First screen row of street per column (rows above are sky or buildings). */
  private readonly floorStart = new Int16Array(VIEW_W);
  private time = 0;
  private readonly skyline: Float32Array;
  private readonly fogPacked: number;
  private readonly rain: Drop[] = [];
  private lastTime = 0;

  constructor(private readonly theme: Theme, seed: number, walls: boolean[][], width: number, height: number) {
    this.image = new ImageData(VIEW_W, VIEW_H);
    this.buf = new Uint32Array(this.image.data.buffer);
    this.city = buildCity(walls, width, height, theme, seed);
    this.gridW = width;
    this.gridH = height;
    this.wallGrid = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) this.wallGrid[y * width + x] = walls[y][x] ? 1 : 0;
    this.skyline = skyline(seed);
    this.fogPacked = pack(...theme.fog);
    for (let i = 0; i < theme.rain; i++) this.rain.push(this.newDrop(true));
  }

  render(ctx: CanvasRenderingContext2D, world: WorldView, cam: Camera, time: number) {
    const dirX = Math.cos(cam.angle);
    const dirY = Math.sin(cam.angle);
    const planeX = -dirY * PLANE;
    const planeY = dirX * PLANE;
    const horizon = Math.round(VIEW_H / 2 + cam.bob);
    this.time = time;

    this.drawSky(cam.angle, horizon);
    this.drawWalls(world, cam, dirX, dirY, planeX, planeY, horizon);
    this.drawFloor(cam, dirX, dirY, planeX, planeY, horizon);
    this.drawSprites(world, cam, dirX, dirY, planeX, planeY, horizon);

    ctx.putImageData(this.image, 0, 0);
    this.drawRain(ctx, time);
  }

  private fogFactor(dist: number) {
    return Math.min(1, Math.max(0, dist / this.theme.fogDistance) ** 1.4);
  }

  private drawSky(angle: number, horizon: number) {
    const [top, bottom] = this.theme.sky;
    const sw = this.skyline.length;
    const [fr, fg, fb] = this.theme.fog;
    for (let x = 0; x < VIEW_W; x++) {
      // Map each column to an absolute angle so the skyline stays put while turning.
      const a = angle + Math.atan(((2 * x) / VIEW_W - 1) * PLANE);
      const idx = ((Math.floor((a / (Math.PI * 2)) * sw) % sw) + sw) % sw;
      const skylineTop = horizon - this.skyline[idx] * horizon * 0.55;
      for (let y = 0; y < Math.min(horizon, VIEW_H); y++) {
        let px: number;
        if (y >= skylineTop) {
          // Silhouette with sparse lit windows.
          const lit = (idx * 7 + y * 13) % 53 === 0;
          px = lit ? pack(255, 200, 120) : pack(fr * 0.45, fg * 0.45, fb * 0.45);
        } else {
          const t = y / horizon;
          px = pack(top[0] + (bottom[0] - top[0]) * t, top[1] + (bottom[1] - top[1]) * t, top[2] + (bottom[2] - top[2]) * t);
          if ((x * 31 + y * 17) % 997 === 0 && t < 0.6) px = pack(220, 220, 255);
        }
        this.buf[y * VIEW_W + x] = px;
      }
    }
  }

  /** Street and sidewalks, drawn only below each column's nearest building. */
  private drawFloor(cam: Camera, dirX: number, dirY: number, planeX: number, planeY: number, horizon: number) {
    const { street, sidewalk, neon, fog: fogColor } = this.theme;
    const [sr, sg, sb] = street;
    const [wr, wg, wb] = sidewalk;
    const pr = neon[0][0] * 0.18;
    const pg = neon[0][1] * 0.18;
    const pb = neon[0][2] * 0.18;
    const [fr, fg, fb] = fogColor;
    const rayX0 = dirX - planeX;
    const rayY0 = dirY - planeY;
    const rayX1 = dirX + planeX;
    const rayY1 = dirY + planeY;
    const { wallGrid, gridW, gridH, puddles, floorStart } = this;
    const isWall = (x: number, y: number) => x < 0 || y < 0 || x >= gridW || y >= gridH || wallGrid[y * gridW + x] === 1;

    for (let y = Math.max(0, horizon + 1); y < VIEW_H; y++) {
      const rowDist = (EYE * PROJ) / (y - horizon);
      const fog = this.fogFactor(rowDist);
      const stepX = (rowDist * (rayX1 - rayX0)) / VIEW_W;
      const stepY = (rowDist * (rayY1 - rayY0)) / VIEW_W;
      let fx = cam.x + rowDist * rayX0;
      let fy = cam.y + rowDist * rayY0;
      const row = y * VIEW_W;
      for (let x = 0; x < VIEW_W; x++, fx += stepX, fy += stepY) {
        if (y < floorStart[x]) continue;
        const cx = Math.floor(fx);
        const cy = Math.floor(fy);
        const u = fx - cx;
        const v = fy - cy;
        const curb =
          (u < 0.16 && isWall(cx - 1, cy)) ||
          (u > 0.84 && isWall(cx + 1, cy)) ||
          (v < 0.16 && isWall(cx, cy - 1)) ||
          (v > 0.84 && isWall(cx, cy + 1));
        const grain = ((Math.floor(fx * 24) * 73856093) ^ (Math.floor(fy * 24) * 19349663)) & 7;
        let r: number, g: number, b: number;
        if (curb) {
          // Paving tiles.
          const joint = (u * 8) % 1 < 0.08 || (v * 8) % 1 < 0.08 ? 0.7 : 1;
          r = wr * joint; g = wg * joint; b = wb * joint;
        } else if (puddles[((fy * PUDDLE_RES) & PUDDLE_MASK) * PUDDLE_SIZE + ((fx * PUDDLE_RES) & PUDDLE_MASK)]) {
          // Puddles reflecting neon.
          r = sr + pr; g = sg + pg; b = sb + pb;
        } else {
          r = sr; g = sg; b = sb;
        }
        r += grain; g += grain; b += grain;
        this.buf[row + x] = pack(r + (fr - r) * fog, g + (fg - g) * fog, b + (fb - b) * fog);
      }
    }
  }

  /**
   * Casts one ray per column. Rays keep going after the first building so a
   * taller one behind it can show above its roof; walls are drawn near to far,
   * each only into the rows still free above the previous one.
   */
  private drawWalls(world: WorldView, cam: Camera, dirX: number, dirY: number, planeX: number, planeY: number, horizon: number) {
    const maxDist = this.theme.fogDistance * 1.6;
    const [fogR, fogG, fogB] = this.theme.fog;
    const { cellBuilding, buildings, maxHeight } = this.city;
    const glow = this.glowOut;
    const time = this.time;

    for (let x = 0; x < VIEW_W; x++) {
      const camX = (2 * x) / VIEW_W - 1;
      const rayX = dirX + planeX * camX;
      const rayY = dirY + planeY * camX;
      let mapX = Math.floor(cam.x);
      let mapY = Math.floor(cam.y);
      const deltaX = Math.abs(1 / rayX);
      const deltaY = Math.abs(1 / rayY);
      const stepX = rayX < 0 ? -1 : 1;
      const stepY = rayY < 0 ? -1 : 1;
      let sideX = rayX < 0 ? (cam.x - mapX) * deltaX : (mapX + 1 - cam.x) * deltaX;
      let sideY = rayY < 0 ? (cam.y - mapY) * deltaY : (mapY + 1 - cam.y) * deltaY;
      let side = 0;
      let dist = 0;
      let lastBuilding = -1;
      /** Rows below this are already covered by a nearer building. */
      let clip = VIEW_H;
      this.zbuf[x] = Infinity;
      this.floorStart[x] = horizon + 1;

      while (dist < maxDist && clip > 0) {
        if (sideX < sideY) {
          dist = sideX;
          sideX += deltaX;
          mapX += stepX;
          side = 0;
        } else {
          dist = sideY;
          sideY += deltaY;
          mapY += stepY;
          side = 1;
        }
        if (mapX < 0 || mapY < 0 || mapX >= world.width || mapY >= world.height) break;
        const cell = mapY * world.width + mapX;
        const bi = cellBuilding[cell];
        if (bi < 0) {
          lastBuilding = -1;
          continue;
        }
        // Inside the same building: its far faces are hidden.
        if (bi === lastBuilding) continue;
        lastBuilding = bi;
        if (this.zbuf[x] === Infinity) {
          this.zbuf[x] = dist;
          this.floorStart[x] = Math.max(horizon + 1, Math.min(VIEW_H, Math.ceil(horizon + (EYE * PROJ) / dist)));
        }

        const b = buildings[bi];
        const scale = PROJ / dist; // screen pixels per cell
        const top = horizon - (b.heightPx / TEX_W - EYE) * scale;
        const bottom = horizon + EYE * scale;
        const y0 = Math.max(0, Math.ceil(top));
        const y1 = Math.min(clip, Math.ceil(bottom));
        if (y1 > y0) {
          let wallX = side === 0 ? cam.y + dist * rayY : cam.x + dist * rayX;
          wallX -= Math.floor(wallX);
          let tx = Math.floor(wallX * TEX_W);
          if ((side === 0 && rayX < 0) || (side === 1 && rayY > 0)) tx = TEX_W - tx - 1;
          // Each face of a cell is its own storefront / window column.
          const face = cell * 4 + (side === 0 ? (stepX > 0 ? 0 : 1) : stepY > 0 ? 2 : 3);
          const col = faceColumn(b, face, tx);
          const texelsPerPixel = TEX_W / scale;
          const fog = this.fogFactor(dist);
          const shade = side === 1 ? 0.75 : 1;
          for (let y = y0; y < y1; y++) {
            const h = (bottom - y) * texelsPerPixel;
            const c = sampleFacade(b, col, face, tx, h, time, glow);
            const lit = glow[0];
            const s = lit ? 1 : shade;
            const f = lit ? fog * 0.45 : fog;
            const r = (c & 255) * s;
            const g = ((c >> 8) & 255) * s;
            const bl = ((c >> 16) & 255) * s;
            this.buf[y * VIEW_W + x] = pack(r + (fogR - r) * f, g + (fogG - g) * f, bl + (fogB - bl) * f);
          }
          clip = Math.min(clip, y0);
        }
        // Nothing further away can rise above the tallest building we could still see.
        if (horizon - (maxHeight - EYE) * scale >= clip) break;
      }
    }
  }

  private drawSprites(world: WorldView, cam: Camera, dirX: number, dirY: number, planeX: number, planeY: number, horizon: number) {
    const items: { sprite: string; x: number; y: number; depth: number; tx: number }[] = [];
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const add = (sprite: string, gx: number, gy: number) => {
      const sx = gx + 0.5 - cam.x;
      const sy = gy + 0.5 - cam.y;
      const tx = invDet * (dirY * sx - dirX * sy);
      const depth = invDet * (-planeY * sx + planeX * sy);
      if (depth > 0.2 && depth < this.theme.fogDistance * 1.6) items.push({ sprite, x: gx, y: gy, depth, tx });
    };
    for (const a of world.actors) if (!isHidden(a)) add(a.def.sprite, a.x, a.y);
    add('🚇', world.exit.x, world.exit.y);
    items.sort((a, b) => b.depth - a.depth);

    const [fogR, fogG, fogB] = this.theme.fog;
    for (const s of items) {
      const img = emojiTexture(s.sprite);
      const screenX = (VIEW_W / 2) * (1 + s.tx / s.depth);
      const size = (SPRITE_SIZE * PROJ) / s.depth;
      const bottom = horizon + (EYE * PROJ) / s.depth;
      const top = bottom - size;
      const left = screenX - size / 2;
      const x0 = Math.max(0, Math.floor(left));
      const x1 = Math.min(VIEW_W, Math.ceil(left + size));
      const y0 = Math.max(0, Math.floor(top));
      const y1 = Math.min(VIEW_H, Math.ceil(bottom));
      const fog = this.fogFactor(s.depth) * 0.8;
      for (let x = x0; x < x1; x++) {
        if (s.depth >= this.zbuf[x]) continue;
        const u = Math.floor(((x - left) / size) * EMOJI_SIZE);
        for (let y = y0; y < y1; y++) {
          const v = Math.floor(((y - top) / size) * EMOJI_SIZE);
          const i = (v * EMOJI_SIZE + u) * 4;
          if (img[i + 3] < 128) continue;
          const r = img[i];
          const g = img[i + 1];
          const b = img[i + 2];
          this.buf[y * VIEW_W + x] = pack(r + (fogR - r) * fog, g + (fogG - g) * fog, b + (fogB - b) * fog);
        }
      }
    }
  }

  private newDrop(anywhere: boolean): Drop {
    return {
      x: Math.random() * (VIEW_W + 60),
      y: anywhere ? Math.random() * VIEW_H : -20,
      speed: 380 + Math.random() * 260,
      len: 6 + Math.random() * 10,
    };
  }

  private drawRain(ctx: CanvasRenderingContext2D, time: number) {
    if (!this.rain.length) return;
    const dt = this.lastTime ? Math.min(0.05, (time - this.lastTime) / 1000) : 0;
    this.lastTime = time;
    ctx.strokeStyle = this.theme.rainColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < this.rain.length; i++) {
      const d = this.rain[i];
      d.y += d.speed * dt;
      d.x -= d.speed * dt * 0.15;
      if (d.y > VIEW_H) this.rain[i] = this.newDrop(false);
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.len * 0.15, d.y - d.len);
    }
    ctx.stroke();
  }
}

const EMOJI_SIZE = 128;
const emojiCache = new Map<string, Uint8ClampedArray>();

/** Renders an emoji once into a small RGBA texture for sprite drawing. */
function emojiTexture(emoji: string) {
  let data = emojiCache.get(emoji);
  if (!data) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = EMOJI_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.font = `${EMOJI_SIZE * 0.82}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(emoji, EMOJI_SIZE / 2, EMOJI_SIZE);
    data = ctx.getImageData(0, 0, EMOJI_SIZE, EMOJI_SIZE).data;
    emojiCache.set(emoji, data);
  }
  return data;
}

const PUDDLE_SIZE = 128;
const PUDDLE_MASK = PUDDLE_SIZE - 1;
/** Puddle texels per cell; the pattern repeats every 4 cells. */
const PUDDLE_RES = 32;

/** Precomputed puddle mask so the floor pass needs no trig per pixel. */
function makePuddles() {
  const mask = new Uint8Array(PUDDLE_SIZE * PUDDLE_SIZE);
  for (let y = 0; y < PUDDLE_SIZE; y++) {
    for (let x = 0; x < PUDDLE_SIZE; x++) {
      const fx = x / PUDDLE_RES;
      const fy = y / PUDDLE_RES;
      const wet = Math.sin(fx * Math.PI + Math.sin(fy * Math.PI * 0.5) * 2) * Math.cos(fy * Math.PI * 0.75 + fx);
      mask[y * PUDDLE_SIZE + x] = wet > 0.55 ? 1 : 0;
    }
  }
  return mask;
}
