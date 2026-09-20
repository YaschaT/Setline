import SwiftUI
import SetlineCore

/// The week strip on Training, as 32a–32f draw it: seven 72-high tiles, 5
/// apart, each carrying its weekday, its date and a status dot.
///
/// The strip used to be a read-only overview. It is the selection now — one
/// tap changes the card above it and nothing else. Selecting a day never
/// starts a session and never writes anything.
struct DayStripView: View {
    let days: [AgendaDay]
    let selected: String
    let onSelect: (AgendaDay) -> Void

    var body: some View {
        HStack(spacing: 5) {
            ForEach(days) { day in
                Button { onSelect(day) } label: { tile(day) }
                    .buttonStyle(.plain)
                    .accessibilityLabel(label(day))
                    .accessibilityAddTraits(day.key == selected ? [.isSelected, .isButton] : .isButton)
                    .accessibilityHint(day.key == selected ? "" : "Dubbeltik om deze dag te bekijken")
            }
        }
    }

    private func tile(_ day: AgendaDay) -> some View {
        let isSelected = day.key == selected
        return VStack(spacing: 5) {
            Text(day.weekday)
                .font(.sl(SL.TypeSize.micro, isSelected ? SL.Weight.semibold : SL.Weight.regular))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(weekdayInk(day, selected: isSelected))
            Text("\(day.dayNumber)")
                .font(.sl(SL.TypeSize.lead, dateWeight(day, selected: isSelected)))
                .slNumerals()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(dateInk(day, selected: isSelected))
            dot(day, selected: isSelected)
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: 72)
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(fill(day, selected: isSelected))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(
                    edge(day, selected: isSelected),
                    style: StrokeStyle(lineWidth: 1, dash: day.isRest ? [4, 4] : [])
                )
        )
        .contentShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
    }

    /// Filled where a session was saved, open where one is planned, absent on
    /// a rest day — the same three marks the Agenda's legend names, so the
    /// state never rests on colour alone.
    @ViewBuilder
    private func dot(_ day: AgendaDay, selected: Bool) -> some View {
        let ink = selected ? SL.Ink.primary : SL.Ink.tertiary
        switch day.content {
        case .session:
            Circle().fill(selected ? SL.Ink.primary : SL.Ink.primary).frame(width: 6, height: 6)
        case .planned, .missed:
            Circle().strokeBorder(ink, lineWidth: 1).frame(width: 8, height: 8)
        case .rest:
            Color.clear.frame(width: 6, height: 6)
        }
    }

    private func fill(_ day: AgendaDay, selected: Bool) -> Color {
        if selected { return SL.Surface.raised2 }
        return day.isRest ? .clear : SL.Surface.raised
    }

    private func edge(_ day: AgendaDay, selected: Bool) -> Color {
        selected ? SL.Surface.selection : SL.Surface.hairline
    }

    private func weekdayInk(_ day: AgendaDay, selected: Bool) -> Color {
        if selected { return SL.Ink.primary }
        if day.isRest { return SL.Ink.tertiary }
        // A day that passed unlogged steps back: it is not a plan any more.
        if case .missed = day.content { return SL.Ink.tertiary }
        return SL.Ink.secondary
    }

    private func dateInk(_ day: AgendaDay, selected: Bool) -> Color {
        if selected { return SL.Ink.primary }
        if day.isRest { return SL.Ink.tertiary }
        if case .missed = day.content { return SL.Ink.tertiary }
        return SL.Ink.primary
    }

    private func dateWeight(_ day: AgendaDay, selected: Bool) -> Font.Weight {
        if selected { return SL.Weight.semibold }
        return day.isRest ? SL.Weight.regular : SL.Weight.medium
    }

    /// Spoken as the date, what it holds and how it stands — never as a colour.
    private func label(_ day: AgendaDay) -> String {
        var parts = [WeekPlan.fullWeekday(day.date), "\(day.dayNumber)"]
        if day.isToday { parts.append("vandaag") }
        switch day.content {
        case .session(let session): parts.append("\(session.dayLabel), gelogd")
        case .planned(let workout): parts.append("\(workout.short), gepland")
        case .missed(let workout): parts.append("\(workout.short), niet gelogd")
        case .rest: parts.append("rustdag")
        }
        if let movedFrom = day.movedFrom { parts.append("verplaatst van \(movedFrom)") }
        return parts.joined(separator: ", ")
    }
}
