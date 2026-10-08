import SwiftUI
import SetlineCore

/// Artboard 19 · Weekplanning.
///
/// Seven rows, one week, and one gesture: drag a session onto another day.
/// The rows carry the whole state — what is planned, what was decided, and
/// what is sitting away from its usual day — so nothing else has to be said.
struct WeekPlanView: View {
    @Environment(AppState.self) private var app
    let onClose: () -> Void

    @State private var draft: WeekDraft?
    @State private var targeted: String?
    @State private var confirmsDiscard = false

    /// The artboard's 28pt column, which has to grow with the text in it or
    /// "ma" breaks across two lines.
    @ScaledMetric(relativeTo: .body) private var weekdayWidth: CGFloat = 28

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .slDisplay()
                        .slNumerals()
                        .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
                        .foregroundStyle(SL.Ink.primary)

                    Text(subtitle)
                        .slMeta()
                        .foregroundStyle(SL.Ink.tertiary)
                        .padding(.top, 6)
                        .padding(.bottom, SL.Space.s5)

                    VStack(spacing: 6) {
                        ForEach(week) { day in
                            row(day)
                        }
                    }
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s6)
                .padding(.bottom, SL.Space.s8)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(SL.Surface.ground.ignoresSafeArea())
        .task {
            if draft == nil {
                draft = WeekDraft(
                    dates: Schedule.mondayFirstWeek(containing: Date()),
                    overrides: app.scheduleOverrides
                )
            }
        }
        .confirmationDialog("Discard changes?", isPresented: $confirmsDiscard, titleVisibility: .visible) {
            Button("Discard", role: .destructive) { onClose() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The week stays as it was.")
        }
        .slRespondsToTextSize()
    }

    // MARK: - Chrome

    private var header: some View {
        HStack {
            Button {
                if draft?.isChanged == true { confirmsDiscard = true } else { onClose() }
            } label: {
                Text("Back")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .slHitTarget()
            }
            .buttonStyle(.plain)

            Spacer()

            Button { save() } label: {
                Text("Save")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(hasChanges ? SL.Signal.action : SL.Ink.tertiary)
                    .slHitTarget()
            }
            .buttonStyle(.plain)
            .disabled(!hasChanges)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
    }

    private var title: String {
        "Week \(WeekPlan.number(firstSession: app.sessions.last?.date)) · \(WeekPlan.range(dates))"
    }

    private var subtitle: String {
        let count = week.filter(\.isTraining).count
        let days = count == 1 ? "1 training day" : "\(count) training days"
        return "Drag a session to another day. \(days) set."
    }

    // MARK: - Rows

    @ViewBuilder
    private func row(_ day: WeekPlan.Day) -> some View {
        switch day.kind {
        case let .training(workout):
            trainingRow(day, workout)
        case .rest, .open:
            quietRow(day)
        }
    }

    private func trainingRow(_ day: WeekPlan.Day, _ workout: WorkoutDay) -> some View {
        let moved = day.movedFrom != nil

        return HStack(spacing: 14) {
            weekday(day, bright: moved)

            VStack(alignment: .leading, spacing: 2) {
                Text(workout.short)
                    .slLead()
                    .foregroundStyle(SL.Ink.primary)
                Text(day.movedFrom.map { "Moved from \($0)" }
                    ?? "\(WeekPlan.sets(of: workout)) sets · ±\(WeekPlan.minutes(of: workout)) min")
                    .slMeta().slNumerals()
                    .foregroundStyle(moved ? SL.Ink.secondary : SL.Ink.tertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            handle(bright: moved)
        }
        .padding(.vertical, 14)
        .padding(.horizontal, SL.Space.s4)
        .frame(minHeight: SL.Space.hitMin)
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .fill(moved ? SL.Surface.raised : SL.Surface.raised2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(border(day, moved: moved), lineWidth: 1)
        )
        .offset(y: moved ? -2 : 0)
        .contentShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
        .draggable(day.key) { dragPreview(workout.short) }
        .dropDestination(for: String.self) { items, _ in drop(items, on: day) } isTargeted: { targeted = $0 ? day.key : nil }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel(day, workout))
        .accessibilityActions { moveActions(day) }
    }

    private func quietRow(_ day: WeekPlan.Day) -> some View {
        let decided = day.kind == .rest

        return Button {
            guard var current = draft else { return }
            if decided { current.clear(day.key) } else { current.markRest(day.key) }
            withAnimation(.easeOut(duration: SL.Motion.base)) { draft = current }
        } label: {
            HStack(spacing: 14) {
                weekday(day, bright: false)
                Text(decided ? "Rest day" : "Empty · mark as rest day")
                    .slBody()
                    .foregroundStyle(SL.Ink.tertiary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 14)
            .padding(.horizontal, SL.Space.s4)
            .frame(minHeight: SL.Space.hitMin)
            .slBorderBox()
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
        }
        .buttonStyle(.plain)
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(
                    border(day, moved: false),
                    style: StrokeStyle(lineWidth: 1, dash: targeted == day.key ? [] : [4, 4])
                )
        )
        .dropDestination(for: String.self) { items, _ in drop(items, on: day) } isTargeted: { targeted = $0 ? day.key : nil }
        .accessibilityLabel("\(WeekPlan.fullWeekday(day.date)), \(decided ? "rest day" : "nothing planned")")
        .accessibilityHint(decided ? "Double-tap to go back to the plan" : "Double-tap to mark as a rest day")
        .accessibilityActions { moveActions(day) }
    }

    private func weekday(_ day: WeekPlan.Day, bright: Bool) -> some View {
        Text(day.weekday)
            .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
            .foregroundStyle(bright ? SL.Ink.primary : SL.Ink.tertiary)
            .fixedSize()
            .frame(width: weekdayWidth, alignment: .leading)
    }

    private func handle(bright: Bool) -> some View {
        VStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { _ in
                Rectangle()
                    .fill(bright ? SL.Ink.secondary : SL.Ink.tertiary)
                    .frame(width: 16, height: 2)
            }
        }
        .accessibilityHidden(true)
    }

    private func dragPreview(_ name: String) -> some View {
        Text(name)
            .slLead()
            .foregroundStyle(SL.Ink.primary)
            .padding(.vertical, SL.Space.s2)
            .padding(.horizontal, SL.Space.s4)
            .slCard(radius: SL.Radius.md, loud: true)
    }

    private func border(_ day: WeekPlan.Day, moved: Bool) -> Color {
        if targeted == day.key { return SL.Signal.action }
        return moved ? SL.Surface.selection : SL.Surface.hairlineStrong
    }

    // MARK: - Moving

    private var dates: [Date] { draft?.dates ?? Schedule.mondayFirstWeek(containing: Date()) }

    private var week: [WeekPlan.Day] {
        draft?.week(plan: app.plan)
            ?? WeekPlan.week(containing: Date(), overrides: app.scheduleOverrides, plan: app.plan)
    }

    private var hasChanges: Bool { draft?.isChanged ?? false }

    private func drop(_ items: [String], on day: WeekPlan.Day) -> Bool {
        guard let source = items.first, source != day.key, var current = draft else { return false }
        current.move(from: source, to: day.key)
        withAnimation(.easeOut(duration: SL.Motion.base)) { draft = current }
        return true
    }

    /// Dragging is a gesture VoiceOver cannot make, so every row can also be
    /// sent to any other day from the rotor.
    @ViewBuilder
    private func moveActions(_ day: WeekPlan.Day) -> some View {
        if day.isTraining {
            ForEach(week.filter { $0.key != day.key }) { other in
                Button("Move to \(WeekPlan.fullWeekday(other.date))") {
                    _ = drop([day.key], on: other)
                }
            }
        }
    }

    private func accessibilityLabel(_ day: WeekPlan.Day, _ workout: WorkoutDay) -> String {
        var parts = ["\(WeekPlan.fullWeekday(day.date)), \(workout.short)"]
        if let movedFrom = day.movedFrom {
            parts.append("moved from \(movedFrom)")
        } else {
            parts.append("\(WeekPlan.sets(of: workout)) sets, about \(WeekPlan.minutes(of: workout)) minutes")
        }
        return parts.joined(separator: ", ")
    }

    private func save() {
        guard let draft, draft.isChanged else { return onClose() }
        let changes = draft.changes(programKey: app.programKey)
        onClose()
        Task { await app.record(changes) }
    }
}
