import { timeIntervalSince } from "../Support/calendar";

/**
 * How long a workout has actually been worked at.
 *
 * Active time, not wall-clock time. Rest, walking to the next machine and
 * the app sitting in the background all count — they are part of training.
 * Only an explicit `Pauzeer` stops the clock, and the gap until the user
 * comes back is never added, whether that is five minutes or overnight.
 *
 * The session's `startedAt` stays what it always was: the calendar moment
 * the workout began, used for its date. Duration is this, separately.
 */
export interface WorkoutClock {
  /** Time banked from earlier active stretches. */
  readonly accumulatedSeconds: number;
  /** When the current stretch began. `nil` while paused. */
  readonly segmentStartedAt?: Date;
}

export const WorkoutClock = {
  make(p: { accumulatedSeconds?: number; segmentStartedAt: Date | undefined }): WorkoutClock {
    return {
      accumulatedSeconds: Math.max(0, p.accumulatedSeconds ?? 0),
      segmentStartedAt: p.segmentStartedAt,
    };
  },

  isRunning(self: WorkoutClock): boolean {
    return self.segmentStartedAt !== undefined;
  },

  /** Banked time plus the stretch in progress. */
  activeSeconds(self: WorkoutClock, a: { at: Date }): number {
    const segmentStartedAt = self.segmentStartedAt;
    if (segmentStartedAt === undefined) return self.accumulatedSeconds;
    const current = Math.max(0, Math.trunc(timeIntervalSince(a.at, segmentStartedAt)));
    return self.accumulatedSeconds + current;
  },

  /** Banks the current stretch and stops counting. Returns the new clock. */
  pause(self: WorkoutClock, a: { at: Date }): WorkoutClock {
    if (self.segmentStartedAt === undefined) return self;
    return { accumulatedSeconds: WorkoutClock.activeSeconds(self, { at: a.at }), segmentStartedAt: undefined };
  },

  /** Starts a new stretch. The time since the pause is not counted. Returns the new clock. */
  resume(self: WorkoutClock, a: { at: Date }): WorkoutClock {
    if (self.segmentStartedAt !== undefined) return self;
    return { ...self, segmentStartedAt: a.at };
  },
};
