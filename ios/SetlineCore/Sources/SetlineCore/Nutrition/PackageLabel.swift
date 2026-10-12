import Foundation

/// Reading a package rather than a plate: the words Apple's on-device text
/// recognition finds on a tub, a bar or a screenshot of one. A plate is
/// recognised by what it looks like; a package says what it is in print —
/// "100% WHEY" in big letters, and a nutrition table in small ones.
///
/// Free, and nothing leaves the phone: this only reads the text the phone
/// has already found.
public enum PackageLabel {
    /// One piece of text and where it sits, in Vision's normalised
    /// coordinates (0…1, origin bottom-left).
    public struct Observation: Equatable, Sendable {
        public let text: String
        public let x: Double
        public let y: Double
        public let width: Double
        public let height: Double

        public init(text: String, x: Double, y: Double, width: Double, height: Double) {
            self.text = text
            self.x = x
            self.y = y
            self.width = width
            self.height = height
        }

        var midY: Double { y + height / 2 }
    }

    /// What a nutrition table says, per 100 g, and the serving it names.
    public struct Nutrition: Equatable, Sendable {
        public let kcal: Double
        public let protein: Double
        public let carbs: Double
        public let fat: Double
        /// "Serving size 1 scoop (30 g)", "per 30 g".
        public let servingGrams: Double?

        public func scanned(name: String, grams: Double, confidence: ScannedFood.Confidence = .high) -> ScannedFood {
            let factor = grams / 100
            return ScannedFood(
                name: name, grams: grams,
                calories: (kcal * factor).rounded(),
                protein: (protein * factor * 10).rounded() / 10,
                carbs: (carbs * factor * 10).rounded() / 10,
                fat: (fat * factor * 10).rounded() / 10,
                confidence: confidence
            )
        }
    }

    /// Everything one photo's text says about the product.
    public struct Reading: Equatable, Sendable {
        public let nutrition: Nutrition?
        /// The biggest print, as it reads: "Gold Standard 100% Whey".
        public let title: String
        /// The table food the big print names, flavours left out.
        public let tableFood: MealRecognition.Food?
        /// Every line of the front print, small brand lines included — what a
        /// product's name and brand are checked against.
        public var printed: String = ""

        public var isEmpty: Bool { nutrition == nil && title.isEmpty && tableFood == nil }
    }

    public static func read(_ observations: [Observation]) -> Reading {
        let rows = rows(from: observations)
        let title = title(of: observations)
        return Reading(nutrition: nutrition(in: rows), title: title, tableFood: tableFood(in: title),
                       printed: Self.title(of: observations, share: 0.2, limit: 10))
    }

    // MARK: - Rows

    /// Text that sits on one line of the package, left to right. Vision often
    /// returns "Protein" and "78 g" as two pieces when the table's columns are
    /// far apart; a nutrient and its number belong on one row.
    public static func rows(from observations: [Observation]) -> [String] {
        let sorted = observations
            .filter { !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }
            .sorted { $0.midY > $1.midY }
        var rows: [[Observation]] = []
        for observation in sorted {
            if let last = rows.indices.last,
               let anchor = rows[last].first,
               abs(anchor.midY - observation.midY) < min(anchor.height, observation.height) * 0.6 {
                rows[last].append(observation)
            } else {
                rows.append([observation])
            }
        }
        return rows.map { row in
            row.sorted { $0.x < $1.x }.map(\.text).joined(separator: " ")
        }
    }

    // MARK: - Nutrition table

    private static let proteinWords = #"(?:protein|proteins|proteine|proteines|eiwit|eiwitten|eiweiss|proteinas)"#
    private static let carbWords = #"(?:carbohydrate|carbohydrates|carbs|koolhydraten|koolhydraat|glucides|kohlenhydrate|hidratos)"#
    private static let fatWords = #"(?:fat|fats|total fat|vet|vetten|fett|lipides|matieres grasses|graisses|grasas)"#
    /// Saturated fat and sugars sit right under fat and carbohydrate and must
    /// never be read as them.
    private static let subRowWords = ["saturat", "verzadig", "gesattigt", "satur", "sugar", "suiker", "zucker", "sucre", "waarvan", "of which", "dont", "davon"]

    /// Reads the table from rows of text. The first number after a nutrient
    /// is its first column, which on European packaging is per 100 g; a
    /// label that only gives a serving is converted to 100 g.
    public static func nutrition(in rows: [String]) -> Nutrition? {
        let lines = rows.map(normalised)
        let all = lines.joined(separator: " \n ")

        let serving = servingGrams(in: lines)
        let mentionsHundred = all.range(of: #"(?:per|pour|pro|/)\s*100\s*(?:g|gr|ml)\b|100\s*(?:g|gr|ml)\b"#, options: .regularExpression) != nil

        var kcal = firstNumber(in: all, pattern: #"(\d+(?:\.\d+)?)\s*kcal"#)
            ?? firstNumber(in: all, pattern: #"kcal\D{0,6}(\d+(?:\.\d+)?)"#)
        if kcal == nil, let kj = firstNumber(in: all, pattern: #"(\d+(?:\.\d+)?)\s*kj"#) {
            kcal = kj / 4.184
        }

        let protein = value(of: proteinWords, in: lines)
        let carbs = value(of: carbWords, in: lines)
        let fat = value(of: fatWords, in: lines)
        let macros = [protein, carbs, fat].compactMap { $0 }
        guard macros.count >= 2 || (kcal != nil && !macros.isEmpty) else { return nil }

        var p = protein ?? 0, c = carbs ?? 0, f = fat ?? 0
        var energy = kcal ?? (p * 4 + c * 4 + f * 9)
        // A label that only speaks per serving: bring it to 100 g.
        if !mentionsHundred, let serving, serving > 0, serving != 100 {
            let factor = 100 / serving
            p *= factor; c *= factor; f *= factor; energy *= factor
        }
        guard energy > 0, energy <= 950, p <= 100, c <= 100, f <= 100, p + c + f <= 110 else { return nil }
        return Nutrition(
            kcal: energy.rounded(),
            protein: (p * 10).rounded() / 10,
            carbs: (c * 10).rounded() / 10,
            fat: (f * 10).rounded() / 10,
            servingGrams: serving
        )
    }

    /// The grams after a nutrient on its own row: "Protein 78 g 23.4 g" → 78.
    /// A number before the word ("24g protein per scoop") is marketing, not
    /// the table, and is not read.
    private static func value(of words: String, in lines: [String]) -> Double? {
        for line in lines where !subRowWords.contains(where: line.contains) {
            if let number = firstNumber(in: line, pattern: #"\b\#(words)\b[^0-9]{0,24}?(\d+(?:\.\d+)?)\s*(?:g|gr|gram)?\b"#) {
                return number
            }
        }
        return nil
    }

    /// "Serving size 1 scoop (30 g)", "portie 30 g", "per 30 g", "30 g = 1 schep".
    static func servingGrams(in lines: [String]) -> Double? {
        let patterns = [
            #"(?:serving|portion|portie|schep|scoop|dosis|dose|portion)[^0-9]{0,24}(?:\d+\s*(?:scoop|schep|serving)s?\s*)?\(?\s*(\d+(?:\.\d+)?)\s*(?:g|gr|gram)\b"#,
            #"(\d+(?:\.\d+)?)\s*(?:g|gr|gram)\s*(?:=|\()?\s*(?:1\s*)?(?:scoop|schep|serving|portie|portion)"#,
            #"(?:per|pour|pro)\s*(\d+(?:\.\d+)?)\s*(?:g|gr)\b"#,
        ]
        for pattern in patterns {
            for line in lines {
                // "per 100 g per 30 g": the serving is the one that isn't 100.
                if let grams = numbers(in: line, pattern: pattern).first(where: { $0 > 0 && $0 != 100 && $0 <= 500 }) {
                    return grams
                }
            }
        }
        return nil
    }

    // MARK: - What it is

    /// Words on a package that say how it tastes, not what it is: "chocolate"
    /// on a tub of whey is not a bar of chocolate.
    private static let flavourWords: Set<String> = [
        "chocolate", "choco", "chocolade", "vanilla", "vanille", "strawberry", "aardbei", "banana", "banaan",
        "cookies", "cookie", "cream", "caramel", "salted", "peanut", "coconut", "mango", "lemon", "citroen",
        "cherry", "raspberry", "blueberry", "berry", "mint", "coffee", "mocha", "milk", "double", "rich",
        "flavour", "flavor", "smaak", "gout", "white", "hazelnut", "apple", "orange", "fruit",
    ]

    /// The table food the big print names. Flavour words are dropped first,
    /// so "Whey Protein Double Rich Chocolate" is whey, not chocolate — unless
    /// a flavour is all there is ("Banana").
    public static func tableFood(in title: String) -> MealRecognition.Food? {
        guard !title.isEmpty else { return nil }
        let words = normalised(title).split(separator: " ").map(String.init)
        let kept = words.filter { !flavourWords.contains($0) }.joined(separator: " ")
        if !kept.isEmpty, let food = MealRecognition.match(kept) { return food }
        return MealRecognition.match(words.joined(separator: " "))
    }

    /// The biggest print on the package, top to bottom: the brand and the
    /// product name. Numbers, nutrient rows and small print are left out.
    public static func title(of observations: [Observation], share: Double = 0.45, limit: Int = 4) -> String {
        let candidates = observations.filter { observation in
            let text = normalised(observation.text)
            let letters = text.filter(\.isLetter).count
            guard letters >= 3, letters >= text.filter(\.isNumber).count else { return false }
            // "Protein 78 g" is a table row; "WHEY PROTEIN" is the name.
            let nutrient = [proteinWords, carbWords, fatWords, "kcal", "kj", "energ"].contains {
                text.range(of: $0, options: .regularExpression) != nil
            }
            return !(nutrient && text.contains(where: \.isNumber))
        }
        guard let tallest = candidates.map(\.height).max(), tallest > 0 else { return "" }
        let big = candidates
            .filter { $0.height >= tallest * share }
            .sorted { $0.midY > $1.midY }
            .prefix(limit)
            .map { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) }
        return big.joined(separator: " ")
    }

    /// Search results for the big print, the product on the package first.
    ///
    /// The print on a tub says much more than a product's name does ("XXL
    /// Nutrition · Delicious Whey · Chocolate · 1 kg · 33 servings"), so a
    /// product is judged by how much of *its* name and brand the package
    /// shows, not the other way round — and a brand printed on the package
    /// counts most. A generic food is never the package.
    public static func products(_ products: [FoodProduct], matching title: String) -> [FoodProduct] {
        let printed = Set(words(title))
        guard !printed.isEmpty else { return [] }
        let unknown: Set<String> = ["merk", "onbekend", "generiek"]
        return products
            .compactMap { product -> (FoodProduct, Double)? in
                let brand = words(product.brand).filter { !unknown.contains($0) }
                guard !brand.isEmpty || !product.brand.lowercased().contains("generiek") else { return nil }
                let name = words(product.name)
                let own = Set(name + brand)
                guard !own.isEmpty else { return nil }
                let shown = Double(own.filter(printed.contains).count) / Double(own.count)
                // A brand on the package, or in the product's name when the
                // database left the brand empty ("Whey protein - Xxl Nutrition").
                let brandShown = !brand.isEmpty && brand.allSatisfy(printed.contains)
                let nameHasPrintedBrand = brand.isEmpty && name.count >= 2
                    && zip(name, name.dropFirst()).contains { printed.contains($0.0) && printed.contains($0.1) }
                let score = shown + (brandShown ? 0.5 : 0) + (nameHasPrintedBrand ? 0.25 : 0)
                return score >= 0.6 ? (product, score) : nil
            }
            .sorted { $0.1 > $1.1 }
            .map(\.0)
    }

    private static let filler: Set<String> = ["the", "and", "with", "met", "en", "de", "het", "van", "of", "-", "·"]

    private static func words(_ text: String) -> [String] {
        normalised(text)
            .split(whereSeparator: { !$0.isLetter && !$0.isNumber })
            .map(String.init)
            .filter { $0.count >= 2 && !filler.contains($0) }
    }

    /// "Whey protein · Gold Standard" style name for a product read from its
    /// label: the big print, in sentence case.
    public static func displayName(_ title: String) -> String {
        let cleaned = title
            .split(whereSeparator: \.isWhitespace)
            .prefix(6)
            .joined(separator: " ")
        guard let first = cleaned.first else { return "Product from the label" }
        return first.uppercased() + cleaned.dropFirst().lowercased()
    }

    // MARK: - Text

    static func normalised(_ text: String) -> String {
        text.lowercased()
            .folding(options: .diacriticInsensitive, locale: nil)
            .replacingOccurrences(of: #"(\d),(\d)"#, with: "$1.$2", options: .regularExpression)
            // OCR reads a "0" in "0 g" as the letter o.
            .replacingOccurrences(of: #"\bo\s*g\b"#, with: "0 g", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    private static func numbers(in text: String, pattern: String) -> [Double] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
        return regex.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { match in
            guard match.numberOfRanges > 1, let range = Range(match.range(at: 1), in: text) else { return nil }
            return Double(text[range])
        }
    }

    private static func firstNumber(in text: String, pattern: String) -> Double? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              match.numberOfRanges > 1,
              let range = Range(match.range(at: 1), in: text)
        else { return nil }
        return Double(text[range])
    }
}
