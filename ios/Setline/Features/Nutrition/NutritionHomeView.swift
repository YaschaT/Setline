import SwiftUI
import UIKit
import SetlineCore

/// Artboards 42a–42b · Voeding.
///
/// The day reads as four quiet headings — ontbijt, lunch, avondeten, snacks —
/// each with its own kcal and its own ⊕. No cards: one hairline between
/// meals, the items under them without lines of their own. An empty meal keeps
/// its heading, so a day nothing has been logged on already has a shape.
///
/// What is left to eat stays at the top and is the only loud number. A meal
/// shows its kcal in its heading and no macros at all: the macros are the
/// day's, once, where the totals are.
struct NutritionHomeView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    /// The clock this screen is reading. Held rather than asked for on every
    /// line, so the date, the meal the button names and what a tap logs are one
    /// moment; read again whenever the screen is come back to, so a phone left
    /// open over lunch does not still say ontbijt.
    @State private var now = Date()

    /// One sheet at a time, and one modifier for it: two `.sheet`s on the same
    /// view make iOS treat the first as a card with another on top of it, and
    /// draw it scaled back.
    @State private var sheet: Sheet?
    @State private var toast: Toast?

    enum Sheet: Identifiable {
        case add(Meal)
        case edit(NutritionEntry)

        var id: String {
            switch self {
            case .add(let meal): return "add-\(meal.rawValue)"
            case .edit(let entry): return "edit-\(entry.id)"
            }
        }
    }
    /// The row whose delete is showing, by entry id. One at a time.
    @State private var swiped: String?

    struct Toast: Identifiable {
        let id = UUID()
        let message: String
        let undo: (() -> Void)?
    }

    private var day: NutritionDay { app.nutrition(on: now) }

    /// What the hour suggests. The big button adds there and the sheet opens
    /// there, one tap from anything else.
    private var likely: Meal { Meal.likely(at: now) }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    totals
                    meals.padding(.top, SL.Space.s3)
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, 18)
                .padding(.bottom, SL.Space.s6)
            }
            .scrollDismissesKeyboard(.immediately)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .safeAreaInset(edge: .bottom) { foot }
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
        .sheet(item: $sheet) { which in
            switch which {
            case .add(let meal):
                AddFoodSheet(date: now, meal: meal) { entry in
                    sheet = nil
                    add(entry)
                } onClose: {
                    sheet = nil
                }
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
                    }
                )
            }
        }
        .slRespondsToTextSize()
        .onAppear { now = Date() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { now = Date() }
        }
    }

    // MARK: - Chrome

    /// 42a: the tab's name, and the date it is showing.
    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
            Text("Voeding")
                .slTitle()
                .foregroundStyle(SL.Ink.primary)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: SL.Space.s2)
            Text(dateLabel)
                .slMeta()
                .slNumerals()
                .foregroundStyle(SL.Ink.tertiary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s4)
    }

    private var dateLabel: String {
        "\(WeekPlan.fullWeekday(now).capitalized) \(app.display.shortDate(now))"
    }

    /// The undo sits above the one action, in the same inset, so a deleted row
    /// can be put back without anything covering the button.
    private var foot: some View {
        VStack(spacing: SL.Space.s3) {
            if let toast {
                SLUndoToast(message: toast.message, onUndo: toast.undo, onDismiss: { self.toast = nil })
                    .transition(.opacity)
            }
            Button { sheet = .add(likely) } label: { Text("Toevoegen aan \(likely.spoken)") }
                .buttonStyle(SLPrimaryButtonStyle())
        }
        .padding(.horizontal, SL.Space.gutterSession)
        // 42a ends the pill 16 above the tab bar.
        .padding(.bottom, SL.Space.s4)
        .padding(.top, SL.Space.s3)
        .frame(maxWidth: .infinity)
        .background(SL.Surface.ground)
    }

    // MARK: - What is left

    private var totals: some View {
        VStack(alignment: .leading, spacing: 0) {
            eyebrow("NOG TE ETEN")

            Text(heroTitle)
                .font(.slCapped(SL.TypeSize.displayXL, SL.Weight.semibold, maxScale: 1.5))
                .slLineHeight(1.05, size: SL.TypeSize.displayXL, maxScale: 1.5)
                .slNumerals()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(SL.Ink.primary)
                // SwiftUI draws the glyphs of a line tightened below the font's
                // own height lower in the box than a browser does. Lifting the
                // drawing, not the box, puts the number where 42a sets it.
                .offset(y: -0.117 * Self.heroScaledSize)
                .padding(.top, 6)

            Text(subline)
                .slBody()
                .slNumerals()
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, 2)

            macros.padding(.top, SL.Space.s3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }

    private static var heroScaledSize: CGFloat {
        min(
            UIFontMetrics(forTextStyle: .body).scaledValue(for: SL.TypeSize.displayXL),
            SL.TypeSize.displayXL * 1.5
        )
    }

    /// Without a target there is nothing left over to count down, so the loud
    /// number becomes what the day has come to.
    private var heroTitle: String {
        app.display.kcal(Decimal(day.hasTarget ? day.remaining : day.calories))
    }

    /// 42b says plainly that nothing is logged rather than showing a zero.
    private var subline: String {
        guard day.calories > 0 else { return "Nog niets gelogd vandaag" }
        guard day.hasTarget, let target = day.targets?.calories else {
            return "\(app.display.whole(Decimal(day.calories))) kcal gelogd"
        }
        return "\(app.display.whole(Decimal(day.calories))) van \(app.display.kcal(Decimal(target)))"
    }

    /// Three plain columns: the day's macros, once. 42a puts none of them on a
    /// meal.
    private var macros: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s2))
            : AnyLayout(HStackLayout(alignment: .top, spacing: SL.Space.s3))

        return layout {
            ForEach(Macro.allCases, id: \.self) { macro in
                VStack(alignment: .leading, spacing: 2) {
                    Text(macro.label)
                        .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                        .foregroundStyle(SL.Ink.tertiary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(macroValue(macro))
                        .slBody(SL.Weight.semibold)
                        .slNumerals()
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .foregroundStyle(SL.Ink.primary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(macro.label), \(macroValue(macro))")
            }
        }
    }

    /// 42a writes the day's macros in whole grams: a tenth of a gram of fat is
    /// not something a day is steered by, and the column has three of them.
    private func macroValue(_ macro: Macro) -> String {
        let total = app.display.whole(Decimal(day.total(of: macro)))
        let target = day.target(for: macro)
        guard target > 0 else { return "\(total) g" }
        return "\(total) / \(app.display.whole(Decimal(target))) g"
    }

    // MARK: - The four meals

    private var meals: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(day.sections.enumerated()), id: \.element.id) { index, section in
                VStack(alignment: .leading, spacing: 0) {
                    if index > 0 { SLHairline() }
                    heading(section)
                    ForEach(section.entries) { entry in
                        row(entry, in: section)
                    }
                    if !section.isEmpty { Color.clear.frame(height: 6) }
                }
            }
        }
    }

    /// The meal, what it came to, and the one way to add to it.
    private func heading(_ section: MealSection) -> some View {
        HStack(spacing: SL.Space.s3) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(section.title)
                    .slLead()
                    .foregroundStyle(SL.Ink.primary)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
                Text(section.isEmpty ? "—" : app.display.kcal(Decimal(section.calories)))
                    .slMeta()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.tertiary)
                    .lineLimit(1)
            }
            Spacer(minLength: SL.Space.s2)
            Button { sheet = .add(section.meal) } label: {
                Image(systemName: "plus")
                    .font(.sl(SL.TypeSize.title, SL.Weight.medium))
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // 42a hangs the ⊕ 12 past the gutter, so its glyph lines up with
            // the numbers above it rather than its own hit area.
            .padding(.trailing, -12)
            .accessibilityLabel("Toevoegen aan \(section.meal.spoken)")
        }
        .frame(minHeight: SL.Space.hitMin)
    }

    /// One logged item: what it was, how much of it, and what it cost. Tapping
    /// it opens the item (42d); a swipe offers to take it off the day.
    private func row(_ entry: NutritionEntry, in section: MealSection) -> some View {
        let isSwiped = swiped == entry.id

        return ZStack(alignment: .trailing) {
            Button { delete(entry) } label: {
                Text("Verwijder")
                    .slBody(SL.Weight.semibold)
                    .foregroundStyle(SL.Signal.loss)
                    .frame(maxHeight: .infinity)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .opacity(isSwiped ? 1 : 0)
            .accessibilityHidden(!isSwiped)

            // A plain row rather than a Button: a Button takes the whole
            // gesture, and a sideways drag across it would open the item
            // instead of offering to remove it.
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                rowTitle(entry)
                    .foregroundStyle(SL.Ink.primary)
                    .lineLimit(typeSize.isAccessibilitySize ? 3 : 1)
                Spacer(minLength: SL.Space.s2)
                Text(app.display.whole(Decimal(entry.calories)))
                    .slBody()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
            }
            .frame(minHeight: SL.Space.hitMin)
            .background(SL.Surface.ground)
            .contentShape(Rectangle())
            .offset(x: isSwiped ? -Self.swipeReveal : 0)
            .onTapGesture { sheet = isSwiped ? nil : .edit(entry) }
        }
        // 42a's rows are 44 of hit area at a pitch of 40, so two items under a
        // heading read as one block rather than a list.
        .padding(.top, -4)
        .animation(
            .easeOut(duration: SL.Motion.duration(SL.Motion.fast, reduceMotion: reduceMotion)),
            value: isSwiped
        )
        .gesture(
            // Only a sideways drag, so the day still scrolls under the finger.
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
        .accessibilityHint("Dubbeltik om hoeveelheid, maaltijd of verwijderen te openen")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { sheet = .edit(entry) }
        // A swipe is not reachable with VoiceOver, so the same delete is an
        // action on the row.
        .accessibilityAction(named: "Verwijderen") { delete(entry) }
    }

    private static let swipeReveal: CGFloat = 104

    /// "Havermout · 100 g", with the amount quieter than the food.
    private func rowTitle(_ entry: NutritionEntry) -> Text {
        let name = Text(entry.name).font(.sl(SL.TypeSize.body, SL.Weight.regular))
        guard let portion = entry.portion else { return name }
        return name + Text(" · \(portion)")
            .font(.sl(SL.TypeSize.meta, SL.Weight.regular))
            .foregroundColor(SL.Ink.tertiary)
    }

    private func spoken(_ entry: NutritionEntry, in section: MealSection) -> String {
        [
            section.title,
            entry.name,
            entry.portion,
            app.display.kcal(Decimal(entry.calories)),
        ]
        .compactMap { $0 }
        .joined(separator: ", ")
    }

    private func eyebrow(_ text: String) -> some View {
        Text(text)
            .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
            .tracking(SL.TypeSize.micro * 0.06)
            .foregroundStyle(SL.Ink.tertiary)
    }

    // MARK: - Writing one entry

    /// Each of these touches one entry and nothing else in the account: the
    /// queue carries `upsertNutritionEntry` or `removeNutritionEntry` for that
    /// id, merged field by field at the far end.
    private func add(_ entry: NutritionEntry) {
        Task { await app.log(food: entry) }
        show("\(entry.name) toegevoegd aan \(mealName(entry).lowercased())") {
            Task { await app.removeFood(id: entry.id) }
        }
    }

    private func save(_ changed: NutritionEntry, was previous: NutritionEntry) {
        guard changed != previous else { return }
        Task { await app.log(food: changed) }
        show("\(changed.name) bijgewerkt") {
            Task { await app.log(food: previous) }
        }
    }

    private func delete(_ entry: NutritionEntry) {
        swiped = nil
        Task { await app.removeFood(id: entry.id) }
        show("\(entry.name) verwijderd") {
            Task { await app.log(food: entry) }
        }
    }

    private func mealName(_ entry: NutritionEntry) -> String {
        Meal(rawValue: entry.meal)?.rawValue ?? "Snacks"
    }

    private func show(_ message: String, undo: (() -> Void)?) {
        toast = Toast(message: message, undo: undo.map { action in
            { action(); toast = nil }
        })
        AccessibilityNotification.Announcement(message).post()
    }
}
