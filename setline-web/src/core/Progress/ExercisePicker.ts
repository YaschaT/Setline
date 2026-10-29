import { ExerciseCatalog } from "../Catalog/ExerciseCatalog";
import { ExerciseMetadata } from "../Catalog/ExerciseMetadata";
import { Exercise, type TrainingSession } from "../Domain/Model";
import { MuscleGroup } from "../Domain/MuscleGroup";
import {
  localizedCaseInsensitiveCompare,
  localizedCaseInsensitiveContains,
  trimmingWhitespacesAndNewlines,
} from "../Support/progress";
import { sortedWhere } from "../Support/engine";
import { compare, maxBy } from "../Support/swift";

// Artboards 40b–40d · choosing which exercise Progressie is showing.
//
// One list, built three ways: what this account starred, what it trained
// last, and the catalogue under six muscle groups. Every row says what the
// exercise is and when it was last done, so a name nobody remembers is
// recognised rather than recalled.
//
// It offers the catalogue, not the history: an exercise with nothing logged
// is still there, saying so. Nothing here ranks or substitutes — that is
// `Substitution`'s work, and it reads the same attributes for a different
// reason.

export interface ExercisePicker_Row {
  exerciseID: string;
  name: string;
  group: MuscleGroup;
  /** When it was last trained, if it ever was. */
  lastTrained?: Date;
  /** The heaviest set of that session, for 40d's second line. */
  topSetKg?: number;
  topSetReps?: number;
  isFavorite: boolean;
}

export const ExercisePicker_Row = {
  make(a: {
    exerciseID: string;
    name: string;
    group: MuscleGroup;
    lastTrained: Date | undefined;
    topSetKg: number | undefined;
    topSetReps: number | undefined;
    isFavorite: boolean;
  }): ExercisePicker_Row {
    return {
      exerciseID: a.exerciseID,
      name: a.name,
      group: a.group,
      lastTrained: a.lastTrained,
      topSetKg: a.topSetKg,
      topSetReps: a.topSetReps,
      isFavorite: a.isFavorite,
    };
  },
  id(self: ExercisePicker_Row): string {
    return self.exerciseID;
  },
  hasHistory(self: ExercisePicker_Row): boolean {
    return self.lastTrained !== undefined;
  },
};

function recencyThenName(left: ExercisePicker_Row, right: ExercisePicker_Row): boolean {
  const l = left.lastTrained;
  const r = right.lastTrained;
  if (l !== undefined && r !== undefined && l.getTime() !== r.getTime()) return l.getTime() > r.getTime();
  if (l !== undefined && r === undefined) return true;
  if (l === undefined && r !== undefined) return false;
  return localizedCaseInsensitiveCompare(left.name, right.name) < 0;
}

const byName = (a: { name: string }, b: { name: string }) => localizedCaseInsensitiveCompare(a.name, b.name) < 0;

export const ExercisePicker = {
  /**
   * Every exercise the picker offers: the catalogue's own, in name order.
   * An exercise without authored attributes has no group to file it under,
   * and is left out rather than dropped into a wrong one.
   */
  offered(a: { catalog?: Record<string, Exercise> } = {}): Exercise[] {
    const catalog = a.catalog ?? ExerciseCatalog.all;
    return sortedWhere(
      Object.values(catalog).filter((exercise) => Exercise.group(exercise) !== undefined),
      byName,
    );
  },

  /**
   * `rows(sessions:favorites:catalog:)`. The rows for every offered exercise,
   * each carrying what the account did with it. Built once and filtered from,
   * so one pass over the sessions serves the whole sheet.
   */
  rowsSessions(a: {
    sessions: TrainingSession[];
    favorites?: Set<string>;
    catalog?: Record<string, Exercise>;
  }): ExercisePicker_Row[] {
    const favorites = a.favorites ?? new Set<string>();
    const catalog = a.catalog ?? ExerciseCatalog.all;
    const last = new Map<string, { date: Date; weightKg: number | undefined; reps: number | undefined }>();
    for (const session of a.sessions) {
      if (session.kind !== "workout") continue;
      for (const result of session.results) {
        const held = last.get(result.exerciseID);
        if (held && held.date.getTime() >= session.date.getTime()) continue;
        const top = maxBy(
          result.sets.filter((set) => !set.isWarmup),
          (x, y) => compare([x.weightKg ?? 0, x.reps], [y.weightKg ?? 0, y.reps]) < 0,
        );
        if (top === undefined) continue;
        last.set(result.exerciseID, { date: session.date, weightKg: top.weightKg, reps: top.reps });
      }
    }

    const all = ExercisePicker.offered({ catalog }).flatMap((exercise) => {
      const group = Exercise.group(exercise);
      if (group === undefined) return [];
      const history = last.get(exercise.id);
      return [
        ExercisePicker_Row.make({
          exerciseID: exercise.id,
          name: exercise.name,
          group,
          lastTrained: history?.date,
          topSetKg: history?.weightKg,
          topSetReps: history?.reps,
          isFavorite: favorites.has(exercise.id),
        }),
      ];
    });
    return ExercisePicker.mergingAliases(all);
  },

  /**
   * One row per physical exercise. The catalogue keys some exercises per
   * training day (`push-shoulder` and `upper-shoulder` are the same
   * machine), which listed them twice. The row kept is the one trained most
   * recently — its history is what the account means by that exercise —
   * else the canonical id; it is starred if any of them is.
   */
  mergingAliases(rows: ExercisePicker_Row[]): ExercisePicker_Row[] {
    const canonicalOf = (id: string) => ExerciseMetadata.canonicalID[id] ?? id;
    const groups = new Map<string, ExercisePicker_Row[]>();
    for (const row of rows) {
      const key = canonicalOf(row.exerciseID);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const kept = new Map<string, ExercisePicker_Row>();
    for (const [canonical, members] of groups) {
      const trained = maxBy(
        members.filter((m) => m.lastTrained !== undefined),
        (x, y) => x.lastTrained!.getTime() < y.lastTrained!.getTime(),
      );
      const row = trained ?? members.find((m) => m.exerciseID === canonical) ?? members[0];
      kept.set(canonical, { ...row, isFavorite: members.some((m) => m.isFavorite) });
    }
    // The catalogue's order, as before.
    const seen = new Set<string>();
    const out: ExercisePicker_Row[] = [];
    for (const row of rows) {
      const canonical = canonicalOf(row.exerciseID);
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      out.push(kept.get(canonical)!);
    }
    return out;
  },

  /**
   * 40b's top block: what this account starred, most recently trained
   * first, then by name so the list never reshuffles on its own.
   */
  favorites(a: { in: ExercisePicker_Row[] }): ExercisePicker_Row[] {
    return sortedWhere(
      a.in.filter((row) => row.isFavorite),
      recencyThenName,
    );
  },

  /**
   * 40c: with nothing starred, the same place holds what was trained last,
   * so the sheet never opens empty.
   */
  recent(a: { in: ExercisePicker_Row[]; limit?: number }): ExercisePicker_Row[] {
    const limit = a.limit ?? 3;
    return sortedWhere(
      a.in.filter((row) => ExercisePicker_Row.hasHistory(row)),
      recencyThenName,
    ).slice(0, Math.max(0, limit));
  },

  /** The six rows of 40b, each with how many exercises it holds. */
  groups(a: { in: ExercisePicker_Row[] }): { group: MuscleGroup; count: number }[] {
    return MuscleGroup.allCases.map((group) => ({
      group,
      count: a.in.filter((row) => row.group === group).length,
    }));
  },

  /**
   * `rows(in:of:)`. One group's exercises (40d): what has been logged first,
   * newest first, then the rest by name — so the ones you might be looking
   * for are at the top, and the ones you have never done are still there.
   */
  rowsIn(a: { in: MuscleGroup; of: ExercisePicker_Row[] }): ExercisePicker_Row[] {
    const inside = a.of.filter((row) => row.group === a.in);
    const logged = sortedWhere(
      inside.filter((row) => ExercisePicker_Row.hasHistory(row)),
      recencyThenName,
    );
    const unlogged = sortedWhere(
      inside.filter((row) => !ExercisePicker_Row.hasHistory(row)),
      byName,
    );
    return [...logged, ...unlogged];
  },

  /** "7 oefeningen · 4 met historiek" — 40d's line under the group's name. */
  summary(a: { of: MuscleGroup; in: ExercisePicker_Row[] }): string {
    const inside = a.in.filter((row) => row.group === a.of);
    const noun = inside.length === 1 ? "exercise" : "exercises";
    const logged = inside.filter((row) => ExercisePicker_Row.hasHistory(row)).length;
    if (!(logged > 0)) return `${inside.length} ${noun} · nothing logged yet`;
    return `${inside.length} ${noun} · ${logged} with history`;
  },

  /**
   * Typed search over the same rows. Matches anywhere in the name, because
   * "bankdrukken" is as likely to be searched for as "dumbbell".
   */
  search(query: string, a: { in: ExercisePicker_Row[] }): ExercisePicker_Row[] {
    const asked = trimmingWhitespacesAndNewlines(query);
    if (asked.length === 0) return [];
    return sortedWhere(
      a.in.filter((row) => localizedCaseInsensitiveContains(row.name, asked)),
      (left, right) => {
        // A name that starts with what was typed comes first.
        const leftStarts = left.name.toLowerCase().startsWith(asked.toLowerCase());
        const rightStarts = right.name.toLowerCase().startsWith(asked.toLowerCase());
        if (leftStarts !== rightStarts) return leftStarts;
        return recencyThenName(left, right);
      },
    );
  },
};
