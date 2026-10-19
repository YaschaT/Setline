import Foundation
import Observation
import UIKit
import SetlineCore

// MARK: - What the social tables hold

struct SocialProfile: Codable, Hashable, Identifiable, Sendable {
    let user_id: String
    let username: String
    let display_name: String
    var id: String { user_id }

    var initial: String { String(display_name.prefix(1)).uppercased() }
}

struct Friendship: Codable, Hashable, Sendable {
    let requester_id: String
    let addressee_id: String
    let status: String
    var requester: SocialProfile?
    var addressee: SocialProfile?

    var isAccepted: Bool { status == "accepted" }

    /// The other person in it, seen from `me`.
    func other(than me: String) -> SocialProfile? { requester_id == me ? addressee : requester }
}

struct PostMedal: Codable, Hashable, Sendable {
    let place: Int
    let name: String
    let weight_kg: Double
    let reps: Int
}

struct Kudos: Codable, Hashable, Sendable {
    let user_id: String
    var giver: SocialProfile?
}

/// Who can see a post. Public comes later (SOCIAL_FEATURES.md, phase 2).
enum PostVisibility: String, Codable, CaseIterable, Sendable {
    case `private`, friends

    var label: String { self == .private ? "Only you" : "Friends" }

    private static let defaultKey = "setline.social.defaultVisibility"

    /// The choice in Account › Privacy; Friends unless changed.
    static var defaultForNewPosts: PostVisibility {
        get { UserDefaults.standard.string(forKey: defaultKey).flatMap(PostVisibility.init(rawValue:)) ?? .friends }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: defaultKey) }
    }
}

/// A number a lifter can keep off a post.
enum HiddenStat: String, Codable, CaseIterable, Hashable, Sendable {
    case duration, volume, weights

    var label: String {
        switch self {
        case .duration: return "Duration"
        case .volume: return "Volume"
        case .weights: return "Weights on medals"
        }
    }
}

struct PostMedia: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let path: String
    var width: Int?
    var height: Int?
    var position: Int
}

struct PostTrack: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var kind: String
    var title: String
    var artist: String?
    var url: String?
    var position: Int

    var isPlaylist: Bool { kind == "playlist" }
}

struct CommentCount: Codable, Hashable, Sendable { let count: Int }

struct PostComment: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let post_id: String
    let user_id: String
    let body: String
    let created_at: String
    var author: SocialProfile?

    var date: Date { SocialStore.parseDate(created_at) ?? Date() }
}

/// A workout as a friend sees it: a summary, never the log itself.
struct FeedPost: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let user_id: String
    let session_id: String
    let workout_date: String
    let title: String
    let volume_kg: Double
    let duration_seconds: Int?
    let set_count: Int
    let medals: [PostMedal]
    let streak_weeks: Int
    var author: SocialProfile?
    var kudos: [Kudos]
    var place_kind: String? = nil
    var place_name: String? = nil
    var place_lat: Double? = nil
    var place_lon: Double? = nil
    var visibility: String? = nil
    var custom_title: String? = nil
    var notes: String? = nil
    var hidden_stats: [String]? = nil
    var post_media: [PostMedia]? = nil
    var post_tracks: [PostTrack]? = nil
    var comments: [CommentCount]? = nil
    var kind: String? = nil
    var rest_reason: String? = nil

    var isRest: Bool { kind == "rest" }

    /// Where it happened, when the lifter said.
    var place: WorkoutPlace? {
        guard let kind = place_kind.flatMap(WorkoutPlace.Kind.init(rawValue:)) else { return nil }
        return WorkoutPlace(kind: kind, name: place_name ?? kind.label, latitude: place_lat, longitude: place_lon)
    }

    var date: Date { SocialStore.parseDate(workout_date) ?? Date() }

    /// The lifter's own title, else the day's name.
    var displayTitle: String { custom_title?.isEmpty == false ? custom_title! : title }
    var postVisibility: PostVisibility { visibility.flatMap(PostVisibility.init(rawValue:)) ?? .friends }
    func hides(_ stat: HiddenStat) -> Bool { hidden_stats?.contains(stat.rawValue) == true }
    var photos: [PostMedia] { (post_media ?? []).sorted { $0.position < $1.position } }
    var tracks: [PostTrack] { (post_tracks ?? []).sorted { $0.position < $1.position } }
    var commentCount: Int { comments?.first?.count ?? 0 }
}

/// What the composer edits before anything is written.
struct PostDraft: Codable {
    var title = ""
    var notes = ""
    var visibility = PostVisibility.defaultForNewPosts
    var hidden: Set<HiddenStat> = []
    var place: WorkoutPlace?
    var tracks: [DraftTrack] = []
    var photos: [DraftPhoto] = []
    /// A rest day's why ("Sore", "Travel"); nil on a workout.
    var restReason: String?

    static let maxPhotos = 4
    static let maxSongs = 5

    private enum CodingKeys: String, CodingKey { case title, notes, visibility, hidden, place, tracks, photos, restReason }

    init() {}

    /// The draft for editing a post that exists.
    init(post: FeedPost) {
        title = post.custom_title ?? ""
        notes = post.notes ?? ""
        visibility = post.postVisibility
        hidden = Set((post.hidden_stats ?? []).compactMap(HiddenStat.init(rawValue:)))
        place = post.place
        tracks = post.tracks.map { DraftTrack(kind: $0.kind, title: $0.title, artist: $0.artist, url: $0.url) }
        photos = post.photos.map { DraftPhoto(existing: $0) }
        restReason = post.rest_reason
    }
}

struct DraftTrack: Identifiable, Hashable, Codable {
    var id = UUID()
    var kind = "song"
    var title: String
    var artist: String?
    var url: String?
}

/// A photo on a draft: one already on the post, or a new one, already
/// resized and re-encoded on this phone (no location or camera data).
struct DraftPhoto: Identifiable, Codable {
    var id = UUID()
    var existing: PostMedia?
    var jpeg: Data?
    var width: Int?
    var height: Int?
}

/// What a post row is written as.
private struct PostWrite: Encodable {
    let user_id: String
    let session_id: String
    let workout_date: String
    let title: String
    let volume_kg: Double
    let duration_seconds: Int?
    let set_count: Int
    let medals: [PostMedal]
    let streak_weeks: Int
    var kind = "workout"
    let draft: PostDraftFields

    private enum CodingKeys: String, CodingKey {
        case user_id, session_id, workout_date, title, volume_kg, duration_seconds, set_count, medals, streak_weeks, kind
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(user_id, forKey: .user_id)
        try c.encode(session_id, forKey: .session_id)
        try c.encode(workout_date, forKey: .workout_date)
        try c.encode(title, forKey: .title)
        try c.encode(volume_kg, forKey: .volume_kg)
        try c.encode(duration_seconds, forKey: .duration_seconds)
        try c.encode(set_count, forKey: .set_count)
        try c.encode(medals, forKey: .medals)
        try c.encode(streak_weeks, forKey: .streak_weeks)
        try c.encode(kind, forKey: .kind)
        try draft.encode(to: encoder)
    }
}

/// The parts of a post the lifter writes, always sent whole — nulls
/// included — so clearing a title, a note or a place clears it on the post.
private struct PostDraftFields: Encodable {
    let visibility: PostVisibility
    let customTitle: String?
    let notes: String?
    let hidden: [String]
    let place: WorkoutPlace?
    let restReason: String?
    var editedAt: String?

    init(_ draft: PostDraft, editedAt: String? = nil) {
        restReason = draft.restReason.map { String($0.prefix(40)) }
        visibility = draft.visibility
        let title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        customTitle = title.isEmpty ? nil : String(title.prefix(60))
        let notes = draft.notes.trimmingCharacters(in: .whitespacesAndNewlines)
        self.notes = notes.isEmpty ? nil : String(notes.prefix(2000))
        hidden = draft.hidden.map(\.rawValue).sorted()
        place = draft.place
        self.editedAt = editedAt
    }

    private enum CodingKeys: String, CodingKey {
        case visibility, custom_title, notes, hidden_stats, place_kind, place_name, place_lat, place_lon, edited_at, rest_reason
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(visibility.rawValue, forKey: .visibility)
        try c.encode(customTitle, forKey: .custom_title)
        try c.encode(notes, forKey: .notes)
        try c.encode(hidden, forKey: .hidden_stats)
        let shared = place?.shared
        try c.encode(shared?.kind.rawValue, forKey: .place_kind)
        try c.encode(shared?.name, forKey: .place_name)
        try c.encode(shared?.latitude, forKey: .place_lat)
        try c.encode(shared?.longitude, forKey: .place_lon)
        if let editedAt { try c.encode(editedAt, forKey: .edited_at) }
        if let restReason { try c.encode(restReason, forKey: .rest_reason) }
    }
}

/// Where a workout happened, as a post may carry it.
struct WorkoutPlace: Codable, Hashable, Sendable {
    enum Kind: String, Codable, Sendable {
        case gym, home, outdoors

        var label: String {
            switch self {
            case .gym: return "Gym"
            case .home: return "Home workout"
            case .outdoors: return "Outdoors"
            }
        }

        var symbol: String {
            switch self {
            case .gym: return "dumbbell.fill"
            case .home: return "house.fill"
            case .outdoors: return "tree.fill"
            }
        }
    }

    let kind: Kind
    let name: String
    let latitude: Double?
    let longitude: Double?

    /// What leaves the phone: a home never has coordinates, outdoors is
    /// rounded to about a kilometre, a gym — a public place — keeps its own.
    var shared: WorkoutPlace {
        switch kind {
        case .home:
            return WorkoutPlace(kind: .home, name: Kind.home.label, latitude: nil, longitude: nil)
        case .outdoors:
            func round2(_ value: Double?) -> Double? { value.map { ($0 * 100).rounded() / 100 } }
            return WorkoutPlace(kind: .outdoors, name: String(name.prefix(80)), latitude: round2(latitude), longitude: round2(longitude))
        case .gym:
            return WorkoutPlace(kind: .gym, name: String(name.prefix(80)), latitude: latitude, longitude: longitude)
        }
    }

    var hasMap: Bool { kind != .home && latitude != nil && longitude != nil }

    // MARK: Remembered gym

    private static let lastGymKey = "setline.social.lastGym"

    /// The gym picked last, offered as one tap next time. Kept on this phone.
    static var lastGym: WorkoutPlace? {
        get {
            guard let data = UserDefaults.standard.data(forKey: lastGymKey) else { return nil }
            return try? JSONDecoder().decode(WorkoutPlace.self, from: data)
        }
        set {
            UserDefaults.standard.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: lastGymKey)
        }
    }
}

// MARK: - The store

/// Friends, the feed and kudos for the signed-in account.
///
/// Everything goes through `AppState.social`, so tokens refresh as they do
/// for sync, and everything the server returns has already passed its
/// row-level security: this store never filters for privacy itself. Under
/// `-SetlineDemoData` it runs on sample friends instead, since the demo
/// account has no real token.
@MainActor
@Observable
final class SocialStore {
    enum Phase: Equatable {
        case loading
        /// The tables are not in the Supabase project yet.
        case notSetUp
        /// Signed in, but no username chosen.
        case needsProfile
        case ready
        case failed(String)
    }

    private(set) var phase: Phase = .loading
    private(set) var me: SocialProfile?
    private(set) var friendships: [Friendship] = []
    private(set) var feed: [FeedPost] = []

    private weak var app: AppState?
    private var demo = DemoSocial()
    /// The account the lists were read for; another sign-in starts clean.
    private var loadedFor: String?

    /// Ties the store to the app's sign-in, once, at launch.
    func attach(_ app: AppState) { self.app = app }

    private var isDemo: Bool {
        #if DEBUG
        DemoData.isEnabled
        #else
        false
        #endif
    }
    var myID: String { app?.userID ?? "" }

    var friends: [SocialProfile] {
        friendships.filter(\.isAccepted).compactMap { $0.other(than: myID) }.sorted { $0.display_name < $1.display_name }
    }
    var incoming: [Friendship] { friendships.filter { !$0.isAccepted && $0.addressee_id == myID } }
    var outgoing: [Friendship] { friendships.filter { !$0.isAccepted && $0.requester_id == myID } }

    // MARK: Loading

    func load() async {
        if loadedFor != myID {
            loadedFor = myID
            me = nil
            friendships = []
            feed = []
            phase = .loading
            loadPending()
        }
        guard !myID.isEmpty else { return }
        if phase != .ready { phase = .loading }
        if isDemo { return loadDemo() }
        do {
            let id = myID
            let rows: [SocialProfile] = try await get("profiles?select=user_id,username,display_name&user_id=eq.\(id)")
            guard let profile = rows.first else {
                me = nil
                phase = .needsProfile
                return
            }
            me = profile
            async let friendships: [Friendship] = get(Self.friendshipsQuery)
            async let feed: [FeedPost] = get(Self.feedQuery)
            self.friendships = try await friendships
            self.feed = try await feed
            phase = .ready
            offlineSince = nil
            lastLoaded = Date()
            saveFeedCache()
            if !pending.isEmpty, !flushing {
                flushing = true
                await sendPending()
                flushing = false
            }
        } catch SupabaseClient.Failure.network {
            // No connection: what loaded last stays readable (SETLINE Social S3).
            if feed.isEmpty { loadFeedCache() }
            if me != nil || !feed.isEmpty {
                offlineSince = offlineSince ?? Date()
                phase = .ready
            } else {
                phase = .failed(SupabaseClient.Failure.network.errorDescription ?? "No connection.")
            }
        } catch {
            phase = Self.phase(for: error)
        }
    }

    /// Set while the feed shows what loaded before the connection went.
    private(set) var offlineSince: Date?
    /// When the feed last loaded from the server.
    private(set) var lastLoaded: Date?

    private struct FeedCache: Codable {
        let me: SocialProfile
        let friendships: [Friendship]
        let feed: [FeedPost]
        let loaded: Date
    }

    private var feedCacheFile: URL? {
        guard !myID.isEmpty, let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        return base.appendingPathComponent("SocialFeed", isDirectory: true).appendingPathComponent("\(myID).json")
    }

    private func saveFeedCache() {
        guard let file = feedCacheFile, let me else { return }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        let cache = FeedCache(me: me, friendships: friendships, feed: feed, loaded: lastLoaded ?? Date())
        try? JSONEncoder().encode(cache).write(to: file, options: [.atomic, .completeFileProtection])
    }

    private func loadFeedCache() {
        guard let file = feedCacheFile, let data = try? Data(contentsOf: file),
              let cache = try? JSONDecoder().decode(FeedCache.self, from: data) else { return }
        me = me ?? cache.me
        friendships = cache.friendships
        feed = cache.feed
        lastLoaded = cache.loaded
    }

    private static let profileFields = "user_id,username,display_name"
    private static let friendshipsQuery =
        "friendships?select=*,requester:profiles!friendships_requester_id_fkey(\(profileFields)),addressee:profiles!friendships_addressee_id_fkey(\(profileFields))"
    private static let feedQuery =
        "posts?select=*,author:profiles!posts_user_id_fkey(\(profileFields)),kudos(user_id,giver:profiles!kudos_user_id_fkey(\(profileFields))),post_media(id,path,width,height,position),post_tracks(id,kind,title,artist,url,position),comments(count)&order=workout_date.desc&limit=50"

    /// A missing table reads as "not set up"; anything else as a failure in
    /// words.
    private static func phase(for error: Error) -> Phase {
        let text = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        if text.contains("Could not find the table") || text.contains("PGRST205") { return .notSetUp }
        return .failed(text)
    }

    // MARK: Profile

    /// "Yascha T." → "yascha_t": a starting point for the username field.
    static func suggestedUsername(from name: String?) -> String {
        let base = (name ?? "").lowercased().map { $0.isLetter || $0.isNumber ? String($0) : "_" }.joined()
        let trimmed = base.split(separator: "_").joined(separator: "_")
        return String(trimmed.prefix(20))
    }

    static func isValidUsername(_ name: String) -> Bool {
        name.range(of: "^[a-z0-9_]{3,20}$", options: .regularExpression) != nil
    }

    func createProfile(username: String, displayName: String) async throws {
        let profile = SocialProfile(user_id: myID, username: username, display_name: displayName)
        if isDemo {
            me = profile
            phase = .ready
            return loadDemo()
        }
        do {
            _ = try await send("profiles", method: "POST", body: try JSONEncoder().encode(profile))
        } catch {
            let text = (error as? LocalizedError)?.errorDescription ?? ""
            if text.contains("duplicate") || text.contains("unique") {
                throw SupabaseClient.Failure.message("@\(username) is taken. Try another.")
            }
            throw error
        }
        await load()
    }

    // MARK: Friends

    func find(username: String) async throws -> SocialProfile? {
        let name = username.lowercased().trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "@"))
        guard Self.isValidUsername(name) else { return nil }
        if isDemo { return demo.people.first { $0.username == name } }
        let rows: [SocialProfile] = try await get("profiles?select=\(Self.profileFields)&username=eq.\(name)")
        return rows.first
    }

    func request(_ profile: SocialProfile) async throws {
        guard profile.user_id != myID else { return }
        if isDemo {
            friendships.append(Friendship(requester_id: myID, addressee_id: profile.user_id, status: "pending", requester: me, addressee: profile))
            return
        }
        let body = try JSONSerialization.data(withJSONObject: ["requester_id": myID, "addressee_id": profile.user_id])
        _ = try await send("friendships", method: "POST", body: body)
        await load()
    }

    func accept(_ friendship: Friendship) async throws {
        if isDemo {
            friendships = friendships.map { $0.requester_id == friendship.requester_id && $0.addressee_id == friendship.addressee_id
                ? Friendship(requester_id: $0.requester_id, addressee_id: $0.addressee_id, status: "accepted", requester: $0.requester, addressee: $0.addressee) : $0 }
            return
        }
        let body = try JSONSerialization.data(withJSONObject: ["status": "accepted", "accepted_at": Self.isoString(Date())])
        _ = try await send("friendships?requester_id=eq.\(friendship.requester_id)&addressee_id=eq.\(myID)", method: "PATCH", body: body)
        await load()
    }

    /// Declines a request, cancels one sent, or ends a friendship.
    func remove(_ other: String) async throws {
        if isDemo {
            friendships.removeAll { $0.other(than: myID)?.user_id == other }
            feed.removeAll { $0.user_id == other }
            return
        }
        let me = myID
        _ = try await send("friendships?or=(and(requester_id.eq.\(me),addressee_id.eq.\(other)),and(requester_id.eq.\(other),addressee_id.eq.\(me)))", method: "DELETE")
        await load()
    }

    /// Ends any friendship with them and stops requests either way.
    func block(_ other: String) async throws {
        if isDemo { return try await remove(other) }
        let body = try JSONSerialization.data(withJSONObject: ["blocker_id": myID, "blocked_id": other])
        _ = try await send("blocks", method: "POST", body: body)
        await load()
    }

    func report(post: FeedPost, reason: String) async throws {
        if isDemo { return }
        let body = try JSONSerialization.data(withJSONObject: [
            "reporter_id": myID, "post_id": post.id, "reported_id": post.user_id, "reason": reason,
        ])
        _ = try await send("reports", method: "POST", body: body)
    }

    // MARK: Blocked people

    private(set) var blocked: [SocialProfile] = []

    /// The people this account blocked, for Account › Privacy.
    func loadBlocked() async {
        if isDemo { return }
        struct Row: Decodable { let blocked_id: String }
        guard let rows: [Row] = try? await get("blocks?select=blocked_id&blocker_id=eq.\(myID)") else { return }
        let ids = rows.map(\.blocked_id)
        guard !ids.isEmpty else { blocked = []; return }
        blocked = (try? await get("profiles?select=\(Self.profileFields)&user_id=in.(\(ids.joined(separator: ",")))")) ?? []
    }

    func unblock(_ other: String) async throws {
        blocked.removeAll { $0.user_id == other }
        if isDemo { return }
        _ = try await send("blocks?blocker_id=eq.\(myID)&blocked_id=eq.\(other)", method: "DELETE")
    }

    // MARK: Export

    /// Every post this account wrote, with its comments, for "Export
    /// everything" (GDPR art. 20).
    func exportMyPosts() async -> Data? {
        let mine: [FeedPost]
        if isDemo {
            mine = feed.filter { $0.user_id == myID }
        } else {
            guard let rows: [FeedPost] = try? await get(
                "posts?select=*,kudos(user_id),post_media(id,path,width,height,position),post_tracks(id,kind,title,artist,url,position),comments(count)&user_id=eq.\(myID)&order=workout_date.desc"
            ) else { return nil }
            mine = rows
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try? encoder.encode(mine)
    }

    // MARK: Invites

    /// The link a friend opens to add this account: setline://add/<username>.
    var inviteURL: URL? { me.flatMap { URL(string: "setline://add/\($0.username)") } }

    // MARK: Kudos

    func hasKudos(_ post: FeedPost) -> Bool { post.kudos.contains { $0.user_id == myID } }

    /// Gives or takes back kudos, shown at once and undone if the server
    /// refuses.
    func toggleKudos(_ post: FeedPost) async {
        guard offlineSince == nil, post.user_id != myID, let index = feed.firstIndex(where: { $0.id == post.id }) else { return }
        let giving = !hasKudos(post)
        let before = feed[index]
        if giving {
            feed[index].kudos.append(Kudos(user_id: myID, giver: me))
        } else {
            feed[index].kudos.removeAll { $0.user_id == myID }
        }
        guard !isDemo else { return }
        do {
            if giving {
                let body = try JSONSerialization.data(withJSONObject: ["post_id": post.id, "user_id": myID])
                _ = try await send("kudos", method: "POST", body: body)
            } else {
                _ = try await send("kudos?post_id=eq.\(post.id)&user_id=eq.\(myID)", method: "DELETE")
            }
        } catch {
            if let again = feed.firstIndex(where: { $0.id == post.id }) { feed[again] = before }
        }
    }

    // MARK: Posting

    /// Turns a saved workout into a post — the lifter's explicit choice;
    /// saving a workout never posts it. Posting the same workout again
    /// updates the one post.
    /// A post that could not go out for lack of a connection: kept on this
    /// phone, photos included, and sent on the next successful load.
    struct PendingPost: Codable, Identifiable {
        var id: String { session.id }
        let session: TrainingSession
        let medals: [PostMedal]
        let streakWeeks: Int
        let draft: PostDraft
    }

    /// Each new photo's upload, for the composer's tiles (SETLINE Social S1).
    enum UploadState { case waiting, uploading, done, failed }
    private(set) var uploads: [UUID: UploadState] = [:]
    func clearUploads() { uploads = [:] }

    /// Thrown when a post was queued instead of sent.
    struct Queued: Error {}

    private(set) var pending: [PendingPost] = []
    private var flushing = false

    func createPost(from session: TrainingSession, medals: [LiftMedal], streakWeeks: Int, draft: PostDraft) async throws {
        let postMedals = medals.map {
            PostMedal(place: $0.place.rawValue, name: $0.name, weight_kg: NSDecimalNumber(decimal: $0.weightKg).doubleValue, reps: $0.reps)
        }
        do {
            try await sendPost(session: session, medals: postMedals, streakWeeks: streakWeeks, draft: draft)
        } catch SupabaseClient.Failure.network {
            pending.removeAll { $0.session.id == session.id }
            pending.append(PendingPost(session: session, medals: postMedals, streakWeeks: streakWeeks, draft: draft))
            savePending()
            throw Queued()
        }
    }

    /// The session id a rest day's post is stored under: one per day.
    nonisolated static func restID(_ date: Date) -> String { "rest-\(Schedule.dateKey(date))" }

    /// Posts a rest day, with why. It carries no numbers and never counts
    /// as a workout.
    func createRestPost(on date: Date, streakWeeks: Int, draft: PostDraft) async throws {
        let write = PostWrite(
            user_id: myID, session_id: Self.restID(date), workout_date: Self.isoString(date),
            title: "Rest day", volume_kg: 0, duration_seconds: nil, set_count: 0, medals: [],
            streak_weeks: streakWeeks, kind: "rest", draft: PostDraftFields(draft)
        )
        if isDemo {
            guard let me else { return }
            let id = feed.first { $0.session_id == write.session_id && $0.user_id == myID }?.id ?? UUID().uuidString
            feed.removeAll { $0.id == id }
            var post = FeedPost(id: id, user_id: myID, session_id: write.session_id, workout_date: write.workout_date,
                                title: write.title, volume_kg: 0, duration_seconds: nil, set_count: 0, medals: [],
                                streak_weeks: streakWeeks, author: me, kudos: [], kind: "rest")
            demoApply(draft, to: &post)
            feed.insert(post, at: 0)
            return
        }
        let data = try await send(
            "posts?on_conflict=user_id,session_id&select=id",
            method: "POST",
            body: try JSONEncoder().encode(write),
            prefer: "resolution=merge-duplicates,return=representation"
        )
        struct Row: Decodable { let id: String }
        guard let postID = try JSONDecoder().decode([Row].self, from: data).first?.id else { return }
        try await syncAttachments(of: postID, existing: nil, draft: draft)
        await load()
    }

    /// Whether this account already posted the given workout or rest day.
    func hasPost(sessionID: String) -> Bool {
        feed.contains { $0.session_id == sessionID && $0.user_id == myID } || pending.contains { $0.session.id == sessionID }
    }

    /// Sends what was queued, oldest first; stops at the first that still
    /// cannot go out.
    func sendPending() async {
        guard me != nil else { return }
        for item in pending {
            do {
                try await sendPost(session: item.session, medals: item.medals, streakWeeks: item.streakWeeks, draft: item.draft)
                pending.removeAll { $0.id == item.id }
                savePending()
            } catch {
                return
            }
        }
    }

    private var pendingFile: URL? {
        guard !myID.isEmpty, let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        return base.appendingPathComponent("PendingPosts", isDirectory: true).appendingPathComponent("\(myID).json")
    }

    private func loadPending() {
        guard let file = pendingFile, let data = try? Data(contentsOf: file) else { pending = []; return }
        pending = (try? JSONDecoder().decode([PendingPost].self, from: data)) ?? []
    }

    private func savePending() {
        guard let file = pendingFile else { return }
        if pending.isEmpty { try? FileManager.default.removeItem(at: file); return }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? JSONEncoder().encode(pending).write(to: file, options: [.atomic, .completeFileProtection])
    }

    private func sendPost(session: TrainingSession, medals: [PostMedal], streakWeeks: Int, draft: PostDraft) async throws {
        guard session.kind == .workout else { return }
        #if DEBUG
        // `-SetlineSocialOffline`: posting fails as if there were no connection.
        if isDemo, ProcessInfo.processInfo.arguments.contains("-SetlineSocialOffline") { throw SupabaseClient.Failure.network }
        #endif
        let write = PostWrite(
            user_id: myID,
            session_id: session.id,
            workout_date: Self.isoString(session.date),
            title: session.dayLabel,
            volume_kg: NSDecimalNumber(decimal: RecordsEngine.volumeLoad(session.results.flatMap(\.sets))).doubleValue,
            duration_seconds: session.durationSeconds,
            set_count: session.results.flatMap(\.sets).filter(\.countsTowardVolume).count,
            medals: medals,
            streak_weeks: streakWeeks,
            draft: PostDraftFields(draft)
        )
        if isDemo {
            guard let me else { return }
            let id = feed.first { $0.session_id == session.id && $0.user_id == myID }?.id ?? UUID().uuidString
            feed.removeAll { $0.id == id }
            var post = FeedPost(id: id, user_id: myID, session_id: write.session_id, workout_date: write.workout_date,
                                title: write.title, volume_kg: write.volume_kg, duration_seconds: write.duration_seconds,
                                set_count: write.set_count, medals: write.medals, streak_weeks: write.streak_weeks,
                                author: me, kudos: [])
            demoApply(draft, to: &post)
            feed.insert(post, at: 0)
            return
        }
        let data = try await send(
            "posts?on_conflict=user_id,session_id&select=id",
            method: "POST",
            body: try JSONEncoder().encode(write),
            prefer: "resolution=merge-duplicates,return=representation"
        )
        struct Row: Decodable { let id: String }
        guard let postID = try JSONDecoder().decode([Row].self, from: data).first?.id else { return }
        // A retry after a dropped connection may find photos from the
        // attempt before; they go first, so none is posted twice.
        struct PathRow: Decodable { let path: String }
        let leftover: [PathRow] = (try? await get("post_media?select=path&post_id=eq.\(postID)")) ?? []
        if !leftover.isEmpty {
            try await removeFiles(leftover.map(\.path))
            _ = try await send("post_media?post_id=eq.\(postID)", method: "DELETE")
        }
        try await syncAttachments(of: postID, existing: nil, draft: draft)
        await load()
    }

    /// Saves an edited post: its words, visibility, place, music and
    /// photos. Changes apply on the next read, for everyone.
    func update(_ post: FeedPost, draft: PostDraft) async throws {
        if isDemo {
            guard let index = feed.firstIndex(where: { $0.id == post.id }) else { return }
            demoApply(draft, to: &feed[index])
            return
        }
        let fields = PostDraftFields(draft, editedAt: Self.isoString(Date()))
        _ = try await send("posts?id=eq.\(post.id)", method: "PATCH", body: try JSONEncoder().encode(fields))
        try await syncAttachments(of: post.id, existing: post, draft: draft)
        await load()
    }

    /// Music is rewritten whole; photos keep what stayed, lose what was
    /// taken off (files included) and upload what is new.
    private func syncAttachments(of postID: String, existing: FeedPost?, draft: PostDraft) async throws {
        _ = try await send("post_tracks?post_id=eq.\(postID)", method: "DELETE")
        if !draft.tracks.isEmpty {
            let rows: [[String: Any]] = draft.tracks.prefix(PostDraft.maxSongs + 1).enumerated().map { index, track in
                var row: [String: Any] = ["post_id": postID, "user_id": myID, "position": index, "kind": track.kind, "title": String(track.title.prefix(120))]
                if let artist = track.artist, !artist.isEmpty { row["artist"] = String(artist.prefix(120)) }
                if let url = track.url, url.hasPrefix("https://") { row["url"] = String(url.prefix(500)) }
                return row
            }
            _ = try await send("post_tracks", method: "POST", body: try JSONSerialization.data(withJSONObject: rows))
        }

        let kept = Set(draft.photos.compactMap(\.existing?.id))
        let removed = (existing?.photos ?? []).filter { !kept.contains($0.id) }
        if !removed.isEmpty {
            try await removeFiles(removed.map(\.path))
            _ = try await send("post_media?id=in.(\(removed.map(\.id).joined(separator: ",")))", method: "DELETE")
        }
        for photo in draft.photos where photo.existing == nil { uploads[photo.id] = .waiting }
        for (position, photo) in draft.photos.prefix(PostDraft.maxPhotos).enumerated() {
            if let media = photo.existing {
                if media.position != position {
                    let body = try JSONSerialization.data(withJSONObject: ["position": position])
                    _ = try await send("post_media?id=eq.\(media.id)", method: "PATCH", body: body)
                }
                continue
            }
            guard let jpeg = photo.jpeg else { continue }
            uploads[photo.id] = .uploading
            do {
                let path = "\(myID)/\(postID)/\(UUID().uuidString.lowercased()).jpg"
                _ = try await storage("object/post-media/\(path)", method: "POST", body: jpeg, contentType: "image/jpeg")
                var row: [String: Any] = ["post_id": postID, "user_id": myID, "path": path, "position": position]
                if let width = photo.width { row["width"] = width }
                if let height = photo.height { row["height"] = height }
                _ = try await send("post_media", method: "POST", body: try JSONSerialization.data(withJSONObject: row))
                uploads[photo.id] = .done
            } catch {
                uploads[photo.id] = .failed
                throw error
            }
        }
    }

    /// Deletes a post with its photos — files first, so none is left behind
    /// — and with it its comments, kudos and music.
    func delete(_ post: FeedPost) async throws {
        feed.removeAll { $0.id == post.id }
        if isDemo {
            post.photos.forEach { demoMedia[$0.path] = nil }
            demoComments[post.id] = nil
            return
        }
        try await removeFiles(post.photos.map(\.path))
        _ = try await send("posts?id=eq.\(post.id)", method: "DELETE")
    }

    /// Account › Privacy: every post this account wrote, photos included.
    /// The workouts themselves stay in the log.
    func deleteAllMyPosts() async throws {
        let mine = myID
        if isDemo {
            feed.filter { $0.user_id == mine }.flatMap(\.photos).forEach { demoMedia[$0.path] = nil }
            feed.removeAll { $0.user_id == mine }
            return
        }
        struct PathRow: Decodable { let path: String }
        let rows: [PathRow] = try await get("post_media?select=path&user_id=eq.\(mine)")
        try await removeFiles(rows.map(\.path))
        _ = try await send("posts?user_id=eq.\(mine)", method: "DELETE")
        await load()
    }

    var myPostCount: Int { feed.filter { $0.user_id == myID }.count }

    private func removeFiles(_ paths: [String]) async throws {
        guard !paths.isEmpty else { return }
        let body = try JSONSerialization.data(withJSONObject: ["prefixes": paths])
        _ = try await storage("object/post-media", method: "DELETE", body: body, contentType: "application/json")
    }

    // MARK: Photos

    private let images = NSCache<NSString, UIImage>()

    /// A post photo, read with the account's token: the bucket is private
    /// and only those who can see the post may read it.
    func image(_ path: String) async -> UIImage? {
        if let cached = images.object(forKey: path as NSString) { return cached }
        let data: Data?
        if isDemo {
            data = demoMedia[path]
        } else {
            data = try? await storage("object/authenticated/post-media/\(path)")
        }
        guard let data, let image = UIImage(data: data) else { return nil }
        images.setObject(image, forKey: path as NSString)
        return image
    }

    /// Resized to 2048 px on the long side and written fresh as JPEG, which
    /// drops the camera's location and other metadata before upload.
    nonisolated static func preparePhoto(_ data: Data) -> DraftPhoto? {
        guard let source = UIImage(data: data) else { return nil }
        let longest = max(source.size.width, source.size.height)
        let scale = min(1, 2048 / max(longest, 1))
        let size = CGSize(width: (source.size.width * scale).rounded(), height: (source.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            source.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let jpeg = resized.jpegData(compressionQuality: 0.8) else { return nil }
        return DraftPhoto(existing: nil, jpeg: jpeg, width: Int(size.width), height: Int(size.height))
    }

    // MARK: Comments

    func comments(for post: FeedPost) async throws -> [PostComment] {
        if isDemo { return demoComments[post.id] ?? [] }
        return try await get("comments?select=id,post_id,user_id,body,created_at,author:profiles!comments_user_id_fkey(\(Self.profileFields))&post_id=eq.\(post.id)&order=created_at.asc")
    }

    func addComment(_ text: String, to post: FeedPost) async throws {
        let body = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(500))
        guard !body.isEmpty else { return }
        if isDemo {
            let comment = PostComment(id: UUID().uuidString, post_id: post.id, user_id: myID, body: body, created_at: Self.isoString(Date()), author: me)
            demoComments[post.id, default: []].append(comment)
            bumpCommentCount(post.id, by: 1)
            return
        }
        let row = try JSONSerialization.data(withJSONObject: ["post_id": post.id, "user_id": myID, "body": body])
        _ = try await send("comments", method: "POST", body: row)
        bumpCommentCount(post.id, by: 1)
    }

    /// Your own comment, or any comment on your own post.
    func deleteComment(_ comment: PostComment) async throws {
        if isDemo {
            demoComments[comment.post_id]?.removeAll { $0.id == comment.id }
            bumpCommentCount(comment.post_id, by: -1)
            return
        }
        _ = try await send("comments?id=eq.\(comment.id)", method: "DELETE")
        bumpCommentCount(comment.post_id, by: -1)
    }

    func report(comment: PostComment, reason: String) async throws {
        if isDemo { return }
        let body = try JSONSerialization.data(withJSONObject: [
            "reporter_id": myID, "post_id": comment.post_id, "comment_id": comment.id,
            "reported_id": comment.user_id, "reason": reason,
        ])
        _ = try await send("reports", method: "POST", body: body)
    }

    private func bumpCommentCount(_ postID: String, by step: Int) {
        guard let index = feed.firstIndex(where: { $0.id == postID }) else { return }
        feed[index].comments = [CommentCount(count: max(0, feed[index].commentCount + step))]
    }

    // MARK: Demo posts

    private var demoMedia: [String: Data] = [:]
    private var demoComments: [String: [PostComment]] = [:]

    private func demoApply(_ draft: PostDraft, to post: inout FeedPost) {
        let fields = PostDraftFields(draft)
        post.visibility = fields.visibility.rawValue
        post.custom_title = fields.customTitle
        post.notes = fields.notes
        post.hidden_stats = fields.hidden
        post.rest_reason = fields.restReason
        let shared = draft.place?.shared
        post.place_kind = shared?.kind.rawValue
        post.place_name = shared?.name
        post.place_lat = shared?.latitude
        post.place_lon = shared?.longitude
        post.post_tracks = draft.tracks.enumerated().map { index, track in
            PostTrack(id: track.id.uuidString, kind: track.kind, title: track.title, artist: track.artist, url: track.url, position: index)
        }
        let postID = post.id
        post.post_media = draft.photos.prefix(PostDraft.maxPhotos).enumerated().compactMap { index, photo in
            if var media = photo.existing { media.position = index; return media }
            guard let jpeg = photo.jpeg else { return nil }
            let path = "demo/\(postID)/\(photo.id.uuidString).jpg"
            demoMedia[path] = jpeg
            return PostMedia(id: photo.id.uuidString, path: path, width: photo.width, height: photo.height, position: index)
        }
    }

    // MARK: Plumbing

    private func storage(_ path: String, method: String = "GET", body: Data? = nil, contentType: String? = nil) async throws -> Data {
        guard let app else { throw SupabaseClient.Failure.network }
        return try await app.social { client, session in
            try await client.storage(path, method: method, body: body, contentType: contentType, session: session)
        }
    }


    private func get<T: Decodable & Sendable>(_ path: String) async throws -> T {
        let data = try await send(path)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func send(_ path: String, method: String = "GET", body: Data? = nil, prefer: String? = nil) async throws -> Data {
        guard let app else { throw SupabaseClient.Failure.network }
        return try await app.social { client, session in
            try await client.rest(path, method: method, body: body, prefer: prefer, session: session)
        }
    }

    nonisolated static func isoString(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    nonisolated static func parseDate(_ text: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: text) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: text)
    }

    // MARK: Demo

    private func loadDemo() {
        if me == nil, !ProcessInfo.processInfo.arguments.contains("-SetlineSocialNoProfile") {
            me = SocialProfile(user_id: myID, username: "yascha", display_name: app?.greetingName ?? "Yascha")
        }
        guard me != nil else {
            phase = .needsProfile
            return
        }
        // `-SetlineSocialNoFriends`: the account that has just started, with
        // only its own posts.
        let alone = ProcessInfo.processInfo.arguments.contains("-SetlineSocialNoFriends")
        if friendships.isEmpty, !alone { friendships = demo.friendships(me: me!) }
        if feed.isEmpty { feed = demo.feed(me: me!).filter { !alone || $0.user_id == myID } }
        phase = .ready
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-SetlineSocialOffline") {
            offlineSince = Date()
            lastLoaded = Date().addingTimeInterval(-25 * 60)
        }
        #endif
        if !pending.isEmpty, !flushing {
            flushing = true
            Task {
                await sendPending()
                flushing = false
            }
        }
    }
}

/// Sample friends for the simulator.
private struct DemoSocial {
    let sam = SocialProfile(user_id: "demo-sam", username: "sam", display_name: "Sam Peeters")
    let cleo = SocialProfile(user_id: "demo-cleo", username: "cleo", display_name: "Cleo Janssens")
    let noah = SocialProfile(user_id: "demo-noah", username: "noah", display_name: "Noah De Smet")
    let lina = SocialProfile(user_id: "demo-lina", username: "lina", display_name: "Lina Maes")

    var people: [SocialProfile] { [sam, cleo, noah, lina] }

    func friendships(me: SocialProfile) -> [Friendship] {
        [
            Friendship(requester_id: me.user_id, addressee_id: sam.user_id, status: "accepted", requester: me, addressee: sam),
            Friendship(requester_id: cleo.user_id, addressee_id: me.user_id, status: "accepted", requester: cleo, addressee: me),
            Friendship(requester_id: noah.user_id, addressee_id: me.user_id, status: "pending", requester: noah, addressee: me),
        ]
    }

    func feed(me: SocialProfile) -> [FeedPost] {
        let now = Date()
        func at(_ hours: Double) -> String { SocialStore.isoString(now.addingTimeInterval(-hours * 3600)) }
        return [
            FeedPost(id: "p1", user_id: sam.user_id, session_id: "x1", workout_date: at(2), title: "Legs", volume_kg: 11_480,
                     duration_seconds: 4_020, set_count: 21,
                     medals: [PostMedal(place: 1, name: "Back squat", weight_kg: 140, reps: 5),
                              PostMedal(place: 3, name: "Romanian deadlift", weight_kg: 110, reps: 8)],
                     streak_weeks: 7, author: sam,
                     kudos: [Kudos(user_id: cleo.user_id, giver: cleo)],
                     place_kind: "gym", place_name: "Basic-Fit Antwerpen Meir", place_lat: 51.2181, place_lon: 4.4086),
            FeedPost(id: "p2", user_id: me.user_id, session_id: "x2", workout_date: at(20), title: "Push", volume_kg: 7_200,
                     duration_seconds: 3_060, set_count: 19,
                     medals: [PostMedal(place: 1, name: "Flat bench press", weight_kg: 102.5, reps: 8)],
                     streak_weeks: 4, author: me,
                     kudos: [Kudos(user_id: sam.user_id, giver: sam), Kudos(user_id: cleo.user_id, giver: cleo)],
                     place_kind: "gym", place_name: "Jims Antwerpen Centraal", place_lat: 51.2155, place_lon: 4.4211),
            FeedPost(id: "p3", user_id: cleo.user_id, session_id: "x3", workout_date: at(27), title: "Upper", volume_kg: 6_340,
                     duration_seconds: 3_480, set_count: 18,
                     medals: [PostMedal(place: 2, name: "Pull-up", weight_kg: 10, reps: 8)],
                     streak_weeks: 12, author: cleo, kudos: [],
                     place_kind: "home", place_name: "Home workout"),
        ]
    }
}
