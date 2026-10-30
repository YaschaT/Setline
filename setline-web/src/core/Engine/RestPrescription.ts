import type { ExerciseRole } from "../Domain/Vocabulary";
import { type ClosedRange, closedRange } from "../Support/range";
import { addingTimeInterval, timeIntervalSince } from "../Support/calendar";
import { pad2 } from "../Support/engine";

/**
 * Rest is not one number. Addendum 13R: it inherits from the exercise's role.
 *
 * This replaces both the web app's free-text `rest` strings ("4–5 min",
 * "90 sec") and the flat 2:00 that `SL.Metric.restDefault` implies — 2:00 is
 * the *compound* default, which is why the pre-flight header shows it as the
 * session's headline rest.
 *
 * The ranges are the design's; they sit inside the goal-profile ranges in
 * TRAINING_LOGIC §6, which floors isolation rest at 90 s (Singer 2024).
 */
export interface RestPrescription {
  defaultSeconds: number;
  range: ClosedRange;
}
export const RestPrescription = {
  make(a: { defaultSeconds: number; range: ClosedRange }): RestPrescription {
    return { defaultSeconds: a.defaultSeconds, range: a.range };
  },

  forRole(role: ExerciseRole): RestPrescription {
    switch (role) {
      case "primaryStrength":
        return RestPrescription.make({ defaultSeconds: 180, range: closedRange(180, 300) });
      case "secondaryCompound":
        return RestPrescription.make({ defaultSeconds: 120, range: closedRange(120, 180) });
      case "accessory":
      case "isolation":
        return RestPrescription.make({ defaultSeconds: 90, range: closedRange(90, 120) });
    }
  },

  /** The label the design uses on the pre-flight header and in Account. */
  displayLabel(self: RestPrescription): string {
    const minutes = Math.trunc(self.defaultSeconds / 60);
    const seconds = self.defaultSeconds % 60;
    return `${minutes}:${pad2(seconds)}`;
  },
};

/**
 * The floating rest timer's clock.
 *
 * ±15 s adjusts *this* rest and never resets the running count (13R), and
 * the fire date is absolute so the count survives suspension — README,
 * "Native iOS behaviours" item 4. Codable so a paused session can carry it.
 */
export interface RestTimerState {
  targetSeconds: number;
  startedAt: Date;
  adjustmentSeconds: number;
  isRunning: boolean;
}
export const RestTimerState = {
  make(a: { targetSeconds: number; startedAt: Date; adjustmentSeconds?: number; isRunning?: boolean }): RestTimerState {
    return {
      targetSeconds: a.targetSeconds,
      startedAt: a.startedAt,
      adjustmentSeconds: a.adjustmentSeconds ?? 0,
      isRunning: a.isRunning ?? true,
    };
  },

  fireDate(self: RestTimerState): Date {
    return addingTimeInterval(self.startedAt, self.targetSeconds + self.adjustmentSeconds);
  },

  remaining(self: RestTimerState, a: { at: Date }): number {
    return Math.max(0, Math.trunc(Math.ceil(timeIntervalSince(RestTimerState.fireDate(self), a.at))));
  },

  /**
   * Adjust without resetting: only the target moves, `startedAt` is untouched.
   * `mutating` in Swift: returns the adjusted state.
   */
  adjust(self: RestTimerState, a: { by: number; floorRemainingAt?: Date }): RestTimerState {
    const seconds = a.by;
    const now = a.floorRemainingAt ?? new Date();
    const proposed = self.adjustmentSeconds + seconds;
    const candidate = RestTimerState.make({
      targetSeconds: self.targetSeconds,
      startedAt: self.startedAt,
      adjustmentSeconds: proposed,
      isRunning: self.isRunning,
    });
    // Never let an adjustment push the clock into the past.
    const adjustmentSeconds = RestTimerState.remaining(candidate, { at: now }) > 0 || seconds > 0 ? proposed : self.adjustmentSeconds;
    return { ...self, adjustmentSeconds };
  },

  clockLabel(seconds: number): string {
    return `${pad2(Math.trunc(seconds / 60))}:${pad2(seconds % 60)}`;
  },

  /** The rest's whole length, as typed or prescribed, adjustments included. */
  length(self: RestTimerState): number {
    return self.targetSeconds + self.adjustmentSeconds;
  },

  /**
   * The rest set to a length of its own, still counted from when it began.
   * `mutating` in Swift: returns the new state.
   */
  withLength(self: RestTimerState, a: { seconds: number }): RestTimerState {
    return { ...self, targetSeconds: a.seconds, adjustmentSeconds: 0 };
  },

  /**
   * A rest length typed by hand. "1:30" is minutes and seconds, and so are
   * "1.30" and "1,30"; "1.5" is one and a half minutes. One or two digits
   * are minutes up to 10 and seconds above ("2", "90"); three or four read
   * like a microwave timer ("130" is 1:30). Between 10 seconds and 15
   * minutes, or nothing.
   */
  parseLength(text: string): number | undefined {
    const typed = text.trim();
    let seconds: number;
    const colon = /^(\d{1,2}):(\d{2})$/.exec(typed);
    const decimal = /^(\d{1,2})[.,](\d{1,2})$/.exec(typed);
    if (colon) {
      if (Number(colon[2]) >= 60) return undefined;
      seconds = Number(colon[1]) * 60 + Number(colon[2]);
    } else if (decimal) {
      const fraction = decimal[2];
      if (fraction.length === 1) {
        seconds = Number(decimal[1]) * 60 + Number(fraction) * 6;
      } else {
        if (Number(fraction) >= 60) return undefined;
        seconds = Number(decimal[1]) * 60 + Number(fraction);
      }
    } else if (/^\d{1,2}$/.test(typed)) {
      const number = Number(typed);
      seconds = number <= 10 ? number * 60 : number;
    } else if (/^\d{3,4}$/.test(typed)) {
      const rest = Number(typed.slice(-2));
      if (rest >= 60) return undefined;
      seconds = Number(typed.slice(0, -2)) * 60 + rest;
    } else {
      return undefined;
    }
    return seconds >= 10 && seconds <= 900 ? seconds : undefined;
  },
};
