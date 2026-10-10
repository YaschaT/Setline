import CoreImage.CIFilterBuiltins
import SwiftUI
import SetlineCore

/// What opens when someone follows an invite link (SETLINE Social S6):
/// who invited you, what you'll share, and one button.
struct InviteLandingSheet: View {
    @Environment(SocialStore.self) private var social
    let username: String
    let onClose: () -> Void

    @State private var person: SocialProfile?
    @State private var looked = false
    @State private var sent = false
    @State private var failure: String?

    var body: some View {
        SLSheet(title: "Train together", onClose: onClose) {
            VStack(spacing: SL.Space.s4) {
                if !looked {
                    ProgressView().tint(SL.Ink.secondary).padding(.vertical, SL.Space.s8)
                } else if let person {
                    Text(person.initial)
                        .font(.slFixed(38, SL.Weight.semibold))
                        .foregroundStyle(SL.Signal.action)
                        .frame(width: 96, height: 96)
                        .background(Circle().fill(SL.Surface.raised2))
                    VStack(spacing: SL.Space.s1) {
                        Text("\(person.display_name.split(separator: " ").first.map(String.init) ?? person.display_name) invited you to train together")
                            .font(.sl(SL.TypeSize.title, SL.Weight.bold))
                            .foregroundStyle(SL.Ink.primary)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("@\(person.username)").slBody().foregroundStyle(SL.Ink.secondary)
                    }
                    Text("You'll see each other's workouts, medals and streaks, and can give kudos. Never your log, body weight or photos.")
                        .slMeta()
                        .foregroundStyle(SL.Ink.meta)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    action(for: person)
                } else {
                    Text(social.me == nil
                         ? "Make your Friends profile first, in the Friends tab. Then open the link again."
                         : "Nobody called @\(username) on Setline.")
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.vertical, SL.Space.s6)
                }
                if let failure {
                    Text(failure).slMeta().foregroundStyle(SL.Signal.attention)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .task {
            if social.phase == .loading { await social.load() }
            person = try? await social.find(username: username)
            looked = true
        }
    }

    @ViewBuilder
    private func action(for person: SocialProfile) -> some View {
        if person.user_id == social.myID {
            Text("This is your own invite link.").slBody().foregroundStyle(SL.Ink.secondary)
        } else if social.friends.contains(where: { $0.user_id == person.user_id }) {
            Text("You're already friends.").slBody(SL.Weight.semibold).foregroundStyle(SL.Signal.action)
            Button("Done", action: onClose).buttonStyle(SLPrimaryButtonStyle())
        } else if sent || social.outgoing.contains(where: { $0.addressee_id == person.user_id }) {
            Text("Request sent. You'll see each other's posts once it's accepted.")
                .slBody()
                .foregroundStyle(SL.Ink.secondary)
                .multilineTextAlignment(.center)
            Button("Done", action: onClose).buttonStyle(SLPrimaryButtonStyle())
        } else if let incoming = social.incoming.first(where: { $0.requester_id == person.user_id }) {
            Button("Accept \(person.display_name.split(separator: " ").first.map(String.init) ?? "")") {
                Task { try? await social.accept(incoming); onClose() }
            }
            .buttonStyle(SLPrimaryButtonStyle())
        } else {
            Button("Add \(person.display_name.split(separator: " ").first.map(String.init) ?? person.username) as a friend") {
                Task {
                    do { try await social.request(person); sent = true } catch { failure = "Couldn't send the request. Try again." }
                }
            }
            .buttonStyle(SLPrimaryButtonStyle())
            Button("Not now", action: onClose)
                .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                .foregroundStyle(SL.Ink.secondary)
                .frame(minHeight: SL.Space.hitMin)
        }
    }
}

/// Your invite as a QR code, to show a friend at the gym.
struct InviteQRSheet: View {
    let url: URL
    let username: String
    let onClose: () -> Void

    var body: some View {
        SLSheet(title: "My QR code", subtitle: "Let a friend scan this with their camera", onClose: onClose) {
            VStack(spacing: SL.Space.s4) {
                if let image = Self.qr(url.absoluteString) {
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .padding(SL.Space.s4)
                        .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(Color.white))
                        .frame(maxWidth: 260)
                        .accessibilityLabel("QR code for your invite link")
                }
                Text("@\(username)").slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                ShareLink(item: url, message: Text("Train with me on Setline")) {
                    HStack(spacing: SL.Space.s2) {
                        SLGlyph(name: .share, size: 16)
                        Text("Share invite link")
                    }
                }
                .buttonStyle(SLPrimaryButtonStyle())
            }
            .frame(maxWidth: .infinity)
        }
    }

    static func qr(_ text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)),
              let cg = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// Account › Privacy › Blocked people.
struct BlockedPeopleSheet: View {
    @Environment(SocialStore.self) private var social
    let onClose: () -> Void

    var body: some View {
        SLSheet(title: "Blocked people", subtitle: "They can't send you a request or see your posts", onClose: onClose) {
            VStack(spacing: 0) {
                if social.blocked.isEmpty {
                    Text("Nobody is blocked.")
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, SL.Space.s6)
                } else {
                    ForEach(Array(social.blocked.enumerated()), id: \.element.user_id) { index, person in
                        HStack(spacing: SL.Space.s3) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(person.display_name).slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                                Text("@\(person.username)").slMeta().foregroundStyle(SL.Ink.secondary)
                            }
                            Spacer()
                            Button("Unblock") { Task { try? await social.unblock(person.user_id) } }
                                .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                                .foregroundStyle(SL.Signal.action)
                                .frame(minHeight: SL.Space.hitMin)
                        }
                        .padding(.horizontal, SL.Space.s4)
                        .frame(minHeight: 60)
                        .overlay(alignment: .top) { if index > 0 { SLHairline().padding(.leading, SL.Space.s4) } }
                    }
                    .slBorderBox()
                    .slListCard(raised: true)
                }
            }
        }
        .task { await social.loadBlocked() }
    }
}
