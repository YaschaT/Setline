// Swift `ClosedRange<Int>` (`a...b`), as the Domain and Legacy ports use it.
//
// A plain value with Swift's property names, so `range.lowerBound` and
// `range.upperBound` read exactly as they do in Swift. `Codable` writes it as
// the two-element array `[lowerBound, upperBound]`, which `encodeJSON`
// (Support/codable.ts) and `decodeClosedRange` reproduce.

export interface ClosedRange {
  lowerBound: number;
  upperBound: number;
}

/** Swift `a...b`, which traps when `a > b`. */
export function closedRange(lowerBound: number, upperBound: number): ClosedRange {
  if (!(lowerBound <= upperBound)) throw new RangeError("Range requires lowerBound <= upperBound");
  return { lowerBound, upperBound };
}

export const ClosedRange = {
  make: closedRange,
  /** `range.contains(value)`. */
  contains(self: ClosedRange, value: number): boolean {
    return self.lowerBound <= value && value <= self.upperBound;
  },
};
