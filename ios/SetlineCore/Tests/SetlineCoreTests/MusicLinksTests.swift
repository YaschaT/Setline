import XCTest
@testable import SetlineCore

final class MusicLinksTests: XCTestCase {
    func testSpotifyLinksAreRecognised() {
        XCTAssertEqual(MusicLinks.spotify("https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b?si=abc")?.id, "0VjIjW4GlUZAMYd2vXMi3b")
        XCTAssertEqual(MusicLinks.spotify("https://open.spotify.com/intl-nl/track/0VjIjW4GlUZAMYd2vXMi3b")?.kind, .track)
        XCTAssertEqual(MusicLinks.spotify("spotify:playlist:37i9dQZF1DX76Wlfdnj7AP")?.kind, .playlist)
        XCTAssertNil(MusicLinks.spotify("https://music.apple.com/be/album/x/1"))
        XCTAssertNil(MusicLinks.spotify("Till I Collapse – Eminem"))
    }

    func testOEmbedGivesTitleAndCover() throws {
        let data = #"{"title":"Blinding Lights","thumbnail_url":"https://image-cdn-fa.spotifycdn.com/image/ab67"}"#.data(using: .utf8)!
        let info = try XCTUnwrap(MusicLinks.oEmbed(data))
        XCTAssertEqual(info.title, "Blinding Lights")
        XCTAssertEqual(info.artwork?.host(), "image-cdn-fa.spotifycdn.com")
    }

    func testEmbedPageNamesTheArtists() {
        let html = #"<html><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"state":{"data":{"entity":{"name":"Levitating","artists":[{"name":"Dua Lipa"},{"name":"DaBaby"}]}}}}}}</script></html>"#
        XCTAssertEqual(MusicLinks.embedArtists(html), "Dua Lipa, DaBaby")
        XCTAssertNil(MusicLinks.embedArtists("<html></html>"))
    }

    func testPreviewMatchesTitleAndArtistOnly() throws {
        let data = """
        {"results":[
          {"trackName":"Blinding Lights (Cover)","artistName":"Some Band","previewUrl":"https://a/cover.m4a","artworkUrl100":"https://i/100x100bb.jpg"},
          {"trackName":"Blinding Lights","artistName":"The Weeknd","previewUrl":"https://a/real.m4a","artworkUrl100":"https://i/100x100bb.jpg"}
        ]}
        """.data(using: .utf8)!
        let preview = try XCTUnwrap(MusicLinks.preview(in: data, title: "Blinding Lights", artist: "The Weeknd"))
        XCTAssertEqual(preview.audio.absoluteString, "https://a/real.m4a")
        XCTAssertEqual(preview.artwork?.absoluteString, "https://i/300x300bb.jpg")
        XCTAssertNil(MusicLinks.preview(in: data, title: "Save Your Tears", artist: "The Weeknd"))
    }
}
