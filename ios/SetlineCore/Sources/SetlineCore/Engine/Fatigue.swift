import Foundation

/// Fatigue, read from what was actually logged (TRAINING_LOGIC §11).
///
/// Nothing here comes from a calendar, a wearable or a questionnaire. Every
/// signal is a pattern in the sets this account wrote down, and no single one
/// proposes anything: two or more inside one week do. The evidence for deloads
/// is thin, which is why Setline never applies one by itself.
public enum Fatigue {

    public enum Signal: String, CaseIterable, Sendable {
        /// Reps at the same load falling on two sessions running, on at least
        /// two exercises of the same session type.
        case performanceRegression
        /// Same load and reps, but RIR reported one lower.
        case effortDrift
        /// Under 80% of the planned sets finished, twice running.
        case completionDrop
    }

    /// What one exercise did, in the words the proposal uses as evidence.
    public struct Evidence: Equatable, Sendable {
        public let exerciseName: String
        public let detail: String

        public init(exerciseName: String, detail: String) {
            self.exerciseName = exerciseName
            self.detail = detail
        }
    }

    public struct Reading: Equatable, Sendable {
        public let signals: Set<Signal>
        public let evidence: [Evidence]

        public init(signals: Set<Signal>, evidence: [Evidence]) {
            self.signals = signals
            self.evidence = evidence
        }

        /// Two or more signals in the same window, never one.
        public var proposes: Bool { signals.count >= 2 }

        public static let none = Reading(signals: [], evidence: [])
    }

    /// The window the signals have to share, in days.
    public static let windowDays = 7

    public static func read(
        sessions: [TrainingSession],
        now: Date = Date(),
        calendar: Calendar = .current,
        display: NumberDisplay = .dutch
    ) -> Reading {
        let recent = sessions
            .filter { $0.kind == .workout }
            .filter { (calendar.dateComponents([.day], from: $0.date, to: now).day ?? .max) <= windowDays }
            .sorted { $0.date > $1.date }

        // Two consecutive sessions of the same day are what every signal
        // compares; without them there is nothing to say.
        guard recent.count >= 2 else { return .none }

        var signals: Set<Signal> = []
        var evidence: [Evidence] = []

        let byDay = Dictionary(grouping: recent, by: \.dayID)
        for (_, sessions) in byDay {
            guard sessions.count >= 2 else { continue }
            let (newest, previous) = (sessions[0], sessions[1])

            var regressed: [Evidence] = []
            var drifted: [Evidence] = []
            for result in newest.results {
                guard let before = previous.results.first(where: { $0.exerciseID == result.exerciseID }) else { continue }
                if let line = repsFell(from: before, to: result, display: display) {
                    regressed.append(Evidence(exerciseName: result.name, detail: line))
                }
                if let line = effortDrifted(from: before, to: result, display: display) {
                    signals.insert(.effortDrift)
                    drifted.append(Evidence(exerciseName: "RIR", detail: line))
                }
            }
            if regressed.count >= 2 {
                signals.insert(.performanceRegression)
                // 18R's order: the first exercise that slipped, what the
                // reserve did, then the next one.
                evidence.append(regressed[0])
                evidence.append(contentsOf: drifted)
                evidence.append(contentsOf: regressed.dropFirst().prefix(1))
            } else {
                evidence.append(contentsOf: drifted)
            }

            if completionFell(newest) && completionFell(previous) {
                signals.insert(.completionDrop)
                evidence.append(Evidence(
                    exerciseName: newest.dayLabel,
                    detail: "Minder dan 80% van de geplande sets afgerond, twee sessies op rij"
                ))
            }
        }

        return Reading(signals: signals, evidence: Array(evidence.prefix(3)))
    }

    /// Reps down at the same load: "102,5 kg · 6 → 5 reps".
    private static func repsFell(
        from before: ExerciseResult,
        to after: ExerciseResult,
        display: NumberDisplay
    ) -> String? {
        guard let load = after.sets.compactMap(\.weightKg).max(),
              before.sets.compactMap(\.weightKg).max() == load,
              let reps = after.sets.filter({ $0.weightKg == load }).map(\.reps).max(),
              let was = before.sets.filter({ $0.weightKg == load }).map(\.reps).max(),
              reps < was
        else { return nil }
        return "\(display.kg(load)) · \(was) → \(reps) reps"
    }

    /// Same work, less left in the tank: "2 → 1".
    private static func effortDrifted(
        from before: ExerciseResult,
        to after: ExerciseResult,
        display: NumberDisplay
    ) -> String? {
        guard let load = after.sets.compactMap(\.weightKg).max(),
              before.sets.compactMap(\.weightKg).max() == load,
              let reps = after.sets.filter({ $0.weightKg == load }).map(\.reps).max(),
              let wasReps = before.sets.filter({ $0.weightKg == load }).map(\.reps).max(),
              reps == wasReps,
              let rir = after.sets.compactMap(\.rirReported).min(),
              let wasRIR = before.sets.compactMap(\.rirReported).min(),
              wasRIR - rir >= 1
        else { return nil }
        return "\(wasRIR) → \(rir)"
    }

    private static func completionFell(_ session: TrainingSession) -> Bool {
        guard let planned = session.plannedSetCount, planned > 0,
              let completed = session.completedSetCount
        else { return false }
        return Double(completed) / Double(planned) < 0.8
    }
}

/// What Setline offers when the signals agree, and what taking it does
/// (TRAINING_LOGIC §11.2). Never applied on its own, always reversible.
public struct Deload: Equatable, Codable, Sendable {
    public let startedAt: Date
    public let days: Int
    /// The share of sets removed, as a fraction.
    public let setReduction: Double
    public let rirIncrease: Int

    public init(startedAt: Date, days: Int = 5, setReduction: Double = 0.4, rirIncrease: Int = 2) {
        self.startedAt = startedAt
        self.days = days
        self.setReduction = setReduction
        self.rirIncrease = rirIncrease
    }

    public func isActive(on date: Date, calendar: Calendar = .current) -> Bool {
        guard let ends = calendar.date(byAdding: .day, value: days, to: startedAt) else { return false }
        return date >= startedAt && date < ends
    }

    /// Whether a lighter week covers a whole calendar day.
    ///
    /// `isActive(on:)` answers for an instant, which is what "is one running
    /// right now" needs. A date in a week view is midnight, so a deload begun
    /// at nine in the morning would not cover its own day. The dates a
    /// calendar shows are days, and a lighter week covers days.
    public func covers(_ date: Date, calendar: Calendar = .current) -> Bool {
        let start = calendar.startOfDay(for: startedAt)
        guard let ends = calendar.date(byAdding: .day, value: days, to: start) else { return false }
        let day = calendar.startOfDay(for: date)
        return day >= start && day < ends
    }

    /// Sets are cut, never exercises, so progression state survives.
    public func sets(from planned: Int) -> Int {
        max(1, Int((Double(planned) * (1 - setReduction)).rounded()))
    }

    /// The proposal's own words. 40% fewer sets at two more in reserve, for
    /// five days, at the same weight.
    public var headline: String { "Voorstel: \(days) dagen lichter" }

    public var detail: String {
        "Zelfde oefeningen, \(Int(setReduction * 100))% minder sets, RIR +\(rirIncrease). Gewicht blijft."
    }

    public static let footnote = "Gebaseerd op je laatste drie sessies, niet op de kalender."
}

/// The plan a session opened now works from.
///
/// A lighter week cuts sets, never exercises (TRAINING_LOGIC §11.2): every
/// exercise stays and keeps its first sets. The session builds its rows from
/// this, and whatever describes today's session before it opens counts from
/// it too — never from the plan as written.
public enum SessionPrescription {

    public static func planned(_ planned: PlannedExercise, deload: Deload?) -> PlannedExercise {
        guard let deload else { return planned }
        return planned.lightened(setsTo: deload.sets(from: planned.targetSets))
    }

    /// The day as a session opened now would lay it out: the same exercises,
    /// in the same order, with the lighter week applied where one runs.
    ///
    /// Everything that previews a date — the card on Training, the Agenda row,
    /// the workout preview — builds on this, so what a date shows and what it
    /// opens with cannot drift apart.
    public static func day(_ day: WorkoutDay, deload: Deload?) -> WorkoutDay {
        guard deload != nil else { return day }
        var effective = day
        effective.exercises = day.exercises.map { planned($0, deload: deload) }
        return effective
    }

    /// Prescribed sets across a day, as a session opened now lays them out.
    /// Sets added during a session are never part of a prescription.
    public static func setCount(of day: WorkoutDay, deload: Deload?) -> Int {
        WeekPlan.sets(of: self.day(day, deload: deload))
    }
}
