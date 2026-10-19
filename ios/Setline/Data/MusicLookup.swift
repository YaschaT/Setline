import AVFoundation
import Foundation
import Observation
import SetlineCore
import SwiftUI

/// What a song on a post looks and sounds like: its cover, and a 30-second
/// preview to play inside Setline. Found without any account — Spotify's
/// public oEmbed and embed page for a pasted link, Apple's iTunes search for
/// the preview — and kept in memory so a feed asks once per song.
actor MusicLookup {
    static let shared = MusicLookup()

    struct Media: Sendable, Equatable {
        var artwork: URL?
        var preview: URL?
    }

    /// A pasted Spotify link, read: title, artist and the clean link.
    struct LinkInfo: Sendable {
        let kind: MusicLinks.Kind
        let title: String
        let artist: String?
        let url: URL
        let artwork: URL?
    }

    private var media: [String: Media] = [:]
    private var links: [String: LinkInfo] = [:]
    private let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 10
        return URLSession(configuration: configuration)
    }()

    func link(_ text: String) async -> LinkInfo? {
        guard let (kind, id) = MusicLinks.spotify(text), let url = MusicLinks.spotifyURL(kind: kind, id: id) else { return nil }
        if let known = links[url.absoluteString] { return known }
        guard let oEmbedURL = MusicLinks.oEmbedURL(for: url),
              let (data, _) = try? await session.data(from: oEmbedURL),
              let info = MusicLinks.oEmbed(data)
        else { return nil }
        var artist: String?
        if kind == .track || kind == .album, let page = MusicLinks.embedPageURL(kind: kind, id: id) {
            var request = URLRequest(url: page)
            request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)", forHTTPHeaderField: "User-Agent")
            if let (html, _) = try? await session.data(for: request) {
                artist = MusicLinks.embedArtists(String(decoding: html, as: UTF8.self))
            }
        }
        let read = LinkInfo(kind: kind, title: info.title, artist: artist, url: url, artwork: info.artwork)
        links[url.absoluteString] = read
        if let artwork = info.artwork { media[key(info.title, artist, url.absoluteString), default: Media()].artwork = artwork }
        return read
    }

    /// Cover and preview for a song as a post stores it. A playlist gets its
    /// cover only.
    func media(title: String, artist: String?, url: String?, isPlaylist: Bool) async -> Media {
        let cacheKey = key(title, artist, url)
        if let known = media[cacheKey], known.preview != nil || isPlaylist || known.artwork == nil { return known }
        var result = media[cacheKey] ?? Media()

        if result.artwork == nil, let url, MusicLinks.spotify(url) != nil, let info = await link(url) {
            result.artwork = info.artwork
        }
        if !isPlaylist,
           let search = MusicLinks.iTunesSearchURL(title: title, artist: artist),
           let (data, _) = try? await session.data(from: search),
           let preview = MusicLinks.preview(in: data, title: title, artist: artist) {
            result.preview = preview.audio
            if result.artwork == nil { result.artwork = preview.artwork }
        }
        media[cacheKey] = result
        return result
    }

    private func key(_ title: String, _ artist: String?, _ url: String?) -> String {
        "\(title.lowercased())|\((artist ?? "").lowercased())|\(url ?? "")"
    }
}

/// One preview at a time, played inside Setline. Starting another song stops
/// the first; leaving the screen doesn't need to — it ends on its own.
@MainActor
@Observable
final class PreviewPlayer {
    static let shared = PreviewPlayer()

    private(set) var playingID: String?
    /// 0…1 through the clip.
    private(set) var progress: Double = 0
    private var player: AVPlayer?
    private var observer: Any?
    private var endObserver: NSObjectProtocol?

    func toggle(id: String, url: URL) {
        if playingID == id {
            stop()
        } else {
            play(id: id, url: url)
        }
    }

    func play(id: String, url: URL) {
        stop()
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        let item = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: item)
        self.player = player
        playingID = id
        progress = 0
        observer = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.2, preferredTimescale: 600), queue: .main) { [weak self] time in
            MainActor.assumeIsolated {
                guard let self, let duration = self.player?.currentItem?.duration.seconds, duration.isFinite, duration > 0 else { return }
                self.progress = min(1, time.seconds / duration)
            }
        }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.stop() }
        }
        player.play()
    }

    func stop() {
        if let observer { player?.removeTimeObserver(observer) }
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        observer = nil
        endObserver = nil
        player?.pause()
        player = nil
        playingID = nil
        progress = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}


/// A song or playlist as a post shows it: the cover, with a play button on
/// it when there is a preview, the title and artist, and the way to the
/// full song in its own app.
struct TrackRow: View {
    let id: String
    let title: String
    let artist: String?
    let url: String?
    let isPlaylist: Bool
    var size: CGFloat = 48
    var showsLink = true

    @State private var media: MusicLookup.Media?
    private let player = PreviewPlayer.shared

    private var isPlaying: Bool { player.playingID == id }

    var body: some View {
        HStack(spacing: SL.Space.s3) {
            cover
            VStack(alignment: .leading, spacing: 1) {
                Text(title).slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary).lineLimit(1)
                Text(subtitle).slMeta().foregroundStyle(isPlaying ? SL.Signal.action : SL.Ink.secondary).lineLimit(1)
            }
            Spacer(minLength: SL.Space.s2)
            if showsLink, let link = url.flatMap(URL.init(string:)) {
                Link(destination: link) {
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                }
                .accessibilityLabel(link.host()?.contains("spotify") == true ? "Open in Spotify" : "Open the link")
            }
        }
        .task(id: "\(title)|\(artist ?? "")|\(url ?? "")") {
            media = await MusicLookup.shared.media(title: title, artist: artist, url: url, isPlaylist: isPlaylist)
        }
    }

    private var subtitle: String {
        if isPlaying { return "Playing preview" }
        if isPlaylist { return url.flatMap { URL(string: $0)?.host() }.map { $0.contains("spotify") ? "Spotify playlist" : "Playlist" } ?? "Playlist" }
        return artist ?? (media?.preview != nil ? "Tap the cover to listen" : "")
    }

    private var cover: some View {
        Button {
            if let preview = media?.preview { player.toggle(id: id, url: preview) }
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous).fill(SL.Surface.raised2)
                if let artwork = media?.artwork {
                    AsyncImage(url: artwork) { image in
                        image.resizable().aspectRatio(contentMode: .fill)
                    } placeholder: { Color.clear }
                } else {
                    Image(systemName: isPlaylist ? "music.note.list" : "music.note")
                        .font(.system(size: size * 0.35, weight: .semibold))
                        .foregroundStyle(SL.Ink.secondary)
                }
                if media?.preview != nil {
                    Circle().fill(.black.opacity(0.55)).frame(width: size * 0.62, height: size * 0.62)
                    if isPlaying {
                        Circle()
                            .trim(from: 0, to: player.progress)
                            .stroke(SL.Signal.action, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .frame(width: size * 0.62, height: size * 0.62)
                    }
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: size * 0.24, weight: .bold))
                        .foregroundStyle(.white)
                }
            }
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.94))
        .disabled(media?.preview == nil)
        .accessibilityLabel(media?.preview == nil ? title : (isPlaying ? "Stop preview of \(title)" : "Play a preview of \(title)"))
    }
}
