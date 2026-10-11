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
    /// Per row, the answers tapped to its questions.
    @State private var answered: [UUID: Set<String>] = [:]
    /// Per row, the rows its answers added, by answer.
    @State private var added: [UUID: [String: UUID]] = [:]
    /// Tally's jumps, and the last thing Tally reacted to.
    @State private var tallyJumps = 0
    @State private var lastAnswer: (food: String, answer: String, question: String)?
    /// Questions answered with Done or Skip, by "row-question".
    @State private var closed: Set<String> = []
    /// What the last line typed after a scan added, for Tally to say so.
    @State private var lastAdded: [String] = []

    private var addedIDs: Set<UUID> { Set(added.values.flatMap(\.values)) }

    private func questionKey(_ item: ScannedFood) -> String? {
        item.key ?? MealRecognition.match(item.name)?.key
    }
    @State private var leftOut: Set<UUID> = []
    @State private var picking: UIImagePickerController.SourceType?
    @FocusState private var typing: Bool

    var body: some View {
        VStack(spacing: 0) {
            ScanTopBar(title: "Scan your meal", subtitle: "A photo, or a line about what you ate", onClose: onClose)
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s3)
                .padding(.bottom, SL.Space.s3)

            ScrollView {
                VStack(alignment: .leading, spacing: SL.Space.s4) {
                    // One place to talk: Tally asks, the chips under it answer.
                    tallyCard
                    switch phase {
                    case .start:
                        captureTiles
                        Label("Recognised on this phone. Free, and the photo never leaves it.", systemImage: "lock.fill")
                            .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                            .foregroundStyle(SL.Ink.tertiary)
                            .frame(maxWidth: .infinity)
                    case .reading:
                        if photo != nil { photoStrip }
                        ScanWorking(text: "Reading your plate…")
                            .frame(maxWidth: .infinity)
                            .padding(.top, SL.Space.s4)
                    case .results:
                        if photo != nil { photoStrip }
                        results
                    case .empty:
                        if photo != nil { photoStrip }
                        captureTiles
                    }
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.bottom, SL.Space.s4)
                .animation(.snappy, value: items.map(\.id))
            }
            .scrollDismissesKeyboard(.interactively)

            dock
        }
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
            // `-SetlineScanThen "<line>"` adds a line once the first read is in.
            if let flag = arguments.firstIndex(of: "-SetlineScanThen"), arguments.indices.contains(flag + 1) {
                let more = arguments[flag + 1]
                Task {
                    try? await Task.sleep(for: .seconds(2))
                    text = more
                    send()
                }
            }
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

    // MARK: - Tally's card

    /// Tally, what Tally says, and — when Tally asks something — the answers
    /// right under it, so question and answer are in one place.
    private var tallyCard: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            TallyGuide(line: tallyLine, mood: tallyMood, jumps: tallyJumps)
                .onTapGesture { tallyJumps += 1 }
            if case .results = phase, let open = openQuestion {
                answerChips(open.question, for: open.food)
                    .padding(.leading, 64)
                    .transition(.opacity)
            }
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .fill(SL.Surface.raised)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: 1)
        )
    }

    // MARK: - Your plate

    /// The two ways in with a picture, as big quiet tiles.
    private var captureTiles: some View {
        HStack(spacing: SL.Space.s3) {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                captureTile("Take a photo", symbol: "camera.fill") { picking = .camera }
            }
            captureTile("From your photos", symbol: "photo.on.rectangle") { picking = .photoLibrary }
        }
    }

    private func captureTile(_ title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: SL.Space.s2) {
                Image(systemName: symbol)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(SL.Signal.action)
                    .frame(width: 48, height: 48)
                    .background(Circle().fill(SL.Signal.actionTint))
                Text(title)
                    .slBody(SL.Weight.semibold)
                    .foregroundStyle(SL.Ink.primary)
            }
            .frame(maxWidth: .infinity, minHeight: 120)
            .background(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).fill(SL.Surface.raised))
            .overlay(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).strokeBorder(SL.Surface.hairline, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.97))
    }

    /// The photo, small, once it has been read — with the way to take another.
    private var photoStrip: some View {
        HStack(spacing: SL.Space.s3) {
            if let photo {
                Image(uiImage: photo)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
            }
            Text("Your photo")
                .slBody(SL.Weight.semibold)
                .foregroundStyle(SL.Ink.primary)
            Spacer(minLength: 0)
            Button {
                picking = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
            } label: {
                Label("Retake", systemImage: "arrow.counterclockwise")
                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.horizontal, SL.Space.s3)
                    .frame(minHeight: 34)
                    .background(Capsule().fill(SL.Surface.raised2))
            }
            .buttonStyle(SLPressStyle(scale: 0.94))
        }
    }

    // MARK: - The dock

    /// One place to tell Tally anything — before a scan, what you ate;
    /// after it, what to add — and under it the one lime action.
    private var dock: some View {
        let chosen = items.filter { !leftOut.contains($0.id) }
        let canSend = text.trimmingCharacters(in: .whitespaces).count >= 2
        return VStack(spacing: SL.Space.s2) {
            HStack(alignment: .bottom, spacing: SL.Space.s2) {
                TextField("", text: $text,
                          prompt: Text(items.isEmpty ? "Tell Tally what you ate…" : "Add more: a coke, 2 eggs…")
                              .foregroundColor(SL.Ink.tertiary),
                          axis: .vertical)
                    .lineLimit(1...3)
                    .font(.sl(SL.TypeSize.body, SL.Weight.regular))
                    .foregroundStyle(SL.Ink.primary)
                    .tint(SL.Signal.action)
                    .focused($typing)
                    .submitLabel(.send)
                    .onSubmit { send() }
                    .padding(.leading, SL.Space.s4)
                    .padding(.vertical, 12)
                Button(action: send) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(canSend ? SL.Signal.onAction : SL.Ink.tertiary)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(canSend ? SL.Signal.action : SL.Surface.hairlineStrong))
                }
                .buttonStyle(SLPressStyle(scale: 0.9))
                .disabled(!canSend)
                .padding(.trailing, 7)
                .padding(.bottom, 7)
                .accessibilityLabel("Send to Tally")
            }
            .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(SL.Surface.raised2))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(typing ? SL.Signal.action.opacity(0.5) : SL.Surface.hairlineStrong, lineWidth: 1))

            if case .results = phase, !chosen.isEmpty, !typing {
                Button {
                    let stamp = Int(Date().timeIntervalSince1970 * 1000)
                    onLog(chosen.enumerated().map { offset, item in
                        item.entry(id: "food-\(stamp + offset)", on: date, meal: meal)
                    })
                } label: {
                    Text(chosen.count == 1 ? "Add to \(meal.spoken)" : "Add \(chosen.count) items to \(meal.spoken)")
                }
                .buttonStyle(SLPrimaryButtonStyle())
                .transition(.opacity)
            }
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s2)
        .padding(.bottom, SL.Space.s2)
        .background(SL.Surface.ground)
        .animation(.snappy, value: typing)
    }

    /// Before a scan, reads what was typed; after one, adds it to the plate.
    private func send() {
        guard text.trimmingCharacters(in: .whitespaces).count >= 2 else { return }
        if case .results = phase { scan(adding: true) } else { scan() }
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
        let isAdded = addedIDs.contains(item.id)
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
            if included {
                HStack(spacing: SL.Space.s2) {
                    GramsStepper(grams: Binding(
                        get: { items[index].grams },
                        set: { items[index] = items[index].scaled(to: $0) }
                    ), serving: nil, compact: true)
                    if let others = alternatives[item.id], !others.isEmpty {
                        otherMatch(others, for: item, at: index)
                    }
                }
                .padding(.leading, 44)
            }
        }
        .padding(SL.Space.s3)
        .padding(.leading, isAdded ? SL.Space.s6 : 0)
        .background(isAdded ? SL.Signal.actionTint.opacity(0.35) : Color.clear)
    }

    // MARK: - Tally

    /// The first question still open, and the food it's about.
    private var openQuestion: (food: ScannedFood, question: MealRecognition.Question)? {
        for item in items where !leftOut.contains(item.id) && !addedIDs.contains(item.id) {
            for question in MealRecognition.questions(for: questionKey(item)) where !closed.contains("\(item.id)-\(question.id)") {
                return (item, question)
            }
        }
        return nil
    }

    private var tallyMood: TallyMascot.Mood {
        switch phase {
        case .start: .ready
        case .reading: .focused
        case .empty: .resting
        case .results: openQuestion == nil ? .proud : .ready
        }
    }

    /// What Tally says: always about what is on screen now, never chat.
    private var tallyLine: String {
        switch phase {
        case .start:
            return "Hi! Show me your plate, or tell me what you ate."
        case .reading:
            return "Hmm, let me have a look…"
        case .empty:
            return "I couldn't make that out. Tell me what it was?"
        case .results:
            let names = items.filter { !addedIDs.contains($0.id) }.map { Self.short($0.name) }
            let seen = names.count <= 1 ? (names.first ?? "something")
                : names.dropLast().joined(separator: ", ") + " and " + (names.last ?? "")
            if let open = openQuestion {
                let food = Self.short(open.food.name)
                let ask: String = switch open.question.kind {
                case .size: "how big was the \(food)?"
                case .adds: open.question.id == "on" ? "anything on that \(food)?"
                    : open.question.id == "sauce" ? "any sauce with the \(food)?"
                    : open.question.id == "dressing" ? "dressing on the salad?"
                    : open.question.id == "milk" ? "milk or sugar in your \(food)?"
                    : "anything on top of the \(food)?"
                }
                if let last = lastAnswer, last.question == "\(open.food.id)-\(open.question.id)" {
                    return "\(last.answer) on the \(last.food), nice. Anything else on it? Tap Done when that's it."
                }
                if !lastAdded.isEmpty {
                    return "Added \(Self.list(lastAdded)). And \(ask)"
                }
                if let last = lastAnswer, last.question == "size" {
                    return "\(last.answer) of \(last.food), noted. And \(ask)"
                }
                return "I see \(seen). Quick one: \(ask)"
            }
            if !lastAdded.isEmpty {
                return "Added \(Self.list(lastAdded)). Anything else? Otherwise, add it to \(meal.spoken)."
            }
            if lastAnswer != nil || !closed.isEmpty {
                return "Got it! Check the grams, then add it to \(meal.spoken)."
            }
            return "I see \(seen). Check the grams, then add it to \(meal.spoken)."
        }
    }

    /// "rice, fries and mayo"
    private static func list(_ names: [String]) -> String {
        names.count <= 1 ? (names.first ?? "") : names.dropLast().joined(separator: ", ") + " and " + (names.last ?? "")
    }

    /// "White rice, cooked" → "rice"; "Chicken pie (vol-au-vent)" → "chicken pie".
    private static func short(_ name: String) -> String {
        let base = name.split(separator: "(").first.map(String.init) ?? name
        let first = base.split(separator: ",").first.map(String.init) ?? base
        let words = first.split(separator: " ")
        let trimmed = words.count > 1 && ["white", "mixed", "fried"].contains(words[0].lowercased())
            ? words.dropFirst().joined(separator: " ") : first
        return trimmed.lowercased().trimmingCharacters(in: .whitespaces)
    }

    /// The answers to Tally's question as chips, then Done (after an
    /// answer) or Skip — which moves Tally on to the next question.
    private func answerChips(_ question: MealRecognition.Question, for item: ScannedFood) -> some View {
        let chosen = answered[item.id] ?? []
        let anyChosen = !chosen.intersection(question.answers.map(\.id)).isEmpty
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(question.answers) { answer in
                    let on = chosen.contains(answer.id)
                    Button { choose(answer, of: question, for: item) } label: {
                        HStack(spacing: 4) {
                            if on { Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)) }
                            Text(answer.label)
                        }
                        .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                        .foregroundStyle(on ? SL.Signal.onAction : SL.Ink.primary)
                        .padding(.horizontal, SL.Space.s3)
                        .frame(minHeight: 36)
                        .background(Capsule().fill(on ? SL.Signal.action : SL.Surface.raised2))
                        .overlay(Capsule().strokeBorder(on ? Color.clear : SL.Surface.hairlineStrong, lineWidth: 1))
                        .contentShape(Capsule())
                    }
                    .buttonStyle(SLPressStyle(scale: 0.92, bounces: true))
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
                Button {
                    closed.insert("\(item.id)-\(question.id)")
                    lastAnswer = nil
                } label: {
                    Text(anyChosen ? "Done" : "Skip")
                        .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                        .foregroundStyle(anyChosen ? SL.Signal.action : SL.Ink.secondary)
                        .padding(.horizontal, SL.Space.s3)
                        .frame(minHeight: 36)
                        .overlay(Capsule().strokeBorder(anyChosen ? SL.Signal.action.opacity(0.6) : SL.Surface.hairlineStrong,
                                                        style: StrokeStyle(lineWidth: 1, dash: anyChosen ? [] : [4, 3])))
                        .contentShape(Capsule())
                }
                .buttonStyle(SLPressStyle(scale: 0.92))
            }
        }
        .sensoryFeedback(.selection, trigger: chosen)
    }

    private func choose(_ answer: MealRecognition.Question.Answer, of question: MealRecognition.Question, for item: ScannedFood) {
        var chosen = answered[item.id] ?? []
        switch question.kind {
        case .size:
            chosen = chosen.subtracting(question.answers.map(\.id))
            chosen.insert(answer.id)
            if let index = items.firstIndex(where: { $0.id == item.id }) {
                withAnimation(.snappy) { items[index] = MealRecognition.sized(item, by: answer) }
            }
            closed.insert("\(item.id)-\(question.id)")
            lastAnswer = (Self.short(item.name), "\(answer.label) plate", "size")
            tallyJumps += 1
        case .adds:
            if chosen.contains(answer.id) {
                chosen.remove(answer.id)
                if let childID = added[item.id]?[answer.id] {
                    withAnimation(.snappy) { items.removeAll { $0.id == childID } }
                    leftOut.remove(childID)
                    added[item.id]?[answer.id] = nil
                }
            } else if let child = MealRecognition.added(answer, to: item),
                      let index = items.firstIndex(where: { $0.id == item.id }) {
                chosen.insert(answer.id)
                let after = index + 1 + (added[item.id]?.count ?? 0)
                withAnimation(.snappy) { items.insert(child, at: min(after, items.count)) }
                added[item.id, default: [:]][answer.id] = child.id
                lastAnswer = (Self.short(item.name), answer.label.components(separatedBy: " / ").first ?? answer.label, "\(item.id)-\(question.id)")
                tallyJumps += 1
                SLSound.pop.play()
            }
        }
        answered[item.id] = chosen
    }

    /// What else a row could be, one tap from its grams.
    private func otherMatch(_ others: [ScannedFood], for item: ScannedFood, at index: Int) -> some View {
                Menu {
                    ForEach(others) { other in
                        Button("\(other.name) · \(app.display.whole(Decimal(other.scaled(to: item.grams).calories))) kcal") {
                            let swapped = other.scaled(to: item.grams)
                            let replaced = ScannedFood(name: swapped.name, grams: swapped.grams, calories: swapped.calories,
                                                       protein: swapped.protein, carbs: swapped.carbs, fat: swapped.fat,
                                                       confidence: .high, key: swapped.key)
                            alternatives[replaced.id] = others.filter { $0.id != other.id } + [item]
                            items[index] = replaced
                        }
                    }
                } label: {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(SL.Surface.raised2))
                }
                .accessibilityLabel("Other match for \(item.name)")
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

    /// Reads the photo and what was typed. `adding` keeps the plate as it is
    /// and puts only the newly typed foods on it — "and a coke".
    private func scan(adding: Bool = false) {
        typing = false
        if !adding {
            phase = .reading
            leftOut = []
        }
        let image = adding ? nil : photo
        let line = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if adding { text = "" }
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
            if adding {
                items += found
                alternatives.merge(others) { $1 }
                lastAdded = found.map { Self.short($0.name) }
                lastAnswer = nil
                if !found.isEmpty {
                    SLSound.pop.play()
                    tallyJumps += 1
                }
                return
            }
            items = found
            alternatives = others
            answered = [:]
            added = [:]
            closed = []
            lastAnswer = nil
            lastAdded = []
            if !line.isEmpty { text = "" }
            if found.isEmpty {
                phase = .empty
            } else {
                SLSound.pop.play()
                tallyJumps += 1
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

/// Tally, the app's mascot, guiding the scan: a few bars with a face beside
/// one speech bubble that says what is happening and what Tally wants to know.
private struct TallyGuide: View {
    let line: String
    let mood: TallyMascot.Mood
    let jumps: Int

    var body: some View {
        // Tally sits at the top and never moves with the bubble: its bars
        // breathe on a repeating animation, which would otherwise repeat any
        // change of place too.
        HStack(alignment: .top, spacing: SL.Space.s3) {
            TallyMascot(done: 3, goal: 3, mood: mood, unit: 12, jumps: jumps)
                .fixedSize()
                .frame(width: 52, height: 56, alignment: .bottomLeading)
                .accessibilityHidden(true)
            Text(line)
                .slBody(SL.Weight.medium)
                .foregroundStyle(SL.Ink.primary)
                .fixedSize(horizontal: false, vertical: true)
                .contentTransition(.opacity)
                .padding(.horizontal, SL.Space.s4)
                .padding(.vertical, SL.Space.s3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    BubbleShape()
                        .fill(SL.Surface.raised2)
                )
                .overlay(BubbleShape().stroke(SL.Surface.hairlineStrong, lineWidth: 1))
                .animation(.easeOut(duration: SL.Motion.base), value: line)
                .accessibilityLabel("Tally says: \(line)")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// A rounded bubble with a small tail on the left, toward Tally.
    private struct BubbleShape: Shape {
        func path(in rect: CGRect) -> Path {
            var path = Path(roundedRect: rect, cornerRadius: 16, style: .continuous)
            path.move(to: CGPoint(x: rect.minX + 2, y: rect.minY + 16))
            path.addLine(to: CGPoint(x: rect.minX - 8, y: rect.minY + 28))
            path.addLine(to: CGPoint(x: rect.minX + 2, y: rect.minY + 32))
            path.closeSubpath()
            return path
        }
    }
}

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
