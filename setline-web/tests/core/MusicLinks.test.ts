// Port of ios/SetlineCore/Tests/SetlineCoreTests/MusicLinksTests.swift.
import { test } from "node:test";
import { MusicLinks } from "../../src/core/Social/MusicLinks";
import { urlHost } from "../../src/core/Support/nutrition";
import { assertEqual, assertNil } from "../helpers";

test("testSpotifyLinksAreRecognised", () => {
  assertEqual(MusicLinks.spotify("https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b?si=abc")?.id, "0VjIjW4GlUZAMYd2vXMi3b");
  assertEqual(MusicLinks.spotify("https://open.spotify.com/intl-nl/track/0VjIjW4GlUZAMYd2vXMi3b")?.kind, "track");
  assertEqual(MusicLinks.spotify("spotify:playlist:37i9dQZF1DX76Wlfdnj7AP")?.kind, "playlist");
  assertNil(MusicLinks.spotify("https://music.apple.com/be/album/x/1"));
  assertNil(MusicLinks.spotify("Till I Collapse – Eminem"));
});

test("testOEmbedGivesTitleAndCover", () => {
  const data = `{"title":"Blinding Lights","thumbnail_url":"https://image-cdn-fa.spotifycdn.com/image/ab67"}`;
  const info = MusicLinks.oEmbed(data);
  if (info === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(info.title, "Blinding Lights");
  assertEqual(info.artwork === undefined ? undefined : urlHost(info.artwork), "image-cdn-fa.spotifycdn.com");
});

test("testEmbedPageNamesTheArtists", () => {
  const html = `<html><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"state":{"data":{"entity":{"name":"Levitating","artists":[{"name":"Dua Lipa"},{"name":"DaBaby"}]}}}}}}</script></html>`;
  assertEqual(MusicLinks.embedArtists(html), "Dua Lipa, DaBaby");
  assertNil(MusicLinks.embedArtists("<html></html>"));
});

test("testPreviewMatchesTitleAndArtistOnly", () => {
  const data = `
  {"results":[
    {"trackName":"Blinding Lights (Cover)","artistName":"Some Band","previewUrl":"https://a/cover.m4a","artworkUrl100":"https://i/100x100bb.jpg"},
    {"trackName":"Blinding Lights","artistName":"The Weeknd","previewUrl":"https://a/real.m4a","artworkUrl100":"https://i/100x100bb.jpg"}
  ]}`;
  const preview = MusicLinks.preview({ in: data, title: "Blinding Lights", artist: "The Weeknd" });
  if (preview === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(preview.audio, "https://a/real.m4a");
  assertEqual(preview.artwork, "https://i/300x300bb.jpg");
  assertNil(MusicLinks.preview({ in: data, title: "Save Your Tears", artist: "The Weeknd" }));
});
