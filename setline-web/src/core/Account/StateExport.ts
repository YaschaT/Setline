import { LoggedSet, type TrainingSession } from "../Domain/Model";
import { LegacyAdapter } from "../Legacy/LegacyAdapter";
import type { JSONValue } from "../Legacy/JSONValue";
import type { LegacyState } from "../Legacy/LegacyState";
import { StateMerge } from "../Sync/StateMerge";
import { formatPOSIX } from "../Support/calendar";
import { sortedWhere } from "../Support/engine";

/**
 * `JSONEncoder` with `[.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]`:
 * two-space indent, `"key" : value`, keys in code-point order, and empty
 * containers written open and closed on their own lines, as Foundation does.
 */
function prettySorted(value: JSONValue, indent: string): string {
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    const items = value.map((v) => `${inner}${prettySorted(v, inner)}`);
    return `[\n${items.join(",\n")}\n${indent}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    const items = keys.map((k) => `${inner}${JSON.stringify(k)} : ${prettySorted(value[k], inner)}`);
    return `{\n${items.join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

function escaped(field: string): string {
  if (!(field.includes(",") || field.includes("\"") || field.includes("\n"))) return field;
  return "\"" + field.replaceAll("\"", "\"\"") + "\"";
}

/**
 * "Exporteer alles" — the account's own data, in both formats the design
 * promises, built on the device so it works offline.
 *
 * What never leaves with it: access tokens, refresh tokens and anything else
 * in the Keychain (they are not part of the state to begin with), and the
 * sync journal — deletion records and the reset marker describe how syncing
 * works, not what was trained.
 */
export const StateExport = {
  /** Sync bookkeeping, excluded from the export. */
  get syncInternals(): Set<string> {
    return new Set([StateMerge.tombstonesKey, StateMerge.resetKey]);
  },

  /** The whole stored state, minus sync bookkeeping, as pretty JSON (Swift returns it as UTF-8 `Data`). */
  json(a: { from: LegacyState }): string {
    const raw = { ...a.from.raw };
    for (const key of StateExport.syncInternals) delete raw[key];
    return prettySorted(raw, "");
  },

  /**
   * One row per logged working set, with the context needed to read it back:
   * which session, which exercise, and how the set was performed.
   *
   * Machine-readable on purpose: `,` separates fields and decimals use a
   * point, so any spreadsheet or script can open it. Warm-ups are left out —
   * they are never stored as training data.
   */
  csv(a: { from: TrainingSession[] }): string {
    const rows = [
      "date,day,session_id,exercise,exercise_id,set,weight_kg,reps,rir,paused_reps,partial_reps,type,replaces,session_min,sets_planned,sets_logged,completed_pct",
    ];
    for (const session of sortedWhere(a.from, (l, r) => l.date.getTime() < r.date.getTime())) {
      const date = LegacyAdapter.isoString(session.date);
      const duration = session.durationSeconds !== undefined ? `${Math.trunc(session.durationSeconds / 60)}` : "";
      const planned = session.plannedSetCount !== undefined ? String(session.plannedSetCount) : "";
      const completed = session.completedSetCount !== undefined ? String(session.completedSetCount) : "";
      for (const result of session.results) {
        for (const set of result.sets) {
          if (!(LoggedSet.isLogged(set) && !set.isWarmup)) continue;
          const weight = set.weightKg !== undefined ? `${set.weightKg}` : "";
          const rir = set.rirReported !== undefined ? String(set.rirReported) : "";
          const paused = set.pausedReps !== undefined ? String(set.pausedReps) : "";
          const partial = set.partialReps !== undefined ? String(set.partialReps) : "";
          const kind = set.origin === "sessionAdded" ? "extra" : "prescribed";
          const substituted = set.substitutedFrom ?? "";

          const fields: string[] = [date, session.dayLabel, session.id, result.name, result.exerciseID];
          fields.push(`${set.index + 1}`);
          fields.push(weight, `${set.reps}`, rir, paused, partial, kind, substituted);
          fields.push(duration, planned, completed, `${session.completion}`);
          rows.push(fields.map(escaped).join(","));
        }
      }
    }
    return rows.join("\n") + "\n";
  },

  /** Dated names, so two exports never overwrite each other in Files. */
  fileNames(a: { now?: Date } = {}): { json: string; csv: string } {
    const stamp = formatPOSIX(a.now ?? new Date(), "yyyy-MM-dd");
    return { json: `setline-export-${stamp}.json`, csv: `setline-sets-${stamp}.csv` };
  },
};
