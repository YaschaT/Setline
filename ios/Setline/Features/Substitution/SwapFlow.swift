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
    /// Choosing what goes into the program, before 15Rb asks how far.
    case replacePick
    /// 15Rb, with the substitute chosen.
    case scope(String)
    /// 31a: where and when, on one page. Both optional.
    case painQuestions
    /// A `nil` region: the user preferred not to say, and nothing is stored.
    case painOptions(PainRegion?, PainTiming?)

    /// 31a and 31b are pages of their own on the ground, not sheet steps.
    var isPainPage: Bool {
        switch self {
        case .painQuestions, .painOptions: return true
        case .alternatives, .browse, .custom, .replacePick, .scope: return false
        }
    }

    /// Each step opens at its own top.
    var key: String {
        switch self {
        case .alternatives: return "alternatives"
        case .browse: return "browse"
        case .custom: return "custom"
        case .replacePick: return "replace-pick"
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
    /// Today's training day, as 15Rb names it ("Push").
    let dayLabel: String
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
    /// 15Rb opens on the narrowest reach. A program change still waits for an
    /// explicit yes — `Vervangen` — because it is the one action here that
    /// outlives the session (TRAINING_LOGIC §12.4).
    @State private var scope: ReplacementScope = .thisDay
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
                case .replacePick: replacePickStep
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
    }

    /// Fixed for the life of each step. It never changes while a keyboard is
    /// up, which is the one thing a detent cannot survive.
    private var height: CGFloat {
        switch step {
        case .alternatives:
            var value: CGFloat = 360                       // head + toggle + tools + footer
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
        case .replacePick: return min(260 + CGFloat(max(alternatives.count, 1)) * 64, 640)
        case .scope: return 640
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
            // 15R: the name at 34 with the way out on its first line.
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                Text("\(exercise.name) wisselen")
                    .slDisplay()
                    .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
                    .foregroundStyle(SL.Ink.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: SL.Space.s2)
                Button(action: onClose) {
                    Text("Sluiten")
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                        .fixedSize()
                        .slHitTarget()
                }
                .buttonStyle(.plain)
            }

            Text("Behoud sets, reps en RIR — reset het gewicht.")
                .slMeta()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, SL.Space.s1)

            // Both contexts, always. "The machine is taken" is the reason this
            // sheet exists, and a pain flag never switches it off.
            occupiedToggle.padding(.top, SL.Space.s2)
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
                reorderCard(reorder).padding(.top, SL.Space.s3)
            }

            if !hasOpenSets {
                Text("Alle sets van \(exercise.name.lowercased()) zijn gelogd. Een wissel geldt alleen voor sets die nog open staan.")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, SL.Space.s5)
            } else if alternatives.isEmpty {
                emptyState.padding(.top, 10)
            } else {
                alternativesList(alternatives).padding(.top, 10)
            }

            footer.padding(.top, 10)
        }
    }

    /// 15R: one raised2 container, radius 20 with 8 of padding, the rows
    /// inside it split by hairlines. The first answer's fit label is the only
    /// one in full ink.
    private func alternativesList(_ items: [RankedAlternative]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, alternative in
                alternativeRow(alternative, among: items, leads: index == 0)
                if index < items.count - 1 { SLHairline() }
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                .fill(SL.Surface.raised2)
        )
    }

    /// Whether the station is taken, in the component sheet's chip: selected
    /// when on, the dashed "not on" chip when off. 15R draws the busy bench as
    /// the reason for the sheet; this is how the list learns it.
    private var occupiedToggle: some View {
        SLChip(title: "Toestel of rek is bezet", look: occupied ? .selected : .off) {
            occupied.toggle()
        }
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

    /// 15R: "Doe hack squat nu" over "Kom terug voor bankdrukken." Radius 16,
    /// raised2 and the .16 edge, the swap glyph in front — no eyebrow, and no
    /// lime: the card is an option, not a signal.
    private func reorderCard(_ plan: ReorderPlan) -> some View {
        Button { onOutcome(.reorder(plan)) } label: {
            HStack(spacing: SL.Space.s3) {
                SLGlyph(name: .swapVert, size: 20)
                    .foregroundStyle(SL.Ink.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Doe \(plan.candidate.name.lowercased()) nu")
                        .slLead()
                        .foregroundStyle(SL.Ink.primary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Kom terug voor \(plan.current.name.lowercased()).")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 14)
            .padding(.horizontal, SL.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .slCardStrong(radius: SL.Radius.lg, fill: SL.Surface.raised2)
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Doe \(plan.candidate.name) nu, kom terug voor \(plan.current.name)")
        .accessibilityHint(plan.detail)
    }

    private func alternativeRow(
        _ alternative: RankedAlternative, among peers: [RankedAlternative], leads: Bool = false
    ) -> some View {
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
                        .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                        .foregroundStyle(leads ? SL.Ink.primary : SL.Ink.secondary)
                        .lineLimit(1)
                }
                Text(SubstitutionCopy.why(alternative, origin: exercise, alongside: peers))
                    .slMeta()
                    .slLineHeight(1.4, size: SL.TypeSize.meta)
                    .foregroundStyle(SL.Ink.secondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 3)
                Text(SubstitutionCopy.carryOver)
                    .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, SL.Space.s1)
            }
            .padding(.vertical, SL.Space.s3)
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
        }
        .buttonStyle(.plain)
        .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
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
                toolLayout {
                    toolButton("Bladeren", glyph: .search) { step = .browse }
                    toolButton("Eigen oefening") { step = .custom }
                }
            }

            // Below the hairline on purpose. A permanent program change must
            // never share a surface or a shape with the temporary swap above.
            SLHairline().padding(.top, SL.Space.s4).padding(.bottom, SL.Space.s1)
            footerLink("Vervang in schema", detail: "Wijzigt je plan, niet alleen vandaag") {
                step = .replacePick
            }
            SLHairline().padding(.vertical, SL.Space.s1)
            footerLink("Ik voel iets", detail: "Pijn of ongemak bij deze beweging") {
                painRegion = nil
                painTiming = nil
                signals = []
                step = .painQuestions
            }
        }
    }

    /// Side by side, as 15R draws them; stacked once the words would not fit.
    private var toolLayout: AnyLayout {
        typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: SL.Space.s2))
            : AnyLayout(HStackLayout(spacing: SL.Space.s2))
    }

    /// 15R: 44 high, radius 12, raised2, 15/500 in `text2`.
    private func toolButton(_ title: String, glyph: SLGlyph.Name? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let glyph {
                    SLGlyph(name: glyph, size: 18)
                }
                Text(title).slBody(SL.Weight.medium)
            }
            .foregroundStyle(SL.Ink.secondary)
            .frame(maxWidth: .infinity)
            .frame(minHeight: SL.Space.hitMin)
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                    .fill(SL.Surface.raised2)
            )
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
        }
        .buttonStyle(.plain)
        .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
    }

    /// 15R's lower links: 15/500 in `text2` over a 12pt line saying what the
    /// link reaches, with the chevron in `text3`.
    private func footerLink(_ title: String, detail: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: SL.Space.s3) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).slBody(SL.Weight.medium).foregroundStyle(SL.Ink.secondary)
                    Text(detail)
                        .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                        .foregroundStyle(SL.Ink.tertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                SLGlyph(name: .chevronRight, size: 20)
                    .foregroundStyle(SL.Ink.tertiary)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, SL.Space.s2)
            .frame(minHeight: SL.Space.hitMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(detail)
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
                SLGlyph(name: .chevronRight, size: 20)
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

            if !options.isEmpty {
                alternativesList(options).padding(.top, SL.Space.s4)
            }

            secondaryLink("Eigen oefening") { step = .custom }
                .padding(.top, SL.Space.s3)
        }
    }

    /// `Terug` as every artboard sets it: 15/500 `text2`, no chevron.
    private func backLink(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text("Terug")
                .slBody(SL.Weight.medium)
                .foregroundStyle(SL.Ink.secondary)
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

            // The component sheet's chip rather than a system switch: on is
            // selected, off is the dashed "not on" chip.
            SLChip(title: "Samengestelde oefening", look: customIsCompound ? .selected : .off) {
                customIsCompound.toggle()
            }
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

    /// Choosing what goes into the program. 15Rb opens with the choice
    /// already made, so this step borrows the list's shape and says plainly
    /// that it reaches past today.
    private var replacePickStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            backLink { step = .alternatives }
            Text("Vervang in schema")
                .slTitle().foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s3)
            Text("Dit verandert je schema, niet alleen vandaag. Kies wat \(exercise.name.lowercased()) vervangt.")
                .slMeta().foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)

            VStack(spacing: SL.Space.s2) {
                ForEach(alternatives) { alternative in
                    Button {
                        scope = .thisDay
                        step = .scope(alternative.exercise.id)
                    } label: {
                        fitLayout {
                            Text(alternative.exercise.name).slBody(SL.Weight.medium)
                                .foregroundStyle(SL.Ink.primary)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            if !typeSize.isAccessibilitySize { Spacer(minLength: SL.Space.s2) }
                            Text(SubstitutionCopy.fit(alternative)).slMeta()
                                .foregroundStyle(SL.Ink.tertiary)
                        }
                        .padding(SL.Space.s4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .slCard(radius: SL.Radius.md)
                        .contentShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
                if alternatives.isEmpty {
                    Text("Geen alternatief om vast in te plannen.")
                        .slBody().foregroundStyle(SL.Ink.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.top, SL.Space.s5)
        }
    }

    /// Artboard 15Rb. The substitute is chosen; what is left is how far the
    /// change reaches and the one explicit yes. The reach is TRAINING_LOGIC
    /// §12.4's — future occurrences of this day, this plan, or everywhere —
    /// described in this plan's own names.
    private func scopeStep(substituteID: String) -> some View {
        let substitute = app.exercise(substituteID)
        return VStack(alignment: .leading, spacing: 0) {
            Text("Vervang door \(substitute.name.lowercased())")
                .slDisplay()
                .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.primary)
                .accessibilityAddTraits(.isHeader)
            Text("Kies waarvoor dit geldt. Je historiek van \(exercise.name.lowercased()) blijft bewaard.")
                .slBody()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, 10)

            VStack(spacing: SL.Space.s2) {
                ForEach(ReplacementScope.allCases, id: \.self) { option in
                    scopeRow(option)
                }
            }
            .padding(.top, SL.Space.s5)

            Button {
                // Close the sheet first, then change the session under it.
                let chosen = scope
                onClose()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    onOutcome(.replaceInProgram(substitute, chosen))
                }
            } label: {
                Text("Vervangen")
            }
            .buttonStyle(SLPrimaryButtonStyle())
            .padding(.top, SL.Space.s5)

            Button { step = .alternatives } label: {
                Text("Annuleer")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: SL.Metric.tertiaryHeight)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, SL.Space.s2)
        }
    }

    /// 15Rb's scope card: radius 20, a 17pt name over a 13pt line. The picked
    /// one takes raised2, the .28 edge and the filled dot.
    private func scopeRow(_ option: ReplacementScope) -> some View {
        let picked = scope == option
        return Button { scope = option } label: {
            HStack(spacing: SL.Space.s3) {
                VStack(alignment: .leading, spacing: SL.Space.s1) {
                    Text(option.label).slLead().foregroundStyle(SL.Ink.primary)
                    Text(scopeDetail(option))
                        .slMeta()
                        .foregroundStyle(picked ? SL.Ink.secondary : SL.Ink.tertiary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                if picked {
                    Circle().fill(SL.Ink.primary).frame(width: 22, height: 22)
                }
            }
            .padding(.vertical, SL.Space.s4)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .modifier(OptionSurface(picked: picked))
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous))
        }
        .buttonStyle(.plain)
        .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous))
        .accessibilityAddTraits(picked ? [.isSelected, .isButton] : .isButton)
    }

    /// What each reach covers here, in this plan's own names: "Push, vanaf
    /// vandaag", "Push en Push B, tot je het plan wijzigt".
    private func scopeDetail(_ option: ReplacementScope) -> String {
        switch option {
        case .thisDay:
            return "\(dayLabel), vanaf vandaag"
        case .thisPlan:
            let days = app.plan
                .filter { $0.exercises.contains { $0.exerciseID == exercise.id } }
                .map(\.short)
            return "\(Self.dutchList(days.isEmpty ? [dayLabel] : days)), tot je het plan wijzigt"
        case .always:
            return "Overal waar \(exercise.name.lowercased()) staat, ook in toekomstige plannen"
        }
    }

    /// "Push", "Push en Pull", "Push, Pull en Benen".
    static func dutchList(_ items: [String]) -> String {
        guard let last = items.last else { return "" }
        guard items.count > 1 else { return last }
        return items.dropLast().joined(separator: ", ") + " en " + last
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
                .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s5)
                .accessibilityAddTraits(.isHeader)
            Text("Beide vragen zijn optioneel. SETLINE stelt geen diagnose en houdt niets bij dat je niet zelf invult.")
                .slBody()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
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
            .modifier(OptionSurface(picked: picked))
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous))
        }
        .buttonStyle(.plain)
        .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous))
        .accessibilityAddTraits(picked ? [.isSelected, .isButton] : .isButton)
    }

    private struct OptionSurface: ViewModifier {
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
                .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s4)
                .accessibilityAddTraits(.isHeader)

            Text("Vier manieren om verder te trainen. Kies wat vandaag past.")
                .slBody()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
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
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .slMeasure(34, fontSize: SL.TypeSize.body)
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
                        .slLineHeight(1.4, size: SL.TypeSize.lead)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.primary)
                        .padding(.top, 10)
                    Text("De vier trainingsopties blijven staan. SETLINE beslist niets voor je en noemt geen aandoening.")
                        .slBody()
                        .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
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
                    .slLineHeight(1.4, size: SL.TypeSize.meta)
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
