import Foundation

/// Artboard 20 · segment Historiek, row shape from the ≥1024 layout (27):
/// `Push A · 7 sep` / `18/18 · 53 min` / `6.480 kg`.
///
/// A row states only what the session stored. Sessions logged before set
/// counts were recorded keep their percentage, and a session with no recorded
/// duration says nothing about time rather than inventing one.
public struct SessionHistoryRow: Equatable, Sendable, Identifiable {

    public struct Counts: Equatable, Sendable {
        public let completed: Int
        public let planned: Int

        public init(completed: Int, planned: Int) {
            self.completed = completed
            self.planned = planned
        }
    }

    public let id: String
    public let date: Date
    public let dayLabel: String
    public let volumeKg: Decimal
    /// Prescribed working sets, when the session recorded them.
    public let counts: Counts?
    /// What older sessions carry instead: the percentage as it was stored.
    public let completionPercent: Int?
    /// `nil` when the session never recorded one.
    public let durationSeconds: Int?

    public init(
        id: String,
        date: Date,
        dayLabel: String,
        volumeKg: Decimal,
        counts: Counts?,
        completionPercent: Int?,
        durationSeconds: Int?
    ) {
        self.id = id
        self.date = date
        self.dayLabel = dayLabel
        self.volumeKg = volumeKg
        self.counts = counts
        self.completionPercent = completionPercent
        self.durationSeconds = durationSeconds
    }
}

public enum SessionHistory {

    /// Every workout this account holds, newest first.
    ///
    /// Recovery days are not workouts and stay out of this list; they have
    /// their own place in the design.
    public static func rows(from sessions: [TrainingSession]) -> [SessionHistoryRow] {
        sessions
            .filter { $0.kind == .workout }
            .sorted { $0.date > $1.date }
            .map { session in
                SessionHistoryRow(
                    id: session.id,
                    date: session.date,
                    dayLabel: session.dayLabel,
                    volumeKg: RecordsEngine.volumeLoad(session.results.flatMap(\.sets)),
                    counts: counts(of: session),
                    completionPercent: counts(of: session) == nil ? session.completion : nil,
                    durationSeconds: session.durationSeconds.flatMap { $0 > 0 ? $0 : nil }
                )
            }
    }

    /// Both numbers, or neither: half a fraction says nothing.
    static func counts(of session: TrainingSession) -> SessionHistoryRow.Counts? {
        guard let planned = session.plannedSetCount,
              let completed = session.completedSetCount,
              planned > 0,
              (0...planned).contains(completed)
        else { return nil }
        return SessionHistoryRow.Counts(completed: completed, planned: planned)
    }
}
