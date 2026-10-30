/**
 * The arithmetic behind the SETLINE logging, week and progress screens.
 *
 * Everything here is pure and takes "today" as an argument rather than reading
 * the clock, so the screens stay the same for a whole render and the rules can
 * be tested without a browser. Nothing in this file invents a number: when the
 * data cannot answer a question, the answer is `null` and the screen says so.
 */

import { estimate1RM } from "@/lib/one-rep-max";
import { completedReps, sameExecution, setExecution, type SetExecution } from "@/lib/set-reps";
import { dateKey, parseDateKey, startOfWeek } from "@/lib/week";

/** A logged set as both clients store one. Every field may be missing. */
export type SetLike = {
  weight?: string | number | null;
  reps?: string | number | null;
  pausedReps?: string | number | null;
  pauseSeconds?: string | number | null;
  pauseEnabled?: boolean;
};

/** A saved session, reduced to what these helpers read. */
export type SessionLike = {
  id?: string;
  date: string;
  dayId: string;
  dayLabel: string;
  sessionType?: "workout" | "recovery";
  results: Array<{
    exerciseId: string;
    name: string;
    sets?: SetLike[];
    weight?: string;
    reps?: string;
  }>;
};

/** "82,5", "82.5", 82.5 → 82.5. Blank and junk read as 0, never NaN. */
export function parseNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Kilograms the Dutch way: 82,5 · 85 · 1,25. At most two decimals. */
export function formatKg(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace(".", ",");
}

/**
 * Whole numbers with a narrow space between thousands, as the design writes
 * them: 1 540 kcal, 2 450 kcal.
 */
export function formatThousands(value: number): string {
  const sign = value < 0 ? "−" : "";
  const digits = String(Math.round(Math.abs(value)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Whether a set holds anything at all — the rule the save path already uses. */
export function isLoggedSet(set: SetLike | undefined): boolean {
  if (!set) return false;
  return Boolean(set.weight || set.reps || set.pausedReps);
}

/** The sets of a saved result, whichever of the two stored shapes it has. */
export function resultSetsOf(result: SessionLike["results"][number]): SetLike[] {
  if (Array.isArray(result.sets)) return result.sets;
  return [{ weight: result.weight ?? "", reps: result.reps ?? "" }];
}

/**
 * The planned rest of an exercise in seconds, read from what the plan says:
 * "4–5 min" → 240, "90 sec" → 90, "60–90 sec" → 60, "1:30" → 90.
 *
 * A range starts at its lower bound; the timer can always be extended by the
 * person who is actually resting. `null` when the text holds no duration.
 */
export function parseRestSeconds(rest: string | undefined): number | null {
  const text = (rest ?? "").toLowerCase().replace(",", ".");
  const clock = text.match(/(\d+):(\d{2})/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:[–-]\s*\d+(?:\.\d+)?\s*)?(min|m\b|sec|s\b|seconden|minuten)/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const minutes = match[2].startsWith("m");
  return Math.round(minutes ? amount * 60 : amount);
}

/** 150 → "2:30". Negative input reads as zero. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

/** The plates this design's calculator knows, heaviest first. */
export const PLATES_KG = [20, 10, 5, 2.5, 1.25] as const;

/**
 * Plates per side for a barbell total, greedily from the heaviest plate.
 * `remainder` is what the listed plates cannot make up on one side; a total
 * below the bar comes back with no plates and a negative remainder.
 */
export function platesPerSide(total: number, bar: number, plates: readonly number[] = PLATES_KG) {
  if (!Number.isFinite(total) || !Number.isFinite(bar)) return { plates: [] as number[], remainder: 0 };
  if (total < bar) return { plates: [] as number[], remainder: (total - bar) / 2 };
  let left = (total - bar) / 2;
  const result: number[] = [];
  for (const plate of plates) {
    while (left >= plate - 1e-9) {
      result.push(plate);
      left -= plate;
    }
  }
  return { plates: result, remainder: Math.round(left * 1000) / 1000 };
}

/** "1 × 20 + 1 × 10 + 1 × 1,25 per kant", in the design's own words. */
export function describePlates(total: number, bar: number): string {
  const { plates, remainder } = platesPerSide(total, bar);
  if (remainder < 0) return `Lichter dan de stang van ${formatKg(bar)} kg`;
  if (plates.length === 0) return "Alleen de stang";
  const counts = new Map<number, number>();
  for (const plate of plates) counts.set(plate, (counts.get(plate) ?? 0) + 1);
  const parts = [...counts.entries()].map(([plate, count]) => `${count} × ${formatKg(plate)}`);
  const rest = remainder > 0 ? ` · ${formatKg(remainder)} kg per kant past niet` : "";
  return `${parts.join(" + ")} per kant${rest}`;
}

/**
 * What the next set starts at, so saving it is one tap.
 *
 * - A set already logged in this session hands its weight on ("overgenomen"),
 *   unless last session dropped the weight between these two sets — a top
 *   set followed by back-offs — in which case last session's set is the
 *   better guess.
 * - Otherwise last session's set in the same position ("doel uit …"), or its
 *   last set when this one did not exist then.
 * - Otherwise only the plan's rep target, and no weight at all.
 */
export function defaultSetValues(options: {
  current: SetLike[];
  previous: SetLike[];
  index: number;
  targetReps: number | null;
}): { weight: number | null; reps: number | null; source: "current" | "previous" | "plan" | "none" } {
  const { current, previous, index, targetReps } = options;
  const previousAt = (position: number) => {
    const set = previous[position];
    return set && isLoggedSet(set) ? set : undefined;
  };
  let lastIndex = -1;
  for (let position = Math.min(index - 1, current.length - 1); position >= 0; position -= 1) {
    if (isLoggedSet(current[position])) {
      lastIndex = position;
      break;
    }
  }
  const same = previousAt(index);
  if (lastIndex >= 0) {
    const last = current[lastIndex];
    const before = previousAt(lastIndex);
    const droppedLastTime = Boolean(same && before && parseNumber(same.weight) < parseNumber(before.weight));
    if (!droppedLastTime) {
      const weight = parseNumber(last.weight);
      const reps = same ? completedReps(same) : completedReps(last);
      // Nothing was corrected when the weight is last session's anyway, and
      // then last session is the honest source to name.
      const source = same && parseNumber(same.weight) === weight ? "previous" : "current";
      return { weight, reps: reps || null, source };
    }
  }
  const fallback = same ?? (previous.length ? [...previous].reverse().find(isLoggedSet) : undefined);
  if (fallback) {
    const reps = completedReps(fallback);
    return { weight: parseNumber(fallback.weight), reps: reps || null, source: "previous" };
  }
  if (targetReps && targetReps > 0) return { weight: null, reps: targetReps, source: "plan" };
  return { weight: null, reps: null, source: "none" };
}

/**
 * Last session in one line: "82,5 kg × 8/8/8/7" when every set shared a
 * weight, otherwise each set: "120 × 6 · 110 × 8".
 */
export function summarizeSets(sets: SetLike[]): string {
  const logged = sets.filter(isLoggedSet);
  if (logged.length === 0) return "";
  const weights = logged.map((set) => parseNumber(set.weight));
  const sameWeight = weights.every((weight) => weight === weights[0]);
  if (sameWeight) {
    const reps = logged.map((set) => completedReps(set)).join("/");
    return weights[0] > 0 ? `${formatKg(weights[0])} kg × ${reps}` : `${reps} reps`;
  }
  return logged.map((set) => `${formatKg(parseNumber(set.weight))} × ${completedReps(set)}`).join(" · ");
}

/**
 * A rough session length from the plan: every set as 45 seconds of work plus
 * its planned rest, and a minute to move between exercises. Plans without a
 * readable rest count two minutes.
 */
export function estimateSessionMinutes(items: Array<{ sets: number; restSeconds: number | null }>): number {
  const seconds = items.reduce((total, item) => {
    const rest = item.restSeconds ?? 120;
    return total + item.sets * 45 + Math.max(0, item.sets - 1) * rest + 60;
  }, 0);
  return Math.max(1, Math.round(seconds / 60));
}

/** ISO 8601 week number of a local date. */
export function isoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function isWorkout(session: SessionLike) {
  return session.sessionType !== "recovery" && session.dayId !== "rest";
}

/** Kilograms moved in one session: weight × reps over every logged set. */
export function sessionVolumeKg(session: SessionLike): number {
  return session.results.reduce(
    (total, result) =>
      total + resultSetsOf(result).reduce((sum, set) => sum + parseNumber(set.weight) * completedReps(set), 0),
    0,
  );
}

/**
 * Tonnage per Monday-to-Sunday week, oldest first, ending with the week that
 * holds `today`. Weeks without a workout are zero, not missing.
 */
export function weeklyVolume(sessions: SessionLike[], today: string, weeks = 7) {
  const thisMonday = startOfWeek(parseDateKey(today));
  const buckets = Array.from({ length: weeks }, (_, index) => {
    const monday = new Date(thisMonday);
    monday.setDate(thisMonday.getDate() - (weeks - 1 - index) * 7);
    return { key: dateKey(monday), week: isoWeek(monday), kg: 0, current: index === weeks - 1 };
  });
  const index = new Map(buckets.map((bucket, position) => [bucket.key, position]));
  for (const session of sessions) {
    if (!isWorkout(session)) continue;
    const when = new Date(session.date);
    if (!Number.isFinite(when.getTime())) continue;
    const position = index.get(dateKey(startOfWeek(when)));
    if (position === undefined) continue;
    buckets[position].kg += sessionVolumeKg(session);
  }
  return buckets;
}

/** The best set of a list by estimated 1RM, or `null` when none has one. */
export function bestSetOf(sets: SetLike[]) {
  let best: { weight: number; reps: number; e1rm: number; execution: SetExecution } | null = null;
  for (const set of sets) {
    const weight = parseNumber(set.weight);
    const reps = completedReps(set);
    const e1rm = estimate1RM(weight, reps);
    if (e1rm === null) continue;
    if (!best || e1rm > best.e1rm) best = { weight, reps, e1rm, execution: setExecution(set) };
  }
  return best;
}

/**
 * Per exercise, the best set since `since` and how it compares with the best
 * set before then. Most recently trained first.
 *
 * The comparison is between estimated maxima, so a heavier triple and a
 * lighter set of eight can be weighed against each other; the screen labels
 * the difference as an estimate. It is made only against earlier sets
 * performed the same way (`sameExecution`, TRAINING_LOGIC §9.2): measured
 * against an earlier paused best, a touch-and-go set reads as progress that is
 * only the pause coming off. The native app keeps the same rule, and
 * `tests/fixtures/best-set-comparison.json` holds both to it.
 */
export function bestSetsSince(sessions: SessionLike[], since: string, limit = 5) {
  const sinceTime = parseDateKey(since).getTime();
  type Entry = {
    exerciseId: string;
    name: string;
    best: { weight: number; reps: number; e1rm: number; execution: SetExecution; date: string } | null;
    earlier: Array<{ e1rm: number; execution: SetExecution }>;
    lastTrained: number;
  };
  const byExercise = new Map<string, Entry>();
  for (const session of sessions) {
    if (!isWorkout(session)) continue;
    const time = new Date(session.date).getTime();
    if (!Number.isFinite(time)) continue;
    for (const result of session.results) {
      const sets = resultSetsOf(result);
      const best = bestSetOf(sets);
      if (!best) continue;
      const entry = byExercise.get(result.exerciseId) ?? {
        exerciseId: result.exerciseId,
        name: result.name,
        best: null,
        earlier: [],
        lastTrained: 0,
      };
      if (time >= sinceTime) {
        if (!entry.best || best.e1rm > entry.best.e1rm) entry.best = { ...best, date: session.date };
        if (time >= entry.lastTrained) {
          entry.lastTrained = time;
          entry.name = result.name;
        }
      } else {
        for (const set of sets) {
          const e1rm = estimate1RM(parseNumber(set.weight), completedReps(set));
          if (e1rm !== null) entry.earlier.push({ e1rm, execution: setExecution(set) });
        }
      }
      byExercise.set(result.exerciseId, entry);
    }
  }
  return [...byExercise.values()]
    .filter((entry): entry is Entry & { best: NonNullable<Entry["best"]> } => entry.best !== null)
    .sort((a, b) => b.lastTrained - a.lastTrained)
    .slice(0, limit)
    .map((entry) => {
      const comparable = entry.earlier.filter((set) => sameExecution(set.execution, entry.best.execution));
      const before = comparable.length ? Math.max(...comparable.map((set) => set.e1rm)) : null;
      return {
        exerciseId: entry.exerciseId,
        name: entry.name,
        weight: entry.best.weight,
        reps: entry.best.reps,
        date: entry.best.date,
        delta: before === null ? null : Math.round((entry.best.e1rm - before) * 2) / 2,
        // Without a delta, this tells a new exercise from one trained before in
        // another way: only the first is "nieuw".
        hasEarlierBest: entry.earlier.length > 0,
      };
    });
}

/**
 * A trailing average over calendar days: for every measurement, the mean of
 * the measurements in the `days` days up to and including it.
 */
export function trailingAverage(points: Array<{ date: string; value: number }>, days = 14) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((point) => {
    const end = parseDateKey(point.date).getTime();
    const start = end - (days - 1) * 86_400_000;
    const window = sorted.filter((other) => {
      const time = parseDateKey(other.date).getTime();
      return time >= start && time <= end;
    });
    const mean = window.reduce((sum, other) => sum + other.value, 0) / window.length;
    return { date: point.date, value: point.value, average: mean };
  });
}
