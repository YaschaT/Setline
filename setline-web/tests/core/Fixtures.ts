// Port of ios/SetlineCore/Tests/SetlineCoreTests/Support.swift.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ExerciseResult, LoggedSet, TrainingSession } from "../../src/core/Domain/Model";
import type { LegacyState } from "../../src/core/Legacy/LegacyState";
import { StateChange } from "../../src/core/Sync/StateChange";
import { StateMerge } from "../../src/core/Sync/StateMerge";
import { addDays } from "../../src/core/Support/calendar";

const thisFile = fileURLToPath(import.meta.url);

export const Fixtures = {
  /** Locates the repository root by walking up from this file. */
  get repoRoot(): string | undefined {
    let url = thisFile;
    for (let i = 0; i < 8; i++) {
      url = dirname(url);
      if (existsSync(join(url, "TRAINING_LOGIC.md"))) return url;
    }
    return undefined;
  },

  /**
   * The real export, read in place.
   *
   * `PRIVATE-DATA/` is git-ignored and must never be copied into source or
   * test resources (HANDOVER.md guardrail 4), so the round-trip test reads
   * it from the checkout and skips itself when it is not there.
   */
  get backupData(): string | undefined {
    const root = Fixtures.repoRoot;
    if (root === undefined) return undefined;
    try {
      return readFileSync(join(root, "PRIVATE-DATA/yascha-training-backup.json"), "utf8");
    } catch {
      return undefined;
    }
  },

  session(a: {
    id: string;
    daysAgo: number;
    exerciseID: string;
    sets: { weight: number; reps: number; rir?: number }[];
  }): TrainingSession {
    const date = addDays(new Date(), -a.daysAgo);
    const logged = a.sets.map((entry, index) =>
      LoggedSet.make({ index, weightKg: entry.weight, reps: entry.reps, rirReported: entry.rir }),
    );
    return TrainingSession.make({
      id: a.id,
      date,
      dayID: "push",
      dayLabel: "Push",
      completion: 100,
      results: [ExerciseResult.make({ exerciseID: a.exerciseID, name: a.exerciseID, sets: logged })],
    });
  },
};

/**
 * `LegacyAdapter.apply(sessions:to:)`, the test convenience: stores sessions
 * the way a sync does, one change per session, keeping them in the order given.
 */
export function applySessions(sessions: readonly TrainingSession[], state: LegacyState): LegacyState {
  return StateMerge.apply([...sessions].reverse().map((session) => StateChange.upsert(session)), { to: state });
}
