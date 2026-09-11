---
name: Setline
description: A near-black training instrument for one lifter — lime for action, mint for rest, dense tabular numbers throughout.
colors:
  ground: "#060908"
  raised: "#0d1310"
  raised-2: "#151c17"
  line: "rgb(255 255 255 / 0.08)"
  line-strong: "rgb(255 255 255 / 0.16)"
  text-primary: "#f3f7f4"
  text-secondary: "#a9b5ad"
  text-muted: "#8b968e"
  signal-action: "#c8ff66"
  signal-action-press: "#b9f45b"
  signal-on-action: "#0a0d0b"
  signal-rest: "#72efd0"
  signal-attention: "#f4c65b"
  signal-danger: "#ff8a8a"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(46px, 13.5vw, 58px)"
    fontWeight: 680
    lineHeight: 0.94
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(26px, 7vw, 34px)"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "21px"
    fontWeight: 660
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 720
    lineHeight: 1.2
    letterSpacing: "0.1em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  2xl: "24px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.signal-action}"
    textColor: "{colors.signal-on-action}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "50px"
  button-primary-hover:
    backgroundColor: "#d6ff85"
    textColor: "{colors.signal-on-action}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
  chip:
    backgroundColor: "rgba(255,255,255,0.03)"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  input:
    backgroundColor: "rgba(255,255,255,0.035)"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 14px"
  card:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.2xl}"
    padding: "24px"
---

# Design System: Setline

## Overview

**Creative North Star: "The Performance Instrument Panel"**

Setline reads like a cockpit gauge, not a lifestyle app. The ground is near-black (`#060908`); every surface above it is a translucent lift rather than a new color; and the one warm, saturated thing on screen — lime — is reserved for the single action that matters right now. A conic-gradient completion ring, a glowing arc with a light-source dot, a session number rendered as a near-invisible watermark stroke: the vocabulary is telemetry, not decoration. Numbers are tabular so they don't dance between rows, because this is a screen read at arm's length, mid-set, in bad gym light — legibility under duress is the design brief, not an afterthought to it.

The system is disciplined about restraint on purpose. Its own source comments say so directly: *"A fifth accent would dilute all four,"* *"nothing quieter carries meaning,"* *"a zero-offset colour halo is not depth."* Four signal colors, three text steps, two raised surfaces, one action color. Nothing is added to that list without displacing something already on it.

**Key Characteristics:**
- Near-black ground with translucent-white surface lifts, never a second background hue.
- One action color (lime); mint, amber, coral are status-only and never sit on a primary button.
- Dense, tabular, arm's-length type — nothing meaningful drops below 12px.
- Depth from soft dark cast shadows and inset rim highlights, not colored halos.
- A single serif-italic accent word breaks the all-sans system exactly once, on the day's headline.

## Colors

Four signal colors carry all meaning; everything else is near-black ground, two steps of raised surface, and three text weights measured directly against the ground for contrast.

### Primary
- **Lime Signal** (`#c8ff66`): the one action color. Primary CTAs, active nav state, focus rings, selected chips, the accent line across the top of the app (`.performance-line`). Its pressed state, **Lime Signal, Pressed** (`#b9f45b`), is the only other lime in the system.
- **Ink on Lime** (`#0a0d0b`): the foreground that sits on lime fills, so an action surface never reads as a colored bar with black text — the ink is warmer and part of the same family.

### Secondary
- **Mint Rest** (`#72efd0`): recovery, sync, and "rest day" contexts — the today-hero's arc and CTA swap to mint on a rest day, and the account-sync diagram lights mint when connected. It is the system's second voice, never a second action color.

### Tertiary
- **Amber Attention** (`#f4c65b`): needs-attention states — offline sync, a warm-up disclosure, a protect-recovery insight. Always paired with words, never color alone.
- **Coral Danger** (`#ff8a8a`): loss and destructive states only — ending a session early, deleting an account. Kept structurally apart from everyday actions (its own bordered block in account settings, never inline with a primary button).

### Neutral
- **Near-Black Ground** (`#060908`): the base the whole app sits on.
- **Raised Surface** (`#0d1310`) / **Raised Surface, Second Step** (`#151c17`): the two lift levels above ground. Nothing raises a third time — a card that needs more presence gets a shadow or a border, not a third surface color.
- **Hairline** (`rgb(255 255 255 / 0.08)`) / **Hairline, Strong** (`rgb(255 255 255 / 0.16)`): the only two border weights in the system.
- **Primary Text** (`#f3f7f4`, 17.4:1), **Secondary Text** (`#a9b5ad`, 8.6:1), **Muted Text** (`#8b968e`, 5.8:1): three steps, each measured against the ground for AA.

### Named Rules
**The Four-Signal Rule.** Lime, mint, amber, coral — and no fifth. A new state gets folded into one of the four before a new hue is considered.

**The Quiet Floor Rule.** `#8b968e` (5.8:1) is as quiet as text gets. Nothing that carries meaning goes softer, even for secondary or disabled copy.

**The Light-Source Rule.** A glow is only ever a literal light source (the arc's signal dot, an active state's halo) — never a stand-in for elevation. Elevation is always offset-plus-blur.

## Typography

**Display Font:** Inter (with `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`)
**Body Font:** Inter, same stack.

**Character:** One typeface used at very different densities — a huge, tight-tracked display weight for the day's headline, and a small, heavily-tracked uppercase label weight for every meta line and eyebrow. The gap between those two extremes, with almost nothing built in the middle of the scale, is what gives the screen its instrument-panel feel rather than an editorial one.

### Hierarchy
- **Display** (680, `clamp(46px, 13.5vw, 58px)`, 0.94 line-height): today's session headline — the single biggest thing on the dashboard.
- **Headline** (600, `clamp(26px, 7vw, 34px)`, 1.12): the sign-in and setup screen's headline (`.gate-headline`) — the second-largest text in the product, reserved for the gate.
- **Title** (660, 21px): section headings inside panels (recovery, transformation, workout).
- **Body** (400, 15px): running copy and descriptions.
- **Label** (720, 12px, 0.1em tracking, uppercase): eyebrows, meta rows, day labels, badge text — the workhorse size for everything that isn't a headline or a number.

Numbers that get compared row-to-row (`.tabular`, `font-variant-numeric: tabular-nums`) never use proportional figures — a rep count or a bodyweight delta must not shift width as it changes.

### Named Rules
**The Serif Accent Rule.** Exactly one word per screen may break into `Georgia, "Times New Roman", serif` italic — the trained-day name inside the dashboard headline (`.today-title em`, e.g. *Legs.*). It is a single, deliberate crack in an otherwise all-sans system, not a typeface available anywhere else.

**The Arm's-Length Floor.** Nothing meaningful is set under 12px. This is a screen read mid-set, one-handed, at an angle — a 10-11px label is for decoration (icon counts, dividers), never for something the person needs to act on.

## Layout

Phone-first PWA with bottom tab navigation and safe-area insets (`env(safe-area-inset-*)`); the desktop breakpoints (639/768/860/1024px) widen the composition rather than reflowing it into a different app. Density is high and consistent: an 8-step spacing scale in multiples of 4 (`--sp-1` 4px through `--sp-12` 48px) governs gaps and padding, and grids (the 7-column week, the 3-column recovery status, the 2-column setup options) stay fixed-column on phone and only grow columns at wider breakpoints, never restack into single-column desktop layouts.

The gate (sign-in/setup) is the one surface with an authored two-column desktop layout: panel and content split left/right above 860px, versus a stacked, overlapping composition on phone where the panel rides over the lower half of a background week visualization.

## Elevation & Depth

Hybrid: surfaces are built from flat translucent-white fills layered on the near-black ground (`--s-fill-1` through `--s-fill-4`, 3%–10% white), and true elevation — the sense of a card floating above the ground — comes from soft, dark, heavily-offset cast shadows plus a 1px inset highlight along the top rim that reads as a light catching a glass edge. Colored glow is never used to fake elevation; it is reserved for genuine light sources (an active status dot, a primary CTA's halo) and named as such in the source itself.

### Shadow Vocabulary
- **Elevation, flat** (`--el-1`: `0 1px 2px rgb(0 0 0 / 0.45)`): the baseline lift for interactive rows and small controls.
- **Elevation, lifted** (`--el-2`: `0 10px 30px -14px rgb(0 0 0 / 0.75)`): the resting shadow under panels and hero cards.
- **Signal glow** (e.g. `0 10px 26px -12px rgb(200 255 102 / 0.7)` on the gate's submit button): a colored, heavily-blurred glow used only under the lime primary action — never under a secondary control or a neutral card.
- **Rim highlight** (`inset 0 1px rgb(255 255 255 / 0.04–0.09)`): a near-universal 1px inset used on cards and panels to fake a light source catching the top edge.

### Named Rules
**The Real-Depth Rule.** Every shadow token pairs an offset with a blur. A shadow with no offset is a glow, and glows are reserved for actual light sources — never used as elevation's stand-in.

## Shapes

Corner radius runs on two scales at once: a small functional ladder (`--r-sm` 8px through `--r-xl` 22px, plus `--r-pill` 999px for chips and pills) for controls, inputs, and rows; and a bigger, looser band (24px–34px) for major surfaces — panels and metric cards mostly sit at 24px, the gate panel at 26px, and the dashboard's hero card goes to 34px, the single roundest thing in the product. Borders throughout are the two hairline weights only (8%/16% white), never a heavier stroke. The one recurring silhouette beyond the rounded rectangle is the circle: the completion-orbit conic gauge, the arc-and-dot on the dashboard hero, and the ambient background blurs are all circular, set against an otherwise rectilinear grid of cards.

## Components

### Buttons
- **Shape:** 15-16px radius on primary CTAs (`--r-lg`/`--r-xl`), matching the surface they sit in; ghost and inline actions use no visible shape at all.
- **Primary:** solid Lime Signal fill, Ink-on-Lime text, 700 weight, deliberately overrides the shadcn default with `!important` wherever it appears (`gate-submit`, `today-cta`, `recovery-save-button`, `nutrition-add-button`, `photo-save-button`) — this is a consistent, intentional pattern, not drift.
- **Hover / Focus:** hover lightens the fill by roughly one step (`#d6ff85`) and lifts 1px; focus is always the lime ring at 2px width, 2px offset, never a color-only change.
- **Secondary / Ghost:** transparent background, secondary text color, hairline border only where it doubles as a hit target (e.g. `account-action-quiet`); destructive actions get their own coral-tinted variant, structurally separated from everyday buttons.

### Chips
- **Style:** translucent white fill (3-5%), hairline border, pill or 10-18px radius depending on context (status chips are pills; day/agenda chips are rounded rectangles).
- **State:** an `is-active`/`is-chosen`/`aria-pressed` modifier swaps the fill and border to a signal color (lime for selection, mint for rest/sync) at 8-16% opacity and tints the text to match — never a solid fill on a chip, which stays reserved for primary buttons.

### Cards / Containers
- **Corner Style:** 24-30px on panels and metric cards; see Shapes for the full band.
- **Background:** a subtle diagonal gradient between two near-black stops (`linear-gradient(150deg, rgba(19,26,22,.91), rgba(10,14,12,.94))`), not a flat fill — this is what gives cards their faint material presence against the ground.
- **Shadow Strategy:** Elevation-lifted plus rim highlight (see Elevation & Depth).
- **Border:** single hairline.
- **Internal Padding:** 20-24px (`--sp-5`/`--sp-6`) is the norm for a panel's outer padding.

### Inputs / Fields
- **Style:** translucent white fill (3.5%), hairline border, 12-14px radius, always 16px font size to prevent iOS zoom-on-focus.
- **Focus:** border shifts to lime at ~55% opacity plus a 3px lime glow ring — never just a border-color change alone.
- **Error / Disabled:** `aria-invalid` swaps the border to coral; disabled CTAs keep their lime hue but drop to ~22% opacity fill with matching low-opacity text, rather than graying out to neutral.

### Navigation
- **Style:** bottom tab bar (`.nav-tab`), icon over an 10px uppercase-adjacent label. Inactive tabs sit at muted-text gray; the active tab gets a lime-to-mint diagonal gradient wash, an inset lime ring, and its own drop shadow — the only nav-bar treatment in the system that combines both signal colors at once.

### The Today Hero (signature component)
The dashboard's flagship composition, and the most fully-tokenized block in the file. A near-invisible outlined watermark of the session number sits behind the copy (`color: rgb(200 255 102 / 0.02)`, text-stroke only); a thin ruled grid fades out toward the right edge so it never competes with text; a glowing arc with a single lit dot reads as an instrument needle; and the headline breaks into the one serif-italic accent word in the whole app. Rest days swap the entire palette from lime to mint in one pass (`.today-rest`). This is the reference implementation for how every other token in this file is meant to compose together.

### The Account Link (signature component)
Two nodes and a track between them — literally the shape the product is named after, doing work. Synced: the track fills solid and both nodes light lime. Writing: the fill pulses across the track on a 1.5s loop. Offline: the track turns into a dashed amber line and both nodes shift to amber, with the state also spelled out in words nearby — never color alone.

## Do's and Don'ts

### Do:
- **Do** treat lime as the only primary-action color; a new "yes, do this" moment always maps to lime, never a new hue.
- **Do** express every non-default state (offline, saving, error) in shape and wording as well as color — dots change position, tracks change from solid to dashed, and text always names the state.
- **Do** give small tap targets (inline text links, the exercise-complete checkbox) an invisible expanded hit area via a `::before` overlay rather than growing the visible element, to clear the 24px WCAG 2.5.8 floor without changing how anything looks.
- **Do** use `font-variant-numeric: tabular-nums` on any number that gets compared to another number in the same view.
- **Do** set form inputs at 16px font minimum so iOS Safari never zooms on focus.

### Don't:
- **Don't** add a fifth signal color. Lime, mint, amber, coral is the complete set; a new state gets absorbed into one of the four.
- **Don't** drop text below the 5.8:1 muted-text floor (`#8b968e`) for anything a person is meant to read — quieter than that stops carrying meaning.
- **Don't** use a zero-offset colored shadow to imply elevation; that's a glow, and glows are reserved for literal light sources.
- **Don't** raise a surface a third time. Ground → raised → raised-2 is the whole ladder; a card that needs more presence gets a border or shadow, not a third background color.
