import { LoggedSet } from "../Domain/Model";
import { SetFlags } from "../Domain/Vocabulary";
import { dec, maxBy } from "../Support/swift";
import { Estimates } from "./Estimates";
import { type ExerciseAppearance, ExerciseHistory } from "./ExerciseHistory";
import { NumberDisplay } from "./NumberDisplay";

/** The four record types, ranked (TRAINING_LOGIC §10.1, design 17R). */
export type RecordType = 0 | 1 | 2 | 3;
export const RecordType = {
  sessionBest: 0 as RecordType,
  estimatedStrength: 1 as RecordType,
  rep: 2 as RecordType,
  load: 3 as RecordType,
  allCases: [0, 1, 2, 3] as RecordType[],
};

export interface ExerciseRecord {
  readonly type: RecordType;
  readonly headline: string;
  readonly detail: string;
  /**
   * "Referentie opbouwen · sessie 2 van 3": said in a record's place while
   * the three-session gate is shut. It beats nothing, so it is never the
   * screen's lime and always comes last (17R).
   */
  readonly buildsReference: boolean;
}
export const ExerciseRecord = {
  make(a: { type: RecordType; headline: string; detail: string; buildsReference?: boolean }): ExerciseRecord {
    return { type: a.type, headline: a.headline, detail: a.detail, buildsReference: a.buildsReference ?? false };
  },

  /**
   * 17R's order: load, rep, estimated strength, session best, and the
   * reference being built after all of them.
   */
  rank(self: ExerciseRecord): number {
    return self.buildsReference ? -1 : self.type;
  },
};

function maxNumber(values: number[]): number | undefined {
  let best: number | undefined;
  for (const v of values) if (best === undefined || v > best) best = v;
  return best;
}

function weights(sets: LoggedSet[]): number[] {
  return sets.map((s) => s.weightKg).filter((w): w is number => w !== undefined);
}

export const RecordsEngine = {
  /**
   * One record per exercise per session, highest-ranked type only.
   *
   * Guards, all required (§10.2): comparability, a 3-session baseline
   * before any banner, an explicit 0.5 kg epsilon, no e1RM above 10 reps,
   * and never a record on a warm-up or a technical-breakdown set.
   */
  record(a: { for: LoggedSet[]; history: ExerciseHistory; formatter?: NumberDisplay }): ExerciseRecord | undefined {
    const history = a.history;
    const formatter = a.formatter ?? NumberDisplay.english;
    const current = a.for.filter((s) => LoggedSet.countsTowardProgression(s));
    if (current.length === 0) return undefined;

    if (!ExerciseHistory.hasReference(history)) {
      return ExerciseRecord.make({
        type: RecordType.sessionBest,
        headline: `Building a reference · session ${ExerciseHistory.referenceSessionNumber(history)} of ${ExerciseHistory.sessionsBeforeReference}`,
        detail: "After three comparable sessions, SETLINE can show reliable progression suggestions and records.",
        buildsReference: true,
      });
    }

    const epsilon = Estimates.epsilonKg;
    const priorSets = history.appearances.flatMap((ap) => ap.sets);

    // --- Load PR: heaviest load moved for at least one clean rep.
    const heaviestNow = maxNumber(weights(current));
    if (heaviestNow !== undefined) {
      const heaviestBefore = maxNumber(weights(priorSets)) ?? 0;
      const set = current.find((s) => (s.weightKg ?? 0) === heaviestNow);
      if (heaviestNow > dec(heaviestBefore + epsilon) && set !== undefined) {
        return ExerciseRecord.make({
          type: RecordType.load,
          headline: `Heaviest ever · ${NumberDisplay.kg(formatter, heaviestNow)} × ${set.reps}`,
          detail: previousBest(heaviestBefore, history.appearances, formatter) ?? "First time at this weight",
        });
      }
    }

    // --- Rep PR: most reps at a load already used before.
    const repPR = repRecord(current, priorSets, epsilon, formatter);
    if (repPR !== undefined) return repPR;

    // --- Estimated strength PR. Always carries the word "geschat", and
    // names its source, so nobody believes the app watched them lift it.
    const estimates = current
      .map((set) => {
        const value = Estimates.e1RM({ weightKg: set.weightKg ?? 0, reps: set.reps });
        return value === undefined ? undefined : { value, set };
      })
      .filter((x): x is { value: number; set: LoggedSet } => x !== undefined);
    const bestNow = maxBy(estimates, (l, r) => l.value < r.value);
    if (bestNow !== undefined) {
      const before = priorSets
        .map((s) => Estimates.e1RM({ weightKg: s.weightKg ?? 0, reps: s.reps }))
        .filter((x): x is number => x !== undefined);
      const bestBefore = maxNumber(before) ?? 0;
      if (bestNow.value > dec(bestBefore + epsilon)) {
        return ExerciseRecord.make({
          type: RecordType.estimatedStrength,
          headline: `Estimated strength · ${NumberDisplay.kg(formatter, Estimates.round(bestNow.value, { toIncrement: 0.5 }))}`,
          detail: `Estimated from ${bestNow.set.reps} reps at ${NumberDisplay.kg(formatter, bestNow.set.weightKg ?? 0)}. Not measured.`,
        });
      }
    }

    // --- Session best: better than last time, not an all-time record.
    const previous = ExerciseHistory.mostRecent(history);
    if (previous !== undefined) {
      const now = RecordsEngine.volumeLoad(current);
      const before = RecordsEngine.volumeLoad(previous.sets);
      if (now > before) {
        return ExerciseRecord.make({
          type: RecordType.sessionBest,
          headline: "Stronger than last session",
          detail: "More total volume at the same RIR",
        });
      }
    }

    return undefined;
  },

  /**
   * Σ load × reps over the working sets.
   *
   * Volume is the wider net: paused and partial sets count here even
   * though they stay out of progression (addendum 16R). Warm-ups never do.
   */
  volumeLoad(sets: LoggedSet[]): number {
    let total = 0;
    for (const set of sets) {
      if (!LoggedSet.countsTowardVolume(set)) continue;
      // A drop set's lighter rounds are work done, so they count here
      // — and only here.
      // Sides that differ count as their average: equal sides are
      // exactly the set's own reps, so nothing counts twice.
      const reps = set.sideReps !== undefined ? (set.sideReps.left + set.sideReps.right) / 2 : set.reps;
      let drops = 0;
      for (const drop of set.drops) drops = dec(drops + drop.weightKg * drop.reps);
      total = dec(total + (set.weightKg ?? 0) * reps + drops);
    }
    return total;
  },

  /**
   * Whether this specific set, at the moment it is written, is a load PR.
   *
   * The review's intervention on artboard 04: "PR op het moment zelf" —
   * the row reads PR as it happens, not a session later in the summary.
   */
  isLoadPR(a: { set: LoggedSet; history: ExerciseHistory; earlierInSession: LoggedSet[] }): boolean {
    const { set, history } = a;
    const load = set.weightKg;
    if (!ExerciseHistory.hasReference(history) || !LoggedSet.countsTowardProgression(set) || load === undefined) return false;
    const priorBest = maxNumber(weights(history.appearances.flatMap((ap) => ap.sets))) ?? 0;
    // Only sets that could themselves have been a record count as the bar
    // to beat. A partial or failed set earlier in the session must not
    // quietly suppress a clean set at the same weight — 16R already shows
    // those rows as `partieel` and `mislukt`, never as `PR`.
    const sessionBest = maxNumber(weights(
      a.earlierInSession.filter((s) => LoggedSet.countsTowardProgression(s) && !SetFlags.contains(s.flags, SetFlags.failed)),
    )) ?? 0;
    return load > dec(Math.max(priorBest, sessionBest) + Estimates.epsilonKg);
  },
};

function repRecord(
  current: LoggedSet[],
  prior: LoggedSet[],
  epsilon: number,
  formatter: NumberDisplay,
): ExerciseRecord | undefined {
  let best: { load: number; reps: number; previous: number } | undefined;
  for (const set of current) {
    const load = set.weightKg;
    if (load === undefined) continue;
    const matching = prior.filter((p) => Math.abs(dec((p.weightKg ?? 0) - load)) <= epsilon);
    const priorBest = maxNumber(matching.map((p) => p.reps));
    if (priorBest === undefined || !(set.reps > priorBest)) continue;
    if (best === undefined || set.reps - priorBest > best.reps - best.previous) {
      best = { load, reps: set.reps, previous: priorBest };
    }
  }
  if (best === undefined) return undefined;
  return ExerciseRecord.make({
    type: RecordType.rep,
    headline: `${NumberDisplay.signedReps(formatter, best.reps - best.previous)} at ${NumberDisplay.kg(formatter, best.load)}`,
    detail: `${best.reps} reps, last time ${best.previous}`,
  });
}

/**
 * "Vorige beste 122,5 kg × 3 op 31 aug" — the most reps ever done at the
 * previous heaviest load, and the day it was done (17R).
 */
function previousBest(load: number, appearances: ExerciseAppearance[], formatter: NumberDisplay): string | undefined {
  const candidates = appearances.flatMap((appearance) =>
    appearance.sets
      .filter((s) => Math.abs(dec((s.weightKg ?? 0) - load)) <= Estimates.epsilonKg)
      .map((s) => ({ set: s, date: appearance.date })),
  );
  // Most reps first; on a tie, the first time it was done.
  const best = maxBy(candidates, (lhs, rhs) =>
    lhs.set.reps !== rhs.set.reps ? lhs.set.reps < rhs.set.reps : lhs.date.getTime() > rhs.date.getTime(),
  );
  if (best === undefined) return undefined;
  return `Previous best ${NumberDisplay.kg(formatter, best.set.weightKg ?? 0)} × ${best.set.reps} on ${NumberDisplay.shortDate(formatter, best.date)}`;
}
