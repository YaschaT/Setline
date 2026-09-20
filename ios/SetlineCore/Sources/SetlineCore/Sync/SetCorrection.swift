import Foundation

/// One logged set, corrected after the fact.
///
/// A correction carries only the values a set was logged with, and names the
/// set by the only identity the shared wire format has: the session's id, the
/// exercise result inside it, and the set's place in that result's list. Sets
/// have no id on the wire — `LoggedSet.id` is minted while parsing and is
/// gone on the next read — so position is what both clients agree on, and it
/// is what `StateMerge` already uses to keep a set's unknown fields.
///
/// Nothing else about the set is touched: whether it was a warm-up, what it
/// stood in for, whether the program prescribed it or the session added it,
/// and any field a newer client wrote all stay exactly as stored.
public struct SetCorrection: Codable, Hashable, Sendable {

    /// The exercise the set was logged under, as the session stored it.
    public let exerciseID: String
    /// Which result with that exercise id, when a session holds more than one
    /// (a swap back to an exercise already done). Zero for the first.
    public let occurrence: Int
    /// The set's place in that result's list.
    public let setIndex: Int

    public let weightKg: Decimal
    public let reps: Int
    public let rirReported: Int?
    public let pausedReps: Int?
    public let partialReps: Int?
    public let pauseEnabled: Bool
    public let pauseSeconds: Double?

    public init(
        exerciseID: String,
        occurrence: Int = 0,
        setIndex: Int,
        weightKg: Decimal,
        reps: Int,
        rirReported: Int? = nil,
        pausedReps: Int? = nil,
        partialReps: Int? = nil,
        pauseEnabled: Bool = false,
        pauseSeconds: Double? = nil
    ) {
        self.exerciseID = exerciseID
        self.occurrence = occurrence
        self.setIndex = setIndex
        self.weightKg = weightKg
        self.reps = reps
        self.rirReported = rirReported
        self.pausedReps = pausedReps
        self.partialReps = partialReps
        self.pauseEnabled = pauseEnabled
        self.pauseSeconds = pauseSeconds
    }

    /// The set as it now reads, for a set already stored in that session.
    public init(exerciseID: String, occurrence: Int = 0, setIndex: Int, set: LoggedSet) {
        self.init(
            exerciseID: exerciseID,
            occurrence: occurrence,
            setIndex: setIndex,
            weightKg: set.weightKg ?? 0,
            reps: set.reps,
            rirReported: set.rirReported,
            pausedReps: set.pausedReps,
            partialReps: set.partialReps,
            pauseEnabled: set.modifiers.pauseEnabled,
            pauseSeconds: set.modifiers.pauseSeconds
        )
    }

    /// A stored set is a logged set: history holds what was performed, so a
    /// correction may change what a set says and never whether it happened.
    /// Removing a set is a deletion, which this operation deliberately is not.
    public var isLogged: Bool { weightKg > 0 && reps > 0 }

    /// The corrected values laid over the set as stored, in the same shapes
    /// the app writes a set with. Keys neither client's set model owns are
    /// left untouched; `rir` and `partialReps` are removed when the
    /// correction clears them, because absent is how both clients read "none".
    public func applied(to stored: [String: JSONValue]) -> [String: JSONValue] {
        var object = stored
        object["weight"] = .string("\(weightKg)")
        object["reps"] = .string("\(reps)")
        object["pausedReps"] = .string(pausedReps.map { "\($0)" } ?? "")
        object["pauseSeconds"] = .string(pauseSeconds.map { "\(Int($0))" } ?? "")
        object["pauseEnabled"] = .bool(pauseEnabled)
        if let rirReported {
            object["rir"] = .number(Decimal(rirReported))
        } else {
            object.removeValue(forKey: "rir")
        }
        if let partialReps, partialReps > 0 {
            object["partialReps"] = .number(Decimal(partialReps))
        } else {
            object.removeValue(forKey: "partialReps")
        }
        return object
    }
}
