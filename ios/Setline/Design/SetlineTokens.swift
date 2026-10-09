// SetlineTokens.swift
// SETLINE design tokens — transcribed from "SETLINE Redesign.dc.html",
// section D (the redesign of 2026-09). It supersedes the token sheet in
// SETLINE Main.dc.html: same ground and the same two signals, solid hairlines
// instead of translucent white, Archivo instead of the system face, and
// rounded-rectangle actions instead of pills.
//
// Two deliberate edits to the transcription, both in SLPrimaryButtonStyle:
// the label uses the Dynamic Type-scaled font helper, and the button takes a
// minimum height rather than a fixed one, so it grows with the reader's text
// size instead of clipping. The 44 hit-target minimum holds at every size.
//
// Dark appearance only. Set .preferredColorScheme(.dark) at the app root
// and use these literals rather than semantic system colours.

import SwiftUI

// MARK: - Colour

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >>  8) & 0xFF) / 255,
            blue:  Double( hex        & 0xFF) / 255,
            opacity: 1
        )
    }
}

enum SL {

    // MARK: Ground & surfaces
    enum Surface {
        static let ground   = Color(hex: 0x060908)   // --sl-bg
        static let raised   = Color(hex: 0x0D1210)   // --sl-surface-1 · cards, tab bar, sheets
        static let raised2  = Color(hex: 0x141A18)   // --sl-surface-2 · pressed, sheet rows

        static let hairline       = Color(hex: 0x1C2422)       // --sl-line · card edge
        static let hairlineStrong = Color(hex: 0x232B29)       // --sl-line-strong · button edge
        static let selection      = Color.white.opacity(0.28)  // selected rows in the older sheets

        /// The grey the design draws empty rings, week dots and bar stubs in.
        /// 3.4:1 on a card: these marks carry meaning (a day still to come,
        /// one missed), so they meet the 3:1 floor for graphics.
        static let mute = Color(hex: 0x5E6B67)

        /// Only translucent surface in the app: the floating rest timer.
        static let floatFill = Color(hex: 0x0D1210).opacity(0.82)
        static let floatBlur: CGFloat = 18

        /// The day card and the two hero cards: 155°, #1d2723 → #111815 at
        /// 55% → #0d1210. See `slHeroCard()`.
        static let heroStops: [Gradient.Stop] = [
            .init(color: Color(hex: 0x1D2723), location: 0),
            .init(color: Color(hex: 0x111815), location: 0.55),
            .init(color: Color(hex: 0x0D1210), location: 1),
        ]
    }

    // MARK: Ink
    enum Ink {
        static let primary   = Color(hex: 0xF2F5F3)                // --sl-ink
        static let secondary = Color(hex: 0x9AA6A1)                // --sl-ink-2 · 7,6:1 on ground
        static let tertiary  = Color(hex: 0xF2F5F3).opacity(0.55)  // --sl-ink-3
        /// The slightly lighter grey the design sets a card's meta line in.
        static let meta      = Color(hex: 0xB3BDB8)
    }

    // MARK: Action & signal
    enum Signal {
        /// Lime is the action colour: the commit on a screen, the selected
        /// day, the set that is open, and a gain. Mint is rest and recovery,
        /// amber asks for attention, red is a loss.
        static let action        = Color(hex: 0xC8FF66)   // --sl-action
        static let actionPressed = Color(hex: 0xDCFFA0)   // --sl-action-press
        static let actionTint    = Color(hex: 0xC8FF66).opacity(0.12)
        static let onAction      = Color(hex: 0x060908)   // --sl-on-action

        static let recovery     = Color(hex: 0x72EFD0)    // --sl-rest
        static let recoveryTint = Color(hex: 0x72EFD0).opacity(0.12)
        static let attention    = Color(hex: 0xFFB84D)    // --sl-attention
        static let loss         = Color(hex: 0xFF5C5C)    // --sl-loss
    }

    // MARK: Type
    // Archivo (bundled; see `SLTypeface`). Numerals ALWAYS .monospacedDigit().
    // UI minimum is 12pt; 11pt is reserved for tab labels only.
    /// The `wdth` the score numbers are cut at: narrow, short of the axis's
    /// most condensed (62), where the 4 and the 1 start to look alike.
    static let scoreWidth = 72

    enum TypeSize {
        static let displayXL: CGFloat = 44   // 01 headline, 09 session name
        static let displayL:  CGFloat = 40   // 02a leading element
        static let display:   CGFloat = 34   // screen titles
        static let title:     CGFloat = 21   // section titles
        static let lead:      CGFloat = 17   // row titles, buttons
        static let body:      CGFloat = 15
        static let meta:      CGFloat = 13
        static let micro:     CGFloat = 12   // column headers, labels
        static let tab:       CGFloat = 11   // tab labels ONLY
    }

    enum LineHeight {
        static let display: CGFloat = 1.1    // 1.04–1.06 at 40/44
        static let title:   CGFloat = 1.2
        static let body:    CGFloat = 1.5    // 1.45 on tight rows
    }

    enum Weight {
        static let regular  = Font.Weight.regular   // 400
        static let medium   = Font.Weight.medium    // 500
        static let semibold = Font.Weight.semibold  // 600
        /// 700: the label on a lime action and the oversized workout word.
        static let bold     = Font.Weight.bold
    }

    // MARK: Space
    enum Space {
        static let s1: CGFloat = 4
        static let s2: CGFloat = 8
        static let s3: CGFloat = 12
        static let s4: CGFloat = 16
        static let s5: CGFloat = 20
        static let s6: CGFloat = 24
        static let s8: CGFloat = 32
        static let s10: CGFloat = 40
        static let s12: CGFloat = 48

        static let gutterSession: CGFloat = 20
        static let gutterEntry:   CGFloat = 24
        static let tabInset:      CGFloat = 21
        static let homeBand:      CGFloat = 21
        /// Entry screens end their bottom block 98 above the frame's edge,
        /// which includes the 21 home band: 77 above the bottom safe area.
        static let entryBlockBottom: CGFloat = 77
        /// Session screens end their pill 42 above the frame's edge, home band
        /// included: 21 above the bottom safe area.
        static let sessionBlockBottom: CGFloat = 21
        static let hitMin:        CGFloat = 44
    }

    // MARK: Radius — concentric: inner = outer − padding
    enum Radius {
        static let sm: CGFloat = 8
        static let md: CGFloat = 12   // rows
        static let lg: CGFloat = 16   // tiles
        static let option: CGFloat = 20
        static let xl: CGFloat = 22   // cards, sheets, tab bar
        static let device: CGFloat = 44
        static let pill: CGFloat = 999
    }

    // MARK: Elevation — hairlines carry structure; shadows only float.
    enum Elevation {
        // Rest timer
        static let floatColor  = Color.black.opacity(0.55)
        static let floatRadius: CGFloat = 40
        static let floatY:      CGFloat = 16
        // Sheets
        static let sheetColor  = Color.black.opacity(0.5)
        static let sheetRadius: CGFloat = 40
        static let sheetY:      CGFloat = -12
    }

    // MARK: Motion — collapses to 1ms under Reduce Motion.
    enum Motion {
        static let fast:  Double = 0.120
        static let base:  Double = 0.180
        static let slow:  Double = 0.250
        static let sheetIn:  Double = 0.220
        static let sheetOut: Double = 0.160

        static let easeIn  = UnitCurve.easeIn   // cubic-bezier(.4,0,1,1)
        static let easeOut = UnitCurve.easeOut  // cubic-bezier(0,0,.2,1)

        /// No transform animation is used anywhere in this design, so
        /// honouring Reduce Motion is a duration change only.
        static func duration(_ d: Double, reduceMotion: Bool) -> Double {
            reduceMotion ? 0.001 : d
        }
    }

    // MARK: Layout
    enum Breakpoint {
        static let md: CGFloat = 640    // two columns, 72pt rail, 480pt dialogs
        static let lg: CGFloat = 1024   // 224pt rail · main · 380pt detail
        static let railCompact: CGFloat = 72
        static let railWide: CGFloat = 224
        static let detailColumn: CGFloat = 380
        static let dialogWidth: CGFloat = 480
    }

    // MARK: Fixed component metrics
    enum Metric {
        /// "Start training": 56 high, radius 16. Kept under its old name so
        /// every primary action in the app takes the new size.
        static let primaryPillHeight: CGFloat = 56
        /// "Set opslaan", the one 64pt action (--sl-cta).
        static let ctaHeight:         CGFloat = 64
        /// The outlined secondary: 48 high, radius 12.
        static let outlineHeight:     CGFloat = 48
        static let tertiaryHeight:    CGFloat = 44
        static let setRowHeight:      CGFloat = 52
        /// The tab bar: 56 high inside its hairline, radius 22, inset 21
        /// (--sl-tabbar-h). The design sizes boxes content-box, so the border
        /// adds to it: 58 across.
        static let tabItemHeight:     CGFloat = 56
        static let tabBarHeight:      CGFloat = 58
        static let segmentHeight:     CGFloat = 44
        static let chipHeight:        CGFloat = 44
        static let dayTileHeight:     CGFloat = 64   // 72 on the first-run home
        /// The one border width. The HTML sizes boxes content-box, so a 1px
        /// border sits outside the padding or `height` and adds to the box:
        /// 19's row is 14 + 14 of padding and 1 + 1 of border, 68.5 tall with
        /// its text 17 in. See `slBorderBox()`.
        static let border:            CGFloat = 1
        static let pressedScale:      CGFloat = 0.97
        static let focusRingWidth:    CGFloat = 2
        static let focusRingOffset:   CGFloat = 2
        static let undoWindow:        Double = 5     // seconds
        static let restAdjustStep:    Double = 30    // seconds, never resets
        static let restDefault:       Double = 120   // 2:00
    }
}

// MARK: - Primitives

/// The commit action: lime, radius 16, 56 high, its label at 17/700.
/// `prominent` is the logging screen's 64-high "Set opslaan" at 21/700.
/// Pressed: #DCFFA0, 120ms ease-out. Focus: 2pt lime ring, 2pt offset, no
/// glow. Disabled: raised2 fill, tertiary ink.
struct SLPrimaryButtonStyle: ButtonStyle {
    var prominent = false
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
        return configuration.label
            .font(.sl(prominent ? SL.TypeSize.title : SL.TypeSize.lead, SL.Weight.bold))
            .foregroundStyle(isEnabled ? SL.Signal.onAction : SL.Ink.tertiary)
            .frame(maxWidth: .infinity)
            .frame(minHeight: prominent ? SL.Metric.ctaHeight : SL.Metric.primaryPillHeight)
            .background(
                shape.fill(
                    !isEnabled ? SL.Surface.raised2
                    : configuration.isPressed ? SL.Signal.actionPressed
                    : SL.Signal.action
                )
            )
            .contentShape(shape)
            // The one lime action sinks and springs back, and the phone
            // answers as it goes down.
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .animation(
                reduceMotion ? nil
                    : configuration.isPressed ? .easeOut(duration: 0.1) : .spring(response: 0.3, dampingFraction: 0.55),
                value: configuration.isPressed
            )
            .sensoryFeedback(.impact(weight: .medium), trigger: configuration.isPressed) { _, isDown in isDown }
            .slFocusRing(shape)
    }
}

/// The outlined secondary: 48 high, radius 12, the strong hairline, its label
/// at 15/400 — "Details in agenda", "Andere datums kiezen". Pressed it takes
/// the raised2 fill. `tertiary` steps the ink back for the second of a pair.
struct SLOutlineButtonStyle: ButtonStyle {
    enum Emphasis { case secondary, tertiary }
    var emphasis: Emphasis = .secondary
    /// An edge of its own where a screen needs one — mint on a recovery
    /// action, red on a removal.
    var edge: Color? = nil

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
        return configuration.label
            .font(.sl(SL.TypeSize.body, SL.Weight.regular))
            .foregroundStyle(emphasis == .secondary ? SL.Ink.primary : SL.Ink.secondary)
            .frame(maxWidth: .infinity)
            .frame(minHeight: SL.Metric.outlineHeight)
            // 48 inside the border, 50 across — the design's box is content-box.
            .slBorderBox()
            .background(shape.fill(configuration.isPressed ? SL.Surface.raised2 : Color.clear))
            .overlay(shape.strokeBorder(edge ?? SL.Surface.hairlineStrong, lineWidth: 1))
            .contentShape(shape)
            .slFocusRing(shape)
    }
}

/// A text action with no edge: 44 high, 15/400 — "Oefeningen bekijken",
/// "Terug naar overzicht".
struct SLQuietButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
        return configuration.label
            .font(.sl(SL.TypeSize.body, SL.Weight.regular))
            .foregroundStyle(SL.Ink.primary)
            .frame(maxWidth: .infinity)
            .frame(minHeight: SL.Space.hitMin)
            .background(shape.fill(configuration.isPressed ? SL.Surface.raised2 : Color.clear))
            .contentShape(shape)
            .slFocusRing(shape)
    }
}

extension View {
    /// Steps a bordered surface out by its border before the fill and the
    /// stroke are drawn. A SwiftUI `strokeBorder` sits over the padding; the
    /// artboards' CSS border sits outside it and adds to the size, so every
    /// bordered box renders 2pt larger than its padding or `height` says,
    /// with its content 1pt further in — 09's today card sets its text at
    /// 20 + 1 + 20.
    ///
    /// Only for surfaces bordered in every state. A border that appears on
    /// selection is drawn inside, so a control keeps its size when tapped.
    func slBorderBox() -> some View {
        padding(SL.Metric.border)
    }

    /// Card / tile surface. `loud` raises the fill; `selected` strengthens the border.
    func slCard(
        radius: CGFloat = SL.Radius.xl,
        loud: Bool = false,
        selected: Bool = false
    ) -> some View {
        self
            .slBorderBox()
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(loud || selected ? SL.Surface.raised2 : SL.Surface.raised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(
                        selected ? SL.Surface.selection
                        : loud ? SL.Surface.hairlineStrong
                        : SL.Surface.hairline,
                        lineWidth: 1
                    )
            )
    }

    /// The day card and the two hero cards: the 155° gradient inside the
    /// strong hairline, radius 22. The angle is CSS's — the gradient line runs
    /// through the centre and ends where the perpendicular meets the corners,
    /// so it is measured against the card's own size.
    func slHeroCard(radius: CGFloat = SL.Radius.xl) -> some View {
        background(
            GeometryReader { proxy in
                let angle = 155.0 * Double.pi / 180
                let (dx, dy) = (sin(angle), -cos(angle))
                let size = proxy.size
                let length = abs(size.width * dx) + abs(size.height * dy)
                let half = length / 2
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(
                    LinearGradient(
                        stops: SL.Surface.heroStops,
                        startPoint: UnitPoint(
                            x: 0.5 - dx * half / max(size.width, 1),
                            y: 0.5 - dy * half / max(size.height, 1)
                        ),
                        endPoint: UnitPoint(
                            x: 0.5 + dx * half / max(size.width, 1),
                            y: 0.5 + dy * half / max(size.height, 1)
                        )
                    )
                )
            }
        )
        .overlay(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)
        )
    }

    /// A list card: surface-1 inside the hairline, radius 16, rows clipped to
    /// the corner.
    func slListCard(radius: CGFloat = SL.Radius.lg, raised: Bool = false) -> some View {
        background(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(raised ? SL.Surface.raised2 : SL.Surface.raised)
        )
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: 1)
        )
    }

    /// Every numeric value in this design uses tabular figures.
    func slNumerals() -> some View { self.monospacedDigit() }
}

/// The component sheet's focus state: a 2pt lime ring, 2pt outside the shape,
/// no glow. Drawn only while the control holds keyboard or remote focus, so it
/// never shows for touch.
private struct SLFocusRing<RingShape: InsettableShape>: ViewModifier {
    @Environment(\.isFocused) private var isFocused
    let shape: RingShape

    func body(content: Content) -> some View {
        content.overlay(
            shape
                .inset(by: -(SL.Metric.focusRingOffset + SL.Metric.focusRingWidth))
                .strokeBorder(SL.Signal.action, lineWidth: SL.Metric.focusRingWidth)
                .opacity(isFocused ? 1 : 0)
                .allowsHitTesting(false)
        )
    }
}

extension View {
    /// Our ring instead of the system's, on anything that can take focus.
    func slFocusRing<RingShape: InsettableShape>(_ shape: RingShape) -> some View {
        modifier(SLFocusRing(shape: shape)).focusEffectDisabled()
    }
}
