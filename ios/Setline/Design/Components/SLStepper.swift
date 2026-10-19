import SwiftUI

/// Redesign 1b · − value +, one tap per step.
///
/// A tile on surface-2 with its label centred above: two 44pt buttons and the
/// number between them at 34. A value the reader has moved off what was
/// proposed turns lime inside a lime edge ("aangepast"), so a correction is
/// visible before it is saved.
///
/// No keyboard and no modal on the default path; where the design gives the
/// number a destination of its own, tapping it goes there.
struct SLStepper: View {
    enum Level {
        /// The input card and the set sheet: the value at 34.
        case onRaised
        /// A supporting control inside a card: the value at 21.
        case onRaised2
    }

    let label: String
    let display: String
    var level: Level = .onRaised
    /// Set when no plate can produce the next increment:
    /// "gewicht · uit (geen schijven)".
    var disabledNote: String?
    /// The value was changed by hand and not saved yet.
    var isChanged = false
    /// Tapping the value itself, where the design gives it a destination —
    /// the weight opens a number field for a load off the step.
    var onTapValue: (() -> Void)?
    var valueHint: String?
    /// Typing the value in place: tapping the number turns it into a field
    /// with the number pad, right where it is — no sheet. Called with what
    /// was typed when it is confirmed (✓, or tapping elsewhere).
    var onTyped: ((String) -> Void)?
    var keyboard: UIKeyboardType = .decimalPad
    /// Opens with the field already typing — a first set with no weight yet.
    var startsTyping = false
    let onDecrement: () -> Void
    let onIncrement: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var typing = false
    @State private var typed = ""
    @FocusState private var fieldFocused: Bool

    private var valueSize: CGFloat { level == .onRaised ? SL.TypeSize.display : SL.TypeSize.title }
    private var ink: Color {
        if disabledNote != nil { return SL.Ink.tertiary }
        return isChanged ? SL.Signal.action : SL.Ink.primary
    }

    /// The number keeps every one of its characters at every text size: it
    /// steps down a size before it would ever run under the + button. Chosen
    /// explicitly with `ViewThatFits` — `minimumScaleFactor` does not shrink
    /// text drawn with the exact line height, so "10" in the 140pt reps tile
    /// used to slide under the +.
    private func number(_ size: CGFloat, fills: Bool) -> some View {
        Text(display)
            .font(.sl(size, SL.Weight.semibold))
            .monospacedDigit()
            .slLineHeight(1, size: size)
            .foregroundStyle(ink)
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: fills)
    }

    @ViewBuilder
    private func value(fills: Bool) -> some View {
        let text = ViewThatFits(in: .horizontal) {
            number(valueSize, fills: fills)
            number(valueSize * 0.82, fills: fills)
            number(valueSize * 0.68, fills: fills)
            number(valueSize * 0.55, fills: fills)
        }
        .frame(maxWidth: .infinity, alignment: fills ? .leading : .center)
        .clipped()

        if onTyped != nil, typing {
            TextField("", text: $typed, prompt: Text(display == "—" ? "kg" : display).foregroundStyle(SL.Ink.tertiary))
                .keyboardType(keyboard)
                .font(.sl(valueSize * 0.82, SL.Weight.semibold))
                .monospacedDigit()
                .multilineTextAlignment(.center)
                .foregroundStyle(SL.Signal.action)
                .tint(SL.Signal.action)
                .focused($fieldFocused)
                .frame(maxWidth: .infinity, minHeight: SL.Space.hitMin)
                // Focused once the field is on screen; asked right away it can
                // be dropped while the card is still laying out.
                .task {
                    try? await Task.sleep(for: .milliseconds(250))
                    fieldFocused = true
                }
                .onChange(of: fieldFocused) { was, focused in if was, !focused { confirm() } }
                // Applied as it is typed, so Save works without tapping ✓.
                .onChange(of: typed) { _, now in
                    let value = now.trimmingCharacters(in: .whitespaces)
                    if !value.isEmpty, Decimal(string: value.replacingOccurrences(of: ",", with: ".")) != nil { onTyped?(value) }
                }
                .onSubmit { confirm() }
                .accessibilityLabel("\(label), type a value")
        } else if onTyped != nil {
            Button {
                typed = ""
                typing = true
            } label: {
                text
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else if let onTapValue {
            Button(action: onTapValue) {
                text
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            text
        }
    }

    /// Takes what was typed — nothing typed keeps the value — and puts the
    /// number back.
    private func confirm() {
        guard typing else { return }
        typing = false
        fieldFocused = false
        let value = typed.trimmingCharacters(in: .whitespaces)
        if !value.isEmpty { onTyped?(value) }
    }

    var body: some View {
        VStack(alignment: .center, spacing: 2) {
            Text((disabledNote.map { "\(label) · \($0)" } ?? label).lowercased())
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: typeSize.isAccessibilitySize ? .leading : .center)

            if typeSize.isAccessibilitySize {
                // At accessibility sizes the number gets the whole row and the
                // controls move to their own: squeezed between two buttons it
                // would be the one thing on screen that could not be read.
                value(fills: true)
                HStack(spacing: SL.Space.s2) {
                    control("−", expands: true, action: onDecrement)
                    control("+", expands: true, action: onIncrement)
                }
                .padding(.top, SL.Space.s1)
            } else {
                HStack(spacing: 0) {
                    control("−", action: onDecrement)
                        .opacity(typing ? 0.3 : 1)
                        .disabled(typing)
                    value(fills: false)
                    if typing {
                        // The number pad has no return key: this is it.
                        Button { confirm() } label: {
                            Image(systemName: "checkmark")
                                .font(.system(size: 17, weight: .bold))
                                .foregroundStyle(SL.Signal.onAction)
                                .frame(minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin)
                                .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Signal.action))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Done")
                    } else {
                        control("+", action: onIncrement)
                    }
                }
            }
        }
        .padding(.horizontal, SL.Space.s2)
        .padding(.top, SL.Space.s2)
        .padding(.bottom, 10)
        .onAppear { if startsTyping, onTyped != nil, !typing { typed = ""; typing = true } }
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .fill(SL.Surface.raised2)
        )
        // Drawn inside, so the tile keeps its size when the edge appears.
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .strokeBorder(isChanged ? SL.Signal.action : Color.clear, lineWidth: 1)
        )
        // One adjustable element: swipe up or down to step, and the value's
        // own destination as a named action. While typing, the field itself.
        .accessibilityElement(children: typing ? .contain : .ignore)
        .accessibilityLabel("\(label), \(display)\(isChanged ? ", changed" : "")")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: onIncrement()
            case .decrement: onDecrement()
            @unknown default: break
            }
        }
        .accessibilityActions {
            if onTyped != nil {
                Button(valueHint ?? "Type a value") { typed = ""; typing = true }
            } else if let onTapValue {
                Button(valueHint ?? "Type a value", action: onTapValue)
            }
        }
    }

    private func control(_ glyph: String, expands: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(glyph)
                .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                .foregroundStyle(disabledNote == nil ? SL.Ink.primary : SL.Ink.tertiary)
                .frame(minWidth: SL.Space.hitMin, maxWidth: expands ? .infinity : nil, minHeight: SL.Space.hitMin)
        }
        .buttonStyle(SLStepButtonStyle())
        .disabled(disabledNote != nil)
    }
}

/// A stepper's − and +: the hairline grey at rest, one step lighter while it
/// is held.
private struct SLStepButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
        return configuration.label
            .background(shape.fill(configuration.isPressed ? SL.Surface.hairlineStrong : SL.Surface.hairline))
            .contentShape(shape)
            .slFocusRing(shape)
    }
}
