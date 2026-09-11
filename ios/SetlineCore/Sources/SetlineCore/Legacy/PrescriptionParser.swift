import Foundation

/// Turns the web app's authored Dutch strings into typed prescriptions.
///
/// This runs **once, at import**. TRAINING_LOGIC §15 change 1 is explicit
/// that regex-parsed text "must not survive into the native app" — so the
/// parser lives in the Legacy layer and nothing in the running app calls it.
/// The original strings travel alongside as `authoredNote`.
public enum PrescriptionParser {

    /// `"1×5–6 + 2×6–8"` → three prescriptions: 5…6, 6…8, 6…8.
    /// `"3×8–12 / been"` → three prescriptions of 8…12.
    /// `"2×10–15"` → two prescriptions of 10…15.
    public static func setPrescriptions(
        from prescription: String,
        targetRIR: ClosedRange<Int>
    ) -> [SetPrescription] {
        var result: [SetPrescription] = []
        let pattern = #"(\d+)\s*×\s*(?:(\d+)\s*[–-]\s*)?(\d+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return result }
        let range = NSRange(prescription.startIndex..., in: prescription)

        for match in regex.matches(in: prescription, range: range) {
            guard let countRange = Range(match.range(at: 1), in: prescription),
                  let upperRange = Range(match.range(at: 3), in: prescription),
                  let count = Int(prescription[countRange]),
                  let upper = Int(prescription[upperRange])
            else { continue }

            let lower: Int
            if let lowerRange = Range(match.range(at: 2), in: prescription),
               let parsed = Int(prescription[lowerRange]) {
                lower = parsed
            } else {
                lower = upper
            }

            let repRange = min(lower, upper)...max(lower, upper)
            for _ in 0..<count {
                result.append(SetPrescription(repRange: repRange, targetRIR: targetRIR))
            }
        }
        return result
    }

    /// Reads `"RIR 1–2"`, `"RIR 1"`, `"Laatste set RIR 0–1"` out of the load
    /// string. Falls back to the role's default from TRAINING_LOGIC §2.
    public static func targetRIR(from load: String, role: ExerciseRole) -> ClosedRange<Int> {
        let pattern = #"RIR\s*(\d+)(?:\s*[–-]\s*(\d+))?"#
        if let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) {
            let range = NSRange(load.startIndex..., in: load)
            if let match = regex.firstMatch(in: load, range: range),
               let firstRange = Range(match.range(at: 1), in: load),
               let first = Int(load[firstRange]) {
                if let secondRange = Range(match.range(at: 2), in: load),
                   let second = Int(load[secondRange]) {
                    return min(first, second)...max(first, second)
                }
                return first...first
            }
        }
        return defaultRIR(for: role)
    }

    /// §2: 1–2 for primary work, 0–2 for isolation and machine work.
    public static func defaultRIR(for role: ExerciseRole) -> ClosedRange<Int> {
        switch role {
        case .primaryStrength, .secondaryCompound: return 1...2
        case .accessory: return 1...2
        case .isolation: return 0...2
        }
    }

    /// Whether the authored prescription is per side ("/ been", "/ kant").
    public static func isUnilateral(_ prescription: String) -> Bool {
        let lowered = prescription.lowercased()
        return lowered.contains("/ been") || lowered.contains("/ kant") || lowered.contains("/been") || lowered.contains("/kant")
    }
}
