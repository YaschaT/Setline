import SwiftUI
import SetlineCore

/// Recipes on Nutrition: a tab for each meal, opening on the one the clock
/// suggests, and a row of cards in the quick adds' language — the protein as
/// the number, the main ingredient as a small round photo.
struct RecipesSection: View {
    let display: NumberDisplay
    let initial: Meal
    let onOpen: (Recipe) -> Void

    @State private var meal: Meal?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let meals: [Meal] = [.ontbijt, .lunch, .avondeten, .snack]

    private var shown: Meal { meal ?? (initial == .preWorkout ? .snack : initial) }

    var body: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            SLSectionHead(title: "Recipes", meta: "high protein")

            // A segmented row, Training's week marks in words: the meal shown
            // is the one on a raised pill.
            HStack(spacing: 0) {
                ForEach(Self.meals) { item in
                    let on = item == shown
                    Button {
                        withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85)) { meal = item }
                    } label: {
                        Text(item == .snack ? "Snacks" : item.label)
                            .slMeta(on ? SL.Weight.semibold : SL.Weight.regular)
                            .foregroundStyle(on ? SL.Ink.primary : SL.Ink.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .frame(maxWidth: .infinity, minHeight: 36)
                            .background {
                                if on {
                                    Capsule().fill(SL.Surface.hairlineStrong)
                                        .matchedGeometryEffect(id: "pill", in: pill)
                                }
                            }
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
                }
            }
            .padding(4)
            .background(Capsule().fill(SL.Surface.raised))
            .overlay(Capsule().strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border))
            .frame(minHeight: SL.Space.hitMin)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SL.Space.s3) {
                    ForEach(Recipes.for(shown)) { recipe in
                        RecipeCard(recipe: recipe, display: display) { onOpen(recipe) }
                            .transition(.opacity.combined(with: .move(edge: .trailing)))
                    }
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.85), value: shown)
            }
            .padding(.horizontal, -SL.Space.gutterSession)
        }
    }

    @Namespace private var pill
}

/// One recipe as a card.
struct RecipeCard: View {
    let recipe: Recipe
    let display: NumberDisplay
    let onOpen: () -> Void

    var body: some View {
        let m = recipe.macros
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: SL.Space.s3) {
                HStack(alignment: .top) {
                    RecipePhoto(name: recipe.imageName, size: 48)
                    Spacer(minLength: 0)
                    HStack(spacing: 4) {
                        SLGlyph(name: .clock, size: 12, fixed: true)
                        Text("\(recipe.minutes) min").font(.slFixed(12, SL.Weight.medium))
                    }
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.horizontal, 8)
                    .frame(height: 24)
                    .background(Capsule().fill(SL.Surface.raised2))
                }
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(display.whole(Decimal(m.protein)))
                        .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                        .foregroundStyle(SL.Ink.primary)
                    Text("g protein").slMeta().foregroundStyle(SL.Ink.secondary)
                }
                .monospacedDigit()
                VStack(alignment: .leading, spacing: 2) {
                    Text(recipe.name)
                        .slBody(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(display.kcal(Decimal(m.calories))) · \(recipe.ingredients.count) ingredients")
                        .slMeta()
                        .monospacedDigit()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(SL.Space.s4)
            .frame(width: 196, height: 178, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).fill(SL.Surface.raised))
            .overlay(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border))
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(recipe.name), \(recipe.minutes) minutes, \(display.whole(Decimal(m.protein))) grams of protein, \(display.kcal(Decimal(m.calories)))")
        .accessibilityHint("Opens the recipe")
    }
}

/// The main ingredient's photo, graded down to sit on the dark ground.
struct RecipePhoto: View {
    let name: String
    let size: CGFloat

    var body: some View {
        SLFoodPhoto(source: .asset(name), cornerRadius: size / 2)
            .saturation(0.7)
            .overlay(Circle().fill(SL.Surface.ground.opacity(0.32)))
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay(Circle().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1.5))
            .accessibilityHidden(true)
    }
}

/// A recipe, opened: what it gives, what goes in — ticked off while you
/// shop or cook — how to make it, and one action, logging it.
struct RecipeSheet: View {
    let recipe: Recipe
    let display: NumberDisplay
    let onLog: (Meal) -> Void
    let onClose: () -> Void

    @State private var ticked: Set<Int> = []
    @State private var meal: Meal
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(recipe: Recipe, display: NumberDisplay, onLog: @escaping (Meal) -> Void, onClose: @escaping () -> Void) {
        self.recipe = recipe
        self.display = display
        self.onLog = onLog
        self.onClose = onClose
        _meal = State(initialValue: recipe.meal)
    }

    var body: some View {
        let m = recipe.macros
        ScrollView {
            VStack(alignment: .leading, spacing: SL.Space.s6) {
                HStack {
                    Spacer()
                    Button("Done", action: onClose)
                        .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                        .foregroundStyle(SL.Ink.secondary)
                        .slHitTarget()
                }

                // The head: the photo, which meal, the name, the time.
                HStack(alignment: .center, spacing: SL.Space.s4) {
                    RecipePhoto(name: recipe.imageName, size: 72)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(recipe.meal == .snack ? "SNACK" : recipe.meal.label.uppercased())
                            .font(.sl(SL.TypeSize.micro, SL.Weight.bold))
                            .tracking(1)
                            .foregroundStyle(SL.Ink.secondary)
                        Text(recipe.name)
                            .font(.sl(SL.TypeSize.title, SL.Weight.bold))
                            .foregroundStyle(SL.Ink.primary)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("\(recipe.minutes) min · 1 serving")
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                    }
                }

                Text(recipe.summary)
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, -SL.Space.s3)

                // What one serving gives, as Training's stat row.
                HStack(alignment: .top, spacing: 0) {
                    stat(display.whole(Decimal(m.protein)), "g protein", first: true)
                    stat(display.whole(Decimal(m.calories)), "kcal")
                    stat(display.whole(Decimal(m.carbs)), "g carbs")
                    stat(display.whole(Decimal(m.fat)), "g fat")
                }
                .padding(SL.Space.s4)
                .background(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).fill(SL.Surface.raised))
                .overlay(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border))

                VStack(alignment: .leading, spacing: SL.Space.s2) {
                    SLSectionHead(title: "Ingredients", meta: ticked.isEmpty ? "tap to tick off" : "\(ticked.count) of \(recipe.ingredients.count)")
                    VStack(spacing: 0) {
                        ForEach(Array(recipe.ingredients.enumerated()), id: \.offset) { index, item in
                            ingredientRow(item, index: index)
                                .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                        }
                    }
                    .padding(.horizontal, SL.Space.s4)
                    .background(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).fill(SL.Surface.raised))
                    .overlay(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border))
                }

                VStack(alignment: .leading, spacing: SL.Space.s3) {
                    SLSectionHead(title: "Method", meta: "\(recipe.steps.count) steps")
                    ForEach(Array(recipe.steps.enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                            Text("\(index + 1)")
                                .font(.slFixed(13, SL.Weight.bold))
                                .foregroundStyle(SL.Ink.primary)
                                .frame(width: 26, height: 26)
                                .background(Circle().fill(SL.Surface.raised2))
                                .overlay(Circle().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
                                .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 5 }
                            Text(step)
                                .slBody()
                                .foregroundStyle(SL.Ink.primary)
                                .lineSpacing(3)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, SL.Space.s1)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Step \(index + 1). \(step)")
                    }
                }

                Text("Values worked out per ingredient from USDA FoodData Central.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.bottom, SL.Space.s6)
        }
        .background(SL.Surface.ground.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: SL.Space.s2) {
                Menu {
                    ForEach([Meal.ontbijt, .lunch, .avondeten, .snack]) { item in
                        Button(item == .snack ? "Snacks" : item.label) { meal = item }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text("Log to \(meal == .snack ? "snacks" : meal.spoken)")
                        SLGlyph(name: .chevronDown, size: 12)
                    }
                    .font(.sl(SL.TypeSize.meta, SL.Weight.medium))
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(minHeight: 32)
                }
                Button { onLog(meal) } label: {
                    HStack(spacing: 10) {
                        SLGlyph(name: .plus, size: 16)
                        Text("Log this · \(display.whole(Decimal(m.protein))) g protein")
                    }
                }
                .buttonStyle(SLPrimaryButtonStyle())
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s2)
            .padding(.bottom, SL.Space.s3)
            .background(SL.Surface.ground.ignoresSafeArea(edges: .bottom))
        }
        .slRespondsToTextSize()
    }

    private func stat(_ value: String, _ label: String, first: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                .monospacedDigit()
                .foregroundStyle(SL.Ink.primary)
            Text(label).slMeta().foregroundStyle(SL.Ink.secondary).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func ingredientRow(_ item: Recipe.Ingredient, index: Int) -> some View {
        let on = ticked.contains(index)
        return Button {
            withAnimation(reduceMotion ? nil : .spring(response: 0.25, dampingFraction: 0.7)) {
                if on { ticked.remove(index) } else { ticked.insert(index) }
            }
        } label: {
            HStack(spacing: SL.Space.s3) {
                ZStack {
                    Circle().strokeBorder(on ? Color.clear : SL.Surface.mute, lineWidth: 1.5)
                    if on {
                        Circle().fill(SL.Signal.action)
                        SLGlyph(name: .check, size: 12, fixed: true).foregroundStyle(SL.Signal.onAction)
                    }
                }
                .frame(width: 24, height: 24)
                Text(item.name)
                    .slBody()
                    .foregroundStyle(on ? SL.Ink.secondary : SL.Ink.primary)
                    .strikethrough(on, color: SL.Ink.tertiary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(item.amount)
                    .slMeta()
                    .monospacedDigit()
                    .foregroundStyle(SL.Ink.secondary)
            }
            .frame(minHeight: 50)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: on)
        .accessibilityLabel("\(item.name), \(item.amount)")
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
