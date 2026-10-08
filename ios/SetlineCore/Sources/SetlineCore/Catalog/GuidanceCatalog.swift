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
        warmup: "1–2 light ramp-up sets without getting tired.",
        progression: "Hit the top of the range on all prescribed sets in 2 sessions; then go up by the smallest step."
    )

    public static let byExercise: [String: ExerciseGuide] = [
        "flat-bench": ExerciseGuide(
            warmup: "Bar×15 → 60×8 → 80×5 → 100×3 → 110×1. No set to failure.",
            progression: "120 kg×6 at RIR 1 in 2 sessions? Go to 122.5 kg for 4–6; only raise the back-offs once both reach 8.",
            advanceAt: 6
        ),
        "upper-paused-bench": ExerciseGuide(
            warmup: "Bar×10 → 60×5 → 80×3 → 100×1 with a 2 sec pause. All well short of failure.",
            progression: "All 3 sets of 6 with a real 2 sec chest pause and RIR 2 in 2 sessions? Add 2.5 kg and start again at 4–5 reps.",
            advanceAt: 6
        ),
        "incline-bench": ExerciseGuide(
            warmup: "Bar×12 → 60×6 → 80×3 → 90×1. After flat bench, the last 2 steps are usually enough.",
            progression: "100 kg×6 in 2 sessions? Go up to 102.5 kg. Get all back-offs to 8 first.",
            advanceAt: 6
        ),
        "pec-fly": ExerciseGuide(
            warmup: "1 light set of 15 with a full stretch; don't tire yourself.",
            progression: "Both sets of 15 with clean technique? Next plate and back to 10–12 reps.",
            advanceAt: 15
        ),
        "push-shoulder": ExerciseGuide(
            warmup: "2 ramp-up sets: about 50%×10 and 70%×4.",
            progression: "Both sets of 10 at RIR 1? Go up by the smallest step.",
            advanceAt: 10
        ),
        "upper-shoulder": ExerciseGuide(
            warmup: "1–2 ramp-up sets: about 50%×10 and 70%×4.",
            progression: "Both sets of 12 at RIR 1? Go up by the smallest step.",
            advanceAt: 12
        ),
        "push-lateral": ExerciseGuide(
            warmup: "1 very light set of 15–20.",
            progression: "All 4 sets of 20 without swinging? Go up by the smallest step and back to 12–15.",
            advanceAt: 20
        ),
        "legs-lateral": ExerciseGuide(
            warmup: "No extra set needed after earlier shoulder work; start controlled.",
            progression: "All 3 sets of 20 strict? Go up by the smallest step.",
            advanceAt: 20
        ),
        "upper-lateral": ExerciseGuide(
            warmup: "1 very light set of 15–20.",
            progression: "All 3 sets of 20 strict? Go up by the smallest step.",
            advanceAt: 20
        ),
        "overhead-triceps": ExerciseGuide(
            warmup: "1 light set of 12–15 to warm up your elbows.",
            progression: "3×15 with the same ROM? Go up one cable step.",
            advanceAt: 15
        ),
        "pressdown": ExerciseGuide(
            warmup: "1 light set of 15.",
            progression: "Both sets of 12 at RIR 1? Go up one cable step.",
            advanceAt: 12
        ),
        "upper-pressdown": ExerciseGuide(
            warmup: "Usually no separate warm-up needed after presses.",
            progression: "Both sets of 15? Go up one cable step.",
            advanceAt: 15
        ),
        "pull-up": ExerciseGuide(
            warmup: "Scapular pull-up×8 → bodyweight×5 → +5 kg×3.",
            progression: "3×8 with +10 kg in 2 sessions? Go to +12.5 kg and aim for 5–6 again.",
            advanceAt: 8
        ),
        "lat-pulldown": ExerciseGuide(
            warmup: "40 kg×10 → 60 kg×5 → 75 kg×2.",
            progression: "86 kg×6 and a back-off of 82 kg×10 in 2 sessions? Raise the top and back-off set one step.",
            advanceAt: 6
        ),
        "neutral-row": ExerciseGuide(
            warmup: "50 kg×10 → 70 kg×5 → 80 kg×2.",
            progression: "All 3 sets of 10 around 90 kg? Add 2.5–5 kg and start again at 6–8.",
            advanceAt: 10
        ),
        "wide-row": ExerciseGuide(
            warmup: "1 light set of 10; your back is already warm from the neutral row.",
            progression: "Both sets of 12 without shrugging? Go up by the smallest step.",
            advanceAt: 12
        ),
        "upper-wide-row": ExerciseGuide(
            warmup: "50%×10 → 70%×4.",
            progression: "3×12 with the same chest position? Go up by the smallest step.",
            advanceAt: 12
        ),
        "reverse-pec": ExerciseGuide(
            warmup: "1 light set of 15.",
            progression: "3×20 without momentum? Go up one plate.",
            advanceAt: 20
        ),
        "rear-delt": ExerciseGuide(
            warmup: "No extra set needed after rows; start light.",
            progression: "Both sets of 20 clean? Go up one plate.",
            advanceAt: 20
        ),
        "strict-curl": ExerciseGuide(
            warmup: "8 kg×12 → 12 kg×6 → 16 kg×3; all far from failure.",
            progression: "Only raise 18 kg once you hit 10 strict, controlled reps in 2 sessions in a row. Then 20 kg for 5–7; no hip swing.",
            advanceAt: 10
        ),
        "hammer-curl": ExerciseGuide(
            warmup: "1 light set of 8–10; your biceps are already warm.",
            progression: "Both sets of 12 without swinging? Go up 2 kg and aim for 8.",
            advanceAt: 12
        ),
        "cable-curl": ExerciseGuide(
            warmup: "No separate warm-up needed after your back work.",
            progression: "Both sets of 15? Go up one cable step.",
            advanceAt: 15
        ),
        "hack-squat": ExerciseGuide(
            warmup: "5 min bike → empty machine×12 → 40%×8 → 60%×5 → 75%×2.",
            progression: "3×10 at the same depth and RIR 1–2? Add 5–10 kg in total.",
            advanceAt: 10
        ),
        "bulgarian": ExerciseGuide(
            warmup: "Bodyweight×8 per leg → 1 light dumbbell set×5.",
            progression: "3×12 per leg, stable? Add the smallest dumbbell step.",
            advanceAt: 12
        ),
        "seated-curl": ExerciseGuide(
            warmup: "1 light set of 12–15.",
            progression: "3×12 with full knee bend? Go up one plate.",
            advanceAt: 12
        ),
        "leg-extension": ExerciseGuide(
            warmup: "1 light, pain-free set of 15.",
            progression: "Both sets of 15 without knee irritation? Go up one plate.",
            advanceAt: 15
        ),
        "standing-calf": ExerciseGuide(
            warmup: "Bodyweight×15 with a 2 sec stretch at the bottom.",
            progression: "4×15 with full ROM? Go up by the smallest step.",
            advanceAt: 15
        ),
        "cable-crunch": ExerciseGuide(
            warmup: "1 light set of 10 to feel the movement.",
            progression: "3×15 without hip movement? Go up one cable step.",
            advanceAt: 15
        ),
        "rdl": ExerciseGuide(
            warmup: "Bar×10 → 40%×8 → 60%×5 → 75%×2.",
            progression: "3×10 with a neutral back and the same hamstring stretch? Add 5 kg.",
            advanceAt: 10
        ),
        "leg-press": ExerciseGuide(
            warmup: "Empty sled×12 → 50%×8 → 70%×4.",
            progression: "3×15 at the same depth? Add 5–10 kg in total.",
            advanceAt: 15
        ),
        "hip-thrust": ExerciseGuide(
            warmup: "Bodyweight bridge×12 → 50%×8 → 70%×4.",
            progression: "Both sets of 12 with a 1 sec lockout? Add 5 kg.",
            advanceAt: 12
        ),
        "lying-curl": ExerciseGuide(
            warmup: "1 light set of 12–15.",
            progression: "3×15 with full ROM? Go up one plate.",
            advanceAt: 15
        ),
        "seated-calf": ExerciseGuide(
            warmup: "1 light set of 15 with a slow stretch.",
            progression: "3×20 with full ROM? Go up by the smallest step.",
            advanceAt: 20
        ),
        "hanging-raise": ExerciseGuide(
            warmup: "Dead hang 20 sec → 6 slow knee raises.",
            progression: "3×15 without swinging? Move to straight legs or add a light weight.",
            advanceAt: 15
        ),
        "incline-machine": ExerciseGuide(
            warmup: "50%×10 → 70%×4.",
            progression: "3×12 at RIR 1–2? Go up one machine step.",
            advanceAt: 12
        ),
        "kneeling-lat": ExerciseGuide(
            warmup: "1 light set of 10 per side.",
            progression: "Both sides 15 with a full stretch? Go up one cable step.",
            advanceAt: 15
        ),
        "upper-fly": ExerciseGuide(
            warmup: "1 light set of 12.",
            progression: "Both sets of 15 under control? Go up one plate.",
            advanceAt: 15
        ),
        "science-lateral": ExerciseGuide(
            warmup: "1 very light set of 15–20.",
            progression: "3×20 strict in 2 sessions? Go up by the smallest cable step.",
            advanceAt: 20
        ),
        "science-preacher": ExerciseGuide(
            warmup: "1–2 light sets of 10 and 5 reps.",
            progression: "3×12 without shoulder movement in 2 sessions? Go up by the smallest step.",
            advanceAt: 12
        ),
    ]

    public static func guide(for exerciseID: String) -> ExerciseGuide {
        byExercise[exerciseID] ?? `default`
    }
}
