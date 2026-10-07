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
            let title = Self.month.string(from: row.date).capitalized(with: Locale(identifier: "nl_BE"))
            if grouped[title] == nil { order.append(title) }
            grouped[title, default: []].append(row)
        }
        return order.map { ($0, grouped[$0] ?? []) }
    }

    private static let month: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nl_BE")
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
                        Section {
                            ForEach(month.rows) { row in
                                rowView(row)
                                    .listRowInsets(EdgeInsets(top: 0, leading: SL.Space.s5, bottom: 0, trailing: SL.Space.s5))
                                    .listRowBackground(Color.clear)
                                    .listRowSeparatorTint(SL.Surface.hairline)
                                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                        Button("Verwijder", systemImage: "trash") { deleting = row }
                                            .tint(SL.Signal.loss)
                                    }
                            }
                        } header: {
                            HStack(alignment: .firstTextBaseline) {
                                Text(month.title).slLead().foregroundStyle(SL.Ink.primary)
                                Spacer()
                                Text(month.rows.count == 1 ? "1 sessie" : "\(month.rows.count) sessies")
                                    .slMeta()
                                    .foregroundStyle(SL.Ink.secondary)
                            }
                            .textCase(nil)
                            // On the rows' own edge, not the list's header inset.
                            .padding(.horizontal, SL.Space.s5 - 16)
                            .padding(.top, SL.Space.s2)
                            .padding(.bottom, SL.Space.s1)
                            .accessibilityAddTraits(.isHeader)
                        }
                    }
                }
                .listStyle(.plain)
                .listSectionSpacing(SL.Space.s4)
                .scrollContentBackground(.hidden)
                .contentMargins(.bottom, SL.Space.s6, for: .scrollContent)
            }
        }
        .task(id: app.revision) { rows = SessionHistory.rows(from: app.sessions) }
        .fullScreenCover(item: $opened) { workout in
            SessionDetailView(sessionID: workout.id, onClose: { opened = nil })
        }
        .alert(
            "Deze sessie verwijderen?",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })
        ) {
            Button("Annuleer", role: .cancel) { deleting = nil }
            Button("Verwijder", role: .destructive) {
                guard let row = deleting else { return }
                deleting = nil
                Task { await app.removeSession(id: row.id) }
            }
        } message: {
            Text(deleting.map { "\($0.dayLabel) van \(app.display.shortDate($0.date)) verdwijnt uit je logboek en je progressie, ook op het web." } ?? "")
        }
    }

    private func rowView(_ row: SessionHistoryRow) -> some View {
        Button { opened = Opened(id: row.id) } label: {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(row.dayLabel) · \(WeekPlan.fullWeekday(row.date).prefix(2).lowercased()) \(app.display.shortDate(row.date))")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.primary)
                    if let detail = detail(row) {
                        Text(detail).slMeta().foregroundStyle(SL.Ink.secondary)
                    }
                }
                Spacer(minLength: SL.Space.s4)
                Text(app.display.volumeKg(row.volumeKg))
                    .slBody(SL.Weight.semibold)
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                SLGlyph(name: .chevronRight, size: 13).foregroundStyle(SL.Ink.tertiary)
            }
            // The whole row is the target, and it clears 44 whatever the
            // text size.
            .padding(.vertical, 14)
            .frame(minHeight: SL.Space.hitMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel(row))
        .accessibilityHint("Dubbeltik om de sessie te openen")
        .accessibilityActions {
            Button("Verwijder") { deleting = row }
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
            Text("Nog geen sessies").slLead()
            Text("Je eerste sessie zet de startgewichten.")
                .slBody()
                .foregroundStyle(SL.Ink.secondary)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}
