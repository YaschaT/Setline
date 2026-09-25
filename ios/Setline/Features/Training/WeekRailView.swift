import SwiftUI
import SetlineCore

/// Artboards 41c–41d · the week rail, and the same language one week per row
/// when the drawer is open.
///
/// Seven segments of one bar. The selected date is the segment that stands
/// proud — taller, rounder, on `raised2` inside the selection edge — and
/// today keeps a short lime bar along its foot wherever the selection is. What
/// a date holds is a shape under its number: a filled dot for a session saved,
/// an open ring for one planned, a dashed ring for a date you set yourself,
/// and nothing at all on a rest day, which is drawn dashed and unfilled.
///
/// Every day is read from `Agenda.week`, so the rail never has an opinion of
/// its own about a date. Tapping one selects it and writes nothing.
struct WeekRailView: View {
    let days: [AgendaDay]
    let selected: String
    let onSelect: (AgendaDay) -> Void
    /// Long-press is the shortcut into "Wijzig deze dag" (41's tap behaviour).
    let onPlan: (AgendaDay) -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: 3) {
            ForEach(days) { day in
                RailTile(day: day, isSelected: day.key == selected, shape: .week)
                    .contentShape(RoundedRectangle(cornerRadius: SL.Radius.sm, style: .continuous))
                    .onTapGesture { onSelect(day) }
                    .onLongPressGesture { onPlan(day) }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(RailTile.spokenLabel(day))
                    .accessibilityAddTraits(day.key == selected ? [.isSelected, .isButton] : .isButton)
                    .accessibilityHint(day.key == selected
                        ? "Houd ingedrukt om deze dag te wijzigen"
                        : "Dubbeltik om deze dag te bekijken, houd ingedrukt om hem te wijzigen")
            }
        }
    }
}

/// One week inside the pulled-out drawer (41d): its name, then the same seven
/// segments at the height a month of them can stand under each other.
struct AgendaWeekRow: View {
    let week: Agenda.Week
    let selected: String
    let onSelect: (AgendaDay) -> Void
    let onPlan: (AgendaDay) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(week.label)
                .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                .slNumerals()
                .foregroundStyle(SL.Ink.tertiary)
                .padding(.bottom, 6)
                .accessibilityAddTraits(.isHeader)

            HStack(spacing: 3) {
                ForEach(week.days) { day in
                    RailTile(day: day, isSelected: day.key == selected, shape: .month)
                        .contentShape(RoundedRectangle(cornerRadius: SL.Radius.sm, style: .continuous))
                        .onTapGesture { onSelect(day) }
                        .onLongPressGesture { onPlan(day) }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(RailTile.spokenLabel(day))
                        .accessibilityAddTraits(day.key == selected ? [.isSelected, .isButton] : .isButton)
                }
            }
        }
    }
}

/// One date as a segment of the bar.
struct RailTile: View {
    enum Shape {
        /// 41c: the week under the date, weekday letters included.
        case week
        /// 41d: a month of weeks, where the number alone carries the date.
        case month

        var height: CGFloat { self == .week ? 60 : 44 }
        var selectedHeight: CGFloat { self == .week ? 74 : 44 }
        var radius: CGFloat { self == .week ? SL.Radius.sm - 2 : SL.Radius.sm - 2 }
        var selectedRadius: CGFloat { self == .week ? 14 : 12 }
        var todayBar: CGSize { self == .week ? CGSize(width: 22, height: 2) : CGSize(width: 16, height: 2) }
        var todayInset: CGFloat { self == .week ? 6 : 4 }
    }

    let day: AgendaDay
    let isSelected: Bool
    let shape: Shape

    var body: some View {
        VStack(spacing: 4) {
            if shape == .week {
                Text(day.weekday)
                    .font(.sl(SL.TypeSize.micro, isSelected ? SL.Weight.semibold : SL.Weight.regular))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .foregroundStyle(isSelected ? SL.Ink.primary : SL.Ink.tertiary)
            }
            Text("\(day.dayNumber)")
                .font(.sl(dateSize, dateWeight))
                .slNumerals()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(dateInk)
            mark
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: isSelected ? shape.selectedHeight : shape.height)
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: radius, style: .continuous).fill(fill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(edge, style: StrokeStyle(lineWidth: 1, dash: day.isRest && !isSelected ? [4, 3] : []))
        )
        // Today keeps its own mark wherever the selection stands.
        .overlay(alignment: .bottom) {
            if day.isToday {
                Capsule()
                    .fill(SL.Signal.action)
                    .frame(width: shape.todayBar.width, height: shape.todayBar.height)
                    .padding(.bottom, shape.todayInset)
            }
        }
    }

    private var radius: CGFloat { isSelected ? shape.selectedRadius : shape.radius }

    private var dateSize: CGFloat {
        isSelected && shape == .week ? SL.TypeSize.title : SL.TypeSize.body
    }

    private var dateWeight: Font.Weight {
        isSelected ? SL.Weight.semibold : (shape == .week ? SL.Weight.medium : SL.Weight.regular)
    }

    private var dateInk: Color {
        if isSelected { return SL.Ink.primary }
        return day.isRest ? SL.Ink.tertiary : SL.Ink.secondary
    }

    private var fill: Color {
        if isSelected { return SL.Surface.raised2 }
        if day.isRest { return .clear }
        return shape == .week ? SL.Surface.raised : SL.Surface.ground
    }

    private var edge: Color {
        if isSelected { return SL.Surface.selection }
        return day.isRest ? Color.white.opacity(0.10) : SL.Surface.hairline
    }

    /// One shape per state, never a colour on its own: filled for a session
    /// saved, an open ring for one planned, a dashed ring for a date set by
    /// hand, and empty space on a rest day so the numbers stay on one line.
    @ViewBuilder
    private var mark: some View {
        switch day.mark {
        case .logged:
            Circle().fill(SL.Ink.primary).frame(width: 7, height: 7)
        case .planned:
            ring(dashed: false)
        case .moved:
            ring(dashed: true)
        case .missed:
            ring(dashed: false, ink: SL.Ink.tertiary.opacity(0.7))
        case .rest:
            Color.clear.frame(width: 7, height: 7)
        }
    }

    private func ring(dashed: Bool, ink: Color = SL.Ink.tertiary) -> some View {
        Circle()
            .strokeBorder(ink, style: StrokeStyle(lineWidth: 1, dash: dashed ? [2, 1.6] : []))
            .frame(width: 9, height: 9)
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
        if day.isMoved { parts.append("door jou gezet") }
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
