import type { JSONValue } from "../Legacy/JSONValue";
import {
  KeyedContainer,
  decodeArray,
  decodeBool,
  decodeInt,
  decodeSet,
  decodeString,
  decodeUUID,
  encodeJSON,
} from "../Support/codable";
import { deepEqual, uuid } from "../Support/swift";
import { ExerciseResult, LoggedSet, PlannedExercise, SetPrescription } from "./Model";
import { ProgramReplacement } from "./Substitution";
import type { SetOrigin } from "./Vocabulary";

// A `mutating func` returns the updated slot. One that also returns a value
// (`addSet`, `removeAddedSet`, `removeSet`, `undo`) returns `[slot, value]`.

/** The exercise currently occupying the slot, with its rows. */
export interface SessionSlot_Segment {
  exerciseID: string;
  /**
   * As it was when the slot was built, so a renamed exercise never
   * rewrites what the session shows.
   */
  exerciseName: string;
  /**
   * One prescription per *prescribed* row, in order. Rows added during
   * the session have no prescription: they carry `origin ==
   * .sessionAdded` and always follow the prescribed rows.
   */
  prescription: SetPrescription[];
  sets: LoggedSet[];
  /**
   * The exercise this one stands in for, today only. `nil` for the
   * programmed exercise — including after a permanent replacement,
   * which is not a stand-in.
   */
  substitutedFromID?: string;
  proposalDismissed: boolean;
  /** How far `Mik op` has moved every row's rep target. */
  repTargetOffset: number;
}

export const SessionSlot_Segment = {
  make(p: {
    exerciseID: string;
    exerciseName: string;
    prescription: SetPrescription[];
    sets: LoggedSet[];
    substitutedFromID?: string;
    proposalDismissed?: boolean;
    repTargetOffset?: number;
  }): SessionSlot_Segment {
    return {
      exerciseID: p.exerciseID,
      exerciseName: p.exerciseName,
      prescription: p.prescription,
      sets: p.sets,
      substitutedFromID: p.substitutedFromID,
      proposalDismissed: p.proposalDismissed ?? false,
      repTargetOffset: p.repTargetOffset ?? 0,
    };
  },

  decode(json: JSONValue): SessionSlot_Segment {
    const c = new KeyedContainer(json);
    return {
      exerciseID: c.decode("exerciseID", decodeString),
      exerciseName: c.decode("exerciseName", decodeString),
      prescription: c.decode("prescription", decodeArray(SetPrescription.decode)),
      sets: c.decode("sets", decodeArray(LoggedSet.decode)),
      substitutedFromID: c.decodeIfPresent("substitutedFromID", decodeString),
      proposalDismissed: c.decode("proposalDismissed", decodeBool),
      repTargetOffset: c.decode("repTargetOffset", decodeInt),
    };
  },
};

/** The slot exactly as it stood before one swap. */
export interface SessionSlot_UndoPoint {
  /**
   * Identifies this one change, so an undo raised for it — the toast
   * above the primary action — can never reverse a different one.
   */
  id: string;
  active: SessionSlot_Segment;
  /**
   * The logged sets that swap moved into `preserved`. Undo moves exactly
   * these back, so work preserved by any later swap stays preserved.
   */
  movedSetIDs: Set<string>;
  wasPermanent: boolean;
  /**
   * The program change this swap wrote, when it was permanent. It rides
   * with the undo point so reversing it — in this session, or after a
   * pause and a cold launch — removes exactly that record.
   */
  replacement?: ProgramReplacement;
}

export const SessionSlot_UndoPoint = {
  make(p: {
    active: SessionSlot_Segment;
    movedSetIDs: Set<string>;
    wasPermanent: boolean;
    replacement: ProgramReplacement | undefined;
  }): SessionSlot_UndoPoint {
    return {
      id: uuid(),
      active: p.active,
      movedSetIDs: p.movedSetIDs,
      wasPermanent: p.wasPermanent,
      replacement: p.replacement,
    };
  },

  /**
   * Tolerates undo points saved before they carried an id or a program
   * change. A paused session that failed to decode would not fail
   * loudly — it would simply not be there to resume.
   */
  decode(json: JSONValue): SessionSlot_UndoPoint {
    const c = new KeyedContainer(json);
    return {
      id: c.decodeIfPresent("id", decodeUUID) ?? uuid(),
      active: c.decode("active", SessionSlot_Segment.decode),
      movedSetIDs: c.decodeIfPresent("movedSetIDs", decodeSet(decodeUUID)) ?? new Set<string>(),
      wasPermanent: c.decodeIfPresent("wasPermanent", decodeBool) ?? false,
      replacement: c.decodeIfPresent("replacement", ProgramReplacement.decode),
    };
  },
};

/** A row removed with `removeAddedSet`, with what it takes to put it back. */
export interface SessionSlot_RemovedSet {
  readonly set: LoggedSet;
  readonly position: number;
  /** The exercise the row was on. It only ever goes back there. */
  readonly exerciseID: string;
  /**
   * What the program asked of a prescribed row that was dropped for
   * today; nil for an added row.
   */
  prescription?: SetPrescription;
}

export const SessionSlot_RemovedSet = {
  make(p: { set: LoggedSet; position: number; exerciseID: string; prescription?: SetPrescription }): SessionSlot_RemovedSet {
    return { set: p.set, position: p.position, exerciseID: p.exerciseID, prescription: p.prescription };
  },
};

/**
 * One position in a live session, and everything that happened in it.
 *
 * A swap changes the *future* of a slot, never its past. Sets already written
 * stay with the exercise they were written under; only the rows still open
 * move to the substitute. Undo puts the slot back exactly as it was before
 * the swap — and anything written on the substitute in the meantime is kept
 * as well, as its own result.
 *
 * Pure data, for two reasons: the rule "logged work is never discarded" has
 * to be testable without a screen, and the whole slot has to ride inside a
 * paused-session snapshot and come back intact after a cold launch.
 */
export interface SessionSlot {
  /** Position in the day. The slot's identity for the life of the session. */
  readonly position: number;
  /** What the plan prescribed here when the session started. */
  readonly plan: PlannedExercise;
  active: SessionSlot_Segment;
  /**
   * Work logged in this slot under an exercise that is no longer active.
   * Only ever appended to by a swap, or handed back by the undo that
   * reverses that same swap.
   */
  readonly preserved: ExerciseResult[];
  /** Most recent last. */
  readonly undoStack: SessionSlot_UndoPoint[];
}

/** Set numbers follow the rows. */
function renumber(sets: readonly LoggedSet[]): LoggedSet[] {
  return sets.map((set, position) => (set.index === position ? set : { ...set, index: position }));
}

export const SessionSlot = {
  make(p: { position: number; plan: PlannedExercise; exerciseName: string; prefillWeight?: number }): SessionSlot {
    const plan = p.plan;
    return {
      position: p.position,
      plan,
      active: SessionSlot_Segment.make({
        exerciseID: plan.exerciseID,
        exerciseName: p.exerciseName,
        prescription: plan.sets,
        sets: plan.sets.map((_, index) =>
          LoggedSet.make({ index, weightKg: p.prefillWeight, reps: 0, modifiers: plan.modifiers }),
        ),
      }),
      preserved: [],
      undoStack: [],
    };
  },

  // MARK: - Reading

  /** The active exercise as the engines understand a prescription. */
  activePlanned(self: SessionSlot): PlannedExercise {
    const isProgrammedAsWritten =
      self.active.exerciseID === self.plan.exerciseID && deepEqual(self.active.prescription, self.plan.sets);
    return PlannedExercise.make({
      exerciseID: self.active.exerciseID,
      role: self.plan.role,
      sets: self.active.prescription,
      modifiers: self.plan.modifiers,
      authoredNote: isProgrammedAsWritten ? self.plan.authoredNote : undefined,
    });
  },

  /**
   * The rows the program prescribed, in order — aligned with
   * `active.prescription`. Rows added during the session are not in it.
   */
  prescribedRows(self: SessionSlot): LoggedSet[] {
    return self.active.sets.filter((s) => s.origin === "prescribed");
  },

  /**
   * Prescriptions of the prescribed rows not yet written — what a swap
   * carries to the substitute as its prescription.
   */
  openPrescription(self: SessionSlot): SetPrescription[] {
    const rows = SessionSlot.prescribedRows(self);
    const count = Math.min(rows.length, self.active.prescription.length);
    const result: SetPrescription[] = [];
    for (let i = 0; i < count; i++) {
      if (!LoggedSet.isLogged(rows[i])) result.push(self.active.prescription[i]);
    }
    return result;
  },

  hasOpenSets(self: SessionSlot): boolean {
    return self.active.sets.some((s) => !LoggedSet.isLogged(s));
  },

  loggedSetCount(self: SessionSlot): number {
    return (
      self.preserved.reduce((total, result) => total + result.sets.length, 0) +
      self.active.sets.filter(LoggedSet.isLogged).length
    );
  },

  /**
   * Every row the slot holds: preserved work plus the active rows. Rows
   * added during the session count, so the session total grows with them.
   */
  setCount(self: SessionSlot): number {
    return self.preserved.reduce((total, result) => total + result.sets.length, 0) + self.active.sets.length;
  },

  /**
   * The prescription's size across the slot, preserved work included.
   * Added rows never change it.
   */
  prescribedSetCount(self: SessionSlot): number {
    const moved = self.preserved.reduce(
      (total, result) => total + result.sets.filter((s) => s.origin === "prescribed").length,
      0,
    );
    return moved + SessionSlot.prescribedRows(self).length;
  },

  /**
   * How much of the prescription is written. An added set, logged or not,
   * never moves this.
   */
  loggedPrescribedSetCount(self: SessionSlot): number {
    const moved = self.preserved.reduce(
      (total, result) => total + result.sets.filter((s) => s.origin === "prescribed").length,
      0,
    );
    return moved + SessionSlot.prescribedRows(self).filter(LoggedSet.isLogged).length;
  },

  canUndo(self: SessionSlot): boolean {
    return self.undoStack.length > 0;
  },

  lastChangeWasPermanent(self: SessionSlot): boolean {
    return self.undoStack[self.undoStack.length - 1]?.wasPermanent ?? false;
  },

  /** The change an undo would reverse right now. */
  latestUndo(self: SessionSlot): SessionSlot_UndoPoint | undefined {
    return self.undoStack[self.undoStack.length - 1];
  },

  /** The last row written in the active exercise, in row order. */
  mostRecentWrittenSet(self: SessionSlot): LoggedSet | undefined {
    return self.active.sets.findLast(LoggedSet.isLogged);
  },

  /**
   * Whether the set sheet asks for RIR on this row.
   *
   * Once per exercise, on its last prescribed set (addendum 11R), and on
   * every added set. An added row comes after that point by definition, so
   * adding one never takes the question away from the prescription.
   */
  asksForRIR(self: SessionSlot, a: { at: number }): boolean {
    const position = a.at;
    if (!(position >= 0 && position < self.active.sets.length)) return false;
    if (self.active.sets[position].origin === "sessionAdded") return true;
    return position === self.active.sets.findLastIndex((s) => s.origin === "prescribed");
  },

  /** Prescribed working sets across a session. Added rows never change it. */
  plannedSetCount(a: { of: readonly SessionSlot[] }): number {
    return a.of.reduce((total, slot) => total + SessionSlot.prescribedSetCount(slot), 0);
  },

  /**
   * Prescribed working sets logged across a session. An added set, logged
   * or not, never moves it.
   */
  completedSetCount(a: { of: readonly SessionSlot[] }): number {
    return a.of.reduce((total, slot) => total + SessionSlot.loggedPrescribedSetCount(slot), 0);
  },

  /**
   * A session's completion percentage, measured against the prescription.
   *
   * An added set left unlogged is not a missed set, and a logged one never
   * lifts an incomplete prescription.
   */
  completion(a: { of: readonly SessionSlot[] }): number {
    const prescribed = SessionSlot.plannedSetCount({ of: a.of });
    const done = SessionSlot.completedSetCount({ of: a.of });
    if (!(prescribed > 0)) return 0;
    return Math.min(100, Math.trunc((done / prescribed) * 100));
  },

  /**
   * What this slot contributes to history: every logged set, each under the
   * exercise it was logged on.
   */
  results(self: SessionSlot): ExerciseResult[] {
    const logged = self.active.sets.filter(LoggedSet.isLogged);
    if (logged.length === 0) return self.preserved;
    return [
      ...self.preserved,
      ExerciseResult.make({ exerciseID: self.active.exerciseID, name: self.active.exerciseName, sets: logged }),
    ];
  },

  // MARK: - Changing

  /**
   * Adds one working row for this session only.
   *
   * The row is pre-filled from the most recent working set — the last one
   * written, or else the last row's own pre-fill — and waits to be logged
   * like any other row: adding never writes a set. It has no prescription,
   * carries `origin == .sessionAdded`, and changes nothing about the
   * program. It is a working set, never a warm-up.
   *
   * `fallbackWeightKg` only matters for a slot with no rows at all, such as
   * a substitute that took over a finished exercise. It must come from the
   * active exercise: a weight is never carried across a swap (§12.3).
   */
  addSet(self: SessionSlot, a: { fallbackWeightKg?: number } = {}): [SessionSlot, LoggedSet] {
    const sets = self.active.sets;
    const row = LoggedSet.make({
      index: sets.length,
      weightKg:
        SessionSlot.mostRecentWrittenSet(self)?.weightKg ?? sets[sets.length - 1]?.weightKg ?? a.fallbackWeightKg,
      reps: 0,
      modifiers: self.plan.modifiers,
      substitutedFrom: self.active.substitutedFromID,
      origin: "sessionAdded",
    });
    return [{ ...self, active: { ...self.active, sets: [...sets, row] } }, row];
  },

  /**
   * Removes a row that was added during the session, logged or not.
   * Prescribed rows are never removable here — leaving one unlogged is what
   * skipping it means.
   */
  removeAddedSet(self: SessionSlot, a: { at: number }): [SessionSlot, SessionSlot_RemovedSet | undefined] {
    const position = a.at;
    if (!(position >= 0 && position < self.active.sets.length && self.active.sets[position].origin === "sessionAdded")) {
      return [self, undefined];
    }
    const exerciseID = self.active.exerciseID;
    const sets = [...self.active.sets];
    const [removedRow] = sets.splice(position, 1);
    const removed = SessionSlot_RemovedSet.make({ set: removedRow, position, exerciseID });
    return [{ ...self, active: { ...self.active, sets: renumber(sets) } }, removed];
  },

  /**
   * Removes a row for today: an added row, logged or not, or a prescribed
   * row that is still open — the program is not touched, only this
   * session's count shrinks, so the exercise can be done without it.
   * The last row of an exercise stays.
   */
  removeSet(self: SessionSlot, a: { at: number }): [SessionSlot, SessionSlot_RemovedSet | undefined] {
    const position = a.at;
    if (!(position >= 0 && position < self.active.sets.length && self.active.sets.length > 1)) return [self, undefined];
    const row = self.active.sets[position];
    if (row.origin === "sessionAdded") return SessionSlot.removeAddedSet(self, { at: position });
    if (LoggedSet.isLogged(row)) return [self, undefined];
    const offset = SessionSlot.prescribedRows(self).findIndex((s) => s.id === row.id);
    if (!(offset >= 0 && offset < self.active.prescription.length)) return [self, undefined];
    const prescriptions = [...self.active.prescription];
    const [prescription] = prescriptions.splice(offset, 1);
    const sets = [...self.active.sets];
    sets.splice(position, 1);
    const next: SessionSlot = {
      ...self,
      active: { ...self.active, prescription: prescriptions, sets: renumber(sets) },
    };
    return [
      next,
      SessionSlot_RemovedSet.make({ set: row, position, exerciseID: self.active.exerciseID, prescription }),
    ];
  },

  /**
   * Puts a removed row back where it was, logged data included — once, and
   * only into the exercise it was removed from.
   */
  restore(self: SessionSlot, removed: SessionSlot_RemovedSet): SessionSlot {
    if (removed.set.origin === "prescribed") {
      const prescription = removed.prescription;
      if (
        prescription === undefined ||
        removed.exerciseID !== self.active.exerciseID ||
        self.active.sets.some((s) => s.id === removed.set.id)
      ) {
        return self;
      }
      const rows = SessionSlot.prescribedRows(self);
      const position = Math.min(removed.position, rows.length);
      const offset = rows.slice(0, position).length;
      const sets = [...self.active.sets];
      sets.splice(position, 0, removed.set);
      const prescriptions = [...self.active.prescription];
      prescriptions.splice(Math.min(offset, prescriptions.length), 0, prescription);
      return { ...self, active: { ...self.active, prescription: prescriptions, sets: renumber(sets) } };
    }
    if (
      !(
        removed.set.origin === "sessionAdded" &&
        removed.exerciseID === self.active.exerciseID &&
        !self.active.sets.some((s) => s.id === removed.set.id)
      )
    ) {
      return self;
    }
    // Added rows always follow the prescribed ones.
    const position = Math.min(
      Math.max(removed.position, SessionSlot.prescribedRows(self).length),
      self.active.sets.length,
    );
    const sets = [...self.active.sets];
    sets.splice(position, 0, removed.set);
    return { ...self, active: { ...self.active, sets: renumber(sets) } };
  },

  /**
   * Moves the slot's open rows to another exercise.
   *
   * `temporary` is a swap for today: the new rows remember the exercise they
   * stand in for. A permanent replacement makes the new exercise simply the
   * programmed one, so nothing is marked.
   */
  swap(
    self: SessionSlot,
    a: { to: string; name: string; prefillWeight?: number; temporary: boolean; replacement?: ProgramReplacement },
  ): SessionSlot {
    const exerciseID = a.to;
    const logged = self.active.sets.filter(LoggedSet.isLogged);
    const open = SessionSlot.openPrescription(self);
    const openAdded = self.active.sets.filter((s) => s.origin === "sessionAdded" && !LoggedSet.isLogged(s)).length;
    const origin = self.active.substitutedFromID ?? self.active.exerciseID;
    // Standing in for yourself is not a substitution.
    const standsInFor: string | undefined = a.temporary && origin !== exerciseID ? origin : undefined;

    const undoStack = [
      ...self.undoStack,
      SessionSlot_UndoPoint.make({
        active: self.active,
        movedSetIDs: new Set(logged.map((s) => s.id)),
        wasPermanent: !a.temporary,
        replacement: a.temporary ? undefined : a.replacement,
      }),
    ];
    const preserved =
      logged.length > 0
        ? [
            ...self.preserved,
            ExerciseResult.make({ exerciseID: self.active.exerciseID, name: self.active.exerciseName, sets: logged }),
          ]
        : self.preserved;
    // Open prescribed rows move with their prescriptions, and open rows
    // the user added move too, still added. Numbers restart for the
    // substitute, prescribed rows first.
    const origins: SetOrigin[] = [
      ...Array<SetOrigin>(open.length).fill("prescribed"),
      ...Array<SetOrigin>(openAdded).fill("sessionAdded"),
    ];
    const active = SessionSlot_Segment.make({
      exerciseID,
      exerciseName: a.name,
      prescription: open,
      sets: origins.map((setOrigin, index) =>
        LoggedSet.make({
          index,
          weightKg: a.prefillWeight,
          reps: 0,
          modifiers: self.plan.modifiers,
          substitutedFrom: standsInFor,
          origin: setOrigin,
        }),
      ),
      substitutedFromID: standsInFor,
    });
    return { ...self, active, preserved, undoStack };
  },

  /**
   * Reverses the most recent swap exactly, keeping anything written since.
   *
   * `ifLatestIs` makes an undo raised for one particular change safe to
   * fire late: once that change is no longer the latest — already undone
   * from the header, or followed by another swap — nothing happens.
   */
  undo(self: SessionSlot, a: { ifLatestIs?: string } = {}): [SessionSlot, boolean] {
    const expected = a.ifLatestIs;
    const last = self.undoStack[self.undoStack.length - 1];
    if (expected !== undefined && last?.id !== expected) return [self, false];
    if (last === undefined) return [self, false];
    const point = last;
    const undoStack = self.undoStack.slice(0, -1);
    const leaving = self.active;
    const writtenSince = leaving.sets.filter(LoggedSet.isLogged);

    // The sets that swap moved out go back into their own rows; every
    // other preserved result stays exactly where it is.
    let preserved = self.preserved;
    if (point.movedSetIDs.size > 0) {
      preserved = preserved.filter(
        (result) => !(result.sets.length > 0 && result.sets.every((s) => point.movedSetIDs.has(s.id))),
      );
    }
    if (writtenSince.length > 0) {
      preserved = [
        ...preserved,
        ExerciseResult.make({ exerciseID: leaving.exerciseID, name: leaving.exerciseName, sets: writtenSince }),
      ];
    }
    return [{ ...self, active: point.active, preserved, undoStack }, true];
  },

  /** Pre-fills the rows not yet written. Written rows are never touched. */
  prefillOpenSets(self: SessionSlot, a: { weightKg: number | undefined }): SessionSlot {
    return {
      ...self,
      active: {
        ...self.active,
        sets: self.active.sets.map((s) => (LoggedSet.isLogged(s) ? s : { ...s, weightKg: a.weightKg })),
      },
    };
  },

  /**
   * Puts rows from a snapshot saved before slots were stored back into a
   * freshly built slot. Rows that no longer line up are kept as their own
   * result rather than dropped.
   */
  restoreLegacyRows(self: SessionSlot, sets: LoggedSet[]): SessionSlot {
    if (sets.length === 0) return self;
    if (sets.length === self.active.sets.length) {
      return { ...self, active: { ...self.active, sets } };
    }
    const logged = sets.filter(LoggedSet.isLogged);
    if (logged.length > 0) {
      return {
        ...self,
        preserved: [
          ...self.preserved,
          ExerciseResult.make({ exerciseID: self.active.exerciseID, name: self.active.exerciseName, sets: logged }),
        ],
      };
    }
    return self;
  },

  encode(self: SessionSlot): JSONValue {
    return encodeJSON(self);
  },

  decode(json: JSONValue): SessionSlot {
    const c = new KeyedContainer(json);
    return {
      position: c.decode("position", decodeInt),
      plan: c.decode("plan", PlannedExercise.decode),
      active: c.decode("active", SessionSlot_Segment.decode),
      preserved: c.decode("preserved", decodeArray(ExerciseResult.decode)),
      undoStack: c.decode("undoStack", decodeArray(SessionSlot_UndoPoint.decode)),
    };
  },
};
