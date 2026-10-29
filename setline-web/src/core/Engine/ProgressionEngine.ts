import { Exercise, LoggedSet, PlannedExercise } from "../Domain/Model";
import { type ExerciseRole, SetFlags } from "../Domain/Vocabulary";
import { dec } from "../Support/swift";
import { Estimates } from "./Estimates";
import { type ExerciseAppearance, ExerciseHistory } from "./ExerciseHistory";
import { NumberDisplay } from "./NumberDisplay";

/**
 * The four tones of the progression proposal (design 29b).
 *
 * One component, four tones. Only the label colour and border strength
 * change — the card keeps the same size, radius and place above set 1.
 */
export type ProposalTone = "ready" | "close" | "neutral" | "noReference";
export const ProposalTone = {
  ready: "ready" as ProposalTone,
  close: "close" as ProposalTone,
  neutral: "neutral" as ProposalTone,
  noReference: "noReference" as ProposalTone,
};

/**
 * A proposal, never an application.
 *
 * "Geen van de vier past iets toe — het voorstel staat voorgevuld in de
 * setrij en is daar te wijzigen, en elke kaart heeft Sluiten."
 */
export interface ProgressionProposal {
  readonly tone: ProposalTone;
  /** Absent only for `.noReference`. */
  readonly weightKg?: number;
  /** The first row's target, for places that show one number. */
  readonly targetReps?: number;
  /**
   * One target per planned set, each from that set's own range. A
   * `1×5–6 + 2×6–8` prescription must never hand set 1's target to sets 2
   * and 3 — following the pre-fill would then log them below their range.
   */
  readonly setTargets?: number[];
  /** Eyebrow label. The design shows one only on the READY tone. */
  readonly label?: string;
  readonly headline: string;
  readonly body: string;
}
export const ProgressionProposal = {
  make(a: {
    tone: ProposalTone;
    weightKg: number | undefined;
    targetReps: number | undefined;
    label: string | undefined;
    headline: string;
    body: string;
    setTargets?: number[];
  }): ProgressionProposal {
    return {
      tone: a.tone,
      weightKg: a.weightKg,
      targetReps: a.targetReps,
      setTargets: a.setTargets,
      label: a.label,
      headline: a.headline,
      body: a.body,
    };
  },
};

export const ProgressionEngine = {
  /**
   * The prescribed slots of one appearance: for each prescribed set, the
   * progression-eligible set logged in exactly that slot, or `nil`.
   *
   * Matched by origin and set number, never by position in a filtered
   * list. A set added during a session is not a prescribed slot, and a
   * skipped or partial prescribed set leaves its slot empty — so an extra
   * fourth set can never stand in for a missed third.
   */
  prescribedSlots(appearance: ExerciseAppearance, a: { planned: PlannedExercise }): (LoggedSet | undefined)[] {
    const eligible = appearance.sets.filter((s) => LoggedSet.countsTowardProgression(s) && s.origin === "prescribed");
    return a.planned.sets.map((_p, slot) => eligible.find((s) => s.index === slot));
  },

  /**
   * Does this appearance qualify as a confirming session? (§3.1)
   *
   * Every prescribed set reached the top of its range, at the same load,
   * and — when RIR was logged — the median RIR is inside the target.
   */
  qualifies(appearance: ExerciseAppearance, a: { planned: PlannedExercise }): boolean {
    const planned = a.planned;
    const targets = PlannedExercise.repTargets(planned);
    if (targets.length === 0) return false;

    const sets: LoggedSet[] = [];
    const slots = ProgressionEngine.prescribedSlots(appearance, { planned });
    const n = Math.min(slots.length, targets.length);
    for (let i = 0; i < n; i++) {
      const set = slots[i];
      const target = targets[i];
      if (set === undefined || SetFlags.contains(set.flags, SetFlags.failed) || !(set.reps >= target)) return false;
      sets.push(set);
    }

    const loads = new Set(sets.map((s) => s.weightKg ?? 0));
    if (loads.size !== 1) return false;

    const logged = sets.map((s) => s.rirReported).filter((r): r is number => r !== undefined);
    if (logged.length > 0) {
      const sorted = [...logged].sort((x, y) => x - y);
      const median = sorted[Math.trunc(sorted.length / 2)];
      const uppers = planned.sets.map((s) => s.targetRIR.upperBound);
      const ceiling = uppers.length > 0 ? Math.max(...uppers) : 2;
      if (median > ceiling) return false;
    }
    return true;
  },

  /**
   * How many consecutive most-recent sessions qualify at the same load.
   *
   * The load is the prescribed work's load. An added set — a lighter
   * back-off, say — is real training, but it is not the prescription, so it
   * neither sets the load nor breaks the streak.
   */
  confirmingStreak(a: { history: ExerciseHistory; planned: PlannedExercise }): { streak: number; load: number | undefined } {
    const { history, planned } = a;
    const latest = ExerciseHistory.mostRecent(history);
    if (latest === undefined) return { streak: 0, load: undefined };
    const firstSlot = ProgressionEngine.prescribedSlots(latest, { planned }).find((s) => s !== undefined);
    const load = (firstSlot ?? latest.sets.find((s) => LoggedSet.countsTowardProgression(s)))?.weightKg;
    if (load === undefined) return { streak: 0, load: undefined };

    let streak = 0;
    for (const appearance of history.appearances) {
      const loads = new Set(
        ProgressionEngine.prescribedSlots(appearance, { planned })
          .map((s) => s?.weightKg)
          .filter((w): w is number => w !== undefined),
      );
      if (!(loads.size === 1 && loads.has(load)) || !ProgressionEngine.qualifies(appearance, { planned })) break;
      streak += 1;
    }
    return { streak, load };
  },

  /**
   * Sessions of confirmation needed before the load moves.
   *
   * Two by default (§3.1) — the part most apps get wrong, and the reason
   * a single good day does not move the bar. One for a low-rep primary
   * strength lift (§3.2 LOAD_STEP), where there is less rep headroom to
   * absorb a fluke and the step is proportionally small.
   */
  requiredConfirmations(a: { for: PlannedExercise }): number {
    const planned = a.for;
    const uppers = planned.sets.map((s) => s.repRange.upperBound);
    const lowRep = (uppers.length > 0 ? Math.max(...uppers) : 99) <= 6;
    return planned.role === "primaryStrength" && lowRep ? 1 : 2;
  },

  /**
   * §3.2: the smaller of the equipment increment and 2.5% of the current
   * load, rounded onto a real plate or pin step.
   */
  increment(a: { for: Exercise; currentLoad: number; role: ExerciseRole }): number {
    const base = Exercise.incrementKg(a.for);
    if (a.role !== "primaryStrength") return base;
    const proportional = dec(a.currentLoad * 0.025);
    const chosen = Math.min(base, proportional);
    const r = Estimates.round(chosen, { toIncrement: base });
    return Math.max(r, base);
  },

  /** The proposal shown above set 1 (design 29 / 29b). */
  proposal(a: {
    planned: PlannedExercise;
    exercise: Exercise;
    history: ExerciseHistory;
    formatter?: NumberDisplay;
  }): ProgressionProposal {
    const { planned, exercise, history } = a;
    const formatter = a.formatter ?? NumberDisplay.english;
    if (!ExerciseHistory.hasReference(history)) {
      return ProgressionProposal.make({
        tone: "noReference",
        weightKg: undefined,
        targetReps: undefined,
        label: undefined,
        headline: `Building a reference · session ${ExerciseHistory.referenceSessionNumber(history)} of ${ExerciseHistory.sessionsBeforeReference}`,
        body: "After three comparable sessions, SETLINE can show reliable progression suggestions and records.",
      });
    }

    const lows = planned.sets.map((s) => s.repRange.lowerBound);
    const tops = planned.sets.map((s) => s.repRange.upperBound);

    const { streak, load } = ProgressionEngine.confirmingStreak({ history, planned });
    if (load === undefined) {
      return ProgressionProposal.make({
        tone: "neutral",
        weightKg: undefined,
        targetReps: lows[0],
        label: undefined,
        headline: "Keep building",
        body: "Suggestion: none. No reason yet to go up or down.",
        setTargets: lows,
      });
    }

    const needed = ProgressionEngine.requiredConfirmations({ for: planned });
    const lowTarget = lows[0] ?? 6;
    const topTarget = tops[0] ?? lowTarget;
    const rirCeiling = planned.sets[0]?.targetRIR.upperBound ?? 2;
    const kg = (x: number) => NumberDisplay.kg(formatter, x);

    if (streak >= needed) {
      const step = ProgressionEngine.increment({ for: exercise, currentLoad: load, role: planned.role });
      const next = dec(load + step);
      return ProgressionProposal.make({
        tone: "ready",
        weightKg: next,
        targetReps: lowTarget,
        label: "TOP OF RANGE CONFIRMED",
        headline: `Ready to go up from ${kg(load)}`,
        body: `Suggestion: ${kg(next)}, aim for ${ProgressionEngine.repsLabel(lows)}. ${confirmationSentence({ streak, load, rirCeiling, formatter })}`,
        setTargets: lows,
      });
    }

    if (streak === needed - 1 && streak > 0) {
      return ProgressionProposal.make({
        tone: "close",
        weightKg: load,
        targetReps: topTarget,
        label: undefined,
        headline: `1 more confirmation at ${kg(load)}`,
        body: `Suggestion: ${kg(load)}, aim for ${ProgressionEngine.repsLabel(tops)}. Hit that again and the weight goes up.`,
        setTargets: tops,
      });
    }

    return ProgressionProposal.make({
      tone: "neutral",
      weightKg: load,
      targetReps: topTarget,
      label: undefined,
      headline: `Keep building at ${kg(load)}`,
      body: `Suggestion: ${kg(load)}, aim for ${ProgressionEngine.repsLabel(tops)}. No reason yet to go up or down.`,
      setTargets: tops,
    });
  },

  /**
   * "6" when every set aims at the same number, "5 · 6 · 6" when they
   * differ — a prescription that varies by set is read out as it varies.
   */
  repsLabel(targets: number[]): string {
    const first = targets[0];
    if (first === undefined) return "—";
    return new Set(targets).size === 1 ? `${first}` : targets.map(String).join(" · ");
  },
};

function confirmationSentence(a: { streak: number; load: number; rirCeiling: number; formatter: NumberDisplay }): string {
  const sessions = a.streak === 1 ? "One session" : "Two sessions";
  return `${sessions} at ${NumberDisplay.kg(a.formatter, a.load)} with RIR ${a.rirCeiling} or lower.`;
}
