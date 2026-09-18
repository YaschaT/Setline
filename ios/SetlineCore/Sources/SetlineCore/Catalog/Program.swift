import Foundation

/// A programme the account can be on.
///
/// Switching between them changes which plan the week is built from. It does
/// not rewrite anything: the account's own edited plan stays exactly as the web
/// app left it, and each programme keeps its own schedule overrides, because
/// those are scoped by programme key.
public struct Program: Identifiable, Equatable, Sendable {
    public let mode: String
    public let sciencePlanID: String?
    public let name: String
    /// What the week looks like on it, in the plan's own day names.
    public let shape: String

    public var id: String { Schedule.programKey(mode: mode, sciencePlanID: sciencePlanID ?? "ppl-ul") }

    public init(mode: String, sciencePlanID: String?, name: String, shape: String) {
        self.mode = mode
        self.sciencePlanID = sciencePlanID
        self.name = name
        self.shape = shape
    }

    public func matches(mode: String, sciencePlanID: String) -> Bool {
        self.mode == mode && (self.mode == "personal" || self.sciencePlanID == sciencePlanID)
    }
}

public enum ProgramCatalog {

    /// The account's own plan, described by what is actually in it.
    public static func personal(_ plan: [WorkoutDay]) -> Program {
        Program(
            mode: "personal",
            sciencePlanID: nil,
            name: AccountSummary.planName(plan: plan, mode: "personal", sciencePlanID: "ppl-ul"),
            shape: shape(of: plan)
        )
    }

    public static let science: [Program] = [
        Program(
            mode: "science",
            sciencePlanID: "ppl-ul",
            name: "PPL + Upper / Lower",
            shape: shape(of: PlanCatalog.sciencePPLUL)
        ),
        Program(
            mode: "science",
            sciencePlanID: "upper-lower",
            name: "Upper / Lower",
            shape: shape(of: PlanCatalog.scienceUpperLower)
        ),
        Program(
            mode: "science",
            sciencePlanID: "full-body",
            name: "Full body",
            shape: shape(of: PlanCatalog.scienceFullBody)
        ),
    ]

    public static func all(personalPlan: [WorkoutDay]) -> [Program] {
        [personal(personalPlan)] + science
    }

    public static func current(in state: LegacyState, plan: [WorkoutDay]) -> Program {
        let (mode, scienceID) = LegacyAdapter.planMode(from: state)
        return all(personalPlan: plan).first { $0.matches(mode: mode, sciencePlanID: scienceID) }
            ?? personal(plan)
    }

    private static func shape(of plan: [WorkoutDay]) -> String {
        plan.map(\.short).joined(separator: " · ")
    }
}
