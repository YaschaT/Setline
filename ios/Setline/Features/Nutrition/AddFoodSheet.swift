import SwiftUI
import SetlineCore

/// Logging one item of food by hand.
///
/// The handoff draws artboard 21 but not this sheet, so it is assembled from
/// the components the handoff does define — sheet, chip, field, primary pill —
/// and asks for exactly the fields the account stores, no more. Searching a
/// product is the web app's own screen and needs its endpoint; nothing here
/// invents a food database or guesses a number the reader did not type.
struct AddFoodSheet: View {
    let date: Date
    let onLog: (NutritionEntry) -> Void
    let onClose: () -> Void

    @State private var meal: Meal = .likely(at: Date())
    @State private var name = ""
    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""
    @FocusState private var focused: Field?

    private enum Field: Hashable { case name, calories, protein, carbs, fat }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    mealPicker
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
