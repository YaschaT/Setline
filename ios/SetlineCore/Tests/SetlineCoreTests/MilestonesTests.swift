import XCTest
@testable import SetlineCore

final class MilestonesTests: XCTestCase {
    private func session(_ day: Int, weight: Decimal, reps: Int = 5) -> TrainingSession {
        TrainingSession(id: "s\(day)", date: Date(timeIntervalSince1970: Double(day) * 86_400), dayID: "push", dayLabel: "Push",
                        completion: 100, results: [ExerciseResult(exerciseID: "bench", name: "Bench", sets: [LoggedSet(index: 0, weightKg: weight, reps: reps)])])
    }

    func testSessionMarksCarryTheDateOfTheNthWorkout() throws {
        let sessions = (1...10).map { session($0, weight: 50) }
        let list = Milestones.make(sessions: sessions, bestStreak: 0)
        let first = try XCTUnwrap(list.first { $0.id == "sessions-1" })
        let ten = try XCTUnwrap(list.first { $0.id == "sessions-10" })
        let twentyFive = try XCTUnwrap(list.first { $0.id == "sessions-25" })
        XCTAssertEqual(first.reachedOn, sessions[0].date)
        XCTAssertEqual(ten.reachedOn, sessions[9].date)
        XCTAssertNil(twentyFive.reachedOn)
        XCTAssertEqual(twentyFive.fraction, 0.4, accuracy: 0.001)
    }

    func testHeaviestSetIsDatedByTheSessionThatFirstHitIt() throws {
        let list = Milestones.make(sessions: [session(1, weight: 90), session(2, weight: 102.5)], bestStreak: 0)
        XCTAssertEqual(list.first { $0.id == "heaviest-80" }?.reachedOn, session(1, weight: 90).date)
        XCTAssertEqual(list.first { $0.id == "heaviest-100" }?.reachedOn, session(2, weight: 0).date)
        XCTAssertNil(list.first { $0.id == "heaviest-120" }?.reachedOn)
    }

    func testVolumeAddsUpAcrossSessions() throws {
        // 200 kg × 5 = 1 t per session; ten sessions = 10 t.
        let sessions = (1...10).map { session($0, weight: 200) }
        let ten = try XCTUnwrap(Milestones.make(sessions: sessions, bestStreak: 0).first { $0.id == "volume-10" })
        XCTAssertEqual(ten.reachedOn, sessions[9].date)
    }

    func testReachedSinceFindsWhatIsNew() {
        let sessions = (1...10).map { session($0, weight: 50) }
        let list = Milestones.make(sessions: sessions, bestStreak: 0)
        let new = Milestones.reached(in: list, since: sessions[9].date)
        XCTAssertEqual(new.map(\.id), ["sessions-10"])
    }
}
