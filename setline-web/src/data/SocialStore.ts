// SocialStore.swift — friends, the feed, kudos, comments and posts for the
// signed-in account, speaking to the same Supabase tables and storage bucket
// as the iPhone.
//
// Web differences (see the report): the `-SetlineDemoData` sample friends and
// the `#if DEBUG` launch arguments are left out; the feed cache and the queue
// of posts waiting for a connection live in IndexedDB instead of files; a post
// photo is handed to views as an object URL instead of a UIImage.
import { useSyncExternalStore } from "react";
import type { TrainingSession } from "../core/Domain/Model";
import { LoggedSet } from "../core/Domain/Model";
import type { LiftMedal } from "../core/Progress/Medals";
import { RecordsEngine } from "../core/Engine/RecordsEngine";
import { Schedule } from "../core/Engine/Schedule";
import { addDays, iso8601, parseISO8601, startOfDay } from "../core/Support/calendar";
import { rounded, uuid } from "../core/Support/swift";
import {
  graphemes, isLetterChar, isNumberChar, prefixChars, trimmingWhitespaces, trimmingWhitespacesAndNewlines,
} from "../core/Support/nutrition";
import { UserDefaults } from "../design/swiftui";
import type { AppState } from "./AppState";
import { SupabaseFailure } from "./SupabaseClient";

// MARK: - What the social tables hold

export interface SocialProfile {
  user_id: string;
  username: string;
  display_name: string;
}

export const SocialProfile = {
  id(self: SocialProfile): string {
    return self.user_id;
  },
  initial(self: SocialProfile): string {
    return prefixChars(self.display_name, 1).toUpperCase();
  },
  decode(json: unknown): SocialProfile {
    const o = (json ?? {}) as Record<string, unknown>;
    return { user_id: String(o.user_id ?? ""), username: String(o.username ?? ""), display_name: String(o.display_name ?? "") };
  },
};

export interface Friendship {
  requester_id: string;
  addressee_id: string;
  status: string;
  requester?: SocialProfile;
  addressee?: SocialProfile;
}

export const Friendship = {
  isAccepted(self: Friendship): boolean {
    return self.status === "accepted";
  },
  /** The other person in it, seen from `me`. */
  other(self: Friendship, a: { than: string }): SocialProfile | undefined {
    return self.requester_id === a.than ? self.addressee : self.requester;
  },
  decode(json: unknown): Friendship {
    const o = (json ?? {}) as Record<string, unknown>;
    return {
      requester_id: String(o.requester_id ?? ""),
      addressee_id: String(o.addressee_id ?? ""),
      status: String(o.status ?? ""),
      requester: o.requester ? SocialProfile.decode(o.requester) : undefined,
      addressee: o.addressee ? SocialProfile.decode(o.addressee) : undefined,
    };
  },
};

export interface PostMedal {
  place: number;
  name: string;
  weight_kg: number;
  reps: number;
}

export interface Kudos {
  user_id: string;
  giver?: SocialProfile;
}

/** Who can see a post. Public comes later (SOCIAL_FEATURES.md, phase 2). */
export type PostVisibility = "private" | "friends";

const defaultVisibilityKey = "setline.social.defaultVisibility";

export const PostVisibility = {
  private: "private" as PostVisibility,
  friends: "friends" as PostVisibility,
  allCases: ["private", "friends"] as PostVisibility[],

  label(self: PostVisibility): string {
    return self === "private" ? "Only you" : "Friends";
  },

  /** `PostVisibility(rawValue:)`. */
  init(raw: string | undefined): PostVisibility | undefined {
    return raw === "private" || raw === "friends" ? raw : undefined;
  },

  /** The choice in Account › Privacy; Friends unless changed. */
  get defaultForNewPosts(): PostVisibility {
    return PostVisibility.init(UserDefaults.get<string>(defaultVisibilityKey)) ?? "friends";
  },
  set defaultForNewPosts(value: PostVisibility) {
    UserDefaults.set(defaultVisibilityKey, value);
  },
};

/** A number a lifter can keep off a post. */
export type HiddenStat = "duration" | "volume" | "weights";

export const HiddenStat = {
  duration: "duration" as HiddenStat,
  volume: "volume" as HiddenStat,
  weights: "weights" as HiddenStat,
  allCases: ["duration", "volume", "weights"] as HiddenStat[],

  label(self: HiddenStat): string {
    switch (self) {
      case "duration":
        return "Duration";
      case "volume":
        return "Volume";
      case "weights":
        return "Weights on medals";
    }
  },

  init(raw: string): HiddenStat | undefined {
    return (HiddenStat.allCases as string[]).includes(raw) ? (raw as HiddenStat) : undefined;
  },
};

export interface PostMedia {
  id: string;
  path: string;
  width?: number;
  height?: number;
  position: number;
}

export interface PostTrack {
  id: string;
  kind: string;
  title: string;
  artist?: string;
  url?: string;
  position: number;
}

export const PostTrack = {
  isPlaylist(self: PostTrack): boolean {
    return self.kind === "playlist";
  },
};

export interface CommentCount {
  count: number;
}

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author?: SocialProfile;
}

export const PostComment = {
  date(self: PostComment): Date {
    return SocialStore.parseDate(self.created_at) ?? new Date();
  },
  decode(json: unknown): PostComment {
    const o = (json ?? {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? ""),
      post_id: String(o.post_id ?? ""),
      user_id: String(o.user_id ?? ""),
      body: String(o.body ?? ""),
      created_at: String(o.created_at ?? ""),
      author: o.author ? SocialProfile.decode(o.author) : undefined,
    };
  },
};

/** What a chat message is about, when its author says so. */
export type ChatTopic = "training" | "food" | "motivation";

/**
 * One message in the Friends chat: seen by its author and the author's
 * friends only (row-level security, chat_messages).
 */
export interface ChatMessage {
  id: string;
  user_id: string;
  body: string;
  topic?: ChatTopic;
  created_at: string;
  author?: SocialProfile;
  /** The room it was written in; none is the friends' chat. */
  room_id?: string;
  /** A photo with it, in the post-media bucket. */
  image_path?: string;
}

/**
 * A conversation besides the friends' chat: Everyone (every Setline lifter),
 * a private one between two friends, or a room someone started on a topic.
 */
export type ChatRoomKind = "everyone" | "direct" | "room";

export interface ChatRoom {
  id: string;
  kind: ChatRoomKind;
  name?: string;
  created_by?: string;
  created_at: string;
  members: SocialProfile[];
}

export const ChatRoom = {
  everyoneID: "00000000-0000-0000-0000-000000000001",

  /** "Everyone", the friend's name, or the room's own. */
  title(self: ChatRoom, myID: string): string {
    if (self.kind === "everyone") return "Everyone";
    if (self.kind === "direct") return self.members.find((m) => m.user_id !== myID)?.display_name ?? "Private chat";
    return self.name ?? "Room";
  },

  /** The friend on the other side of a private chat. */
  other(self: ChatRoom, myID: string): SocialProfile | undefined {
    return self.kind === "direct" ? self.members.find((m) => m.user_id !== myID) : undefined;
  },

  decode(json: unknown): ChatRoom {
    const o = (json ?? {}) as Record<string, unknown>;
    const kind = (["everyone", "direct", "room"] as ChatRoomKind[]).find((k) => k === o.kind) ?? "room";
    const members = Array.isArray(o.chat_members)
      ? (o.chat_members as Record<string, unknown>[]).map((m) => (m.member ? SocialProfile.decode(m.member) : undefined)).filter((m): m is SocialProfile => m !== undefined)
      : [];
    return {
      id: String(o.id ?? ""),
      kind,
      name: typeof o.name === "string" ? o.name : undefined,
      created_by: typeof o.created_by === "string" ? o.created_by : undefined,
      created_at: String(o.created_at ?? ""),
      members,
    };
  },
};

export const ChatMessage = {
  topics: ["training", "food", "motivation"] as ChatTopic[],

  date(self: ChatMessage): Date {
    return SocialStore.parseDate(self.created_at) ?? new Date();
  },

  topicLabel(topic: ChatTopic): string {
    switch (topic) {
      case "training": return "Training";
      case "food": return "Food";
      case "motivation": return "Motivation";
    }
  },

  decode(json: unknown): ChatMessage {
    const o = (json ?? {}) as Record<string, unknown>;
    const topic = ChatMessage.topics.find((t) => t === o.topic);
    return {
      id: String(o.id ?? ""),
      user_id: String(o.user_id ?? ""),
      body: String(o.body ?? ""),
      topic,
      created_at: String(o.created_at ?? ""),
      author: o.author ? SocialProfile.decode(o.author) : undefined,
      room_id: typeof o.room_id === "string" ? o.room_id : undefined,
      image_path: typeof o.image_path === "string" ? o.image_path : undefined,
    };
  },
};

/** A workout as a friend sees it: a summary, never the log itself. */
export interface FeedPost {
  id: string;
  user_id: string;
  session_id: string;
  workout_date: string;
  title: string;
  volume_kg: number;
  duration_seconds?: number;
  set_count: number;
  medals: PostMedal[];
  streak_weeks: number;
  author?: SocialProfile;
  kudos: Kudos[];
  place_kind?: string;
  place_name?: string;
  place_lat?: number;
  place_lon?: number;
  visibility?: string;
  custom_title?: string;
  notes?: string;
  hidden_stats?: string[];
  post_media?: PostMedia[];
  post_tracks?: PostTrack[];
  comments?: CommentCount[];
  kind?: string;
  rest_reason?: string;
  exercises?: PostExercise[];
  post_participants?: PostParticipant[];
}

/**
 * One exercise of a posted workout, as friends see it: how many sets and the
 * best one. The weight is shown only when the post doesn't hide weights.
 */
export interface PostExercise {
  name: string;
  sets: number;
  weight_kg?: number;
  reps?: number;
}

export const PostExercise = {
  /** The workout's exercises with logged working sets, in order. */
  list(session: TrainingSession): PostExercise[] {
    const out: PostExercise[] = [];
    for (const result of session.results) {
      const working = result.sets.filter(LoggedSet.countsTowardVolume);
      if (working.length === 0) continue;
      let best = working[0];
      for (const set of working) {
        if ((set.weightKg ?? 0) > (best.weightKg ?? 0) || ((set.weightKg ?? 0) === (best.weightKg ?? 0) && set.reps > best.reps)) best = set;
      }
      out.push({ name: prefixChars(result.name, 80), sets: working.length, weight_kg: best.weightKg, reps: best.reps });
    }
    return out.slice(0, 40);
  },
};

/** A friend named on a post: trained together. */
export interface PostParticipant {
  user_id: string;
  participant?: SocialProfile;
}

const opt = <T,>(v: unknown, map: (x: unknown) => T): T | undefined => (v === null || v === undefined ? undefined : map(v));
const optString = (v: unknown) => opt(v, String);
const optNumber = (v: unknown) => opt(v, Number);

export const FeedPost = {
  isRest(self: FeedPost): boolean {
    return self.kind === "rest";
  },

  /** The friends named on the post, as far as their profiles are known. */
  trainedWith(self: FeedPost): SocialProfile[] {
    return (self.post_participants ?? []).map((p) => p.participant).filter((p): p is SocialProfile => p !== undefined);
  },

  /** Where it happened, when the lifter said. */
  place(self: FeedPost): WorkoutPlace | undefined {
    const kind = WorkoutPlace_Kind.init(self.place_kind);
    if (!kind) return undefined;
    return { kind, name: self.place_name ?? WorkoutPlace_Kind.label(kind), latitude: self.place_lat, longitude: self.place_lon };
  },

  date(self: FeedPost): Date {
    return SocialStore.parseDate(self.workout_date) ?? new Date();
  },

  /** The lifter's own title, else the day's name. */
  displayTitle(self: FeedPost): string {
    return self.custom_title !== undefined && self.custom_title !== "" ? self.custom_title : self.title;
  },
  postVisibility(self: FeedPost): PostVisibility {
    return PostVisibility.init(self.visibility) ?? "friends";
  },
  hides(self: FeedPost, stat: HiddenStat): boolean {
    return self.hidden_stats?.includes(stat) === true;
  },
  photos(self: FeedPost): PostMedia[] {
    return [...(self.post_media ?? [])].sort((a, b) => a.position - b.position);
  },
  tracks(self: FeedPost): PostTrack[] {
    return [...(self.post_tracks ?? [])].sort((a, b) => a.position - b.position);
  },
  commentCount(self: FeedPost): number {
    return self.comments?.[0]?.count ?? 0;
  },

  /** Synthesized `Decodable`: exactly the declared keys, whatever else the row holds. */
  decode(json: unknown): FeedPost {
    const o = (json ?? {}) as Record<string, unknown>;
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    return {
      id: String(o.id ?? ""),
      user_id: String(o.user_id ?? ""),
      session_id: String(o.session_id ?? ""),
      workout_date: String(o.workout_date ?? ""),
      title: String(o.title ?? ""),
      volume_kg: Number(o.volume_kg ?? 0),
      duration_seconds: optNumber(o.duration_seconds),
      set_count: Number(o.set_count ?? 0),
      medals: arr(o.medals).map((m) => {
        const x = m as Record<string, unknown>;
        return { place: Number(x.place), name: String(x.name ?? ""), weight_kg: Number(x.weight_kg ?? 0), reps: Number(x.reps ?? 0) };
      }),
      streak_weeks: Number(o.streak_weeks ?? 0),
      author: o.author ? SocialProfile.decode(o.author) : undefined,
      kudos: arr(o.kudos).map((k) => {
        const x = k as Record<string, unknown>;
        return { user_id: String(x.user_id ?? ""), giver: x.giver ? SocialProfile.decode(x.giver) : undefined };
      }),
      place_kind: optString(o.place_kind),
      place_name: optString(o.place_name),
      place_lat: optNumber(o.place_lat),
      place_lon: optNumber(o.place_lon),
      visibility: optString(o.visibility),
      custom_title: optString(o.custom_title),
      notes: optString(o.notes),
      hidden_stats: opt(o.hidden_stats, (v) => arr(v).map(String)),
      post_media: opt(o.post_media, (v) =>
        arr(v).map((m) => {
          const x = m as Record<string, unknown>;
          return { id: String(x.id ?? ""), path: String(x.path ?? ""), width: optNumber(x.width), height: optNumber(x.height), position: Number(x.position ?? 0) };
        }),
      ),
      post_tracks: opt(o.post_tracks, (v) =>
        arr(v).map((t) => {
          const x = t as Record<string, unknown>;
          return { id: String(x.id ?? ""), kind: String(x.kind ?? ""), title: String(x.title ?? ""), artist: optString(x.artist), url: optString(x.url), position: Number(x.position ?? 0) };
        }),
      ),
      comments: opt(o.comments, (v) => arr(v).map((c) => ({ count: Number((c as Record<string, unknown>).count ?? 0) }))),
      kind: optString(o.kind),
      rest_reason: optString(o.rest_reason),
      exercises: opt(o.exercises, (v) =>
        arr(v).map((e) => {
          const x = e as Record<string, unknown>;
          return { name: String(x.name ?? ""), sets: Number(x.sets ?? 0), weight_kg: optNumber(x.weight_kg), reps: optNumber(x.reps) };
        }),
      ),
      post_participants: opt(o.post_participants, (v) =>
        arr(v).map((p) => {
          const x = p as Record<string, unknown>;
          return { user_id: String(x.user_id ?? ""), participant: x.participant ? SocialProfile.decode(x.participant) : undefined };
        }),
      ),
    };
  },
};

/** What the composer edits before anything is written. */
export interface PostDraft {
  title: string;
  notes: string;
  visibility: PostVisibility;
  hidden: Set<HiddenStat>;
  place?: WorkoutPlace;
  tracks: DraftTrack[];
  photos: DraftPhoto[];
  /** A rest day's why ("Sore", "Travel"); undefined on a workout. */
  restReason?: string;
  /**
   * The friends trained with, by user id. Undefined in drafts saved before
   * friends could be named, which then leave the post's names as they are.
   */
  participants?: string[];
}

export const PostDraft = {
  maxPhotos: 4,
  maxSongs: 5,

  /** `init()`. */
  make(): PostDraft {
    return { title: "", notes: "", visibility: PostVisibility.defaultForNewPosts, hidden: new Set(), tracks: [], photos: [] };
  },

  /** `init(post:)`: the draft for editing a post that exists. */
  makePost(post: FeedPost): PostDraft {
    return {
      title: post.custom_title ?? "",
      notes: post.notes ?? "",
      visibility: FeedPost.postVisibility(post),
      hidden: new Set((post.hidden_stats ?? []).map(HiddenStat.init).filter((s): s is HiddenStat => s !== undefined)),
      place: FeedPost.place(post),
      tracks: FeedPost.tracks(post).map((t) => DraftTrack.make({ kind: t.kind, title: t.title, artist: t.artist, url: t.url })),
      photos: FeedPost.photos(post).map((m) => DraftPhoto.make({ existing: m })),
      restReason: post.rest_reason,
      participants: (post.post_participants ?? []).map((p) => p.user_id),
    };
  },
};

export interface DraftTrack {
  id: string;
  kind: string;
  title: string;
  artist?: string;
  url?: string;
}

export const DraftTrack = {
  make(p: { id?: string; kind?: string; title: string; artist?: string; url?: string }): DraftTrack {
    return { id: p.id ?? uuid(), kind: p.kind ?? "song", title: p.title, artist: p.artist, url: p.url };
  },
};

/**
 * A photo on a draft: one already on the post, or a new one, already resized
 * and re-encoded in the browser (no location or camera data).
 */
export interface DraftPhoto {
  id: string;
  existing?: PostMedia;
  jpeg?: Blob;
  width?: number;
  height?: number;
}

export const DraftPhoto = {
  make(p: { id?: string; existing?: PostMedia; jpeg?: Blob; width?: number; height?: number }): DraftPhoto {
    return { id: p.id ?? uuid(), existing: p.existing, jpeg: p.jpeg, width: p.width, height: p.height };
  },
};

/**
 * The parts of a post the lifter writes, always sent whole — nulls included —
 * so clearing a title, a note or a place clears it on the post.
 */
interface PostDraftFields {
  visibility: PostVisibility;
  customTitle?: string;
  notes?: string;
  hidden: string[];
  place?: WorkoutPlace;
  restReason?: string;
  editedAt?: string;
}

function postDraftFields(draft: PostDraft, editedAt?: string): PostDraftFields {
  const title = trimmingWhitespacesAndNewlines(draft.title);
  const notes = trimmingWhitespacesAndNewlines(draft.notes);
  return {
    restReason: draft.restReason === undefined ? undefined : prefixChars(draft.restReason, 40),
    visibility: draft.visibility,
    customTitle: title === "" ? undefined : prefixChars(title, 60),
    notes: notes === "" ? undefined : prefixChars(notes, 2000),
    hidden: [...draft.hidden].sort(),
    place: draft.place,
    editedAt,
  };
}

function encodeDraftFields(f: PostDraftFields): Record<string, unknown> {
  const shared = f.place ? WorkoutPlace.shared(f.place) : undefined;
  const row: Record<string, unknown> = {
    visibility: f.visibility,
    custom_title: f.customTitle ?? null,
    notes: f.notes ?? null,
    hidden_stats: f.hidden,
    place_kind: shared?.kind ?? null,
    place_name: shared?.name ?? null,
    place_lat: shared?.latitude ?? null,
    place_lon: shared?.longitude ?? null,
  };
  if (f.editedAt !== undefined) row.edited_at = f.editedAt;
  if (f.restReason !== undefined) row.rest_reason = f.restReason;
  return row;
}

/** What a post row is written as. */
interface PostWrite {
  user_id: string;
  session_id: string;
  workout_date: string;
  title: string;
  volume_kg: number;
  duration_seconds?: number;
  set_count: number;
  medals: PostMedal[];
  streak_weeks: number;
  kind: string;
  exercises?: PostExercise[];
  draft: PostDraftFields;
}

function encodePostWrite(w: PostWrite): string {
  return JSON.stringify({
    user_id: w.user_id,
    session_id: w.session_id,
    workout_date: w.workout_date,
    title: w.title,
    volume_kg: w.volume_kg,
    duration_seconds: w.duration_seconds ?? null,
    set_count: w.set_count,
    medals: w.medals,
    streak_weeks: w.streak_weeks,
    kind: w.kind,
    ...(w.exercises !== undefined ? { exercises: w.exercises.map((e) => ({ name: e.name, sets: e.sets, weight_kg: e.weight_kg ?? null, reps: e.reps ?? null })) } : {}),
    ...encodeDraftFields(w.draft),
  });
}

// MARK: - Where a workout happened

export type WorkoutPlace_Kind = "gym" | "home" | "outdoors";

export const WorkoutPlace_Kind = {
  gym: "gym" as WorkoutPlace_Kind,
  home: "home" as WorkoutPlace_Kind,
  outdoors: "outdoors" as WorkoutPlace_Kind,

  init(raw: string | undefined): WorkoutPlace_Kind | undefined {
    return raw === "gym" || raw === "home" || raw === "outdoors" ? raw : undefined;
  },

  label(self: WorkoutPlace_Kind): string {
    switch (self) {
      case "gym":
        return "Gym";
      case "home":
        return "Home workout";
      case "outdoors":
        return "Outdoors";
    }
  },

  symbol(self: WorkoutPlace_Kind): string {
    switch (self) {
      case "gym":
        return "dumbbell.fill";
      case "home":
        return "house.fill";
      case "outdoors":
        return "tree.fill";
    }
  },
};

/** Where a workout happened, as a post may carry it. */
export interface WorkoutPlace {
  kind: WorkoutPlace_Kind;
  name: string;
  latitude?: number;
  longitude?: number;
}

const lastGymKey = "setline.social.lastGym";

export const WorkoutPlace = {
  /**
   * What leaves the phone: a home never has coordinates, outdoors is rounded
   * to about a kilometre, a gym — a public place — keeps its own.
   */
  shared(self: WorkoutPlace): WorkoutPlace {
    switch (self.kind) {
      case "home":
        return { kind: "home", name: WorkoutPlace_Kind.label("home"), latitude: undefined, longitude: undefined };
      case "outdoors": {
        const round2 = (value: number | undefined) => (value === undefined ? undefined : rounded(value * 100) / 100);
        return { kind: "outdoors", name: prefixChars(self.name, 80), latitude: round2(self.latitude), longitude: round2(self.longitude) };
      }
      case "gym":
        return { kind: "gym", name: prefixChars(self.name, 80), latitude: self.latitude, longitude: self.longitude };
    }
  },

  hasMap(self: WorkoutPlace): boolean {
    return self.kind !== "home" && self.latitude !== undefined && self.longitude !== undefined;
  },

  /** The gym picked last, offered as one tap next time. Kept on this device. */
  get lastGym(): WorkoutPlace | undefined {
    const raw = UserDefaults.get<Record<string, unknown>>(lastGymKey);
    if (!raw) return undefined;
    const kind = WorkoutPlace_Kind.init(raw.kind as string | undefined);
    if (!kind || typeof raw.name !== "string") return undefined;
    return { kind, name: raw.name, latitude: optNumber(raw.latitude), longitude: optNumber(raw.longitude) };
  },
  set lastGym(value: WorkoutPlace | undefined) {
    UserDefaults.set(lastGymKey, value === undefined ? undefined : { kind: value.kind, name: value.name, latitude: value.latitude, longitude: value.longitude });
  },
};

// MARK: - The store

export type SocialStore_Phase =
  | { kind: "loading" }
  /** The tables are not in the Supabase project yet. */
  | { kind: "notSetUp" }
  /** Signed in, but no username chosen. */
  | { kind: "needsProfile" }
  | { kind: "ready" }
  | { kind: "failed"; value: string };

/**
 * A post that could not go out for lack of a connection: kept on this
 * device, photos included, and sent on the next successful load.
 */
export interface SocialStore_PendingPost {
  session: TrainingSession;
  medals: PostMedal[];
  streakWeeks: number;
  draft: PostDraft;
}

export const SocialStore_PendingPost = {
  id(self: SocialStore_PendingPost): string {
    return self.session.id;
  },
};

/** Each new photo's upload, for the composer's tiles (SETLINE Social S1). */
export type SocialStore_UploadState = "waiting" | "uploading" | "done" | "failed";

/** Thrown when a post was queued instead of sent. */
export class SocialStore_Queued extends Error {
  constructor() {
    super("Queued");
  }
}

interface FeedCache {
  me: SocialProfile;
  friendships: Friendship[];
  feed: FeedPost[];
  loaded: Date;
}

// The device's files for the store: IndexedDB in place of Caches/SocialFeed
// and Application Support/PendingPosts.
const SOCIAL_DB = "setline-social";
const FEED_STORE = "socialFeed";
const PENDING_STORE = "pendingPosts";
let socialDB: Promise<IDBDatabase | undefined> | undefined;

function openSocialDB(): Promise<IDBDatabase | undefined> {
  socialDB ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(SOCIAL_DB, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(FEED_STORE);
        request.result.createObjectStore(PENDING_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
  return socialDB;
}

async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openSocialDB();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(store, "readonly").objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function idbPut(store: string, key: string, value: unknown): Promise<void> {
  const db = await openSocialDB();
  if (!db) return;
  try {
    db.transaction(store, "readwrite").objectStore(store).put(value, key);
  } catch {
    /* `try?` */
  }
}

async function idbDelete(store: string, key: string): Promise<void> {
  const db = await openSocialDB();
  if (!db) return;
  try {
    db.transaction(store, "readwrite").objectStore(store).delete(key);
  } catch {
    /* `try?` */
  }
}

const isNetwork = (error: unknown) => error instanceof SupabaseFailure && error.kind === "network";
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Friends, the feed and kudos for the signed-in account.
 *
 * Everything goes through `AppState.social`, so tokens refresh as they do for
 * sync, and everything the server returns has already passed its row-level
 * security: this store never filters for privacy itself.
 */
export class SocialStore {
  phase: SocialStore_Phase = { kind: "loading" };
  me: SocialProfile | undefined;
  friendships: Friendship[] = [];
  feed: FeedPost[] = [];

  private app: AppState | undefined;
  /** The account the lists were read for; another sign-in starts clean. */
  private loadedFor: string | undefined;

  // MARK: Observation (SwiftUI's @Observable)

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

  /** Ties the store to the app's sign-in, once, at launch. */
  attach(app: AppState): void {
    this.app = app;
  }

  get myID(): string {
    return this.app?.userID ?? "";
  }

  get friends(): SocialProfile[] {
    return this.friendships
      .filter(Friendship.isAccepted)
      .map((f) => Friendship.other(f, { than: this.myID }))
      .filter((p): p is SocialProfile => p !== undefined)
      .sort((a, b) => (a.display_name < b.display_name ? -1 : a.display_name > b.display_name ? 1 : 0));
  }
  get incoming(): Friendship[] {
    return this.friendships.filter((f) => !Friendship.isAccepted(f) && f.addressee_id === this.myID);
  }
  get outgoing(): Friendship[] {
    return this.friendships.filter((f) => !Friendship.isAccepted(f) && f.requester_id === this.myID);
  }

  // MARK: Loading

  async load(): Promise<void> {
    if (this.loadedFor !== this.myID) {
      this.loadedFor = this.myID;
      this.me = undefined;
      this.friendships = [];
      this.feed = [];
      this.phase = { kind: "loading" };
      this.changed();
      await this.loadPending();
    }
    if (this.myID === "") return;
    if (this.phase.kind !== "ready") {
      this.phase = { kind: "loading" };
      this.changed();
    }
    try {
      const id = this.myID;
      const rows = (await this.get(`profiles?select=user_id,username,display_name&user_id=eq.${id}`)) as unknown[];
      const profile = rows[0];
      if (profile === undefined) {
        this.me = undefined;
        this.phase = { kind: "needsProfile" };
        this.changed();
        return;
      }
      this.me = SocialProfile.decode(profile);
      this.changed();
      const friendships = this.get(SocialStore.friendshipsQuery);
      const feed = this.get(SocialStore.feedQuery);
      feed.catch(() => {});
      this.friendships = ((await friendships) as unknown[]).map(Friendship.decode);
      this.feed = ((await feed) as unknown[]).map(FeedPost.decode);
      this.phase = { kind: "ready" };
      this.offlineSince = undefined;
      this.lastLoaded = new Date();
      this.changed();
      this.saveFeedCache();
      if (this.pending.length > 0 && !this.flushing) {
        this.flushing = true;
        await this.sendPending();
        this.flushing = false;
      }
    } catch (error) {
      if (isNetwork(error)) {
        // No connection: what loaded last stays readable (SETLINE Social S3).
        if (this.feed.length === 0) await this.loadFeedCache();
        if (this.me !== undefined || this.feed.length > 0) {
          this.offlineSince = this.offlineSince ?? new Date();
          this.phase = { kind: "ready" };
        } else {
          this.phase = { kind: "failed", value: SupabaseFailure.describe("network") || "No connection." };
        }
      } else {
        this.phase = SocialStore.phaseFor(error);
      }
      this.changed();
    }
  }

  /** Set while the feed shows what loaded before the connection went. */
  offlineSince: Date | undefined;
  /** When the feed last loaded from the server. */
  lastLoaded: Date | undefined;

  private saveFeedCache(): void {
    const me = this.me;
    if (this.myID === "" || !me) return;
    const cache: FeedCache = { me, friendships: this.friendships, feed: this.feed, loaded: this.lastLoaded ?? new Date() };
    void idbPut(FEED_STORE, this.myID, cache);
  }

  private async loadFeedCache(): Promise<void> {
    if (this.myID === "") return;
    const cache = await idbGet<FeedCache>(FEED_STORE, this.myID);
    if (!cache) return;
    this.me = this.me ?? cache.me;
    this.friendships = cache.friendships;
    this.feed = cache.feed;
    this.lastLoaded = cache.loaded;
  }

  private static readonly profileFields = "user_id,username,display_name";
  private static readonly friendshipsQuery = `friendships?select=*,requester:profiles!friendships_requester_id_fkey(${SocialStore.profileFields}),addressee:profiles!friendships_addressee_id_fkey(${SocialStore.profileFields})`;
  private static readonly feedQuery = `posts?select=*,author:profiles!posts_user_id_fkey(${SocialStore.profileFields}),kudos(user_id,giver:profiles!kudos_user_id_fkey(${SocialStore.profileFields})),post_media(id,path,width,height,position),post_tracks(id,kind,title,artist,url,position),comments(count),post_participants(user_id,participant:profiles!post_participants_user_id_fkey(${SocialStore.profileFields}))&order=workout_date.desc&limit=50`;

  /** A missing table reads as "not set up"; anything else as a failure in words. */
  private static phaseFor(error: unknown): SocialStore_Phase {
    const text = errorText(error);
    if (text.includes("Could not find the table") || text.includes("PGRST205")) return { kind: "notSetUp" };
    return { kind: "failed", value: text };
  }

  // MARK: Profile

  /** "Yascha T." → "yascha_t": a starting point for the username field. */
  static suggestedUsername(a: { from?: string }): string {
    const base = graphemes((a.from ?? "").toLowerCase())
      .map((c) => (isLetterChar(c) || isNumberChar(c) ? c : "_"))
      .join("");
    const trimmed = base.split("_").filter((s) => s !== "").join("_");
    return prefixChars(trimmed, 20);
  }

  static isValidUsername(name: string): boolean {
    return /^[a-z0-9_]{3,20}$/.test(name);
  }

  async createProfile(a: { username: string; displayName: string }): Promise<void> {
    const profile: SocialProfile = { user_id: this.myID, username: a.username, display_name: a.displayName };
    try {
      await this.send("profiles", { method: "POST", body: JSON.stringify(profile) });
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      if (text.includes("duplicate") || text.includes("unique")) {
        throw new SupabaseFailure("message", `@${a.username} is taken. Try another.`);
      }
      throw error;
    }
    await this.load();
  }

  // MARK: Friends

  async find(a: { username: string }): Promise<SocialProfile | undefined> {
    const name = trimmingWhitespaces(a.username.toLowerCase()).replace(/^@+|@+$/g, "");
    if (!SocialStore.isValidUsername(name)) return undefined;
    const rows = (await this.get(`profiles?select=${SocialStore.profileFields}&username=eq.${name}`)) as unknown[];
    return rows[0] === undefined ? undefined : SocialProfile.decode(rows[0]);
  }

  async request(profile: SocialProfile): Promise<void> {
    if (profile.user_id === this.myID) return;
    await this.send("friendships", { method: "POST", body: JSON.stringify({ requester_id: this.myID, addressee_id: profile.user_id }) });
    await this.load();
  }

  async accept(friendship: Friendship): Promise<void> {
    const body = JSON.stringify({ status: "accepted", accepted_at: SocialStore.isoString(new Date()) });
    await this.send(`friendships?requester_id=eq.${friendship.requester_id}&addressee_id=eq.${this.myID}`, { method: "PATCH", body });
    await this.load();
  }

  /** Declines a request, cancels one sent, or ends a friendship. */
  async remove(other: string): Promise<void> {
    const me = this.myID;
    await this.send(`friendships?or=(and(requester_id.eq.${me},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${me}))`, { method: "DELETE" });
    await this.load();
  }

  /** Ends any friendship with them and stops requests either way. */
  async block(other: string): Promise<void> {
    await this.send("blocks", { method: "POST", body: JSON.stringify({ blocker_id: this.myID, blocked_id: other }) });
    await this.load();
  }

  async reportPost(a: { post: FeedPost; reason: string }): Promise<void> {
    const body = JSON.stringify({ reporter_id: this.myID, post_id: a.post.id, reported_id: a.post.user_id, reason: a.reason });
    await this.send("reports", { method: "POST", body });
  }

  // MARK: Blocked people

  blocked: SocialProfile[] = [];

  /** The people this account blocked, for Account › Privacy. */
  async loadBlocked(): Promise<void> {
    let rows: { blocked_id: string }[];
    try {
      rows = (await this.get(`blocks?select=blocked_id&blocker_id=eq.${this.myID}`)) as { blocked_id: string }[];
    } catch {
      return;
    }
    const ids = rows.map((r) => r.blocked_id);
    if (ids.length === 0) {
      this.blocked = [];
      this.changed();
      return;
    }
    try {
      this.blocked = ((await this.get(`profiles?select=${SocialStore.profileFields}&user_id=in.(${ids.join(",")})`)) as unknown[]).map(SocialProfile.decode);
    } catch {
      this.blocked = [];
    }
    this.changed();
  }

  async unblock(other: string): Promise<void> {
    this.blocked = this.blocked.filter((p) => p.user_id !== other);
    this.changed();
    await this.send(`blocks?blocker_id=eq.${this.myID}&blocked_id=eq.${other}`, { method: "DELETE" });
  }

  // MARK: Export

  /** Every post this account wrote, with its comments, for "Export everything" (GDPR art. 20). */
  async exportMyPosts(): Promise<string | undefined> {
    let mine: FeedPost[];
    try {
      mine = ((await this.get(
        `posts?select=*,kudos(user_id),post_media(id,path,width,height,position),post_tracks(id,kind,title,artist,url,position),comments(count),post_participants(user_id,participant:profiles!post_participants_user_id_fkey(${SocialStore.profileFields}))&user_id=eq.${this.myID}&order=workout_date.desc`,
      )) as unknown[]).map(FeedPost.decode);
    } catch {
      return undefined;
    }
    return swiftPrettySortedJSON(mine);
  }

  // MARK: Invites

  /** The link a friend opens to add this account: setline://add/<username>. */
  get inviteURL(): string | undefined {
    return this.me ? `setline://add/${this.me.username}` : undefined;
  }

  // MARK: Kudos

  hasKudos(post: FeedPost): boolean {
    return post.kudos.some((k) => k.user_id === this.myID);
  }

  /** Gives or takes back kudos, shown at once and undone if the server refuses. */
  async toggleKudos(post: FeedPost): Promise<void> {
    const index = this.feed.findIndex((p) => p.id === post.id);
    if (this.offlineSince !== undefined || post.user_id === this.myID || index < 0) return;
    const giving = !this.hasKudos(post);
    const before = this.feed[index];
    const kudos = giving ? [...before.kudos, { user_id: this.myID, giver: this.me }] : before.kudos.filter((k) => k.user_id !== this.myID);
    this.feed = this.feed.map((p, i) => (i === index ? { ...p, kudos } : p));
    this.changed();
    try {
      if (giving) {
        await this.send("kudos", { method: "POST", body: JSON.stringify({ post_id: post.id, user_id: this.myID }) });
      } else {
        await this.send(`kudos?post_id=eq.${post.id}&user_id=eq.${this.myID}`, { method: "DELETE" });
      }
    } catch {
      const again = this.feed.findIndex((p) => p.id === post.id);
      if (again >= 0) {
        this.feed = this.feed.map((p, i) => (i === again ? before : p));
        this.changed();
      }
    }
  }

  // MARK: Posting

  uploads: Record<string, SocialStore_UploadState> = {};
  clearUploads(): void {
    this.uploads = {};
    this.changed();
  }
  private setUpload(id: string, state: SocialStore_UploadState): void {
    this.uploads = { ...this.uploads, [id]: state };
    this.changed();
  }

  pending: SocialStore_PendingPost[] = [];
  private flushing = false;

  /**
   * Turns a saved workout into a post — the lifter's explicit choice; saving a
   * workout never posts it. Posting the same workout again updates the one
   * post.
   */
  async createPost(a: { from: TrainingSession; medals: LiftMedal[]; streakWeeks: number; draft: PostDraft }): Promise<void> {
    const session = a.from;
    const postMedals: PostMedal[] = a.medals.map((m) => ({ place: m.place, name: m.name, weight_kg: m.weightKg, reps: m.reps }));
    try {
      await this.sendPost({ session, medals: postMedals, streakWeeks: a.streakWeeks, draft: a.draft });
    } catch (error) {
      if (!isNetwork(error)) throw error;
      this.pending = [...this.pending.filter((p) => p.session.id !== session.id), { session, medals: postMedals, streakWeeks: a.streakWeeks, draft: a.draft }];
      this.changed();
      this.savePending();
      throw new SocialStore_Queued();
    }
  }

  /** The session id a rest day's post is stored under: one per day. */
  static restID(date: Date): string {
    return `rest-${Schedule.dateKey(date)}`;
  }

  /** Posts a rest day, with why. It carries no numbers and never counts as a workout. */
  async createRestPost(a: { on: Date; streakWeeks: number; draft: PostDraft }): Promise<void> {
    const write: PostWrite = {
      user_id: this.myID,
      session_id: SocialStore.restID(a.on),
      workout_date: SocialStore.isoString(a.on),
      title: "Rest day",
      volume_kg: 0,
      duration_seconds: undefined,
      set_count: 0,
      medals: [],
      streak_weeks: a.streakWeeks,
      kind: "rest",
      draft: postDraftFields(a.draft),
    };
    const data = await this.send("posts?on_conflict=user_id,session_id&select=id", {
      method: "POST",
      body: encodePostWrite(write),
      prefer: "resolution=merge-duplicates,return=representation",
    });
    const postID = (JSON.parse(data) as { id: string }[])[0]?.id;
    if (postID === undefined) return;
    await this.syncAttachments(postID, undefined, a.draft);
    await this.load();
  }

  /**
   * The posts the friends named on `post` made of that same day — their half
   * of a workout done together. A friend who hasn't posted it yet has none.
   */
  async togetherPosts(post: FeedPost): Promise<FeedPost[]> {
    const ids = FeedPost.trainedWith(post).map((p) => p.user_id).filter((id) => id !== post.user_id);
    if (ids.length === 0) return [];
    const start = startOfDay(FeedPost.date(post));
    const end = addDays(start, 1);
    const path =
      `posts?select=*,author:profiles!posts_user_id_fkey(${SocialStore.profileFields}),kudos(user_id)` +
      `&user_id=in.(${ids.join(",")})` +
      `&workout_date=gte.${encodeURIComponent(SocialStore.isoString(start))}` +
      `&workout_date=lt.${encodeURIComponent(SocialStore.isoString(end))}` +
      `&order=workout_date.asc`;
    try {
      return ((await this.get(path)) as unknown[]).map((row) => FeedPost.decode(row));
    } catch {
      return [];
    }
  }

  /** Whether this account already posted the given workout or rest day. */
  hasPost(a: { sessionID: string }): boolean {
    return this.feed.some((p) => p.session_id === a.sessionID && p.user_id === this.myID) || this.pending.some((p) => p.session.id === a.sessionID);
  }

  /** Sends what was queued, oldest first; stops at the first that still cannot go out. */
  async sendPending(): Promise<void> {
    if (this.me === undefined) return;
    for (const item of [...this.pending]) {
      try {
        await this.sendPost({ session: item.session, medals: item.medals, streakWeeks: item.streakWeeks, draft: item.draft });
        this.pending = this.pending.filter((p) => SocialStore_PendingPost.id(p) !== SocialStore_PendingPost.id(item));
        this.changed();
        this.savePending();
      } catch {
        return;
      }
    }
  }

  private async loadPending(): Promise<void> {
    if (this.myID === "") {
      this.pending = [];
      return;
    }
    this.pending = (await idbGet<SocialStore_PendingPost[]>(PENDING_STORE, this.myID)) ?? [];
    this.changed();
  }

  private savePending(): void {
    if (this.myID === "") return;
    if (this.pending.length === 0) {
      void idbDelete(PENDING_STORE, this.myID);
      return;
    }
    void idbPut(PENDING_STORE, this.myID, this.pending);
  }

  private async sendPost(a: { session: TrainingSession; medals: PostMedal[]; streakWeeks: number; draft: PostDraft }): Promise<void> {
    const session = a.session;
    if (session.kind !== "workout") return;
    const sets = session.results.flatMap((r) => r.sets);
    const write: PostWrite = {
      user_id: this.myID,
      session_id: session.id,
      workout_date: SocialStore.isoString(session.date),
      title: session.dayLabel,
      volume_kg: RecordsEngine.volumeLoad(sets),
      duration_seconds: session.durationSeconds,
      set_count: sets.filter(LoggedSet.countsTowardVolume).length,
      medals: a.medals,
      streak_weeks: a.streakWeeks,
      kind: "workout",
      exercises: PostExercise.list(session),
      draft: postDraftFields(a.draft),
    };
    const data = await this.send("posts?on_conflict=user_id,session_id&select=id", {
      method: "POST",
      body: encodePostWrite(write),
      prefer: "resolution=merge-duplicates,return=representation",
    });
    const postID = (JSON.parse(data) as { id: string }[])[0]?.id;
    if (postID === undefined) return;
    // A retry after a dropped connection may find photos from the attempt
    // before; they go first, so none is posted twice.
    let leftover: { path: string }[] = [];
    try {
      leftover = (await this.get(`post_media?select=path&post_id=eq.${postID}`)) as { path: string }[];
    } catch {
      leftover = [];
    }
    if (leftover.length > 0) {
      await this.removeFiles(leftover.map((r) => r.path));
      await this.send(`post_media?post_id=eq.${postID}`, { method: "DELETE" });
    }
    await this.syncAttachments(postID, undefined, a.draft);
    await this.load();
  }

  /** Saves an edited post: its words, visibility, place, music and photos. Changes apply on the next read, for everyone. */
  async update(post: FeedPost, a: { draft: PostDraft }): Promise<void> {
    const fields = postDraftFields(a.draft, SocialStore.isoString(new Date()));
    await this.send(`posts?id=eq.${post.id}`, { method: "PATCH", body: JSON.stringify(encodeDraftFields(fields)) });
    await this.syncAttachments(post.id, post, a.draft);
    await this.load();
  }

  /** Music is rewritten whole; photos keep what stayed, lose what was taken off (files included) and upload what is new. */
  private async syncAttachments(postID: string, existing: FeedPost | undefined, draft: PostDraft): Promise<void> {
    // The friends trained with, rewritten whole like the music.
    if (draft.participants !== undefined) {
      await this.send(`post_participants?post_id=eq.${postID}`, { method: "DELETE" });
      const named = [...new Set(draft.participants)].filter((id) => id !== this.myID);
      if (named.length > 0) {
        await this.send("post_participants", { method: "POST", body: JSON.stringify(named.map((id) => ({ post_id: postID, user_id: id }))) });
      }
    }
    await this.send(`post_tracks?post_id=eq.${postID}`, { method: "DELETE" });
    if (draft.tracks.length > 0) {
      const rows = draft.tracks.slice(0, PostDraft.maxSongs + 1).map((track, index) => {
        const row: Record<string, unknown> = { post_id: postID, user_id: this.myID, position: index, kind: track.kind, title: prefixChars(track.title, 120) };
        if (track.artist !== undefined && track.artist !== "") row.artist = prefixChars(track.artist, 120);
        if (track.url !== undefined && track.url.startsWith("https://")) row.url = prefixChars(track.url, 500);
        return row;
      });
      await this.send("post_tracks", { method: "POST", body: JSON.stringify(rows) });
    }

    const kept = new Set(draft.photos.map((p) => p.existing?.id).filter((id): id is string => id !== undefined));
    const removed = (existing ? FeedPost.photos(existing) : []).filter((m) => !kept.has(m.id));
    if (removed.length > 0) {
      await this.removeFiles(removed.map((m) => m.path));
      await this.send(`post_media?id=in.(${removed.map((m) => m.id).join(",")})`, { method: "DELETE" });
    }
    for (const photo of draft.photos) if (photo.existing === undefined) this.setUpload(photo.id, "waiting");
    const shown = draft.photos.slice(0, PostDraft.maxPhotos);
    for (let position = 0; position < shown.length; position++) {
      const photo = shown[position];
      const media = photo.existing;
      if (media) {
        if (media.position !== position) {
          await this.send(`post_media?id=eq.${media.id}`, { method: "PATCH", body: JSON.stringify({ position }) });
        }
        continue;
      }
      const jpeg = photo.jpeg;
      if (!jpeg) continue;
      this.setUpload(photo.id, "uploading");
      try {
        const path = `${this.myID}/${postID}/${uuid().toLowerCase()}.jpg`;
        await this.storage(`object/post-media/${path}`, { method: "POST", body: jpeg, contentType: "image/jpeg" });
        const row: Record<string, unknown> = { post_id: postID, user_id: this.myID, path, position };
        if (photo.width !== undefined) row.width = photo.width;
        if (photo.height !== undefined) row.height = photo.height;
        await this.send("post_media", { method: "POST", body: JSON.stringify(row) });
        this.setUpload(photo.id, "done");
      } catch (error) {
        this.setUpload(photo.id, "failed");
        throw error;
      }
    }
  }

  /** Deletes a post with its photos — files first, so none is left behind — and with it its comments, kudos and music. */
  async delete(post: FeedPost): Promise<void> {
    this.feed = this.feed.filter((p) => p.id !== post.id);
    this.changed();
    await this.removeFiles(FeedPost.photos(post).map((m) => m.path));
    await this.send(`posts?id=eq.${post.id}`, { method: "DELETE" });
  }

  /** Account › Privacy: every post this account wrote, photos included. The workouts themselves stay in the log. */
  async deleteAllMyPosts(): Promise<void> {
    const mine = this.myID;
    const rows = (await this.get(`post_media?select=path&user_id=eq.${mine}`)) as { path: string }[];
    await this.removeFiles(rows.map((r) => r.path));
    await this.send(`posts?user_id=eq.${mine}`, { method: "DELETE" });
    await this.load();
  }

  get myPostCount(): number {
    return this.feed.filter((p) => p.user_id === this.myID).length;
  }

  private async removeFiles(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.storage("object/post-media", { method: "DELETE", body: JSON.stringify({ prefixes: paths }), contentType: "application/json" });
  }

  // MARK: Photos

  private images = new Map<string, string>();

  /**
   * A post photo, read with the account's token: the bucket is private and
   * only those who can see the post may read it. An object URL, or undefined
   * when it cannot be read as a picture.
   */
  async image(path: string): Promise<string | undefined> {
    const cached = this.images.get(path);
    if (cached) return cached;
    let data: ArrayBuffer;
    try {
      data = await this.storage(`object/authenticated/post-media/${path}`, {});
    } catch {
      return undefined;
    }
    const blob = new Blob([data], { type: "image/jpeg" });
    try {
      const bitmap = await createImageBitmap(blob);
      bitmap.close();
    } catch {
      return undefined;
    }
    const url = URL.createObjectURL(blob);
    this.images.set(path, url);
    return url;
  }

  /** The picture already read, if it was, so a view can draw it at once. */
  cachedImage(path: string): string | undefined {
    return this.images.get(path);
  }

  /**
   * Resized to 2048 px on the long side and written fresh as JPEG, which
   * drops the camera's location and other metadata before upload.
   */
  static async preparePhoto(data: Blob): Promise<DraftPhoto | undefined> {
    let source: ImageBitmap;
    try {
      source = await createImageBitmap(data, { imageOrientation: "from-image" });
    } catch {
      return undefined;
    }
    const longest = Math.max(source.width, source.height);
    const scale = Math.min(1, 2048 / Math.max(longest, 1));
    const width = rounded(source.width * scale);
    const height = rounded(source.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(source, 0, 0, width, height);
    source.close();
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!jpeg) return undefined;
    return DraftPhoto.make({ existing: undefined, jpeg, width, height });
  }

  // MARK: Comments

  async comments(a: { for: FeedPost }): Promise<PostComment[]> {
    const rows = (await this.get(
      `comments?select=id,post_id,user_id,body,created_at,author:profiles!comments_user_id_fkey(${SocialStore.profileFields})&post_id=eq.${a.for.id}&order=created_at.asc`,
    )) as unknown[];
    return rows.map(PostComment.decode);
  }

  async addComment(text: string, a: { to: FeedPost }): Promise<void> {
    const body = prefixChars(trimmingWhitespacesAndNewlines(text), 500);
    if (body === "") return;
    await this.send("comments", { method: "POST", body: JSON.stringify({ post_id: a.to.id, user_id: this.myID, body }) });
    this.bumpCommentCount(a.to.id, 1);
  }

  /** Your own comment, or any comment on your own post. */
  async deleteComment(comment: PostComment): Promise<void> {
    await this.send(`comments?id=eq.${comment.id}`, { method: "DELETE" });
    this.bumpCommentCount(comment.post_id, -1);
  }

  async reportComment(a: { comment: PostComment; reason: string }): Promise<void> {
    const body = JSON.stringify({
      reporter_id: this.myID,
      post_id: a.comment.post_id,
      comment_id: a.comment.id,
      reported_id: a.comment.user_id,
      reason: a.reason,
    });
    await this.send("reports", { method: "POST", body });
  }

  private bumpCommentCount(postID: string, step: number): void {
    const index = this.feed.findIndex((p) => p.id === postID);
    if (index < 0) return;
    this.feed = this.feed.map((p, i) => (i === index ? { ...p, comments: [{ count: Math.max(0, FeedPost.commentCount(p) + step) }] } : p));
    this.changed();
  }

  // MARK: Chat

  /** The newest message, for the Friends tab's chat row; refreshed with the tab. */
  chatLatest: ChatMessage | undefined = undefined;
  /**
   * The server has the chat (chat_messages answers). Until it does, the
   * Friends tab shows no way in, so the chat switches itself on the moment
   * the table exists, without a new version of the app.
   */
  chatAvailable = false;

  /**
   * Rooms are on the server (chat_rooms answers): Everyone, private chats and
   * rooms switch themselves on the moment the tables exist.
   */
  roomsAvailable = false;
  /** Every room you are in, Everyone first. */
  rooms: ChatRoom[] = [];
  /** The newest message per conversation, keyed by room id ("" is the friends' chat). */
  latestByRoom: Record<string, ChatMessage> = {};

  private get messageFields(): string {
    const base = `id,user_id,body,topic,created_at,author:profiles!chat_messages_user_id_fkey(${SocialStore.profileFields})`;
    return this.roomsAvailable ? `${base},room_id,image_path` : base;
  }

  /** The rooms you are in and each conversation's newest message. */
  async loadRooms(): Promise<void> {
    if (!this.me) return;
    try {
      const rows = (await this.get(
        `chat_rooms?select=id,kind,name,created_by,created_at,chat_members(user_id,member:profiles!chat_members_user_id_fkey(${SocialStore.profileFields}))&order=created_at.asc`,
      )) as unknown[];
      const rooms = rows.map(ChatRoom.decode);
      this.rooms = [...rooms.filter((r) => r.kind === "everyone"), ...rooms.filter((r) => r.kind !== "everyone")];
      this.roomsAvailable = true;
    } catch {
      this.changed();
      return;
    }
    try {
      const recent = ((await this.get(`chat_messages?select=${this.messageFields}&order=created_at.desc&limit=300`)) as unknown[]).map(ChatMessage.decode);
      const latest: Record<string, ChatMessage> = {};
      for (const message of recent) {
        const key = message.room_id ?? "";
        if (!latest[key]) latest[key] = message;
      }
      this.latestByRoom = latest;
      this.chatAvailable = true;
    } catch {
      /* the list keeps what it showed */
    }
    this.changed();
  }

  /** The last 100 messages of a conversation, oldest first; no room is the friends' chat. */
  async chatMessages(a: { room?: string } = {}): Promise<ChatMessage[]> {
    const where = this.roomsAvailable ? (a.room ? `&room_id=eq.${a.room}` : "&room_id=is.null") : "";
    const rows = (await this.get(`chat_messages?select=${this.messageFields}${where}&order=created_at.desc&limit=100`)) as unknown[];
    const messages = rows.map(ChatMessage.decode).reverse().filter((m) => !this.blockedIDs.has(m.user_id));
    const latest = messages[messages.length - 1];
    const key = a.room ?? "";
    if (latest && latest.id !== this.latestByRoom[key]?.id) {
      this.latestByRoom = { ...this.latestByRoom, [key]: latest };
      if (!a.room) this.chatLatest = latest;
      this.changed();
    }
    return messages;
  }

  private get blockedIDs(): Set<string> {
    return new Set(this.blocked.map((p) => p.user_id));
  }

  async refreshChatLatest(): Promise<void> {
    if (!this.me) return;
    try {
      const rows = (await this.get(
        `chat_messages?select=id,user_id,body,topic,created_at,author:profiles!chat_messages_user_id_fkey(${SocialStore.profileFields})&order=created_at.desc&limit=1`,
      )) as unknown[];
      this.chatLatest = rows.map(ChatMessage.decode)[0];
      this.chatAvailable = true;
      this.changed();
    } catch {
      /* the row keeps what it showed */
    }
    await this.loadRooms();
  }

  /** A message, with a photo if one is given; no room is the friends' chat. */
  async sendChat(text: string, a: { topic?: ChatTopic; room?: string; photo?: Blob } = {}): Promise<void> {
    const body = prefixChars(trimmingWhitespacesAndNewlines(text), 1000);
    if (body === "" && !a.photo) return;
    const row: Record<string, unknown> = { user_id: this.myID, body, topic: a.topic ?? null };
    if (a.room) row.room_id = a.room;
    if (a.photo) {
      const path = `${this.myID}/chat/${uuid().toLowerCase()}.jpg`;
      await this.storage(`object/post-media/${path}`, { method: "POST", body: a.photo, contentType: "image/jpeg" });
      row.image_path = path;
    }
    await this.send("chat_messages", { method: "POST", body: JSON.stringify(row) });
  }

  /** A room on a topic, with the friends picked; you are its first member. */
  async createRoom(name: string, memberIDs: string[]): Promise<ChatRoom> {
    const title = prefixChars(trimmingWhitespacesAndNewlines(name), 40);
    const data = await this.send("chat_rooms?select=id,kind,name,created_by,created_at", {
      method: "POST",
      prefer: "return=representation",
      body: JSON.stringify({ kind: "room", name: title, created_by: this.myID }),
    });
    const room = ChatRoom.decode((JSON.parse(data) as unknown[])[0]);
    const ids = [this.myID, ...new Set(memberIDs.filter((id) => id !== this.myID))];
    await this.send("chat_members", { method: "POST", body: JSON.stringify(ids.map((id) => ({ room_id: room.id, user_id: id }))) });
    await this.loadRooms();
    return this.rooms.find((r) => r.id === room.id) ?? room;
  }

  /** The private chat with a friend: the one you have, or a new one. */
  async directRoom(friend: SocialProfile): Promise<ChatRoom> {
    const held = this.rooms.find((r) => r.kind === "direct" && r.members.some((m) => m.user_id === friend.user_id));
    if (held) return held;
    const data = await this.send("chat_rooms?select=id,kind,name,created_by,created_at", {
      method: "POST",
      prefer: "return=representation",
      body: JSON.stringify({ kind: "direct", created_by: this.myID }),
    });
    const room = ChatRoom.decode((JSON.parse(data) as unknown[])[0]);
    await this.send("chat_members", {
      method: "POST",
      body: JSON.stringify([{ room_id: room.id, user_id: this.myID }, { room_id: room.id, user_id: friend.user_id }]),
    });
    await this.loadRooms();
    return this.rooms.find((r) => r.id === room.id) ?? { ...room, members: [this.me!, friend] };
  }

  /** Out of a room; the one who started it closes it for everyone. */
  async leaveRoom(room: ChatRoom): Promise<void> {
    if (room.created_by === this.myID) {
      await this.send(`chat_rooms?id=eq.${room.id}`, { method: "DELETE" });
    } else {
      await this.send(`chat_members?room_id=eq.${room.id}&user_id=eq.${this.myID}`, { method: "DELETE" });
    }
    this.rooms = this.rooms.filter((r) => r.id !== room.id);
    this.changed();
  }

  /** Your own messages only. */
  async deleteChat(message: ChatMessage): Promise<void> {
    await this.send(`chat_messages?id=eq.${message.id}`, { method: "DELETE" });
  }

  async reportChat(a: { message: ChatMessage; reason: string }): Promise<void> {
    const body = JSON.stringify({ reporter_id: this.myID, message_id: a.message.id, reported_id: a.message.user_id, reason: a.reason });
    await this.send("reports", { method: "POST", body });
  }

  /** This browser gets a push when someone writes to you (ChatPush.ts). */
  async savePushSubscription(a: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
    await this.send("rpc/save_push_subscription", { method: "POST", body: JSON.stringify({ p_endpoint: a.endpoint, p_p256dh: a.p256dh, p_auth: a.auth }) });
  }

  async forgetPushSubscription(endpoint: string): Promise<void> {
    await this.send(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" });
  }

  // MARK: Plumbing

  private async storage(path: string, a: { method?: string; body?: Blob | string; contentType?: string }): Promise<ArrayBuffer> {
    const app = this.app;
    if (!app) throw new SupabaseFailure("network");
    return app.social((client, session) => client.storage(path, { method: a.method ?? "GET", body: a.body, contentType: a.contentType, session }));
  }

  private async get(path: string): Promise<unknown> {
    const data = await this.send(path);
    return JSON.parse(data);
  }

  private async send(path: string, a: { method?: string; body?: string; prefer?: string } = {}): Promise<string> {
    const app = this.app;
    if (!app) throw new SupabaseFailure("network");
    return app.social((client, session) => client.rest(path, { method: a.method ?? "GET", body: a.body, prefer: a.prefer, session }));
  }

  static isoString(date: Date): string {
    return iso8601(date);
  }

  static parseDate(text: string): Date | undefined {
    return parseISO8601(text);
  }
}

/** `JSONEncoder` with `[.prettyPrinted, .sortedKeys]`: two-space indent, `" : "`, escaped slashes, absent optionals left out. */
function swiftPrettySortedJSON(value: unknown, indent = ""): string {
  const inner = indent + "  ";
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[\n\n" + indent + "]";
    return "[\n" + value.map((v) => inner + swiftPrettySortedJSON(v, inner)).join(",\n") + "\n" + indent + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as object).filter((k) => (value as Record<string, unknown>)[k] !== undefined).sort();
    if (keys.length === 0) return "{\n\n" + indent + "}";
    return (
      "{\n" +
      keys.map((k) => `${inner}${JSON.stringify(k).replace(/\//g, "\\/")} : ${swiftPrettySortedJSON((value as Record<string, unknown>)[k], inner)}`).join(",\n") +
      "\n" + indent + "}"
    );
  }
  if (typeof value === "string") return JSON.stringify(value).replace(/\//g, "\\/");
  return JSON.stringify(value);
}

// MARK: - The one instance, and SwiftUI's @Environment(SocialStore.self)

export const social = new SocialStore();

/** `@Environment(SocialStore.self) private var social` — redraws whenever the store changes. */
export function useSocial(): SocialStore {
  useSyncExternalStore(social.subscribe, social.getVersion);
  return social;
}
