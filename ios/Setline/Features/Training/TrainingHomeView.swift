import SwiftUI
import SetlineCore

/// Artboards 08 (first run) and 09 (mid-block).
///
/// The squint test governs the composition: the session name is the only
/// loud element, so the progression card below it stays tonally Raised —
/// the review pushed it back for exactly that reason.
struct TrainingHomeView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize
    let onStart: (WorkoutDay) -> Void
    let onResume: (WorkoutDay, ActiveSessionSnapshot) -> Void

    @State private var confirmsEnd = false
    @State private var planningWeek = false

    private var isFirstRun: Bool { app.sessions.isEmpty }

    var body: some View {
        Group {
            if isOffline { offlineBody } else { onlineBody }
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

    private var onlineBody: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
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
                    // 08 sets the labelled strip 24 below the card; 09's
                    // groups sit 32 apart.
                    weekStrip.padding(.top, isFirstRun ? SL.Space.s6 : SL.Space.s8)
                    if let insight { insightCard(insight).padding(.top, SL.Space.s8) }
                    // 08 has nothing to change yet; the plan row arrives with
                    // the first session.
                    if !isFirstRun { planFooter.padding(.top, SL.Space.s8) }
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
    }

    /// 09: padding 16/20/0, title 21/600, week label 13 `text3`.
    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Training").slTitle().foregroundStyle(SL.Ink.primary)
            Spacer()
            Text(weekLabel).slMeta().foregroundStyle(SL.Ink.tertiary)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s4)
    }

    private var isOffline: Bool { app.sync == .offline }

    // MARK: - Artboard 24 · offline

    /// Sync failure is a state of the data, not a red box: the header becomes
    /// a card saying so, the loud element is the reassurance, today's session
    /// is still one tap away, and what waits is listed as what it is.
    private var offlineBody: some View {
        VStack(spacing: 0) {
            offlineBanner
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s3)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    SLEyebrow(text: "TRAINING")
                    Text("Niets verloren.")
                        .font(.sl(SL.TypeSize.displayXL, SL.Weight.semibold))
                        .lineSpacing(SL.TypeSize.displayXL * 0.04)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.primary)
                        .padding(.top, SL.Space.s2)
                    Text(offlineReassurance)
                        .slBody()
                        .lineSpacing(SL.TypeSize.body * 0.5)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(maxWidth: 320, alignment: .leading)
                        .padding(.top, 10)

                    compactToday.padding(.top, SL.Space.s5)

                    if !queue.isEmpty {
                        SLEyebrow(text: "IN DE WACHTRIJ").padding(.top, SL.Space.s6)
                        VStack(spacing: 0) {
                            ForEach(Array(queue.enumerated()), id: \.offset) { _, row in
                                queueRow(row)
                            }
                        }
                    }

                    Text("SETLINE schrijft eerst lokaal en synct daarna. Exporteren werkt ook offline.")
                        .slMeta()
                        .lineSpacing(SL.TypeSize.meta * 0.5)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.tertiary)
                        .padding(.top, SL.Space.s5)
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s5)
                .padding(.bottom, SL.Space.s6)
            }
        }
        .safeAreaInset(edge: .bottom) {
            // Artboard 24 keeps lime off this screen: retrying is the action,
            // and it is a secondary one.
            Button { Task { await app.syncNow() } } label: {
                Text(app.sync == .syncing ? "Bezig met syncen…" : "Nu opnieuw proberen")
            }
            .buttonStyle(SLOutlineButtonStyle())
            .disabled(app.sync == .syncing)
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.bottom, SL.Space.s3)
            .frame(maxWidth: .infinity)
            .background(SL.Surface.ground)
        }
    }

    private var offlineBanner: some View {
        HStack(spacing: SL.Space.s3) {
            Circle().fill(SL.Signal.attention).frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text("Offline · alles wordt lokaal bewaard")
                    .slBody(SL.Weight.medium)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.primary)
                if let waiting {
                    Text(waiting).slMeta().slNumerals().foregroundStyle(SL.Ink.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, SL.Space.s3)
        .padding(.horizontal, 14)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .fill(SL.Surface.raised2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(SL.Signal.attention.opacity(0.4), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }

    /// Today, still one tap from starting: being offline never stops a
    /// session, because logging is local.
    @ViewBuilder
    private var compactToday: some View {
        let paused = app.resumableSession
        let day = paused.flatMap { app.day(for: $0) } ?? app.todayDay
        Button {
            if let paused, let resumed = app.day(for: paused) {
                onResume(resumed, paused)
            } else if let day {
                onStart(day)
            }
        } label: {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: SL.Space.s1) {
                    SLEyebrow(text: "Vandaag · \(longDateLabel)")
                    Text(day?.short ?? "Rustdag").slTitle().foregroundStyle(SL.Ink.primary)
                }
                Spacer(minLength: SL.Space.s3)
                if let day {
                    Text("\(WeekPlan.sets(of: day)) sets").slMeta().slNumerals().foregroundStyle(SL.Ink.secondary)
                }
            }
            .padding(.vertical, SL.Space.s4)
            .padding(.horizontal, SL.Space.s5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .slCard()
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(day == nil)
        .accessibilityHint(paused != nil ? "Dubbeltik om je sessie te hervatten" : "Dubbeltik om te beginnen")
    }

    private func queueRow(_ row: SyncQueue.Row) -> some View {
        HStack(alignment: .center, spacing: SL.Space.s3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title).slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                Text(row.detail).slMeta().slNumerals().foregroundStyle(SL.Ink.tertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("Wacht").slMeta().foregroundStyle(SL.Signal.attention)
        }
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) { SLHairline() }
        .accessibilityElement(children: .combine)
    }

    private var queue: [SyncQueue.Row] {
        SyncQueue.rows(from: app.pendingChanges, display: app.display)
    }

    private var offlineReassurance: String {
        queue.isEmpty
            ? "Alles staat op dit toestel. Loggen werkt offline; syncen gebeurt zodra er verbinding is."
            : "Wat hieronder wacht, staat op dit toestel. Loggen werkt offline; syncen gebeurt zodra er verbinding is."
    }

    /// What is still on this device only, counted rather than estimated.
    private var waiting: String? {
        let count = queue.count
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
        if isFirstRun, let day = app.todayDay {
            firstRunCard(day)
        } else {
            sessionCard
        }
    }

    /// Artboard 08: no data yet, so nothing to compare against — a 34pt name,
    /// one count line, the quiet hairline, and what the first session does.
    private func firstRunCard(_ day: WorkoutDay) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SLEyebrow(text: "Vandaag · \(weekdayLabel)")
            Text(day.short)
                .slDisplay()
                .lineSpacing(SL.TypeSize.display * (SL.LineHeight.display - 1))
                .foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s2)
                .padding(.bottom, SL.Space.s1)
            Text(firstRunCounts(day))
                .slBody().slNumerals()
                .foregroundStyle(SL.Ink.secondary)
            SLHairline().padding(.vertical, SL.Space.s5)
            Text("Nog geen sessies gelogd. Je eerste sessie zet de startgewichten; daarna rekent SETLINE de progressie zelf.")
                .slBody()
                .lineSpacing(SL.TypeSize.body * (SL.LineHeight.body - 1))
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .frame(maxWidth: typeSize.isAccessibilitySize ? .infinity : 270, alignment: .leading)

            if let paused = app.resumableSession { pausedRow(paused) }
        }
        .padding(SL.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slCard()
    }

    /// "5 oefeningen · 18 sets · ±52 min".
    private func firstRunCounts(_ day: WorkoutDay) -> String {
        let exercises = day.exercises.count == 1 ? "1 oefening" : "\(day.exercises.count) oefeningen"
        return "\(exercises) · \(WeekPlan.sets(of: day)) sets · ±\(WeekPlan.minutes(of: day)) min"
    }

    private var sessionCard: some View {
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

    /// 08's eyebrow names the day only: "VANDAAG · MAANDAG".
    private var weekdayLabel: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nl_BE")
        formatter.dateFormat = "EEEE"
        return formatter.string(from: Date())
    }

    private var longDateLabel: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nl_BE")
        formatter.dateFormat = "EEEE d MMM"
        return formatter.string(from: Date()).replacingOccurrences(of: ".", with: "")
    }

    /// 08 labels the strip and uses 72-high tiles 6 apart; 09 drops the
    /// label and tightens to 64, 5 apart.
    private var weekStrip: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            if isFirstRun { SLEyebrow(text: "Deze week") }
            HStack(spacing: isFirstRun ? 6 : 5) {
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

        // 08 marks today by its tile alone — the letter stays `text2` and the
        // edge .16 — where 09 also lifts the letter and takes the .28 edge.
        let marksLetter = isToday && !isFirstRun
        return VStack(spacing: isFirstRun ? 6 : 4) {
            Text(Schedule.weekdayLabel(date))
                .font(.system(
                    size: SL.TypeSize.micro,
                    weight: marksLetter ? SL.Weight.semibold : SL.Weight.regular
                ))
                .foregroundStyle(marksLetter ? SL.Ink.primary : (isRest ? SL.Ink.tertiary : SL.Ink.secondary))
            Text("\(day)")
                .font(.system(
                    size: SL.TypeSize.lead,
                    weight: isToday ? SL.Weight.semibold : (isRest && !isFirstRun ? SL.Weight.regular : SL.Weight.medium)
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
                    isToday ? (isFirstRun ? SL.Surface.hairlineStrong : SL.Surface.selection) : SL.Surface.hairline,
                    style: StrokeStyle(lineWidth: 1, dash: isRest ? [4, 4] : [])
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(Schedule.weekdayLabel(date)) \(day), \(isRest ? "rustdag" : canonical)")
    }

    /// The one lime accent on this screen: a value that beats the user's own
    /// previous data, then today's plan for the same exercise — artboard 09's
    /// "Bankdrukken staat +5 kg sinds 26 aug. Vandaag 50 kg × 8."
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
            var text = "\(name) staat \(delta) sinds \(app.display.shortDate(since))."
            if let today = SessionRunner.openingTarget(for: planned, app: app) {
                text += " Vandaag \(app.display.kg(today.weightKg)) × \(ProgressionEngine.repsLabel(today.reps))."
            }
            return (text, delta)
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
