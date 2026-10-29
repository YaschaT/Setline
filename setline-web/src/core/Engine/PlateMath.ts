import { dec, sum } from "../Support/swift";
import { Estimates } from "./Estimates";

export interface PlateMath_Solution {
  /** Heaviest first, as they go on: `[15, 2.5]`. */
  readonly perSide: number[];
  /** What that actually weighs, bar included. */
  readonly total: number;
  /**
   * The smallest plate in the rack, when this load does not need it —
   * the fiddly one you can leave alone.
   */
  readonly unused?: number;
  /** Whether the bar can make exactly what was asked for. */
  readonly isExact: boolean;
}
export const PlateMath_Solution = {
  make(a: { perSide: number[]; total: number; unused: number | undefined; isExact: boolean }): PlateMath_Solution {
    return { perSide: a.perSide, total: a.total, unused: a.unused, isExact: a.isExact };
  },
};

/**
 * What to hang on the bar, and what the bar can actually hold.
 *
 * Plates come in pairs, so every reachable load is the bar plus twice some
 * sum of plates. The calculator's whole job is to be right about that: it
 * says the closest weight your plates can make, not the weight you asked for.
 */
export const PlateMath = {
  /**
   * The plates the handoff specifies as the default set (artboard 06), in
   * kilograms, heaviest first. A custom set has nowhere to be stored yet.
   */
  defaultPlates: [20, 15, 10, 5, 2.5, 1.25] as number[],
  defaultBar: 20,

  solve(a: { target: number; bar?: number; plates?: number[] }): PlateMath_Solution {
    const target = a.target;
    const bar = a.bar ?? PlateMath.defaultBar;
    const plates = a.plates ?? PlateMath.defaultPlates;
    const available = plates.filter((p) => p > 0).sort((x, y) => y - x);
    const smallest = available[available.length - 1];
    if (smallest === undefined || !(target > bar)) {
      return PlateMath_Solution.make({ perSide: [], total: Math.max(bar, 0), unused: undefined, isExact: target === bar });
    }

    // Only multiples of twice the smallest plate can be reached at all.
    const step = dec(smallest * 2);
    const over = dec(target - bar);
    const reachable = Math.max(0, Estimates.round(over, { toIncrement: step }));

    let remaining = dec(reachable / 2);
    const perSide: number[] = [];
    for (const plate of available) {
      while (remaining >= plate) {
        perSide.push(plate);
        remaining = dec(remaining - plate);
      }
    }

    const total = dec(bar + sum(perSide) * 2);
    return PlateMath_Solution.make({
      perSide,
      total,
      unused: perSide.includes(smallest) ? undefined : smallest,
      isExact: total === target,
    });
  },

  /**
   * The loads around this one that the same plates can make — the row of
   * nearby weights under the stack.
   */
  nearby(a: { target: number; bar?: number; plates?: number[]; before?: number; after?: number }): number[] {
    const bar = a.bar ?? PlateMath.defaultBar;
    const plates = a.plates ?? PlateMath.defaultPlates;
    const before = a.before ?? 1;
    const after = a.after ?? 2;
    const positive = plates.filter((p) => p > 0);
    if (positive.length === 0) return [];
    const smallest = Math.min(...positive);
    const step = dec(smallest * 2);
    const centre = PlateMath.solve({ target: a.target, bar, plates }).total;
    const out: number[] = [];
    for (let i = -before; i <= after; i++) out.push(dec(centre + step * i));
    return out.filter((x) => x >= bar);
  },
};
