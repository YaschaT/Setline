import { SetPrescription } from "../Domain/Model";
import type { ExerciseRole } from "../Domain/Vocabulary";
import { closedRange, type ClosedRange } from "../Support/range";
import { parseIntStrict } from "../Support/swift";

// `NSRegularExpression` (ICU): `\d` is any Unicode decimal digit, while
// Swift's `Int(_:)` then accepts ASCII digits only — so a match whose digits
// do not parse is skipped, exactly as the Swift `guard ... else { continue }`.
const setPattern = /(\p{Nd}+)\s*×\s*(?:(\p{Nd}+)\s*[–-]\s*)?(\p{Nd}+)/gu;
const rirPattern = /RIR\s*(\p{Nd}+)(?:\s*[–-]\s*(\p{Nd}+))?/iu;

/**
 * Turns the web app's authored Dutch strings into typed prescriptions.
 *
 * This runs **once, at import**. TRAINING_LOGIC §15 change 1 is explicit
 * that regex-parsed text "must not survive into the native app" — so the
 * parser lives in the Legacy layer and nothing in the running app calls it.
 * The original strings travel alongside as `authoredNote`.
 */
export const PrescriptionParser = {
  /**
   * `"1×5–6 + 2×6–8"` → three prescriptions: 5…6, 6…8, 6…8.
   * `"3×8–12 / been"` → three prescriptions of 8…12.
   * `"2×10–15"` → two prescriptions of 10…15.
   */
  setPrescriptions(a: { from: string; targetRIR: ClosedRange }): SetPrescription[] {
    const prescription = a.from;
    const result: SetPrescription[] = [];
    for (const match of prescription.matchAll(setPattern)) {
      const count = parseIntStrict(match[1]);
      const upper = parseIntStrict(match[3]);
      if (count === undefined || upper === undefined) continue;

      let lower: number;
      const parsed = match[2] !== undefined ? parseIntStrict(match[2]) : undefined;
      if (parsed !== undefined) {
        lower = parsed;
      } else {
        lower = upper;
      }

      const repRange = closedRange(Math.min(lower, upper), Math.max(lower, upper));
      for (let i = 0; i < count; i++) {
        result.push(SetPrescription.make({ repRange, targetRIR: a.targetRIR }));
      }
    }
    return result;
  },

  /**
   * Reads `"RIR 1–2"`, `"RIR 1"`, `"Laatste set RIR 0–1"` out of the load
   * string. Falls back to the role's default from TRAINING_LOGIC §2.
   */
  targetRIR(a: { from: string; role: ExerciseRole }): ClosedRange {
    const match = rirPattern.exec(a.from);
    if (match) {
      const first = parseIntStrict(match[1]);
      if (first !== undefined) {
        const second = match[2] !== undefined ? parseIntStrict(match[2]) : undefined;
        if (second !== undefined) {
          return closedRange(Math.min(first, second), Math.max(first, second));
        }
        return closedRange(first, first);
      }
    }
    return PrescriptionParser.defaultRIR({ for: a.role });
  },

  /** §2: 1–2 for primary work, 0–2 for isolation and machine work. */
  defaultRIR(a: { for: ExerciseRole }): ClosedRange {
    switch (a.for) {
      case "primaryStrength":
      case "secondaryCompound":
        return closedRange(1, 2);
      case "accessory":
        return closedRange(1, 2);
      case "isolation":
        return closedRange(0, 2);
    }
  },

  /** Whether the authored prescription is per side ("/ been", "/ kant"). */
  isUnilateral(prescription: string): boolean {
    const lowered = prescription.toLowerCase();
    return (
      lowered.includes("/ been") || lowered.includes("/ kant") || lowered.includes("/been") || lowered.includes("/kant")
    );
  },
};
