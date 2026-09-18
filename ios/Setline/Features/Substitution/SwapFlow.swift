import SwiftUI
import SetlineCore

/// What the swap sheet hands back to the session.
///
/// Every case is something the user chose explicitly. Nothing in this flow
/// applies itself, and the two scopes — today, and the program — are
/// deliberately different cases rather than one with a flag.
enum SwapOutcome {
    /// Do a later exercise now and come back. Changes nothing.
    case reorder(ReorderPlan)
    /// Stand in for this exercise, for today only.
    case substitute(Exercise, SwapReason)
    /// Write the change into the program, and use it today as well.
    case replaceInProgram(Exercise, ReplacementScope)
    /// A typed-in exercise, which goes straight to calibration.
    case custom(CustomExercise)
    /// Keep the exercise, take some load off.
    case reduceLoad
    /// Keep the exercise, shorten the range — the next set opens as partial.
    case limitRange
    /// Leave this one for today. No penalty anywhere.
    case skipExercise
}

/// The steps the sheet moves through.
///
/// One sheet, several screens. Stacking real sheets for the scope picker and
/// the pain questions means three presentations deep over a session that is
/// already presented full-screen, and iOS drops the innermost one's controls
/// often enough that it is not worth the risk.
enum SwapStep: Equatable {
    case alternatives
    case browse
    case custom
    case scope(String)
    /// 31a: where and when, on one page. Both optional.
    case painQuestions
    /// A `nil` region: the user preferred not to say, and nothing is stored.
    case painOptions(PainRegion?, PainTiming?)

    /// 31a and 31b are pages of their own on the ground, not sheet steps.
    var isPainPage: Bool {
        switch self {
        case .painQuestions, .painOptions: return true
        case .alternatives, .browse, .custom, .scope: return false
        }
    }

    /// Each step opens at its own top.
    var key: String {
        switch self {
        case .alternatives: return "alternatives"
        case .browse: return "browse"
        case .custom: return "custom"
        case .scope(let id): return "scope-\(id)"
        case .painQuestions: return "pain-questions"
        case .painOptions: return "pain-options"
        }
    }
}

/// Artboard 15R. Fixed order: reorder first, then up to three alternatives,
/// then the ways out, then — below a hairline, never beside them — the
/// program change and `Ik voel iets`.
struct SwapSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize

    let exercise: Exercise
    let origin: Exercise?
    let reorder: ReorderPlan?
    let hasLoggedSets: Bool
    /// False once every set of this exercise is written. A swap only ever
    /// moves open rows, so there is nothing left for one to change today.
    let hasOpenSets: Bool
    /// Exercises already in today's session, never offered as substitutes.
    let sessionExerciseIDs: Set<String>
    let onOutcome: (SwapOutcome) -> Void
    let onRecordPain: (PainFlag) -> Void
    let onClose: () -> Void

    @State private var step: SwapStep = .alternatives
    /// 31c's self-check. Deliberately not stored: SETLINE keeps nothing you
    /// did not enter yourself.
    @State private var signals: Set<String> = []
    /// 31a's answers, kept while moving between its page and 31b's.
    @State private var painRegion: PainRegion?
    @State private var painTiming: PainTiming?
    /// "The machine is taken." Independent of pain: both can be true at once.
    @State private var occupied = false
    @State private var customName = ""
    @State private var customEquipment: Equipment = .machineSelectorised
    @State private var customIsCompound = false
    @State private var scope: ReplacementScope = .thisDay
    /// A program change waits for an explicit yes. It is the one action here
    /// that outlives the session, and `Alle keren` reaches into plans the
    /// user has not opened yet.
    @State private var pendingReplacement: Exercise?
    @FocusState private var nameFocused: Bool

    private var alternatives: [RankedAlternative] {
        app.alternatives(for: exercise.id, occupied: occupied, excluding: sessionExerciseIDs)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if !step.isPainPage { grabber }
                switch step {
                case .alternatives: alternativesStep
                case .browse: browseStep
                case .custom: customStep
                case .scope(let id): scopeStep(substituteID: id)
                case .painQuestions: painQuestionsStep
                case .painOptions(let region, let timing): painOptionsStep(region, timing)
                }
            }
            .padding(.horizontal, step.isPainPage ? SL.Space.gutterSession : SL.Space.gutterEntry)
            .padding(.bottom, SL.Space.s8)
        }
        .id(step.key)
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if step == .painQuestions {
                Button { step = .painOptions(painRegion, painTiming) } label: { Text("Verder") }
                    .buttonStyle(SLPrimaryButtonStyle())
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.top, SL.Space.s3)
                    .padding(.bottom, SL.Space.s2)
                    .background(SL.Surface.ground)
            }
        }
        // The custom step takes the full height *before* the keyboard arrives:
        // a detent cannot grow while the keyboard is up, and the button has to
        // stay reachable above it. At accessibility sizes no step fits its
        // measured height, so every step opens full, as the set sheet does.
        // 31a and 31b are drawn as full pages on the ground.
        .presentationDetents(
            step == .custom || step.isPainPage || typeSize.isAccessibilitySize ? [.large] : [.height(height)]
        )
        .presentationBackground(step.isPainPage ? SL.Surface.ground : SL.Surface.raised)
        .presentationDragIndicator(.hidden)
        .slRespondsToTextSize()
        .onChange(of: step) { _, newStep in
            guard newStep == .custom else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { nameFocused = true }
        }
        .alert(
            "Vervang \(exercise.name.lowercased()) door \(pendingReplacement?.name.lowercased() ?? "")?",
            isPresented: Binding(
                get: { pendingReplacement != nil },
                set: { if !$0 { pendingReplacement = nil } }
            )
        ) {
            Button("Annuleer", role: .cancel) { pendingReplacement = nil }
            Button("Vervang") {
                guard let exercise = pendingReplacement else { return }
                pendingReplacement = nil
                // Close the sheet ourselves rather than relying on the
                // outcome handler to do it: dismissing an alert and the sheet
                // underneath it in the same frame can leave the sheet standing
                // over a session that has already changed.
                let chosen = scope
                onClose()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { onOutcome(.replaceInProgram(exercise, chosen)) }
            }
        } message: {
            Text(confirmationMessage)
        }
    }

    /// Fixed for the life of each step. It never changes while a keyboard is
    /// up, which is the one thing a detent cannot survive.
    private var height: CGFloat {
        switch step {
        case .alternatives:
            var value: CGFloat = 300                       // head + toggle + footer + rules
            value += CGFloat(app.activePainRegions.count) * 56
            if hasLoggedSets { value += 40 }
            if reorder != nil { value += 116 }
            if hasOpenSets {
                value += CGFloat(alternatives.count) * 104
                if alternatives.isEmpty { value += 104 }
            } else {
                value += 64
            }
            return min(value, 720)
        case .browse: return 680
        case .custom: return 520
        case .scope: return 460
        case .painQuestions, .painOptions: return 720
        }
    }

    private var grabber: some View {
        HStack {
            Spacer()
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(SL.Surface.hairlineStrong)
                .frame(width: 36, height: 5)
            Spacer()
        }
        .padding(.top, SL.Space.s3)
        .padding(.bottom, SL.Space.s5)
    }

    // MARK: - 15R

    private var alternativesStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Wissel \(exercise.name.lowercased())")
                .slTitle()
                .foregroundStyle(SL.Ink.primary)
                .fixedSize(horizontal: false, vertical: true)

            Text(SubstitutionCopy.carryOver)
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, 6)

            // Both contexts, always. "The machine is taken" is the reason this
            // sheet exists, and a pain flag never switches it off.
            occupiedToggle.padding(.top, SL.Space.s4)
            painRows

            if hasLoggedSets {
                Text("Wat je al logde voor \(exercise.name.lowercased()) blijft bewaard onder die oefening.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
            }

            if let origin {
                Text("Nu een wissel van \(origin.name.lowercased()).")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, 6)
            }

            // Reorder comes first, because it is the only option that costs
            // the user nothing.
            if let reorder {
                reorderCard(reorder).padding(.top, SL.Space.s5)
            }

            if !hasOpenSets {
                Text("Alle sets van \(exercise.name.lowercased()) zijn gelogd. Een wissel geldt alleen voor sets die nog open staan.")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, SL.Space.s5)
            } else if alternatives.isEmpty {
                emptyState.padding(.top, SL.Space.s5)
            } else {
                SLEyebrow(text: alternatives.count == 1 ? "Alternatief" : "Alternatieven")
                    .padding(.top, SL.Space.s5)
                    .padding(.bottom, SL.Space.s2)
                VStack(spacing: SL.Space.s2) {
                    ForEach(alternatives) { alternative in
                        alternativeRow(alternative, among: alternatives)
                    }
                }
            }

            footer.padding(.top, SL.Space.s5)
        }
    }

    private var occupiedToggle: some View {
        Button { occupied.toggle() } label: {
            HStack(spacing: SL.Space.s2) {
                Image(systemName: occupied ? "checkmark.circle.fill" : "circle")
                    .font(.sl(SL.TypeSize.body, SL.Weight.regular))
                    .foregroundStyle(occupied ? SL.Signal.action : SL.Ink.tertiary)
                Text("Toestel of rek is bezet")
                    .slBody(occupied ? SL.Weight.medium : SL.Weight.regular)
                    .foregroundStyle(occupied ? SL.Ink.primary : SL.Ink.secondary)
                Spacer(minLength: 0)
            }
            .frame(minHeight: SL.Space.hitMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Toestel of rek is bezet")
        .accessibilityAddTraits(occupied ? [.isSelected, .isButton] : .isButton)
        .accessibilityHint("Laat oefeningen op hetzelfde toestel weg")
    }

    /// Every active region, each with its own `Verwijder`, and each claiming
    /// only what is true for this list.
    @ViewBuilder
    private var painRows: some View {
        let regions = app.activePainRegions
        if !regions.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(regions, id: \.self) { region in
                    painRow(region)
                }
            }
        }
    }

    private func painRow(_ region: PainRegion) -> some View {
        let changesList = app.painChangesList(
            region: region, for: exercise.id, occupied: occupied, excluding: sessionExerciseIDs
        )
        return HStack(alignment: .center, spacing: SL.Space.s2) {
            Text(painLine(region, changesList: changesList))
                .slBody()
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: SL.Space.s2)
            Button { Task { await app.forgetPain(region: region) } } label: {
                Text("Verwijder")
                    .slMeta(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.tertiary)
                    .fixedSize()
                    .slHitTarget()
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Verwijder \(region.label.lowercased())")
        }
        .frame(minHeight: SL.Space.hitMin)
    }

    /// "Rekening gehouden met je schouder." only when the shoulder changed the
    /// list; otherwise the region is noted and nothing is claimed.
    private func painLine(_ region: PainRegion, changesList: Bool) -> String {
        if changesList, let name = region.sentenceName {
            return "Rekening gehouden met je \(name)."
        }
        return "\(region.label) · Genoteerd. Dit verandert deze lijst niet."
    }

    private func reorderCard(_ plan: ReorderPlan) -> some View {
        Button { onOutcome(.reorder(plan)) } label: {
            VStack(alignment: .leading, spacing: 0) {
                SLEyebrow(text: "Verander alleen de volgorde", color: SL.Signal.action)
                Text(plan.headline)
                    .slLead()
                    .foregroundStyle(SL.Ink.primary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
                Text(plan.detail)
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
            }
            .padding(SL.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .slCardStrong(fill: SL.Surface.raised2)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(plan.headline). \(plan.detail)")
    }

    private func alternativeRow(_ alternative: RankedAlternative, among peers: [RankedAlternative]) -> some View {
        Button {
            let reason = SwapContext(
                currentExerciseID: exercise.id, role: .accessory,
                isOccupied: occupied, painfulLoadTags: app.painfulLoadTags
            ).reason
            onOutcome(.substitute(alternative.exercise, reason))
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                // At accessibility sizes the fit label takes its own line, so
                // it never squeezes the name into one word per line.
                fitLayout {
                    Text(alternative.exercise.name)
                        .slLead()
                        .foregroundStyle(SL.Ink.primary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    if !typeSize.isAccessibilitySize { Spacer(minLength: SL.Space.s2) }
                    Text(SubstitutionCopy.fit(alternative))
                        .slMeta(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.tertiary)
                        .lineLimit(1)
                }
                Text(SubstitutionCopy.why(alternative, origin: exercise, alongside: peers))
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
                Text(SubstitutionCopy.carryOver)
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, 6)
            }
            .padding(SL.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .slCard(radius: SL.Radius.lg)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(alternative.exercise.name), \(SubstitutionCopy.fit(alternative))")
        .accessibilityHint(SubstitutionCopy.carryOver)
    }

    private var fitLayout: AnyLayout {
        typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SL.Space.s3))
    }

    /// Zero results is a real answer, not a failure. Say what is true and
    /// leave the honest doors open.
    private var emptyState: some View {
        let isCustom = exercise.attributes == nil
        let painEmptied = !isCustom && app.painEmptiesList(
            for: exercise.id, occupied: occupied, excluding: sessionExerciseIDs
        )
        return VStack(alignment: .leading, spacing: 0) {
            Text(isCustom
                 ? "Geen alternatieven voor een eigen oefening."
                 : "Geen alternatief dat deze oefening echt vervangt.")
                .slLead()
                .foregroundStyle(SL.Ink.primary)
                .fixedSize(horizontal: false, vertical: true)
            Text(isCustom
                 ? "SETLINE heeft over deze oefening geen gegevens om mee te vergelijken."
                 : painEmptied
                    ? "Alles wat dezelfde beweging traint, belast ook wat je aangaf. Bekijk de andere opties of kies je eigen oefening."
                    : "Wat overblijft traint iets anders dan \(exercise.name.lowercased()). We stellen het liever niet voor dan dat we iets zwaks aanraden.")
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slCard(radius: SL.Radius.lg)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Both of these swap today's open sets, so they only appear while
            // there are any.
            if hasOpenSets {
                secondaryLink("Andere opties bekijken") { step = .browse }
                secondaryLink("Eigen oefening") { step = .custom }
                SLHairline().padding(.vertical, SL.Space.s3)
            }

            // Below the hairline on purpose. A permanent program change must
            // never share a surface or a shape with the temporary swap above.
            secondaryLink("Vervang in schema", muted: true) { step = .scope(exercise.id) }
            secondaryLink("Ik voel iets", muted: true) {
                painRegion = nil
                painTiming = nil
                signals = []
                step = .painQuestions
            }
        }
    }

    private func secondaryLink(
        _ title: String, muted: Bool = false, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack {
                Text(title)
                    .slBody(muted ? SL.Weight.regular : SL.Weight.medium)
                    .foregroundStyle(muted ? SL.Ink.tertiary : SL.Ink.secondary)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.tertiary)
            }
            .frame(minHeight: SL.Space.hitMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Andere opties

    private var browseStep: some View {
        let options = app.browsableAlternatives(for: exercise.id, occupied: occupied, excluding: sessionExerciseIDs)
        return VStack(alignment: .leading, spacing: 0) {
            backLink { step = .alternatives }
            Text("Andere opties")
                .slTitle().foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s3)
            Text("Ruimer dan de aanbevelingen. Onderaan staan oefeningen die dezelfde spier trainen maar de opzet van de training veranderen.")
                .slMeta().foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)

            if options.isEmpty {
                Text("Ook hier vinden we niets dat past. Kies je eigen oefening.")
                    .slBody().foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, SL.Space.s5)
            }

            VStack(spacing: SL.Space.s2) {
                ForEach(options) { option in
                    alternativeRow(option, among: options)
                }
            }
            .padding(.top, SL.Space.s4)

            secondaryLink("Eigen oefening") { step = .custom }
                .padding(.top, SL.Space.s3)
        }
    }

    private func backLink(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: SL.Space.s2) {
                Image(systemName: "chevron.left")
                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                Text("Terug").slBody()
            }
            .foregroundStyle(SL.Ink.tertiary)
            .frame(minHeight: SL.Space.hitMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Eigen oefening

    private var trimmedCustomName: String {
        customName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func addCustomExercise() {
        guard !trimmedCustomName.isEmpty else { return }
        nameFocused = false
        onOutcome(.custom(CustomExercise(
            name: trimmedCustomName,
            equipment: customEquipment,
            isCompound: customIsCompound
        )))
    }

    private var customStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            backLink {
                nameFocused = false
                step = .alternatives
            }
            Text("Eigen oefening")
                .slTitle().foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s3)
            Text("Een naam is genoeg. De rest vraagt SETLINE met een kalibratieset.")
                .slMeta().foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)

            TextField("", text: $customName, prompt: Text("Naam van de oefening").foregroundStyle(SL.Ink.tertiary))
                .textInputAutocapitalization(.sentences)
                .autocorrectionDisabled()
                .focused($nameFocused)
                // The keyboard's own button adds the exercise, so the action
                // is reachable even when the keyboard covers everything below.
                .submitLabel(.done)
                .onSubmit(addCustomExercise)
                .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                .foregroundStyle(SL.Ink.primary)
                .padding(SL.Space.s4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .slCard(radius: SL.Radius.md)
                .padding(.top, SL.Space.s4)

            Button(action: addCustomExercise) {
                Text("Toevoegen en kalibreren")
            }
            .buttonStyle(SLPrimaryButtonStyle())
            .disabled(trimmedCustomName.isEmpty)
            .padding(.top, SL.Space.s4)

            SLEyebrow(text: "Materiaal · optioneel").padding(.top, SL.Space.s6).padding(.bottom, SL.Space.s2)
            equipmentChips

            Toggle(isOn: $customIsCompound) {
                Text("Samengestelde oefening").slBody().foregroundStyle(SL.Ink.secondary)
            }
            .tint(SL.Signal.action)
            .padding(.top, SL.Space.s4)
        }
    }

    private var equipmentChips: some View {
        let options: [(Equipment, String)] = [
            (.barbell, "Barbell"), (.dumbbell, "Dumbbell"),
            (.machineSelectorised, "Machine"), (.cable, "Kabel"),
            (.bodyweight, "Lichaamsgewicht"),
        ]
        return FlowRow(spacing: SL.Space.s2) {
            ForEach(options, id: \.0) { option in
                let isSelected = customEquipment == option.0
                Button { customEquipment = option.0 } label: {
                    Text(option.1)
                        .slMeta(isSelected ? SL.Weight.semibold : SL.Weight.regular)
                        .foregroundStyle(isSelected ? SL.Ink.primary : SL.Ink.secondary)
                        .padding(.horizontal, SL.Space.s3)
                        .frame(minHeight: 38)
                        .background(Capsule().fill(isSelected ? SL.Surface.raised2 : .clear))
                        .overlay(Capsule().strokeBorder(
                            isSelected ? SL.Surface.selection : SL.Surface.hairline, lineWidth: 1))
                        // Visually 38 high; the tappable area is 44.
                        .frame(minHeight: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
            }
        }
    }

    // MARK: - 15Rb

    private func scopeStep(substituteID: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            backLink { step = .alternatives }
            Text("Vervang in schema")
                .slTitle().foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s3)
            Text("Dit verandert je schema, niet alleen vandaag. Kies eerst een alternatief; daarna vraagt SETLINE hoe ver de vervanging reikt.")
                .slMeta().foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)

            SLEyebrow(text: "Hoe ver reikt dit?").padding(.top, SL.Space.s5).padding(.bottom, SL.Space.s2)
            VStack(spacing: SL.Space.s2) {
                ForEach(ReplacementScope.allCases, id: \.self) { option in
                    scopeRow(option)
                }
            }

            if scope == .always {
                Text("Alle keren verandert ook schema's waar je later naar wisselt.")
                    .slMeta().foregroundStyle(SL.Signal.attention)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, SL.Space.s3)
            }

            SLEyebrow(text: "Vervang door").padding(.top, SL.Space.s5).padding(.bottom, SL.Space.s2)
            VStack(spacing: SL.Space.s2) {
                ForEach(alternatives) { alternative in
                    Button { pendingReplacement = alternative.exercise } label: {
                        HStack {
                            Text(alternative.exercise.name).slBody(SL.Weight.medium)
                                .foregroundStyle(SL.Ink.primary)
                            Spacer()
                            Text(SubstitutionCopy.fit(alternative)).slMeta()
                                .foregroundStyle(SL.Ink.tertiary)
                        }
                        .padding(SL.Space.s4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .slCard(radius: SL.Radius.md)
                    }
                    .buttonStyle(.plain)
                }
                if alternatives.isEmpty {
                    Text("Geen alternatief om vast in te plannen.")
                        .slBody().foregroundStyle(SL.Ink.secondary)
                }
            }
        }
    }

    /// A program change can be undone from the session until the workout ends
    /// — the toast straight after, then the line under the exercise name — so
    /// the confirmation promises exactly that and no more.
    private var confirmationMessage: String {
        let reach: String
        switch scope {
        case .thisDay: reach = "Dit verandert deze trainingsdag in je schema."
        case .thisPlan: reach = "Dit verandert elke plek in dit schema."
        case .always: reach = "Dit verandert elk schema, ook schema's waar je later naar wisselt."
        }
        return "\(reach) Vandaag gebruik je de nieuwe oefening meteen. Tot je deze training afrondt, kun je het ongedaan maken."
    }

    private func scopeRow(_ option: ReplacementScope) -> some View {
        Button { scope = option } label: {
            HStack(alignment: .top, spacing: SL.Space.s3) {
                Image(systemName: scope == option ? "largecircle.fill.circle" : "circle")
                    .font(.sl(SL.TypeSize.lead, SL.Weight.regular))
                    .foregroundStyle(scope == option ? SL.Signal.action : SL.Ink.tertiary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(option.label).slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                    Text(option.detail).slMeta().foregroundStyle(SL.Ink.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(SL.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .slCard(radius: SL.Radius.md)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(scope == option ? [.isSelected, .isButton] : .isButton)
    }

    // MARK: - 31a / 31b / 31c

    /// 31a and 31b: plain text actions in `text2`, no chevron.
    private func painHeader(back: @escaping () -> Void, skip: (() -> Void)? = nil) -> some View {
        HStack {
            Button(action: back) {
                Text("Terug").slBody(SL.Weight.medium).foregroundStyle(SL.Ink.secondary)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Spacer(minLength: SL.Space.s4)
            if let skip {
                Button(action: skip) {
                    Text("Overslaan").slBody(SL.Weight.medium).foregroundStyle(SL.Ink.secondary)
                        .frame(minHeight: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, SL.Space.s3)
    }

    /// 31a · both questions on one page, both optional. `Verder` goes on with
    /// whatever is picked, `Overslaan` with nothing; neither stores anything
    /// until one of 31b's options is chosen.
    private var painQuestionsStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            painHeader(back: { step = .alternatives }, skip: { step = .painOptions(nil, nil) })

            Text("Waar voel je het?")
                .slDisplay()
                .lineSpacing(SL.TypeSize.display * (SL.LineHeight.display - 1))
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s5)
                .accessibilityAddTraits(.isHeader)
            Text("Beide vragen zijn optioneel. SETLINE stelt geen diagnose en houdt niets bij dat je niet zelf invult.")
                .slBody()
                .lineSpacing(SL.TypeSize.body * (SL.LineHeight.body - 1))
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, SL.Space.s2)

            FlowRow(spacing: SL.Space.s2) {
                ForEach(PainRegion.allCases, id: \.self) { region in
                    SLChip(title: region.label, size: .large, look: painRegion == region ? .selected : .unselected) {
                        painRegion = painRegion == region ? nil : region
                    }
                }
            }
            .padding(.top, SL.Space.s5)

            Text("Wanneer?")
                .slTitle()
                .foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s8)
                .accessibilityAddTraits(.isHeader)

            VStack(spacing: SL.Space.s2) {
                ForEach(PainTiming.allCases, id: \.self) { timing in
                    timingCard(timing)
                }
            }
            .padding(.top, SL.Space.s4)
        }
    }

    /// 31a's answer card: radius 20, 17pt. Picked, it takes the raised2 fill,
    /// the .28 edge and the filled dot; otherwise it stays on `raised`.
    private func timingCard(_ timing: PainTiming) -> some View {
        let picked = painTiming == timing
        return Button {
            painTiming = picked ? nil : timing
        } label: {
            HStack(spacing: SL.Space.s3) {
                Text(timing.label)
                    .slLead(picked ? SL.Weight.semibold : SL.Weight.medium)
                    .foregroundStyle(picked ? SL.Ink.primary : SL.Ink.secondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if picked {
                    Circle().fill(SL.Ink.primary).frame(width: 22, height: 22)
                }
            }
            .padding(.vertical, SL.Space.s4)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .modifier(TimingSurface(picked: picked))
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous))
        }
        .buttonStyle(.plain)
        .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous))
        .accessibilityAddTraits(picked ? [.isSelected, .isButton] : .isButton)
    }

    private struct TimingSurface: ViewModifier {
        let picked: Bool
        func body(content: Content) -> some View {
            if picked {
                content.slCard(radius: SL.Radius.option, selected: true)
            } else {
                content.slCardStrong(radius: SL.Radius.option)
            }
        }
    }

    /// 31b · four ways to keep training. None of them is framed as giving up,
    /// and the guideline is stated once — as a guideline.
    private func painOptionsStep(_ region: PainRegion?, _ timing: PainTiming?) -> some View {
        let narrows = region.map {
            app.painWouldChangeList(region: $0, for: exercise.id, occupied: occupied, excluding: sessionExerciseIDs)
        } ?? false
        return VStack(alignment: .leading, spacing: 0) {
            painHeader(back: { step = .painQuestions })

            // 31b heads the page with what was answered — "Schouder, tijdens
            // de beweging" — so the four options read as a reply to it.
            Text(Self.painHeading(region, timing))
                .slDisplay()
                .lineSpacing(SL.TypeSize.display * (SL.LineHeight.display - 1))
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s4)
                .accessibilityAddTraits(.isHeader)

            Text("Vier manieren om verder te trainen. Kies wat vandaag past.")
                .slBody()
                .lineSpacing(SL.TypeSize.body * (SL.LineHeight.body - 1))
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, SL.Space.s2)

            VStack(spacing: SL.Space.s2) {
                painOption("Beperk de beweging tot waar het pijnvrij is", "Zelfde gewicht, kortere baan. Wordt gelogd als partiële reps.") {
                    record(region, timing)
                    onOutcome(.limitRange)
                }
                painOption("Minder gewicht, zelfde reps", "Je kiest zelf hoeveel minder. Geen verhoging deze sessie.") {
                    record(region, timing)
                    onOutcome(.reduceLoad)
                }
                // The artboard's promise holds exactly when the region removes
                // something from this list: the ranking then also lifts the
                // more stable variants (TRAINING_LOGIC §14.2). Otherwise it says
                // the list stays as it was.
                painOption(
                    "Vervang deze oefening",
                    narrows
                        ? "Terug naar de wisselsheet, met stabielere varianten bovenaan."
                        : "Terug naar de wisselsheet. Deze lijst verandert er niet door."
                ) {
                    record(region, timing)
                    step = .alternatives
                }
                painOption("Sla deze oefening over", "De rest van de sessie blijft staan.") {
                    record(region, timing)
                    onOutcome(.skipExercise)
                }
            }
            .padding(.top, 14)

            guideline.padding(.top, SL.Space.s6)
            escalation.padding(.top, SL.Space.s6)
        }
    }

    /// "Schouder, tijdens de beweging" when both were answered, one of the two
    /// when only one was, and a plain heading when neither was.
    static func painHeading(_ region: PainRegion?, _ timing: PainTiming?) -> String {
        switch (region, timing) {
        case let (region?, timing?): return "\(region.label), \(timing.label.lowercased())"
        case let (region?, nil): return region.label
        case let (nil, timing?): return timing.label
        case (nil, nil): return "Verder trainen"
        }
    }

    /// 31b · stated once, below a hairline, as a guideline — never as personal
    /// advice.
    private var guideline: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLEyebrow(text: "ALGEMENE RICHTLIJN")
            Text("Lichte pijn tijdens de oefening hoeft niet te betekenen dat je stopt, zolang ze de volgende ochtend weggezakt is en van week tot week niet toeneemt. Twijfel je, of wordt het erger? Laat het nakijken.")
                .slBody()
                .lineSpacing(SL.TypeSize.body * (SL.LineHeight.body - 1))
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .frame(maxWidth: typeSize.isAccessibilitySize ? .infinity : 320, alignment: .leading)
        }
        .padding(.top, SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { SLHairline() }
    }

    /// 31c · a self-check, not a question, in the same card shape as every
    /// other proposal. Nothing here is stored, and the guidance card appears
    /// only once a signal is ticked. No red, no warning icon, no severity
    /// scale, and never the name of a condition.
    private var escalation: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            VStack(alignment: .leading, spacing: 0) {
                SLEyebrow(text: "GEEN VRAAG, EEN KEUZE")
                Text("Klopt een van deze?")
                    .slLead()
                    .foregroundStyle(SL.Ink.primary)
                    .padding(.top, 10)
                    .padding(.bottom, SL.Space.s3)

                FlowRow(spacing: 6) {
                    ForEach(Self.escalationSignals, id: \.self) { signal in
                        let picked = signals.contains(signal)
                        SLChip(
                            title: signal,
                            look: picked ? .selected : signal == Self.noneOfThese ? .quiet : .check
                        ) {
                            withAnimation(.easeOut(duration: SL.Motion.base)) {
                                if signal == Self.noneOfThese {
                                    signals = picked ? [] : [signal]
                                } else {
                                    signals.remove(Self.noneOfThese)
                                    if picked { signals.remove(signal) } else { signals.insert(signal) }
                                }
                            }
                        }
                    }
                }
            }
            .padding(SL.Space.s5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .slCardStrong(fill: SL.Surface.raised2)

            if signals.contains(where: { $0 != Self.noneOfThese }) {
                VStack(alignment: .leading, spacing: 0) {
                    SLEyebrow(text: "ALLEEN NA EEN AANGEVINKT SIGNAAL")
                    Text("Laat dit nakijken door een arts of kinesist.")
                        .slLead()
                        .lineSpacing(SL.TypeSize.lead * 0.4)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.primary)
                        .padding(.top, 10)
                    Text("De vier trainingsopties blijven staan. SETLINE beslist niets voor je en noemt geen aandoening.")
                        .slBody()
                        .lineSpacing(SL.TypeSize.body * (SL.LineHeight.body - 1))
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.top, SL.Space.s2)
                }
                .padding(SL.Space.s5)
                .frame(maxWidth: .infinity, alignment: .leading)
                .slCardStrong()
                .accessibilityElement(children: .combine)
                .transition(.opacity)
            }
        }
    }

    private static let noneOfThese = "Geen daarvan"

    private static let escalationSignals = [
        "Scherp of plots", "Tintelingen", "Krachtverlies", "Zwelling",
        "Al meer dan 2 weken", noneOfThese,
    ]

    /// 31b's option card: radius 20, raised2, the .16 edge; 17pt title over a
    /// 13pt line.
    private func painOption(_ title: String, _ detail: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: SL.Space.s1) {
                Text(title).slLead().foregroundStyle(SL.Ink.primary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Text(detail).slMeta().foregroundStyle(SL.Ink.secondary)
                    .lineSpacing(SL.TypeSize.meta * 0.2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, SL.Space.s4)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .slCard(radius: SL.Radius.option, loud: true)
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous))
        }
        .buttonStyle(.plain)
        .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous))
    }

    /// A flag is only ever stored for a region the user actually named.
    private func record(_ region: PainRegion?, _ timing: PainTiming?) {
        guard let region else { return }
        onRecordPain(PainFlag(region: region, timing: timing, exerciseID: exercise.id))
    }
}

/// Chips that wrap. `ScrollView(.horizontal)` sizes to its content inside a
/// sheet and then refuses to scroll, which once left the last chip
/// unreachable — so anything chip-shaped wraps instead of scrolling.
struct FlowRow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
