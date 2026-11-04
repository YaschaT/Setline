import Foundation
import SetlineCore

/// The online exercise library, fetched once per launch and kept: about a
/// megabyte, at the commit the photos are pinned to.
@MainActor
final class ExerciseLibraryStore {
    static let shared = ExerciseLibraryStore()
    private var library: ExerciseLibrary?

    /// The library, or nil when it can't be reached.
    func load() async -> ExerciseLibrary? {
        if let library { return library }
        guard let (data, response) = try? await URLSession.shared.data(from: ExerciseMedia.libraryURL),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let loaded = try? ExerciseLibrary(data: data) else { return nil }
        library = loaded
        return loaded
    }
}
