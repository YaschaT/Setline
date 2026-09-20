import SwiftUI
import SetlineCore

/// Artboards 34a–34d · Agenda.
///
/// A week list with an expanding day, not a month grid: a month cell cannot
/// carry a session name, so it would cost a tap to learn anything. Seven rows
/// already show the name and the set count; the selected day grows in place.
///
/// Pushed from Training, never a sixth tab — the tab bar stays and the
/// Training tab stays active. The Agenda reads; `WeekPlanView` is still the
/// only place the schedule changes.
struct AgendaView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize

    /// Held by Training, so coming back from a session returns to the week
    /// that was being read rather than to this one.
    @Binding var anchor: Date
    @Binding var selected: String?

    /// 34a reads the date at 17; at accessibility sizes the column has to
    /// widen with it, or "14" breaks across two lines.
    @ScaledMetric(relativeTo: .body) private var dayColumn: CGFloat = 34

    let onClose: () -> Void
    let onStart: (WorkoutDay) -> Void
    let onPreview: (AgendaDay) -> Void
    let onOpenSession: (TrainingSession) -> Void
    let onPlanWeek: () -> Void

    private var week: [AgendaDay] {
        Agenda.week(
            containing: anchor,
            plan: app.plan,
            overrides: app.scheduleOverrides,
            sessions: app.sessions,
            deload: app.activeDeload
        )
    }

    private var isCurrentWeek: Bool {
        Calendar.current.isDate(anchor, equalTo: Date(), toGranularity: .weekOfYear)
    }

    private var selectedDay: AgendaDay? {
        let days = week
        if let selected, let match = days.first(where: { $0.key == selected }) { return match }
        if let today = days.first(where: \.isToday) { return today }
        // A week that is not this one opens on what was actually done there,
        // which is what a past week is read for (34c).
        return days.last(where: \.isLogged) ?? days.first { !$0.isRest } ?? days.first
    }

    var body: some View {
        ZStack {
            SL.Surface.ground.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                header
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Agenda").slTitle().foregroundStyle(SL.Ink.primary)
                        weekNavigation.padding(.top, SL.Space.s4)
                        Text(summary)
                            .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                            .foregroundStyle(SL.Ink.tertiary)
                            .padding(.top, 12)
                        rows.padding(.top, SL.Space.s3)
                        legend.padding(.top, SL.Space.s4)
                    }
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.top, SL.Space.s2)
                    .padding(.bottom, SL.Space.s6)
                }
            }
        }
        .safeAreaInset(edge: .bottom) { bottom }
        .slRespondsToTextSize()
    }

    // MARK: - Chrome

    private var header: some View {
        HStack {
            Button(action: onClose) {
                Text("Training").slBody(SL.Weight.medium).foregroundStyle(SL.Ink.secondary).slHitTarget()
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Terug naar Training")

            Spacer()

            Button(action: onPlanWeek) {
                Text("Wijzig planning").slBody(SL.Weight.medium).foregroundStyle(SL.Ink.tertiary).slHitTarget()
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opent de weekplanning, waar je sessies verzet")
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
    }

    /// 34a: two 46-square steps around the week's own name.
    private var weekNavigation: some View {
        HStack(spacing: SL.Space.s2) {
            step("‹", label: "Vorige week") { move(by: -1) }
            Text(weekLabel)
                .slBody(SL.Weight.semibold)
                .slNumerals()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(SL.Ink.primary)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 44)
                .slBorderBox()
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                        .strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)
                )
                .accessibilityAddTraits(.isHeader)
            step("›", label: "Volgende week") { move(by: 1) }
        }
    }

    private func step(_ glyph: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(glyph)
                .font(.sl(SL.TypeSize.lead, SL.Weight.regular))
                .foregroundStyle(SL.Ink.secondary)
                .frame(width: 44, height: 44)
                .slBorderBox()
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                        .strokeBorder(SL.Surface.hairline, lineWidth: 1)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func move(by weeks: Int) {
        guard let next = Calendar.current.date(byAdding: .weekOfYear, value: weeks, to: anchor) else { return }
        withAnimation(.easeOut(duration: SL.Motion.fast)) {
            anchor = next
            selected = nil
        }
    }

    private var weekLabel: String {
        let dates = week.map(\.date)
        return "Week \(WeekPlan.number(firstSession: app.sessions.last?.date, on: anchor)) · \(WeekPlan.range(dates))"
    }

    private var summary: String {
        Agenda.summary(of: week)
    }

    // MARK: - The week

    private var rows: some View {
        VStack(spacing: 6) {
            ForEach(week) { day in
                if day.key == selectedDay?.key {
                    expanded(day)
                } else {
                    collapsed(day)
                }
            }
        }
    }

    private func collapsed(_ day: AgendaDay) -> some View {
        Button {
            withAnimation(.easeOut(duration: SL.Motion.base)) { selected = day.key }
        } label: {
            HStack(alignment: .center, spacing: SL.Space.s3) {
                dayColumn(day, compact: day.isRest)
                if day.isRest {
                    Text("Rustdag").slBody().foregroundStyle(SL.Ink.tertiary)
                } else {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(day.title ?? "").slLead().foregroundStyle(SL.Ink.primary)
                        Text(meta(day)).slMeta().slNumerals().foregroundStyle(SL.Ink.tertiary)
                    }
                }
                Spacer(minLength: SL.Space.s2)
                marker(day)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, day.isRest ? 6 : 10)
            .frame(minHeight: SL.Space.hitMin)
            .frame(maxWidth: .infinity, alignment: .leading)
            .slBorderBox()
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                    .fill(day.isRest ? .clear : SL.Surface.raised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                    .strokeBorder(
                        SL.Surface.hairline,
                        style: StrokeStyle(lineWidth: 1, dash: day.isRest ? [4, 4] : [])
                    )
            )
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(spoken(day))
        .accessibilityHint("Dubbeltik om deze dag te openen")
    }

    /// The selected day grows in the list rather than opening a screen.
    private func expanded(_ day: AgendaDay) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: SL.Space.s3) {
                dayColumn(day, compact: false)
                VStack(alignment: .leading, spacing: 0) {
                    SLEyebrow(text: eyebrow(day), size: SL.TypeSize.micro)
                    Text(day.title ?? "Rustdag")
                        .slTitle()
                        .foregroundStyle(SL.Ink.primary)
                        .padding(.top, 2)
                }
                Spacer(minLength: SL.Space.s2)
                marker(day)
            }

            detail(day).padding(.top, SL.Space.s3)

            actions(day)
                .padding(.top, SL.Space.s3)
                .overlay(alignment: .top) { SLHairline() }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(SL.Surface.selection, lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isSelected)
    }

    @ViewBuilder
    private func detail(_ day: AgendaDay) -> some View {
        switch day.content {
        case .session(let session):
            VStack(alignment: .leading, spacing: SL.Space.s2) {
                Text(loggedLine(session))
                    .slBody().slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if let previous = previousSession(before: session) {
                    SLValueRow {
                        Text("Tegenover \(app.display.shortDate(previous.date))")
                            .slBody().foregroundStyle(SL.Ink.secondary)
                        if let delta = volumeDelta(session, previous), delta != 0 {
                            Text(app.display.signedDelta(delta))
                                .slBody(SL.Weight.semibold).slNumerals()
                                .foregroundStyle(delta > 0 ? SL.Signal.action : SL.Ink.secondary)
                        }
                    }
                }
            }
        case .planned(let workout), .missed(let workout):
            VStack(alignment: .leading, spacing: SL.Space.s2) {
                Text(workout.exercises.map { app.exercise($0.exerciseID).name }.joined(separator: " · "))
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(plannedLine(day, workout))
                    .slBody().slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
            }
        case .rest:
            Text(restLine(day))
                .slBody()
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private func actions(_ day: AgendaDay) -> some View {
        HStack(spacing: SL.Space.s4) {
            switch day.content {
            case .session(let session):
                inline("Bekijk sessie", loud: true) { onOpenSession(session) }
            case .planned(let workout):
                if day.isToday {
                    inline("Start \(workout.short)", loud: true) { onStart(workout) }
                } else {
                    inline("Bekijk \(workout.short)", loud: true) { onPreview(day) }
                }
            case .missed:
                inline("Bekijk wat gepland stond", loud: true) { onPreview(day) }
            case .rest:
                inline("Zet hier een sessie", loud: false, action: onPlanWeek)
            }
            Spacer(minLength: SL.Space.s2)
            inline("Wijzig planning", loud: false, action: onPlanWeek)
        }
    }

    private func inline(_ title: String, loud: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.sl(SL.TypeSize.body, loud ? SL.Weight.semibold : SL.Weight.regular))
                .foregroundStyle(loud ? SL.Ink.primary : SL.Ink.tertiary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func dayColumn(_ day: AgendaDay, compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(day.weekday)
                .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                .foregroundStyle(day.isRest ? SL.Ink.tertiary : SL.Ink.secondary)
            if !compact {
                Text("\(day.dayNumber)")
                    .slLead()
                    .slNumerals()
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .foregroundStyle(SL.Ink.primary)
            } else {
                Text("\(day.dayNumber)")
                    .slBody()
                    .slNumerals()
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .foregroundStyle(SL.Ink.tertiary)
            }
        }
        .frame(width: dayColumn, alignment: .leading)
    }

    /// The same three marks the strip uses, named in the legend below.
    @ViewBuilder
    private func marker(_ day: AgendaDay) -> some View {
        if day.isMoved {
            Circle().strokeBorder(SL.Ink.secondary, lineWidth: 1).frame(width: 9, height: 9)
        } else {
            switch day.content {
            case .session: Circle().fill(SL.Ink.primary).frame(width: 6, height: 6)
            case .planned, .missed: Circle().strokeBorder(SL.Ink.tertiary, lineWidth: 1).frame(width: 8, height: 8)
            case .rest: EmptyView()
            }
        }
    }

    private var legend: some View {
        HStack(spacing: SL.Space.s3) {
            item("gelogd") { Circle().fill(SL.Ink.primary).frame(width: 6, height: 6) }
            item("gepland") { Circle().strokeBorder(SL.Ink.tertiary, lineWidth: 1).frame(width: 8, height: 8) }
            item("verplaatst") { Circle().strokeBorder(SL.Ink.secondary, lineWidth: 1).frame(width: 9, height: 9) }
            Text("streep · rustdag")
                .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                .foregroundStyle(SL.Ink.tertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Legenda: een gevulde stip is gelogd, een open stip is gepland, een bredere open stip is verplaatst, een streepjeslijn is een rustdag")
    }

    private func item(_ title: String, @ViewBuilder mark: () -> some View) -> some View {
        HStack(spacing: 5) {
            mark()
            Text(title)
                .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                .foregroundStyle(SL.Ink.tertiary)
        }
    }

    // MARK: - Bottom

    @ViewBuilder
    private var bottom: some View {
        VStack(spacing: SL.Space.s2) {
            if let day = selectedDay {
                switch day.content {
                case .planned(let workout) where day.isToday:
                    Button { onStart(workout) } label: { Text("Start \(workout.short)") }
                        .buttonStyle(SLPrimaryButtonStyle())
                case .planned(let workout):
                    Button { onPreview(day) } label: { Text("Bekijk \(workout.short)") }
                        .buttonStyle(SLOutlineButtonStyle())
                case .missed:
                    Button { onPreview(day) } label: { Text("Bekijk wat gepland stond") }
                        .buttonStyle(SLOutlineButtonStyle())
                case .session(let session):
                    Button { onOpenSession(session) } label: { Text("Bekijk sessie") }
                        .buttonStyle(SLOutlineButtonStyle())
                case .rest:
                    EmptyView()
                }
            }
            if !isCurrentWeek || selected != nil {
                Button {
                    withAnimation(.easeOut(duration: SL.Motion.base)) {
                        anchor = Date()
                        selected = nil
                    }
                } label: {
                    Text("Terug naar deze week")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(minHeight: SL.Space.hitMin)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.bottom, SL.Space.s3)
        .frame(maxWidth: .infinity)
        .background(SL.Surface.ground)
    }

    // MARK: - Lines

    private func eyebrow(_ day: AgendaDay) -> String {
        switch day.content {
        case .session(let session):
            guard let seconds = session.durationSeconds, seconds > 0 else { return "Gelogd" }
            return "Gelogd · \(app.display.minutes(seconds))"
        case .planned:
            return day.isToday ? "Vandaag · gepland" : "Gepland"
        case .missed:
            return "Niet gelogd"
        case .rest:
            return "Geen sessie"
        }
    }

    private func meta(_ day: AgendaDay) -> String {
        switch day.content {
        case .session(let session):
            return loggedLine(session)
        case .planned(let workout), .missed(let workout):
            let sets = WeekPlan.sets(of: workout)
            let line = "\(sets) sets · ±\(WeekPlan.minutes(of: workout)) min"
            return day.isToday ? "Vandaag · \(line)" : line
        case .rest:
            return ""
        }
    }

    private func loggedLine(_ session: TrainingSession) -> String {
        let volume = RecordsEngine.volumeLoad(session.results.flatMap(\.sets))
        if let planned = session.plannedSetCount, let completed = session.completedSetCount, planned > 0 {
            return "\(completed) van \(planned) sets · \(app.display.volumeKg(volume))"
        }
        return "\(session.completion)% · \(app.display.volumeKg(volume))"
    }

    private func plannedLine(_ day: AgendaDay, _ workout: WorkoutDay) -> String {
        let sets = WeekPlan.sets(of: workout)
        let minutes = WeekPlan.minutes(of: workout)
        if day.isToday, let target = app.todayMetaLine()?.components(separatedBy: " · ").first(where: { $0.hasPrefix("doel") }) {
            return "\(sets) sets · \(target) · ±\(minutes) min"
        }
        return "\(sets) sets · ±\(minutes) min"
    }

    private func restLine(_ day: AgendaDay) -> String {
        guard let next = week.first(where: { $0.date > day.date && !$0.isRest && !$0.isLogged }),
              let workout = next.plannedDay
        else { return "Geen sessie gepland." }
        return "Volgende sessie \(WeekPlan.fullWeekday(next.date)) \(app.display.shortDate(next.date)) · \(workout.short)."
    }

    private func previousSession(before session: TrainingSession) -> TrainingSession? {
        app.sessions
            .filter { $0.kind == .workout && $0.dayID == session.dayID && $0.date < session.date }
            .max { $0.date < $1.date }
    }

    private func volumeDelta(_ session: TrainingSession, _ previous: TrainingSession) -> Decimal? {
        let now = RecordsEngine.volumeLoad(session.results.flatMap(\.sets))
        let before = RecordsEngine.volumeLoad(previous.results.flatMap(\.sets))
        guard before > 0 else { return nil }
        return now - before
    }

    private func spoken(_ day: AgendaDay) -> String {
        var parts = ["\(WeekPlan.fullWeekday(day.date)) \(day.dayNumber)"]
        if day.isToday { parts.append("vandaag") }
        switch day.content {
        case .session(let session): parts.append("\(session.dayLabel), gelogd, \(loggedLine(session))")
        case .planned(let workout): parts.append("\(workout.short), gepland, \(meta(day))")
        case .missed(let workout): parts.append("\(workout.short), niet gelogd")
        case .rest: parts.append("rustdag")
        }
        if let movedFrom = day.movedFrom { parts.append("verplaatst van \(movedFrom)") }
        return parts.joined(separator: ", ")
    }
}
