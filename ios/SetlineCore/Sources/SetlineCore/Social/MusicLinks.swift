import Foundation

/// Reading a music link without any account: Spotify's public oEmbed answer
/// and embed page name the track and its cover, and Apple's iTunes search
/// has a 30-second preview of nearly every song. Nothing here signs in.
public enum MusicLinks {
    public enum Kind: String, Sendable { case track, album, playlist, artist, episode }

    /// "https://open.spotify.com/track/0Vj…?si=…" → (.track, "0Vj…").
    /// Also the intl-xx form and spotify: URIs.
    public static func spotify(_ text: String) -> (kind: Kind, id: String)? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("spotify:") {
            let parts = trimmed.split(separator: ":")
            guard parts.count >= 3, let kind = Kind(rawValue: String(parts[1])) else { return nil }
            return (kind, String(parts[2]))
        }
        guard let url = URL(string: trimmed.hasPrefix("http") ? trimmed : "https://\(trimmed)"),
              let host = url.host(), host.hasSuffix("spotify.com")
        else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" && !$0.hasPrefix("intl-") }
        guard parts.count >= 2, let kind = Kind(rawValue: parts[0]), !parts[1].isEmpty else { return nil }
        return (kind, parts[1])
    }

    /// The canonical link for a Spotify item, without tracking parameters.
    public static func spotifyURL(kind: Kind, id: String) -> URL? {
        URL(string: "https://open.spotify.com/\(kind.rawValue)/\(id)")
    }

    public static func oEmbedURL(for link: URL) -> URL? {
        var components = URLComponents(string: "https://open.spotify.com/oembed")
        components?.queryItems = [URLQueryItem(name: "url", value: link.absoluteString)]
        return components?.url
    }

    public static func embedPageURL(kind: Kind, id: String) -> URL? {
        URL(string: "https://open.spotify.com/embed/\(kind.rawValue)/\(id)")
    }

    /// Title and cover from Spotify's oEmbed answer.
    public static func oEmbed(_ data: Data) -> (title: String, artwork: URL?)? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let title = (json["title"] as? String)?.trimmingCharacters(in: .whitespaces), !title.isEmpty
        else { return nil }
        return (title, (json["thumbnail_url"] as? String).flatMap(URL.init(string:)))
    }

    /// The artists the embed page names, joined: "The Weeknd", "Dua Lipa, DaBaby".
    /// Best effort — the page is Spotify's, not an API; nil when it changes.
    public static func embedArtists(_ html: String) -> String? {
        guard let start = html.range(of: #"<script id="__NEXT_DATA__" type="application/json">"#),
              let end = html.range(of: "</script>", range: start.upperBound..<html.endIndex),
              let data = String(html[start.upperBound..<end.lowerBound]).data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let entity = ((((root["props"] as? [String: Any])?["pageProps"] as? [String: Any])?["state"] as? [String: Any])?["data"] as? [String: Any])?["entity"] as? [String: Any]
        else { return nil }
        let names = (entity["artists"] as? [[String: Any]] ?? []).compactMap { $0["name"] as? String }
        if !names.isEmpty { return names.joined(separator: ", ") }
        return (entity["subtitle"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    }

    // MARK: - Apple previews

    public struct Preview: Equatable, Sendable {
        public let title: String
        public let artist: String
        public let audio: URL
        public let artwork: URL?
    }

    public static func iTunesSearchURL(title: String, artist: String?, country: String = "BE") -> URL? {
        var components = URLComponents(string: "https://itunes.apple.com/search")
        components?.queryItems = [
            URLQueryItem(name: "term", value: [title, artist].compactMap { $0 }.joined(separator: " ")),
            URLQueryItem(name: "entity", value: "song"),
            URLQueryItem(name: "limit", value: "8"),
            URLQueryItem(name: "country", value: country),
        ]
        return components?.url
    }

    /// The search result that is this song: the title must match, and the
    /// artist too when one is known. A different song is worse than none.
    public static func preview(in data: Data, title: String, artist: String?) -> Preview? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let results = json["results"] as? [[String: Any]]
        else { return nil }
        let wantedTitle = simple(title)
        let wantedArtist = artist.map(simple)
        let candidates = results.compactMap { result -> (Preview, Int)? in
            guard let name = result["trackName"] as? String,
                  let by = result["artistName"] as? String,
                  let audio = (result["previewUrl"] as? String).flatMap(URL.init(string:))
            else { return nil }
            let gotTitle = simple(name)
            guard gotTitle == wantedTitle || gotTitle.hasPrefix(wantedTitle) || wantedTitle.hasPrefix(gotTitle) else { return nil }
            var score = gotTitle == wantedTitle ? 2 : 1
            if let wantedArtist {
                let gotArtist = simple(by)
                let firstWanted = wantedArtist.split(separator: " ").prefix(2).joined(separator: " ")
                guard gotArtist.contains(firstWanted) || wantedArtist.contains(gotArtist) else { return nil }
                score += 2
            }
            let art = (result["artworkUrl100"] as? String).map { $0.replacingOccurrences(of: "100x100", with: "300x300") }
            return (Preview(title: name, artist: by, audio: audio, artwork: art.flatMap(URL.init(string:))), score)
        }
        return candidates.max { $0.1 < $1.1 }?.0
    }

    /// "Blinding Lights (Remastered) - Radio Edit" → "blinding lights".
    static func simple(_ text: String) -> String {
        var value = text.lowercased().folding(options: .diacriticInsensitive, locale: nil)
        for cut in [" (", " [", " - "] {
            if let range = value.range(of: cut) { value = String(value[..<range.lowerBound]) }
        }
        return value
            .replacingOccurrences(of: "&", with: "and")
            .filter { $0.isLetter || $0.isNumber || $0 == " " }
            .split(separator: " ").joined(separator: " ")
    }
}
