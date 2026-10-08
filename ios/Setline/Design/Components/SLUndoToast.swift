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
        // The one undo in the dock: as high as the action it sits above, on
        // surface-2 inside the strong hairline, the message at 15 and
        // `Ongedaan maken` in lime at the same size.
        HStack(alignment: .center, spacing: SL.Space.s3) {
            Text(message)
                .font(.sl(SL.TypeSize.body, SL.Weight.regular))
                .foregroundStyle(SL.Ink.primary)
                .fixedSize(horizontal: false, vertical: true)
                // A message that wraps keeps clear of the capsule's ends.
                .padding(.vertical, SL.Space.s3)
            Spacer(minLength: SL.Space.s2)
            if let onUndo {
                Button(action: onUndo) {
                    Text("Ongedaan maken")
                        .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                        .foregroundStyle(SL.Signal.action)
                        .fixedSize()
                        .slHitTarget()
                }
                .buttonStyle(.plain)
            } else {
                Button(action: onDismiss) {
                    Text("Close")
                        .font(.sl(SL.TypeSize.body, SL.Weight.regular))
                        .foregroundStyle(SL.Ink.secondary)
                        .fixedSize()
                        .slHitTarget()
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, SL.Space.s4)
        .frame(maxWidth: .infinity, minHeight: SL.Metric.primaryPillHeight, alignment: .leading)
        .slBorderBox()
        .background(shape.fill(SL.Surface.raised2))
        .overlay(shape.strokeBorder(SL.Surface.hairlineStrong, lineWidth: SL.Metric.border))
        .accessibilityElement(children: .contain)
    }

    /// The action's own radius: a message that wraps at a large text size
    /// keeps square enough corners to stay inside.
    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
    }
}
