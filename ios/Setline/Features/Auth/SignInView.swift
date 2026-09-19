import SwiftUI

/// Artboard 02, as redrawn in SETLINE Review.
///
/// The review's own words: three social buttons and a passkey primary
/// "schendt de scopegrens: identiteit is in deze fase Supabase e-mail plus
/// wachtwoord", so the screen became two fields in one grouped container,
/// the title went from 21 to 34, and the lime that sat on the passkey button
/// moved to the active field's border — lime once before the button and once
/// on it.
///
/// Apple, Google and passkeys are Phase 1 decisions deferred, not designed
/// away: `SupabaseClient` is the seam they arrive behind.
struct SignInView: View {
    @Environment(AppState.self) private var app

    @State private var email = ""
    @State private var password = ""
    @State private var isRegistering: Bool
    /// Review 01's `Terug`: back to the cold open, or out of signing in again.
    private let onBack: (() -> Void)?

    init(registering: Bool = false, onBack: (() -> Void)? = nil) {
        _isRegistering = State(initialValue: registering)
        self.onBack = onBack
    }
    @FocusState private var focused: Field?

    private enum Field { case email, password }

    var body: some View {
        GeometryReader { proxy in
        ZStack {
            SL.Surface.ground.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                if let onBack {
                    Button(action: onBack) {
                        Text("Terug")
                            .slBody(SL.Weight.medium)
                            .foregroundStyle(SL.Ink.secondary)
                            .frame(minHeight: SL.Space.hitMin)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, SL.Space.s6)
                }

                Text(isRegistering ? "Registreren" : "Aanmelden")
                    .slDisplay()
                    .foregroundStyle(SL.Ink.primary)
                    .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)

                Text("Je data blijft van jou en is altijd te exporteren.")
                    .slBody()
                    .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                    .foregroundStyle(SL.Ink.secondary)
                    .slMeasure(32, fontSize: SL.TypeSize.body)
                    .padding(.top, 10)
                    .padding(.bottom, 28)

                fieldGroup

                HStack {
                    Spacer()

                    Button {
                        Task { await app.sendPasswordReset(email: email) }
                    } label: {
                        Text("Wachtwoord vergeten")
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                            .frame(minHeight: SL.Space.hitMin, alignment: .trailing)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 14)
                .padding(.horizontal, 2)

                if let message = app.authError {
                    Text(message)
                        .slMeta()
                        .foregroundStyle(SL.Signal.attention)
                        .padding(.top, SL.Space.s3)
                        .accessibilityAddTraits(.isStaticText)
                }

                if case .notConfigured = app.sync {
                    Text("Accounts zijn nog niet aangesloten. Zet SUPABASE_URL en SUPABASE_ANON_KEY in Setline.xcconfig.")
                        .slMeta()
                        .foregroundStyle(SL.Signal.attention)
                        .padding(.top, SL.Space.s3)
                }

                Spacer()

                Button {
                    Task {
                        if isRegistering {
                            await app.signUp(email: email.trimmed, password: password)
                        } else {
                            await app.signIn(email: email.trimmed, password: password)
                        }
                    }
                } label: {
                    Text(isRegistering ? "Registreren" : "Aanmelden")
                }
                .buttonStyle(SLPrimaryButtonStyle())
                .disabled(!canSubmit)

                Button {
                    isRegistering.toggle()
                } label: {
                    Text(isRegistering ? "Ik heb al een account" : "Nog geen account · registreren")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: SL.Metric.tertiaryHeight)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, SL.Space.s2)
            }
            .padding(.horizontal, SL.Space.gutterEntry)
            // 12 to `Terug`, 40 from it to the title — the same 40 when there
            // is nothing to go back to.
            .padding(.top, onBack == nil ? SL.Space.s10 : 0)
            // Review 01's bottom block ends 98 above the frame's edge, home
            // band included: 77 above the bottom safe area.
            .padding(.bottom, SL.Space.entryBlockBottom)
        }
        }
    }

    private var canSubmit: Bool {
        !app.isWorking && email.contains("@") && password.count >= 6
    }

    /// One container of radius 20 with 6 padding, so the fields inside are
    /// radius 14 — the concentric rule, stated in the review's intervention.
    private var fieldGroup: some View {
        VStack(spacing: 0) {
            field(
                label: "E-mail",
                text: $email,
                isSecure: false,
                field: .email
            )
            SLHairline().padding(.horizontal, 14)
            field(
                label: "Wachtwoord",
                text: $password,
                isSecure: true,
                field: .password
            )
        }
        .padding(6)
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                .fill(SL.Surface.raised)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: 1)
        )
    }

    @ViewBuilder
    private func field(label: String, text: Binding<String>, isSecure: Bool, field: Field) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            SLEyebrow(text: label, size: SL.TypeSize.micro)
            Group {
                if isSecure {
                    SecureField("", text: text)
                        .textContentType(isRegistering ? .newPassword : .password)
                } else {
                    TextField("", text: text)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            // 16pt minimum so iOS never zooms the field on focus.
            // 17pt, comfortably above the 16pt floor that stops iOS zooming
            // a field on focus.
            .font(.sl(SL.TypeSize.lead, SL.Weight.medium))
            .foregroundStyle(SL.Ink.primary)
            .tint(SL.Signal.action)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(minHeight: 60)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(focused == field ? SL.Surface.raised2 : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(focused == field ? SL.Signal.action : .clear, lineWidth: 1)
        )
        .focused($focused, equals: field)
        .contentShape(Rectangle())
        .onTapGesture { focused = field }
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
