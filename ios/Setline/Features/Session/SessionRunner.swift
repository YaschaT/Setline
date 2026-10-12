import Foundation
import Observation
import SwiftUI
import SetlineCore

/// The live session: what is planned, what has been written, and the clock.
///
/// Nothing here applies anything on the user's behalf. A proposal arrives
/// pre-filled in the set row and is editable there — "de app stelt voor, de
/// app past nooit toe".
@MainActor
@Observable
final class SessionRunner {

    struct ExerciseSlot: Identifiable {
        /// Everything that happened in this position: the active exercise and
        /// its rows, work preserved from earlier swaps, and the exact states an
        /// undo returns to. This is what a pause saves.
        var model: SessionSlot
        let exercise: Exercise
        let history: ExerciseHistory
        let proposal: ProgressionProposal
        /// The exercise this slot stands in for today, resolved. `nil` when not
        /// substituted — including after a permanent replacement.
        let substitutedFrom: Exercise?

        var id: Int { model.position }
        var planned: PlannedExercise { model.activePlanned }
        var sets: [LoggedSet] {
            get { model.active.sets }
            set { model.active.sets = newValue }
        }
        var proposalDismissed: Bool {
            get { model.active.proposalDismissed }
            set { model.active.proposalDismissed = newValue }
        }
        /// Work logged here under an exercise that has since been swapped out.
        var preserved: [ExerciseResult] { model.preserved }
        var isComplete: Bool { !model.hasOpenSets }
        var hasStarted: Bool { model.loggedSetCount > 0 }
    }

    let day: WorkoutDay
    private(set) var slots: [ExerciseSlot]
    /// The calendar moment the workout began — its date, not its duration.
    private(set) var startedAt = Date()
    /// Whether this session is being written down afterwards for a date that
    /// has passed. A workout logged the next morning has a date but no honest
    /// duration, and no rest to count down.
    ///
    /// Read from the date rather than held as a flag, so a retro entry that
    /// was parked and picked up again still knows what it is.
    var isLoggedAfterwards: Bool { !Calendar.current.isDateInToday(startedAt) }
    /// Duration is active workout time, banked across pauses.
    private var clock = WorkoutClock(segmentStartedAt: Date())
    private(set) var restTimer: RestTimerState?
    /// "Rust · primaire lift 3:00", fixed when the rest starts. Moving to
    /// another exercise mid-rest must not relabel a countdown it did not start.
    private(set) var restTitle = ""
    /// Bumped once each time a running rest reaches zero — the haptic's cue.
    private(set) var restCompletions = 0
    private var restCompletionSignalled = false
    private(set) var now = Date()
    /// The rest pill is one row until it is tapped open; opening it is the
    /// reader's choice and stays theirs until the rest ends.
    var isTimerExpanded = false
    /// The session exactly as it opened — fresh, or as it was resumed.
    private var openingSlots: [SessionSlot] = []
    /// The rest it opened with: one carried back from a pause, or none.
    private var openingRest: RestTimerState?

    var currentIndex: Int = 0
    var editing: (slot: Int, set: Int)?
    /// The next set sheet opens with `Partieel` already on — the pain flow's
    /// "Beperk de beweging" promise, kept.
    var editingStartsPartial = false

    private let display = NumberDisplay.english
    private let exerciseNamed: @MainActor (String) -> Exercise
    private let historyFor: @MainActor (PlannedExercise) -> ExerciseHistory
    /// Exercises handed to a swap directly. A custom exercise is saved to the
    /// account asynchronously, so for a moment the app-wide lookup does not
    /// know it yet — and the session showed its id ("custom:sled") instead of
    /// its name. The exercise the swap was given is the truth for that id.
    private var knownExercises: [String: Exercise] = [:]

    init(
        day: WorkoutDay,
        app: AppState,
        restoring snapshot: ActiveSessionSnapshot? = nil,
        loggingFor date: Date? = nil
    ) {
        self.day = day
        if let date {
            // Midday on that date: far enough from either midnight that a time
            // zone cannot move the workout to the day before or after.
            startedAt = Calendar.current.date(bySettingHour: 12, minute: 0, second: 0, of: date) ?? date
        }
        let exerciseNamed: @MainActor (String) -> Exercise = { app.exercise($0) }
        let historyFor: @MainActor (PlannedExercise) -> ExerciseHistory = { app.history(for: $0) }
        self.exerciseNamed = exerciseNamed
        self.historyFor = historyFor
        // A lighter week cuts sets, never exercises, so progression state
        // survives it (TRAINING_LOGIC §11.2).
        let deload = app.activeDeload
        self.slots = day.exercises.enumerated().map { index, planned in
            let prescribed = SessionPrescription.planned(planned, deload: deload)
            var slot = Self.resolve(
                SessionSlot(position: index, plan: prescribed, exerciseName: exerciseNamed(prescribed.exerciseID).name),
                exerciseNamed: exerciseNamed,
                historyFor: historyFor
            )
            // Pre-filled from the proposal, or from the previous session, or
            // left blank when there is nothing honest to put there.
            slot.model.prefillOpenSets(weightKg: Self.prefillWeight(slot))
            return slot
        }

        if let snapshot { restore(from: snapshot) }
        if date != nil { restTimer = nil }
        // A fresh stretch starts now either way; a resumed session carries its
        // banked time in, rather than recomputing from `startedAt`.
        clock = WorkoutClock(accumulatedSeconds: snapshot?.activeSeconds ?? 0, segmentStartedAt: Date())
        openingSlots = slots.map(\.model)
        openingRest = restTimer
    }

    /// Nothing has been written, swapped, added or adjusted since the session
    /// opened — the rest included. Leaving it then is just leaving: there is
    /// no state to park, and parking it anyway would leave a "paused session"
    /// behind that nobody started. A rest skipped or adjusted after a resume
    /// is a change, or the pause would hand the old one back next time.
    var isUntouched: Bool { slots.map(\.model) == openingSlots && restTimer == openingRest }

    private static func resolve(
        _ model: SessionSlot,
        exerciseNamed: @MainActor (String) -> Exercise,
        historyFor: @MainActor (PlannedExercise) -> ExerciseHistory
    ) -> ExerciseSlot {
        let planned = model.activePlanned
        var exercise = exerciseNamed(model.active.exerciseID)
        // An id that resolves to nothing comes back named after itself. The
        // name saved with the rows is the better truth.
        if exercise.name == exercise.id, !model.active.exerciseName.isEmpty {
            exercise.name = model.active.exerciseName
        }
        let history = historyFor(planned)
        return ExerciseSlot(
            model: model,
            exercise: exercise,
            history: history,
            proposal: ProgressionEngine.proposal(planned: planned, exercise: exercise, history: history),
            substitutedFrom: model.active.substitutedFromID.map { exerciseNamed($0) }
        )
    }

    private func resolve(_ model: SessionSlot) -> ExerciseSlot {
        let known = knownExercises
        let lookup = exerciseNamed
        return Self.resolve(
            model,
            exerciseNamed: { id in known[id] ?? lookup(id) },
            historyFor: historyFor
        )
    }

    private static func prefillWeight(_ slot: ExerciseSlot) -> Decimal? {
        prefillWeight(proposal: slot.proposal, history: slot.history)
    }

    /// The proposal's weight, or the previous session's when there is none.
    private static func prefillWeight(proposal: ProgressionProposal, history: ExerciseHistory) -> Decimal? {
        proposal.weightKg ?? history.mostRecent?.sets.first?.weightKg
    }

    /// What a session started now would open this exercise with: the same
    /// weight and per-set rep targets the rows are prefilled with. Artboard
    /// 09's "Vandaag 50 kg × 8." reads this, so the home screen never names a
    /// target the session does not start from.
    static func openingTarget(for planned: PlannedExercise, app: AppState) -> (weightKg: Decimal, reps: [Int])? {
        let prescribed = SessionPrescription.planned(planned, deload: app.activeDeload)
        let history = app.history(for: prescribed)
        let proposal = ProgressionEngine.proposal(
            planned: prescribed, exercise: app.exercise(prescribed.exerciseID), history: history
        )
        guard let weight = prefillWeight(proposal: proposal, history: history),
              let reps = proposal.setTargets, !reps.isEmpty
        else { return nil }
        return (weight, reps)
    }

    // MARK: - Pause and resume

    /// Puts the session back exactly as it was left.
    ///
    /// A snapshot with slots describes the session completely — each slot
    /// carries its own plan, its swaps and its preserved work — so it is
    /// restored by position, and a substitute comes back as the substitute.
    /// Snapshots written before slots were saved still match rows by id.
    private func restore(from snapshot: ActiveSessionSnapshot) {
        if let saved = snapshot.slots, !saved.isEmpty {
            slots = saved.sorted { $0.position < $1.position }.map { resolve($0) }
        } else {
            for result in snapshot.results {
                guard let index = slots.firstIndex(where: { $0.planned.exerciseID == result.exerciseID }) else { continue }
                var model = slots[index].model
                model.restoreLegacyRows(result.sets)
                if let legacyTarget = snapshot.proposedReps[result.exerciseID],
                   let base = slots[index].proposal.setTargets?.first {
                    model.active.repTargetOffset = legacyTarget - base
                }
                slots[index] = resolve(model)
            }
        }
        currentIndex = min(max(0, snapshot.currentIndex), max(0, slots.count - 1))
        startedAt = snapshot.startedAt
        // A rest that was counting when the session was paused comes back
        // with the time it has left: it kept running while the session was
        // parked, so nothing is invented. One that ran out meanwhile is over,
        // and a session paused between rests opens without a timer.
        if let rest = snapshot.restToResume(at: Date()) {
            restTimer = rest.timer
            restTitle = rest.title
            restCompletionSignalled = false
        } else {
            restTimer = nil
        }
    }

    func snapshot() -> ActiveSessionSnapshot {
        ActiveSessionSnapshot(
            dayID: day.id,
            dayLabel: day.short,
            startedAt: startedAt,
            currentIndex: currentIndex,
            // Every row, as readers written before slots were saved expect.
            results: slots.flatMap { slot in
                slot.model.preserved + [ExerciseResult(
                    exerciseID: slot.model.active.exerciseID,
                    name: slot.model.active.exerciseName,
                    sets: slot.model.active.sets
                )]
            },
            activeSeconds: clock.activeSeconds(at: Date()),
            slots: slots.map(\.model),
            rest: .counting(restTimer, title: restTitle, at: Date())
        )
    }

    var current: ExerciseSlot { slots[min(currentIndex, slots.count - 1)] }

    /// The proposal sits above set 1 until set 1 exists, then steps aside so
    /// the row's own lime — a PR, a positive delta — is the screen's one
    /// meaning.
    var showsProposal: Bool {
        guard !current.sets.isEmpty, !needsCalibration(slotIndex: currentIndex) else { return false }
        return !current.proposalDismissed && !(current.sets.first?.isLogged ?? false)
    }

    var elapsedSeconds: Int { clock.activeSeconds(at: now) }

    var completedSetCount: Int { slots.reduce(0) { $0 + $1.model.loggedSetCount } }
    var plannedSetCount: Int { slots.reduce(0) { $0 + $1.model.setCount } }
    var hasProgress: Bool { completedSetCount > 0 }
    /// Every open row in every slot has been written.
    var isComplete: Bool { slots.allSatisfy(\.isComplete) }

    // MARK: - Calibration

    /// True when this exercise has nothing at all to compare against, so the
    /// app asks for a weight instead of proposing one (artboard 28).
    func needsCalibration(slotIndex: Int) -> Bool {
        Calibration.isNeeded(history: slots[slotIndex].history)
    }

    func calibrationPrompt(slotIndex: Int) -> CalibrationPrompt? {
        guard needsCalibration(slotIndex: slotIndex), !slots[slotIndex].sets.isEmpty else { return nil }
        guard !(slots[slotIndex].sets.first?.isLogged ?? false) else { return nil }
        // A substitute with no history says where it came from, which is the
        // difference between "we know nothing" and "this is a different
        // exercise" (artboard 28 vs 28b).
        return Calibration.prompt(
            for: slots[slotIndex].exercise,
            substitutedFrom: slots[slotIndex].substitutedFrom?.name.lowercased()
        )
    }

    /// "80 kg × 8 · RIR 2" once the calibration set is in.
    func calibrationSummary(slotIndex: Int) -> String? {
        guard needsCalibration(slotIndex: slotIndex),
              let first = slots[slotIndex].sets.first, first.isLogged
        else { return nil }
        return Calibration.summary(for: first)
    }

    /// Set when the calibration set came in at RIR 3 or more, so set 2 was
    /// prefilled one increment higher (§12.3).
    private(set) var calibrationSteppedUp: Set<String> = []

    func gridMode(slotIndex: Int) -> SetGridMode {
        guard needsCalibration(slotIndex: slotIndex) else { return .history }
        guard let first = slots[slotIndex].sets.first, first.isLogged else { return .calibrationPending }
        return .calibrated(baseline: first)
    }

    /// `nil` before the calibration set: artboard 28 draws that grid without
    /// a header, because its columns have nothing to compare yet.
    func columnHeader(slotIndex: Int) -> String? {
        switch gridMode(slotIndex: slotIndex) {
        case .history: return columnHeaderDate
        case .calibrationPending: return nil
        case .calibrated: return "vs set 1"
        }
    }

    /// The row the sheet should open on: the first unwritten set.
    func nextIndex(in slot: ExerciseSlot) -> Int? {
        slot.sets.firstIndex { !$0.isLogged }
    }

    var nextSlotIndex: Int? {
        currentIndex + 1 < slots.count ? currentIndex + 1 : nil
    }

    // MARK: - Logging

    /// Everything one logged set can carry.
    ///
    /// Pause is a toggle and partial is a count, which is what keeps the two
    /// apart: there is no "paused rep count" to confuse with a rep count, and
    /// none to add onto one.
    struct SetEntry {
        var weightKg: Decimal
        var reps: Int
        var rir: Int?
        var failed: Bool
        /// How many of `reps` were performed paused. `nil` is none; a count
        /// equal to `reps` is a set performed paused throughout.
        var pausedReps: Int?
        var partialReps: Int?

        var isPaused: Bool { (pausedReps ?? 0) > 0 }
    }

    /// Tap 2 of 2. Writes the set and starts the rest, in that order.
    ///
    /// It deliberately does **not** move to the next exercise: the advice
    /// line the engine computes for the last set has to be readable, and
    /// jumping away replaced it in the same frame.
    func log(slotIndex: Int, setIndex: Int, entry: SetEntry) {
        guard slots.indices.contains(slotIndex), slots[slotIndex].sets.indices.contains(setIndex) else { return }
        let planned = slots[slotIndex].planned
        var set = slots[slotIndex].sets[setIndex]

        set.weightKg = entry.weightKg
        // `reps` is the reps performed. Paused reps are never added on, and
        // partials are counted separately — the web app summed both, which is
        // what TRAINING_LOGIC §15 change 2 and addendum 16R forbid.
        set.reps = entry.reps
        set.rirReported = entry.rir

        // Pause is a property of the set (§9), carrying the planned pause
        // length when there is one. A pause added to an exercise that is not
        // planned paused makes the set incomparable to that exercise's series,
        // which is exactly what keeps it out of its progression.
        set.modifiers = SetModifiers(
            pauseEnabled: entry.isPaused,
            pauseSeconds: entry.isPaused ? (planned.modifiers.pauseSeconds ?? 2) : nil,
            restrictedROM: planned.modifiers.restrictedROM
        )

        let partial = (entry.partialReps ?? 0) > 0 ? entry.partialReps : nil
        set.partialReps = partial
        // Paused reps live inside the set that holds them: "120 kg × 6, de
        // laatste 2 gepauzeerd" is six reps with two of them paused, so the
        // count never adds reps, volume or a second set. Where every rep was
        // paused the set is simply a paused set, and the count goes.
        set.pausedReps = LoggedSet.pausedRepsWithin(entry.pausedReps, reps: set.reps)

        var flags: SetFlags = []
        if entry.failed { flags.insert(.failed) }
        if partial != nil { flags.insert(.partialReps) }
        set.flags = flags

        // §12.5: the set belongs to the substitute's series, and remembers
        // which exercise it stood in for.
        set.substitutedFrom = slots[slotIndex].substitutedFrom?.id
        slots[slotIndex].sets[setIndex] = set

        // The calibration set is what the rest of the exercise is built on:
        // once it is in, the remaining rows take its weight — one increment
        // higher when it was clearly easy (§12.3).
        if setIndex == 0, needsCalibration(slotIndex: slotIndex) {
            let prefill = Calibration.prefill(after: set, exercise: slots[slotIndex].exercise)
            for index in slots[slotIndex].sets.indices where index > 0 && !slots[slotIndex].sets[index].isLogged {
                slots[slotIndex].sets[index].weightKg = prefill.weightKg
            }
            if prefill.steppedUp {
                calibrationSteppedUp.insert(slots[slotIndex].planned.exerciseID)
            }
        }

        // What the countdown at the top of the screen names.
        RestActivity.exercise = slots[slotIndex].exercise.name
        let sets = slots[slotIndex].sets
        if let open = sets.firstIndex(where: { !$0.isLogged }) {
            RestActivity.next = "Set \(open + 1) of \(sets.count)"
        } else if slotIndex + 1 < slots.count {
            RestActivity.next = slots[slotIndex + 1].exercise.name
        } else {
            RestActivity.next = "Finish your workout"
        }
        startRest(for: slots[slotIndex].planned)
    }

    func didStepUpAfterCalibration(slotIndex: Int) -> Bool {
        calibrationSteppedUp.contains(slots[slotIndex].planned.exerciseID)
    }

    func advance() {
        guard let next = nextSlotIndex else { return }
        currentIndex = next
    }

    func dismissProposal(slotIndex: Int) {
        guard slots.indices.contains(slotIndex) else { return }
        slots[slotIndex].proposalDismissed = true
    }

    /// Artboard 29 puts GEWICHT / MIK OP steppers in the proposal card. They
    /// change what the unwritten rows are pre-filled with; they never write a
    /// set and never change the plan.
    func adjustProposedWeight(slotIndex: Int, by delta: Decimal) {
        guard slots.indices.contains(slotIndex) else { return }
        let current = proposedWeight(slotIndex: slotIndex) ?? 0
        let next = max(0, current + delta)
        for index in slots[slotIndex].sets.indices where !slots[slotIndex].sets[index].isLogged {
            slots[slotIndex].sets[index].weightKg = next
        }
    }

    /// Moves every row's target together, so a mixed prescription keeps its
    /// shape — `5 · 6 · 6` becomes `6 · 7 · 7`, never `6 · 6 · 6`.
    func adjustProposedReps(slotIndex: Int, by delta: Int) {
        guard slots.indices.contains(slotIndex) else { return }
        let base = slots[slotIndex].proposal.setTargets ?? []
        let lowest = 1 - (base.min() ?? 1)
        let offset = slots[slotIndex].model.active.repTargetOffset + delta
        slots[slotIndex].model.active.repTargetOffset = max(lowest, offset)
    }

    func proposedWeight(slotIndex: Int) -> Decimal? {
        slots[slotIndex].sets.first { !$0.isLogged }?.weightKg
    }

    /// The first row's target — the single number `Mik op` shows.
    func proposedRepTarget(slotIndex: Int) -> Int {
        targetReps(slotIndex: slotIndex, setIndex: 0)
            ?? slots[slotIndex].planned.sets.first?.repRange.upperBound
            ?? 8
    }

    /// What SETLINE proposes for one row, from that row's own range.
    func targetReps(slotIndex: Int, setIndex: Int) -> Int? {
        guard slots.indices.contains(slotIndex),
              let base = slots[slotIndex].proposal.setTargets,
              base.indices.contains(setIndex)
        else { return nil }
        return max(1, base[setIndex] + slots[slotIndex].model.active.repTargetOffset)
    }

    func proposedTargets(slotIndex: Int) -> [Int]? {
        guard slots.indices.contains(slotIndex), let base = slots[slotIndex].proposal.setTargets else { return nil }
        let offset = slots[slotIndex].model.active.repTargetOffset
        return base.map { max(1, $0 + offset) }
    }

    // MARK: - Substitution

    /// Swaps this slot to another exercise for today only.
    ///
    /// Only the rows still open move. Sets already written stay with the
    /// exercise they were written under, the prescription of every moved row
    /// survives verbatim, and the load does not: §12.3 forbids converting a
    /// weight between exercises, so the rows come back empty and a substitute
    /// with no history lands in calibration.
    ///
    /// The origin's progression state freezes for this occurrence: nothing
    /// advances it, nothing resets it, and sitting a session out carries no
    /// penalty. The rest timer keeps running — a swap usually happens *during*
    /// rest.
    func substitute(slotIndex: Int, with exercise: Exercise, reason: SwapReason) {
        change(slotIndex: slotIndex, to: exercise, temporary: true, reason: reason)
    }

    /// Writes a program change into this session. From here on the new
    /// exercise simply *is* the programmed one, so nothing is marked as
    /// standing in; the change itself is recorded as a `ProgramReplacement`.
    func replaceInProgram(slotIndex: Int, with exercise: Exercise, recording replacement: ProgramReplacement) {
        change(slotIndex: slotIndex, to: exercise, temporary: false, reason: .preference, replacement: replacement)
    }

    private func change(
        slotIndex: Int, to exercise: Exercise, temporary: Bool, reason: SwapReason,
        replacement: ProgramReplacement? = nil
    ) {
        guard slots.indices.contains(slotIndex) else { return }
        var model = slots[slotIndex].model
        let origin = model.active.substitutedFromID ?? model.active.exerciseID
        model.swap(to: exercise.id, name: exercise.name, temporary: temporary, replacement: replacement)
        knownExercises[exercise.id] = exercise

        var resolved = resolve(model)
        resolved.model.prefillOpenSets(weightKg: Self.prefillWeight(resolved))
        slots[slotIndex] = resolved

        substitutions.removeAll { $0.originExerciseID == origin }
        if let standsInFor = resolved.model.active.substitutedFromID {
            substitutions.append(
                Substitution(originExerciseID: standsInFor, substituteExerciseID: exercise.id, reason: reason)
            )
        }
    }

    /// Reverses the most recent swap in this slot exactly. Sets written on the
    /// exercise that leaves stay in the session as their own result.
    ///
    /// Returns the change it reversed, so a permanent one can be taken out of
    /// the program as well. `ifLatestIs` keeps a late undo — the toast's,
    /// after the header's — from reversing a different change.
    @discardableResult
    func undoChange(slotIndex: Int, ifLatestIs expected: UUID? = nil) -> SessionSlot.UndoPoint? {
        guard slots.indices.contains(slotIndex) else { return nil }
        var model = slots[slotIndex].model
        guard let point = model.latestUndo, model.undo(ifLatestIs: expected) else { return nil }
        slots[slotIndex] = resolve(model)
        if model.active.substitutedFromID == nil {
            substitutions.removeAll { $0.originExerciseID == model.active.exerciseID }
        }
        return point
    }

    /// The change an undo in this slot would reverse right now.
    func latestUndo(slotIndex: Int) -> SessionSlot.UndoPoint? {
        slots.indices.contains(slotIndex) ? slots[slotIndex].model.latestUndo : nil
    }

    /// Swaps made during this session, for the summary and for the nudge that
    /// offers a program change after the same pair repeats.
    private(set) var substitutions: [Substitution] = []

    func substitutedOrigin(slotIndex: Int) -> Exercise? {
        slots.indices.contains(slotIndex) ? slots[slotIndex].substitutedFrom : nil
    }

    /// Whether the exercise on screen already has a written set.
    func hasLoggedSets(slotIndex: Int) -> Bool {
        slots.indices.contains(slotIndex) && slots[slotIndex].sets.contains(where: \.isLogged)
    }

    /// Every exercise in today's session, in any slot and under any swap.
    /// None of them is ever offered as a substitute.
    var sessionExerciseIDs: Set<String> {
        Set(slots.flatMap { slot in
            [slot.model.plan.exerciseID, slot.model.active.exerciseID] + slot.model.preserved.map(\.exerciseID)
        })
    }

    /// Takes load off the sets that are still open, without leaving the
    /// exercise. One decrement per step is a real change on a machine and a
    /// modest one on a barbell — and it is pre-filled, not applied: the user
    /// still logs it. Returns the rows as they were, for undo.
    func reduceLoad(slotIndex: Int, steps: Int = 2) -> [LoggedSet] {
        guard slots.indices.contains(slotIndex) else { return [] }
        let previous = slots[slotIndex].sets
        let increment = slots[slotIndex].exercise.incrementKg
        for index in slots[slotIndex].sets.indices where !slots[slotIndex].sets[index].isLogged {
            let current = slots[slotIndex].sets[index].weightKg ?? 0
            slots[slotIndex].sets[index].weightKg = max(0, current - increment * Decimal(steps))
        }
        return previous
    }

    /// Puts pre-filled weights back. Written rows are never touched.
    func restoreOpenWeights(slotIndex: Int, from previous: [LoggedSet]) {
        guard slots.indices.contains(slotIndex) else { return }
        for index in slots[slotIndex].sets.indices
        where index < previous.count && !slots[slotIndex].sets[index].isLogged {
            slots[slotIndex].sets[index].weightKg = previous[index].weightKg
        }
    }

    /// Opens the next open set with `Partieel` already on. `false` when no
    /// set is left open.
    @discardableResult
    func beginPartialSet(slotIndex: Int) -> Bool {
        guard slots.indices.contains(slotIndex), let next = nextIndex(in: slots[slotIndex]) else { return false }
        currentIndex = slotIndex
        editingStartsPartial = true
        editing = (slotIndex, next)
        return true
    }

    // MARK: - Added sets

    /// Adds a working set to this exercise, for this session only.
    ///
    /// The row is pre-filled from the most recent working set and is logged
    /// through the same sheet as every other row; adding it writes nothing.
    /// The program is not touched: the row has no prescription, and
    /// progression never reads it as one of the prescribed sets.
    @discardableResult
    func addSet(slotIndex: Int) -> LoggedSet? {
        guard slots.indices.contains(slotIndex) else { return nil }
        let fallback = Self.prefillWeight(slots[slotIndex])
        return slots[slotIndex].model.addSet(fallbackWeightKg: fallback)
    }

    func isAddedSet(slotIndex: Int, setIndex: Int) -> Bool {
        guard slots.indices.contains(slotIndex), slots[slotIndex].sets.indices.contains(setIndex) else { return false }
        return slots[slotIndex].sets[setIndex].origin == .sessionAdded
    }

    /// Takes an added row back out, logged or not, and returns what an undo
    /// needs to put it back. Prescribed rows are never removed: leaving one
    /// open is what skipping it means.
    func removeAddedSet(slotIndex: Int, setIndex: Int) -> SessionSlot.RemovedSet? {
        guard slots.indices.contains(slotIndex) else { return nil }
        // The rows after it renumber, so a sheet open on this exercise would
        // be pointing at a different set.
        if editing?.slot == slotIndex {
            editing = nil
            editingStartsPartial = false
        }
        return slots[slotIndex].model.removeAddedSet(at: setIndex)
    }

    /// The row "Remove set" takes: the last one still open. Done work is
    /// never removed from the list this way, and an exercise keeps one row.
    func removableSetIndex(slotIndex: Int) -> Int? {
        guard slots.indices.contains(slotIndex), slots[slotIndex].sets.count > 1 else { return nil }
        return slots[slotIndex].sets.lastIndex { !$0.isLogged }
    }

    /// Takes one open row out for today, prescribed or added. The program is
    /// untouched; the session simply asks one set fewer.
    func removeSet(slotIndex: Int, setIndex: Int) -> SessionSlot.RemovedSet? {
        guard slots.indices.contains(slotIndex) else { return nil }
        if editing?.slot == slotIndex {
            editing = nil
            editingStartsPartial = false
        }
        return slots[slotIndex].model.removeSet(at: setIndex)
    }

    func restore(_ removed: SessionSlot.RemovedSet, slotIndex: Int) {
        guard slots.indices.contains(slotIndex) else { return }
        slots[slotIndex].model.restore(removed)
    }

    /// The undo on "Set toegevoegd", honoured only while the row is still
    /// untouched. Once it is logged it is real work, and removing it asks
    /// first.
    @discardableResult
    func removeUntouchedAddedSet(slotIndex: Int, setID: UUID) -> Bool {
        guard slots.indices.contains(slotIndex),
              let position = slots[slotIndex].sets.firstIndex(where: { $0.id == setID }),
              !slots[slotIndex].sets[position].isLogged
        else { return false }
        return removeAddedSet(slotIndex: slotIndex, setIndex: position) != nil
    }

    /// The reps a row's sheet opens on.
    ///
    /// A prescribed row takes its own target. An added row has none, so it
    /// repeats the most recent written set — or, before anything is written,
    /// aims where the last prescribed set does.
    func suggestedReps(slotIndex: Int, setIndex: Int) -> Int? {
        guard isAddedSet(slotIndex: slotIndex, setIndex: setIndex) else {
            return targetReps(slotIndex: slotIndex, setIndex: setIndex)
        }
        let model = slots[slotIndex].model
        if let written = model.mostRecentWrittenSet { return written.reps }
        return targetReps(slotIndex: slotIndex, setIndex: model.prescribedRows.count - 1)
            ?? slots[slotIndex].planned.sets.last?.repRange.upperBound
    }

    /// The reps a row opens on — in the input card and in the sheet alike, so
    /// the two can never disagree about what one tap would write.
    ///
    /// The calibration set aims at its own target; a row that already holds
    /// reps keeps them; otherwise SETLINE's proposal for that row, then what
    /// the same set was last time, then the top of the row's range.
    func openingReps(slotIndex: Int, setIndex: Int) -> Int {
        guard slots.indices.contains(slotIndex), slots[slotIndex].sets.indices.contains(setIndex) else { return 0 }
        let slot = slots[slotIndex]
        let row = slot.sets[setIndex]
        if setIndex == 0, !row.isLogged, needsCalibration(slotIndex: slotIndex) { return Calibration.targetReps }
        if row.reps > 0 { return row.reps }
        let reference = slot.history.mostRecent?.sets.first { $0.index == setIndex }
        let plannedTop = slot.planned.sets.indices.contains(setIndex)
            ? slot.planned.sets[setIndex].repRange.upperBound
            : (slot.planned.sets.last?.repRange.upperBound ?? 8)
        return suggestedReps(slotIndex: slotIndex, setIndex: setIndex) ?? reference?.reps ?? plannedTop
    }

    /// The first exercise that still has a set open, for when the one on
    /// screen is done and it was the last in the list.
    var firstOpenSlotIndex: Int? {
        slots.firstIndex { !$0.isComplete }
    }

    // MARK: - Reorder

    /// The "do something else now and come back" offer, when one exists.
    func reorderPlan(slotIndex: Int) -> ReorderPlan? {
        guard slots.indices.contains(slotIndex) else { return nil }
        let later = slots.dropFirst(slotIndex + 1).map {
            (exercise: $0.exercise, role: $0.planned.role, hasStarted: $0.hasStarted)
        }
        return ReorderPlanner.plan(
            current: slots[slotIndex].exercise,
            currentIndex: slotIndex,
            currentIsComplete: slots[slotIndex].isComplete,
            later: Array(later)
        )
    }

    /// Moves to the later exercise. Nothing is reordered in the plan itself —
    /// the session simply carries on somewhere else, and the exercise left
    /// behind is still there to come back to. The rest timer keeps running.
    func takeReorder(_ plan: ReorderPlan) {
        currentIndex = plan.candidateIndex
    }

    // MARK: - Warm-up ladder

    /// Exercises whose ramp the user re-opened after it collapsed.
    private var reopenedWarmups: Set<String> = []
    private var hiddenWarmupIDs: Set<String> = []

    func configureWarmups(hidden: Set<String>) { hiddenWarmupIDs = hidden }

    /// The ramp for an exercise, built from the weight it is about to be
    /// worked at. Never stored, never logged, never counted.
    func warmupLadder(slotIndex: Int) -> [WarmupSet] {
        let slot = slots[slotIndex]
        guard !hiddenWarmupIDs.contains(slot.planned.exerciseID) else { return [] }
        guard let topSet = slot.sets.compactMap(\.weightKg).max() else { return [] }
        return WarmupPlanner.ladder(
            topSetKg: topSet,
            exercise: slot.exercise,
            context: WarmupPlanner.Context(
                positionInSession: slotIndex,
                isCompound: slot.exercise.isCompound
            )
        )
    }

    /// The ramp steps out of the way whenever something else needs the space.
    ///
    /// Two cases. Once the first working set is in, the ramp has done its job.
    /// And before that, a proposal or calibration card is already occupying
    /// the room above the grid — with both expanded the first set row falls
    /// below the fold, which is the one row the screen exists to show.
    func isWarmupCollapsed(slotIndex: Int) -> Bool {
        let slot = slots[slotIndex]
        if reopenedWarmups.contains(slot.planned.exerciseID) { return false }
        if slot.sets.first?.isLogged ?? false { return true }
        return competesForSpaceAboveTheGrid(slotIndex: slotIndex)
    }

    /// Whether a card is already sitting between the exercise name and the
    /// set grid.
    private func competesForSpaceAboveTheGrid(slotIndex: Int) -> Bool {
        if needsCalibration(slotIndex: slotIndex) { return true }
        let slot = slots[slotIndex]
        return !slot.proposalDismissed && !(slot.sets.first?.isLogged ?? false)
    }

    /// "Opwarming · 3 sets" for the collapsed affordance.
    func collapsedWarmupLabel(slotIndex: Int) -> String {
        let count = warmupLadder(slotIndex: slotIndex).count
        return "Warm-up · \(count) \(count == 1 ? "set" : "sets")"
    }

    func showWarmup(slotIndex: Int) {
        reopenedWarmups.insert(slots[slotIndex].planned.exerciseID)
    }

    func collapseWarmup(slotIndex: Int) {
        reopenedWarmups.remove(slots[slotIndex].planned.exerciseID)
    }

    func topSetLabel(slotIndex: Int, formatter: NumberDisplay = .english) -> String? {
        let slot = slots[slotIndex]
        guard let topSet = slot.sets.compactMap(\.weightKg).max() else { return nil }
        let reps = slot.planned.sets.map(\.repRange.upperBound).min() ?? 0
        return "\(formatter.kg(topSet)) × \(reps)"
    }

    // MARK: - Rest

    /// Rest inherits from the exercise's role (13R), never a flat 2:00.
    private func startRest(for planned: PlannedExercise) {
        // Nothing to rest for in a workout that is already over.
        guard !isLoggedAfterwards else { return }
        let prescription = RestPrescription.forRole(planned.role)
        let timer = RestTimerState(targetSeconds: prescription.defaultSeconds, startedAt: Date())
        restTimer = timer
        restTitle = "Rest · \(Self.roleLabel(planned.role)) \(prescription.displayLabel)"
        restCompletionSignalled = false
        isTimerExpanded = false
        RestNotifier.schedule(at: timer.fireDate, startedAt: timer.startedAt)
    }

    /// "3:00 vast": the rest the role prescribes, counted from now. The one
    /// control that restarts the count, and it says so.
    func resetRest() {
        guard let current = restTimer else { return }
        let timer = RestTimerState(targetSeconds: current.targetSeconds, startedAt: Date())
        restTimer = timer
        restCompletionSignalled = false
        RestNotifier.schedule(at: timer.fireDate, startedAt: timer.startedAt)
    }

    func adjustRest(by seconds: Int) {
        restTimer?.adjust(by: seconds, floorRemainingAt: now)
        guard let timer = restTimer else { return }
        if timer.remaining(at: Date()) > 0 { restCompletionSignalled = false }
        RestNotifier.schedule(at: timer.fireDate, startedAt: timer.startedAt)
    }

    func endRest() {
        restTimer = nil
        isTimerExpanded = false
        RestNotifier.cancel()
    }

    /// The session is leaving the screen — paused or finished. Nothing may
    /// announce the end of a rest that no longer exists.
    func stopRestSignals() {
        RestNotifier.cancel()
    }

    /// The session is on screen again. A rest it carried back from a pause
    /// asks again for the notification that pausing withdrew.
    func resumeRestSignals() {
        guard let timer = restTimer, timer.remaining(at: Date()) > 0 else { return }
        RestNotifier.schedule(at: timer.fireDate, startedAt: timer.startedAt)
    }

    func toggleTimerExpanded() {
        isTimerExpanded.toggle()
    }

    func tick() {
        now = Date()
        guard let timer = restTimer else { return }
        if !restCompletionSignalled, timer.remaining(at: now) == 0 {
            restCompletionSignalled = true
            restCompletions += 1
        }
    }

    /// The role name the timer labels itself with.
    static func roleLabel(_ role: ExerciseRole) -> String {
        switch role {
        case .primaryStrength: return "main lift"
        case .secondaryCompound: return "compound"
        case .accessory, .isolation: return "isolation"
        }
    }

    // MARK: - Presentation

    func rows(for slotIndex: Int) -> [SetRowPresentation] {
        let slot = slots[slotIndex]
        return SetRowPresenter.rows(
            sets: slot.sets,
            reference: slot.history.mostRecent,
            history: slot.history,
            activeIndex: nextIndex(in: slot),
            mode: gridMode(slotIndex: slotIndex),
            // The number every other surface names a set's target by.
            targetReps: slot.planned.sets.map(\.repRange.upperBound)
        )
    }

    func adviceLine(for slotIndex: Int) -> String? {
        let slot = slots[slotIndex]
        return SetRowPresenter.adviceLine(
            sets: slot.sets,
            planned: slot.planned,
            exercise: slot.exercise,
            history: slot.history,
            proposedTargets: proposedTargets(slotIndex: slotIndex)
        )
    }

    /// "VORIGE · 3 SEP  47,5 kg × 8 · 8 · 7" — the number the app is opened
    /// for, readable without a single interaction.
    func previousLine(for slot: ExerciseSlot) -> (label: String, detail: String)? {
        guard let last = slot.history.mostRecent else { return nil }
        let sets = last.sets.filter(\.countsTowardVolume)
        guard let weight = sets.first?.weightKg else { return nil }
        let reps = sets.map { "\($0.reps)" }.joined(separator: " · ")
        return ("Last · \(display.shortDate(last.date))", "\(display.kg(weight)) × \(reps)")
    }

    /// The card's head: "Vorige sessie · 2 sep" and what was lifted then —
    /// "82,5 kg" with "× 8/8/8/7" where every set shared a weight, otherwise
    /// each set on its own: "120 × 6 · 110 × 8".
    func previousSummary(for slot: ExerciseSlot) -> (date: Date, weight: String?, detail: String)? {
        guard let last = slot.history.mostRecent else { return nil }
        let sets = last.sets.filter(\.countsTowardVolume)
        guard let first = sets.first?.weightKg else { return nil }
        if sets.allSatisfy({ $0.weightKg == first }) {
            return (last.date, display.kg(first), "× " + sets.map { "\($0.reps)" }.joined(separator: "/"))
        }
        let each = sets.compactMap { set in
            set.weightKg.map { display.setReference(weightKg: $0, reps: set.reps) }
        }
        return (last.date, nil, each.joined(separator: " · "))
    }

    /// What the same set was last time: "82,5 × 8".
    func previousSet(slotIndex: Int, setIndex: Int) -> String? {
        guard slots.indices.contains(slotIndex) else { return nil }
        let slot = slots[slotIndex]
        guard let reference = slot.history.mostRecent else { return nil }
        let row = slot.sets.indices.contains(setIndex) ? slot.sets[setIndex] : nil
        let prior = reference.sets.first { $0.index == row?.index }
            ?? (reference.sets.indices.contains(setIndex) ? reference.sets[setIndex] : nil)
        guard let prior, let weight = prior.weightKg else { return nil }
        return display.setReference(weightKg: weight, reps: prior.reps)
    }

    var columnHeaderDate: String {
        guard let reference = slots.compactMap({ $0.history.mostRecent?.date }).max() else { return "Last" }
        return "vs \(display.shortDate(reference))"
    }

    // MARK: - Finishing

    /// Every result the session produced, each under the exercise it was
    /// logged on — preserved work from swaps included.
    var allResults: [ExerciseResult] { slots.flatMap(\.model.results) }

    func finishedSession(existing: TrainingSession?) -> TrainingSession {
        let models = slots.map(\.model)
        return TrainingSession(
            id: existing?.id ?? "\(Int(Date().timeIntervalSince1970 * 1000))",
            date: existing?.date ?? startedAt,
            dayID: day.id,
            dayLabel: day.short,
            // Against the prescription. The header's SET n/N counts every
            // row, added ones included; completion never does.
            completion: SessionSlot.completion(of: models),
            kind: .workout,
            results: allResults,
            // A session written down afterwards records no duration rather
            // than the minutes it took to type — `SessionHistory` already says
            // nothing about time for a session that never recorded one.
            durationSeconds: isLoggedAfterwards ? nil : clock.activeSeconds(at: Date()),
            // What history shows as "completed of planned". Added rows are in
            // neither number.
            plannedSetCount: SessionSlot.plannedSetCount(of: models),
            completedSetCount: SessionSlot.completedSetCount(of: models)
        )
    }

    /// The volume card on 17R, and its comparison against the last session.
    func volumeSummary(previous: TrainingSession?) -> (volume: Decimal, delta: Decimal?) {
        let volume = RecordsEngine.volumeLoad(allResults.flatMap(\.sets))
        guard let previous else { return (volume, nil) }
        let before = RecordsEngine.volumeLoad(previous.results.flatMap(\.sets))
        return (volume, before > 0 ? volume - before : nil)
    }

    /// Records from every exercise that did work today, swapped-out ones too.
    /// Highest-ranked first, as 17R lists them; exercises of equal rank keep
    /// their session order.
    func records() -> [(name: String, record: ExerciseRecord)] {
        let found = slots.flatMap { slot -> [(name: String, record: ExerciseRecord)] in
            slot.model.results.compactMap { result -> (name: String, record: ExerciseRecord)? in
                let history = result.exerciseID == slot.planned.exerciseID
                    ? slot.history
                    : historyFor(PlannedExercise(
                        exerciseID: result.exerciseID,
                        role: slot.model.plan.role,
                        sets: [],
                        modifiers: slot.model.plan.modifiers
                    ))
                guard let record = RecordsEngine.record(for: result.sets, history: history) else { return nil }
                return (result.name, record)
            }
        }
        return found.enumerated()
            .sorted { ($0.element.record.rank, -$0.offset) > ($1.element.record.rank, -$1.offset) }
            .map(\.element)
    }

    #if DEBUG
    /// Writes the first two sets of the first exercise, so the written,
    /// delta and PR row states are inspectable without driving taps.
    func prefillForInspection() {
        guard let weight = slots.first?.sets.first?.weightKg else { return }
        log(slotIndex: 0, setIndex: 0, entry: SetEntry(weightKg: weight, reps: 6, rir: 1, failed: false, pausedReps: nil, partialReps: nil))
        log(slotIndex: 0, setIndex: 1, entry: SetEntry(weightKg: weight, reps: 6, rir: nil, failed: false, pausedReps: nil, partialReps: nil))
    }

    /// Fills every planned set, for inspecting the completed-session state.
    func fillEverythingForInspection() {
        for slotIndex in slots.indices {
            for setIndex in slots[slotIndex].sets.indices {
                let weight = slots[slotIndex].sets[setIndex].weightKg ?? 20
                // A resumed session can hold added rows, which have no range.
                let planned = slots[slotIndex].planned.sets
                let target = (planned.indices.contains(setIndex) ? planned[setIndex] : planned.last)?
                    .repRange.upperBound ?? 8
                log(slotIndex: slotIndex, setIndex: setIndex, entry: SetEntry(weightKg: weight, reps: target, rir: 1, failed: false, pausedReps: nil, partialReps: nil))
            }
        }
        currentIndex = 0
        endRest()
    }
    #endif
}
