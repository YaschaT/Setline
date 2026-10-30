import SwiftUI
import SetlineCore

/// "Plan & workouts": the one place to build workouts of your own, change
/// the plan, and start any of them. Reached from Training (the plan card's
/// row and "or choose a different workout") and from Account › Plan.
/// Without `onStart` (from Account) nothing starts here: it is for building.
struct WorkoutChooserSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize
    var onStart: ((WorkoutDay) -> Void)?
    let onChangePlan: () -> Void
    let onClose: () -> Void

    /// A paused workout is finished or ended before another starts, so its
    /// sets are never overwritten.
    private var blocked: Bool { app.resumableSession != nil }
    private var canStart: Bool { onStart != nil && !blocked }

    @State private var editing: CustomWorkout?
    @State private var creating = false
    @State private var planningWeek = false

    var body: some View {
        SLSheet(title: "Plan & workouts",
                subtitle: onStart == nil ? "Build your own workouts or change your plan" : "Start any workout, build your own, or change your plan",
                onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s6) {
                if blocked, onStart != nil {
                    Text("You have a paused workout. Resume or end it on Training before starting another.")
                        .slMeta()
                        .foregroundStyle(SL.Signal.attention)
                        .fixedSize(horizontal: false, vertical: true)
                }

                // Your own first: it is what this sheet is opened to build.
                group("Your workouts", note: app.customWorkouts.isEmpty
                      ? "Pick exercises and sets once; start it any time, or put it in your week below."
                      : "Send one to a friend with the share button, or put them on days in your week below.") {
                    Button { creating = true } label: {
                        HStack(spacing: SL.Space.s3) {
                            Image(systemName: "plus")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(SL.Signal.onAction)
                                .frame(width: 40, height: 40)
                                .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Signal.action))
                            Text("Create a workout").slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                            Spacer()
                        }
                        .padding(.horizontal, SL.Space.s4)
                        .frame(minHeight: 60)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(SLRowButtonStyle())
                    ForEach(app.customWorkouts) { workout in
                        row(symbol: { Image(systemName: "square.stack.3d.up.fill").font(.system(size: 16, weight: .semibold)) },
                            title: workout.name,
                            detail: detail(workout.workoutDay),
                            isToday: false,
                            onEdit: { editing = workout },
                            sharing: workout) {
                            if canStart { onStart?(workout.workoutDay) } else { editing = workout }
                        }
                    }
                }

                // A whole week of your own, not one day at a time.
                group("Your week") {
                    Button { planningWeek = true } label: {
                        HStack(spacing: SL.Space.s3) {
                            Image(systemName: "calendar")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(app.ownWeek != nil ? SL.Signal.onAction : SL.Signal.action)
                                .frame(width: 40, height: 40)
                                .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                    .fill(app.ownWeek != nil ? SL.Signal.action : SL.Signal.actionTint))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(app.ownWeek != nil ? "Your own week" : "Make your own week")
                                    .slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                                Text(app.ownWeek.map { ownWeekSummary($0, workouts: app.schedulePlan) }
                                     ?? "A workout for each day, repeating every week")
                                    .slMeta().foregroundStyle(SL.Ink.secondary)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                            }
                            Spacer(minLength: SL.Space.s2)
                            SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
                        }
                        .padding(.horizontal, SL.Space.s4)
                        .frame(minHeight: 64)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(SLRowButtonStyle())
                    .accessibilityLabel(app.ownWeek != nil ? "Edit your own week" : "Make your own week")
                }

                // With your own week, the plan no longer builds the week: it supplies the workouts.
                group(app.ownWeek != nil ? "Workouts from your plan" : "Your plan", trailing: ("Change", onChangePlan)) {
                    Button(action: onChangePlan) {
                        HStack(spacing: SL.Space.s3) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ProgramCatalog.current(in: app.state ?? LegacyState(raw: [:]), plan: app.plan).name)
                                    .slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                                Text(app.ownWeek != nil
                                     ? "The \(spokenList(app.plan.map(\.short))) days you pick from"
                                     : "Plan shape · how your week is built")
                                    .slMeta().foregroundStyle(SL.Ink.secondary)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                            }
                            Spacer()
                            SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
                        }
                        .padding(.horizontal, SL.Space.s4)
                        .frame(minHeight: 60)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(SLRowButtonStyle())
                    if onStart != nil {
                        ForEach(app.plan) { day in
                            row(symbol: { SLWorkoutSymbol(dayName: day.short, size: 18) },
                                title: day.short,
                                detail: detail(day),
                                isToday: day.id == app.todayDay?.id) { onStart?(day) }
                        }
                    }
                }
            }
            .padding(.top, SL.Space.s2)
        }
        .sheet(isPresented: $planningWeek) {
            OwnWeekSheet(onClose: { planningWeek = false })
        }
        .sheet(isPresented: $creating) {
            CustomWorkoutBuilder(workout: nil, onSave: { saved, start in
                creating = false
                Task {
                    await app.saveCustomWorkout(saved)
                    if start, canStart { onStart?(saved.workoutDay) }
                }
            }, onDelete: nil, onClose: { creating = false })
        }
        .sheet(item: $editing) { workout in
            CustomWorkoutBuilder(workout: workout, onSave: { saved, start in
                editing = nil
                Task {
                    await app.saveCustomWorkout(saved)
                    if start, canStart { onStart?(saved.workoutDay) }
                }
            }, onDelete: {
                editing = nil
                Task { await app.removeCustomWorkout(id: workout.id) }
            }, onClose: { editing = nil })
        }
    }

    private func detail(_ day: WorkoutDay) -> String {
        let count = day.exercises.count == 1 ? "1 exercise" : "\(day.exercises.count) exercises"
        return "\(count) · \(WeekPlan.sets(of: day)) sets · ~\(WeekPlan.minutes(of: day)) min"
    }

    private func group<Content: View>(_ title: String, note: String? = nil, trailing: (String, () -> Void)? = nil,
                                      @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack(alignment: .firstTextBaseline) {
                SLOverline(text: title).accessibilityAddTraits(.isHeader)
                Spacer()
                if let trailing {
                    Button(trailing.0, action: trailing.1)
                        .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                        .foregroundStyle(SL.Signal.action)
                        .frame(minHeight: SL.Space.hitMin)
                }
            }
            .padding(.leading, SL.Space.s1)
            VStack(spacing: 0) { content() }
                .slBorderBox()
                .slListCard()
            if let note {
                Text(note).slMeta().foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, SL.Space.s1)
            }
        }
    }

    private func row<Symbol: View>(@ViewBuilder symbol: () -> Symbol, title: String, detail: String, isToday: Bool,
                                   onEdit: (() -> Void)? = nil, sharing: CustomWorkout? = nil,
                                   action: @escaping () -> Void) -> some View {
        HStack(spacing: 0) {
            Button(action: action) {
                HStack(spacing: SL.Space.s3) {
                    symbol()
                        .foregroundStyle(SL.Signal.action)
                        .frame(width: 40, height: 40)
                        .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Signal.actionTint))
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(title).slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary).lineLimit(1)
                            if isToday {
                                Text("TODAY").font(.sl(SL.TypeSize.micro, SL.Weight.bold)).tracking(0.8).foregroundStyle(SL.Signal.action)
                            }
                        }
                        Text(detail).slMeta().slNumerals().foregroundStyle(SL.Ink.secondary)
                            .lineLimit(typeSize.isAccessibilitySize ? 3 : 1).minimumScaleFactor(0.85)
                    }
                    Spacer(minLength: SL.Space.s2)
                    if onStart != nil {
                        Image(systemName: "play.fill").font(.system(size: 13, weight: .bold)).foregroundStyle(SL.Ink.secondary)
                            .opacity(blocked ? 0.3 : 1)
                    }
                }
                .padding(.leading, SL.Space.s4)
                .padding(.trailing, onEdit == nil ? SL.Space.s4 : SL.Space.s2)
                .frame(minHeight: 64)
                .contentShape(Rectangle())
            }
            .buttonStyle(SLRowButtonStyle())
            .disabled(blocked && onEdit == nil)
            .accessibilityLabel(onStart == nil ? "\(title). \(detail)" : "Start \(title). \(detail)")
            // Into any chat, through the share sheet: the link opens on any
            // phone and offers a copy to save.
            if let sharing {
                ShareLink(item: CustomWorkoutLink.url(sharing), message: Text(CustomWorkoutLink.message(sharing))) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Send \(title) to a friend")
            }
            if let onEdit {
                Button(action: onEdit) {
                    Image(systemName: "pencil")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.trailing, SL.Space.s2)
                .accessibilityLabel("Edit \(title)")
            }
        }
        .overlay(alignment: .top) { SLHairline().padding(.leading, 72) }
    }
}

/// Putting a workout together: a name, the exercises in order, and sets for
/// each. Saved to the account; started from the list like any plan day.
struct CustomWorkoutBuilder: View {
    @Environment(AppState.self) private var app
    let workout: CustomWorkout?
    let onSave: (CustomWorkout, _ start: Bool) -> Void
    let onDelete: (() -> Void)?
    let onClose: () -> Void

    @State private var name: String
    @State private var items: [CustomWorkout.Item]
    @State private var picking = false
    @State private var confirmsDelete = false

    init(workout: CustomWorkout?, onSave: @escaping (CustomWorkout, Bool) -> Void, onDelete: (() -> Void)?, onClose: @escaping () -> Void) {
        self.workout = workout
        self.onSave = onSave
        self.onDelete = onDelete
        self.onClose = onClose
        _name = State(initialValue: workout?.name ?? "")
        _items = State(initialValue: workout?.items ?? [])
    }

    private var trimmed: String { name.trimmingCharacters(in: .whitespaces) }
    private var canSave: Bool { !trimmed.isEmpty && !items.isEmpty }

    private var built: CustomWorkout {
        CustomWorkout(id: workout?.id, name: String(trimmed.prefix(40)), items: items, createdAt: workout?.createdAt ?? Date())
    }

    var body: some View {
        SLSheet(title: workout == nil ? "New workout" : "Edit workout", onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s5) {
                TextField("Name, e.g. Arms or Home workout", text: $name)
                    .font(.sl(SL.TypeSize.lead, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
                    .tint(SL.Signal.action)
                    .submitLabel(.done)
                    .padding(.horizontal, SL.Space.s4)
                    .frame(minHeight: 52)
                    .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
                    .accessibilityLabel("Workout name")

                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                        itemRow(index: index, item: item)
                            .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                    }
                    Button { picking = true } label: {
                        Label("Add exercise", systemImage: "plus")
                            .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                            .foregroundStyle(SL.Signal.action)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(SLRowButtonStyle())
                    .overlay(alignment: .top) { if !items.isEmpty { SLHairline() } }
                }
                .slBorderBox()
                .slListCard()

                VStack(spacing: SL.Space.s2) {
                    Button { onSave(built, false) } label: { Text("Save") }
                        .buttonStyle(SLPrimaryButtonStyle())
                        .disabled(!canSave)
                    Button { onClose() } label: { Text("Cancel") }
                        .buttonStyle(SLOutlineButtonStyle())
                    if !canSave {
                        Text(trimmed.isEmpty ? "Give it a name and add an exercise." : "Add at least one exercise.")
                            .slMeta().foregroundStyle(SL.Ink.secondary)
                            .frame(maxWidth: .infinity)
                    }
                    if onDelete != nil {
                        Button { confirmsDelete = true } label: {
                            Text("Delete workout").slBody(SL.Weight.medium).foregroundStyle(SL.Signal.loss)
                                .frame(maxWidth: .infinity, minHeight: SL.Space.hitMin)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.top, SL.Space.s2)
        }
        .sheet(isPresented: $picking) {
            ExercisePickerSheet(
                rows: ExercisePicker.rows(sessions: app.sessions, favorites: app.favoriteExercises),
                selected: nil,
                onPick: { row in
                    items.append(CustomWorkout.Item(exerciseID: row.exerciseID))
                    picking = false
                },
                onStar: { row in
                    Task { await app.setFavorite(exerciseID: row.exerciseID, isFavorite: !row.isFavorite) }
                },
                onClose: { picking = false }
            )
        }
        .alert("Delete \(trimmed.isEmpty ? "this workout" : trimmed)?", isPresented: $confirmsDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { onDelete?() }
        } message: {
            Text("Workouts you logged with it stay in your history.")
        }
    }

    static let repRanges: [ClosedRange<Int>] = [3...5, 4...6, 5...8, 6...10, 8...12, 10...15, 12...20]

    private func itemRow(index: Int, item: CustomWorkout.Item) -> some View {
        HStack(spacing: SL.Space.s2) {
            VStack(alignment: .leading, spacing: 2) {
                Text(ExerciseCatalog.exercise(item.exerciseID)?.name ?? item.exerciseID)
                    .slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary).lineLimit(2)
                // The rep range: what progression aims the sets at.
                Menu {
                    ForEach(Self.repRanges, id: \.self) { range in
                        Button("\(range.lowerBound)–\(range.upperBound) reps") {
                            items[index].repLow = range.lowerBound
                            items[index].repHigh = range.upperBound
                        }
                    }
                } label: {
                    HStack(spacing: 3) {
                        Text("\(item.repLow)–\(item.repHigh) reps").slMeta(SL.Weight.medium).slNumerals()
                        Image(systemName: "chevron.up.chevron.down").font(.system(size: 9, weight: .semibold))
                    }
                    .foregroundStyle(SL.Signal.action)
                    .frame(minHeight: 28)
                }
                .accessibilityLabel("Rep range, \(item.repLow) to \(item.repHigh)")
            }
            Spacer(minLength: SL.Space.s2)
            HStack(spacing: 0) {
                miniStep("minus", label: "Fewer sets") { items[index].sets = max(1, items[index].sets - 1) }
                Text("\(item.sets) sets").font(.sl(SL.TypeSize.meta, SL.Weight.semibold)).monospacedDigit()
                    .foregroundStyle(SL.Ink.primary).frame(minWidth: 52)
                miniStep("plus", label: "More sets") { items[index].sets = min(10, items[index].sets + 1) }
            }
            .background(Capsule().fill(SL.Surface.raised2))
            Menu {
                if index > 0 { Button("Move up", systemImage: "arrow.up") { items.swapAt(index, index - 1) } }
                if index < items.count - 1 { Button("Move down", systemImage: "arrow.down") { items.swapAt(index, index + 1) } }
                Button("Remove", systemImage: "trash", role: .destructive) { items.remove(at: index) }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(width: 36, height: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("More for \(ExerciseCatalog.exercise(item.exerciseID)?.name ?? "this exercise")")
        }
        .padding(.leading, SL.Space.s4)
        .padding(.trailing, SL.Space.s2)
        .frame(minHeight: 64)
    }

    private func miniStep(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button {
            action()
            UISelectionFeedbackGenerator().selectionChanged()
        } label: {
            Image(systemName: symbol).font(.system(size: 11, weight: .bold)).foregroundStyle(SL.Ink.primary)
                .frame(width: 34, height: 36).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Your week

/// "Push, Pull and Legs".
private func spokenList(_ items: [String]) -> String {
    guard items.count > 1 else { return items.joined() }
    return "\(items.dropLast().joined(separator: ", ")) and \(items.last!)"
}

private let weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

/// "Mo Push · We Legs · Fr Upper": the training days of a week, Monday first.
func ownWeekSummary(_ days: [String], workouts: [WorkoutDay]) -> String {
    let trained = days.enumerated().compactMap { index, id -> String? in
        guard let workout = workouts.first(where: { $0.id == id }) else { return nil }
        return "\(weekdayNames[index].prefix(2)) \(workout.short)"
    }
    return trained.isEmpty ? "Every day a rest day" : trained.joined(separator: " · ")
}

/// A week of your own: for each weekday a workout — one of yours or one of
/// the plan's — or rest. It repeats every week until it's handed back to the
/// plan; a day moved by date in the Agenda still wins for that date.
struct OwnWeekSheet: View {
    @Environment(AppState.self) private var app
    let onClose: () -> Void
    @State private var days: [String] = []

    private var workouts: [WorkoutDay] { app.schedulePlan }
    private var count: Int { days.filter { id in workouts.contains { $0.id == id } }.count }

    private func label(_ id: String) -> String { workouts.first { $0.id == id }?.short ?? "Rest" }

    var body: some View {
        SLSheet(title: "Your week", subtitle: "Pick a workout for each day. It repeats every week.", onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s5) {
                VStack(spacing: 0) {
                    ForEach(days.indices, id: \.self) { index in
                        if index > 0 { Divider().overlay(SL.Surface.hairline).padding(.leading, SL.Space.s4) }
                        dayRow(index)
                    }
                }
                .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised2))

                Text("\(count == 1 ? "1 workout" : "\(count) workouts") a week. A day you move in the Agenda still changes just that date.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, SL.Space.s1)

                VStack(spacing: SL.Space.s2) {
                    Button("Save week") {
                        let chosen = days
                        Task { await app.saveOwnWeek(chosen) }
                        onClose()
                    }
                    .buttonStyle(SLPrimaryButtonStyle())
                    if app.ownWeek != nil {
                        Button("Back to my plan's week") {
                            Task { await app.saveOwnWeek(nil) }
                            onClose()
                        }
                        .buttonStyle(SLOutlineButtonStyle())
                    } else {
                        Button("Cancel", action: onClose).buttonStyle(SLOutlineButtonStyle())
                    }
                }
            }
            .padding(.top, SL.Space.s2)
        }
        .onAppear {
            guard days.isEmpty else { return }
            // Opens on the week as it stands, so changing one day is one change.
            days = app.ownWeek ?? AppState.weekdaysMondayFirst.map { index in
                Schedule.day(for: Schedule.defaultWeek[index] ?? "rest", in: app.plan)?.id ?? "rest"
            }
        }
    }

    private func dayRow(_ index: Int) -> some View {
        let id = days[index]
        let isRest = !workouts.contains { $0.id == id }
        return HStack(spacing: SL.Space.s3) {
            Text(weekdayNames[index])
                .slBody(SL.Weight.semibold)
                .foregroundStyle(SL.Ink.primary)
            Spacer()
            Menu {
                if !app.customWorkouts.isEmpty {
                    Section("Your workouts") {
                        ForEach(app.customWorkouts) { custom in option(custom.workoutDay, index: index) }
                    }
                }
                Section("Your plan") {
                    ForEach(app.plan) { day in option(day, index: index) }
                }
                Divider()
                Button { days[index] = "rest" } label: {
                    if isRest { Label("Rest", systemImage: "checkmark") } else { Text("Rest") }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(label(id))
                        .slBody(SL.Weight.semibold)
                        .lineLimit(1)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundStyle(isRest ? SL.Ink.secondary : SL.Signal.action)
                .padding(.horizontal, SL.Space.s3)
                .frame(minHeight: SL.Space.hitMin)
                .background(Capsule().fill(isRest ? Color.clear : SL.Signal.actionTint))
                .overlay(Capsule().strokeBorder(isRest ? SL.Surface.hairlineStrong : .clear, style: StrokeStyle(lineWidth: 1, dash: [3, 3])))
            }
            .accessibilityLabel("\(weekdayNames[index]): \(label(id)). Change")
        }
        .padding(.leading, SL.Space.s4)
        .padding(.trailing, SL.Space.s2)
        .frame(minHeight: 56)
    }

    private func option(_ day: WorkoutDay, index: Int) -> some View {
        Button { days[index] = day.id } label: {
            if days[index] == day.id { Label(day.short, systemImage: "checkmark") } else { Text(day.short) }
        }
    }
}
