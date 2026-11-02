import SwiftUI
import SetlineCore

/// Artboard 42c · Toevoegen.
///
/// The meal is already chosen, because the hour knows which one it is, and one
/// tap changes it. Under it: a search, then what this account eats at this
/// meal, then what it ate last — each row an item it has logged before, at the
/// amount it was logged at, one ⊕ from being logged again.
///
/// Nothing here is invented. The lists are the account's own entries, and the
/// search is the web app's endpoint (`/api/food-search`), shown in the order
/// the server ranked it. No suggestion, estimate or portion is made up on this
/// side.
struct AddFoodSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize
    /// The ⊕'s size, which grows with the text like its font does.
    @ScaledMetric(relativeTo: .body) private var plusSize: CGFloat = 24

    let date: Date
    /// Which heading the ⊕ adds to. 42c preselects it from the hour.
    let meal: Meal
    let onLog: (NutritionEntry) -> Void
    /// Several at once, from a meal scan. Falls back to one by one.
    var onLogAll: (([NutritionEntry]) -> Void)? = nil
    let onClose: () -> Void

    @State private var chosen: Meal
    @State private var scanning: Scanner?

    private enum Scanner: String, Identifiable {
        case barcode, photo
        var id: String { rawValue }
    }
    @State private var query = ""
    @State private var results: [FoodProduct] = []
    @State private var note: String?
    @State private var searching = false
    /// The food that is not in any database, written out by hand. 42c does not
    /// draw it; it is the way in for everything the search cannot find, and the
    /// search itself points at it when it comes back empty.
    @State private var manual = false
    @State private var name = ""
    @State private var amount = "100"
    @State private var unit = "g"
    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""
    @FocusState private var focused: Field?
    @State private var buildingMeal = false
    @State private var editingMeal: SavedMeal?

    private enum Field: Hashable { case query, name, amount, unit, calories, protein, carbs, fat }

    init(
        date: Date,
        meal: Meal,
        onLog: @escaping (NutritionEntry) -> Void,
        onLogAll: (([NutritionEntry]) -> Void)? = nil,
        onClose: @escaping () -> Void
    ) {
        self.date = date
        self.meal = meal
        self.onLog = onLog
        self.onLogAll = onLogAll
        self.onClose = onClose
        _chosen = State(initialValue: meal)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            grip
            head

            MealSegment(selection: $chosen)
                .padding(.top, 0)

            if manual {
                ScrollView {
                    ownValues.padding(.bottom, SL.Space.s5)
                }
                .scrollDismissesKeyboard(.interactively)
            } else {
                searchField.padding(.top, SL.Space.s3)
                if !isSearch { scanTools.padding(.top, SL.Space.s2) }
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        if let note {
                            Text(note)
                                .slMeta()
                                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                                .fixedSize(horizontal: false, vertical: true)
                                .foregroundStyle(SL.Ink.tertiary)
                                .padding(.top, SL.Space.s3)
                        }
                        if isSearch, !bestDishes.isEmpty {
                            group("BEST MATCH", top: 22) {
                                ForEach(bestDishes, id: \.key) { food in
                                    dishRow(food)
                                }
                            }
                        }
                        if searching {
                            loading.padding(.top, SL.Space.s3)
                        } else if !results.isEmpty {
                            group(bestDishes.isEmpty ? "RESULTS" : "PRODUCTS", top: bestDishes.isEmpty ? 22 : 18) {
                                ForEach(results) { product in
                                    productRow(product)
                                }
                            }
                            if !generalDishes.isEmpty {
                                group("GENERAL ESTIMATE", top: 18) {
                                    ForEach(generalDishes, id: \.key) { food in
                                        dishRow(food)
                                    }
                                }
                            }
                            Text("Check the packaging; Open Food Facts is maintained by its users.")
                                .slMeta()
                                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                                .fixedSize(horizontal: false, vertical: true)
                                .foregroundStyle(SL.Ink.tertiary)
                                .padding(.top, SL.Space.s3)
                        } else if isSearch {
                            ownValuesInvitation.padding(.top, SL.Space.s4)
                        } else {
                            memory
                        }
                    }
                    .padding(.bottom, SL.Space.s5)
                }
                .scrollDismissesKeyboard(.interactively)
            }
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, 10)
        .padding(.bottom, 34)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(SL.Surface.raised)
        .safeAreaInset(edge: .bottom) {
            if manual {
                Button { logOwn() } label: { Text("Add to \(chosen.spoken)") }
                    .buttonStyle(SLPrimaryButtonStyle())
                    .disabled(!isLoggable)
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.bottom, SL.Space.s3)
                    .frame(maxWidth: .infinity)
                    .background(SL.Surface.raised)
            }
        }
        // 42c opens 120 from the top of the frame. A detent's fraction is of
        // the container between the safe areas, not of the screen, so the
        // number is larger than the artboard's 86%.
        #if DEBUG
        .onAppear {
            let arguments = ProcessInfo.processInfo.arguments
            if let flag = arguments.firstIndex(of: "-SetlineScan"), arguments.indices.contains(flag + 1) {
                scanning = Scanner(rawValue: arguments[flag + 1])
            }
        }
        #endif
        .fullScreenCover(item: $scanning) { scanner in
            switch scanner {
            case .barcode:
                BarcodeScanSheet(date: date, meal: chosen, onLog: { entry in
                    scanning = nil
                    onLog(entry)
                }, onClose: { scanning = nil })
            case .photo:
                FoodPhotoScanSheet(date: date, meal: chosen, onLog: { entries in
                    scanning = nil
                    if let onLogAll { onLogAll(entries) } else { entries.forEach(onLog) }
                }, onClose: { scanning = nil })
            }
        }
        .sheet(isPresented: $buildingMeal) {
            MealBuilderSheet(meal: nil, mealTime: chosen, onSave: { meal, log in
                app.saveMeal(meal)
                buildingMeal = false
                if log { onLog(meal.entry(id: Self.newID(), on: date, meal: chosen)) }
            }, onDelete: nil, onClose: { buildingMeal = false })
        }
        .sheet(item: $editingMeal) { meal in
            MealBuilderSheet(meal: meal, mealTime: chosen, onSave: { saved, log in
                app.saveMeal(saved)
                editingMeal = nil
                if log { onLog(saved.entry(id: Self.newID(), on: date, meal: chosen)) }
            }, onDelete: {
                app.removeMeal(id: meal.id)
                editingMeal = nil
            }, onClose: { editingMeal = nil })
        }
        .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.fraction(0.94)])
        .presentationDragIndicator(.hidden)
        .presentationBackground(SL.Surface.raised)
        .slRespondsToTextSize()
        // Typing finds things without asking for the return key, and one
        // request is sent per pause rather than per letter.
        .task(id: query) {
            let asked = query.trimmingCharacters(in: .whitespacesAndNewlines)
            guard asked.count >= FoodSearch.shortestQuery else {
                results = []
                note = nil
                searching = false
                return
            }
            // What was said about the last query does not belong to this one:
            // "Zoeken lukte niet" over a row reading "Searching…" says both.
            note = nil
            searching = true
            try? await Task.sleep(for: .milliseconds(450))
            guard !Task.isCancelled else { return }
            await run(asked)
        }
    }

    private var isSearch: Bool {
        query.trimmingCharacters(in: .whitespacesAndNewlines).count >= FoodSearch.shortestQuery
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

    private var head: some View {
        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
            Text(manual ? "Enter manually" : "Add food")
                .slTitle()
                .foregroundStyle(SL.Ink.primary)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: SL.Space.s2)
            Button {
                if manual { manual = false } else { onClose() }
            } label: {
                Text(manual ? "Back" : "Close")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .slHitTarget()
            }
            .buttonStyle(.plain)
        }
        .frame(minHeight: 24)
        .padding(.bottom, 14)
    }

    // MARK: - Without typing

    /// The two ways in that skip the keyboard: a barcode, or a photo (or a
    /// line) of the meal. Quiet tiles beside each other, under the search.
    private var scanTools: some View {
        HStack(spacing: SL.Space.s2) {
            scanTile("Barcode", detail: "Packaged food", symbol: "barcode.viewfinder") { scanning = .barcode }
            scanTile("Scan meal", detail: "Photo or a line", symbol: "camera.viewfinder") { scanning = .photo }
        }
    }

    private func scanTile(_ title: String, detail: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: SL.Space.s3) {
                Image(systemName: symbol)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(SL.Signal.action)
                    .frame(width: 36, height: 36)
                    .background(RoundedRectangle(cornerRadius: SL.Radius.sm, style: .continuous).fill(SL.Signal.actionTint))
                VStack(alignment: .leading, spacing: 0) {
                    Text(title).slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                    Text(detail).slMeta().foregroundStyle(SL.Ink.tertiary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(SL.Space.s2)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.97))
        .accessibilityHint(title == "Barcode" ? "Opens the camera to scan a barcode" : "Opens the meal scan")
    }

    // MARK: - Looking it up

    private var searchField: some View {
        HStack(spacing: 10) {
            SLGlyph(name: .search, size: 20)
                .foregroundStyle(SL.Ink.tertiary)
            // A product name is not prose: autocorrect turns "skyr" into
            // "Skye" and searches for the wrong thing.
            TextField(
                "",
                text: $query,
                prompt: Text("Search food").foregroundColor(SL.Ink.tertiary)
            )
            .font(.sl(SL.TypeSize.lead, SL.Weight.regular))
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.search)
            .foregroundStyle(SL.Ink.primary)
            .tint(SL.Signal.action)
            .focused($focused, equals: .query)
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
        .onTapGesture { focused = .query }
    }

    /// The component sheet's loading state on the one operation that really
    /// waits on a network: a tonal row, never a spinner and never a pulse, so
    /// reduced motion sees exactly the same thing.
    private var loading: some View {
        HStack(spacing: SL.Space.s3) {
            RoundedRectangle(cornerRadius: SL.Radius.sm, style: .continuous)
                .fill(SL.Surface.raised2)
                .frame(width: 120, height: 12)
            Spacer()
            Text("Searching…").slMeta().foregroundStyle(SL.Ink.tertiary)
        }
        .frame(minHeight: 50)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Search")
    }

    private func run(_ asked: String) async {
        let outcome = await app.searchFood(asked)
        guard !Task.isCancelled else { return }
        searching = false
        switch outcome {
        case let .found(products):
            results = Self.ranked(products, for: asked)
            note = nil
        case let .partial(products, text):
            results = Self.ranked(products, for: asked)
            note = text
        case let .failed(message):
            results = []
            note = message
        }
    }

    // MARK: - What this account eats

    /// 42c: what is logged at this meal most often, then what was logged last.
    /// Both come from this account's own entries; an empty history simply shows
    /// nothing, and never a made-up example.
    @ViewBuilder
    private var memory: some View {
        let today = Schedule.dateKey(date)
        let entries = app.nutritionEntries
        let often = FoodMemory.often(at: chosen, in: entries, excluding: today)
        let recent = FoodMemory.recent(in: entries, excluding: today)
            .filter { entry in !often.contains { $0.name.lowercased() == entry.name.lowercased() } }

        let favorites = app.foodFavorites
        mealsBlock
        if !favorites.isEmpty {
            group("FAVORITES", top: 18) {
                ForEach(favorites) { favorite in
                    row(
                        title: favorite.name,
                        detail: [favorite.portion, app.display.kcal(Decimal(favorite.calories))]
                            .compactMap { $0 }.joined(separator: " · "),
                        star: true,
                        favorite: favorite.entry(id: "fav", on: date, meal: chosen)
                    ) {
                        onLog(favorite.entry(id: Self.newID(), on: date, meal: chosen))
                    }
                }
            }
        }
        if often.isEmpty && recent.isEmpty && favorites.isEmpty {
            Text("Search for a product, or enter it yourself. What you log appears here.")
                .slBody()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, 22)
            ownValuesInvitation.padding(.top, SL.Space.s4)
        } else {
            if !often.isEmpty {
                group("OFTEN AT \(chosen.label.uppercased())", top: favorites.isEmpty ? 22 : 18) {
                    ForEach(often) { entry in
                        memoryRow(entry)
                    }
                }
            }
            if !recent.isEmpty {
                group("RECENT", top: often.isEmpty && favorites.isEmpty ? 22 : 18) {
                    ForEach(recent) { entry in
                        memoryRow(entry)
                    }
                }
            }
            Text(footnote)
                .slMeta()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.tertiary)
                .padding(.top, SL.Space.s3)
            ownValuesInvitation.padding(.top, SL.Space.s4)
        }
    }

    /// Your own meals first: a card to build one, then the ones you saved,
    /// each with what goes in it underneath.
    @ViewBuilder
    private var mealsBlock: some View {
        Button { buildingMeal = true } label: {
            HStack(spacing: SL.Space.s3) {
                Image(systemName: "fork.knife")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(SL.Signal.onAction)
                    .frame(width: 40, height: 40)
                    .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Signal.action))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Build a meal").slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                    Text("Spaghetti, a bowl, a shake: add each ingredient, save it, log it again in one tap")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: SL.Space.s2)
                SLGlyph(name: .chevronRight, size: 14).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(SL.Space.s3)
            .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Signal.actionTint))
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                    .strokeBorder(SL.Signal.action.opacity(0.3), lineWidth: SL.Metric.border)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.98))
        .padding(.top, 22)
        let meals = app.savedMeals
        if !meals.isEmpty {
            group("YOUR MEALS", top: 18) {
                ForEach(meals) { meal in
                    mealRow(meal)
                }
            }
        }
    }

    private func mealRow(_ meal: SavedMeal) -> some View {
        HStack(spacing: SL.Space.s1) {
            Button { editingMeal = meal } label: {
                VStack(alignment: .leading, spacing: 1) {
                    Text(meal.name).slLead().foregroundStyle(SL.Ink.primary)
                    Text(meal.ingredientLine)
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Text("\(app.display.kcal(Decimal(meal.calories))) · \(Int(meal.protein)) g protein")
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.tertiary)
                }
                .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Double-tap to edit")
            Button { onLog(meal.entry(id: Self.newID(), on: date, meal: chosen)) } label: {
                Image(systemName: "plus.circle")
                    .font(.sl(24, SL.Weight.regular))
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Add \(meal.name) to \(chosen.spoken)")
        }
    }

    /// The hour is only given as the reason when the hour is actually the
    /// reason — opening the sheet from a meal's own ⊕ chose it instead.
    private var footnote: String {
        chosen == Meal.likely(at: Date())
            ? "\(MealSection.title(of: chosen)) is preselected because it's \(app.display.clock(Date())). One tap on ⊕ adds the item with this amount."
            : "One tap on ⊕ adds the item to \(chosen.spoken), with this amount."
    }

    private func group<Content: View>(
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
                .padding(.bottom, SL.Space.s1)
            rows()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// A row the account has eaten before, offered again exactly as it was
    /// written: the same name, the same amount, the same numbers.
    private func memoryRow(_ entry: NutritionEntry) -> some View {
        row(
            title: entry.name,
            detail: [entry.portion, app.display.kcal(Decimal(entry.calories))]
                .compactMap { $0 }
                .joined(separator: " · "),
            favorite: entry
        ) {
            // The day this sheet logs to, at the moment it is tapped.
            onLog(FoodMemory.repeated(entry, on: date, meal: chosen))
        }
    }

    /// A product from the search, at the 100 g its values are given for. The
    /// amount is changed afterwards on the row itself (42d), where the macros
    /// follow it.
    /// Dishes the app knows by name — "kippenpastei", "stoofvlees" — with a
    /// usual portion and standard values: shown above the database's
    /// products, which often answer a dish with an unrelated brand.
    private var dishMatches: [MealRecognition.Food] {
        let asked = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard asked.count >= FoodSearch.shortestQuery else { return [] }
        var list: [MealRecognition.Food] = []
        if let best = MealRecognition.match(asked) { list.append(best) }
        for food in MealRecognition.candidates(asked, limit: 3) where !list.contains(where: { $0.key == food.key }) {
            list.append(food)
        }
        return Array(list.prefix(3))
    }

    /// A dish that is what was typed ("kippenpastei") leads; one that is only
    /// part of it ("pizza" in "dr oetker pizza bolognese") waits under the
    /// products, as a general estimate — the product itself answers better.
    private var bestDishes: [MealRecognition.Food] {
        let asked = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return dishMatches.filter { MealRecognition.coverage(asked, by: $0) >= 0.6 || results.isEmpty && !searching }
    }

    private var generalDishes: [MealRecognition.Food] {
        dishMatches.filter { food in !bestDishes.contains { $0.key == food.key } }
    }

    private func dishRow(_ food: MealRecognition.Food) -> some View {
        let portion = food.scanned(confidence: .medium)
        let entry = portion.entry(id: Self.newID(), on: date, meal: chosen)
        return row(
            title: food.name,
            detail: "\(Int(portion.grams)) g · \(app.display.kcal(Decimal(portion.calories))) · \(app.display.whole(Decimal(portion.protein))) g protein",
            favorite: entry
        ) {
            onLog(portion.entry(id: Self.newID(), on: date, meal: chosen))
        }
    }

    /// The search's products, the ones whose name says what was typed first.
    private static func ranked(_ products: [FoodProduct], for query: String) -> [FoodProduct] {
        products.enumerated()
            .sorted { a, b in
                let left = MealRecognition.similarity(query, to: a.element.name, brand: a.element.brand)
                let right = MealRecognition.similarity(query, to: b.element.name, brand: b.element.brand)
                return left == right ? a.offset < b.offset : left > right
            }
            .map(\.element)
    }

    /// A product at 100 g, as it would be logged — what a star keeps.
    private func productEntry(_ product: FoodProduct) -> NutritionEntry {
        let draft = FoodSearch.portion(of: product, grams: 100)
        return NutritionEntry(id: "fav-\(product.id)", date: Schedule.dateKey(date), meal: chosen.rawValue, name: draft.name,
                              calories: draft.calories, protein: draft.protein, carbs: draft.carbs, fat: draft.fat,
                              amount: draft.amount, unit: draft.unit)
    }

    private func productRow(_ product: FoodProduct) -> some View {
        row(
            title: product.name,
            detail: "100 g · \(app.display.kcal(Decimal(product.calories)))\(product.brand.isEmpty ? "" : " · \(product.brand)")",
            photo: .url(product.imageURL),
            favorite: productEntry(product)
        ) {
            let draft = FoodSearch.portion(of: product, grams: 100)
            onLog(
                NutritionEntry(
                    id: Self.newID(),
                    date: Schedule.dateKey(date),
                    meal: chosen.rawValue,
                    name: draft.name,
                    calories: draft.calories,
                    protein: draft.protein,
                    carbs: draft.carbs,
                    fat: draft.fat,
                    amount: draft.amount,
                    unit: draft.unit,
                    loggedAt: Date()
                )
            )
        }
    }

    /// A food to add: the photo or star, the name and its portion, a star to
    /// keep it as a favorite, and the ⊕.
    private func row(title: String, detail: String, photo: SLFoodPhoto.Source? = nil, star: Bool = false,
                     favorite: NutritionEntry? = nil, add: @escaping () -> Void) -> some View {
        HStack(spacing: SL.Space.s1) {
            Button(action: add) {
                HStack(spacing: SL.Space.s3) {
                    if let photo {
                        SLFoodPhoto(source: photo).frame(width: 44, height: 44)
                    } else if star {
                        Image(systemName: "star.fill")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(SL.Signal.action)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(SL.Signal.actionTint))
                    }
                    VStack(alignment: .leading, spacing: 0) {
                        Text(title)
                            .slLead()
                            .foregroundStyle(SL.Ink.primary)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(detail)
                            .slMeta()
                            .slNumerals()
                            .foregroundStyle(SL.Ink.tertiary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: SL.Space.s2)
                }
                .frame(minHeight: 50)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(title), \(detail)")
            .accessibilityHint("Double-tap to add to \(chosen.spoken)")

            if let favorite {
                let isFavorite = app.isFavorite(favorite)
                Button {
                    app.toggleFavorite(favorite)
                    if !isFavorite { SLSound.pop.play() }
                } label: {
                    Image(systemName: isFavorite ? "star.fill" : "star")
                        .font(.system(size: 18, weight: .regular))
                        .foregroundStyle(isFavorite ? SL.Signal.action : SL.Ink.tertiary)
                        .frame(minWidth: 40, minHeight: SL.Space.hitMin)
                        .contentShape(Rectangle())
                        .contentTransition(.symbolEffect(.replace))
                }
                .buttonStyle(.plain)
                .sensoryFeedback(.selection, trigger: isFavorite)
                .accessibilityLabel(isFavorite ? "Remove \(title) from favorites" : "Add \(title) to favorites")
            }

            Button(action: add) {
                Image(systemName: "plus.circle")
                    .font(.sl(24, SL.Weight.regular))
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                    // 42c hangs the ⊕ 10 past the gutter, so the glyph lines
                    // up with the text above it rather than its hit area. The
                    // hang is the room the glyph leaves in that area, so a
                    // glyph grown with the text is never cut off at the edge.
                    .padding(.trailing, -max(0, (SL.Space.hitMin - plusSize) / 2))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Add \(title) to \(chosen.spoken)")
        }
    }

    // MARK: - Food no database has

    private var ownValuesInvitation: some View {
        Button { manual = true } label: {
            HStack(spacing: SL.Space.s3) {
                Text("Enter manually")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                Spacer(minLength: SL.Space.s2)
                SLGlyph(name: .chevronRight, size: 18)
                    .foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: SL.Space.hitMin)
            .slBorderBox()
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                    .fill(SL.Surface.ground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                    .strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("For food the search doesn't know")
    }

    private var ownValues: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(spacing: 0) {
                field("Name", text: $name, field: .name)
                SLHairline().padding(.horizontal, 14)
                field("Amount", text: $amount, field: .amount, numeric: true)
                SLHairline().padding(.horizontal, 14)
                field("Unit", text: $unit, field: .unit)
                SLHairline().padding(.horizontal, 14)
                field("Calories", text: $calories, field: .calories, unit: "kcal", numeric: true)
                SLHairline().padding(.horizontal, 14)
                field("Protein", text: $protein, field: .protein, unit: "g", numeric: true)
                SLHairline().padding(.horizontal, 14)
                field("Carbs", text: $carbs, field: .carbs, unit: "g", numeric: true)
                SLHairline().padding(.horizontal, 14)
                field("Fat", text: $fat, field: .fat, unit: "g", numeric: true)
            }
            .padding(6)
            .slBorderBox()
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                    .fill(SL.Surface.ground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                    .strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border)
            )
            .padding(.top, SL.Space.s4)

            if let energyNote {
                Text(energyNote)
                    .slMeta()
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, SL.Space.s3)
            }
        }
    }

    private func field(
        _ label: String,
        text: Binding<String>,
        field: Field,
        unit: String? = nil,
        numeric: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            SLEyebrow(text: label.uppercased(), size: SL.TypeSize.micro)
            HStack(spacing: SL.Space.s2) {
                TextField("", text: text)
                    .keyboardType(numeric ? .decimalPad : .default)
                    .textInputAutocapitalization(numeric ? .never : .sentences)
                    .autocorrectionDisabled(numeric)
                    .onChange(of: text.wrappedValue) { _, new in
                        guard numeric else { return }
                        let filtered = NumberInput.numericOnly(new)
                        if filtered != new { text.wrappedValue = filtered }
                    }
                    // 17pt, comfortably above the 16pt floor that stops iOS
                    // zooming a field on focus.
                    .font(.sl(SL.TypeSize.lead, SL.Weight.medium))
                    .foregroundStyle(SL.Ink.primary)
                    .tint(SL.Signal.action)
                if let unit {
                    Text(unit).slBody().foregroundStyle(SL.Ink.tertiary)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(minHeight: 60)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .fill(focused == field ? SL.Surface.raised2 : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(focused == field ? SL.Signal.action : .clear, lineWidth: SL.Metric.border)
        )
        .focused($focused, equals: field)
        .contentShape(Rectangle())
        .onTapGesture { focused = field }
    }

    private func value(_ text: String) -> Double { NumberInput.value(text) }

    private var energy: Double {
        let typed = value(calories)
        return typed > 0
            ? typed
            : NutritionEntry.calories(protein: value(protein), carbs: value(carbs), fat: value(fat))
    }

    /// Said only when it changes what gets stored: macros filled in, calories
    /// left blank.
    private var energyNote: String? {
        guard value(calories) <= 0, energy > 0 else { return nil }
        return "Worked out from the macros: \(app.display.kcal(Decimal(energy)))."
    }

    private var isLoggable: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && energy > 0
    }

    private func logOwn() {
        guard isLoggable else { return }
        let written = value(amount)
        let named = unit.trimmingCharacters(in: .whitespaces)
        onLog(
            NutritionEntry(
                id: Self.newID(),
                date: Schedule.dateKey(date),
                meal: chosen.rawValue,
                name: name.trimmingCharacters(in: .whitespaces),
                calories: energy,
                protein: value(protein),
                carbs: value(carbs),
                fat: value(fat),
                amount: written > 0 ? written : nil,
                unit: written > 0 && !named.isEmpty ? named : nil,
                loggedAt: Date()
            )
        )
    }

    private static func newID() -> String {
        "food-\(Int(Date().timeIntervalSince1970 * 1000))"
    }
}

/// The four headings as one control (42c, 42d): 44 high on the ground surface,
/// the chosen one raised with the .28 edge. At accessibility sizes the names
/// take a row each rather than being cut to "Avond…".
struct MealSegment: View {
    @Binding var selection: Meal
    @Environment(\.dynamicTypeSize) private var typeSize

    /// The four the day is read in. Pre-workout is stored, and read under
    /// Snacks, but it is not one of the four a reader assigns.
    private var options: [Meal] { MealSection.headings.map(\.0) }

    var body: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: 4))
            : AnyLayout(HStackLayout(spacing: 4))

        return layout {
            ForEach(options) { option in
                let isChosen = option == selection
                Button { selection = option } label: {
                    Text(MealSection.title(of: option))
                        // 42c sets these at 14 — off the type scale, because
                        // four names have to fit across one row.
                        .font(.sl(14, isChosen ? SL.Weight.semibold : SL.Weight.regular))
                        .foregroundStyle(isChosen ? SL.Ink.primary : SL.Ink.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                        // 42 of content inside its own hairline is the 44 the
                        // artboard draws, and the 44 a finger needs.
                        .frame(minHeight: SL.Space.hitMin - 2)
                        .slBorderBox()
                        .background(
                            RoundedRectangle(cornerRadius: 11, style: .continuous)
                                .fill(isChosen ? SL.Surface.raised2 : .clear)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 11, style: .continuous)
                                .strokeBorder(isChosen ? SL.Surface.selection : .clear, lineWidth: SL.Metric.border)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isChosen ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(3)
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg - 2, style: .continuous)
                .fill(SL.Surface.ground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg - 2, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border)
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Meal")
    }
}
