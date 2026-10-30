import XCTest
@testable import SetlineCore

/// Correcting a set that was logged days ago.
///
/// Two things have to hold at once: the stored state must change in exactly
/// one place, and everything the app computes from sessions — volume, records,
/// the estimate, the next proposal — must read the corrected number without
/// anything being patched by hand.
final class SessionCorrectionTests: XCTestCase {

    // MARK: - Building a stored account

    private func storedSet(
        weight: String,
        reps: String,
        rir: Int? = nil,
        extra: [String: JSONValue] = [:]
    ) -> JSONValue {
        var object: [String: JSONValue] = [
            "weight": .string(weight),
            "reps": .string(reps),
            "pausedReps": .string(""),
            "pauseSeconds": .string(""),
            "pauseEnabled": .bool(false),
        ]
        if let rir { object["rir"] = .number(Decimal(rir)) }
        for (key, value) in extra { object[key] = value }
        return .object(object)
    }

    /// A stored account with two sessions, carrying keys iOS does not model at
    /// session, result and set level.
    private func account() -> LegacyState {
        let older: JSONValue = .object([
            "id": .string("s-1"),
            "date": .string("2026-09-05T17:00:00.000Z"),
            "dayId": .string("push"),
            "dayLabel": .string("Push"),
            "completion": .number(100),
            "results": .array([
                .object([
                    "exerciseId": .string("flat-bench"),
                    "name": .string("Flat bench press"),
                    "sets": .array([storedSet(weight: "100", reps: "6", rir: 2)]),
                ]),
            ]),
        ])
        let newer: JSONValue = .object([
            "id": .string("s-2"),
            "date": .string("2026-09-12T17:00:00.000Z"),
            "dayId": .string("push"),
            "dayLabel": .string("Push"),
            "completion": .number(100),
            "webOnlySessionKey": .string("keep me"),
            "results": .array([
                .object([
                    "exerciseId": .string("flat-bench"),
                    "name": .string("Flat bench press"),
                    "webOnlyResultKey": .string("keep me"),
                    "sets": .array([
                        storedSet(weight: "100", reps: "6", rir: 2),
                        storedSet(weight: "105", reps: "6", rir: 1, extra: ["webOnlySetKey": .number(7)]),
                        storedSet(weight: "100", reps: "5"),
                    ]),
                ]),
                .object([
                    "exerciseId": .string("incline-bench"),
                    "name": .string("Incline bench press"),
                    "sets": .array([storedSet(weight: "70", reps: "8", rir: 2)]),
                ]),
            ]),
        ])
        return LegacyState(raw: [
            "sessions": .array([newer, older]),
            "metrics": .array([.object(["id": .string("m-1"), "date": .string("2026-09-12"), "weight": .number(82)])]),
            "nutritionEntries": .array([.object(["id": .string("n-1"), "name": .string("Kwark")])]),
            "planMode": .string("personal"),
        ])
    }

    private func correction(
        weight: Decimal = 102.5,
        reps: Int = 5,
        rir: Int? = 1,
        setIndex: Int = 1,
        exerciseID: String = "flat-bench",
        occurrence: Int = 0
    ) -> SetCorrection {
        SetCorrection(
            exerciseID: exerciseID,
            occurrence: occurrence,
            setIndex: setIndex,
            weightKg: weight,
            reps: reps,
            rirReported: rir
        )
    }

    private func apply(_ corrections: [SetCorrection], to state: LegacyState, sessionID: String = "s-2") -> LegacyState {
        StateMerge.apply([.correct(sessionID: sessionID, corrections)], to: state)
    }

    private func sets(in state: LegacyState, session: String, result: Int = 0) -> [JSONValue] {
        let sessions = state.raw["sessions"]?.arrayValue ?? []
        let match = sessions.first { $0["id"]?.stringValue == session }
        return match?["results"]?.arrayValue?[result]["sets"]?.arrayValue ?? []
    }

    // MARK: - Reach

    func testACorrectionReachesOnlyTheSetItNames() {
        let before = account()
        let after = apply([correction()], to: before)

        let corrected = sets(in: after, session: "s-2")[1]
        XCTAssertEqual(corrected["weight"]?.stringValue, "102.5")
        XCTAssertEqual(corrected["reps"]?.stringValue, "5")
        XCTAssertEqual(corrected["rir"]?.intValue, 1)
        XCTAssertEqual(corrected["webOnlySetKey"]?.intValue, 7, "a key iOS does not model survives the correction")

        let untouched = sets(in: before, session: "s-2")
        XCTAssertEqual(sets(in: after, session: "s-2")[0], untouched[0], "the set before it")
        XCTAssertEqual(sets(in: after, session: "s-2")[2], untouched[2], "the set after it")
        XCTAssertEqual(
            sets(in: after, session: "s-2", result: 1),
            sets(in: before, session: "s-2", result: 1),
            "the other exercise in the same session"
        )
    }

    func testEverythingElseInTheAccountIsLeftAsStored() {
        let before = account()
        let after = apply([correction()], to: before)

        let session = (after.raw["sessions"]?.arrayValue ?? []).first { $0["id"]?.stringValue == "s-2" }
        XCTAssertEqual(session?["webOnlySessionKey"]?.stringValue, "keep me")
        XCTAssertEqual(session?["results"]?.arrayValue?[0]["webOnlyResultKey"]?.stringValue, "keep me")
        XCTAssertEqual(session?["completion"]?.intValue, 100, "the stored counts describe the same sets as before")

        let sessionsBefore = before.raw["sessions"]?.arrayValue ?? []
        let sessionsAfter = after.raw["sessions"]?.arrayValue ?? []
        XCTAssertEqual(sessionsAfter.count, sessionsBefore.count, "no session was added or dropped")
        XCTAssertEqual(
            sessionsAfter.first { $0["id"]?.stringValue == "s-1" },
            sessionsBefore.first { $0["id"]?.stringValue == "s-1" },
            "the other session"
        )
        XCTAssertEqual(after.raw["metrics"], before.raw["metrics"])
        XCTAssertEqual(after.raw["nutritionEntries"], before.raw["nutritionEntries"])
        XCTAssertEqual(after.raw["planMode"], before.raw["planMode"])
        XCTAssertEqual(after.raw.keys.sorted(), before.raw.keys.sorted())
    }

    func testTheSecondResultForTheSameExerciseIsAddressable() {
        var raw = account().raw
        var sessions = raw["sessions"]?.arrayValue ?? []
        guard case .object(var newer) = sessions[0] else { return XCTFail("fixture") }
        var results = newer["results"]?.arrayValue ?? []
        results.append(.object([
            "exerciseId": .string("flat-bench"),
            "name": .string("Flat bench press"),
            "sets": .array([storedSet(weight: "90", reps: "10")]),
        ]))
        newer["results"] = .array(results)
        sessions[0] = .object(newer)
        raw["sessions"] = .array(sessions)

        let after = apply(
            [correction(weight: 92.5, reps: 10, rir: nil, setIndex: 0, occurrence: 1)],
            to: LegacyState(raw: raw)
        )
        XCTAssertEqual(sets(in: after, session: "s-2", result: 0)[0]["weight"]?.stringValue, "100", "the first result")
        XCTAssertEqual(sets(in: after, session: "s-2", result: 2)[0]["weight"]?.stringValue, "92.5", "the second one")
    }

    func testClearingRIRRemovesItRatherThanWritingZero() {
        let after = apply([correction(rir: nil)], to: account())
        let corrected = sets(in: after, session: "s-2")[1]
        XCTAssertNil(corrected["rir"], "absent is how both clients read 'no RIR'")
        XCTAssertEqual(LegacyAdapter.sessions(from: after).first?.results[0].sets[1].rirReported, nil)
    }

    // MARK: - What a correction refuses to do

    func testACorrectionNeverUnlogsASet() {
        let before = account()
        for attempt in [correction(weight: -1), correction(reps: 0)] {
            let after = apply([attempt], to: before)
            XCTAssertEqual(after.raw, before.raw, "a set may be corrected, never emptied")
        }
        // 0 kg is a set without weight (2026-10-30), not an empty one.
        XCTAssertNotEqual(apply([correction(weight: 0)], to: before).raw, before.raw, "a set may become one without weight")
    }

    func testACorrectionSkipsWhatIsNoLongerThere() {
        let before = account()
        let cases: [(String, StateChange)] = [
            ("a session that is not stored", .correct(sessionID: "s-404", [correction()])),
            ("an exercise the session does not hold", .correct(sessionID: "s-2", [correction(exerciseID: "squat")])),
            ("a set index past the end", .correct(sessionID: "s-2", [correction(setIndex: 9)])),
            ("an occurrence that does not exist", .correct(sessionID: "s-2", [correction(occurrence: 3)])),
        ]
        for (label, change) in cases {
            XCTAssertEqual(StateMerge.apply([change], to: before).raw, before.raw, label)
        }
    }

    func testADeletedSessionIsNotBroughtBackByACorrection() {
        var raw = account().raw
        raw["sessions"] = .array((raw["sessions"]?.arrayValue ?? []).filter { $0["id"]?.stringValue != "s-2" })
        raw[StateMerge.tombstonesKey] = .object([
            "sessions": .object(["s-2": .string("2026-09-13T08:00:00.000Z")]),
        ])
        let before = LegacyState(raw: raw)

        let after = apply([correction()], to: before)
        XCTAssertEqual(after.raw, before.raw)
        XCTAssertFalse(
            (after.raw["sessions"]?.arrayValue ?? []).contains { $0["id"]?.stringValue == "s-2" },
            "a correction is not a reason to resurrect a deleted session"
        )
    }

    // MARK: - Derived values

    /// The corrected number is the one every engine reads afterwards, because
    /// nothing derived is stored: volume, the record, the estimate and the
    /// next proposal are all computed from the sessions.
    func testDerivedValuesFollowACorrectedSet() throws {
        // Three comparable sessions give the engines their reference, and the
        // newest one holds a set typed as 105 that was really 102,5.
        var sessions: [JSONValue] = []
        for (index, day) in [26, 19, 12].enumerated() {
            sessions.append(.object([
                "id": .string("h-\(index)"),
                "date": .string("2026-08-\(day)T17:00:00.000Z"),
                "dayId": .string("push"),
                "dayLabel": .string("Push"),
                "completion": .number(100),
                "results": .array([
                    .object([
                        "exerciseId": .string("flat-bench"),
                        "name": .string("Flat bench press"),
                        "sets": .array([
                            storedSet(weight: "100", reps: "6", rir: 2),
                            storedSet(weight: "100", reps: "6", rir: 2),
                        ]),
                    ]),
                ]),
            ]))
        }
        sessions.insert(.object([
            "id": .string("h-latest"),
            "date": .string("2026-09-12T17:00:00.000Z"),
            "dayId": .string("push"),
            "dayLabel": .string("Push"),
            "completion": .number(100),
            "results": .array([
                .object([
                    "exerciseId": .string("flat-bench"),
                    "name": .string("Flat bench press"),
                    "sets": .array([
                        storedSet(weight: "105", reps: "6", rir: 1),
                        storedSet(weight: "100", reps: "6", rir: 1),
                    ]),
                ]),
            ]),
        ]), at: 0)
        let before = LegacyState(raw: ["sessions": .array(sessions)])

        func read(_ state: LegacyState) -> (volume: Decimal, estimate: Decimal?, heaviest: Decimal?, proposal: Decimal?) {
            let all = LegacyAdapter.sessions(from: state)
            let latest = try? XCTUnwrap(all.first { $0.id == "h-latest" })
            let progress = StrengthProgress.make(exerciseID: "flat-bench", name: "Flat bench press", sessions: all)
            let planned = PlannedExercise(
                exerciseID: "flat-bench",
                role: .primaryStrength,
                sets: [SetPrescription(repRange: 5...6, targetRIR: 1...2)]
            )
            let history = ExerciseHistory.build(exerciseID: "flat-bench", modifiers: .none, from: all)
            let proposal = ProgressionEngine.proposal(
                planned: planned,
                exercise: Exercise(id: "flat-bench", name: "Flat bench press", equipment: .barbell, isCompound: true),
                history: history
            )
            return (
                RecordsEngine.volumeLoad(latest?.results.flatMap(\.sets) ?? []),
                progress.estimate,
                history.appearances.first?.sets.compactMap(\.weightKg).max(),
                proposal.weightKg
            )
        }

        let was = read(before)
        XCTAssertEqual(was.volume, 105 * 6 + 100 * 6, "the mistyped set is in the volume")
        XCTAssertEqual(was.heaviest, 105, "and is what history calls the heaviest set")

        let after = apply([correction(weight: 102.5, reps: 6, rir: 1, setIndex: 0)], to: before, sessionID: "h-latest")
        let now = read(after)

        XCTAssertEqual(now.volume, 102.5 * 6 + 100 * 6, "volume recomputed from the corrected set")
        XCTAssertEqual(now.volume, was.volume - 15, "exactly the difference the correction makes")
        XCTAssertEqual(now.heaviest, 102.5, "history reads the corrected weight")
        XCTAssertNotEqual(now.estimate, was.estimate, "the estimated 1RM moved with it")
        let estimate = try XCTUnwrap(now.estimate)
        // The engine keeps the estimate exact; rounding onto half kilos is a
        // step the screen takes, not the history.
        XCTAssertEqual(
            estimate,
            try XCTUnwrap(Estimates.e1RM(weightKg: 102.5, reps: 6)),
            "and is what the estimate makes of the corrected set"
        )
        XCTAssertNotNil(now.proposal, "the next session is proposed from the corrected history")
        XCTAssertNotEqual(now.proposal, was.proposal, "which is not what the mistyped set proposed")
    }

    // MARK: - Carrying the change

    func testACorrectionRoundTripsThroughTheChangeLog() throws {
        let change = StateChange.correct(sessionID: "s-2", [correction(), correction(rir: nil, setIndex: 2)])
        let data = try StateChange.encoder.encode(change)
        let decoded = try StateChange.decoder.decode(StateChange.self, from: data)

        XCTAssertEqual(decoded.id, change.id)
        XCTAssertEqual(decoded.kind, change.kind)
        // `createdAt` survives to the second: the change log encodes ISO 8601
        // without fractional seconds, as every other change does.
        XCTAssertEqual(decoded.createdAt.timeIntervalSince1970, change.createdAt.timeIntervalSince1970, accuracy: 1)
        guard case .correctSessionSets(let sessionID, let corrections) = decoded.kind else {
            return XCTFail("decoded as \(decoded.kind)")
        }
        XCTAssertEqual(sessionID, "s-2")
        XCTAssertEqual(corrections.count, 2)
        XCTAssertEqual(corrections[0].weightKg, 102.5)
        XCTAssertNil(corrections[1].rirReported)

        // Applying the decoded change lands the same state as the original.
        XCTAssertEqual(
            StateMerge.apply([decoded], to: account()).raw,
            StateMerge.apply([change], to: account()).raw
        )
    }

    func testAQueuedCorrectionSaysWhatIsWaiting() {
        let rows = SyncQueue.rows(from: [.correct(sessionID: "s-2", [correction(), correction(setIndex: 2)])])
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.title, "Correction")
        XCTAssertEqual(rows.first?.detail, "2 sets in an earlier session")
    }
}
