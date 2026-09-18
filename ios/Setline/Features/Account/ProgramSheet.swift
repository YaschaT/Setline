import SwiftUI
import SetlineCore

/// Choosing the programme, on artboard 05's option cards.
///
/// Changing it says which plan the week is built from. It rewrites nothing:
/// the account's own plan stays where it is, every logged session stays, and
/// each programme keeps the week it was given, because schedule overrides are
/// scoped per programme.
struct ProgramSheet: View {
    let programs: [Program]
    let current: Program
    let onSave: (Program) -> Void
    let onClose: () -> Void

    @State private var chosen: Program?

    private var selection: Program { chosen ?? current }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Welke planvorm?")
                        .slDisplay()
                        .lineSpacing(SL.TypeSize.display * (SL.LineHeight.display - 1))
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.primary)

                    Text("Je eigen plan blijft bewaard. Elk programma houdt zijn eigen week.")
                        .slBody()
                        .lineSpacing(SL.TypeSize.body * 0.5)
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
                        .lineSpacing(SL.TypeSize.body * 0.45)
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
            Button { save() } label: { Text("Bewaar") }
                .buttonStyle(SLPrimaryButtonStyle())
                .disabled(selection.id == current.id)
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.bottom, SL.Space.s3)
        }
        .slRespondsToTextSize()
    }

    private var header: some View {
        HStack {
            Button { onClose() } label: {
                Text("Terug")
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
        selection.id == current.id
            ? "Je traint nu volgens \(current.name)."
            : "Je week wordt opgebouwd uit \(selection.name). Je gelogde sessies en je eigen plan blijven staan."
    }

    private func save() {
        guard selection.id != current.id else { return onClose() }
        onSave(selection)
    }
}
