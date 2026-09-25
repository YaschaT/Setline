import SwiftUI
import SetlineCore

/// Artboards 41b–41d · Training.
///
/// One screen, one selected date. The drawer at the top carries the date, the
/// week and the way into the agenda; below it the date's own slots — its name
/// at 56, one line about it, what it is made of, and the foot that acts on it.
/// The slots keep their places whatever the date holds, so selecting another
/// day changes the words and never the composition.
///
/// Training is what happens on the selected date. The agenda (the drawer,
/// pulled open) browses dates. "Wijzig deze dag" changes what a date holds,
/// and is the only thing here that writes.
struct TrainingHomeView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize
    let onStart: (WorkoutDay) -> Void
    let onResume: (WorkoutDay, ActiveSessionSnapshot) -> Void
    /// A workout that was done on a date that has passed and never written
    /// down. Same session screen, that date on the result.
    let onLogPast: (WorkoutDay, Date) -> Void

    @State private var confirmsEnd = false
    /// The date the screen is on. `nil` is today, which is where every visit
    /// starts and where `Terug naar vandaag` returns.
    @State private var selectedDate: Date?
    @State private var preview: AgendaDay?
    @State private var openedSession: OpenedSession?
    /// The drawer, and the month it shows while it is open (41d).
    @State private var drawerOpen = false
    @State private var drawerAnchor = Date()
    /// The date whose assignment sheet is open (41e–41g).
    @State private var planning: PlannedDate?

    private struct OpenedSession: Identifiable { let id: String }
    private struct PlannedDate: Identifiable { let date: Date; var id: String { Schedule.dateKey(date) } }

    private var isFirstRun: Bool { app.sessions.isEmpty }

    /// The week the rail shows: the one the selected date falls in, so
    /// picking a date in the agenda brings its week back with it.
    private var week: [AgendaDay] {
        Agenda.week(
            containing: selectedDate ?? Date(),
            plan: app.plan,
            overrides: app.scheduleOverrides,
            sessions: app.sessions,
            deload: app.activeDeload
        )
    }

    /// Today, wherever the screen happens to be standing.
    private var today: AgendaDay? {
        Agenda.day(
            on: Date(),
            plan: app.plan,
            overrides: app.scheduleOverrides,
            sessions: app.sessions,
            deload: app.activeDeload
        )
    }

    private var selectedDay: AgendaDay? {
        let key = Schedule.dateKey(selectedDate ?? Date())
        return week.first { $0.key == key } ?? today
    }

    private var showsToday: Bool { selectedDay.map(\.isToday) ?? true }

    var body: some View {
        Group {
            if isOffline { offlineBody } else { onlineBody }
        }
        .fullScreenCover(item: $preview) { day in
            if let workout = day.plannedDay {
                WorkoutPreviewView(
                    day: day,
                    workout: workout,
                    onClose: { preview = nil },
                    onPlanWeek: { preview = nil; planning = PlannedDate(date: day.date) },
                    onOpenAgenda: nil
                )
            }
        }
        .fullScreenCover(item: $openedSession) { opened in
            SessionDetailView(sessionID: opened.id, onClose: { openedSession = nil })
        }
        .sheet(item: $planning) { target in
            DayPlanSheet(
                plan: dayPlan(for: target.date),
                onApply: { option in
                    let plan = dayPlan(for: target.date)
                    planning = nil
                    guard let change = plan.change(for: option, programKey: app.programKey) else { return }
                    Task { await app.record([change]) }
                },
                onOpenSession: { session in
                    planning = nil
                    openedSession = OpenedSession(id: session.id)
                },
                onClose: { planning = nil }
            )
        }
        .alert("Sessie beëindigen?", isPresented: $confirmsEnd) {
            Button("Annuleer", role: .cancel) {}
            Button("Beëindigen") { Task { await app.endActiveSession() } }
        } message: {
            Text(endMessage)
        }
        .slRespondsToTextSize()
    }

    /// One date, read the way the rail and the agenda read it.
    private func dayPlan(for date: Date) -> DayPlan {
        DayPlan.make(
            for: date,
            plan: app.plan,
            overrides: app.scheduleOverrides,
            sessions: app.sessions,
            deload: app.activeDeload
        )
    }

    private var onlineBody: some View {
        VStack(spacing: 0) {
            // 18R's proposal is answered before anything else; it draws no week.
            if !app.proposesDeload {
                TrainingDrawer(
                    week: week,
                    weeks: drawerWeeks,
                    selected: selectedDay,
                    isOpen: $drawerOpen,
                    anchor: $drawerAnchor,
                    onSelect: select,
                    onPlan: { planning = PlannedDate(date: $0.date) }
                )
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if app.proposesDeload {
                        DeloadCard(
                            reading: app.fatigue,
                            proposal: Deload(startedAt: Date()),
                            onApply: { Task { await app.applyDeload() } },
                            onDismiss: { withAnimation(.easeOut(duration: SL.Motion.base)) { app.dismissDeload() } }
                        )
                        steppedBackToday
                            .opacity(0.6)
                            .padding(.top, SL.Space.s6)
                    } else if drawerOpen {
                        openDrawerSummary
                    } else {
                        dayHero
                    }
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, contentTop)
                .padding(.bottom, SL.Space.s6)
            }
        }
        .safeAreaInset(edge: .bottom) { foot }
    }

    /// 41c ends the screen 6 under the last control. The action keeps its
    /// place in every state, so selecting another day never moves it.
    private static let actionGap: CGFloat = 6

    /// 41c sets the name 48 under the drawer; 41d's compact summary 22, where
    /// the agenda has taken the room. 18R's proposal opens where 09 did.
    private var contentTop: CGFloat {
        if app.proposesDeload { return isFirstRun ? SL.Space.s6 : SL.Space.s5 }
        return drawerOpen ? 22 : 48
    }

    /// Selecting a date reads it and nothing else: no session, no schedule,
    /// no programme, no history is touched by looking.
    private func select(_ day: AgendaDay) {
        withAnimation(.easeOut(duration: SL.Motion.base)) {
            selectedDate = day.isToday ? nil : day.date
        }
    }

    /// The four weeks the open drawer shows, around the month it is on.
    private var drawerWeeks: [Agenda.Week] {
        Agenda.weeks(
            around: drawerAnchor,
            plan: app.plan,
            overrides: app.scheduleOverrides,
            sessions: app.sessions,
            deload: app.activeDeload,
            firstSession: app.sessions.last?.date
        )
    }

    // MARK: - The selected date (41b, 41c)

    /// The date's own slots: its name at 56, the one line that describes it,
    /// and what it is made of. Every state fills the same three.
    private var dayHero: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(heroTitle)
                // Capped so the word stays whole on one line at accessibility
                // sizes: 84pt is as large as it fits across a phone.
                .font(.slCapped(Self.heroSize, SL.Weight.semibold, maxScale: 1.5))
                .slLineHeight(1.02, size: Self.heroSize, maxScale: 1.5)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(SL.Ink.primary)
                // SwiftUI draws the glyphs of a line tightened below the
                // font's own height lower in the box than a browser does —
                // 0.117em here. Lifting the drawing, not the box, puts the
                // word where the artboard sets it.
                .offset(y: -0.117 * Self.heroScaledSize)
                .accessibilityAddTraits(.isHeader)

            Text(heroLine)
                .slLead(SL.Weight.regular)
                .slNumerals()
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, 10)

            if let detail = heroDetail {
                Text(detail)
                    .slBody()
                    .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.tertiary)
                    .slMeasure(32, fontSize: SL.TypeSize.body)
                    .padding(.top, 14)
            }

            // 09's one lime line, kept where the date is today's training:
            // the only semantic win this screen makes.
            if showsToday, !drawerOpen, let insight {
                Text(attributed(insight.text, liming: insight.highlight))
                    .slBody()
                    .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                    .fixedSize(horizontal: false, vertical: true)
                    .slMeasure(32, fontSize: SL.TypeSize.body)
                    .padding(.top, 14)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private static let heroSize: CGFloat = 56

    private static var heroScaledSize: CGFloat {
        min(UIFontMetrics(forTextStyle: .body).scaledValue(for: heroSize), heroSize * 1.5)
    }

    /// 41d: with the agenda open the same date says the same things, at the
    /// size the room allows.
    private var openDrawerSummary: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                Text(heroTitle).slTitle().foregroundStyle(SL.Ink.primary)
                Spacer(minLength: SL.Space.s2)
                if let day = selectedDay {
                    Text("\(day.weekday) \(app.display.shortDate(day.date)) · \(Agenda.when(day.date))")
                        .slBody().slNumerals()
                        .foregroundStyle(SL.Ink.tertiary)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
            }
            Text(heroLine)
                .slBody()
                .slNumerals()
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    /// The name of what the date holds: the session that was saved on it, the
    /// one the programme puts there, or rest.
    private var heroTitle: String {
        guard let day = selectedDay else { return "Rustdag" }
        return day.title ?? "Rustdag"
    }

    /// One line about it, in the same shape for every state: what it costs,
    /// what it came to, or when the next one is.
    private var heroLine: String {
        guard let day = selectedDay else { return "" }
        switch day.content {
        case .session(let session):
            return loggedSummary(session)
        case .planned(let workout):
            return "\(WeekPlan.sets(of: workout)) sets · ±\(WeekPlan.minutes(of: workout)) min"
        case .missed(let workout):
            return "Stond gepland · \(WeekPlan.sets(of: workout)) sets · niet gelogd"
        case .rest:
            return Agenda.restLine(next: nextTraining(after: day.date))
        }
    }

    /// What it is made of, where that is something other than the line above.
    private var heroDetail: String? {
        guard let day = selectedDay else { return nil }
        switch day.content {
        case .planned(let workout):
            var detail = workout.exercises.map { app.exercise($0.exerciseID).name }.joined(separator: " · ")
            if isFirstRun {
                detail += "\n\nNog geen sessies gelogd. Je eerste sessie zet de startgewichten; daarna rekent SETLINE de progressie zelf."
            }
            return detail
        case .missed:
            return "SETLINE haalt niets in en verschuift niets. Je plan voor volgende week blijft staan."
        case .session, .rest:
            return nil
        }
    }

    /// The next session still to come after a date, read the way the rail
    /// reads its week — across its end as well.
    private func nextTraining(after date: Date) -> AgendaDay? {
        Agenda.nextTraining(
            after: date,
            plan: app.plan,
            overrides: app.scheduleOverrides,
            sessions: app.sessions,
            deload: app.activeDeload
        )
    }

    // MARK: - The foot (41b, 41c)

    /// What the date offers: the next session on its hairline where today
    /// rests, the way back to today where it does not, then the one action
    /// and the way to change the day.
    private var foot: some View {
        VStack(spacing: 0) {
            if let day = selectedDay, !app.proposesDeload {
                footRow(day)
                footAction(day)
                Button {
                    if app.resumableSession != nil && day.isToday {
                        confirmsEnd = true
                    } else {
                        planning = PlannedDate(date: day.date)
                    }
                } label: {
                    Text(app.resumableSession != nil && day.isToday ? "Beëindig sessie" : "Wijzig deze dag")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.bottom, Self.actionGap)
        .frame(maxWidth: .infinity)
        .background(SL.Surface.ground)
    }

    /// 41c's next session, or 41b's "what today holds · back to today".
    @ViewBuilder
    private func footRow(_ day: AgendaDay) -> some View {
        if day.isToday, day.isRest, let next = nextTraining(after: day.date), let workout = next.plannedDay {
            VStack(spacing: 0) {
                Rectangle().fill(Self.rowDivider).frame(height: 1)
                HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                    Text(workout.short).slTitle().foregroundStyle(SL.Ink.primary)
                    Spacer(minLength: SL.Space.s2)
                    Text(Agenda.sessionLine(next) ?? "")
                        .slBody().slNumerals()
                        .foregroundStyle(SL.Ink.tertiary)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
                .padding(.top, 14)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Volgende training: \(workout.short), \(Agenda.sessionLine(next) ?? "")")
            }
        } else if !day.isToday {
            VStack(spacing: 0) {
                Rectangle().fill(Self.rowDivider).frame(height: 1)
                HStack(spacing: SL.Space.s3) {
                    Text(todayLine)
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(1).minimumScaleFactor(0.8)
                    Spacer(minLength: SL.Space.s2)
                    Button {
                        withAnimation(.easeOut(duration: SL.Motion.base)) { selectedDate = nil }
                    } label: {
                        Text("Terug naar vandaag")
                            .slBody(SL.Weight.semibold)
                            .foregroundStyle(SL.Ink.primary)
                            .slHitTarget()
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 14)
            }
        }
    }

    /// One action per date. Today commits — starting or resuming is the only
    /// lime on this screen; every other date opens what it holds.
    @ViewBuilder
    private func footAction(_ day: AgendaDay) -> some View {
        Group {
            if day.isToday, let paused = app.resumableSession, let resumed = app.day(for: paused) {
                Button { onResume(resumed, paused) } label: { Text(resumeLabel(paused)) }
                    .buttonStyle(SLPrimaryButtonStyle())
            } else if day.isToday, let workout = day.plannedDay {
                Button { onStart(workout) } label: { Text("Start \(workout.short)") }
                    .buttonStyle(SLPrimaryButtonStyle())
            } else if let session = day.session {
                Button { openedSession = OpenedSession(id: session.id) } label: { Text("Bekijk sessie") }
                    .buttonStyle(SLOutlineButtonStyle())
            } else if isPast(day.date), let workout = day.plannedDay {
                // A day that has gone by with nothing logged. The work may
                // well have been done; this is where it gets written down, on
                // the date it happened rather than on today.
                Button { onLogPast(workout, day.date) } label: { Text("Log \(workout.short)") }
                    .buttonStyle(SLPrimaryButtonStyle())
                    .accessibilityHint("Schrijft \(workout.short) achteraf op, op \(Agenda.when(day.date))")
            } else if let workout = day.plannedDay {
                Button { preview = day } label: { Text("Bekijk \(workout.short)") }
                    .buttonStyle(SLOutlineButtonStyle())
                    .accessibilityHint("Opent wat er \(Agenda.when(day.date)) gepland staat. Er start niets.")
            } else if day.isToday, let next = nextTraining(after: day.date), let workout = next.plannedDay {
                Button { preview = next } label: { Text("Bekijk \(workout.short)") }
                    .buttonStyle(SLOutlineButtonStyle())
                    .accessibilityHint("Opent wat er \(Agenda.when(next.date)) gepland staat. Er start niets.")
            }
        }
        .padding(.top, 16)
    }

    /// A date that has gone by. Today is never past, whatever the hour.
    private func isPast(_ date: Date) -> Bool {
        Calendar.current.startOfDay(for: date) < Calendar.current.startOfDay(for: Date())
    }

    /// 41b's left half: what today holds, from the date you are not on.
    private var todayLine: String {
        guard let today else { return "Vandaag" }
        switch today.content {
        case .session(let session): return "Vandaag · \(session.dayLabel) gelogd"
        case .planned(let workout): return "Vandaag · \(workout.short)"
        case .missed(let workout): return "Vandaag · \(workout.short), niet gelogd"
        case .rest: return "Vandaag · rustdag"
        }
    }

    /// 41c draws this one hairline at .14, between the system's two.
    private static let rowDivider = Color.white.opacity(0.14)

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
                        .slLineHeight(1.04, size: SL.TypeSize.displayXL)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.primary)
                        .padding(.top, SL.Space.s2)
                    Text(offlineReassurance)
                        .slBody()
                        .slLineHeight(1.5, size: SL.TypeSize.body)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.secondary)
                        .slMeasure(32, fontSize: SL.TypeSize.body)
                        .padding(.top, 10)

                    compactToday.padding(.top, SL.Space.s5)

                    if !queue.isEmpty {
                        SLEyebrow(text: "IN DE WACHTRIJ", weight: SL.Weight.regular).padding(.top, SL.Space.s6)
                        VStack(spacing: 0) {
                            ForEach(Array(queue.enumerated()), id: \.offset) { _, row in
                                queueRow(row)
                            }
                        }
                    }

                    Text("SETLINE schrijft eerst lokaal en synct daarna. Exporteren werkt ook offline.")
                        .slMeta()
                        .slLineHeight(1.5, size: SL.TypeSize.meta)
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
            .buttonStyle(SLOutlineButtonStyle(edge: SL.Surface.hairlineStrong))
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
        .slBorderBox()
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
                    SLEyebrow(text: "Vandaag · \(longDateLabel)", weight: SL.Weight.regular)
                    Text(day?.short ?? "Rustdag").slTitle().foregroundStyle(SL.Ink.primary)
                }
                Spacer(minLength: SL.Space.s3)
                if let day {
                    Text("\(SessionPrescription.setCount(of: day, deload: app.activeDeload)) sets")
                        .slMeta().slNumerals().foregroundStyle(SL.Ink.secondary)
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

    /// 18R's today, beneath the proposal: an eyebrow, the day at 21, and its
    /// exercises — no card, so the proposal stays the one loud thing.
    private var steppedBackToday: some View {
        VStack(alignment: .leading, spacing: 0) {
            SLEyebrow(text: "Vandaag")
            Text(app.todayDay?.short ?? "Rustdag")
                .slTitle()
                .slLineHeight(SL.LineHeight.title, size: SL.TypeSize.title)
                .foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s2)
                .padding(.bottom, SL.Space.s1)
            Text(app.todayDay.map { day in
                day.exercises.map { app.exercise($0.exerciseID).name }.joined(separator: " · ")
            } ?? "Geen sessie gepland vandaag.")
                .slBody()
                .foregroundStyle(SL.Ink.secondary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
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
            .slLineHeight(1.4, size: SL.TypeSize.lead)
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

    private func loggedSummary(_ session: TrainingSession) -> String {
        let volume = RecordsEngine.volumeLoad(session.results.flatMap(\.sets))
        if let planned = session.plannedSetCount, let completed = session.completedSetCount, planned > 0 {
            return "\(completed) van \(planned) sets · \(app.display.volumeKg(volume)) volume"
        }
        return "\(session.completion)% afgerond · \(app.display.volumeKg(volume)) volume"
    }

    /// The volume that day would come to at the weights it would open with —
    /// the same reading the pre-flight card makes.
    private func expectedVolume(_ workout: WorkoutDay, before date: Date) -> Decimal {
        workout.exercises.reduce(Decimal(0)) { total, planned in
            let history = app.history(for: planned, before: date)
            let proposal = ProgressionEngine.proposal(
                planned: planned, exercise: app.exercise(planned.exerciseID), history: history
            )
            guard let weight = proposal.weightKg ?? history.mostRecent?.sets.first?.weightKg else { return total }
            let reps = planned.sets.reduce(0) { $0 + $1.repRange.upperBound }
            return total + weight * Decimal(reps)
        }
    }

    private func lastSession(for day: AgendaDay) -> TrainingSession? {
        guard let workout = day.plannedDay else { return nil }
        return app.sessions
            .filter { $0.kind == .workout && $0.dayID == workout.id && $0.date < day.date }
            .max { $0.date < $1.date }
    }

    private func previousSession(before session: TrainingSession) -> TrainingSession? {
        app.sessions
            .filter { $0.kind == .workout && $0.dayID == session.dayID && $0.date < session.date }
            .max { $0.date < $1.date }
    }

    private func volumeDelta(_ session: TrainingSession, _ previous: TrainingSession) -> Decimal? {
        let now = RecordsEngine.volumeLoad(session.results.flatMap(\.sets))
        let before = RecordsEngine.volumeLoad(previous.results.flatMap(\.sets))
        guard before > 0, now != before else { return nil }
        return now - before
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

}
