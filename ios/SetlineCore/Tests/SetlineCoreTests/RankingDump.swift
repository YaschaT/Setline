import XCTest
@testable import SetlineCore

final class RankingDump: XCTestCase {
    func testDump() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["DUMP"] == "1")
        func show(_ id: String, _ reason: SwapReason, _ pain: Set<LoadTag> = []) {
            let r = SubstitutionRanker.rank(SwapContext(
                currentExerciseID: id, role: ExerciseCatalog.role(id),
                reason: reason, painfulLoadTags: pain))
            let line = r.map { "\($0.exercise.id)(\(String(format: "%.2f", $0.score)))\($0.match == .related ? "~" : "")\($0.curatedWhy == nil ? "" : "*")" }
            let tag = pain.isEmpty ? reason.rawValue : "\(reason.rawValue)+\(pain.map(\.rawValue).sorted().joined(separator: ","))"
            print("DUMP \(id.padding(toLength: 18, withPad: " ", startingAt: 0)) \(tag.padding(toLength: 34, withPad: " ", startingAt: 0)) → \(line.joined(separator: "  "))")
        }
        for id in ExerciseCatalog.all.keys.sorted() where SubstitutionRanker.canonical(id) == id {
            show(id, .preference)
        }
        print("DUMP ---- context ----")
        show("flat-bench", .occupied)
        show("lat-pulldown", .occupied)
        show("hack-squat", .occupied)
        show("incline-bench", .occupied)
        show("flat-bench", .discomfort, [.endRangeShoulder])
        show("rdl", .discomfort, [.axialSpinalLoad, .lumbarFlexion])
        show("hack-squat", .discomfort, [.deepKneeFlexion])
        show("overhead-press", .discomfort, [.overheadPosition])
    }
}
