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
    /// Rows that came from the photo: Tally checks those first.
    @State private var fromPhoto: Set<UUID> = []
    /// The photo guess "Something else" points at: what is typed next
    /// takes its place.
    @State private var replacing: UUID?
    /// The conversation with Tally on the server, when it answered: what
    /// Tally said, the question still open, and every turn so far. Nil means
    /// the scan was read on the phone.
    @State private var chat: TallyChat?
    /// Tally is redoing the plate after an answer.
    @State private var thinking = false

    struct TallyChat {
        var say: String
        var question: FoodScanAnswer.Question?
        var turns: [FoodScanRequest.Turn]
    }

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
                        Label("Tally reads your photo with Google's Gemini AI. Setline doesn't keep it.", systemImage: "sparkles")
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
            // `-SetlineScanChoose <answer id>` answers Tally's first question.
            if let flag = arguments.firstIndex(of: "-SetlineScanChoose"), arguments.indices.contains(flag + 1) {
                let id = arguments[flag + 1]
                Task {
                    try? await Task.sleep(for: .seconds(2))
                    if let open = openQuestion, let answer = open.question.answers.first(where: { $0.id == id }) {
                        choose(answer, of: open.question, for: open.food)
                    }
                }
            }
            // `-SetlineScanThen "<line>"` adds a line once the first read is in.
            if let flag = arguments.firstIndex(of: "-SetlineScanThen"), arguments.indices.contains(flag + 1) {
                let more = arguments[flag + 1]
                Task {
                    try? await Task.sleep(for: .seconds(3))
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
            if case .results = phase, let question = chat?.question, !thinking {
                chatChips(question)
                    .padding(.leading, 64)
                    .transition(.opacity)
            } else if case .results = phase, let open = openQuestion {
                answerChips(open.question, for: open.food)
                    .padding(.leading, 64)
                    .transition(.opacity)
            }
            // Telling Tally, right under what Tally says.
            inputField
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
        return Group {
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
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s2)
                .padding(.bottom, SL.Space.s2)
                .background(SL.Surface.ground)
                .transition(.opacity)
            }
        }
        .animation(.snappy, value: typing)
    }

    /// The one place to tell Tally anything: what you ate, what to add, or
    /// what a wrong guess really was.
    private var inputField: some View {
        let canSend = text.trimmingCharacters(in: .whitespaces).count >= 2
        let prompt = replacing != nil ? "What was it? e.g. nasi goreng"
            : items.isEmpty ? "Tell Tally what you ate…" : "Add more: a coke, 2 eggs…"
        return HStack(alignment: .bottom, spacing: SL.Space.s2) {
            TextField("", text: $text, prompt: Text(prompt).foregroundColor(SL.Ink.tertiary), axis: .vertical)
                .lineLimit(1...3)
                .font(.sl(SL.TypeSize.body, SL.Weight.regular))
                .foregroundStyle(SL.Ink.primary)
                .tint(SL.Signal.action)
                .focused($typing)
                .submitLabel(.send)
                .onSubmit { send() }
                .padding(.leading, SL.Space.s4)
                .padding(.vertical, 11)
            Button(action: send) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(canSend ? SL.Signal.onAction : SL.Ink.tertiary)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(canSend ? SL.Signal.action : SL.Surface.hairlineStrong))
            }
            .buttonStyle(SLPressStyle(scale: 0.9))
            .disabled(!canSend)
            .padding(.trailing, 6)
            .padding(.bottom, 6)
            .accessibilityLabel("Send to Tally")
        }
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(SL.Surface.ground))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
            .strokeBorder(typing || replacing != nil ? SL.Signal.action.opacity(0.5) : SL.Surface.hairlineStrong, lineWidth: 1))
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
            Text(chat != nil ? "Estimated by Tally from what it sees. Weighing beats guessing."
                 : "Usual portions and standard values. Weighing beats guessing.")
                .slMeta()
                .foregroundStyle(SL.Ink.tertiary)
        }
    }

    private func resultRow(index: Int, item: ScannedFood) -> some View {
        let included = !leftOut.contains(item.id)
        let isAdded = addedIDs.contains(item.id)
        return VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack(spacing: SL.Space.s3) {
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
                Button { withAnimation(.snappy) { remove(item.id) } } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(SL.Surface.raised2))
                        .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(SLPressStyle(scale: 0.9))
                .padding(.trailing, -SL.Space.s2)
                .accessibilityLabel("Remove \(item.name)")
            }
            if included {
                HStack(spacing: SL.Space.s2) {
                    GramsStepper(grams: Binding(
                        get: { items[index].grams },
                        set: { items[index] = items[index].scaled(to: $0) }
                    ), serving: nil, compact: true)
                    Spacer(minLength: 0)
                    if let others = alternatives[item.id], !others.isEmpty {
                        otherMatch(others, for: item, at: index)
                    }
                }
            }
        }
        .padding(SL.Space.s3)
        .padding(.leading, isAdded ? SL.Space.s6 : 0)
        .background(isAdded ? SL.Signal.actionTint.opacity(0.35) : Color.clear)
    }

    // MARK: - Tally

    /// The first question still open, and the food it's about.
    private var openQuestion: (food: ScannedFood, question: MealRecognition.Question)? {
        if chat != nil { return nil }
        for item in items where fromPhoto.contains(item.id) && !closed.contains("\(item.id)-what") {
            return (item, MealRecognition.identityQuestion(for: item))
        }
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
        case .results: thinking ? .focused : (openQuestion == nil && chat?.question == nil) ? .proud : .ready
        }
    }

    /// What Tally says: always about what is on screen now, never chat.
    private var tallyLine: String {
        if let chat {
            if thinking { return "Got it, redoing the plate…" }
            switch phase {
            case .results:
                if let question = chat.question { return "\(chat.say) \(question.text)" }
                return "\(chat.say) Check the grams, then add it to \(meal.spoken)."
            case .empty:
                return "\(chat.say) Tell me what it was?"
            case .start, .reading:
                break
            }
        }
        switch phase {
        case .start:
            return "Hi! Show me your plate or the package, or tell me what you ate."
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
                case .identity: "is that \(food)?"
                case .adds: open.question.id == "on" ? "anything on that \(food)?"
                    : open.question.id == "sauce" ? "any sauce with the \(food)?"
                    : open.question.id == "dressing" ? "dressing on the salad?"
                    : open.question.id == "milk" ? "milk or sugar in your \(food)?"
                    : "anything on top of the \(food)?"
                }
                if let last = lastAnswer, last.question == "\(open.food.id)-\(open.question.id)" {
                    return "\(Self.capitalized(last.answer)) on the \(last.food), nice. Anything else on it? Tap Done when that's it."
                }
                if !lastAdded.isEmpty {
                    return "Added \(Self.list(lastAdded)). And \(ask)"
                }
                if open.question.kind == .identity {
                    return replacing != nil
                        ? "No problem — type what it was just below, and I'll swap it."
                        : "I think I see \(Self.short(open.food.name)). Is that right?"
                }
                if let last = lastAnswer, last.question == "what" {
                    return "\(Self.capitalized(last.answer)) it is! And \(ask)"
                }
                if let last = lastAnswer, last.question == "size" {
                    return "\(Self.capitalized(last.answer)) of \(last.food), noted. And \(ask)"
                }
                return "I see \(seen). Quick one: \(ask)"
            }
            if !lastAdded.isEmpty {
                return "Added \(Self.list(lastAdded)). Anything else? Otherwise, add it to \(meal.spoken)."
            }
            if let last = lastAnswer, last.question == "what" {
                return "\(Self.capitalized(last.answer)) it is! Check the grams, then add it to \(meal.spoken)."
            }
            if lastAnswer != nil || !closed.isEmpty {
                return "Got it! Check the grams, then add it to \(meal.spoken)."
            }
            return "I see \(seen). Check the grams, then add it to \(meal.spoken)."
        }
    }


    private static func capitalized(_ text: String) -> String {
        text.prefix(1).uppercased() + text.dropFirst()
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
                    let on = chosen.contains(answer.id) || (answer.id == "else" && replacing == item.id)
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
                if question.kind != .identity {
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
        }
        .sensoryFeedback(.selection, trigger: chosen)
    }

    private func choose(_ answer: MealRecognition.Question.Answer, of question: MealRecognition.Question, for item: ScannedFood) {
        var chosen = answered[item.id] ?? []
        switch question.kind {
        case .identity:
            if answer.id == "else" {
                replacing = item.id
                typing = true
                return
            }
            closed.insert("\(item.id)-what")
            replacing = nil
            if answer.id != "yes", let key = answer.addsKey,
               let food = MealRecognition.foods.first(where: { $0.key == key }),
               let index = items.firstIndex(where: { $0.id == item.id }) {
                let swapped = food.scanned(confidence: .high)
                let kept = ScannedFood(name: swapped.name, grams: swapped.grams, calories: swapped.calories,
                                       protein: swapped.protein, carbs: swapped.carbs, fat: swapped.fat,
                                       confidence: .high, key: swapped.key, id: item.id)
                withAnimation(.snappy) { items[index] = kept }
                lastAnswer = (food: Self.short(food.name), answer: Self.short(food.name), question: "what")
            } else {
                lastAnswer = (food: Self.short(item.name), answer: Self.short(item.name), question: "what")
            }
            tallyJumps += 1
            SLSound.pop.play()
            return
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

    /// Takes a row off the plate, with whatever its answers added to it.
    private func remove(_ id: UUID, keepPlace: Bool = false) {
        let children = Array((added[id] ?? [:]).values)
        items.removeAll { $0.id == id || children.contains($0.id) }
        added[id] = nil
        for (parent, map) in added {
            if let answer = map.first(where: { $0.value == id })?.key {
                added[parent]?[answer] = nil
                answered[parent]?.remove(answer)
            }
        }
        answered[id] = nil
        fromPhoto.remove(id)
        alternatives[id] = nil
        if replacing == id, !keepPlace { replacing = nil }
        if !keepPlace { lastAnswer = nil; lastAdded = [] }
        if items.isEmpty, !keepPlace { phase = .start }
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
            chat = nil
        }
        let image = adding ? nil : photo
        let line = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if adding { text = "" }
        Task {
            if await askTally(line: line, image: image, adding: adding) { return }
            var found: [ScannedFood] = []
            var others: [UUID: [ScannedFood]] = [:]
            var photoRows: Set<UUID> = []
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
            var readPackage = false
            if let image {
                let looked = await MealScanner.look(at: image)
                // A package says what it is in print: its barcode, its
                // nutrition table, its name. That beats any guess from looks.
                if let product = await packaged(looked) {
                    found.append(product.food)
                    others[product.food.id] = product.others
                    // A name read from big print is checked with Tally; a
                    // barcode or a nutrition table is what it says.
                    if product.food.confidence != .high { photoRows.insert(product.food.id) }
                    readPackage = true
                }
            }
            if let image, !readPackage {
                let labels = await MealScanner.labels(in: image)
                let seen = MealRecognition.fromLabels(labels, limit: 8)
                let shown = Array(seen.prefix(4)).filter { item in !found.contains { $0.name == item.name } }
                for item in shown {
                    others[item.id] = seen.filter { $0.name != item.name && !shown.contains($0) }
                }
                found += shown
                photoRows = Set(shown.map(\.id))
            }
            if adding, let target = replacing, let index = items.firstIndex(where: { $0.id == target }), let first = found.first {
                // "Something else": the typed food takes the guess's place.
                remove(target, keepPlace: true)
                items.insert(first, at: min(index, items.count))
                items.insert(contentsOf: found.dropFirst(), at: min(index + 1, items.count))
                alternatives.merge(others) { $1 }
                replacing = nil
                lastAdded = []
                lastAnswer = (Self.short(first.name), Self.short(first.name), "what")
                SLSound.pop.play()
                tallyJumps += 1
                return
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
            fromPhoto = photoRows
            replacing = nil
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

    /// Asks Tally on the server: the photo, what was typed and — on a
    /// follow-up — the plate and every turn so far. True when Tally answered
    /// and the screen shows that answer; false sends the scan to the phone's
    /// own reading.
    private func askTally(line: String, image: UIImage?, adding: Bool, answer: String? = nil) async -> Bool {
        let following = adding || answer != nil
        if following && chat == nil { return false }
        var turns = chat?.turns ?? []
        if let answer, let question = chat?.question {
            turns += [.tally(question.text), .user(answer)]
        }
        let request = FoodScanRequest(
            imageJPEG: (image ?? (following ? photo : nil)).flatMap(Self.jpeg),
            text: answer == nil ? line : nil,
            plate: following ? items.filter { !leftOut.contains($0.id) } : [],
            turns: turns
        )
        if following { thinking = true }
        let outcome = await app.scanMeal(request)
        thinking = false
        guard case .answer(let reply) = outcome else { return false }
        if !line.isEmpty, answer == nil { turns.append(.user(line)) }
        turns.append(.tally(reply.say))
        chat = TallyChat(say: reply.say, question: reply.question, turns: turns)
        if adding { text = "" }
        withAnimation(.snappy) {
            items = reply.items
            alternatives = [:]
            fromPhoto = []
            leftOut = []
            answered = [:]
            added = [:]
            closed = []
            lastAnswer = nil
            lastAdded = []
            replacing = nil
        }
        if !line.isEmpty, !adding { text = "" }
        if reply.items.isEmpty && !following {
            phase = .empty
        } else {
            SLSound.pop.play()
            tallyJumps += 1
            phase = .results
        }
        return true
    }

    /// A tap on one of Tally's options, or Skip.
    private func answerTally(_ option: String?) {
        guard let option else {
            chat?.question = nil
            return
        }
        Task { _ = await askTally(line: "", image: nil, adding: false, answer: option) }
    }

    private func chatChips(_ question: FoodScanAnswer.Question) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(question.options, id: \.self) { option in
                    Button { answerTally(option) } label: {
                        Text(option)
                            .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                            .foregroundStyle(SL.Ink.primary)
                            .padding(.horizontal, SL.Space.s3)
                            .frame(minHeight: 36)
                            .background(Capsule().fill(SL.Surface.raised2))
                            .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(SLPressStyle(scale: 0.92, bounces: true))
                }
                Button { answerTally(nil) } label: {
                    Text("Skip")
                        .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.horizontal, SL.Space.s3)
                        .frame(minHeight: 36)
                        .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                        .contentShape(Capsule())
                }
                .buttonStyle(SLPressStyle(scale: 0.92))
            }
        }
    }

    /// The photo as Tally gets it: 1024 px on the long side is plenty to
    /// read a plate or a label, and keeps the upload small.
    private static func jpeg(_ image: UIImage) -> Data? {
        let longest = max(image.size.width, image.size.height)
        let scale = min(1, 1024 / max(longest, 1))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return resized.jpegData(compressionQuality: 0.7)
    }

    /// The product a photo of a package shows, best evidence first: the
    /// barcode in Open Food Facts, then the label's own nutrition table, then
    /// the name in big print — matched to a common food or searched.
    private func packaged(_ looked: MealScanner.Look) async -> (food: ScannedFood, others: [ScannedFood])? {
        let reading = PackageLabel.read(looked.text)
        let table = reading.tableFood

        for code in looked.barcodes {
            if case .found(let product) = await FoodLookupService().barcode(code) {
                let grams = product.servingGrams ?? reading.nutrition?.servingGrams ?? table?.grams ?? 100
                return (row(product.product, grams: grams, key: table?.key), [])
            }
        }

        // The product itself, found by the brand and name on the package.
        let branded = await brandedProducts(reading)
        let grams = reading.nutrition?.servingGrams ?? table?.grams ?? 100
        let others = branded.dropFirst().prefix(4).map { row($0, grams: grams, key: table?.key, confidence: .medium) }
            + (table.map { [$0.scanned(confidence: .low)] } ?? [])

        if let nutrition = reading.nutrition {
            // The label's own numbers are this exact product; the search only
            // lends it its name.
            let name = branded.first.map(displayName)
                ?? (reading.title.isEmpty ? table?.name ?? "Product from the label" : PackageLabel.displayName(reading.title))
            let food = nutrition.scanned(name: name, grams: grams)
            return (ScannedFood(name: food.name, grams: food.grams, calories: food.calories, protein: food.protein,
                                carbs: food.carbs, fat: food.fat, confidence: .high, key: table?.key), Array(others))
        }
        if let product = branded.first {
            return (row(product, grams: grams, key: table?.key, confidence: .medium), Array(others))
        }
        if let table {
            return (table.scanned(confidence: .medium), [])
        }
        return nil
    }

    /// Open Food Facts asked with the big print, and with all of the front
    /// print when the brand sits in smaller letters; only products whose own
    /// name and brand the package shows are kept.
    private func brandedProducts(_ reading: PackageLabel.Reading) async -> [FoodProduct] {
        var found: [FoodProduct] = []
        for query in [reading.title, reading.printed] where query.count >= 3 {
            let trimmed = String(query.prefix(80))
            switch await app.searchFood(trimmed) {
            case .found(let products), .partial(let products, _): found += products
            case .failed: break
            }
            if !PackageLabel.products(found, matching: reading.printed).isEmpty { break }
        }
        var seen = Set<String>()
        return PackageLabel.products(found, matching: reading.printed).filter { seen.insert($0.id).inserted }
    }

    private func displayName(_ product: FoodProduct) -> String {
        let brand = product.brand
        let unknown = brand.isEmpty || brand == "Generiek" || brand == "Merk onbekend"
            || product.name.localizedCaseInsensitiveContains(brand)
        return unknown ? product.name : "\(product.name) · \(brand)"
    }

    private func row(_ product: FoodProduct, grams: Double, key: String?, confidence: ScannedFood.Confidence = .high) -> ScannedFood {
        let portion = FoodSearch.portion(of: product, grams: grams)
        return ScannedFood(name: displayName(product), grams: grams, calories: portion.calories, protein: portion.protein,
                           carbs: portion.carbs, fat: portion.fat, confidence: confidence, key: key)
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
    /// The print on a photo: text with where it sits, and any barcode.
    struct Look: Sendable {
        var text: [PackageLabel.Observation] = []
        var barcodes: [String] = []
    }

    static func look(at image: UIImage) async -> Look {
        #if DEBUG
        // `-SetlineFakeText "100% WHEY|Protein 78 g"` stands in for text
        // recognition on the simulator; the first line is the biggest print.
        let arguments = ProcessInfo.processInfo.arguments
        if let flag = arguments.firstIndex(of: "-SetlineFakeText"), arguments.indices.contains(flag + 1) {
            let lines = arguments[flag + 1].split(separator: "|").map(String.init)
            return Look(text: lines.enumerated().map { index, text in
                PackageLabel.Observation(text: text, x: 0.1, y: 0.9 - Double(index) * 0.08, width: 0.6,
                                         height: index == 0 ? 0.08 : 0.02)
            })
        }
        #endif
        guard let cgImage = image.cgImage else { return Look() }
        let orientation = CGImagePropertyOrientation(image.imageOrientation)
        return await Task.detached(priority: .userInitiated) {
            let text = VNRecognizeTextRequest()
            text.recognitionLevel = .accurate
            text.usesLanguageCorrection = true
            text.recognitionLanguages = ["en-US", "nl-NL", "fr-FR", "de-DE"]
            let barcodes = VNDetectBarcodesRequest()
            barcodes.symbologies = [.ean13, .ean8, .upce, .code128]
            let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation)
            try? handler.perform([text, barcodes])
            var look = Look()
            look.text = (text.results ?? []).compactMap { observation in
                guard let best = observation.topCandidates(1).first else { return nil }
                let box = observation.boundingBox
                return PackageLabel.Observation(text: best.string, x: box.minX, y: box.minY,
                                                width: box.width, height: box.height)
            }
            look.barcodes = Array(Set((barcodes.results ?? []).compactMap(\.payloadStringValue)))
            return look
        }.value
    }

    static func labels(in image: UIImage) async -> [(label: String, confidence: Float)] {
        #if DEBUG
        // `-SetlineFakeLabels "paella:0.5,food:0.9"` stands in for the
        // recognition, which the simulator can't run.
        let arguments = ProcessInfo.processInfo.arguments
        if let flag = arguments.firstIndex(of: "-SetlineFakeLabels"), arguments.indices.contains(flag + 1) {
            return arguments[flag + 1].split(separator: ",").compactMap { pair in
                let parts = pair.split(separator: ":")
                guard parts.count == 2, let value = Float(parts[1]) else { return nil }
                return (String(parts[0]), value)
            }
        }
        #endif
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
