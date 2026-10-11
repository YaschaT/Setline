import Foundation
import SetlineCore

/// A barcode, read in Open Food Facts straight from the phone: only the
/// number leaves it. (A meal photo never leaves the phone at all — see
/// `MealScanner`.)
struct FoodLookupService: Sendable {
    enum BarcodeOutcome: Sendable {
        case found(BarcodeProduct)
        case notFound
        case failed(String)
    }

    private let session: URLSession
    private let config: WebAppConfig?

    init(session: URLSession = .shared, config: WebAppConfig? = WebAppConfig.fromBundle()) {
        self.session = session
        self.config = config
    }

    func barcode(_ code: String) async -> BarcodeOutcome {
        guard let url = BarcodeProduct.lookupURL(code) else { return .notFound }
        var request = URLRequest(url: url, timeoutInterval: 12)
        // Open Food Facts asks every app to say who it is.
        request.setValue("Setline iOS - fitness log", forHTTPHeaderField: "User-Agent")
        do {
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 404 { return .notFound }
            guard (200..<300).contains(status) else { return .failed("Open Food Facts didn't answer. Try again in a moment.") }
            return BarcodeProduct.parse(data, barcode: code).map(BarcodeOutcome.found) ?? .notFound
        } catch {
            return .failed("No connection. Try again, or search by name.")
        }
    }
}
