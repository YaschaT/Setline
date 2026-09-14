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
        /// One prescription per row, aligned with `sets`.
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

    /// Prescriptions of the rows not yet written — the only part a swap moves.
    public var openPrescription: [SetPrescription] {
        zip(active.sets, active.prescription).filter { !$0.0.isLogged }.map(\.1)
    }

    public var hasOpenSets: Bool { active.sets.contains { !$0.isLogged } }

    public var loggedSetCount: Int {
        preserved.reduce(0) { $0 + $1.sets.count } + active.sets.filter(\.isLogged).count
    }

    /// Every row the slot holds: preserved work plus the active rows.
    public var setCount: Int {
        preserved.reduce(0) { $0 + $1.sets.count } + active.sets.count
    }

    public var canUndo: Bool { !undoStack.isEmpty }
    public var lastChangeWasPermanent: Bool { undoStack.last?.wasPermanent ?? false }
    /// The change an undo would reverse right now.
    public var latestUndo: UndoPoint? { undoStack.last }

    /// What this slot contributes to history: every logged set, each under the
    /// exercise it was logged on.
    public var results: [ExerciseResult] {
        let logged = active.sets.filter(\.isLogged)
        guard !logged.isEmpty else { return preserved }
        return preserved + [ExerciseResult(exerciseID: active.exerciseID, name: active.exerciseName, sets: logged)]
    }

    // MARK: - Changing

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
        active = Segment(
            exerciseID: exerciseID,
            exerciseName: name,
            prescription: open,
            sets: open.indices.map {
                LoggedSet(
                    index: $0,
                    weightKg: prefillWeight,
                    reps: 0,
                    modifiers: plan.modifiers,
                    substitutedFrom: standsInFor
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
