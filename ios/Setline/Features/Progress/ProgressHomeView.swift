import SwiftUI
import SetlineCore

/// Artboard 20 · Progressie.
///
/// One subject at a time: the segment picks it and the chosen subject gets the
/// whole screen, rather than three half-screens competing for the squint test.
struct ProgressHomeView: View {
    enum Segment: String, CaseIterable, Identifiable {
        case kracht = "Kracht"
        case lichaam = "Lichaam"
        case historiek = "Historiek"

        var id: String { rawValue }
    }

    @State private var segment: Segment = .kracht

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Progressie")
                .slTitle()
                .padding(.horizontal, SL.Space.s5)
                .padding(.top, SL.Space.s4)

            segmentControl
                .padding(.horizontal, SL.Space.s5)
                .padding(.top, SL.Space.s4)

            switch segment {
            case .kracht:
                StrengthSegmentView()
            case .historiek:
                HistoriekSegmentView()
            case .lichaam:
                notYet
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .slRespondsToTextSize()
    }

    private var segmentControl: some View {
        HStack(spacing: 0) {
            ForEach(Segment.allCases) { item in
                Button {
                    segment = item
                } label: {
                    Text(item.rawValue)
                        .slBody(segment == item ? SL.Weight.semibold : SL.Weight.medium)
                        .foregroundStyle(segment == item ? SL.Ink.primary : SL.Ink.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(
                            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                .fill(segment == item ? SL.Surface.raised2 : .clear)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(segment == item ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .fill(SL.Surface.raised)
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                        .strokeBorder(SL.Surface.hairline, lineWidth: 1)
                )
        )
    }

    /// The next two phases fill these in; until then the segment says so
    /// rather than showing an empty subject.
    private var notYet: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text("Nog niet beschikbaar").slLead()
            Text("Deze weergave volgt in de volgende stap.")
                .slBody()
                .foregroundStyle(SL.Ink.secondary)
        }
        .padding(.horizontal, SL.Space.s5)
        .padding(.top, SL.Space.s6)
    }
}
