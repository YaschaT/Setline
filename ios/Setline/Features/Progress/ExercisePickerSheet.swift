import SwiftUI
import SetlineCore

/// Artboards 40b–40d · which exercise Progressie is showing.
///
/// One sheet with two faces: the list you start on — what you starred, or what
/// you trained last if you have starred nothing — with the six muscle groups
/// under it, and a group opened into its own exercises. A search runs over all
/// of them at once.
///
/// Every row is recognisable before it is remembered: the name, where it sits,
/// and when it was last done. An exercise with nothing logged says so and can
/// still be picked, because a screen that only lists what you already trained
/// cannot tell you what you have not.
struct ExercisePickerSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize

    let rows: [ExercisePicker.Row]
    let selected: String?
    let onPick: (ExercisePicker.Row) -> Void
    let onStar: (ExercisePicker.Row) -> Void
    let onClose: () -> Void

    @State private var group: MuscleGroup?
    @State private var query = ""
    @FocusState private var searching: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            grip
            head

            searchField

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if isSearching {
                        results
                    } else if let group {
                        opened(group)
                    } else {
                        start
                    }
                }
                .padding(.bottom, SL.Space.s5)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, 10)
        .padding(.bottom, 34)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(SL.Surface.raised)
        // 40b opens 112 from the top of the frame.
        .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.fraction(0.95)])
        .presentationDragIndicator(.hidden)
        .presentationBackground(SL.Surface.raised)
        .slRespondsToTextSize()
    }

    private var isSearching: Bool {
        !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    // MARK: - Chrome

    private var grip: some View {
        Capsule()
            .fill(SL.Surface.hairlineStrong)
            .frame(width: 36, height: 5)
            .frame(maxWidth: .infinity)
            .padding(.bottom, 18)
            .accessibilityHidden(true)
    }

    /// 40b names the sheet; 40d replaces that with the way back to the groups.
    private var head: some View {
        HStack(spacing: SL.Space.s3) {
            if group != nil, !isSearching {
                Button {
                    withAnimation(.easeOut(duration: SL.Motion.fast)) { group = nil }
                } label: {
                    HStack(spacing: 2) {
                        Image(systemName: "chevron.left")
                            .font(.sl(20, SL.Weight.medium))
                        Text("Spiergroepen").slBody(SL.Weight.medium)
                    }
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.leading, -6)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Text("Oefening")
                    .slTitle()
                    .foregroundStyle(SL.Ink.primary)
                    .accessibilityAddTraits(.isHeader)
            }

            Spacer(minLength: SL.Space.s2)

            Button(action: onClose) {
                Text("Sluiten")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .slHitTarget()
            }
            .buttonStyle(.plain)
        }
        .frame(minHeight: 24)
        .padding(.bottom, 14)
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            SLGlyph(name: .search, size: 20)
                .foregroundStyle(SL.Ink.tertiary)
            TextField(
                "",
                text: $query,
                prompt: Text(placeholder).foregroundColor(SL.Ink.tertiary)
            )
            .font(.sl(SL.TypeSize.lead, SL.Weight.regular))
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.search)
            .foregroundStyle(SL.Ink.primary)
            .tint(SL.Signal.action)
            .focused($searching)
            if !query.isEmpty {
                Button { query = "" } label: {
                    Text("Wis")
                        .slMeta(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.tertiary)
                        .frame(minWidth: 40, minHeight: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.trailing, -6)
                .accessibilityLabel("Zoekterm wissen")
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 6)
        .frame(minHeight: SL.Space.hitMin)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .fill(SL.Surface.raised2)
        )
        .contentShape(Rectangle())
        .onTapGesture { searching = true }
    }

    /// The count is the catalogue's own, so the sheet never promises more
    /// exercises than it holds.
    private var placeholder: String {
        "Zoek in \(rows.count) oefeningen"
    }

    // MARK: - 40b / 40c · where the sheet opens

    @ViewBuilder
    private var start: some View {
        let favorites = ExercisePicker.favorites(in: rows)

        if favorites.isEmpty {
            // 40c: the star's own explanation, where the favourites would be.
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "star")
                    .font(.sl(20, SL.Weight.regular))
                    .foregroundStyle(SL.Ink.tertiary)
                Text("Tik de ster bij een oefening om hem hier bovenaan te zetten.")
                    .slBody()
                    .slLineHeight(1.4, size: SL.TypeSize.body)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.secondary)
            }
            .padding(.vertical, 14)
            .padding(.top, 22)
            .overlay(alignment: .top) { SLHairline().padding(.top, 22) }
            .overlay(alignment: .bottom) { SLHairline() }

            let recent = ExercisePicker.recent(in: rows)
            if !recent.isEmpty {
                section("RECENT", top: 18) {
                    ForEach(recent) { row in card(row, detail: standing(row)) }
                }
            }
        } else {
            section("FAVORIETEN", top: 22) {
                ForEach(favorites) { row in card(row, detail: standing(row)) }
            }
        }

        section("SPIERGROEP", top: 22) {
            ForEach(ExercisePicker.groups(in: rows), id: \.group) { entry in
                Button {
                    withAnimation(.easeOut(duration: SL.Motion.fast)) { group = entry.group }
                } label: {
                    HStack(spacing: SL.Space.s3) {
                        Text(entry.group.title)
                            .slLead(SL.Weight.medium)
                            .foregroundStyle(SL.Ink.primary)
                        Spacer(minLength: SL.Space.s2)
                        Text("\(entry.count)")
                            .slBody()
                            .slNumerals()
                            .foregroundStyle(SL.Ink.tertiary)
                        Image(systemName: "chevron.right")
                            .font(.sl(17, SL.Weight.regular))
                            .foregroundStyle(SL.Ink.tertiary)
                    }
                    .frame(minHeight: 46)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(entry.group.title), \(entry.count) oefeningen")
                .accessibilityHint("Dubbeltik om de oefeningen te zien")
            }
        }
    }

    // MARK: - 40d · one group

    @ViewBuilder
    private func opened(_ group: MuscleGroup) -> some View {
        Text(group.title)
            .font(.sl(28, SL.Weight.semibold))
            .foregroundStyle(SL.Ink.primary)
            .accessibilityAddTraits(.isHeader)
        Text(ExercisePicker.summary(of: group, in: rows))
            .slMeta()
            .slNumerals()
            .foregroundStyle(SL.Ink.tertiary)
            .padding(.top, SL.Space.s1)
            .padding(.bottom, SL.Space.s4)

        ForEach(ExercisePicker.rows(in: group, of: rows)) { row in
            card(row, detail: lastSet(row))
        }
    }

    // MARK: - Search

    @ViewBuilder
    private var results: some View {
        let found = ExercisePicker.search(query, in: rows)
        if found.isEmpty {
            Text("Niets gevonden voor \(query.trimmingCharacters(in: .whitespaces)).")
                .slBody()
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, 22)
        } else {
            ForEach(found) { row in card(row, detail: standing(row)) }
                .padding(.top, 6)
        }
    }

    // MARK: - One row

    /// "Borst · 7 sep", or where it sits when it has never been logged.
    private func standing(_ row: ExercisePicker.Row) -> String {
        guard let last = row.lastTrained else { return "\(row.group.title) · nog niet gelogd" }
        return "\(row.group.title) · \(app.display.shortDate(last))"
    }

    /// "laatst 7 sep · 50 kg × 8" — 40d's second line, inside a group where
    /// the group's name would say nothing new.
    private func lastSet(_ row: ExercisePicker.Row) -> String {
        guard let last = row.lastTrained else { return "nog niet gelogd" }
        guard let weight = row.topSetKg, let reps = row.topSetReps else {
            return "laatst \(app.display.shortDate(last))"
        }
        return "laatst \(app.display.shortDate(last)) · \(app.display.kg(weight)) × \(reps)"
    }

    private func card(_ row: ExercisePicker.Row, detail: String) -> some View {
        let isSelected = row.exerciseID == selected

        return HStack(spacing: SL.Space.s3) {
            Button { onPick(row) } label: {
                VStack(alignment: .leading, spacing: 1) {
                    Text(row.name)
                        .slLead()
                        .foregroundStyle(row.hasHistory ? SL.Ink.primary : SL.Ink.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(detail)
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.tertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isSelected {
                Image(systemName: "checkmark")
                    .font(.sl(17, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
            }

            Button { onStar(row) } label: {
                Image(systemName: row.isFavorite ? "star.fill" : "star")
                    .font(.sl(18, SL.Weight.regular))
                    .foregroundStyle(row.isFavorite ? SL.Ink.primary : SL.Ink.tertiary)
                    .frame(minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.trailing, -10)
            .accessibilityLabel(row.isFavorite ? "Ster weghalen bij \(row.name)" : "\(row.name) een ster geven")
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 52)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .fill(isSelected ? SL.Surface.raised2 : .clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .strokeBorder(isSelected ? SL.Surface.selection : .clear, lineWidth: SL.Metric.border)
        )
        .padding(.horizontal, -12)
        .accessibilityElement(children: .contain)
    }

    private func section<Content: View>(
        _ title: String,
        top: CGFloat,
        @ViewBuilder rows: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
                .tracking(SL.TypeSize.micro * 0.06)
                .foregroundStyle(SL.Ink.tertiary)
                .padding(.top, top)
                .padding(.bottom, 6)
            rows()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
