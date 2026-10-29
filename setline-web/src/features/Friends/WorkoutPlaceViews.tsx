// WorkoutPlaceViews.swift — where a workout happened: finding gyms, the
// finish screen's row, the composer's card, the picker sheet and the place on
// a post.
//
// Web: MapKit and CoreLocation have no browser equivalent. The location is
// read once with the Geolocation API. Gyms near you come from OpenStreetMap
// (Overpass: fitness centres within 10 km, plus Photon's word search for
// "gym"), the search-as-you-type from Photon (komoot's OSM geocoder), and the
// map on a post is drawn from CARTO's dark OpenStreetMap tiles, with their
// required credit where Apple's Maps mark sits. "Open in Maps" opens Google
// Maps at the place.
import { Suspense, lazy, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { trimmingWhitespaces, charCount } from "../../core/Support/nutrition";
import { compare, deepEqual, rounded } from "../../core/Support/swift";
import { HStack, Sheet, Spacer, Text, VStack, type Binding } from "../../design/swiftui";
import { SL, slFont } from "../../design/tokens";
import { SFSymbol } from "../../design/SFSymbol";
import { SLOutlineButton, colorOpacity } from "../../design/SetlineTokens";
import { SLSheet } from "../../design/components/SLSheet";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLPress } from "../../design/components/SLPress";
import { SLRowButton } from "../../design/components/SLPieces";
import { slBody, slLead, slMeta } from "../../design/components/SLText";
import { PressButton } from "../../design/support";
import { WorkoutPlace, WorkoutPlace_Kind } from "../../data/SocialStore";
import { ProgressView } from "./InviteViews";

interface Coordinate {
  latitude: number;
  longitude: number;
}

/** `CLLocation.distance(from:)`, on a sphere. */
function distanceBetween(a: Coordinate, b: Coordinate): number {
  const r = 6_371_008.8;
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function fetchJSON(url: string, init?: RequestInit): Promise<unknown | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

interface FoundItem {
  name?: string;
  coordinate: Coordinate;
  subtitle: string;
}

const PHOTON = "https://photon.komoot.io/api/";

/** Photon's answer as map items: a name, where it is, and its address line. */
function photonItems(json: unknown): FoundItem[] {
  const features = ((json as { features?: unknown[] } | undefined)?.features ?? []) as {
    geometry?: { coordinates?: [number, number] };
    properties?: Record<string, string | undefined>;
  }[];
  const items: FoundItem[] = [];
  for (const f of features) {
    const c = f.geometry?.coordinates;
    const p = f.properties ?? {};
    if (!c) continue;
    const street = [p.street, p.housenumber].filter(Boolean).join(" ");
    const town = [p.postcode, p.city ?? p.town ?? p.village].filter(Boolean).join(" ");
    const name = p.name ?? (street !== "" ? street : undefined);
    const subtitle = [name === street ? undefined : street, town, p.country].filter((s) => s !== undefined && s !== "").join(", ");
    items.push({ name, coordinate: { latitude: c[1], longitude: c[0] }, subtitle });
  }
  return items;
}

// MARK: - Finding gyms

export type NearbyGyms_State =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "denied" }
  | { kind: "found"; value: WorkoutPlace[] }
  | { kind: "failed" };

/**
 * Fitness centres around the device, found once on request: the location is
 * read a single time, never tracked, and only after the lifter asked.
 */
export class NearbyGyms {
  state: NearbyGyms_State = { kind: "idle" };
  /** Where the device was, for an outdoor workout. */
  here: Coordinate | undefined;
  /** How far each found place is, for its row. */
  distances = new Map<string, number>();

  private listeners = new Set<() => void>();
  private version = 0;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  private changed() {
    this.version++;
    for (const l of this.listeners) l();
  }

  static key(place: WorkoutPlace): string {
    return JSON.stringify([place.kind, place.name, place.latitude ?? null, place.longitude ?? null]);
  }

  async search(): Promise<void> {
    this.state = { kind: "searching" };
    this.changed();
    const reading = await NearbyGyms.currentLocation();
    if (reading === undefined || reading === "denied") {
      this.state = reading === "denied" ? { kind: "denied" } : { kind: "failed" };
      this.changed();
      return;
    }
    const location = reading;
    this.here = location;
    const { latitude: lat, longitude: lon } = location;

    // Both searches: the fitness category also holds yoga and dance studios;
    // the word search finds the gyms it files elsewhere.
    const overpass = `[out:json][timeout:15];(node["leisure"="fitness_centre"](around:10000,${lat},${lon});way["leisure"="fitness_centre"](around:10000,${lat},${lon});relation["leisure"="fitness_centre"](around:10000,${lat},${lon}););out center 100;`;
    const byCategory = fetchJSON("https://overpass-api.de/api/interpreter", { method: "POST", body: new URLSearchParams({ data: overpass }) }).then((json) => {
      const elements = ((json as { elements?: unknown[] } | undefined)?.elements ?? []) as { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[];
      return elements
        .map((e): FoundItem | undefined => {
          const la = e.lat ?? e.center?.lat;
          const lo = e.lon ?? e.center?.lon;
          if (la === undefined || lo === undefined) return undefined;
          return { name: e.tags?.name, coordinate: { latitude: la, longitude: lo }, subtitle: "" };
        })
        .filter((x): x is FoundItem => x !== undefined);
    });
    const byWord = fetchJSON(`${PHOTON}?q=gym&limit=25&lat=${lat}&lon=${lon}&location_bias_scale=0.5`).then(photonItems);
    const items = [...((await byCategory) ?? []), ...((await byWord) ?? [])];

    const seen = new Set<string>();
    const ranked = items
      .map((item) => {
        const name = item.name;
        if (name === undefined || name === "" || seen.has(name.toLowerCase())) return undefined;
        seen.add(name.toLowerCase());
        const distance = distanceBetween(location, item.coordinate);
        if (distance > 10_000) return undefined;
        const place: WorkoutPlace = { kind: "gym", name, latitude: item.coordinate.latitude, longitude: item.coordinate.longitude };
        return { place, distance, isGym: NearbyGyms.soundsLikeGym(name) };
      })
      .filter((x): x is { place: WorkoutPlace; distance: number; isGym: boolean } => x !== undefined)
      // Gyms first, each group nearest first.
      .sort((a, b) => compare([a.isGym ? 0 : 1, a.distance], [b.isGym ? 0 : 1, b.distance]))
      .slice(0, 10);

    const distances = new Map<string, number>();
    for (const r of ranked) if (!distances.has(NearbyGyms.key(r.place))) distances.set(NearbyGyms.key(r.place), r.distance);
    this.distances = distances;
    this.state = { kind: "found", value: ranked.map((r) => r.place) };
    this.changed();
  }

  private static readonly gymWords = ["gym", "fit", "crossfit", "kracht", "strength", "athlet", "training", "sport", "jims", "lift", "barbell", "powerhouse", "box"];

  private static soundsLikeGym(name: string): boolean {
    const lower = name.toLowerCase();
    return NearbyGyms.gymWords.some((w) => lower.includes(w));
  }

  /** One reading good to 500 m, then stop. The browser asks the first time. */
  private static currentLocation(): Promise<Coordinate | "denied" | undefined> {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) return resolve(undefined);
      let done = false;
      let watch: number | undefined;
      const finish = (value: Coordinate | "denied" | undefined) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (watch !== undefined) navigator.geolocation.clearWatch(watch);
        resolve(value);
      };
      const timer = setTimeout(() => finish(undefined), 30_000);
      watch = navigator.geolocation.watchPosition(
        (position) => {
          const accuracy = position.coords.accuracy;
          if (accuracy >= 0 && accuracy < 500) finish({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        },
        (error) => finish(error.code === error.PERMISSION_DENIED ? "denied" : undefined),
        { enableHighAccuracy: true, maximumAge: 0 },
      );
    });
  }
}

// MARK: - Searching by name

interface PlaceSearch_Completion {
  title: string;
  subtitle: string;
  coordinate: Coordinate;
}

/** "basic fit rijkevorsel": suggestions as you type, gyms and addresses alike, then the place for the one tapped. */
export class PlaceSearch {
  suggestions: PlaceSearch_Completion[] = [];
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private listeners = new Set<() => void>();
  private version = 0;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  private changed() {
    this.version++;
    for (const l of this.listeners) l();
  }

  update(query: string, a: { near?: Coordinate }): void {
    const trimmed = trimmingWhitespaces(query);
    const generation = ++this.generation;
    if (this.timer !== undefined) clearTimeout(this.timer);
    if (charCount(trimmed) < 2) {
      this.suggestions = [];
      this.changed();
      return;
    }
    this.timer = setTimeout(() => {
      const bias = a.near ? `&lat=${a.near.latitude}&lon=${a.near.longitude}` : "";
      void fetchJSON(`${PHOTON}?q=${encodeURIComponent(trimmed)}&limit=8${bias}`).then((json) => {
        if (generation !== this.generation) return;
        this.suggestions = photonItems(json)
          .filter((item) => item.name !== undefined)
          .slice(0, 8)
          .map((item) => ({ title: item.name as string, subtitle: item.subtitle, coordinate: item.coordinate }));
        this.changed();
      });
    }, 200);
  }

  /** The place behind a suggestion, with its coordinates. */
  async place(a: { for: PlaceSearch_Completion }): Promise<WorkoutPlace | undefined> {
    return { kind: "gym", name: a.for.title, latitude: a.for.coordinate.latitude, longitude: a.for.coordinate.longitude };
  }
}

function useObserved<T extends { subscribe: (l: () => void) => () => void; getVersion: () => number }>(make: () => T): T {
  const object = useMemo(make, []); // eslint-disable-line react-hooks/exhaustive-deps
  useSyncExternalStore(object.subscribe, object.getVersion);
  return object;
}

// MARK: - The finish screen's row

/** "Where did you train?" on the finish screen: nothing is shared until a place is picked, and the pick is for this workout only. */
export function WorkoutPlaceRow({ place }: { place: Binding<WorkoutPlace | undefined> }) {
  const [picking, setPicking] = useState(false);
  const current = place.value;
  return (
    <>
      <PressButton
        onPress={() => setPicking(true)}
        aria-label={current ? `Place: ${current.name}` : "Add where you trained"}
        title="Friends see the place on this workout. Optional."
        style={{ alignSelf: "stretch", width: "100%", background: "transparent", textAlign: "left" }}
      >
        <HStack spacing={SL.Space.s2} style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1, minHeight: SL.Space.hitMin }}>
          <div style={{ width: 22, display: "flex", justifyContent: "center", flexShrink: 0 }}>
            <SFSymbol name={current ? WorkoutPlace_Kind.symbol(current.kind) : "mappin.and.ellipse"} size={16} weight={600} color={current === undefined ? SL.Ink.secondary : SL.Signal.action} />
          </div>
          <Text {...slBody(SL.Weight.medium)} color={current === undefined ? SL.Ink.secondary : SL.Ink.primary} lineLimit={1}>
            {current?.name ?? "Add where you trained"}
          </Text>
          <Spacer minLength={SL.Space.s2} />
          <Text {...slMeta()} color={SL.Ink.tertiary}>{current === undefined ? "Optional" : "Change"}</Text>
        </HStack>
      </PressButton>
      <Sheet isPresented={picking} onDismiss={() => setPicking(false)}>
        <WorkoutPlaceSheet
          current={current}
          onPick={(picked) => {
            place.set(picked);
            if (picked?.kind === "gym") WorkoutPlace.lastGym = picked;
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      </Sheet>
    </>
  );
}

/** The post's place, near the top where it is seen: the map once picked, and before that the question with the last gym as one tap. */
export function WorkoutPlaceCard({ place }: { place: Binding<WorkoutPlace | undefined> }) {
  const [picking, setPicking] = useState(false);
  const current = place.value;
  const lastGym = WorkoutPlace.lastGym;

  const chip = (title: string, symbol: string, lit: boolean, action: () => void) => (
    <SLPress scale={0.95} onPress={action} style={{ minWidth: 0 }}>
      <HStack
        spacing={6}
        style={{
          ...slFont(SL.TypeSize.meta, SL.Weight.semibold),
          color: lit ? SL.Signal.onAction : SL.Ink.primary,
          paddingLeft: SL.Space.s3,
          paddingRight: SL.Space.s3,
          minHeight: 40,
          borderRadius: 999,
          background: lit ? SL.Signal.action : SL.Surface.raised2,
          boxShadow: lit ? undefined : `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`,
        }}
      >
        <SFSymbol name={symbol} size={13} weight={600} />
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{title}</span>
      </HStack>
    </SLPress>
  );

  return (
    <VStack
      alignment="leading"
      spacing={SL.Space.s3}
      style={{ alignSelf: "stretch", padding: SL.Space.s4, background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.lg, overflow: "hidden" }}
    >
      <HStack style={{ alignSelf: "stretch" }}>
        <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>Where did you train?</Text>
        <Spacer />
        {current !== undefined && (
          <>
            <PressButton onPress={() => setPicking(true)} style={{ ...slFont(SL.TypeSize.meta, SL.Weight.semibold), color: SL.Signal.action, minHeight: SL.Space.hitMin, background: "transparent" }}>
              Change
            </PressButton>
            <PressButton aria-label="Remove the place" onPress={() => place.set(undefined)} style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, display: "grid", placeItems: "center", background: "transparent", flexShrink: 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
                <SFSymbol name="xmark" size={12} weight={700} color={SL.Ink.secondary} />
              </div>
            </PressButton>
          </>
        )}
      </HStack>
      {current !== undefined ? (
        <PostPlaceView place={current} />
      ) : (
        <>
          <HStack spacing={SL.Space.s2} style={{ maxWidth: "100%" }}>
            {lastGym && chip(lastGym.name, "dumbbell.fill", true, () => place.set(lastGym))}
            {chip(lastGym === undefined ? "Add your gym" : "Somewhere else", "magnifyingglass", lastGym === undefined, () => setPicking(true))}
          </HStack>
          <Text {...slMeta()} color={SL.Ink.tertiary}>Optional. Friends see it on the post.</Text>
        </>
      )}
      <Sheet isPresented={picking} onDismiss={() => setPicking(false)}>
        <WorkoutPlaceSheet
          current={current}
          onPick={(picked) => {
            place.set(picked);
            if (picked?.kind === "gym") WorkoutPlace.lastGym = picked;
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      </Sheet>
    </VStack>
  );
}

/**
 * The choices, privacy first: no place, the gym from last time, gyms near you
 * (location read once, on request), home, or outdoors (shown as an area of
 * about a kilometre).
 */
export function WorkoutPlaceSheet({ current, onPick, onClose }: { current?: WorkoutPlace; onPick: (place: WorkoutPlace | undefined) => void; onClose: () => void }) {
  const gyms = useObserved(() => new NearbyGyms());
  const search = useObserved(() => new PlaceSearch());
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    search.update(query, { near: gyms.here });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  /** "350 m", "1.2 km". */
  const distance = (meters: number): string =>
    meters < 1_000 ? `${Math.trunc(rounded(meters / 10)) * 10} m away` : `${(meters / 1_000).toFixed(1)} km away`;

  const group = (content: ReactNode) => (
    <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", background: SL.Surface.raised2, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.lg, overflow: "hidden" }}>
      {content}
    </div>
  );

  const option = (key: string, title: string, symbol: string, detail: string | undefined, isOn: boolean, action: () => void) => (
    <SLRowButton key={key} onPress={action}>
      <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s2, paddingBottom: SL.Space.s2, minHeight: 56 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: isOn ? SL.Signal.actionTint : SL.Surface.raised, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <SFSymbol name={symbol} size={16} weight={600} color={isOn ? SL.Signal.action : SL.Ink.secondary} />
        </div>
        <VStack alignment="leading" spacing={1} style={{ minWidth: 0 }}>
          <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary} lineLimit={2}>{title}</Text>
          {detail !== undefined && <Text {...slMeta()} color={SL.Ink.secondary}>{detail}</Text>}
        </VStack>
        <Spacer minLength={SL.Space.s2} />
        {isOn && <SLGlyph name="check" size={16} color={SL.Signal.action} />}
      </HStack>
    </SLRowButton>
  );

  /** Typing a name is the fastest way to any gym, near or not. */
  const searchField = (
    <HStack
      spacing={SL.Space.s2}
      style={{
        alignSelf: "stretch",
        paddingLeft: SL.Space.s4,
        paddingRight: SL.Space.s4,
        minHeight: 48,
        background: SL.Surface.raised,
        borderRadius: SL.Radius.lg,
        boxShadow: `inset 0 0 0 1px ${searching ? colorOpacity(SL.Signal.action, 0.5) : SL.Surface.hairlineStrong}`,
      }}
    >
      <SFSymbol name="magnifyingglass" size={15} weight={600} color={SL.Ink.secondary} />
      <input
        className="sl-place-search"
        value={query}
        placeholder="Search a gym or address"
        enterKeyHint="search"
        autoCorrect="off"
        onFocus={() => setSearching(true)}
        onBlur={() => setSearching(false)}
        onChange={(e) => setQuery(e.target.value)}
        style={{ ...slFont(SL.TypeSize.body, SL.Weight.regular), color: SL.Ink.primary, caretColor: SL.Signal.action, background: "transparent", border: "none", outline: "none", padding: 0, flex: "1 1 0", minWidth: 0, lineHeight: 1.25 }}
      />
      <style>{`.sl-place-search::placeholder { color: ${SL.Ink.tertiary}; opacity: 1; }`}</style>
      {query !== "" && (
        <PressButton aria-label="Clear search" onPress={() => setQuery("")} style={{ background: "transparent", display: "grid", placeItems: "center" }}>
          <SFSymbol name="xmark.circle.fill" color={SL.Ink.tertiary} />
        </PressButton>
      )}
    </HStack>
  );

  /** The matches, and always the way to use the typed name as it is. */
  const searchResults = (() => {
    const typed = trimmingWhitespaces(query);
    return group(
      <>
        {search.suggestions.map((s, i) =>
          option(`s${i}${s.title}`, s.title, "mappin.circle.fill", s.subtitle === "" ? undefined : s.subtitle, current?.name === s.title, () => {
            void search.place({ for: s }).then((place) => {
              if (place) onPick(place);
            });
          }),
        )}
        {option("typed", `Use “${typed}”`, "plus.circle.fill", "Your own name, without a map", false, () => onPick({ kind: "gym", name: typed, latitude: undefined, longitude: undefined }))}
      </>,
    );
  })();

  const lastGym = WorkoutPlace.lastGym;
  const same = (a: WorkoutPlace | undefined, b: WorkoutPlace | undefined) => a !== undefined && b !== undefined && deepEqual(WorkoutPlace_norm(a), WorkoutPlace_norm(b));

  const nearby = (() => {
    const state = gyms.state;
    switch (state.kind) {
      case "idle":
        return (
          <>
            <SLOutlineButton onPress={() => void gyms.search()}>
              <HStack spacing={SL.Space.s2}>
                <SFSymbol name="location.fill" size={14} weight={600} />
                <span>Find gyms near me</span>
              </HStack>
            </SLOutlineButton>
            <Text {...slMeta()} color={SL.Ink.secondary} style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>
              Your location is read once, to find gyms. It isn't saved or shared.
            </Text>
          </>
        );
      case "searching":
        return (
          <HStack spacing={SL.Space.s2} style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>
            <ProgressView color={SL.Ink.secondary} />
            <Text {...slBody()} color={SL.Ink.secondary}>Looking for gyms nearby…</Text>
          </HStack>
        );
      case "denied":
        return (
          <Text {...slMeta()} color={SL.Ink.secondary} style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>
            Location is off for Setline. Turn it on in Settings › Setline › Location to find gyms, or pick Home.
          </Text>
        );
      case "failed":
        return (
          <Text {...slMeta()} color={SL.Ink.secondary} style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>
            Couldn't find your location just now.
          </Text>
        );
      case "found": {
        const found = state.value;
        const here = gyms.here;
        return (
          <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
            <Text {...slLead()} color={SL.Ink.primary} style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>Nearby</Text>
            {group(
              <>
                {found.length === 0 && (
                  <Text {...slBody()} color={SL.Ink.secondary} style={{ padding: SL.Space.s4, alignSelf: "stretch" }}>
                    No gyms found within 10 km. Search by name above.
                  </Text>
                )}
                {found.map((gym) => {
                  const meters = gyms.distances.get(NearbyGyms.key(gym));
                  return option(NearbyGyms.key(gym), gym.name, WorkoutPlace_Kind.symbol("gym"), meters === undefined ? undefined : distance(meters), same(current, gym), () => onPick(gym));
                })}
                {here &&
                  option("outdoors", WorkoutPlace_Kind.label("outdoors"), WorkoutPlace_Kind.symbol("outdoors"), "Shown as an area, not a point", current?.kind === "outdoors", () =>
                    onPick({ kind: "outdoors", name: WorkoutPlace_Kind.label("outdoors"), latitude: here.latitude, longitude: here.longitude }),
                  )}
              </>,
            )}
          </VStack>
        );
      }
    }
  })();

  const choices = (
    <>
      {group(
        <>
          {option("none", "Don't show a place", "eye.slash", undefined, current === undefined, () => onPick(undefined))}
          {lastGym && option("last", lastGym.name, WorkoutPlace_Kind.symbol("gym"), "Your last gym", same(current, lastGym), () => onPick(lastGym))}
          {option("home", WorkoutPlace_Kind.label("home"), WorkoutPlace_Kind.symbol("home"), "No map — your home stays private", current?.kind === "home", () =>
            onPick({ kind: "home", name: WorkoutPlace_Kind.label("home"), latitude: undefined, longitude: undefined }),
          )}
        </>,
      )}
      {nearby}
    </>
  );

  return (
    <SLSheet title="Where did you train?" subtitle="Friends see it on this workout" onClose={onClose}>
      <VStack alignment="leading" spacing={SL.Space.s4} style={{ alignSelf: "stretch" }}>
        {searchField}
        {charCount(trimmingWhitespaces(query)) >= 2 ? searchResults : choices}
      </VStack>
    </SLSheet>
  );
}

/** Swift `==` on `WorkoutPlace`: absent coordinates compare equal. */
function WorkoutPlace_norm(p: WorkoutPlace) {
  return { kind: p.kind, name: p.name, latitude: p.latitude ?? null, longitude: p.longitude ?? null };
}

// MARK: - In the feed

/** The map under a post's place, fetched only when one is shown. */
const LiveMap = lazy(() => import("./LiveMap"));

/** A dark, quiet street map centred on a point, `spanMeters` tall over `height`. */
function StaticMap({ center, spanMeters, height, children }: { center: Coordinate; spanMeters: number; height: number; children?: (metersPerPixel: number) => ReactNode }) {
  const cosLat = Math.cos((center.latitude * Math.PI) / 180);
  const metersPerPixel = spanMeters / height;
  // MapLibre counts zoom in 512-pixel tiles: one level below the 256-pixel count.
  const zoom = Math.max(0, Math.min(19, Math.log2((156_543.03392 * cosLat) / metersPerPixel) - 1));
  return (
    <div style={{ position: "relative", height, overflow: "hidden", background: "#1b1d1f" }}>
      <Suspense fallback={null}>
        <LiveMap latitude={center.latitude} longitude={center.longitude} zoom={zoom} />
      </Suspense>
      <div style={{ position: "absolute", left: "50%", top: "50%", pointerEvents: "none" }}>{children?.(metersPerPixel)}</div>
      <span style={{ position: "absolute", right: 4, bottom: 2, ...slFont(9), color: "rgba(255,255,255,0.55)", pointerEvents: "none" }}>© OpenFreeMap © OpenStreetMap</span>
    </div>
  );
}

/** A post's place: a real map with the gym pinned, an area for outdoors, and for a home workout only a label — never a map. */
export function PostPlaceView({ place }: { place: WorkoutPlace }) {
  /** The lime map pin, with the day's dumbbell in it. */
  const pin = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: SL.Signal.action, boxShadow: `inset 0 0 0 2.5px ${SL.Surface.ground}`, display: "grid", placeItems: "center" }}>
        <SFSymbol name="dumbbell.fill" size={13} weight={700} color={SL.Signal.onAction} />
      </div>
      <div style={{ marginTop: -3, transform: "rotate(180deg)" }}>
        <SFSymbol name="triangle.fill" size={9} color={SL.Signal.action} />
      </div>
    </div>
  );

  const label = (
    <HStack
      spacing={6}
      style={{
        paddingLeft: SL.Space.s3,
        paddingRight: SL.Space.s3,
        paddingTop: 6,
        paddingBottom: 6,
        borderRadius: 999,
        background: colorOpacity(SL.Surface.ground, WorkoutPlace.hasMap(place) ? 0.82 : 1),
        boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`,
        maxWidth: "100%",
        alignSelf: "flex-start",
      }}
    >
      <SFSymbol name={WorkoutPlace_Kind.symbol(place.kind)} size={12} weight={600} color={place.kind === "home" ? SL.Signal.recovery : SL.Signal.action} />
      <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} color={SL.Ink.primary} lineLimit={1}>{place.name}</Text>
    </HStack>
  );

  const latitude = place.latitude;
  const longitude = place.longitude;
  if (WorkoutPlace.hasMap(place) && latitude !== undefined && longitude !== undefined) {
    const span = place.kind === "outdoors" ? 2_400 : 550;
    const openInMaps = () => {
      window.open(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`, "_blank", "noopener");
    };
    const shape: CSSProperties = { borderRadius: SL.Radius.lg };
    return (
      <PressButton
        onPress={openInMaps}
        aria-label={`Trained at ${place.name}`}
        title="Opens the place in Maps"
        style={{ position: "relative", display: "block", alignSelf: "stretch", width: "100%", padding: 0, background: "transparent", ...shape }}
      >
        <div style={{ position: "relative", overflow: "hidden", ...shape }}>
          <StaticMap center={{ latitude, longitude }} spanMeters={span} height={150}>
            {(metersPerPixel) =>
              place.kind === "outdoors" ? (
                <div
                  style={{
                    position: "absolute",
                    left: -600 / metersPerPixel,
                    top: -600 / metersPerPixel,
                    width: 1200 / metersPerPixel,
                    height: 1200 / metersPerPixel,
                    borderRadius: "50%",
                    background: colorOpacity(SL.Signal.action, 0.18),
                    boxShadow: `inset 0 0 0 1.5px ${SL.Signal.action}`,
                  }}
                />
              ) : (
                <div style={{ position: "absolute", left: 0, top: 0, transform: "translate(-50%, -100%)" }}>{pin}</div>
              )
            }
          </StaticMap>
          {/* Top, so the map's credit at the bottom stays visible. */}
          <div style={{ position: "absolute", top: SL.Space.s2, left: SL.Space.s2, right: SL.Space.s2, display: "flex" }}>{label}</div>
          <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}`, pointerEvents: "none", ...shape }} />
        </div>
      </PressButton>
    );
  }
  return label;
}
