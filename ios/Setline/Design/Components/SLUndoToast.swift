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
        HStack(alignment: .center, spacing: SL.Space.s3) {
            // One line stays within the 44pt the undo button sets; a message
            // that wraps gets room above and below instead of touching the edge.
            Text(message)
                .slMeta()
                .foregroundStyle(SL.Ink.primary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.vertical, 10)
            Spacer(minLength: SL.Space.s2)
            if let onUndo {
                Button(action: onUndo) {
                    Text("Ongedaan maken")
                        .slMeta(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                        .fixedSize()
                        .padding(.horizontal, SL.Space.s2)
                        .slHitTarget()
                }
                .buttonStyle(.plain)
            } else {
                Button(action: onDismiss) {
                    Text("Sluiten")
                        .slMeta()
                        .foregroundStyle(SL.Ink.tertiary)
                        .fixedSize()
                        .padding(.horizontal, SL.Space.s2)
                        .slHitTarget()
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.leading, SL.Space.s4)
        .padding(.trailing, SL.Space.s1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
    }
}
