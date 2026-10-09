import SwiftUI

/// A press you can feel: the element sinks a little under the finger and
/// springs back on release, with a light tap from the phone as it goes down.
/// For the playful surfaces — week marks, badges, the streak — where a
/// plain highlight would feel flat. Reduce Motion keeps the haptic and drops
/// the movement.
struct SLPressStyle: ButtonStyle {
    /// How far it sinks: 0.96 for rows and cards, lower for small targets.
    var scale: CGFloat = 0.96
    /// Small targets also tilt up a little as they come back, like a token.
    var bounces = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed && !reduceMotion
        return configuration.label
            .scaleEffect(pressed ? scale : 1)
            .brightness(configuration.isPressed ? -0.04 : 0)
            .animation(
                reduceMotion ? nil
                    : pressed ? .easeOut(duration: 0.1)
                    : bounces ? .spring(response: 0.35, dampingFraction: 0.45) : .spring(response: 0.3, dampingFraction: 0.6),
                value: configuration.isPressed
            )
            .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.7), trigger: configuration.isPressed) { _, isDown in isDown }
    }
}
