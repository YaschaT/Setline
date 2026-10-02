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

        var id: String {
            switch self {
            case .add(let meal): return "add-\(meal.rawValue)"
            case .edit(let entry): return "edit-\(entry.id)"
            case .targets: return "targets"
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

    /// What the hour suggests. The sheet opens there, one tap from any other
    /// meal.
    private var likely: Meal { Meal.likely(at: now) }

    /// The day's items in the order they are eaten: ontbijt, lunch, avondeten,
    /// snacks, each in the order it was logged.
    private var eaten: [(entry: NutritionEntry, section: MealSection)] {
        day.sections.flatMap { section in section.entries.map { ($0, section) } }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                SLScreenTitle(title: "Voeding", subtitle: SLDateText.long(now))
                hero
                macros
                if let shortfall = ProteinShortfall.make(entries: app.nutritionEntries, targets: app.targets, today: now) {
                    SLAttentionCard(title: "Aandacht") {
                        Text("\(shortfall.days) dagen op rij onder je eiwitdoel. Gemiddeld \(shortfall.averageGrams) g tekort.".slUnbroken)
                            .slBody()
                            .slNumerals()
                            .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                            .fixedSize(horizontal: false, vertical: true)
                            .foregroundStyle(SL.Ink.primary)
                    }
                    .accessibilityElement(children: .combine)
                }
                eatenSection
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s5)
            .padding(.bottom, SL.Space.s6)
        }
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
        .onAppear { now = Date() }
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

    private var hero: some View {
        let isOver = over > 0
        let label = !day.hasTarget ? "Gegeten vandaag" : isOver ? "Boven je doel" : "Nog te eten"
        let value = !day.hasTarget ? day.calories : isOver ? over : day.remaining
        return VStack(alignment: .leading, spacing: SL.Space.s4) {
            HStack(alignment: .center, spacing: SL.Space.s3) {
                VStack(alignment: .leading, spacing: SL.Space.s1) {
                    Text(label)
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(app.display.whole(Decimal(value)))
                            .font(.sl(SL.TypeSize.display, SL.Weight.semibold))
                            .slNumerals()
                            .slLineHeight(1, size: SL.TypeSize.display)
                            .foregroundStyle(isOver ? SL.Signal.attention : SL.Signal.action)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        Text("kcal")
                            .slLead(SL.Weight.regular)
                            .foregroundStyle(SL.Ink.primary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(label), \(app.display.kcal(Decimal(value)))")

                // The oversized word: decoration, so it keeps its own size and
                // steps aside when the text is large.
                if !typeSize.isAccessibilitySize {
                    Text("KCAL")
                        .font(.slFixed(48, SL.Weight.bold))
                        .tracking(-0.48)
                        .foregroundStyle(SL.Signal.action.opacity(0.18))
                        .lineLimit(1)
                        .fixedSize()
                        .accessibilityHidden(true)
                }
            }

            if day.hasTarget {
                SLBar(fraction: day.consumed, height: 8, fill: isOver ? SL.Signal.attention : SL.Signal.action)
                    .accessibilityLabel("\(Int((day.consumed * 100).rounded())) procent van je caloriedoel gegeten")
            }

            HStack(alignment: .top, spacing: SL.Space.s3) {
                heroStat(app.display.whole(Decimal(day.calories)), label: "gegeten")
                Button { sheet = .targets } label: {
                    heroStat(
                        day.hasTarget ? app.display.whole(Decimal(day.targets?.calories ?? 0)) : "—",
                        label: day.hasTarget ? "doel" : "doel instellen"
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opent je dagdoelen")
            }
            .padding(.top, SL.Space.s3)
            .overlay(alignment: .top) { SLHairline() }

            Button { sheet = .add(likely) } label: {
                HStack(spacing: 10) {
                    SLGlyph(name: .plus, size: 16)
                    Text("Maaltijd loggen")
                }
            }
            .buttonStyle(SLPrimaryButtonStyle())
            .accessibilityHint("Opent op \(likely.spoken)")
        }
        .padding(SL.Space.s4)
        .slBorderBox()
        .frame(maxWidth: .infinity, alignment: .leading)
        .slHeroCard()
    }

    private func heroStat(_ value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            (Text(value).font(.sl(SL.TypeSize.lead, SL.Weight.semibold)).foregroundStyle(SL.Ink.primary)
                + Text(" kcal").font(.sl(SL.TypeSize.meta, SL.Weight.regular)).foregroundStyle(SL.Ink.secondary))
                .slNumerals()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: SL.Space.hitMin, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label), \(value) kcal")
    }

    // MARK: - Macros

    /// The three macros against their targets, once, for the day. Protein is
    /// the one the reader steers by, so it leads and carries the full lime;
    /// the other two step back.
    private var macros: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLSectionHead(title: "Macro’s", meta: day.hasTarget ? "gegeten / doel" : "gegeten")
            VStack(spacing: 0) {
                ForEach(Array(Macro.allCases.enumerated()), id: \.element) { index, macro in
                    macroRow(macro, level: index)
                        .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                }
            }
            .slBorderBox()
            .slListCard()
        }
    }

    private func macroRow(_ macro: Macro, level: Int) -> some View {
        let total = day.total(of: macro)
        let target = day.target(for: macro)
        let left = (target - total).rounded()
        let name = macro == .protein ? "Eiwit" : macro.label
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SL.Space.s3))
        return VStack(alignment: .leading, spacing: SL.Space.s2) {
            layout {
                Text(name)
                    .slLead()
                    .foregroundStyle(SL.Ink.primary)
                if !typeSize.isAccessibilitySize { Spacer(minLength: SL.Space.s2) }
                // Whole grams: a tenth of a gram of fat is not something a day
                // is steered by.
                (Text(app.display.whole(Decimal(total))).font(.sl(SL.TypeSize.lead, SL.Weight.semibold)).foregroundStyle(SL.Ink.primary)
                    + Text(target > 0 ? " / \(app.display.whole(Decimal(target))) g" : " g")
                        .font(.sl(SL.TypeSize.body, SL.Weight.regular)).foregroundStyle(SL.Ink.secondary))
                    .slNumerals()
                    .lineLimit(1)
            }
            if target > 0 {
                SLBar(
                    fraction: day.fraction(of: macro),
                    height: 6,
                    fill: SL.Signal.action.opacity([1, 0.6, 0.4][min(level, 2)])
                )
                Text(left >= 0
                     ? "nog \(app.display.whole(Decimal(left))) g"
                     : "\(app.display.whole(Decimal(-left))) g boven doel")
                    .slMeta()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
            }
        }
        .padding(.horizontal, SL.Space.s4)
        .padding(.vertical, SL.Space.s3)
        .frame(minHeight: target > 0 ? 72 : 52)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            target > 0
                ? "\(name), \(app.display.whole(Decimal(total))) van \(app.display.whole(Decimal(target))) gram"
                : "\(name), \(app.display.whole(Decimal(total))) gram"
        )
    }

    // MARK: - What was eaten

    private var eatenSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLSectionHead(
                title: "Vandaag gegeten",
                meta: "\(eaten.count) \(eaten.count == 1 ? "item" : "items")"
            )
            VStack(spacing: 0) {
                if eaten.isEmpty {
                    // Said plainly rather than shown as a row of zeroes.
                    VStack(alignment: .leading, spacing: SL.Space.s1) {
                        Text("Nog niets gelogd")
                            .slLead()
                            .foregroundStyle(SL.Ink.primary)
                        Text("Log je eerste maaltijd; je totalen en wat er nog over is rekenen meteen mee.")
                            .slBody()
                            .slLineHeight(1.45, size: SL.TypeSize.body)
                            .fixedSize(horizontal: false, vertical: true)
                            .foregroundStyle(SL.Ink.secondary)
                    }
                    .padding(SL.Space.s4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    ForEach(Array(eaten.enumerated()), id: \.element.entry.id) { index, item in
                        row(item.entry, in: item.section)
                            .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                    }
                }
            }
            .slBorderBox()
            .slListCard()
        }
    }

    /// One logged item: when, what it was and which meal, and what it cost.
    /// Tapping it opens the item; a swipe offers to take it off the day.
    private func row(_ entry: NutritionEntry, in section: MealSection) -> some View {
        let isSwiped = swiped == entry.id

        return ZStack(alignment: .trailing) {
            Button { delete(entry) } label: {
                Text("Verwijder")
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
        .accessibilityHint("Dubbeltik om hoeveelheid, maaltijd of verwijderen te openen")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { sheet = .edit(entry) }
        // A swipe is not reachable with VoiceOver, so the same delete is an
        // action on the row.
        .accessibilityAction(named: "Verwijderen") { delete(entry) }
    }

    private static let swipeReveal: CGFloat = 112

    /// 48 in the design; it has to grow with the text or "12:45" is cut.
    @ScaledMetric(relativeTo: .body) private var timeWidth: CGFloat = 48

    /// "12:45" — the hour it was logged, as the clock had it.
    private static func clock(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nl_BE")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    /// "Lunch · 100 g · 46 g eiwit"
    private func detail(_ entry: NutritionEntry, in section: MealSection) -> String {
        [
            section.title,
            entry.portion,
            "\(app.display.whole(Decimal(entry.protein))) g eiwit",
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }

    private func spoken(_ entry: NutritionEntry, in section: MealSection) -> String {
        [
            entry.loggedAt.map { "gelogd om \(Self.clock($0))" },
            section.title,
            entry.name,
            entry.portion,
            app.display.kcal(Decimal(entry.calories)),
            "\(app.display.whole(Decimal(entry.protein))) gram eiwit",
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
