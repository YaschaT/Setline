import {
  asArray,
  asObject,
  asString,
  foldingDiacritics,
  graphemes,
  isLetterChar,
  isNumberChar,
  jsonObject,
  queryString,
  splitOn,
  swiftContains,
  trimmingWhitespaces,
  trimmingWhitespacesAndNewlines,
  urlFromString,
  urlHost,
  urlPathComponents,
} from "../Support/nutrition";
import { maxBy } from "../Support/swift";

export type MusicLinks_Kind = "track" | "album" | "playlist" | "artist" | "episode";

export const MusicLinks_Kind = {
  track: "track" as MusicLinks_Kind,
  album: "album" as MusicLinks_Kind,
  playlist: "playlist" as MusicLinks_Kind,
  artist: "artist" as MusicLinks_Kind,
  episode: "episode" as MusicLinks_Kind,
  allCases: ["track", "album", "playlist", "artist", "episode"] as MusicLinks_Kind[],

  /** `Kind(rawValue:)`. */
  fromRawValue(rawValue: string): MusicLinks_Kind | undefined {
    return (MusicLinks_Kind.allCases as string[]).includes(rawValue) ? (rawValue as MusicLinks_Kind) : undefined;
  },
};

export interface MusicLinks_Preview {
  title: string;
  artist: string;
  /** Swift `URL`s, kept as their absolute strings. */
  audio: string;
  artwork?: string;
}

/**
 * Reading a music link without any account: Spotify's public oEmbed answer
 * and embed page name the track and its cover, and Apple's iTunes search
 * has a 30-second preview of nearly every song. Nothing here signs in.
 */
export const MusicLinks = {
  /**
   * "https://open.spotify.com/track/0Vj…?si=…" → (.track, "0Vj…").
   * Also the intl-xx form and spotify: URIs.
   */
  spotify(text: string): { kind: MusicLinks_Kind; id: string } | undefined {
    const trimmed = trimmingWhitespacesAndNewlines(text);
    if (trimmed.startsWith("spotify:")) {
      const parts = splitOn(trimmed, ":");
      const kind = parts.length >= 3 ? MusicLinks_Kind.fromRawValue(parts[1]) : undefined;
      if (kind === undefined) return undefined;
      return { kind, id: parts[2] };
    }
    const url = urlFromString(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url === undefined ? undefined : urlHost(url);
    if (url === undefined || host === undefined || !host.endsWith("spotify.com")) return undefined;
    const parts = urlPathComponents(url).filter((p) => p !== "/" && !p.startsWith("intl-"));
    const kind = parts.length >= 2 ? MusicLinks_Kind.fromRawValue(parts[0]) : undefined;
    if (kind === undefined || parts[1] === "") return undefined;
    return { kind, id: parts[1] };
  },

  /** The canonical link for a Spotify item, without tracking parameters. */
  spotifyURL(a: { kind: MusicLinks_Kind; id: string }): string | undefined {
    return urlFromString(`https://open.spotify.com/${a.kind}/${a.id}`);
  },

  oEmbedURL(a: { for: string }): string | undefined {
    return `https://open.spotify.com/oembed?${queryString([{ name: "url", value: a.for }])}`;
  },

  embedPageURL(a: { kind: MusicLinks_Kind; id: string }): string | undefined {
    return urlFromString(`https://open.spotify.com/embed/${a.kind}/${a.id}`);
  },

  /** Title and cover from Spotify's oEmbed answer. */
  oEmbed(data: string): { title: string; artwork?: string } | undefined {
    const json = asObject(jsonObject(data));
    const raw = json === undefined ? undefined : asString(json["title"]);
    const title = raw === undefined ? undefined : trimmingWhitespaces(raw);
    if (json === undefined || title === undefined || title === "") return undefined;
    const thumbnail = asString(json["thumbnail_url"]);
    return { title, artwork: thumbnail === undefined ? undefined : urlFromString(thumbnail) };
  },

  /**
   * The artists the embed page names, joined: "The Weeknd", "Dua Lipa, DaBaby".
   * Best effort — the page is Spotify's, not an API; nil when it changes.
   */
  embedArtists(html: string): string | undefined {
    const opening = `<script id="__NEXT_DATA__" type="application/json">`;
    const start = html.indexOf(opening);
    if (start < 0) return undefined;
    const upper = start + opening.length;
    const end = html.indexOf("</script>", upper);
    if (end < 0) return undefined;
    const root = asObject(jsonObject(html.slice(upper, end)));
    const entity = asObject(asObject(asObject(asObject(asObject(root?.["props"])?.["pageProps"])?.["state"])?.["data"])?.["entity"]);
    if (entity === undefined) return undefined;
    const artists = asArray(entity["artists"]);
    const list = artists !== undefined && artists.every((a) => asObject(a) !== undefined) ? artists.map((a) => asObject(a)!) : [];
    const names = list.map((artist) => asString(artist["name"])).filter((n): n is string => n !== undefined);
    if (names.length !== 0) return names.join(", ");
    const subtitle = asString(entity["subtitle"]);
    return subtitle === undefined || subtitle === "" ? undefined : subtitle;
  },

  // MARK: - Apple previews

  iTunesSearchURL(a: { title: string; artist: string | undefined; country?: string }): string | undefined {
    const country = a.country ?? "BE";
    return `https://itunes.apple.com/search?${queryString([
      { name: "term", value: [a.title, a.artist].filter((x): x is string => x !== undefined).join(" ") },
      { name: "entity", value: "song" },
      { name: "limit", value: "8" },
      { name: "country", value: country },
    ])}`;
  },

  /**
   * The search result that is this song: the title must match, and the
   * artist too when one is known. A different song is worse than none.
   */
  preview(a: { in: string; title: string; artist: string | undefined }): MusicLinks_Preview | undefined {
    const json = asObject(jsonObject(a.in));
    const resultsRaw = json === undefined ? undefined : asArray(json["results"]);
    if (resultsRaw === undefined || !resultsRaw.every((r) => asObject(r) !== undefined)) return undefined;
    const results = resultsRaw.map((r) => asObject(r)!);
    const wantedTitle = MusicLinks.simple(a.title);
    const wantedArtist = a.artist === undefined ? undefined : MusicLinks.simple(a.artist);
    const candidates: [MusicLinks_Preview, number][] = [];
    for (const result of results) {
      const name = asString(result["trackName"]);
      const by = asString(result["artistName"]);
      const previewUrl = asString(result["previewUrl"]);
      const audio = previewUrl === undefined ? undefined : urlFromString(previewUrl);
      if (name === undefined || by === undefined || audio === undefined) continue;
      const gotTitle = MusicLinks.simple(name);
      if (!(gotTitle === wantedTitle || gotTitle.startsWith(wantedTitle) || wantedTitle.startsWith(gotTitle))) continue;
      let score = gotTitle === wantedTitle ? 2 : 1;
      if (wantedArtist !== undefined) {
        const gotArtist = MusicLinks.simple(by);
        const firstWanted = splitOn(wantedArtist, " ").slice(0, 2).join(" ");
        if (!(swiftContains(gotArtist, firstWanted) || swiftContains(wantedArtist, gotArtist))) continue;
        score += 2;
      }
      const artRaw = asString(result["artworkUrl100"]);
      const art = artRaw === undefined ? undefined : artRaw.replaceAll("100x100", "300x300");
      candidates.push([{ title: name, artist: by, audio, artwork: art === undefined ? undefined : urlFromString(art) }, score]);
    }
    return maxBy(candidates, (l, r) => l[1] < r[1])?.[0];
  },

  /** "Blinding Lights (Remastered) - Radio Edit" → "blinding lights". */
  simple(text: string): string {
    let value = foldingDiacritics(text.toLowerCase());
    for (const cut of [" (", " [", " - "]) {
      const index = value.indexOf(cut);
      if (index >= 0) value = value.slice(0, index);
    }
    const kept = graphemes(value.replaceAll("&", "and")).filter((ch) => isLetterChar(ch) || isNumberChar(ch) || ch === " ").join("");
    return splitOn(kept, " ").join(" ");
  },
};
