import { Exercise, LoggedSet, PlannedExercise } from "../Domain/Model";
import { SetFlags } from "../Domain/Vocabulary";
import { dec } from "../Support/swift";
import { Calibration } from "./Calibration";
import { type ExerciseAppearance, ExerciseHistory } from "./ExerciseHistory";
import { NumberDisplay } from "./NumberDisplay";
import { ProgressionEngine } from "./ProgressionEngine";
import { RecordsEngine } from "./RecordsEngine";
import type { WarmupSet } from "./WarmupPlanner";

/**
 * What the trailing "VS <date>" column says for one set row.
 *
 * The review's intervention on artboard 04 added this column inside the
 * existing 56pt row: an empty row shows what you did last time, a written
 * row shows the difference, and a row that is heavier *and* complete reads
 * PR at the moment it happens.
 */
export type SetDelta =
  /** "47,5 × 8" — the reference set, shown before anything is entered. */
  | { kind: "reference"; value: string }
  /** "+2,5" / "=" / "−1" */
  | { kind: "difference"; value: string }
  | { kind: "personalRecord" }
  | { kind: "failed" }
  /**
   * A set performed with a pause. The word carries the meaning; amber
   * alone never does. `reps` is how many of the set's reps were paused,
   * and is absent where every one of them was.
   */
  | { kind: "paused"; reps?: number }
  /**
   * Partial reps at the end of a set, with their count, so "partieel" and
   * "met pauze" are never told apart by colour alone.
   */
  | { kind: "partial"; count: number }
  /** Both at once. Neither state is allowed to hide the other. */
  | { kind: "pausedAndPartial"; pausedReps?: number; count: number }
  /** The calibration set itself, before it is written. */
  | { kind: "calibration" }
  /** The calibration set once written: everything else compares to it. */
  | { kind: "baseline" }
  /**
   * A set added during this session, where the column would otherwise
   * be empty.
   */
  | { kind: "added" }
  /**
   * "RIR 1" — the reserve the lifter reported, shown where a comparison
   * would otherwise sit (addendum 12R). A record or a description of what
   * the set was still outranks it.
   */
  | { kind: "reserve"; value: number }
  /** A warm-up row carries no delta and no status dot. */
  | { kind: "none" };
export const SetDelta = {
  reference: (value: string): SetDelta => ({ kind: "reference", value }),
  difference: (value: string): SetDelta => ({ kind: "difference", value }),
  personalRecord: { kind: "personalRecord" } as SetDelta,
  failed: { kind: "failed" } as SetDelta,
  paused: (a: { reps?: number } = {}): SetDelta => ({ kind: "paused", reps: a.reps }),
  partial: (a: { count: number }): SetDelta => ({ kind: "partial", count: a.count }),
  pausedAndPartial: (a: { pausedReps?: number; count: number }): SetDelta => ({
    kind: "pausedAndPartial",
    pausedReps: a.pausedReps,
    count: a.count,
  }),
  calibration: { kind: "calibration" } as SetDelta,
  baseline: { kind: "baseline" } as SetDelta,
  added: { kind: "added" } as SetDelta,
  reserve: (value: number): SetDelta => ({ kind: "reserve", value }),
  none: { kind: "none" } as SetDelta,

  /**
   * Whether this says what the set *was*, rather than how it compares.
   * Those descriptions outrank any comparison — losing one would hide the
   * very thing that keeps the set out of progression.
   */
  describesTheSet(self: SetDelta): boolean {
    switch (self.kind) {
      case "failed":
      case "paused":
      case "partial":
      case "pausedAndPartial":
        return true;
      case "reference":
      case "difference":
      case "personalRecord":
      case "calibration":
      case "baseline":
      case "added":
      case "reserve":
      case "none":
        return false;
    }
  },
};

/** What the grid's trailing column is comparing against. */
export type SetGridMode =
  /** The usual case: compare each set with the same set last session. */
  | { kind: "history" }
  /** No history at all and set 1 not yet written (artboard 28). */
  | { kind: "calibrationPending" }
  /** Set 1 is in; the rest of the exercise compares to it (artboard 28b). */
  | { kind: "calibrated"; baseline: LoggedSet };
export const SetGridMode = {
  history: { kind: "history" } as SetGridMode,
  calibrationPending: { kind: "calibrationPending" } as SetGridMode,
  calibrated: (a: { baseline: LoggedSet }): SetGridMode => ({ kind: "calibrated", baseline: a.baseline }),

  isCalibration(self: SetGridMode): boolean {
    return self.kind !== "history";
  },
};

/** What the weight slot holds, which decides how loud it is. */
export type SetRowWeightKind = "value" | "missing" | "awaitingCalibration";
export const SetRowWeightKind = {
  /** "102,5 kg". */
  value: "value" as SetRowWeightKind,
  /** "— kg": nothing entered and nothing proposed, as on 28's first row. */
  missing: "missing" as SetRowWeightKind,
  /** "follows from set 1": the row waits on the calibration set (artboard 28). */
  awaitingCalibration: "awaitingCalibration" as SetRowWeightKind,
};

export type SetRowStatus = "warmup" | "nextUp" | "pending" | "written";
export const SetRowStatus = {
  warmup: "warmup" as SetRowStatus,
  nextUp: "nextUp" as SetRowStatus,
  pending: "pending" as SetRowStatus,
  written: "written" as SetRowStatus,
};

export interface SetRowPresentation {
  readonly index: number;
  /** "1"…"n" for working sets, "W1"…"Wn" for the warm-up ladder. */
  readonly indexLabel: string;
  readonly weightLabel: string;
  /** "8", or "—" for the next row up, or "·" while pending. */
  readonly repsLabel: string;
  readonly delta: SetDelta;
  readonly status: SetRowStatus;
  readonly isWarmup: boolean;
  /** A working set added during this session rather than prescribed. */
  readonly isAdded: boolean;
  readonly weightKind: SetRowWeightKind;
  /**
   * The reps slot shows what the set aims at rather than what was done —
   * artboard 28, before the calibration set gives the grid a reference.
   */
  readonly repsIsTarget: boolean;
}
export const SetRowPresentation = {
  make(a: {
    index: number;
    indexLabel: string;
    weightLabel: string;
    repsLabel: string;
    delta: SetDelta;
    status: SetRowStatus;
    isWarmup: boolean;
    isAdded?: boolean;
    weightKind?: SetRowWeightKind;
    repsIsTarget?: boolean;
  }): SetRowPresentation {
    return {
      index: a.index,
      indexLabel: a.indexLabel,
      weightLabel: a.weightLabel,
      repsLabel: a.repsLabel,
      delta: a.delta,
      status: a.status,
      isWarmup: a.isWarmup,
      isAdded: a.isAdded ?? false,
      weightKind: a.weightKind ?? "value",
      repsIsTarget: a.repsIsTarget ?? false,
    };
  },
};

export const SetRowPresenter = {
  /**
   * Builds every row of one exercise's grid.
   *
   * - Parameters:
   *   - sets: the working sets as they currently stand, logged or not.
   *   - warmups: the ramp, if it is showing (design 30).
   *   - reference: the comparable session the delta column names.
   *   - activeIndex: the row that is next up.
   *   - mode: what the trailing column compares against.
   *   - targetReps: each prescribed row's target, which artboard 28 shows
   *     in the reps slot while the grid has nothing else to say there.
   */
  rows(a: {
    sets: LoggedSet[];
    warmups?: LoggedSet[];
    reference: ExerciseAppearance | undefined;
    history: ExerciseHistory;
    activeIndex: number | undefined;
    mode?: SetGridMode;
    targetReps?: number[];
    formatter?: NumberDisplay;
  }): SetRowPresentation[] {
    const { sets, reference, history, activeIndex } = a;
    const warmups = a.warmups ?? [];
    const mode = a.mode ?? SetGridMode.history;
    const targetReps = a.targetReps ?? [];
    const formatter = a.formatter ?? NumberDisplay.english;
    const kg = (x: number) => NumberDisplay.kg(formatter, x);
    const rows: SetRowPresentation[] = [];

    for (const [offset, warmup] of warmups.entries()) {
      rows.push(
        SetRowPresentation.make({
          index: offset,
          indexLabel: `W${offset + 1}`,
          weightLabel: warmup.weightKg !== undefined ? kg(warmup.weightKg) : "—",
          repsLabel: warmup.reps > 0 ? `${warmup.reps}` : "—",
          delta: SetDelta.none,
          status: "warmup",
          isWarmup: true,
        }),
      );
    }

    for (const [offset, set] of sets.entries()) {
      const referenceSet = reference?.sets.find((s) => s.index === set.index)
        ?? (reference !== undefined && offset < reference.sets.length ? reference.sets[offset] : undefined);

      let referenceLabel: string | undefined;
      if (referenceSet !== undefined && referenceSet.weightKg !== undefined) {
        referenceLabel = NumberDisplay.setReference(formatter, { weightKg: referenceSet.weightKg, reps: referenceSet.reps });
      }

      let status: SetRowStatus;
      if (LoggedSet.isLogged(set)) {
        status = "written";
      } else if (activeIndex === offset) {
        status = "nextUp";
      } else {
        status = "pending";
      }

      let delta: SetDelta;
      if (LoggedSet.isLogged(set)) {
        const partialCount = (set.partialReps ?? 0) > 0 ? set.partialReps : undefined;
        if (SetFlags.contains(set.flags, SetFlags.failed)) {
          delta = SetDelta.failed;
        } else if (set.modifiers.pauseEnabled && partialCount !== undefined) {
          // Both descriptions are true, so both are shown.
          delta = SetDelta.pausedAndPartial({ pausedReps: set.pausedReps, count: partialCount });
        } else if (set.modifiers.pauseEnabled) {
          delta = SetDelta.paused({ reps: set.pausedReps });
        } else if (partialCount !== undefined) {
          delta = SetDelta.partial({ count: partialCount });
        } else if (RecordsEngine.isLoadPR({ set, history, earlierInSession: sets.slice(0, offset) })) {
          delta = SetDelta.personalRecord;
        } else if (set.rirReported !== undefined) {
          delta = SetDelta.reserve(set.rirReported);
        } else if (referenceSet !== undefined && referenceSet.weightKg !== undefined && set.weightKg !== undefined) {
          delta = SetDelta.difference(NumberDisplay.signedDelta(formatter, dec(set.weightKg - referenceSet.weightKg)));
        } else {
          delta = SetDelta.none;
        }
      } else if (referenceLabel !== undefined) {
        delta = SetDelta.reference(referenceLabel);
      } else {
        delta = SetDelta.none;
      }

      let repsLabel = "";
      switch (status as SetRowStatus) {
        case "written": repsLabel = `${set.reps}`; break;
        case "nextUp": repsLabel = "—"; break;
        case "pending": repsLabel = "·"; break;
        case "warmup": repsLabel = "—"; break;
      }

      let weightLabel = set.weightKg !== undefined ? kg(set.weightKg) : "— kg";
      let weightKind: SetRowWeightKind = set.weightKg === undefined ? "missing" : "value";
      let repsIsTarget = false;
      let resolvedDelta = delta;

      switch (mode.kind) {
        case "history":
          break;
        case "calibrationPending":
          // Artboard 28: set 1 asks for a weight, the rest wait for it,
          // and every open row shows the reps it aims at — set 1 the
          // calibration target, the others their own prescription.
          if (offset === 0) {
            if (!LoggedSet.isLogged(set)) {
              resolvedDelta = SetDelta.calibration;
              repsLabel = `${Calibration.targetReps}`;
              repsIsTarget = true;
            }
          } else if (!LoggedSet.isLogged(set)) {
            weightLabel = "follows from set 1";
            weightKind = "awaitingCalibration";
            resolvedDelta = SetDelta.none;
            if (offset < targetReps.length) {
              repsLabel = `${targetReps[offset]}`;
              repsIsTarget = true;
            }
          }
          break;
        case "calibrated": {
          // Artboard 28b: everything compares to the calibration set —
          // but a comparison never replaces what the set actually was.
          // A paused, partial or failed set keeps saying so.
          const baseline = mode.baseline;
          if (!SetDelta.describesTheSet(delta)) {
            if (offset === 0) {
              resolvedDelta = SetDelta.baseline;
            } else if (baseline.weightKg !== undefined) {
              const weight = baseline.weightKg;
              resolvedDelta = LoggedSet.isLogged(set)
                ? SetDelta.difference(NumberDisplay.signedDelta(formatter, dec((set.weightKg ?? 0) - weight)))
                : SetDelta.reference(NumberDisplay.setReference(formatter, { weightKg: weight, reps: baseline.reps }));
            }
          }
          break;
        }
      }

      // A row added during this session says so, in the column's own
      // quiet type, wherever the column would otherwise be empty.
      if (set.origin === "sessionAdded" && resolvedDelta.kind === "none") {
        resolvedDelta = SetDelta.added;
      }

      rows.push(
        SetRowPresentation.make({
          index: offset,
          indexLabel: `${offset + 1}`,
          weightLabel,
          repsLabel,
          delta: resolvedDelta,
          status,
          isWarmup: false,
          isAdded: set.origin === "sessionAdded",
          weightKind,
          repsIsTarget,
        }),
      );
    }

    return rows;
  },

  /** The ramp's rows, for the section above the working-set grid. */
  warmupRows(warmups: WarmupSet[], a: { formatter?: NumberDisplay } = {}): SetRowPresentation[] {
    const formatter = a.formatter ?? NumberDisplay.english;
    return warmups.map((warmup, offset) =>
      SetRowPresentation.make({
        index: offset,
        indexLabel: `W${offset + 1}`,
        weightLabel: NumberDisplay.kg(formatter, warmup.weightKg),
        repsLabel: `${warmup.reps}`,
        delta: SetDelta.none,
        status: "warmup",
        isWarmup: true,
      }),
    );
  },

  /**
   * The advice line under the set list, which appears only once the last
   * set of the exercise is written (review, artboard 04 intervention).
   */
  adviceLine(a: {
    sets: LoggedSet[];
    planned: PlannedExercise;
    exercise: Exercise;
    history: ExerciseHistory;
    proposedTargets?: number[];
    formatter?: NumberDisplay;
  }): string | undefined {
    const { planned, exercise, history } = a;
    const formatter = a.formatter ?? NumberDisplay.english;
    // Judged on the prescribed sets only. A set added during the session
    // neither holds the advice back until it is logged, nor changes it.
    const working = a.sets.filter((s) => !s.isWarmup && s.origin === "prescribed");
    if (working.length === 0 || !working.every((s) => LoggedSet.isLogged(s))) return undefined;
    if (!ExerciseHistory.hasReference(history)) return undefined;

    const tops = PlannedExercise.repTargets(planned);
    const slot = (n: number) => working.find((s) => s.index === n);
    const hitTop = tops.every((top, i) => (slot(i)?.reps ?? 0) >= top);
    const load = working[0]?.weightKg;
    if (load === undefined) return undefined;

    if (hitTop) {
      const step = ProgressionEngine.increment({ for: exercise, currentLoad: load, role: planned.role });
      return `All reps done. Next time ${NumberDisplay.kg(formatter, dec(load + step))}.`;
    }
    // Doing what SETLINE proposed is never a miss. After a load increase
    // the proposal aims at the bottom of each range, and reaching it is
    // exactly the plan: same weight next time, working toward the top.
    const proposed = a.proposedTargets;
    if (proposed !== undefined && proposed.length >= tops.length
      && tops.every((_t, i) => (slot(i)?.reps ?? 0) >= proposed[i])) {
      return `On target. Next time ${NumberDisplay.kg(formatter, load)}, aim for ${ProgressionEngine.repsLabel(tops)}.`;
    }
    return "Not all reps done. Same weight next time.";
  },
};
