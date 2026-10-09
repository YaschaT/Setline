import SwiftUI
import UIKit
import SetlineCore

/// One of the design's own glyphs, bundled as a template vector.
///
/// The redesign draws its icons as thin strokes (1.4–2pt on a 14–24pt grid);
/// those are the second group below. The first group is the Material Symbols
/// artwork the earlier sheets still use.
///
/// Sized like the text beside it: the design's point size, scaled for Dynamic
/// Type. Decorative by default; the control it sits in carries the label.
struct SLGlyph: View {
    enum Name: String {
        case timer = "IconTimer"
        case swapVert = "IconSwapVert"
        case search = "IconSearch"
        case download = "IconDownload"
        case calculate = "IconCalculate"

        case chevronRight = "IconChevronRight"
        case chevronLeft = "IconChevronLeft"
        case chevronDown = "IconChevronDown"
        case calendar = "IconCalendar"
        case clock = "IconClock"
        case moon = "IconMoon"
        case play = "IconPlay"
        case close = "IconClose"
        case plus = "IconPlus"
        case check = "IconCheck"
        case skip = "IconSkip"
        case plates = "IconPlates"
        case camera = "IconCameraSmall"
        case image = "IconImage"
        case bell = "IconBell"
        case people = "IconPeople"
        case personAdd = "IconPersonAdd"
        case kudos = "IconKudos"
        case kudosFill = "IconKudosFill"
        case trendUp = "IconTrendUp"
        case arrowRight = "IconArrowRight"
        case list = "IconList"
        case more = "IconMore"
        case share = "IconShare"
        case trash = "IconTrash"
        case flame = "IconFlame"
        case flameFill = "IconFlameFill"
        case target = "IconTarget"

        /// "Categoriestijl · één glyph-set, het label benoemt het type".
        case push = "GlyphPush"
        case pull = "GlyphPull"
        case legs = "GlyphLegs"
        case upper = "GlyphUpper"
        case lower = "GlyphLower"
        // Muscle groups, for exercise tiles.
        case chest = "MuscleChest"
        case back = "MuscleBack"
        case shoulders = "MuscleShoulders"
        case arms = "MuscleArms"
        case legMuscles = "MuscleLegs"
        case core = "MuscleCore"
    }

    let name: Name
    let size: CGFloat
    /// Chrome that must not grow with the reader's text size.
    var fixed = false

    var body: some View {
        let scaled = fixed ? size : UIFontMetrics(forTextStyle: .body).scaledValue(for: size)
        Image(name.rawValue)
            .renderingMode(.template)
            .resizable()
            .frame(width: scaled, height: scaled)
            .accessibilityHidden(true)
    }
}

extension SLGlyph.Name {
    /// The glyph for the muscle group an exercise is filed under.
    static func muscle(_ group: MuscleGroup?) -> SLGlyph.Name {
        switch group {
        case .borst: return .chest
        case .rug: return .back
        case .schouders: return .shoulders
        case .armen: return .arms
        case .benen: return .legMuscles
        case .core: return .core
        case nil: return .target
        }
    }

    /// The category glyph for a session by its name: "Push", "Upper A",
    /// "Full body B". A name outside the set borrows the upper-body glyph —
    /// the label beside it is what tells them apart.
    static func category(for sessionName: String) -> SLGlyph.Name {
        switch sessionName.split(separator: " ").first?.lowercased() {
        case "push": return .push
        case "pull": return .pull
        case "legs": return .legs
        case "lower": return .lower
        default: return .upper
        }
    }
}

/// A training day as the figure Apple Fitness and Apple Watch use for the
/// movement — icons people already know, where the design's own Push/Pull
/// strokes need learning. Matched by the day's first word: "Push",
/// "Upper A", "Full body B".
struct SLWorkoutSymbol: View {
    let dayName: String
    var size: CGFloat = 20

    static func systemName(for dayName: String) -> String {
        switch dayName.split(separator: " ").first?.lowercased() {
        case "push": return "figure.strengthtraining.traditional"
        case "pull": return "figure.rower"
        case "legs", "benen": return "figure.strengthtraining.functional"
        case "lower": return "figure.step.training"
        case "upper": return "dumbbell.fill"
        case "core": return "figure.core.training"
        default: return "figure.cross.training"
        }
    }

    var body: some View {
        Image(systemName: Self.systemName(for: dayName))
            .font(.system(size: UIFontMetrics(forTextStyle: .body).scaledValue(for: size), weight: .semibold))
            .symbolRenderingMode(.monochrome)
            .accessibilityHidden(true)
    }
}
