import Foundation
@testable import SetlineCore

enum Fixtures {
    /// Locates the repository root by walking up from this file.
    static var repoRoot: URL? {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<8 {
            url = url.deletingLastPathComponent()
            if FileManager.default.fileExists(atPath: url.appendingPathComponent("TRAINING_LOGIC.md").path) {
                return url
            }
        }
        return nil
    }

    /// The real export, read in place.
    ///
    /// `PRIVATE-DATA/` is git-ignored and must never be copied into source or
    /// test resources (HANDOVER.md guardrail 4), so the round-trip test reads
    /// it from the checkout and skips itself when it is not there.
    static var backupData: Data? {
        guard let root = repoRoot else { return nil }
        let url = root.appendingPathComponent("PRIVATE-DATA/yascha-training-backup.json")
        return try? Data(contentsOf: url)
    }

    static func session(
        id: String,
        daysAgo: Int,
        exerciseID: String,
        sets: [(weight: Decimal, reps: Int, rir: Int?)]
    ) -> TrainingSession {
        let date = Calendar(identifier: .gregorian)
            .date(byAdding: .day, value: -daysAgo, to: Date())!
        let logged = sets.enumerated().map { index, entry in
            LoggedSet(index: index, weightKg: entry.weight, reps: entry.reps, rirReported: entry.rir)
        }
        return TrainingSession(
            id: id,
            date: date,
            dayID: "push",
            dayLabel: "Push",
            completion: 100,
            results: [ExerciseResult(exerciseID: exerciseID, name: exerciseID, sets: logged)]
        )
    }
}
