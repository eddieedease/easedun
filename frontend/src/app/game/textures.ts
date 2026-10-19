import { createRng } from './rng';
import { Theme } from './themes';

export const TEX_W = 64;
/** Buildings are WALL_H cells tall. */
export const WALL_H = 3;
export const TEX_H = TEX_W * WALL_H;

export interface Texture {
  /** Packed ABGR pixels (ImageData byte order on little-endian machines). */
  pixels: Uint32Array;
  /** 1 where the pixel glows (windows, neon) and should resist fog. */
  glow: Uint8Array;
}

const clamp = (v: number) => (v > 255 ? 255 : v < 0 ? 0 : v | 0);
export const pack = (r: number, g: number, b: number) => ((255 << 24) | (clamp(b) << 16) | (clamp(g) << 8) | clamp(r)) >>> 0;

type RGB = [number, number, number];

/** Procedurally paints a handful of building facades in the theme's colours. */
export function buildingTextures(theme: Theme, seed: number, count = 8): Texture[] {
  const rng = createRng(seed ^ 0xb111d);
  const textures: Texture[] = [];

  for (let t = 0; t < count; t++) {
    const pixels = new Uint32Array(TEX_W * TEX_H);
    const glow = new Uint8Array(TEX_W * TEX_H);
    const base = rng.pick(theme.concrete);
    const accent = rng.pick(theme.neon);
    const set = (x: number, y: number, [r, g, b]: RGB, lit = false) => {
      if (x < 0 || y < 0 || x >= TEX_W || y >= TEX_H) return;
      pixels[y * TEX_W + x] = pack(r, g, b);
      glow[y * TEX_W + x] = lit ? 1 : 0;
    };

    // Concrete with grain.
    for (let y = 0; y < TEX_H; y++) {
      for (let x = 0; x < TEX_W; x++) {
        const n = rng.int(-6, 6);
        set(x, y, [base[0] + n, base[1] + n, base[2] + n]);
      }
    }
    // Roof ledge.
    for (let y = 0; y < 4; y++) for (let x = 0; x < TEX_W; x++) set(x, y, [base[0] * 0.5, base[1] * 0.5, base[2] * 0.5]);

    // Window grid on the upper floors.
    const groundTop = TEX_H - 30;
    const litChance = 0.2 + rng.next() * 0.35;
    const windowColor = rng.pick(theme.neon);
    for (let wy = 10; wy < groundTop - 14; wy += 14) {
      for (let wx = 5; wx < TEX_W - 6; wx += 15) {
        const lit = rng.next() < litChance;
        const warm: RGB = rng.next() < 0.5 ? [255, 210, 140] : windowColor;
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            if (lit) set(wx + x, wy + y, scale(warm, 0.75 + (y / 8) * 0.25), true);
            else set(wx + x, wy + y, [12, 14, 22 + y * 2]);
          }
        }
      }
    }

    // Ground floor: dark shop front with a lit door and a neon band above.
    for (let y = groundTop; y < TEX_H; y++) {
      for (let x = 2; x < TEX_W - 2; x++) set(x, y, [10, 10, 16]);
    }
    for (let y = groundTop + 8; y < TEX_H; y++) {
      for (let x = 24; x < 40; x++) set(x, y, scale(accent, 0.35 + (y - groundTop) / 60), true);
    }
    for (let y = groundTop - 5; y < groundTop - 1; y++) {
      for (let x = 2; x < TEX_W - 2; x++) set(x, y, accent, true);
    }

    // Some buildings get a vertical neon sign.
    if (rng.next() < 0.6) {
      const sx = rng.next() < 0.5 ? 2 : TEX_W - 10;
      const signColor = rng.pick(theme.neon);
      const top = rng.int(20, 60);
      for (let y = top; y < top + 70; y++) {
        for (let x = sx; x < sx + 8; x++) {
          const edge = x === sx || x === sx + 7 || y === top || y === top + 69;
          const glyph = (y - top) % 12 < 8 && x > sx + 1 && x < sx + 6 && rng.next() < 0.7;
          set(x, y, edge || glyph ? signColor : scale(signColor, 0.25), edge || glyph);
        }
      }
    }

    textures.push({ pixels, glow });
  }
  return textures;
}

/** Distant skyline silhouette, indexed by viewing angle. */
export function skyline(seed: number, width = 1024) {
  const rng = createRng(seed ^ 0x5c1e);
  const heights = new Float32Array(width);
  let x = 0;
  while (x < width) {
    const w = rng.int(8, 40);
    const h = 0.15 + rng.next() * 0.55;
    for (let i = 0; i < w && x < width; i++, x++) heights[x] = h;
  }
  return heights;
}

const scale = ([r, g, b]: RGB, f: number): RGB => [r * f, g * f, b * f];
