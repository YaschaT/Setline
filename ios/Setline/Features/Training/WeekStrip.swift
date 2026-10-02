import SwiftUI
import SetlineCore

/// Redesign 1a · the week strip.
///
/// Seven days on one line. The selected day is the one filled lime, its ink
/// dark on the fill; under each number sits what the day is — a short bar on
/// today, a dot on every other day, mint where the plan rests.
///
/// Every day is read from `Agenda.week`, so the strip never has an opinion of
/// its own about a date. Tapping one selects it and writes nothing.
struct WeekStrip: View {
    let days: [AgendaDay]
    let selected: String
    let onSelect: (AgendaDay) -> Void
    /// Long-press is the shortcut into "Wijzig deze dag".
    let onPlan: (AgendaDay) -> Void

    var body: some View {
        HStack(spacing: SL.Space.s1) {
            ForEach(days) { day in
                let isSelected = day.key == selected
                StripDay(day: day, isSelected: isSelected)
                    .contentShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
                    .onTapGesture { onSelect(day) }
                    .onLongPressGesture { onPlan(day) }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(StripDay.spokenLabel(day))
                    .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
                    .accessibilityHint(isSelected
                        ? "Houd ingedrukt om deze dag te wijzigen"
                        : "Dubbeltik om deze dag te bekijken, houd ingedrukt om hem te wijzigen")
                    .accessibilityAction(named: "Wijzig deze dag") { onPlan(day) }
            }
        }
    }
}

/// One day of the strip: 60 high, radius 12.
struct StripDay: View {
    let day: AgendaDay
    let isSelected: Bool

    var body: some View {
        VStack(spacing: 2) {
            Text(day.weekday)
                .font(.sl(SL.TypeSize.micro, isSelected ? SL.Weight.semibold : SL.Weight.regular))
                .foregroundStyle(isSelected ? SL.Signal.onAction : SL.Ink.secondary)
            Text("\(day.dayNumber)")
                .font(.sl(SL.TypeSize.lead, SL.Weight.semibold))
                .slNumerals()
                .slLineHeight(1.1, size: SL.TypeSize.lead)
                .foregroundStyle(isSelected ? SL.Signal.onAction : SL.Ink.primary)
            mark.frame(height: 6)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 60)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .fill(isSelected ? SL.Signal.action : Color.clear)
        )
    }

    /// One shape per state, never a colour on its own: a bar on today, a dot
    /// everywhere else.
    @ViewBuilder
    private var mark: some View {
        if day.isToday {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(isSelected ? SL.Signal.onAction : SL.Signal.action)
                .frame(width: 12, height: 2)
        } else {
            Circle()
                .fill(day.isRest ? SL.Signal.recovery : SL.Surface.mute)
                .frame(width: 4, height: 4)
        }
    }

    /// Spoken as the date, today, what it holds and how it got there.
    static func spokenLabel(_ day: AgendaDay) -> String {
        var parts = ["\(WeekPlan.fullWeekday(day.date)) \(spokenDate(day.date))"]
        if day.isToday { parts.append("vandaag") }
        switch day.content {
        case .session(let session): parts.append("\(session.dayLabel), gelogd")
        case .planned(let workout): parts.append("\(workout.short), gepland")
        case .missed(let workout): parts.append("\(workout.short), niet gelogd")
        case .rest: parts.append("rustdag")
        }
        if day.isMoved || day.isOverridden { parts.append("door jou gezet") }
        return parts.joined(separator: ", ")
    }

    /// "10 september"
    private static func spokenDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nl_BE")
        formatter.dateFormat = "d MMMM"
        return formatter.string(from: date)
    }
}
