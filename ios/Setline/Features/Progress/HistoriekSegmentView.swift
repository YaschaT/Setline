import SwiftUI
import SetlineCore

/// Logboek: every logged workout, newest first, grouped by month.
///
/// Artboard 20's rows (`Push A · 7 sep` / `18/18 · 53 min` / `6.480 kg`),
/// now in one dedicated place reached from Progressie's head. A row opens
/// `SessionDetailView`, the one screen that reads a saved workout back and
/// corrects it; swiping a row left deletes the workout after asking, as the
/// detail screen's own button does.
struct HistoriekSegmentView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var rows: [SessionHistoryRow] = []
    @State private var opened: Opened?
    @State private var deleting: SessionHistoryRow?

    /// The workout the reader asked to see.
    private struct Opened: Identifiable { let id: String }

    /// Rows by month, newest month first.
    private var months: [(title: String, rows: [SessionHistoryRow])] {
        var order: [String] = []
        var grouped: [String: [SessionHistoryRow]] = [:]
        for row in rows {
            let title = Self.month.string(from: row.date).capitalized(with: Locale(identifier: "en_US"))
            if grouped[title] == nil { order.append(title) }
            grouped[title, default: []].append(row)
        }
        return order.map { ($0, grouped[$0] ?? []) }
    }

    private static let month: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.dateFormat = "LLLL yyyy"
        return formatter
    }()

    var body: some View {
        Group {
            if rows.isEmpty {
                emptyState
                    .padding(.horizontal, SL.Space.s5)
                    .padding(.top, SL.Space.s5)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            } else {
                List {
                    ForEach(months, id: \.title) { month in
                        // The month heads its cards as a row of its own, so
                        // it scrolls with them instead of pinning over them.
                        HStack(alignment: .firstTextBaseline) {
                            Text(month.title).slLead().foregroundStyle(SL.Ink.primary)
                            Spacer()
                            Text(month.rows.count == 1 ? "1 session" : "\(month.rows.count) sessions")
                                .slMeta()
                                .foregroundStyle(SL.Ink.secondary)
                        }
                        .padding(.horizontal, SL.Space.s1)
                        .listRowInsets(EdgeInsets(top: SL.Space.s5, leading: SL.Space.gutterSession, bottom: SL.Space.s1, trailing: SL.Space.gutterSession))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .accessibilityAddTraits(.isHeader)

                        ForEach(month.rows) { row in
                            rowView(row)
                                .listRowInsets(EdgeInsets(top: 4, leading: SL.Space.gutterSession, bottom: 4, trailing: SL.Space.gutterSession))
                                .listRowBackground(Color.clear)
                                .listRowSeparator(.hidden)
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button("Delete", systemImage: "trash") { deleting = row }
                                        .tint(SL.Signal.loss)
                                }
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .contentMargins(.bottom, SL.Space.s6, for: .scrollContent)
            }
        }
        .task(id: app.revision) { rows = SessionHistory.rows(from: app.sessions) }
        .fullScreenCover(item: $opened) { workout in
            SessionDetailView(sessionID: workout.id, onClose: { opened = nil })
        }
        .alert(
            "Delete this session?",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })
        ) {
            Button("Cancel", role: .cancel) { deleting = nil }
            Button("Delete", role: .destructive) {
                guard let row = deleting else { return }
                deleting = nil
                Task { await app.removeSession(id: row.id) }
            }
        } message: {
            Text(deleting.map { "\($0.dayLabel) on \(app.display.shortDate($0.date)) disappears from your log and your progress, on the web too." } ?? "")
        }
    }

    /// A workout as a card: its kind of day as an icon, when, how complete,
    /// and the weight it moved.
    private func rowView(_ row: SessionHistoryRow) -> some View {
        let complete = row.counts.map { $0.completed >= $0.planned } ?? ((row.completionPercent ?? 0) >= 100)
        return Button { opened = Opened(id: row.id) } label: {
            HStack(alignment: .center, spacing: SL.Space.s3) {
                SLWorkoutSymbol(dayName: row.dayLabel, size: 21)
                    .foregroundStyle(complete ? SL.Signal.action : SL.Ink.primary)
                    .frame(width: 44, height: 44)
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                            .fill(complete ? SL.Signal.actionTint : SL.Surface.raised2)
                    )
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.dayLabel)
                        .slBody(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                    Text(([WeekPlan.fullWeekday(row.date).prefix(3) + " " + app.display.shortDate(row.date)] + (detail(row).map { [$0] } ?? [])).joined(separator: " · "))
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(typeSize.isAccessibilitySize ? 3 : 1)
                        .minimumScaleFactor(0.85)
                    // Large text: the volume moves under the name, so the
                    // date is never the part that gets cut.
                    if typeSize.isAccessibilitySize {
                        Text("\(app.display.volumeKg(row.volumeKg)) moved")
                            .slMeta(SL.Weight.semibold)
                            .slNumerals()
                            .foregroundStyle(SL.Ink.primary)
                    }
                }
                Spacer(minLength: SL.Space.s2)
                if !typeSize.isAccessibilitySize {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(app.display.volumeKg(row.volumeKg))
                        .slBody(SL.Weight.semibold)
                        .slNumerals()
                        .foregroundStyle(SL.Ink.primary)
                    Text("moved")
                        .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                        .foregroundStyle(SL.Ink.secondary)
                }
                }
                SLGlyph(name: .chevronRight, size: 13).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.horizontal, SL.Space.s4)
            .padding(.vertical, SL.Space.s3)
            .frame(minHeight: SL.Space.hitMin)
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                    .fill(SL.Surface.raised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                    .strokeBorder(SL.Surface.hairline, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel(row))
        .accessibilityHint("Double-tap to open the session")
        .accessibilityActions {
            Button("Delete") { deleting = row }
        }
    }

    private func accessibilityLabel(_ row: SessionHistoryRow) -> String {
        var parts = ["\(row.dayLabel), \(app.display.shortDate(row.date))"]
        if let detail = detail(row) { parts.append(detail) }
        parts.append(app.display.volumeKg(row.volumeKg))
        return parts.joined(separator: ", ")
    }

    /// Sets when the session counted them, the stored percentage when it did
    /// not, and time only when it was recorded.
    private func detail(_ row: SessionHistoryRow) -> String? {
        var parts: [String] = []
        if let counts = row.counts {
            parts.append("\(counts.completed)/\(counts.planned) sets")
        } else if let percent = row.completionPercent {
            parts.append("\(percent)%")
        }
        if let seconds = row.durationSeconds {
            parts.append(app.display.minutes(seconds))
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text("No sessions yet").slLead()
            Text("Your first session sets the starting weights.")
                .slBody()
                .foregroundStyle(SL.Ink.secondary)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}
