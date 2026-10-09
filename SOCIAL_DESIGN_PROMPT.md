# Prompt for Claude Design: SETLINE Social

How to use:
1. In Claude Design, open the project that holds **SETLINE Redesign** (or start a new one next to it).
2. Give it the wireframes:
   - **Preferred:** share the wireframe canvas https://claude.ai/artifact/D1rNRdmdzW6wB5HqVhNs2U from its Share menu and paste the link.
   - **If Claude Design can't open it:** export the 11 artboards as PNGs and attach them.
3. Also attach the three screenshots of the **current app** in `design-references/social/`:
   - `current-finish.png`: today's finish screen.
   - `current-friends-feed.png`: today's Friends tab.
   - `current-account.png`: today's Account sheet.
4. Paste everything between the two lines below.

---

You are designing the social layer of **SETLINE**, a native iOS strength-training app (iPhone, dark only). It follows lifts, medals per lift, weekly streaks and progress. I'm attaching **wireframes made by Claude Code**. They fix the *content, flows and states* and are already approved. Your job is the **UI and UX quality**: hierarchy, rhythm, typography, motion and delight, so the result feels like an Apple Design Award app (think Apple Fitness, Strava, Gentler Streak, Hevy) while staying unmistakably SETLINE.

Treat the wireframes as the **brief, not the layout**:
- **Keep:** every screen, every state, every action and all privacy copy, unless you have a UX reason to change it. If so, write the reason in a note next to the artboard.
- **Free to improve:** layout, proportions, grouping, emphasis, icon choice, illustration and micro-interactions.

## Stay in line with the app as it is today (most important)

This is **an extension of an existing app, not a new app.** I'm attaching screenshots of the current finish screen, Friends tab and Account sheet. Match them:
- Same header patterns, card styles, row styles, type sizes, button shapes and spacing.
- **Reuse the existing pieces as they are:**
  - The Friends header: avatar, 34 pt "Friends", "@username · N friends", round add-person button.
  - The amber friend-request banner.
  - The post card: author row with streak badge on the avatar, 34 pt bold title, three stats across, medal rows, the real Apple Maps place card, and the "Give kudos" pill with a "Kudos from …" line.
  - The finish screen's DONE eyebrow, volume, medal block, Tally card and record line.
  - The Account sheet's plain rows under section titles ("Plan", "Data").
- New elements (comment button, visibility badge, photos, music row, composer fields) must look like they always belonged there: built from the same tokens and the same component shapes.
- If something existing looks weak, you may propose an improvement, but as a **separate, clearly labelled "proposal" artboard** next to the faithful version, never instead of it.

## Where each screen lives in the app

| Wireframe | Place in the app | New or changed |
|---|---|---|
| 1 Finish screen | Session › Finish | **Changed**: the "Share with friends" toggle and the place row are replaced by a "Create post" button above "Save session" |
| 2 Post composer | Opened from the Finish screen (and later from a saved workout in Progress › Log) | **New** full-screen sheet |
| 3 Who can see this | Sheet from the composer, edit post, and Account › Privacy | **New** |
| 4 Add music | Sheet from the composer | **New** |
| 5–6 Feed | Friends tab | **Changed**: cards gain photos, notes, music, comments and a visibility badge; zero-friends card |
| 7 Post detail | Friends tab › tap a post | **New** |
| 8 Edit post | Post › ··· menu | **New** |
| 9 Profile | Friends tab › tap a person or your avatar | **New** |
| 10 People sheet | Friends tab › add-person button | **Changed**: gains "Show my QR code"; search, requests and friends exist already |
| 11 Privacy | Account sheet › new "Privacy" section between Plan and Data | **New section**; "Export everything" in Data now includes posts and photos |

## Product decisions (fixed, don't redesign these)

- **Saving a workout never posts it.** A post is an explicit "Create post" step.
- **Visibility:** *Only you* or *Friends* (default *Friends*). *Public* exists in the model but is "Coming later": show it disabled or leave it out.
- **Zero friends:**
  - With no friends yet, *Friends* posts are visible only to the user, and the UI must say so honestly ("Only you can see this — for now").
  - Friends added later see earlier *Friends* posts, never *Only you* posts.
- **Location:** nothing is shared by default. A place is optional per post. A gym gets a small map; a home workout gets a label only, never a map. Photo location data is stripped (say so where photos are added).
- **Music (first version):** manual only, up to 5 songs (title, artist) or one playlist link from any service. Shown as text plus an outbound link. **No album artwork, no Spotify/Apple Music logos or login.**
- **Mutual friends** (request, then accept), not followers.
- **Comments:** delete your own, report others'. **Posts:** edit and delete; deleting removes photos, comments and kudos, but the workout stays in the log.
- **Kudos** is the single reaction (a thumbs-up), no other reaction types.
- **No load leaderboards or comparison between people.** Highlights compare a lift with the user's *own* history (gold = best ever, silver = 2nd best, bronze = 3rd best day).

## Screens and required states

| # | Screen | States to draw |
|---|---|---|
| 1 | **Finish screen**: save or create post | default · no social profile yet (only "Save session") |
| 2 | **Post composer** | empty · filled (title, notes, 1 photo, music, hidden stats) · uploading photo · upload failed · offline (post queued) |
| 3 | **Who can see this** (sheet) | Friends selected with zero friends · Friends selected with friends · Only you selected |
| 4 | **Add music** (sheet) | empty · 2 songs + playlist link recognised · limit reached (5) |
| 5 | **Friends feed, zero friends** | invite card + own post |
| 6 | **Friends feed** | card variants: photos (1 / 2 / 3–4 layouts), music, gym map, home label, hidden numbers ("quiet post"), own private post with a lock badge · loading · offline · error |
| 7 | **Post detail + comments** | with photos/music/map · no comments yet · own comment menu (delete) · other's comment menu (report) · deleted-comment placeholder |
| 8 | **Edit post** | edit form · delete confirmation |
| 9 | **Profile** | own · a friend's (with "Friends" state) · someone not yet a friend ("Add friend" / "Requested") |
| 10 | **People sheet** (invite, find, requests, friends) | default · QR code shown · search result · a request to accept · the landing screen when someone opens an invite link (signed in / signed out / already friends) |
| 11 | **Account › Privacy section** | default · delete-all-posts confirmation · export in progress |

## SETLINE visual language (use these exact values)

**Colour**
- Ground `#060908`. Surface 1 `#0D1210` (cards, sheets, tab bar). Surface 2 `#141A18` (pressed, rows inside sheets).
- Hairline `#1C2422` (card edges). Strong hairline `#232B29` (button edges). Muted graphics `#5E6B67`.
- Ink `#F2F5F3`, secondary `#9AA6A1`, meta `#B3BDB8`, tertiary = ink at 55 %.
- **Lime `#C8FF66` = action and achievement only:** the one primary action per screen, the selected state, a gain or PR. Pressed `#DCFFA0`; tint = lime at 12 %; text on lime `#060908`.
- **Mint `#72EFD0` = rest, body and privacy status** (e.g. the "only you" notice, home workouts). Tint = mint at 12 %.
- Amber `#FFB84D` = attention. Red `#FF5C5C` = loss/destructive.
- Medals: gold `#FFD166` on `#B07D12`, silver `#DDE3E7` on `#7D8A92`, bronze `#E2A576` on `#7A4526`.
- Hero cards may use the one sanctioned gradient: 155°, `#1D2723` → `#111815` (55 %) → `#0D1210`.
- **No other gradients, no glows.**

**Type:** Archivo (Google Fonts); big numbers may use Archivo Expanded (`wdth 125`). Always use tabular numerals.
- Display 44 / 40 / 34 (screen titles 34, line height 1.1).
- Title 21 (1.2). Lead 17 (row titles, buttons). Body 15 (1.5). Meta 13. Micro 12.
- Tab labels 11 only; nothing else below 12.
- Weights 400 / 500 / 600; 700 only on lime-button labels and oversized workout names.

**Space:** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48. Screen gutter 20. 24 between sections, 8 from a section head to its card.

**Radius** (concentric: inner = outer − padding):
- Rows 12, tiles 16, cards/sheets/tab bar 22, pills 999.
- Sheets are 22 at the top, with a 44 pt round close button on Surface 2.

**Elevation:** hairlines carry structure. Shadows only for things that float (sheets, the rest-timer pill).

**Existing components to reuse visually:**
- **Tab bar:** a floating capsule, 21 pt inset, 70 pt tall. Tabs: Training · Nutrition · Progress · Friends · Photos.
- **Selected tab:** Surface-2 pill.
- **Medal:** a coin with two short ribbon tails and the place number.
- **Badge:** a rounded hexagon in bronze/silver/gold/lime tiers.
- **Primary button:** lime, 56 pt tall, radius 14.
- **Secondary button:** outlined with the strong hairline.
- **Workout-day icons:** Apple-Fitness-style figures (barbell lift = Push, rower = Pull, lunge = Legs, step-up = Lower, dumbbell = Upper).

**Motion:**
- Fast 120 ms, base 180 ms, slow 250 ms; springs for selection.
- Everything collapses under Reduce Motion.
- Suggest at most 2–3 signature moments (e.g. a kudos burst, a medal shine on a PR card). Don't add motion everywhere.

## UX principles to apply

1. **One primary action per screen**, in lime. Everything else is secondary or quiet.
2. **Privacy is visible, not hidden:** every post shows who can see it. The zero-friends state explains itself without guilt.
3. **Recognition over reading:** familiar iOS patterns (sheets, swipe actions, context menus, share sheet) and icons people already know.
4. **Celebrate the lifter's own progress**, never rank people. Medals and streaks are the emotional peak of a post card.
5. **Low effort to post:** a good post must be possible with one tap (the auto summary). Title, notes, photos and music are optional extras, so make the optional parts clearly optional.
6. **Calm feed:** generous spacing and a strong card rhythm. Photos lead when present; numbers stay scannable, three across at most.
7. **Accessibility:**
   - 44 pt touch targets.
   - Contrast 4.5:1 for text (3:1 for large text and graphics).
   - Works at Accessibility Large text: show one key screen (composer or feed card) at AX Large.
   - Colour is never the only signal (a lock icon plus a label for private).
8. **Real content:** names and numbers like the wireframes. Placeholders such as [PHOTO] are fine where imagery isn't available. No lorem ipsum.

## Deliverables

- iPhone frames at **390 × 844** (taller where a screen scrolls), one artboard per screen state from the table above, grouped in rows: *Create a post* · *The feed* · *Manage*.
- A small **components** row: post card (all variants), visibility pill/badge, music row, place chip/map card, comment row, invite card, empty and error states.
- Short annotations only where you changed the wireframe's structure, saying why.
- **Not in scope** (don't draw): Public posts and profiles, notifications, "trained with" tags, crews/challenges, Spotify/Apple Music connection, the Training / Nutrition / Progress / Photos tabs.

---
