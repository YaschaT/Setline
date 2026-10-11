import SwiftUI
import SetlineCore
@preconcurrency import UserNotifications

// MARK: - The chosen goal

/// The body-weight goal, kept on this phone (the web app has no goal yet).
extension AppState {
    /// Badges for the habits around training: food, weigh-ins, the goal,
    /// photos. Photo dates are passed in where they have been read.
    func habitMilestones(photoDates: [Date] = []) -> [Milestone] {
        let weighIns = GoalCheck.weighIns(BodyProgress.make(metrics: metrics))
        if let goal = GoalPreference.goal {
            GoalPreference.noteWeeksOnTrack(GoalCheck.weeksOnTrack(goal: goal, weighIns: weighIns))
        }
        return Milestones.habits(
            entries: nutritionEntries,
            proteinTarget: targets.map { Double($0.protein) },
            weighInDates: weighIns.map(\.date),
            photoDates: photoDates,
            bestWeeksOnTrack: GoalPreference.bestWeeksOnTrack
        )
    }
}

enum GoalPreference {
    private static let key = "setline.weightGoal"
    private static let sinceKey = "setline.weightGoal.since"

    static var goal: WeightGoal? {
        get { UserDefaults.standard.string(forKey: key).flatMap(WeightGoal.init(rawValue:)) }
        set {
            UserDefaults.standard.set(newValue?.rawValue, forKey: key)
            UserDefaults.standard.set(newValue == nil ? nil : Date(), forKey: sinceKey)
        }
    }

    static var since: Date? { UserDefaults.standard.object(forKey: sinceKey) as? Date }

    private static let bestKey = "setline.weightGoal.bestWeeks"

    /// The longest run on track ever seen, kept so a badge once earned stays.
    static var bestWeeksOnTrack: Int { UserDefaults.standard.integer(forKey: bestKey) }

    static func noteWeeksOnTrack(_ weeks: Int) {
        if weeks > bestWeeksOnTrack { UserDefaults.standard.set(weeks, forKey: bestKey) }
    }
}

extension GoalCheck {
    /// Off track: there is something to change.
    var needsAction: Bool {
        switch verdict {
        case .onTrack, .tooEarly: return false
        default: return true
        }
    }

    /// The weigh-ins the check reads, from the app's metrics.
    static func weighIns(_ progress: BodyProgress) -> [(date: Date, kg: Double)] {
        progress.entries.map { ($0.date, NSDecimalNumber(decimal: $0.weightKg).doubleValue) }
    }

    /// Whole weeks in a row the trend was on track, counted back from now.
    static func weeksOnTrack(goal: WeightGoal, weighIns: [(date: Date, kg: Double)], now: Date = Date()) -> Int {
        var weeks = 0
        for back in 0..<26 {
            let moment = now.addingTimeInterval(-Double(back) * 7 * 86_400)
            if let since = GoalPreference.since, moment < since.addingTimeInterval(-Double(window) * 86_400) { break }
            guard evaluate(goal: goal, weighIns: weighIns, now: moment).verdict == .onTrack else { break }
            weeks += 1
        }
        return weeks
    }

    var headline: String {
        switch verdict {
        case .tooEarly: return "Checking your trend"
        case .onTrack: return "On track"
        case .tooSlow: return goal == .cut ? "Losing too slowly" : "Gaining too slowly"
        case .tooFast: return goal == .cut ? "Losing too fast" : "Gaining too fast"
        case .wrongWay:
            switch goal {
            case .cut: return "Weight is going up"
            case .maintain, .recomp: return (weeklyKg ?? 0) > 0 ? "Drifting up" : "Drifting down"
            default: return "Weight is going down"
            }
        }
    }

    /// One plain sentence: where the trend is and what to do about it.
    func detail(_ display: NumberDisplay) -> String {
        func kg(_ v: Double) -> String { (v > 0 ? "+" : v < 0 ? "−" : "") + String(format: "%.2f", abs(v)) + " kg" }
        let target = "\(kg(targetKg.lowerBound)) to \(kg(targetKg.upperBound)) a week"
        switch verdict {
        case .tooEarly(let weighIns, let days):
            var parts: [String] = []
            if weighIns > 0 { parts.append(weighIns == 1 ? "1 more weigh-in" : "\(weighIns) more weigh-ins") }
            if days > 0 { parts.append(days == 1 ? "1 more day" : "\(days) more days") }
            return "\(parts.joined(separator: " and ")) and Setline can tell you if you're on track. Goal: \(target)."
        case .onTrack:
            return "\(kg(weeklyKg ?? 0)) a week, right in your \(goal.title.lowercased()) range (\(target))."
        default:
            let pace = "\(kg(weeklyKg ?? 0)) a week over \(days) days; goal \(target)."
            guard let kcal = dailyKcalAdjustment, kcal != 0 else { return pace }
            return pace + " About \(kcal > 0 ? "+" : "−")\(abs(kcal)) kcal a day should fix it."
        }
    }
}

// MARK: - Picking a goal

struct GoalSheet: View {
    @Environment(AppState.self) private var app
    let latestKg: Double?
    let onPick: (WeightGoal?) -> Void
    let onClose: () -> Void
    @State private var selection: WeightGoal? = GoalPreference.goal
    @State private var appliedProtein = false

    var body: some View {
        SLSheet(title: "Your goal", subtitle: "Setline checks your weigh-ins against it", onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s3) {
                ForEach(WeightGoal.allCases, id: \.self) { goal in option(goal) }

                if let goal = selection, let kg = latestKg {
                    let protein = goal.proteinPerKg
                    let low = Int((protein.lowerBound * kg / 5).rounded()) * 5
                    let high = Int((protein.upperBound * kg / 5).rounded()) * 5
                    VStack(alignment: .leading, spacing: SL.Space.s2) {
                        Text("Protein for a \(goal.title.lowercased())").slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                        Text("\(low)–\(high) g a day at \(String(format: "%.1f", kg)) kg (\(String(format: "%.1f", protein.lowerBound))–\(String(format: "%.1f", protein.upperBound)) g per kg).")
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Button(appliedProtein ? "Protein target set to \((low + high) / 2) g" : "Use \((low + high) / 2) g as my protein target") {
                            Task {
                                await app.record([StateChange(.setTarget(field: "protein", value: Decimal((low + high) / 2)), createdAt: Date())])
                                appliedProtein = true
                            }
                        }
                        .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                        .foregroundStyle(appliedProtein ? SL.Ink.secondary : SL.Signal.action)
                        .disabled(appliedProtein)
                        .frame(minHeight: SL.Space.hitMin)
                    }
                    .padding(SL.Space.s4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised2))
                }

                Button("Save goal") { onPick(selection) }
                    .buttonStyle(SLPrimaryButtonStyle())
                    .padding(.top, SL.Space.s2)
                if GoalPreference.goal != nil {
                    Button("Remove goal") { onPick(nil) }
                        .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(maxWidth: .infinity, minHeight: SL.Space.hitMin)
                }
            }
        }
    }

    private func option(_ goal: WeightGoal) -> some View {
        let isOn = selection == goal
        let range = goal.weeklyRange
        let pace: String = {
            guard let kg = latestKg else {
                return String(format: "%+.2f to %+.2f %% a week", range.lowerBound * 100, range.upperBound * 100)
            }
            return String(format: "%+.2f to %+.2f kg a week", range.lowerBound * kg, range.upperBound * kg)
        }()
        return Button { selection = goal } label: {
            HStack(alignment: .top, spacing: SL.Space.s3) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(goal.title).slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                    Text(goal.summary).slMeta().foregroundStyle(SL.Ink.secondary).fixedSize(horizontal: false, vertical: true)
                    Text(pace).slMeta(SL.Weight.semibold).slNumerals().foregroundStyle(isOn ? SL.Signal.action : SL.Ink.secondary)
                }
                Spacer(minLength: SL.Space.s2)
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(isOn ? SL.Signal.action : SL.Ink.tertiary)
            }
            .padding(SL.Space.s3)
            .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised2))
            .overlay(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(isOn ? SL.Surface.selection : SL.Surface.hairline, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? [.isSelected, .isButton] : .isButton)
    }
}

// MARK: - The check, as a card

/// Where the weigh-ins stand against the goal: a verdict in a pill, the
/// pace in one sentence, weeks on track as the streak, and — when off
/// track — the calorie change that should fix it, one tap away.
struct GoalCheckCard: View {
    @Environment(AppState.self) private var app
    let check: GoalCheck
    let weeksOnTrack: Int
    var onChangeGoal: (() -> Void)? = nil
    @State private var applied = false

    var body: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            HStack(spacing: SL.Space.s2) {
                Text(check.goal.title.uppercased())
                    .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                    .tracking(1.2)
                    .foregroundStyle(SL.Ink.secondary)
                Spacer(minLength: SL.Space.s2)
                if let onChangeGoal {
                    Button("Change", action: onChangeGoal)
                        .font(.sl(SL.TypeSize.meta, SL.Weight.medium))
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(minHeight: 32)
                }
            }
            HStack(spacing: SL.Space.s2) {
                Image(systemName: symbol).font(.system(size: 14, weight: .bold))
                Text(check.headline).font(.sl(SL.TypeSize.body, SL.Weight.semibold))
            }
            .foregroundStyle(ink)
            .padding(.horizontal, SL.Space.s3)
            .frame(minHeight: 34)
            .background(Capsule().fill(ink.opacity(0.14)))
            Text(check.detail(app.display))
                .slMeta()
                .slNumerals()
                .foregroundStyle(SL.Ink.meta)
                .fixedSize(horizontal: false, vertical: true)
            if check.needsAction, let eaten = eatenLine {
                HStack(alignment: .top, spacing: SL.Space.s2) {
                    Image(systemName: "fork.knife").font(.system(size: 12, weight: .semibold))
                    Text(eaten).slMeta().slNumerals().fixedSize(horizontal: false, vertical: true)
                }
                .foregroundStyle(SL.Ink.primary)
            }
            if check.verdict == .onTrack, weeksOnTrack > 0 {
                HStack(spacing: 6) {
                    SLGlyph(name: .flameFill, size: 14, fixed: true)
                    Text(weeksOnTrack == 1 ? "1 week on track" : "\(weeksOnTrack) weeks on track")
                        .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                }
                .foregroundStyle(SL.Signal.action)
            }
            if let kcal = check.dailyKcalAdjustment, kcal != 0, let calories = app.targets?.calories, calories > 0 {
                Button {
                    Task {
                        await app.record([StateChange(.setTarget(field: "calories", value: Decimal(calories + kcal)), createdAt: Date())])
                        applied = true
                    }
                } label: {
                    Text(applied ? "Calorie target updated" : "Set calories to \(calories + kcal) kcal (\(kcal > 0 ? "+" : "−")\(abs(kcal)))")
                }
                .buttonStyle(SLOutlineButtonStyle())
                .disabled(applied)
            }
        }
        .padding(SL.Space.s4)
        .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised2))
        .accessibilityElement(children: .contain)
    }

    /// What the food log says over the same two weeks: whether the target
    /// was eaten at all, before the target itself is blamed.
    private var eatenLine: String? {
        let history = app.nutritionHistory()
        guard history.logged.count >= 3, let average = history.averageCalories else { return nil }
        let avg = app.display.whole(Decimal(average))
        guard let gap = history.averageGap, let target = history.calorieTarget else {
            return "You logged \(avg) kcal a day on \(history.logged.count) days."
        }
        if abs(gap) <= target / 10 {
            return "You logged \(avg) kcal a day, on your target: the target itself needs to move."
        }
        return "You logged \(avg) kcal a day, \(app.display.whole(Decimal(abs(gap)))) \(gap > 0 ? "over" : "under") your target. Eat to the target first."
    }

    private var ink: Color { check.verdictInk }
    private var symbol: String { check.verdictSymbol }
}

extension GoalCheck {
    /// Mint on track, amber off it, quiet while there is too little to say.
    var verdictInk: Color {
        switch verdict {
        case .onTrack: return SL.Signal.recovery
        case .tooEarly: return SL.Ink.secondary
        default: return SL.Signal.attention
        }
    }

    var verdictSymbol: String {
        switch verdict {
        case .onTrack: return "checkmark.seal.fill"
        case .tooEarly: return "hourglass"
        case .tooFast: return "hare.fill"
        default: return "exclamationmark.triangle.fill"
        }
    }
}

// MARK: - Reminders

/// Meal reminders and the weekly goal check-in, both local notifications.
@MainActor
enum NutritionReminders {
    static let mealsKey = "setline.reminders.meals"
    private static let goalNotifiedKey = "setline.reminders.goalNotified"
    private static let goalID = "setline.goal.checkin"

    static var mealsOn: Bool { UserDefaults.standard.bool(forKey: mealsKey) }

    /// Asks once, when the lifter turns a reminder on.
    static func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    static func update(app: AppState, now: Date = Date()) async {
        let center = UNUserNotificationCenter.current()
        let earlier = await center.pendingNotificationRequests()
            .map(\.identifier)
            .filter { $0.hasPrefix("setline.meal.") }
        center.removePendingNotificationRequests(withIdentifiers: earlier + [goalID])
        guard app.isSignedIn else { return }
        let status = await center.notificationSettings().authorizationStatus
        guard status == .authorized || status == .provisional else { return }

        if mealsOn {
            for (window, fire) in MealWindow.upcoming(entries: app.nutritionEntries, now: now) {
                let content = UNMutableNotificationContent()
                content.title = "\(window.label) not logged yet"
                content.body = window.meal == .avondeten
                    ? "Log dinner and any snacks — a full day keeps your goal check honest."
                    : "Takes ten seconds. Your \(window.label.lowercased()) window closes at \(window.endHour):00."
                content.sound = .default
                content.threadIdentifier = "setline.meals"
                let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
                try? await center.add(UNNotificationRequest(
                    identifier: "setline.meal.\(window.meal.rawValue).\(Schedule.dateKey(fire))", content: content,
                    trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)))
            }
        }

        // Off track: one check-in at most every seven days, next morning at 9.
        guard let goal = GoalPreference.goal else { return }
        let check = GoalCheck.evaluate(goal: goal, weighIns: GoalCheck.weighIns(BodyProgress.make(metrics: app.metrics)), now: now)
        let last = UserDefaults.standard.object(forKey: goalNotifiedKey) as? Date ?? .distantPast
        guard check.isOffTrack, now.timeIntervalSince(last) > 7 * 86_400,
              let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: now),
              let fire = Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: tomorrow)
        else { return }
        let content = UNMutableNotificationContent()
        content.title = "\(goal.title) check-in: \(check.headline.lowercased())"
        content.body = check.detail(app.display)
        content.sound = .default
        let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
        try? await center.add(UNNotificationRequest(identifier: goalID, content: content,
                                                    trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)))
        UserDefaults.standard.set(now, forKey: goalNotifiedKey)
    }
}
