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
    /// Account opens as a sheet from the avatar; this closes it.
    var onClose: (() -> Void)? = nil
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
    @State private var showsCredits = false
    @Environment(SocialStore.self) private var social
    @State private var defaultVisibility = PostVisibility.defaultForNewPosts
    @State private var choosingVisibility = false
    @State private var confirmsDeleteAll = false
    @State private var deleteAllFailed = false

    private var summary: AccountSummary {
        AccountSummary.make(state: app.state ?? LegacyState(raw: [:]), plan: app.plan)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // The same head, at the same place, as every other tab.
                SLScreenTitle(title: "Account") {
                    if let onClose {
                        Button("Done", action: onClose)
                            .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                            .foregroundStyle(SL.Signal.action)
                            .slHitTarget()
                    }
                }
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.top, SL.Space.s5)

                VStack(alignment: .leading, spacing: 0) {
                    profileBlock
                    syncBlock
                    section("Plan")
                    planRows
                    // Only once there is a social profile to post from.
                    if social.me != nil {
                        section("Privacy")
                        privacyRows
                    }
                    section("Data")
                    exportRow
                    row("Photo credits") { showsCredits = true }
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
        .sheet(isPresented: $showsCredits) { credits }
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
        .confirmationDialog("Sign out?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { app.signOut() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("\(changes(app.pendingChanges.count)) \(verb(app.pendingChanges.count, "is", "are")) only on this phone. \(verb(app.pendingChanges.count, "It's", "They're")) kept and will sync when you sign in again.")
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
                    Text(app.profileName ?? "Add your name")
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
        .accessibilityHint("Change your name or photo")
        .confirmationDialog("Profile", isPresented: $editingProfile, titleVisibility: .hidden) {
            Button(app.profileName == nil ? "Add name" : "Change name") {
                afterDialog {
                    draftName = app.profileName ?? ""
                    namingProfile = true
                }
            }
            Button(app.profilePhoto == nil ? "Choose a photo" : "Choose another photo") {
                afterDialog { pickingPhoto = true }
            }
            if app.profilePhoto != nil {
                Button("Remove photo", role: .destructive) { app.removeProfilePhoto() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your name and photo stay on this phone.")
        }
        .alert("Your name", isPresented: $namingProfile) {
            TextField("Name", text: $draftName)
                .textContentType(.name)
                .textInputAutocapitalization(.words)
            Button("Save") { app.setProfileName(draftName) }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Training greets you by your first name.")
        }
        .alert("That photo didn't work", isPresented: $photoFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("It couldn't be read or saved. Try another one.")
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
                Button("Sign in again") { reauthenticating = true }
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
        case .synced: return "Up to date"
        case .waiting: return "Waiting to sync"
        case .offline: return "Offline"
        case .expired: return "Session expired"
        case .never: return "Not synced yet"
        }
    }

    private var syncDetail: String {
        switch standing {
        case .synced(let date):
            return "\(Self.relative.localizedString(for: date, relativeTo: Date())) · \(sessionsSafe)"
        case .waiting(let count):
            return "\(changes(count)) on this phone"
        case .offline(let count):
            return count > 0
                ? "Saved on this phone · \(changes(count)) waiting"
                : "Saved on this phone"
        case .expired:
            return "Your work stays on this phone"
        case .never:
            return "Your work is on this phone"
        }
    }

    private func changes(_ count: Int) -> String {
        count == 1 ? "1 change" : "\(count) changes"
    }

    /// One change stays; two stay. The count decides the verb, not the noun.
    private func verb(_ count: Int, _ singular: String, _ plural: String) -> String {
        count == 1 ? singular : plural
    }

    private var sessionsSafe: String {
        summary.sessionCount == 1 ? "1 session" : "\(summary.sessionCount) sessions"
    }

    private static let relative: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.unitsStyle = .full
        return formatter
    }()

    // MARK: - Plan

    private var planRows: some View {
        VStack(spacing: 0) {
            row("Plan", value: summary.planName) { choosingProgram = true }
            if !summary.trainingDays.isEmpty {
                row("Training days", value: summary.trainingDays.joined(separator: " ")) { planningWeek = true }
            }
            if let targets = summary.targets {
                row("Daily targets", value: "\(app.display.number(Decimal(targets.calories))) kcal · \(targets.protein) g") {
                    editingTargets = true
                }
            }
            // The three rests by role read as a sentence for VoiceOver; on
            // screen the order (primair, samengesteld, isolatie) is enough.
            row("Rest timer", value: summary.rest.map(\.label).joined(separator: " · "))
                .accessibilityLabel("Rest timer: \(summary.rest.map { "\($0.label) \($0.roleLabel)" }.joined(separator: ", "))")
            // 12R: "Per set vragen zet je aan in Account." This is where.
            Toggle(isOn: $rirEverySet) {
                Text("RIR on every set").slBody()
            }
            .tint(SL.Signal.action)
            .padding(.vertical, SL.Space.s3)
            .overlay(alignment: .bottom) { SLHairline() }
            .onChange(of: rirEverySet) { _, value in RIRPreference.everySet = value }
        }
    }

    // MARK: - Privacy

    private var privacyRows: some View {
        VStack(alignment: .leading, spacing: 0) {
            row("New posts are seen by", value: defaultVisibility.label, detail: "You can change it on every post") {
                choosingVisibility = true
            }
            HStack(alignment: .top, spacing: SL.Space.s3) {
                Image(systemName: "mappin.and.ellipse")
                    .foregroundStyle(SL.Signal.recovery)
                Text("Location is never shared unless you add a place to a post. Photo location data is always removed.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.meta)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, SL.Space.s3)
            .overlay(alignment: .bottom) { SLHairline() }
            Button { confirmsDeleteAll = true } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Delete all my posts").slBody().foregroundStyle(SL.Signal.loss)
                        Text("Your workouts stay in your log").slMeta().foregroundStyle(SL.Ink.secondary)
                    }
                    Spacer()
                }
                .padding(.vertical, SL.Space.s3)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .overlay(alignment: .bottom) { SLHairline() }
            .disabled(social.myPostCount == 0)
            .opacity(social.myPostCount == 0 ? 0.5 : 1)
        }
        .sheet(isPresented: $choosingVisibility) {
            VisibilitySheet(selection: $defaultVisibility, friendCount: social.friends.count, onClose: { choosingVisibility = false })
        }
        .onChange(of: defaultVisibility) { _, value in PostVisibility.defaultForNewPosts = value }
        .alert(social.myPostCount == 1 ? "Delete your post?" : "Delete all \(social.myPostCount) posts?", isPresented: $confirmsDeleteAll) {
            Button("Cancel", role: .cancel) {}
            Button("Delete all", role: .destructive) {
                Task {
                    do { try await social.deleteAllMyPosts() } catch { deleteAllFailed = true }
                }
            }
        } message: {
            Text("Their photos, comments and kudos are removed for everyone, right away. Your workouts, records and streak stay in your log.")
        }
        .alert("Couldn't delete your posts", isPresented: $deleteAllFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Check your connection and try again.")
        }
    }

    // MARK: - Data

    private var exportRow: some View {
        Group {
            if exports.isEmpty {
                row("Export everything", detail: "No data to export yet")
            } else {
                ShareLink(items: exports) {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Export everything").slBody()
                            Text("CSV and JSON").slMeta().foregroundStyle(SL.Ink.secondary)
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
                .accessibilityLabel("Export everything. \(exportDetail)")
            }
        }
    }

    private var exportDetail: String {
        var parts = ["CSV and JSON", sessionsSafe]
        parts.append(summary.loggedExerciseCount == 1 ? "1 exercise" : "\(summary.loggedExerciseCount) exercises")
        if summary.weighInCount > 0 {
            parts.append(summary.weighInCount == 1 ? "1 weigh-in" : "\(summary.weighInCount) weigh-ins")
        }
        return parts.joined(separator: " · ")
    }

    private var signOutRow: some View {
        Button {
            if app.hasPendingChanges { confirmSignOut = true } else { app.signOut() }
        } label: {
            HStack {
                Text("Sign out").slBody()
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

    /// The section head every tab uses, so Account reads as part of the app
    /// rather than a settings page of its own.
    private func section(_ title: String) -> some View {
        SLSectionHead(title: title)
            .padding(.horizontal, -SL.Space.s1)
            .padding(.top, SL.Space.s8)
            .padding(.bottom, SL.Space.s1)
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
        .accessibilityHint(change == nil ? "" : "Double-tap to change")
        .onTapGesture { change?() }
    }

    /// Who made the food photos, as their licences ask.
    private var credits: some View {
        NavigationStack {
            List {
                Section("Quick adds") {
                    ForEach(FoodIdeas.all) { idea in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(idea.name).slBody()
                            Text(idea.credit).slMeta().foregroundStyle(SL.Ink.secondary)
                        }
                        .listRowBackground(SL.Surface.raised)
                    }
                }
                Section("Recipes") {
                    ForEach(Recipes.photoCredits, id: \.name) { item in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name).slBody()
                            Text(item.credit).slMeta().foregroundStyle(SL.Ink.secondary)
                        }
                        .listRowBackground(SL.Surface.raised)
                    }
                    Text("Other recipes use the photo of their main ingredient, credited above.")
                        .slMeta().foregroundStyle(SL.Ink.secondary)
                        .listRowBackground(SL.Surface.raised)
                }
                Section("Search results") {
                    Text("Product photos and data from Open Food Facts, under the Open Database Licence.")
                        .slMeta().foregroundStyle(SL.Ink.secondary)
                        .listRowBackground(SL.Surface.raised)
                }
            }
            .scrollContentBackground(.hidden)
            .background(SL.Surface.ground)
            .navigationTitle("Photo credits")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showsCredits = false }
                }
            }
        }
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
