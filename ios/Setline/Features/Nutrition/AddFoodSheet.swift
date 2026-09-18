import SwiftUI
import SetlineCore

/// Logging one item of food.
///
/// The handoff draws artboard 21 but not this sheet, so it is assembled from
/// the components the handoff does define — sheet, chip, field, primary pill —
/// and asks for exactly the fields the account stores, no more. A product can
/// be looked up, which fills the fields for a portion you name; every number
/// stays editable afterwards, because a database is a starting point and the
/// packet in your hand is the authority.
struct AddFoodSheet: View {
    let date: Date
    let onLog: (NutritionEntry) -> Void
    let onClose: () -> Void

    @State private var meal: Meal = .likely(at: Date())
    @State private var query = ""
    @State private var results: [FoodProduct] = []
    @State private var searchNote: String?
    @State private var searching = false
    @State private var chosen: FoodProduct?
    @State private var grams = "100"
    private let search = FoodSearchService()
    @State private var name = ""
    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""
    @FocusState private var focused: Field?

    private enum Field: Hashable { case query, grams, name, calories, protein, carbs, fat }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    lookup
                    mealPicker.padding(.top, SL.Space.s5)
                    fields.padding(.top, SL.Space.s5)
                    if let energyNote {
                        Text(energyNote)
                            .slMeta()
                            .foregroundStyle(SL.Ink.tertiary)
                            .padding(.top, SL.Space.s3)
                    }
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s5)
                .padding(.bottom, SL.Space.s6)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(SL.Surface.raised.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            Button { log() } label: { Text("Voeg toe") }
                .buttonStyle(SLPrimaryButtonStyle())
                .disabled(!isLoggable)
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.bottom, SL.Space.s3)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .slRespondsToTextSize()
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Voeding toevoegen").slTitle().foregroundStyle(SL.Ink.primary)
            Spacer()
            Button { onClose() } label: {
                Text("Sluiten")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .slHitTarget()
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s5)
    }

    // MARK: - Looking it up

    @ViewBuilder
    private var lookup: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: SL.Space.s2) {
                // A product name is not prose: autocorrect turns "skyr" into
                // "Skye" and searches for the wrong thing.
                field("Zoek product", text: $query, field: .query, corrects: false)
                    .submitLabel(.search)
                    .onSubmit { run() }
                Button { run() } label: {
                    Text(searching ? "…" : "Zoek")
                        .slBody(SL.Weight.semibold)
                        .foregroundStyle(query.trimmingCharacters(in: .whitespaces).count >= FoodSearch.shortestQuery
                            ? SL.Ink.primary : SL.Ink.tertiary)
                        .padding(.horizontal, 18)
                        .frame(minHeight: SL.Space.hitMin)
                        .background(
                            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                .fill(SL.Surface.raised2)
                        )
                }
                .buttonStyle(.plain)
                .disabled(searching || query.trimmingCharacters(in: .whitespaces).count < FoodSearch.shortestQuery)
            }
            .padding(6)
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                    .fill(SL.Surface.ground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                    .strokeBorder(SL.Surface.hairline, lineWidth: 1)
            )

            if let searchNote {
                Text(searchNote)
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, SL.Space.s3)
            }

            if !results.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(results.enumerated()), id: \.element.id) { index, product in
                        if index > 0 { SLHairline().padding(.horizontal, 14) }
                        Button { choose(product) } label: { resultRow(product) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(6)
                .padding(.top, 0)
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                        .fill(SL.Surface.ground)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                        .strokeBorder(SL.Surface.hairline, lineWidth: 1)
                )
                .padding(.top, SL.Space.s3)

                Text("Controleer de verpakking; Open Food Facts wordt door gebruikers bijgehouden.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, SL.Space.s3)
            }

            if chosen != nil {
                field("Hoeveelheid", text: $grams, field: .grams, unit: "g", numeric: true)
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                            .fill(SL.Surface.ground)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                            .strokeBorder(SL.Surface.hairline, lineWidth: 1)
                    )
                    .padding(.top, SL.Space.s3)
                    .onChange(of: grams) { _, _ in fill() }
            }
        }
    }

    private func resultRow(_ product: FoodProduct) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(product.name).slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                Text("\(product.brand) · \(product.note)")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(NumberDisplay.dutch.kcal(Decimal(product.calories)))
                .slBody().slNumerals()
                .foregroundStyle(SL.Ink.secondary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, SL.Space.s3)
        .frame(minHeight: SL.Space.hitMin)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Dubbeltik om de waarden over te nemen")
    }

    private func run() {
        let asked = query
        searching = true
        searchNote = nil
        Task {
            let outcome = await search.search(asked)
            await MainActor.run {
                searching = false
                switch outcome {
                case let .found(products):
                    results = products
                    searchNote = nil
                case let .partial(products, note):
                    results = products
                    searchNote = note
                case let .failed(message):
                    results = []
                    searchNote = message
                }
            }
        }
    }

    private func choose(_ product: FoodProduct) {
        chosen = product
        grams = "100"
        results = []
        searchNote = nil
        focused = nil
        fill()
    }

    private func fill() {
        guard let chosen else { return }
        let draft = FoodSearch.portion(of: chosen, grams: NumberInput.value(grams))
        name = draft.name
        calories = draft.calories > 0 ? NumberDisplay.dutch.whole(Decimal(draft.calories)) : ""
        protein = NumberDisplay.dutch.number(Decimal(draft.protein))
        carbs = NumberDisplay.dutch.number(Decimal(draft.carbs))
        fat = NumberDisplay.dutch.number(Decimal(draft.fat))
    }

    private var mealPicker: some View {
        SLFlow {
            ForEach(Meal.allCases, id: \.self) { option in
                Button { meal = option } label: {
                    Text(option.rawValue)
                        .slBody(meal == option ? SL.Weight.semibold : SL.Weight.regular)
                        .foregroundStyle(meal == option ? SL.Ink.primary : SL.Ink.tertiary)
                        .padding(.horizontal, 18)
                        .frame(minHeight: SL.Space.hitMin)
                        .background(
                            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                .fill(meal == option ? SL.Surface.raised2 : .clear)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                .strokeBorder(
                                    SL.Surface.hairlineStrong,
                                    style: StrokeStyle(lineWidth: 1, dash: meal == option ? [] : [4, 4])
                                )
                        )
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(meal == option ? [.isSelected, .isButton] : .isButton)
            }
        }
    }

    private var fields: some View {
        VStack(spacing: 0) {
            field("Naam", text: $name, field: .name)
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
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                .fill(SL.Surface.ground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: 1)
        )
    }

    private func field(
        _ label: String,
        text: Binding<String>,
        field: Field,
        unit: String? = nil,
        numeric: Bool = false,
        corrects: Bool = true
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            SLEyebrow(text: label.uppercased(), size: SL.TypeSize.micro)
            HStack(spacing: SL.Space.s2) {
                TextField("", text: text)
                    .keyboardType(numeric ? .decimalPad : .default)
                    .textInputAutocapitalization(numeric || !corrects ? .never : .sentences)
                    .autocorrectionDisabled(numeric || !corrects)
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
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(focused == field ? SL.Surface.raised2 : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(focused == field ? SL.Signal.action : .clear, lineWidth: 1)
        )
        .focused($focused, equals: field)
        .contentShape(Rectangle())
        .onTapGesture { focused = field }
    }

    // MARK: - What it adds up to

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
        return "Gerekend uit de macro's: \(NumberDisplay.dutch.kcal(Decimal(energy)))."
    }

    private var isLoggable: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && energy > 0
    }

    private func log() {
        guard isLoggable else { return }
        onLog(
            NutritionEntry(
                id: "food-\(Int(Date().timeIntervalSince1970 * 1000))",
                date: Schedule.dateKey(date),
                meal: meal.rawValue,
                name: name.trimmingCharacters(in: .whitespaces),
                calories: energy,
                protein: value(protein),
                carbs: value(carbs),
                fat: value(fat)
            )
        )
    }
}
