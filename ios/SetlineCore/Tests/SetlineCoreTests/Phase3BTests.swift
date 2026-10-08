import XCTest
@testable import SetlineCore

// MARK: - Reorder

final class ReorderPlannerTests: XCTestCase {

    private func item(_ id: String, _ role: ExerciseRole, started: Bool = false)
    -> (exercise: Exercise, role: ExerciseRole, hasStarted: Bool) {
        (ExerciseCatalog.exercise(id)!, role, started)
    }

    private let bench = ExerciseCatalog.exercise("flat-bench")!

    func testOffersTheNearestUnstartedLaterExercise() {
        let plan = ReorderPlanner.plan(
            current: bench, currentIndex: 0,
            later: [item("pec-fly", .isolation), item("pressdown", .isolation)]
        )
        XCTAssertEqual(plan?.candidate.id, "pec-fly")
        XCTAssertEqual(plan?.candidateIndex, 1)
    }

    func testSkipsExercisesAlreadyStarted() {
        let plan = ReorderPlanner.plan(
            current: bench, currentIndex: 0,
            later: [item("pec-fly", .isolation, started: true), item("pressdown", .isolation)]
        )
        XCTAssertEqual(plan?.candidate.id, "pressdown")
        XCTAssertEqual(plan?.candidateIndex, 2)
    }

    /// A heavy lift is not pulled out of the position it was programmed in.
    func testNeverPullsALaterPrimaryLiftForward() {
        let plan = ReorderPlanner.plan(
            current: bench, currentIndex: 0,
            later: [item("rdl", .primaryStrength), item("pressdown", .isolation)]
        )
        XCTAssertEqual(plan?.candidate.id, "pressdown")
    }

    func testNoPlanOnTheLastExercise() {
        XCTAssertNil(ReorderPlanner.plan(current: bench, currentIndex: 3, later: []))
    }

    func testNoPlanWhenEverythingLaterHasStarted() {
        let plan = ReorderPlanner.plan(
            current: bench, currentIndex: 0,
            later: [item("pec-fly", .isolation, started: true)]
        )
        XCTAssertNil(plan)
    }

    func testHeadlineNamesBothExercises() {
        let plan = ReorderPlanner.plan(
            current: bench, currentIndex: 0, later: [item("pec-fly", .isolation)]
        )
        XCTAssertEqual(plan?.headline, "Do pec fly machine now · come back to flat bench press later")
    }
}

// MARK: - Pain

final class PainFlagTests: XCTestCase {

    private func daysAgo(_ days: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: -days, to: Date())!
    }

    func testAFlagExpiresAfterFourteenDays() {
        let fresh = PainFlag(region: .shoulder, exerciseID: "flat-bench", date: daysAgo(3))
        let old = PainFlag(region: .shoulder, exerciseID: "flat-bench", date: daysAgo(15))
        XCTAssertTrue(fresh.isActive())
        XCTAssertFalse(old.isActive())
        XCTAssertEqual(fresh.daysRemaining(), 11)
        XCTAssertEqual(old.daysRemaining(), 0)
    }

    func testExpiredFlagsStopNarrowingTheRanking() {
        let old = [PainFlag(region: .lowerBack, exerciseID: "rdl", date: daysAgo(20))]
        XCTAssertTrue(old.activeLoadTags().isEmpty)
        let fresh = [PainFlag(region: .lowerBack, exerciseID: "rdl", date: daysAgo(1))]
        XCTAssertEqual(fresh.activeLoadTags(), [.axialSpinalLoad, .lumbarFlexion])
    }

    /// A region with no tag is still stored — it just does not filter.
    func testARegionWithoutTagsStillRecords() {
        let flags = [PainFlag(region: .hip, exerciseID: "rdl")]
        XCTAssertEqual(flags.active().count, 1)
        XCTAssertTrue(flags.activeLoadTags().isEmpty)
    }

    func testOnlyOneTimingEarnsTheFollowUpLine() {
        XCTAssertTrue(PainTiming.outsideTheGym.warrantsFollowUp)
        XCTAssertFalse(PainTiming.duringSet.warrantsFollowUp)
        XCTAssertFalse(PainTiming.afterTraining.warrantsFollowUp)
    }

    /// The whole point of the flow: a shoulder flag changes what is offered.
    func testAShoulderFlagChangesTheRecommendations() {
        let plain = SubstitutionRanker.rank(
            SwapContext(currentExerciseID: "flat-bench", role: .primaryStrength)
        ).map(\.exercise.id)
        let sore = SubstitutionRanker.rank(
            SwapContext(
                currentExerciseID: "flat-bench", role: .primaryStrength,
                reason: .discomfort,
                painfulLoadTags: [PainRegion.shoulder.loadTags].reduce(into: Set<LoadTag>()) { $0.formUnion($1) }
            )
        ).map(\.exercise.id)
        XCTAssertNotEqual(plain, sore)
        XCTAssertFalse(sore.contains("db-bench"), "db-bench loads end-range shoulder")
    }
}

// MARK: - Custom exercises and program replacements

final class CustomExerciseTests: XCTestCase {

    func testIdentifiersAreNamespacedAndSlugged() {
        XCTAssertEqual(CustomExercise(name: "Landmine press").id, "custom:landmine-press")
        XCTAssertEqual(CustomExercise(name: "  Zercher  squat!! ").id, "custom:zercher-squat")
        XCTAssertEqual(CustomExercise(name: "***").id, "custom:oefening")
    }

    /// A custom exercise must never land on a catalogue id and inherit a
    /// history that is not its own.
    func testACustomIdCanNeverCollideWithTheCatalogue() {
        for id in ExerciseCatalog.all.keys {
            XCTAssertFalse(CustomExercise.isCustom(id), "\(id) looks custom")
        }
        XCTAssertNil(ExerciseCatalog.exercise(CustomExercise(name: "Flat bench press").id))
    }

    func testACustomExerciseCarriesItsEquipmentIncrement() {
        let custom = CustomExercise(name: "Landmine press", equipment: .barbell, isCompound: true)
        XCTAssertEqual(custom.exercise.incrementKg, 2.5)
        XCTAssertTrue(custom.exercise.isCompound)
    }

    func testACustomExerciseHasNoRankingMetadata() {
        XCTAssertNil(CustomExercise(name: "Landmine press").exercise.attributes)
    }
}

final class ProgramReplacementTests: XCTestCase {

    private func replacement(_ scope: ReplacementScope) -> ProgramReplacement {
        ProgramReplacement(
            originExerciseID: "flat-bench", substituteExerciseID: "db-bench",
            scope: scope, dayID: "push-a"
        )
    }

    func testThisDayReachesOnlyItsOwnDay() {
        XCTAssertTrue(replacement(.thisDay).applies(toDay: "push-a"))
        XCTAssertFalse(replacement(.thisDay).applies(toDay: "push-b"))
    }

    func testWiderScopesReachEveryDay() {
        XCTAssertTrue(replacement(.thisPlan).applies(toDay: "push-b"))
        XCTAssertTrue(replacement(.always).applies(toDay: "anything"))
    }

    /// `substitutedFrom` means "standing in for something else today". A
    /// permanent replacement is not that, so the audit lives here instead —
    /// origin, substitute, how far it reached, and when.
    func testTheReplacementItselfIsTheAuditRecord() {
        let made = Date()
        let record = ProgramReplacement(
            originExerciseID: "flat-bench", substituteExerciseID: "db-bench",
            scope: .thisPlan, dayID: "push-a", date: made
        )
        XCTAssertEqual(record.originExerciseID, "flat-bench")
        XCTAssertEqual(record.substituteExerciseID, "db-bench")
        XCTAssertEqual(record.dayID, "push-a")
        XCTAssertEqual(record.date, made)
    }

    /// A record that has been through the state blob must still be findable.
    /// Identity is the change, not the instant — the date does not survive
    /// encoding intact, and matching on it made "undo" a silent no-op.
    func testARoundTrippedReplacementIsStillTheSameReplacement() {
        var state = LegacyState(raw: [:])
        let record = ProgramReplacement(
            originExerciseID: "flat-bench", substituteExerciseID: "db-bench",
            scope: .thisDay, dayID: "push-a"
        )
        LegacyAdapter.apply(programReplacements: [record], to: &state)
        let decoded = LegacyAdapter.programReplacements(from: state).first
        XCTAssertEqual(decoded?.id, record.id)
    }

    /// Undoing a program change is deleting one row: the plan is rewritten on
    /// read, so the original prescription was never destroyed.
    func testRemovingAReplacementLeavesNothingBehind() {
        var state = LegacyState(raw: [:])
        let record = ProgramReplacement(
            originExerciseID: "flat-bench", substituteExerciseID: "db-bench",
            scope: .always, dayID: "push-a"
        )
        LegacyAdapter.apply(programReplacements: [record], to: &state)
        XCTAssertEqual(LegacyAdapter.programReplacements(from: state).count, 1)

        let remaining = LegacyAdapter.programReplacements(from: state).filter { $0.id != record.id }
        LegacyAdapter.apply(programReplacements: remaining, to: &state)
        XCTAssertTrue(LegacyAdapter.programReplacements(from: state).isEmpty)
    }

    func testEveryScopeHasDistinctCopy() {
        let labels = ReplacementScope.allCases.map(\.label)
        XCTAssertEqual(Set(labels).count, labels.count)
        XCTAssertEqual(labels, ["This day only", "This plan", "Every time"])
    }
}

// MARK: - Match language

final class SubstitutionCopyTests: XCTestCase {

    private func alternative(
        score: Double, overlap: Double, match: StructuralMatch = .exact,
        fit: String? = nil, why: String? = nil
    ) -> RankedAlternative {
        RankedAlternative(
            exercise: ExerciseCatalog.exercise("db-bench")!,
            score: score, curatedFit: fit, curatedWhy: why,
            muscleOverlap: overlap, match: match, drivers: []
        )
    }

    /// "Strong match" is a claim, so it has to clear both bars.
    func testStrongMatchNeedsScoreAndOverlap() {
        XCTAssertEqual(SubstitutionCopy.fit(alternative(score: 0.90, overlap: 0.85)), "Strong match")
        XCTAssertNotEqual(SubstitutionCopy.fit(alternative(score: 0.90, overlap: 0.70)), "Strong match")
        XCTAssertNotEqual(SubstitutionCopy.fit(alternative(score: 0.60, overlap: 0.95)), "Strong match")
    }

    func testHonestLabelsStepDown() {
        XCTAssertEqual(SubstitutionCopy.fit(alternative(score: 0.70, overlap: 0.70)), "Good match")
        XCTAssertEqual(SubstitutionCopy.fit(alternative(score: 0.50, overlap: 0.45)), "Partly similar")
        XCTAssertEqual(SubstitutionCopy.fit(alternative(score: 0.90, overlap: 0.90, match: .related)), "Different movement")
        XCTAssertEqual(SubstitutionCopy.fit(alternative(score: 0.90, overlap: 0.90, match: .broader)), "Different setup")
    }

    func testCuratedCopyAlwaysWins() {
        let curated = alternative(score: 0.30, overlap: 0.20, fit: "Zelfde rol", why: "Handgeschreven.")
        XCTAssertEqual(SubstitutionCopy.fit(curated), "Zelfde rol")
        XCTAssertEqual(
            SubstitutionCopy.why(curated, origin: ExerciseCatalog.exercise("flat-bench")!),
            "Handgeschreven."
        )
    }

    /// Three equally strong alternatives used to read identically, which told
    /// the user nothing about how to choose between them.
    func testEquallyStrongAlternativesAreStillDistinguishable() {
        let origin = ExerciseCatalog.exercise("wide-row")!
        let results = SubstitutionRanker.rank(
            SwapContext(currentExerciseID: "wide-row", role: .secondaryCompound)
        )
        let lines = results.map { SubstitutionCopy.why($0, origin: origin, alongside: results) }
        XCTAssertEqual(lines.count, 3)
        XCTAssertEqual(Set(lines).count, lines.count, "identical copy: \(lines)")
    }

    /// Every recommendation says something, and no line claims a difference
    /// the app cannot actually see: where two alternatives are identical on
    /// every attribute we record, both fall back to the plain line rather
    /// than carrying the same distinguishing phrase.
    func testNoLineClaimsADifferenceThatIsNotThere() {
        let plain = "Trains the same muscles in the same movement."
        for id in ExerciseCatalog.all.keys {
            guard let origin = ExerciseCatalog.exercise(id) else { continue }
            let results = SubstitutionRanker.rank(
                SwapContext(currentExerciseID: id, role: ExerciseCatalog.role(id))
            )
            let lines = results.map { SubstitutionCopy.why($0, origin: origin, alongside: results) }
            XCTAssertTrue(lines.allSatisfy { !$0.isEmpty }, "\(id) produced an empty line")
            let claiming = lines.filter { $0 != plain }
            XCTAssertEqual(
                Set(claiming).count, claiming.count,
                "\(id) gives two alternatives the same distinguishing phrase: \(lines)"
            )
        }
    }

    /// No result anywhere may promise a converted weight.
    func testNoCopyPromisesAWeight() {
        XCTAssertEqual(SubstitutionCopy.carryOver, "Sets, reps and RIR stay · weight resets")
        let bench = ExerciseCatalog.exercise("flat-bench")!
        for id in ExerciseCatalog.all.keys {
            for result in SubstitutionRanker.rank(
                SwapContext(currentExerciseID: id, role: ExerciseCatalog.role(id))
            ) {
                let line = SubstitutionCopy.why(result, origin: bench)
                XCTAssertFalse(line.contains("kg"), "\(id) → \(result.exercise.id): \(line)")
                XCTAssertFalse(SubstitutionCopy.fit(result).isEmpty)
            }
        }
    }
}

// MARK: - Browse surface

final class BrowseSurfaceTests: XCTestCase {

    private func browse(_ id: String, reason: SwapReason = .preference, pain: Set<LoadTag> = []) -> [RankedAlternative] {
        SubstitutionRanker.browse(
            SwapContext(
                currentExerciseID: id, role: ExerciseCatalog.role(id),
                reason: reason, painfulLoadTags: pain
            )
        )
    }

    func testBrowseIsASupersetOfTheRecommendations() {
        for id in ExerciseCatalog.all.keys {
            let primary = Set(
                SubstitutionRanker.rank(SwapContext(currentExerciseID: id, role: ExerciseCatalog.role(id)))
                    .map(\.exercise.id)
            )
            let all = Set(browse(id).map(\.exercise.id))
            XCTAssertTrue(all.isSuperset(of: primary), "\(id) browse lost a recommendation")
        }
    }

    /// The compounds the primary surface refuses are exactly what browse is
    /// for — labelled as changing the training intent, not hidden among real
    /// substitutes.
    func testBrowseSurfacesTheCompoundsThePrimaryListRefuses() {
        let options = browse("leg-extension")
        XCTAssertFalse(options.isEmpty, "leg-extension has nothing to browse")
        XCTAssertTrue(options.contains { $0.exercise.id == "hack-squat" })
        XCTAssertTrue(options.allSatisfy { $0.match == .broader })
    }

    func testBrowseOrdersExactThenRelatedThenBroader() {
        for id in ExerciseCatalog.all.keys {
            let tiers = browse(id).map(\.match)
            let rank = [StructuralMatch.exact: 0, .related: 1, .broader: 2]
            XCTAssertEqual(
                tiers.map { rank[$0]! }, tiers.map { rank[$0]! }.sorted(),
                "\(id) interleaves browse tiers"
            )
        }
    }

    /// Widening the list must never widen the safety filter.
    func testBrowseNeverRelaxesPain() {
        let sore = browse("rdl", reason: .discomfort, pain: [.axialSpinalLoad, .lumbarFlexion])
        for option in sore {
            XCTAssertTrue(
                option.exercise.attributes!.loadTags.isDisjoint(with: [.axialSpinalLoad, .lumbarFlexion]),
                "\(option.exercise.id) leaked through browse"
            )
        }
    }

    func testBrowseNeverOffersTheExerciseItself() {
        for id in ExerciseCatalog.all.keys {
            let canonical = SubstitutionRanker.canonical(id)
            for option in browse(id) {
                XCTAssertNotEqual(SubstitutionRanker.canonical(option.exercise.id), canonical)
            }
        }
    }
}

// MARK: - Persistence

final class Phase3PersistenceTests: XCTestCase {

    func testPainFlagsSurviveARoundTrip() {
        var state = LegacyState(raw: [:])
        let flags = [
            PainFlag(region: .shoulder, timing: .duringSet, exerciseID: "flat-bench"),
            PainFlag(region: .knee, exerciseID: "hack-squat"),
        ]
        LegacyAdapter.apply(painFlags: flags, to: &state)
        let read = LegacyAdapter.painFlags(from: state)
        XCTAssertEqual(read.count, 2)
        XCTAssertEqual(read.first?.region, .shoulder)
        XCTAssertEqual(read.first?.timing, .duringSet)
    }

    /// Expired flags leave the account rather than piling up in it.
    func testExpiredFlagsAreNotWritten() {
        var state = LegacyState(raw: [:])
        let old = PainFlag(
            region: .shoulder, exerciseID: "flat-bench",
            date: Calendar.current.date(byAdding: .day, value: -30, to: Date())!
        )
        LegacyAdapter.apply(painFlags: [old], to: &state)
        XCTAssertTrue(LegacyAdapter.painFlags(from: state).isEmpty)
    }

    func testReplacementsAndCustomExercisesSurviveARoundTrip() {
        var state = LegacyState(raw: [:])
        LegacyAdapter.apply(programReplacements: [
            ProgramReplacement(
                originExerciseID: "flat-bench", substituteExerciseID: "db-bench",
                scope: .thisPlan, dayID: "push-a"
            )
        ], to: &state)
        LegacyAdapter.apply(customExercises: [
            CustomExercise(name: "Landmine press", equipment: .barbell, isCompound: true)
        ], to: &state)

        XCTAssertEqual(LegacyAdapter.programReplacements(from: state).first?.scope, .thisPlan)
        XCTAssertEqual(LegacyAdapter.customExercises(from: state).first?.id, "custom:landmine-press")
    }

    /// The new keys ride alongside the web app's blob without disturbing it.
    func testTheWebAppsKeysAreUntouched() {
        var state = LegacyState(raw: ["sessions": .array([]), "nutrition": .string("keep me")])
        LegacyAdapter.apply(painFlags: [PainFlag(region: .knee, exerciseID: "hack-squat")], to: &state)
        LegacyAdapter.apply(customExercises: [CustomExercise(name: "Test")], to: &state)
        XCTAssertEqual(state["nutrition"]?.stringValue, "keep me")
        XCTAssertNotNil(state["sessions"])
    }

    /// A temporary swap marks its sets; a permanent replacement does not.
    /// Either way the set is an ordinary set of the exercise it was logged
    /// under, for volume, progression and records (§12.5).
    func testOnlyTemporarySwapsMarkTheirSets() {
        let swapped = LoggedSet(index: 0, weightKg: 30, reps: 8, substitutedFrom: "flat-bench")
        XCTAssertEqual(swapped.substitutedFrom, "flat-bench")
        XCTAssertTrue(swapped.countsTowardVolume)
        XCTAssertTrue(swapped.countsTowardProgression)

        let replaced = LoggedSet(index: 0, weightKg: 30, reps: 8)
        XCTAssertNil(replaced.substitutedFrom)
        XCTAssertTrue(replaced.countsTowardVolume)
        XCTAssertTrue(replaced.countsTowardProgression)
    }
}
