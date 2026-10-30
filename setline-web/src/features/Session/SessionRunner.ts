// SessionRunner.swift — the live session: what is planned, what has been
// written, and the clock.
//
// The Swift `@Observable final class` is a TS class with the same members.
// Every change calls `notify()`; views read it through `useSessionRunner`,
// which redraws them, as `@Observable` does.
//
// Nothing here applies anything on the user's behalf. A proposal arrives
// pre-filled in the set row and is editable there — "de app stelt voor, de
// app past nooit toe".
import { useSyncExternalStore } from "react";
import type { AppState } from "../../data/AppState";
import { ActiveSessionSnapshot, ActiveSessionSnapshot_PausedRest } from "../../core/Domain/ActiveSession";
import {
  type DropStep, Exercise, ExerciseResult, LoggedSet, PlannedExercise, SetPrescription,
  type SetSide, type SideReps, TrainingSession, type WorkoutDay,
} from "../../core/Domain/Model";
import { SessionSlot, type SessionSlot_RemovedSet, type SessionSlot_UndoPoint } from "../../core/Domain/SessionSlot";
import { type ProgramReplacement, Substitution } from "../../core/Domain/Substitution";
import { SetFlags, SetModifiers, type ExerciseRole } from "../../core/Domain/Vocabulary";
import { WorkoutClock } from "../../core/Domain/WorkoutClock";
import { ExerciseCatalog } from "../../core/Catalog/ExerciseCatalogV1";
import { Calibration, type CalibrationPrompt } from "../../core/Engine/Calibration";
import { type ExerciseAppearance, ExerciseHistory } from "../../core/Engine/ExerciseHistory";
import { SessionPrescription } from "../../core/Engine/Fatigue";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { ProgressionEngine, type ProgressionProposal } from "../../core/Engine/ProgressionEngine";
import { ExerciseRecord, RecordsEngine } from "../../core/Engine/RecordsEngine";
import { type ReorderPlan, ReorderPlanner } from "../../core/Engine/ReorderPlan";
import { RestPrescription, RestTimerState } from "../../core/Engine/RestPrescription";
import { SetGridMode, type SetRowPresentation, SetRowPresenter } from "../../core/Engine/SetRowPresentation";
import type { SwapReason } from "../../core/Engine/SubstitutionRanking";
import { type WarmupSet, WarmupPlanner, WarmupPlanner_Context } from "../../core/Engine/WarmupPlanner";
import { closedRange } from "../../core/Support/range";
import { dec, deepEqual } from "../../core/Support/swift";
import { isSameDay, settingTime } from "../../core/Support/calendar";
import { RestActivity } from "./RestActivity";
import { RestNotifier } from "./RestNotifier";

/**
 * `SessionRunner.ExerciseSlot`. Everything that happened in this position:
 * the active exercise and its rows, work preserved from earlier swaps, and
 * the exact states an undo returns to. This is what a pause saves.
 */
export interface SessionRunner_ExerciseSlot {
  model: SessionSlot;
  readonly exercise: Exercise;
  readonly history: ExerciseHistory;
  readonly proposal: ProgressionProposal;
  /**
   * The exercise this slot stands in for today, resolved. `nil` when not
   * substituted — including after a permanent replacement.
   */
  readonly substitutedFrom?: Exercise;
}

export const SessionRunner_ExerciseSlot = {
  id(self: SessionRunner_ExerciseSlot): number {
    return self.model.position;
  },
  planned(self: SessionRunner_ExerciseSlot): PlannedExercise {
    return SessionSlot.activePlanned(self.model);
  },
  sets(self: SessionRunner_ExerciseSlot): LoggedSet[] {
    return self.model.active.sets;
  },
  /** `slot.sets = newValue` — returns the updated slot. */
  withSets(self: SessionRunner_ExerciseSlot, sets: LoggedSet[]): SessionRunner_ExerciseSlot {
    return { ...self, model: { ...self.model, active: { ...self.model.active, sets } } };
  },
  proposalDismissed(self: SessionRunner_ExerciseSlot): boolean {
    return self.model.active.proposalDismissed;
  },
  /** Work logged here under an exercise that has since been swapped out. */
  preserved(self: SessionRunner_ExerciseSlot): ExerciseResult[] {
    return self.model.preserved;
  },
  isComplete(self: SessionRunner_ExerciseSlot): boolean {
    return !SessionSlot.hasOpenSets(self.model);
  },
  hasStarted(self: SessionRunner_ExerciseSlot): boolean {
    return SessionSlot.loggedSetCount(self.model) > 0;
  },
};

/**
 * `SessionRunner.SetEntry` — everything one logged set can carry.
 *
 * Pause is a toggle and partial is a count, which is what keeps the two
 * apart: there is no "paused rep count" to confuse with a rep count, and
 * none to add onto one.
 */
export interface SessionRunner_SetEntry {
  weightKg: number;
  reps: number;
  rir?: number;
  failed: boolean;
  /**
   * How many of `reps` were performed paused. `nil` is none; a count
   * equal to `reps` is a set performed paused throughout.
   */
  pausedReps?: number;
  partialReps?: number;
  /**
   * The side of a one-sided exercise. `nil` keeps whatever the set
   * already says, so a correction from the sheet never drops it.
   */
  side?: SetSide;
  /** A drop set's lighter rounds. `nil` keeps what the set has. */
  drops?: DropStep[];
  /**
   * Reps per side: `undefined` keeps what the set has, `{ value: undefined }`
   * clears it (Swift's `.some(nil)`).
   */
  sideReps?: { value: SideReps | undefined };
}

export const SessionRunner_SetEntry = {
  isPaused(self: SessionRunner_SetEntry): boolean {
    return (self.pausedReps ?? 0) > 0;
  },
};

const S = SessionRunner_ExerciseSlot;

export class SessionRunner {
  // MARK: Observation

  private listeners = new Set<() => void>();
  private version = 0;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getVersion = (): number => this.version;
  /** Every view reading the runner draws again. */
  notify(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  readonly day: WorkoutDay;
  private _slots: SessionRunner_ExerciseSlot[];
  get slots(): SessionRunner_ExerciseSlot[] {
    return this._slots;
  }
  /** The calendar moment the workout began — its date, not its duration. */
  private _startedAt = new Date();
  get startedAt(): Date {
    return this._startedAt;
  }
  /**
   * Whether this session is being written down afterwards for a date that
   * has passed. A workout logged the next morning has a date but no honest
   * duration, and no rest to count down.
   *
   * Read from the date rather than held as a flag, so a retro entry that
   * was parked and picked up again still knows what it is.
   */
  get isLoggedAfterwards(): boolean {
    return !isSameDay(this._startedAt, new Date());
  }
  /** Duration is active workout time, banked across pauses. */
  private clock = WorkoutClock.make({ segmentStartedAt: new Date() });
  private _restTimer: RestTimerState | undefined;
  get restTimer(): RestTimerState | undefined {
    return this._restTimer;
  }
  /**
   * "Rust · primaire lift 3:00", fixed when the rest starts. Moving to
   * another exercise mid-rest must not relabel a countdown it did not start.
   */
  private _restTitle = "";
  get restTitle(): string {
    return this._restTitle;
  }
  /** Bumped once each time a running rest reaches zero — the haptic's cue. */
  private _restCompletions = 0;
  get restCompletions(): number {
    return this._restCompletions;
  }
  private restCompletionSignalled = false;
  private _now = new Date();
  get now(): Date {
    return this._now;
  }
  /**
   * The rest pill is one row until it is tapped open; opening it is the
   * reader's choice and stays theirs until the rest ends.
   */
  private _isTimerExpanded = false;
  get isTimerExpanded(): boolean {
    return this._isTimerExpanded;
  }
  set isTimerExpanded(v: boolean) {
    this._isTimerExpanded = v;
    this.notify();
  }
  /** The session exactly as it opened — fresh, or as it was resumed. */
  private openingSlots: SessionSlot[] = [];
  /** The rest it opened with: one carried back from a pause, or none. */
  private openingRest: RestTimerState | undefined;

  private _currentIndex = 0;
  get currentIndex(): number {
    return this._currentIndex;
  }
  set currentIndex(v: number) {
    this._currentIndex = v;
    this.notify();
  }
  private _editing: { slot: number; set: number } | undefined;
  get editing(): { slot: number; set: number } | undefined {
    return this._editing;
  }
  set editing(v: { slot: number; set: number } | undefined) {
    this._editing = v;
    this.notify();
  }
  /**
   * The next set sheet opens with `Partieel` already on — the pain flow's
   * "Beperk de beweging" promise, kept.
   */
  private _editingStartsPartial = false;
  get editingStartsPartial(): boolean {
    return this._editingStartsPartial;
  }
  set editingStartsPartial(v: boolean) {
    this._editingStartsPartial = v;
    this.notify();
  }

  private readonly display = NumberDisplay.english;
  private readonly exerciseNamed: (id: string) => Exercise;
  private readonly historyFor: (planned: PlannedExercise) => ExerciseHistory;
  /**
   * Exercises handed to a swap directly. A custom exercise is saved to the
   * account asynchronously, so for a moment the app-wide lookup does not
   * know it yet — and the session showed its id ("custom:sled") instead of
   * its name. The exercise the swap was given is the truth for that id.
   */
  private knownExercises: Record<string, Exercise> = {};

  constructor(a: { day: WorkoutDay; app: AppState; restoring?: ActiveSessionSnapshot; loggingFor?: Date }) {
    const { day, app } = a;
    const snapshot = a.restoring;
    const date = a.loggingFor;
    this.day = day;
    if (date) {
      // Midday on that date: far enough from either midnight that a time
      // zone cannot move the workout to the day before or after.
      this._startedAt = settingTime(date, 12, 0, 0);
    }
    const exerciseNamed = (id: string) => app.exercise(id);
    const historyFor = (planned: PlannedExercise) => app.history({ for: planned });
    this.exerciseNamed = exerciseNamed;
    this.historyFor = historyFor;
    // A lighter week cuts sets, never exercises, so progression state
    // survives it (TRAINING_LOGIC §11.2).
    const deload = app.activeDeload;
    this._slots = day.exercises.map((planned, index) => {
      const prescribed = SessionPrescription.planned(planned, { deload });
      const slot = SessionRunner.resolveStatic(
        SessionSlot.make({ position: index, plan: prescribed, exerciseName: exerciseNamed(prescribed.exerciseID).name }),
        exerciseNamed,
        historyFor,
      );
      // Pre-filled from the proposal, or from the previous session, or
      // left blank when there is nothing honest to put there.
      return { ...slot, model: SessionSlot.prefillOpenSets(slot.model, { weightKg: SessionRunner.prefillWeight(slot) }) };
    });

    if (snapshot) this.restoreFrom(snapshot);
    if (date !== undefined) this._restTimer = undefined;
    // A fresh stretch starts now either way; a resumed session carries its
    // banked time in, rather than recomputing from `startedAt`.
    // A workout left open (not paused) kept running while it was away.
    this.clock = WorkoutClock.make({
      accumulatedSeconds: snapshot ? ActiveSessionSnapshot.activeSecondsResumingAt(snapshot, { resumingAt: new Date() }) : 0,
      segmentStartedAt: new Date(),
    });
    this.openingSlots = this._slots.map((s) => s.model);
    this.openingRest = this._restTimer;
  }

  /**
   * Nothing has been written, swapped, added or adjusted since the session
   * opened — the rest included. Leaving it then is just leaving: there is
   * no state to park, and parking it anyway would leave a "paused session"
   * behind that nobody started. A rest skipped or adjusted after a resume
   * is a change, or the pause would hand the old one back next time.
   */
  get isUntouched(): boolean {
    return deepEqual(this._slots.map((s) => s.model), this.openingSlots) && deepEqual(this._restTimer, this.openingRest);
  }

  private static resolveStatic(
    model: SessionSlot,
    exerciseNamed: (id: string) => Exercise,
    historyFor: (planned: PlannedExercise) => ExerciseHistory,
  ): SessionRunner_ExerciseSlot {
    const planned = SessionSlot.activePlanned(model);
    let exercise = exerciseNamed(model.active.exerciseID);
    // An id that resolves to nothing comes back named after itself. The
    // name saved with the rows is the better truth.
    if (exercise.name === exercise.id && model.active.exerciseName !== "") {
      exercise = { ...exercise, name: model.active.exerciseName };
    }
    const history = historyFor(planned);
    return {
      model,
      exercise,
      history,
      proposal: ProgressionEngine.proposal({ planned, exercise, history }),
      substitutedFrom: model.active.substitutedFromID !== undefined ? exerciseNamed(model.active.substitutedFromID) : undefined,
    };
  }

  private resolve(model: SessionSlot): SessionRunner_ExerciseSlot {
    const known = this.knownExercises;
    const lookup = this.exerciseNamed;
    return SessionRunner.resolveStatic(model, (id) => known[id] ?? lookup(id), this.historyFor);
  }

  private static prefillWeight(slot: SessionRunner_ExerciseSlot): number | undefined {
    return SessionRunner.prefillWeightFrom({ proposal: slot.proposal, history: slot.history });
  }

  /** The proposal's weight, or the previous session's when there is none. */
  private static prefillWeightFrom(a: { proposal: ProgressionProposal; history: ExerciseHistory }): number | undefined {
    return a.proposal.weightKg ?? ExerciseHistory.mostRecent(a.history)?.sets[0]?.weightKg;
  }

  /**
   * What a session started now would open this exercise with: the same
   * weight and per-set rep targets the rows are prefilled with. Artboard
   * 09's "Vandaag 50 kg × 8." reads this, so the home screen never names a
   * target the session does not start from.
   */
  static openingTarget(a: { for: PlannedExercise; app: AppState }): { weightKg: number; reps: number[] } | undefined {
    const { app } = a;
    const prescribed = SessionPrescription.planned(a.for, { deload: app.activeDeload });
    const history = app.history({ for: prescribed });
    const proposal = ProgressionEngine.proposal({
      planned: prescribed, exercise: app.exercise(prescribed.exerciseID), history,
    });
    const weight = SessionRunner.prefillWeightFrom({ proposal, history });
    const reps = proposal.setTargets;
    if (weight === undefined || !reps || reps.length === 0) return undefined;
    return { weightKg: weight, reps };
  }

  /** Replaces one slot, as Swift's `slots[i] = …` / `slots[i].x = …` does. */
  private setSlot(index: number, slot: SessionRunner_ExerciseSlot): void {
    const next = [...this._slots];
    next[index] = slot;
    this._slots = next;
  }

  private setModel(index: number, model: SessionSlot): void {
    this.setSlot(index, { ...this._slots[index], model });
  }

  private hasSlot(index: number): boolean {
    return index >= 0 && index < this._slots.length;
  }

  // MARK: - Pause and resume

  /**
   * Puts the session back exactly as it was left.
   *
   * A snapshot with slots describes the session completely — each slot
   * carries its own plan, its swaps and its preserved work — so it is
   * restored by position, and a substitute comes back as the substitute.
   * Snapshots written before slots were saved still match rows by id.
   */
  private restoreFrom(snapshot: ActiveSessionSnapshot): void {
    const saved = snapshot.slots;
    if (saved && saved.length > 0) {
      // In the order they were saved: exercises can be moved during a
      // session, and a resume keeps the order they were moved into.
      this._slots = saved.map((m) => this.resolve(m));
    } else {
      for (const result of snapshot.results) {
        const index = this._slots.findIndex((s) => S.planned(s).exerciseID === result.exerciseID);
        if (index < 0) continue;
        let model = this._slots[index].model;
        model = SessionSlot.restoreLegacyRows(model, result.sets);
        const legacyTarget = snapshot.proposedReps[result.exerciseID];
        const base = this._slots[index].proposal.setTargets?.[0];
        if (legacyTarget !== undefined && base !== undefined) {
          model = { ...model, active: { ...model.active, repTargetOffset: legacyTarget - base } };
        }
        this.setSlot(index, this.resolve(model));
      }
    }
    this._currentIndex = Math.min(Math.max(0, snapshot.currentIndex), Math.max(0, this._slots.length - 1));
    this._startedAt = snapshot.startedAt;
    // A rest that was counting when the session was paused comes back
    // with the time it has left: it kept running while the session was
    // parked, so nothing is invented. One that ran out meanwhile is over,
    // and a session paused between rests opens without a timer.
    const rest = ActiveSessionSnapshot.restToResume(snapshot, { at: new Date() });
    if (rest) {
      this._restTimer = rest.timer;
      this._restTitle = rest.title;
      this.restCompletionSignalled = false;
    } else {
      this._restTimer = undefined;
    }
  }

  snapshot(): ActiveSessionSnapshot {
    return ActiveSessionSnapshot.make({
      dayID: this.day.id,
      dayLabel: this.day.short,
      startedAt: this._startedAt,
      currentIndex: this._currentIndex,
      // Every row, as readers written before slots were saved expect.
      results: this._slots.flatMap((slot) => [
        ...slot.model.preserved,
        ExerciseResult.make({
          exerciseID: slot.model.active.exerciseID,
          name: slot.model.active.exerciseName,
          sets: slot.model.active.sets,
        }),
      ]),
      activeSeconds: WorkoutClock.activeSeconds(this.clock, { at: new Date() }),
      slots: this._slots.map((s) => s.model),
      rest: ActiveSessionSnapshot_PausedRest.counting(this._restTimer, { title: this._restTitle, at: new Date() }),
    });
  }

  get current(): SessionRunner_ExerciseSlot {
    return this._slots[Math.min(this._currentIndex, this._slots.length - 1)];
  }

  /**
   * The proposal sits above set 1 until set 1 exists, then steps aside so
   * the row's own lime — a PR, a positive delta — is the screen's one
   * meaning.
   */
  get showsProposal(): boolean {
    const current = this.current;
    if (S.sets(current).length === 0 || this.needsCalibration({ slotIndex: this._currentIndex })) return false;
    return !S.proposalDismissed(current) && !(S.sets(current)[0] ? LoggedSet.isLogged(S.sets(current)[0]) : false);
  }

  get elapsedSeconds(): number {
    return WorkoutClock.activeSeconds(this.clock, { at: this._now });
  }

  get completedSetCount(): number {
    return this._slots.reduce((t, s) => t + SessionSlot.loggedSetCount(s.model), 0);
  }
  get plannedSetCount(): number {
    return this._slots.reduce((t, s) => t + SessionSlot.setCount(s.model), 0);
  }
  get hasProgress(): boolean {
    return this.completedSetCount > 0;
  }
  /** Every open row in every slot has been written. */
  get isComplete(): boolean {
    return this._slots.every(S.isComplete);
  }

  // MARK: - Calibration

  /**
   * True when this exercise has nothing at all to compare against, so the
   * app asks for a weight instead of proposing one (artboard 28).
   */
  needsCalibration(a: { slotIndex: number }): boolean {
    return Calibration.isNeeded({ history: this._slots[a.slotIndex].history });
  }

  calibrationPrompt(a: { slotIndex: number }): CalibrationPrompt | undefined {
    const slot = this._slots[a.slotIndex];
    if (!this.needsCalibration(a) || S.sets(slot).length === 0) return undefined;
    if (S.sets(slot)[0] && LoggedSet.isLogged(S.sets(slot)[0])) return undefined;
    // A substitute with no history says where it came from, which is the
    // difference between "we know nothing" and "this is a different
    // exercise" (artboard 28 vs 28b).
    return Calibration.prompt({
      for: slot.exercise,
      substitutedFrom: slot.substitutedFrom?.name.toLowerCase(),
    });
  }

  /** "80 kg × 8 · RIR 2" once the calibration set is in. */
  calibrationSummary(a: { slotIndex: number }): string | undefined {
    const first = S.sets(this._slots[a.slotIndex])[0];
    if (!this.needsCalibration(a) || !first || !LoggedSet.isLogged(first)) return undefined;
    return Calibration.summary({ for: first });
  }

  /**
   * Set when the calibration set came in at RIR 3 or more, so set 2 was
   * prefilled one increment higher (§12.3).
   */
  private _calibrationSteppedUp = new Set<string>();
  get calibrationSteppedUp(): Set<string> {
    return this._calibrationSteppedUp;
  }

  gridMode(a: { slotIndex: number }): SetGridMode {
    if (!this.needsCalibration(a)) return SetGridMode.history;
    const first = S.sets(this._slots[a.slotIndex])[0];
    if (!first || !LoggedSet.isLogged(first)) return SetGridMode.calibrationPending;
    return SetGridMode.calibrated({ baseline: first });
  }

  /**
   * `nil` before the calibration set: artboard 28 draws that grid without
   * a header, because its columns have nothing to compare yet.
   */
  columnHeader(a: { slotIndex: number }): string | undefined {
    switch (this.gridMode(a).kind) {
      case "history":
        return this.columnHeaderDate;
      case "calibrationPending":
        return undefined;
      case "calibrated":
        return "vs set 1";
    }
  }

  /** The row the sheet should open on: the first unwritten set. */
  nextIndex(a: { in: SessionRunner_ExerciseSlot }): number | undefined {
    const i = S.sets(a.in).findIndex((s) => !LoggedSet.isLogged(s));
    return i >= 0 ? i : undefined;
  }

  get nextSlotIndex(): number | undefined {
    return this._currentIndex + 1 < this._slots.length ? this._currentIndex + 1 : undefined;
  }

  // MARK: - Logging

  /**
   * Tap 2 of 2. Writes the set and starts the rest, in that order.
   *
   * It deliberately does **not** move to the next exercise: the advice
   * line the engine computes for the last set has to be readable, and
   * jumping away replaced it in the same frame.
   */
  log(a: { slotIndex: number; setIndex: number; entry: SessionRunner_SetEntry }): void {
    const { slotIndex, setIndex, entry } = a;
    if (!this.hasSlot(slotIndex)) return;
    const rows = S.sets(this._slots[slotIndex]);
    if (!(setIndex >= 0 && setIndex < rows.length)) return;
    const planned = S.planned(this._slots[slotIndex]);
    let set: LoggedSet = { ...rows[setIndex] };

    set.weightKg = entry.weightKg;
    // `reps` is the reps performed. Paused reps are never added on, and
    // partials are counted separately — the web app summed both, which is
    // what TRAINING_LOGIC §15 change 2 and addendum 16R forbid.
    set.reps = entry.reps;
    set.rirReported = entry.rir;

    // Pause is a property of the set (§9), carrying the planned pause
    // length when there is one. A pause added to an exercise that is not
    // planned paused makes the set incomparable to that exercise's series,
    // which is exactly what keeps it out of its progression.
    const isPaused = SessionRunner_SetEntry.isPaused(entry);
    set.modifiers = SetModifiers.make({
      pauseEnabled: isPaused,
      pauseSeconds: isPaused ? (planned.modifiers.pauseSeconds ?? 2) : undefined,
      restrictedROM: planned.modifiers.restrictedROM,
    });

    const partial = (entry.partialReps ?? 0) > 0 ? entry.partialReps : undefined;
    set.partialReps = partial;
    // Paused reps live inside the set that holds them: "120 kg × 6, de
    // laatste 2 gepauzeerd" is six reps with two of them paused, so the
    // count never adds reps, volume or a second set. Where every rep was
    // paused the set is simply a paused set, and the count goes.
    set.pausedReps = LoggedSet.pausedRepsWithin(entry.pausedReps, { reps: set.reps });

    let flags: SetFlags = 0;
    if (entry.failed) flags = SetFlags.insert(flags, SetFlags.failed);
    if (partial !== undefined) flags = SetFlags.insert(flags, SetFlags.partialReps);
    set.flags = flags;

    // §12.5: the set belongs to the substitute's series, and remembers
    // which exercise it stood in for.
    set.substitutedFrom = this._slots[slotIndex].substitutedFrom?.id;
    if (entry.side !== undefined) set.side = entry.side;
    if (entry.drops !== undefined) set.drops = entry.drops.filter((d) => d.weightKg >= 0 && d.reps > 0);
    if (entry.sideReps !== undefined) set.sideReps = entry.sideReps.value;
    // Per-side reps only mean something on a set done on both sides, and
    // only while they differ.
    if (set.side !== "both" || (set.sideReps !== undefined && set.sideReps.left === set.sideReps.right)) {
      set = { ...set, sideReps: undefined };
    }
    let sets = [...rows];
    sets[setIndex] = set;
    this.setSlot(slotIndex, S.withSets(this._slots[slotIndex], sets));

    // The calibration set is what the rest of the exercise is built on:
    // once it is in, the remaining rows take its weight — one increment
    // higher when it was clearly easy (§12.3).
    if (setIndex === 0 && this.needsCalibration({ slotIndex })) {
      const prefill = Calibration.prefill({ after: set, exercise: this._slots[slotIndex].exercise });
      sets = S.sets(this._slots[slotIndex]).map((row, index) =>
        index > 0 && !LoggedSet.isLogged(row) ? { ...row, weightKg: prefill.weightKg } : row,
      );
      this.setSlot(slotIndex, S.withSets(this._slots[slotIndex], sets));
      if (prefill.steppedUp) {
        this._calibrationSteppedUp = new Set(this._calibrationSteppedUp).add(S.planned(this._slots[slotIndex]).exerciseID);
      }
    }

    // What the countdown at the top of the screen names.
    RestActivity.exercise = this._slots[slotIndex].exercise.name;
    const after = S.sets(this._slots[slotIndex]);
    const open = after.findIndex((s) => !LoggedSet.isLogged(s));
    if (open >= 0) {
      RestActivity.next = `Set ${open + 1} of ${after.length}`;
    } else if (slotIndex + 1 < this._slots.length) {
      RestActivity.next = this._slots[slotIndex + 1].exercise.name;
    } else {
      RestActivity.next = "Finish your workout";
    }
    this.startRest(S.planned(this._slots[slotIndex]));
    this.notify();
  }

  didStepUpAfterCalibration(a: { slotIndex: number }): boolean {
    return this._calibrationSteppedUp.has(S.planned(this._slots[a.slotIndex]).exerciseID);
  }

  advance(): void {
    const next = this.nextSlotIndex;
    if (next === undefined) return;
    this.currentIndex = next;
  }

  dismissProposal(a: { slotIndex: number }): void {
    if (!this.hasSlot(a.slotIndex)) return;
    const slot = this._slots[a.slotIndex];
    this.setModel(a.slotIndex, { ...slot.model, active: { ...slot.model.active, proposalDismissed: true } });
    this.notify();
  }

  /**
   * Artboard 29 puts GEWICHT / MIK OP steppers in the proposal card. They
   * change what the unwritten rows are pre-filled with; they never write a
   * set and never change the plan.
   */
  adjustProposedWeight(a: { slotIndex: number; by: number }): void {
    if (!this.hasSlot(a.slotIndex)) return;
    const current = this.proposedWeight({ slotIndex: a.slotIndex }) ?? 0;
    const next = Math.max(0, dec(current + a.by));
    const slot = this._slots[a.slotIndex];
    this.setSlot(a.slotIndex, S.withSets(slot, S.sets(slot).map((s) => (LoggedSet.isLogged(s) ? s : { ...s, weightKg: next }))));
    this.notify();
  }

  /**
   * Moves every row's target together, so a mixed prescription keeps its
   * shape — `5 · 6 · 6` becomes `6 · 7 · 7`, never `6 · 6 · 6`.
   */
  adjustProposedReps(a: { slotIndex: number; by: number }): void {
    if (!this.hasSlot(a.slotIndex)) return;
    const slot = this._slots[a.slotIndex];
    const base = slot.proposal.setTargets ?? [];
    const lowest = 1 - (base.length ? Math.min(...base) : 1);
    const offset = slot.model.active.repTargetOffset + a.by;
    this.setModel(a.slotIndex, { ...slot.model, active: { ...slot.model.active, repTargetOffset: Math.max(lowest, offset) } });
    this.notify();
  }

  proposedWeight(a: { slotIndex: number }): number | undefined {
    return S.sets(this._slots[a.slotIndex]).find((s) => !LoggedSet.isLogged(s))?.weightKg;
  }

  /** The first row's target — the single number `Mik op` shows. */
  proposedRepTarget(a: { slotIndex: number }): number {
    return (
      this.targetReps({ slotIndex: a.slotIndex, setIndex: 0 }) ??
      S.planned(this._slots[a.slotIndex]).sets[0]?.repRange.upperBound ??
      8
    );
  }

  /** What SETLINE proposes for one row, from that row's own range. */
  targetReps(a: { slotIndex: number; setIndex: number }): number | undefined {
    if (!this.hasSlot(a.slotIndex)) return undefined;
    const base = this._slots[a.slotIndex].proposal.setTargets;
    if (!base || !(a.setIndex >= 0 && a.setIndex < base.length)) return undefined;
    return Math.max(1, base[a.setIndex] + this._slots[a.slotIndex].model.active.repTargetOffset);
  }

  proposedTargets(a: { slotIndex: number }): number[] | undefined {
    if (!this.hasSlot(a.slotIndex)) return undefined;
    const base = this._slots[a.slotIndex].proposal.setTargets;
    if (!base) return undefined;
    const offset = this._slots[a.slotIndex].model.active.repTargetOffset;
    return base.map((t) => Math.max(1, t + offset));
  }

  // MARK: - Substitution

  /**
   * An exercise the plan doesn't have, added for this session: three
   * working sets of 8–12, pre-filled from its own history, and opened.
   * Saved with the session like any other; the plan is not touched.
   */
  addExercise(exercise: Exercise): number {
    this.knownExercises = { ...this.knownExercises, [exercise.id]: exercise };
    const planned = PlannedExercise.make({
      exerciseID: exercise.id,
      role: ExerciseCatalog.roles[exercise.id] ?? "accessory",
      sets: Array.from({ length: 3 }, () => SetPrescription.make({ repRange: closedRange(8, 12) })),
    });
    const positions = this._slots.map((s) => s.model.position);
    const position = (positions.length ? Math.max(...positions) : -1) + 1;
    const slot = this.resolve(SessionSlot.make({ position, plan: planned, exerciseName: exercise.name }));
    const filled = { ...slot, model: SessionSlot.prefillOpenSets(slot.model, { weightKg: SessionRunner.prefillWeight(slot) }) };
    this._slots = [...this._slots, filled];
    this._currentIndex = this._slots.length - 1;
    this.notify();
    return this._currentIndex;
  }

  /**
   * Moves an exercise to another place in the session; the one on screen
   * stays on screen.
   */
  moveExercise(a: { from: number; to: number }): void {
    const source = a.from;
    const destination = a.to;
    if (!this.hasSlot(source) || !this.hasSlot(destination) || source === destination) return;
    const onScreen = S.id(this._slots[this._currentIndex]);
    const next = [...this._slots];
    const [moved] = next.splice(source, 1);
    next.splice(destination, 0, moved);
    this._slots = next;
    const found = next.findIndex((s) => S.id(s) === onScreen);
    this._currentIndex = found >= 0 ? found : this._currentIndex;
    this.notify();
  }

  /** Takes back an exercise just added, while nothing is logged on it. */
  removeAddedExercise(a: { at: number }): void {
    const index = a.at;
    if (!this.hasSlot(index) || SessionSlot.loggedSetCount(this._slots[index].model) !== 0 || !(this._slots.length > 1)) return;
    const next = [...this._slots];
    next.splice(index, 1);
    this._slots = next;
    this._currentIndex = Math.min(this._currentIndex, this._slots.length - 1);
    this.notify();
  }

  /**
   * Swaps this slot to another exercise for today only.
   *
   * Only the rows still open move. Sets already written stay with the
   * exercise they were written under, the prescription of every moved row
   * survives verbatim, and the load does not: §12.3 forbids converting a
   * weight between exercises, so the rows come back empty and a substitute
   * with no history lands in calibration.
   *
   * The origin's progression state freezes for this occurrence: nothing
   * advances it, nothing resets it, and sitting a session out carries no
   * penalty. The rest timer keeps running — a swap usually happens *during*
   * rest.
   */
  substitute(a: { slotIndex: number; with: Exercise; reason: SwapReason }): void {
    this.change({ slotIndex: a.slotIndex, to: a.with, temporary: true, reason: a.reason });
  }

  /**
   * Writes a program change into this session. From here on the new
   * exercise simply *is* the programmed one, so nothing is marked as
   * standing in; the change itself is recorded as a `ProgramReplacement`.
   */
  replaceInProgram(a: { slotIndex: number; with: Exercise; recording: ProgramReplacement }): void {
    this.change({ slotIndex: a.slotIndex, to: a.with, temporary: false, reason: "preference", replacement: a.recording });
  }

  private change(a: {
    slotIndex: number; to: Exercise; temporary: boolean; reason: SwapReason; replacement?: ProgramReplacement;
  }): void {
    const { slotIndex, to: exercise } = a;
    if (!this.hasSlot(slotIndex)) return;
    let model = this._slots[slotIndex].model;
    const origin = model.active.substitutedFromID ?? model.active.exerciseID;
    model = SessionSlot.swap(model, { to: exercise.id, name: exercise.name, temporary: a.temporary, replacement: a.replacement });
    this.knownExercises = { ...this.knownExercises, [exercise.id]: exercise };

    const resolved = this.resolve(model);
    const filled = { ...resolved, model: SessionSlot.prefillOpenSets(resolved.model, { weightKg: SessionRunner.prefillWeight(resolved) }) };
    this.setSlot(slotIndex, filled);

    let subs = this._substitutions.filter((s) => s.originExerciseID !== origin);
    const standsInFor = filled.model.active.substitutedFromID;
    if (standsInFor !== undefined) {
      subs = [...subs, Substitution.make({ originExerciseID: standsInFor, substituteExerciseID: exercise.id, reason: a.reason })];
    }
    this._substitutions = subs;
    this.notify();
  }

  /**
   * Reverses the most recent swap in this slot exactly. Sets written on the
   * exercise that leaves stay in the session as their own result.
   *
   * Returns the change it reversed, so a permanent one can be taken out of
   * the program as well. `ifLatestIs` keeps a late undo — the toast's,
   * after the header's — from reversing a different change.
   */
  undoChange(a: { slotIndex: number; ifLatestIs?: string }): SessionSlot_UndoPoint | undefined {
    const { slotIndex } = a;
    if (!this.hasSlot(slotIndex)) return undefined;
    const before = this._slots[slotIndex].model;
    const point = SessionSlot.latestUndo(before);
    if (!point) return undefined;
    const [model, undone] = SessionSlot.undo(before, { ifLatestIs: a.ifLatestIs });
    if (!undone) return undefined;
    this.setSlot(slotIndex, this.resolve(model));
    if (model.active.substitutedFromID === undefined) {
      this._substitutions = this._substitutions.filter((s) => s.originExerciseID !== model.active.exerciseID);
    }
    this.notify();
    return point;
  }

  /** The change an undo in this slot would reverse right now. */
  latestUndo(a: { slotIndex: number }): SessionSlot_UndoPoint | undefined {
    return this.hasSlot(a.slotIndex) ? SessionSlot.latestUndo(this._slots[a.slotIndex].model) : undefined;
  }

  /**
   * Swaps made during this session, for the summary and for the nudge that
   * offers a program change after the same pair repeats.
   */
  private _substitutions: Substitution[] = [];
  get substitutions(): Substitution[] {
    return this._substitutions;
  }

  substitutedOrigin(a: { slotIndex: number }): Exercise | undefined {
    return this.hasSlot(a.slotIndex) ? this._slots[a.slotIndex].substitutedFrom : undefined;
  }

  /** Whether the exercise on screen already has a written set. */
  hasLoggedSets(a: { slotIndex: number }): boolean {
    return this.hasSlot(a.slotIndex) && S.sets(this._slots[a.slotIndex]).some(LoggedSet.isLogged);
  }

  /**
   * Every exercise in today's session, in any slot and under any swap.
   * None of them is ever offered as a substitute.
   */
  get sessionExerciseIDs(): Set<string> {
    return new Set(
      this._slots.flatMap((slot) => [
        slot.model.plan.exerciseID,
        slot.model.active.exerciseID,
        ...slot.model.preserved.map((r) => r.exerciseID),
      ]),
    );
  }

  /**
   * Takes load off the sets that are still open, without leaving the
   * exercise. One decrement per step is a real change on a machine and a
   * modest one on a barbell — and it is pre-filled, not applied: the user
   * still logs it. Returns the rows as they were, for undo.
   */
  reduceLoad(a: { slotIndex: number; steps?: number }): LoggedSet[] {
    const steps = a.steps ?? 2;
    if (!this.hasSlot(a.slotIndex)) return [];
    const slot = this._slots[a.slotIndex];
    const previous = S.sets(slot);
    const increment = Exercise.incrementKg(slot.exercise);
    this.setSlot(
      a.slotIndex,
      S.withSets(
        slot,
        previous.map((s) => (LoggedSet.isLogged(s) ? s : { ...s, weightKg: Math.max(0, dec((s.weightKg ?? 0) - increment * steps)) })),
      ),
    );
    this.notify();
    return previous;
  }

  /** Puts pre-filled weights back. Written rows are never touched. */
  restoreOpenWeights(a: { slotIndex: number; from: LoggedSet[] }): void {
    if (!this.hasSlot(a.slotIndex)) return;
    const previous = a.from;
    const slot = this._slots[a.slotIndex];
    this.setSlot(
      a.slotIndex,
      S.withSets(
        slot,
        S.sets(slot).map((s, index) =>
          index < previous.length && !LoggedSet.isLogged(s) ? { ...s, weightKg: previous[index].weightKg } : s,
        ),
      ),
    );
    this.notify();
  }

  /**
   * Opens the next open set with `Partieel` already on. `false` when no
   * set is left open.
   */
  beginPartialSet(a: { slotIndex: number }): boolean {
    if (!this.hasSlot(a.slotIndex)) return false;
    const next = this.nextIndex({ in: this._slots[a.slotIndex] });
    if (next === undefined) return false;
    this._currentIndex = a.slotIndex;
    this._editingStartsPartial = true;
    this._editing = { slot: a.slotIndex, set: next };
    this.notify();
    return true;
  }

  // MARK: - Added sets

  /**
   * Adds a working set to this exercise, for this session only.
   *
   * The row is pre-filled from the most recent working set and is logged
   * through the same sheet as every other row; adding it writes nothing.
   * The program is not touched: the row has no prescription, and
   * progression never reads it as one of the prescribed sets.
   */
  addSet(a: { slotIndex: number }): LoggedSet | undefined {
    if (!this.hasSlot(a.slotIndex)) return undefined;
    const fallback = SessionRunner.prefillWeight(this._slots[a.slotIndex]);
    const [model, row] = SessionSlot.addSet(this._slots[a.slotIndex].model, { fallbackWeightKg: fallback });
    this.setModel(a.slotIndex, model);
    this.notify();
    return row;
  }

  isAddedSet(a: { slotIndex: number; setIndex: number }): boolean {
    if (!this.hasSlot(a.slotIndex)) return false;
    const sets = S.sets(this._slots[a.slotIndex]);
    if (!(a.setIndex >= 0 && a.setIndex < sets.length)) return false;
    return sets[a.setIndex].origin === "sessionAdded";
  }

  /**
   * Takes an added row back out, logged or not, and returns what an undo
   * needs to put it back. Prescribed rows are never removed: leaving one
   * open is what skipping it means.
   */
  removeAddedSet(a: { slotIndex: number; setIndex: number }): SessionSlot_RemovedSet | undefined {
    if (!this.hasSlot(a.slotIndex)) return undefined;
    // The rows after it renumber, so a sheet open on this exercise would
    // be pointing at a different set.
    if (this._editing?.slot === a.slotIndex) {
      this._editing = undefined;
      this._editingStartsPartial = false;
    }
    const [model, removed] = SessionSlot.removeAddedSet(this._slots[a.slotIndex].model, { at: a.setIndex });
    this.setModel(a.slotIndex, model);
    this.notify();
    return removed;
  }

  /**
   * The row "Remove set" takes: the last one still open. Done work is
   * never removed from the list this way, and an exercise keeps one row.
   */
  removableSetIndex(a: { slotIndex: number }): number | undefined {
    if (!this.hasSlot(a.slotIndex) || !(S.sets(this._slots[a.slotIndex]).length > 1)) return undefined;
    const i = S.sets(this._slots[a.slotIndex]).findLastIndex((s) => !LoggedSet.isLogged(s));
    return i >= 0 ? i : undefined;
  }

  /**
   * Takes one open row out for today, prescribed or added. The program is
   * untouched; the session simply asks one set fewer.
   */
  removeSet(a: { slotIndex: number; setIndex: number }): SessionSlot_RemovedSet | undefined {
    if (!this.hasSlot(a.slotIndex)) return undefined;
    if (this._editing?.slot === a.slotIndex) {
      this._editing = undefined;
      this._editingStartsPartial = false;
    }
    const [model, removed] = SessionSlot.removeSet(this._slots[a.slotIndex].model, { at: a.setIndex });
    this.setModel(a.slotIndex, model);
    this.notify();
    return removed;
  }

  restore(removed: SessionSlot_RemovedSet, a: { slotIndex: number }): void {
    if (!this.hasSlot(a.slotIndex)) return;
    this.setModel(a.slotIndex, SessionSlot.restore(this._slots[a.slotIndex].model, removed));
    this.notify();
  }

  /**
   * The undo on "Set toegevoegd", honoured only while the row is still
   * untouched. Once it is logged it is real work, and removing it asks
   * first.
   */
  removeUntouchedAddedSet(a: { slotIndex: number; setID: string }): boolean {
    if (!this.hasSlot(a.slotIndex)) return false;
    const sets = S.sets(this._slots[a.slotIndex]);
    const position = sets.findIndex((s) => s.id === a.setID);
    if (position < 0 || LoggedSet.isLogged(sets[position])) return false;
    return this.removeAddedSet({ slotIndex: a.slotIndex, setIndex: position }) !== undefined;
  }

  /**
   * The reps a row's sheet opens on.
   *
   * A prescribed row takes its own target. An added row has none, so it
   * repeats the most recent written set — or, before anything is written,
   * aims where the last prescribed set does.
   */
  suggestedReps(a: { slotIndex: number; setIndex: number }): number | undefined {
    if (!this.isAddedSet(a)) return this.targetReps(a);
    const model = this._slots[a.slotIndex].model;
    const written = SessionSlot.mostRecentWrittenSet(model);
    if (written) return written.reps;
    const planned = S.planned(this._slots[a.slotIndex]);
    return (
      this.targetReps({ slotIndex: a.slotIndex, setIndex: SessionSlot.prescribedRows(model).length - 1 }) ??
      planned.sets[planned.sets.length - 1]?.repRange.upperBound
    );
  }

  /**
   * The reps a row opens on — in the input card and in the sheet alike, so
   * the two can never disagree about what one tap would write.
   *
   * The calibration set aims at its own target; a row that already holds
   * reps keeps them; otherwise SETLINE's proposal for that row, then what
   * the same set was last time, then the top of the row's range.
   */
  openingReps(a: { slotIndex: number; setIndex: number }): number {
    const { slotIndex, setIndex } = a;
    if (!this.hasSlot(slotIndex)) return 0;
    const slot = this._slots[slotIndex];
    const sets = S.sets(slot);
    if (!(setIndex >= 0 && setIndex < sets.length)) return 0;
    const row = sets[setIndex];
    if (setIndex === 0 && !LoggedSet.isLogged(row) && this.needsCalibration({ slotIndex })) return Calibration.targetReps;
    if (row.reps > 0) return row.reps;
    const reference = ExerciseHistory.mostRecent(slot.history)?.sets.find((s) => s.index === setIndex);
    const planned = S.planned(slot);
    const plannedTop =
      setIndex >= 0 && setIndex < planned.sets.length
        ? planned.sets[setIndex].repRange.upperBound
        : (planned.sets[planned.sets.length - 1]?.repRange.upperBound ?? 8);
    return this.suggestedReps({ slotIndex, setIndex }) ?? reference?.reps ?? plannedTop;
  }

  /**
   * The first exercise that still has a set open, for when the one on
   * screen is done and it was the last in the list.
   */
  get firstOpenSlotIndex(): number | undefined {
    const i = this._slots.findIndex((s) => !S.isComplete(s));
    return i >= 0 ? i : undefined;
  }

  // MARK: - Reorder

  /** The "do something else now and come back" offer, when one exists. */
  reorderPlan(a: { slotIndex: number }): ReorderPlan | undefined {
    if (!this.hasSlot(a.slotIndex)) return undefined;
    const later = this._slots.slice(a.slotIndex + 1).map((s) => ({
      exercise: s.exercise,
      role: S.planned(s).role,
      hasStarted: S.hasStarted(s),
    }));
    return ReorderPlanner.plan({
      current: this._slots[a.slotIndex].exercise,
      currentIndex: a.slotIndex,
      currentIsComplete: S.isComplete(this._slots[a.slotIndex]),
      later,
    });
  }

  /**
   * Moves to the later exercise. Nothing is reordered in the plan itself —
   * the session simply carries on somewhere else, and the exercise left
   * behind is still there to come back to. The rest timer keeps running.
   */
  takeReorder(plan: ReorderPlan): void {
    this.currentIndex = plan.candidateIndex;
  }

  // MARK: - Warm-up ladder

  /** Exercises whose ramp the user re-opened after it collapsed. */
  private reopenedWarmups = new Set<string>();
  private hiddenWarmupIDs = new Set<string>();

  configureWarmups(a: { hidden: Set<string> }): void {
    this.hiddenWarmupIDs = a.hidden;
    this.notify();
  }

  /**
   * The ramp for an exercise, built from the weight it is about to be
   * worked at. Never stored, never logged, never counted.
   */
  warmupLadder(a: { slotIndex: number }): WarmupSet[] {
    const slot = this._slots[a.slotIndex];
    if (this.hiddenWarmupIDs.has(S.planned(slot).exerciseID)) return [];
    const weights = S.sets(slot).map((s) => s.weightKg).filter((w): w is number => w !== undefined);
    if (weights.length === 0) return [];
    const topSet = Math.max(...weights);
    return WarmupPlanner.ladder({
      topSetKg: topSet,
      exercise: slot.exercise,
      context: WarmupPlanner_Context.make({ positionInSession: a.slotIndex, isCompound: slot.exercise.isCompound }),
    });
  }

  /**
   * The ramp steps out of the way whenever something else needs the space.
   *
   * Two cases. Once the first working set is in, the ramp has done its job.
   * And before that, a proposal or calibration card is already occupying
   * the room above the grid — with both expanded the first set row falls
   * below the fold, which is the one row the screen exists to show.
   */
  isWarmupCollapsed(a: { slotIndex: number }): boolean {
    const slot = this._slots[a.slotIndex];
    if (this.reopenedWarmups.has(S.planned(slot).exerciseID)) return false;
    const first = S.sets(slot)[0];
    if (first && LoggedSet.isLogged(first)) return true;
    return this.competesForSpaceAboveTheGrid(a);
  }

  /** Whether a card is already sitting between the exercise name and the set grid. */
  private competesForSpaceAboveTheGrid(a: { slotIndex: number }): boolean {
    if (this.needsCalibration(a)) return true;
    const slot = this._slots[a.slotIndex];
    const first = S.sets(slot)[0];
    return !S.proposalDismissed(slot) && !(first ? LoggedSet.isLogged(first) : false);
  }

  /** "Opwarming · 3 sets" for the collapsed affordance. */
  collapsedWarmupLabel(a: { slotIndex: number }): string {
    const count = this.warmupLadder(a).length;
    return `Warm-up · ${count} ${count === 1 ? "set" : "sets"}`;
  }

  showWarmup(a: { slotIndex: number }): void {
    this.reopenedWarmups = new Set(this.reopenedWarmups).add(S.planned(this._slots[a.slotIndex]).exerciseID);
    this.notify();
  }

  collapseWarmup(a: { slotIndex: number }): void {
    const next = new Set(this.reopenedWarmups);
    next.delete(S.planned(this._slots[a.slotIndex]).exerciseID);
    this.reopenedWarmups = next;
    this.notify();
  }

  topSetLabel(a: { slotIndex: number; formatter?: NumberDisplay }): string | undefined {
    const formatter = a.formatter ?? NumberDisplay.english;
    const slot = this._slots[a.slotIndex];
    const weights = S.sets(slot).map((s) => s.weightKg).filter((w): w is number => w !== undefined);
    if (weights.length === 0) return undefined;
    const topSet = Math.max(...weights);
    const tops = S.planned(slot).sets.map((s) => s.repRange.upperBound);
    const reps = tops.length ? Math.min(...tops) : 0;
    return `${NumberDisplay.kg(formatter, topSet)} × ${reps}`;
  }

  // MARK: - Rest

  /** Rest inherits from the exercise's role (13R), never a flat 2:00. */
  private startRest(planned: PlannedExercise): void {
    // Nothing to rest for in a workout that is already over.
    if (this.isLoggedAfterwards) return;
    const prescription = RestPrescription.forRole(planned.role);
    // A length typed for this exercise earlier in the session holds.
    const typed = this.restLengths[planned.exerciseID];
    const timer = RestTimerState.make({ targetSeconds: typed ?? prescription.defaultSeconds, startedAt: new Date() });
    this._restTimer = timer;
    this.restExerciseID = planned.exerciseID;
    this._restTitle = typed !== undefined
      ? `Rest · ${RestTimerState.clockLabel(typed)}`
      : `Rest · ${SessionRunner.roleLabel(planned.role)} ${RestPrescription.displayLabel(prescription)}`;
    this.restCompletionSignalled = false;
    this._isTimerExpanded = false;
    RestNotifier.schedule(RestTimerState.fireDate(timer), { startedAt: timer.startedAt });
  }

  /**
   * "3:00 vast": the rest the role prescribes, counted from now. The one
   * control that restarts the count, and it says so.
   */
  resetRest(): void {
    const current = this._restTimer;
    if (!current) return;
    const timer = RestTimerState.make({ targetSeconds: current.targetSeconds, startedAt: new Date() });
    this._restTimer = timer;
    this.restCompletionSignalled = false;
    RestNotifier.schedule(RestTimerState.fireDate(timer), { startedAt: timer.startedAt });
    this.notify();
  }

  adjustRest(a: { by: number }): void {
    if (this._restTimer) this._restTimer = RestTimerState.adjust(this._restTimer, { by: a.by, floorRemainingAt: this._now });
    const timer = this._restTimer;
    if (!timer) return;
    if (RestTimerState.remaining(timer, { at: new Date() }) > 0) this.restCompletionSignalled = false;
    RestNotifier.schedule(RestTimerState.fireDate(timer), { startedAt: timer.startedAt });
    this.notify();
  }

  /** Rest lengths typed this session, by exercise: its next rests keep them. */
  private restLengths: Record<string, number> = {};
  private restExerciseID: string | undefined;

  /**
   * The running rest gets a length of its own, counted from when it began,
   * and the exercise it follows keeps that length for the rest of the
   * session.
   */
  setRestLength(a: { seconds: number }): void {
    const current = this._restTimer;
    if (!current) return;
    const timer = RestTimerState.withLength(current, { seconds: a.seconds });
    this._restTimer = timer;
    if (this.restExerciseID !== undefined) this.restLengths[this.restExerciseID] = a.seconds;
    this._restTitle = `Rest · ${RestTimerState.clockLabel(a.seconds)}`;
    if (RestTimerState.remaining(timer, { at: new Date() }) > 0) {
      this.restCompletionSignalled = false;
      RestNotifier.schedule(RestTimerState.fireDate(timer), { startedAt: timer.startedAt });
    } else {
      RestNotifier.cancel();
    }
    this.notify();
  }

  endRest(): void {
    this._restTimer = undefined;
    this._isTimerExpanded = false;
    RestNotifier.cancel();
    this.notify();
  }

  /**
   * The session is leaving the screen — paused or finished. Nothing may
   * announce the end of a rest that no longer exists.
   */
  stopRestSignals(): void {
    RestNotifier.cancel();
  }

  /**
   * The session is on screen again. A rest it carried back from a pause
   * asks again for the notification that pausing withdrew.
   */
  resumeRestSignals(): void {
    const timer = this._restTimer;
    if (!timer || !(RestTimerState.remaining(timer, { at: new Date() }) > 0)) return;
    RestNotifier.schedule(RestTimerState.fireDate(timer), { startedAt: timer.startedAt });
  }

  toggleTimerExpanded(): void {
    this.isTimerExpanded = !this._isTimerExpanded;
  }

  tick(): void {
    this._now = new Date();
    const timer = this._restTimer;
    if (timer && !this.restCompletionSignalled && RestTimerState.remaining(timer, { at: this._now }) === 0) {
      this.restCompletionSignalled = true;
      this._restCompletions += 1;
    }
    this.notify();
  }

  /** The role name the timer labels itself with. */
  static roleLabel(role: ExerciseRole): string {
    switch (role) {
      case "primaryStrength":
        return "main lift";
      case "secondaryCompound":
        return "compound";
      case "accessory":
      case "isolation":
        return "isolation";
    }
  }

  // MARK: - Presentation

  rows(a: { for: number }): SetRowPresentation[] {
    const slot = this._slots[a.for];
    return SetRowPresenter.rows({
      sets: S.sets(slot),
      reference: ExerciseHistory.mostRecent(slot.history),
      history: slot.history,
      activeIndex: this.nextIndex({ in: slot }),
      mode: this.gridMode({ slotIndex: a.for }),
      // The number every other surface names a set's target by.
      targetReps: S.planned(slot).sets.map((s) => s.repRange.upperBound),
    });
  }

  adviceLine(a: { for: number }): string | undefined {
    const slot = this._slots[a.for];
    return SetRowPresenter.adviceLine({
      sets: S.sets(slot),
      planned: S.planned(slot),
      exercise: slot.exercise,
      history: slot.history,
      proposedTargets: this.proposedTargets({ slotIndex: a.for }),
    });
  }

  /**
   * "VORIGE · 3 SEP  47,5 kg × 8 · 8 · 7" — the number the app is opened
   * for, readable without a single interaction.
   */
  previousLine(a: { for: SessionRunner_ExerciseSlot }): { label: string; detail: string } | undefined {
    const last = ExerciseHistory.mostRecent(a.for.history);
    if (!last) return undefined;
    const sets = last.sets.filter(LoggedSet.countsTowardVolume);
    const weight = sets[0]?.weightKg;
    if (weight === undefined) return undefined;
    const reps = sets.map((s) => `${s.reps}`).join(" · ");
    return {
      label: `Last · ${NumberDisplay.shortDate(this.display, last.date)}`,
      detail: `${NumberDisplay.kg(this.display, weight)} × ${reps}`,
    };
  }

  /**
   * The card's head: "Vorige sessie · 2 sep" and what was lifted then —
   * "82,5 kg" with "× 8/8/8/7" where every set shared a weight, otherwise
   * each set on its own: "120 × 6 · 110 × 8".
   */
  previousSummary(a: { for: SessionRunner_ExerciseSlot }): { date: Date; weight?: string; detail: string } | undefined {
    const last: ExerciseAppearance | undefined = ExerciseHistory.mostRecent(a.for.history);
    if (!last) return undefined;
    const sets = last.sets.filter(LoggedSet.countsTowardVolume);
    const first = sets[0]?.weightKg;
    if (first === undefined) return undefined;
    if (sets.every((s) => s.weightKg === first)) {
      return { date: last.date, weight: NumberDisplay.kg(this.display, first), detail: "× " + sets.map((s) => `${s.reps}`).join("/") };
    }
    const each = sets
      .filter((s) => s.weightKg !== undefined)
      .map((s) => NumberDisplay.setReference(this.display, { weightKg: s.weightKg!, reps: s.reps }));
    return { date: last.date, weight: undefined, detail: each.join(" · ") };
  }

  /** What the same set was last time: "82,5 × 8". */
  previousSet(a: { slotIndex: number; setIndex: number }): string | undefined {
    if (!this.hasSlot(a.slotIndex)) return undefined;
    const slot = this._slots[a.slotIndex];
    const reference = ExerciseHistory.mostRecent(slot.history);
    if (!reference) return undefined;
    const sets = S.sets(slot);
    const row = a.setIndex >= 0 && a.setIndex < sets.length ? sets[a.setIndex] : undefined;
    const prior =
      reference.sets.find((s) => s.index === row?.index) ??
      (a.setIndex >= 0 && a.setIndex < reference.sets.length ? reference.sets[a.setIndex] : undefined);
    if (!prior || prior.weightKg === undefined) return undefined;
    return NumberDisplay.setReference(this.display, { weightKg: prior.weightKg, reps: prior.reps });
  }

  get columnHeaderDate(): string {
    const dates = this._slots
      .map((s) => ExerciseHistory.mostRecent(s.history)?.date)
      .filter((d): d is Date => d !== undefined);
    if (dates.length === 0) return "Last";
    const reference = dates.reduce((m, d) => (d.getTime() > m.getTime() ? d : m));
    return `vs ${NumberDisplay.shortDate(this.display, reference)}`;
  }

  // MARK: - Finishing

  /**
   * Every result the session produced, each under the exercise it was
   * logged on — preserved work from swaps included.
   */
  get allResults(): ExerciseResult[] {
    return this._slots.flatMap((s) => SessionSlot.results(s.model));
  }

  /**
   * Minutes set by hand on the finish screen. `nil` keeps the clock's —
   * or, for a workout written down afterwards, no duration.
   */
  private _durationMinutes: number | undefined;
  get durationMinutes(): number | undefined {
    return this._durationMinutes;
  }
  set durationMinutes(v: number | undefined) {
    this._durationMinutes = v;
    this.notify();
  }

  finishedSession(a: { existing?: TrainingSession }): TrainingSession {
    const existing = a.existing;
    const models = this._slots.map((s) => s.model);
    return TrainingSession.make({
      id: existing?.id ?? `${Math.trunc(Date.now())}`,
      date: existing?.date ?? this._startedAt,
      dayID: this.day.id,
      dayLabel: this.day.short,
      // Against the prescription. The header's SET n/N counts every
      // row, added ones included; completion never does.
      completion: SessionSlot.completion({ of: models }),
      kind: "workout",
      results: this.allResults,
      // A session written down afterwards records no duration rather
      // than the minutes it took to type — `SessionHistory` already says
      // nothing about time for a session that never recorded one.
      durationSeconds:
        this._durationMinutes !== undefined
          ? this._durationMinutes * 60
          : this.isLoggedAfterwards
            ? undefined
            : WorkoutClock.activeSeconds(this.clock, { at: new Date() }),
      // What history shows as "completed of planned". Added rows are in
      // neither number.
      plannedSetCount: SessionSlot.plannedSetCount({ of: models }),
      completedSetCount: SessionSlot.completedSetCount({ of: models }),
    });
  }

  /** The volume card on 17R, and its comparison against the last session. */
  volumeSummary(a: { previous?: TrainingSession }): { volume: number; delta?: number } {
    const volume = RecordsEngine.volumeLoad(this.allResults.flatMap((r) => r.sets));
    const previous = a.previous;
    if (!previous) return { volume, delta: undefined };
    const before = RecordsEngine.volumeLoad(previous.results.flatMap((r) => r.sets));
    return { volume, delta: before > 0 ? dec(volume - before) : undefined };
  }

  /**
   * Records from every exercise that did work today, swapped-out ones too.
   * Highest-ranked first, as 17R lists them; exercises of equal rank keep
   * their session order.
   */
  records(): { name: string; record: ExerciseRecord }[] {
    const found = this._slots.flatMap((slot) =>
      SessionSlot.results(slot.model).flatMap((result) => {
        const history =
          result.exerciseID === S.planned(slot).exerciseID
            ? slot.history
            : this.historyFor(
                PlannedExercise.make({
                  exerciseID: result.exerciseID,
                  role: slot.model.plan.role,
                  sets: [],
                  modifiers: slot.model.plan.modifiers,
                }),
              );
        const record = RecordsEngine.record({ for: result.sets, history });
        return record ? [{ name: result.name, record }] : [];
      }),
    );
    return found
      .map((element, offset) => ({ element, offset }))
      .sort((x, y) => {
        const rx = ExerciseRecord.rank(x.element.record);
        const ry = ExerciseRecord.rank(y.element.record);
        if (rx !== ry) return ry - rx;
        return x.offset - y.offset;
      })
      .map((e) => e.element);
  }
}

/** Reads a runner in a component and redraws it on every change — `@Observable`. */
export function useSessionRunner(runner: SessionRunner): SessionRunner {
  useSyncExternalStore(runner.subscribe, runner.getVersion);
  return runner;
}
