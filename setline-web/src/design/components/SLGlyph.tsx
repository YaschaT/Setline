// SLGlyph.swift — one of the design's own glyphs, a template vector: drawn
// as a CSS mask so it takes the text colour (`color`, or the ink it sits in).
// Sized like the text beside it; decorative, the control carries the label.
import type { CSSProperties } from "react";
import { SFSymbol } from "../SFSymbol";
import { assetURL } from "../support";

/** `SLGlyph.Name` — the raw values are the asset names (`public/icons/<raw>.svg`). */
export type SLGlyph_Name =
  | "IconTimer" | "IconSwapVert" | "IconSearch" | "IconDownload" | "IconCalculate"
  | "IconChevronRight" | "IconChevronLeft" | "IconChevronDown" | "IconCalendar" | "IconClock" | "IconMoon"
  | "IconPlay" | "IconClose" | "IconPlus" | "IconCheck" | "IconSkip" | "IconPlates" | "IconCameraSmall"
  | "IconImage" | "IconBell" | "IconPeople" | "IconPersonAdd" | "IconKudos" | "IconKudosFill" | "IconTrendUp"
  | "IconArrowRight" | "IconList" | "IconMore" | "IconShare" | "IconTrash" | "IconFlame" | "IconFlameFill"
  | "IconTarget"
  | "GlyphPush" | "GlyphPull" | "GlyphLegs" | "GlyphUpper" | "GlyphLower";

const cases = {
  timer: "IconTimer",
  swapVert: "IconSwapVert",
  search: "IconSearch",
  download: "IconDownload",
  calculate: "IconCalculate",

  chevronRight: "IconChevronRight",
  chevronLeft: "IconChevronLeft",
  chevronDown: "IconChevronDown",
  calendar: "IconCalendar",
  clock: "IconClock",
  moon: "IconMoon",
  play: "IconPlay",
  close: "IconClose",
  plus: "IconPlus",
  check: "IconCheck",
  skip: "IconSkip",
  plates: "IconPlates",
  camera: "IconCameraSmall",
  image: "IconImage",
  bell: "IconBell",
  people: "IconPeople",
  personAdd: "IconPersonAdd",
  kudos: "IconKudos",
  kudosFill: "IconKudosFill",
  trendUp: "IconTrendUp",
  arrowRight: "IconArrowRight",
  list: "IconList",
  more: "IconMore",
  share: "IconShare",
  trash: "IconTrash",
  flame: "IconFlame",
  flameFill: "IconFlameFill",
  target: "IconTarget",

  /** "Categoriestijl · één glyph-set, het label benoemt het type". */
  push: "GlyphPush",
  pull: "GlyphPull",
  legs: "GlyphLegs",
  upper: "GlyphUpper",
  lower: "GlyphLower",
} as const satisfies Record<string, SLGlyph_Name>;

/** A case name (`"timer"`), accepted wherever a `SLGlyph_Name` raw value is. */
export type SLGlyph_NameCase = keyof typeof cases;

export const SLGlyph_Name = {
  ...cases,
  allCases: Object.values(cases) as SLGlyph_Name[],
  /**
   * The category glyph for a session by its name: "Push", "Upper A",
   * "Full body B". A name outside the set borrows the upper-body glyph.
   */
  category(a: { for: string }): SLGlyph_Name {
    switch (a.for.split(" ").filter((s) => s.length > 0)[0]?.toLowerCase()) {
      case "push":
        return "GlyphPush";
      case "pull":
        return "GlyphPull";
      case "legs":
        return "GlyphLegs";
      case "lower":
        return "GlyphLower";
      default:
        return "GlyphUpper";
    }
  },
};

export function SLGlyph({
  name,
  size,
  fixed = false,
  color,
  style,
}: {
  name: SLGlyph_Name | SLGlyph_NameCase;
  size: number;
  /** Chrome that must not grow with the reader's text size (no difference at the default size). */
  fixed?: boolean;
  /** `.foregroundStyle(_:)`; otherwise the surrounding text colour. */
  color?: string;
  style?: CSSProperties;
}) {
  void fixed;
  const raw: SLGlyph_Name = name in cases ? cases[name as SLGlyph_NameCase] : (name as SLGlyph_Name);
  return <TemplateImage name={raw} size={size} color={color} style={style} />;
}

/**
 * `Image(name).renderingMode(.template).resizable().frame(width: size, height: size)`
 * for any of the bundled vectors in `public/icons/` (the tab artwork too).
 */
export function TemplateImage({ name, size, color, style }: { name: string; size: number; color?: string; style?: CSSProperties }) {
  const url = `url("${assetURL(`icons/${name}.svg`)}")`;
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        flexShrink: 0,
        width: size,
        height: size,
        backgroundColor: color ?? "currentColor",
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskSize: "100% 100%",
        maskSize: "100% 100%",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        ...style,
      }}
    />
  );
}

/**
 * A training day as the figure Apple Fitness uses for the movement, matched
 * by the day's first word: "Push", "Upper A", "Full body B".
 */
export function SLWorkoutSymbol({ dayName, size = 20, color, style }: { dayName: string; size?: number; color?: string; style?: CSSProperties }) {
  return <SFSymbol name={SLWorkoutSymbol.systemName({ for: dayName })} size={size} weight={600} color={color} style={style} />;
}

SLWorkoutSymbol.systemName = (a: { for: string }): string => {
  switch (a.for.split(" ").filter((s) => s.length > 0)[0]?.toLowerCase()) {
    case "push":
      return "figure.strengthtraining.traditional";
    case "pull":
      return "figure.rower";
    case "legs":
    case "benen":
      return "figure.strengthtraining.functional";
    case "lower":
      return "figure.step.training";
    case "upper":
      return "dumbbell.fill";
    case "core":
      return "figure.core.training";
    default:
      return "figure.cross.training";
  }
};
