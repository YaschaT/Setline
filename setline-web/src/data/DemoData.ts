// DemoData.swift — development-only sample data.
//
// The Swift app enables it with the `-SetlineDemoData` launch argument in a
// DEBUG build. The web has no launch arguments, so a development build
// (`import.meta.env.DEV`) reads the same switches from the page's URL query:
//
//   ?demo=1                    -SetlineDemoData
//   &account=<name>            -SetlineDemoAccount <name>
//   &reset=1                   -SetlineResetDemo
//   &newExercise=1             -SetlineNewExercise
//   &medals=1                  -SetlineDemoMedals
//   &streak=1 / &streak=secured  -SetlineDemoStreak [secured]
//   &upperDay=1 / &restDay=1   -SetlineUpperDay / -SetlineRestDay
//   &emptyDay=1                -SetlineEmptyDay
//   &firstRun=1                -SetlineFirstRun
//   &fatigued=1                -SetlineFatigued
//   &pausedYesterday=1         -SetlinePausedYesterday
//   &offline=1 / &expired=1 / &pending=1  -SetlineOffline / -SetlineExpired / -SetlinePending
//   &slowLoad=1                -SetlineSlowLoad
//
// This module is only ever loaded through a dynamic import inside an
// `import.meta.env.DEV` branch (AppState.restore), so a production build
// neither contains nor enables it.
//
// Entirely fabricated. `PRIVATE-DATA/` is never bundled, never copied into
// source and never shipped (HANDOVER.md guardrail 4) — this exists so the
// logging loop can be exercised and screenshotted without real credentials
// and without anyone's real history.
//
// Three prior sessions, because that is exactly the reference gate: with
// two there is no proposal and no record, with three there is.
import { addDays, isSameDay, startOfDay } from "../core/Support/calendar";
import type { JSONValue } from "../core/Legacy/JSONValue";
import { LegacyState } from "../core/Legacy/LegacyState";
import { LegacyAdapter } from "../core/Legacy/LegacyAdapter";
import { PlanCatalog } from "../core/Catalog/PlanCatalog";
import { ExerciseCatalog } from "../core/Catalog/ExerciseCatalog";
import { Schedule } from "../core/Engine/Schedule";
import { ExerciseResult, LoggedSet } from "../core/Domain/Model";
import { ActiveSessionSnapshot } from "../core/Domain/ActiveSession";
import { AuthSession } from "../core/Sync/AuthSession";

/** The URL query, read the way the Swift reads `ProcessInfo.processInfo.arguments`. */
function query(): URLSearchParams {
  if (typeof location === "undefined") return new URLSearchParams();
  return new URLSearchParams(location.search);
}

/** A switch is on when the key is present with any value but `0`. */
function flag(name: string): boolean {
  const q = query();
  return q.has(name) && q.get(name) !== "0";
}

const exerciseName = (id: string, fallback: string = id): string => ExerciseCatalog.exercise(id)?.name ?? fallback;

export const DemoData = {
  get isEnabled(): boolean {
    return import.meta.env.DEV && query().get("demo") === "1";
  },

  /** The launch-argument switches the Swift reads in AppState and RootView, on the web. */
  flag,

  /**
   * `?account=b` signs in a second demo account instead, with its own user
   * id, stored data and photos, so keeping accounts apart can be checked on
   * one device without signing in to a real one.
   */
  get session(): AuthSession {
    const requested = query().get("account");
    if (requested !== null) {
      const name = [...requested.toLowerCase()].filter((c) => /^[a-z0-9]$/.test(c)).join("");
      if (name !== "") {
        return AuthSession.make({
          accessToken: "demo",
          refreshToken: "demo",
          userID: `demo-${name}`,
          email: `demo-${name}@setline.be`,
          expiresAt: undefined,
        });
      }
    }
    return AuthSession.make({
      accessToken: "demo",
      refreshToken: "demo",
      userID: "00000000-0000-0000-0000-000000000000",
      email: "demo@setline.be",
      expiresAt: undefined,
    });
  },

  /**
   * Push, three times, at the same load, hitting the top of the range — so
   * bench reads READY and the first logged set of the new session lands as a
   * delta against it.
   */
  state(): LegacyState {
    const now = new Date();
    const loads: Record<string, number> = {
      "flat-bench": 100,
      "incline-bench": 80,
      "pec-fly": 55,
      "push-shoulder": 60,
      "push-lateral": 12,
      "overhead-triceps": 30,
      pressdown: 35,
    };

    const sessions: JSONValue[] = [];
    for (let index = 0; index < 3; index++) {
      const date = addDays(now, -(index + 1) * 7);
      // The oldest session sits one step lower, so the home screen has a
      // real "+5 kg sinds ..." to say and the two sessions since then are
      // what make the proposal READY.
      const step = index === 2 ? 5 : 0;
      // `newExercise` leaves the last push exercise out of the seeded
      // history, so it has nothing to compare against and the calibration
      // path is reachable.
      const dropsLast = flag("newExercise");
      const planned = PlanCatalog.personal.find((d) => d.id === "push")?.exercises ?? [];
      const seeded = dropsLast ? planned.slice(0, -1) : planned;
      const results = seeded.map((p): JSONValue => {
        const load = (loads[p.exerciseID] ?? 40) - step;
        const sets = p.sets.map((prescription): JSONValue => ({
          weight: `${load}`,
          reps: `${prescription.repRange.upperBound}`,
          pausedReps: "",
          pauseSeconds: "",
          pauseEnabled: false,
          rir: 1,
        }));
        return { exerciseId: p.exerciseID, name: exerciseName(p.exerciseID), sets };
      });
      sessions.push({
        id: `demo-${index}`,
        date: LegacyAdapter.isoString(date),
        dayId: "push",
        dayLabel: "Push",
        completion: 100,
        results,
      });
    }

    // Upper's bench, trained both ways — the shape that broke Progressie.
    //
    // The programme prescribes a two-second pause; three of these sessions
    // were pressed touch-and-go anyway and two were paused, and the paused
    // ones are written the way the web app writes them: the count typed out
    // over every rep. One lift, two comparable series (§9.2), and neither of
    // them may be read as the other.
    const pausedBench: { day: number; weightKg: number; reps: number; paused: boolean }[] = [
      { day: 24, weightKg: 85, reps: 5, paused: true },
      { day: 17, weightKg: 85, reps: 5, paused: true },
      { day: 10, weightKg: 100, reps: 5, paused: false },
      { day: 6, weightKg: 100, reps: 4, paused: false },
      { day: 3, weightKg: 97, reps: 5, paused: false },
    ];
    pausedBench.forEach((entry, index) => {
      const date = addDays(now, -entry.day);
      const sets: JSONValue[] = [0, 1, 2].map(() => ({
        weight: `${entry.weightKg}`,
        reps: `${entry.reps}`,
        pausedReps: entry.paused ? `${entry.reps}` : "",
        pauseSeconds: entry.paused ? "2" : "",
        pauseEnabled: entry.paused,
        rir: 2,
      }));
      sessions.push({
        id: `demo-upper-${index}`,
        date: LegacyAdapter.isoString(date),
        dayId: "upper",
        dayLabel: "Upper",
        completion: 100,
        results: [{ exerciseId: "upper-paused-bench", name: exerciseName("upper-paused-bench", "Paused bench"), sets }],
      });
    });

    // `medals` adds a fourth Push two days ago that beats, matches and
    // trails the three before it, so the workout page shows gold, silver and
    // bronze.
    if (flag("medals")) {
      const date = addDays(now, -2);
      const change: Record<string, number> = { "flat-bench": 2.5, "incline-bench": 0, "pec-fly": -2.5 };
      const planned = PlanCatalog.personal.find((d) => d.id === "push")?.exercises ?? [];
      const results = planned.map((p): JSONValue => {
        const load = (loads[p.exerciseID] ?? 40) + (change[p.exerciseID] ?? -20);
        const sets = p.sets.map((prescription): JSONValue => ({
          weight: `${load}`,
          reps: `${prescription.repRange.upperBound}`,
          pausedReps: "",
          pauseSeconds: "",
          pauseEnabled: false,
          rir: 1,
        }));
        return { exerciseId: p.exerciseID, name: exerciseName(p.exerciseID), sets };
      });
      sessions.push({
        id: "demo-medals",
        date: LegacyAdapter.isoString(date),
        dayId: "push",
        dayLabel: "Push",
        completion: 100,
        durationSeconds: 3060,
        results,
      });
    }

    // `streak` fills every day of the four weeks before this one, so
    // Training has a streak to show. `streak=secured` also fills this week up
    // to its goal with today as the last one, for the week-secured moment.
    const streakValue = query().get("streak");
    if (streakValue !== null && streakValue !== "0") {
      const secured = streakValue === "secured";
      const monday = Schedule.mondayFirstWeek({ containing: now })[0] ?? now;
      let dates: Date[] = Array.from({ length: 28 }, (_, i) => addDays(monday, -(i + 1)));
      if (secured) {
        const others = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => !isSameDay(d, now));
        dates = [...dates, ...others.slice(0, 5), new Date()];
      }
      dates.forEach((date, index) => {
        sessions.push({
          id: `demo-streak-${index}`,
          date: LegacyAdapter.isoString(date),
          dayId: "legs",
          dayLabel: "Legs",
          completion: 100,
          results: [],
        });
      });
    }

    // Today is a push day whatever the weekday, so the slice is always
    // reachable from a cold launch.
    // `upperDay` puts today on Upper, which is where the planned paused
    // bench lives.
    // `restDay` rests today, for the screens that only show then.
    const today = flag("restDay") ? "rest" : flag("upperDay") ? "upper" : "push";
    const overrides: JSONValue = { [`personal:${Schedule.dateKey(new Date())}`]: today };

    // Weigh-ins, so the Lichaam segment has a real series to draw. The
    // numbers are the design's own (79,8 → 82,4 kg), kept consistent with
    // the rest of the mock.
    const weighIns: [number, string][] = [[56, "79.8"], [28, "81"], [14, "81.8"], [3, "82.4"]];
    const metrics = weighIns.map(([daysAgo, weight]): JSONValue => {
      const when = addDays(now, -daysAgo);
      return { id: `demo-weigh-${daysAgo}`, date: Schedule.dateKey(when), weight: Number(weight) || 0 };
    });

    // A day's eating, with 42a's own rows: 1.100 of 2.250 kcal eaten, so
    // 1.150 left, macros adding up to 88 · 131 · 32, and avondeten still
    // empty. Each item carries its amount and the hour it was logged at, so
    // the row, the amount stepper and "gelogd 7:40" all have something real
    // to show. The three dinners before today are what "vaak bij avondeten"
    // is read from.
    interface DemoFood {
      day: number; meal: string; name: string; calories: number; protein: number; carbs: number; fat: number;
      amount: number; unit: string; hour: number; minute: number;
    }
    const f = (day: number, meal: string, name: string, calories: number, protein: number, carbs: number, fat: number, amount: number, unit: string, hour: number, minute: number): DemoFood =>
      ({ day, meal, name, calories, protein, carbs, fat, amount, unit, hour, minute });
    const food: DemoFood[] = [
      f(0, "Ontbijt", "Oatmeal", 375, 15, 60, 12, 100, "g", 7, 40),
      f(0, "Ontbijt", "Low-fat quark", 145, 26, 10, 1, 250, "g", 7, 40),
      f(0, "Lunch", "Wholegrain sandwich", 170, 9, 30, 4, 2, "sneden", 12, 55),
      f(0, "Lunch", "Cheese", 100, 9, 1, 12, 30, "g", 12, 55),
      f(0, "Snack", "Whey", 120, 26, 3, 2, 30, "g", 16, 20),
      f(0, "Snack", "Banana", 190, 3, 27, 1, 1, "stuk", 16, 20),

      f(3, "Avondeten", "Chicken breast", 290, 62, 0, 6, 180, "g", 19, 10),
      f(3, "Avondeten", "Rice, cooked", 390, 8, 86, 1, 250, "g", 19, 10),
      f(2, "Avondeten", "Chicken breast", 290, 62, 0, 6, 180, "g", 19, 25),
      f(2, "Avondeten", "Broccoli", 60, 5, 7, 1, 200, "g", 19, 25),
      f(2, "Ontbijt", "Low-fat quark", 145, 26, 10, 1, 250, "g", 7, 55),
      f(1, "Avondeten", "Rice, cooked", 390, 8, 86, 1, 250, "g", 19, 0),
      f(1, "Snack", "Whey", 120, 26, 3, 2, 30, "g", 16, 45),
    ];
    // `emptyDay` keeps the history and leaves today blank, which is the one
    // state the fabricated day cannot otherwise show (42b).
    const blankToday = flag("emptyDay");
    const nutritionEntries = food
      .filter((item) => !blankToday || item.day > 0)
      .map((item, index): JSONValue => {
        const midnight = startOfDay(addDays(now, -item.day));
        const when = new Date(midnight.getTime() + (item.hour * 60 + item.minute) * 60_000);
        return {
          id: `demo-food-${index}`,
          date: Schedule.dateKey(when),
          meal: item.meal,
          name: item.name,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          amount: item.amount,
          unit: item.unit,
          loggedAt: LegacyAdapter.isoString(when),
        };
      });

    const raw: Record<string, JSONValue> = {
      planMode: "personal",
      sciencePlanId: "ppl-ul",
      sessions,
      metrics,
      scheduleOverrides: overrides,
      nutritionEntries,
      targets: { calories: 2250, protein: 165, carbs: 240, fat: 70 },
      updatedAt: LegacyAdapter.isoString(new Date()),
    };

    // `firstRun` keeps the plan and drops the history, so the first-run home
    // (artboard 08) is reachable.
    if (flag("firstRun")) {
      raw.sessions = [];
      return LegacyState.make({ raw });
    }

    // `fatigued` seeds two recent push sessions in which reps fall at the
    // same load on two exercises and RIR falls on a third — the two signals
    // artboard 18R proposes on.
    if (flag("fatigued")) {
      const result = (id: string, load: string, reps: number, rir: number | undefined): JSONValue => {
        const set: Record<string, JSONValue> = {
          weight: load,
          reps: `${reps}`,
          pausedReps: "",
          pauseSeconds: "",
          pauseEnabled: false,
        };
        if (rir !== undefined) set.rir = rir;
        return { exerciseId: id, name: exerciseName(id), sets: [set] };
      };
      const tired: JSONValue[] = ([[2, 5, 11, 0], [5, 6, 12, 2]] as const).map(([offset, bench, fly, rir]): JSONValue => {
        const date = addDays(now, -offset);
        return {
          id: `demo-tired-${offset}`,
          date: LegacyAdapter.isoString(date),
          dayId: "push",
          dayLabel: "Push",
          completion: 100,
          results: [result("flat-bench", "100", bench, undefined), result("pec-fly", "55", fly, undefined), result("pressdown", "35", 12, rir)],
        };
      });
      raw.sessions = [...tired, ...sessions];
    }

    // `pausedYesterday` seeds a paused Pull session dated yesterday, so the
    // across-a-date-boundary resume can be exercised without touching the
    // device clock.
    if (flag("pausedYesterday")) {
      const state = LegacyState.make({ raw });
      const yesterday = addDays(now, -1);
      const pullDay = PlanCatalog.personal.find((d) => d.id === "pull");
      const results = (pullDay?.exercises.slice(0, 2) ?? []).map((planned, index) =>
        ExerciseResult.make({
          exerciseID: planned.exerciseID,
          name: exerciseName(planned.exerciseID),
          sets: planned.sets.map((_, setIndex) =>
            LoggedSet.make({ index: setIndex, weightKg: 60, reps: index === 0 && setIndex < 2 ? 8 : 0 }),
          ),
        }),
      );
      return LegacyAdapter.applyActiveSession({
        activeSession: ActiveSessionSnapshot.make({
          dayID: "pull",
          dayLabel: "Pull",
          startedAt: yesterday,
          currentIndex: 0,
          results,
          // 25 minutes trained yesterday before pausing. The fourteen hours
          // since must not appear in the clock.
          activeSeconds: 1_500,
        }),
        to: state,
      });
    }

    return LegacyState.make({ raw });
  },
};
