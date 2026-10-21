import PhotosUI
import SwiftUI
import SetlineCore

/// Artboard 23 · Account, opened from the gear as Settings.
///
/// States what the account holds, and hands it back. Three rules from the
/// approved decisions shape what is drawn:
///
/// - every value comes from stored data, so the mock's `2.250 kcal · 165 g`
///   only appears when this account really has targets;
/// - a chevron is drawn only where there is somewhere to go;
/// - `Account verwijderen` waits for the server action that performs it.
///
/// Laid out to be read at a glance: who you are and how the account stands
/// in one card on top, then one card per topic — Training, Food, App,
/// Privacy, Your data — each row led by an icon tinted by its topic, so the
/// eye finds a group before it reads a word. Training and Food are the
/// coloured ones; the rest is housekeeping and stays grey. `Uitloggen`
/// leaves the account on this device and keeps its local copy and anything
/// still waiting to sync.
struct AccountView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize
    /// Account opens as a sheet from the avatar; this closes it.
    var onClose: (() -> Void)? = nil
    @State private var exports: [URL] = []
    @State private var confirmSignOut = false
    @State private var reauthenticating = false
    @State private var planningWeek = false
    @State private var editingTargets = false
    @State private var choosingProgram = false
    @State private var rirEverySet = RIRPreference.everySet
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
    @State private var showsBlocked = false
    @State private var confirmsResetWorkouts = false
    @AppStorage(NutritionReminders.mealsKey) private var mealReminders = false
    @AppStorage(WorkoutReminder.minutesKey) private var openWorkoutMinutes = 20
    @State private var managingWorkouts = false
    @AppStorage(SLSound.preferenceKey) private var soundsOn = true
    @AppStorage(AppLock.preferenceKey) private var appLock = false
    @State private var showsPolicy = false
    @State private var remindersDenied = false

    private var summary: AccountSummary {
        AccountSummary.make(state: app.state ?? LegacyState(raw: [:]), plan: app.plan)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // The same head, at the same place, as every other tab.
                SLScreenTitle(title: "Settings") {
                    if let onClose {
                        Button("Done", action: onClose)
                            .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                            .foregroundStyle(SL.Signal.action)
                            .slHitTarget()
                    }
                }
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.top, SL.Space.s5)

                VStack(alignment: .leading, spacing: SL.Space.s6) {
                    profileCard
                    trainingGroup
                    foodGroup
                    appGroup
                    privacyGroup
                    dataGroup
                    signOutButton
                    footer
                }
                .padding(.horizontal, SL.Space.s5)
                .padding(.top, SL.Space.s4)
                .padding(.bottom, SL.Space.s10)
            }
        }
        .slRespondsToTextSize()
        .task(id: social.myPostCount) {
            buildExports()
            await addPostsToExport()
        }
        .onChange(of: app.sessions.count) { _, _ in buildExports() }
        .onChange(of: rirEverySet) { _, value in RIRPreference.everySet = value }
        .onChange(of: soundsOn) { _, on in if on { SLSound.tick.play() } }
        .onChange(of: defaultVisibility) { _, value in PostVisibility.defaultForNewPosts = value }
        #if DEBUG
        .onAppear {
            // `-SetlinePrivacyPolicy` opens the policy straight away.
            if ProcessInfo.processInfo.arguments.contains("-SetlinePrivacyPolicy") { showsPolicy = true }
        }
        #endif
        .sheet(isPresented: $reauthenticating) { reauthentication }
        .sheet(isPresented: $showsCredits) { credits }
        .sheet(isPresented: $showsPolicy) {
            PrivacyPolicyView(onClose: { showsPolicy = false })
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showsBlocked) {
            BlockedPeopleSheet(onClose: { showsBlocked = false })
        }
        .sheet(isPresented: $choosingVisibility) {
            VisibilitySheet(selection: $defaultVisibility, friendCount: social.friends.count, onClose: { choosingVisibility = false })
        }
        .alert("Notifications are off for Setline", isPresented: $remindersDenied) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Turn them on in Settings › Setline › Notifications, then switch meal reminders on here.")
        }
        .sheet(isPresented: $managingWorkouts) {
            WorkoutChooserSheet(
                onStart: nil,
                onChangePlan: {
                    managingWorkouts = false
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(350))
                        choosingProgram = true
                    }
                },
                onClose: { managingWorkouts = false }
            )
        }
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
        .alert(app.sessions.count == 1 ? "Delete your workout?" : "Delete all \(app.sessions.count) workouts?", isPresented: $confirmsResetWorkouts) {
            Button("Cancel", role: .cancel) {}
            Button("Delete all", role: .destructive) {
                Task { await app.removeAllSessions() }
            }
        } message: {
            Text("Your log, records, streak and progress start from zero, here and on the web. This can't be undone, so export first if you want a copy. Your plan, food log, weigh-ins, photos and posts stay.")
        }
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

    // MARK: - Profile

    /// Who this is and how the account stands: the picture and name Training
    /// greets you with, the address it signs in with, whether it is synced,
    /// and three numbers for what it holds. Only an expired session asks for
    /// anything, and then the button says what.
    private var profileCard: some View {
        VStack(spacing: 0) {
            // A menu rather than a dialog: it opens where it was tapped.
            Menu {
                Section("Your name and photo stay on this phone") {
                    Button(app.profileName == nil ? "Add name" : "Change name", systemImage: "character.cursor.ibeam") {
                        afterDialog {
                            draftName = app.profileName ?? ""
                            namingProfile = true
                        }
                    }
                    Button(app.profilePhoto == nil ? "Choose a photo" : "Choose another photo", systemImage: "photo") {
                        afterDialog { pickingPhoto = true }
                    }
                    if app.profilePhoto != nil {
                        Button("Remove photo", systemImage: "trash", role: .destructive) { app.removeProfilePhoto() }
                    }
                }
            } label: {
                // At the largest sizes the picture sits above the name, so
                // neither the name nor the address is cut short.
                let layout = typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s3))
                    : AnyLayout(HStackLayout(alignment: .center, spacing: SL.Space.s4))
                layout {
                    SLAvatar(photo: app.profilePhoto, initial: app.avatarInitial, size: 60)
                        .overlay(alignment: .bottomTrailing) { cameraBadge }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(app.profileName ?? "Add your name")
                            .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                            .foregroundStyle(app.profileName == nil ? SL.Signal.action : SL.Ink.primary)
                            .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                        if let email = app.session?.email {
                            Text(email)
                                .slMeta()
                                .foregroundStyle(SL.Ink.secondary)
                                .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                                .truncationMode(.middle)
                        }
                        syncLine
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text("Edit")
                        .slMeta(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                        .padding(.horizontal, SL.Space.s3)
                        .frame(minHeight: 30)
                        .background(Capsule().fill(SL.Surface.raised2))
                        .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: SL.Metric.border))
                }
                .padding(SL.Space.s4)
                .contentShape(Rectangle())
            }
            .buttonStyle(SLPressStyle(scale: 0.98))
            .accessibilityElement(children: .combine)
            .accessibilityHint("Change your name or photo")

            SLHairline().padding(.horizontal, SL.Space.s4)
            statsRow
                .padding(.horizontal, SL.Space.s4)
                .padding(.vertical, SL.Space.s3)

            if standing == .expired {
                Button("Sign in again") { reauthenticating = true }
                    .buttonStyle(SLPrimaryButtonStyle())
                    .padding([.horizontal, .bottom], SL.Space.s4)
            }
        }
        .slHeroCard()
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

    /// What the account holds, in three numbers. Side by side; stacked at
    /// the largest text sizes so no label is cut.
    private var statsRow: some View {
        let streak = app.streak
        // Before there is a streak, this week's count instead of a zero.
        let run: (value: String, label: String) = streak.weeks > 0
            ? ("\(streak.weeks)", streak.weeks == 1 ? "week in a row" : "weeks in a row")
            : ("\(streak.thisWeekDone)/\(streak.thisWeekGoal)", "this week")
        let stats: [(value: String, label: String)] = [
            ("\(summary.sessionCount)", summary.sessionCount == 1 ? "workout" : "workouts"),
            run,
            ("\(summary.loggedExerciseCount)", summary.loggedExerciseCount == 1 ? "exercise" : "exercises"),
        ]
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s2))
            : AnyLayout(HStackLayout(alignment: .top, spacing: SL.Space.s3))
        return layout {
            ForEach(stats.indices, id: \.self) { index in
                let stat = stats[index]
                let pair = typeSize.isAccessibilitySize
                    ? AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SL.Space.s2))
                    : AnyLayout(VStackLayout(alignment: .leading, spacing: 0))
                pair {
                    Text(stat.value)
                        .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                        .slNumerals()
                        .foregroundStyle(SL.Ink.primary)
                    Text(stat.label)
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                        .minimumScaleFactor(0.85)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
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
        SLGlyph(name: .camera, size: 12)
            .foregroundStyle(SL.Signal.action)
            .frame(width: 22, height: 22)
            .background(Circle().fill(SL.Surface.raised))
            .overlay(Circle().strokeBorder(SL.Surface.hairlineStrong, lineWidth: SL.Metric.border))
            .offset(x: 2, y: 2)
    }

    // MARK: - Sync

    /// How this account stands right now: one quiet line under the address,
    /// since it is reassurance rather than something to act on.
    private var syncLine: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Circle().fill(syncTone).frame(width: 7, height: 7)
                .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
            Text(syncText)
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Sync: \(syncText)")
    }

    /// One reading of where this account stands, so the dot and the line
    /// beside it can never disagree.
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

    private var syncText: String {
        switch standing {
        case .synced(let date):
            return "Synced \(Self.relative.localizedString(for: date, relativeTo: Date()))"
        case .waiting(let count):
            return "Waiting to sync · \(changes(count))"
        case .offline(let count):
            return count > 0 ? "Offline · \(changes(count)) waiting" : "Offline · saved on this phone"
        case .expired:
            return "Session expired · your work stays here"
        case .never:
            return "Not synced yet"
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
        summary.sessionCount == 1 ? "1 workout" : "\(summary.sessionCount) workouts"
    }

    private static let relative: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.unitsStyle = .full
        return formatter
    }()

    // MARK: - Training

    private var trainingGroup: some View {
        group("Training") {
            row("dumbbell.fill", tint: SL.Signal.action, title: "Plan", action: { choosingProgram = true }) {
                value(summary.planName)
            }
            if !summary.trainingDays.isEmpty {
                weekRow
            }
            row("square.stack.3d.up.fill", tint: SL.Signal.action, title: "Your workouts", action: { managingWorkouts = true }) {
                value(app.customWorkouts.isEmpty ? "Create one" : "\(app.customWorkouts.count)")
            }
            // The three rests by role read as a sentence for VoiceOver; on
            // screen the detail names them in the same order as the times.
            row("timer", tint: SL.Signal.action, title: "Rest timer",
                detail: summary.rest.map(\.roleLabel).joined(separator: ", ").capitalizedFirst) {
                value(summary.rest.map(\.label).joined(separator: " · "))
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Rest timer: \(summary.rest.map { "\($0.label) \($0.roleLabel)" }.joined(separator: ", "))")
            // 12R: "Per set vragen zet je aan in Account." This is where.
            toggleRow("gauge.with.dots.needle.33percent", tint: SL.Signal.action, title: "RIR on every set",
                      detail: "Reps in reserve, after each set", isOn: $rirEverySet)
            openWorkoutRow
        }
    }

    /// This week at a glance: the seven days, the training ones lit. Tapping
    /// it moves them.
    private var weekRow: some View {
        let days = Schedule.mondayFirstWeek(containing: Date()).map(Schedule.weekdayLabel)
        let count = summary.trainingDays.count
        return Button { planningWeek = true } label: {
            VStack(alignment: .leading, spacing: SL.Space.s3) {
                HStack(alignment: .center, spacing: SL.Space.s3) {
                    icon("calendar", tint: SL.Signal.action)
                    Text("Training days").slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                    Spacer(minLength: SL.Space.s2)
                    if !typeSize.isAccessibilitySize {
                        value(count == 1 ? "1 this week" : "\(count) this week")
                    }
                    Self.chevron
                }
                HStack(spacing: SL.Space.s1) {
                    ForEach(days, id: \.self) { day in
                        let on = summary.trainingDays.contains(day)
                        Text(day)
                            .font(.sl(SL.TypeSize.micro, on ? SL.Weight.semibold : SL.Weight.medium))
                            .foregroundStyle(on ? SL.Signal.action : SL.Ink.tertiary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity, minHeight: 30)
                            .background(Capsule().fill(on ? SL.Signal.actionTint : SL.Surface.raised2))
                            .overlay(Capsule().strokeBorder(on ? SL.Signal.action.opacity(0.35) : .clear, lineWidth: SL.Metric.border))
                    }
                }
                .padding(.leading, Self.iconSize + SL.Space.s3)
            }
            .padding(.horizontal, SL.Space.s4)
            .padding(.vertical, SL.Space.s3)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Training days: \(summary.trainingDays.joined(separator: ", "))")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Double-tap to move them")
    }

    /// How long a workout may sit open or paused before a nudge.
    private var openWorkoutRow: some View {
        row("bell.badge.fill", tint: SL.Signal.action, title: "Unfinished workout",
            detail: "A nudge if it's left open") {
            Menu {
                Picker("Remind me", selection: Binding(get: { openWorkoutMinutes }, set: { picked in
                    openWorkoutMinutes = picked
                    // Asks once, the first time a reminder is turned on.
                    if picked > 0 { Task { _ = await NutritionReminders.requestPermission() } }
                })) {
                    ForEach(WorkoutReminder.choices, id: \.self) { Text(WorkoutReminder.label($0)).tag($0) }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(WorkoutReminder.label(openWorkoutMinutes)).slBody(SL.Weight.medium)
                    Image(systemName: "chevron.up.chevron.down").font(.system(size: 11, weight: .semibold))
                }
                .foregroundStyle(SL.Ink.secondary)
                .frame(minHeight: SL.Space.hitMin)
            }
        }
    }

    // MARK: - Food

    private var foodGroup: some View {
        group("Food") {
            if let targets = summary.targets {
                row("fork.knife", tint: SL.Signal.recovery, title: "Daily targets", action: { editingTargets = true }) {
                    value("\(app.display.number(Decimal(targets.calories))) kcal · \(targets.protein) g")
                }
            }
            toggleRow("bell.fill", tint: SL.Signal.recovery, title: "Meal reminders",
                      detail: "Only when a meal isn't logged yet", isOn: mealRemindersBinding)
        }
    }

    private var mealRemindersBinding: Binding<Bool> {
        Binding(get: { mealReminders }, set: { on in
            if on {
                Task {
                    if await NutritionReminders.requestPermission() {
                        mealReminders = true
                        await NutritionReminders.update(app: app)
                    } else {
                        remindersDenied = true
                    }
                }
            } else {
                mealReminders = false
                Task { await NutritionReminders.update(app: app) }
            }
        })
    }

    // MARK: - App

    private var appGroup: some View {
        group("App") {
            toggleRow("speaker.wave.2.fill", tint: SL.Ink.secondary, title: "Sounds",
                      detail: "A click for a set, a chime for a record", isOn: $soundsOn)
            if AppLock.isAvailable {
                toggleRow(lockSymbol, tint: SL.Ink.secondary, title: "Lock with \(AppLock.methodName)",
                          detail: "Asked each time you come back", isOn: appLockBinding)
            }
        }
    }

    private var lockSymbol: String {
        switch AppLock.methodName {
        case "Face ID": return "faceid"
        case "Touch ID": return "touchid"
        case "Optic ID": return "opticid"
        default: return "lock.fill"
        }
    }

    /// Proving it is you before the lock goes on or off.
    private var appLockBinding: Binding<Bool> {
        Binding(get: { appLock }, set: { on in
            Task {
                if await AppLock.authenticate(reason: on ? "Turn on the app lock" : "Turn off the app lock") {
                    appLock = on
                }
            }
        })
    }

    // MARK: - Privacy

    private var privacyGroup: some View {
        // Posts settings only once there is a social profile to post from.
        group("Privacy", footer: social.me == nil ? nil
              : "Location is never shared unless you add a place to a post. Photo location data is always removed.") {
            if social.me != nil {
                row("eye.fill", tint: SL.Ink.secondary, title: "New posts are seen by",
                    detail: "Change it on any post", action: { choosingVisibility = true }) {
                    value(defaultVisibility.label)
                }
                row("hand.raised.fill", tint: SL.Ink.secondary, title: "Blocked people", action: { showsBlocked = true })
            }
            row("lock.shield.fill", tint: SL.Ink.secondary, title: "Privacy policy",
                detail: "What's kept, where, and your rights", action: { showsPolicy = true })
        }
    }

    // MARK: - Data

    /// Taking everything out, and starting over. The two deletes sit under
    /// the export, so the way to keep a copy is the first thing read.
    private var dataGroup: some View {
        let workouts = app.sessions.count
        return group("Your data", footer: "Deleting can't be undone. Export first if you want a copy.") {
            exportRow
            row("trash.fill", tint: SL.Signal.loss, title: "Delete all workouts", titleColor: SL.Signal.loss,
                detail: workouts == 0 ? "No workouts logged"
                    : "\(workouts == 1 ? "1 workout" : "\(workouts) workouts") · everything else stays",
                action: { confirmsResetWorkouts = true })
                .disabled(workouts == 0)
                .opacity(workouts == 0 ? 0.5 : 1)
            if social.me != nil {
                row("trash.fill", tint: SL.Signal.loss, title: "Delete all my posts", titleColor: SL.Signal.loss,
                    detail: "Your workouts stay in your log", action: { confirmsDeleteAll = true })
                    .disabled(social.myPostCount == 0)
                    .opacity(social.myPostCount == 0 ? 0.5 : 1)
            }
        }
    }

    @ViewBuilder
    private var exportRow: some View {
        if exports.isEmpty {
            row("square.and.arrow.up", tint: SL.Ink.secondary, title: "Export everything", detail: "No data to export yet")
        } else {
            ShareLink(items: exports) {
                // 23: the design's `download` glyph beside "Export", both
                // lime — the screen's one action.
                rowContent("square.and.arrow.up", tint: SL.Ink.secondary, title: "Export everything",
                           detail: social.me == nil ? "CSV and JSON" : "CSV, JSON and posts",
                           titleColor: SL.Ink.primary, chevron: false) {
                    HStack(spacing: 6) {
                        SLGlyph(name: .download, size: 16)
                        Text("Export").slBody(SL.Weight.semibold)
                    }
                    .foregroundStyle(SL.Signal.action)
                }
            }
            .buttonStyle(SLRowButtonStyle())
            .accessibilityLabel("Export everything. \(exportDetail)")
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

    private var signOutButton: some View {
        Button("Sign out") {
            if app.hasPendingChanges { confirmSignOut = true } else { app.signOut() }
        }
        .buttonStyle(SLOutlineButtonStyle(emphasis: .tertiary))
        .padding(.top, SL.Space.s2)
    }

    /// The version, and the credits the food photos' licences ask for.
    private var footer: some View {
        HStack(spacing: 6) {
            Text(versionLine)
            Text("·").accessibilityHidden(true)
            Button("Photo credits") { showsCredits = true }
                .foregroundStyle(SL.Ink.secondary)
                .frame(minHeight: SL.Space.hitMin)
        }
        .font(.sl(SL.TypeSize.meta, SL.Weight.regular))
        .foregroundStyle(SL.Ink.tertiary)
        .frame(maxWidth: .infinity)
        .padding(.top, -SL.Space.s2)
    }

    private var versionLine: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        guard let build = info?["CFBundleVersion"] as? String else { return "Setline \(version)" }
        return "Setline \(version) (\(build))"
    }

    // MARK: - Pieces

    private static let iconSize: CGFloat = 30

    /// A topic: its overline, its rows in one card with a hairline between
    /// them that starts where the text does, and an optional note beneath.
    private func group<Rows: View>(_ title: String, footer: String? = nil, @ViewBuilder rows: () -> Rows) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLOverline(text: title)
                .padding(.leading, SL.Space.s1)
                .accessibilityAddTraits(.isHeader)
            VStack(spacing: 0) {
                Group(subviews: rows()) { subviews in
                    ForEach(subviews) { subview in
                        subview
                        if subview.id != subviews.last?.id {
                            SLHairline().padding(.leading, SL.Space.s4 + Self.iconSize + SL.Space.s3)
                        }
                    }
                }
            }
            .slListCard()
            if let footer {
                Text(footer)
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, SL.Space.s1)
            }
        }
    }

    /// The tinted square that leads a row.
    private func icon(_ symbol: String, tint: Color) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: Self.iconSize, height: Self.iconSize)
            .background(RoundedRectangle(cornerRadius: SL.Radius.sm, style: .continuous).fill(tint.opacity(0.14)))
            .accessibilityHidden(true)
    }

    private func value(_ text: String) -> some View {
        Text(text)
            .slBody()
            .slNumerals()
            .foregroundStyle(SL.Ink.secondary)
            .multilineTextAlignment(typeSize.isAccessibilitySize ? .leading : .trailing)
    }

    /// A settings row: icon, label (and a line about it), its current value
    /// on the right, and a chevron when tapping it leads somewhere.
    @ViewBuilder
    private func row<Trailing: View>(
        _ symbol: String,
        tint: Color,
        title: String,
        titleColor: Color = SL.Ink.primary,
        detail: String? = nil,
        action: (() -> Void)? = nil,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        // A destructive row asks first; it doesn't lead anywhere, so no chevron.
        let content = rowContent(symbol, tint: tint, title: title, detail: detail, titleColor: titleColor,
                                 chevron: action != nil && titleColor != SL.Signal.loss, trailing: trailing)
        if let action {
            Button(action: action) { content }
                .buttonStyle(SLRowButtonStyle())
                .accessibilityHint("Double-tap to change")
        } else {
            content
        }
    }

    /// A row with nothing on the right but, when it leads somewhere, the chevron.
    private func row(
        _ symbol: String,
        tint: Color,
        title: String,
        titleColor: Color = SL.Ink.primary,
        detail: String? = nil,
        action: (() -> Void)? = nil
    ) -> some View {
        row(symbol, tint: tint, title: title, titleColor: titleColor, detail: detail, action: action) { EmptyView() }
    }

    private func rowContent<Trailing: View>(
        _ symbol: String,
        tint: Color,
        title: String,
        detail: String?,
        titleColor: Color,
        chevron: Bool,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        // At the largest sizes the value goes under the label, so neither is
        // broken off mid-word to make room for the other.
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s1))
            : AnyLayout(HStackLayout(alignment: .center, spacing: SL.Space.s2))
        return HStack(alignment: .center, spacing: SL.Space.s3) {
            icon(symbol, tint: tint)
            layout {
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).slBody(SL.Weight.medium).foregroundStyle(titleColor)
                    if let detail {
                        Text(detail)
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if !typeSize.isAccessibilitySize { Spacer(minLength: SL.Space.s2) }
                trailing()
                    .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                    .fixedSize(horizontal: !typeSize.isAccessibilitySize, vertical: false)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if chevron { Self.chevron }
        }
        .padding(.horizontal, SL.Space.s4)
        .padding(.vertical, SL.Space.s3)
        .frame(minHeight: 56)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func toggleRow(_ symbol: String, tint: Color, title: String, detail: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            HStack(alignment: .center, spacing: SL.Space.s3) {
                icon(symbol, tint: tint)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                    Text(detail)
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(SL.Signal.action)
        .padding(.horizontal, SL.Space.s4)
        .padding(.vertical, SL.Space.s3)
        .frame(minHeight: 56)
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

    /// Your posts and their music, photos (as paths) and counts, beside the
    /// training data: "Export everything" means everything.
    private func addPostsToExport() async {
        guard social.me != nil, !exports.isEmpty, let data = await social.exportMyPosts() else { return }
        let file = FileManager.default.temporaryDirectory
            .appendingPathComponent("setline-export", isDirectory: true)
            .appendingPathComponent("setline-posts.json")
        guard (try? data.write(to: file, options: .atomic)) != nil else { return }
        if !exports.contains(file) { exports.append(file) }
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

private extension String {
    /// "main lift, compound" → "Main lift, compound".
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
