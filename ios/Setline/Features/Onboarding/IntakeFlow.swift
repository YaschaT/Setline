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
            title: "Hoeveel dagen per week?",
            subtitle: "Dit bepaalt de vorm van je week. Later te wijzigen.",
            consequence: daysConsequence,
            commit: "Verder",
            onSkip: { finish() },
            onCommit: { step = 2 }
        ) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: SL.Space.s2) {
                    ForEach(2...6, id: \.self) { count in
                        countTile(count)
                    }
                }

                SLEyebrow(text: "WELKE DAGEN")
                    .padding(.top, SL.Space.s6)
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
        .accessibilityLabel("\(count) dagen per week")
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
        guard !chosen.isEmpty else { return "Kies minstens één dag, of sla over en houd je huidige week." }
        return "\(Self.spelled(chosen.count)) \(chosen.count == 1 ? "dag" : "dagen"): \(chosen.joined(separator: " · "))."
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
            title: "Hoe lang til je al?",
            subtitle: "Bepaalt de startprogressie, niet je programma.",
            consequence: experience.consequence,
            commit: "Verder",
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
            title: "Welke planvorm?",
            subtitle: "Alles blijft aanpasbaar in Account.",
            consequence: "\(chosenProgram.shape). Elke week dezelfde vorm.",
            commit: "Verder",
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
            title: "Welke schijven heb je?",
            subtitle: "Hiermee rekent de schijvencalculator. Kilogram, uit je regio — wijzig het in Account als dat niet klopt.",
            consequence: platesConsequence,
            commit: "Klaar",
            onSkip: { finish() },
            onCommit: { finish() }
        ) {
            VStack(alignment: .leading, spacing: 0) {
                SLEyebrow(text: "SCHIJVEN IN JE GYM · KG")
                    .padding(.bottom, SL.Space.s3)

                SLFlow {
                    ForEach(PlateInventory.offered, id: \.self) { plate in
                        plateChip(plate)
                    }
                }
                .padding(8)
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                        .fill(SL.Surface.raised)
                )
            }
        }
    }

    /// Artboard 06: a plate you have is a selected chip, one you do not is
    /// the dashed "off" chip — the shared component, not a local copy.
    private func plateChip(_ plate: Decimal) -> some View {
        let selected = plates.contains(plate)
        return SLChip(title: NumberDisplay.dutch.number(plate), look: selected ? .selected : .off) {
            if selected { plates.remove(plate) } else { plates.insert(plate) }
        }
        .accessibilityLabel("\(NumberDisplay.dutch.kg(plate)) schijf")
    }

    private var platesConsequence: String {
        let inventory = PlateInventory(plates: Array(plates), barKg: PlateMath.defaultBar)
        guard let jump = inventory.smallestJump else {
            return "Zonder schijven rekent de calculator niets uit. Kies er minstens één."
        }
        return "Kleinste sprong · \(NumberDisplay.dutch.kg(jump)). Stang \(NumberDisplay.dutch.kg(PlateMath.defaultBar)) · gebruikt door de schijvencalculator."
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

    private static let weekdayNames = ["ma", "di", "wo", "do", "vr", "za", "zo"]
    private static let fullWeekdayNames = [
        "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag",
    ]

    private static func spelled(_ count: Int) -> String {
        ["Nul", "Eén", "Twee", "Drie", "Vier", "Vijf", "Zes", "Zeven"][min(count, 7)]
    }
}
