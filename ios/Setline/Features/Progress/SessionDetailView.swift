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
    @State private var isSaving = false

    /// Which set the correction sheet is open on.
    private struct Target: Identifiable {
        let resultIndex: Int
        let setIndex: Int
        var id: String { "\(resultIndex)-\(setIndex)" }
    }

    private var session: TrainingSession? { app.sessions.first { $0.id == sessionID } }
    private var results: [ExerciseResult] { editing ? draft : (session?.results ?? []) }
    private var hasChanges: Bool { editing && draft != session?.results }

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
                            Text("Opgeslagen zoals je hem deed. Wijzigingen in je plan raken deze sessie niet.")
                                .slMeta()
                                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                                .fixedSize(horizontal: false, vertical: true)
                                .foregroundStyle(SL.Ink.tertiary)
                                .padding(.top, SL.Space.s5)
                        }
                        .padding(.horizontal, SL.Space.gutterSession)
                        .padding(.top, SL.Space.s3)
                        .padding(.bottom, SL.Space.s12)
                    }
                } else {
                    // The session is no longer in the account — deleted on the
                    // web while this screen was open. Saying so beats an empty
                    // screen that looks broken.
                    Text("Deze sessie staat niet meer in je account.")
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.horizontal, SL.Space.gutterSession)
                        .padding(.top, SL.Space.s5)
                    Spacer()
                }
            }
        }
        .sheet(item: $correcting) { target in correctionSheet(target) }
        .confirmationDialog(
            "Correcties niet bewaren?",
            isPresented: $confirmsDiscard,
            titleVisibility: .visible
        ) {
            Button("Verwerp", role: .destructive) { stopEditing() }
            Button("Annuleer", role: .cancel) {}
        } message: {
            Text("De sessie blijft zoals hij was.")
        }
        .slRespondsToTextSize()
    }

    // MARK: - Chrome

    private var header: some View {
        HStack {
            Button {
                if hasChanges { confirmsDiscard = true } else if editing { stopEditing() } else { onClose() }
            } label: {
                Text(editing ? "Annuleer" : "Terug")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .slHitTarget()
            }
            .buttonStyle(.plain)

            Spacer()

            if session != nil {
                Button { editing ? save() : startEditing() } label: {
                    Text(editing ? "Bewaar" : "Wijzig")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(saveTone)
                        .slHitTarget()
                }
                .buttonStyle(.plain)
                .disabled(editing && (!hasChanges || isSaving))
                .accessibilityHint(editing
                    ? "Bewaart je correcties in deze sessie"
                    : "Maakt de sets van deze sessie aanpasbaar")
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
            SLEyebrow(text: "Historiek · \(WeekPlan.fullWeekday(session.date)) \(app.display.shortDate(session.date))")

            Text(titleLine(session))
                .slTitle()
                .slNumerals()
                .foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s2)

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
            return "\(completed) van \(planned) sets"
        }
        return "\(session.completion)% afgerond"
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
            parts.append("Tegenover \(app.display.shortDate(previous.date))")
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
        return waiting ? "Correctie wacht op sync." : nil
    }

    // MARK: - What was logged

    private func exercises(_ session: TrainingSession) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s4) {
            ForEach(Array(results.enumerated()), id: \.offset) { index, result in
                block(result, at: index, in: session)
                if index < results.count - 1 { SLHairline() }
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
        return VStack(alignment: .leading, spacing: 0) {
            SLEyebrow(text: result.name)
            if let stoodInFor = result.sets.compactMap(\.substitutedFrom).first {
                Text("stond in voor \(app.exercise(stoodInFor).name.lowercased())")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, 2)
            }

            ForEach(Array(result.sets.enumerated()), id: \.offset) { setIndex, set in
                row(
                    set,
                    number: setIndex + 1,
                    isRecord: RecordsEngine.isLoadPR(
                        set: set,
                        history: history,
                        earlierInSession: Array(result.sets.prefix(setIndex))
                    ),
                    target: Target(resultIndex: resultIndex, setIndex: setIndex),
                    exercise: result
                )
            }
            .padding(.top, SL.Space.s2)
        }
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
            .accessibilityHint("Dubbeltik om deze set te corrigeren")
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
            if let rir = set.rirReported {
                Text("RIR \(rir)").slMeta().slNumerals().foregroundStyle(SL.Ink.tertiary)
            }
            // One mark, never two: the whole set paused, or the reps of it
            // that were. A count is inside the reps, so it never reads "+".
            if let paused = set.pausedReps, paused > 0 {
                Text("\(paused) pauze-reps")
                    .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                    .slNumerals()
                    .foregroundStyle(SL.Signal.attention)
            } else if set.modifiers.pauseEnabled {
                Text("pauze").font(.sl(SL.TypeSize.micro, SL.Weight.semibold)).foregroundStyle(SL.Signal.attention)
            }
            if let partial = set.partialReps, partial > 0 {
                Text("partieel +\(partial)")
                    .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                    .slNumerals()
                    .foregroundStyle(SL.Signal.attention)
            }
            if set.origin == .sessionAdded {
                Text("extra").font(.sl(SL.TypeSize.micro, SL.Weight.semibold)).foregroundStyle(SL.Ink.tertiary)
            }
            if set.isWarmup {
                Text("opwarming").font(.sl(SL.TypeSize.micro, SL.Weight.semibold)).foregroundStyle(SL.Ink.tertiary)
            }
        }
    }

    private func label(_ set: LoggedSet, number: Int, isRecord: Bool) -> String {
        var parts = ["Set \(number)", app.display.kg(set.weightKg ?? 0), "\(set.reps) reps"]
        if isRecord { parts.append("persoonlijk record") }
        if let rir = set.rirReported { parts.append("RIR \(rir)") }
        if let paused = set.pausedReps, paused > 0 {
            parts.append("waarvan \(paused) met pauze")
        } else if set.modifiers.pauseEnabled {
            parts.append("met pauze")
        }
        if let partial = set.partialReps, partial > 0 { parts.append("\(partial) partiële reps") }
        if set.origin == .sessionAdded { parts.append("extra set") }
        if set.isWarmup { parts.append("opwarming") }
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
                onClose: { correcting = nil }
            )
        }
    }

    private func startEditing() {
        draft = session?.results ?? []
        withAnimation(.easeOut(duration: SL.Motion.base)) { editing = true }
    }

    private func stopEditing() {
        withAnimation(.easeOut(duration: SL.Motion.base)) { editing = false }
        draft = []
    }

    /// Only the sets that actually changed travel, each named by where it sits
    /// in the session: the exercise it was logged under, which result that is
    /// when a session holds the same exercise twice, and its place in that
    /// result. Nothing else about the session is sent.
    private func save() {
        guard let session, hasChanges else { return stopEditing() }
        var corrections: [SetCorrection] = []
        var seen: [String: Int] = [:]

        for (resultIndex, result) in draft.enumerated() {
            let occurrence = seen[result.exerciseID, default: 0]
            seen[result.exerciseID] = occurrence + 1
            guard session.results.indices.contains(resultIndex) else { continue }
            let stored = session.results[resultIndex]
            for (setIndex, set) in result.sets.enumerated() where stored.sets.indices.contains(setIndex) {
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

        guard !corrections.isEmpty else { return stopEditing() }
        isSaving = true
        Task {
            await app.correct(sessionID: session.id, corrections)
            isSaving = false
            stopEditing()
        }
    }
}
