import XCTest
@testable import SetlineCore

// MARK: - Catalogue completeness

final class CatalogueCompletenessTests: XCTestCase {

    func testCuratedCatalogueHasSixtyFiveExercises() {
        XCTAssertEqual(ExerciseCatalog.all.count, 93)
        XCTAssertEqual(GeneratedExerciseCatalog.exercises.count, 39)
        XCTAssertEqual(ExerciseMetadata.additions.count, 54)
    }

    func testAdditionsDoNotCollideWithPlannedExercises() {
        for id in ExerciseMetadata.additions.keys {
            XCTAssertNil(
                GeneratedExerciseCatalog.exercises[id],
                "\(id) is both a plan exercise and a V1 addition"
            )
        }
    }

    /// The rule the user set: attributes may be optional architecturally, but
    /// anything the ranking can offer must be complete.
    func testEveryRecommendableExerciseHasCompleteMetadata() {
        for id in ExerciseCatalog.v1Recommendable {
            guard let exercise = ExerciseCatalog.exercise(id) else {
                return XCTFail("\(id) is recommendable but not in the catalogue")
            }
            guard let attributes = exercise.attributes else {
                return XCTFail("\(id) has no attributes")
            }
            XCTAssertFalse(attributes.primaryMuscles.isEmpty, "\(id) has no primary muscles")
            XCTAssertFalse(attributes.jointActions.isEmpty, "\(id) has no joint actions")
            XCTAssertFalse(
                attributes.heuristics.rationale.isEmpty,
                "\(id) carries heuristics with no stated reasoning"
            )
        }
    }

    func testEveryCatalogueExerciseIsRecommendable() {
        // V1 authors metadata for the whole catalogue. If this ever fails, the
        // catalogue grew without its metadata — which is allowed, but then the
        // new exercise must be left out of `v1Recommendable` deliberately.
        XCTAssertEqual(Set(ExerciseCatalog.all.keys), ExerciseCatalog.v1Recommendable)
    }

    func testPrimaryMuscleWeightsSumToOne() {
        for (id, exercise) in ExerciseCatalog.all {
            guard let attributes = exercise.attributes else { continue }
            let total = attributes.primaryMuscles.reduce(0) { $0 + $1.weight }
            XCTAssertEqual(total, 1.0, accuracy: 0.001, "\(id) primary weights sum to \(total)")
        }
    }

    func testHeuristicsStayInRange() {
        for (id, exercise) in ExerciseCatalog.all {
            guard let h = exercise.attributes?.heuristics else { continue }
            XCTAssertTrue((1...5).contains(h.stabilityDemand), "\(id) stability \(h.stabilityDemand)")
            XCTAssertTrue((1...5).contains(h.fatigueCost), "\(id) fatigue \(h.fatigueCost)")
            XCTAssertTrue((1...3).contains(h.setupCost), "\(id) setup \(h.setupCost)")
        }
    }

    /// The two values the user fixed by hand.
    func testUserFixedHeuristics() {
        let dips = ExerciseCatalog.exercise("dips")!.attributes!.heuristics
        XCTAssertEqual([dips.stabilityDemand, dips.fatigueCost, dips.setupCost], [4, 3, 1])
        let back = ExerciseCatalog.exercise("back-extension")!.attributes!.heuristics
        XCTAssertEqual([back.stabilityDemand, back.fatigueCost, back.setupCost], [2, 2, 1])
    }

    func testEveryExerciseHasARole() {
        for id in ExerciseCatalog.all.keys {
            XCTAssertNotNil(ExerciseCatalog.roles[id], "\(id) has no role")
        }
    }

    func testEveryPlannedExerciseResolves() {
        let plans = [
            PlanCatalog.personal, PlanCatalog.sciencePPLUL,
            PlanCatalog.scienceUpperLower, PlanCatalog.scienceFullBody,
        ]
        for days in plans {
            for day in days {
                for planned in day.exercises {
                    XCTAssertNotNil(
                        ExerciseCatalog.exercise(planned.exerciseID),
                        "\(planned.exerciseID) is prescribed but not in the catalogue"
                    )
                }
            }
        }
    }

    func testCanonicalIDsResolve() {
        for (alias, canonical) in ExerciseMetadata.canonicalID {
            XCTAssertNotNil(ExerciseCatalog.exercise(alias), "\(alias) is unknown")
            XCTAssertNotNil(ExerciseCatalog.exercise(canonical), "\(canonical) is unknown")
            XCTAssertNil(
                ExerciseMetadata.canonicalID[canonical],
                "\(canonical) is itself an alias — canonical ids must be terminal"
            )
        }
    }

    func testCuratedNameMappingsResolve() {
        for (name, id) in ExerciseMetadata.curatedNameToID {
            XCTAssertNotNil(ExerciseCatalog.exercise(id), "\(name) maps to unknown id \(id)")
        }
    }

    /// Not every curated alternative name has an exercise behind it, and that
    /// is on purpose — several name variations the catalogue does not carry.
    /// This test pins the number so the gap cannot widen unnoticed.
    func testCuratedCoverageIsKnown() {
        let names = Set(AlternativesCatalog.byExercise.values.flatMap { $0 }.map(\.name))
        let mapped = names.filter { ExerciseMetadata.curatedNameToID[$0] != nil }
        XCTAssertEqual(names.count, 59)
        XCTAssertEqual(mapped.count, 43)
    }
}

// MARK: - Ranking

final class SubstitutionRankingTests: XCTestCase {

    private func rank(
        _ id: String,
        role: ExerciseRole? = nil,
        reason: SwapReason = .preference,
        pain: Set<LoadTag> = [],
        familiar: Set<String> = []
    ) -> [RankedAlternative] {
        SubstitutionRanker.rank(
            SwapContext(
                currentExerciseID: id,
                role: role ?? ExerciseCatalog.role(id),
                reason: reason,
                painfulLoadTags: pain,
                familiarExerciseIDs: familiar
            )
        )
    }

    private func ids(_ results: [RankedAlternative]) -> [String] { results.map(\.exercise.id) }

    // MARK: Shape

    func testNeverReturnsMoreThanThree() {
        for id in ExerciseCatalog.all.keys {
            XCTAssertLessThanOrEqual(rank(id).count, 3, "\(id) returned too many")
        }
    }

    /// Up to three means up to three. A slot is never filled to reach a
    /// count, so the only origins with nothing to offer are the ones the
    /// catalogue genuinely cannot answer — and we name them, so the number
    /// cannot grow unnoticed.
    func testOriginsWithNoPrimaryAlternative() {
        let empty = ExerciseCatalog.all.keys
            .filter { SubstitutionRanker.canonical($0) == $0 }
            .filter { rank($0).isEmpty }
        // Each of these is the only exercise of its kind in the catalogue.
        XCTAssertEqual(Set(empty), [
            "leg-extension", "hip-abduction", "hip-adduction", "db-shrug",
            "cable-woodchop", "straight-arm-pulldown",
        ])
    }

    func testResultCountsAreHonest() {
        let counts = ExerciseCatalog.all.keys
            .filter { SubstitutionRanker.canonical($0) == $0 }
            .map { rank($0).count }
        XCTAssertEqual(counts.filter { $0 == 3 }.count, 69)
        XCTAssertEqual(counts.filter { $0 == 2 }.count, 11)
        XCTAssertEqual(counts.filter { $0 == 1 }.count, 0)
        XCTAssertEqual(counts.filter { $0 == 0 }.count, 6)
    }

    func testNeverRecommendsItself() {
        for id in ExerciseCatalog.all.keys {
            XCTAssertFalse(ids(rank(id)).contains(id), "\(id) recommended itself")
        }
    }

    /// The same physical exercise under a different id is not a substitution.
    func testNeverRecommendsTheSameExerciseUnderAnotherID() {
        for id in ExerciseCatalog.all.keys {
            let canonical = SubstitutionRanker.canonical(id)
            for result in rank(id) {
                XCTAssertNotEqual(
                    SubstitutionRanker.canonical(result.exercise.id), canonical,
                    "\(id) recommended \(result.exercise.id), which is the same exercise"
                )
            }
        }
    }

    func testRankingIsDeterministic() {
        for id in ExerciseCatalog.all.keys {
            XCTAssertEqual(ids(rank(id)), ids(rank(id)), "\(id) is not stable")
        }
    }

    func testNoTwoResultsShareAStation() {
        for id in ExerciseCatalog.all.keys {
            let stations = rank(id).compactMap(\.exercise.station)
            XCTAssertEqual(Set(stations).count, stations.count, "\(id) offered one station twice")
        }
    }

    /// Exact matches come first as a block, each block ordered by score. A
    /// broader alternative never outranks one that keeps the movement.
    func testResultsAreOrderedByTierThenScore() {
        for id in ExerciseCatalog.all.keys {
            let results = rank(id)
            let matches = results.map(\.match)
            XCTAssertEqual(
                matches, matches.sorted { $0 == .exact && $1 == .related },
                "\(id) interleaves tiers"
            )
            for tier in [StructuralMatch.exact, .related] {
                let scores = results.filter { $0.match == tier }.map(\.score)
                XCTAssertEqual(scores, scores.sorted(by: >), "\(id) \(tier) is not ordered")
            }
        }
    }

    // MARK: Structural eligibility

    /// An isolation exercise is never answered with a compound: same muscle,
    /// different training intent.
    func testIsolationOriginNeverReturnsACompound() {
        for (id, exercise) in ExerciseCatalog.all {
            guard exercise.attributes?.movementPattern.isIsolation == true else { continue }
            for result in rank(id) {
                XCTAssertEqual(
                    result.exercise.attributes?.movementPattern.isIsolation, true,
                    "\(id) offered the compound \(result.exercise.id)"
                )
                XCTAssertFalse(result.exercise.isCompound, "\(id) offered \(result.exercise.id)")
            }
        }
    }

    /// The catalogue holds no second knee-extension isolation, so the primary
    /// surface is empty rather than filled with squat patterns.
    func testLegExtensionOffersNothingRatherThanSquats() {
        let results = ids(rank("leg-extension"))
        XCTAssertTrue(results.isEmpty, "leg-extension offered \(results)")
    }

    /// Knee flexion does not fall back to hip extension: a leg curl gets
    /// the other leg curl and the Nordic curl, never a hinge.
    func testSeatedCurlReturnsOnlyTheOtherLegCurl() {
        XCTAssertEqual(ids(rank("seated-curl")), ["lying-curl", "nordic-curl"])
        XCTAssertEqual(ids(rank("lying-curl")), ["seated-curl", "nordic-curl"])
    }

    /// Isolation elbow extension does not fall back to a press.
    func testPressdownNeverReturnsAPress() {
        let results = ids(rank("pressdown"))
        XCTAssertEqual(results, ["single-arm-pressdown", "db-overhead-triceps", "skull-crusher"])
        XCTAssertFalse(results.contains("dips"))
        XCTAssertFalse(results.contains("close-grip-bench"))
    }

    /// The lat pulldown has four vertical pulls available; a horizontal row
    /// must not take a slot from any of them.
    func testVerticalPullStaysVertical() {
        for result in rank("lat-pulldown") {
            XCTAssertEqual(
                result.exercise.attributes?.movementPattern, .verticalPull,
                "lat-pulldown fell back to \(result.exercise.id)"
            )
        }
        XCTAssertEqual(ids(rank("lat-pulldown")), ["neutral-pulldown", "neutral-pull-up", "single-arm-pulldown"])
    }

    /// A related match is only ever used to fill what the exact tier could
    /// not — the lunge family has two other lunges, then reaches into squats.
    func testRelatedTierOnlyFillsWhatExactCannot() {
        let results = rank("bulgarian")
        XCTAssertEqual(results.prefix(2).map(\.exercise.id), ["reverse-lunge", "walking-lunge"])
        XCTAssertTrue(results.prefix(2).allSatisfy { $0.match == .exact })
        XCTAssertTrue(results.dropFirst(2).allSatisfy { $0.match == .related })
    }

    func testARelatedMatchAlwaysStaysInTheFamily() {
        for id in ExerciseCatalog.all.keys {
            guard let origin = ExerciseCatalog.exercise(id)?.attributes else { continue }
            for result in rank(id) where result.match == .related {
                XCTAssertEqual(
                    result.exercise.attributes?.movementPattern.family, origin.movementPattern.family,
                    "\(id) crossed a family to reach \(result.exercise.id)"
                )
            }
        }
    }

    /// The `Muscle` enum splits the chest, so without kinship an incline press
    /// and a flat press read as unrelated exercises. With the incline
    /// variants out of the way, a flat press still answers an incline one.
    func testRelatedMuscleGroupsCount() {
        var catalog = ExerciseCatalog.all
        for id in ["incline-machine", "smith-incline", "db-incline"] { catalog[id] = nil }
        let results = SubstitutionRanker.rank(
            SwapContext(currentExerciseID: "incline-bench", role: ExerciseCatalog.role("incline-bench")),
            catalog: catalog
        )
        XCTAssertTrue(ids(results).contains("chest-press-machine"))
        XCTAssertTrue(ids(rank("flat-bench")).contains("chest-press-machine"))
    }

    /// Only canonical ids are ever offered: "Wide chest-supported row" exists
    /// twice in the catalogue, and the user must not see which copy we picked.
    func testNeverOffersAnAliasID() {
        for id in ExerciseCatalog.all.keys {
            for result in rank(id) {
                XCTAssertNil(
                    ExerciseMetadata.canonicalID[result.exercise.id],
                    "\(id) offered the alias \(result.exercise.id)"
                )
            }
        }
    }

    /// A weighted pull-up and an assisted pull-up are one answer, not two, so
    /// a genuinely different option outranks the twin when one exists.
    func testANearTwinDoesNotTakeASlotFromADifferentAnswer() {
        // The pull-ups (wide, neutral, assisted) are one answer, so with all
        // three eligible exactly one of them appears.
        let results = ids(rank("lat-pulldown"))
        let pullUps = results.filter { ["pull-up", "neutral-pull-up", "assisted-pull-up"].contains($0) }
        XCTAssertEqual(pullUps.count, 1, "more than one pull-up took a slot: \(results)")
    }

    func testThinCatalogueCornersReturnFewerRatherThanWorse() {
        // Three calf exercises exist. Two of them are the honest answer.
        XCTAssertEqual(ids(rank("standing-calf")), ["leg-press-calf", "seated-calf"])
    }

    func testUnknownExerciseReturnsNothing() {
        XCTAssertTrue(rank("not-an-exercise").isEmpty)
    }

    // MARK: Occupied

    /// The user's correction, as a test: an occupied station rules out that
    /// station, not the whole equipment class.
    func testOccupiedExcludesTheSameStationOnly() {
        let results = rank("flat-bench", reason: .occupied)
        XCTAssertEqual(ids(results), ["chest-press-machine", "db-bench", "push-up"])
        XCTAssertFalse(
            ids(results).contains("close-grip-bench"),
            "close-grip-bench is on the same rack and must be excluded"
        )
        XCTAssertFalse(ids(results).isEmpty)
    }

    func testOccupiedDoesNotRemoveAnEntireEquipmentClass() {
        // The lat pulldown is selectorised. Another selectorised machine must
        // still be offerable — a busy pulldown says nothing about the rest.
        let results = rank("lat-pulldown", reason: .occupied)
        XCTAssertTrue(
            results.contains { $0.exercise.equipment == .machineSelectorised },
            "occupied wrongly removed every selectorised machine: \(ids(results))"
        )
        // The other pulldown shares the station, so it goes.
        XCTAssertFalse(ids(results).contains("neutral-pulldown"))
        XCTAssertEqual(ids(results), ["neutral-pull-up", "single-arm-pulldown", "assisted-pull-up"])
    }

    /// Pain can legitimately empty the primary surface: every squat pattern in
    /// the catalogue bends the knee deeply, and a leg extension is a different
    /// training intent rather than a squat substitute. The UI has to say so
    /// instead of being handed a weak answer.
    func testPainCanLegitimatelyLeaveNothing() {
        XCTAssertTrue(ids(rank("hack-squat", reason: .discomfort, pain: [.deepKneeFlexion])).isEmpty)
    }

    func testPainNarrowsToWhatRemains() {
        XCTAssertEqual(
            ids(rank("rdl", reason: .discomfort, pain: [.axialSpinalLoad, .lumbarFlexion])),
            ["hip-thrust", "hip-thrust-machine"]
        )
    }

    func testOccupiedPrefersDifferentEquipmentAllElseEqual() {
        let neutral = rank("hack-squat")
        let occupied = rank("hack-squat", reason: .occupied)
        let plateCountNeutral = neutral.filter { $0.exercise.equipment == .machinePlate }.count
        let plateCountOccupied = occupied.filter { $0.exercise.equipment == .machinePlate }.count
        XCTAssertLessThanOrEqual(plateCountOccupied, plateCountNeutral)
    }

    // MARK: Pain

    func testPainExcludesTheFlaggedLoadTag() {
        let results = rank("rdl", reason: .discomfort, pain: [.axialSpinalLoad, .lumbarFlexion])
        for result in results {
            let tags = result.exercise.attributes!.loadTags
            XCTAssertFalse(tags.contains(.axialSpinalLoad), "\(result.exercise.id) still loads the spine")
            XCTAssertFalse(tags.contains(.lumbarFlexion), "\(result.exercise.id) still flexes the lumbar spine")
        }
    }

    func testPainFilterIsNeverRelaxedToFillThreeSlots() {
        // Ask for something with a narrow pool and an aggressive pain filter.
        let results = rank(
            "overhead-press", reason: .discomfort,
            pain: [.overheadPosition, .endRangeShoulder, .axialSpinalLoad]
        )
        for result in results {
            let tags = result.exercise.attributes!.loadTags
            XCTAssertTrue(
                tags.isDisjoint(with: [.overheadPosition, .endRangeShoulder, .axialSpinalLoad]),
                "\(result.exercise.id) leaked through the pain filter"
            )
        }
    }

    // MARK: Nudges

    func testFamiliarityOnlyReordersWithinAGoodList() {
        let plain = rank("flat-bench")
        let familiar = rank("flat-bench", familiar: ["dips"])
        XCTAssertEqual(Set(ids(plain) + ["dips"]).isSuperset(of: ids(familiar)), true)
        let plainScore = plain.first { $0.exercise.id == "dips" }?.score
        let boosted = familiar.first { $0.exercise.id == "dips" }?.score
        if let plainScore, let boosted { XCTAssertGreaterThan(boosted, plainScore) }
    }

    // MARK: Curated copy

    func testCuratedCopyIsAttachedWhereItExists() {
        let results = rank("flat-bench")
        let dumbbell = results.first { $0.exercise.id == "db-bench" }
        XCTAssertNotNil(dumbbell?.curatedWhy)
        XCTAssertEqual(dumbbell?.curatedFit, "Same role")
    }

    func testResultsWithoutCuratedCopyStillRank() {
        // Something whose curated names we deliberately did not map.
        let results = rank("hammer-curl")
        XCTAssertFalse(results.isEmpty)
    }

    // MARK: Graceful degradation

    func testMissingMetadataSimplyRemovesACandidate() {
        var catalog = ExerciseCatalog.all
        catalog["db-bench"]?.attributes = nil
        let results = SubstitutionRanker.rank(
            SwapContext(currentExerciseID: "flat-bench", role: .primaryStrength),
            catalog: catalog
        )
        XCTAssertFalse(ids(results).contains("db-bench"))
        XCTAssertFalse(results.isEmpty, "one missing candidate must not empty the list")
    }

    func testExerciseWithoutAttributesOffersNothing() {
        var catalog = ExerciseCatalog.all
        catalog["flat-bench"]?.attributes = nil
        let results = SubstitutionRanker.rank(
            SwapContext(currentExerciseID: "flat-bench", role: .primaryStrength),
            catalog: catalog
        )
        XCTAssertTrue(results.isEmpty)
    }

    // MARK: Sample outputs
    //
    // These pin the eight examples from the approved proposal. They are the
    // product review surface: if a change to the weights moves one of these,
    // that is a product decision, not a refactor. The November 2026 catalogue
    // additions moved six of them, each to a closer match: the Smith incline
    // press for incline, the push-up for flat bench (similar growth at
    // matched effort), the Bayesian curl, and two more triceps isolations.

    func testSampleOutputs() {
        let expected: [String: [String]] = [
            "flat-bench":    ["chest-press-machine", "db-bench", "push-up"],
            "incline-bench": ["incline-machine", "smith-incline", "db-incline"],
            "lat-pulldown":  ["neutral-pulldown", "neutral-pull-up", "single-arm-pulldown"],
            "neutral-row":   ["t-bar-row", "seated-cable-row", "barbell-row"],
            "leg-press":     ["smith-squat", "hack-squat", "goblet-squat"],
            "rdl":           ["db-rdl", "hip-thrust", "hip-thrust-machine"],
            "strict-curl":   ["ez-curl", "bayesian-curl", "incline-db-curl"],
            "pressdown":     ["single-arm-pressdown", "db-overhead-triceps", "skull-crusher"],
        ]
        for (id, want) in expected.sorted(by: { $0.key < $1.key }) {
            XCTAssertEqual(ids(rank(id)), want, "top 3 for \(id) changed")
        }
    }
}
