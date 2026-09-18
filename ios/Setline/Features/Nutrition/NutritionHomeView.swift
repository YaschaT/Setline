import SwiftUI
import SetlineCore

/// Artboard 21 · Voeding.
///
/// The leading element is what is left to eat today; everything under it
/// reports, and only protein is coloured, because protein is the one macro
/// this reader steers.
struct NutritionHomeView: View {
    @Environment(AppState.self) private var app

    @State private var adding = false
    @State private var removing: NutritionEntry?
    @Environment(\.dynamicTypeSize) private var typeSize

    private var day: NutritionDay { app.nutrition() }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    remainder
                    macros.padding(.top, SL.Space.s6)
                    logged.padding(.top, SL.Space.s8)
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s6)
                .padding(.bottom, SL.Space.s6)
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button { adding = true } label: { Text("Voeding toevoegen") }
                .buttonStyle(SLPrimaryButtonStyle())
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.bottom, SL.Space.s3)
        }
        .sheet(isPresented: $adding) {
            AddFoodSheet(date: Date()) { entry in
                adding = false
                Task { await app.log(food: entry) }
            } onClose: {
                adding = false
            }
        }
        .confirmationDialog(
            "Verwijderen?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible
        ) {
            Button("Verwijder", role: .destructive) {
                if let entry = removing { Task { await app.removeFood(id: entry.id) } }
                removing = nil
            }
            Button("Annuleer", role: .cancel) { removing = nil }
        } message: {
            Text(removing.map { "\($0.name) · \(app.display.kcal(Decimal($0.calories)))" } ?? "")
        }
        .slRespondsToTextSize()
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Voeding").slTitle().foregroundStyle(SL.Ink.primary)
            Spacer()
            Text(dateLabel).slMeta().foregroundStyle(SL.Ink.tertiary)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s4)
    }

    private var dateLabel: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nl_BE")
        formatter.dateFormat = "EEEE d MMM"
        let text = formatter.string(from: Date()).replacingOccurrences(of: ".", with: "")
        return text.prefix(1).uppercased() + text.dropFirst()
    }

    // MARK: - What is left

    /// At accessibility sizes the ring goes and the number gets the whole row,
    /// the same choice the stepper makes: the figure this screen exists to
    /// show is never squeezed to keep an ornament that says the same thing as
    /// the line underneath it.
    private var remainder: some View {
        HStack(spacing: SL.Space.s5) {
            if !typeSize.isAccessibilitySize {
                NutritionRing(fraction: day.consumed)
                    .frame(width: 104, height: 104)
                    .accessibilityHidden(true)
            }

            VStack(alignment: .leading, spacing: 0) {
                SLEyebrow(text: day.hasTarget ? "NOG TE ETEN" : "VANDAAG GEGETEN")
                Text(app.display.kcal(Decimal(day.hasTarget ? day.remaining : day.calories)))
                    .font(.sl(SL.TypeSize.displayXL, SL.Weight.semibold))
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                    .lineSpacing(SL.TypeSize.displayXL * 0.04)
                    .padding(.top, SL.Space.s1)
                Text(subline)
                    .slBody().slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.top, 6)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var subline: String {
        guard day.hasTarget, let target = day.targets?.calories else {
            return "Geen dagdoel ingesteld."
        }
        return "\(app.display.whole(Decimal(day.calories))) van \(app.display.kcal(Decimal(target)))"
    }

    // MARK: - Macros

    private var macros: some View {
        VStack(spacing: 14) {
            ForEach(day.macros, id: \.self) { macro in
                VStack(spacing: 6) {
                    HStack {
                        Text(macro.label).slMeta().foregroundStyle(SL.Ink.secondary)
                        Spacer()
                        Text(macroValue(macro)).slMeta().slNumerals().foregroundStyle(SL.Ink.primary)
                    }
                    MacroBar(fraction: day.fraction(of: macro), led: macro.isLed)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(macro.label), \(macroValue(macro))")
            }
        }
    }

    private func macroValue(_ macro: Macro) -> String {
        let total = app.display.whole(Decimal(day.total(of: macro).rounded()))
        guard day.target(for: macro) > 0 else { return "\(total) g" }
        return "\(total) / \(app.display.grams(Decimal(day.target(for: macro))))"
    }

    // MARK: - What was logged

    private var logged: some View {
        VStack(alignment: .leading, spacing: 0) {
            SLHairline()
            SLEyebrow(text: "VANDAAG GELOGD")
                .padding(.top, SL.Space.s4)
                .padding(.bottom, SL.Space.s3)

            if day.entries.isEmpty {
                Text("Nog niets gelogd vandaag.")
                    .slBody()
                    .foregroundStyle(SL.Ink.tertiary)
            } else {
                VStack(spacing: SL.Space.s2) {
                    ForEach(day.entries) { entry in
                        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                            Text(entry.name)
                                .slBody()
                                .foregroundStyle(SL.Ink.primary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Text(app.display.kcal(Decimal(entry.calories)))
                                .slBody().slNumerals()
                                .foregroundStyle(SL.Ink.secondary)
                        }
                        .contentShape(Rectangle())
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("\(entry.meal), \(entry.name), \(app.display.kcal(Decimal(entry.calories)))")
                        .accessibilityActions {
                            Button("Verwijderen") { removing = entry }
                        }
                        // Compact rows, as drawn. Removing one is a long press,
                        // the same secondary gesture the design puts on an
                        // exercise title, and a rotor action for VoiceOver.
                        .onLongPressGesture { removing = entry }
                    }
                }
            }
        }
    }
}

/// The ring beside the number, never around it — 8pt of stroke on a 104pt
/// circle, no glow and no gradient.
private struct NutritionRing: View {
    let fraction: Double

    var body: some View {
        ZStack {
            Circle()
                .strokeBorder(SL.Surface.hairline, lineWidth: 8)
            Circle()
                .inset(by: 4)
                .trim(from: 0, to: max(0.001, fraction))
                .stroke(SL.Ink.secondary, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .opacity(fraction > 0 ? 1 : 0)
        }
    }
}

private struct MacroBar: View {
    let fraction: Double
    let led: Bool

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(SL.Surface.hairline)
                Capsule()
                    .fill(led ? SL.Signal.action : SL.Ink.secondary)
                    .frame(width: max(0, proxy.size.width * fraction))
            }
        }
        .frame(height: 6)
    }
}
