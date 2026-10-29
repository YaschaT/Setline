// Generated from app/page.tsx by scratchpad/gen/generate.py — do not hand-edit.
//
// The four plans the web app ships, with their prescriptions typed at
// generation time. TRAINING_LOGIC §15 change 1: the regex that parsed
// "1×5–6 + 2×6–8" at runtime does not survive into the native app — the
// parse happens here, once, and the app only ever sees typed sets.
//
// Each exercise keeps the Dutch strings it was authored with in
// `authoredNote`, so the coaching nuance in "120 kg → 105–110 kg" and
// "Topset + back-offs · RIR 1–2" is displayed, not discarded.
//
// Ported from ios/SetlineCore/Sources/SetlineCore/Catalog/PlanCatalog.swift
// by transforming its literals; every entry is the Swift one.

import { LegacyPrescriptionNote, PlannedExercise, SetPrescription, WorkoutDay } from "../Domain/Model";
import { SetModifiers } from "../Domain/Vocabulary";
import { RestPrescription } from "../Engine/RestPrescription";
import { closedRange } from "../Support/range";

export const PlanCatalog = {
  /** Yascha's own PPL + Upper/Lower. The default when plan mode is `personal`. */
  personal: [
    WorkoutDay.make({
      id: "push",
      label: "Monday · Push",
      short: "Push",
      focus: "Heavy chest · shoulders · triceps",
      exercises: [
        PlannedExercise.make({
          exerciseID: "flat-bench",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(5, 6),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 8),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 8),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "1×5–6 + 2×6–8",
            load: "120 kg → 105–110 kg",
            rest: "4–5 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "incline-bench",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 8),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 8),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "1×4–6 + 2×6–8",
            load: "100 kg → 90–95 kg",
            rest: "3–4 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "pec-fly",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15",
            load: "50–60 kg · RIR 1–2",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "push-shoulder",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×6–10",
            load: "RIR 1–2",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "push-lateral",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "4×12–20",
            load: "Strict",
            rest: "60–90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "overhead-triceps",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×10–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "pressdown",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
      ],
    }),
    WorkoutDay.make({
      id: "pull",
      label: "Tuesday · Pull",
      short: "Pull",
      focus: "Lat width · back thickness · biceps",
      exercises: [
        PlannedExercise.make({
          exerciseID: "pull-up",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(5, 8),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(5, 8),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(5, 8),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×5–8",
            load: "+10 kg",
            rest: "3–4 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "lat-pulldown",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(5, 6),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "1×5–6 + 1×8–10",
            load: "86 kg → 78–82 kg",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "neutral-row",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "Start around 90 kg",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "wide-row",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12",
            load: "80–90 kg",
            rest: "2 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "reverse-pec",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×12–20",
            load: "Controlled",
            rest: "60–90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "strict-curl",
          role: "accessory",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 8),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "1×6–8 + 2×8–10",
            load: "18 kg → 16 kg",
            rest: "2 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "hammer-curl",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12",
            load: "14–16 kg",
            rest: "90 sec",
          }),
        }),
      ],
    }),
    WorkoutDay.make({
      id: "legs",
      label: "Wednesday · Legs",
      short: "Legs",
      focus: "Quads · calves · core",
      exercises: [
        PlannedExercise.make({
          exerciseID: "hack-squat",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "RIR 1–2",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "bulgarian",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–12 / leg",
            load: "Pain-free ROM",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "seated-curl",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–12",
            load: "RIR 1–2",
            rest: "2 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "leg-extension",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 15),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×12–15",
            load: "Controlled",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "standing-calf",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "4×8–15",
            load: "Full stretch",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "legs-lateral",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(15, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(15, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(15, 20),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×15–20",
            load: "Strict",
            rest: "60 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "cable-crunch",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×10–15",
            load: "Progressive",
            rest: "90 sec",
          }),
        }),
      ],
    }),
    WorkoutDay.make({
      id: "lower",
      label: "Friday · Lower",
      short: "Lower",
      focus: "Hamstrings · glutes · core",
      exercises: [
        PlannedExercise.make({
          exerciseID: "rdl",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "RIR 1–2",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "leg-press",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×10–15",
            load: "RIR 1–2",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "hip-thrust",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12",
            load: "RIR 1–2",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "lying-curl",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×10–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "seated-calf",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×12–20",
            load: "Full ROM",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "hanging-raise",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–15",
            load: "Controlled",
            rest: "90 sec",
          }),
        }),
      ],
    }),
    WorkoutDay.make({
      id: "upper",
      label: "Saturday · Upper",
      short: "Upper",
      focus: "Bench technique · lats · shoulders",
      exercises: [
        PlannedExercise.make({
          exerciseID: "upper-paused-bench",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(2, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(2, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(2, 2),
            }),
          ],
          modifiers: SetModifiers.make({
            pauseEnabled: true,
            pauseSeconds: 2,
          }),
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×4–6",
            load: "105–110 kg · 2 sec pause · RIR 2",
            rest: "4 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "upper-wide-row",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–12",
            load: "RIR 1–2",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "kneeling-lat",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15 / side",
            load: "Full stretch",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "upper-shoulder",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12",
            load: "RIR 1–2",
            rest: "2 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "upper-fly",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×12–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "upper-lateral",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×12–20",
            load: "Strict",
            rest: "60–90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "rear-delt",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(15, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(15, 20),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×15–20",
            load: "Controlled",
            rest: "60–90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "cable-curl",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "upper-pressdown",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
      ],
    }),
  ] as WorkoutDay[],

  sciencePPLUL: [
    WorkoutDay.make({
      id: "science-push",
      label: "Monday · Push",
      short: "Push",
      focus: "Strength base · chest · delts · triceps",
      exercises: [
        PlannedExercise.make({
          exerciseID: "flat-bench",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 8),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 8),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "1×4–6 + 2×6–8",
            load: "Topset + back-offs · RIR 1–2",
            rest: "3–5 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "incline-machine",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–12",
            load: "RIR 1–2 · deep stretch",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "push-shoulder",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×6–10",
            load: "RIR 1–2",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "upper-fly",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×12–15",
            load: "RIR 1 · full ROM",
            rest: "90–120 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "science-lateral",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×12–20",
            load: "RIR 1 · strict",
            rest: "60–90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "overhead-triceps",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×10–15",
            load: "RIR 1 · long muscle length",
            rest: "90–120 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "pressdown",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15",
            load: "Last set RIR 0–1",
            rest: "90 sec",
          }),
        }),
      ],
    }),
    WorkoutDay.make({
      id: "science-pull",
      label: "Tuesday · Pull",
      short: "Pull",
      focus: "Vertical pull · back thickness · biceps",
      exercises: [
        PlannedExercise.make({
          exerciseID: "pull-up",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(5, 8),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(5, 8),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(5, 8),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×5–8",
            load: "RIR 1–2",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "neutral-row",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "RIR 1–2 · stable chest",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "kneeling-lat",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15 / side",
            load: "Full stretch",
            rest: "90–120 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "reverse-pec",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×12–20",
            load: "RIR 1 · controlled",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "science-preacher",
          role: "accessory",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–12",
            load: "RIR 1 · no momentum",
            rest: "2 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "hammer-curl",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
      ],
    }),
    WorkoutDay.make({
      id: "science-legs",
      label: "Wednesday · Legs",
      short: "Legs",
      focus: "Quads · hamstrings · full ROM",
      exercises: [
        PlannedExercise.make({
          exerciseID: "hack-squat",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "RIR 1–2 · consistent depth",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "rdl",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "RIR 1–2 · hamstring stretch",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "bulgarian",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12 / leg",
            load: "RIR 1–2 · pain-free ROM",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "seated-curl",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×10–15",
            load: "RIR 1 · hip flexed",
            rest: "2 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "leg-extension",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 15),
              targetRIR: closedRange(0, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 15),
              targetRIR: closedRange(0, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×12–15",
            load: "Last set RIR 0–1",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "standing-calf",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–15",
            load: "2 sec stretch at the bottom",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "cable-crunch",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×10–15",
            load: "Progressive",
            rest: "90 sec",
          }),
        }),
      ],
    }),
    WorkoutDay.make({
      id: "science-lower",
      label: "Friday · Lower",
      short: "Lower",
      focus: "Second leg stimulus · recoverable volume",
      exercises: [
        PlannedExercise.make({
          exerciseID: "leg-press",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–12",
            load: "RIR 1–2 · deep ROM",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "hip-thrust",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12",
            load: "RIR 1–2 · 1 sec lock-out",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "leg-extension",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×12–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "lying-curl",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×10–15",
            load: "RIR 1",
            rest: "2 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "seated-calf",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×12–20",
            load: "Full stretch",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "hanging-raise",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–15",
            load: "No swinging",
            rest: "90 sec",
          }),
        }),
      ],
    }),
    WorkoutDay.make({
      id: "science-upper",
      label: "Saturday · Upper",
      short: "Upper",
      focus: "Second bench stimulus · balanced",
      exercises: [
        PlannedExercise.make({
          exerciseID: "upper-paused-bench",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(2, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(2, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(2, 2),
            }),
          ],
          modifiers: SetModifiers.make({
            pauseEnabled: true,
            pauseSeconds: 2,
          }),
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×4–6",
            load: "105–110 kg · 2 sec pause · RIR 2",
            rest: "4 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "lat-pulldown",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "RIR 1–2 · full stretch",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "upper-wide-row",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–12",
            load: "RIR 1–2",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "upper-fly",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15",
            load: "RIR 1",
            rest: "90–120 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "upper-lateral",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×12–20",
            load: "RIR 1",
            rest: "60–90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "rear-delt",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×12–20",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "cable-curl",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "upper-pressdown",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
      ],
    }),
  ] as WorkoutDay[],

  scienceUpperLower: [
    WorkoutDay.make({
      id: "science-ul-upper-a",
      label: "Monday · Upper A",
      short: "Upper A",
      focus: "Bench strength · back · shoulders",
      exercises: [
        PlannedExercise.make({
          exerciseID: "flat-bench",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 8),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 8),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "1×4–6 + 2×6–8",
            load: "Topset + back-offs · RIR 1–2",
            rest: "3–5 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "pull-up",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(5, 8),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(5, 8),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(5, 8),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×5–8",
            load: "RIR 1–2",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "push-shoulder",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×6–10",
            load: "RIR 1–2",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "neutral-row",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "RIR 1–2",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "science-lateral",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×12–20",
            load: "RIR 1 · strict",
            rest: "60–90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "overhead-triceps",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "science-preacher",
          role: "accessory",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
      ],
    }),
    WorkoutDay.make({
      id: "science-ul-lower-a",
      label: "Tuesday · Lower A",
      short: "Lower A",
      focus: "Quads · hamstrings · calves",
      exercises: [
        PlannedExercise.make({
          exerciseID: "hack-squat",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "RIR 1–2 · consistent depth",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "rdl",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "RIR 1–2 · hamstring stretch",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "leg-extension",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×12–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "seated-curl",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×10–15",
            load: "RIR 1",
            rest: "2 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "standing-calf",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–15",
            load: "2 sec stretch",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "cable-crunch",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×10–15",
            load: "Progressive",
            rest: "90 sec",
          }),
        }),
      ],
    }),
    WorkoutDay.make({
      id: "science-ul-upper-b",
      label: "Thursday · Upper B",
      short: "Upper B",
      focus: "Paused bench · lats · arms",
      exercises: [
        PlannedExercise.make({
          exerciseID: "upper-paused-bench",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(2, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(2, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(2, 2),
            }),
          ],
          modifiers: SetModifiers.make({
            pauseEnabled: true,
            pauseSeconds: 2,
          }),
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×4–6",
            load: "105–110 kg · 2 sec pause · RIR 2",
            rest: "4 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "lat-pulldown",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "RIR 1–2 · full stretch",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "incline-machine",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12",
            load: "RIR 1–2",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "upper-wide-row",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–12",
            load: "RIR 1–2",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "upper-lateral",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×12–20",
            load: "RIR 1",
            rest: "60–90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "rear-delt",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×12–20",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "cable-curl",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "upper-pressdown",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
      ],
    }),
    WorkoutDay.make({
      id: "science-ul-lower-b",
      label: "Friday · Lower B",
      short: "Lower B",
      focus: "Second leg stimulus · glutes · core",
      exercises: [
        PlannedExercise.make({
          exerciseID: "leg-press",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–12",
            load: "RIR 1–2 · deep ROM",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "hip-thrust",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12",
            load: "RIR 1–2 · 1 sec lock-out",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "bulgarian",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12 / leg",
            load: "Pain-free ROM",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "lying-curl",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×10–15",
            load: "RIR 1",
            rest: "2 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "seated-calf",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×12–20",
            load: "Full stretch",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "hanging-raise",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–15",
            load: "No swinging",
            rest: "90 sec",
          }),
        }),
      ],
    }),
  ] as WorkoutDay[],

  scienceFullBody: [
    WorkoutDay.make({
      id: "science-fb-a",
      label: "Monday · Full body A",
      short: "Full body A",
      focus: "Bench strength · squat · vertical pull",
      exercises: [
        PlannedExercise.make({
          exerciseID: "flat-bench",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 8),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 8),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "1×4–6 + 2×6–8",
            load: "Topset + back-offs · RIR 1–2",
            rest: "3–5 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "hack-squat",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "RIR 1–2",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "pull-up",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(5, 8),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(5, 8),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(5, 8),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×5–8",
            load: "RIR 1–2",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "rdl",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(2, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(2, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×6–10",
            load: "RIR 2",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "science-lateral",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×12–20",
            load: "RIR 1",
            rest: "60–90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "overhead-triceps",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
      ],
    }),
    WorkoutDay.make({
      id: "science-fb-b",
      label: "Wednesday · Full body B",
      short: "Full body B",
      focus: "Upper chest · legs · back thickness",
      exercises: [
        PlannedExercise.make({
          exerciseID: "leg-press",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–12",
            load: "RIR 1–2",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "incline-bench",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "RIR 1–2",
            rest: "3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "neutral-row",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "RIR 1–2",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "seated-curl",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×10–15",
            load: "RIR 1",
            rest: "2 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "push-shoulder",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12",
            load: "RIR 1–2",
            rest: "2 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "science-preacher",
          role: "accessory",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "standing-calf",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 15),
              targetRIR: closedRange(0, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–15",
            load: "Full stretch",
            rest: "90 sec",
          }),
        }),
      ],
    }),
    WorkoutDay.make({
      id: "science-fb-c",
      label: "Friday · Full body C",
      short: "Full body C",
      focus: "Paused bench · unilateral · lats",
      exercises: [
        PlannedExercise.make({
          exerciseID: "upper-paused-bench",
          role: "primaryStrength",
          sets: [
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(2, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(2, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(4, 6),
              targetRIR: closedRange(2, 2),
            }),
          ],
          modifiers: SetModifiers.make({
            pauseEnabled: true,
            pauseSeconds: 2,
          }),
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×4–6",
            load: "105–110 kg · 2 sec pause · RIR 2",
            rest: "4 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "bulgarian",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×8–12 / leg",
            load: "Pain-free ROM",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "lat-pulldown",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(6, 10),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "3×6–10",
            load: "RIR 1–2",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "hip-thrust",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12",
            load: "RIR 1–2",
            rest: "2–3 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "upper-wide-row",
          role: "secondaryCompound",
          sets: [
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
            SetPrescription.make({
              repRange: closedRange(8, 12),
              targetRIR: closedRange(1, 2),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×8–12",
            load: "RIR 1–2",
            rest: "2 min",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "rear-delt",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(12, 20),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×12–20",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
        PlannedExercise.make({
          exerciseID: "cable-curl",
          role: "isolation",
          sets: [
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
            SetPrescription.make({
              repRange: closedRange(10, 15),
              targetRIR: closedRange(1, 1),
            }),
          ],
          authoredNote: LegacyPrescriptionNote.make({
            prescription: "2×10–15",
            load: "RIR 1",
            rest: "90 sec",
          }),
        }),
      ],
    }),
  ] as WorkoutDay[],

  plan(a: { mode: string; sciencePlanID: string }): WorkoutDay[] {
    if (a.mode !== "science") return PlanCatalog.personal;
    switch (a.sciencePlanID) {
      case "upper-lower":
        return PlanCatalog.scienceUpperLower;
      case "full-body":
        return PlanCatalog.scienceFullBody;
      default:
        return PlanCatalog.sciencePPLUL;
    }
  },

  /** Rest for a planned exercise, derived from its role (addendum 13R). */
  rest(a: { for: PlannedExercise }): RestPrescription {
    return RestPrescription.forRole(a.for.role);
  },
};
