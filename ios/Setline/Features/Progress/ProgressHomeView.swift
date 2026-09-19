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
    @Environment(\.dynamicTypeSize) private var typeSize

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
                LichaamSegmentView()
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .slRespondsToTextSize()
    }

    /// Three across, until three across would mean "Histori…". At accessibility
    /// sizes they take a row each and keep their names.
    private var segmentControl: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: 4))
            : AnyLayout(HStackLayout(spacing: 0))

        return layout {
            ForEach(Segment.allCases) { item in
                Button {
                    segment = item
                } label: {
                    Text(item.rawValue)
                        .slBody(segment == item ? SL.Weight.semibold : SL.Weight.medium)
                        .foregroundStyle(segment == item ? SL.Ink.primary : SL.Ink.secondary)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 44)
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
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .fill(SL.Surface.raised)
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                        .strokeBorder(SL.Surface.hairline, lineWidth: 1)
                )
        )
    }

}
