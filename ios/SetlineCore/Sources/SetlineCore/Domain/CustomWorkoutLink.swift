import Foundation

/// A workout of your own as a link, to send through any chat. Everything the
/// workout is travels in the link itself, so it needs no server, works from
/// iPhone to Android and back, and opening it only ever offers to save a
/// copy: nothing is added without a tap.
public enum CustomWorkoutLink {
    public static let parameter = "workout"

    /// The live site, which every phone can open.
    private static let site = "https://youfit-app.vercel.app"

    private struct Wire: Codable {
        var n: String
        var i: [String]
    }

    public struct Received: Sendable {
        public let workout: CustomWorkout
        /// Exercises this app's catalogue doesn't know, left out of the copy.
        public let skipped: Int
    }

    /// `{"n":"Push A","i":["flat-bench-press~3~6~8", …]}`, base64url.
    public static func code(_ workout: CustomWorkout) -> String {
        let wire = Wire(n: workout.name, i: workout.items.map { "\($0.exerciseID)~\($0.sets)~\($0.repLow)~\($0.repHigh)" })
        let data = (try? JSONEncoder().encode(wire)) ?? Data()
        return data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    public static func url(_ workout: CustomWorkout) -> URL {
        URL(string: "\(site)/?\(parameter)=\(code(workout))")!
    }

    /// What the chat message says around the link.
    public static func message(_ workout: CustomWorkout) -> String {
        "Try my workout “\(workout.name)” on Setline:"
    }

    /// A copy to save: a new id, today's date, only exercises this app knows,
    /// every number kept in range. Nothing at all when the link is damaged or
    /// holds no exercise this app knows.
    public static func received(_ code: String, now: Date = Date()) -> Received? {
        var base64 = code.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64 += "=" }
        guard let data = Data(base64Encoded: base64),
              let wire = try? JSONDecoder().decode(Wire.self, from: data) else { return nil }
        let name = String(wire.n.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40))
        let items: [CustomWorkout.Item] = wire.i.compactMap { line in
            let parts = line.split(separator: "~", omittingEmptySubsequences: false).map(String.init)
            guard let id = parts.first, !id.isEmpty, ExerciseCatalog.exercise(id) != nil else { return nil }
            func number(_ index: Int, _ fallback: Int) -> Int {
                guard parts.indices.contains(index), let n = Int(parts[index]), n > 0, n <= 100 else { return fallback }
                return n
            }
            return CustomWorkout.Item(exerciseID: id, sets: number(1, 3), repLow: number(2, 8), repHigh: number(3, 12))
        }
        guard !items.isEmpty else { return nil }
        return Received(
            workout: CustomWorkout(name: name.isEmpty ? "Shared workout" : name, items: items, createdAt: now),
            skipped: wire.i.count - items.count
        )
    }
}
