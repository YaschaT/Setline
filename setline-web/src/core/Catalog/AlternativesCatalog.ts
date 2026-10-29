// Generated from app/page.tsx by scratchpad/gen/generate.py — do not hand-edit.
//
// The curated `fit` / `why` lines for each exercise's alternatives.
// TRAINING_LOGIC §12.1: the native app computes the ranking from attributes
// and "uses the written `why` lines as curated overrides where they exist".
// Phase 1 carries the content; Phase 3 adds the ranking that consumes it.
//
// Ported from ios/SetlineCore/Sources/SetlineCore/Catalog/AlternativesCatalog.swift
// by transforming its literals; every entry is the Swift one.

import { dictionary } from "../Support/dictionary";

export interface ExerciseAlternative {
  readonly name: string;
  /** One- or two-word honest fit label ("Strong match", "More stable"). */
  readonly fit: string;
  readonly why: string;
}

export const ExerciseAlternative = {
  make(p: { name: string; fit: string; why: string }): ExerciseAlternative {
    return { name: p.name, fit: p.fit, why: p.why };
  },
};

export const AlternativesCatalog = {
  byExercise: dictionary({
    "flat-bench": [
      ExerciseAlternative.make({
        name: "Dumbbell bench press",
        fit: "Same role",
        why: "Horizontal press with a big ROM; keep sets, reps and RIR but reset the weight.",
      }),
      ExerciseAlternative.make({
        name: "Converging chest press",
        fit: "More stable",
        why: "Same chest and triceps target with less stability demand. Handy when every bench is taken.",
      }),
    ],
    "upper-paused-bench": [
      ExerciseAlternative.make({
        name: "Flat bench press",
        fit: "No pause",
        why: "Keep the same press and load, but leave 1–2 extra reps in reserve because this is your second bench day.",
      }),
      ExerciseAlternative.make({
        name: "Dumbbell bench press",
        fit: "Less specific",
        why: "Good horizontal press when the bench is taken; keep 3 sets and work in 6–10 reps.",
      }),
    ],
    "incline-bench": [
      ExerciseAlternative.make({
        name: "Incline dumbbell press",
        fit: "Same pattern",
        why: "Incline press with free arm position and a deep, controllable chest stretch.",
      }),
      ExerciseAlternative.make({
        name: "Incline chest press machine",
        fit: "Same role",
        why: "More stability, so you can train close to failure without a spotter.",
      }),
    ],
    "incline-machine": [
      ExerciseAlternative.make({
        name: "Incline dumbbell press",
        fit: "Strong match",
        why: "Keeps the incline press and upper-chest focus; start conservatively with the weight.",
      }),
      ExerciseAlternative.make({
        name: "Low-to-high cable press",
        fit: "No machine needed",
        why: "Similar press direction and constant cable tension, with a lower absolute load.",
      }),
    ],
    "pec-fly": [
      ExerciseAlternative.make({
        name: "Cable fly",
        fit: "Same isolation",
        why: "Horizontal adduction with an adjustable line; keep the 10–15 rep range.",
      }),
      ExerciseAlternative.make({
        name: "Dumbbell fly",
        fit: "Fair match",
        why: "Similar target, but less tension at the top. Use a light weight and a controlled ROM.",
      }),
    ],
    "upper-fly": [
      ExerciseAlternative.make({
        name: "Pec-deck",
        fit: "Strong match",
        why: "Stable chest isolation; easy to progress and to train close to failure.",
      }),
      ExerciseAlternative.make({
        name: "Cable fly",
        fit: "1-to-1",
        why: "Keep the same line, rep range and full pain-free ROM.",
      }),
    ],
    "push-shoulder": [
      ExerciseAlternative.make({
        name: "Seated dumbbell press",
        fit: "Same pattern",
        why: "Vertical press with free arm position; lower the starting weight and keep RIR 1–2.",
      }),
      ExerciseAlternative.make({
        name: "Smith shoulder press",
        fit: "Stable match",
        why: "Vertical press with less stability demand and predictable progress.",
      }),
    ],
    "upper-shoulder": [
      ExerciseAlternative.make({
        name: "Seated dumbbell press",
        fit: "Same pattern",
        why: "Vertical press and similar target muscles; reset the load.",
      }),
      ExerciseAlternative.make({
        name: "Smith shoulder press",
        fit: "Stable match",
        why: "Handy for training safely close to failure in the same rep range.",
      }),
    ],
    "push-lateral": [
      ExerciseAlternative.make({
        name: "Machine lateral raise",
        fit: "Strong match",
        why: "Same shoulder abduction with extra stability; keep 12–20 reps.",
      }),
      ExerciseAlternative.make({
        name: "Dumbbell lateral raise",
        fit: "Practical swap",
        why: "Same target muscle, but a different resistance curve. Use strict technique.",
      }),
    ],
    "legs-lateral": [
      ExerciseAlternative.make({
        name: "Machine lateral raise",
        fit: "Strong match",
        why: "Same shoulder abduction with less coordination demand.",
      }),
      ExerciseAlternative.make({
        name: "Dumbbell lateral raise",
        fit: "Practical swap",
        why: "Keep the reps high and stop as soon as you have to swing.",
      }),
    ],
    "upper-lateral": [
      ExerciseAlternative.make({
        name: "Machine lateral raise",
        fit: "Strong match",
        why: "Same target and simple progress in the 12–20 rep range.",
      }),
      ExerciseAlternative.make({
        name: "Dumbbell lateral raise",
        fit: "Practical swap",
        why: "Same target muscle; don't compare the dumbbell weight with the cable load.",
      }),
    ],
    "science-lateral": [
      ExerciseAlternative.make({
        name: "Machine lateral raise",
        fit: "Strong match",
        why: "A stable alternative you can take close to failure.",
      }),
      ExerciseAlternative.make({
        name: "Dumbbell lateral raise",
        fit: "Practical swap",
        why: "Same target muscle with a different resistance curve; keep the reps strict.",
      }),
    ],
    "overhead-triceps": [
      ExerciseAlternative.make({
        name: "Overhead dumbbell extension",
        fit: "Same arm position",
        why: "Keeps shoulder flexion and triceps work at a long muscle length.",
      }),
      ExerciseAlternative.make({
        name: "EZ-bar skull crusher",
        fit: "Strong match",
        why: "Similar elbow extension; pick a pain-free angle and a controlled lowering phase.",
      }),
    ],
    "pressdown": [
      ExerciseAlternative.make({
        name: "Single-arm cable pressdown",
        fit: "1-to-1",
        why: "Same elbow extension and rep range, with a free wrist position.",
      }),
      ExerciseAlternative.make({
        name: "Machine dip",
        fit: "Compound swap",
        why: "More chest and shoulder involvement; only use it if you want a compound.",
      }),
    ],
    "upper-pressdown": [
      ExerciseAlternative.make({
        name: "Single-arm cable pressdown",
        fit: "1-to-1",
        why: "Same target with a free wrist position and one arm at a time.",
      }),
      ExerciseAlternative.make({
        name: "Cross-body cable extension",
        fit: "Strong match",
        why: "Same elbow function; easy to set up pain-free.",
      }),
    ],
    "pull-up": [
      ExerciseAlternative.make({
        name: "Neutral-grip lat pulldown",
        fit: "Same vertical pull",
        why: "Similar lat and arm function, but easier to load precisely.",
      }),
      ExerciseAlternative.make({
        name: "Assisted pull-up",
        fit: "1-to-1 pattern",
        why: "Keeps the pull-up movement when bodyweight or added weight doesn't fit.",
      }),
    ],
    "lat-pulldown": [
      ExerciseAlternative.make({
        name: "Neutral-grip pull-up",
        fit: "Same vertical pull",
        why: "Keeps the direction and big ROM; log the added load separately.",
      }),
      ExerciseAlternative.make({
        name: "Single-arm cable pulldown",
        fit: "Unilateral match",
        why: "Same shoulder extension with more freedom for elbow path and stretch.",
      }),
    ],
    "kneeling-lat": [
      ExerciseAlternative.make({
        name: "Single-arm seated pulldown",
        fit: "1-to-1",
        why: "Same one-sided lat function with extra trunk stability.",
      }),
      ExerciseAlternative.make({
        name: "Neutral-grip pulldown",
        fit: "Strong match",
        why: "Two-armed vertical pull that is easier to load.",
      }),
    ],
    "neutral-row": [
      ExerciseAlternative.make({
        name: "Neutral cable row",
        fit: "Same pulling path",
        why: "Horizontal pull with a similar elbow path; keep your torso stable.",
      }),
      ExerciseAlternative.make({
        name: "Chest-supported dumbbell row",
        fit: "Strong match",
        why: "Same back target without your lower back as the limiting factor.",
      }),
    ],
    "wide-row": [
      ExerciseAlternative.make({
        name: "Wide cable row",
        fit: "Same pulling path",
        why: "Elbows out for upper back and rear delts; keep your chest position.",
      }),
      ExerciseAlternative.make({
        name: "Chest-supported rear-delt row",
        fit: "Strong match",
        why: "Similar upper-back focus with dumbbells and a fixed bench.",
      }),
    ],
    "upper-wide-row": [
      ExerciseAlternative.make({
        name: "Wide cable row",
        fit: "Same pulling path",
        why: "Keeps the horizontal pull and upper-back focus.",
      }),
      ExerciseAlternative.make({
        name: "Chest-supported dumbbell row",
        fit: "Strong match",
        why: "Stable horizontal pull without extra load on your lower back.",
      }),
    ],
    "reverse-pec": [
      ExerciseAlternative.make({
        name: "Cable rear-delt fly",
        fit: "Same isolation",
        why: "Same target muscle and a controllable line; keep 12–20 reps.",
      }),
      ExerciseAlternative.make({
        name: "Chest-supported rear-delt row",
        fit: "More compound",
        why: "Similar rear-delt target with more upper-back involvement.",
      }),
    ],
    "rear-delt": [
      ExerciseAlternative.make({
        name: "Reverse pec deck",
        fit: "Strong match",
        why: "Stable rear-delt isolation that is easy to progress.",
      }),
      ExerciseAlternative.make({
        name: "Cable rear-delt fly",
        fit: "Same isolation",
        why: "Free cable direction and constant tension; keep the reps high.",
      }),
    ],
    "strict-curl": [
      ExerciseAlternative.make({
        name: "Bayesian cable curl",
        fit: "Same arm target",
        why: "Biceps work with tension in a lengthened position; reset the weight.",
      }),
      ExerciseAlternative.make({
        name: "Incline dumbbell curl",
        fit: "Strong match",
        why: "Free dumbbell variant with little room for momentum.",
      }),
    ],
    "science-preacher": [
      ExerciseAlternative.make({
        name: "Machine preacher curl",
        fit: "1-to-1",
        why: "Same stabilised upper arm and simple progress.",
      }),
      ExerciseAlternative.make({
        name: "Spider curl",
        fit: "Strong match",
        why: "Limits momentum, but has a different resistance curve.",
      }),
    ],
    "hammer-curl": [
      ExerciseAlternative.make({
        name: "Rope hammer curl",
        fit: "1-to-1 grip",
        why: "Neutral grip and the same arm flexors with constant cable tension.",
      }),
      ExerciseAlternative.make({
        name: "Cross-body hammer curl",
        fit: "Strong match",
        why: "Same neutral grip, one arm at a time and little setup.",
      }),
    ],
    "cable-curl": [
      ExerciseAlternative.make({
        name: "Machine preacher curl",
        fit: "Stable match",
        why: "Same biceps target and easy to train close to failure.",
      }),
      ExerciseAlternative.make({
        name: "Incline dumbbell curl",
        fit: "Free-weight variant",
        why: "Keeps a long muscle length, but resets the load.",
      }),
    ],
    "hack-squat": [
      ExerciseAlternative.make({
        name: "Leg press",
        fit: "Same knee focus",
        why: "Stable quad-dominant compound; match depth and RIR, not the absolute weight.",
      }),
      ExerciseAlternative.make({
        name: "Heel-elevated Smith squat",
        fit: "Strong match",
        why: "Deep knee flexion and a fixed path; pick a pain-free stance.",
      }),
    ],
    "bulgarian": [
      ExerciseAlternative.make({
        name: "Reverse lunge",
        fit: "Unilateral match",
        why: "Same legs one at a time, often a little easier to balance.",
      }),
      ExerciseAlternative.make({
        name: "Single-leg press",
        fit: "More stable",
        why: "Keeps one-sided loading with less stability demand.",
      }),
    ],
    "seated-curl": [
      ExerciseAlternative.make({
        name: "Single-leg seated curl",
        fit: "1-to-1",
        why: "Same hip angle and knee bend, one leg at a time.",
      }),
      ExerciseAlternative.make({
        name: "Lying leg curl",
        fit: "Same function",
        why: "The knee bend stays the same, but the hamstrings start less stretched.",
      }),
    ],
    "lying-curl": [
      ExerciseAlternative.make({
        name: "Seated leg curl",
        fit: "Strong hypertrophy swap",
        why: "The hip flexion trains the hamstrings longer; one study found more growth than with lying curls.",
      }),
      ExerciseAlternative.make({
        name: "Nordic hamstring curl",
        fit: "Harder swap",
        why: "Knee bend with heavy lowering load; use assistance to make the rep range achievable.",
      }),
    ],
    "leg-extension": [
      ExerciseAlternative.make({
        name: "Sissy squat machine",
        fit: "Quad isolation",
        why: "Lots of knee flexion with little hip involvement; only in a pain-free ROM.",
      }),
      ExerciseAlternative.make({
        name: "Reverse Nordic",
        fit: "Bodyweight swap",
        why: "Quad-dominant alternative; scale the ROM and stay in control.",
      }),
    ],
    "rdl": [
      ExerciseAlternative.make({
        name: "Dumbbell Romanian deadlift",
        fit: "1-to-1 pattern",
        why: "Same hip hinge and hamstring stretch. Keep sets/reps/RIR, but reset the weight.",
      }),
      ExerciseAlternative.make({
        name: "Assisted Nordic hamstring curl",
        fit: "Same goal, different pattern",
        why: "A 2025 RCT found similar hamstring architecture and growth as eccentric RDL training; it doesn't replace the glute and hinge stimulus.",
      }),
    ],
    "leg-press": [
      ExerciseAlternative.make({
        name: "Hack squat",
        fit: "Same knee focus",
        why: "Stable compound with deep knee flexion; compare effort and ROM, not kilos.",
      }),
      ExerciseAlternative.make({
        name: "Heel-elevated Smith squat",
        fit: "Strong match",
        why: "Quad-dominant squat with a fixed path and predictable progress.",
      }),
    ],
    "hip-thrust": [
      ExerciseAlternative.make({
        name: "Smith glute bridge",
        fit: "Same shortened position",
        why: "Horizontal hip extension with a stable lockout and less setup.",
      }),
      ExerciseAlternative.make({
        name: "45° hip extension",
        fit: "Same hip function",
        why: "Train glutes and hamstrings through hip extension; don't round your lower back to finish the rep.",
      }),
    ],
    "standing-calf": [
      ExerciseAlternative.make({
        name: "Leg-press calf raise",
        fit: "Straight-knee match",
        why: "Same gastrocnemius bias and easy progress with a full stretch.",
      }),
      ExerciseAlternative.make({
        name: "Single-leg standing calf raise",
        fit: "Unilateral match",
        why: "Same knee position with less total weight needed.",
      }),
    ],
    "seated-calf": [
      ExerciseAlternative.make({
        name: "Bent-knee calf raise on leg press",
        fit: "Soleus match",
        why: "A bent knee keeps the soleus focus; train through the full ROM.",
      }),
      ExerciseAlternative.make({
        name: "Dumbbell seated calf raise",
        fit: "Practical swap",
        why: "Same knee position when the machine is taken; add weight in a stable way.",
      }),
    ],
    "cable-crunch": [
      ExerciseAlternative.make({
        name: "Machine crunch",
        fit: "Same trunk flexion",
        why: "A stable alternative that is easy to progress.",
      }),
      ExerciseAlternative.make({
        name: "Weighted decline crunch",
        fit: "Free-weight variant",
        why: "Same dynamic ab function; hold the load against your chest.",
      }),
    ],
    "hanging-raise": [
      ExerciseAlternative.make({
        name: "Captain's-chair knee raise",
        fit: "More stable",
        why: "Same pelvic tilt with grip less of a limiting factor.",
      }),
      ExerciseAlternative.make({
        name: "Reverse crunch",
        fit: "Floor variant",
        why: "Keep the pelvic movement and only add reps without swinging.",
      }),
    ],
  }) as Record<string, ExerciseAlternative[]>,

  alternatives(a: { for: string }): ExerciseAlternative[] {
    return AlternativesCatalog.byExercise[a.for] ?? [];
  },
};
