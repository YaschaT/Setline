import SwiftUI
import SetlineCore

/// A drop set's lighter rounds, inside the set they follow: "then − 80 + kg
/// × − 6 +", one line per drop, up to three. Used by the set card and by the
/// set sheet, so both read and behave the same.
struct DropSetEditor: View {
    @Binding var drops: [DropStep]
    /// The exercise's own weight step.
    let step: Decimal
    let display: NumberDisplay

    static let maxDrops = 3

    /// About a fifth lighter than `weight`, on the step, never below it (or none).
    static func next(after weight: Decimal, reps: Int, step: Decimal) -> DropStep {
        let lighter = Estimates.round(weight * Decimal(0.8), toIncrement: step)
        // A set without weight drops to none.
        return DropStep(weightKg: weight > 0 ? max(lighter, step) : 0, reps: max(1, reps))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(Array(drops.enumerated()), id: \.offset) { index, drop in
                HStack(spacing: 0) {
                    Text("then")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(width: 36, alignment: .leading)
                    stepper(value: display.number(drop.weightKg), unit: "kg", label: "drop \(index + 1) weight",
                            minus: { change(index) { $0.weightKg = max(0, $0.weightKg - step) } },
                            plus: { change(index) { $0.weightKg += step } })
                    Text("×").slMeta().foregroundStyle(SL.Ink.secondary).padding(.horizontal, 4)
                    stepper(value: "\(drop.reps)", unit: nil, label: "drop \(index + 1) reps",
                            minus: { change(index) { $0.reps = max(1, $0.reps - 1) } },
                            plus: { change(index) { $0.reps += 1 } })
                    Spacer(minLength: 0)
                    Button {
                        drops.remove(at: index)
                    } label: {
                        Image(systemName: "xmark").font(.system(size: 11, weight: .bold))
                            .foregroundStyle(SL.Ink.secondary)
                            .frame(width: 36, height: SL.Space.hitMin)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove drop \(index + 1)")
                }
            }
            if drops.count < Self.maxDrops, let last = drops.last {
                Button {
                    drops.append(Self.next(after: last.weightKg, reps: last.reps, step: step))
                } label: {
                    Label("Add a drop", systemImage: "plus")
                        .font(.sl(SL.TypeSize.meta, SL.Weight.medium))
                        .foregroundStyle(SL.Signal.attention)
                        .frame(minHeight: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.leading, 36)
            }
        }
        .padding(.horizontal, SL.Space.s3)
        .padding(.vertical, SL.Space.s1)
        .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Signal.attention.opacity(0.08)))
    }

    private func change(_ index: Int, _ edit: (inout DropStep) -> Void) {
        guard drops.indices.contains(index) else { return }
        edit(&drops[index])
        UISelectionFeedbackGenerator().selectionChanged()
    }

    private func stepper(value: String, unit: String?, label: String,
                         minus: @escaping () -> Void, plus: @escaping () -> Void) -> some View {
        HStack(spacing: 0) {
            Button(action: minus) {
                Image(systemName: "minus").font(.system(size: 11, weight: .bold))
                    .frame(width: 32, height: SL.Space.hitMin).contentShape(Rectangle())
            }
            .accessibilityLabel("Less \(label)")
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value).font(.sl(SL.TypeSize.body, SL.Weight.semibold)).slNumerals()
                if let unit { Text(unit).font(.sl(SL.TypeSize.micro, SL.Weight.regular)).foregroundStyle(SL.Ink.secondary) }
            }
            .lineLimit(1)
            .fixedSize()
            .frame(minWidth: 30)
            Button(action: plus) {
                Image(systemName: "plus").font(.system(size: 11, weight: .bold))
                    .frame(width: 32, height: SL.Space.hitMin).contentShape(Rectangle())
            }
            .accessibilityLabel("More \(label)")
        }
        .buttonStyle(.plain)
        .foregroundStyle(SL.Ink.primary)
    }
}

/// L / R / Both for a one-sided exercise: one is always picked.
struct SetSidePicker: View {
    @Binding var side: SetSide

    var body: some View {
        HStack(spacing: 2) {
            ForEach(SetSide.allCases, id: \.self) { option in
                Button {
                    side = option
                    UISelectionFeedbackGenerator().selectionChanged()
                } label: {
                    Text(option.label)
                        .font(.sl(SL.TypeSize.meta, side == option ? SL.Weight.semibold : SL.Weight.medium))
                        .foregroundStyle(side == option ? SL.Signal.onAction : SL.Ink.secondary)
                        .padding(.horizontal, option == .both ? SL.Space.s3 : 0)
                        .frame(minWidth: 34, minHeight: 30)
                        .background(Capsule().fill(side == option ? SL.Signal.action : .clear))
                        .frame(minHeight: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(option == .both ? "Both sides" : option == .left ? "Left side" : "Right side")
                .accessibilityAddTraits(side == option ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(.horizontal, 2)
        .background(Capsule().fill(SL.Surface.raised2).frame(height: 34))
    }

    /// Both by default; after a left set the right, after a right set the left.
    static func defaultSide(after previous: SetSide?) -> SetSide {
        switch previous {
        case .left: return .right
        case .right: return .left
        default: return .both
        }
    }
}

/// The reps tile when the two sides of a set differ: "L − 8 +" over
/// "R − 7 +", in the reps tile's own place and size.
struct PerSideRepsTile: View {
    @Binding var reps: SideReps

    var body: some View {
        VStack(spacing: 2) {
            Text("reps per side")
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            row("L", value: reps.left, spoken: "Left") { reps.left = max(1, min(100, reps.left + $0)) }
            row("R", value: reps.right, spoken: "Right") { reps.right = max(1, min(100, reps.right + $0)) }
        }
        .padding(.horizontal, SL.Space.s2)
        .padding(.top, SL.Space.s2)
        .padding(.bottom, SL.Space.s1)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
        .overlay(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).strokeBorder(SL.Signal.action, lineWidth: 1))
    }

    private func row(_ side: String, value: Int, spoken: String, change: @escaping (Int) -> Void) -> some View {
        HStack(spacing: 0) {
            Text(side)
                .font(.sl(SL.TypeSize.meta, SL.Weight.bold))
                .foregroundStyle(SL.Ink.secondary)
                .frame(width: 18, alignment: .leading)
            step("minus") { change(-1) }
            Text("\(value)")
                .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                .monospacedDigit()
                .foregroundStyle(SL.Ink.primary)
                .frame(minWidth: 30)
                .contentTransition(.numericText(value: Double(value)))
            step("plus") { change(1) }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(spoken) side, \(value) reps")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: change(1)
            case .decrement: change(-1)
            @unknown default: break
            }
        }
    }

    private func step(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button {
            action()
            UISelectionFeedbackGenerator().selectionChanged()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(SL.Ink.primary)
                .frame(width: 32, height: 36)
                .background(RoundedRectangle(cornerRadius: SL.Radius.sm, style: .continuous).fill(SL.Surface.hairline))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
