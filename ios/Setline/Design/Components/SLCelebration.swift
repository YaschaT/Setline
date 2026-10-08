import SwiftUI
import SetlineCore

/// A moment worth marking: a new PR, a week goal, a milestone.
struct Celebration: Identifiable, Equatable {
    let id = UUID()
    let symbol: String
    let title: String
    let detail: String
    /// A milestone shows its badge instead of a symbol.
    var badge: Milestone? = nil
}

/// The celebration itself: a short card that springs in at the top, with a
/// success haptic, and leaves by itself after a couple of seconds (or on a
/// tap). Brief on purpose — it marks the moment, then gets out of the way of
/// the next set. With Reduce Motion it fades instead of springing.
private struct SLCelebrationModifier: ViewModifier {
    @Binding var item: Celebration?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let item {
                HStack(spacing: SL.Space.s3) {
                    if let badge = item.badge {
                        SLBadge(milestone: badge, size: 52)
                    } else {
                        Image(systemName: item.symbol)
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundStyle(SL.Signal.onAction)
                            .frame(width: 48, height: 48)
                            .background(Circle().fill(SL.Signal.action))
                            .symbolEffect(.bounce, value: item.id)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.title)
                            .slLead(SL.Weight.semibold)
                            .foregroundStyle(SL.Ink.primary)
                        Text(item.detail)
                            .slMeta()
                            .monospacedDigit()
                            .foregroundStyle(SL.Ink.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(SL.Space.s4)
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                        .fill(SL.Surface.raised)
                        .shadow(color: .black.opacity(0.5), radius: 24, y: 10)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                        .strokeBorder(SL.Signal.action.opacity(0.5), lineWidth: 1)
                )
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s2)
                .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                .onTapGesture { dismiss() }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isStaticText)
                .task(id: item.id) {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    AccessibilityNotification.Announcement("\(item.title). \(item.detail)").post()
                    try? await Task.sleep(for: .seconds(2.6))
                    if self.item?.id == item.id { dismiss() }
                }
            }
        }
        .animation(reduceMotion ? .easeOut(duration: 0.2) : .spring(response: 0.42, dampingFraction: 0.78), value: item?.id)
    }

    private func dismiss() { item = nil }
}

extension View {
    func slCelebration(_ item: Binding<Celebration?>) -> some View {
        modifier(SLCelebrationModifier(item: item))
    }
}
