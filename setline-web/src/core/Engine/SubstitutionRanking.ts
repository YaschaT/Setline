import type { Exercise } from "../Domain/Model";
import type { Equipment, ExerciseRole } from "../Domain/Vocabulary";
import {
  type ExerciseAttributes,
  type LoadTag,
  Muscle,
  MovementPattern,
  type Station,
} from "../Domain/ExerciseAttributes";
import { AlternativesCatalog, type ExerciseAlternative } from "../Catalog/AlternativesCatalog";
import { ExerciseCatalog } from "../Catalog/ExerciseCatalogV1";
import { ExerciseMetadata } from "../Catalog/ExerciseMetadata";
import { deepEqual, maxBy } from "../Support/swift";
import { sortedWhere } from "../Support/engine";

/**
 * Why the user is looking for something else. The reason changes the ranking,
 * not the candidate pool — except for pain, which is the one reason that is
 * allowed to remove exercises outright.
 */
export type SwapReason = "occupied" | "discomfort" | "preference";
export const SwapReason = {
  /** The machine or rack is taken. */
  occupied: "occupied" as SwapReason,
  /** Something hurts. The only reason that hard-filters on load tags. */
  discomfort: "discomfort" as SwapReason,
  /** No stated reason; the user just wants options. */
  preference: "preference" as SwapReason,
  allCases: ["occupied", "discomfort", "preference"] as SwapReason[],
};

/**
 * What the app knows at the moment the user asks for an alternative.
 *
 * The contexts are independent and apply together. A busy bench and a sore
 * shoulder are both true at once, and neither may switch the other off.
 */
export interface SwapContext {
  /** The exercise being replaced. */
  currentExerciseID: string;
  /**
   * The role the slot has to keep carrying. An alternative that cannot hold
   * the role is not a substitution, it is a different workout.
   */
  role: ExerciseRole;
  /**
   * The machine or rack is taken: that station is excluded, and its
   * equipment class is nudged down — never removed wholesale.
   */
  isOccupied: boolean;
  /** Load tags the user has flagged as painful (§14.2). Hard filter. */
  painfulLoadTags: Set<LoadTag>;
  /**
   * Exercises the user has logged before. A familiar exercise is a cheaper
   * decision mid-set than an unfamiliar one.
   */
  familiarExerciseIDs: Set<string>;
  /**
   * Exercises already in today's session. Doing one twice is not a swap,
   * and a later one is reached by reordering, not by substituting.
   */
  excludedExerciseIDs: Set<string>;
}
export const SwapContext = {
  make(a: {
    currentExerciseID: string;
    role: ExerciseRole;
    reason?: SwapReason;
    isOccupied?: boolean;
    painfulLoadTags?: Set<LoadTag>;
    familiarExerciseIDs?: Set<string>;
    excludedExerciseIDs?: Set<string>;
  }): SwapContext {
    const reason = a.reason ?? "preference";
    return {
      currentExerciseID: a.currentExerciseID,
      role: a.role,
      isOccupied: a.isOccupied ?? (reason === "occupied"),
      painfulLoadTags: a.painfulLoadTags ?? new Set<LoadTag>(),
      familiarExerciseIDs: a.familiarExerciseIDs ?? new Set<string>(),
      excludedExerciseIDs: a.excludedExerciseIDs ?? new Set<string>(),
    };
  },

  /** The reason a swap made in this context is recorded under. */
  reason(self: SwapContext): SwapReason {
    if (self.isOccupied) return "occupied";
    return self.painfulLoadTags.size === 0 ? "preference" : "discomfort";
  },
};

export type RankedAlternative_Driver =
  | "sameMuscles" | "samePattern" | "sameJointActions" | "sameResistanceProfile"
  | "fitsRole" | "easierToStabilise" | "quickerToSetUp" | "alreadyFamiliar"
  | "differentStation" | "differentEquipment";
export const RankedAlternative_Driver = {
  sameMuscles: "sameMuscles" as RankedAlternative_Driver,
  samePattern: "samePattern" as RankedAlternative_Driver,
  sameJointActions: "sameJointActions" as RankedAlternative_Driver,
  sameResistanceProfile: "sameResistanceProfile" as RankedAlternative_Driver,
  fitsRole: "fitsRole" as RankedAlternative_Driver,
  easierToStabilise: "easierToStabilise" as RankedAlternative_Driver,
  quickerToSetUp: "quickerToSetUp" as RankedAlternative_Driver,
  alreadyFamiliar: "alreadyFamiliar" as RankedAlternative_Driver,
  differentStation: "differentStation" as RankedAlternative_Driver,
  differentEquipment: "differentEquipment" as RankedAlternative_Driver,
};

/**
 * One ranked alternative, with enough of its own reasoning attached that the
 * UI never has to invent a justification.
 */
export interface RankedAlternative {
  readonly exercise: Exercise;
  /** 0…1 after context modifiers. Ordering only — never shown as a number. */
  readonly score: number;
  /**
   * The hand-written line from `AlternativesCatalog`, when this exercise has
   * one for the exercise being replaced. Curated copy always wins over
   * anything generated.
   */
  readonly curatedFit?: string;
  readonly curatedWhy?: string;
  /**
   * How much of the original's work this one does, 0…1. Ordering and
   * copy gating only — never shown as a number.
   */
  readonly muscleOverlap: number;
  /**
   * How close the match is structurally. Everything the ranking returns is
   * a defensible substitute; `.related` means it keeps the muscle and the
   * family but changes the movement pattern, which a UI may want to say
   * out loud.
   */
  readonly match: StructuralMatch;
  /**
   * Which scoring factors carried this result, strongest first. For the
   * UI's short explanation and for tests; not user-facing copy.
   */
  readonly drivers: RankedAlternative_Driver[];
}
export const RankedAlternative = {
  id(self: RankedAlternative): string {
    return self.exercise.id;
  },
};

/** How well an alternative preserves the shape of the original. */
export type StructuralMatch = "exact" | "related" | "broader";
export const StructuralMatch = {
  /** Same movement pattern. The only tier an isolation exercise has. */
  exact: "exact" as StructuralMatch,
  /**
   * Same family, different pattern — a lunge for a squat. Only ever used
   * to fill slots the exact tier could not.
   */
  related: "related" as StructuralMatch,
  /**
   * Trains the muscle but changes the training intent — a compound where
   * an isolation exercise stood. Never a primary recommendation; it exists
   * so the browse surface can show it, labelled as what it is.
   */
  broader: "broader" as StructuralMatch,
};

// MARK: - Weights
//
// These sum to 1.0 over the objective factors. The context modifiers below
// are deliberately an order of magnitude smaller: context reorders a good
// list, it does not manufacture one.

const W = {
  muscles: 0.40,
  pattern: 0.20,
  joints: 0.15,
  resistance: 0.10,
  role: 0.10,
  stability: 0.05,

  occupiedSameStationFamily: -0.12,
  occupiedSharedEquipment: -0.04,
  occupiedQuickSetup: 0.05,
  painLowerStability: 0.08,
  familiar: 0.06,
  curated: 0.06,
  diversityRepeatEquipment: -0.15,
  diversityCrowding: -0.30,

  /**
   * Below this, an alternative is not worth offering. Two honest
   * options beat three where the third is a different exercise wearing
   * the same muscle group.
   */
  floor: 0.45,
};

/**
 * Two scores this close are the same score. Ordering must never turn on
 * a rounding difference; the id breaks the tie instead.
 */
const scoreEpsilon = 1e-9;

interface Candidate {
  readonly exercise: Exercise;
  readonly attributes: ExerciseAttributes;
  readonly match: StructuralMatch;
  readonly overlap: number;
  score: number;
  drivers: RankedAlternative_Driver[];
}

interface Eligible {
  readonly exercise: Exercise;
  readonly attributes: ExerciseAttributes;
  readonly match: StructuralMatch;
  readonly overlap: number;
}

function isDisjoint<T>(a: Set<T>, b: Set<T>): boolean {
  for (const x of a) if (b.has(x)) return false;
  return true;
}

function ordered(items: RankedAlternative[]): RankedAlternative[] {
  return sortedWhere(items, (lhs, rhs) => {
    if (Math.abs(lhs.score - rhs.score) > scoreEpsilon) return lhs.score > rhs.score;
    return lhs.exercise.id < rhs.exercise.id; // stable, testable
  });
}

// MARK: - Hard filters

/**
 * Step 2 of the pipeline: is this a substitution at all?
 *
 * Scoring answers "how good"; this answers "is it the same kind of
 * thing". Nothing that fails here can be rescued by a high score, and
 * nothing is admitted just because a slot is empty — up to three means
 * up to three.
 */
function eligibility(a: {
  origin: ExerciseAttributes;
  candidate: ExerciseAttributes;
  overlap: number;
  widened: boolean;
}): StructuralMatch | undefined {
  const { origin, candidate, overlap, widened } = a;
  if (MovementPattern.family(origin.movementPattern) !== MovementPattern.family(candidate.movementPattern)) {
    // The browse surface may cross the family for an isolation origin
    // — that is where the compounds the primary three exclude live.
    if (!(widened && MovementPattern.isIsolation(origin.movementPattern))) return undefined;
    if (isDisjoint(origin.jointActions, candidate.jointActions)) return undefined;
    if (!(targetsTheSameMuscle(origin, candidate) && overlap >= 0.40)) return undefined;
    return "broader";
  }

  if (MovementPattern.isIsolation(origin.movementPattern)) {
    // An isolation exercise keeps its joint action and its target.
    // A compound that trains the same muscle is a different intent,
    // and belongs on a browse surface, not in the primary three.
    if (isDisjoint(origin.jointActions, candidate.jointActions)) return undefined;
    if (!targetsTheSameMuscle(origin, candidate)) return undefined;
    if (!(overlap >= 0.40)) return undefined;
    if (!MovementPattern.isIsolation(candidate.movementPattern)) return widened ? "broader" : undefined;
    return "exact";
  }

  if (origin.movementPattern === candidate.movementPattern) {
    return overlap >= 0.40 ? "exact" : undefined;
  }
  // Crossing a pattern inside the family has to earn it on the muscles.
  return overlap >= 0.55 ? "related" : undefined;
}

/**
 * "Preserve the primary target muscle", allowing for the fact that the
 * muscle list splits regions that are neighbours.
 */
function targetsTheSameMuscle(origin: ExerciseAttributes, candidate: ExerciseAttributes): boolean {
  const a = maxBy(origin.primaryMuscles, (l, r) => l.weight < r.weight)?.muscle;
  const b = maxBy(candidate.primaryMuscles, (l, r) => l.weight < r.weight)?.muscle;
  if (a === undefined || b === undefined) return false;
  return (Muscle.kin(a)[b] ?? 0) >= 0.5;
}

function candidates(
  context: SwapContext,
  a: {
    current: Exercise;
    currentAttributes: ExerciseAttributes;
    catalog: Record<string, Exercise>;
    recommendable: Set<string>;
    widened: boolean;
  },
): Candidate[] {
  const { current, currentAttributes, catalog, recommendable, widened } = a;
  const currentCanonical = SubstitutionRanker.canonical(current.id);
  const excluded = new Set([...context.excludedExerciseIDs].map((id) => SubstitutionRanker.canonical(id)));

  const pool: Eligible[] = [];
  for (const id of recommendable) {
    const candidate = catalog[id];
    const attributes = candidate?.attributes;
    if (candidate === undefined || attributes === undefined) continue;

    // 1. Never the same exercise, under any of its ids — and always
    //    offer the canonical id, never one of its per-plan aliases.
    if (!(SubstitutionRanker.canonical(id) !== currentCanonical && SubstitutionRanker.canonical(id) === id)) continue;

    // 2. Never an exercise already in today's session.
    if (excluded.has(id)) continue;

    // 3. Occupied excludes the *same apparatus* — the paused bench on
    //    the rack you cannot get to — and nothing broader. An occupied
    //    selectorised pulldown says nothing about the pec deck.
    if (context.isOccupied && candidate.station !== undefined && current.station !== undefined
      && candidate.station === current.station) continue;

    // 4. Structural eligibility.
    const overlap = muscleOverlap(currentAttributes, attributes);
    const match = eligibility({ origin: currentAttributes, candidate: attributes, overlap, widened });
    if (match === undefined) continue;
    pool.push({ exercise: candidate, attributes, match, overlap });
  }

  // 5. Pain excludes outright, and is never relaxed.
  const safe = pool.filter((e) => isDisjoint(e.attributes.loadTags, context.painfulLoadTags));
  // Pain reshapes the ranking only where it actually removed something.
  // Otherwise a knee flag would quietly reorder a bench press list, and
  // the sheet could claim it had taken the knee into account.
  const painShapesThisList = safe.length < pool.length;

  return safe.map((e) => score(e, { context, current, currentAttributes, discomfortNudge: painShapesThisList }));
}

function score(
  item: Eligible,
  a: { context: SwapContext; current: Exercise; currentAttributes: ExerciseAttributes; discomfortNudge: boolean },
): Candidate {
  const { context, current, currentAttributes, discomfortNudge } = a;
  const candidate = item.exercise;
  const attributes = item.attributes;
  const family = patternScore(currentAttributes.movementPattern, attributes.movementPattern);

  const drivers: [RankedAlternative_Driver, number][] = [];
  let total = 0.0;

  total += W.muscles * item.overlap;
  drivers.push(["sameMuscles", W.muscles * item.overlap]);

  total += W.pattern * family;
  drivers.push(["samePattern", W.pattern * family]);

  const joints = jaccard(currentAttributes.jointActions, attributes.jointActions);
  total += W.joints * joints;
  drivers.push(["sameJointActions", W.joints * joints]);

  const resistance = resistanceScore(currentAttributes, attributes);
  total += W.resistance * resistance;
  drivers.push(["sameResistanceProfile", W.resistance * resistance]);

  const role = roleFit(candidate, { attributes, role: context.role });
  total += W.role * role;
  drivers.push(["fitsRole", W.role * role]);

  const stability = stabilityFit(currentAttributes, attributes);
  total += W.stability * stability;
  drivers.push(["easierToStabilise", W.stability * stability]);

  // Context nudges. Both may apply to the same candidate.
  if (context.isOccupied) {
    // Equipment overlap is a signal, not a verdict. A second
    // selectorised machine is usually free; a second squat rack
    // often is not — so station-bound equipment is nudged harder
    // than equipment a gym owns in quantity.
    if (candidate.equipment === current.equipment) {
      const penalty = isStationBound(current.equipment) ? W.occupiedSameStationFamily : W.occupiedSharedEquipment;
      total += penalty;
      drivers.push(["differentEquipment", penalty]);
    } else {
      drivers.push(["differentEquipment", 0.01]);
    }
    if (candidate.station !== undefined && candidate.station !== current.station) {
      drivers.push(["differentStation", 0.01]);
    }
    if (attributes.heuristics.setupCost <= currentAttributes.heuristics.setupCost) {
      total += W.occupiedQuickSetup;
      drivers.push(["quickerToSetUp", W.occupiedQuickSetup]);
    }
  }
  if (discomfortNudge && attributes.heuristics.stabilityDemand < currentAttributes.heuristics.stabilityDemand) {
    total += W.painLowerStability;
    drivers.push(["easierToStabilise", W.painLowerStability]);
  }

  if (context.familiarExerciseIDs.has(candidate.id)) {
    total += W.familiar;
    drivers.push(["alreadyFamiliar", W.familiar]);
  }

  const orderedDrivers = sortedWhere(drivers.filter((d) => d[1] > 0.01), (l, r) => l[1] > r[1]).map((d) => d[0]);

  return {
    exercise: candidate,
    attributes,
    match: item.match,
    overlap: item.overlap,
    score: total,
    drivers: orderedDrivers,
  };
}

// MARK: - Scoring parts

/**
 * How much of the same work the alternative does, weighted by how much
 * each muscle mattered in the original.
 */
function muscleOverlap(a: ExerciseAttributes, b: ExerciseAttributes): number {
  const lhs = smeared(vector(a));
  const rhs = smeared(vector(b));
  let shared = 0.0;
  let total = 0.0;
  // Summed in a fixed order. Double addition is not associative, so
  // accumulating over dictionary iteration order lets two equal scores
  // differ in the last bit and silently swap places in the list.
  for (const muscle of Muscle.allCases) {
    const weight = lhs.get(muscle) ?? 0;
    total += weight;
    shared += Math.min(weight, rhs.get(muscle) ?? 0);
  }
  return total > 0 ? shared / total : 0;
}

/**
 * Spreads each muscle's contribution over its neighbours before
 * comparing, so an upper-chest press and a mid-chest press are related
 * rather than disjoint.
 */
function smeared(v: Map<Muscle, number>): Map<Muscle, number> {
  const out = new Map<Muscle, number>();
  for (const muscle of Muscle.allCases) {
    const weight = v.get(muscle);
    if (weight === undefined) continue;
    const kin = Muscle.kin(muscle);
    for (const neighbour of Muscle.allCases) {
      const k = kin[neighbour];
      if (k === undefined) continue;
      out.set(neighbour, (out.get(neighbour) ?? 0) + weight * k);
    }
  }
  return out;
}

function vector(a: ExerciseAttributes): Map<Muscle, number> {
  const v = new Map<Muscle, number>();
  for (const c of a.primaryMuscles) v.set(c.muscle, (v.get(c.muscle) ?? 0) + c.weight);
  for (const c of a.secondaryMuscles) v.set(c.muscle, (v.get(c.muscle) ?? 0) + c.weight * 0.5);
  return v;
}

function patternScore(a: MovementPattern, b: MovementPattern): number {
  if (a === b) return 1;
  return MovementPattern.family(a) === MovementPattern.family(b) ? 0.5 : 0;
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  const union = new Set<T>([...a, ...b]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection += 1;
  return intersection / union.size;
}

function resistanceScore(a: ExerciseAttributes, b: ExerciseAttributes): number {
  if (a.resistanceProfile === b.resistanceProfile) return 1;
  if (a.lengthenedBiasedROM && b.lengthenedBiasedROM) return 0.7;
  return 0.3;
}

/**
 * Can this exercise hold the slot's role? A primary-strength slot needs
 * something loadable and compound; an isolation slot does not care.
 */
function roleFit(exercise: Exercise, a: { attributes: ExerciseAttributes; role: ExerciseRole }): number {
  switch (a.role) {
    case "primaryStrength":
      if (!exercise.isCompound) return 0.2;
      return a.attributes.heuristics.fatigueCost >= 3 ? 1 : 0.6;
    case "secondaryCompound":
      return exercise.isCompound ? 1 : 0.4;
    case "accessory":
      return 0.8;
    case "isolation":
      return exercise.isCompound ? 0.5 : 1;
  }
}

/**
 * Equal stability scores best; less stability demand is a mild plus,
 * more is a mild minus. Nobody wants a harder-to-balance replacement
 * mid-session.
 */
function stabilityFit(a: ExerciseAttributes, b: ExerciseAttributes): number {
  const delta = b.heuristics.stabilityDemand - a.heuristics.stabilityDemand;
  if (delta < 0) return 1;
  if (delta === 0) return 1;
  if (delta === 1) return 0.6;
  return 0.2;
}

/**
 * Equipment a gym typically owns exactly one of. Only these get the
 * heavier occupied nudge.
 */
function isStationBound(equipment: Equipment): boolean {
  switch (equipment) {
    case "machinePlate":
    case "machineSelectorised":
    case "smith":
      return true;
    case "barbell":
    case "dumbbell":
    case "cable":
    case "bodyweight":
    case "band":
      return false;
  }
}

// MARK: - Curated copy

function curatedCopy(a: { for: string }): Record<string, ExerciseAlternative> {
  const byID: Record<string, ExerciseAlternative> = {};
  for (const alternative of AlternativesCatalog.byExercise[a.for] ?? []) {
    const id = ExerciseMetadata.curatedNameToID[alternative.name];
    if (id === undefined) continue;
    byID[id] = alternative;
  }
  return byID;
}

function decorate(candidate: Candidate, a: { curated: Record<string, ExerciseAlternative> }): RankedAlternative {
  const copy = a.curated[candidate.exercise.id];
  return {
    exercise: candidate.exercise,
    score: candidate.score + (copy === undefined ? 0 : W.curated),
    curatedFit: copy?.fit,
    curatedWhy: copy?.why,
    muscleOverlap: candidate.overlap,
    match: candidate.match,
    drivers: candidate.drivers,
  };
}

// MARK: - Diversity

/**
 * Three answers, not one answer three times. Greedy: take the best, then
 * discount anything that repeats an equipment class already taken, and
 * never take two exercises on the same station.
 */
function applyDiversity(scored: RankedAlternative[], a: { seeded: RankedAlternative[] }): RankedAlternative[] {
  const chosen = [...a.seeded];
  const usedEquipment = new Map<Equipment, number>();
  const usedStations = new Set<Station>();
  for (const item of a.seeded) {
    usedEquipment.set(item.exercise.equipment, (usedEquipment.get(item.exercise.equipment) ?? 0) + 1);
    if (item.exercise.station !== undefined) usedStations.add(item.exercise.station);
  }
  const remaining = [...scored];

  while (chosen.length < SubstitutionRanker.maxResults && remaining.length > 0) {
    const best = maxBy(
      remaining
        .map((element, offset) => ({ offset, element }))
        // Two exercises on one station cannot both be the answer.
        // Everything else is handled by the crowding discount below,
        // which pushes a near-twin — a weighted pull-up next to an
        // assisted pull-up — behind a genuinely different option
        // without banning it when there is nothing else to offer.
        .filter(({ element }) => element.exercise.station === undefined || !usedStations.has(element.exercise.station)),
      (lhs, rhs) => {
        const x = adjusted(lhs.element, usedEquipment, chosen);
        const y = adjusted(rhs.element, usedEquipment, chosen);
        if (Math.abs(x - y) > scoreEpsilon) return x < y;
        return lhs.element.exercise.id > rhs.element.exercise.id;
      },
    );
    if (best === undefined) break;
    const item = best.element;
    chosen.push(item);
    usedEquipment.set(item.exercise.equipment, (usedEquipment.get(item.exercise.equipment) ?? 0) + 1);
    if (item.exercise.station !== undefined) usedStations.add(item.exercise.station);
    remaining.splice(best.offset, 1);
  }
  // Diversity chooses the set; score orders it within its tier.
  // Selecting greedily and showing that order would put a crowding
  // discount on screen as if it were quality, and leave the user
  // reading a worse second option than third.
  return [...ordered(chosen.filter((c) => c.match === "exact")), ...ordered(chosen.filter((c) => c.match === "related"))];
}

function adjusted(item: RankedAlternative, used: Map<Equipment, number>, chosen: RankedAlternative[]): number {
  const repeats = used.get(item.exercise.equipment) ?? 0;
  let closest: number | undefined;
  for (const c of chosen) {
    const s = similarity(c, item);
    if (closest === undefined || s > closest) closest = s;
  }
  return item.score + repeats * W.diversityRepeatEquipment + (closest ?? 0) * W.diversityCrowding;
}

/** How much two alternatives are the same suggestion. */
function similarity(a: RankedAlternative, b: RankedAlternative): number {
  const lhs = a.exercise.attributes;
  const rhs = b.exercise.attributes;
  if (lhs === undefined || rhs === undefined) return 0;
  return 0.6 * muscleOverlap(lhs, rhs) + 0.4 * patternScore(lhs.movementPattern, rhs.movementPattern);
}

/**
 * Picks up to three alternatives for an exercise.
 *
 * The shape of the thing: a few hard filters that remove what would be wrong,
 * a weighted similarity score over the objective attributes, small context
 * nudges on top, then a diversity pass so the three results are actually three
 * different answers. Curated copy decorates the result; it does not decide it.
 *
 * No weight is ever converted between exercises. The alternative arrives with
 * its own empty load, which the user fills in — TRAINING_LOGIC §12.2.
 */
export const SubstitutionRanker = {
  maxResults: 3,

  /**
   * Everything worth listing, for `Andere opties bekijken`.
   *
   * Same engine and the same hard filters — pain still excludes, the
   * occupied station still excludes — but no cap, no diversity, and the
   * structural rule is widened by one tier rather than dropped. A compound
   * under an isolation exercise arrives as `.broader`, so the surface can
   * say plainly that it changes the training intent instead of quietly
   * listing it beside a real substitute.
   */
  browse(
    context: SwapContext,
    a: { catalog?: Record<string, Exercise>; recommendable?: Set<string> } = {},
  ): RankedAlternative[] {
    const catalog = a.catalog ?? ExerciseCatalog.all;
    const recommendable = a.recommendable ?? ExerciseCatalog.v1Recommendable;
    const current = catalog[context.currentExerciseID];
    const currentAttributes = current?.attributes;
    if (current === undefined || currentAttributes === undefined) return [];

    const curated = curatedCopy({ for: context.currentExerciseID });
    const results = candidates(context, { current, currentAttributes, catalog, recommendable, widened: true })
      .map((c) => decorate(c, { curated }));

    return [
      ...ordered(results.filter((r) => r.match === "exact")),
      ...ordered(results.filter((r) => r.match === "related")),
      ...ordered(results.filter((r) => r.match === "broader")),
    ];
  },

  rank(
    context: SwapContext,
    a: { catalog?: Record<string, Exercise>; recommendable?: Set<string> } = {},
  ): RankedAlternative[] {
    const catalog = a.catalog ?? ExerciseCatalog.all;
    const recommendable = a.recommendable ?? ExerciseCatalog.v1Recommendable;
    const current = catalog[context.currentExerciseID];
    const currentAttributes = current?.attributes;
    if (current === undefined || currentAttributes === undefined) return [];

    const curated = curatedCopy({ for: context.currentExerciseID });

    const eligible = candidates(context, { current, currentAttributes, catalog, recommendable, widened: false })
      .map((c) => decorate(c, { curated }))
      .filter((r) => r.score >= W.floor);

    // The exact tier is exhausted before the related tier is touched.
    // Otherwise the diversity discount can push a same-pattern option
    // below a different-pattern one — which is how a lat pulldown ended
    // up recommending a T-bar row while three vertical pulls sat unused.
    const exact = ordered(eligible.filter((r) => r.match === "exact"));
    let chosen = applyDiversity(exact, { seeded: [] });
    if (chosen.length < SubstitutionRanker.maxResults) {
      const related = ordered(eligible.filter((r) => r.match === "related"));
      chosen = applyDiversity(related, { seeded: chosen });
    }

    // Diversity chooses the set; score orders each tier. An exact match
    // always precedes a related one, however they score.
    return chosen;
  },

  /**
   * Whether these load tags change what this context recommends.
   *
   * The sheet may only say it took a region into account when this is
   * true. A flag that removes and reorders nothing here is noted, not
   * claimed.
   */
  painChangesRecommendations(
    context: SwapContext,
    a: { tags: Set<LoadTag>; catalog?: Record<string, Exercise>; recommendable?: Set<string> },
  ): boolean {
    const { tags } = a;
    if (tags.size === 0) return false;
    const withTags: SwapContext = { ...context, painfulLoadTags: new Set([...context.painfulLoadTags, ...tags]) };
    const without: SwapContext = {
      ...context,
      painfulLoadTags: new Set([...context.painfulLoadTags].filter((t) => !tags.has(t))),
    };
    const options = { catalog: a.catalog, recommendable: a.recommendable };
    const x = SubstitutionRanker.rank(withTags, options).map((r) => r.exercise.id);
    const y = SubstitutionRanker.rank(without, options).map((r) => r.exercise.id);
    return !deepEqual(x, y);
  },

  // MARK: - Identity

  canonical(id: string): string {
    return ExerciseMetadata.canonicalID[id] ?? id;
  },
};
