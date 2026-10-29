// RestNotificationSheet.swift — Artboard 07 · the prompt before the prompt.
//
// It appears in the one place where the answer is obvious: the first set is
// logged, the rest has started, and the phone is about to go in a pocket. The
// OS is only asked after the reader says yes here, and it is asked once.
import { HStack, Pressable, ScrollView, Text, VStack } from "../../design/swiftui";
import { SL } from "../../design/tokens";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { Presentation } from "../../design/support";
import { slMeasure } from "../../design/SLDynamicType";
import { slBody, slDisplay, slLead } from "../../design/components/SLText";

export function RestNotificationSheet({ restLabel, onAllow, onDecline }: { restLabel: string; onAllow: () => void; onDecline: () => void }) {
  return (
    <>
      <Presentation detents={[{ height: 460 }, "large"]} background={SL.Surface.raised} dragIndicator="hidden" />
      <VStack
        alignment="leading"
        spacing={0}
        style={{
          flex: "1 1 0",
          minHeight: 0,
          background: SL.Surface.raised,
          paddingLeft: SL.Space.gutterSession,
          paddingRight: SL.Space.gutterSession,
          paddingTop: SL.Space.s6,
          paddingBottom: `calc(${SL.Space.s6}px + env(safe-area-inset-bottom))`,
        }}
      >
        <div style={{ alignSelf: "stretch", display: "flex", justifyContent: "center", paddingBottom: SL.Space.s6 }}>
          <span style={{ width: 36, height: 5, borderRadius: 999, background: SL.Surface.hairlineStrong }} />
        </div>

        {/* Scrolls, so neither the headline nor a reader's larger text ever has to be cut to fit the sheet. */}
        <ScrollView style={{ flex: "1 1 auto", alignSelf: "stretch" }}>
          <VStack alignment="leading" spacing={0}>
            <Text {...slDisplay()} lineHeight={SL.LineHeight.display} color={SL.Ink.primary} as="h2">Rest timer in the background</Text>
            <Text {...slBody()} lineHeight={1.5} color={SL.Ink.secondary} style={{ ...slMeasure(32, { fontSize: SL.TypeSize.body }), paddingTop: SL.Space.s3 }}>
              {`Your rest lasts ${restLabel}. With a notification you don't need to keep the app open, and you'll hear when it's time to go again.`}
            </Text>
            <HStack
              spacing={SL.Space.s2}
              style={{ alignSelf: "stretch", marginTop: SL.Space.s5, paddingTop: 14, paddingBottom: 14, paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, borderRadius: SL.Radius.lg, background: SL.Surface.raised2 }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: SL.Ink.tertiary, flexShrink: 0 }} />
              <Text {...slBody()} color={SL.Ink.secondary}>Only timers. No reminders, no tips.</Text>
            </HStack>
          </VStack>
        </ScrollView>

        <div style={{ alignSelf: "stretch", paddingTop: SL.Space.s5 }}>
          <SLPrimaryButton onPress={onAllow}>Allow notifications</SLPrimaryButton>
        </div>

        <Pressable
          onPress={onDecline}
          style={{ alignSelf: "stretch", marginTop: SL.Space.s2, minHeight: SL.Metric.tertiaryHeight, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Text {...slLead(SL.Weight.medium)} color={SL.Ink.secondary}>Not now</Text>
        </Pressable>
      </VStack>
    </>
  );
}
