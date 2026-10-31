import SwiftUI
import UIKit
import SetlineCore

/// Redesign 1c · Voeding.
///
/// What is left to eat is the one loud number, in the card at the top with the
/// one action beside it. Under it the day's macros against their targets, and
/// then what was eaten: one row per item, with when, which meal and what it
/// cost. Tapping a row opens the item; a swipe offers to take it off the day.
///
/// Amber appears once, and only when the account's own log earns it: two or
/// more whole days in a row under the protein target.
struct NutritionHomeView: View {
    @Environment(AppState.self) private var app
    /// The avatar's way to Account, as on Training.
    var onAccount: () -> Void = {}
    /// The likely meal's ring breathes, like today's on Training.
    @State private var breathes = false
    /// The protein goal's moment has played for this date.
    @AppStorage("setline.nutrition.proteinCelebrated") private var proteinCelebrated = ""
    @State private var proteinPops = 0
    /// The quick add just tapped, shown as added for a moment.
    @State private var addedIdea: String?
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    /// The clock this screen is reading. Held rather than asked for on every
    /// line, so the date, the meal the sheet opens on and what a tap logs are
    /// one moment; read again whenever the screen is come back to, so a phone
    /// left open over lunch does not still say ontbijt.
    @State private var now = Date()

    /// One sheet at a time, and one modifier for it: two `.sheet`s on the same
    /// view make iOS treat the first as a card with another on top of it, and
    /// draw it scaled back.
    @State private var sheet: Sheet?
    @State private var toast: Toast?

    enum Sheet: Identifiable {
        case add(Meal)
        case edit(NutritionEntry)
        case targets
        case recipe(Recipe)
        case plan

        var id: String {
            switch self {
            case .add(let meal): return "add-\(meal.rawValue)"
            case .edit(let entry): return "edit-\(entry.id)"
            case .targets: return "targets"
            case .recipe(let recipe): return "recipe-\(recipe.id)"
            case .plan: return "plan"
            }
        }
    }
    /// The row whose delete is showing, by entry id. One at a time.
    @State private var swiped: String?
    /// The day the food log shows, by date key; nil is today.
    @State private var diaryDay: String?
    @AppStorage(NutritionReminders.mealsKey) private var mealReminders = false
    /// The offer to switch reminders on, once answered, isn't made again.
    @AppStorage("setline.reminders.offered") private var remindersOffered = false
    @State private var remindersDenied = false

    /// The meals opened in the food log. Closed by default: the totals say
    /// enough until a meal is looked into.
    @State private var openMeals: Set<String> = []

    struct Toast: Identifiable {
        let id = UUID()
        let message: String
        let undo: (() -> Void)?
    }

    private var day: NutritionDay { app.nutrition(on: now) }

    /// What the hour suggests. The sheet opens there, one tap from any other
    /// meal.
    private var likely: Meal { Meal.likely(at: now) }

    /// The day's items in the order they are eaten: ontbijt, lunch, avondeten,
    /// snacks, each in the order it was logged.
    private var eaten: [(entry: NutritionEntry, section: MealSection)] {
        day.sections.flatMap { section in section.entries.map { ($0, section) } }
    }

    /// The in-app side of the meal reminders: a meal whose reminder time has
    /// passed with nothing logged says so here, with the way to log it; and
    /// while reminders are off, the app offers them once.
    @ViewBuilder
    private var mealNudge: some View {
        if let missing = MealWindow.missing(entries: app.nutritionEntries, now: now) {
            HStack(spacing: SL.Space.s3) {
                Image(systemName: "bell.badge.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(SL.Signal.attention)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(SL.Signal.attention.opacity(0.14)))
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(missing.label) isn't logged yet")
                        .slBody(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                    Text(missing.endHour >= 24 ? "Dinner and snacks count until midnight" : "Your \(missing.label.lowercased()) window closes at \(missing.endHour):00")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                }
                Spacer(minLength: SL.Space.s2)
                Button {
                    now = Date()
                    sheet = .add(missing.meal)
                } label: {
                    Text("Log")
                        .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                        .foregroundStyle(SL.Signal.onAction)
                        .padding(.horizontal, SL.Space.s4)
                        .frame(minHeight: 36)
                        .background(Capsule().fill(SL.Signal.action))
                }
                .buttonStyle(SLPressStyle(scale: 0.94))
                .accessibilityLabel("Log \(missing.label.lowercased())")
            }
            .padding(SL.Space.s3)
            .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised))
            .overlay(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).strokeBorder(SL.Signal.attention.opacity(0.35), lineWidth: 1))
            .accessibilityElement(children: .contain)
        } else if !mealReminders, !remindersOffered {
            HStack(alignment: .top, spacing: SL.Space.s3) {
                Image(systemName: "bell.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(SL.Signal.action)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(SL.Signal.actionTint))
                VStack(alignment: .leading, spacing: SL.Space.s2) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Get a nudge when a meal isn't logged")
                            .slBody(SL.Weight.semibold)
                            .foregroundStyle(SL.Ink.primary)
                        Text(remindersDenied
                             ? "Notifications are off for Setline. Turn them on in Settings › Setline › Notifications."
                             : "Breakfast at 10:30, lunch at 14:30, dinner at 20:30 — only when nothing is logged yet.")
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    HStack(spacing: SL.Space.s2) {
                        Button {
                            Task {
                                if await NutritionReminders.requestPermission() {
                                    mealReminders = true
                                    remindersOffered = true
                                    await NutritionReminders.update(app: app)
                                } else {
                                    remindersDenied = true
                                }
                            }
                        } label: {
                            Text(remindersDenied ? "Try again" : "Turn on")
                                .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                                .foregroundStyle(SL.Signal.onAction)
                                .padding(.horizontal, SL.Space.s4)
                                .frame(minHeight: 36)
                                .background(Capsule().fill(SL.Signal.action))
                        }
                        .buttonStyle(SLPressStyle(scale: 0.94))
                        Button("Not now") { remindersOffered = true }
                            .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                            .foregroundStyle(SL.Ink.secondary)
                            .frame(minHeight: 36)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(SL.Space.s3)
            .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised))
        }
    }

    /// Weight, goal and whether the eating fits it: where people look for it.
    /// Read again whenever the plan sheet closes.
    @State private var planRevision = 0
    private var planCard: some View {
        let _ = planRevision
        return NutritionPlanCard(
            plan: NutritionPlan.make(app: app, goal: GoalPreference.goal, profile: BodyProfilePreference.profile),
            onOpen: { sheet = .plan }
        )
    }

    var body: some View {
        ScrollView {
            // 24 between sections, 8 from a section's head to its card.
            VStack(alignment: .leading, spacing: SL.Space.s6) {
                // Today, then what it was made of, then ideas for what is
                // still missing — Training's order: now, done, next.
                hero
                mealNudge
                planCard
                foodLog
                ideasSection
                RecipesSection(display: app.display, initial: likely) { sheet = .recipe($0) }
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Metric.tabContentTop)
            .padding(.bottom, SL.Space.s6)
        }
        .slTabHeader { header }
        .scrollDismissesKeyboard(.immediately)
        .safeAreaInset(edge: .bottom) {
            // The undo sits above the tab bar, where a deleted row can be put
            // back without anything being covered.
            if let toast {
                SLUndoToast(message: toast.message, onUndo: toast.undo, onDismiss: { self.toast = nil })
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.bottom, SL.Space.s2)
                    .transition(.opacity)
            }
        }
        .animation(
            .easeOut(duration: SL.Motion.duration(SL.Motion.base, reduceMotion: reduceMotion)),
            value: toast?.id
        )
        .task(id: toast?.id) {
            // The undo leaves after the design system's window — except while
            // VoiceOver runs, where a five-second target is a timing trap
            // (WCAG 2.2.1) and it waits to be dismissed.
            guard let id = toast?.id, !UIAccessibility.isVoiceOverRunning else { return }
            try? await Task.sleep(for: .seconds(SL.Metric.undoWindow))
            if toast?.id == id { toast = nil }
        }
        .sheet(item: $sheet, onDismiss: { planRevision += 1 }) { which in
            switch which {
            case .add(let meal):
                AddFoodSheet(date: now, meal: meal, onLog: { entry in
                    sheet = nil
                    add(entry)
                }, onLogAll: { entries in
                    sheet = nil
                    addAll(entries)
                }, onClose: {
                    sheet = nil
                })
            case .edit(let entry):
                FoodEntrySheet(
                    entry: entry,
                    onSave: { changed in
                        sheet = nil
                        save(changed, was: entry)
                    },
                    onDelete: { removed in
                        sheet = nil
                        delete(removed)
                    },
                    onRelog: { again in
                        sheet = nil
                        let moment = Date()
                        now = moment
                        add(FoodMemory.repeated(again, on: moment, meal: Meal.likely(at: moment)))
                    }
                )
            case .recipe(let recipe):
                RecipeSheet(recipe: recipe, display: app.display, onLog: { meal in
                    sheet = nil
                    let moment = Date()
                    now = moment
                    add(recipe.entry(id: "food-\(Int(moment.timeIntervalSince1970 * 1000))", date: moment, meal: meal))
                }, onClose: { sheet = nil })
                .presentationDragIndicator(.visible)
            case .plan:
                NutritionPlanSheet(onClose: {
                    sheet = nil
                    planRevision += 1
                })
                .presentationDragIndicator(.visible)
            case .targets:
                TargetsSheet(targets: app.targets) { changes in
                    sheet = nil
                    Task { await app.record(changes) }
                } onClose: {
                    sheet = nil
                }
            }
        }
        .slRespondsToTextSize()
        .onAppear {
            now = Date()
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-SetlineAddFood") { sheet = .add(likely) }
            #endif
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { now = Date() }
        }
    }

    // MARK: - What is left

    /// Over the target there is nothing left to eat: the card says by how much
    /// it was passed, in amber. Without a target there is nothing to count
    /// down from, so the loud number is what the day has come to.
    private var over: Double {
        guard day.hasTarget, let target = day.targets?.calories else { return 0 }
        return max(0, day.calories - Double(target))
    }

    // MARK: - The head

    /// Training's head, so the tabs read as one app: the avatar to Account,
    /// the tab's name and the date, and one round button — here the targets.
    private var header: some View {
        SLTabHeader(title: "Nutrition", subtitle: SLDateText.long(now), onAccount: onAccount) {
            SLHeaderButton(glyph: .target, label: "Daily targets") { sheet = .targets }
        }
    }

    // MARK: - The day

    private var proteinTarget: Double { day.target(for: .protein) }
    private var proteinEaten: Double { day.total(of: .protein) }
    private var proteinMet: Bool { proteinTarget > 0 && proteinEaten >= proteinTarget }

    /// Training's card, read for food: the number first, the day's four
    /// meals as its marks, the macros as its stat row, and the one action.
    /// Protein is the goal the day is won by — the ring beside the number
    /// fills toward it, and meeting it lights the card.
    private var hero: some View {
        let isOver = over > 0
        let value = !day.hasTarget ? day.calories : isOver ? over : day.remaining
        let unit = !day.hasTarget ? "kcal today" : isOver ? "kcal over" : "kcal left"
        let proteinLeft = max(0, proteinTarget - proteinEaten)
        let nudge: String = {
            if !day.hasTarget { return "Set a target to count down" }
            if proteinMet { return "Protein goal hit" }
            if proteinTarget > 0 { return "\(app.display.whole(Decimal(proteinLeft))) g protein to go" }
            return "of \(app.display.whole(Decimal(day.targets?.calories ?? 0))) kcal"
        }()
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .bottom, spacing: SL.Space.s3) {
                Button { sheet = .targets } label: {
                    HStack(alignment: .bottom, spacing: SL.Space.s3) {
                        Text(app.display.whole(Decimal(value)))
                            .font(.slCapped(64, SL.Weight.bold, maxScale: 1.2, relativeTo: .largeTitle))
                            .tracking(-2)
                            .monospacedDigit()
                            .foregroundStyle(isOver ? SL.Signal.attention : SL.Ink.primary)
                            .contentTransition(.numericText(value: value))
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .padding(.vertical, -8)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(unit)
                                .slLead(SL.Weight.semibold)
                                .foregroundStyle(SL.Ink.primary)
                            HStack(spacing: 4) {
                                if proteinMet { SLGlyph(name: .check, size: 12) }
                                Text(nudge).slMeta(SL.Weight.semibold).slNumerals()
                            }
                            .foregroundStyle(proteinMet ? SL.Signal.action : SL.Ink.secondary)
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 2)
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .animation(reduceMotion ? nil : .snappy, value: value)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(app.display.kcal(Decimal(value))) \(unit.replacingOccurrences(of: "kcal ", with: "")). \(nudge).")
                .accessibilityHint("Opens your daily targets")

                if proteinTarget > 0 { proteinRing }
            }

            mealMarks.padding(.top, SL.Space.s5)

            Rectangle()
                .fill(proteinMet ? SL.Signal.action.opacity(0.18) : SL.Surface.hairline)
                .frame(height: SL.Metric.border)
                .padding(.horizontal, -SL.Space.s5)
                .padding(.vertical, SL.Space.s5)

            macroRow

            Button {
                // The clock is read again as the sheet opens: a screen left
                // open since breakfast must not log lunch as breakfast, or on
                // yesterday's date.
                let moment = Date()
                now = moment
                sheet = .add(Meal.likely(at: moment))
            } label: {
                HStack(spacing: 10) {
                    SLGlyph(name: .plus, size: 16)
                    // "Log lunch" until lunch has something in it; then
                    // what the tap does is add to it.
                    Text(day.sections.first { $0.meal == likely }?.isEmpty == false
                         ? "Add to \(likely.spoken)" : "Log \(likely.spoken)")
                }
            }
            .buttonStyle(SLPrimaryButtonStyle())
            .padding(.top, SL.Space.s5)
            .accessibilityHint("Opens on \(likely.spoken)")
        }
        .padding(SL.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            ZStack {
                SL.Surface.raised
                RadialGradient(colors: [SL.Signal.action.opacity(proteinMet ? 0.24 : 0.1), .clear],
                               center: .topTrailing, startRadius: 0, endRadius: proteinMet ? 380 : 280)
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(proteinMet ? SL.Signal.action.opacity(0.45) : SL.Surface.hairlineStrong.opacity(0.6), lineWidth: SL.Metric.border)
        )
        .shadow(color: proteinMet ? SL.Signal.action.opacity(0.14) : .clear, radius: 24)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.4), value: proteinMet)
        .sensoryFeedback(.success, trigger: proteinPops)
        .onChange(of: proteinMet, initial: true) { _, met in
            let key = Schedule.dateKey(now)
            guard met, proteinCelebrated != key else { return }
            proteinCelebrated = key
            proteinPops += 1
            SLSound.chime.play()
        }
        .onAppear {
            guard !reduceMotion, !breathes else { return }
            withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false).delay(0.8)) { breathes = true }
        }
    }

    /// Protein against its target, as a ring where Training keeps Tally: the
    /// one number the day is won by. Full, it turns into a check.
    private var proteinRing: some View {
        let fraction = min(1, proteinEaten / max(proteinTarget, 1))
        return ZStack {
            Circle().stroke(SL.Signal.action.opacity(0.14), lineWidth: 6)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(SL.Signal.action, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(reduceMotion ? nil : .spring(response: 0.8, dampingFraction: 0.8).delay(0.2), value: fraction)
            if proteinMet {
                SLGlyph(name: .check, size: 20, fixed: true)
                    .foregroundStyle(SL.Signal.action)
                    .transition(.scale(scale: 0.3).combined(with: .opacity))
            } else {
                VStack(spacing: 0) {
                    Text("\(Int((fraction * 100).rounded()))%")
                        .font(.slFixed(14, SL.Weight.bold))
                        .monospacedDigit()
                        .foregroundStyle(SL.Ink.primary)
                    Text("protein")
                        .font(.slFixed(9, SL.Weight.medium))
                        .foregroundStyle(SL.Ink.secondary)
                }
            }
        }
        .frame(width: 60, height: 60)
        .keyframeAnimator(initialValue: 1.0, trigger: proteinPops) { ring, scale in
            ring.scaleEffect(scale)
        } keyframes: { _ in
            SpringKeyframe(1.18, duration: 0.18)
            SpringKeyframe(1.0, duration: 0.4, spring: .bouncy)
        }
        .accessibilityElement()
        .accessibilityLabel(proteinMet ? "Protein goal hit" : "\(Int((fraction * 100).rounded())) percent of your protein")
    }

    /// The day's four meals as Training's week marks: logged ones filled, the
    /// one the clock suggests ringed and breathing, the rest waiting. A tap
    /// logs into that meal.
    private var mealMarks: some View {
        let current = day.sections.first { $0.meal == likely }?.meal
            ?? (likely == .preWorkout ? .snack : likely)
        return HStack(spacing: 0) {
            ForEach(day.sections) { section in
                let logged = !section.isEmpty
                let isNow = section.meal == current && !logged
                Button {
                    now = Date()
                    sheet = .add(section.meal)
                } label: {
                    VStack(spacing: 6) {
                        Text(section.meal == .snack ? "Snacks" : section.meal.label)
                            .font(.sl(SL.TypeSize.micro, isNow ? SL.Weight.bold : SL.Weight.regular))
                            .foregroundStyle(isNow ? SL.Ink.primary : SL.Ink.secondary)
                            .lineLimit(1)
                        mealMark(logged: logged, isNow: isNow)
                        Text(logged ? app.display.whole(Decimal(section.calories)) : " ")
                            .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
                            .monospacedDigit()
                            .foregroundStyle(SL.Ink.secondary)
                    }
                    .frame(maxWidth: .infinity, minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(SLPressStyle(scale: 0.85, bounces: true))
                .accessibilityLabel("\(section.meal == .snack ? "Snacks" : section.meal.label), \(logged ? app.display.kcal(Decimal(section.calories)) : "nothing yet")")
                .accessibilityHint("Logs food for this meal")
            }
        }
        .padding(.horizontal, -SL.Space.s1)
    }

    @ViewBuilder
    private func mealMark(logged: Bool, isNow: Bool) -> some View {
        let size: CGFloat = 28
        if logged {
            Circle().fill(SL.Signal.action)
                .overlay(SLGlyph(name: .check, size: 13).foregroundStyle(SL.Signal.onAction))
                .frame(width: size, height: size)
                .transition(.scale(scale: 0.4).combined(with: .opacity))
        } else if isNow {
            Circle().strokeBorder(SL.Signal.action, lineWidth: 2)
                .background(Circle().fill(SL.Signal.action.opacity(0.12)).padding(-4))
                .overlay(SLGlyph(name: .plus, size: 12).foregroundStyle(SL.Signal.action))
                .background(
                    Circle()
                        .strokeBorder(SL.Signal.action.opacity(breathes ? 0 : 0.5), lineWidth: 1.5)
                        .scaleEffect(breathes ? 1.7 : 1)
                )
                .frame(width: size, height: size)
        } else {
            Circle().strokeBorder(SL.Surface.mute, lineWidth: 1.5)
                .frame(width: size, height: size)
        }
    }

    /// The macros as Training's stat row: a number over a word, a thin bar
    /// under each against its target, hairlines between.
    private var macroRow: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(Macro.allCases.enumerated()), id: \.element) { index, macro in
                let total = day.total(of: macro)
                let target = day.target(for: macro)
                let isOver = target > 0 && total > target
                HStack(spacing: 0) {
                    if index > 0 {
                        Rectangle().fill(SL.Surface.hairline).frame(width: SL.Metric.border, height: 46)
                            .padding(.trailing, SL.Space.s4)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .firstTextBaseline, spacing: 1) {
                            Text(app.display.whole(Decimal(total)))
                                .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                                .foregroundStyle(isOver ? SL.Signal.attention : SL.Ink.primary)
                                .contentTransition(.numericText(value: total))
                            Text(target > 0 ? "/\(app.display.whole(Decimal(target))) g" : " g")
                                .slMeta()
                                .foregroundStyle(SL.Ink.secondary)
                        }
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        Text(macro.label.lowercased())
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                        if target > 0 {
                            SLBar(fraction: day.fraction(of: macro), height: 4,
                                  fill: isOver ? SL.Signal.attention : SL.Signal.action.opacity([1, 0.6, 0.4][min(index, 2)]))
                                .padding(.trailing, SL.Space.s3)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(target > 0
                    ? "\(macro.label), \(app.display.whole(Decimal(total))) of \(app.display.whole(Decimal(target))) grams"
                    : "\(macro.label), \(app.display.whole(Decimal(total))) grams")
            }
        }
        .animation(reduceMotion ? nil : .snappy, value: day.calories)
    }

    // MARK: - Quick adds

    /// Everyday foods with their photo, one tap to log at the meal the clock
    /// suggests. Protein-dense ones lead while protein is what is missing,
    /// and the head says how much is.
    private var ideasSection: some View {
        let proteinLeft = max(0, proteinTarget - proteinEaten)
        let ideas = FoodIdeas.ordered(proteinLeft: proteinLeft)
        let favorites = app.foodFavorites
        return VStack(alignment: .leading, spacing: SL.Space.s2) {
            // The card already says what protein is missing; the head says
            // what these are for.
            SLSectionHead(title: "Quick adds", meta: !favorites.isEmpty ? "favorites first" : proteinLeft > 0 ? "high protein first" : nil)
            // Two short rows rather than one row of tall cards: a quick add
            // is one tap, and should look like one — not like a recipe.
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHGrid(rows: [GridItem(.fixed(56), spacing: SL.Space.s2), GridItem(.fixed(56))], spacing: SL.Space.s2) {
                    ForEach(favorites) { favorite in
                        quickPill(
                            id: "fav-\(favorite.id)", name: favorite.name,
                            detail: "\(app.display.whole(Decimal(favorite.protein))) g protein · \(app.display.whole(Decimal(favorite.calories)))",
                            art: AnyView(Image(systemName: "star.fill")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(SL.Signal.action)
                                .frame(width: 36, height: 36)
                                .background(Circle().fill(SL.Signal.actionTint)))
                        ) { moment in
                            favorite.entry(id: "food-\(Int(moment.timeIntervalSince1970 * 1000))", on: moment, meal: Meal.likely(at: moment))
                        }
                    }
                    ForEach(ideas) { idea in
                        quickPill(
                            id: idea.id, name: idea.name,
                            detail: "\(app.display.whole(Decimal(idea.protein))) g protein · \(app.display.whole(Decimal(idea.calories)))",
                            art: AnyView(SLFoodPhoto(source: .asset(idea.imageName), cornerRadius: 18)
                                .saturation(0.7)
                                .frame(width: 36, height: 36)
                                .clipShape(Circle())
                                .overlay(Circle().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)))
                        ) { moment in
                            idea.entry(id: "food-\(Int(moment.timeIntervalSince1970 * 1000))", date: moment, meal: Meal.likely(at: moment))
                        }
                    }
                }
                .padding(.horizontal, SL.Space.gutterSession)
            }
            .padding(.horizontal, -SL.Space.gutterSession)
        }
    }

    /// A quick add in one line: a small photo, the name and what it brings,
    /// and the add — which turns into a check for a moment once tapped.
    private func quickPill(id: String, name: String, detail: String, art: AnyView, entry: @escaping (Date) -> NutritionEntry) -> some View {
        let justAdded = addedIdea == id
        return Button {
            let moment = Date()
            now = moment
            add(entry(moment))
            addedIdea = id
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(1.4))
                if addedIdea == id { withAnimation(.easeOut(duration: 0.2)) { addedIdea = nil } }
            }
        } label: {
            HStack(spacing: SL.Space.s3) {
                art
                VStack(alignment: .leading, spacing: 1) {
                    Text(name)
                        .slBody(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                        .lineLimit(1)
                    Text(detail)
                        .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                        .monospacedDigit()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: SL.Space.s1)
                SLGlyph(name: justAdded ? .check : .plus, size: 12, fixed: true)
                    .foregroundStyle(justAdded ? SL.Signal.onAction : SL.Signal.action)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(justAdded ? SL.Signal.action : SL.Surface.raised2))
                    .contentTransition(.symbolEffect(.replace))
            }
            .padding(.leading, 10)
            .padding(.trailing, SL.Space.s2)
            .frame(width: 250, height: 56)
            .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised))
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                    .strokeBorder(justAdded ? SL.Signal.action.opacity(0.5) : SL.Surface.hairline, lineWidth: SL.Metric.border)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle())
        .sensoryFeedback(.success, trigger: justAdded) { _, now in now }
        .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.7), value: justAdded)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(name), \(detail)")
        .accessibilityHint("Adds it to \(likely.spoken)")
    }

    // MARK: - What was eaten

    // MARK: - The food log

    private var history: NutritionHistory { app.nutritionHistory(before: now) }

    /// The day on screen in the log: today, or a day picked from the strip.
    private var shownDay: (day: NutritionDay, past: NutritionHistory.Day?) {
        guard let diaryDay, let past = history.days.first(where: { $0.id == diaryDay }) else { return (day, nil) }
        return (past.summary, past)
    }

    /// One card for what was eaten, today and before: a strip of days to pick
    /// from, the picked day's meals folded to one line each, and how the two
    /// weeks went in one line at the foot.
    private var foodLog: some View {
        let shown = shownDay
        let count = shown.day.entries.count
        return VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLSectionHead(
                title: shown.past == nil ? "Eaten today" : shown.past!.date.formatted(.dateTime.weekday(.wide).day().month(.abbreviated)),
                meta: "\(count) \(count == 1 ? "item" : "items")"
            )
            VStack(spacing: 0) {
                dayStrip
                    .padding(.vertical, SL.Space.s3)
                if let past = shown.past {
                    SLHairline()
                    pastSummary(past)
                }
                ForEach(shown.day.sections) { section in
                    SLHairline()
                    mealGroup(section, today: shown.past == nil)
                }
                if !history.logged.isEmpty {
                    SLHairline()
                    stretchLine
                }
            }
            .slBorderBox()
            .slListCard()
        }
        .onChange(of: diaryDay) { _, _ in openMeals = [] }
    }

    /// Two weeks and today, today on the right: the weekday, the date, and a
    /// dot for how the day went — mint on target, amber off, none unlogged.
    private var dayStrip: some View {
        let past = Array(history.days.reversed())
        return ScrollViewReader { reader in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SL.Space.s1) {
                    ForEach(past) { day in
                        dayChip(date: day.date, key: day.id,
                                dot: !day.isLogged ? nil : day.onTarget || !day.summary.hasTarget ? SL.Signal.recovery : SL.Signal.attention,
                                enabled: day.isLogged)
                    }
                    dayChip(date: now, key: nil, dot: day.entries.isEmpty ? nil : SL.Signal.action, enabled: true)
                        .id("today")
                }
                .padding(.leading, SL.Space.s3)
                .padding(.trailing, SL.Space.s4)
            }
            .onAppear {
                reader.scrollTo("today", anchor: .trailing)
                #if DEBUG
                // `-SetlineFoodDay 2` opens the log on the day before yesterday.
                let arguments = ProcessInfo.processInfo.arguments
                if let flag = arguments.firstIndex(of: "-SetlineFoodDay"), arguments.indices.contains(flag + 1),
                   let back = Int(arguments[flag + 1]), history.days.indices.contains(back - 1) {
                    diaryDay = history.days[back - 1].id
                }
                #endif
            }
        }
    }

    private func dayChip(date: Date, key: String?, dot: Color?, enabled: Bool) -> some View {
        let isSelected = diaryDay == key
        return Button {
            withAnimation(.easeOut(duration: SL.Motion.base)) { diaryDay = key }
        } label: {
            VStack(spacing: 3) {
                Text(key == nil ? "Today" : date.formatted(.dateTime.weekday(.abbreviated)))
                    .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
                    .foregroundStyle(isSelected ? SL.Ink.primary : SL.Ink.secondary)
                    .lineLimit(1)
                Text(date.formatted(.dateTime.day()))
                    .font(.sl(SL.TypeSize.lead, SL.Weight.semibold))
                    .slNumerals()
                    .foregroundStyle(enabled ? SL.Ink.primary : SL.Ink.tertiary)
                Circle()
                    .fill(dot ?? .clear)
                    .frame(width: 5, height: 5)
            }
            .frame(width: key == nil ? 52 : 44, height: 62)
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                    .fill(isSelected ? SL.Surface.raised2 : .clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                    .strokeBorder(isSelected ? SL.Surface.hairlineStrong : .clear, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.94))
        .disabled(!enabled)
        .accessibilityLabel(key == nil ? "Today" : date.formatted(.dateTime.weekday(.wide).day().month(.wide)))
        .accessibilityValue(enabled ? "" : "Nothing logged")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    /// A past day in one line: its calories, the three macros against their
    /// targets, and what it missed.
    private func pastSummary(_ past: NutritionHistory.Day) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s2) {
                Text(app.display.kcal(Decimal(past.summary.calories)))
                    .slLead()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                if let target = past.summary.targets?.calories, target > 0 {
                    Text("of \(app.display.whole(Decimal(target)))")
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
                Spacer(minLength: SL.Space.s2)
                if past.onTarget {
                    flagChip("On target", ink: SL.Signal.recovery)
                }
            }
            HStack(spacing: SL.Space.s4) {
                macroFigure("P", past.summary.protein, past.summary.target(for: .protein), low: past.flags.contains(.lowProtein))
                macroFigure("C", past.summary.carbs, past.summary.target(for: .carbs), low: past.flags.contains(.lowCarbs))
                macroFigure("F", past.summary.fat, past.summary.target(for: .fat), low: false)
                Spacer(minLength: 0)
            }
            if !past.flags.isEmpty {
                HStack(spacing: SL.Space.s1) {
                    ForEach(past.flags, id: \.self) { flagChip($0.label, ink: SL.Signal.attention) }
                }
            }
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func macroFigure(_ letter: String, _ eaten: Double, _ target: Double, low: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(letter)
                .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                .foregroundStyle(SL.Ink.secondary)
            Text(app.display.whole(Decimal(eaten)))
                .slBody(SL.Weight.semibold)
                .foregroundStyle(low ? SL.Signal.attention : SL.Ink.primary)
            if target > 0 {
                Text("/\(app.display.whole(Decimal(target)))")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
            }
        }
        .slNumerals()
        .lineLimit(1)
    }

    private func flagChip(_ text: String, ink: Color) -> some View {
        Text(text)
            .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
            .foregroundStyle(ink)
            .padding(.horizontal, SL.Space.s2)
            .padding(.vertical, 4)
            .background(Capsule().fill(ink.opacity(0.14)))
            .fixedSize()
    }

    /// A meal in one line — its name, how many items, its calories — opening
    /// to the items. An empty meal today offers to add to it instead.
    @ViewBuilder
    private func mealGroup(_ section: MealSection, today: Bool) -> some View {
        let isOpen = openMeals.contains(section.id)
        if section.isEmpty {
            Button {
                if today { sheet = .add(section.meal) }
            } label: {
                HStack(spacing: SL.Space.s3) {
                    Text(section.title)
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                    Spacer(minLength: SL.Space.s2)
                    if today {
                        HStack(spacing: 4) {
                            SLGlyph(name: .plus, size: 12, fixed: true)
                            Text("Add").slMeta(SL.Weight.semibold)
                        }
                        .foregroundStyle(SL.Ink.secondary)
                    } else {
                        Text("—").slBody().foregroundStyle(SL.Ink.tertiary)
                    }
                }
                .padding(.horizontal, SL.Space.s4)
                .frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!today)
            .accessibilityLabel(today ? "\(section.title), nothing yet. Add" : "\(section.title), nothing logged")
        } else {
            VStack(spacing: 0) {
                Button {
                    withAnimation(.easeOut(duration: SL.Motion.base)) {
                        if isOpen { openMeals.remove(section.id) } else { openMeals.insert(section.id) }
                    }
                } label: {
                    HStack(spacing: SL.Space.s3) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(section.title)
                                .slBody(SL.Weight.semibold)
                                .foregroundStyle(SL.Ink.primary)
                            Text(section.entries.map(\.name).joined(separator: ", "))
                                .slMeta()
                                .foregroundStyle(SL.Ink.secondary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: SL.Space.s2)
                        (Text(app.display.whole(Decimal(section.calories)))
                            .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                            .foregroundColor(SL.Ink.primary)
                            + Text(" kcal").font(.sl(SL.TypeSize.meta, SL.Weight.regular)).foregroundColor(SL.Ink.secondary))
                            .slNumerals()
                            .fixedSize()
                        SLGlyph(name: .chevronDown, size: 12)
                            .foregroundStyle(SL.Ink.tertiary)
                            .rotationEffect(.degrees(isOpen ? 180 : 0))
                    }
                    .padding(.horizontal, SL.Space.s4)
                    .padding(.vertical, SL.Space.s3)
                    .frame(minHeight: 60)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(section.title), \(section.entries.count) \(section.entries.count == 1 ? "item" : "items"), \(app.display.kcal(Decimal(section.calories)))")
                .accessibilityHint(isOpen ? "Folds the items away" : "Shows the items")
                .accessibilityAddTraits(.isButton)

                if isOpen {
                    ForEach(section.entries) { entry in
                        row(entry, in: section)
                            .overlay(alignment: .top) { SLHairline().padding(.leading, SL.Space.s4) }
                    }
                }
            }
        }
    }

    /// "14 days · avg 2,350 kcal · on target 4 of 6 · protein 3 of 6"
    private var stretchLine: some View {
        let logged = history.logged.count
        var parts = ["Last 14 days"]
        if let average = history.averageCalories { parts.append("avg \(app.display.whole(Decimal(average))) kcal") }
        if history.calorieTarget != nil {
            parts.append("on target \(history.daysOnCalories)/\(logged)")
            parts.append("protein \(history.daysProteinHit)/\(logged)")
        }
        return HStack(spacing: SL.Space.s2) {
            Image(systemName: "chart.bar.fill")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(SL.Ink.secondary)
            Text(parts.joined(separator: " · "))
                .slMeta()
                .slNumerals()
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, SL.Space.s4)
        .padding(.vertical, SL.Space.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    /// One logged item: when, what it was and which meal, and what it cost.
    /// Tapping it opens the item; a swipe offers to take it off the day.
    private func row(_ entry: NutritionEntry, in section: MealSection) -> some View {
        let isSwiped = swiped == entry.id

        return ZStack(alignment: .trailing) {
            Button { delete(entry) } label: {
                Text("Delete")
                    .slBody(SL.Weight.semibold)
                    .foregroundStyle(SL.Signal.loss)
                    .padding(.horizontal, SL.Space.s4)
                    .frame(maxHeight: .infinity)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .opacity(isSwiped ? 1 : 0)
            .accessibilityHidden(!isSwiped)

            // A plain row rather than a Button: a Button takes the whole
            // gesture, and a sideways drag across it would open the item
            // instead of offering to remove it.
            SLAdaptiveRow {
                Text(entry.loggedAt.map(Self.clock) ?? "")
                    .slBody(SL.Weight.semibold)
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .frame(width: typeSize.isAccessibilitySize ? nil : timeWidth, alignment: .leading)
            } main: {
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.name)
                        .slLead()
                        .slLineHeight(1.3, size: SL.TypeSize.lead)
                        .foregroundStyle(SL.Ink.primary)
                    Text(detail(entry, in: section).slUnbroken)
                        .slBody()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
                .lineLimit(typeSize.isAccessibilitySize ? 4 : 2)
                .fixedSize(horizontal: false, vertical: true)
            } trailing: {
                (Text(app.display.whole(Decimal(entry.calories))).font(.sl(SL.TypeSize.lead, SL.Weight.semibold)).foregroundStyle(SL.Ink.primary)
                    + Text(" kcal").font(.sl(SL.TypeSize.meta, SL.Weight.regular)).foregroundStyle(SL.Ink.secondary))
                    .slNumerals()
                    .lineLimit(1)
                    .fixedSize()
            }
            .padding(.horizontal, SL.Space.s4)
            .padding(.vertical, SL.Space.s3)
            .frame(minHeight: 72)
            .background(SL.Surface.raised)
            .contentShape(Rectangle())
            .offset(x: isSwiped ? -Self.swipeReveal : 0)
            .onTapGesture { sheet = isSwiped ? nil : .edit(entry) }
        }
        .animation(
            .easeOut(duration: SL.Motion.duration(SL.Motion.fast, reduceMotion: reduceMotion)),
            value: isSwiped
        )
        // Beside the scroll view's own drag: only a sideways one is read, so
        // the day still scrolls under the finger.
        .simultaneousGesture(
            DragGesture(minimumDistance: 16)
                .onEnded { value in
                    guard abs(value.translation.width) > abs(value.translation.height) else { return }
                    swiped = value.translation.width < -24 ? entry.id : nil
                }
        )
        // A tap anywhere else puts a revealed row back.
        .onChange(of: sheet?.id) { _, _ in swiped = nil }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken(entry, in: section))
        .accessibilityHint("Double-tap to change the amount, meal or delete")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { sheet = .edit(entry) }
        // A swipe is not reachable with VoiceOver, so the same delete is an
        // action on the row.
        .accessibilityAction(named: "Delete") { delete(entry) }
        // Holding a row keeps it as a favorite, or logs it again today.
        .contextMenu {
            Button {
                app.toggleFavorite(entry)
            } label: {
                Label(app.isFavorite(entry) ? "Remove from favorites" : "Add to favorites",
                      systemImage: app.isFavorite(entry) ? "star.slash" : "star")
            }
            if entry.date != Schedule.dateKey(Date()) {
                Button {
                    let moment = Date()
                    now = moment
                    add(FoodMemory.repeated(entry, on: moment, meal: Meal.likely(at: moment)))
                } label: {
                    Label("Log again today", systemImage: "arrow.uturn.forward")
                }
            }
        }
        .accessibilityAction(named: app.isFavorite(entry) ? "Remove from favorites" : "Add to favorites") { app.toggleFavorite(entry) }
    }

    private static let swipeReveal: CGFloat = 112

    /// 48 in the design; it has to grow with the text or "12:45" is cut.
    @ScaledMetric(relativeTo: .body) private var timeWidth: CGFloat = 48

    /// "12:45" — the hour it was logged, as the clock had it.
    private static func clock(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    /// "100 g · 46 g protein"
    private func detail(_ entry: NutritionEntry, in section: MealSection) -> String {
        [
            entry.portion,
            "\(app.display.whole(Decimal(entry.protein))) g protein",
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }

    private func spoken(_ entry: NutritionEntry, in section: MealSection) -> String {
        [
            entry.loggedAt.map { "logged at \(Self.clock($0))" },
            section.title,
            entry.name,
            entry.portion,
            app.display.kcal(Decimal(entry.calories)),
            "\(app.display.whole(Decimal(entry.protein))) grams of protein",
        ]
        .compactMap { $0 }
        .joined(separator: ", ")
    }

    // MARK: - Writing one entry

    /// Each of these touches one entry and nothing else in the account: the
    /// queue carries `upsertNutritionEntry` or `removeNutritionEntry` for that
    /// id, merged field by field at the far end.
    private func add(_ entry: NutritionEntry) {
        Task { await app.log(food: entry) }
        SLSound.pop.play()
        show("\(entry.name) added to \(mealName(entry).lowercased())") {
            Task { await app.removeFood(id: entry.id) }
        }
    }

    /// A meal scan's items, in one go, with one undo for all of them.
    private func addAll(_ entries: [NutritionEntry]) {
        guard !entries.isEmpty else { return }
        Task { for entry in entries { await app.log(food: entry) } }
        SLSound.pop.play()
        show(entries.count == 1 ? "\(entries[0].name) added" : "\(entries.count) items added") {
            Task { for entry in entries { await app.removeFood(id: entry.id) } }
        }
    }

    private func save(_ changed: NutritionEntry, was previous: NutritionEntry) {
        guard changed != previous else { return }
        Task { await app.log(food: changed) }
        show("\(changed.name) updated") {
            Task { await app.log(food: previous) }
        }
    }

    private func delete(_ entry: NutritionEntry) {
        swiped = nil
        Task { await app.removeFood(id: entry.id) }
        show("\(entry.name) deleted") {
            Task { await app.log(food: entry) }
        }
    }

    private func mealName(_ entry: NutritionEntry) -> String {
        Meal(rawValue: entry.meal)?.label ?? "Snacks"
    }

    private func show(_ message: String, undo: (() -> Void)?) {
        toast = Toast(message: message, undo: undo.map { action in
            { action(); toast = nil }
        })
        AccessibilityNotification.Announcement(message).post()
    }
}
