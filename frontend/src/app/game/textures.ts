import { createRng } from './rng';
import { Theme } from './themes';

export const TEX_W = 64;
/** Buildings are WALL_H cells tall. One cell is ~10 m, so a texel is ~15 cm. */
export const WALL_H = 4;
/** Texels per metre, used to lay out storeys, doors and signs at human scale. */
const M = TEX_W / 10;
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

    // Upper storeys (~3.5 m each) with ~1.4 x 1.7 m windows every 3 m.
    const groundTop = TEX_H - Math.round(4.5 * M);
    const storey = Math.round(3.5 * M);
    const winW = Math.round(1.4 * M);
    const winH = Math.round(1.7 * M);
    const pitch = Math.round(3.2 * M);
    const litChance = 0.2 + rng.next() * 0.35;
    const windowColor = rng.pick(theme.neon);
    for (let floorTop = groundTop - storey; floorTop > 6; floorTop -= storey) {
      const wy = floorTop + Math.round(0.9 * M);
      for (let wx = Math.round(0.9 * M); wx + winW < TEX_W; wx += pitch) {
        const lit = rng.next() < litChance;
        const warm: RGB = rng.next() < 0.5 ? [255, 210, 140] : windowColor;
        for (let y = 0; y < winH; y++) {
          for (let x = 0; x < winW; x++) {
            if (lit) set(wx + x, wy + y, scale(warm, 0.75 + (y / winH) * 0.25), true);
            else set(wx + x, wy + y, [12, 14, 22 + y * 2]);
          }
        }
      }
    }

    // Ground floor (4.5 m): dark shop windows, a lit 2.4 m door and a neon band at ~3.5 m.
    const doorW = Math.round(1.6 * M);
    const doorH = Math.round(2.4 * M);
    const doorX = rng.int(Math.round(1 * M), TEX_W - doorW - Math.round(1 * M));
    for (let y = TEX_H - Math.round(3 * M); y < TEX_H - Math.round(0.5 * M); y++) {
      for (let x = 2; x < TEX_W - 2; x++) set(x, y, [14, 14, 24]);
    }
    for (let y = TEX_H - doorH; y < TEX_H; y++) {
      for (let x = doorX; x < doorX + doorW; x++) set(x, y, scale(accent, 0.35 + (y - (TEX_H - doorH)) / (doorH * 1.6)), true);
    }
    const band = TEX_H - Math.round(3.8 * M);
    for (let y = band; y < band + Math.round(0.5 * M); y++) {
      for (let x = 2; x < TEX_W - 2; x++) set(x, y, accent, true);
    }

    // Some buildings get a tall vertical neon sign (~1.2 m wide, 9 m high).
    if (rng.next() < 0.6) {
      const signW = Math.round(1.2 * M);
      const signH = Math.round(9 * M);
      const sx = rng.next() < 0.5 ? 2 : TEX_W - signW - 2;
      const signColor = rng.pick(theme.neon);
      const top = rng.int(Math.round(6 * M), groundTop - signH - Math.round(1 * M));
      for (let y = top; y < top + signH; y++) {
        for (let x = sx; x < sx + signW; x++) {
          const edge = x === sx || x === sx + signW - 1 || y === top || y === top + signH - 1;
          const glyph = (y - top) % 10 < 7 && x > sx + 1 && x < sx + signW - 2 && rng.next() < 0.7;
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
