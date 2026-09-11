// Generated from app/page.tsx by scratchpad/gen/generate.py — do not hand-edit.
//
// Per-exercise warm-up ramps and progression advice, in the web app's own
// Dutch. TRAINING_LOGIC §7 is explicit about these: "Keep the text, generate
// the sets." §15 lists the written guidance among the things kept as-is.

import Foundation

public struct ExerciseGuide: Codable, Hashable, Sendable {
    public let warmup: String
    public let progression: String
    /// The rep count at which the web app considered the top of the range hit.
    public let advanceAt: Int?

    public init(warmup: String, progression: String, advanceAt: Int? = nil) {
        self.warmup = warmup
        self.progression = progression
        self.advanceAt = advanceAt
    }
}

public enum GuidanceCatalog {

    public static let `default` = ExerciseGuide(
        warmup: "1–2 lichte oplopende sets zonder vermoeidheid.",
        progression: "Haal alle voorgeschreven sets aan de bovengrens in 2 sessies; verhoog daarna de kleinste stap."
    )

    public static let byExercise: [String: ExerciseGuide] = [
        "flat-bench": ExerciseGuide(
            warmup: "Stang×15 → 60×8 → 80×5 → 100×3 → 110×1. Geen set tot falen.",
            progression: "120 kg×6 met RIR 1 in 2 sessies? Ga naar 122,5 kg voor 4–6; back-offs pas verhogen wanneer beide 8 halen.",
            advanceAt: 6
        ),
        "upper-paused-bench": ExerciseGuide(
            warmup: "Stang×10 → 60×5 → 80×3 → 100×1 met 2 sec pauze. Alles ruim voor falen.",
            progression: "Alle 3 sets 6 met een echte 2 sec borstpauze en RIR 2 in 2 sessies? Voeg 2,5 kg toe en start opnieuw bij 4–5 reps.",
            advanceAt: 6
        ),
        "incline-bench": ExerciseGuide(
            warmup: "Stang×12 → 60×6 → 80×3 → 90×1. Na flat bench volstaan meestal de laatste 2 stappen.",
            progression: "100 kg×6 in 2 sessies? Verhoog naar 102,5 kg. Eerst alle back-offs op 8 krijgen.",
            advanceAt: 6
        ),
        "pec-fly": ExerciseGuide(
            warmup: "1 lichte set van 15 met volledige stretch; niet vermoeien.",
            progression: "Beide sets 15 technisch zuiver? Volgende plaatje en terug naar 10–12 reps.",
            advanceAt: 15
        ),
        "push-shoulder": ExerciseGuide(
            warmup: "2 oplopende sets: ongeveer 50%×10 en 70%×4.",
            progression: "Beide sets 10 met RIR 1? Kleinste gewichtsstap verhogen.",
            advanceAt: 10
        ),
        "upper-shoulder": ExerciseGuide(
            warmup: "1–2 oplopende sets: ongeveer 50%×10 en 70%×4.",
            progression: "Beide sets 12 met RIR 1? Kleinste gewichtsstap verhogen.",
            advanceAt: 12
        ),
        "push-lateral": ExerciseGuide(
            warmup: "1 zeer lichte set van 15–20.",
            progression: "Alle 4 sets 20 zonder zwaaien? Kleinste stap verhogen en terug naar 12–15.",
            advanceAt: 20
        ),
        "legs-lateral": ExerciseGuide(
            warmup: "Geen extra set nodig na eerdere schoudertraining; start gecontroleerd.",
            progression: "Alle 3 sets 20 strikt? Kleinste stap verhogen.",
            advanceAt: 20
        ),
        "upper-lateral": ExerciseGuide(
            warmup: "1 zeer lichte set van 15–20.",
            progression: "Alle 3 sets 20 strikt? Kleinste stap verhogen.",
            advanceAt: 20
        ),
        "overhead-triceps": ExerciseGuide(
            warmup: "1 lichte set van 12–15 om ellebogen warm te maken.",
            progression: "3×15 met dezelfde ROM? Eén kabelstap verhogen.",
            advanceAt: 15
        ),
        "pressdown": ExerciseGuide(
            warmup: "1 lichte set van 15.",
            progression: "Beide sets 12 met RIR 1? Eén kabelstap verhogen.",
            advanceAt: 12
        ),
        "upper-pressdown": ExerciseGuide(
            warmup: "Meestal geen aparte opwarming nodig na presses.",
            progression: "Beide sets 15? Eén kabelstap verhogen.",
            advanceAt: 15
        ),
        "pull-up": ExerciseGuide(
            warmup: "Scapular pull-up×8 → bodyweight×5 → +5 kg×3.",
            progression: "3×8 met +10 kg in 2 sessies? Ga naar +12,5 kg en mik opnieuw op 5–6.",
            advanceAt: 8
        ),
        "lat-pulldown": ExerciseGuide(
            warmup: "40 kg×10 → 60 kg×5 → 75 kg×2.",
            progression: "86 kg×6 én back-off 82 kg×10 in 2 sessies? Verhoog top- en back-offset één stap.",
            advanceAt: 6
        ),
        "neutral-row": ExerciseGuide(
            warmup: "50 kg×10 → 70 kg×5 → 80 kg×2.",
            progression: "Alle 3 sets 10 rond 90 kg? Verhoog 2,5–5 kg en begin weer bij 6–8.",
            advanceAt: 10
        ),
        "wide-row": ExerciseGuide(
            warmup: "1 lichte set van 10; je rug is al warm van de neutral row.",
            progression: "Beide sets 12 zonder schouders op te trekken? Kleinste stap verhogen.",
            advanceAt: 12
        ),
        "upper-wide-row": ExerciseGuide(
            warmup: "50%×10 → 70%×4.",
            progression: "3×12 met dezelfde borstpositie? Kleinste stap verhogen.",
            advanceAt: 12
        ),
        "reverse-pec": ExerciseGuide(
            warmup: "1 lichte set van 15.",
            progression: "3×20 zonder momentum? Eén plaatje verhogen.",
            advanceAt: 20
        ),
        "rear-delt": ExerciseGuide(
            warmup: "Geen extra set nodig na rows; begin licht.",
            progression: "Beide sets 20 zuiver? Eén plaatje verhogen.",
            advanceAt: 20
        ),
        "strict-curl": ExerciseGuide(
            warmup: "8 kg×12 → 12 kg×6 → 16 kg×3; alles ver van falen.",
            progression: "18 kg pas verhogen nadat je 10 strikt gecontroleerde reps in 2 opeenvolgende sessies haalt. Dan 20 kg voor 5–7; geen heupzwaai.",
            advanceAt: 10
        ),
        "hammer-curl": ExerciseGuide(
            warmup: "1 lichte set van 8–10; biceps zijn al warm.",
            progression: "Beide sets 12 zonder zwaaien? Ga 2 kg omhoog en mik op 8.",
            advanceAt: 12
        ),
        "cable-curl": ExerciseGuide(
            warmup: "Geen aparte opwarming nodig na je rugwerk.",
            progression: "Beide sets 15? Eén kabelstap verhogen.",
            advanceAt: 15
        ),
        "hack-squat": ExerciseGuide(
            warmup: "5 min fiets → lege machine×12 → 40%×8 → 60%×5 → 75%×2.",
            progression: "3×10 op dezelfde diepte en RIR 1–2? Voeg 5–10 kg totaal toe.",
            advanceAt: 10
        ),
        "bulgarian": ExerciseGuide(
            warmup: "Bodyweight×8 per been → 1 lichte dumbbellset×5.",
            progression: "3×12 per been stabiel? Voeg de kleinste dumbbellstap toe.",
            advanceAt: 12
        ),
        "seated-curl": ExerciseGuide(
            warmup: "1 lichte set van 12–15.",
            progression: "3×12 met volledige kniebuiging? Eén plaatje verhogen.",
            advanceAt: 12
        ),
        "leg-extension": ExerciseGuide(
            warmup: "1 lichte, pijnvrije set van 15.",
            progression: "Beide sets 15 zonder knie-irritatie? Eén plaatje verhogen.",
            advanceAt: 15
        ),
        "standing-calf": ExerciseGuide(
            warmup: "Bodyweight×15 met 2 sec stretch onderaan.",
            progression: "4×15 met volledige ROM? Kleinste stap verhogen.",
            advanceAt: 15
        ),
        "cable-crunch": ExerciseGuide(
            warmup: "1 lichte set van 10 om de beweging te voelen.",
            progression: "3×15 zonder heupbeweging? Eén kabelstap verhogen.",
            advanceAt: 15
        ),
        "rdl": ExerciseGuide(
            warmup: "Stang×10 → 40%×8 → 60%×5 → 75%×2.",
            progression: "3×10 met neutrale rug en dezelfde hamstringstretch? Voeg 5 kg toe.",
            advanceAt: 10
        ),
        "leg-press": ExerciseGuide(
            warmup: "Lege slee×12 → 50%×8 → 70%×4.",
            progression: "3×15 op dezelfde diepte? Voeg 5–10 kg totaal toe.",
            advanceAt: 15
        ),
        "hip-thrust": ExerciseGuide(
            warmup: "Bodyweight bridge×12 → 50%×8 → 70%×4.",
            progression: "Beide sets 12 met 1 sec lock-out? Voeg 5 kg toe.",
            advanceAt: 12
        ),
        "lying-curl": ExerciseGuide(
            warmup: "1 lichte set van 12–15.",
            progression: "3×15 met volledige ROM? Eén plaatje verhogen.",
            advanceAt: 15
        ),
        "seated-calf": ExerciseGuide(
            warmup: "1 lichte set van 15 met trage stretch.",
            progression: "3×20 met volledige ROM? Kleinste stap verhogen.",
            advanceAt: 20
        ),
        "hanging-raise": ExerciseGuide(
            warmup: "Dead hang 20 sec → 6 rustige knee raises.",
            progression: "3×15 zonder zwaaien? Ga naar gestrekte benen of voeg licht gewicht toe.",
            advanceAt: 15
        ),
        "incline-machine": ExerciseGuide(
            warmup: "50%×10 → 70%×4.",
            progression: "3×12 met RIR 1–2? Eén machinestap verhogen.",
            advanceAt: 12
        ),
        "kneeling-lat": ExerciseGuide(
            warmup: "1 lichte set per kant van 10.",
            progression: "Beide kanten 15 met volledige stretch? Eén kabelstap verhogen.",
            advanceAt: 15
        ),
        "upper-fly": ExerciseGuide(
            warmup: "1 lichte set van 12.",
            progression: "Beide sets 15 met controle? Eén plaatje verhogen.",
            advanceAt: 15
        ),
        "science-lateral": ExerciseGuide(
            warmup: "1 zeer lichte set van 15–20.",
            progression: "3×20 strikt in 2 sessies? Verhoog de kleinste kabelstap.",
            advanceAt: 20
        ),
        "science-preacher": ExerciseGuide(
            warmup: "1–2 lichte sets van 10 en 5 reps.",
            progression: "3×12 zonder schouderbeweging in 2 sessies? Verhoog de kleinste stap.",
            advanceAt: 12
        ),
    ]

    public static func guide(for exerciseID: String) -> ExerciseGuide {
        byExercise[exerciseID] ?? `default`
    }
}
