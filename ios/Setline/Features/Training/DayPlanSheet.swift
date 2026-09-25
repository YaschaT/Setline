import SwiftUI
import SetlineCore

/// Artboards 41e–41g · "Wijzig deze dag".
///
/// One date, one assignment. The sheet says what the date holds now, offers
/// the sessions of the active programme, rest, and the programme's own
/// standard, and names what the button will do before it does it. It changes
/// which session belongs to this date — never the exercises inside a session,
/// and never another date.
///
/// A date whose session is logged cannot be assigned at all (41g): it belongs
/// to what was done on it, and the sheet points at the session instead.
struct DayPlanSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize

    let plan: DayPlan
    let onApply: (DayPlan.Option) -> Void
    let onOpenSession: (TrainingSession) -> Void
    let onClose: () -> Void

    @State private var chosen: DayPlan.Option?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            grip
            head

            if plan.isLocked {
                locked
            } else {
                options
                Text(plan.note(for: selection))
                    .slMeta()
                    .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, 14)
                Spacer(minLength: SL.Space.s3)
                Button { onApply(selection) } label: { Text(plan.confirmTitle(for: selection)) }
                    .buttonStyle(SLPrimaryButtonStyle())
                    .disabled(plan.change(for: selection, programKey: app.programKey) == nil)
            }
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, 10)
        .padding(.bottom, 34)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SL.Surface.raised)
        .presentationDetents(detents)
        .presentationDragIndicator(.hidden)
        .presentationBackground(SL.Surface.raised)
        .slRespondsToTextSize()
    }

    /// 41e opens tall enough to hold the programme; 41g has three lines to say
    /// and opens at the height of them.
    private var detents: Set<PresentationDetent> {
        if typeSize.isAccessibilitySize { return [.large] }
        // 41e opens 150 from the top of the frame, 41g at the height of the
        // three lines it has to say.
        return plan.isLocked ? [.height(374)] : [.fraction(0.82)]
    }

    /// 41f opens on the way back, because undoing a change is the likeliest
    /// reason to open a date you set yourself; 41e opens on what it holds.
    private var selection: DayPlan.Option {
        if let chosen { return chosen }
        if plan.isOverridden, let standard = plan.options.first(where: { $0.kind == .standard }) {
            return standard
        }
        return plan.options.first { $0.isCurrent } ?? plan.options[0]
    }

    // MARK: - Chrome

    private var grip: some View {
        Capsule()
            .fill(SL.Surface.hairlineStrong)
            .frame(width: 36, height: 5)
            .frame(maxWidth: .infinity)
            .padding(.bottom, 18)
            .accessibilityHidden(true)
    }

    private var head: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(plan.title)
                .font(.sl(28, SL.Weight.semibold))
                .slNumerals()
                .foregroundStyle(SL.Ink.primary)
                .accessibilityAddTraits(.isHeader)

            HStack(spacing: SL.Space.s2) {
                // The same mark the rail draws for this date, so the sheet and
                // the rail never describe it differently.
                if plan.isLocked {
                    Circle().fill(SL.Ink.primary).frame(width: 7, height: 7)
                } else if plan.isOverridden {
                    Circle()
                        .strokeBorder(SL.Ink.secondary, style: StrokeStyle(lineWidth: 1, dash: [2, 1.6]))
                        .frame(width: 8, height: 8)
                }
                Text(plan.state)
                    .slBody()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, plan.isLocked || plan.isOverridden ? 6 : 4)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - 41g · a logged day

    private var locked: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Een gelogde dag wijzig je niet. De datum hoort bij wat je deed.")
                .slBody()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .slMeasure(32, fontSize: SL.TypeSize.body)
                .padding(.top, SL.Space.s4)

            Spacer(minLength: SL.Space.s3)

            if let session = plan.session {
                Button { onOpenSession(session) } label: { Text("Bekijk sessie") }
                    .buttonStyle(SLOutlineButtonStyle())
            }
            Button(action: onClose) {
                Text("Sluiten")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(height: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - 41e/41f · what this date can hold

    private var options: some View {
        VStack(alignment: .leading, spacing: 0) {
            // 41f puts the way back first, because undoing a change is the
            // likeliest reason to open a changed day.
            if plan.isOverridden, let standard = plan.options.first(where: { $0.kind == .standard }) {
                row(standard).padding(.top, 18)
                eyebrow("OF KIES EEN ANDERE").padding(.top, 18)
            } else {
                eyebrow(sessionsTitle).padding(.top, 22)
            }

            ForEach(plan.options.filter { isSession($0) }) { option in
                row(option)
            }

            SLHairline().padding(.vertical, 10)

            ForEach(plan.options.filter { !isSession($0) && !($0.kind == .standard && plan.isOverridden) }) { option in
                row(option)
            }
        }
    }

    private var sessionsTitle: String {
        let names = app.plan.map(\.short)
        guard !names.isEmpty else { return "SESSIE UIT JE PLAN" }
        return "SESSIE UIT \(names.prefix(3).joined(separator: " / ").uppercased())"
    }

    private func isSession(_ option: DayPlan.Option) -> Bool {
        if case .session = option.kind { return true }
        return false
    }

    private func eyebrow(_ text: String) -> some View {
        Text(text)
            .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
            .tracking(SL.TypeSize.micro * 0.06)
            .foregroundStyle(SL.Ink.tertiary)
            .padding(.bottom, 6)
    }

    private func row(_ option: DayPlan.Option) -> some View {
        let isChosen = option.id == selection.id
        return Button {
            withAnimation(.easeOut(duration: SL.Motion.fast)) { chosen = option }
        } label: {
            HStack(spacing: SL.Space.s3) {
                Text(option.title)
                    .slLead()
                    .foregroundStyle(option.kind == .standard && !plan.isOverridden ? SL.Ink.tertiary : SL.Ink.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: SL.Space.s2)
                if let hint = option.hint {
                    Text(hint)
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.tertiary)
                        .lineLimit(1)
                }
                // 20pt of room whether the tick is there or not, so nothing
                // shifts when the choice moves.
                Image(systemName: "checkmark")
                    .font(.system(size: 15, weight: SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
                    .frame(width: 20)
                    .opacity(isChosen ? 1 : 0)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 50)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                    .fill(isChosen ? SL.Surface.raised2 : .clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                    .strokeBorder(isChosen ? SL.Surface.selection : .clear, lineWidth: 1)
            )
            .padding(.horizontal, -12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel([option.title, option.hint].compactMap { $0 }.joined(separator: ", "))
        .accessibilityAddTraits(isChosen ? [.isSelected, .isButton] : .isButton)
    }
}
