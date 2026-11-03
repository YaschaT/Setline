import SwiftUI
import SetlineCore

/// "Your plan": the week you train, every week. Your own plans first — each a
/// name and a workout per day — then the ready-made ones, in one list, so a
/// plan of your own is as much a plan as Push / Pull / Legs. Tapping one
/// uses it; Training's week follows it from today.
struct PlansSheet: View {
    @Environment(AppState.self) private var app
    let onClose: () -> Void

    /// The plan being made or changed: a new one, one of yours, or the week
    /// you already made, still without a name.
    private struct Editing: Identifiable {
        let plan: AppState.OwnPlan
        let isNew: Bool
        var id: String { plan.id }
    }

    @State private var editing: Editing?

    private var current: Program {
        ProgramCatalog.current(in: app.state ?? LegacyState(raw: [:]), plan: app.plan)
    }

    var body: some View {
        SLSheet(title: "Your plan", subtitle: "The week you train, every week. Use one of ours or make your own.", onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s6) {
                createCard

                let own = app.ownPlans
                let active = app.activeOwnPlan
                if !own.isEmpty || (app.ownWeek != nil && active == nil) {
                    section("Your plans") {
                        // A week made before plans had names: in use, waiting for one.
                        if let week = app.ownWeek, active == nil {
                            planRow(title: "Your own week", detail: ownWeekSummary(week, workouts: app.schedulePlan),
                                    inUse: true, use: {}) {
                                editing = Editing(plan: .init(id: AppState.OwnPlan.newID(), name: "", days: week), isNew: true)
                            }
                        }
                        ForEach(own) { plan in
                            planRow(title: plan.name, detail: ownWeekSummary(plan.days, workouts: app.schedulePlan),
                                    inUse: plan.id == active?.id,
                                    use: {
                                        Task { await app.saveOwnPlan(plan, use: true) }
                                        onClose()
                                    }) {
                                editing = Editing(plan: plan, isNew: false)
                            }
                        }
                    }
                }

                section("Ready-made plans") {
                    ForEach(ProgramCatalog.all(personalPlan: app.plan)) { program in
                        planRow(title: program.name, detail: program.shape,
                                inUse: app.ownWeek == nil && program.id == current.id,
                                use: {
                                    Task { await app.useReadyMadePlan(program) }
                                    onClose()
                                }, edit: nil)
                    }
                }
            }
            .padding(.top, SL.Space.s2)
            .padding(.bottom, SL.Space.s4)
        }
        .sheet(item: $editing) { item in
            PlanEditorSheet(plan: item.plan, isNew: item.isNew, onDone: { editing = nil })
        }
    }

    /// Making one is what most people open this for: its own card, first.
    private var createCard: some View {
        Button {
            let start = app.ownWeek ?? AppState.weekdaysMondayFirst.map { index in
                Schedule.day(for: Schedule.defaultWeek[index] ?? "rest", in: app.plan)?.id ?? "rest"
            }
            editing = Editing(plan: .init(id: AppState.OwnPlan.newID(), name: "", days: start), isNew: true)
        } label: {
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                HStack(alignment: .top, spacing: SL.Space.s3) {
                    Image(systemName: "calendar.badge.plus")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(SL.Signal.onAction)
                        .frame(width: 44, height: 44)
                        .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Signal.action))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Make your own plan")
                            .font(.sl(SL.TypeSize.lead, SL.Weight.bold))
                            .foregroundStyle(SL.Ink.primary)
                        Text("Name it, like Week 1, and pick a workout for each day: one of yours or one of ours.")
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .multilineTextAlignment(.leading)
                    }
                }
                HStack(spacing: 6) {
                    Image(systemName: "plus").font(.system(size: 14, weight: .bold))
                    Text("Create plan").slBody(SL.Weight.semibold)
                }
                .foregroundStyle(SL.Signal.onAction)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(Capsule().fill(SL.Signal.action))
            }
            .padding(SL.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).fill(SL.Signal.actionTint))
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                    .strokeBorder(SL.Signal.action.opacity(0.35), lineWidth: SL.Metric.border)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.98))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Make your own plan")
        .accessibilityAddTraits(.isButton)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder rows: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLOverline(text: title).padding(.leading, SL.Space.s1).accessibilityAddTraits(.isHeader)
            VStack(spacing: 0) {
                Group(subviews: rows()) { subviews in
                    ForEach(subviews) { subview in
                        subview
                        if subview.id != subviews.last?.id {
                            SLHairline().padding(.leading, SL.Space.s4)
                        }
                    }
                }
            }
            .slBorderBox()
            .slListCard()
        }
    }

    /// A plan: its name and its week, "In use" on the one the week follows,
    /// and for your own an Edit beside it.
    private func planRow(title: String, detail: String, inUse: Bool, use: @escaping () -> Void,
                         edit: (() -> Void)?) -> some View {
        HStack(spacing: 0) {
            Button(action: inUse ? (edit ?? {}) : use) {
                HStack(spacing: SL.Space.s3) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .slBody(SL.Weight.semibold)
                            .foregroundStyle(SL.Ink.primary)
                            .multilineTextAlignment(.leading)
                        Text(detail)
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: SL.Space.s2)
                    if inUse {
                        Label("In use", systemImage: "checkmark")
                            .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                            .foregroundStyle(SL.Signal.action)
                            .fixedSize()
                    } else {
                        Text("Use")
                            .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                            .foregroundStyle(SL.Signal.action)
                            .padding(.horizontal, SL.Space.s3)
                            .frame(minHeight: 30)
                            .background(Capsule().fill(SL.Signal.actionTint))
                            .fixedSize()
                    }
                }
                .padding(.leading, SL.Space.s4)
                .padding(.trailing, edit == nil ? SL.Space.s4 : SL.Space.s2)
                .padding(.vertical, SL.Space.s3)
                .frame(minHeight: 64)
                .contentShape(Rectangle())
            }
            .buttonStyle(SLRowButtonStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(title). \(detail)\(inUse ? ". In use" : "")")
            .accessibilityHint(inUse ? "" : "Uses this plan from today")

            if let edit {
                Button(action: edit) {
                    Text("Edit")
                        .slMeta(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin)
                        .padding(.trailing, SL.Space.s2)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Edit \(title)")
            }
        }
    }
}

/// A plan of your own: its name, then a workout for each day — one of yours
/// or one of the ready-made ones — or rest. It repeats every week.
struct PlanEditorSheet: View {
    @Environment(AppState.self) private var app
    let plan: AppState.OwnPlan
    let isNew: Bool
    let onDone: () -> Void

    @State private var name: String
    @State private var days: [String]
    @State private var confirmsDelete = false
    @FocusState private var naming: Bool

    init(plan: AppState.OwnPlan, isNew: Bool, onDone: @escaping () -> Void) {
        self.plan = plan
        self.isNew = isNew
        self.onDone = onDone
        _name = State(initialValue: plan.name)
        _days = State(initialValue: plan.days)
    }

    private var workouts: [WorkoutDay] { app.schedulePlan }
    private var count: Int { days.filter { id in workouts.contains { $0.id == id } }.count }
    private var trimmed: String { name.trimmingCharacters(in: .whitespaces) }
    /// The plan the week already follows, or the unnamed week being named.
    private var inUse: Bool { app.activeOwnPlan?.id == plan.id || (isNew && app.ownWeek == plan.days && app.activeOwnPlan == nil) }

    private func label(_ id: String) -> String { workouts.first { $0.id == id }?.short ?? "Rest" }

    var body: some View {
        SLSheet(title: isNew ? "New plan" : "Edit plan",
                subtitle: "A workout for each day. It repeats every week.",
                onClose: onDone) {
            VStack(alignment: .leading, spacing: SL.Space.s5) {
                VStack(alignment: .leading, spacing: 2) {
                    SLEyebrow(text: "PLAN NAME", size: SL.TypeSize.micro)
                    TextField("Week 1", text: $name)
                        .font(.sl(SL.TypeSize.lead, SL.Weight.semibold))
                        .foregroundStyle(SL.Ink.primary)
                        .tint(SL.Signal.action)
                        .textInputAutocapitalization(.sentences)
                        .focused($naming)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised2))
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                        .strokeBorder(naming ? SL.Signal.action : .clear, lineWidth: SL.Metric.border)
                )

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
                    Button(inUse ? "Save" : "Save and use") { save(use: true) }
                        .buttonStyle(SLPrimaryButtonStyle())
                    if !inUse {
                        Button("Save for later") { save(use: false) }
                            .buttonStyle(SLOutlineButtonStyle())
                    }
                    if !isNew {
                        Button("Delete plan", role: .destructive) { confirmsDelete = true }
                            .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                            .foregroundStyle(SL.Signal.loss)
                            .frame(maxWidth: .infinity, minHeight: SL.Space.hitMin)
                    }
                }
                .disabled(trimmed.isEmpty)
            }
            .padding(.top, SL.Space.s2)
            .padding(.bottom, SL.Space.s4)
        }
        .onAppear { if isNew { naming = true } }
        .alert("Delete \(plan.name)?", isPresented: $confirmsDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                let removed = plan
                Task { await app.removeOwnPlan(removed) }
                onDone()
            }
        } message: {
            Text(app.activeOwnPlan?.id == plan.id
                 ? "Your week goes back to your ready-made plan. Workouts you logged stay."
                 : "Workouts you logged with it stay.")
        }
    }

    private func save(use: Bool) {
        let saved = AppState.OwnPlan(id: plan.id, name: trimmed, days: days)
        Task { await app.saveOwnPlan(saved, use: use) }
        onDone()
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
                Section("Ready-made workouts") {
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
                .frame(maxWidth: 200)
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
