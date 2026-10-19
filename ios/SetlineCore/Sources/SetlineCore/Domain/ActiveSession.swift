import Foundation

/// A workout that has been started and not finished.
///
/// Pausing must never cost a set. The snapshot carries every row as it
/// stands — written sets and pre-filled drafts alike — plus which exercise
/// the user was on, so reopening puts them back exactly where they were.
///
/// It rides in the shared state blob under a key the web app does not read,
/// so a paused session survives a relaunch and follows the account across
/// devices. It is explicitly *not* a `TrainingSession`: nothing here counts
/// toward history, volume, records or progression until the session is
/// finished.
public struct ActiveSessionSnapshot: Codable, Hashable, Sendable {
    public var dayID: String
    public var dayLabel: String
    public var startedAt: Date
    public var currentIndex: Int
    public var results: [ExerciseResult]
    /// Per-exercise overrides of the proposal's rep target.
    public var proposedReps: [String: Int]
    /// Active workout time banked so far, in seconds. Time spent paused is
    /// never in here.
    public var activeSeconds: Int
    /// Every slot as it stood, swaps and preserved work included. Resume
    /// restores from these by position, which is what lets a substitute — and
    /// the sets logged on it — survive a pause. `nil` in snapshots written
    /// before slots were saved; those still restore by exercise id.
    public var slots: [SessionSlot]?
    /// The rest that was counting down when the session was paused. `nil` for
    /// a session paused between rests, and in snapshots written before rests
    /// were kept.
    public var rest: PausedRest?
    /// Set when the workout was saved while still open — the app left the
    /// foreground mid-workout, or a set was just logged — rather than paused
    /// by hand. Time away then still counts as training (a locked phone
    /// between sets is a workout, not a pause), and a relaunch reopens the
    /// workout instead of parking it on the home screen. `nil` for a pause.
    public var runningSince: Date?

    /// The longest stretch away that is still taken as training time; longer,
    /// and the clock stops where the workout was left.
    public static let maxAwaySeconds = 2 * 60 * 60

    /// Active seconds on reopening: what was banked, plus the time away when
    /// the workout was left running — capped, so a workout forgotten for a
    /// day never claims a day of training.
    public func activeSeconds(resumingAt now: Date) -> Int {
        guard let runningSince else { return activeSeconds }
        let away = max(0, Int(now.timeIntervalSince(runningSince)))
        return activeSeconds + min(away, Self.maxAwaySeconds)
    }

    /// Left open (not paused) recently enough that reopening it is what the
    /// lifter expects.
    public func reopensOnLaunch(at now: Date) -> Bool {
        guard let runningSince else { return false }
        return now.timeIntervalSince(runningSince) < Double(Self.maxAwaySeconds)
    }

    /// A rest timer as it stood at the pause: its absolute start, its target
    /// and any ± adjustment, and the label it was started with.
    public struct PausedRest: Codable, Hashable, Sendable {
        public var timer: RestTimerState
        public var title: String

        public init(timer: RestTimerState, title: String) {
            self.timer = timer
            self.title = title
        }

        /// The rest worth keeping at a pause: one that is still counting.
        /// No timer, or one already at zero, keeps nothing.
        public static func counting(_ timer: RestTimerState?, title: String, at now: Date) -> PausedRest? {
            guard let timer, timer.remaining(at: now) > 0 else { return nil }
            return PausedRest(timer: timer, title: title)
        }
    }

    public init(
        dayID: String,
        dayLabel: String,
        startedAt: Date,
        currentIndex: Int,
        results: [ExerciseResult],
        proposedReps: [String: Int] = [:],
        activeSeconds: Int = 0,
        slots: [SessionSlot]? = nil,
        rest: PausedRest? = nil,
        runningSince: Date? = nil
    ) {
        self.dayID = dayID
        self.dayLabel = dayLabel
        self.startedAt = startedAt
        self.currentIndex = currentIndex
        self.results = results
        self.proposedReps = proposedReps
        self.activeSeconds = max(0, activeSeconds)
        self.slots = slots
        self.rest = rest
        self.runningSince = runningSince
    }

    private enum CodingKeys: String, CodingKey {
        case dayID, dayLabel, startedAt, currentIndex, results, proposedReps, activeSeconds, slots, rest, runningSince
    }

    /// Tolerates a snapshot written before duration, slots or rests were kept.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        dayID = try container.decode(String.self, forKey: .dayID)
        dayLabel = try container.decode(String.self, forKey: .dayLabel)
        startedAt = try container.decode(Date.self, forKey: .startedAt)
        currentIndex = try container.decode(Int.self, forKey: .currentIndex)
        results = try container.decode([ExerciseResult].self, forKey: .results)
        proposedReps = try container.decodeIfPresent([String: Int].self, forKey: .proposedReps) ?? [:]
        activeSeconds = try container.decodeIfPresent(Int.self, forKey: .activeSeconds) ?? 0
        slots = try container.decodeIfPresent([SessionSlot].self, forKey: .slots)
        rest = try container.decodeIfPresent(PausedRest.self, forKey: .rest)
        runningSince = try container.decodeIfPresent(Date.self, forKey: .runningSince)
    }

    /// The rest a resumed session takes back. Rest is wall-clock time — it
    /// kept running while the session was parked — so it comes back with the
    /// time it has left and never more. One that ran out meanwhile is over,
    /// and a session paused between rests gets none.
    public func restToResume(at now: Date) -> PausedRest? {
        guard let rest, rest.timer.remaining(at: now) > 0 else { return nil }
        return rest
    }

    /// Sets actually written, for the resume prompt on the home screen.
    public var loggedSetCount: Int {
        if let slots { return slots.reduce(0) { $0 + $1.loggedSetCount } }
        return results.flatMap(\.sets).filter(\.isLogged).count
    }

    public var plannedSetCount: Int {
        if let slots { return slots.reduce(0) { $0 + $1.setCount } }
        return results.flatMap(\.sets).count
    }

    public var hasProgress: Bool { loggedSetCount > 0 }

    /// Turns a paused workout into history, keeping only what was written.
    ///
    /// Used when the session is ended from the home screen rather than
    /// resumed. Unwritten sets simply are not there — they count as not
    /// trained, which carries no penalty anywhere in the engine.
    public func finishedSession(id: String? = nil) -> TrainingSession {
        let results = slots?.flatMap(\.results) ?? results.map { result in
            ExerciseResult(
                exerciseID: result.exerciseID,
                name: result.name,
                sets: result.sets.filter(\.isLogged)
            )
        }
        // Measured against the prescription, exactly as a session finished on
        // screen is. Snapshots saved before slots cannot hold an added set and
        // keep the count they always used.
        let completion = slots.map(SessionSlot.completion(of:))
            ?? (plannedSetCount == 0 ? 0 : Int(Double(loggedSetCount) / Double(plannedSetCount) * 100))
        return TrainingSession(
            id: id ?? "\(Int(startedAt.timeIntervalSince1970 * 1000))",
            date: startedAt,
            dayID: dayID,
            dayLabel: dayLabel,
            completion: completion,
            kind: .workout,
            results: results,
            durationSeconds: activeSeconds,
            // Exact counts only where the prescription is known. An older
            // snapshot's rows need not cover every exercise of the day, so it
            // keeps showing its percentage instead.
            plannedSetCount: slots.map(SessionSlot.plannedSetCount(of:)),
            completedSetCount: slots.map(SessionSlot.completedSetCount(of:))
        )
    }
}
