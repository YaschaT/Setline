import SwiftUI
import SetlineCore

/// Artboards 08 (first run) and 09 (mid-block).
///
/// The squint test governs the composition: the session name is the only
/// loud element, so the progression card below it stays tonally Raised —
/// the review pushed it back for exactly that reason.
struct TrainingHomeView: View {
    @Environment(AppState.self) private var app
    let onStart: (WorkoutDay) -> Void
    let onResume: (WorkoutDay, ActiveSessionSnapshot) -> Void

    @State private var confirmsEnd = false
    @State private var planningWeek = false

    private var isFirstRun: Bool { app.sessions.isEmpty }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if isOffline { reassurance.padding(.bottom, SL.Space.s5) }
                    if app.proposesDeload {
                        DeloadCard(
                            reading: app.fatigue,
                            proposal: Deload(startedAt: Date()),
                            onApply: { Task { await app.applyDeload() } },
                            onDismiss: { withAnimation(.easeOut(duration: SL.Motion.base)) { app.dismissDeload() } }
                        )
                        .padding(.bottom, SL.Space.s5)
                    }
                    todayCard
                        // 18R: with a proposal on screen the session card steps
                        // back, so the proposal is the one loud thing.
                        .opacity(app.proposesDeload ? 0.6 : 1)
                    weekStrip.padding(.top, SL.Space.s8)
                    if let insight { insightCard(insight).padding(.top, SL.Space.s8) }
                    planFooter.padding(.top, SL.Space.s8)
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s5)
                .padding(.bottom, SL.Space.s6)
            }
        }
        .safeAreaInset(edge: .bottom) {
            Group {
                if let paused = app.resumableSession, let day = app.day(for: paused) {
                    Button { onResume(day, paused) } label: { Text(resumeLabel(paused)) }
                        .buttonStyle(SLPrimaryButtonStyle())
                } else if let day = app.todayDay {
                    Button { onStart(day) } label: { Text("Start \(day.short)") }
                        .buttonStyle(SLPrimaryButtonStyle())
                }
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.bottom, SL.Space.s3)
            .frame(maxWidth: .infinity)
            .background(SL.Surface.ground)
        }
        .fullScreenCover(isPresented: $planningWeek) {
            WeekPlanView(onClose: { planningWeek = false })
        }
        .alert("Sessie beëindigen?", isPresented: $confirmsEnd) {
            Button("Annuleer", role: .cancel) {}
            Button("Beëindigen") { Task { await app.endActiveSession() } }
        } message: {
            Text(endMessage)
        }
        .slRespondsToTextSize()
    }

    /// 09: padding 16/20/0, title 21/600, week label 13 `text3`.
    ///
    /// 24 replaces it when there is no connection: sync failure is a state of
    /// the data, so it is stated in the header's own voice — no colour, no
    /// alert, and the session below carries on exactly as it was.
    @ViewBuilder
    private var header: some View {
        if isOffline {
            VStack(alignment: .leading, spacing: 2) {
                Text("Offline · alles wordt lokaal bewaard")
                    .slTitle()
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.primary)
                if let waiting {
                    Text(waiting).slMeta().slNumerals().foregroundStyle(SL.Ink.tertiary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s4)
            .accessibilityElement(children: .combine)
        } else {
            HStack(alignment: .firstTextBaseline) {
                Text("Training").slTitle().foregroundStyle(SL.Ink.primary)
                Spacer()
                Text(weekLabel).slMeta().foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s4)
        }
    }

    private var isOffline: Bool { app.sync == .offline }

    /// What is still on this device only, counted rather than estimated.
    private var waiting: String? {
        let count = app.pendingChanges.count
        guard count > 0 else { return nil }
        return count == 1 ? "1 wijziging wacht op sync" : "\(count) wijzigingen wachten op sync"
    }

    private var weekLabel: String {
        "Week \(WeekPlan.number(firstSession: app.sessions.last?.date))"
    }

    /// Radius 22, `raised` fill with the stronger hairline — 09 is louder
    /// than 08 by its border, not by a raised fill.
    @ViewBuilder
    private var todayCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                SLEyebrow(text: "Vandaag · \(longDateLabel)")
                Spacer()
                if let day = app.todayDay {
                    Text("±\(WeekPlan.minutes(of: day)) min")
                        .slMeta().slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
            }

            if let day = app.todayDay {
                HStack(alignment: .center, spacing: SL.Space.s3) {
                    Text(day.short)
                        .font(.sl(SL.TypeSize.displayXL, SL.Weight.semibold))
                        .foregroundStyle(SL.Ink.primary)
                        .lineSpacing(SL.TypeSize.displayXL * 0.04)
                    Spacer(minLength: 0)
                    Button { onStart(day) } label: {
                        Text("Bekijk")
                            .slMeta(SL.Weight.semibold)
                            .foregroundStyle(SL.Ink.secondary)
                            .slHitTarget()
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, SL.Space.s2)
                .padding(.bottom, 6)

                Text(day.exercises.map { app.exercise($0.exerciseID).name }.joined(separator: " · "))
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .lineLimit(2)

                if let meta = app.todayMetaLine() {
                    Text(meta)
                        .slBody().slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.top, SL.Space.s3)
                }


                if isFirstRun {
                    SLHairline().padding(.vertical, SL.Space.s5)
                    Text("Nog geen sessies gelogd. Je eerste sessie zet de startgewichten; na drie vergelijkbare sessies per oefening komen de voorstellen en records.")
                        .slBody()
                        .lineSpacing(SL.TypeSize.body * (SL.LineHeight.body - 1))
                        .foregroundStyle(SL.Ink.secondary)
                }
            } else {
                Text("Rustdag")
                    .font(.sl(SL.TypeSize.displayXL, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
                    .padding(.top, SL.Space.s2)
                    .padding(.bottom, 6)
                Text("Geen sessie gepland vandaag.")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
            }

            if let paused = app.resumableSession { pausedRow(paused) }
        }
        .padding(SL.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slCardStrong()
    }

    /// A paused workout stays here until it is resumed or ended — never
    /// hidden because the date rolled over.
    private func pausedRow(_ paused: ActiveSessionSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SLHairline().padding(.vertical, SL.Space.s4)
            HStack(alignment: .firstTextBaseline) {
                SLEyebrow(text: "Bezig · \(paused.dayLabel) \(app.pausedWhenLabel(for: paused))")
                Spacer(minLength: SL.Space.s3)
                Button { confirmsEnd = true } label: {
                    Text("Beëindig")
                        .slMeta()
                        .foregroundStyle(SL.Ink.tertiary)
                        .slHitTarget()
                }
                .buttonStyle(.plain)
            }
            Text("\(paused.loggedSetCount) van \(paused.plannedSetCount) sets gelogd")
                .slBody().slNumerals()
                .foregroundStyle(SL.Ink.primary)
        }
    }

    private var longDateLabel: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nl_BE")
        formatter.dateFormat = "EEEE d MMM"
        return formatter.string(from: Date()).replacingOccurrences(of: ".", with: "")
    }

    /// 08 labels the strip and uses 72-high tiles; 09 drops the label and
    /// tightens to 64.
    private var weekStrip: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            if isFirstRun { SLEyebrow(text: "Deze week") }
            HStack(spacing: 5) {
                ForEach(Schedule.mondayFirstWeek(containing: Date()), id: \.self) { date in
                    dayTile(date)
                }
            }
        }
    }

    private func dayTile(_ date: Date) -> some View {
        let canonical = Schedule.canonicalDay(for: date, overrides: app.scheduleOverrides)
        let isToday = Calendar.current.isDateInToday(date)
        let isRest = canonical == "rest"
        let day = Calendar.current.component(.day, from: date)

        return VStack(spacing: 4) {
            Text(Schedule.weekdayLabel(date))
                .font(.system(
                    size: SL.TypeSize.micro,
                    weight: isToday ? SL.Weight.semibold : SL.Weight.regular
                ))
                .foregroundStyle(isToday ? SL.Ink.primary : (isRest ? SL.Ink.tertiary : SL.Ink.secondary))
            Text("\(day)")
                .font(.system(
                    size: SL.TypeSize.lead,
                    weight: isToday ? SL.Weight.semibold : (isRest ? SL.Weight.regular : SL.Weight.medium)
                ))
                .slNumerals()
                .foregroundStyle(isToday ? SL.Ink.primary : (isRest ? SL.Ink.tertiary : SL.Ink.primary))
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: isFirstRun ? 72 : SL.Metric.dayTileHeight)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .fill(isToday ? SL.Surface.raised2 : (isRest ? Color.clear : SL.Surface.raised))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(
                    isToday ? SL.Surface.selection : SL.Surface.hairline,
                    style: StrokeStyle(lineWidth: 1, dash: isRest ? [4, 4] : [])
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(Schedule.weekdayLabel(date)) \(day), \(isRest ? "rustdag" : canonical)")
    }

    /// The one lime accent on this screen: a value that beats the user's own
    /// previous data.
    private var insight: (text: String, highlight: String)? {
        guard let day = app.todayDay else { return nil }
        for planned in day.exercises {
            let history = app.history(for: planned)
            guard history.hasReference,
                  let latest = history.mostRecent?.sets.compactMap(\.weightKg).max(),
                  let oldest = history.appearances.last?.sets.compactMap(\.weightKg).max(),
                  latest > oldest,
                  let since = history.appearances.last?.date
            else { continue }
            let name = app.exercise(planned.exerciseID).name
            let delta = "\(app.display.signedDelta(latest - oldest)) kg"
            return ("\(name) staat \(delta) sinds \(app.display.shortDate(since)).", delta)
        }
        return nil
    }

    private func insightCard(_ insight: (text: String, highlight: String)) -> some View {
        Text(attributed(insight.text, liming: insight.highlight))
            .slLead(SL.Weight.medium)
            .lineSpacing(SL.TypeSize.lead * 0.4)
            .padding(SL.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .slCard(radius: SL.Radius.lg)
    }

    private func attributed(_ text: String, liming fragment: String) -> AttributedString {
        var string = AttributedString(text)
        string.foregroundColor = SL.Ink.primary
        if let range = string.range(of: fragment) {
            string[range].foregroundColor = SL.Signal.action
        }
        return string
    }

    /// 24: the point of the screen is that nothing is at risk, said once.
    private var reassurance: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text("Niets verloren.").slLead().foregroundStyle(SL.Ink.primary)
            Text("Alles wat je logt staat op dit toestel. Loggen werkt offline; syncen gebeurt zodra er verbinding is.")
                .slBody()
                .lineSpacing(SL.TypeSize.body * 0.5)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slCard(radius: SL.Radius.lg)
        .accessibilityElement(children: .combine)
    }

    /// The way into the week (artboard 19): the plan row is the control.
    private var planFooter: some View {
        VStack(spacing: 0) {
            SLHairline()
            Button { planningWeek = true } label: {
                HStack {
                    Text("Plan · \(planName)").slBody().foregroundStyle(SL.Ink.secondary)
                    Spacer()
                    Text("Wijzig")
                        .slBody()
                        .foregroundStyle(SL.Ink.tertiary)
                        .slHitTarget()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Plan · \(planName)")
            .accessibilityHint("Dubbeltik om de week te wijzigen")
            .padding(.top, SL.Space.s4)
        }
    }

    private func resumeLabel(_ paused: ActiveSessionSnapshot) -> String {
        let when = app.pausedWhenLabel(for: paused)
        return when == "vandaag" ? "Hervat sessie" : "Hervat sessie \(when)"
    }

    private var endMessage: String {
        guard let paused = app.resumableSession else { return "" }
        return paused.hasProgress
            ? "De \(paused.loggedSetCount) sets die je logde worden bewaard. De rest telt als niet getraind."
            : "Je logde nog niets, dus er wordt niets bewaard."
    }

    private var planName: String {
        app.plan.count == 5 ? "Push / Pull / Benen" : "\(app.plan.count) dagen"
    }
}
