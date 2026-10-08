import SwiftUI
import SetlineCore

/// The day's targets, which both apps may write.
///
/// Each field is its own change, so setting a protein target here does not
/// reach across and rewrite a calorie target the web app set a minute ago.
struct TargetsSheet: View {
    let targets: NutritionTargets?
    let onSave: ([StateChange]) -> Void
    let onClose: () -> Void

    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""
    @FocusState private var focused: Macro?

    private enum Macro: Hashable { case calories, protein, carbs, fat }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("Daily targets").slTitle().foregroundStyle(SL.Ink.primary)
                Spacer()
                Button { onClose() } label: {
                    Text("Close")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .slHitTarget()
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s5)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Nutrition uses these. The web app reads the same targets.")
                        .slMeta()
                        .foregroundStyle(SL.Ink.tertiary)
                        .padding(.bottom, SL.Space.s4)

                    VStack(spacing: 0) {
                        field("Calories", text: $calories, macro: .calories, unit: "kcal")
                        SLHairline().padding(.horizontal, 14)
                        field("Protein", text: $protein, macro: .protein, unit: "g")
                        SLHairline().padding(.horizontal, 14)
                        field("Carbs", text: $carbs, macro: .carbs, unit: "g")
                        SLHairline().padding(.horizontal, 14)
                        field("Fat", text: $fat, macro: .fat, unit: "g")
                    }
                    .padding(6)
                    .slBorderBox()
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                            .fill(SL.Surface.ground)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                            .strokeBorder(SL.Surface.hairline, lineWidth: 1)
                    )

                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s5)
                // Clears the commit pill at the half-height detent.
                .padding(.bottom, SL.Space.s12)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(SL.Surface.raised.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            Button { save() } label: { Text("Save") }
                .buttonStyle(SLPrimaryButtonStyle())
                .disabled(changes.isEmpty)
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.bottom, SL.Space.s3)
                .frame(maxWidth: .infinity)
                .background(SL.Surface.raised)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task {
            guard let targets else { return }
            calories = text(targets.calories)
            protein = text(targets.protein)
            carbs = text(targets.carbs)
            fat = text(targets.fat)
        }
        .slRespondsToTextSize()
    }

    private func text(_ value: Int) -> String { value > 0 ? "\(value)" : "" }

    private func field(_ label: String, text: Binding<String>, macro: Macro, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            SLEyebrow(text: label.uppercased(), size: SL.TypeSize.micro)
            HStack(spacing: SL.Space.s2) {
                TextField("", text: text)
                    .keyboardType(.numberPad)
                    .font(.sl(SL.TypeSize.lead, SL.Weight.medium))
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                    .tint(SL.Signal.action)
                    .onChange(of: text.wrappedValue) { _, new in
                        let filtered = String(new.filter(\.isNumber).prefix(5))
                        if filtered != new { text.wrappedValue = filtered }
                    }
                Text(unit).slBody().foregroundStyle(SL.Ink.tertiary)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(minHeight: 60)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(focused == macro ? SL.Surface.raised2 : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(focused == macro ? SL.Signal.action : .clear, lineWidth: 1)
        )
        .focused($focused, equals: macro)
        .contentShape(Rectangle())
        .onTapGesture { focused = macro }
    }

    /// One change per field that actually moved.
    private var changes: [StateChange] {
        let now = Date()
        return [
            ("calories", calories, targets?.calories),
            ("protein", protein, targets?.protein),
            ("carbs", carbs, targets?.carbs),
            ("fat", fat, targets?.fat),
        ].compactMap { field, typed, stored in
            guard let value = Int(typed), value != (stored ?? 0) else { return nil }
            return StateChange(.setTarget(field: field, value: Decimal(value)), createdAt: now)
        }
    }

    private func save() {
        let changes = self.changes
        guard !changes.isEmpty else { return onClose() }
        onSave(changes)
    }
}
