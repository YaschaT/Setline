import LocalAuthentication
import SwiftUI

// MARK: - App lock

/// Face ID (or the passcode) in front of the app, when switched on in
/// Account. Locks when the app goes to the background; while it is not in the
/// foreground the app switcher shows a plain shield instead of the log,
/// body weight or photos.
enum AppLock {
    static let preferenceKey = "setline.appLock"

    static var isOn: Bool { UserDefaults.standard.bool(forKey: preferenceKey) }

    /// Whether this phone can lock at all: Face ID, Touch ID or a passcode.
    static var isAvailable: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    /// "Face ID", "Touch ID", or "passcode" — what the unlock will ask for.
    static var methodName: String {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch context.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return "passcode"
        }
    }

    static func authenticate(reason: String) async -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "Not now"
        return (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) ?? false
    }
}

/// The shield's own window, above every sheet and full-screen cover, so a
/// workout or Account left open is hidden too.
@MainActor
enum AppLockWindow {
    private static var window: UIWindow?

    static func show(locked: Bool, onUnlock: @escaping () -> Void) {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState != .unattached }) else { return }
        let host = UIHostingController(rootView: AppLockShield(locked: locked, onUnlock: onUnlock))
        host.view.backgroundColor = .clear
        let window = self.window ?? UIWindow(windowScene: scene)
        window.windowLevel = .alert + 1
        window.rootViewController = host
        window.isHidden = false
        self.window = window
    }

    static func hide() {
        window?.isHidden = true
        window = nil
    }
}

/// The shield over the app: the mark, and while locked the one way in.
struct AppLockShield: View {
    let locked: Bool
    let onUnlock: () -> Void

    var body: some View {
        ZStack {
            SL.Surface.ground.ignoresSafeArea()
            VStack(spacing: SL.Space.s4) {
                Image(systemName: locked ? "lock.fill" : "lock.shield")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(SL.Signal.action)
                    .frame(width: 76, height: 76)
                    .background(Circle().fill(SL.Signal.actionTint))
                Text("Setline")
                    .font(.sl(SL.TypeSize.title, SL.Weight.bold))
                    .foregroundStyle(SL.Ink.primary)
                if locked {
                    Text("Locked to keep your log, body weight and photos private.")
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(action: onUnlock) {
                        Text("Unlock with \(AppLock.methodName)")
                    }
                    .buttonStyle(SLPrimaryButtonStyle())
                    .padding(.top, SL.Space.s4)
                }
            }
            .padding(.horizontal, SL.Space.gutterEntry)
        }
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Privacy policy

/// What Setline keeps, where, and what you can do about it — in plain words,
/// on the phone, readable without an account or a connection.
struct PrivacyPolicyView: View {
    let onClose: () -> Void

    static let updated = "11 October 2026"

    private struct Section: Identifiable {
        let title: String
        let symbol: String
        let lines: [String]
        var id: String { title }
    }

    private let sections: [Section] = [
        Section(title: "In short", symbol: "hand.raised.fill", lines: [
            "Setline has no ads, no tracking and no third-party analytics. Your data is never sold or shared for marketing.",
            "We keep what the app needs to work, and you can export or delete it yourself.",
        ]),
        Section(title: "Your account", symbol: "person.crop.circle", lines: [
            "Your e-mail address and a password. The password is stored only as a secure hash by our sign-in provider (Supabase); we never see it.",
            "The sign-in token on this phone is kept in the iOS Keychain.",
        ]),
        Section(title: "Training, food and body weight", symbol: "figure.strengthtraining.traditional", lines: [
            "Your workouts, sets, plan, food log, targets and weigh-ins are saved on this phone first and synced to your Setline account, so the app and the web version show the same.",
            "Body weight and food are health data. They are used only to show your progress and goal checks, and are never shown to friends.",
            "Your weight goal is kept on this phone only.",
        ]),
        Section(title: "Check-in photos", symbol: "camera.fill", lines: [
            "Progress photos stay on this phone. They are never uploaded, never shared and never analysed.",
        ]),
        Section(title: "Friends and posts", symbol: "person.2.fill", lines: [
            "Only if you set up a profile: your display name, username and profile photo, the posts you choose to make, your comments and kudos.",
            "Posts are seen by your friends or by you alone — you choose per post. Your log, body weight and photos are never part of a post unless you add them.",
            "Photos you add to a post are resized on this phone and their location data is removed before upload.",
        ]),
        Section(title: "Location", symbol: "location.fill", lines: [
            "Read once, only when you tap to find gyms near you for a post. The location itself is not stored; only the place name you pick is kept with that post.",
        ]),
        Section(title: "Camera and notifications", symbol: "bell.fill", lines: [
            "The camera is used only for check-in photos, post photos, barcodes and meal scans — only when you open them.",
            "Reminders are scheduled on this phone. No push service receives your schedule.",
        ]),
        Section(title: "Services we use", symbol: "server.rack", lines: [
            "Supabase (sign-in, friends and posts) and Cloudflare (sync of your log) host the data above.",
            "Food search sends only what you type to Open Food Facts, through our server, without your account.",
            "A scanned barcode is looked up in Open Food Facts straight from your phone; only the number is sent.",
            "Meal scan recognises food on this phone with Apple's built-in image recognition. The photo never leaves your phone; a typed food the app doesn't know is looked up like a normal search.",
        ]),
        Section(title: "Your rights", symbol: "checkmark.shield.fill", lines: [
            "Under the GDPR you can see, correct, export and delete your data.",
            "Export everything: Account › Data › Export everything.",
            "Delete posts: Account › Privacy › Delete all my posts. Delete workouts: Account › Data › Delete all workouts.",
            "To have your whole account deleted, or for any privacy question, use the support link on Setline's App Store page.",
        ]),
        Section(title: "Keeping it safe", symbol: "lock.fill", lines: [
            "All data travels over encrypted connections. Friends' data is protected by row-level security on the server: nobody can read a post they are not allowed to see.",
            "You can lock the app with Face ID in Account › Security.",
            "Setline is meant for people aged 16 and over.",
        ]),
    ]

    var body: some View {
        SLSheet(title: "Privacy policy", subtitle: "Last updated \(Self.updated)", onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s3) {
                ForEach(sections) { section in
                    VStack(alignment: .leading, spacing: SL.Space.s2) {
                        HStack(spacing: SL.Space.s2) {
                            Image(systemName: section.symbol)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(SL.Signal.recovery)
                                .frame(width: 28, height: 28)
                                .background(Circle().fill(SL.Signal.recoveryTint))
                            Text(section.title)
                                .slBody(SL.Weight.semibold)
                                .foregroundStyle(SL.Ink.primary)
                                .accessibilityAddTraits(.isHeader)
                        }
                        ForEach(section.lines, id: \.self) { line in
                            Text(line)
                                .slMeta()
                                .foregroundStyle(SL.Ink.meta)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(SL.Space.s4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised2))
                }
            }
        }
    }
}
