import SwiftUI
import SetlineCore

/// Writing today's weight.
///
/// The handoff draws artboard 20 reading weigh-ins but never one being
/// entered, so this is assembled from the components it does define — sheet,
/// field, primary pill — and asks for the one number the account stores. A
/// day holds one weigh-in: opening this on a day already weighed shows that
/// number and replaces it, rather than adding a second row.
struct WeighInSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize

    /// The day being weighed, and the weigh-in it already holds.
    let date: Date
    let existing: BodyMetric?
    let onSave: (Decimal) -> Void
    let onClose: () -> Void

    @State private var text: String
    @FocusState private var focused: Bool

    init(
        date: Date,
        existing: BodyMetric?,
        latest: Decimal?,
        onSave: @escaping (Decimal) -> Void,
        onClose: @escaping () -> Void
    ) {
        self.date = date
        self.existing = existing
        self.onSave = onSave
        self.onClose = onClose
        // The day's own number where there is one, the last weigh-in as a
        // starting point where there is not, and an empty field otherwise —
        // this app never guesses a body weight.
        let opening = existing.map { Decimal($0.weight) } ?? latest
        _text = State(initialValue: opening.map(Self.text) ?? "")
    }

    private var weight: Decimal? {
        guard let value = NumberInput.decimal(text), value > 0 else { return nil }
        return value
    }

    /// A weight as the field shows it: one decimal, comma, as Dutch writes it.
    private static func text(_ value: Decimal) -> String {
        var input = value
        var rounded = Decimal()
        NSDecimalRound(&rounded, &input, 1, .plain)
        return "\(rounded)".replacingOccurrences(of: ".", with: ",")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            SLEyebrow(text: "Gewicht")
                .padding(.top, SL.Space.s5)

            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s2) {
                TextField("", text: $text, prompt: Text("0,0").foregroundStyle(SL.Ink.tertiary))
                    .keyboardType(.decimalPad)
                    .focused($focused)
                    .onChange(of: text) { _, new in
                        let filtered = NumberInput.numericOnly(new)
                        if filtered != new { text = filtered }
                    }
                    .font(.sl(SL.TypeSize.displayL, SL.Weight.semibold))
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                    .tint(SL.Signal.action)
                    .accessibilityLabel("Gewicht in kilogram")
                Text("kg").slLead().foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.top, 6)

            SLHairline().padding(.top, SL.Space.s3)

            Text(footnote)
                .slMeta()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.tertiary)
                .padding(.top, SL.Space.s3)

            Spacer(minLength: SL.Space.s5)

            Button { if let weight { onSave(weight) } } label: {
                Text(existing == nil ? "Bewaar weging" : "Weging bijwerken")
            }
            .buttonStyle(SLPrimaryButtonStyle())
            .disabled(weight == nil)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s4)
        .padding(.bottom, SL.Space.sessionBlockBottom)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SL.Surface.raised)
        .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.height(320)])
        .presentationBackground(SL.Surface.raised)
        .slRespondsToTextSize()
        .onAppear { focused = true }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(existing == nil ? "Weeg jezelf" : "Weging wijzigen")
                .slTitle()
                .foregroundStyle(SL.Ink.primary)
            Spacer(minLength: SL.Space.s3)
            Button(action: onClose) {
                Text("Sluiten")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .slHitTarget()
            }
            .buttonStyle(.plain)
        }
    }

    /// Says which day is being written, and what happens to the day's number
    /// when it already has one.
    private var footnote: String {
        let day = "\(WeekPlan.fullWeekday(date)) \(app.display.shortDate(date))"
        return existing == nil
            ? "Wordt bewaard op \(day). Eén weging per dag."
            : "Vervangt je weging van \(day). Eerdere wegingen blijven staan."
    }
}
