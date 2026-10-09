# Setline social layer: proposal

Status: proposal only, nothing implemented. Written 2026-10-09.
Scope: turn finished workouts into shareable posts and grow a community, borrowing from Strava only what fits strength training.

---

## 0. What already exists (read first)

Some of this is already built, so the proposal extends it instead of starting over.

| Already in the app (iOS, branch `setline-ios-phase-3`) | Where |
|---|---|
| Friends tab: profiles (username, display name), friend requests (mutual, accept/decline), block, report | `ios/Setline/Features/Friends/FriendsView.swift`, `ios/Setline/Data/SocialStore.swift` |
| Posts: one per saved workout (title = day name, volume, duration, set count, medals, streak) | `db/supabase/social.sql` table `posts` |
| Kudos (one per person per post, not on your own) | table `kudos` |
| Row-level security: owner + accepted friends can read a post; blocks end friendships | `db/supabase/social.sql` |
| Medals (gold/silver/bronze per lift vs own history), share-card image | `SetlineCore/Progress/Medals.swift`, `WorkoutShareCard` |
| **Uncommitted, built this week without a design:** optional workout place (gym / home / outdoors) with a map in the feed | `ios/Setline/Features/Friends/WorkoutPlaceViews.swift`, `posts.place_*` columns |

Two facts about the current setup matter for this proposal:

- **Posts are published automatically** when a workout is saved, if the finish screen's "Share with friends" toggle is on. It is **on by default**.
- **The social tables live in Supabase Postgres, not on Cloudflare.** The iOS app also syncs its training state through Supabase (`user_state`). Cloudflare (Workers + D1 + R2) serves the web app. See section 5 and the open questions.

The SQL in `db/supabase/social.sql` has not been run on the production project yet, so no real user has posted.

---

## 1. Strava mechanics: keep, adapt, skip

Strava calls itself a social network for athletes. Its community runs on four loops: **post → recognition → comparison → belonging**. The best evidence I found that these loops change behaviour is a Radboud University study of Strava running clubs: athletes who received more kudos ran more, and less active athletes followed the habits of more active friends ([Canadian Running summary](https://runningmagazine.ca/?p=91520)). Most other material is design commentary, so I treat it as inspiration, not proof.

### Keep (they fit strength training directly)

| Strava mechanic | Setline version | Why it fits |
|---|---|---|
| **Activity post** (title, description, photos, stats) | **Workout post**: auto summary + highlights, optional title, notes, photos | It's the core unit. Without it there's nothing to react to. |
| **Kudos** | Already built. Keep a single, low-effort reaction. | It's the cheapest recognition and the one with evidence behind it. Strava deliberately has no like/dislike spectrum. |
| **Comments** | Comments on posts | Recognition with words; it's where real conversation happens. |
| **Feed** of people you follow | Friends feed (yours + friends' posts) | It's the habit loop: open app → see friends trained → train. |
| **Achievements on the activity** (PRs, trophies) | **Medals and PRs** on the post (already computed) | This is the fair comparison: each lift against its *own* history. |
| **Activity privacy**: Only you / Followers / Everyone, with a default and per-activity override ([Tom's Guide](https://tomsguide.com/wellness/fitness/how-to-adjust-your-strava-privacy-settings)) | **Private / Friends / Public**, default in settings, changeable after posting | It matches your requirement 3 one-to-one. |
| **Hide specific stats** (Strava "Quick Edit" hides pace, heart rate etc.) | Per post: hide duration / volume / weights | Some people want to share "I trained" without numbers. |
| **Athlete profile** | Profile: avatar, name, streak, post history, badges | It's where Public posts live and how friends find each other. |

### Adapt (good idea, different shape for lifting)

| Strava mechanic | Problem for strength | Setline version |
|---|---|---|
| **Segments & leaderboards** | Comparing loads between strangers is noisy: body weight, technique, depth, paused vs touch-and-go, equipment and honesty all differ. It also rewards ego-lifting. | **No load leaderboards.** Compare progress instead: "+7 % stronger on Push", medals vs your own past. |
| **Clubs** | Running clubs gather around routes and events. Lifters gather around a gym or a crew of 3–10. | **Crews** (later phase): small private groups with a shared feed and a cooperative goal. |
| **Challenges** | Distance challenges translate badly; max-load challenges are unsafe. | **Cooperative crew goals**: "Crew lifts 100 t in October", "Everyone hits their weekly goal 4 weeks running". Consistency and volume, never 1RM. |
| **Group activity** ("ran with …") | Not detectable from GPS indoors. | **"Trained with"** tag: mention a friend who was there; it shows on both posts after they accept. |
| **Maps** | No route in a gym. | Optional **place tag** (gym name + small map; home = label only, never coordinates). Built, needs a design pass. |
| **Year in Sport** | Running stats don't apply. | **Monthly / yearly recap**: tonnes moved, PRs, longest streak, favourite lift; shareable card. |

### Skip (and why)

- **Routes, GPS tracks, heatmaps, Beacon live tracking, Flybys**: no movement data, and a privacy risk with nothing in return.
- **Public load leaderboards / "KOM" equivalents**: noisy, easy to cheat, and they reward unsafe lifting.
- **Asymmetric following at launch**: with zero users, a follow graph adds complexity before there's anyone to follow. Keep mutual friends now and add follow later for public profiles.
- **Paid-only social features**: the community is too small to split.

---

## 2. Extra ideas (optional, beyond your list)

1. **Invite link / QR code** *(recommended for MVP)*. With zero users, growth only comes from you inviting gym friends. A link that opens the app on "Add Yascha as a friend" is the single most important growth feature.
2. **"Only you can see this until you add friends"** banner on the feed: makes requirement 4 visible instead of confusing.
3. **Progress-based highlights** rather than raw loads: "+9 kg on Flat bench since September", "first 4-week streak". Strangers can relate to those; "102.5 kg" means little without context.
4. **Quiet post**: share "Trained Push · 2 PRs" with all numbers hidden. Lowers the barrier for beginners who feel judged.
5. **"Trained with" partner tags** (see above): gyms are social in person; this brings that in.
6. **Copy a friend's workout as a template** (Hevy-style routine sharing): the most practical kind of help between lifters. Later phase.
7. **Nudges** (opt-in): "Sam hasn't trained this week, send a high-five". Only between friends, at most one a week.
8. **Share to Instagram Stories**: the share card already exists; exporting it to Stories is a cheap growth channel.
9. **PR clips** (later): a 10-second video of a PR set. It's high engagement but costs storage and needs moderation, so it waits until there's a moderation process.

---

## 3. Music: what's possible, and what I recommend

I checked each option against the providers' current documentation (sources in section 9).

### Option A: Spotify Web API ("Recently played")

- **Technically ideal.** `GET /v1/me/player/recently-played` returns up to 50 tracks, each with a `played_at` timestamp, so we could select exactly the songs between workout start and end. Scope: `user-read-recently-played`.
- **Not usable for a public app right now:**
  - **Development mode:** since February 2026 an app in development mode works for **at most 5 allow-listed users**, and only while the app owner has **Spotify Premium**.
  - **Extended quota** (unlimited users): since 15 May 2025 it's only granted to **registered organizations with at least 250,000 monthly active users**, a launched service, availability in key markets and "commercial viability". Review takes up to six weeks.
  - **Spotify's terms add more:** you must attribute and link back to Spotify. You must not integrate Spotify content with streams or content from another service. You must delete a user's Spotify data when they disconnect.
- **The Spotify iOS SDK (App Remote)** doesn't avoid this. It needs the same Spotify login, and one developer reports Spotify said it can't be used for commercial apps (unconfirmed).
- **Verdict:** fine for you and four testers, impossible for real users until Setline is a 250k-MAU company. Not recommended.

### Option B: Apple Music

There are two routes, and the difference matters:

1. **Apple Music API, `/v1/me/recent/played/tracks`**: returns recently played songs, but **no timestamp per song**, and history is capped (developers report about 30 items). We can't tell which songs were played *during* the workout, only "recently".
2. **`MPMusicPlayerController.systemMusicPlayer.nowPlayingItem`**: reads the song currently playing in the Music app (title, artist, album, store ID). An Apple engineer confirmed on the Developer Forums (iPadOS 26.7) that it works and that a store ID can be turned into a `music.apple.com/song/<id>` link.
   - **Fit for Setline:** the app is open on screen during a session, so it can note the current song **each time a set is saved**. That gives an honest "songs during this workout" list, with no timestamps needed.
   - **Limits:**
     - It only sees the **Apple Music / Music app**, not Spotify or YouTube Music.
     - It needs the media-library permission (`NSAppleMusicUsageDescription`).
     - **Apple didn't confirm that showing these songs to other users is allowed.** It pointed to the Apple Music Identity Guidelines and the developer agreement.
     - MusicKit terms limit album art to playback and playlist use. To stay safe, show **title + artist + a link to Apple Music, without artwork**, until Apple confirms otherwise.

### Option C: Manual

- The user adds songs by hand, or pastes a **playlist link** from any service ("My leg-day playlist").
- No API, no review risk, works for every service. More effort for the user.

### Recommendation

| Phase | Music approach |
|---|---|
| **MVP** | **Manual**: add up to 5 songs (title + artist) or one playlist link from any service. Shown as text with a service icon and an outbound link. No artwork, no API. |
| **Phase 2** | **Apple Music now-playing capture**, opt-in: Setline notes the playing song at each saved set. Before posting, the user reviews the list and removes anything. Text + link, no artwork. **Before building it:** read the Apple Music Identity Guidelines and the developer agreement, and ask Apple Developer Support in writing whether showing a user's own now-playing songs to their friends is allowed. |
| **Later / only at scale** | Spotify, only if Setline qualifies for extended quota. Until then, Spotify users paste a playlist link. |

Trade-off summary:
- **Manual** is safe and universal but takes effort.
- **Apple Music capture** is effortless but covers only Apple Music users, and permission to show the songs to friends is unconfirmed.
- **Spotify** is technically the best but blocked by Spotify's access policy.

---

## 4. Privacy and GDPR

These are design rules, not just settings.

1. **Privacy by default** (GDPR art. 25): the default visibility must not make posts visible to an unlimited number of people. **Default = Friends; Public is always an explicit choice.** With zero friends, "Friends" means only you (requirement 4).
2. **No location by default.** A place is added per post, explicitly. Home never stores coordinates. Outdoors is rounded to about 1 km. A gym is a public place and keeps its pin.
3. **Photos:** strip all EXIF/GPS metadata on the device before upload. Body photos are sensitive: show a one-time reminder when a photo is added to a Public post. Progress photos are never posted automatically.
4. **Deletion:**
   - Deleting a post deletes its photos, comments, kudos and music rows straight away, and the photo files in storage.
   - Deleting the account deletes everything (cascade from `auth.users` + storage cleanup).
   - "Delete all my posts" lives in privacy settings.
5. **Export:** the existing data export (`StateExport`) gains posts, comments and photo files (art. 20).
6. **Visibility changes apply immediately.** Friendship is checked when the post is *read*, not copied when it's written. So a friend added later sees your earlier Friends posts, and an unfriended person loses access at once.
7. **Music data:** what's stored is title, artist and link, which is the user's own choice of what to share. A Spotify connection would require deleting all Spotify data on disconnect.
8. **Minors:** the digital-consent age in Belgium is 13. Recommendation: Public posts and public profiles only for 16+ (one age question at onboarding), or no public posts for anyone in the MVP.
9. **App Store guideline 1.2 (user-generated content):**
   - Apple requires a way to filter objectionable material, report content, block users, and published contact information. Report and block exist; comments and photos need the same report/delete flow and a moderation contact.
   - Public posts with photos need at least manual review of reported content within 24 hours.
10. **Processors:** Supabase project in the EU (eu-west-1); sign a DPA. Update the privacy policy for social data, photos and music.

---

## 5. Data model and backend

### Recommendation: keep social on Supabase, keep Cloudflare for the web app

You asked for "our Cloudflare stack", but the social layer that exists today is on **Supabase Postgres with row-level security**:
- iOS signs in with Supabase and already syncs training data through Supabase (`user_state`).
- iOS has no session for the Cloudflare routes.

**My recommendation:** put all social data and post photos in Supabase (Postgres + Storage, EU region). Cloudflare D1/R2 keeps serving the web app.

**Reasons:**
- **Security lives in the database.** RLS decides who may read a post or photo, so a modified client can't read more. On D1 that rule would have to be re-implemented in every Worker route.
- **Already built and tested:** profiles, friendships, kudos, blocks and reports, with RLS tested 30/30.
- **One identity:** Supabase auth is already the identity for both apps.
- **Storage policies can reuse the same `can_see_post()` rule as the posts table.** With R2, a Worker would need to verify Supabase tokens and re-check visibility on every photo request.

**Alternative (only if you want Cloudflare):** a Worker API on D1 + R2 that verifies Supabase JWTs. It costs more, duplicates the security rules in TypeScript, and iOS would need a new token flow to reach Cloudflare. I can write that variant out if you prefer it.

### Tables (Supabase Postgres)

```
profiles            (exists)  + avatar_path, bio (≤160), default_visibility ('private'|'friends'|'public', default 'friends'),
                               birth_year_bucket (for the 16+ rule), music_capture_enabled (bool, default false)
friendships         (exists)  unchanged: mutual, requester/addressee, pending/accepted
blocks, reports     (exist)   reports gains comment_id and media_id
posts               (exists)  + visibility text not null default 'friends' check in ('private','friends','public')
                               + custom_title (nullable; falls back to the day name), notes (≤2000)
                               + hidden_stats text[] (e.g. {'duration','volume','weights'})
                               + is_published bool (draft vs posted), published_at, edited_at
                               + place_* (exists, uncommitted)
post_media          id, post_id → posts on delete cascade, owner_id, storage_path, width, height,
                    position (0–3), created_at       -- max 4 photos per post (MVP)
post_tracks         post_id → posts on delete cascade, position, title, artist,
                    source ('manual'|'apple_music'|'spotify'|'link'), external_url, external_id
                    -- no artwork stored
comments            id, post_id → posts on delete cascade, user_id, body (1–500), created_at, edited_at
kudos               (exists)
post_partners       post_id, user_id, status ('pending'|'accepted')   -- "Trained with", phase 2
crews, crew_members, crew_goals                                     -- phase 3
```

### The one visibility rule

```
can_see_post(post, viewer) =
     viewer = post.user_id
  or (post.is_published and post.visibility = 'friends' and are_friends(viewer, post.user_id))
  or (post.is_published and post.visibility = 'public'  and not is_blocked(viewer, post.user_id))
```

- Posts, comments, kudos, media and tracks all use this rule in their RLS policies, and so does the `post-media` storage bucket.
- Friendship is evaluated **at read time**, which gives requirement 4 for free.
- Changing visibility is a single `update posts set visibility = …` and takes effect on the next read.
- **Feed query:** your own posts plus posts you can see from accepted friends, newest first, 20 per page. Public posts from strangers only appear on their profile or a shared link, never in your feed in the MVP.
- **Photos:** uploaded to the private bucket `post-media/<user_id>/<post_id>/<uuid>.jpg` after on-device EXIF stripping and resizing (longest side 2048 px, JPEG ~80). Read through short-lived signed URLs.
- **Deletion:** the client deletes the storage objects, then the row. A nightly cleanup removes orphaned objects (a Supabase scheduled function, or a Cloudflare cron Worker with the service key).

---

## 6. Screens and flows to design (for Claude Design)

Nothing below gets built until it's in the design handoff. Each item names the states the design needs to cover.

1. **Finish screen, sharing entry.** Today: "Share with friends" toggle + auto-post. Proposed: "Save" plus **"Create post"**. States: no profile yet / profile but zero friends / normal.
2. **Post composer.**
   - Auto summary + highlights (medals, PRs, streak), title field, notes field.
   - Photos (0–4, add/reorder/remove), music section, place (optional), "hide stats" options, visibility picker.
   - **Post** / **Save without posting**.
   - States: empty, with photos, uploading, upload failed, offline (queued).
3. **Visibility picker.** Private / Friends / Public, each with one line explaining who sees it. A Public warning when photos are attached. Zero-friends explanation.
4. **Feed card variants.** Text-only, with photos (1, 2, 3–4 layouts), with music, with place, hidden stats, Private badge (own view), Public badge.
5. **Feed states.** Zero friends ("Only you can see this until you add friends" + invite), empty, loading, offline, error.
6. **Post detail.** Photo viewer (swipe, full screen), highlights, music list with links, place, kudos list, comment thread.
7. **Comments.** List, composer, own-comment delete, report comment, deleted-comment placeholder.
8. **Edit post.** Change visibility, title, notes, photos, music, place; **delete post** with confirmation.
9. **Profile** (own + friend + public via link): avatar, name, username, streak, badges, posts. "Add friend" / "Requested" / "Friends" states.
10. **Invite flow.** Share link/QR, plus the landing screen when someone opens an invite (signed in / not signed in / already friends).
11. **Privacy settings.** Default visibility, music capture on/off, blocked people, **download my data**, **delete all posts**, how location works (read-only explanation).
12. **Music.**
    - MVP: "Add songs / playlist link" sheet.
    - Phase 2: Apple Music permission explainer, plus "songs from this workout" review list (remove individual songs).
13. **Report / block.** Exists for posts; extend to comments and photos. Confirmation and "thanks" states.
14. **Photo add.** Picker, optional crop to 4:5, "location data removed" reassurance.
15. **Notifications** (phase 2). Kudos / comment / friend request / trained-with request; in-app list + push permission ask.
16. **Place tag** (already built, needs a design). Finish-screen row, picker sheet, feed map card.

---

### Where it lives in the app

| Screen | Place | New or changed |
|---|---|---|
| Finish screen | Session › Finish | Changed: "Create post" replaces the share toggle and place row |
| Post composer, visibility, music | Sheets opened from the finish screen (later also from Progress › Log) | New |
| Feed | Friends tab | Changed |
| Post detail, edit post | Friends › post, post › ··· menu | New |
| Profile | Friends › a person or your avatar | New |
| Invite, requests, find | Friends › existing People sheet (gains a QR code) | Changed |
| Privacy | Account sheet › new "Privacy" section | New section |

## 7. Phasing

### MVP (Phase 1): posts that are worth opening

- Explicit post composer (replaces silent auto-posting): title, notes, ≤4 photos, auto highlights.
- Visibility Private / Friends (Public in Phase 2); default in settings (Friends); change after posting.
- Friends feed with the zero-friends banner; post detail; edit; delete (with media).
- Kudos (exists) + comments (friends only; on Public posts only friends can comment at first).
- Invite link / QR.
- Manual music (songs or playlist link, text + link).
- Privacy settings, export and deletion, EXIF stripping, report/block for comments and photos.
- Place tag: either ship the built version after it's designed, or hold it back.

### Phase 2: daily pull

- Push notifications (kudos, comments, requests). Needs APNs.
- Apple Music now-playing capture (after Apple confirms the display question).
- "Trained with" partner tags.
- Public posts (16+, moderation) and public profiles reachable by link; share card to Instagram Stories.
- Monthly recap card.

### Phase 3: community

- Crews (small groups) with cooperative goals.
- Follow model + discovery of public posts.
- Copy a friend's workout as a template.
- PR video clips (only with a moderation process in place).
- Spotify integration, only if Setline qualifies for extended quota.

---

## 8. Decisions (answered 2026-10-09)

| # | Question | Decision |
|---|---|---|
| 1 | Backend | **Supabase** for social data and post photos (Postgres + Storage, RLS). Cloudflare stays the web app's backend. |
| 2 | Auto-posting | **Removed.** A workout becomes a post only through an explicit "Create post" step. Saving never posts on its own. |
| 3 | Default visibility | **Friends.** |
| 4 | Public posts | **Not in the MVP.** Phase 2, with a 16+ rule and a moderation process. MVP visibility is Private / Friends. |
| 5 | UI built without a design (Progress redesign, place picker + map) | **Keep in the app as input** for the Claude Design pass; adjust to the design afterwards. |
| 6 | Social graph | **Mutual friends** now; followers later with public profiles. |

Effect on the phasing: "Public" moves from the MVP to Phase 2, and the visibility picker in the MVP shows two options (Private, Friends).

## 9. Sources

- Spotify, Quota modes (5-user development mode, extended-quota criteria): https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- Spotify, February 2026 Web API migration guide: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- Spotify, Get Recently Played Tracks (scope, limit 50, `played_at`): https://developer.spotify.com/documentation/web-api/reference/get-recently-played
- Spotify, Updating the criteria for Web API extended access (April 2025): https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access
- Spotify, Web API quota updates for Development Mode (July 2026): https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates
- Spotify Developer Policy: https://developer.spotify.com/policy
- TechCrunch, Spotify changes developer mode API (Feb 2026): https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/
- Spotify Community, iOS SDK commercial-use report: https://community.spotify.com/t5/Spotify-for-Developers/Development-Mode-Help/td-p/7422564
- Apple, Get Recently Played Tracks (no per-song timestamp): https://developer.apple.com/tutorials/data/documentation/applemusicapi/get-v1-me-recent-played-tracks.md
- Apple Developer Forums, MusicKit recent items ~30 limit: https://developer.apple.com/forums/thread/735988
- Apple Developer Forums, `lastPlayedDate` always nil: https://developer.apple.com/forums/thread/751255
- Apple Developer Forums, displaying the currently playing Apple Music track (DTS answer): https://developer.apple.com/forums/thread/848284
- Apple WWDC26 session 254, Integrate MusicKit into your app: https://developer.apple.com/videos/play/wwdc2026/254/
- Tom's Guide, Strava privacy settings: https://tomsguide.com/wellness/fitness/how-to-adjust-your-strava-privacy-settings
- Tom's Guide, Strava Quick Edit: https://www.tomsguide.com/wellness/fitness/strava-just-released-a-new-feature-and-its-available-to-all-users-5-things-you-can-now-change-with-quick-edit
- Kaspersky, Strava privacy and map visibility: https://www.kaspersky.com/blog/running-apps-privacy-settings-part2-strava/52409
- Canadian Running, kudos study (Radboud University): https://runningmagazine.ca/?p=91520
- Harvard D3, Strava: doubling down on community: https://d3.harvard.edu/platform-digit/submission/strava-doubling-down-on-community/index.html
- The Drum, why Strava has kudos instead of likes: https://www.thedrum.com/news/2018/07/09/strava-thumbs-down-facebook-likes-explains-why-sweating-kudos-better
