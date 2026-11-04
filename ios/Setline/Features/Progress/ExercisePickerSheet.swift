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
    /// The star's size, which grows with the text like its font does.
    @ScaledMetric(relativeTo: .body) private var starSize: CGFloat = 18

    let rows: [ExercisePicker.Row]
    let selected: String?
    let onPick: (ExercisePicker.Row) -> Void
    let onStar: (ExercisePicker.Row) -> Void
    let onClose: () -> Void
    /// Picking adds the exercise to a workout: each row says so with "+ Add"
    /// where the star would be, since a star read as the way to add it.
    var adds = false

    @State private var group: MuscleGroup?
    @State private var query = ""
    /// The online library's answers to the query, in a picker that adds.
    @State private var online: [ExerciseLibrary.Entry] = []
    @State private var searchingOnline = false
    @State private var onlineFailed = false
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
        // One request per pause in typing; the library is fetched once.
        .task(id: query) {
            let asked = query.trimmingCharacters(in: .whitespaces)
            guard adds, asked.count >= 3 else {
                online = []
                searchingOnline = false
                return
            }
            searchingOnline = true
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            let library = await ExerciseLibraryStore.shared.load()
            guard !Task.isCancelled else { return }
            onlineFailed = library == nil
            online = library?.search(asked, excludingNames: Set(rows.map(\.name))) ?? []
            searchingOnline = false
        }
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
                        Text("Muscle groups").slBody(SL.Weight.medium)
                    }
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.leading, -6)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Text("Exercise")
                    .slTitle()
                    .foregroundStyle(SL.Ink.primary)
                    .accessibilityAddTraits(.isHeader)
            }

            Spacer(minLength: SL.Space.s2)

            Button(action: onClose) {
                Text("Close")
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
                    Text("Clear")
                        .slMeta(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.tertiary)
                        .frame(minWidth: 40, minHeight: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.trailing, -6)
                .accessibilityLabel("Clear search")
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
        "Search \(rows.count) exercises"
    }

    // MARK: - 40b / 40c · where the sheet opens

    @ViewBuilder
    private var start: some View {
        let favorites = ExercisePicker.favorites(in: rows)

        if favorites.isEmpty, adds {
            let recent = ExercisePicker.recent(in: rows)
            if !recent.isEmpty {
                section("RECENT", top: 22) {
                    ForEach(recent) { row in card(row, detail: standing(row)) }
                }
            }
        } else if favorites.isEmpty {
            // 40c: the star's own explanation, where the favourites would be.
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "star")
                    .font(.sl(20, SL.Weight.regular))
                    .foregroundStyle(SL.Ink.tertiary)
                Text("Tap the star on an exercise to pin it here.")
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
            section("FAVOURITES", top: 22) {
                ForEach(favorites) { row in card(row, detail: standing(row)) }
            }
        }

        section("MUSCLE GROUP", top: 22) {
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
                .accessibilityLabel("\(entry.group.title), \(entry.count) exercises")
                .accessibilityHint("Double-tap to see the exercises")
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
            Text(adds ? "Not in Setline yet." : "Nothing found for \(query.trimmingCharacters(in: .whitespaces)).")
                .slBody()
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, 22)
        } else {
            ForEach(found) { row in card(row, detail: standing(row)) }
                .padding(.top, 6)
        }
        if adds { onlineResults }
    }

    // MARK: - Found online

    /// What the online library has for the query: each with its photo, its
    /// muscle and equipment, and one tap to add it to your exercises.
    @ViewBuilder
    private var onlineResults: some View {
        if !online.isEmpty {
            section("FOUND ONLINE", top: 22) {
                ForEach(online) { entry in onlineRow(entry) }
            }
            Text("From free-exercise-db, a free exercise library. Adding one puts it in your own exercises, with its photos.")
                .slMeta()
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.tertiary)
                .padding(.top, SL.Space.s2)
        } else if searchingOnline {
            HStack(spacing: SL.Space.s2) {
                ProgressView().controlSize(.small)
                Text("Searching online…").slMeta().foregroundStyle(SL.Ink.secondary)
            }
            .padding(.top, 22)
        } else if onlineFailed {
            Text("Couldn't search online. Check your connection and try again.")
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, 22)
        }
    }

    private func onlineRow(_ entry: ExerciseLibrary.Entry) -> some View {
        Button { add(entry) } label: {
            HStack(spacing: SL.Space.s3) {
                AsyncImage(url: ExerciseMedia.frames(folder: entry.id).first) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { SL.Surface.raised2 }
                }
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text(entry.name)
                        .slLead()
                        .foregroundStyle(SL.Ink.primary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Text([entry.muscleGroup?.title, entry.equipmentLabel].compactMap { $0 }.joined(separator: " · "))
                        .slMeta()
                        .foregroundStyle(SL.Ink.tertiary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 4) {
                    Image(systemName: "plus").font(.system(size: 12, weight: .bold))
                    Text("Add").font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                }
                .foregroundStyle(SL.Signal.action)
                .padding(.horizontal, SL.Space.s3)
                .frame(minHeight: 32)
                .background(Capsule().fill(SL.Signal.actionTint))
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add \(entry.name), \(entry.equipmentLabel)")
    }

    /// Writes it as an exercise of your own first, so whatever picked it
    /// can find it, then picks it like any other.
    private func add(_ entry: ExerciseLibrary.Entry) {
        let custom = entry.customExercise()
        Task {
            await app.addCustomExercise(custom)
            onPick(ExercisePicker.Row(
                exerciseID: custom.id, name: custom.name, group: custom.muscleGroup ?? .core,
                lastTrained: nil, topSetKg: nil, topSetReps: nil, isFavorite: false
            ))
        }
    }

    // MARK: - One row

    /// "Borst · 7 sep", or where it sits when it has never been logged.
    private func standing(_ row: ExercisePicker.Row) -> String {
        guard let last = row.lastTrained else { return "\(row.group.title) · not logged yet" }
        return "\(row.group.title) · \(app.display.shortDate(last))"
    }

    /// "laatst 7 sep · 50 kg × 8" — 40d's second line, inside a group where
    /// the group's name would say nothing new.
    private func lastSet(_ row: ExercisePicker.Row) -> String {
        guard let last = row.lastTrained else { return "not logged yet" }
        guard let weight = row.topSetKg, let reps = row.topSetReps else {
            return "last \(app.display.shortDate(last))"
        }
        return "last \(app.display.shortDate(last)) · \(app.display.kg(weight)) × \(reps)"
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

            if adds {
                Button { onPick(row) } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus").font(.system(size: 12, weight: .bold))
                        Text("Add").font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                    }
                    .foregroundStyle(SL.Signal.action)
                    .padding(.horizontal, SL.Space.s3)
                    .frame(minHeight: 32)
                    .background(Capsule().fill(SL.Signal.actionTint))
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Add \(row.name)")
            } else {
            Button { onStar(row) } label: {
                Image(systemName: row.isFavorite ? "star.fill" : "star")
                    .font(.sl(18, SL.Weight.regular))
                    .foregroundStyle(row.isFavorite ? SL.Ink.primary : SL.Ink.tertiary)
                    .frame(minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // The tap area hangs past the list's edge so the glyph lines up
            // with it — 10 at the default size, where the glyph ends 3 short
            // of the edge. A glyph grown with the text has less room in its
            // 44, so the hang shrinks with it and the star is never cut off.
            .padding(.trailing, -max(0, (SL.Space.hitMin - starSize) / 2 - 3))
            .accessibilityLabel(row.isFavorite ? "Remove star from \(row.name)" : "Star \(row.name)")
            }
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
