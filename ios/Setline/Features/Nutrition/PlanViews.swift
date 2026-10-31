import SwiftUI
import SetlineCore

// MARK: - Height, sex and age

/// Height, sex and age, kept on this phone next to the goal.
enum BodyProfilePreference {
    private static let key = "setline.bodyProfile"

    static var profile: BodyProfile? {
        get { UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(BodyProfile.self, from: $0) } }
        set { UserDefaults.standard.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: key) }
    }
}

/// Everything the plan reads, worked out once per look.
struct NutritionPlan {
    let goal: WeightGoal?
    let profile: BodyProfile?
    let latestKg: Double?
    let check: GoalCheck?
    let energy: EnergyCheck?
    let direction: EnergyCheck.Direction

    @MainActor
    static func make(app: AppState, goal: WeightGoal?, profile: BodyProfile?) -> NutritionPlan {
        let progress = BodyProgress.make(metrics: app.metrics)
        let latest = progress.latest.map { NSDecimalNumber(decimal: $0.weightKg).doubleValue }
        let check = goal.map {
            GoalCheck.evaluate(goal: $0, weighIns: GoalCheck.weighIns(progress), startedAt: GoalPreference.since)
        }
        let history = app.nutritionHistory()
        let enough = history.logged.count >= 3
        let energy: EnergyCheck? = {
            guard let goal, let profile, let latest, profile.isValid() else { return nil }
            return EnergyCheck.make(
                profile: profile,
                weightKg: latest,
                goal: goal,
                workoutsPerWeek: EnergyCheck.workoutsPerWeek(sessionDates: app.sessions.map(\.date)),
                calorieTarget: app.targets.map(\.calories).flatMap { $0 > 0 ? $0 : nil },
                averageKcal: enough ? history.averageCalories : nil,
                averageProtein: enough ? history.averageProtein : nil
            )
        }()
        return NutritionPlan(goal: goal, profile: profile, latestKg: latest, check: check, energy: energy,
                             direction: EnergyCheck.direction(trend: check?.verdict, intake: energy?.intake ?? .unknown))
    }

    var isSetUp: Bool { goal != nil && profile != nil && latestKg != nil }

    /// What is still missing before the check can run, in order.
    var missing: [String] {
        var out: [String] = []
        if goal == nil { out.append("your goal") }
        if latestKg == nil { out.append("your weight") }
        if profile == nil { out.append("height, sex and age") }
        return out
    }

    var headline: String {
        guard isSetUp else { return "Set up your plan" }
        switch direction {
        case .right: return "You're heading the right way"
        case .off: return "Slightly off course"
        case .unknown: return "Log a few days to see"
        }
    }

    var sentence: String {
        guard isSetUp else {
            return "Add \(PlanCopy.list(missing)) and Setline checks your eating against what science says works for you."
        }
        if let check, check.needsAction { return check.headline + ". " + (fix ?? "Open your plan to see what to change.") }
        if let check, check.verdict == .onTrack { return "Your weight moves at the pace your \(check.goal.title.lowercased()) asks for." }
        guard let energy else { return "Log your weight a few mornings and your food for 3 days." }
        switch energy.intake {
        case .good: return "You eat inside the \(PlanCopy.kcal(energy.calorieRange)) a \(goal!.title.lowercased()) asks for. The scale confirms it in a week or two."
        case .high: return "You eat about \(PlanCopy.thousands(PlanCopy.round50((energy.averageKcal ?? 0) - energy.calorieRange.upperBound))) kcal a day more than a \(goal!.title.lowercased()) asks for."
        case .low: return "You eat about \(PlanCopy.thousands(PlanCopy.round50(energy.calorieRange.lowerBound - (energy.averageKcal ?? 0)))) kcal a day less than a \(goal!.title.lowercased()) asks for."
        case .unknown: return "Log your food for 3 days and Setline compares it with the \(PlanCopy.kcal(energy.calorieRange)) your goal asks for."
        }
    }

    private var fix: String? {
        guard let kcal = check?.dailyKcalAdjustment, kcal != 0 else { return nil }
        return "About \(kcal > 0 ? "+" : "−")\(abs(kcal)) kcal a day fixes it."
    }

    var ink: Color {
        guard isSetUp else { return SL.Signal.action }
        switch direction {
        case .right: return SL.Signal.action
        case .off: return SL.Signal.attention
        case .unknown: return SL.Ink.secondary
        }
    }

    var symbol: String {
        guard isSetUp else { return "scope" }
        switch direction {
        case .right: return "checkmark.circle.fill"
        case .off: return "exclamationmark.triangle.fill"
        case .unknown: return "hourglass"
        }
    }
}

enum PlanCopy {
    /// "About 1,150", not "1,154": the estimate isn't that exact.
    static func round50(_ value: Int) -> Int { max(50, Int((Double(value) / 50).rounded()) * 50) }
    static func thousands(_ value: Int) -> String { value.formatted(.number.grouping(.automatic).locale(Locale(identifier: "en_GB"))) }
    static func kcal(_ range: ClosedRange<Int>) -> String { "\(thousands(range.lowerBound))–\(thousands(range.upperBound)) kcal" }
    static func list(_ parts: [String]) -> String {
        switch parts.count {
        case 0: return ""
        case 1: return parts[0]
        default: return parts.dropLast().joined(separator: ", ") + " and " + parts.last!
        }
    }
    static func kg(_ value: Double) -> String { String(format: "%.1f", value) }
}

// MARK: - The card on Nutrition

/// Weight, goal and whether the eating fits it, on the Nutrition tab where
/// people look for it: one verdict, three numbers, one clear way in.
struct NutritionPlanCard: View {
    @Environment(AppState.self) private var app
    let plan: NutritionPlan
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                HStack(spacing: SL.Space.s2) {
                    SLOverline(text: plan.goal.map { "Your plan · \($0.title)" } ?? "Your plan", color: SL.Ink.secondary)
                    Spacer(minLength: SL.Space.s2)
                    SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
                }
                HStack(alignment: .top, spacing: SL.Space.s3) {
                    Image(systemName: plan.symbol)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(plan.ink)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(plan.ink.opacity(0.14)))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(plan.headline).slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                        Text(plan.sentence)
                            .slMeta().slNumerals()
                            .foregroundStyle(SL.Ink.secondary)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if plan.isSetUp {
                    HStack(spacing: 0) {
                        figure(plan.latestKg.map { "\(PlanCopy.kg($0)) kg" } ?? "—", trendLabel)
                        divider
                        figure(plan.energy.map { PlanCopy.thousands(($0.calorieRange.lowerBound + $0.calorieRange.upperBound) / 2) } ?? "—", "kcal a day")
                        divider
                        figure(plan.energy.map { "\($0.proteinRange.lowerBound) g+" } ?? "—", "protein")
                    }
                    .padding(.vertical, SL.Space.s3)
                    .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
                }
                Text(plan.isSetUp ? "Open your plan" : "Set up my plan")
                    .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                    .foregroundStyle(plan.isSetUp ? SL.Ink.primary : SL.Signal.onAction)
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .background(Capsule().fill(plan.isSetUp ? SL.Surface.raised2 : SL.Signal.action))
                    .overlay(Capsule().strokeBorder(plan.isSetUp ? SL.Surface.hairlineStrong : .clear, lineWidth: 1))
            }
            .padding(SL.Space.s4)
            .background(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).fill(SL.Surface.raised))
            .overlay(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(plan.direction == .off && plan.isSetUp ? SL.Signal.attention.opacity(0.4) : SL.Surface.hairline, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.98))
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens your plan: weight, goal and what to eat")
    }

    private var trendLabel: String {
        guard let weekly = plan.check?.weeklyKg else { return "weight" }
        return String(format: "%@%.2f kg/wk", weekly > 0 ? "+" : weekly < 0 ? "−" : "", abs(weekly))
    }

    private var divider: some View {
        Rectangle().fill(SL.Surface.hairline).frame(width: 1, height: 30)
    }

    private func figure(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.sl(SL.TypeSize.lead, SL.Weight.bold)).slNumerals().foregroundStyle(SL.Ink.primary).lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(.sl(SL.TypeSize.micro, SL.Weight.medium)).slNumerals().foregroundStyle(SL.Ink.secondary).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - The plan, in full

struct NutritionPlanSheet: View {
    @Environment(AppState.self) private var app
    let onClose: () -> Void

    @State private var goal = GoalPreference.goal
    @State private var profile = BodyProfilePreference.profile
    @State private var heightText = BodyProfilePreference.profile.map { String(Int($0.heightCm)) } ?? ""
    @State private var ageText = BodyProfilePreference.profile.map { String($0.age()) } ?? ""
    @State private var sex: BodyProfile.Sex? = BodyProfilePreference.profile?.sex
    @State private var choosingGoal = false
    @State private var weighing = false
    @State private var applied = false
    @State private var showsSources = false
    @FocusState private var field: Field?

    enum Field { case height, age }

    private var plan: NutritionPlan { NutritionPlan.make(app: app, goal: goal, profile: profile) }

    var body: some View {
        SLSheet(title: "Your plan", subtitle: "Your weight, your goal, and what to eat for it", onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s5) {
                verdict
                weightSection
                aboutYou
                if let energy = plan.energy { science(energy) }
                sources
            }
        }
        .sheet(isPresented: $choosingGoal) {
            GoalSheet(latestKg: plan.latestKg, onPick: { picked in
                GoalPreference.goal = picked
                goal = picked
                choosingGoal = false
                Task { await NutritionReminders.update(app: app) }
            }, onClose: { choosingGoal = false })
        }
        .sheet(isPresented: $weighing) {
            WeighInSheet(date: Date(), existing: app.weighIn(), latest: plan.latestKg.map { Decimal($0) },
                         onSave: { weight in
                             weighing = false
                             Task { await app.saveWeighIn(weight) }
                         }, onClose: { weighing = false })
        }
    }

    private var verdict: some View {
        HStack(alignment: .top, spacing: SL.Space.s3) {
            Image(systemName: plan.symbol)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(plan.ink)
                .frame(width: 44, height: 44)
                .background(Circle().fill(plan.ink.opacity(0.14)))
            VStack(alignment: .leading, spacing: 4) {
                Text(plan.headline).slLead(SL.Weight.bold).foregroundStyle(SL.Ink.primary)
                Text(plan.sentence).slBody().slNumerals().foregroundStyle(SL.Ink.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(plan.ink.opacity(0.08)))
        .overlay(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).strokeBorder(plan.ink.opacity(0.3), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    // MARK: Weight and goal

    private var weightSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLOverline(text: "Weight & goal", color: SL.Ink.secondary)
            VStack(spacing: 0) {
                row(icon: "scalemass.fill", title: "Weight",
                    value: plan.latestKg.map { "\(PlanCopy.kg($0)) kg" } ?? "Not logged yet",
                    detail: plan.check?.weeklyKg.map { String(format: "%@%.2f kg a week, last weeks", $0 > 0 ? "+" : $0 < 0 ? "−" : "", abs($0)) },
                    action: app.weighIn() == nil ? "Log today" : "Edit today") { weighing = true }
                SLHairline().padding(.leading, 52)
                row(icon: "scope", title: "Goal", value: goal?.title ?? "No goal yet",
                    detail: plan.check.map { $0.headline }, action: goal == nil ? "Set goal" : "Change") { choosingGoal = true }
            }
            .slListCard()
        }
    }

    private func row(icon: String, title: String, value: String, detail: String?, action: String, perform: @escaping () -> Void) -> some View {
        HStack(spacing: SL.Space.s3) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SL.Signal.action)
                .frame(width: 36, height: 36)
                .background(Circle().fill(SL.Signal.actionTint))
            VStack(alignment: .leading, spacing: 1) {
                Text(title).slMeta().foregroundStyle(SL.Ink.secondary)
                Text(value).slBody(SL.Weight.semibold).slNumerals().foregroundStyle(SL.Ink.primary)
                if let detail { Text(detail).slMeta().slNumerals().foregroundStyle(SL.Ink.secondary) }
            }
            Spacer(minLength: SL.Space.s2)
            Button(action, action: perform)
                .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                .foregroundStyle(SL.Signal.action)
                .padding(.horizontal, SL.Space.s3)
                .frame(minHeight: 36)
                .background(Capsule().strokeBorder(SL.Signal.action.opacity(0.5), lineWidth: 1))
                .buttonStyle(.plain)
        }
        .padding(SL.Space.s3)
    }

    // MARK: About you

    private var aboutYou: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLOverline(text: "About you", color: SL.Ink.secondary)
            VStack(alignment: .leading, spacing: SL.Space.s3) {
                HStack(spacing: SL.Space.s2) {
                    ForEach(BodyProfile.Sex.allCases, id: \.self) { value in
                        let on = sex == value
                        Button {
                            sex = value
                            saveProfile()
                        } label: {
                            Text(value.label)
                                .font(.sl(SL.TypeSize.body, on ? SL.Weight.semibold : SL.Weight.medium))
                                .foregroundStyle(on ? SL.Signal.onAction : SL.Ink.primary)
                                .frame(maxWidth: .infinity, minHeight: 42)
                                .background(Capsule().fill(on ? SL.Signal.action : SL.Surface.raised2))
                        }
                        .buttonStyle(SLPressStyle(scale: 0.97))
                        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
                    }
                }
                HStack(spacing: SL.Space.s3) {
                    numberField("Height", text: $heightText, unit: "cm", focus: .height)
                    numberField("Age", text: $ageText, unit: "years", focus: .age)
                }
                Text(profile == nil
                     ? "Used only for the estimate below, and kept on this device."
                     : "Kept on this device. Used only for the estimate below.")
                    .slMeta().foregroundStyle(SL.Ink.tertiary)
            }
            .padding(SL.Space.s4)
            .slListCard()
        }
        .onChange(of: field) { _, now in if now == nil { saveProfile() } }
    }

    private func numberField(_ label: String, text: Binding<String>, unit: String, focus: Field) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).slMeta().foregroundStyle(SL.Ink.secondary)
            HStack(spacing: 6) {
                TextField(focus == .height ? "180" : "30", text: text)
                    .keyboardType(.numberPad)
                    .focused($field, equals: focus)
                    .font(.sl(SL.TypeSize.lead, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
                    .tint(SL.Signal.action)
                    .onChange(of: text.wrappedValue) { _, _ in saveProfile() }
                Text(unit).slMeta().foregroundStyle(SL.Ink.secondary)
            }
            .padding(.horizontal, SL.Space.s3)
            .frame(minHeight: 46)
            .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
        }
        .frame(maxWidth: .infinity)
    }

    private func saveProfile() {
        guard let sex, let height = Double(heightText), let age = Int(ageText) else { return }
        let year = Calendar(identifier: .gregorian).component(.year, from: Date()) - age
        let candidate = BodyProfile(heightCm: height, sex: sex, birthYear: year)
        guard candidate.isValid() else { return }
        BodyProfilePreference.profile = candidate
        profile = candidate
    }

    // MARK: The science

    private func science(_ energy: EnergyCheck) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLOverline(text: "What science says for you", color: SL.Ink.secondary)
            VStack(spacing: 0) {
                scienceRow("Maintenance", "\(PlanCopy.thousands(energy.maintenance)) kcal",
                           "Resting \(PlanCopy.thousands(energy.bmr)) kcal × \(String(format: "%.2f", energy.activityFactor)) for \(energy.activityLabel.lowercased())", status: nil)
                SLHairline()
                scienceRow("Eat for a \(goal?.title.lowercased() ?? "goal")", PlanCopy.kcal(energy.calorieRange),
                           "Maintenance \(paceWords)", status: nil)
                SLHairline()
                scienceRow("Your calorie target", app.targets.map { "\(PlanCopy.thousands($0.calories)) kcal" } ?? "None set",
                           targetWords(energy.target), status: energy.target)
                SLHairline()
                scienceRow("You ate, last 2 weeks", energy.averageKcal.map { "\(PlanCopy.thousands($0)) kcal a day" } ?? "Not enough logged",
                           intakeWords(energy), status: energy.intake)
                SLHairline()
                scienceRow("Protein", energy.averageProtein.map { "\($0) g a day" } ?? "Not enough logged",
                           "Aim for \(energy.proteinRange.lowerBound)–\(energy.proteinRange.upperBound) g", status: energy.protein)
                SLHairline()
                scienceRow("BMI", String(format: "%.1f", energy.bmi), "\(energy.bmiLabel). Muscle reads as weight here.", status: nil)
            }
            .slListCard()

            let kcal = (energy.calorieRange.lowerBound + energy.calorieRange.upperBound) / 2
            let protein = (energy.proteinRange.lowerBound + energy.proteinRange.upperBound) / 2
            if app.targets?.calories != kcal || app.targets?.protein != protein {
                Button(applied ? "Targets set" : "Use \(PlanCopy.thousands(kcal)) kcal and \(protein) g protein as my targets") {
                    Task {
                        await app.record([
                            StateChange(.setTarget(field: "calories", value: Decimal(kcal)), createdAt: Date()),
                            StateChange(.setTarget(field: "protein", value: Decimal(protein)), createdAt: Date()),
                        ])
                        applied = true
                    }
                }
                .buttonStyle(SLPrimaryButtonStyle())
                .disabled(applied)
                .padding(.top, SL.Space.s2)
            }
            Text("Estimates are within about 10 % for most people. Your weigh-ins are the final judge: Setline checks them against your goal.")
                .slMeta().foregroundStyle(SL.Ink.tertiary).fixedSize(horizontal: false, vertical: true)
        }
    }

    private var paceWords: String {
        switch goal {
        case .cut: return "minus 0.5–1 % of your weight a week"
        case .leanBulk, .bulk: return "plus a slow weekly gain"
        default: return "held steady"
        }
    }

    private func targetWords(_ status: EnergyCheck.Status) -> String {
        switch status {
        case .good: return "Inside the range"
        case .high: return "Above the range for your goal"
        case .low: return "Below the range for your goal"
        case .unknown: return "Set one below, or in Targets"
        }
    }

    private func intakeWords(_ energy: EnergyCheck) -> String {
        switch energy.intake {
        case .good: return "Inside the range"
        case .high: return "Above the range"
        case .low: return "Below the range"
        case .unknown: return "Log 3 days of food to compare"
        }
    }

    private func scienceRow(_ title: String, _ value: String, _ detail: String, status: EnergyCheck.Status?) -> some View {
        HStack(alignment: .top, spacing: SL.Space.s3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).slMeta().foregroundStyle(SL.Ink.secondary)
                Text(value).slBody(SL.Weight.semibold).slNumerals().foregroundStyle(SL.Ink.primary)
                Text(detail).slMeta().slNumerals().foregroundStyle(SL.Ink.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: SL.Space.s2)
            if let status { badge(status) }
        }
        .padding(SL.Space.s3)
        .accessibilityElement(children: .combine)
    }

    private func badge(_ status: EnergyCheck.Status) -> some View {
        let (text, ink, symbol): (String, Color, String) = {
            switch status {
            case .good: return ("On target", SL.Signal.action, "checkmark")
            case .high: return ("Too high", SL.Signal.attention, "arrow.up")
            case .low: return ("Too low", SL.Signal.attention, "arrow.down")
            case .unknown: return ("No data", SL.Ink.secondary, "minus")
            }
        }()
        return HStack(spacing: 4) {
            Image(systemName: symbol).font(.system(size: 10, weight: .bold))
            Text(text).font(.sl(SL.TypeSize.micro, SL.Weight.bold))
        }
        .foregroundStyle(ink)
        .padding(.horizontal, 8)
        .frame(minHeight: 24)
        .background(Capsule().fill(ink.opacity(0.14)))
    }

    // MARK: Sources

    private var sources: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Button {
                withAnimation(.easeOut(duration: 0.2)) { showsSources.toggle() }
            } label: {
                HStack {
                    SLOverline(text: "Sources · \(EnergyCheck.sources.count)", color: SL.Ink.secondary)
                    Spacer()
                    Image(systemName: showsSources ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SL.Ink.tertiary)
                }
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if showsSources {
                VStack(alignment: .leading, spacing: SL.Space.s3) {
                    ForEach(EnergyCheck.sources) { source in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(source.claim).slMeta().foregroundStyle(SL.Ink.primary).fixedSize(horizontal: false, vertical: true)
                            Text(source.citation).font(.sl(SL.TypeSize.micro, SL.Weight.medium)).foregroundStyle(SL.Ink.tertiary)
                        }
                    }
                }
                .padding(SL.Space.s4)
                .slListCard()
            }
        }
    }
}
