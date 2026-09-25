import XCTest
@testable import SetlineCore

/// Artboards 40a–40e: choosing an exercise, and what the estimate beside its
/// name is allowed to claim.
final class ExercisePickerTests: XCTestCase {

    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Brussels")!
        calendar.firstWeekday = 2
        return calendar
    }()

    private func date(_ day: Int, month: Int = 9) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: 18))!
    }

    private func session(
        _ day: Int,
        _ results: [(id: String, name: String, weightKg: Decimal, reps: Int)],
        label: String = "Push"
    ) -> TrainingSession {
        TrainingSession(
            id: "s-\(day)",
            date: date(day),
            dayID: "push",
            dayLabel: label,
            completion: 100,
            results: results.map { result in
                ExerciseResult(
                    exerciseID: result.id,
                    name: result.name,
                    sets: [LoggedSet(index: 0, weightKg: result.weightKg, reps: result.reps)]
                )
            }
        )
    }

    // MARK: - The six groups

    func testEveryMuscleBelongsToOneOfTheSixGroups() {
        for muscle in Muscle.allCases {
            XCTAssertNotNil(MuscleGroup.of(muscle), "\(muscle) has nowhere to go")
        }
        XCTAssertEqual(MuscleGroup.of(.chestMid), .borst)
        XCTAssertEqual(MuscleGroup.of(.lat), .rug)
        XCTAssertEqual(MuscleGroup.of(.sideDelt), .schouders)
        XCTAssertEqual(MuscleGroup.of(.biceps), .armen)
        XCTAssertEqual(MuscleGroup.of(.quad), .benen)
        XCTAssertEqual(MuscleGroup.of(.obliques), .core)
    }

    func testAnExerciseIsFiledUnderTheMuscleItLoadsMost() throws {
        let bench = try XCTUnwrap(ExerciseCatalog.exercise("flat-bench"))
        XCTAssertEqual(bench.group, .borst)
        let squat = try XCTUnwrap(ExerciseCatalog.exercise("hack-squat"))
        XCTAssertEqual(squat.group, .benen)
    }

    func testTheCatalogueIsOfferedWholeAndTheGroupsAddUpToIt() {
        let rows = ExercisePicker.rows(sessions: [])
        XCTAssertEqual(rows.count, ExercisePicker.offered().count)
        XCTAssertEqual(
            ExercisePicker.groups(in: rows).reduce(0) { $0 + $1.count },
            rows.count,
            "every offered exercise sits in exactly one group"
        )
        XCTAssertEqual(ExercisePicker.groups(in: rows).map(\.group), MuscleGroup.allCases)
    }

    // MARK: - 40b/40c/40d · what a row says

    func testARowCarriesTheHeaviestSetOfTheLastSessionItWasIn() throws {
        let sessions = [
            session(4, [(id: "flat-bench", name: "Bankdrukken", weightKg: 95, reps: 8)]),
            session(18, [(id: "flat-bench", name: "Bankdrukken", weightKg: 100, reps: 8)]),
        ]
        let row = try XCTUnwrap(ExercisePicker.rows(sessions: sessions).first { $0.exerciseID == "flat-bench" })
        XCTAssertEqual(row.lastTrained, date(18), "the last time, not the first")
        XCTAssertEqual(row.topSetKg, 100)
        XCTAssertEqual(row.topSetReps, 8)
        XCTAssertTrue(row.hasHistory)
    }

    func testAnExerciseWithNothingLoggedIsStillOffered() throws {
        let rows = ExercisePicker.rows(sessions: [])
        let row = try XCTUnwrap(rows.first { $0.exerciseID == "flat-bench" })
        XCTAssertFalse(row.hasHistory)
        XCTAssertNil(row.lastTrained)
        XCTAssertNil(row.topSetKg)
    }

    func testAGroupPutsWhatYouHaveTrainedFirstAndKeepsTheRest() {
        let sessions = [session(18, [(id: "flat-bench", name: "Bankdrukken", weightKg: 100, reps: 8)])]
        let rows = ExercisePicker.rows(sessions: sessions)
        let chest = ExercisePicker.rows(in: .borst, of: rows)

        XCTAssertEqual(chest.first?.exerciseID, "flat-bench")
        XCTAssertTrue(chest.count > 1, "the group is not only what was trained")
        XCTAssertEqual(
            chest.filter(\.hasHistory).count, 1,
            "one with history, and it comes first"
        )
        let names = chest.dropFirst().map(\.name)
        XCTAssertEqual(names, names.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending })
    }

    func testTheGroupsLineCountsWhatIsThereAndWhatWasLogged() {
        let sessions = [session(18, [(id: "flat-bench", name: "Bankdrukken", weightKg: 100, reps: 8)])]
        let rows = ExercisePicker.rows(sessions: sessions)
        let total = rows.filter { $0.group == .borst }.count
        XCTAssertEqual(ExercisePicker.summary(of: .borst, in: rows), "\(total) oefeningen · 1 met historiek")
        XCTAssertEqual(
            ExercisePicker.summary(of: .core, in: rows),
            "\(rows.filter { $0.group == .core }.count) oefeningen · nog niets gelogd"
        )
    }

    // MARK: - 40b · favourites, and 40c without them

    func testStarredExercisesComeFirstMostRecentlyTrainedFirst() {
        let sessions = [
            session(4, [(id: "hack-squat", name: "Hack squat", weightKg: 120, reps: 5)]),
            session(18, [(id: "flat-bench", name: "Bankdrukken", weightKg: 100, reps: 8)]),
        ]
        let rows = ExercisePicker.rows(sessions: sessions, favorites: ["hack-squat", "flat-bench"])
        XCTAssertEqual(ExercisePicker.favorites(in: rows).map(\.exerciseID), ["flat-bench", "hack-squat"])
    }

    func testWithoutFavouritesTheSamePlaceHoldsWhatWasTrainedLast() {
        let sessions = [
            session(4, [(id: "hack-squat", name: "Hack squat", weightKg: 120, reps: 5)]),
            session(18, [(id: "flat-bench", name: "Bankdrukken", weightKg: 100, reps: 8)]),
        ]
        let rows = ExercisePicker.rows(sessions: sessions)
        XCTAssertTrue(ExercisePicker.favorites(in: rows).isEmpty)
        XCTAssertEqual(ExercisePicker.recent(in: rows).map(\.exerciseID), ["flat-bench", "hack-squat"])
    }

    func testRecentOffersNothingBeforeAnythingIsLogged() {
        XCTAssertTrue(ExercisePicker.recent(in: ExercisePicker.rows(sessions: [])).isEmpty)
    }

    func testSearchMatchesAnywhereInTheNameAndPrefersWhatItStartsWith() {
        let rows = ExercisePicker.rows(sessions: [])
        let found = ExercisePicker.search("bench", in: rows)
        XCTAssertFalse(found.isEmpty)
        XCTAssertTrue(found.allSatisfy { $0.name.localizedCaseInsensitiveContains("bench") })

        let dips = ExercisePicker.search("Dips", in: rows)
        XCTAssertEqual(dips.first?.name, "Dips")
        XCTAssertTrue(ExercisePicker.search("   ", in: rows).isEmpty, "a blank query asks nothing")
    }

    // MARK: - A star is one exercise, written by itself

    func testStarringWritesOnlyThatExerciseAndKeepsTheOthers() throws {
        var state = LegacyState(raw: [
            LegacyAdapter.favoriteExercisesKey: .array([.string("hack-squat")]),
            "sessions": .array([]),
        ])
        state = StateMerge.apply(
            [StateChange(.setFavoriteExercise(exerciseID: "flat-bench", isFavorite: true))],
            to: state
        )
        XCTAssertEqual(LegacyAdapter.favoriteExercises(from: state), ["hack-squat", "flat-bench"])

        state = StateMerge.apply(
            [StateChange(.setFavoriteExercise(exerciseID: "hack-squat", isFavorite: false))],
            to: state
        )
        XCTAssertEqual(LegacyAdapter.favoriteExercises(from: state), ["flat-bench"], "one star off, the other kept")
    }

    func testAStarSurvivesBeingWrittenAndReadBack() throws {
        let change = StateChange(.setFavoriteExercise(exerciseID: "flat-bench", isFavorite: true))
        let data = try JSONEncoder().encode(change)
        let read = try JSONDecoder().decode(StateChange.self, from: data)
        XCTAssertEqual(read.kind, change.kind)
    }

    // MARK: - 40a/40e · what the estimate says

    func testTheEstimateNamesTheSetItWasComputedFrom() throws {
        let sessions = [
            session(4, [(id: "flat-bench", name: "Bankdrukken", weightKg: 95, reps: 8)]),
            session(11, [(id: "flat-bench", name: "Bankdrukken", weightKg: 100, reps: 8)]),
            session(18, [(id: "flat-bench", name: "Bankdrukken", weightKg: 100, reps: 8)]),
        ]
        let progress = StrengthProgress.make(exerciseID: "flat-bench", name: "Bankdrukken", sessions: sessions, calendar: calendar)
        let source = try XCTUnwrap(progress.source)
        XCTAssertEqual(source.date, date(18), "the set behind the estimate on screen")
        XCTAssertEqual(source.weightKg, 100)
        XCTAssertEqual(source.reps, 8)
    }

    func testTheChangeNamesTheDateItIsMeasuredFromAndWhatWasEstimatedThere() throws {
        let sessions = [
            session(4, [(id: "flat-bench", name: "Bankdrukken", weightKg: 95, reps: 8)]),
            session(18, [(id: "flat-bench", name: "Bankdrukken", weightKg: 100, reps: 8)]),
        ]
        let progress = StrengthProgress.make(exerciseID: "flat-bench", name: "Bankdrukken", sessions: sessions, calendar: calendar)
        let change = try XCTUnwrap(progress.change)
        XCTAssertEqual(change.since, date(4), "40a says 'sinds 4 sep', not 'in 2 weken'")
        XCTAssertEqual(change.baseline, StrengthProgress.bestEstimate(in: [LoggedSet(index: 0, weightKg: 95, reps: 8)]))
        XCTAssertEqual(change.weeks, 2, "the span is still counted")
    }

    func testTheChangeOnScreenIsTheDifferenceBetweenTheTwoNumbersOnScreen() throws {
        let sessions = [
            session(4, [(id: "flat-bench", name: "Bankdrukken", weightKg: 95, reps: 8)]),
            session(18, [(id: "flat-bench", name: "Bankdrukken", weightKg: 100, reps: 8)]),
        ]
        let progress = StrengthProgress.make(exerciseID: "flat-bench", name: "Bankdrukken", sessions: sessions, calendar: calendar)
        let now = Estimates.round(try XCTUnwrap(progress.estimate), toIncrement: 0.5)
        let then = Estimates.round(try XCTUnwrap(progress.change).baseline, toIncrement: 0.5)

        // 40e prints all three: the sum has to work on screen.
        XCTAssertEqual(try XCTUnwrap(progress.shownChange()), now - then)
    }

    func testAnExerciseWithoutHistoryHasNothingToExplain() {
        let progress = StrengthProgress.make(exerciseID: "flat-bench", name: "Bankdrukken", sessions: [], calendar: calendar)
        XCTAssertNil(progress.estimate)
        XCTAssertNil(progress.source)
        XCTAssertNil(progress.change)
        XCTAssertNil(progress.shownChange())
        XCTAssertTrue(progress.rows.isEmpty)
    }

    // MARK: - Reading the picker changes nothing

    func testBuildingThePickerNeverWritesToTheAccount() {
        let sessions = [session(18, [(id: "flat-bench", name: "Bankdrukken", weightKg: 100, reps: 8)])]
        let state = LegacyState(raw: [
            "sessions": .array(sessions.map { JSONValue(session: $0) }),
            LegacyAdapter.favoriteExercisesKey: .array([.string("hack-squat")]),
        ])
        let before = state.raw

        let rows = ExercisePicker.rows(sessions: sessions, favorites: LegacyAdapter.favoriteExercises(from: state))
        _ = ExercisePicker.favorites(in: rows)
        _ = ExercisePicker.recent(in: rows)
        _ = ExercisePicker.groups(in: rows)
        for group in MuscleGroup.allCases {
            _ = ExercisePicker.rows(in: group, of: rows)
            _ = ExercisePicker.summary(of: group, in: rows)
        }
        _ = ExercisePicker.search("bench", in: rows)

        XCTAssertEqual(state.raw, before, "looking for an exercise is reading")
    }
}
