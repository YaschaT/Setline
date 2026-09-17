import SwiftUI
import SetlineCore

/// Artboard 20 · segment Historiek, rows shaped by the ≥1024 layout (27):
/// `Push A · 7 sep` / `18/18 · 53 min` / `6.480 kg`.
///
/// A list, and only a list. There is no approved session detail to open, so a
/// row does not pretend to lead anywhere.
struct HistoriekSegmentView: View {
    @Environment(AppState.self) private var app
    @State private var rows: [SessionHistoryRow] = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if rows.isEmpty {
                    emptyState
                } else {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(row.dayLabel) · \(app.display.shortDate(row.date))")
                                    .slBody(SL.Weight.medium)
                                if let detail = detail(row) {
                                    Text(detail).slMeta().foregroundStyle(SL.Ink.tertiary)
                                }
                            }
                            Spacer(minLength: SL.Space.s4)
                            Text(app.display.volumeKg(row.volumeKg)).slBody(SL.Weight.semibold)
                        }
                        .padding(.vertical, 14)
                        .overlay(alignment: .bottom) {
                            if index < rows.count - 1 { SLHairline() }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            .padding(.horizontal, SL.Space.s5)
            .padding(.top, SL.Space.s5)
        }
        .task(id: app.sessions.count) { rows = SessionHistory.rows(from: app.sessions) }
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
