import SwiftUI

/// The four tabs Phase 1 does not build yet.
///
/// An empty state is a real screen that names what it is, not a blank one —
/// and it says plainly that the surface is not built rather than implying
/// there is no data.
struct PlaceholderView: View {
    let tab: SLTab

    var body: some View {
        ZStack {
            SL.Surface.ground.ignoresSafeArea()
            VStack(alignment: .leading, spacing: SL.Space.s3) {
                Text(tab.label).slTitle().foregroundStyle(SL.Ink.primary)
                Text(body(for: tab))
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(maxWidth: 320, alignment: .leading)
                Text("Je gegevens hiervoor staan al in je account en blijven bewaard.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, SL.Space.s2)
                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s8)
        }
    }

    private func body(for tab: SLTab) -> String {
        switch tab {
        case .voeding: return "Voeding komt in een volgende fase. Je doelen en gelogde maaltijden zijn niet gewist."
        case .progressie: return "Progressie komt in een volgende fase. Je sessies en metingen zijn niet gewist."
        case .fotos: return "Foto's komen in een volgende fase. Je check-ins staan nog in je account."
        case .account: return "Account komt in een volgende fase."
        case .training: return ""
        }
    }
}
