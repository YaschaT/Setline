import SwiftUI
import SetlineCore

/// Artboards 41c–41d · the week drawer.
///
/// The date and the week sit on one surface pinned to the top edge, with a
/// grip beneath it. Pull or tap the grip and the same drawer becomes the
/// agenda — four weeks under each other in the same rail language, without
/// leaving Training. Closing it brings the week back.
///
/// It reads dates and selects one. It never writes: changing what a date holds
/// is `DayPlanSheet`, reached from "Wijzig deze dag" or by holding a day.
struct TrainingDrawer: View {
    @Environment(AppState.self) private var app

    let week: [AgendaDay]
    let weeks: [Agenda.Week]
    let selected: AgendaDay?
    @Binding var isOpen: Bool
    /// The month the open drawer is showing.
    @Binding var anchor: Date
    let onSelect: (AgendaDay) -> Void
    let onPlan: (AgendaDay) -> Void

    var body: some View {
        VStack(spacing: 0) {
            if isOpen { monthHeader } else { dateHeader }

            if isOpen {
                weekdayHeader
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.top, 6)
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(weeks) { week in
                        AgendaWeekRow(
                            week: week,
                            selected: selected?.key ?? "",
                            onSelect: onSelect,
                            onPlan: onPlan
                        )
                    }
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, 12)
            } else {
                WeekRailView(
                    days: week,
                    selected: selected?.key ?? "",
                    onSelect: onSelect,
                    onPlan: onPlan
                )
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, 18)
            }

            grip
        }
        .padding(.bottom, 4)
        .frame(maxWidth: .infinity)
        .background(SL.Surface.raised)
        .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 30, bottomTrailingRadius: 30, style: .continuous))
        .overlay(alignment: .bottom) { SLHairline() }
        .gesture(
            DragGesture(minimumDistance: 12)
                .onEnded { value in
                    guard abs(value.translation.height) > 24 else { return }
                    withAnimation(.easeOut(duration: SL.Motion.base)) {
                        isOpen = value.translation.height > 0
                    }
                }
        )
    }

    // MARK: - Heads

    /// 41c: the date is the title — the tab bar already says which screen this
    /// is — and beside it where that date stands.
    private var dateHeader: some View {
        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
            Text(title)
                .slTitle()
                .slNumerals()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(SL.Ink.primary)
            Spacer(minLength: SL.Space.s2)
            Text(standing)
                .slMeta()
                .slNumerals()
                .foregroundStyle(SL.Ink.tertiary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, 14)
        .accessibilityElement(children: .combine)
    }

    /// 41d: the month, and a step either side of it.
    private var monthHeader: some View {
        HStack(spacing: SL.Space.s1) {
            Text(month)
                .slTitle()
                .foregroundStyle(SL.Ink.primary)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: SL.Space.s2)
            monthStep("chevron.left", label: "Vorige maand", by: -1)
            monthStep("chevron.right", label: "Volgende maand", by: 1)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, 14)
    }

    private func monthStep(_ symbol: String, label: String, by months: Int) -> some View {
        Button {
            guard let next = Calendar.current.date(byAdding: .month, value: months, to: anchor) else { return }
            withAnimation(.easeOut(duration: SL.Motion.fast)) { anchor = next }
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: SL.Weight.medium))
                .foregroundStyle(SL.Ink.secondary)
                .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var weekdayHeader: some View {
        HStack(spacing: 3) {
            ForEach(Array(week.enumerated()), id: \.offset) { _, day in
                Text(day.weekday)
                    .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                    .foregroundStyle(SL.Ink.tertiary)
                    .frame(maxWidth: .infinity)
            }
        }
        .accessibilityHidden(true)
    }

    /// The grip, and what pulling it does — a gesture nobody has to guess at,
    /// because the words under it say so.
    private var grip: some View {
        Button {
            withAnimation(.easeOut(duration: SL.Motion.base)) { isOpen.toggle() }
        } label: {
            VStack(spacing: 5) {
                Capsule()
                    .fill(Color.white.opacity(0.22))
                    .frame(width: 36, height: 4)
                HStack(spacing: 2) {
                    Text(isOpen ? "Sluit agenda" : "Agenda")
                        .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                        .foregroundStyle(SL.Ink.secondary)
                    Image(systemName: isOpen ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12, weight: SL.Weight.semibold))
                        .foregroundStyle(SL.Ink.secondary)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: SL.Space.hitMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, 6)
        .accessibilityLabel(isOpen ? "Sluit agenda" : "Open agenda")
        .accessibilityHint(isOpen ? "Toont je week weer" : "Toont vier weken")
    }

    // MARK: - Words

    private var title: String {
        guard let selected else { return "" }
        return "\(WeekPlan.fullWeekday(selected.date).capitalized) \(app.display.shortDate(selected.date))"
    }

    /// "vandaag · week 6", "morgen · week 6" — where the selected date stands,
    /// in the same relative words the rest day uses.
    private var standing: String {
        guard let selected else { return "" }
        let number = WeekPlan.number(firstSession: app.sessions.last?.date, on: selected.date)
        return "\(Agenda.when(selected.date)) · week \(number)"
    }

    private var month: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nl_BE")
        formatter.dateFormat = "MMMM"
        return formatter.string(from: anchor).capitalized
    }
}
