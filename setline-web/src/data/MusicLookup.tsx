// MusicLookup.swift — what a song on a post looks and sounds like: its cover,
// and a 30-second preview to play inside Setline. Found without any account —
// Spotify's public oEmbed for a pasted link, Apple's iTunes search for the
// preview — and kept in memory so a feed asks once per song.
//
// Web differences: Spotify's embed page (where iOS reads a track's artists)
// cannot be read from a browser page (no CORS, and no User-Agent header), so
// a pasted Spotify link comes back without an artist; the iTunes search falls
// back to JSONP when the browser refuses the plain request.
import { useEffect, useState, useSyncExternalStore } from "react";
import { MusicLinks, type MusicLinks_Kind } from "../core/Social/MusicLinks";
import { HStack, Spacer, Text, VStack, ZStack } from "../design/swiftui";
import { SL } from "../design/tokens";
import { SFSymbol } from "../design/SFSymbol";
import { SLPress } from "../design/components/SLPress";
import { slBody, slMeta } from "../design/components/SLText";

export interface MusicLookup_Media {
  artwork?: string;
  preview?: string;
}

/** A pasted Spotify link, read: title, artist and the clean link. */
export interface MusicLookup_LinkInfo {
  kind: MusicLinks_Kind;
  title: string;
  artist?: string;
  url: string;
  artwork?: string;
}

/** `URLSessionConfiguration.timeoutIntervalForRequest = 10`. */
async function fetchText(url: string): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return await response.text();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

let jsonpCounter = 0;

/** The iTunes search as JSONP, for a browser that refuses the plain request. */
function jsonp(url: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const name = `__slMusic${++jsonpCounter}`;
    const script = document.createElement("script");
    const w = window as unknown as Record<string, unknown>;
    const done = (value: string | undefined) => {
      clearTimeout(timer);
      delete w[name];
      script.remove();
      resolve(value);
    };
    const timer = setTimeout(() => done(undefined), 10_000);
    w[name] = (data: unknown) => done(JSON.stringify(data));
    script.onerror = () => done(undefined);
    script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${name}`;
    document.head.appendChild(script);
  });
}

export class MusicLookup {
  static readonly shared = new MusicLookup();

  private mediaCache = new Map<string, MusicLookup_Media>();
  private links = new Map<string, MusicLookup_LinkInfo>();

  async link(text: string): Promise<MusicLookup_LinkInfo | undefined> {
    const found = MusicLinks.spotify(text);
    if (!found) return undefined;
    const { kind, id } = found;
    const url = MusicLinks.spotifyURL({ kind, id });
    if (!url) return undefined;
    const known = this.links.get(url);
    if (known) return known;
    const oEmbedURL = MusicLinks.oEmbedURL({ for: url });
    if (!oEmbedURL) return undefined;
    const data = await fetchText(oEmbedURL);
    const info = data === undefined ? undefined : MusicLinks.oEmbed(data);
    if (!info) return undefined;
    let artist: string | undefined;
    if (kind === "track" || kind === "album") {
      const page = MusicLinks.embedPageURL({ kind, id });
      if (page) {
        const html = await fetchText(page);
        if (html !== undefined) artist = MusicLinks.embedArtists(html);
      }
    }
    const read: MusicLookup_LinkInfo = { kind, title: info.title, artist, url, artwork: info.artwork };
    this.links.set(url, read);
    if (info.artwork) {
      const k = this.key(info.title, artist, url);
      this.mediaCache.set(k, { ...(this.mediaCache.get(k) ?? {}), artwork: info.artwork });
    }
    return read;
  }

  /** Cover and preview for a song as a post stores it. A playlist gets its cover only. */
  async media(a: { title: string; artist?: string; url?: string; isPlaylist: boolean }): Promise<MusicLookup_Media> {
    const cacheKey = this.key(a.title, a.artist, a.url);
    const known = this.mediaCache.get(cacheKey);
    if (known && (known.preview !== undefined || a.isPlaylist || known.artwork === undefined)) return known;
    const result: MusicLookup_Media = { ...(known ?? {}) };

    if (result.artwork === undefined && a.url !== undefined && MusicLinks.spotify(a.url) !== undefined) {
      const info = await this.link(a.url);
      if (info) result.artwork = info.artwork;
    }
    if (!a.isPlaylist) {
      const search = MusicLinks.iTunesSearchURL({ title: a.title, artist: a.artist });
      if (search) {
        const data = (await fetchText(search)) ?? (await jsonp(search));
        const preview = data === undefined ? undefined : MusicLinks.preview({ in: data, title: a.title, artist: a.artist });
        if (preview) {
          result.preview = preview.audio;
          if (result.artwork === undefined) result.artwork = preview.artwork;
        }
      }
    }
    this.mediaCache.set(cacheKey, result);
    return result;
  }

  private key(title: string, artist: string | undefined, url: string | undefined): string {
    return `${title.toLowerCase()}|${(artist ?? "").toLowerCase()}|${url ?? ""}`;
  }
}

/**
 * One preview at a time, played inside Setline. Starting another song stops
 * the first; leaving the screen doesn't need to — it ends on its own.
 */
export class PreviewPlayer {
  static readonly shared = new PreviewPlayer();

  playingID: string | undefined;
  /** 0…1 through the clip. */
  progress = 0;
  private player: HTMLAudioElement | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  private listeners = new Set<() => void>();
  private version = 0;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getVersion = (): number => this.version;
  private changed(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  toggle(a: { id: string; url: string }): void {
    if (this.playingID === a.id) this.stop();
    else this.play(a);
  }

  play(a: { id: string; url: string }): void {
    this.stop();
    const player = new Audio(a.url);
    this.player = player;
    this.playingID = a.id;
    this.progress = 0;
    this.timer = setInterval(() => {
      const duration = this.player?.duration;
      if (!this.player || duration === undefined || !Number.isFinite(duration) || duration <= 0) return;
      this.progress = Math.min(1, this.player.currentTime / duration);
      this.changed();
    }, 200);
    player.addEventListener("ended", () => {
      if (this.player === player) this.stop();
    });
    void player.play().catch(() => {
      if (this.player === player) this.stop();
    });
    this.changed();
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.player?.pause();
    this.player = undefined;
    this.playingID = undefined;
    this.progress = 0;
    this.changed();
  }
}

function usePreviewPlayer(): PreviewPlayer {
  useSyncExternalStore(PreviewPlayer.shared.subscribe, PreviewPlayer.shared.getVersion);
  return PreviewPlayer.shared;
}

function hostOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}

/**
 * A song or playlist as a post shows it: the cover, with a play button on it
 * when there is a preview, the title and artist, and the way to the full
 * song in its own app.
 */
export function TrackRow({
  id,
  title,
  artist,
  url,
  isPlaylist,
  size = 48,
  showsLink = true,
}: {
  id: string;
  title: string;
  artist?: string;
  url?: string;
  isPlaylist: boolean;
  size?: number;
  showsLink?: boolean;
}) {
  const [media, setMedia] = useState<MusicLookup_Media | undefined>(undefined);
  const player = usePreviewPlayer();
  const isPlaying = player.playingID === id;

  const taskID = `${title}|${artist ?? ""}|${url ?? ""}`;
  useEffect(() => {
    let live = true;
    void MusicLookup.shared.media({ title, artist, url, isPlaylist }).then((m) => {
      if (live) setMedia(m);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskID]);

  const subtitle = (() => {
    if (isPlaying) return "Playing preview";
    if (isPlaylist) {
      const host = hostOf(url);
      return host === undefined ? "Playlist" : host.includes("spotify") ? "Spotify playlist" : "Playlist";
    }
    return artist ?? (media?.preview !== undefined ? "Tap the cover to listen" : "");
  })();

  let link: string | undefined;
  if (url !== undefined) {
    try {
      link = new URL(url).href;
    } catch {
      link = undefined;
    }
  }

  const ring = size * 0.62;
  const cover = (
    <SLPress
      scale={0.94}
      disabled={media?.preview === undefined}
      onPress={() => {
        if (media?.preview !== undefined) player.toggle({ id, url: media.preview });
      }}
      aria-label={media?.preview === undefined ? title : isPlaying ? `Stop preview of ${title}` : `Play a preview of ${title}`}
      style={{ flexShrink: 0 }}
    >
      <ZStack style={{ width: size, height: size, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ gridArea: "1 / 1", width: size, height: size, borderRadius: 8, background: SL.Surface.raised2 }} />
        {media?.artwork !== undefined ? (
          <img src={media.artwork} alt="" style={{ gridArea: "1 / 1", width: size, height: size, objectFit: "cover" }} />
        ) : (
          <div style={{ gridArea: "1 / 1", display: "flex" }}>
            <SFSymbol name={isPlaylist ? "music.note.list" : "music.note"} size={size * 0.35} weight={600} color={SL.Ink.secondary} />
          </div>
        )}
        {media?.preview !== undefined && (
          <>
            <div style={{ gridArea: "1 / 1", width: ring, height: ring, borderRadius: "50%", background: "rgba(0,0,0,0.55)" }} />
            {isPlaying && (
              <svg width={ring} height={ring} style={{ gridArea: "1 / 1", transform: "rotate(-90deg)", overflow: "visible" }} aria-hidden>
                <circle
                  cx={ring / 2}
                  cy={ring / 2}
                  r={ring / 2}
                  fill="none"
                  stroke={SL.Signal.action}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray={`${player.progress} 1`}
                />
              </svg>
            )}
            <div style={{ gridArea: "1 / 1", display: "flex" }}>
              <SFSymbol name={isPlaying ? "pause.fill" : "play.fill"} size={size * 0.24} weight={700} color="#fff" />
            </div>
          </>
        )}
      </ZStack>
    </SLPress>
  );

  return (
    <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
      {cover}
      <VStack alignment="leading" spacing={1} style={{ minWidth: 0 }}>
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary} lineLimit={1}>{title}</Text>
        <Text {...slMeta()} color={isPlaying ? SL.Signal.action : SL.Ink.secondary} lineLimit={1}>{subtitle}</Text>
      </VStack>
      <Spacer minLength={SL.Space.s2} />
      {showsLink && link !== undefined && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={hostOf(link)?.includes("spotify") ? "Open in Spotify" : "Open the link"}
          style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <SFSymbol name="arrow.up.right" size={13} weight={600} color={SL.Ink.secondary} />
        </a>
      )}
    </HStack>
  );
}
