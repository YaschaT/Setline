import Foundation

/// How the reps of a set were performed, as far as measuring it against
/// another set goes (TRAINING_LOGIC §9.2): with no pause, with every rep
/// paused, or with some of them paused — a mixed set, which carries how many.
///
/// Both clients read it from the same stored fields — `setExecution()` in
/// `lib/set-reps.ts` on the web — and `tests/fixtures/best-set-comparison.json`
/// holds them to it. The paused count stays inside the reps either way: six
/// reps with two paused is a mixed set of six reps.
public struct SetExecution: Equatable, Sendable {
    public enum Kind: String, Sendable {
        case touchAndGo = "touch-and-go"
        case paused
        case mixed
    }

    public let kind: Kind
    /// How many of the reps carried the pause: none, all of them, or some.
    public let pausedReps: Int
    /// The pause in seconds, for a paused or mixed set.
    public let pauseSeconds: Double?

    public init(kind: Kind, pausedReps: Int, pauseSeconds: Double?) {
        self.kind = kind
        self.pausedReps = pausedReps
        self.pauseSeconds = pauseSeconds
    }

    /// Whether the two sets were performed the same way, so one may be
    /// measured against the other: touch-and-go with touch-and-go, a paused
    /// set with a paused set of the same pause length (±0.5 s), and a mixed
    /// set only with a mixed set that paused the same number of reps for the
    /// same length.
    public func isComparable(to other: SetExecution) -> Bool {
        guard kind == other.kind else { return false }
        if kind == .mixed, pausedReps != other.pausedReps { return false }
        guard kind != .touchAndGo else { return true }
        return abs((pauseSeconds ?? 2) - (other.pauseSeconds ?? 2)) <= 0.5
    }
}

extension LoggedSet {
    /// A count that covers every rep is a paused set, and so is the pause
    /// modifier without a count — the shape this app writes. A pause without
    /// a length is the 2 s `LegacyAdapter` has always read it as.
    public var execution: SetExecution {
        let stored = max(pausedReps ?? 0, 0)
        let length = modifiers.pauseSeconds ?? 2
        if reps > 0, stored >= reps {
            return SetExecution(kind: .paused, pausedReps: reps, pauseSeconds: length)
        }
        let paused = reps > 0 ? stored : 0
        if paused > 0 {
            return SetExecution(kind: .mixed, pausedReps: paused, pauseSeconds: length)
        }
        if modifiers.pauseEnabled {
            return SetExecution(kind: .paused, pausedReps: reps, pauseSeconds: length)
        }
        return SetExecution(kind: .touchAndGo, pausedReps: 0, pauseSeconds: nil)
    }
}
