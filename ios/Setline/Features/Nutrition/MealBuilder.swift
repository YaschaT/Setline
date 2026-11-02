import SwiftUI
import SetlineCore

/// A meal of your own: a name, with what goes in it underneath. Spaghetti is
/// pasta, sauce, mince and a spoon of olive oil; saved once, it is one tap
/// to log again. Kept on this phone, per account, like favorites.
struct SavedMeal: Codable, Equatable, Identifiable {
    struct Ingredient: Codable, Equatable, Identifiable {
        var id = UUID().uuidString
        var name: String
        /// As it is said: "80 g", "1 tbsp".
        var amount: String
        var calories: Double
        var protein: Double
        var carbs: Double
        var fat: Double
    }

    var id: String
    var name: String
    var ingredients: [Ingredient]

    var calories: Double { ingredients.reduce(0) { $0 + $1.calories }.rounded() }
    var protein: Double { ingredients.reduce(0) { $0 + $1.protein }.rounded() }
    var carbs: Double { ingredients.reduce(0) { $0 + $1.carbs }.rounded() }
    var fat: Double { ingredients.reduce(0) { $0 + $1.fat }.rounded() }

    /// "Pasta, tomato sauce, olive oil"
    var ingredientLine: String {
        ingredients.map(\.name).joined(separator: ", ")
    }

    /// One entry, the meal's name and totals. Logged as one meal, so changing
    /// the amount afterwards to 1.5 scales every number with it.
    func entry(id: String, on date: Date, meal: Meal) -> NutritionEntry {
        NutritionEntry(
            id: id,
            date: Schedule.dateKey(date),
            meal: meal.rawValue,
            name: name,
            calories: calories,
            protein: protein,
            carbs: carbs,
            fat: fat,
            amount: 1,
            unit: "meal",
            loggedAt: Date()
        )
    }
}

/// Builds or edits a meal: its name, then each ingredient with what it adds.
/// The totals follow as you type, and the meal is saved for next time.
struct MealBuilderSheet: View {
    @Environment(AppState.self) private var app
    let meal: SavedMeal?
    /// Where "Save and add" puts it.
    let mealTime: Meal
    let onSave: (SavedMeal, _ log: Bool) -> Void
    let onDelete: (() -> Void)?
    let onClose: () -> Void

    private struct Draft: Identifiable, Equatable {
        var id = UUID().uuidString
        var name = ""
        var amount = ""
        var calories = ""
        var protein = ""
        var carbs = ""
        var fat = ""
    }

    @State private var name: String
    @State private var drafts: [Draft]
    @State private var confirmsDelete = false
    @FocusState private var focused: String?

    init(meal: SavedMeal?, mealTime: Meal, onSave: @escaping (SavedMeal, Bool) -> Void,
         onDelete: (() -> Void)?, onClose: @escaping () -> Void) {
        self.meal = meal
        self.mealTime = mealTime
        self.onSave = onSave
        self.onDelete = onDelete
        self.onClose = onClose
        _name = State(initialValue: meal?.name ?? "")
        _drafts = State(initialValue: meal.map { saved in
            saved.ingredients.map { item in
                Draft(id: item.id, name: item.name, amount: item.amount,
                      calories: Self.text(item.calories), protein: Self.text(item.protein),
                      carbs: Self.text(item.carbs), fat: Self.text(item.fat))
            }
        } ?? [Draft()])
    }

    private static func text(_ value: Double) -> String {
        value == 0 ? "" : (value.rounded() == value ? String(Int(value)) : String(value))
    }

    private func value(_ text: String) -> Double { NumberInput.value(text) }

    /// Calories as typed, or worked out from the macros when left blank.
    private func energy(_ draft: Draft) -> Double {
        let typed = value(draft.calories)
        return typed > 0 ? typed : NutritionEntry.calories(protein: value(draft.protein), carbs: value(draft.carbs), fat: value(draft.fat))
    }

    private var built: SavedMeal {
        SavedMeal(
            id: meal?.id ?? "meal-\(Int(Date().timeIntervalSince1970 * 1000))",
            name: name.trimmingCharacters(in: .whitespaces),
            ingredients: drafts
                .filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
                .map { draft in
                    SavedMeal.Ingredient(id: draft.id, name: draft.name.trimmingCharacters(in: .whitespaces),
                                         amount: draft.amount.trimmingCharacters(in: .whitespaces),
                                         calories: energy(draft), protein: value(draft.protein),
                                         carbs: value(draft.carbs), fat: value(draft.fat))
                }
        )
    }

    private var isSavable: Bool {
        let meal = built
        return !meal.name.isEmpty && !meal.ingredients.isEmpty && meal.calories > 0
    }

    var body: some View {
        SLSheet(title: meal == nil ? "Build a meal" : "Edit meal",
                subtitle: "Name it, then add what goes in it. Saved for next time.",
                onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s5) {
                nameCard
                VStack(alignment: .leading, spacing: SL.Space.s2) {
                    SLOverline(text: "Ingredients").padding(.leading, SL.Space.s1)
                    ForEach($drafts) { $draft in
                        ingredientCard($draft)
                    }
                    Button {
                        let next = Draft()
                        drafts.append(next)
                        focused = "name-\(next.id)"
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus").font(.system(size: 14, weight: .bold))
                            Text("Add ingredient").slBody(SL.Weight.semibold)
                        }
                        .foregroundStyle(SL.Signal.action)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .overlay(
                            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                                .strokeBorder(SL.Signal.action.opacity(0.45), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                        )
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(SLPressStyle(scale: 0.98))
                }
                totals
                if onDelete != nil {
                    Button("Delete meal", role: .destructive) { confirmsDelete = true }
                        .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                        .foregroundStyle(SL.Signal.loss)
                        .frame(maxWidth: .infinity, minHeight: SL.Space.hitMin)
                }
            }
            .padding(.top, SL.Space.s2)
            .padding(.bottom, SL.Space.s4)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: SL.Space.s2) {
                Button { onSave(built, true) } label: { Text("Save and add to \(mealTime.spoken)") }
                    .buttonStyle(SLPrimaryButtonStyle())
                Button { onSave(built, false) } label: { Text("Save meal") }
                    .buttonStyle(SLOutlineButtonStyle(emphasis: .tertiary))
            }
            .disabled(!isSavable)
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s2)
            .padding(.bottom, SL.Space.s3)
            .background(SL.Surface.raised)
        }
        .alert("Delete \(meal?.name ?? "this meal")?", isPresented: $confirmsDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { onDelete?() }
        } message: {
            Text("What you already logged stays in your day.")
        }
    }

    private var nameCard: some View {
        VStack(alignment: .leading, spacing: 2) {
            SLEyebrow(text: "MEAL NAME", size: SL.TypeSize.micro)
            TextField("Spaghetti bolognese", text: $name)
                .font(.sl(SL.TypeSize.lead, SL.Weight.semibold))
                .foregroundStyle(SL.Ink.primary)
                .tint(SL.Signal.action)
                .textInputAutocapitalization(.sentences)
                .focused($focused, equals: "meal-name")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.ground))
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(focused == "meal-name" ? SL.Signal.action : SL.Surface.hairline, lineWidth: SL.Metric.border)
        )
    }

    private func ingredientCard(_ draft: Binding<Draft>) -> some View {
        let id = draft.wrappedValue.id
        return VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack(spacing: SL.Space.s2) {
                TextField("Ingredient, like olive oil", text: draft.name)
                    .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                    .foregroundStyle(SL.Ink.primary)
                    .tint(SL.Signal.action)
                    .focused($focused, equals: "name-\(id)")
                TextField("Amount", text: draft.amount)
                    .font(.sl(SL.TypeSize.body, SL.Weight.regular))
                    .foregroundStyle(SL.Ink.secondary)
                    .multilineTextAlignment(.trailing)
                    .tint(SL.Signal.action)
                    .frame(maxWidth: 96)
                if drafts.count > 1 {
                    Button {
                        drafts.removeAll { $0.id == id }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(SL.Ink.tertiary)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(SL.Surface.raised2))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove \(draft.wrappedValue.name.isEmpty ? "ingredient" : draft.wrappedValue.name)")
                }
            }
            HStack(spacing: SL.Space.s2) {
                macroField("kcal", text: draft.calories)
                macroField("Protein g", text: draft.protein)
                macroField("Carbs g", text: draft.carbs)
                macroField("Fat g", text: draft.fat)
            }
        }
        .padding(SL.Space.s3)
        .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.ground))
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border)
        )
    }

    private func macroField(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                .foregroundStyle(SL.Ink.tertiary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            TextField("0", text: text)
                .keyboardType(.decimalPad)
                .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                .slNumerals()
                .foregroundStyle(SL.Ink.primary)
                .tint(SL.Signal.action)
                .onChange(of: text.wrappedValue) { _, new in
                    let filtered = NumberInput.numericOnly(new)
                    if filtered != new { text.wrappedValue = filtered }
                }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
    }

    /// What the whole meal adds, as you type.
    private var totals: some View {
        let meal = built
        return HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Whole meal").slMeta(SL.Weight.semibold).foregroundStyle(SL.Ink.secondary)
                Text(app.display.kcal(Decimal(meal.calories)))
                    .font(.sl(SL.TypeSize.title, SL.Weight.bold))
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
            }
            Spacer(minLength: SL.Space.s2)
            Text("P \(Int(meal.protein)) g · C \(Int(meal.carbs)) g · F \(Int(meal.fat)) g")
                .slMeta()
                .slNumerals()
                .foregroundStyle(SL.Ink.secondary)
        }
        .padding(SL.Space.s4)
        .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Signal.actionTint))
        .accessibilityElement(children: .combine)
    }
}
