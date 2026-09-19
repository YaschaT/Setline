// SetlineTokens.swift
// SETLINE design tokens — transcribed 1:1 from the approved design
// (see design/SETLINE Main.dc.html, "Tokens" section).
//
// Two deliberate edits to the transcription, both in SLPrimaryButtonStyle:
// the label uses the Dynamic Type-scaled font helper, and the pill takes a
// minimum height rather than a fixed one, so it grows with the reader's text
// size instead of clipping. The handoff asks for both ("Support Dynamic Type
// via @ScaledMetric … the 44 hit-target minimum must hold at every size").
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
        static let ground   = Color(hex: 0x060908)   // app background
        static let raised   = Color(hex: 0x0D1310)   // cards, tab bar, sheets
        static let raised2  = Color(hex: 0x151C17)   // selected / louder surfaces

        static let hairline       = Color.white.opacity(0.08)  // structure
        static let hairlineStrong = Color.white.opacity(0.16)  // today's card, sheet edge
        static let selection      = Color.white.opacity(0.28)  // selected rows, secondary buttons

        /// Only translucent surface in the app: the floating rest timer.
        static let floatFill = Color(hex: 0x151C17).opacity(0.82)
        static let floatBlur: CGFloat = 24
    }

    // MARK: Ink
    enum Ink {
        static let primary   = Color(hex: 0xF3F7F4)
        static let secondary = Color(hex: 0xA9B5AD)
        static let tertiary  = Color(hex: 0x8B968E)
    }

    // MARK: Action & signal
    enum Signal {
        /// Two jobs only: one semantic win + one commit action per screen.
        /// Never a goal, never a neutral state, never a selection.
        static let action        = Color(hex: 0xC8FF66)
        static let actionPressed = Color(hex: 0xB9F45B)
        static let onAction      = Color(hex: 0x0A0D0B)

        static let recovery  = Color(hex: 0x72EFD0)
        static let attention = Color(hex: 0xF4C65B)
        static let loss      = Color(hex: 0xFF8A8A)
    }

    // MARK: Type
    // System font. Numerals ALWAYS .monospacedDigit().
    // UI minimum is 12pt; 11pt is reserved for tab labels only.
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
        static let semibold = Font.Weight.semibold  // 600 — nothing heavier
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
        static let primaryPillHeight: CGFloat = 54
        static let tertiaryHeight:    CGFloat = 44
        static let setRowHeight:      CGFloat = 56
        /// The tab bar as the design renders it: 56-high items inside 6 of
        /// padding and a 1pt border. The HTML sizes boxes content-box, so its
        /// `height:56px` bar draws 70 tall — the height seen in every artboard.
        static let tabItemHeight:     CGFloat = 56
        static let tabBarHeight:      CGFloat = 70
        static let segmentHeight:     CGFloat = 44
        static let chipHeight:        CGFloat = 44
        static let dayTileHeight:     CGFloat = 64   // 72 on the first-run home
        static let pressedScale:      CGFloat = 0.97
        static let focusRingWidth:    CGFloat = 2
        static let focusRingOffset:   CGFloat = 2
        static let undoWindow:        Double = 5     // seconds
        static let restAdjustStep:    Double = 15    // seconds, never resets
        static let restDefault:       Double = 120   // 2:00
    }
}

// MARK: - Primitives

/// The one commit action per screen. Pressed: scale .97 + #B9F45B, 120ms ease-out.
/// Focus: 2pt lime ring, 2pt offset, no glow. Disabled: raised2 fill, tertiary ink.
struct SLPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sl(SL.TypeSize.lead, SL.Weight.semibold))
            .foregroundStyle(isEnabled ? SL.Signal.onAction : SL.Ink.tertiary)
            .frame(maxWidth: .infinity)
            .frame(minHeight: SL.Metric.primaryPillHeight)
            .background(
                Capsule().fill(
                    !isEnabled ? SL.Surface.raised2
                    : configuration.isPressed ? SL.Signal.actionPressed
                    : SL.Signal.action
                )
            )
            .scaleEffect(configuration.isPressed && isEnabled ? SL.Metric.pressedScale : 1)
            .animation(
                .easeOut(duration: SL.Motion.duration(SL.Motion.fast, reduceMotion: reduceMotion)),
                value: configuration.isPressed
            )
            .slFocusRing(Capsule())
    }
}

/// Secondary (border .28) and tertiary-in-stack (border .16) pill.
struct SLOutlineButtonStyle: ButtonStyle {
    enum Emphasis { case secondary, tertiary }
    var emphasis: Emphasis = .secondary

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sl(
                SL.TypeSize.lead,
                emphasis == .secondary ? SL.Weight.semibold : SL.Weight.medium
            ))
            .foregroundStyle(emphasis == .secondary ? SL.Ink.primary : SL.Ink.secondary)
            .frame(maxWidth: .infinity)
            .frame(minHeight: SL.Metric.primaryPillHeight)
            .background(Capsule().fill(SL.Surface.raised2))
            .overlay(
                Capsule().strokeBorder(
                    emphasis == .secondary ? SL.Surface.selection : SL.Surface.hairlineStrong,
                    lineWidth: 1
                )
            )
            .opacity(configuration.isPressed ? 0.86 : 1)
            .slFocusRing(Capsule())
    }
}

extension View {
    /// Card / tile surface. `loud` raises the fill; `selected` strengthens the border.
    func slCard(
        radius: CGFloat = SL.Radius.xl,
        loud: Bool = false,
        selected: Bool = false
    ) -> some View {
        self
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
