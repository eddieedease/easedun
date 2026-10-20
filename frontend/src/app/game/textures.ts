import { createRng } from './rng';

const clamp = (v: number) => (v > 255 ? 255 : v < 0 ? 0 : v | 0);
/** Packs a colour as ABGR (ImageData byte order on little-endian machines). */
export const pack = (r: number, g: number, b: number) => ((255 << 24) | (clamp(b) << 16) | (clamp(g) << 8) | clamp(r)) >>> 0;

/** Fast integer hash for stable per-window / per-cell randomness. */
export function hash(a: number, b = 0, c = 0, d = 0) {
  let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791) ^ Math.imul(d, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
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
