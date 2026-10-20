import { Rng, createRng } from './rng';
import { hash, pack } from './textures';
import { Theme } from './themes';

/** Texels per cell side. A cell is ~10 m, so a texel is ~15 cm. */
export const TEX_W = 64;
const M = TEX_W / 10; // texels per metre
export const GROUND_PX = Math.round(4.5 * M);
export const STOREY_PX = Math.round(3.5 * M);
export const ROOF_PX = Math.round(0.8 * M);

/** One horizontal slice of a facade (ground floor, a storey or the roof edge). */
export interface Module {
  h: number;
  px: Uint32Array;
  /** 1 = emits light (neon, lit glass) and resists fog. */
  glow: Uint8Array;
  /** Window id within the module (0 = not a window). Lit at render time per storey and cell. */
  slot: Uint8Array;
}

/** A set of modules that together make one look of facade. */
export interface Kit {
  grounds: Module[];
  storey: Module;
  roof: Module;
}

export interface Sign {
  x: number;
  w: number;
  /** Texels above the ground. */
  from: number;
  to: number;
  color: number;
  dim: number;
}

/** One building: a group of wall cells sharing a kit, height, lights and signage. */
export interface Building {
  kit: Kit;
  /** Height in texels. */
  heightPx: number;
  seed: number;
  /** Percentage of windows lit. */
  litPct: number;
  litColors: number[];
  sign: Sign | null;
}

export interface City {
  width: number;
  /** Building index per cell, -1 for streets. */
  cellBuilding: Int32Array;
  buildings: Building[];
  /** Tallest building in cells, so rays know when nothing behind can show. */
  maxHeight: number;
}

type RGB = [number, number, number];

const KIT_COUNT = 10;
/** Cells per building lot; connected wall cells within a lot form one building. */
const LOT = 2;

/** Splits the wall cells into buildings and gives each its own personality. */
export function buildCity(walls: boolean[][], width: number, height: number, theme: Theme, seed: number): City {
  const rng = createRng(seed ^ 0xc17);
  const kits = Array.from({ length: KIT_COUNT }, () => makeKit(theme, rng));
  const cellBuilding = new Int32Array(width * height).fill(-1);
  const buildings: Building[] = [];
  let maxHeight = 0;

  // Shift the lot grid per map so blocks don't all split on even cells.
  const ox = rng.int(0, LOT - 1);
  const oy = rng.int(0, LOT - 1);
  const lot = (x: number, y: number) => `${Math.floor((x + ox) / LOT)},${Math.floor((y + oy) / LOT)}`;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!walls[y][x] || cellBuilding[y * width + x] !== -1) continue;
      const id = buildings.length;
      const lotKey = lot(x, y);
      // Flood fill within the lot.
      const stack = [[x, y]];
      cellBuilding[y * width + x] = id;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (!walls[ny][nx] || cellBuilding[ny * width + nx] !== -1 || lot(nx, ny) !== lotKey) continue;
          cellBuilding[ny * width + nx] = id;
          stack.push([nx, ny]);
        }
      }
      const b = makeBuilding(theme, rng, kits);
      maxHeight = Math.max(maxHeight, b.heightPx / TEX_W);
      buildings.push(b);
    }
  }
  return { width, cellBuilding, buildings, maxHeight };
}

function makeBuilding(theme: Theme, rng: Rng, kits: Kit[]): Building {
  // Mostly mid-rise, sometimes a low block or a tower.
  const roll = rng.next();
  const cells = roll < 0.15 ? 1.4 + rng.next() * 0.8 : roll < 0.88 ? 2.4 + rng.next() * 2.8 : 6 + rng.next() * 3;
  const storeys = Math.max(1, Math.round((cells * TEX_W - GROUND_PX - ROOF_PX) / STOREY_PX));
  const heightPx = GROUND_PX + storeys * STOREY_PX + ROOF_PX;
  const warm: RGB = [255, 205 + rng.int(-20, 20), 130 + rng.int(-30, 30)];
  const litColors = [pack(...warm), pack(...rng.pick(theme.neon)), pack(...warm), pack(200, 230, 255)];

  let sign: Sign | null = null;
  if (storeys >= 3 && rng.next() < 0.55) {
    const w = Math.round(1.2 * M);
    const len = Math.min(storeys - 1, rng.int(2, 4)) * STOREY_PX;
    const from = GROUND_PX + rng.int(0, Math.max(0, storeys - 1 - len / STOREY_PX)) * STOREY_PX + 3;
    const [r, g, b] = rng.pick(theme.neon);
    sign = { x: rng.next() < 0.5 ? 3 : TEX_W - w - 3, w, from, to: from + len - 6, color: pack(r, g, b), dim: pack(r * 0.22, g * 0.22, b * 0.22) };
  }

  return {
    kit: rng.pick(kits),
    heightPx,
    seed: rng.int(1, 0x7fffffff),
    litPct: rng.int(12, 55),
    litColors,
    sign,
  };
}

// ---- facade kits ----------------------------------------------------------

function newModule(h: number): Module {
  return { h, px: new Uint32Array(TEX_W * h), glow: new Uint8Array(TEX_W * h), slot: new Uint8Array(TEX_W * h) };
}

function painter(m: Module) {
  return {
    rect(x: number, y: number, w: number, h: number, color: number, glow = 0, slot = 0) {
      for (let yy = Math.max(0, y); yy < Math.min(m.h, y + h); yy++) {
        for (let xx = Math.max(0, x); xx < Math.min(TEX_W, x + w); xx++) {
          const i = yy * TEX_W + xx;
          m.px[i] = color;
          m.glow[i] = glow;
          m.slot[i] = slot;
        }
      }
    },
  };
}

const shade = ([r, g, b]: RGB, f: number) => pack(r * f, g * f, b * f);

function concrete(m: Module, base: RGB, rng: Rng) {
  for (let i = 0; i < m.px.length; i++) {
    const n = rng.int(-6, 6);
    m.px[i] = pack(base[0] + n, base[1] + n, base[2] + n);
  }
}

/** Builds one facade look: window layout, ledges, AC units, and three ground-floor variants. */
function makeKit(theme: Theme, rng: Rng): Kit {
  const base = rng.pick(theme.concrete).map((c) => c + rng.int(-8, 8)) as RGB;
  const accent = rng.pick(theme.neon);
  const glass = pack(12, 14, 26);

  // Upper storey: one of several window layouts.
  const storey = newModule(STOREY_PX);
  concrete(storey, base, rng);
  const s = painter(storey);
  const layout = rng.int(0, 3);
  let slot = 1;
  const winY = Math.round(0.9 * M);
  if (layout === 0) {
    // Three punched windows.
    for (let x = 5; x + 10 <= TEX_W; x += 21) s.rect(x, winY, 10, 11, glass, 0, slot++);
  } else if (layout === 1) {
    // Four narrow windows.
    for (let x = 4; x + 7 <= TEX_W; x += 16) s.rect(x, winY, 7, 12, glass, 0, slot++);
  } else if (layout === 2) {
    // Two wide windows.
    for (let x = 6; x + 22 <= TEX_W; x += 32) s.rect(x, winY + 1, 22, 9, glass, 0, slot++);
  } else {
    // Ribbon window with mullions.
    for (let x = 0; x < TEX_W; x += 8) s.rect(x, winY + 1, 7, 8, glass, 0, slot++);
  }
  if (rng.next() < 0.6) s.rect(0, STOREY_PX - 2, TEX_W, 2, shade(base, 0.6)); // floor ledge
  if (layout !== 3 && rng.next() < 0.5) {
    // AC units hanging below some windows.
    const ac = shade([150, 150, 160], 0.7 + rng.next() * 0.3);
    for (let x = 8; x < TEX_W - 6; x += layout === 1 ? 32 : 21) s.rect(x, winY + 13, 5, 3, ac);
  }
  if (rng.next() < 0.3) {
    // Balcony rails.
    for (let x = 0; x < TEX_W; x += 2) s.rect(x, winY + 9, 1, 4, shade(base, 0.45));
    s.rect(0, winY + 9, TEX_W, 1, shade(base, 0.45));
  }

  // Roof edge.
  const roof = newModule(ROOF_PX);
  painter(roof).rect(0, 0, TEX_W, ROOF_PX, shade(base, 0.45));
  if (rng.next() < 0.3) painter(roof).rect(0, ROOF_PX - 1, TEX_W, 1, pack(...accent), 1);

  return { grounds: [groundShop(base, accent, rng), groundShutter(base, rng), groundLobby(base, theme, rng), groundAlley(base, theme, rng)], storey, roof };
}

/** Dark shop window, a lit door and a neon band at ~3.5 m. */
function groundShop(base: RGB, accent: RGB, rng: Rng): Module {
  const m = newModule(GROUND_PX);
  concrete(m, base, rng);
  const p = painter(m);
  const top = GROUND_PX - Math.round(3 * M);
  p.rect(2, top, TEX_W - 4, Math.round(2.5 * M), pack(14, 14, 24));
  const doorW = Math.round(1.6 * M);
  const doorX = rng.int(4, TEX_W - doorW - 4);
  for (let y = GROUND_PX - Math.round(2.4 * M); y < GROUND_PX; y++) {
    const f = 0.35 + (y - (GROUND_PX - 2.4 * M)) / (2.4 * M * 1.6);
    p.rect(doorX, y, doorW, 1, shade(accent, f), 1);
  }
  p.rect(2, GROUND_PX - Math.round(3.8 * M), TEX_W - 4, Math.round(0.5 * M), pack(...accent), 1);
  return m;
}

/** Roll-down shutter with a small lit sign. */
function groundShutter(base: RGB, rng: Rng): Module {
  const m = newModule(GROUND_PX);
  concrete(m, base, rng);
  const p = painter(m);
  const top = GROUND_PX - Math.round(3 * M);
  for (let y = top; y < GROUND_PX; y++) p.rect(3, y, TEX_W - 6, 1, (y - top) % 3 === 0 ? pack(55, 58, 66) : pack(88, 92, 100));
  p.rect(20, top - 5, 24, 4, pack(255, 80, 60), 1);
  return m;
}

/** Lit glass lobby with columns. */
function groundLobby(base: RGB, theme: Theme, rng: Rng): Module {
  const m = newModule(GROUND_PX);
  concrete(m, base, rng);
  const p = painter(m);
  const light = rng.pick(theme.neon);
  const top = GROUND_PX - Math.round(3.6 * M);
  for (let y = top; y < GROUND_PX; y++) {
    const f = 0.25 + ((y - top) / (GROUND_PX - top)) * 0.35;
    p.rect(1, y, TEX_W - 2, 1, pack(140 * f + light[0] * f * 0.4, 170 * f + light[1] * f * 0.4, 200 * f + light[2] * f * 0.4), 1);
  }
  for (let x = 0; x < TEX_W; x += 16) p.rect(x, top, 2, GROUND_PX - top, shade(base, 0.6));
  return m;
}

/** Plain wall with a dim door and graffiti tags. */
function groundAlley(base: RGB, theme: Theme, rng: Rng): Module {
  const m = newModule(GROUND_PX);
  concrete(m, base, rng);
  const p = painter(m);
  p.rect(rng.int(4, 40), GROUND_PX - Math.round(2.2 * M), Math.round(1.3 * M), Math.round(2.2 * M), pack(30, 26, 34));
  for (let t = 0; t < 3; t++) {
    const color = pack(...rng.pick(theme.neon));
    let x = rng.int(2, TEX_W - 14);
    let y = rng.int(GROUND_PX - 18, GROUND_PX - 6);
    for (let i = 0; i < 14; i++) {
      p.rect(x, y, 2, 2, color);
      x += rng.int(0, 2);
      y += rng.int(-1, 1);
    }
  }
  return m;
}

// ---- sampling ----------------------------------------------------------------

/** Per-column facts about one building face, worked out once per ray hit. */
export interface FaceColumn {
  ground: Module;
  /** The building's sign runs through this column of this face. */
  sign: boolean;
}

export function faceColumn(b: Building, face: number, tx: number): FaceColumn {
  const r = hash(b.seed, face);
  const s = b.sign;
  return {
    ground: b.kit.grounds[r % b.kit.grounds.length],
    sign: !!s && r % 3 === 0 && tx >= s.x && tx < s.x + s.w,
  };
}

/**
 * Colour of a building at texel column `tx` (0–63) and `h` texels above the ground,
 * on the face `face`. Returns the packed colour; sets `glowOut[0]`.
 */
export function sampleFacade(b: Building, col: FaceColumn, face: number, tx: number, h: number, time: number, glowOut: Uint8Array): number {
  const kit = b.kit;
  if (col.sign && h >= b.sign!.from && h < b.sign!.to) {
    const s = b.sign!;
    const lx = tx - s.x;
    const ly = h - s.from;
    const edge = lx === 0 || lx === s.w - 1 || ly === 0 || ly === s.to - s.from - 1;
    // Glyph blocks that slowly cycle, so signs feel alive.
    const glyph = lx > 1 && lx < s.w - 2 && ly % 10 < 7 && hash(b.seed, Math.floor(ly / 10), lx, Math.floor(time / 900)) % 10 < 7;
    glowOut[0] = edge || glyph ? 1 : 0;
    return edge || glyph ? s.color : s.dim;
  }

  let m: Module;
  let row: number;
  let storey = -1;
  if (h < GROUND_PX) {
    m = col.ground;
    row = GROUND_PX - 1 - Math.floor(h);
  } else if (h >= b.heightPx - ROOF_PX) {
    m = kit.roof;
    row = Math.min(ROOF_PX - 1, Math.max(0, Math.floor(h - (b.heightPx - ROOF_PX))));
    row = ROOF_PX - 1 - row;
  } else {
    const rel = h - GROUND_PX;
    storey = Math.floor(rel / STOREY_PX);
    m = kit.storey;
    row = STOREY_PX - 1 - Math.floor(rel - storey * STOREY_PX);
  }
  const i = row * TEX_W + tx;
  const slot = m.slot[i];
  if (slot && storey >= 0) {
    const r = hash(b.seed, storey, slot, face);
    if (r % 100 < b.litPct) {
      glowOut[0] = 1;
      return b.litColors[(r >>> 8) % b.litColors.length];
    }
  }
  glowOut[0] = m.glow[i];
  return m.px[i];
}
