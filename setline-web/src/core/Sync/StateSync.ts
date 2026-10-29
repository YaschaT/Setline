import { PainFlag } from "../Domain/PainFlag";
import { ProgramReplacement } from "../Domain/Substitution";
import { LegacyAdapter } from "../Legacy/LegacyAdapter";
import { JSONValue } from "../Legacy/JSONValue";
import { LegacyState } from "../Legacy/LegacyState";
import { addingTimeInterval } from "../Support/calendar";
import { distantPast } from "../Support/progress";
import { deepEqual } from "../Support/swift";
import { StateChange } from "./StateChange";
import { StateMerge } from "./StateMerge";

/** Where the shared state is stored, as the sync loop sees it. */
export interface StateStore {
  /** The stored state and its version, or `nil` when the account has none yet. */
  fetch(): Promise<RemoteState | undefined>;
  /** Writes only if the stored version is still `expectedVersion`. */
  update(state: LegacyState, a: { expectedVersion: string; nextVersion: string }): Promise<WriteOutcome>;
  /** Creates the stored state. One that appeared in the meantime is a conflict. */
  insert(state: LegacyState, a: { nextVersion: string }): Promise<WriteOutcome>;
}

export interface RemoteState {
  readonly state: LegacyState;
  /** The row's `updated_at`, exactly as the server returned it. */
  readonly version: string;
}

export const RemoteState = {
  make(a: { state: LegacyState; version: string }): RemoteState {
    return { state: a.state, version: a.version };
  },
};

export type WriteOutcome = { kind: "written"; version: string } | { kind: "conflict" };

export interface StateSync_Outcome {
  /** The state as stored once the changes are in. */
  readonly state: LegacyState;
  readonly version?: string;
  /**
   * Changes the stored state now reflects: written, or settled because
   * a later deletion or reset outranked them.
   */
  readonly settled: Set<string>;
}

/** `JSONValue` items of an array member, as Swift's `?.arrayValue ?? []`. */
const arrayOf = (value: JSONValue | undefined) => JSONValue.arrayValue(value) ?? [];
const idOf = (value: JSONValue | undefined) => JSONValue.stringValue(JSONValue.get(value, "id"));

/**
 * The sync loop both clients share: fetch the latest stored state, apply
 * only this client's changes to it, write it back only if nobody wrote in
 * between, and otherwise fetch again and apply the same changes to that.
 */
export const StateSync = {
  maxAttempts: 3,

  /**
   * Returns `nil` when every attempt lost a race to another writer; the
   * changes then stay pending for the next sync. Network and authorisation
   * failures are thrown, and also leave the changes pending.
   *
   * - Parameter recovering: a device copy saved before changes were recorded
   *   one by one, whose offline work has to be recovered. See `recoveryChanges`.
   */
  async run(a: {
    changes: StateChange[];
    recovering?: { state: LegacyState; savedAt: Date };
    store: StateStore;
    now?: () => Date;
  }): Promise<StateSync_Outcome | undefined> {
    const now = a.now ?? (() => new Date());
    const local = a.recovering;
    const settled = new Set(a.changes.map((change) => change.id));
    for (let attempt = 0; attempt < StateSync.maxAttempts; attempt++) {
      const remote = await a.store.fetch();
      const stored = remote?.state ?? LegacyState.make({ raw: {} });
      const recovered =
        local === undefined
          ? []
          : StateSync.recoveryChanges({ from: local.state, against: stored, savedAt: local.savedAt });
      const pending = [...recovered, ...a.changes];
      const merged = StateMerge.apply(pending, { to: stored, now: now() });

      if (deepEqual(merged.raw, stored.raw)) {
        // Nothing to write: already stored, or outranked by a deletion.
        return { state: stored, version: remote?.version, settled };
      }

      const version = StateSync.nextVersion({ after: remote?.version, now: now() });
      let outcome: WriteOutcome;
      if (remote !== undefined) {
        outcome = await a.store.update(merged, { expectedVersion: remote.version, nextVersion: version });
      } else {
        outcome = await a.store.insert(merged, { nextVersion: version });
      }
      if (outcome.kind === "written") {
        return { state: merged, version: outcome.version, settled };
      }
    }
    return undefined;
  },

  /**
   * Strictly after the version being replaced, whatever this device's clock
   * says, so versions only ever move forward.
   */
  nextVersion(a: { after: string | undefined; now: Date }): string {
    const parsed = a.after === undefined ? undefined : LegacyAdapter.isoDate(a.after);
    const floor = parsed === undefined ? distantPast : addingTimeInterval(parsed, 0.001);
    return LegacyAdapter.isoString(floor.getTime() >= a.now.getTime() ? floor : a.now);
  },

  /**
   * Offline work in a device copy saved before changes were recorded.
   *
   * Such a copy only says "something here was not synced", not what. So it
   * may add what the stored state lacks, and nothing else: it never deletes,
   * never overwrites, never brings back a session whose deletion left a
   * tombstone, and — by dating every recovered change to when the copy was
   * saved — never undoes a reset made after it.
   *
   * A session deleted before tombstones existed left no trace. It cannot be
   * told apart from one that was never synced, and this would add it back.
   */
  recoveryChanges(a: { from: LegacyState; against: LegacyState; savedAt: Date }): StateChange[] {
    const local = a.from;
    const stored = a.against;
    const savedAt = a.savedAt;
    const changes: StateChange[] = [];

    const storedSessions = new Set(
      arrayOf(LegacyState.get(stored, "sessions")).flatMap((session) => {
        const id = idOf(session);
        return id === undefined ? [] : [id];
      }),
    );
    const deletedSessions = new Set(
      Object.keys(
        JSONValue.objectValue(JSONValue.get(LegacyState.get(stored, StateMerge.tombstonesKey), "sessions")) ?? {},
      ),
    );
    // Reversed, because each recovered session is inserted first.
    for (const session of [...arrayOf(LegacyState.get(local, "sessions"))].reverse()) {
      const id = idOf(session);
      if (id === undefined || storedSessions.has(id) || deletedSessions.has(id)) continue;
      changes.push(StateChange.make({ kind: "upsertSession", value: session }, { createdAt: savedAt }));
    }

    // Absent means "never stored here"; an explicit null means someone
    // cleared it, which an old copy must not undo.
    const snapshot = LegacyState.get(local, LegacyAdapter.activeSessionKey);
    if (snapshot !== undefined && snapshot !== null && LegacyState.get(stored, LegacyAdapter.activeSessionKey) === undefined) {
      changes.push(StateChange.make({ kind: "setActiveSession", value: snapshot }, { createdAt: savedAt }));
    }

    const storedFlags = new Set(LegacyAdapter.painFlags({ from: stored }).map((flag) => PainFlag.id(flag)));
    for (const flag of LegacyAdapter.painFlags({ from: local })) {
      if (storedFlags.has(PainFlag.id(flag))) continue;
      changes.push(StateChange.make({ kind: "addPainFlag", value: flag }, { createdAt: savedAt }));
    }

    const storedReplacements = new Set(
      LegacyAdapter.programReplacements({ from: stored }).map((replacement) => ProgramReplacement.id(replacement)),
    );
    for (const replacement of LegacyAdapter.programReplacements({ from: local })) {
      if (storedReplacements.has(ProgramReplacement.id(replacement))) continue;
      changes.push(StateChange.make({ kind: "addProgramReplacement", value: replacement }, { createdAt: savedAt }));
    }

    const storedExercises = new Set(LegacyAdapter.customExercises({ from: stored }).map((exercise) => exercise.id));
    for (const exercise of LegacyAdapter.customExercises({ from: local })) {
      if (storedExercises.has(exercise.id)) continue;
      changes.push(StateChange.make({ kind: "addCustomExercise", value: exercise }, { createdAt: savedAt }));
    }

    const storedHidden = LegacyAdapter.hiddenWarmups({ from: stored });
    const missingHidden = [...LegacyAdapter.hiddenWarmups({ from: local })].filter((id) => !storedHidden.has(id));
    for (const exerciseID of missingHidden.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))) {
      changes.push(StateChange.make({ kind: "hideWarmup", exerciseID }, { createdAt: savedAt }));
    }

    return changes;
  },
};
