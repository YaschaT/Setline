import SwiftUI
import SetlineCore

/// Redesign 1a · Training — today and the week.
///
/// One screen, one selected date. The week strip and the card under it say
/// what that date holds; the card is swiped, or a day tapped, to look at
/// another one. Looking never writes: a session starts from `Start training`
/// on today's card and nowhere else, and `Oefeningen bekijken` opens the
/// preview, which starts nothing.
///
/// Planning and results live one tap away in the Agenda. "Wijzig deze dag" —
/// the only thing here that changes the schedule — is reached from a day's
/// preview, from a rest day's row in the Agenda, or by holding a day.
struct TrainingHomeView: View {
    @Environment(AppState.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize

    let onStart: (WorkoutDay) -> Void
    let onResume: (WorkoutDay, ActiveSessionSnapshot) -> Void
    /// A workout that was done on a date that has passed and never written
    /// down. Same session screen, that date on the result.
    let onLogPast: (WorkoutDay, Date) -> Void

    @State private var confirmsEnd = false
    /// The date the screen is on. `nil` is today, which is where every visit
    /// starts and where `Naar vandaag` returns.
    @State private var selectedDate: Date?
    @State private var sheet: Presented?
    @State private var openedSession: OpenedSession?
    /// The card under the finger, and on its way in after a day change.
    @State private var dragX: CGFloat = 0
    @State private var isDragging = false
    /// The recovery proposal was waved away on this visit; the card says so.
    @State private var ignoredProposal = false

    private struct OpenedSession: Identifiable { let id: String }

    /// One sheet at a time, as the design has it: a preview takes the
    /// agenda's place rather than stacking on it.
    private enum Presented: Identifiable {
        case agenda
        case preview(AgendaDay)
        case plan(Date)

        var id: String {
            switch self {
            case .agenda: return "agenda"
            case .preview(let day): return "preview-\(day.key)"
            case .plan(let date): return "plan-\(Schedule.dateKey(date))"
            }
        }
    }

    // MARK: - What the screen reads

    /// The week the strip shows: the one the selected date falls in, so
    /// picking a date in the agenda brings its week back with it.
    private var week: [AgendaDay] { days(containing: selectedDate ?? Date()) }

    private func days(containing date: Date) -> [AgendaDay] {
        Agenda.week(
            containing: date,
            plan: app.plan,
            overrides: app.scheduleOverrides,
            sessions: app.sessions,
            deload: app.activeDeload
        )
    }

    private var selectedDay: AgendaDay? {
        let key = Schedule.dateKey(selectedDate ?? Date())
        return week.first { $0.key == key }
    }

    private var isOffline: Bool { app.sync == .offline }

    private var queue: [SyncQueue.Row] {
        SyncQueue.rows(from: app.pendingChanges, display: app.display)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                header
                if isOffline { offlineCard }
                weekSection
                if let day = selectedDay {
                    daySection(day)
                }
                if let status = recoveryStatus {
                    recoverySection(status)
                        .padding(.top, SL.Space.s1)
                }
                if isOffline, !queue.isEmpty { queueSection }
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s5)
            .padding(.bottom, SL.Space.s6)
        }
        .sheet(item: $sheet) { presented in
            switch presented {
            case .agenda:
                AgendaSheet(
                    initialDate: selectedDate ?? Date(),
                    selectedKey: selectedDay?.key ?? "",
                    onSelect: { select($0) },
                    onPreview: { day in
                        select(day)
                        sheet = .preview(day)
                    },
                    onClose: { sheet = nil }
                )
            case .preview(let day):
                preview(day)
            case .plan(let date):
                DayPlanSheet(
                    plan: dayPlan(for: date),
                    onApply: { option in
                        let plan = dayPlan(for: date)
                        sheet = nil
                        guard let change = plan.change(for: option, programKey: app.programKey) else { return }
                        Task { await app.record([change]) }
                    },
                    onOpenSession: { session in
                        after(closing: { openedSession = OpenedSession(id: session.id) })
                    },
                    onClose: { sheet = nil }
                )
            }
        }
        .fullScreenCover(item: $openedSession) { opened in
            SessionDetailView(sessionID: opened.id, onClose: { openedSession = nil })
        }
        #if DEBUG
        // `-SetlineAgenda` and `-SetlinePreview` open the two sheets, so they
        // can be looked at on any simulator without driving taps.
        .task {
            let arguments = ProcessInfo.processInfo.arguments
            try? await Task.sleep(for: .milliseconds(600))
            if arguments.contains("-SetlineAgenda") {
                sheet = .agenda
            } else if arguments.contains("-SetlinePreview"),
                      let today = days(containing: Date()).first(where: \.isToday), today.plannedDay != nil {
                sheet = .preview(today)
            }
        }
        #endif
        .alert("Sessie beëindigen?", isPresented: $confirmsEnd) {
            Button("Annuleer", role: .cancel) {}
            Button("Beëindigen") { Task { await app.endActiveSession() } }
        } message: {
            Text(endMessage)
        }
        .slRespondsToTextSize()
    }

    /// Closes whatever sheet is up, and acts once it has gone: the session and
    /// the results both open over the whole screen, which a sheet on its way
    /// out would refuse.
    private func after(closing action: @escaping @MainActor () -> Void) {
        sheet = nil
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(350))
            action()
        }
    }

    @ViewBuilder
    private func preview(_ day: AgendaDay) -> some View {
        if let workout = day.plannedDay {
            let isMissed = { if case .missed = day.content { return true } else { return false } }()
            WorkoutPreviewView(
                day: day,
                workout: workout,
                // A paused session is resumed from the card, never started
                // over from here.
                onStart: day.isToday && app.resumableSession == nil
                    ? { after(closing: { onStart(workout) }) }
                    : nil,
                onLogPast: isMissed
                    ? { after(closing: { onLogPast(workout, day.date) }) }
                    : nil,
                onChangeDay: { sheet = .plan(day.date) },
                onClose: { sheet = nil }
            )
        }
    }

    /// One date, read the way the strip and the agenda read it.
    private func dayPlan(for date: Date) -> DayPlan {
        DayPlan.make(
            for: date,
            plan: app.plan,
            overrides: app.scheduleOverrides,
            sessions: app.sessions,
            deload: app.activeDeload
        )
    }

    // MARK: - The date

    /// The head is the date the card is on, as Main has it: no greeting and
    /// no avatar — Account is a tab of its own.
    private var header: some View {
        Text(longDate)
            .slTitle()
            .slNumerals()
            .slLineHeight(SL.LineHeight.title, size: SL.TypeSize.title)
            .foregroundStyle(SL.Ink.primary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
            .padding(.top, SL.Space.s1)
    }

    /// "Woensdag 9 september" — the date the card is on.
    private var longDate: String { SLDateText.long(selectedDay?.date ?? Date()) }

    // MARK: - The week

    private var weekSection: some View {
        let headLayout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 0))
            : AnyLayout(HStackLayout(alignment: .center, spacing: SL.Space.s3))
        return VStack(spacing: SL.Space.s1) {
            headLayout {
                SLOverline(text: Agenda.weekLabel(containing: selectedDate ?? Date()))
                    .padding(.leading, SL.Space.s1)
                    .accessibilityAddTraits(.isHeader)
                if !typeSize.isAccessibilitySize { Spacer(minLength: SL.Space.s2) }
                Button { sheet = .agenda } label: {
                    HStack(spacing: 6) {
                        SLGlyph(name: .calendar, size: 18)
                        Text("Agenda").slBody(SL.Weight.semibold)
                        SLGlyph(name: .chevronRight, size: 14)
                    }
                    .foregroundStyle(SL.Signal.action)
                    .lineLimit(1)
                    .fixedSize()
                    .padding(.leading, typeSize.isAccessibilitySize ? SL.Space.s1 : SL.Space.s3)
                    .padding(.trailing, SL.Space.s2)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
                .padding(.trailing, typeSize.isAccessibilitySize ? 0 : -SL.Space.s2)
                .accessibilityHint("Opent planning en resultaten")
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            WeekStrip(
                days: week,
                selected: selectedDay?.key ?? "",
                onSelect: { go(to: $0) },
                onPlan: { sheet = .plan($0.date) }
            )
        }
        .padding(.top, SL.Space.s1)
    }

    // MARK: - The selected date

    private func daySection(_ day: AgendaDay) -> some View {
        VStack(spacing: SL.Space.s1) {
            dayCard(day)
                .offset(x: dragX)
                .opacity(1 - min(abs(dragX) / 400, 0.4))
                // Beside the scroll view's own drag, never instead of it: a
                // vertical pull still scrolls the screen.
                .simultaneousGesture(swipe)
            dayNav
        }
    }

    private func dayCard(_ day: AgendaDay) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s4) {
            cardTop(day)
            cardBody(day)
            cardActions(day)
        }
        .padding(SL.Space.s4)
        .slBorderBox()
        .frame(maxWidth: .infinity, alignment: .leading)
        .slHeroCard()
        .clipShape(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous))
        .accessibilityElement(children: .contain)
    }

    private func cardTop(_ day: AgendaDay) -> some View {
        HStack(alignment: .center, spacing: SL.Space.s3) {
            Text(eyebrow(for: day))
                .font(.sl(SL.TypeSize.meta, SL.Weight.bold))
                .slNumerals()
                .foregroundStyle(SL.Signal.action)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: SL.Space.s2)
            if day.isToday {
                SLTodayBadge()
            } else {
                Button {
                    if let today = days(containing: Date()).first(where: \.isToday) { go(to: today) }
                } label: {
                    HStack(spacing: SL.Space.s1) {
                        SLGlyph(name: .chevronLeft, size: 14)
                        Text("Naar vandaag").slMeta(SL.Weight.semibold)
                    }
                    .foregroundStyle(SL.Signal.action)
                    .padding(.horizontal, SL.Space.s2)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
                // 44 to touch, 28 in the row: the design lets it hang over.
                .padding(.vertical, -SL.Space.s2)
                .padding(.trailing, -SL.Space.s2)
                .fixedSize()
            }
        }
        .frame(minHeight: 28)
    }

    /// "Week 3 · Push / Pull / Benen" — the week counted from the first
    /// session logged, and the programme the account is on.
    private func eyebrow(for day: AgendaDay) -> String {
        let week = "Week \(WeekPlan.number(firstSession: app.sessions.last?.date, on: day.date))"
        guard let state = app.state else { return week }
        return "\(week) · \(ProgramCatalog.current(in: state, plan: app.plan).name)"
    }

    private func cardBody(_ day: AgendaDay) -> some View {
        let content = card(for: day)
        return VStack(alignment: .leading, spacing: SL.Space.s2) {
            // No oversized word behind the title: the name says it once.
            VStack(alignment: .leading, spacing: 6) {
                Text(content.title)
                    .font(.sl(SL.TypeSize.display, SL.Weight.semibold))
                    .tracking(-0.01 * SL.TypeSize.display)
                    .slLineHeight(1.05, size: SL.TypeSize.display)
                    .foregroundStyle(content.isRest ? SL.Signal.recovery : SL.Ink.primary)
                    .minimumScaleFactor(0.75)
                    .accessibilityAddTraits(.isHeader)
                if let focus = content.focus {
                    Text(focus.slUnbroken)
                        .slLead(SL.Weight.regular)
                        .slNumerals()
                        .slLineHeight(1.35, size: SL.TypeSize.lead)
                        .foregroundStyle(SL.Ink.primary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)

            if !content.meta.isEmpty {
                SLFlow(spacing: SL.Space.s3, lineSpacing: SL.Space.s1) {
                    ForEach(Array(content.meta.enumerated()), id: \.offset) { _, item in
                        HStack(spacing: 5) {
                            if item.timed { SLGlyph(name: .clock, size: 15) }
                            Text(item.text.slUnbroken).slBody().slNumerals()
                        }
                        .foregroundStyle(SL.Ink.meta)
                    }
                }
                .accessibilityElement(children: .combine)
            }

            ForEach(Array(content.notes.enumerated()), id: \.offset) { _, note in
                Text(note)
                    .slBody()
                    .slNumerals()
                    .slLineHeight(1.4, size: SL.TypeSize.body)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: - What the card says

    private struct Card {
        struct Meta { let text: String; var timed = false }
        var title: String
        var focus: String?
        var isRest = false
        var meta: [Meta] = []
        var notes: [AttributedString] = []
    }

    private func card(for day: AgendaDay) -> Card {
        // A session that was started and paused is the one you are in the
        // middle of, whatever today's plan says.
        if day.isToday, let paused = app.resumableSession, let resumed = app.day(for: paused) {
            let planned = SessionPrescription.setCount(of: resumed, deload: app.activeDeload)
            return Card(
                title: resumed.short,
                focus: resumed.focus.isEmpty ? nil : resumed.focus,
                meta: [
                    .init(
                        text: "\(paused.loggedSetCount) van \(max(planned, paused.plannedSetCount)) sets gelogd"
                            + " · gepauzeerd \(app.pausedWhenLabel(for: paused).replacingOccurrences(of: "van ", with: ""))"
                    ),
                ]
            )
        }

        switch day.content {
        case .planned(let workout):
            var card = Card(
                title: workout.short,
                focus: workout.focus.isEmpty ? nil : workout.focus
            )
            // 1a: today reads "◷ 5 oefeningen · ~62 min"; another day only
            // what it holds, "20 sets".
            let exercises = workout.exercises.count == 1 ? "1 oefening" : "\(workout.exercises.count) oefeningen"
            card.meta = day.isToday
                ? [.init(text: "\(exercises) · ~\(WeekPlan.minutes(of: workout)) min", timed: true)]
                : [.init(text: "\(WeekPlan.sets(of: workout)) sets")]
            if let movedFrom = day.movedFrom {
                card.notes.append(plain("Verplaatst van \(movedFrom)."))
            }
            if day.isToday {
                if let insight { card.notes.append(attributed(insight.text, liming: insight.highlight)) }
                if app.sessions.isEmpty {
                    card.notes.append(plain(
                        "Nog geen sessies gelogd. Je eerste sessie zet de startgewichten; daarna rekent SETLINE de progressie zelf."
                    ))
                }
            }
            return card

        case .missed(let workout):
            return Card(
                title: workout.short,
                focus: workout.focus.isEmpty ? nil : workout.focus,
                meta: [.init(text: "\(WeekPlan.sets(of: workout)) sets · niet gelogd")],
                notes: [plain("SETLINE haalt niets in en verschuift niets. Je plan voor volgende week blijft staan.")]
            )

        case .session(let session):
            return Card(
                title: "Voltooid",
                focus: session.dayLabel,
                meta: [.init(text: loggedSummary(session))]
            )

        case .rest:
            var card = Card(title: "Rust", focus: "Geen training gepland", isRest: true)
            if let next = nextTraining(after: day.date), let workout = next.plannedDay {
                card.notes.append(plain("\(Agenda.restLine(next: next)) · \(workout.short)"))
            }
            return card
        }
    }

    private func plain(_ text: String) -> AttributedString {
        var string = AttributedString(text.slUnbroken)
        string.foregroundColor = SL.Ink.meta
        return string
    }

    private func attributed(_ text: String, liming fragment: String) -> AttributedString {
        var string = AttributedString(text.slUnbroken)
        string.foregroundColor = SL.Ink.primary
        if let range = string.range(of: fragment.slUnbroken) {
            string[range].foregroundColor = SL.Signal.action
        }
        return string
    }

    /// The next session still to come after a date, read the way the strip
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

    private func loggedSummary(_ session: TrainingSession) -> String {
        let volume = RecordsEngine.volumeLoad(session.results.flatMap(\.sets))
        if let planned = session.plannedSetCount, let completed = session.completedSetCount, planned > 0 {
            return "\(completed) van \(planned) sets · \(app.display.volumeKg(volume)) volume"
        }
        return "\(session.completion)% afgerond · \(app.display.volumeKg(volume)) volume"
    }

    /// The one progression line: a value that beats the reader's own earlier
    /// data — "Bankdrukken staat +5 kg sinds 26 aug." The gain is the lime in
    /// it. Today's weights stay with the session that opens them; and with no
    /// real gain there is no line at all.
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

    // MARK: - What the card offers

    /// One commit per date. Today starts or resumes — the only lime action on
    /// this screen; every other date opens what it holds.
    @ViewBuilder
    private func cardActions(_ day: AgendaDay) -> some View {
        if day.isToday, let paused = app.resumableSession, let resumed = app.day(for: paused) {
            VStack(spacing: SL.Space.s1) {
                Button { onResume(resumed, paused) } label: { startLabel(resumeLabel(paused)) }
                    .buttonStyle(SLPrimaryButtonStyle())
                Button { confirmsEnd = true } label: { Text("Beëindig sessie") }
                    .buttonStyle(SLQuietButtonStyle())
                    .accessibilityHint("Bewaart wat je logde en sluit de sessie af")
            }
        } else if day.isToday, let workout = day.plannedDay {
            VStack(spacing: SL.Space.s1) {
                Button { onStart(workout) } label: { startLabel("Start training") }
                    .buttonStyle(SLPrimaryButtonStyle())
                Button { sheet = .preview(day) } label: { chevroned("Oefeningen bekijken") }
                    .buttonStyle(SLQuietButtonStyle())
                    .accessibilityHint("Toont de oefeningen van vandaag. Er start niets.")
            }
        } else if let session = day.session {
            Button { openedSession = OpenedSession(id: session.id) } label: { chevroned("Resultaten bekijken") }
                .buttonStyle(SLOutlineButtonStyle())
        } else if day.isPast, let workout = day.plannedDay {
            // A day that has gone by with nothing logged. The work may well
            // have been done; this is where it gets written down, on the date
            // it happened rather than on today.
            VStack(spacing: SL.Space.s1) {
                Button { onLogPast(workout, day.date) } label: { chevroned("Achteraf loggen") }
                    .buttonStyle(SLOutlineButtonStyle())
                    .accessibilityHint("Schrijft \(workout.short) op, op \(Agenda.when(day.date))")
                Button { sheet = .agenda } label: { chevroned("Details in agenda") }
                    .buttonStyle(SLQuietButtonStyle())
            }
        } else if day.plannedDay != nil {
            Button { sheet = .agenda } label: { chevroned("Details in agenda") }
                .buttonStyle(SLOutlineButtonStyle())
                .accessibilityHint("Opent wat er \(Agenda.when(day.date)) gepland staat. Er start niets.")
        }
    }

    private func startLabel(_ title: String) -> some View {
        HStack(spacing: 10) {
            SLGlyph(name: .play, size: 16)
            Text(title)
        }
    }

    private func chevroned(_ title: String) -> some View {
        HStack(spacing: 6) {
            Text(title)
            SLGlyph(name: .chevronRight, size: 14).foregroundStyle(SL.Ink.secondary)
        }
    }

    private func resumeLabel(_ paused: ActiveSessionSnapshot) -> String {
        let when = app.pausedWhenLabel(for: paused)
        return when == "vandaag" ? "Hervat training" : "Hervat training \(when)"
    }

    private var endMessage: String {
        guard let paused = app.resumableSession else { return "" }
        return paused.hasProgress
            ? "De \(paused.loggedSetCount) sets die je logde worden bewaard. De rest telt als niet getraind."
            : "Je logde nog niets, dus er wordt niets bewaard."
    }

    // MARK: - From day to day

    private func neighbour(_ step: Int) -> AgendaDay? {
        guard let key = selectedDay?.key, let index = week.firstIndex(where: { $0.key == key }) else { return nil }
        let target = index + step
        return week.indices.contains(target) ? week[target] : nil
    }

    private var dayNav: some View {
        HStack(spacing: SL.Space.s2) {
            navButton(neighbour(-1), direction: -1)
            Text("veeg om van dag te wisselen")
                .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                .foregroundStyle(SL.Ink.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .accessibilityHidden(true)
            navButton(neighbour(1), direction: 1)
        }
    }

    /// The day before or after, by name. Where the week ends there is no
    /// button, and the space stays so the hint keeps its place.
    private func navButton(_ day: AgendaDay?, direction: Int) -> some View {
        Button {
            if let day { go(to: day, direction: direction) }
        } label: {
            HStack(spacing: SL.Space.s1) {
                if direction < 0 { SLGlyph(name: .chevronLeft, size: 14) }
                Text(day.map { "\($0.weekday) \($0.dayNumber)" } ?? "")
                    .slMeta()
                    .slNumerals()
                if direction > 0 { SLGlyph(name: .chevronRight, size: 14) }
            }
            .foregroundStyle(SL.Ink.secondary)
            .padding(.horizontal, SL.Space.s2)
            .frame(minWidth: 72, minHeight: SL.Space.hitMin, alignment: direction < 0 ? .leading : .trailing)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
        .opacity(day == nil ? 0 : 1)
        .disabled(day == nil)
        .accessibilityHidden(day == nil)
        .accessibilityLabel(day.map { "\(direction < 0 ? "Vorige" : "Volgende") dag, \(StripDay.spokenLabel($0))" } ?? "")
    }

    /// The design's 220 ms `cubic-bezier(.2,.8,.2,1)`.
    private static let slide = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.22)

    /// Selecting a date reads it and nothing else: no session, no schedule,
    /// no programme, no history is touched by looking.
    private func select(_ day: AgendaDay) {
        selectedDate = day.isToday ? nil : day.date
    }

    /// Moves the card to another day, sliding in from the side it came from.
    private func go(to day: AgendaDay, direction: Int? = nil) {
        guard day.key != selectedDay?.key else {
            if dragX != 0 { withAnimation(reduceMotion ? nil : Self.slide) { dragX = 0 } }
            return
        }
        let current = selectedDay?.date ?? Date()
        let step = direction ?? (day.date > current ? 1 : -1)
        var jump = Transaction()
        jump.disablesAnimations = true
        withTransaction(jump) {
            select(day)
            dragX = reduceMotion ? 0 : CGFloat(step) * 56
        }
        guard !reduceMotion else { return }
        // One turn of the run loop, so the card is drawn at its starting
        // point before it moves.
        Task { @MainActor in
            withAnimation(Self.slide) { dragX = 0 }
        }
    }

    /// A horizontal drag carries the card; past 64 it lands on the next day.
    private var swipe: some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                let (dx, dy) = (value.translation.width, value.translation.height)
                if !isDragging {
                    guard abs(dx) > 10, abs(dx) > abs(dy) * 1.5 else { return }
                    isDragging = true
                }
                dragX = reduceMotion ? 0 : dx * 0.9
            }
            .onEnded { value in
                guard isDragging else { return }
                isDragging = false
                let dx = value.translation.width
                if dx < -64, let next = neighbour(1) {
                    go(to: next, direction: 1)
                } else if dx > 64, let previous = neighbour(-1) {
                    go(to: previous, direction: -1)
                } else {
                    withAnimation(reduceMotion ? nil : Self.slide) { dragX = 0 }
                }
            }
    }

    // MARK: - Herstel

    /// Shown while there is something to say: a proposal waiting for an
    /// answer, the lighter days it led to, or that it was just waved away.
    private var recoveryStatus: DeloadCard.Status? {
        // Read before anything can return: waving a proposal away is
        // remembered outside anything SwiftUI watches, so this flag is what
        // redraws the card — and a flag the body never read redraws nothing.
        let ignored = ignoredProposal
        if app.activeDeload != nil { return .applied }
        if ignored { return .ignored }
        return app.proposesDeload ? .open : nil
    }

    private func recoverySection(_ status: DeloadCard.Status) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack(spacing: SL.Space.s2) {
                SLGlyph(name: .moon, size: 18).foregroundStyle(SL.Signal.recovery)
                Text("Herstel")
                    .slLead()
                    .foregroundStyle(SL.Ink.primary)
                    .accessibilityAddTraits(.isHeader)
            }
            .padding(.horizontal, SL.Space.s1)

            DeloadCard(
                reading: app.fatigue,
                proposal: app.activeDeload ?? Deload(startedAt: Date()),
                status: status,
                onApply: { Task { await app.applyDeload() } },
                onDismiss: {
                    ignoredProposal = true
                    app.dismissDeload()
                }
            )
        }
    }

    // MARK: - Offline

    /// Sync failure is a state of the data, not a red box: amber says so, the
    /// reassurance is in plain words, and everything on the screen keeps
    /// working — logging is local.
    private var offlineCard: some View {
        SLAttentionCard(title: "Offline") {
            Text(offlineText.slUnbroken)
                .slBody()
                .slNumerals()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.primary)
            Button { Task { await app.syncNow() } } label: {
                Text(app.sync == .syncing ? "Bezig met syncen…" : "Nu opnieuw proberen")
            }
            .buttonStyle(SLOutlineButtonStyle())
            .disabled(app.sync == .syncing)
            .padding(.top, SL.Space.s2)
        }
    }

    private var offlineText: String {
        let count = queue.count
        let waiting = count == 0 ? ""
            : count == 1 ? " 1 wijziging wacht op sync."
            : " \(count) wijzigingen wachten op sync."
        return "Niets verloren: alles wordt lokaal bewaard.\(waiting) Loggen werkt offline; syncen gebeurt zodra er verbinding is."
    }

    private var queueSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLSectionHead(title: "In de wachtrij")
            VStack(spacing: 0) {
                ForEach(Array(queue.enumerated()), id: \.offset) { index, row in
                    HStack(alignment: .center, spacing: SL.Space.s3) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(row.title).slLead().foregroundStyle(SL.Ink.primary)
                            Text(row.detail).slBody().slNumerals().foregroundStyle(SL.Ink.secondary)
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Text("Wacht").slMeta(SL.Weight.semibold).foregroundStyle(SL.Signal.attention)
                    }
                    .padding(.horizontal, SL.Space.s4)
                    .padding(.vertical, SL.Space.s3)
                    .frame(minHeight: 72)
                    .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                    .accessibilityElement(children: .combine)
                }
            }
            .slBorderBox()
            .slListCard()

            Text("SETLINE schrijft eerst lokaal en synct daarna. Exporteren werkt ook offline.")
                .slMeta()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.horizontal, SL.Space.s1)
        }
    }
}
