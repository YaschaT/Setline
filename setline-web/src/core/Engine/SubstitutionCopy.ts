import type { Exercise } from "../Domain/Model";
import type { Equipment } from "../Domain/Vocabulary";
import type { ResistanceProfile } from "../Domain/ExerciseAttributes";
import type { RankedAlternative } from "./SubstitutionRanking";

function profilePhrase(profile: ResistanceProfile): string {
  switch (profile) {
    case "lengthenedBias": return "hardest in the stretch";
    case "shortenedBias": return "hardest in the squeeze";
    case "flatCable": return "even resistance";
    case "midRangeBias": return "hardest mid-range";
  }
}

function setupPhrase(cost: number): string {
  if (cost <= 1) return "ready right away";
  if (cost === 2) return "quick setup";
  return "load plates";
}

function equipmentPhrase(equipment: Equipment): string {
  switch (equipment) {
    case "barbell": return "with a barbell";
    case "dumbbell": return "with dumbbells";
    case "machinePlate": return "on a plate-loaded machine";
    case "machineSelectorised": return "on a pin-loaded machine";
    case "cable": return "on the cable";
    case "smith": return "in the Smith machine";
    case "bodyweight": return "with your bodyweight";
    case "band": return "with a band";
  }
}

/**
 * The first fact about this alternative that none of the others shares.
 *
 * Ordered by what a person in a gym actually decides on: what it is
 * loaded with, where in the range it is hardest, whether it is one side
 * at a time, and how much there is to set up.
 */
function discriminator(alternative: RankedAlternative, others: RankedAlternative[]): string | undefined {
  const peers = others.filter((o) => o.exercise.id !== alternative.exercise.id);
  const candidates: ((r: RankedAlternative) => string | undefined)[] = [
    (r) => equipmentPhrase(r.exercise.equipment),
    (r) => (r.exercise.attributes !== undefined ? profilePhrase(r.exercise.attributes.resistanceProfile) : undefined),
    (r) => (r.exercise.unilateral ? "per side" : undefined),
    (r) => (r.exercise.attributes !== undefined ? setupPhrase(r.exercise.attributes.heuristics.setupCost) : undefined),
  ];
  for (const candidate of candidates) {
    const mine = candidate(alternative);
    if (mine === undefined) continue;
    if (peers.every((p) => candidate(p) !== mine)) return mine;
  }
  // Nothing in the model actually tells these apart — a seated and a
  // standing calf raise differ by knee angle, which we do not record.
  // Saying nothing is right: the two names above the lines are the
  // difference, and an identical suffix on both would imply one that
  // the app cannot see.
  return undefined;
}

/**
 * The words the swap sheet puts next to an alternative.
 *
 * Two rules govern all of it. Curated copy wins wherever it exists — a line
 * someone wrote about this specific pair beats anything generated. And the
 * strongest label is gated: `Sterke match` is a claim, so it has to be
 * earned on both the score and the muscle overlap, not on the score alone.
 */
export const SubstitutionCopy = {
  /**
   * Score and overlap a result must both clear before the app will call it
   * a strong match.
   */
  strongScore: 0.75,
  strongOverlap: 0.80,

  /**
   * How close a result is, as the meter beside it shows: 3 a strong match,
   * 2 a good one, 1 everything that changes the movement or the setup.
   */
  strength(alternative: RankedAlternative): 1 | 2 | 3 {
    if (alternative.match === "broader" || alternative.match === "related") return 1;
    if (alternative.score >= SubstitutionCopy.strongScore && alternative.muscleOverlap >= SubstitutionCopy.strongOverlap) return 3;
    if (alternative.muscleOverlap >= 0.65) return 2;
    return 1;
  },

  /** "Dumbbell", for the line under a result's name. */
  equipmentLabel(equipment: Equipment): string {
    switch (equipment) {
      case "barbell": return "Barbell";
      case "dumbbell": return "Dumbbells";
      case "machinePlate": return "Plate machine";
      case "machineSelectorised": return "Machine";
      case "cable": return "Cable";
      case "smith": return "Smith machine";
      case "bodyweight": return "Bodyweight";
      case "band": return "Band";
    }
  },

  fit(alternative: RankedAlternative): string {
    if (alternative.curatedFit !== undefined) return alternative.curatedFit;
    if (alternative.match === "broader") return "Different setup";
    if (alternative.match === "related") return "Different movement";
    if (alternative.score >= SubstitutionCopy.strongScore && alternative.muscleOverlap >= SubstitutionCopy.strongOverlap) {
      return "Strong match";
    }
    if (alternative.muscleOverlap >= 0.65) return "Good match";
    return "Partly similar";
  },

  /**
   * One line of honest reasoning. Generated from what actually carried the
   * result, so it can never claim more than the ranking found.
   */
  why(alternative: RankedAlternative, a: { origin: Exercise; alongside?: RankedAlternative[] }): string {
    const others = a.alongside ?? [];
    if (alternative.curatedWhy !== undefined) return alternative.curatedWhy;

    const exercise = alternative.exercise;
    const reasons: string[] = [];

    if (alternative.match === "broader") {
      reasons.push(`Trains the same muscle, but as ${exercise.isCompound ? "a compound" : "a different"} exercise`);
    } else if (alternative.match === "related") {
      reasons.push(`Different movement from ${a.origin.name.toLowerCase()}, same muscle group`);
    } else if (alternative.muscleOverlap >= SubstitutionCopy.strongOverlap) {
      reasons.push("Trains the same muscles in the same movement");
    } else {
      reasons.push("Same movement, slightly different emphasis");
    }

    let namedADifference = false;
    for (const driver of alternative.drivers.slice(0, 2)) {
      switch (driver) {
        case "easierToStabilise":
          reasons.push("needs less stability");
          namedADifference = true;
          break;
        case "quickerToSetUp":
          reasons.push("quicker to set up");
          namedADifference = true;
          break;
        case "differentEquipment":
          reasons.push("different equipment");
          namedADifference = true;
          break;
        case "differentStation":
          reasons.push("different machine");
          namedADifference = true;
          break;
        case "alreadyFamiliar":
          reasons.push("you've done this one before");
          namedADifference = true;
          break;
        case "sameMuscles":
        case "samePattern":
        case "sameJointActions":
        case "sameResistanceProfile":
        case "fitsRole":
          continue;
      }
    }

    // Three equally strong alternatives otherwise read identically, which
    // tells the user nothing about how to choose between them. Say the
    // thing that actually tells them apart — and if the obvious one
    // (the apparatus) is shared, keep going until something isn't.
    if (!namedADifference) {
      const phrase = discriminator(alternative, others);
      if (phrase !== undefined) reasons.push(phrase);
    }
    return reasons.join(" · ") + ".";
  },

  /**
   * The line that appears under every alternative, without exception. It
   * is the promise the swap makes: the prescription survives, the load
   * does not carry over (§12.3 — no conversion, in either direction).
   */
  carryOver: "Sets, reps and RIR stay · weight resets",
};
