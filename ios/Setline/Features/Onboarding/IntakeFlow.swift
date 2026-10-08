import SwiftUI
import SetlineCore

/// Artboards 03–06, in order, and what they leave behind.
///
/// Four questions, each skippable, each stating what it produces. Nothing here
/// is asked twice and nothing is asked that the app cannot act on: the review
/// kept the plate question precisely because the calculator needs it from the
/// first session.
struct IntakeFlow: View {
    @Environment(AppState.self) private var app
    let onFinish: () -> Void

    @State private var step = 1
    @State private var days = 4
    /// ma · wo · vr · za, the spread the handoff opens on.
    @State private var weekdays: Set<Int> = [0, 2, 4, 5]
    @State private var experience: Experience = .week
    @State private var program: Program?
    @State private var plates: Set<Decimal> = Set(PlateMath.defaultPlates)

    private var programs: [Program] { ProgramCatalog.all(personalPlan: app.plan) }

    private var chosenProgram: Program { program ?? programs[0] }

    var body: some View {
        Group {
            switch step {
            case 1: daysStep
            case 2: experienceStep
            case 3: programStep
            default: platesStep
            }
        }
        .animation(.easeOut(duration: SL.Motion.base), value: step)
    }

    // MARK: 03 · Days

    private var daysStep: some View {
        IntakeStep(
            step: 1, total: 4,
            title: "How many days a week?",
            subtitle: "This sets the shape of your week. You can change it later.",
            consequence: daysConsequence,
            commit: "Continue",
            onSkip: { finish() },
            onCommit: { step = 2 }
        ) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: SL.Space.s2) {
                    ForEach(2...6, id: \.self) { count in
                        countTile(count)
                    }
                }

                SLEyebrow(text: "WHICH DAYS")
                    .padding(.top, SL.Space.s8)
                    .padding(.bottom, SL.Space.s3)

                HStack(spacing: 6) {
                    ForEach(0..<7, id: \.self) { index in
                        weekdayTile(index)
                    }
                }
            }
        }
    }

    private func countTile(_ count: Int) -> some View {
        let selected = days == count
        return Button {
            days = count
            fitWeekdays(to: count)
        } label: {
            Text("\(count)")
                .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                .slNumerals()
                .foregroundStyle(selected ? SL.Ink.primary : SL.Ink.secondary)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 56)
                .slBorderBox()
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                        .fill(selected ? SL.Surface.raised2 : SL.Surface.raised)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                        .strokeBorder(selected ? SL.Surface.selection : SL.Surface.hairline, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(count) days a week")
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
    }

    private func weekdayTile(_ index: Int) -> some View {
        let selected = weekdays.contains(index)
        return Button {
            if selected { weekdays.remove(index) } else { weekdays.insert(index) }
            days = max(2, weekdays.count)
        } label: {
            VStack(spacing: 4) {
                Text(Self.weekdayNames[index])
                    .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                    .foregroundStyle(selected ? SL.Ink.secondary : SL.Ink.tertiary)
                Circle()
                    .fill(selected ? SL.Ink.primary : SL.Surface.hairlineStrong)
                    .frame(width: 8, height: 8)
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 64)
            .slBorderBox()
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                    .fill(selected ? SL.Surface.raised2 : SL.Surface.raised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                    .strokeBorder(selected ? SL.Surface.hairlineStrong : SL.Surface.hairline, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Self.fullWeekdayNames[index])
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
    }

    private var daysConsequence: String {
        let chosen = weekdays.sorted().map { Self.weekdayNames[$0] }
        guard !chosen.isEmpty else { return "Pick at least one day, or skip and keep your current week." }
        let days = "\(Self.spelled(chosen.count)) \(chosen.count == 1 ? "day" : "days"): \(chosen.joined(separator: " · "))."
        // 03 closes on what a session costs: the plan's own estimate,
        // averaged over its training days.
        let minutes = app.plan.map { WeekPlan.minutes(of: $0) }
        guard !minutes.isEmpty else { return days }
        let average = Int((Double(minutes.reduce(0, +)) / Double(minutes.count)).rounded())
        return "\(days) About \(average) min per session."
    }

    /// Keeps the two answers honest about each other: picking a number fills
    /// the week from the plan's own shape.
    private func fitWeekdays(to count: Int) {
        // Spread first, so four days never land on four in a row.
        let preferred = [0, 2, 4, 5, 1, 3, 6]
        weekdays = Set(preferred.prefix(count))
    }

    // MARK: 04 · Experience

    private var experienceStep: some View {
        IntakeStep(
            step: 2, total: 4,
            title: "How long have you been lifting?",
            subtitle: "Sets how fast you progress at the start, not your program.",
            consequence: experience.consequence,
            commit: "Continue",
            onSkip: { finish() },
            onCommit: { step = 3 }
        ) {
            VStack(spacing: SL.Space.s2) {
                ForEach(Experience.allCases, id: \.self) { option in
                    IntakeOption(
                        title: option.title,
                        detail: option.detail,
                        selected: experience == option,
                        onTap: { experience = option }
                    )
                }
            }
        }
    }

    // MARK: 05 · Plan shape

    private var programStep: some View {
        IntakeStep(
            step: 3, total: 4,
            title: "Which plan shape?",
            subtitle: "You can change everything in Account.",
            consequence: "\(chosenProgram.shape). The same shape every week.",
            commit: "Continue",
            onSkip: { finish() },
            onCommit: { step = 4 }
        ) {
            VStack(spacing: SL.Space.s2) {
                ForEach(programs) { option in
                    IntakeOption(
                        title: option.name,
                        detail: option.shape,
                        selected: chosenProgram.id == option.id,
                        onTap: { program = option }
                    )
                }
            }
        }
    }

    // MARK: 06 · Plates

    private var platesStep: some View {
        IntakeStep(
            step: 4, total: 4,
            title: "Which plates do you have?",
            subtitle: "The plate calculator uses these. Kilograms, based on your region — change it in Account if that's wrong.",
            subtitleMeasure: 32,
            consequence: "",
            commit: "Done",
            onSkip: { finish() },
            onCommit: { finish() }
        ) {
            VStack(alignment: .leading, spacing: 0) {
                SLEyebrow(text: "PLATES IN YOUR GYM · KG")
                    .padding(.bottom, SL.Space.s3)

                SLFlow(spacing: 6) {
                    ForEach(PlateInventory.offered, id: \.self) { plate in
                        plateChip(plate)
                    }
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .slCard(radius: SL.Radius.option)

                // 06's close: the smallest jump at 17/600, the bar under it.
                VStack(alignment: .leading, spacing: SL.Space.s1) {
                    Text(platesHeadline)
                        .slLead()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Bar \(NumberDisplay.english.kg(PlateMath.defaultBar)) · used by the plate calculator")
                        .slMeta()
                        .foregroundStyle(SL.Ink.tertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, SL.Space.s5)
                .accessibilityElement(children: .combine)
            }
        }
    }

    /// Artboard 06: a plate you have is a selected chip, one you do not is
    /// the dashed "off" chip — the shared component, not a local copy.
    private func plateChip(_ plate: Decimal) -> some View {
        let selected = plates.contains(plate)
        return SLChip(title: NumberDisplay.english.number(plate), look: selected ? .selected : .off, horizontalPadding: 18) {
            if selected { plates.remove(plate) } else { plates.insert(plate) }
        }
        .accessibilityLabel("\(NumberDisplay.english.kg(plate)) plate")
    }

    private var platesHeadline: String {
        let inventory = PlateInventory(plates: Array(plates), barKg: PlateMath.defaultBar)
        guard let jump = inventory.smallestJump else {
            return "Without plates the calculator can't work anything out. Pick at least one."
        }
        return "Smallest jump · \(NumberDisplay.english.kg(jump))"
    }

    // MARK: Leaving

    /// Everything the four answers changed, written as the changes they are.
    private func finish() {
        var changes: [StateChange] = []
        let now = Date()

        if !weekdays.isEmpty {
            changes += scheduleChanges(now: now)
        }
        changes.append(StateChange(.setExperience(experience.rawValue), createdAt: now))
        if program != nil {
            changes.append(StateChange(
                .setProgram(mode: chosenProgram.mode, sciencePlanID: chosenProgram.sciencePlanID),
                createdAt: now
            ))
        }
        if !plates.isEmpty {
            changes.append(StateChange(
                .setEquipment(plates: Array(plates).sorted(by: >), barKg: PlateMath.defaultBar),
                createdAt: now
            ))
        }

        onFinish()
        Task { await app.record(changes) }
    }

    /// The chosen weekdays, written onto this week through the same per-date
    /// operations the week agenda uses. Later weeks follow the plan's shape
    /// until they are changed there.
    private func scheduleChanges(now: Date) -> [StateChange] {
        let dates = Schedule.mondayFirstWeek(containing: now)
        var draft = WeekDraft(dates: dates, overrides: app.scheduleOverrides)
        let calendar = Calendar.current

        // Sessions go on the days that were picked, in the plan's own order;
        // every other day is a rest day the account asked for.
        let planDays = app.plan.map(\.id)
        var next = planDays.makeIterator()
        for (index, date) in dates.enumerated() {
            let key = Schedule.dateKey(date, calendar: calendar)
            if weekdays.contains(index) {
                if let day = next.next() ?? planDays.first {
                    draft.assign(day, to: key)
                }
            } else {
                draft.assign("rest", to: key)
            }
        }
        return draft.changes(programKey: app.programKey, now: now)
    }

    private static let weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    private static let fullWeekdayNames = [
        "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    ]

    private static func spelled(_ count: Int) -> String {
        ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven"][min(count, 7)]
    }
}
