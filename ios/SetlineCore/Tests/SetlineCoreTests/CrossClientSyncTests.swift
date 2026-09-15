import XCTest
@testable import SetlineCore

/// The iOS half of the cross-client sync contract.
///
/// `tests/fixtures/sync` holds scenarios in which the web app and iOS take
/// turns writing the same state. This test runs the iOS steps; the web steps
/// run in `tests/cloud-state.test.mjs`. Each step starts from the state the
/// previous step produced, so both clients are held to one timeline.
final class CrossClientSyncTests: XCTestCase {

    func testEverySharedFixtureIOSSteps() throws {
        guard let root = Fixtures.repoRoot else { throw XCTSkip("Repository root not found") }
        let directory = root.appendingPathComponent("tests/fixtures/sync")
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        XCTAssertGreaterThanOrEqual(files.count, 10, "the shared fixtures are present")

        var iosSteps = 0
        for file in files {
            let fixture = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: file))
            let name = fixture["name"]?.stringValue ?? file.lastPathComponent
            var state: JSONValue?

            for (index, step) in (fixture["steps"]?.arrayValue ?? []).enumerated() {
                let label = "\(file.lastPathComponent) step \(index + 1): \(name)"
                let expected = try XCTUnwrap(step["expected"], label)
                defer { state = expected }
                guard step["client"]?.stringValue == "ios" else { continue }

                let input = try XCTUnwrap((step["remote"] ?? state)?.objectValue, "\(label) has no input state")
                let now = try XCTUnwrap(step["now"]?.stringValue.flatMap(LegacyAdapter.isoDate), label)
                let changes = try (step["ops"]?.arrayValue ?? []).map { op in
                    try StateChange.decoder.decode(StateChange.self, from: JSONEncoder().encode(op))
                }

                let result = StateMerge.apply(changes, to: LegacyState(raw: input), now: now)
                XCTAssertEqual(JSONValue.object(result.raw), expected, label)
                iosSteps += 1
            }
        }
        XCTAssertGreaterThanOrEqual(iosSteps, 8, "the fixtures exercise iOS, not only the web")
    }

    /// After the web finishes a day iOS logged, iOS still reads every exercise
    /// it logged there — the swap, the program replacement and the custom
    /// exercise — with its sets exactly as written.
    func testIOSReadsItsOwnExercisesBackAfterTheWebFinishesTheDayAgain() throws {
        let state = try fixtureState("web-refinish-keeps-ios-exercises", afterStep: 2)
        let session = try XCTUnwrap(LegacyAdapter.sessions(from: state).first)

        XCTAssertEqual(
            session.results.map(\.exerciseID),
            ["flat-bench", "incline-bench", "pec-fly", "db-bench", "chest-press-machine", "custom:landmine-press"]
        )
        XCTAssertEqual(session.results[0].sets.map(\.weightKg), [102.5, 102.5], "bench press took the web's typed sets")
        XCTAssertEqual(session.results[3].sets.map(\.substitutedFrom), ["flat-bench", "flat-bench"], "the swap still says what it stood in for")
        XCTAssertEqual(session.results[3].sets.map(\.origin), [.prescribed, .sessionAdded], "and which of its sets was extra")
        XCTAssertEqual(session.results[4].sets.map(\.reps), [10, 9, 8], "the program replacement")
        XCTAssertEqual(session.results[5].sets.map(\.substitutedFrom), ["pec-fly", "pec-fly"], "the custom exercise")
        XCTAssertEqual(session.durationSeconds, 3120)
        XCTAssertNil(session.plannedSetCount, "the counts described the old results, so history shows the percentage")
        XCTAssertEqual(session.completion, 33)
    }

    func testAnExerciseRemovedOnTheWebStaysRemovedForIOS() throws {
        let state = try fixtureState("web-edit-removal-is-not-resurrected", afterStep: 3)
        let session = try XCTUnwrap(LegacyAdapter.sessions(from: state).first)
        XCTAssertEqual(session.results.map(\.exerciseID), ["flat-bench", "incline-bench"])
    }

    private func fixtureState(_ name: String, afterStep step: Int) throws -> LegacyState {
        guard let root = Fixtures.repoRoot else { throw XCTSkip("Repository root not found") }
        let url = root.appendingPathComponent("tests/fixtures/sync/\(name).json")
        let fixture = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
        let steps = try XCTUnwrap(fixture["steps"]?.arrayValue)
        return LegacyState(raw: try XCTUnwrap(steps[step - 1]["expected"]?.objectValue))
    }
}
