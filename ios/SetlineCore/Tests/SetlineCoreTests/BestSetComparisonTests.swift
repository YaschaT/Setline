import XCTest
@testable import SetlineCore

/// Best sets state a change only against an earlier set performed the same way.
///
/// Measured against an earlier paused best, a touch-and-go bench read as kilos
/// of progress that were only the pause coming off. The strongest set is still
/// the one shown; its change waits for a fair comparison, and a lift trained
/// before in another way is not "nieuw" either.
final class BestSetComparisonTests: XCTestCase {

    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Brussels")!
        return calendar
    }()

    /// The window opens on 1 August; July is before it, September inside it.
    private var since: Date { calendar.date(from: DateComponents(year: 2026, month: 8, day: 1))! }

    private func day(_ day: Int, month: Int) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: 18))!
    }

    /// `paused`: none is touch-and-go, all of the reps a paused set, fewer a
    /// mixed set — written the way this app writes each of them.
    private func set(_ weight: Decimal, _ reps: Int, paused: Int? = nil, seconds: Double = 2) -> LoggedSet {
        let pausing = (paused ?? 0) > 0
        return LoggedSet(
            index: 0,
            weightKg: weight,
            reps: reps,
            modifiers: SetModifiers(pauseEnabled: pausing, pauseSeconds: pausing ? seconds : nil),
            pausedReps: LoggedSet.pausedRepsWithin(paused, reps: reps)
        )
    }

    private func bench(_ date: Date, _ sets: [LoggedSet]) -> TrainingSession {
        TrainingSession(
            id: "bench-\(date.timeIntervalSince1970)", date: date, dayID: "upper", dayLabel: "Upper",
            completion: 100, kind: .workout,
            results: [ExerciseResult(exerciseID: "bench", name: "Bankdrukken", sets: sets)]
        )
    }

    private func best(_ sessions: [TrainingSession]) throws -> ProgressOverview.RecentBest {
        try XCTUnwrap(ProgressOverview.bestSets(in: sessions, since: since).first)
    }

    // MARK: - Like with like

    func testTouchAndGoIsComparedWithTouchAndGo() throws {
        // 100 × 5 estimates 112,5; 95 × 5 estimates 106,9.
        let row = try best([bench(day(1, month: 7), [set(95, 5)]), bench(day(10, month: 9), [set(100, 5)])])
        XCTAssertEqual(row.delta, 5.5)
        XCTAssertTrue(row.hasEarlierBest)

        // An earlier paused set, heavier still, is left out rather than winning
        // the comparison: against it this read 0.
        let alsoPaused = try best([
            bench(day(1, month: 7), [set(95, 5), set(100, 5, paused: 5)]),
            bench(day(10, month: 9), [set(100, 5)]),
        ])
        XCTAssertEqual(alsoPaused.delta, 5.5)
    }

    func testPausedIsComparedWithPaused() throws {
        let row = try best([
            bench(day(1, month: 7), [set(85, 5, paused: 5)]),
            bench(day(10, month: 9), [set(90, 5, paused: 5)]),
        ])
        XCTAssertEqual(row.delta, 5.5)
    }

    func testTouchAndGoIsNotComparedWithPaused() throws {
        // Against the paused 90 × 5 this read "+11,5 kg": the pause coming off.
        let row = try best([
            bench(day(1, month: 7), [set(90, 5, paused: 5)]),
            bench(day(10, month: 9), [set(100, 5)]),
        ])
        XCTAssertEqual(row.weightKg, 100, "the strongest set is still the one shown")
        XCTAssertNil(row.delta)
        XCTAssertTrue(row.hasEarlierBest, "trained before, only not this way: not new either")

        let reverse = try best([
            bench(day(1, month: 7), [set(100, 5)]),
            bench(day(10, month: 9), [set(90, 5, paused: 5)]),
        ])
        XCTAssertNil(reverse.delta)
    }

    func testAPauseOfAnotherLengthIsAnotherExecution() throws {
        let row = try best([
            bench(day(1, month: 7), [set(90, 5, paused: 5, seconds: 3)]),
            bench(day(10, month: 9), [set(92.5, 5, paused: 5, seconds: 2)]),
        ])
        XCTAssertNil(row.delta, "§9.2: the same pause length, ±0.5 s")
    }

    func testAMixedSetIsNotComparedWithAnyOtherExecution() throws {
        let earlier = bench(day(1, month: 7), [set(115, 6), set(110, 6, paused: 6), set(115, 6, paused: 4)])
        let row = try best([earlier, bench(day(10, month: 9), [set(120, 6, paused: 2)])])
        XCTAssertEqual(row.weightKg, 120, "shown as the set it was")
        XCTAssertNil(row.delta, "not against touch-and-go, a paused set, or four paused reps")
        XCTAssertTrue(row.hasEarlierBest)

        let sameMix = try best([
            bench(day(1, month: 7), [set(115, 6, paused: 2)]),
            bench(day(10, month: 9), [set(120, 6, paused: 2)]),
        ])
        XCTAssertEqual(sameMix.delta, 6, "two paused reps against two paused reps")
    }

    func testSixRepsWithTwoPausedStaySixReps() throws {
        let mixed = set(120, 6, paused: 2)
        XCTAssertEqual(mixed.reps, 6)
        XCTAssertEqual(mixed.execution, SetExecution(kind: .mixed, pausedReps: 2, pauseSeconds: 2))

        let shown = try best([bench(day(10, month: 9), [mixed])])
        XCTAssertEqual(shown.reps, 6, "the row says × 6, not × 8")

        // Read as eight reps, 110 × 6 would estimate 136,6 and outrank 115 × 6
        // at 133,5; as the six reps it was, it estimates 127,7.
        let ranked = try best([bench(day(10, month: 9), [set(110, 6, paused: 2), set(115, 6)])])
        XCTAssertEqual(ranked.weightKg, 115)
        XCTAssertEqual(ranked.reps, 6)
    }

    func testAnExerciseNewInTheWindowIsStillNew() throws {
        let row = try best([bench(day(10, month: 9), [set(100, 5)])])
        XCTAssertNil(row.delta)
        XCTAssertFalse(row.hasEarlierBest)
    }

    // MARK: - The same rule on both clients

    /// `tests/fixtures/best-set-comparison.json` is read by the web app too
    /// (`tests/set-reps.test.mjs`, `tests/setline-log.test.mjs`), through the
    /// same stored rows, so the rule cannot change on one side only.
    func testTheSharedFixtureReadsIdenticallyHereAndOnTheWeb() throws {
        guard let root = Fixtures.repoRoot else { throw XCTSkip("Repository root not found") }
        let url = root.appendingPathComponent("tests/fixtures/best-set-comparison.json")
        let fixture = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))

        let entries = try XCTUnwrap(fixture["sets"]?.arrayValue)
        let sets = try entries.enumerated().map { index, entry in
            try XCTUnwrap(LegacyAdapter.loggedSet(from: XCTUnwrap(entry["row"]), index: index))
        }
        for (index, entry) in entries.enumerated() {
            let expected = try XCTUnwrap(entry["expected"])
            let execution = sets[index].execution
            XCTAssertEqual(sets[index].reps, expected["reps"]?.intValue, "set \(index)")
            XCTAssertEqual(execution.kind.rawValue, expected["kind"]?.stringValue, "set \(index)")
            XCTAssertEqual(execution.pausedReps, expected["pausedReps"]?.intValue, "set \(index)")
            XCTAssertEqual(execution.pauseSeconds, expected["pauseSeconds"]?.doubleValue, "set \(index)")
        }
        for pair in try XCTUnwrap(fixture["comparable"]?.arrayValue) {
            let indices = try XCTUnwrap(pair["sets"]?.arrayValue?.compactMap(\.intValue))
            XCTAssertEqual(
                sets[indices[0]].execution.isComparable(to: sets[indices[1]].execution),
                pair["expected"]?.boolValue,
                pair["why"]?.stringValue ?? ""
            )
        }

        for item in try XCTUnwrap(fixture["cases"]?.arrayValue) {
            let name = item["name"]?.stringValue ?? "?"
            let sessions = try XCTUnwrap(item["sessions"]?.arrayValue).enumerated().map { index, value in
                let rows = try XCTUnwrap(value["sets"]?.arrayValue)
                return TrainingSession(
                    id: "\(name)-\(index)",
                    date: try XCTUnwrap(LegacyAdapter.isoDate(XCTUnwrap(value["date"]?.stringValue))),
                    dayID: "upper", dayLabel: "Upper", completion: 100, kind: .workout,
                    results: [ExerciseResult(
                        exerciseID: "bench", name: "Bankdrukken",
                        sets: rows.enumerated().compactMap { LegacyAdapter.loggedSet(from: $1, index: $0) }
                    )]
                )
            }
            let row = try XCTUnwrap(ProgressOverview.bestSets(in: sessions, since: since).first, name)
            let expected = try XCTUnwrap(item["expected"])
            XCTAssertEqual(row.weightKg, expected["weight"]?.decimalValue, name)
            XCTAssertEqual(row.reps, expected["reps"]?.intValue, name)
            XCTAssertEqual(row.delta, expected["delta"]?.decimalValue, name)
            XCTAssertEqual(row.hasEarlierBest, expected["hasEarlierBest"]?.boolValue, name)
        }
    }
}
