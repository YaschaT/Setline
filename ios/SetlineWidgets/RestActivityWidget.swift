import ActivityKit
import SetlineCore
import SwiftUI
import WidgetKit

/// The rest countdown in the Dynamic Island and on the Lock Screen.
///
/// The system counts down by itself (`Text(timerInterval:)`), so the time is
/// right even while the app is suspended. Once the end passes, the activity
/// goes stale and says the rest is over instead of showing 0:00.
struct RestActivityWidget: Widget {
    private static let lime = Color(red: 200 / 255, green: 255 / 255, blue: 102 / 255)
    private static let mint = Color(red: 114 / 255, green: 239 / 255, blue: 208 / 255)
    private static let ground = Color(red: 6 / 255, green: 9 / 255, blue: 8 / 255)
    private static let secondary = Color(red: 154 / 255, green: 166 / 255, blue: 161 / 255)

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestActivityAttributes.self) { context in
            lockScreen(context)
                .activityBackgroundTint(Self.ground)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("Rest", systemImage: "timer")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Self.secondary)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    countdown(context, size: 28)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        bar(context)
                        Text(context.isStale ? "Rest done · \(context.attributes.next)" : "Next: \(context.attributes.next)")
                            .font(.footnote)
                            .foregroundStyle(context.isStale ? Self.lime : Self.secondary)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundStyle(Self.mint)
            } compactTrailing: {
                countdown(context, size: 15)
                    .frame(width: 44)
            } minimal: {
                Image(systemName: context.isStale ? "checkmark" : "timer")
                    .foregroundStyle(context.isStale ? Self.lime : Self.mint)
            }
        }
    }

    private func lockScreen(_ context: ActivityViewContext<RestActivityAttributes>) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.isStale ? "Rest done" : "Rest")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(context.isStale ? Self.lime : Self.secondary)
                    Text(context.attributes.exercise)
                        .font(.footnote)
                        .foregroundStyle(Self.secondary)
                        .lineLimit(1)
                }
                Spacer()
                countdown(context, size: 34)
            }
            bar(context)
            Text(context.isStale ? "Time for \(context.attributes.next.lowercased())" : "Next: \(context.attributes.next)")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.8))
                .lineLimit(1)
        }
        .padding(16)
    }

    @ViewBuilder
    private func countdown(_ context: ActivityViewContext<RestActivityAttributes>, size: CGFloat) -> some View {
        if context.isStale {
            Text("0:00")
                .font(.system(size: size, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Self.lime)
        } else {
            Text(timerInterval: context.state.startedAt...context.state.endsAt, countsDown: true)
                .font(.system(size: size, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
                .foregroundStyle(.white)
        }
    }

    private func bar(_ context: ActivityViewContext<RestActivityAttributes>) -> some View {
        ProgressView(
            timerInterval: context.state.startedAt...context.state.endsAt,
            countsDown: true,
            label: { EmptyView() },
            currentValueLabel: { EmptyView() }
        )
        .tint(Self.mint)
    }
}
