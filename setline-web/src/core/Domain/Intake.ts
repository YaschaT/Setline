import { PlateMath } from "../Engine/PlateMath";
import { dec } from "../Support/swift";

/**
 * How long the account has been lifting, which sets how fast progression is
 * proposed (artboard 04).
 */
export type Experience = "session" | "week" | "block";
export const Experience = {
  session: "session" as Experience,
  week: "week" as Experience,
  block: "block" as Experience,
  allCases: ["session", "week", "block"] as Experience[],

  title(self: Experience): string {
    switch (self) {
      case "session":
        return "Less than a year";
      case "week":
        return "1 to 4 years";
      case "block":
        return "More than 4 years";
    }
  },

  detail(self: Experience): string {
    switch (self) {
      case "session":
        return "Progress per session";
      case "week":
        return "Progress per week";
      case "block":
        return "Progress per block, RPE input on";
    }
  },

  /** The consequence line: what this answer produces, said before it is made. */
  consequence(self: Experience): string {
    switch (self) {
      case "session":
        return "Progress per session: all reps done means heavier next session.";
      case "week":
        return "Progress per week: all reps done means heavier next week.";
      case "block":
        return "Progress per block: you stay at a weight and RPE decides when it goes up.";
    }
  },
};

/**
 * What is on the rack, which is what the plate calculator can make
 * (artboard 06). Kilograms, per plate, heaviest first.
 */
export interface PlateInventory {
  readonly plates: number[];
  readonly barKg: number;
}

let defaultInventory: PlateInventory | undefined;

export const PlateInventory = {
  make(p: { plates: number[]; barKg: number }): PlateInventory {
    return {
      plates: p.plates.filter((x) => x > 0).sort((a, b) => b - a),
      barKg: p.barKg,
    };
  },

  /** `static let default` — lazy, as a Swift static is. */
  get default(): PlateInventory {
    defaultInventory ??= PlateInventory.make({ plates: PlateMath.defaultPlates, barKg: PlateMath.defaultBar });
    return defaultInventory;
  },

  /** Every plate the intake offers, whether or not this gym has it. */
  offered: [20, 15, 10, 5, 2.5, 1.25, 0.5] as number[],

  /** The smallest change the bar can make: a pair of the smallest plate. */
  smallestJump(self: PlateInventory): number | undefined {
    const last = self.plates[self.plates.length - 1];
    return last === undefined ? undefined : dec(last * 2);
  },
};
