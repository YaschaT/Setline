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
        let planned: PlannedExercise
        let exercise: Exercise
        let history: ExerciseHistory
        let proposal: ProgressionProposal
        var sets: [LoggedSet]
        var proposalDismissed = false

        var id: String { planned.exerciseID }
        var isComplete: Bool { sets.allSatisfy(\.isLogged) }
    }

    let day: WorkoutDay
    private(set) var slots: [ExerciseSlot]
    /// The calendar moment the workout began — its date, not its duration.
    private(set) var startedAt = Date()
    /// Duration is active workout time, banked across pauses.
    private var clock = WorkoutClock(segmentStartedAt: Date())
    private(set) var restTimer: RestTimerState?
    private(set) var now = Date()
    /// The timer opens expanded and steps back after a few seconds; the user
    /// can flip it either way at any time.
    var isTimerExpanded = true
    /// The step-back happens once per rest. Without this, every tick after
    /// the third second collapsed the timer again and manual expansion was
    /// undone the instant it happened.
    private var hasAutoCollapsed = false

    var currentIndex: Int = 0
    var editing: (slot: Int, set: Int)?
    private(set) var proposedReps: [String: Int] = [:]

    private let display = NumberDisplay.dutch

    init(day: WorkoutDay, app: AppState, restoring snapshot: ActiveSessionSnapshot? = nil) {
        self.day = day
        self.slots = day.exercises.map { planned in
            let history = app.history(for: planned)
            let exercise = app.exercise(planned.exerciseID)
            let proposal = ProgressionEngine.proposal(
                planned: planned,
                exercise: exercise,
                history: history
            )
            // Pre-filled from the proposal, or from the previous session, or
            // left blank when there is nothing honest to put there.
            let prefillWeight = proposal.weightKg
                ?? history.mostRecent?.sets.first?.weightKg
            let sets = planned.sets.enumerated().map { index, _ in
                LoggedSet(
                    index: index,
                    weightKg: prefillWeight,
                    reps: 0,
                    modifiers: planned.modifiers
                )
            }
            return ExerciseSlot(
                planned: planned,
                exercise: exercise,
                history: history,
                proposal: proposal,
                sets: sets
            )
        }

        if let snapshot { restore(from: snapshot) }
        // A fresh stretch starts now either way; a resumed session carries its
        // banked time in, rather than recomputing from `startedAt`.
        clock = WorkoutClock(accumulatedSeconds: snapshot?.activeSeconds ?? 0, segmentStartedAt: Date())
    }

    // MARK: - Pause and resume

    /// Puts the saved rows back over the freshly built slots, so a resumed
    /// session shows exactly what was left behind — written sets, pre-filled
    /// drafts, rep-target overrides and the exercise the user was on.
    private func restore(from snapshot: ActiveSessionSnapshot) {
        for result in snapshot.results {
            guard let index = slots.firstIndex(where: { $0.planned.exerciseID == result.exerciseID }) else { continue }
            guard !result.sets.isEmpty else { continue }
            slots[index].sets = result.sets
        }
        proposedReps = snapshot.proposedReps
        currentIndex = min(max(0, snapshot.currentIndex), max(0, slots.count - 1))
        startedAt = snapshot.startedAt
        // A resumed session never resumes a rest countdown: the clock kept
        // running while the app was closed, and inventing time left would be
        // a lie.
        restTimer = nil
    }

    func snapshot() -> ActiveSessionSnapshot {
        ActiveSessionSnapshot(
            dayID: day.id,
            dayLabel: day.short,
            startedAt: startedAt,
            currentIndex: currentIndex,
            results: slots.map { slot in
                ExerciseResult(
                    exerciseID: slot.planned.exerciseID,
                    name: slot.exercise.name,
                    sets: slot.sets
                )
            },
            proposedReps: proposedReps,
            activeSeconds: clock.activeSeconds(at: Date())
        )
    }

    var current: ExerciseSlot { slots[min(currentIndex, slots.count - 1)] }

    /// The proposal sits above set 1 until set 1 exists, then steps aside so
    /// the row's own lime — a PR, a positive delta — is the screen's one
    /// meaning.
    var showsProposal: Bool {
        !current.proposalDismissed && !(current.sets.first?.isLogged ?? false)
    }

    var elapsedSeconds: Int { clock.activeSeconds(at: now) }

    var completedSetCount: Int { slots.flatMap(\.sets).filter(\.isLogged).count }
    var plannedSetCount: Int { slots.flatMap(\.sets).count }
    var hasProgress: Bool { completedSetCount > 0 }
    /// Every planned set across every exercise has been written.
    var isComplete: Bool { slots.allSatisfy(\.isComplete) }

    /// The row the sheet should open on: the first unwritten set.
    func nextIndex(in slot: ExerciseSlot) -> Int? {
        slot.sets.firstIndex { !$0.isLogged }
    }

    var nextSlotIndex: Int? {
        currentIndex + 1 < slots.count ? currentIndex + 1 : nil
    }

    // MARK: - Logging

    /// Tap 2 of 2. Writes the set and starts the rest, in that order.
    ///
    /// It deliberately does **not** move to the next exercise: the advice
    /// line the engine computes for the last set has to be readable, and
    /// jumping away replaced it in the same frame.
    func log(slotIndex: Int, setIndex: Int, weight: Decimal, reps: Int, rir: Int?, failed: Bool) {
        guard slots.indices.contains(slotIndex), slots[slotIndex].sets.indices.contains(setIndex) else { return }
        var set = slots[slotIndex].sets[setIndex]
        set.weightKg = weight
        set.reps = reps
        set.rirReported = rir
        set.flags = failed ? [.failed] : []
        slots[slotIndex].sets[setIndex] = set

        startRest(for: slots[slotIndex].planned)
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

    func adjustProposedReps(slotIndex: Int, by delta: Int) {
        guard slots.indices.contains(slotIndex) else { return }
        proposedReps[slots[slotIndex].planned.exerciseID] = max(1, proposedRepTarget(slotIndex: slotIndex) + delta)
    }

    func proposedWeight(slotIndex: Int) -> Decimal? {
        slots[slotIndex].sets.first { !$0.isLogged }?.weightKg
    }

    func proposedRepTarget(slotIndex: Int) -> Int {
        let slot = slots[slotIndex]
        return proposedReps[slot.planned.exerciseID]
            ?? slot.proposal.targetReps
            ?? slot.planned.sets.first?.repRange.upperBound
            ?? 8
    }

    // MARK: - Rest

    /// Rest inherits from the exercise's role (13R), never a flat 2:00.
    private func startRest(for planned: PlannedExercise) {
        let prescription = RestPrescription.forRole(planned.role)
        restTimer = RestTimerState(targetSeconds: prescription.defaultSeconds, startedAt: Date())
        isTimerExpanded = true
        hasAutoCollapsed = false
    }

    /// Seconds after which the expanded timer steps back to the compact bar.
    static let expandedTimerSeconds: TimeInterval = 3

    func adjustRest(by seconds: Int) {
        restTimer?.adjust(by: seconds, floorRemainingAt: now)
    }

    func endRest() {
        restTimer = nil
        isTimerExpanded = true
        hasAutoCollapsed = false
    }

    func toggleTimerExpanded() {
        isTimerExpanded.toggle()
        // A deliberate choice outranks the automatic step-back.
        hasAutoCollapsed = true
    }

    func tick() {
        now = Date()
        guard let timer = restTimer, !hasAutoCollapsed else { return }
        if isTimerExpanded, now.timeIntervalSince(timer.startedAt) >= Self.expandedTimerSeconds {
            isTimerExpanded = false
            hasAutoCollapsed = true
        }
    }

    /// The role name the timer labels itself with.
    var restRoleLabel: String {
        switch current.planned.role {
        case .primaryStrength: return "primaire lift"
        case .secondaryCompound: return "samengesteld"
        case .accessory, .isolation: return "isolatie"
        }
    }

    // MARK: - Presentation

    func rows(for slotIndex: Int) -> [SetRowPresentation] {
        let slot = slots[slotIndex]
        return SetRowPresenter.rows(
            sets: slot.sets,
            reference: slot.history.mostRecent,
            history: slot.history,
            activeIndex: nextIndex(in: slot)
        )
    }

    func adviceLine(for slotIndex: Int) -> String? {
        let slot = slots[slotIndex]
        return SetRowPresenter.adviceLine(
            sets: slot.sets,
            planned: slot.planned,
            exercise: slot.exercise,
            history: slot.history
        )
    }

    /// "VORIGE · 3 SEP  47,5 kg × 8 · 8 · 7" — the number the app is opened
    /// for, readable without a single interaction.
    func previousLine(for slot: ExerciseSlot) -> (label: String, detail: String)? {
        guard let last = slot.history.mostRecent else { return nil }
        let sets = last.sets.filter(\.countsTowardVolume)
        guard let weight = sets.first?.weightKg else { return nil }
        let reps = sets.map { "\($0.reps)" }.joined(separator: " · ")
        return ("Vorige · \(display.shortDate(last.date))", "\(display.kg(weight)) × \(reps)")
    }

    var columnHeaderDate: String {
        guard let reference = slots.compactMap({ $0.history.mostRecent?.date }).max() else { return "Vorige" }
        return "vs \(display.shortDate(reference))"
    }

    // MARK: - Finishing

    func finishedSession(existing: TrainingSession?) -> TrainingSession {
        let results = slots.map { slot in
            ExerciseResult(
                exerciseID: slot.planned.exerciseID,
                name: slot.exercise.name,
                sets: slot.sets.filter(\.isLogged)
            )
        }
        let completion = plannedSetCount == 0 ? 0 : Int(Double(completedSetCount) / Double(plannedSetCount) * 100)
        return TrainingSession(
            id: existing?.id ?? "\(Int(Date().timeIntervalSince1970 * 1000))",
            date: existing?.date ?? startedAt,
            dayID: day.id,
            dayLabel: day.short,
            completion: completion,
            kind: .workout,
            results: results,
            durationSeconds: clock.activeSeconds(at: Date())
        )
    }

    /// The volume card on 17R, and its comparison against the last session.
    func volumeSummary(previous: TrainingSession?) -> (volume: Decimal, delta: Decimal?) {
        let volume = RecordsEngine.volumeLoad(slots.flatMap(\.sets))
        guard let previous else { return (volume, nil) }
        let before = RecordsEngine.volumeLoad(previous.results.flatMap(\.sets))
        return (volume, before > 0 ? volume - before : nil)
    }

    func records() -> [(name: String, record: ExerciseRecord)] {
        slots.compactMap { slot in
            guard let record = RecordsEngine.record(for: slot.sets, history: slot.history) else { return nil }
            return (slot.exercise.name, record)
        }
    }

    #if DEBUG
    /// Writes the first two sets of the first exercise, so the written,
    /// delta and PR row states are inspectable without driving taps.
    func prefillForInspection() {
        guard let weight = slots.first?.sets.first?.weightKg else { return }
        log(slotIndex: 0, setIndex: 0, weight: weight, reps: 6, rir: 1, failed: false)
        log(slotIndex: 0, setIndex: 1, weight: weight, reps: 6, rir: nil, failed: false)
    }

    /// Fills every planned set, for inspecting the completed-session state.
    func fillEverythingForInspection() {
        for slotIndex in slots.indices {
            for setIndex in slots[slotIndex].sets.indices {
                let weight = slots[slotIndex].sets[setIndex].weightKg ?? 20
                let target = slots[slotIndex].planned.sets[setIndex].repRange.upperBound
                log(slotIndex: slotIndex, setIndex: setIndex, weight: weight, reps: target, rir: 1, failed: false)
            }
        }
        currentIndex = 0
        endRest()
    }
    #endif
}
