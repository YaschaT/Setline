import SwiftUI
import SetlineCore

/// Artboard 42d · Item wijzigen.
///
/// One logged row: how much of it, what that comes to, which meal it belongs
/// to. The amount is the control, and the numbers under it are what this
/// amount is worth — recomputed as it changes, so nothing is saved that the
/// reader has not already seen.
///
/// Only this entry is written, and only when `Bewaar` is tapped. Its id, its
/// date and the hour it was logged at are kept: moving a late lunch under
/// Lunch does not rewrite the clock, and correcting one row leaves the rest of
/// the day exactly as it was.
struct FoodEntrySheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize

    let entry: NutritionEntry
    let onSave: (NutritionEntry) -> Void
    let onDelete: (NutritionEntry) -> Void

    @State private var amount: Double
    @State private var meal: Meal
    /// Whether anything has been changed yet. The segment opens on the heading
    /// the day reads this entry under, which for a pre-workout item is not the
    /// name it was stored with — so "changed" has to mean touched, not merely
    /// different.
    @State private var touched = false

    init(
        entry: NutritionEntry,
        onSave: @escaping (NutritionEntry) -> Void,
        onDelete: @escaping (NutritionEntry) -> Void
    ) {
        self.entry = entry
        self.onSave = onSave
        self.onDelete = onDelete
        _amount = State(initialValue: entry.amount ?? 0)
        _meal = State(initialValue: Self.heading(of: entry))
    }

    /// Where the day reads this entry: its own meal, or Snacks for pre-workout
    /// and for a name this app does not know — the same reading `NutritionDay`
    /// groups by, so the sheet and the day never disagree.
    private static func heading(of entry: NutritionEntry) -> Meal {
        guard let stored = Meal(rawValue: entry.meal) else { return .snack }
        return MealSection.headings.contains { $0.0 == stored } ? stored : .snack
    }

    /// What is on screen: this entry at the amount now showing, under the meal
    /// now chosen. Nothing else about it changes.
    private var edited: NutritionEntry {
        let scaled = amount == entry.amount ? entry : entry.scaled(to: amount)
        return scaled.filed(under: meal)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            grip

            // The item scrolls and the two actions stay put: at accessibility
            // sizes this sheet is taller than the screen, and `Bewaar` has to
            // be reachable without the top of it sliding under the clock.
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    head

                    if entry.amount != nil {
                        quantity.padding(.top, SL.Space.s5)
                        macros.padding(.top, 14)
                    } else {
                        // An entry the web app wrote kept no amount, so there
                        // is nothing to scale. Its own numbers stand, and the
                        // meal and the delete are still here.
                        macros.padding(.top, SL.Space.s5)
                        Text("This item was logged without an amount, so it can't be changed here.")
                            .slMeta()
                            .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                            .fixedSize(horizontal: false, vertical: true)
                            .foregroundStyle(SL.Ink.tertiary)
                            .padding(.top, SL.Space.s3)
                    }

                    eyebrow("MEAL")
                        .padding(.top, SL.Space.s6)
                        .padding(.bottom, SL.Space.s2)
                    MealSegment(selection: $meal)
                        .onChange(of: meal) { _, _ in touched = true }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, SL.Space.s4)
            }
            .scrollBounceBehavior(.basedOnSize)

            Button { onSave(edited) } label: { Text("Save") }
                .buttonStyle(SLPrimaryButtonStyle())
                .disabled(!touched || edited == entry)

            Button { onDelete(entry) } label: {
                Text("Delete")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, 10)
        .padding(.bottom, 34)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(SL.Surface.raised)
        // 42d opens 200 from the top of the frame, measured like 42c's.
        .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.fraction(0.84)])
        .presentationDragIndicator(.hidden)
        .presentationBackground(SL.Surface.raised)
        .slRespondsToTextSize()
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

    /// The food, and where it sits in the day. The hour is said only when the
    /// entry carries one; it is never derived from the meal it is filed under.
    private var head: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(entry.name)
                .font(.sl(28, SL.Weight.semibold))
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.primary)
                .accessibilityAddTraits(.isHeader)
            Text(standing)
                .slBody()
                .slNumerals()
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, SL.Space.s1)
        }
        .accessibilityElement(children: .combine)
    }

    private var standing: String {
        let heading = MealSection.title(of: Meal(rawValue: entry.meal) ?? .snack)
        guard let loggedAt = entry.loggedAt else { return heading }
        return "\(heading) · logged \(app.display.clock(loggedAt))"
    }

    // MARK: - How much of it

    /// 42d's stepper: the label says what one tap is worth, so the number never
    /// jumps by a surprise.
    private var quantity: some View {
        VStack(alignment: .leading, spacing: 0) {
            eyebrow("AMOUNT · PER \(stepLabel)")

            HStack(spacing: 0) {
                step("minus", by: -entry.step, label: "Less")
                Spacer(minLength: 0)
                Text(amountLabel)
                    .font(.sl(28, SL.Weight.semibold))
                    .slNumerals()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(SL.Ink.primary)
                Spacer(minLength: 0)
                step("plus", by: entry.step, label: "More")
            }
            .padding(.horizontal, 6)
            .frame(minHeight: 56)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                    .fill(SL.Surface.raised2)
            )
            .padding(.top, SL.Space.s2)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Amount, \(amountLabel)")
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: change(by: entry.step)
                case .decrement: change(by: -entry.step)
                @unknown default: break
                }
            }
        }
    }

    private var stepLabel: String {
        "\(app.display.number(Decimal(entry.step))) \(entry.unit ?? "")"
            .trimmingCharacters(in: .whitespaces)
            .uppercased()
    }

    private var amountLabel: String {
        "\(app.display.number(Decimal(amount))) \(entry.unit ?? "")"
            .trimmingCharacters(in: .whitespaces)
    }

    private func step(_ symbol: String, by delta: Double, label: String) -> some View {
        Button { change(by: delta) } label: {
            Image(systemName: symbol)
                .font(.sl(SL.TypeSize.title, SL.Weight.medium))
                .foregroundStyle(canChange(by: delta) ? SL.Ink.primary : SL.Ink.tertiary)
                .frame(minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!canChange(by: delta))
        .accessibilityLabel(label)
    }

    /// The step never takes the amount to nothing: an item that is not eaten is
    /// deleted, which is its own action below.
    private func canChange(by delta: Double) -> Bool { amount + delta >= entry.step }

    private func change(by delta: Double) {
        guard canChange(by: delta) else { return }
        amount = ((amount + delta) * 10).rounded() / 10
        touched = true
    }

    // MARK: - What that comes to

    /// The numbers the amount on screen is worth, so what `Bewaar` writes was
    /// already read before it was written.
    private var macros: some View {
        let shown = edited
        let columns: [(String, String)] = [
            ("kcal", app.display.whole(Decimal(shown.calories))),
            ("Protein", app.display.grams(Decimal(shown.protein))),
            ("Carbs", app.display.grams(Decimal(shown.carbs))),
            ("Fat", app.display.grams(Decimal(shown.fat))),
        ]
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s2))
            : AnyLayout(HStackLayout(alignment: .top, spacing: SL.Space.s3))

        return layout {
            ForEach(columns, id: \.0) { title, value in
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                        .foregroundStyle(SL.Ink.tertiary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(value)
                        .slBody(SL.Weight.semibold)
                        .slNumerals()
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .foregroundStyle(SL.Ink.primary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(title), \(value)")
            }
        }
    }

    private func eyebrow(_ text: String) -> some View {
        Text(text)
            .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
            .tracking(SL.TypeSize.micro * 0.06)
            .foregroundStyle(SL.Ink.tertiary)
    }
}
