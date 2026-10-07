import PhotosUI
import SwiftUI
import SetlineCore

/// Artboard 23 · Account.
///
/// States what the account holds, and hands it back. Three rules from the
/// approved decisions shape what is drawn:
///
/// - every value comes from stored data, so the mock's `2.250 kcal · 165 g`
///   only appears when this account really has targets;
/// - a chevron is drawn only where there is somewhere to go (the mock's
///   `Wijzig`, quieter: each row already reads label then value);
/// - `Account verwijderen` waits for the server action that performs it.
///
/// `Uitloggen` is the one addition: leaving the account on this device keeps
/// its local copy and anything still waiting to sync. Above everything, the
/// name and picture Training greets you with, kept on this phone only.
struct AccountView: View {
    @Environment(AppState.self) private var app
    @State private var exports: [URL] = []
    @State private var confirmSignOut = false
    @State private var reauthenticating = false
    @State private var planningWeek = false
    @State private var editingTargets = false
    @State private var choosingProgram = false
    @State private var rirEverySet = RIRPreference.everySet
    @State private var editingProfile = false
    @State private var namingProfile = false
    @State private var draftName = ""
    @State private var pickingPhoto = false
    @State private var photoItem: PhotosPickerItem?
    @State private var photoFailed = false

    private var summary: AccountSummary {
        AccountSummary.make(state: app.state ?? LegacyState(raw: [:]), plan: app.plan)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Account").slTitle()
                    .padding(.horizontal, SL.Space.s5)
                    .padding(.top, SL.Space.s4)

                VStack(alignment: .leading, spacing: 0) {
                    profileBlock
                    syncBlock
                    section("PLAN")
                    planRows
                    section("DATA")
                    exportRow
                    signOutRow
                }
                .padding(.horizontal, SL.Space.s5)
                .padding(.top, SL.Space.s5)
            }
        }
        .slRespondsToTextSize()
        .task { buildExports() }
        .onChange(of: app.sessions.count) { _, _ in buildExports() }
        .sheet(isPresented: $reauthenticating) { reauthentication }
        .fullScreenCover(isPresented: $planningWeek) {
            WeekPlanView(onClose: { planningWeek = false })
        }
        .fullScreenCover(isPresented: $choosingProgram) {
            ProgramSheet(
                programs: ProgramCatalog.all(personalPlan: app.plan),
                current: ProgramCatalog.current(in: app.state ?? LegacyState(raw: [:]), plan: app.plan),
                onSave: { program in
                    choosingProgram = false
                    Task {
                        await app.record([
                            StateChange(.setProgram(mode: program.mode, sciencePlanID: program.sciencePlanID))
                        ])
                    }
                },
                onClose: { choosingProgram = false }
            )
        }
        .sheet(isPresented: $editingTargets) {
            TargetsSheet(targets: summary.targets) { changes in
                editingTargets = false
                Task { await app.record(changes) }
            } onClose: {
                editingTargets = false
            }
        }
        .confirmationDialog("Uitloggen?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Uitloggen", role: .destructive) { app.signOut() }
            Button("Annuleer", role: .cancel) {}
        } message: {
            Text("\(changes(app.pendingChanges.count)) \(verb(app.pendingChanges.count, "staat", "staan")) alleen op dit toestel. \(verb(app.pendingChanges.count, "Hij blijft", "Ze blijven")) bewaard en synct zodra je opnieuw aanmeldt.")
        }
    }

    // MARK: - Profile

    /// Who this is: the picture and name Training greets you with, and the
    /// address the account signs in with. One tap target, as the plan rows
    /// are, ending in the same chevron.
    private var profileBlock: some View {
        Button { editingProfile = true } label: {
            HStack(alignment: .center, spacing: SL.Space.s4) {
                SLAvatar(photo: app.profilePhoto, initial: app.avatarInitial, size: 64)
                    .overlay(alignment: .bottomTrailing) { cameraBadge }
                VStack(alignment: .leading, spacing: 2) {
                    Text(app.profileName ?? "Voeg je naam toe")
                        .slLead(SL.Weight.semibold)
                        .foregroundStyle(app.profileName == nil ? SL.Signal.action : SL.Ink.primary)
                    if let email = app.session?.email {
                        Text(email)
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                Self.chevron
            }
            .padding(.bottom, SL.Space.s6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { SLHairline() }
        .padding(.bottom, SL.Space.s6)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Wijzig je naam of foto")
        .confirmationDialog("Profiel", isPresented: $editingProfile, titleVisibility: .hidden) {
            Button(app.profileName == nil ? "Naam toevoegen" : "Naam wijzigen") {
                afterDialog {
                    draftName = app.profileName ?? ""
                    namingProfile = true
                }
            }
            Button(app.profilePhoto == nil ? "Kies een foto" : "Kies een andere foto") {
                afterDialog { pickingPhoto = true }
            }
            if app.profilePhoto != nil {
                Button("Verwijder foto", role: .destructive) { app.removeProfilePhoto() }
            }
            Button("Annuleer", role: .cancel) {}
        } message: {
            Text("Je naam en foto blijven op dit toestel.")
        }
        .alert("Je naam", isPresented: $namingProfile) {
            TextField("Naam", text: $draftName)
                .textContentType(.name)
                .textInputAutocapitalization(.words)
            Button("Bewaar") { app.setProfileName(draftName) }
            Button("Annuleer", role: .cancel) {}
        } message: {
            Text("Training begroet je met je voornaam.")
        }
        .alert("Die foto lukte niet", isPresented: $photoFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Ze kon niet worden gelezen of bewaard. Probeer een andere.")
        }
        .photosPicker(isPresented: $pickingPhoto, selection: $photoItem, matching: .images, photoLibrary: .shared())
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            photoItem = nil
            Task {
                let data = try? await item.loadTransferable(type: Data.self)
                let kept = if let data { await app.setProfilePhoto(data) } else { false }
                if !kept { photoFailed = true }
            }
        }
    }

    /// The options have to be gone before the next thing can be shown, or
    /// it is never shown.
    private func afterDialog(_ action: @escaping @MainActor () -> Void) {
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(350))
            action()
        }
    }

    /// Says the picture can be changed: the camera, small, on the avatar's edge.
    private var cameraBadge: some View {
        SLGlyph(name: .camera, size: 13)
            .foregroundStyle(SL.Signal.action)
            .frame(width: 24, height: 24)
            .background(Circle().fill(SL.Surface.raised))
            .overlay(Circle().strokeBorder(SL.Surface.hairlineStrong, lineWidth: SL.Metric.border))
            .offset(x: 2, y: 2)
    }

    // MARK: - Sync

    /// How this account stands right now: one quiet row, since it is
    /// reassurance rather than something to act on. Only an expired session
    /// asks for anything, and then the button says what.
    private var syncBlock: some View {
        VStack(alignment: .leading, spacing: SL.Space.s4) {
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                Circle().fill(syncTone).frame(width: 10, height: 10)
                    .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
                VStack(alignment: .leading, spacing: 2) {
                    Text(syncHeadline).slBody(SL.Weight.semibold)
                    Text(syncDetail)
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            if standing == .expired {
                Button("Opnieuw aanmelden") { reauthenticating = true }
                    .buttonStyle(SLPrimaryButtonStyle())
            }
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slCard(radius: SL.Radius.lg)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Sync: \(syncHeadline). \(syncDetail)")
    }

    /// One reading of where this account stands, so the dot, the headline and
    /// the line beneath them can never disagree.
    private enum Standing: Equatable {
        case synced(Date)
        case waiting(Int)
        case offline(Int)
        case expired
        case never
    }

    private var standing: Standing {
        let waiting = app.pendingChanges.count
        switch app.sync {
        case .sessionExpired: return .expired
        case .offline: return .offline(waiting)
        default:
            if waiting > 0 { return .waiting(waiting) }
            guard let synced = app.lastSyncedAt else { return .never }
            return .synced(synced)
        }
    }

    private var syncTone: Color {
        switch standing {
        case .synced: return SL.Signal.recovery
        case .waiting, .offline, .expired, .never: return SL.Signal.attention
        }
    }

    private var syncHeadline: String {
        switch standing {
        case .synced: return "Bijgewerkt"
        case .waiting: return "Wachten op sync"
        case .offline: return "Offline"
        case .expired: return "Sessie verlopen"
        case .never: return "Nog niet gesynct"
        }
    }

    private var syncDetail: String {
        switch standing {
        case .synced(let date):
            return "\(Self.relative.localizedString(for: date, relativeTo: Date())) · \(sessionsSafe)"
        case .waiting(let count):
            return "\(changes(count)) op dit toestel"
        case .offline(let count):
            return count > 0
                ? "Lokaal bewaard · \(changes(count)) \(verb(count, "wacht", "wachten"))"
                : "Lokaal bewaard"
        case .expired:
            return "Je werk blijft op dit toestel"
        case .never:
            return "Je werk staat op dit toestel"
        }
    }

    private func changes(_ count: Int) -> String {
        count == 1 ? "1 wijziging" : "\(count) wijzigingen"
    }

    /// One change stays; two stay. The count decides the verb, not the noun.
    private func verb(_ count: Int, _ singular: String, _ plural: String) -> String {
        count == 1 ? singular : plural
    }

    private var sessionsSafe: String {
        summary.sessionCount == 1 ? "1 sessie" : "\(summary.sessionCount) sessies"
    }

    private static let relative: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "nl_BE")
        formatter.unitsStyle = .full
        return formatter
    }()

    // MARK: - Plan

    private var planRows: some View {
        VStack(spacing: 0) {
            row("Schema", value: summary.planName) { choosingProgram = true }
            if !summary.trainingDays.isEmpty {
                row("Trainingsdagen", value: summary.trainingDays.joined(separator: " ")) { planningWeek = true }
            }
            if let targets = summary.targets {
                row("Dagdoelen", value: "\(app.display.number(Decimal(targets.calories))) kcal · \(targets.protein) g") {
                    editingTargets = true
                }
            }
            // The three rests by role read as a sentence for VoiceOver; on
            // screen the order (primair, samengesteld, isolatie) is enough.
            row("Rusttimer", value: summary.rest.map(\.label).joined(separator: " · "))
                .accessibilityLabel("Rusttimer: \(summary.rest.map { "\($0.label) \($0.roleLabel)" }.joined(separator: ", "))")
            // 12R: "Per set vragen zet je aan in Account." This is where.
            Toggle(isOn: $rirEverySet) {
                Text("RIR bij elke set").slBody()
            }
            .tint(SL.Signal.action)
            .padding(.vertical, SL.Space.s3)
            .overlay(alignment: .bottom) { SLHairline() }
            .onChange(of: rirEverySet) { _, value in RIRPreference.everySet = value }
        }
    }

    // MARK: - Data

    private var exportRow: some View {
        Group {
            if exports.isEmpty {
                row("Exporteer alles", detail: "Nog geen data om te exporteren")
            } else {
                ShareLink(items: exports) {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Exporteer alles").slBody()
                            Text("CSV en JSON").slMeta().foregroundStyle(SL.Ink.secondary)
                        }
                        Spacer(minLength: SL.Space.s4)
                        // 23: the design's `download` glyph at 18 beside
                        // "Export", both lime — the screen's one action.
                        HStack(spacing: 6) {
                            SLGlyph(name: .download, size: 18)
                            Text("Export").slBody()
                        }
                        .foregroundStyle(SL.Signal.action)
                    }
                    .padding(.vertical, SL.Space.s4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .overlay(alignment: .bottom) { SLHairline() }
                .accessibilityLabel("Exporteer alles. \(exportDetail)")
            }
        }
    }

    private var exportDetail: String {
        var parts = ["CSV en JSON", sessionsSafe.replacingOccurrences(of: " staan veilig", with: "")]
        parts[1] = summary.sessionCount == 1 ? "1 sessie" : "\(summary.sessionCount) sessies"
        parts.append(summary.loggedExerciseCount == 1 ? "1 oefening" : "\(summary.loggedExerciseCount) oefeningen")
        if summary.weighInCount > 0 {
            parts.append(summary.weighInCount == 1 ? "1 weging" : "\(summary.weighInCount) wegingen")
        }
        return parts.joined(separator: " · ")
    }

    private var signOutRow: some View {
        Button {
            if app.hasPendingChanges { confirmSignOut = true } else { app.signOut() }
        } label: {
            HStack {
                Text("Uitloggen").slBody()
                Spacer()
            }
            .padding(.vertical, SL.Space.s4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(SL.Ink.secondary)
        .padding(.top, SL.Space.s8)
        .slHitTarget()
    }

    // MARK: - Pieces

    private func section(_ title: String) -> some View {
        Text(title)
            .slMeta()
            .foregroundStyle(SL.Ink.tertiary)
            .padding(.top, SL.Space.s8)
            .padding(.bottom, SL.Space.s1)
            .accessibilityAddTraits(.isHeader)
    }

    /// A settings row: the label, its current value on the right, and a
    /// chevron when tapping it leads somewhere.
    private func row(_ title: String, value: String? = nil, detail: String? = nil, change: (() -> Void)? = nil) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).slBody()
                if let detail {
                    Text(detail).slMeta().foregroundStyle(SL.Ink.secondary)
                }
            }
            .layoutPriority(1)
            Spacer(minLength: SL.Space.s2)
            if let value {
                Text(value)
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .multilineTextAlignment(.trailing)
            }
            if change != nil {
                Self.chevron
            }
        }
        .padding(.vertical, SL.Space.s4)
        .overlay(alignment: .bottom) { SLHairline() }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(change == nil ? [] : .isButton)
        .accessibilityHint(change == nil ? "" : "Dubbeltik om te wijzigen")
        .onTapGesture { change?() }
    }

    private static var chevron: some View {
        SLGlyph(name: .chevronRight, size: 16)
            .foregroundStyle(SL.Ink.tertiary)
            .accessibilityHidden(true)
    }

    /// Signing in again after the session expired. The account keeps its local
    /// copy and everything still queued, so nothing has to be redone.
    private var reauthentication: some View {
        SignInView(onBack: { reauthenticating = false })
            .onChange(of: app.sync) { _, state in
                if case .sessionExpired = state { return }
                reauthenticating = false
            }
    }

    private func buildExports() {
        guard let state = app.state, !app.sessions.isEmpty || state.raw.count > 1 else {
            exports = []
            return
        }
        let names = StateExport.fileNames()
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("setline-export", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let json = folder.appendingPathComponent(names.json)
            let csv = folder.appendingPathComponent(names.csv)
            try StateExport.json(from: state).write(to: json, options: .atomic)
            try Data(StateExport.csv(from: app.sessions).utf8).write(to: csv, options: .atomic)
            exports = [json, csv]
        } catch {
            // An export that cannot be written says so in the row rather than
            // handing over a half-written file.
            exports = []
        }
    }
}
