/** Small seeded PRNG (mulberry32) so a run can be replayed from its seed. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)],
    weighted: <K extends string>(weights: Record<K, number>): K | null => {
      const entries = Object.entries(weights) as [K, number][];
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      if (total <= 0) return null;
      let roll = next() * total;
      for (const [key, w] of entries) {
        roll -= w;
        if (roll < 0) return key;
      }
      return entries[entries.length - 1][0];
    },
  };
}

export type Rng = ReturnType<typeof createRng>;

export function randomSeed() {
  return Math.floor(Math.random() * 1_000_000);
}
