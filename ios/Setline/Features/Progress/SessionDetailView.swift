import SwiftUI
import SetlineCore

/// One saved workout, opened from Historiek.
///
/// Review context, not a session: no set grid, no timer, no commit pill. The
/// blocks are 17R's — eyebrow, title, volume, then one block per exercise —
/// because that is the vocabulary the app already uses for a workout that is
/// over. The design has no artboard for a session detail (checked against
/// Main and Review in the Claude Design project), so everything here is built
/// from parts the system already has.
///
/// It shows what was saved that day and nothing reconstructed from today's
/// plan: the exercises in the order they were performed, each set as it was
/// logged, and the markers the data actually carries.
struct SessionDetailView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize

    let sessionID: String
    let onClose: () -> Void

    @State private var editing = false
    @State private var draft: [ExerciseResult] = []
    @State private var correcting: Target?
    @State private var confirmsDiscard = false
    @State private var confirmsDelete = false
    @Environment(SocialStore.self) private var social
    @State private var posting = false

    /// This workout's post, if it has one.
    private var existingPost: FeedPost? {
        guard let id = session?.id else { return nil }
        return social.feed.first { $0.session_id == id && $0.user_id == social.myID }
    }
    @State private var isSaving = false
    /// Sets taken out while editing, by where they sit in the stored session.
    /// Held beside the draft rather than cut from it, so every other set keeps
    /// the index the correction it may also carry is named by.
    @State private var removed: Set<String> = []
    /// Asked before the last set of the session goes, because that takes the
    /// session with it.
    @State private var confirmsLastSet: Target?
    /// The workout's name while editing.
    @State private var titleDraft = ""
    /// Minutes while editing; `nil` until the duration is touched.
    @State private var durationDraft: Int?
    /// The exercise whose identity is being changed.
    @State private var pickingExercise: Int?

    /// Which set the correction sheet is open on.
    private struct Target: Identifiable {
        let resultIndex: Int
        let setIndex: Int
        var id: String { "\(resultIndex)-\(setIndex)" }
    }

    private var session: TrainingSession? { app.sessions.first { $0.id == sessionID } }

    /// The medals the day earned against everything before it.
    private var medals: [LiftMedal] {
        guard let session else { return [] }
        return Medals.medals(for: session, in: app.sessions)
    }

    /// The share picture, drawn when the page opens.
    @State private var shareImage: Image?
    private var results: [ExerciseResult] { editing ? draft : (session?.results ?? []) }
    private var hasChanges: Bool {
        editing && (draft != session?.results || !removed.isEmpty || titleChanged || durationChanged)
    }

    private var durationChanged: Bool {
        guard let session, let durationDraft else { return false }
        return durationDraft * 60 != (session.durationSeconds ?? -1)
    }

    private var titleChanged: Bool {
        guard let session else { return false }
        let typed = titleDraft.trimmingCharacters(in: .whitespaces)
        return !typed.isEmpty && typed != session.dayLabel
    }

    /// A different exercise or a new name can't travel as set corrections,
    /// which find their sets by exercise: then the whole session is written.
    private var changesStructure: Bool {
        guard let session else { return false }
        if titleChanged || durationChanged { return true }
        return draft.indices.contains { index in
            !session.results.indices.contains(index) || draft[index].exerciseID != session.results[index].exerciseID
        }
    }

    /// The sets of one result that are still in the session, each with the
    /// index the stored session knows it by.
    private func visibleSets(of result: ExerciseResult, at resultIndex: Int) -> [(index: Int, set: LoggedSet)] {
        result.sets.enumerated()
            .filter { !removed.contains(Target(resultIndex: resultIndex, setIndex: $0.offset).id) }
            .map { (index: $0.offset, set: $0.element) }
    }

    /// How many sets the whole session would still hold.
    private var remainingSetCount: Int {
        results.enumerated().reduce(0) { total, entry in
            total + visibleSets(of: entry.element, at: entry.offset).count
        }
    }

    var body: some View {
        ZStack {
            SL.Surface.ground.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                header

                if let session {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            summary(session)
                            exercises(session)
                            Text("Saved as you did it. Changes to your plan don't affect this session.")
                                .slMeta()
                                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                                .fixedSize(horizontal: false, vertical: true)
                                .foregroundStyle(SL.Ink.tertiary)
                                .padding(.top, SL.Space.s5)

                            // The whole workout, out of the account. Last on
                            // the page and in the loss red, so it is never
                            // the thing a thumb lands on by accident.
                            if !editing {
                                Button { confirmsDelete = true } label: {
                                    HStack(spacing: SL.Space.s2) {
                                        SLGlyph(name: .trash, size: 17)
                                        Text("Delete this session")
                                    }
                                    .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                                    .foregroundStyle(SL.Signal.loss)
                                    .frame(maxWidth: .infinity)
                                    .slHitTarget()
                                }
                                .buttonStyle(.plain)
                                .padding(.top, SL.Space.s8)
                            }
                        }
                        .padding(.horizontal, SL.Space.gutterSession)
                        .padding(.top, SL.Space.s3)
                        .padding(.bottom, SL.Space.s12)
                    }
                } else {
                    // The session is no longer in the account — deleted on the
                    // web while this screen was open. Saying so beats an empty
                    // screen that looks broken.
                    Text("This session is no longer in your account.")
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.horizontal, SL.Space.gutterSession)
                        .padding(.top, SL.Space.s5)
                    Spacer()
                }
            }
        }
        .sheet(item: $correcting) { target in correctionSheet(target) }
        .sheet(isPresented: Binding(get: { pickingExercise != nil }, set: { if !$0 { pickingExercise = nil } })) {
            ExercisePickerSheet(
                rows: ExercisePicker.rows(sessions: app.sessions, favorites: app.favoriteExercises),
                selected: pickingExercise.flatMap { draft.indices.contains($0) ? draft[$0].exerciseID : nil },
                onPick: { row in
                    if let index = pickingExercise, draft.indices.contains(index) {
                        draft[index].exerciseID = row.exerciseID
                        draft[index].name = row.name
                    }
                    pickingExercise = nil
                },
                onStar: { row in
                    Task { await app.setFavorite(exerciseID: row.exerciseID, isFavorite: !row.isFavorite) }
                },
                onClose: { pickingExercise = nil }
            )
        }
        .task(id: session?.results) {
            guard let session else { return }
            shareImage = WorkoutShareCard(
                session: session,
                medals: medals,
                streakWeeks: app.streak.weeks,
                display: app.display
            ).image()
        }
        // An alert rather than a dialog, because both answers have to be
        // visible: one of them removes a workout from the account.
        .alert(
            "This is the last set of this session.",
            isPresented: Binding(get: { confirmsLastSet != nil }, set: { if !$0 { confirmsLastSet = nil } })
        ) {
            Button("Keep", role: .cancel) { confirmsLastSet = nil }
            Button("Delete the session", role: .destructive) {
                if let target = confirmsLastSet { remove(target) }
                confirmsLastSet = nil
            }
        } message: {
            Text("Without sets there's no session left. It disappears from your log when you save.")
        }
        .alert("Delete this session?", isPresented: $confirmsDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                guard let id = session?.id else { return }
                Task {
                    await app.removeSession(id: id)
                    onClose()
                }
            }
        } message: {
            Text("All sets of this day disappear from your log and your progress, on the web too.")
        }
        .confirmationDialog(
            "Discard corrections?",
            isPresented: $confirmsDiscard,
            titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive) { stopEditing() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The session stays as it was.")
        }
        .slRespondsToTextSize()
    }

    // MARK: - Chrome

    private var header: some View {
        HStack {
            Button {
                if hasChanges { confirmsDiscard = true } else if editing { stopEditing() } else { onClose() }
            } label: {
                Text(editing ? "Cancel" : "Back")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .slHitTarget()
            }
            .buttonStyle(.plain)

            Spacer()

            if let shareImage, !editing, let session {
                ShareLink(
                    item: shareImage,
                    preview: SharePreview("\(session.dayLabel) · \(app.display.shortDate(session.date))", image: shareImage)
                ) {
                    SLGlyph(name: .share, size: 20, fixed: true)
                        .foregroundStyle(SL.Ink.secondary)
                        .slHitTarget()
                }
                .accessibilityLabel("Share this workout")
            }

            // A saved workout can become a post later, or its post be edited.
            if let session, !editing, session.kind == .workout, social.me != nil {
                Button { posting = true } label: {
                    SLGlyph(name: .people, size: 20, fixed: true)
                        .foregroundStyle(SL.Ink.secondary)
                        .slHitTarget()
                }
                .buttonStyle(.plain)
                .accessibilityLabel(existingPost == nil ? "Create post" : "Edit post")
                .fullScreenCover(isPresented: $posting) {
                    if let post = existingPost {
                        PostComposerView(mode: .edit(post), onClose: { posting = false })
                    } else {
                        PostComposerView(mode: .create(session), onClose: { posting = false })
                    }
                }
            }

            if session != nil {
                Button { editing ? save() : startEditing() } label: {
                    Text(editing ? "Save" : "Edit")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(saveTone)
                        .slHitTarget()
                }
                .buttonStyle(.plain)
                .disabled(editing && (!hasChanges || isSaving))
                .accessibilityHint(editing
                    ? "Saves your corrections in this session"
                    : "Makes the sets of this session editable")
            }
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
    }

    private var saveTone: Color {
        guard editing else { return SL.Ink.secondary }
        return hasChanges && !isSaving ? SL.Signal.action : SL.Ink.tertiary
    }

    // MARK: - What the day was

    private func summary(_ session: TrainingSession) -> some View {
        let volume = RecordsEngine.volumeLoad(results.flatMap(\.sets))
        return VStack(alignment: .leading, spacing: 0) {
            // 35: the date names the screen, the duration travels with the
            // session's own name.
            SLEyebrow(text: "Log · \(WeekPlan.fullWeekday(session.date)) \(app.display.shortDate(session.date))")

            if editing {
                HStack(spacing: SL.Space.s2) {
                    TextField(session.dayLabel, text: $titleDraft)
                        .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                        .foregroundStyle(SL.Ink.primary)
                        .tint(SL.Signal.action)
                        .submitLabel(.done)
                    Image(systemName: "pencil")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(SL.Signal.action)
                }
                .padding(.horizontal, SL.Space.s3)
                .frame(minHeight: 48)
                .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised))
                .padding(.top, SL.Space.s2)
                .accessibilityLabel("Workout name")

                // A workout logged afterwards, or with the clock left
                // running, gets its real length here.
                DurationRow(
                    minutes: Binding(
                        get: { durationDraft ?? max(5, Int((Double(session.durationSeconds ?? 0) / 300).rounded()) * 5) },
                        set: { durationDraft = $0 }
                    ),
                    note: session.durationSeconds == nil ? "Not recorded yet" : nil
                )
                .padding(.top, SL.Space.s2)
            } else {
                Text(titleLine(session))
                    .slTitle()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                    .padding(.top, SL.Space.s2)
            }

            SLEyebrow(text: "Volume").padding(.top, SL.Space.s4)
            SLValueRow {
                Text(app.display.volumeKg(volume))
                    .slDisplay(SL.TypeSize.displayXL)
                    .slNumerals()
                    .slLineHeight(1.04, size: SL.TypeSize.displayXL)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .foregroundStyle(SL.Ink.primary)
                if let delta = volumeDelta(session, volume) {
                    Text(app.display.signedDelta(delta))
                        .slLead()
                        .slNumerals()
                        .foregroundStyle(delta > 0 ? SL.Signal.action : SL.Ink.secondary)
                }
            }
            .padding(.top, 6)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Volume \(app.display.volumeKg(volume))")

            Text(againstLine(session))
                .slBody().slNumerals()
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, SL.Space.s2)

            if !medals.isEmpty, !editing {
                VStack(spacing: 0) {
                    ForEach(Array(medals.enumerated()), id: \.element.id) { index, medal in
                        SLMedalRow(medal: medal, display: app.display)
                            .padding(.vertical, SL.Space.s3)
                            .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                    }
                }
                .padding(.horizontal, SL.Space.s4)
                .slBorderBox()
                .slListCard()
                .padding(.top, SL.Space.s4)
            }

            if let pending = pendingNote {
                Text(pending)
                    .slMeta()
                    .foregroundStyle(SL.Signal.attention)
                    .padding(.top, SL.Space.s3)
            }
        }
        .padding(.bottom, SL.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { SLHairline() }
    }

    /// Sets when the session counted them, the stored percentage when it did
    /// not — the same rule Historiek's rows follow.
    private func completionLabel(_ session: TrainingSession) -> String {
        if let planned = session.plannedSetCount, let completed = session.completedSetCount, planned > 0 {
            return "\(completed) of \(planned) sets"
        }
        return "\(session.completion)% done"
    }

    private func titleLine(_ session: TrainingSession) -> String {
        var parts = [session.dayLabel]
        if let seconds = session.durationSeconds, seconds > 0 { parts.append(app.display.minutes(seconds)) }
        return parts.joined(separator: " · ")
    }

    /// 35: "Tegenover 29 aug · 17 van 17 sets" — what this session stands
    /// against, and how much of its prescription it holds.
    private func againstLine(_ session: TrainingSession) -> String {
        var parts: [String] = []
        if let previous = previousSession(session) {
            parts.append("Against \(app.display.shortDate(previous.date))")
        }
        parts.append(completionLabel(session))
        return parts.joined(separator: " · ")
    }

    private func previousSession(_ session: TrainingSession) -> TrainingSession? {
        app.sessions
            .filter { $0.kind == .workout && $0.dayID == session.dayID && $0.date < session.date }
            .max { $0.date < $1.date }
    }

    private func volumeDelta(_ session: TrainingSession, _ volume: Decimal) -> Decimal? {
        guard let previous = previousSession(session) else { return nil }
        let before = RecordsEngine.volumeLoad(previous.results.flatMap(\.sets))
        guard before > 0, volume != before else { return nil }
        return volume - before
    }

    /// A correction made offline waits like any other change; the screen says
    /// so rather than implying the account already has it.
    private var pendingNote: String? {
        let waiting = app.pendingChanges.contains { change in
            if case .correctSessionSets(let id, _) = change.kind { return id == sessionID }
            return false
        }
        return waiting ? "Correction waiting to sync." : nil
    }

    // MARK: - What was logged

    private func exercises(_ session: TrainingSession) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s4) {
            ForEach(Array(results.enumerated()), id: \.offset) { index, result in
                if editing || !visibleSets(of: result, at: index).isEmpty {
                    block(result, at: index, in: session)
                    if index < results.count - 1 { SLHairline() }
                }
            }
        }
        .padding(.top, SL.Space.s5)
    }

    private func block(_ result: ExerciseResult, at resultIndex: Int, in session: TrainingSession) -> some View {
        // Records are judged against what came before that day, never against
        // sessions logged since.
        let history = ExerciseHistory.build(
            exerciseID: result.exerciseID,
            modifiers: result.sets.first?.modifiers ?? .none,
            from: app.sessions,
            before: session.date
        )
        let medal = editing ? nil : medals.first { $0.exerciseID == result.exerciseID }
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: SL.Space.s2) {
                if editing {
                    Button { pickingExercise = resultIndex } label: {
                        HStack(spacing: 6) {
                            SLEyebrow(text: result.name)
                            Image(systemName: "pencil")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(SL.Signal.action)
                        }
                        .frame(minHeight: SL.Space.hitMin)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Change exercise, now \(result.name)")
                } else {
                    SLEyebrow(text: result.name)
                }
                if let medal {
                    SLMedal(place: medal.place, size: 18)
                        .accessibilityLabel(medal.place.title)
                }
            }
            if let stoodInFor = result.sets.compactMap(\.substitutedFrom).first {
                Text("stood in for \(app.exercise(stoodInFor).name.lowercased())")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, 2)
            }

            ForEach(Array(visibleSets(of: result, at: resultIndex).enumerated()), id: \.element.index) { position, entry in
                row(
                    entry.set,
                    number: position + 1,
                    isRecord: RecordsEngine.isLoadPR(
                        set: entry.set,
                        history: history,
                        earlierInSession: Array(result.sets.prefix(entry.index))
                    ),
                    target: Target(resultIndex: resultIndex, setIndex: entry.index),
                    exercise: result
                )
            }
            .padding(.top, SL.Space.s2)

            if editing && visibleSets(of: result, at: resultIndex).isEmpty {
                Text("No sets. Add one, or this exercise is left out when you save.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, SL.Space.s2)
            }
            if editing {
                Button { addSet(to: resultIndex) } label: {
                    Label("Add set", systemImage: "plus")
                        .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                        .foregroundStyle(SL.Signal.action)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: SL.Space.hitMin)
                        .overlay(
                            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                .strokeBorder(SL.Signal.action.opacity(0.45), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, 6)
                .accessibilityHint("Adds a set you did but didn't log")
            }
        }
    }

    /// A set done but not logged: it starts as a copy of the exercise's last
    /// set and opens straight away to be corrected.
    private func addSet(to resultIndex: Int) {
        guard draft.indices.contains(resultIndex) else { return }
        let last = draft[resultIndex].sets.last
        var set = LoggedSet(
            index: draft[resultIndex].sets.count,
            weightKg: last?.weightKg,
            reps: last?.reps ?? 8,
            modifiers: last?.modifiers ?? .none,
            origin: .sessionAdded
        )
        set.substitutedFrom = last?.substitutedFrom
        withAnimation(.easeOut(duration: SL.Motion.fast)) { draft[resultIndex].sets.append(set) }
        correcting = Target(resultIndex: resultIndex, setIndex: set.index)
    }

    @ViewBuilder
    private func row(
        _ set: LoggedSet,
        number: Int,
        isRecord: Bool,
        target: Target,
        exercise: ExerciseResult
    ) -> some View {
        let content = rowContent(set, number: number, isRecord: isRecord)

        if editing {
            Button { correcting = target } label: {
                HStack(spacing: SL.Space.s2) {
                    content
                    SLGlyph(name: .chevronRight, size: 20)
                        .foregroundStyle(SL.Ink.tertiary)
                }
                .padding(.horizontal, SL.Space.s3)
                .frame(minHeight: SL.Space.hitMin)
                .slBorderBox()
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                        .fill(SL.Surface.raised)
                )
                .contentShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
            .accessibilityLabel(label(set, number: number, isRecord: isRecord))
            .accessibilityHint("Double-tap to correct this set")
        } else {
            content
                .frame(minHeight: SL.Space.hitMin, alignment: .leading)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(label(set, number: number, isRecord: isRecord))
        }
    }

    private func rowContent(_ set: LoggedSet, number: Int, isRecord: Bool) -> some View {
        rowLayout {
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                Text("\(number)")
                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                    .slNumerals()
                    .foregroundStyle(SL.Ink.tertiary)
                    .frame(width: 20, alignment: .leading)
                Text(value(set))
                    .slLead()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
            }
            if !typeSize.isAccessibilitySize { Spacer(minLength: SL.Space.s2) }
            markers(set, isRecord: isRecord)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var rowLayout: AnyLayout {
        typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SL.Space.s2))
    }

    private func value(_ set: LoggedSet) -> String {
        "\(app.display.kg(set.weightKg ?? 0)) × \(set.reps)"
    }

    /// Only what the set itself carries: nothing here is inferred from the
    /// programme as it stands today.
    private func markers(_ set: LoggedSet, isRecord: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s2) {
            if isRecord {
                Text("PR").font(.sl(SL.TypeSize.micro, SL.Weight.semibold)).foregroundStyle(SL.Signal.action)
            }
            if let side = set.side {
                Text(set.sideReps?.label ?? side.label).font(.sl(SL.TypeSize.micro, SL.Weight.semibold)).slNumerals().foregroundStyle(SL.Ink.secondary)
            }
            if let rir = set.rirReported {
                if rir == 0 {
                    Text("to failure").font(.sl(SL.TypeSize.micro, SL.Weight.semibold)).foregroundStyle(SL.Signal.attention)
                } else {
                    Text("RIR \(rir)").slMeta().slNumerals().foregroundStyle(SL.Ink.tertiary)
                }
            }
            if set.flags.contains(.failed) {
                Text("failed").font(.sl(SL.TypeSize.micro, SL.Weight.semibold)).foregroundStyle(SL.Signal.loss)
            }
            if !set.drops.isEmpty {
                Text("then " + set.drops.map { "\(app.display.number($0.weightKg)) × \($0.reps)" }.joined(separator: ", "))
                    .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                    .slNumerals()
                    .foregroundStyle(SL.Signal.attention)
            }
            // One mark, never two: the whole set paused, or the reps of it
            // that were. A count is inside the reps, so it never reads "+".
            if let paused = set.pausedReps, paused > 0 {
                Text("last \(paused) paused")
                    .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                    .slNumerals()
                    .foregroundStyle(SL.Signal.attention)
            } else if set.modifiers.pauseEnabled {
                Text("pause").font(.sl(SL.TypeSize.micro, SL.Weight.semibold)).foregroundStyle(SL.Signal.attention)
            }
            if let partial = set.partialReps, partial > 0 {
                Text("partial +\(partial)")
                    .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                    .slNumerals()
                    .foregroundStyle(SL.Signal.attention)
            }
            if set.origin == .sessionAdded {
                Text("extra").font(.sl(SL.TypeSize.micro, SL.Weight.semibold)).foregroundStyle(SL.Ink.tertiary)
            }
            if set.isWarmup {
                Text("warm-up").font(.sl(SL.TypeSize.micro, SL.Weight.semibold)).foregroundStyle(SL.Ink.tertiary)
            }
        }
    }

    private func label(_ set: LoggedSet, number: Int, isRecord: Bool) -> String {
        var parts = ["Set \(number)", app.display.kg(set.weightKg ?? 0), "\(set.reps) reps"]
        if isRecord { parts.append("personal record") }
        if let sides = set.sideReps {
            parts.append("left \(sides.left), right \(sides.right) reps")
        } else if let side = set.side {
            parts.append(side == .both ? "both sides" : side == .left ? "left side" : "right side")
        }
        if let rir = set.rirReported { parts.append(rir == 0 ? "to failure" : "RIR \(rir)") }
        if set.flags.contains(.failed) { parts.append("failed") }
        if !set.drops.isEmpty {
            parts.append("drop set: then " + set.drops.map { "\(app.display.kg($0.weightKg)) × \($0.reps)" }.joined(separator: ", "))
        }
        if let paused = set.pausedReps, paused > 0 {
            parts.append("the last \(paused) paused")
        } else if set.modifiers.pauseEnabled {
            parts.append("paused")
        }
        if let partial = set.partialReps, partial > 0 { parts.append("\(partial) partial reps") }
        if set.origin == .sessionAdded { parts.append("extra set") }
        if set.isWarmup { parts.append("warm-up") }
        return parts.joined(separator: ", ")
    }

    // MARK: - Correcting

    @ViewBuilder
    private func correctionSheet(_ target: Target) -> some View {
        if draft.indices.contains(target.resultIndex),
           draft[target.resultIndex].sets.indices.contains(target.setIndex) {
            let result = draft[target.resultIndex]
            SetCorrectionSheet(
                exerciseName: result.name,
                setNumber: target.setIndex + 1,
                increment: app.exercise(result.exerciseID).incrementKg,
                display: app.display,
                original: result.sets[target.setIndex],
                onApply: { corrected in
                    draft[target.resultIndex].sets[target.setIndex] = corrected
                    correcting = nil
                },
                onDelete: {
                    correcting = nil
                    if remainingSetCount <= 1 {
                        confirmsLastSet = target
                    } else {
                        remove(target)
                    }
                },
                onClose: { correcting = nil }
            )
        }
    }

    private func startEditing() {
        draft = session?.results ?? []
        titleDraft = session?.dayLabel ?? ""
        durationDraft = nil
        removed = []
        withAnimation(.easeOut(duration: SL.Motion.base)) { editing = true }
    }

    private func stopEditing() {
        withAnimation(.easeOut(duration: SL.Motion.base)) { editing = false }
        draft = []
        removed = []
    }

    private func remove(_ target: Target) {
        withAnimation(.easeOut(duration: SL.Motion.fast)) { _ = removed.insert(target.id) }
    }

    /// A new name or a different exercise: the session as the screen shows
    /// it, written whole. Sets taken out are gone, set numbers follow the
    /// rows, and an exercise left without sets is left out.
    private func saveWhole(_ session: TrainingSession) {
        var updated = session
        let typed = titleDraft.trimmingCharacters(in: .whitespaces)
        if !typed.isEmpty { updated.dayLabel = String(typed.prefix(60)) }
        if let durationDraft { updated.durationSeconds = durationDraft * 60 }
        updated.results = draft.enumerated().compactMap { resultIndex, result in
            var kept = result
            kept.sets = result.sets.enumerated()
                .filter { !removed.contains(Target(resultIndex: resultIndex, setIndex: $0.offset).id) }
                .enumerated()
                .map { position, entry in
                    var set = entry.element
                    set.index = position
                    return set
                }
            return kept.sets.isEmpty ? nil : kept
        }
        // Stored exercises that are no longer there as themselves: swapped for
        // another, or left without sets. Their sets go, back to front.
        var removals: [SetRemoval] = []
        var seen: [String: Int] = [:]
        for (index, stored) in session.results.enumerated() {
            let occurrence = seen[stored.exerciseID, default: 0]
            seen[stored.exerciseID] = occurrence + 1
            let stays = draft.indices.contains(index)
                && draft[index].exerciseID == stored.exerciseID
                && updated.results.contains { $0.exerciseID == stored.exerciseID }
            guard !stays else { continue }
            removals += stored.sets.indices.reversed().map {
                SetRemoval(exerciseID: stored.exerciseID, occurrence: occurrence, setIndex: $0)
            }
        }
        isSaving = true
        Task {
            if updated.results.isEmpty {
                await app.removeSession(id: session.id)
            } else {
                await app.replace(session: updated, removing: removals)
            }
            isSaving = false
            stopEditing()
            if app.sessions.contains(where: { $0.id == session.id }) == false { onClose() }
        }
    }

    /// Only the sets that actually changed travel, each named by where it sits
    /// in the session: the exercise it was logged under, which result that is
    /// when a session holds the same exercise twice, and its place in that
    /// result. Nothing else about the session is sent.
    private func save() {
        guard let session, hasChanges else { return stopEditing() }
        if changesStructure { return saveWhole(session) }
        var corrections: [SetCorrection] = []
        var seen: [String: Int] = [:]

        var removals: [SetRemoval] = []

        for (resultIndex, result) in draft.enumerated() {
            let occurrence = seen[result.exerciseID, default: 0]
            seen[result.exerciseID] = occurrence + 1
            guard session.results.indices.contains(resultIndex) else { continue }
            let stored = session.results[resultIndex]
            for (setIndex, set) in result.sets.enumerated() where stored.sets.indices.contains(setIndex) {
                if removed.contains(Target(resultIndex: resultIndex, setIndex: setIndex).id) {
                    // A set on its way out is not corrected on the way.
                    removals.append(
                        SetRemoval(exerciseID: result.exerciseID, occurrence: occurrence, setIndex: setIndex)
                    )
                    continue
                }
                guard set != stored.sets[setIndex] else { continue }
                corrections.append(
                    SetCorrection(
                        exerciseID: result.exerciseID,
                        occurrence: occurrence,
                        setIndex: setIndex,
                        set: set
                    )
                )
            }
        }

        // Sets past the end of what was stored are new, unless taken out again.
        var additions: [SetAddition] = []
        seen = [:]
        for (resultIndex, result) in draft.enumerated() {
            let occurrence = seen[result.exerciseID, default: 0]
            seen[result.exerciseID] = occurrence + 1
            let storedCount = session.results.indices.contains(resultIndex) ? session.results[resultIndex].sets.count : 0
            let added = result.sets.enumerated()
                .filter { $0.offset >= storedCount && !removed.contains(Target(resultIndex: resultIndex, setIndex: $0.offset).id) }
                .map(\.element)
            if !added.isEmpty {
                additions.append(SetAddition(exerciseID: result.exerciseID, occurrence: occurrence, sets: added))
            }
        }

        guard !corrections.isEmpty || !removals.isEmpty || !additions.isEmpty else { return stopEditing() }
        isSaving = true
        let id = session.id
        Task {
            // Corrections first, by the indices the reader saw; the removals
            // then take their sets out from the back forward.
            if !corrections.isEmpty { await app.correct(sessionID: id, corrections) }
            if !removals.isEmpty { await app.removeSets(sessionID: id, removals) }
            if !additions.isEmpty { await app.addSets(sessionID: id, additions) }
            isSaving = false
            stopEditing()
            // A session whose last set has gone is gone: there is nothing left
            // for this screen to show.
            if app.sessions.contains(where: { $0.id == id }) == false { onClose() }
        }
    }
}
