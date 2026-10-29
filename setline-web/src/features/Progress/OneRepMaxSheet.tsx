// OneRepMaxSheet.swift — Artboard 40e · what "geschat 1RM" means.
//
// Three numbers and a sentence: the set it was computed from, what that comes
// to now, and what it came to at the date the delta counts from. The point of
// the sheet is the last line — the change is between two estimates, not
// between two lifts — so nobody reads the headline as a weight they once had
// on the bar.
//
// It explains; it never proposes. Nothing here can be tapped except the way out.
import { SL } from "../../design/tokens";
import { HStack, Pressable, Spacer, Text, VStack } from "../../design/swiftui";
import { Presentation } from "../../design/support";
import { SLHairline, slBody, slMeta } from "../../design/components/SLText";
import { slLineHeight } from "../../design/SLDynamicType";
import { useApp } from "../../data/AppState";
import { StrengthProgress } from "../../core/Progress/StrengthProgress";
import { Estimates } from "../../core/Engine/Estimates";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";

export function OneRepMaxSheet({ progress, onClose }: { progress: StrengthProgress; onClose: () => void }) {
  const app = useApp();
  const display = app.display;

  /** Only the lines this exercise actually has. */
  const lines: { label: string; value: string }[] = [];
  if (progress.source !== undefined) {
    lines.push({
      label: `Best set · ${NumberDisplay.shortDate(display, progress.source.date)}`,
      value: `${NumberDisplay.kg(display, progress.source.weightKg)} × ${progress.source.reps}`,
    });
  }
  if (progress.estimate !== undefined) {
    lines.push({ label: "Estimated 1RM now", value: NumberDisplay.kg(display, Estimates.round(progress.estimate, { toIncrement: 0.5 })) });
  }
  if (progress.change !== undefined) {
    lines.push({
      label: `Estimated on ${NumberDisplay.shortDate(display, progress.change.since)}`,
      value: NumberDisplay.kg(display, Estimates.round(progress.change.baseline, { toIncrement: 0.5 })),
    });
  }

  const note = (() => {
    const shown = StrengthProgress.shownChange(progress);
    if (progress.change === undefined || shown === undefined) {
      return "Once you log this exercise again, this also shows where you started from.";
    }
    const delta = NumberDisplay.signedDelta(display, shown);
    return `So ${delta} kg is the difference between two estimates, not between two lifts. More reps at the same weight count too.`;
  })();

  const row = (label: string, value: string) => (
    <HStack key={label} alignment="firstTextBaseline" spacing={SL.Space.s3} style={{ minHeight: SL.Space.hitMin, position: "relative", alignSelf: "stretch" }}>
      <Text {...slBody()} numerals color={SL.Ink.secondary}>
        {label}
      </Text>
      <Spacer minLength={SL.Space.s2} />
      <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Ink.primary} style={{ flexShrink: 0 }}>
        {value}
      </Text>
      <SLHairline style={{ position: "absolute", left: 0, right: 0, bottom: 0 }} />
    </HStack>
  );

  return (
    <VStack
      alignment="leading"
      spacing={0}
      style={{
        flex: "1 1 0",
        minHeight: 0,
        alignSelf: "stretch",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        paddingLeft: SL.Space.gutterSession,
        paddingRight: SL.Space.gutterSession,
        paddingTop: 10,
        paddingBottom: 34,
        background: SL.Surface.raised,
      }}
    >
      {/* 40e opens 388 from the top of the frame: it leaves the screen it explains in view. */}
      <Presentation detents={[{ fraction: 0.56 }]} dragIndicator="hidden" background={SL.Surface.raised} />
      <div aria-hidden style={{ alignSelf: "stretch", display: "flex", justifyContent: "center", paddingBottom: 18 }}>
        <div style={{ width: 36, height: 5, borderRadius: SL.Radius.pill, background: SL.Surface.hairlineStrong }} />
      </div>

      <Text as="h2" size={28} weight={SL.Weight.semibold} color={SL.Ink.primary}>
        Estimated 1RM
      </Text>

      <Text {...slBody()} color={SL.Ink.secondary} style={{ ...slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.body }), paddingTop: SL.Space.s2 }}>
        What you could probably lift once. You never have to try it: SETLINE works it out from your heaviest set of each session.
      </Text>

      <VStack spacing={0} style={{ paddingTop: 18, alignSelf: "stretch", position: "relative" }}>
        {lines.map((line) => row(line.label, line.value))}
        <SLHairline style={{ position: "absolute", left: 0, right: 0, top: 18 }} />
      </VStack>

      <Text {...slMeta()} color={SL.Ink.tertiary} style={{ ...slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.meta }), paddingTop: 14 }}>
        {note}
      </Text>

      <Spacer minLength={SL.Space.s2} />

      <Pressable onPress={onClose} style={{ alignSelf: "stretch", minHeight: SL.Space.hitMin, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>
          Got it
        </Text>
      </Pressable>
    </VStack>
  );
}
