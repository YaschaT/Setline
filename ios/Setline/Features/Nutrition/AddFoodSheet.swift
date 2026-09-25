import SwiftUI
import SetlineCore

/// Artboard 42c · Toevoegen.
///
/// The meal is already chosen, because the hour knows which one it is, and one
/// tap changes it. Under it: a search, then what this account eats at this
/// meal, then what it ate last — each row an item it has logged before, at the
/// amount it was logged at, one ⊕ from being logged again.
///
/// Nothing here is invented. The lists are the account's own entries, and the
/// search is the web app's endpoint (`/api/food-search`), shown in the order
/// the server ranked it. No suggestion, estimate or portion is made up on this
/// side.
struct AddFoodSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize

    let date: Date
    /// Which heading the ⊕ adds to. 42c preselects it from the hour.
    let meal: Meal
    let onLog: (NutritionEntry) -> Void
    let onClose: () -> Void

    @State private var chosen: Meal
    @State private var query = ""
    @State private var results: [FoodProduct] = []
    @State private var note: String?
    @State private var searching = false
    /// The food that is not in any database, written out by hand. 42c does not
    /// draw it; it is the way in for everything the search cannot find, and the
    /// search itself points at it when it comes back empty.
    @State private var manual = false
    @State private var name = ""
    @State private var amount = "100"
    @State private var unit = "g"
    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""
    @FocusState private var focused: Field?

    private let search = FoodSearchService()

    private enum Field: Hashable { case query, name, amount, unit, calories, protein, carbs, fat }

    init(
        date: Date,
        meal: Meal,
        onLog: @escaping (NutritionEntry) -> Void,
        onClose: @escaping () -> Void
    ) {
        self.date = date
        self.meal = meal
        self.onLog = onLog
        self.onClose = onClose
        _chosen = State(initialValue: meal)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            grip
            head

            MealSegment(selection: $chosen)
                .padding(.top, 0)

            if manual {
                ScrollView {
                    ownValues.padding(.bottom, SL.Space.s5)
                }
                .scrollDismissesKeyboard(.interactively)
            } else {
                searchField.padding(.top, SL.Space.s3)
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        if let note {
                            Text(note)
                                .slMeta()
                                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                                .fixedSize(horizontal: false, vertical: true)
                                .foregroundStyle(SL.Ink.tertiary)
                                .padding(.top, SL.Space.s3)
                        }
                        if searching {
                            loading.padding(.top, SL.Space.s3)
                        } else if !results.isEmpty {
                            group("RESULTATEN", top: 22) {
                                ForEach(results) { product in
                                    productRow(product)
                                }
                            }
                            Text("Controleer de verpakking; Open Food Facts wordt door gebruikers bijgehouden.")
                                .slMeta()
                                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                                .fixedSize(horizontal: false, vertical: true)
                                .foregroundStyle(SL.Ink.tertiary)
                                .padding(.top, SL.Space.s3)
                        } else if isSearch {
                            ownValuesInvitation.padding(.top, SL.Space.s4)
                        } else {
                            memory
                        }
                    }
                    .padding(.bottom, SL.Space.s5)
                }
                .scrollDismissesKeyboard(.interactively)
            }
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, 10)
        .padding(.bottom, 34)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(SL.Surface.raised)
        .safeAreaInset(edge: .bottom) {
            if manual {
                Button { logOwn() } label: { Text("Voeg toe aan \(chosen.spoken)") }
                    .buttonStyle(SLPrimaryButtonStyle())
                    .disabled(!isLoggable)
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.bottom, SL.Space.s3)
                    .frame(maxWidth: .infinity)
                    .background(SL.Surface.raised)
            }
        }
        // 42c opens 120 from the top of the frame. A detent's fraction is of
        // the container between the safe areas, not of the screen, so the
        // number is larger than the artboard's 86%.
        .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.fraction(0.94)])
        .presentationDragIndicator(.hidden)
        .presentationBackground(SL.Surface.raised)
        .slRespondsToTextSize()
        // Typing finds things without asking for the return key, and one
        // request is sent per pause rather than per letter.
        .task(id: query) {
            let asked = query.trimmingCharacters(in: .whitespacesAndNewlines)
            guard asked.count >= FoodSearch.shortestQuery else {
                results = []
                note = nil
                searching = false
                return
            }
            searching = true
            try? await Task.sleep(for: .milliseconds(450))
            guard !Task.isCancelled else { return }
            await run(asked)
        }
    }

    private var isSearch: Bool {
        query.trimmingCharacters(in: .whitespacesAndNewlines).count >= FoodSearch.shortestQuery
    }

    // MARK: - Chrome

    private var grip: some View {
        Capsule()
            .fill(SL.Surface.hairlineStrong)
            .frame(width: 36, height: 5)
            .frame(maxWidth: .infinity)
            .padding(.bottom, 18)
            .accessibilityHidden(true)
    }

    private var head: some View {
        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
            Text(manual ? "Zelf invullen" : "Toevoegen")
                .slTitle()
                .foregroundStyle(SL.Ink.primary)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: SL.Space.s2)
            Button {
                if manual { manual = false } else { onClose() }
            } label: {
                Text(manual ? "Terug" : "Sluiten")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .slHitTarget()
            }
            .buttonStyle(.plain)
        }
        .frame(minHeight: 24)
        .padding(.bottom, 14)
    }

    // MARK: - Looking it up

    private var searchField: some View {
        HStack(spacing: 10) {
            SLGlyph(name: .search, size: 20)
                .foregroundStyle(SL.Ink.tertiary)
            // A product name is not prose: autocorrect turns "skyr" into
            // "Skye" and searches for the wrong thing.
            TextField(
                "",
                text: $query,
                prompt: Text("Zoek voeding").foregroundColor(SL.Ink.tertiary)
            )
            .font(.sl(SL.TypeSize.lead, SL.Weight.regular))
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.search)
            .foregroundStyle(SL.Ink.primary)
            .tint(SL.Signal.action)
            .focused($focused, equals: .query)
            if !query.isEmpty {
                Button { query = "" } label: {
                    Text("Wis")
                        .slMeta(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.tertiary)
                        .frame(minWidth: 40, minHeight: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.trailing, -6)
                .accessibilityLabel("Zoekterm wissen")
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 6)
        .frame(minHeight: SL.Space.hitMin)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .fill(SL.Surface.raised2)
        )
        .contentShape(Rectangle())
        .onTapGesture { focused = .query }
    }

    /// The component sheet's loading state on the one operation that really
    /// waits on a network: a tonal row, never a spinner and never a pulse, so
    /// reduced motion sees exactly the same thing.
    private var loading: some View {
        HStack(spacing: SL.Space.s3) {
            RoundedRectangle(cornerRadius: SL.Radius.sm, style: .continuous)
                .fill(SL.Surface.raised2)
                .frame(width: 120, height: 12)
            Spacer()
            Text("Zoeken…").slMeta().foregroundStyle(SL.Ink.tertiary)
        }
        .frame(minHeight: 50)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Zoeken")
    }

    private func run(_ asked: String) async {
        let outcome = await search.search(asked, accessToken: app.session?.accessToken)
        guard !Task.isCancelled else { return }
        searching = false
        switch outcome {
        case let .found(products):
            results = products
            note = nil
        case let .partial(products, text):
            results = products
            note = text
        case let .failed(message):
            results = []
            note = message
        }
    }

    // MARK: - What this account eats

    /// 42c: what is logged at this meal most often, then what was logged last.
    /// Both come from this account's own entries; an empty history simply shows
    /// nothing, and never a made-up example.
    @ViewBuilder
    private var memory: some View {
        let today = Schedule.dateKey(date)
        let entries = app.nutritionEntries
        let often = FoodMemory.often(at: chosen, in: entries, excluding: today)
        let recent = FoodMemory.recent(in: entries, excluding: today)
            .filter { entry in !often.contains { $0.name.lowercased() == entry.name.lowercased() } }

        if often.isEmpty && recent.isEmpty {
            Text("Zoek een product, of vul het zelf in. Wat je logt komt hier te staan.")
                .slBody()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, 22)
            ownValuesInvitation.padding(.top, SL.Space.s4)
        } else {
            if !often.isEmpty {
                group("VAAK BIJ \(chosen.rawValue.uppercased())", top: 22) {
                    ForEach(often) { entry in
                        memoryRow(entry)
                    }
                }
            }
            if !recent.isEmpty {
                group("RECENT", top: often.isEmpty ? 22 : 18) {
                    ForEach(recent) { entry in
                        memoryRow(entry)
                    }
                }
            }
            Text(footnote)
                .slMeta()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.tertiary)
                .padding(.top, SL.Space.s3)
            ownValuesInvitation.padding(.top, SL.Space.s4)
        }
    }

    /// The hour is only given as the reason when the hour is actually the
    /// reason — opening the sheet from a meal's own ⊕ chose it instead.
    private var footnote: String {
        chosen == Meal.likely(at: Date())
            ? "\(MealSection.title(of: chosen)) staat voorgekozen omdat het \(app.display.clock(Date())) is. Eén tik op ⊕ zet het item erin met deze hoeveelheid."
            : "Eén tik op ⊕ zet het item in \(chosen.spoken), met deze hoeveelheid."
    }

    private func group<Content: View>(
        _ title: String,
        top: CGFloat,
        @ViewBuilder rows: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
                .tracking(SL.TypeSize.micro * 0.06)
                .foregroundStyle(SL.Ink.tertiary)
                .padding(.top, top)
                .padding(.bottom, SL.Space.s1)
            rows()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// A row the account has eaten before, offered again exactly as it was
    /// written: the same name, the same amount, the same numbers.
    private func memoryRow(_ entry: NutritionEntry) -> some View {
        row(
            title: entry.name,
            detail: [entry.portion, app.display.kcal(Decimal(entry.calories))]
                .compactMap { $0 }
                .joined(separator: " · ")
        ) {
            // The day this sheet logs to, at the moment it is tapped.
            onLog(FoodMemory.repeated(entry, on: date, meal: chosen))
        }
    }

    /// A product from the search, at the 100 g its values are given for. The
    /// amount is changed afterwards on the row itself (42d), where the macros
    /// follow it.
    private func productRow(_ product: FoodProduct) -> some View {
        row(
            title: product.name,
            detail: "100 g · \(app.display.kcal(Decimal(product.calories))) · \(product.brand)"
        ) {
            let draft = FoodSearch.portion(of: product, grams: 100)
            onLog(
                NutritionEntry(
                    id: Self.newID(),
                    date: Schedule.dateKey(date),
                    meal: chosen.rawValue,
                    name: draft.name,
                    calories: draft.calories,
                    protein: draft.protein,
                    carbs: draft.carbs,
                    fat: draft.fat,
                    amount: draft.amount,
                    unit: draft.unit,
                    loggedAt: Date()
                )
            )
        }
    }

    private func row(title: String, detail: String, add: @escaping () -> Void) -> some View {
        Button(action: add) {
            HStack(spacing: SL.Space.s3) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .slLead()
                        .foregroundStyle(SL.Ink.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(detail)
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.tertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: SL.Space.s2)
                Image(systemName: "plus.circle")
                    .font(.sl(24, SL.Weight.regular))
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin)
                    // 42c hangs the ⊕ 10 past the gutter, so the glyph lines
                    // up with the text above it rather than its hit area.
                    .padding(.trailing, -10)
            }
            .frame(minHeight: 50)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(title), \(detail)")
        .accessibilityHint("Dubbeltik om toe te voegen aan \(chosen.spoken)")
    }

    // MARK: - Food no database has

    private var ownValuesInvitation: some View {
        Button { manual = true } label: {
            HStack(spacing: SL.Space.s3) {
                Text("Zelf invullen")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                Spacer(minLength: SL.Space.s2)
                SLGlyph(name: .chevronRight, size: 18)
                    .foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: SL.Space.hitMin)
            .slBorderBox()
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                    .fill(SL.Surface.ground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                    .strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Voor eten dat de zoekfunctie niet kent")
    }

    private var ownValues: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(spacing: 0) {
                field("Naam", text: $name, field: .name)
                SLHairline().padding(.horizontal, 14)
                field("Hoeveelheid", text: $amount, field: .amount, numeric: true)
                SLHairline().padding(.horizontal, 14)
                field("Eenheid", text: $unit, field: .unit)
                SLHairline().padding(.horizontal, 14)
                field("Calorieën", text: $calories, field: .calories, unit: "kcal", numeric: true)
                SLHairline().padding(.horizontal, 14)
                field("Proteïne", text: $protein, field: .protein, unit: "g", numeric: true)
                SLHairline().padding(.horizontal, 14)
                field("Koolhydraten", text: $carbs, field: .carbs, unit: "g", numeric: true)
                SLHairline().padding(.horizontal, 14)
                field("Vet", text: $fat, field: .fat, unit: "g", numeric: true)
            }
            .padding(6)
            .slBorderBox()
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                    .fill(SL.Surface.ground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                    .strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border)
            )
            .padding(.top, SL.Space.s4)

            if let energyNote {
                Text(energyNote)
                    .slMeta()
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, SL.Space.s3)
            }
        }
    }

    private func field(
        _ label: String,
        text: Binding<String>,
        field: Field,
        unit: String? = nil,
        numeric: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            SLEyebrow(text: label.uppercased(), size: SL.TypeSize.micro)
            HStack(spacing: SL.Space.s2) {
                TextField("", text: text)
                    .keyboardType(numeric ? .decimalPad : .default)
                    .textInputAutocapitalization(numeric ? .never : .sentences)
                    .autocorrectionDisabled(numeric)
                    .onChange(of: text.wrappedValue) { _, new in
                        guard numeric else { return }
                        let filtered = NumberInput.numericOnly(new)
                        if filtered != new { text.wrappedValue = filtered }
                    }
                    // 17pt, comfortably above the 16pt floor that stops iOS
                    // zooming a field on focus.
                    .font(.sl(SL.TypeSize.lead, SL.Weight.medium))
                    .foregroundStyle(SL.Ink.primary)
                    .tint(SL.Signal.action)
                if let unit {
                    Text(unit).slBody().foregroundStyle(SL.Ink.tertiary)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(minHeight: 60)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .fill(focused == field ? SL.Surface.raised2 : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(focused == field ? SL.Signal.action : .clear, lineWidth: SL.Metric.border)
        )
        .focused($focused, equals: field)
        .contentShape(Rectangle())
        .onTapGesture { focused = field }
    }

    private func value(_ text: String) -> Double { NumberInput.value(text) }

    private var energy: Double {
        let typed = value(calories)
        return typed > 0
            ? typed
            : NutritionEntry.calories(protein: value(protein), carbs: value(carbs), fat: value(fat))
    }

    /// Said only when it changes what gets stored: macros filled in, calories
    /// left blank.
    private var energyNote: String? {
        guard value(calories) <= 0, energy > 0 else { return nil }
        return "Gerekend uit de macro's: \(app.display.kcal(Decimal(energy)))."
    }

    private var isLoggable: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && energy > 0
    }

    private func logOwn() {
        guard isLoggable else { return }
        let written = value(amount)
        let named = unit.trimmingCharacters(in: .whitespaces)
        onLog(
            NutritionEntry(
                id: Self.newID(),
                date: Schedule.dateKey(date),
                meal: chosen.rawValue,
                name: name.trimmingCharacters(in: .whitespaces),
                calories: energy,
                protein: value(protein),
                carbs: value(carbs),
                fat: value(fat),
                amount: written > 0 ? written : nil,
                unit: written > 0 && !named.isEmpty ? named : nil,
                loggedAt: Date()
            )
        )
    }

    private static func newID() -> String {
        "food-\(Int(Date().timeIntervalSince1970 * 1000))"
    }
}

/// The four headings as one control (42c, 42d): 44 high on the ground surface,
/// the chosen one raised with the .28 edge. At accessibility sizes the names
/// take a row each rather than being cut to "Avond…".
struct MealSegment: View {
    @Binding var selection: Meal
    @Environment(\.dynamicTypeSize) private var typeSize

    /// The four the day is read in. Pre-workout is stored, and read under
    /// Snacks, but it is not one of the four a reader assigns.
    private var options: [Meal] { MealSection.headings.map(\.0) }

    var body: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: 4))
            : AnyLayout(HStackLayout(spacing: 4))

        return layout {
            ForEach(options) { option in
                let isChosen = option == selection
                Button { selection = option } label: {
                    Text(MealSection.title(of: option))
                        // 42c sets these at 14 — off the type scale, because
                        // four names have to fit across one row.
                        .font(.sl(14, isChosen ? SL.Weight.semibold : SL.Weight.regular))
                        .foregroundStyle(isChosen ? SL.Ink.primary : SL.Ink.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                        // 42 of content inside its own hairline is the 44 the
                        // artboard draws, and the 44 a finger needs.
                        .frame(minHeight: SL.Space.hitMin - 2)
                        .slBorderBox()
                        .background(
                            RoundedRectangle(cornerRadius: 11, style: .continuous)
                                .fill(isChosen ? SL.Surface.raised2 : .clear)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 11, style: .continuous)
                                .strokeBorder(isChosen ? SL.Surface.selection : .clear, lineWidth: SL.Metric.border)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isChosen ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(3)
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg - 2, style: .continuous)
                .fill(SL.Surface.ground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg - 2, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border)
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Maaltijd")
    }
}
