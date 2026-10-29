import { LoggedSet } from "../Domain/Model";
import { NumberDisplay } from "../Engine/NumberDisplay";
import { RecordsEngine } from "../Engine/RecordsEngine";
import { LegacyAdapter } from "../Legacy/LegacyAdapter";
import { JSONValue } from "../Legacy/JSONValue";
import type { StateChange } from "./StateChange";

/**
 * What is still only on this device, as artboard 24's "IN DE WACHTRIJ" list
 * shows it: one row per thing a person would recognise, not one per change.
 *
 * A rearranged week is one row, however many dates it touched. Internal
 * bookkeeping — the paused-session snapshot, a hidden warm-up — is not
 * something anyone is waiting on, so it is not listed.
 */
export interface SyncQueue_Row {
  readonly title: string;
  readonly detail: string;
}

export const SyncQueue_Row = {
  make(a: { title: string; detail: string }): SyncQueue_Row {
    return { title: a.title, detail: a.detail };
  },
};

export const SyncQueue = {
  rows(a: { from: StateChange[]; display?: NumberDisplay }): SyncQueue_Row[] {
    const display = a.display ?? NumberDisplay.english;
    const rows: SyncQueue_Row[] = [];
    let weekDates = 0;
    let weekRow: number | undefined;

    for (const change of a.from) {
      const kind = change.kind;
      switch (kind.kind) {
        case "upsertSession": {
          const session = LegacyAdapter.session({ from: kind.value });
          if (session === undefined) continue;
          const sets = session.results.flatMap((result) => result.sets).filter((set) => LoggedSet.isLogged(set));
          const volume = RecordsEngine.volumeLoad(sets);
          const row = SyncQueue_Row.make({
            title: `${session.dayLabel} · ${NumberDisplay.shortDate(display, session.date)}`,
            detail: volume > 0 ? `${sets.length} sets · ${NumberDisplay.volumeKg(display, volume)}` : `${sets.length} sets`,
          });
          // A session saved twice is still one session waiting.
          const index = rows.findIndex((existing) => existing.title === row.title);
          if (index !== -1) {
            rows[index] = row;
          } else {
            rows.push(row);
          }
          break;
        }

        case "correctSessionSets": {
          // A correction waits as its own row: the session it belongs to
          // is already in the account, and what is queued is the change
          // to it.
          const sets = kind.corrections.length === 1 ? "1 set" : `${kind.corrections.length} sets`;
          rows.push(SyncQueue_Row.make({ title: "Correction", detail: `${sets} in an earlier session` }));
          break;
        }

        case "removeSession":
          rows.push(SyncQueue_Row.make({ title: "Session deleted", detail: "Log" }));
          break;

        case "removeSessionSets": {
          const sets = kind.removals.length === 1 ? "1 set" : `${kind.removals.length} sets`;
          rows.push(SyncQueue_Row.make({ title: "Correction", detail: `${sets} removed from an earlier session` }));
          break;
        }

        case "setScheduleDay":
        case "removeScheduleOverride": {
          weekDates += 1;
          const row = SyncQueue_Row.make({
            title: "Week plan",
            detail: weekDates === 1 ? "1 day changed" : `${weekDates} days changed`,
          });
          if (weekRow !== undefined) {
            rows[weekRow] = row;
          } else {
            weekRow = rows.length;
            rows.push(row);
          }
          break;
        }

        case "upsertNutritionEntry": {
          const name = JSONValue.stringValue(JSONValue.get(kind.value, "name")) ?? "Maaltijd";
          const calories = JSONValue.decimalValue(JSONValue.get(kind.value, "calories"));
          const kcal = calories === undefined ? "" : NumberDisplay.kcal(display, calories);
          rows.push(SyncQueue_Row.make({ title: name, detail: kcal.length === 0 ? "Nutrition" : `Nutrition · ${kcal}` }));
          break;
        }

        case "removeNutritionEntry":
          rows.push(SyncQueue_Row.make({ title: "Meal deleted", detail: "Nutrition" }));
          break;

        case "upsertMetric": {
          const value = JSONValue.decimalValue(JSONValue.get(kind.value, "weight"));
          const weight = value === undefined ? "" : NumberDisplay.kg(display, value);
          rows.push(SyncQueue_Row.make({ title: "Weigh-in", detail: weight.length === 0 ? "Body" : `Body · ${weight}` }));
          break;
        }

        case "setTarget":
          if (!rows.some((row) => row.title === "Daily targets")) {
            rows.push(SyncQueue_Row.make({ title: "Daily targets", detail: "Changed" }));
          }
          break;

        case "setProgram":
          rows.push(SyncQueue_Row.make({ title: "Program", detail: "Changed" }));
          break;

        case "setExperience":
        case "setEquipment":
          if (!rows.some((row) => row.title === "Intake")) {
            rows.push(SyncQueue_Row.make({ title: "Intake", detail: "Your answers" }));
          }
          break;

        case "setDeload":
          rows.push(SyncQueue_Row.make({ title: "Lighter week", detail: "Suggestion applied" }));
          break;

        case "addPainFlag":
        case "removePainFlag":
          if (!rows.some((row) => row.title === "Something hurts")) {
            rows.push(SyncQueue_Row.make({ title: "Something hurts", detail: "What you filled in" }));
          }
          break;

        case "addProgramReplacement":
        case "removeProgramReplacement":
        case "addCustomExercise":
        case "upsertCustomWorkout":
        case "removeCustomWorkout":
          if (!rows.some((row) => row.title === "Exercises")) {
            rows.push(SyncQueue_Row.make({ title: "Exercises", detail: "Replaced or added" }));
          }
          break;

        // A paused workout, a hidden ramp and a starred exercise are
        // preferences, not work waiting to be saved: they sync like
        // everything else, but the list is about what you did.
        case "setActiveSession":
        case "hideWarmup":
        case "setFavoriteExercise":
          continue;
      }
    }
    return rows;
  },
};
