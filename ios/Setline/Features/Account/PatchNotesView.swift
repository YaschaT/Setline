import SwiftUI

/// One update, as the notes file writes it.
struct PatchNote: Codable, Identifiable, Hashable {
    let id: String
    /// `yyyy-MM-dd`.
    let date: String
    let title: String
    let items: [String]
}

/// "What's new" and the dot on Settings. One list for both apps: the web app
/// ships `patch-notes.json` with the site and this reads the same file from
/// the live site, so an update the browser gets is never missing here. The
/// last copy read is kept for the next launch without a connection.
@MainActor
@Observable
final class PatchNotes {
    static let shared = PatchNotes()

    private static let url = URL(string: "https://youfit-app.vercel.app/patch-notes.json")!
    private static let cacheKey = "setline.patchNotes.cache"
    private static let seenKey = "setline.patchNotes.seen"

    private struct File: Codable { let notes: [PatchNote] }

    private(set) var notes: [PatchNote]
    private(set) var seenID: String?
    private var loaded = false

    private init() {
        let cached = UserDefaults.standard.data(forKey: Self.cacheKey)
            .flatMap { try? JSONDecoder().decode(File.self, from: $0) }
        notes = cached?.notes ?? []
        seenID = UserDefaults.standard.string(forKey: Self.seenKey)
    }

    /// A newer update than the one last opened on this phone.
    var hasUnseen: Bool {
        guard let latest = notes.first?.id else { return false }
        return latest != seenID
    }

    /// Fetched once per launch; a failed fetch keeps the last copy, quietly.
    func load() async {
        guard !loaded else { return }
        loaded = true
        var request = URLRequest(url: Self.url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let file = try? JSONDecoder().decode(File.self, from: data)
        else {
            loaded = false
            return
        }
        notes = file.notes
        UserDefaults.standard.set(data, forKey: Self.cacheKey)
    }

    func markSeen() {
        guard let latest = notes.first?.id, latest != seenID else { return }
        seenID = latest
        UserDefaults.standard.set(latest, forKey: Self.seenKey)
    }

    /// "30 October".
    static func dateLabel(_ date: String) -> String {
        let parts = date.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
              let day = Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
        else { return date }
        return day.formatted(.dateTime.day().month(.wide).locale(Locale(identifier: "en_GB")))
    }
}

/// Every update to Setline, in plain words, newest first.
struct PatchNotesView: View {
    let onClose: () -> Void
    private let store = PatchNotes.shared

    var body: some View {
        SLSheet(title: "What's new", subtitle: "Every update to Setline, in plain words", onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s6) {
                if store.notes.isEmpty {
                    Text("Couldn't load the updates. Check your connection and open this again.")
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                }
                ForEach(Array(store.notes.enumerated()), id: \.element.id) { index, note in
                    VStack(alignment: .leading, spacing: SL.Space.s2) {
                        HStack(spacing: SL.Space.s2) {
                            SLOverline(text: PatchNotes.dateLabel(note.date), color: index == 0 ? SL.Signal.action : SL.Ink.secondary)
                            if index == 0 {
                                Text("LATEST")
                                    .font(.sl(SL.TypeSize.micro, SL.Weight.bold))
                                    .tracking(0.8)
                                    .foregroundStyle(SL.Signal.onAction)
                                    .padding(.horizontal, 7)
                                    .padding(.vertical, 1)
                                    .background(Capsule().fill(SL.Signal.action))
                            }
                        }
                        Text(note.title)
                            .slLead(SL.Weight.semibold)
                            .foregroundStyle(SL.Ink.primary)
                            .accessibilityAddTraits(.isHeader)
                        VStack(alignment: .leading, spacing: SL.Space.s3) {
                            ForEach(note.items, id: \.self) { item in
                                HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                                    Circle()
                                        .fill(SL.Signal.action)
                                        .frame(width: 6, height: 6)
                                        .alignmentGuide(.firstTextBaseline) { $0[.bottom] + 4 }
                                        .accessibilityHidden(true)
                                    Text(item)
                                        .slBody()
                                        .foregroundStyle(SL.Ink.primary)
                                        .fixedSize(horizontal: false, vertical: true)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                        }
                        .padding(SL.Space.s4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised2))
                    }
                }
                if !store.notes.isEmpty {
                    Text("Same updates on iPhone and in the browser.")
                        .slMeta()
                        .foregroundStyle(SL.Ink.tertiary)
                }
            }
        }
        .task {
            await store.load()
            // Opened is read: the dot on Settings goes once the list is here.
            store.markSeen()
        }
    }
}
