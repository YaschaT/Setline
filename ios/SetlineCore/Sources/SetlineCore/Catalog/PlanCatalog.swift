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

import Foundation

public enum PlanCatalog {

    /// Yascha's own PPL + Upper/Lower. The default when plan mode is `personal`.
    public static let personal: [WorkoutDay] = [
        WorkoutDay(
            id: "push",
            label: "Maandag · Push",
            short: "Push",
            focus: "Zware borst · schouders · triceps",
            exercises: [
                PlannedExercise(
                    exerciseID: "flat-bench",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 5...6, targetRIR: 1...2),
                        SetPrescription(repRange: 6...8, targetRIR: 1...2),
                        SetPrescription(repRange: 6...8, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "1×5–6 + 2×6–8",
                        load: "120 kg → 105–110 kg",
                        rest: "4–5 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "incline-bench",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 4...6, targetRIR: 1...2),
                        SetPrescription(repRange: 6...8, targetRIR: 1...2),
                        SetPrescription(repRange: 6...8, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "1×4–6 + 2×6–8",
                        load: "100 kg → 90–95 kg",
                        rest: "3–4 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "pec-fly",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...2),
                        SetPrescription(repRange: 10...15, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15",
                        load: "50–60 kg · RIR 1–2",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "push-shoulder",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×6–10",
                        load: "RIR 1–2",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "push-lateral",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "4×12–20",
                        load: "Strikt",
                        rest: "60–90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "overhead-triceps",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×10–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "pressdown",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...1),
                        SetPrescription(repRange: 8...12, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
        WorkoutDay(
            id: "pull",
            label: "Dinsdag · Pull",
            short: "Pull",
            focus: "Latbreedte · rugdikte · biceps",
            exercises: [
                PlannedExercise(
                    exerciseID: "pull-up",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 5...8, targetRIR: 1...2),
                        SetPrescription(repRange: 5...8, targetRIR: 1...2),
                        SetPrescription(repRange: 5...8, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×5–8",
                        load: "+10 kg",
                        rest: "3–4 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "lat-pulldown",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 5...6, targetRIR: 1...2),
                        SetPrescription(repRange: 8...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "1×5–6 + 1×8–10",
                        load: "86 kg → 78–82 kg",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "neutral-row",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "Start rond 90 kg",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "wide-row",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12",
                        load: "80–90 kg",
                        rest: "2 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "reverse-pec",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×12–20",
                        load: "Gecontroleerd",
                        rest: "60–90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "strict-curl",
                    role: .accessory,
                    sets: [
                        SetPrescription(repRange: 6...8, targetRIR: 1...2),
                        SetPrescription(repRange: 8...10, targetRIR: 1...2),
                        SetPrescription(repRange: 8...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "1×6–8 + 2×8–10",
                        load: "18 kg → 16 kg",
                        rest: "2 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "hammer-curl",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 0...2),
                        SetPrescription(repRange: 8...12, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12",
                        load: "14–16 kg",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
        WorkoutDay(
            id: "legs",
            label: "Woensdag · Legs",
            short: "Legs",
            focus: "Quadriceps · kuiten · core",
            exercises: [
                PlannedExercise(
                    exerciseID: "hack-squat",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "RIR 1–2",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "bulgarian",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–12 / been",
                        load: "Pijnvrije ROM",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "seated-curl",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–12",
                        load: "RIR 1–2",
                        rest: "2 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "leg-extension",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...15, targetRIR: 0...2),
                        SetPrescription(repRange: 12...15, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×12–15",
                        load: "Gecontroleerd",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "standing-calf",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "4×8–15",
                        load: "Volledige stretch",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "legs-lateral",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 15...20, targetRIR: 0...2),
                        SetPrescription(repRange: 15...20, targetRIR: 0...2),
                        SetPrescription(repRange: 15...20, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×15–20",
                        load: "Strikt",
                        rest: "60 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "cable-crunch",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 0...2),
                        SetPrescription(repRange: 10...15, targetRIR: 0...2),
                        SetPrescription(repRange: 10...15, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×10–15",
                        load: "Progressief",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
        WorkoutDay(
            id: "lower",
            label: "Vrijdag · Lower",
            short: "Lower",
            focus: "Hamstrings · billen · core",
            exercises: [
                PlannedExercise(
                    exerciseID: "rdl",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "RIR 1–2",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "leg-press",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...2),
                        SetPrescription(repRange: 10...15, targetRIR: 1...2),
                        SetPrescription(repRange: 10...15, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×10–15",
                        load: "RIR 1–2",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "hip-thrust",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12",
                        load: "RIR 1–2",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "lying-curl",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×10–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "seated-calf",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×12–20",
                        load: "Volledige ROM",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "hanging-raise",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–15",
                        load: "Gecontroleerd",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
        WorkoutDay(
            id: "upper",
            label: "Zaterdag · Upper",
            short: "Upper",
            focus: "Bench-techniek · lats · schouders",
            exercises: [
                PlannedExercise(
                    exerciseID: "upper-paused-bench",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 4...6, targetRIR: 2...2),
                        SetPrescription(repRange: 4...6, targetRIR: 2...2),
                        SetPrescription(repRange: 4...6, targetRIR: 2...2),
                    ],
                    modifiers: SetModifiers(pauseEnabled: true, pauseSeconds: 2),
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×4–6",
                        load: "105–110 kg · 2 sec pauze · RIR 2",
                        rest: "4 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "upper-wide-row",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–12",
                        load: "RIR 1–2",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "kneeling-lat",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 0...2),
                        SetPrescription(repRange: 10...15, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15 / kant",
                        load: "Volledige stretch",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "upper-shoulder",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12",
                        load: "RIR 1–2",
                        rest: "2 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "upper-fly",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...15, targetRIR: 1...1),
                        SetPrescription(repRange: 12...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×12–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "upper-lateral",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×12–20",
                        load: "Strikt",
                        rest: "60–90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "rear-delt",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 15...20, targetRIR: 0...2),
                        SetPrescription(repRange: 15...20, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×15–20",
                        load: "Gecontroleerd",
                        rest: "60–90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "cable-curl",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "upper-pressdown",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
    ]

    /// Science-based PPL + Upper/Lower, five days.
    public static let sciencePPLUL: [WorkoutDay] = [
        WorkoutDay(
            id: "science-push",
            label: "Maandag · Push",
            short: "Push",
            focus: "Krachtbasis · borst · delts · triceps",
            exercises: [
                PlannedExercise(
                    exerciseID: "flat-bench",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 4...6, targetRIR: 1...2),
                        SetPrescription(repRange: 6...8, targetRIR: 1...2),
                        SetPrescription(repRange: 6...8, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "1×4–6 + 2×6–8",
                        load: "Topset + back-offs · RIR 1–2",
                        rest: "3–5 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "incline-machine",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–12",
                        load: "RIR 1–2 · diepe stretch",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "push-shoulder",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×6–10",
                        load: "RIR 1–2",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "upper-fly",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...15, targetRIR: 1...1),
                        SetPrescription(repRange: 12...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×12–15",
                        load: "RIR 1 · volledige ROM",
                        rest: "90–120 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "science-lateral",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×12–20",
                        load: "RIR 1 · strikt",
                        rest: "60–90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "overhead-triceps",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×10–15",
                        load: "RIR 1 · lange spierlengte",
                        rest: "90–120 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "pressdown",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 0...1),
                        SetPrescription(repRange: 10...15, targetRIR: 0...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15",
                        load: "Laatste set RIR 0–1",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
        WorkoutDay(
            id: "science-pull",
            label: "Dinsdag · Pull",
            short: "Pull",
            focus: "Verticale pull · rugdikte · biceps",
            exercises: [
                PlannedExercise(
                    exerciseID: "pull-up",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 5...8, targetRIR: 1...2),
                        SetPrescription(repRange: 5...8, targetRIR: 1...2),
                        SetPrescription(repRange: 5...8, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×5–8",
                        load: "RIR 1–2",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "neutral-row",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "RIR 1–2 · stabiele borst",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "kneeling-lat",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 0...2),
                        SetPrescription(repRange: 10...15, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15 / kant",
                        load: "Volledige stretch",
                        rest: "90–120 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "reverse-pec",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×12–20",
                        load: "RIR 1 · gecontroleerd",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "science-preacher",
                    role: .accessory,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...1),
                        SetPrescription(repRange: 8...12, targetRIR: 1...1),
                        SetPrescription(repRange: 8...12, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–12",
                        load: "RIR 1 · geen momentum",
                        rest: "2 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "hammer-curl",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
        WorkoutDay(
            id: "science-legs",
            label: "Woensdag · Legs",
            short: "Legs",
            focus: "Quads · hamstrings · volledige ROM",
            exercises: [
                PlannedExercise(
                    exerciseID: "hack-squat",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "RIR 1–2 · constante diepte",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "rdl",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "RIR 1–2 · hamstringstretch",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "bulgarian",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12 / been",
                        load: "RIR 1–2 · pijnvrije ROM",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "seated-curl",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×10–15",
                        load: "RIR 1 · heup gebogen",
                        rest: "2 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "leg-extension",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...15, targetRIR: 0...1),
                        SetPrescription(repRange: 12...15, targetRIR: 0...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×12–15",
                        load: "Laatste set RIR 0–1",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "standing-calf",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–15",
                        load: "2 sec stretch onderaan",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "cable-crunch",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 0...2),
                        SetPrescription(repRange: 10...15, targetRIR: 0...2),
                        SetPrescription(repRange: 10...15, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×10–15",
                        load: "Progressief",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
        WorkoutDay(
            id: "science-lower",
            label: "Vrijdag · Lower",
            short: "Lower",
            focus: "Tweede beenprikkel · herstelbaar volume",
            exercises: [
                PlannedExercise(
                    exerciseID: "leg-press",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–12",
                        load: "RIR 1–2 · diepe ROM",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "hip-thrust",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12",
                        load: "RIR 1–2 · 1 sec lock-out",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "leg-extension",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...15, targetRIR: 1...1),
                        SetPrescription(repRange: 12...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×12–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "lying-curl",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×10–15",
                        load: "RIR 1",
                        rest: "2 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "seated-calf",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×12–20",
                        load: "Volledige stretch",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "hanging-raise",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–15",
                        load: "Geen zwaai",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
        WorkoutDay(
            id: "science-upper",
            label: "Zaterdag · Upper",
            short: "Upper",
            focus: "Tweede benchprikkel · gebalanceerd",
            exercises: [
                PlannedExercise(
                    exerciseID: "upper-paused-bench",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 4...6, targetRIR: 2...2),
                        SetPrescription(repRange: 4...6, targetRIR: 2...2),
                        SetPrescription(repRange: 4...6, targetRIR: 2...2),
                    ],
                    modifiers: SetModifiers(pauseEnabled: true, pauseSeconds: 2),
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×4–6",
                        load: "105–110 kg · 2 sec pauze · RIR 2",
                        rest: "4 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "lat-pulldown",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "RIR 1–2 · volledige stretch",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "upper-wide-row",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–12",
                        load: "RIR 1–2",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "upper-fly",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15",
                        load: "RIR 1",
                        rest: "90–120 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "upper-lateral",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×12–20",
                        load: "RIR 1",
                        rest: "60–90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "rear-delt",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×12–20",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "cable-curl",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "upper-pressdown",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
    ]

    /// Science-based Upper/Lower, four days.
    public static let scienceUpperLower: [WorkoutDay] = [
        WorkoutDay(
            id: "science-ul-upper-a",
            label: "Maandag · Upper A",
            short: "Upper A",
            focus: "Bench-kracht · rug · schouders",
            exercises: [
                PlannedExercise(
                    exerciseID: "flat-bench",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 4...6, targetRIR: 1...2),
                        SetPrescription(repRange: 6...8, targetRIR: 1...2),
                        SetPrescription(repRange: 6...8, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "1×4–6 + 2×6–8",
                        load: "Topset + back-offs · RIR 1–2",
                        rest: "3–5 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "pull-up",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 5...8, targetRIR: 1...2),
                        SetPrescription(repRange: 5...8, targetRIR: 1...2),
                        SetPrescription(repRange: 5...8, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×5–8",
                        load: "RIR 1–2",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "push-shoulder",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×6–10",
                        load: "RIR 1–2",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "neutral-row",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "RIR 1–2",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "science-lateral",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×12–20",
                        load: "RIR 1 · strikt",
                        rest: "60–90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "overhead-triceps",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "science-preacher",
                    role: .accessory,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...1),
                        SetPrescription(repRange: 8...12, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
        WorkoutDay(
            id: "science-ul-lower-a",
            label: "Dinsdag · Lower A",
            short: "Lower A",
            focus: "Quads · hamstrings · kuiten",
            exercises: [
                PlannedExercise(
                    exerciseID: "hack-squat",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "RIR 1–2 · constante diepte",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "rdl",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "RIR 1–2 · hamstringstretch",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "leg-extension",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...15, targetRIR: 1...1),
                        SetPrescription(repRange: 12...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×12–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "seated-curl",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×10–15",
                        load: "RIR 1",
                        rest: "2 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "standing-calf",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–15",
                        load: "2 sec stretch",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "cable-crunch",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 0...2),
                        SetPrescription(repRange: 10...15, targetRIR: 0...2),
                        SetPrescription(repRange: 10...15, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×10–15",
                        load: "Progressief",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
        WorkoutDay(
            id: "science-ul-upper-b",
            label: "Donderdag · Upper B",
            short: "Upper B",
            focus: "Paused bench · lats · armen",
            exercises: [
                PlannedExercise(
                    exerciseID: "upper-paused-bench",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 4...6, targetRIR: 2...2),
                        SetPrescription(repRange: 4...6, targetRIR: 2...2),
                        SetPrescription(repRange: 4...6, targetRIR: 2...2),
                    ],
                    modifiers: SetModifiers(pauseEnabled: true, pauseSeconds: 2),
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×4–6",
                        load: "105–110 kg · 2 sec pauze · RIR 2",
                        rest: "4 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "lat-pulldown",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "RIR 1–2 · volledige stretch",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "incline-machine",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12",
                        load: "RIR 1–2",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "upper-wide-row",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–12",
                        load: "RIR 1–2",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "upper-lateral",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×12–20",
                        load: "RIR 1",
                        rest: "60–90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "rear-delt",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×12–20",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "cable-curl",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "upper-pressdown",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
        WorkoutDay(
            id: "science-ul-lower-b",
            label: "Vrijdag · Lower B",
            short: "Lower B",
            focus: "Tweede beenprikkel · billen · core",
            exercises: [
                PlannedExercise(
                    exerciseID: "leg-press",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–12",
                        load: "RIR 1–2 · diepe ROM",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "hip-thrust",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12",
                        load: "RIR 1–2 · 1 sec lock-out",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "bulgarian",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12 / been",
                        load: "Pijnvrije ROM",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "lying-curl",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×10–15",
                        load: "RIR 1",
                        rest: "2 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "seated-calf",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                        SetPrescription(repRange: 12...20, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×12–20",
                        load: "Volledige stretch",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "hanging-raise",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–15",
                        load: "Geen zwaai",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
    ]

    /// Science-based full body, three days.
    public static let scienceFullBody: [WorkoutDay] = [
        WorkoutDay(
            id: "science-fb-a",
            label: "Maandag · Full body A",
            short: "Full body A",
            focus: "Bench-kracht · squat · verticale pull",
            exercises: [
                PlannedExercise(
                    exerciseID: "flat-bench",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 4...6, targetRIR: 1...2),
                        SetPrescription(repRange: 6...8, targetRIR: 1...2),
                        SetPrescription(repRange: 6...8, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "1×4–6 + 2×6–8",
                        load: "Topset + back-offs · RIR 1–2",
                        rest: "3–5 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "hack-squat",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "RIR 1–2",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "pull-up",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 5...8, targetRIR: 1...2),
                        SetPrescription(repRange: 5...8, targetRIR: 1...2),
                        SetPrescription(repRange: 5...8, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×5–8",
                        load: "RIR 1–2",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "rdl",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 2...2),
                        SetPrescription(repRange: 6...10, targetRIR: 2...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×6–10",
                        load: "RIR 2",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "science-lateral",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×12–20",
                        load: "RIR 1",
                        rest: "60–90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "overhead-triceps",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
        WorkoutDay(
            id: "science-fb-b",
            label: "Woensdag · Full body B",
            short: "Full body B",
            focus: "Bovenborst · benen · rugdikte",
            exercises: [
                PlannedExercise(
                    exerciseID: "leg-press",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–12",
                        load: "RIR 1–2",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "incline-bench",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "RIR 1–2",
                        rest: "3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "neutral-row",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "RIR 1–2",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "seated-curl",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×10–15",
                        load: "RIR 1",
                        rest: "2 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "push-shoulder",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12",
                        load: "RIR 1–2",
                        rest: "2 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "science-preacher",
                    role: .accessory,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...1),
                        SetPrescription(repRange: 8...12, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "standing-calf",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                        SetPrescription(repRange: 8...15, targetRIR: 0...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–15",
                        load: "Volledige stretch",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
        WorkoutDay(
            id: "science-fb-c",
            label: "Vrijdag · Full body C",
            short: "Full body C",
            focus: "Paused bench · unilateraal · lats",
            exercises: [
                PlannedExercise(
                    exerciseID: "upper-paused-bench",
                    role: .primaryStrength,
                    sets: [
                        SetPrescription(repRange: 4...6, targetRIR: 2...2),
                        SetPrescription(repRange: 4...6, targetRIR: 2...2),
                        SetPrescription(repRange: 4...6, targetRIR: 2...2),
                    ],
                    modifiers: SetModifiers(pauseEnabled: true, pauseSeconds: 2),
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×4–6",
                        load: "105–110 kg · 2 sec pauze · RIR 2",
                        rest: "4 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "bulgarian",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×8–12 / been",
                        load: "Pijnvrije ROM",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "lat-pulldown",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                        SetPrescription(repRange: 6...10, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "3×6–10",
                        load: "RIR 1–2",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "hip-thrust",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12",
                        load: "RIR 1–2",
                        rest: "2–3 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "upper-wide-row",
                    role: .secondaryCompound,
                    sets: [
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                        SetPrescription(repRange: 8...12, targetRIR: 1...2),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×8–12",
                        load: "RIR 1–2",
                        rest: "2 min"
                    )
                ),
                PlannedExercise(
                    exerciseID: "rear-delt",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                        SetPrescription(repRange: 12...20, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×12–20",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
                PlannedExercise(
                    exerciseID: "cable-curl",
                    role: .isolation,
                    sets: [
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                        SetPrescription(repRange: 10...15, targetRIR: 1...1),
                    ],
                    authoredNote: LegacyPrescriptionNote(
                        prescription: "2×10–15",
                        load: "RIR 1",
                        rest: "90 sec"
                    )
                ),
            ]
        ),
    ]

    public static func plan(mode: String, sciencePlanID: String) -> [WorkoutDay] {
        guard mode == "science" else { return personal }
        switch sciencePlanID {
        case "upper-lower": return scienceUpperLower
        case "full-body": return scienceFullBody
        default: return sciencePPLUL
        }
    }

    /// Rest for a planned exercise, derived from its role (addendum 13R).
    public static func rest(for planned: PlannedExercise) -> RestPrescription {
        RestPrescription.forRole(planned.role)
    }
}
