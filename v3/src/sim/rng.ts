/**
 * Small, fast, seedable PRNG (mulberry32). The internal state is a single
 * 32-bit integer so it can live inside the serialisable game state, which
 * keeps the whole simulation deterministic and save/load-safe.
 */
export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0;
  }

  static fromString(seed: string): Rng {
    return new Rng(hashString(seed));
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick on empty array");
    return items[Math.floor(this.next() * items.length)];
  }

  /** Pick using a weight function; entries with weight <= 0 are never chosen. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  /** Approximately normal distribution (Irwin–Hall with 4 samples). */
  gaussian(mean = 0, sd = 1): number {
    const s = this.next() + this.next() + this.next() + this.next() - 2;
    return mean + sd * s * 1.732;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** Derive an independent child generator (e.g. per system) without disturbing this one much. */
  fork(salt: number | string): Rng {
    const s = typeof salt === "string" ? hashString(salt) : salt >>> 0;
    return new Rng((this.state ^ Math.imul(s, 0x9e3779b1)) >>> 0);
  }
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
