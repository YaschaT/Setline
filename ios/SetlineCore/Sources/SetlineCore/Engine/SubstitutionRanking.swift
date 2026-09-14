import Foundation

/// Why the user is looking for something else. The reason changes the ranking,
/// not the candidate pool — except for pain, which is the one reason that is
/// allowed to remove exercises outright.
public enum SwapReason: String, Codable, Sendable, CaseIterable {
    /// The machine or rack is taken.
    case occupied
    /// Something hurts. The only reason that hard-filters on load tags.
    case discomfort
    /// No stated reason; the user just wants options.
    case preference
}

/// What the app knows at the moment the user asks for an alternative.
///
/// The contexts are independent and apply together. A busy bench and a sore
/// shoulder are both true at once, and neither may switch the other off.
public struct SwapContext: Sendable {
    /// The exercise being replaced.
    public var currentExerciseID: String
    /// The role the slot has to keep carrying. An alternative that cannot hold
    /// the role is not a substitution, it is a different workout.
    public var role: ExerciseRole
    /// The machine or rack is taken: that station is excluded, and its
    /// equipment class is nudged down — never removed wholesale.
    public var isOccupied: Bool
    /// Load tags the user has flagged as painful (§14.2). Hard filter.
    public var painfulLoadTags: Set<LoadTag>
    /// Exercises the user has logged before. A familiar exercise is a cheaper
    /// decision mid-set than an unfamiliar one.
    public var familiarExerciseIDs: Set<String>
    /// Exercises already in today's session. Doing one twice is not a swap,
    /// and a later one is reached by reordering, not by substituting.
    public var excludedExerciseIDs: Set<String>

    public init(
        currentExerciseID: String,
        role: ExerciseRole,
        reason: SwapReason = .preference,
        isOccupied: Bool? = nil,
        painfulLoadTags: Set<LoadTag> = [],
        familiarExerciseIDs: Set<String> = [],
        excludedExerciseIDs: Set<String> = []
    ) {
        self.currentExerciseID = currentExerciseID
        self.role = role
        self.isOccupied = isOccupied ?? (reason == .occupied)
        self.painfulLoadTags = painfulLoadTags
        self.familiarExerciseIDs = familiarExerciseIDs
        self.excludedExerciseIDs = excludedExerciseIDs
    }

    /// The reason a swap made in this context is recorded under.
    public var reason: SwapReason {
        if isOccupied { return .occupied }
        return painfulLoadTags.isEmpty ? .preference : .discomfort
    }
}

/// One ranked alternative, with enough of its own reasoning attached that the
/// UI never has to invent a justification.
public struct RankedAlternative: Sendable, Identifiable {
    public let exercise: Exercise
    /// 0…1 after context modifiers. Ordering only — never shown as a number.
    public let score: Double
    /// The hand-written line from `AlternativesCatalog`, when this exercise has
    /// one for the exercise being replaced. Curated copy always wins over
    /// anything generated.
    public let curatedFit: String?
    public let curatedWhy: String?
    /// How much of the original's work this one does, 0…1. Ordering and
    /// copy gating only — never shown as a number.
    public let muscleOverlap: Double
    /// How close the match is structurally. Everything the ranking returns is
    /// a defensible substitute; `.related` means it keeps the muscle and the
    /// family but changes the movement pattern, which a UI may want to say
    /// out loud.
    public let match: StructuralMatch
    /// Which scoring factors carried this result, strongest first. For the
    /// UI's short explanation and for tests; not user-facing copy.
    public let drivers: [Driver]

    public var id: String { exercise.id }

    public enum Driver: String, Sendable {
        case sameMuscles, samePattern, sameJointActions, sameResistanceProfile
        case fitsRole, easierToStabilise, quickerToSetUp, alreadyFamiliar
        case differentStation, differentEquipment
    }
}

/// How well an alternative preserves the shape of the original.
public enum StructuralMatch: String, Sendable {
    /// Same movement pattern. The only tier an isolation exercise has.
    case exact
    /// Same family, different pattern — a lunge for a squat. Only ever used
    /// to fill slots the exact tier could not.
    case related
    /// Trains the muscle but changes the training intent — a compound where
    /// an isolation exercise stood. Never a primary recommendation; it exists
    /// so the browse surface can show it, labelled as what it is.
    case broader
}

/// Picks up to three alternatives for an exercise.
///
/// The shape of the thing: a few hard filters that remove what would be wrong,
/// a weighted similarity score over the objective attributes, small context
/// nudges on top, then a diversity pass so the three results are actually three
/// different answers. Curated copy decorates the result; it does not decide it.
///
/// No weight is ever converted between exercises. The alternative arrives with
/// its own empty load, which the user fills in — TRAINING_LOGIC §12.2.
public enum SubstitutionRanker {

    public static let maxResults = 3

    // MARK: - Weights
    //
    // These sum to 1.0 over the objective factors. The context modifiers below
    // are deliberately an order of magnitude smaller: context reorders a good
    // list, it does not manufacture one.

    private enum W {
        static let muscles = 0.40
        static let pattern = 0.20
        static let joints = 0.15
        static let resistance = 0.10
        static let role = 0.10
        static let stability = 0.05

        static let occupiedSameStationFamily = -0.12
        static let occupiedSharedEquipment = -0.04
        static let occupiedQuickSetup = 0.05
        static let painLowerStability = 0.08
        static let familiar = 0.06
        static let curated = 0.06
        static let diversityRepeatEquipment = -0.15
        static let diversityCrowding = -0.30

        /// Below this, an alternative is not worth offering. Two honest
        /// options beat three where the third is a different exercise wearing
        /// the same muscle group.
        static let floor = 0.45
    }

    // MARK: - Entry point

    /// Everything worth listing, for `Andere opties bekijken`.
    ///
    /// Same engine and the same hard filters — pain still excludes, the
    /// occupied station still excludes — but no cap, no diversity, and the
    /// structural rule is widened by one tier rather than dropped. A compound
    /// under an isolation exercise arrives as `.broader`, so the surface can
    /// say plainly that it changes the training intent instead of quietly
    /// listing it beside a real substitute.
    public static func browse(
        _ context: SwapContext,
        catalog: [String: Exercise] = ExerciseCatalog.all,
        recommendable: Set<String> = ExerciseCatalog.v1Recommendable
    ) -> [RankedAlternative] {
        guard
            let current = catalog[context.currentExerciseID],
            let currentAttributes = current.attributes
        else { return [] }

        let curated = curatedCopy(for: context.currentExerciseID)
        let results = candidates(
            context, current: current, currentAttributes: currentAttributes,
            catalog: catalog, recommendable: recommendable, widened: true
        ).map { decorate($0, curated: curated) }

        return ordered(results.filter { $0.match == .exact })
            + ordered(results.filter { $0.match == .related })
            + ordered(results.filter { $0.match == .broader })
    }

    public static func rank(
        _ context: SwapContext,
        catalog: [String: Exercise] = ExerciseCatalog.all,
        recommendable: Set<String> = ExerciseCatalog.v1Recommendable
    ) -> [RankedAlternative] {
        guard
            let current = catalog[context.currentExerciseID],
            let currentAttributes = current.attributes
        else { return [] }

        let curated = curatedCopy(for: context.currentExerciseID)

        let eligible = candidates(
            context, current: current, currentAttributes: currentAttributes,
            catalog: catalog, recommendable: recommendable, widened: false
        )
        .map { decorate($0, curated: curated) }
        .filter { $0.score >= W.floor }

        // The exact tier is exhausted before the related tier is touched.
        // Otherwise the diversity discount can push a same-pattern option
        // below a different-pattern one — which is how a lat pulldown ended
        // up recommending a T-bar row while three vertical pulls sat unused.
        let exact = ordered(eligible.filter { $0.match == .exact })
        var chosen = applyDiversity(exact, seeded: [])
        if chosen.count < maxResults {
            let related = ordered(eligible.filter { $0.match == .related })
            chosen = applyDiversity(related, seeded: chosen)
        }

        // Diversity chooses the set; score orders each tier. An exact match
        // always precedes a related one, however they score.
        return chosen
    }

    /// Whether these load tags change what this context recommends.
    ///
    /// The sheet may only say it took a region into account when this is
    /// true. A flag that removes and reorders nothing here is noted, not
    /// claimed.
    public static func painChangesRecommendations(
        _ context: SwapContext,
        tags: Set<LoadTag>,
        catalog: [String: Exercise] = ExerciseCatalog.all,
        recommendable: Set<String> = ExerciseCatalog.v1Recommendable
    ) -> Bool {
        guard !tags.isEmpty else { return false }
        var with = context
        with.painfulLoadTags.formUnion(tags)
        var without = context
        without.painfulLoadTags.subtract(tags)
        let a = rank(with, catalog: catalog, recommendable: recommendable).map(\.exercise.id)
        let b = rank(without, catalog: catalog, recommendable: recommendable).map(\.exercise.id)
        return a != b
    }

    private static func ordered(_ items: [RankedAlternative]) -> [RankedAlternative] {
        items.sorted { lhs, rhs in
            if abs(lhs.score - rhs.score) > scoreEpsilon { return lhs.score > rhs.score }
            return lhs.exercise.id < rhs.exercise.id   // stable, testable
        }
    }

    // MARK: - Hard filters

    private struct Candidate {
        let exercise: Exercise
        let attributes: ExerciseAttributes
        let match: StructuralMatch
        let overlap: Double
        var score: Double
        var drivers: [RankedAlternative.Driver]
    }

    /// Step 2 of the pipeline: is this a substitution at all?
    ///
    /// Scoring answers "how good"; this answers "is it the same kind of
    /// thing". Nothing that fails here can be rescued by a high score, and
    /// nothing is admitted just because a slot is empty — up to three means
    /// up to three.
    private static func eligibility(
        origin: ExerciseAttributes, candidate: ExerciseAttributes, overlap: Double, widened: Bool
    ) -> StructuralMatch? {
        if origin.movementPattern.family != candidate.movementPattern.family {
            // The browse surface may cross the family for an isolation origin
            // — that is where the compounds the primary three exclude live.
            guard widened, origin.movementPattern.isIsolation else { return nil }
            guard !origin.jointActions.isDisjoint(with: candidate.jointActions) else { return nil }
            guard targetsTheSameMuscle(origin, candidate), overlap >= 0.40 else { return nil }
            return .broader
        }

        if origin.movementPattern.isIsolation {
            // An isolation exercise keeps its joint action and its target.
            // A compound that trains the same muscle is a different intent,
            // and belongs on a browse surface, not in the primary three.
            guard !origin.jointActions.isDisjoint(with: candidate.jointActions) else { return nil }
            guard targetsTheSameMuscle(origin, candidate) else { return nil }
            guard overlap >= 0.40 else { return nil }
            guard candidate.movementPattern.isIsolation else { return widened ? .broader : nil }
            return .exact
        }

        if origin.movementPattern == candidate.movementPattern {
            return overlap >= 0.40 ? .exact : nil
        }
        // Crossing a pattern inside the family has to earn it on the muscles.
        return overlap >= 0.55 ? .related : nil
    }

    /// "Preserve the primary target muscle", allowing for the fact that the
    /// muscle list splits regions that are neighbours.
    private static func targetsTheSameMuscle(
        _ origin: ExerciseAttributes, _ candidate: ExerciseAttributes
    ) -> Bool {
        guard
            let a = origin.primaryMuscles.max(by: { $0.weight < $1.weight })?.muscle,
            let b = candidate.primaryMuscles.max(by: { $0.weight < $1.weight })?.muscle
        else { return false }
        return (a.kin[b] ?? 0) >= 0.5
    }

    private struct Eligible {
        let exercise: Exercise
        let attributes: ExerciseAttributes
        let match: StructuralMatch
        let overlap: Double
    }

    private static func candidates(
        _ context: SwapContext,
        current: Exercise,
        currentAttributes: ExerciseAttributes,
        catalog: [String: Exercise],
        recommendable: Set<String>,
        widened: Bool
    ) -> [Candidate] {
        let currentCanonical = canonical(current.id)
        let excluded = Set(context.excludedExerciseIDs.map(canonical))

        let pool = recommendable.compactMap { id -> Eligible? in
            guard let candidate = catalog[id], let attributes = candidate.attributes else { return nil }

            // 1. Never the same exercise, under any of its ids — and always
            //    offer the canonical id, never one of its per-plan aliases.
            guard canonical(id) != currentCanonical, canonical(id) == id else { return nil }

            // 2. Never an exercise already in today's session.
            guard !excluded.contains(id) else { return nil }

            // 3. Occupied excludes the *same apparatus* — the paused bench on
            //    the rack you cannot get to — and nothing broader. An occupied
            //    selectorised pulldown says nothing about the pec deck.
            if context.isOccupied,
               let station = candidate.station, let busy = current.station,
               station == busy { return nil }

            // 4. Structural eligibility.
            let overlap = muscleOverlap(currentAttributes, attributes)
            guard let match = eligibility(
                origin: currentAttributes, candidate: attributes, overlap: overlap, widened: widened
            ) else { return nil }
            return Eligible(exercise: candidate, attributes: attributes, match: match, overlap: overlap)
        }

        // 5. Pain excludes outright, and is never relaxed.
        let safe = pool.filter { $0.attributes.loadTags.isDisjoint(with: context.painfulLoadTags) }
        // Pain reshapes the ranking only where it actually removed something.
        // Otherwise a knee flag would quietly reorder a bench press list, and
        // the sheet could claim it had taken the knee into account.
        let painShapesThisList = safe.count < pool.count

        return safe.map {
            score($0, context: context, current: current, currentAttributes: currentAttributes,
                  discomfortNudge: painShapesThisList)
        }
    }

    private static func score(
        _ item: Eligible,
        context: SwapContext,
        current: Exercise,
        currentAttributes: ExerciseAttributes,
        discomfortNudge: Bool
    ) -> Candidate {
        let candidate = item.exercise
        let attributes = item.attributes
        let family = patternScore(currentAttributes.movementPattern, attributes.movementPattern)

        var drivers: [(RankedAlternative.Driver, Double)] = []
        var score = 0.0

        score += W.muscles * item.overlap
        drivers.append((.sameMuscles, W.muscles * item.overlap))

        score += W.pattern * family
        drivers.append((.samePattern, W.pattern * family))

        let joints = jaccard(currentAttributes.jointActions, attributes.jointActions)
        score += W.joints * joints
        drivers.append((.sameJointActions, W.joints * joints))

        let resistance = resistanceScore(currentAttributes, attributes)
        score += W.resistance * resistance
        drivers.append((.sameResistanceProfile, W.resistance * resistance))

        let role = roleFit(candidate, attributes: attributes, role: context.role)
        score += W.role * role
        drivers.append((.fitsRole, W.role * role))

        let stability = stabilityFit(currentAttributes, attributes)
        score += W.stability * stability
        drivers.append((.easierToStabilise, W.stability * stability))

        // Context nudges. Both may apply to the same candidate.
        if context.isOccupied {
            // Equipment overlap is a signal, not a verdict. A second
            // selectorised machine is usually free; a second squat rack
            // often is not — so station-bound equipment is nudged harder
            // than equipment a gym owns in quantity.
            if candidate.equipment == current.equipment {
                let penalty = isStationBound(current.equipment)
                    ? W.occupiedSameStationFamily
                    : W.occupiedSharedEquipment
                score += penalty
                drivers.append((.differentEquipment, penalty))
            } else {
                drivers.append((.differentEquipment, 0.01))
            }
            if candidate.station != nil, candidate.station != current.station {
                drivers.append((.differentStation, 0.01))
            }
            if attributes.heuristics.setupCost <= currentAttributes.heuristics.setupCost {
                score += W.occupiedQuickSetup
                drivers.append((.quickerToSetUp, W.occupiedQuickSetup))
            }
        }
        if discomfortNudge,
           attributes.heuristics.stabilityDemand < currentAttributes.heuristics.stabilityDemand {
            score += W.painLowerStability
            drivers.append((.easierToStabilise, W.painLowerStability))
        }

        if context.familiarExerciseIDs.contains(candidate.id) {
            score += W.familiar
            drivers.append((.alreadyFamiliar, W.familiar))
        }

        let ordered = drivers
            .filter { $0.1 > 0.01 }
            .sorted { $0.1 > $1.1 }
            .map(\.0)

        return Candidate(
            exercise: candidate, attributes: attributes, match: item.match,
            overlap: item.overlap, score: score, drivers: ordered
        )
    }

    // MARK: - Scoring parts

    /// How much of the same work the alternative does, weighted by how much
    /// each muscle mattered in the original.
    private static func muscleOverlap(_ a: ExerciseAttributes, _ b: ExerciseAttributes) -> Double {
        let lhs = smeared(vector(a)), rhs = smeared(vector(b))
        var shared = 0.0
        var total = 0.0
        // Summed in a fixed order. Double addition is not associative, so
        // accumulating over dictionary iteration order lets two equal scores
        // differ in the last bit and silently swap places in the list.
        for muscle in Muscle.allCases {
            let weight = lhs[muscle] ?? 0
            total += weight
            shared += min(weight, rhs[muscle] ?? 0)
        }
        return total > 0 ? shared / total : 0
    }

    /// Spreads each muscle's contribution over its neighbours before
    /// comparing, so an upper-chest press and a mid-chest press are related
    /// rather than disjoint.
    private static func smeared(_ v: [Muscle: Double]) -> [Muscle: Double] {
        var out: [Muscle: Double] = [:]
        for muscle in Muscle.allCases {
            guard let weight = v[muscle] else { continue }
            for neighbour in Muscle.allCases {
                guard let k = muscle.kin[neighbour] else { continue }
                out[neighbour, default: 0] += weight * k
            }
        }
        return out
    }

    private static func vector(_ a: ExerciseAttributes) -> [Muscle: Double] {
        var v: [Muscle: Double] = [:]
        for c in a.primaryMuscles { v[c.muscle, default: 0] += c.weight }
        for c in a.secondaryMuscles { v[c.muscle, default: 0] += c.weight * 0.5 }
        return v
    }

    /// Two scores this close are the same score. Ordering must never turn on
    /// a rounding difference; the id breaks the tie instead.
    private static let scoreEpsilon = 1e-9

    private static func patternScore(_ a: MovementPattern, _ b: MovementPattern) -> Double {
        if a == b { return 1 }
        return a.family == b.family ? 0.5 : 0
    }

    private static func jaccard<T>(_ a: Set<T>, _ b: Set<T>) -> Double {
        let union = a.union(b)
        guard !union.isEmpty else { return 0 }
        return Double(a.intersection(b).count) / Double(union.count)
    }

    private static func resistanceScore(_ a: ExerciseAttributes, _ b: ExerciseAttributes) -> Double {
        if a.resistanceProfile == b.resistanceProfile { return 1 }
        if a.lengthenedBiasedROM && b.lengthenedBiasedROM { return 0.7 }
        return 0.3
    }

    /// Can this exercise hold the slot's role? A primary-strength slot needs
    /// something loadable and compound; an isolation slot does not care.
    private static func roleFit(_ exercise: Exercise, attributes: ExerciseAttributes, role: ExerciseRole) -> Double {
        switch role {
        case .primaryStrength:
            guard exercise.isCompound else { return 0.2 }
            return attributes.heuristics.fatigueCost >= 3 ? 1 : 0.6
        case .secondaryCompound:
            return exercise.isCompound ? 1 : 0.4
        case .accessory:
            return 0.8
        case .isolation:
            return exercise.isCompound ? 0.5 : 1
        }
    }

    /// Equal stability scores best; less stability demand is a mild plus,
    /// more is a mild minus. Nobody wants a harder-to-balance replacement
    /// mid-session.
    private static func stabilityFit(_ a: ExerciseAttributes, _ b: ExerciseAttributes) -> Double {
        let delta = b.heuristics.stabilityDemand - a.heuristics.stabilityDemand
        switch delta {
        case ..<0: return 1
        case 0: return 1
        case 1: return 0.6
        default: return 0.2
        }
    }

    /// Equipment a gym typically owns exactly one of. Only these get the
    /// heavier occupied nudge.
    private static func isStationBound(_ equipment: Equipment) -> Bool {
        switch equipment {
        case .machinePlate, .machineSelectorised, .smith: return true
        case .barbell, .dumbbell, .cable, .bodyweight, .band: return false
        }
    }

    // MARK: - Curated copy

    private static func curatedCopy(for exerciseID: String) -> [String: ExerciseAlternative] {
        var byID: [String: ExerciseAlternative] = [:]
        for alternative in AlternativesCatalog.byExercise[exerciseID] ?? [] {
            guard let id = ExerciseMetadata.curatedNameToID[alternative.name] else { continue }
            byID[id] = alternative
        }
        return byID
    }

    private static func decorate(_ candidate: Candidate, curated: [String: ExerciseAlternative]) -> RankedAlternative {
        let copy = curated[candidate.exercise.id]
        return RankedAlternative(
            exercise: candidate.exercise,
            score: candidate.score + (copy == nil ? 0 : W.curated),
            curatedFit: copy?.fit,
            curatedWhy: copy?.why,
            muscleOverlap: candidate.overlap,
            match: candidate.match,
            drivers: candidate.drivers
        )
    }

    // MARK: - Diversity

    /// Three answers, not one answer three times. Greedy: take the best, then
    /// discount anything that repeats an equipment class already taken, and
    /// never take two exercises on the same station.
    private static func applyDiversity(
        _ scored: [RankedAlternative], seeded: [RankedAlternative]
    ) -> [RankedAlternative] {
        var chosen = seeded
        var usedEquipment: [Equipment: Int] = [:]
        var usedStations: Set<Station> = []
        for item in seeded {
            usedEquipment[item.exercise.equipment, default: 0] += 1
            if let station = item.exercise.station { usedStations.insert(station) }
        }
        var remaining = scored

        while chosen.count < maxResults, !remaining.isEmpty {
            let best = remaining
                .enumerated()
                // Two exercises on one station cannot both be the answer.
                // Everything else is handled by the crowding discount below,
                // which pushes a near-twin — a weighted pull-up next to an
                // assisted pull-up — behind a genuinely different option
                // without banning it when there is nothing else to offer.
                .filter { _, item in
                    guard let station = item.exercise.station else { return true }
                    return !usedStations.contains(station)
                }
                .max { lhs, rhs in
                    let a = adjusted(lhs.element, usedEquipment, chosen)
                    let b = adjusted(rhs.element, usedEquipment, chosen)
                    if abs(a - b) > scoreEpsilon { return a < b }
                    return lhs.element.exercise.id > rhs.element.exercise.id
                }
            guard let best else { break }
            let item = best.element
            chosen.append(item)
            usedEquipment[item.exercise.equipment, default: 0] += 1
            if let station = item.exercise.station { usedStations.insert(station) }
            remaining.remove(at: best.offset)
        }
        // Diversity chooses the set; score orders it within its tier.
        // Selecting greedily and showing that order would put a crowding
        // discount on screen as if it were quality, and leave the user
        // reading a worse second option than third.
        return ordered(chosen.filter { $0.match == .exact })
            + ordered(chosen.filter { $0.match == .related })
    }

    private static func adjusted(
        _ item: RankedAlternative, _ used: [Equipment: Int], _ chosen: [RankedAlternative]
    ) -> Double {
        let repeats = used[item.exercise.equipment] ?? 0
        let closest = chosen.map { similarity($0, item) }.max() ?? 0
        return item.score
            + Double(repeats) * W.diversityRepeatEquipment
            + closest * W.diversityCrowding
    }

    /// How much two alternatives are the same suggestion.
    private static func similarity(_ a: RankedAlternative, _ b: RankedAlternative) -> Double {
        guard let lhs = a.exercise.attributes, let rhs = b.exercise.attributes else { return 0 }
        return 0.6 * muscleOverlap(lhs, rhs)
            + 0.4 * patternScore(lhs.movementPattern, rhs.movementPattern)
    }

    // MARK: - Identity

    static func canonical(_ id: String) -> String {
        ExerciseMetadata.canonicalID[id] ?? id
    }
}
