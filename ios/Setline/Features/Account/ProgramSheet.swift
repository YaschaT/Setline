import SwiftUI
import SetlineCore

/// Choosing the programme, on artboard 05's option cards.
///
/// Changing it says which plan the week is built from. It rewrites nothing:
/// the account's own plan stays where it is, every logged session stays, and
/// each programme keeps the week it was given, because schedule overrides are
/// scoped per programme.
struct ProgramSheet: View {
    @Environment(AppState.self) private var app
    let programs: [Program]
    let current: Program
    let onSave: (Program) -> Void
    let onClose: () -> Void

    @State private var chosen: Program?

    private var selection: Program { chosen ?? current }
    /// Your own week belongs to the plan it was made on, so a switch parks it.
    private var ownWeek: Bool { app.ownWeek != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Which plan shape?")
                        .slDisplay()
                        .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.primary)

                    Text(ownWeek
                         ? "You're using your own week. It belongs to \(current.name): another plan starts from its standard week."
                         : "Your own plan is kept. Each program keeps its own week.")
                        .slBody()
                        .slLineHeight(1.5, size: SL.TypeSize.body)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.top, SL.Space.s3)

                    VStack(spacing: SL.Space.s2) {
                        ForEach(programs) { program in
                            card(program)
                        }
                    }
                    .padding(.top, SL.Space.s6)

                    Text(consequence)
                        .slBody()
                        .slLineHeight(1.45, size: SL.TypeSize.body)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.top, SL.Space.s5)
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s6)
                .padding(.bottom, SL.Space.s12)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(SL.Surface.ground.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            // With your own week at stake, the button says what it does.
            Button { save() } label: { Text(ownWeek && selection.id != current.id ? "Switch to \(selection.name)" : "Save") }
                .buttonStyle(SLPrimaryButtonStyle())
                .disabled(selection.id == current.id)
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.bottom, SL.Space.s3)
                .frame(maxWidth: .infinity)
                .background(SL.Surface.ground)
        }
        .slRespondsToTextSize()
    }

    private var header: some View {
        HStack {
            Button { onClose() } label: {
                Text("Back")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .slHitTarget()
            }
            .buttonStyle(.plain)
            Spacer()
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
    }

    private func card(_ program: Program) -> some View {
        let selected = selection.id == program.id

        return Button {
            withAnimation(.easeOut(duration: SL.Motion.base)) { chosen = program }
        } label: {
            HStack(alignment: .top, spacing: SL.Space.s4) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(program.name)
                        .slLead()
                        .foregroundStyle(SL.Ink.primary)
                    Text(program.shape)
                        .slMeta()
                        .foregroundStyle(selected ? SL.Ink.secondary : SL.Ink.tertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Circle()
                    .fill(selected ? SL.Ink.primary : .clear)
                    .frame(width: 22, height: 22)
                    .overlay(Circle().strokeBorder(selected ? .clear : SL.Surface.hairlineStrong, lineWidth: 1))
            }
            .padding(.vertical, SL.Space.s4)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .slBorderBox()
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                    .fill(selected ? SL.Surface.raised2 : SL.Surface.raised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                    .strokeBorder(selected ? SL.Surface.selection : SL.Surface.hairline, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
        .accessibilityLabel("\(program.name), \(program.shape)")
    }

    /// What the choice produces, stated before it is made.
    private var consequence: String {
        if selection.id == current.id {
            return ownWeek ? "You're on \(current.name), with your own week." : "You're training on \(current.name) now."
        }
        return ownWeek
            ? "Your week becomes \(selection.name)'s standard week. Your own week stays with \(current.name) and comes back if you switch back. Logged sessions stay."
            : "Your week is built from \(selection.name). Your logged sessions and your own plan stay."
    }

    private func save() {
        guard selection.id != current.id else { return onClose() }
        onSave(selection)
    }
}
