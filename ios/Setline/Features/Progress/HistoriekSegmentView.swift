import SwiftUI
import SetlineCore

/// Artboard 20 · segment Historiek, rows shaped by the ≥1024 layout (27):
/// `Push A · 7 sep` / `18/18 · 53 min` / `6.480 kg`.
///
/// The row is the way into the workout it describes: the design draws the
/// list, and `SessionDetailView` is the smallest screen that lets a logged
/// set be read back and corrected.
struct HistoriekSegmentView: View {
    @Environment(AppState.self) private var app
    @State private var rows: [SessionHistoryRow] = []
    @State private var opened: Opened?

    /// The workout the reader asked to see.
    private struct Opened: Identifiable { let id: String }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if rows.isEmpty {
                    emptyState
                } else {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                        Button { opened = Opened(id: row.id) } label: {
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(row.dayLabel) · \(app.display.shortDate(row.date))")
                                        .slBody(SL.Weight.medium)
                                        .foregroundStyle(SL.Ink.primary)
                                    if let detail = detail(row) {
                                        Text(detail).slMeta().foregroundStyle(SL.Ink.tertiary)
                                    }
                                }
                                Spacer(minLength: SL.Space.s4)
                                Text(app.display.volumeKg(row.volumeKg))
                                    .slBody(SL.Weight.semibold)
                                    .foregroundStyle(SL.Ink.primary)
                            }
                            // The whole row is the target, and it clears 44
                            // whatever the text size.
                            .padding(.vertical, 14)
                            .frame(minHeight: SL.Space.hitMin)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .overlay(alignment: .bottom) {
                            if index < rows.count - 1 { SLHairline() }
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(accessibilityLabel(row))
                        .accessibilityHint("Dubbeltik om de sessie te openen")
                    }
                }
            }
            .padding(.horizontal, SL.Space.s5)
            .padding(.top, SL.Space.s5)
            // The room Kracht and Lichaam leave too, so the last session never
            // ends against the tab bar.
            .padding(.bottom, SL.Space.s6)
        }
        .task(id: app.revision) { rows = SessionHistory.rows(from: app.sessions) }
        .fullScreenCover(item: $opened) { workout in
            SessionDetailView(sessionID: workout.id, onClose: { opened = nil })
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
            parts.append("\(counts.completed)/\(counts.planned)")
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
        .padding(.top, SL.Space.s2)
        .fixedSize(horizontal: false, vertical: true)
    }
}
