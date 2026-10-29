// ColdOpenView.swift — Artboard 01 · the cold open.
//
// One promise, bottom-anchored, and two ways past it. Nothing loads, nothing
// animates, and there is no image: the handoff ships no bitmaps, so the ground
// stays flat rather than filling with something invented.
import { SL } from "../../design/tokens";
import { Spacer, Text } from "../../design/swiftui";
import { PressButton } from "../../design/support";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { slBody } from "../../design/components/SLText";
import { slLineHeight, slMeasure } from "../../design/SLDynamicType";

export function ColdOpenView({ onBegin, onSignIn }: { onBegin: () => void; onSignIn: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        height: "100%",
        background: SL.Surface.ground,
        // The safe area, then the artboard's own margins.
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: `calc(env(safe-area-inset-left) + ${SL.Space.gutterEntry}px)`,
        paddingRight: `calc(env(safe-area-inset-right) + ${SL.Space.gutterEntry}px)`,
        paddingBottom: `calc(env(safe-area-inset-bottom) + ${SL.Space.entryBlockBottom}px)`,
      }}
    >
      <Text
        as="h1"
        size={SL.TypeSize.micro}
        weight={SL.Weight.semibold}
        tracking={SL.TypeSize.micro * 0.18}
        color={SL.Ink.tertiary}
        style={{ paddingTop: 19 }}
      >
        SETLINE
      </Text>

      <Spacer minLength={SL.Space.s10} />

      <Text
        size={SL.TypeSize.displayXL}
        weight={SL.Weight.semibold}
        tracking={SL.TypeSize.displayXL * -0.015}
        color={SL.Ink.primary}
        style={{ ...slLineHeight(1.04, { size: SL.TypeSize.displayXL }), whiteSpace: "pre-line" }}
      >
        {"Lift heavier,\nevery week."}
      </Text>

      <Text
        {...slBody()}
        color={SL.Ink.secondary}
        style={{ ...slLineHeight(1.5, { size: SL.TypeSize.body }), ...slMeasure(26, { fontSize: SL.TypeSize.body }), paddingTop: 14 }}
      >
        Log your sets in two taps. Your last session is already there.
      </Text>

      {/* 01's bottom block: 28 above the pill, 12 between the pill and the
          link, 98 below it in the frame. */}
      <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", paddingTop: 28 }}>
        <SLPrimaryButton onPress={onBegin}>Get started</SLPrimaryButton>
      </div>

      <PressButton
        onPress={onSignIn}
        style={{ alignSelf: "stretch", marginTop: SL.Space.s3, minHeight: SL.Metric.tertiaryHeight, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>
          I already have an account
        </Text>
      </PressButton>
    </div>
  );
}
