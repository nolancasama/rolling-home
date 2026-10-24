// Deterministic randomness. The simulation never calls Math.random: every random
// choice is derived from the save's seed plus a stable key, so a reloaded game
// produces the same job boards, NPC schedules and catches as before.

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFor(...keys: (string | number)[]): Rng {
  return mulberry32(hashString(keys.join('|')));
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

export function range(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function intRange(rng: Rng, min: number, maxInclusive: number): number {
  return Math.floor(min + (maxInclusive - min + 1) * rng());
}

export function shuffle<T>(rng: Rng, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
