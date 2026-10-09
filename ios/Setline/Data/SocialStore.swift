import Foundation
import Observation
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

    var date: Date { SocialStore.parseDate(workout_date) ?? Date() }
}

/// What a post is written as.
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

    private var isDemo: Bool { DemoData.isEnabled }
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
        } catch {
            phase = Self.phase(for: error)
        }
    }

    private static let profileFields = "user_id,username,display_name"
    private static let friendshipsQuery =
        "friendships?select=*,requester:profiles!friendships_requester_id_fkey(\(profileFields)),addressee:profiles!friendships_addressee_id_fkey(\(profileFields))"
    private static let feedQuery =
        "posts?select=*,author:profiles(\(profileFields)),kudos(user_id,giver:profiles(\(profileFields)))&order=workout_date.desc&limit=50"

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

    // MARK: Kudos

    func hasKudos(_ post: FeedPost) -> Bool { post.kudos.contains { $0.user_id == myID } }

    /// Gives or takes back kudos, shown at once and undone if the server
    /// refuses.
    func toggleKudos(_ post: FeedPost) async {
        guard post.user_id != myID, let index = feed.firstIndex(where: { $0.id == post.id }) else { return }
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

    /// Writes a saved workout as a post — or updates the one already there —
    /// when the account has a profile. Quiet when it has none or the tables
    /// are not set up: posting is never what stands between a lifter and a
    /// saved session.
    func publish(_ session: TrainingSession, medals: [LiftMedal], streakWeeks: Int) async {
        guard session.kind == .workout else { return }
        let write = PostWrite(
            user_id: myID,
            session_id: session.id,
            workout_date: Self.isoString(session.date),
            title: session.dayLabel,
            volume_kg: NSDecimalNumber(decimal: RecordsEngine.volumeLoad(session.results.flatMap(\.sets))).doubleValue,
            duration_seconds: session.durationSeconds,
            set_count: session.results.flatMap(\.sets).filter(\.countsTowardVolume).count,
            medals: medals.map {
                PostMedal(place: $0.place.rawValue, name: $0.name, weight_kg: NSDecimalNumber(decimal: $0.weightKg).doubleValue, reps: $0.reps)
            },
            streak_weeks: streakWeeks
        )
        if isDemo {
            guard let me else { return }
            feed.removeAll { $0.session_id == session.id && $0.user_id == myID }
            feed.insert(FeedPost(id: UUID().uuidString, user_id: myID, session_id: write.session_id, workout_date: write.workout_date,
                                 title: write.title, volume_kg: write.volume_kg, duration_seconds: write.duration_seconds,
                                 set_count: write.set_count, medals: write.medals, streak_weeks: write.streak_weeks,
                                 author: me, kudos: []), at: 0)
            return
        }
        guard me != nil || phase == .loading else { return }
        do {
            _ = try await send(
                "posts?on_conflict=user_id,session_id",
                method: "POST",
                body: try JSONEncoder().encode(write),
                prefer: "resolution=merge-duplicates"
            )
            await load()
        } catch {
            // A post that did not go out is not worth an alert after a workout.
        }
    }

    func delete(_ post: FeedPost) async throws {
        feed.removeAll { $0.id == post.id }
        guard !isDemo else { return }
        _ = try await send("posts?id=eq.\(post.id)", method: "DELETE")
    }

    // MARK: Plumbing

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
        if friendships.isEmpty { friendships = demo.friendships(me: me!) }
        if feed.isEmpty { feed = demo.feed(me: me!) }
        phase = .ready
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
                     kudos: [Kudos(user_id: cleo.user_id, giver: cleo)]),
            FeedPost(id: "p2", user_id: me.user_id, session_id: "x2", workout_date: at(20), title: "Push", volume_kg: 7_200,
                     duration_seconds: 3_060, set_count: 19,
                     medals: [PostMedal(place: 1, name: "Flat bench press", weight_kg: 102.5, reps: 8)],
                     streak_weeks: 4, author: me,
                     kudos: [Kudos(user_id: sam.user_id, giver: sam), Kudos(user_id: cleo.user_id, giver: cleo)]),
            FeedPost(id: "p3", user_id: cleo.user_id, session_id: "x3", workout_date: at(27), title: "Upper", volume_kg: 6_340,
                     duration_seconds: 3_480, set_count: 18,
                     medals: [PostMedal(place: 2, name: "Pull-up", weight_kg: 10, reps: 8)],
                     streak_weeks: 12, author: cleo, kudos: []),
        ]
    }
}
