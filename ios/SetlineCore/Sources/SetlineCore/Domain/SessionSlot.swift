import Foundation

/// One position in a live session, and everything that happened in it.
///
/// A swap changes the *future* of a slot, never its past. Sets already written
/// stay with the exercise they were written under; only the rows still open
/// move to the substitute. Undo puts the slot back exactly as it was before
/// the swap — and anything written on the substitute in the meantime is kept
/// as well, as its own result.
///
/// Pure data, for two reasons: the rule "logged work is never discarded" has
/// to be testable without a screen, and the whole slot has to ride inside a
/// paused-session snapshot and come back intact after a cold launch.
public struct SessionSlot: Codable, Hashable, Sendable {

    /// The exercise currently occupying the slot, with its rows.
    public struct Segment: Codable, Hashable, Sendable {
        public var exerciseID: String
        /// As it was when the slot was built, so a renamed exercise never
        /// rewrites what the session shows.
        public var exerciseName: String
        /// One prescription per *prescribed* row, in order. Rows added during
        /// the session have no prescription: they carry `origin ==
        /// .sessionAdded` and always follow the prescribed rows.
        public var prescription: [SetPrescription]
        public var sets: [LoggedSet]
        /// The exercise this one stands in for, today only. `nil` for the
        /// programmed exercise — including after a permanent replacement,
        /// which is not a stand-in.
        public var substitutedFromID: String?
        public var proposalDismissed: Bool
        /// How far `Mik op` has moved every row's rep target.
        public var repTargetOffset: Int

        public init(
            exerciseID: String,
            exerciseName: String,
            prescription: [SetPrescription],
            sets: [LoggedSet],
            substitutedFromID: String? = nil,
            proposalDismissed: Bool = false,
            repTargetOffset: Int = 0
        ) {
            self.exerciseID = exerciseID
            self.exerciseName = exerciseName
            self.prescription = prescription
            self.sets = sets
            self.substitutedFromID = substitutedFromID
            self.proposalDismissed = proposalDismissed
            self.repTargetOffset = repTargetOffset
        }
    }

    /// The slot exactly as it stood before one swap.
    public struct UndoPoint: Codable, Hashable, Sendable {
        /// Identifies this one change, so an undo raised for it — the toast
        /// above the primary action — can never reverse a different one.
        public var id: UUID
        public var active: Segment
        /// The logged sets that swap moved into `preserved`. Undo moves exactly
        /// these back, so work preserved by any later swap stays preserved.
        public var movedSetIDs: Set<UUID>
        public var wasPermanent: Bool
        /// The program change this swap wrote, when it was permanent. It rides
        /// with the undo point so reversing it — in this session, or after a
        /// pause and a cold launch — removes exactly that record.
        public var replacement: ProgramReplacement?

        init(active: Segment, movedSetIDs: Set<UUID>, wasPermanent: Bool, replacement: ProgramReplacement?) {
            self.id = UUID()
            self.active = active
            self.movedSetIDs = movedSetIDs
            self.wasPermanent = wasPermanent
            self.replacement = replacement
        }

        private enum CodingKeys: String, CodingKey {
            case id, active, movedSetIDs, wasPermanent, replacement
        }

        /// Tolerates undo points saved before they carried an id or a program
        /// change. A paused session that failed to decode would not fail
        /// loudly — it would simply not be there to resume.
        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
            active = try container.decode(Segment.self, forKey: .active)
            movedSetIDs = try container.decodeIfPresent(Set<UUID>.self, forKey: .movedSetIDs) ?? []
            wasPermanent = try container.decodeIfPresent(Bool.self, forKey: .wasPermanent) ?? false
            replacement = try container.decodeIfPresent(ProgramReplacement.self, forKey: .replacement)
        }
    }

    /// Position in the day. The slot's identity for the life of the session.
    public let position: Int
    /// What the plan prescribed here when the session started.
    public let plan: PlannedExercise
    public var active: Segment
    /// Work logged in this slot under an exercise that is no longer active.
    /// Only ever appended to by a swap, or handed back by the undo that
    /// reverses that same swap.
    public private(set) var preserved: [ExerciseResult]
    /// Most recent last.
    public private(set) var undoStack: [UndoPoint]

    public init(position: Int, plan: PlannedExercise, exerciseName: String, prefillWeight: Decimal? = nil) {
        self.position = position
        self.plan = plan
        self.active = Segment(
            exerciseID: plan.exerciseID,
            exerciseName: exerciseName,
            prescription: plan.sets,
            sets: plan.sets.indices.map {
                LoggedSet(index: $0, weightKg: prefillWeight, reps: 0, modifiers: plan.modifiers)
            }
        )
        self.preserved = []
        self.undoStack = []
    }

    // MARK: - Reading

    /// The active exercise as the engines understand a prescription.
    public var activePlanned: PlannedExercise {
        let isProgrammedAsWritten = active.exerciseID == plan.exerciseID
            && active.prescription == plan.sets
        return PlannedExercise(
            exerciseID: active.exerciseID,
            role: plan.role,
            sets: active.prescription,
            modifiers: plan.modifiers,
            authoredNote: isProgrammedAsWritten ? plan.authoredNote : nil
        )
    }

    /// The rows the program prescribed, in order — aligned with
    /// `active.prescription`. Rows added during the session are not in it.
    public var prescribedRows: [LoggedSet] { active.sets.filter { $0.origin == .prescribed } }

    /// Prescriptions of the prescribed rows not yet written — what a swap
    /// carries to the substitute as its prescription.
    public var openPrescription: [SetPrescription] {
        zip(prescribedRows, active.prescription).filter { !$0.0.isLogged }.map(\.1)
    }

    public var hasOpenSets: Bool { active.sets.contains { !$0.isLogged } }

    public var loggedSetCount: Int {
        preserved.reduce(0) { $0 + $1.sets.count } + active.sets.filter(\.isLogged).count
    }

    /// Every row the slot holds: preserved work plus the active rows. Rows
    /// added during the session count, so the session total grows with them.
    public var setCount: Int {
        preserved.reduce(0) { $0 + $1.sets.count } + active.sets.count
    }

    /// The prescription's size across the slot, preserved work included.
    /// Added rows never change it.
    public var prescribedSetCount: Int {
        let moved = preserved.reduce(0) { total, result in
            total + result.sets.filter { $0.origin == .prescribed }.count
        }
        return moved + prescribedRows.count
    }

    /// How much of the prescription is written. An added set, logged or not,
    /// never moves this.
    public var loggedPrescribedSetCount: Int {
        let moved = preserved.reduce(0) { total, result in
            total + result.sets.filter { $0.origin == .prescribed }.count
        }
        return moved + prescribedRows.filter(\.isLogged).count
    }

    public var canUndo: Bool { !undoStack.isEmpty }
    public var lastChangeWasPermanent: Bool { undoStack.last?.wasPermanent ?? false }
    /// The change an undo would reverse right now.
    public var latestUndo: UndoPoint? { undoStack.last }

    /// The last row written in the active exercise, in row order.
    public var mostRecentWrittenSet: LoggedSet? { active.sets.last(where: \.isLogged) }

    /// Whether the set sheet asks for RIR on this row.
    ///
    /// Once per exercise, on its last prescribed set (addendum 11R), and on
    /// every added set. An added row comes after that point by definition, so
    /// adding one never takes the question away from the prescription.
    public func asksForRIR(at position: Int) -> Bool {
        guard active.sets.indices.contains(position) else { return false }
        if active.sets[position].origin == .sessionAdded { return true }
        return position == active.sets.lastIndex(where: { $0.origin == .prescribed })
    }

    /// Prescribed working sets across a session. Added rows never change it.
    public static func plannedSetCount(of slots: [SessionSlot]) -> Int {
        slots.reduce(0) { $0 + $1.prescribedSetCount }
    }

    /// Prescribed working sets logged across a session. An added set, logged
    /// or not, never moves it.
    public static func completedSetCount(of slots: [SessionSlot]) -> Int {
        slots.reduce(0) { $0 + $1.loggedPrescribedSetCount }
    }

    /// A session's completion percentage, measured against the prescription.
    ///
    /// An added set left unlogged is not a missed set, and a logged one never
    /// lifts an incomplete prescription.
    public static func completion(of slots: [SessionSlot]) -> Int {
        let prescribed = plannedSetCount(of: slots)
        let done = completedSetCount(of: slots)
        guard prescribed > 0 else { return 0 }
        return min(100, Int(Double(done) / Double(prescribed) * 100))
    }

    /// What this slot contributes to history: every logged set, each under the
    /// exercise it was logged on.
    public var results: [ExerciseResult] {
        let logged = active.sets.filter(\.isLogged)
        guard !logged.isEmpty else { return preserved }
        return preserved + [ExerciseResult(exerciseID: active.exerciseID, name: active.exerciseName, sets: logged)]
    }

    // MARK: - Changing

    /// A row removed with `removeAddedSet`, with what it takes to put it back.
    public struct RemovedSet: Hashable, Sendable {
        public let set: LoggedSet
        public let position: Int
        /// The exercise the row was on. It only ever goes back there.
        public let exerciseID: String
        /// What the program asked of a prescribed row that was dropped for
        /// today; nil for an added row.
        public var prescription: SetPrescription? = nil
    }

    /// Adds one working row for this session only.
    ///
    /// The row is pre-filled from the most recent working set — the last one
    /// written, or else the last row's own pre-fill — and waits to be logged
    /// like any other row: adding never writes a set. It has no prescription,
    /// carries `origin == .sessionAdded`, and changes nothing about the
    /// program. It is a working set, never a warm-up.
    ///
    /// `fallbackWeightKg` only matters for a slot with no rows at all, such as
    /// a substitute that took over a finished exercise. It must come from the
    /// active exercise: a weight is never carried across a swap (§12.3).
    @discardableResult
    public mutating func addSet(fallbackWeightKg: Decimal? = nil) -> LoggedSet {
        let row = LoggedSet(
            index: active.sets.count,
            weightKg: mostRecentWrittenSet?.weightKg ?? active.sets.last?.weightKg ?? fallbackWeightKg,
            reps: 0,
            modifiers: plan.modifiers,
            substitutedFrom: active.substitutedFromID,
            origin: .sessionAdded
        )
        active.sets.append(row)
        return row
    }

    /// Removes a row that was added during the session, logged or not.
    /// Prescribed rows are never removable here — leaving one unlogged is what
    /// skipping it means.
    public mutating func removeAddedSet(at position: Int) -> RemovedSet? {
        guard active.sets.indices.contains(position),
              active.sets[position].origin == .sessionAdded
        else { return nil }
        let exerciseID = active.exerciseID
        let removed = RemovedSet(set: active.sets.remove(at: position), position: position, exerciseID: exerciseID)
        renumber()
        return removed
    }

    /// Removes a row for today: an added row, logged or not, or a prescribed
    /// row that is still open — the program is not touched, only this
    /// session's count shrinks, so the exercise can be done without it.
    /// The last row of an exercise stays.
    public mutating func removeSet(at position: Int) -> RemovedSet? {
        guard active.sets.indices.contains(position), active.sets.count > 1 else { return nil }
        let row = active.sets[position]
        if row.origin == .sessionAdded { return removeAddedSet(at: position) }
        guard !row.isLogged,
              let offset = prescribedRows.firstIndex(where: { $0.id == row.id }),
              active.prescription.indices.contains(offset)
        else { return nil }
        let prescription = active.prescription.remove(at: offset)
        active.sets.remove(at: position)
        renumber()
        return RemovedSet(set: row, position: position, exerciseID: active.exerciseID, prescription: prescription)
    }

    /// Puts a removed row back where it was, logged data included — once, and
    /// only into the exercise it was removed from.
    public mutating func restore(_ removed: RemovedSet) {
        if removed.set.origin == .prescribed {
            guard let prescription = removed.prescription,
                  removed.exerciseID == active.exerciseID,
                  !active.sets.contains(where: { $0.id == removed.set.id })
            else { return }
            let position = min(removed.position, prescribedRows.count)
            let offset = prescribedRows.prefix(position).count
            active.sets.insert(removed.set, at: position)
            active.prescription.insert(prescription, at: min(offset, active.prescription.count))
            renumber()
            return
        }
        guard removed.set.origin == .sessionAdded,
              removed.exerciseID == active.exerciseID,
              !active.sets.contains(where: { $0.id == removed.set.id })
        else { return }
        // Added rows always follow the prescribed ones.
        let position = min(max(removed.position, prescribedRows.count), active.sets.count)
        active.sets.insert(removed.set, at: position)
        renumber()
    }

    /// Set numbers follow the rows.
    private mutating func renumber() {
        for position in active.sets.indices { active.sets[position].index = position }
    }

    /// Moves the slot's open rows to another exercise.
    ///
    /// `temporary` is a swap for today: the new rows remember the exercise they
    /// stand in for. A permanent replacement makes the new exercise simply the
    /// programmed one, so nothing is marked.
    public mutating func swap(
        to exerciseID: String,
        name: String,
        prefillWeight: Decimal? = nil,
        temporary: Bool,
        replacement: ProgramReplacement? = nil
    ) {
        let logged = active.sets.filter(\.isLogged)
        let open = openPrescription
        let openAdded = active.sets.filter { $0.origin == .sessionAdded && !$0.isLogged }.count
        let origin = active.substitutedFromID ?? active.exerciseID
        // Standing in for yourself is not a substitution.
        let standsInFor: String? = temporary && origin != exerciseID ? origin : nil

        undoStack.append(UndoPoint(
            active: active,
            movedSetIDs: Set(logged.map(\.id)),
            wasPermanent: !temporary,
            replacement: temporary ? nil : replacement
        ))
        if !logged.isEmpty {
            preserved.append(ExerciseResult(exerciseID: active.exerciseID, name: active.exerciseName, sets: logged))
        }
        // Open prescribed rows move with their prescriptions, and open rows
        // the user added move too, still added. Numbers restart for the
        // substitute, prescribed rows first.
        let origins = Array(repeating: SetOrigin.prescribed, count: open.count)
            + Array(repeating: SetOrigin.sessionAdded, count: openAdded)
        active = Segment(
            exerciseID: exerciseID,
            exerciseName: name,
            prescription: open,
            sets: origins.enumerated().map { index, setOrigin in
                LoggedSet(
                    index: index,
                    weightKg: prefillWeight,
                    reps: 0,
                    modifiers: plan.modifiers,
                    substitutedFrom: standsInFor,
                    origin: setOrigin
                )
            },
            substitutedFromID: standsInFor
        )
    }

    /// Reverses the most recent swap exactly, keeping anything written since.
    ///
    /// `ifLatestIs` makes an undo raised for one particular change safe to
    /// fire late: once that change is no longer the latest — already undone
    /// from the header, or followed by another swap — nothing happens.
    @discardableResult
    public mutating func undo(ifLatestIs expected: UUID? = nil) -> Bool {
        if let expected, undoStack.last?.id != expected { return false }
        guard let point = undoStack.popLast() else { return false }
        let leaving = active
        let writtenSince = leaving.sets.filter(\.isLogged)

        // The sets that swap moved out go back into their own rows; every
        // other preserved result stays exactly where it is.
        if !point.movedSetIDs.isEmpty {
            preserved.removeAll { result in
                !result.sets.isEmpty && result.sets.allSatisfy { point.movedSetIDs.contains($0.id) }
            }
        }
        active = point.active
        if !writtenSince.isEmpty {
            preserved.append(ExerciseResult(exerciseID: leaving.exerciseID, name: leaving.exerciseName, sets: writtenSince))
        }
        return true
    }

    /// Pre-fills the rows not yet written. Written rows are never touched.
    public mutating func prefillOpenSets(weightKg: Decimal?) {
        for index in active.sets.indices where !active.sets[index].isLogged {
            active.sets[index].weightKg = weightKg
        }
    }

    /// Puts rows from a snapshot saved before slots were stored back into a
    /// freshly built slot. Rows that no longer line up are kept as their own
    /// result rather than dropped.
    public mutating func restoreLegacyRows(_ sets: [LoggedSet]) {
        guard !sets.isEmpty else { return }
        if sets.count == active.sets.count {
            active.sets = sets
            return
        }
        let logged = sets.filter(\.isLogged)
        if !logged.isEmpty {
            preserved.append(ExerciseResult(exerciseID: active.exerciseID, name: active.exerciseName, sets: logged))
        }
    }
}
