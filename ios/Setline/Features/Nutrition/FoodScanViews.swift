import SwiftUI
import UIKit
import Vision
import VisionKit
import SetlineCore

// MARK: - Barcode

/// Point the camera at a barcode; the product comes back from Open Food Facts
/// with its values per 100 g, the amount starts at the packaging's serving,
/// and one lime button logs it. Where the phone has no scanner (or the
/// barcode will not read), the number can be typed.
struct BarcodeScanSheet: View {
    @Environment(AppState.self) private var app
    let date: Date
    let meal: Meal
    let onLog: (NutritionEntry) -> Void
    let onClose: () -> Void

    private enum Phase: Equatable {
        case scanning
        case looking(String)
        case found(BarcodeProduct)
        case missing(String)
        case failed(String)
    }

    @State private var phase: Phase = .scanning
    @State private var typed = ""
    @State private var grams: Double = 100
    @FocusState private var typing: Bool

    private var canScan: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }

    var body: some View {
        VStack(spacing: SL.Space.s4) {
            ScanTopBar(title: "Scan barcode", subtitle: "Hold the barcode inside the frame", onClose: onClose)

            switch phase {
            case .scanning:
                viewfinder
                manualEntry
                Spacer(minLength: 0)
            case .looking(let code):
                Spacer()
                ScanWorking(text: "Looking up \(code)…")
                Spacer()
            case .found(let product):
                productCard(product)
                Spacer(minLength: 0)
                Button {
                    onLog(entry(product))
                } label: {
                    Text("Add to \(meal.spoken)")
                }
                .buttonStyle(SLPrimaryButtonStyle())
                Button("Scan another") { phase = .scanning }
                    .buttonStyle(SLQuietButtonStyle())
            case .missing(let code):
                Spacer()
                ScanMessage(symbol: "questionmark.square.dashed",
                            title: "Not in Open Food Facts yet",
                            text: "Barcode \(code) isn't in the database. Search the product by name, or enter it yourself.")
                Spacer()
                Button("Scan again") { phase = .scanning }
                    .buttonStyle(SLOutlineButtonStyle())
            case .failed(let message):
                Spacer()
                ScanMessage(symbol: "wifi.exclamationmark", title: "Couldn't look it up", text: message)
                Spacer()
                Button("Try again") { phase = .scanning }
                    .buttonStyle(SLOutlineButtonStyle())
            }
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
        .padding(.bottom, SL.Space.s3)
        .background(SL.Surface.ground.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .animation(.easeOut(duration: SL.Motion.base), value: phase)
    }

    private var viewfinder: some View {
        let shape = RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
        return ZStack {
            if canScan {
                BarcodeScanner { code in look(code) }
            } else {
                SL.Surface.raised
                VStack(spacing: SL.Space.s2) {
                    Image(systemName: "barcode.viewfinder")
                        .font(.system(size: 34))
                        .foregroundStyle(SL.Surface.mute)
                    Text("The camera can't scan here. Type the number below.")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(SL.Space.s5)
            }
            // The frame to aim with.
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .strokeBorder(SL.Signal.action, style: StrokeStyle(lineWidth: 2.5, dash: [18, 10]))
                .frame(height: 120)
                .padding(.horizontal, SL.Space.s6)
                .allowsHitTesting(false)
        }
        .frame(height: 300)
        .clipShape(shape)
        .overlay(shape.strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
    }

    private var manualEntry: some View {
        HStack(spacing: SL.Space.s2) {
            Image(systemName: "number")
                .foregroundStyle(SL.Ink.tertiary)
            TextField("", text: $typed, prompt: Text("Or type the barcode number").foregroundColor(SL.Ink.tertiary))
                .keyboardType(.numberPad)
                .font(.sl(SL.TypeSize.lead, SL.Weight.regular))
                .foregroundStyle(SL.Ink.primary)
                .tint(SL.Signal.action)
                .focused($typing)
            if typed.filter(\.isNumber).count >= 8 {
                Button("Look up") { look(typed.filter(\.isNumber)) }
                    .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                    .foregroundStyle(SL.Signal.action)
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: SL.Space.hitMin + 4)
        .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
    }

    private func look(_ code: String) {
        guard phase == .scanning else { return }
        typing = false
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        phase = .looking(code)
        Task {
            switch await app.lookupBarcode(code) {
            case .found(let product):
                grams = product.servingGrams ?? 100
                SLSound.pop.play()
                phase = .found(product)
            case .notFound:
                phase = .missing(code)
            case .failed(let message):
                phase = .failed(message)
            }
        }
    }

    private func productCard(_ found: BarcodeProduct) -> some View {
        let product = found.product
        let portion = FoodSearch.portion(of: product, grams: grams)
        return VStack(alignment: .leading, spacing: SL.Space.s4) {
            HStack(spacing: SL.Space.s3) {
                SLFoodPhoto(source: .url(product.imageURL)).frame(width: 56, height: 56)
                VStack(alignment: .leading, spacing: 2) {
                    Text(product.name)
                        .slLead(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text([product.brand, "\(app.display.whole(Decimal(product.calories))) kcal per 100 g"]
                        .filter { !$0.isEmpty }.joined(separator: " · "))
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                }
            }
            GramsStepper(grams: $grams, serving: found.servingGrams)
            MacroLine(calories: portion.calories, protein: portion.protein, carbs: portion.carbs, fat: portion.fat)
            Text("Check the packaging; Open Food Facts is maintained by its users.")
                .slMeta()
                .foregroundStyle(SL.Ink.tertiary)
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).fill(SL.Surface.raised))
        .overlay(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).strokeBorder(SL.Surface.hairline, lineWidth: 1))
    }

    private func entry(_ found: BarcodeProduct) -> NutritionEntry {
        let portion = FoodSearch.portion(of: found.product, grams: grams)
        return NutritionEntry(
            id: "food-\(Int(Date().timeIntervalSince1970 * 1000))",
            date: Schedule.dateKey(date), meal: meal.rawValue, name: portion.name,
            calories: portion.calories, protein: portion.protein, carbs: portion.carbs, fat: portion.fat,
            amount: portion.amount, unit: portion.unit, loggedAt: Date()
        )
    }
}

/// VisionKit's live barcode reader, reporting the first code it is sure of.
private struct BarcodeScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce, .code128])],
            qualityLevel: .balanced,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        try? scanner.startScanning()
        return scanner
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}

    static func dismantleUIViewController(_ controller: DataScannerViewController, coordinator: Coordinator) {
        controller.stopScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        private var sent = false
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ scanner: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !sent else { return }
            for item in items {
                if case .barcode(let code) = item, let value = code.payloadStringValue, !value.isEmpty {
                    sent = true
                    onCode(value)
                    return
                }
            }
        }
    }
}

// MARK: - Photo scan

/// A photo of the plate — or a line saying what it was — comes back as the
/// foods on it with an amount each. All of it happens on the phone, for free:
/// Apple's own image recognition names the food, a built-in table gives its
/// values, and a typed amount is used exactly. Nothing is logged until the
/// grams are checked. No conversation, only the answer.
struct FoodPhotoScanSheet: View {
    @Environment(AppState.self) private var app
    let date: Date
    let meal: Meal
    let onLog: ([NutritionEntry]) -> Void
    let onClose: () -> Void

    private enum Phase { case start, reading, results, empty }

    @State private var phase: Phase = .start
    @State private var photo: UIImage?
    @State private var text = ""
    @State private var items: [ScannedFood] = []
    /// Per row, what else it could be — offered under "Other match".
    @State private var alternatives: [UUID: [ScannedFood]] = [:]
    @State private var leftOut: Set<UUID> = []
    @State private var picking: UIImagePickerController.SourceType?
    @FocusState private var typing: Bool

    var body: some View {
        VStack(spacing: SL.Space.s4) {
            ScanTopBar(title: "Scan your meal", subtitle: "A photo, or a line about what you ate", onClose: onClose)

            ScrollView {
                VStack(alignment: .leading, spacing: SL.Space.s4) {
                    photoArea
                    describeField
                    switch phase {
                    case .start:
                        hint
                    case .reading:
                        ScanWorking(text: "Reading your plate…")
                            .frame(maxWidth: .infinity)
                            .padding(.top, SL.Space.s4)
                    case .results:
                        results
                    case .empty:
                        ScanMessage(symbol: "fork.knife", title: "No food recognised",
                                    text: "Try a photo from above in good light, or type it: \"200 g rice, chicken breast\".")
                    }
                }
                .padding(.bottom, SL.Space.s4)
            }
            .scrollDismissesKeyboard(.interactively)

            bottomAction
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
        .padding(.bottom, SL.Space.s3)
        .background(SL.Surface.ground.ignoresSafeArea())
        .preferredColorScheme(.dark)
        #if DEBUG
        .onAppear {
            // `-SetlineScanImage <path>` / `-SetlineScanText "<line>"` read a
            // meal straight away, so the scan can be checked without taps.
            let arguments = ProcessInfo.processInfo.arguments
            if let flag = arguments.firstIndex(of: "-SetlineScanImage"), arguments.indices.contains(flag + 1) {
                photo = UIImage(contentsOfFile: arguments[flag + 1])
            }
            if let flag = arguments.firstIndex(of: "-SetlineScanText"), arguments.indices.contains(flag + 1) {
                text = arguments[flag + 1]
            }
            if photo != nil || !text.isEmpty { scan() }
        }
        #endif
        .sheet(isPresented: Binding(get: { picking != nil }, set: { if !$0 { picking = nil } })) {
            if let source = picking {
                ImagePicker(source: source) { image in
                    picking = nil
                    if let image {
                        photo = image
                        SLSound.shutter()
                        scan()
                    }
                }
                .ignoresSafeArea()
            }
        }
    }

    private var photoArea: some View {
        let shape = RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
        return ZStack {
            if let photo {
                Image(uiImage: photo).resizable().aspectRatio(contentMode: .fill)
            } else {
                SL.Surface.raised
                VStack(spacing: SL.Space.s3) {
                    Image(systemName: "camera.viewfinder")
                        .font(.system(size: 34, weight: .regular))
                        .foregroundStyle(SL.Signal.action)
                    Text("Take it from above, the whole plate in view")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                }
                .padding(.bottom, 48)
            }
        }
        .frame(height: photo == nil ? 220 : 240)
        .frame(maxWidth: .infinity)
        .clipShape(shape)
        .overlay(shape.strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
        .overlay(alignment: .bottom) {
            HStack(spacing: SL.Space.s2) {
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    pill("Camera", symbol: "camera.fill") { picking = .camera }
                }
                pill("Library", symbol: "photo.on.rectangle") { picking = .photoLibrary }
            }
            .padding(SL.Space.s3)
        }
    }

    private func pill(_ title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                .foregroundStyle(SL.Ink.primary)
                .padding(.horizontal, SL.Space.s4)
                .frame(minHeight: 40)
                .background(Capsule().fill(SL.Surface.ground.opacity(0.85)))
                .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
        }
        .buttonStyle(SLPressStyle(scale: 0.94))
    }

    private var describeField: some View {
        HStack(spacing: SL.Space.s2) {
            Image(systemName: "text.cursor")
                .foregroundStyle(SL.Ink.tertiary)
            TextField("", text: $text, prompt: Text("Or describe it: 200 g rice, chicken breast").foregroundColor(SL.Ink.tertiary), axis: .vertical)
                .lineLimit(1...3)
                .font(.sl(SL.TypeSize.body, SL.Weight.regular))
                .foregroundStyle(SL.Ink.primary)
                .tint(SL.Signal.action)
                .focused($typing)
                .submitLabel(.done)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
    }

    private var hint: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            hintLine("scalemass", "A photo shows what is on the plate, not how much: every food starts at a usual portion. Type the grams for exact numbers.")
            hintLine("checkmark.circle", "Leave out what isn't right, change the grams, then add.")
            hintLine("lock", "Recognised on this phone. The photo never leaves it, and it's free.")
        }
        .padding(SL.Space.s4)
        .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised))
    }

    private func hintLine(_ symbol: String, _ line: String) -> some View {
        HStack(alignment: .top, spacing: SL.Space.s3) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(SL.Signal.recovery)
                .frame(width: 18)
            Text(line)
                .slMeta()
                .foregroundStyle(SL.Ink.meta)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var results: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text("ON YOUR PLATE")
                .font(.sl(SL.TypeSize.micro, SL.Weight.bold))
                .tracking(1)
                .foregroundStyle(SL.Ink.secondary)
            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    resultRow(index: index, item: item)
                        .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                }
            }
            .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised))
            let chosen = items.filter { !leftOut.contains($0.id) }
            MacroLine(calories: chosen.reduce(0) { $0 + $1.calories },
                      protein: chosen.reduce(0) { $0 + $1.protein },
                      carbs: chosen.reduce(0) { $0 + $1.carbs },
                      fat: chosen.reduce(0) { $0 + $1.fat })
                .padding(.top, SL.Space.s2)
            Text("Usual portions and standard values. Weighing beats guessing.")
                .slMeta()
                .foregroundStyle(SL.Ink.tertiary)
        }
    }

    private func resultRow(index: Int, item: ScannedFood) -> some View {
        let included = !leftOut.contains(item.id)
        return VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack(spacing: SL.Space.s3) {
                Button {
                    if included { leftOut.insert(item.id) } else { leftOut.remove(item.id) }
                } label: {
                    Image(systemName: included ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 22))
                        .foregroundStyle(included ? SL.Signal.action : SL.Surface.mute)
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(included ? "Leave out \(item.name)" : "Include \(item.name)")
                VStack(alignment: .leading, spacing: 1) {
                    Text(item.name)
                        .slBody(SL.Weight.semibold)
                        .foregroundStyle(included ? SL.Ink.primary : SL.Ink.tertiary)
                    Text("\(app.display.whole(Decimal(item.calories))) kcal · \(app.display.whole(Decimal(item.protein))) g protein")
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
                Spacer(minLength: SL.Space.s2)
                confidence(item.confidence)
            }
            if included, let others = alternatives[item.id], !others.isEmpty {
                Menu {
                    ForEach(others) { other in
                        Button("\(other.name) · \(app.display.whole(Decimal(other.scaled(to: item.grams).calories))) kcal") {
                            let swapped = other.scaled(to: item.grams)
                            let replaced = ScannedFood(name: swapped.name, grams: swapped.grams, calories: swapped.calories,
                                                       protein: swapped.protein, carbs: swapped.carbs, fat: swapped.fat,
                                                       confidence: .high)
                            alternatives[replaced.id] = others.filter { $0.id != other.id } + [item]
                            items[index] = replaced
                        }
                    }
                } label: {
                    Label("Other match", systemImage: "arrow.triangle.2.circlepath")
                        .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.horizontal, SL.Space.s3)
                        .frame(minHeight: 32)
                        .background(Capsule().fill(SL.Surface.raised2))
                }
                .padding(.leading, 44)
            }
            if included {
                GramsStepper(grams: Binding(
                    get: { items[index].grams },
                    set: { items[index] = items[index].scaled(to: $0) }
                ), serving: nil, compact: true)
                .padding(.leading, 44)
            }
        }
        .padding(SL.Space.s3)
    }

    private func confidence(_ level: ScannedFood.Confidence) -> some View {
        let (text, ink): (String, Color) = switch level {
        case .high: ("Sure", SL.Signal.recovery)
        case .medium: ("Likely", SL.Ink.secondary)
        case .low: ("Guess", SL.Signal.attention)
        }
        return Text(text)
            .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
            .foregroundStyle(ink)
            .padding(.horizontal, SL.Space.s2)
            .padding(.vertical, 3)
            .background(Capsule().fill(ink.opacity(0.14)))
    }

    @ViewBuilder
    private var bottomAction: some View {
        let chosen = items.filter { !leftOut.contains($0.id) }
        if case .results = phase, !chosen.isEmpty {
            Button {
                let stamp = Int(Date().timeIntervalSince1970 * 1000)
                onLog(chosen.enumerated().map { offset, item in
                    item.entry(id: "food-\(stamp + offset)", on: date, meal: meal)
                })
            } label: {
                Text(chosen.count == 1 ? "Add to \(meal.spoken)" : "Add \(chosen.count) items to \(meal.spoken)")
            }
            .buttonStyle(SLPrimaryButtonStyle())
        } else {
            Button { scan() } label: {
                Label("Read it", systemImage: "sparkle.magnifyingglass")
            }
            .buttonStyle(SLPrimaryButtonStyle())
            .disabled(photo == nil && text.trimmingCharacters(in: .whitespaces).count < 3)
        }
    }

    private func scan() {
        typing = false
        phase = .reading
        leftOut = []
        let image = photo
        let line = text.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            var found: [ScannedFood] = []
            var others: [UUID: [ScannedFood]] = [:]
            // What was typed comes first: it says exactly what and how much.
            for part in MealRecognition.parts(of: line) {
                let tableOthers = MealRecognition.candidates(part.words).map { food in
                    food.scanned(grams: part.grams, confidence: .medium)
                }
                let searchedOthers = await searched(part)
                // A table dish that is only part of what was typed ("pizza" in
                // "dr oetker pizza bolognese") gives way to the product.
                let tableFits = MealRecognition.match(part.words).map { MealRecognition.coverage(part.words, by: $0) >= 0.6 } ?? false
                if let food = MealRecognition.scanned(part), tableFits || searchedOthers.isEmpty {
                    found.append(food)
                    others[food.id] = (tableOthers + searchedOthers).filter { $0.name != food.name }
                } else if let product = searchedOthers.first {
                    // Without a typed amount, the dish's usual portion (a
                    // pizza is 250 g, not 100).
                    let usual = part.grams ?? MealRecognition.match(part.words)?.grams ?? product.grams
                    let sized = product.scaled(to: usual)
                    let pick = ScannedFood(name: sized.name, grams: sized.grams, calories: sized.calories,
                                           protein: sized.protein, carbs: sized.carbs, fat: sized.fat, confidence: .medium)
                    found.append(pick)
                    others[pick.id] = Array(searchedOthers.dropFirst()) + (MealRecognition.scanned(part).map { [$0] } ?? []) + tableOthers
                } else if let first = (tableOthers + searchedOthers).first {
                    let rest = Array((tableOthers + searchedOthers).dropFirst())
                    let pick = ScannedFood(name: first.name, grams: first.grams, calories: first.calories,
                                           protein: first.protein, carbs: first.carbs, fat: first.fat,
                                           confidence: tableOthers.isEmpty ? .low : .medium)
                    found.append(pick)
                    others[pick.id] = rest
                }
            }
            if let image {
                let labels = await MealScanner.labels(in: image)
                let seen = MealRecognition.fromLabels(labels, limit: 8)
                let shown = Array(seen.prefix(4)).filter { item in !found.contains { $0.name == item.name } }
                for item in shown {
                    others[item.id] = seen.filter { $0.name != item.name && !shown.contains($0) }
                }
                found += shown
            }
            items = found
            alternatives = others
            if found.isEmpty {
                phase = .empty
            } else {
                SLSound.pop.play()
                phase = .results
            }
        }
    }

    /// What the search finds for a typed food, the names closest to what
    /// was typed first, at the typed amount or 100 g. Weak matches are left
    /// out: a wrong product is worse than none.
    private func searched(_ part: MealRecognition.Part) async -> [ScannedFood] {
        let products: [FoodProduct]
        switch await app.searchFood(part.words) {
        case .found(let found), .partial(let found, _): products = found
        case .failed: return []
        }
        let grams = part.grams ?? 100
        return products
            .map { ($0, MealRecognition.similarity(part.words, to: $0.name, brand: $0.brand)) }
            .filter { $0.1 >= 0.5 }
            .sorted { $0.1 > $1.1 }
            .prefix(4)
            .map { product, score in
                let portion = FoodSearch.portion(of: product, grams: grams)
                let label = product.brand.isEmpty || product.brand == "Generiek" ? product.name : "\(product.name) · \(product.brand)"
                return ScannedFood(name: label, grams: grams, calories: portion.calories,
                                   protein: portion.protein, carbs: portion.carbs, fat: portion.fat,
                                   confidence: score >= 0.9 ? .medium : .low)
            }
    }
}

/// Apple's on-device image recognition, asked what is in a photo. Free, and
/// nothing leaves the phone.
enum MealScanner {
    static func labels(in image: UIImage) async -> [(label: String, confidence: Float)] {
        guard let cgImage = image.cgImage else { return [] }
        let orientation = CGImagePropertyOrientation(image.imageOrientation)
        return await Task.detached(priority: .userInitiated) {
            let request = VNClassifyImageRequest()
            let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation)
            try? handler.perform([request])
            return (request.results ?? []).map { ($0.identifier, $0.confidence) }
        }.value
    }
}

private extension CGImagePropertyOrientation {
    init(_ orientation: UIImage.Orientation) {
        switch orientation {
        case .up: self = .up
        case .down: self = .down
        case .left: self = .left
        case .right: self = .right
        case .upMirrored: self = .upMirrored
        case .downMirrored: self = .downMirrored
        case .leftMirrored: self = .leftMirrored
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}

private struct ImagePicker: UIViewControllerRepresentable {
    let source: UIImagePickerController.SourceType
    let onPick: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(source) ? source : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onPick: (UIImage?) -> Void
        init(onPick: @escaping (UIImage?) -> Void) { self.onPick = onPick }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onPick(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onPick(nil) }
    }
}

// MARK: - Shared pieces

private struct ScanTopBar: View {
    let title: String
    let subtitle: String
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: SL.Space.s3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).slTitle().foregroundStyle(SL.Ink.primary).accessibilityAddTraits(.isHeader)
                Text(subtitle).slMeta().foregroundStyle(SL.Ink.secondary)
            }
            Spacer(minLength: 0)
            Button(action: onClose) {
                SLGlyph(name: .close, size: 16, fixed: true)
                    .foregroundStyle(SL.Ink.primary)
                    .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                    .background(Circle().fill(SL.Surface.raised2))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
        }
    }
}

private struct ScanWorking: View {
    let text: String
    @State private var turning = false

    var body: some View {
        VStack(spacing: SL.Space.s3) {
            Circle()
                .trim(from: 0, to: 0.7)
                .stroke(SL.Signal.action, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .frame(width: 32, height: 32)
                .rotationEffect(.degrees(turning ? 360 : 0))
                .animation(.linear(duration: 0.9).repeatForever(autoreverses: false), value: turning)
                .onAppear { turning = true }
            Text(text).slBody().foregroundStyle(SL.Ink.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct ScanMessage: View {
    let symbol: String
    let title: String
    let text: String

    var body: some View {
        VStack(spacing: SL.Space.s2) {
            Image(systemName: symbol)
                .font(.system(size: 28))
                .foregroundStyle(SL.Surface.mute)
            Text(title).slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
            Text(text)
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(SL.Space.s5)
    }
}

/// Grams, changed in steps of 10 (or set to the serving), the way a lifter
/// thinks about a portion.
struct GramsStepper: View {
    @Binding var grams: Double
    let serving: Double?
    var compact = false

    var body: some View {
        HStack(spacing: SL.Space.s2) {
            stepButton("minus") { grams = max(5, grams - 10) }
            Text("\(Int(grams.rounded())) g")
                .font(.sl(compact ? SL.TypeSize.body : SL.TypeSize.title, SL.Weight.semibold))
                .monospacedDigit()
                .foregroundStyle(SL.Ink.primary)
                .frame(minWidth: compact ? 64 : 88)
                .contentTransition(.numericText(value: grams))
            stepButton("plus") { grams += 10 }
            Spacer(minLength: 0)
            if let serving, serving > 0, serving != grams {
                Button("1 serving · \(Int(serving)) g") { grams = serving }
                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.horizontal, SL.Space.s3)
                    .frame(minHeight: 34)
                    .background(Capsule().fill(SL.Surface.raised2))
            }
        }
        .animation(.snappy, value: grams)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Amount")
        .accessibilityValue("\(Int(grams.rounded())) grams")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: grams += 10
            case .decrement: grams = max(5, grams - 10)
            @unknown default: break
            }
        }
    }

    private func stepButton(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(SL.Ink.primary)
                .frame(width: compact ? 34 : 40, height: compact ? 34 : 40)
                .background(Circle().fill(SL.Surface.raised2))
        }
        .buttonStyle(SLPressStyle(scale: 0.9))
    }
}

/// "248 kcal · P 46 · C 0 · F 5" as one quiet line of numbers.
struct MacroLine: View {
    @Environment(AppState.self) private var app
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double

    var body: some View {
        HStack(spacing: SL.Space.s4) {
            figure(app.display.whole(Decimal(calories)), "kcal", strong: true)
            figure(app.display.whole(Decimal(protein)), "protein")
            figure(app.display.whole(Decimal(carbs)), "carbs")
            figure(app.display.whole(Decimal(fat)), "fat")
        }
        .accessibilityElement(children: .combine)
    }

    private func figure(_ value: String, _ label: String, strong: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value)
                .font(.sl(strong ? SL.TypeSize.title : SL.TypeSize.lead, SL.Weight.semibold))
                .monospacedDigit()
                .foregroundStyle(SL.Ink.primary)
            Text(label == "kcal" ? label : "g \(label)")
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
        }
    }
}
