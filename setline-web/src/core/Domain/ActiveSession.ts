import { RestTimerState } from "../Engine/RestPrescription";
import type { JSONValue } from "../Legacy/JSONValue";
import { timeIntervalSince } from "../Support/calendar";
import {
  KeyedContainer,
  decodeArray,
  decodeBool,
  decodeDate,
  decodeDictionary,
  decodeInt,
  decodeString,
  encodeJSON,
} from "../Support/codable";
import { ExerciseResult, LoggedSet, TrainingSession } from "./Model";
import { SessionSlot } from "./SessionSlot";

/**
 * A rest timer as it stood at the pause: its absolute start, its target
 * and any ± adjustment, and the label it was started with.
 */
export interface ActiveSessionSnapshot_PausedRest {
  timer: RestTimerState;
  title: string;
}

/** `RestTimerState`'s synthesized `Decodable`, which the snapshot decodes through. */
function decodeRestTimerState(json: JSONValue): RestTimerState {
  const c = new KeyedContainer(json);
  return {
    targetSeconds: c.decode("targetSeconds", decodeInt),
    startedAt: c.decode("startedAt", decodeDate),
    adjustmentSeconds: c.decode("adjustmentSeconds", decodeInt),
    isRunning: c.decode("isRunning", decodeBool),
  };
}

export const ActiveSessionSnapshot_PausedRest = {
  make(p: { timer: RestTimerState; title: string }): ActiveSessionSnapshot_PausedRest {
    return { timer: p.timer, title: p.title };
  },

  /**
   * The rest worth keeping at a pause: one that is still counting.
   * No timer, or one already at zero, keeps nothing.
   */
  counting(
    timer: RestTimerState | undefined,
    a: { title: string; at: Date },
  ): ActiveSessionSnapshot_PausedRest | undefined {
    if (timer === undefined || !(RestTimerState.remaining(timer, { at: a.at }) > 0)) return undefined;
    return ActiveSessionSnapshot_PausedRest.make({ timer, title: a.title });
  },

  decode(json: JSONValue): ActiveSessionSnapshot_PausedRest {
    const c = new KeyedContainer(json);
    return { timer: c.decode("timer", decodeRestTimerState), title: c.decode("title", decodeString) };
  },
};

/**
 * A workout that has been started and not finished.
 *
 * Pausing must never cost a set. The snapshot carries every row as it
 * stands — written sets and pre-filled drafts alike — plus which exercise
 * the user was on, so reopening puts them back exactly where they were.
 *
 * It rides in the shared state blob under a key the web app does not read,
 * so a paused session survives a relaunch and follows the account across
 * devices. It is explicitly *not* a `TrainingSession`: nothing here counts
 * toward history, volume, records or progression until the session is
 * finished.
 */
export interface ActiveSessionSnapshot {
  dayID: string;
  dayLabel: string;
  startedAt: Date;
  currentIndex: number;
  results: ExerciseResult[];
  /** Per-exercise overrides of the proposal's rep target. */
  proposedReps: Record<string, number>;
  /**
   * Active workout time banked so far, in seconds. Time spent paused is
   * never in here.
   */
  activeSeconds: number;
  /**
   * Every slot as it stood, swaps and preserved work included. Resume
   * restores from these by position, which is what lets a substitute — and
   * the sets logged on it — survive a pause. `nil` in snapshots written
   * before slots were saved; those still restore by exercise id.
   */
  slots?: SessionSlot[];
  /**
   * The rest that was counting down when the session was paused. `nil` for
   * a session paused between rests, and in snapshots written before rests
   * were kept.
   */
  rest?: ActiveSessionSnapshot_PausedRest;
  /**
   * Set when the workout was saved while still open — the app left the
   * foreground mid-workout, or a set was just logged — rather than paused
   * by hand. Time away then still counts as training (a locked phone
   * between sets is a workout, not a pause), and a relaunch reopens the
   * workout instead of parking it on the home screen. `nil` for a pause.
   */
  runningSince?: Date;
}

export const ActiveSessionSnapshot = {
  /**
   * The longest stretch away that is still taken as training time; longer,
   * and the clock stops where the workout was left.
   */
  maxAwaySeconds: 2 * 60 * 60,

  make(p: {
    dayID: string;
    dayLabel: string;
    startedAt: Date;
    currentIndex: number;
    results: ExerciseResult[];
    proposedReps?: Record<string, number>;
    activeSeconds?: number;
    slots?: SessionSlot[];
    rest?: ActiveSessionSnapshot_PausedRest;
    runningSince?: Date;
  }): ActiveSessionSnapshot {
    return {
      dayID: p.dayID,
      dayLabel: p.dayLabel,
      startedAt: p.startedAt,
      currentIndex: p.currentIndex,
      results: p.results,
      proposedReps: p.proposedReps ?? {},
      activeSeconds: Math.max(0, p.activeSeconds ?? 0),
      slots: p.slots,
      rest: p.rest,
      runningSince: p.runningSince,
    };
  },

  /**
   * Active seconds on reopening: what was banked, plus the time away when
   * the workout was left running — capped, so a workout forgotten for a
   * day never claims a day of training.
   *
   * `activeSeconds(resumingAt:)` — named for its label, beside the stored
   * `activeSeconds`.
   */
  activeSecondsResumingAt(self: ActiveSessionSnapshot, a: { resumingAt: Date }): number {
    const runningSince = self.runningSince;
    if (runningSince === undefined) return self.activeSeconds;
    const away = Math.max(0, Math.trunc(timeIntervalSince(a.resumingAt, runningSince)));
    return self.activeSeconds + Math.min(away, ActiveSessionSnapshot.maxAwaySeconds);
  },

  /**
   * Left open (not paused) recently enough that reopening it is what the
   * lifter expects.
   */
  reopensOnLaunch(self: ActiveSessionSnapshot, a: { at: Date }): boolean {
    const runningSince = self.runningSince;
    if (runningSince === undefined) return false;
    return timeIntervalSince(a.at, runningSince) < ActiveSessionSnapshot.maxAwaySeconds;
  },

  /**
   * The rest a resumed session takes back. Rest is wall-clock time — it
   * kept running while the session was parked — so it comes back with the
   * time it has left and never more. One that ran out meanwhile is over,
   * and a session paused between rests gets none.
   */
  restToResume(self: ActiveSessionSnapshot, a: { at: Date }): ActiveSessionSnapshot_PausedRest | undefined {
    const rest = self.rest;
    if (rest === undefined || !(RestTimerState.remaining(rest.timer, { at: a.at }) > 0)) return undefined;
    return rest;
  },

  /** Sets actually written, for the resume prompt on the home screen. */
  loggedSetCount(self: ActiveSessionSnapshot): number {
    if (self.slots) return self.slots.reduce((total, slot) => total + SessionSlot.loggedSetCount(slot), 0);
    return self.results.flatMap((r) => r.sets).filter(LoggedSet.isLogged).length;
  },

  plannedSetCount(self: ActiveSessionSnapshot): number {
    if (self.slots) return self.slots.reduce((total, slot) => total + SessionSlot.setCount(slot), 0);
    return self.results.flatMap((r) => r.sets).length;
  },

  hasProgress(self: ActiveSessionSnapshot): boolean {
    return ActiveSessionSnapshot.loggedSetCount(self) > 0;
  },

  /**
   * Turns a paused workout into history, keeping only what was written.
   *
   * Used when the session is ended from the home screen rather than
   * resumed. Unwritten sets simply are not there — they count as not
   * trained, which carries no penalty anywhere in the engine.
   */
  finishedSession(self: ActiveSessionSnapshot, a: { id?: string } = {}): TrainingSession {
    const slots = self.slots;
    const results =
      slots?.flatMap((slot) => SessionSlot.results(slot)) ??
      self.results.map((result) =>
        ExerciseResult.make({
          exerciseID: result.exerciseID,
          name: result.name,
          sets: result.sets.filter(LoggedSet.isLogged),
        }),
      );
    // Measured against the prescription, exactly as a session finished on
    // screen is. Snapshots saved before slots cannot hold an added set and
    // keep the count they always used.
    const planned = ActiveSessionSnapshot.plannedSetCount(self);
    const completion =
      slots !== undefined
        ? SessionSlot.completion({ of: slots })
        : planned === 0
          ? 0
          : Math.trunc((ActiveSessionSnapshot.loggedSetCount(self) / planned) * 100);
    return TrainingSession.make({
      id: a.id ?? `${Math.trunc(self.startedAt.getTime())}`,
      date: self.startedAt,
      dayID: self.dayID,
      dayLabel: self.dayLabel,
      completion,
      kind: "workout",
      results,
      durationSeconds: self.activeSeconds,
      // Exact counts only where the prescription is known. An older
      // snapshot's rows need not cover every exercise of the day, so it
      // keeps showing its percentage instead.
      plannedSetCount: slots !== undefined ? SessionSlot.plannedSetCount({ of: slots }) : undefined,
      completedSetCount: slots !== undefined ? SessionSlot.completedSetCount({ of: slots }) : undefined,
    });
  },

  encode(self: ActiveSessionSnapshot): JSONValue {
    return encodeJSON(self);
  },

  /** Tolerates a snapshot written before duration, slots or rests were kept. */
  decode(json: JSONValue): ActiveSessionSnapshot {
    const c = new KeyedContainer(json);
    return {
      dayID: c.decode("dayID", decodeString),
      dayLabel: c.decode("dayLabel", decodeString),
      startedAt: c.decode("startedAt", decodeDate),
      currentIndex: c.decode("currentIndex", decodeInt),
      results: c.decode("results", decodeArray(ExerciseResult.decode)),
      proposedReps: c.decodeIfPresent("proposedReps", decodeDictionary(decodeInt)) ?? {},
      activeSeconds: c.decodeIfPresent("activeSeconds", decodeInt) ?? 0,
      slots: c.decodeIfPresent("slots", decodeArray(SessionSlot.decode)),
      rest: c.decodeIfPresent("rest", ActiveSessionSnapshot_PausedRest.decode),
      runningSince: c.decodeIfPresent("runningSince", decodeDate),
    };
  },
};
