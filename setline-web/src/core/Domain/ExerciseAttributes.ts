// MARK: - Relatively objective: what the exercise physically is

export type Muscle =
  | "chestUpper"
  | "chestMid"
  | "frontDelt"
  | "sideDelt"
  | "rearDelt"
  | "triceps"
  | "biceps"
  | "forearm"
  | "lat"
  | "upperBack"
  | "lowerBack"
  | "trap"
  | "glute"
  | "hamstring"
  | "quad"
  | "adductor"
  | "calf"
  | "abs"
  | "obliques";

const muscleCases: Muscle[] = [
  "chestUpper",
  "chestMid",
  "frontDelt",
  "sideDelt",
  "rearDelt",
  "triceps",
  "biceps",
  "forearm",
  "lat",
  "upperBack",
  "lowerBack",
  "trap",
  "glute",
  "hamstring",
  "quad",
  "adductor",
  "calf",
  "abs",
  "obliques",
];

/**
 * How much work done by one muscle counts as work done by another.
 *
 * Judgement, not anatomy: it exists because the enum splits the chest
 * into upper and mid, so without it an incline press and a flat press
 * look like unrelated exercises to the ranking. Symmetric, 0…1, and
 * 1 with itself.
 */
const kinship = new Map<Set<Muscle>, number>([
  [new Set<Muscle>(["chestUpper", "chestMid"]), 0.6],
  [new Set<Muscle>(["chestUpper", "frontDelt"]), 0.4],
  [new Set<Muscle>(["frontDelt", "sideDelt"]), 0.35],
  [new Set<Muscle>(["sideDelt", "rearDelt"]), 0.3],
  [new Set<Muscle>(["rearDelt", "upperBack"]), 0.45],
  [new Set<Muscle>(["lat", "upperBack"]), 0.5],
  [new Set<Muscle>(["upperBack", "trap"]), 0.6],
  [new Set<Muscle>(["biceps", "forearm"]), 0.4],
  [new Set<Muscle>(["glute", "hamstring"]), 0.45],
  [new Set<Muscle>(["glute", "quad"]), 0.3],
  [new Set<Muscle>(["glute", "lowerBack"]), 0.3],
  [new Set<Muscle>(["hamstring", "lowerBack"]), 0.35],
  [new Set<Muscle>(["quad", "adductor"]), 0.4],
  [new Set<Muscle>(["abs", "obliques"]), 0.6],
]);

/**
 * `kinship` flattened into a lookup, because the ranking asks this
 * question tens of thousands of times.
 */
const kinTable: Record<Muscle, Partial<Record<Muscle, number>>> = (() => {
  const table = {} as Record<Muscle, Partial<Record<Muscle, number>>>;
  for (const muscle of muscleCases) table[muscle] = { [muscle]: 1 };
  for (const [pair, weight] of kinship) {
    const members = [...pair];
    if (members.length !== 2) continue;
    table[members[0]][members[1]] = weight;
    table[members[1]][members[0]] = weight;
  }
  return table;
})();

export const Muscle = {
  chestUpper: "chestUpper" as Muscle,
  chestMid: "chestMid" as Muscle,
  frontDelt: "frontDelt" as Muscle,
  sideDelt: "sideDelt" as Muscle,
  rearDelt: "rearDelt" as Muscle,
  triceps: "triceps" as Muscle,
  biceps: "biceps" as Muscle,
  forearm: "forearm" as Muscle,
  lat: "lat" as Muscle,
  upperBack: "upperBack" as Muscle,
  lowerBack: "lowerBack" as Muscle,
  trap: "trap" as Muscle,
  glute: "glute" as Muscle,
  hamstring: "hamstring" as Muscle,
  quad: "quad" as Muscle,
  adductor: "adductor" as Muscle,
  calf: "calf" as Muscle,
  abs: "abs" as Muscle,
  obliques: "obliques" as Muscle,
  allCases: muscleCases,

  kinship,
  kinTable,

  /** Non-zero neighbours only, including self. */
  kin(self: Muscle): Partial<Record<Muscle, number>> {
    return kinTable[self] ?? { [self]: 1 };
  },
};

export interface MuscleContribution {
  readonly muscle: Muscle;
  /** 0…1. Primary contributions sum to roughly 1 per exercise. */
  readonly weight: number;
}
export const MuscleContribution = {
  make(muscle: Muscle, weight: number): MuscleContribution {
    return { muscle, weight };
  },
};

export type JointAction =
  | "shoulderHorizontalAdduction"
  | "shoulderHorizontalAbduction"
  | "shoulderFlexion"
  | "shoulderAbduction"
  | "shoulderExtension"
  | "scapularRetraction"
  | "elbowFlexion"
  | "elbowExtension"
  | "hipExtension"
  | "hipFlexion"
  | "kneeExtension"
  | "kneeFlexion"
  | "anklePlantarflexion"
  | "spinalFlexion"
  | "hipAbduction"
  | "hipAdduction"
  | "scapularElevation"
  | "spinalRotation";
export const JointAction = {
  shoulderHorizontalAdduction: "shoulderHorizontalAdduction" as JointAction,
  shoulderHorizontalAbduction: "shoulderHorizontalAbduction" as JointAction,
  shoulderFlexion: "shoulderFlexion" as JointAction,
  shoulderAbduction: "shoulderAbduction" as JointAction,
  shoulderExtension: "shoulderExtension" as JointAction,
  scapularRetraction: "scapularRetraction" as JointAction,
  elbowFlexion: "elbowFlexion" as JointAction,
  elbowExtension: "elbowExtension" as JointAction,
  hipExtension: "hipExtension" as JointAction,
  hipFlexion: "hipFlexion" as JointAction,
  kneeExtension: "kneeExtension" as JointAction,
  kneeFlexion: "kneeFlexion" as JointAction,
  anklePlantarflexion: "anklePlantarflexion" as JointAction,
  spinalFlexion: "spinalFlexion" as JointAction,
  hipAbduction: "hipAbduction" as JointAction,
  hipAdduction: "hipAdduction" as JointAction,
  scapularElevation: "scapularElevation" as JointAction,
  spinalRotation: "spinalRotation" as JointAction,
  allCases: [
    "shoulderHorizontalAdduction",
    "shoulderHorizontalAbduction",
    "shoulderFlexion",
    "shoulderAbduction",
    "shoulderExtension",
    "scapularRetraction",
    "elbowFlexion",
    "elbowExtension",
    "hipExtension",
    "hipFlexion",
    "kneeExtension",
    "kneeFlexion",
    "anklePlantarflexion",
    "spinalFlexion",
    "hipAbduction",
    "hipAdduction",
    "scapularElevation",
    "spinalRotation",
  ] as JointAction[],
};

export type MovementPattern =
  | "horizontalPress"
  | "verticalPress"
  | "horizontalPull"
  | "verticalPull"
  | "squat"
  | "hinge"
  | "lunge"
  | "isolationFlexion"
  | "isolationExtension"
  | "isolationAbduction";
export const MovementPattern = {
  horizontalPress: "horizontalPress" as MovementPattern,
  verticalPress: "verticalPress" as MovementPattern,
  horizontalPull: "horizontalPull" as MovementPattern,
  verticalPull: "verticalPull" as MovementPattern,
  squat: "squat" as MovementPattern,
  hinge: "hinge" as MovementPattern,
  lunge: "lunge" as MovementPattern,
  isolationFlexion: "isolationFlexion" as MovementPattern,
  isolationExtension: "isolationExtension" as MovementPattern,
  isolationAbduction: "isolationAbduction" as MovementPattern,
  allCases: [
    "horizontalPress",
    "verticalPress",
    "horizontalPull",
    "verticalPull",
    "squat",
    "hinge",
    "lunge",
    "isolationFlexion",
    "isolationExtension",
    "isolationAbduction",
  ] as MovementPattern[],

  /**
   * Single-joint patterns. An isolation exercise's substitute has to be
   * another isolation exercise: a compound that happens to train the same
   * muscle is a different training intent, not a swap.
   */
  isIsolation(self: MovementPattern): boolean {
    switch (self) {
      case "isolationFlexion":
      case "isolationExtension":
      case "isolationAbduction":
        return true;
      case "horizontalPress":
      case "verticalPress":
      case "horizontalPull":
      case "verticalPull":
      case "squat":
      case "hinge":
      case "lunge":
        return false;
    }
  },

  /**
   * Patterns that are near neighbours. Crossing a family is not a
   * substitution; crossing a pattern inside one is a broader alternative.
   */
  family(self: MovementPattern): MovementFamily {
    switch (self) {
      case "horizontalPress":
      case "verticalPress":
        return "press";
      case "horizontalPull":
      case "verticalPull":
        return "pull";
      case "squat":
      case "lunge":
        return "legPush";
      case "hinge":
        return "legHinge";
      case "isolationFlexion":
      case "isolationExtension":
      case "isolationAbduction":
        return "isolation";
    }
  },
};

export type MovementFamily = "press" | "pull" | "legPush" | "legHinge" | "isolation";
export const MovementFamily = {
  press: "press" as MovementFamily,
  pull: "pull" as MovementFamily,
  legPush: "legPush" as MovementFamily,
  legHinge: "legHinge" as MovementFamily,
  isolation: "isolation" as MovementFamily,
};

export type ResistanceProfile = "lengthenedBias" | "midRangeBias" | "shortenedBias" | "flatCable";
export const ResistanceProfile = {
  lengthenedBias: "lengthenedBias" as ResistanceProfile,
  midRangeBias: "midRangeBias" as ResistanceProfile,
  shortenedBias: "shortenedBias" as ResistanceProfile,
  flatCable: "flatCable" as ResistanceProfile,
  allCases: ["lengthenedBias", "midRangeBias", "shortenedBias", "flatCable"] as ResistanceProfile[],
};

/** Positions and loads a discomfort flag can exclude (§14.2, §12.2). */
export type LoadTag =
  | "axialSpinalLoad"
  | "overheadPosition"
  | "deepKneeFlexion"
  | "endRangeShoulder"
  | "wristExtension"
  | "gripLimited"
  | "elbowCompression"
  | "lumbarFlexion";
export const LoadTag = {
  axialSpinalLoad: "axialSpinalLoad" as LoadTag,
  overheadPosition: "overheadPosition" as LoadTag,
  deepKneeFlexion: "deepKneeFlexion" as LoadTag,
  endRangeShoulder: "endRangeShoulder" as LoadTag,
  wristExtension: "wristExtension" as LoadTag,
  gripLimited: "gripLimited" as LoadTag,
  elbowCompression: "elbowCompression" as LoadTag,
  lumbarFlexion: "lumbarFlexion" as LoadTag,
  allCases: [
    "axialSpinalLoad",
    "overheadPosition",
    "deepKneeFlexion",
    "endRangeShoulder",
    "wristExtension",
    "gripLimited",
    "elbowCompression",
    "lumbarFlexion",
  ] as LoadTag[],
};

/**
 * A single physical apparatus, where two exercises genuinely contend for it.
 *
 * Deliberately sparse. It exists so that "the bench is taken" can rule out
 * the paused bench on the same rack — not so that one busy selectorised
 * machine can rule out every selectorised machine in the gym. Cable
 * stations and free weights carry no station at all, because a gym has
 * several of each; they are handled by the equipment-overlap nudge in the
 * ranking instead.
 */
export type Station =
  | "flatBenchRack"
  | "inclineBenchRack"
  | "smithRack"
  | "pullUpBar"
  | "dipStation"
  | "latPulldown"
  | "chestSupportedRow"
  | "tBarRow"
  | "assistedPullUp"
  | "chestPressMachine"
  | "inclineChestPress"
  | "shoulderPressMachine"
  | "pecDeck"
  | "lateralRaiseMachine"
  | "abCrunchMachine"
  | "hackSquat"
  | "legPress"
  | "seatedLegCurl"
  | "lyingLegCurl"
  | "legExtension"
  | "hipThrustMachine"
  | "standingCalf"
  | "seatedCalf"
  | "squatRack"
  | "hipAbductionMachine"
  | "hipAdductionMachine";
export const Station = {
  flatBenchRack: "flatBenchRack" as Station,
  inclineBenchRack: "inclineBenchRack" as Station,
  smithRack: "smithRack" as Station,
  pullUpBar: "pullUpBar" as Station,
  dipStation: "dipStation" as Station,
  latPulldown: "latPulldown" as Station,
  chestSupportedRow: "chestSupportedRow" as Station,
  tBarRow: "tBarRow" as Station,
  assistedPullUp: "assistedPullUp" as Station,
  chestPressMachine: "chestPressMachine" as Station,
  inclineChestPress: "inclineChestPress" as Station,
  shoulderPressMachine: "shoulderPressMachine" as Station,
  pecDeck: "pecDeck" as Station,
  lateralRaiseMachine: "lateralRaiseMachine" as Station,
  abCrunchMachine: "abCrunchMachine" as Station,
  hackSquat: "hackSquat" as Station,
  legPress: "legPress" as Station,
  seatedLegCurl: "seatedLegCurl" as Station,
  lyingLegCurl: "lyingLegCurl" as Station,
  legExtension: "legExtension" as Station,
  hipThrustMachine: "hipThrustMachine" as Station,
  standingCalf: "standingCalf" as Station,
  seatedCalf: "seatedCalf" as Station,
  squatRack: "squatRack" as Station,
  hipAbductionMachine: "hipAbductionMachine" as Station,
  hipAdductionMachine: "hipAdductionMachine" as Station,
  allCases: [
    "flatBenchRack",
    "inclineBenchRack",
    "smithRack",
    "pullUpBar",
    "dipStation",
    "latPulldown",
    "chestSupportedRow",
    "tBarRow",
    "assistedPullUp",
    "chestPressMachine",
    "inclineChestPress",
    "shoulderPressMachine",
    "pecDeck",
    "lateralRaiseMachine",
    "abCrunchMachine",
    "hackSquat",
    "legPress",
    "seatedLegCurl",
    "lyingLegCurl",
    "legExtension",
    "hipThrustMachine",
    "standingCalf",
    "seatedCalf",
    "squatRack",
    "hipAbductionMachine",
    "hipAdductionMachine",
  ] as Station[],
};

// MARK: - Judgement: useful defaults, not measurements

/**
 * Coaching heuristics.
 *
 * None of these is a measured quantity. They exist to order a list, they are
 * never shown to the user as evidence, and no copy anywhere may describe
 * them as research. Each set carries the reasoning behind its numbers,
 * because a heuristic without a stated reason is indistinguishable from a
 * fact.
 */
export interface ExerciseHeuristics {
  /** 1 = fully supported machine · 5 = free-standing or unilateral. */
  readonly stabilityDemand: number;
  /** Systemic cost, not local burn. 1 = seated isolation · 5 = heavy axial compound. */
  readonly fatigueCost: number;
  /** 1 = sit down and go · 2 = fetch dumbbells or adjust a bench · 3 = load plates, set a rack. */
  readonly setupCost: number;
  /** Why these three numbers. */
  readonly rationale: string;
}
export const ExerciseHeuristics = {
  make(p: { stabilityDemand: number; fatigueCost: number; setupCost: number; rationale: string }): ExerciseHeuristics {
    return {
      stabilityDemand: p.stabilityDemand,
      fatigueCost: p.fatigueCost,
      setupCost: p.setupCost,
      rationale: p.rationale,
    };
  },
};

export interface ExerciseAttributes {
  readonly primaryMuscles: MuscleContribution[];
  readonly secondaryMuscles: MuscleContribution[];
  readonly jointActions: Set<JointAction>;
  readonly movementPattern: MovementPattern;
  readonly resistanceProfile: ResistanceProfile;
  readonly lengthenedBiasedROM: boolean;
  readonly loadTags: Set<LoadTag>;
  readonly heuristics: ExerciseHeuristics;
}
export const ExerciseAttributes = {
  make(p: {
    primaryMuscles: MuscleContribution[];
    secondaryMuscles?: MuscleContribution[];
    jointActions: Set<JointAction>;
    movementPattern: MovementPattern;
    resistanceProfile: ResistanceProfile;
    lengthenedBiasedROM?: boolean;
    loadTags?: Set<LoadTag>;
    heuristics: ExerciseHeuristics;
  }): ExerciseAttributes {
    return {
      primaryMuscles: p.primaryMuscles,
      secondaryMuscles: p.secondaryMuscles ?? [],
      jointActions: p.jointActions,
      movementPattern: p.movementPattern,
      resistanceProfile: p.resistanceProfile,
      lengthenedBiasedROM: p.lengthenedBiasedROM ?? false,
      loadTags: p.loadTags ?? new Set<LoadTag>(),
      heuristics: p.heuristics,
    };
  },
};
