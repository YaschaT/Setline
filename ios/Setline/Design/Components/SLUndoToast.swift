import SwiftUI

/// A short confirmation directly above the primary action, with an undo when
/// there is something to undo.
///
/// It lives in the bottom inset, so it is visible wherever the session is
/// scrolled and can never cover a set row. It leaves after the design
/// system's undo window — except while VoiceOver runs, where a five-second
/// target is a timing trap (WCAG 2.2.1) and it stays until dismissed.
struct SLUndoToast: View {
    let message: String
    let onUndo: (() -> Void)?
    let onDismiss: () -> Void

    var body: some View {
        // 16 draws the one undo in the bar: a 54-high capsule on raised2 with
        // the .16 edge, 20 in from each end, the message at 15/500 and
        // `Ongedaan maken` in lime at the same size.
        HStack(alignment: .center, spacing: SL.Space.s3) {
            Text(message)
                .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                .foregroundStyle(SL.Ink.primary)
                .fixedSize(horizontal: false, vertical: true)
                // A message that wraps keeps clear of the capsule's ends.
                .padding(.vertical, SL.Space.s3)
            Spacer(minLength: SL.Space.s2)
            if let onUndo {
                Button(action: onUndo) {
                    Text("Ongedaan maken")
                        .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                        .foregroundStyle(SL.Signal.action)
                        .fixedSize()
                        .slHitTarget()
                }
                .buttonStyle(.plain)
            } else {
                Button(action: onDismiss) {
                    Text("Sluiten")
                        .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                        .foregroundStyle(SL.Ink.tertiary)
                        .fixedSize()
                        .slHitTarget()
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, SL.Space.s5)
        .frame(maxWidth: .infinity, minHeight: SL.Metric.primaryPillHeight, alignment: .leading)
        .slBorderBox()
        // The pill's own radius, 27, rather than a capsule: a message that
        // wraps at a large text size keeps square enough ends to stay inside.
        .background(shape.fill(SL.Surface.raised2))
        .overlay(shape.strokeBorder(SL.Surface.hairlineStrong, lineWidth: SL.Metric.border))
        .accessibilityElement(children: .contain)
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: SL.Metric.primaryPillHeight / 2, style: .continuous)
    }
}
