// HowItWorksView.swift — Artboard 02a · the mechanic in three beats, right
// after an account is made.
//
// No input, and the screen's one lime is the `+2,5 kg` — the thing the app
// does for you, which is the whole reason to be here.
import { Fragment } from "react";
import { SL, slCard, slFont } from "../../design/tokens";
import { HStack, Spacer, Text, VStack } from "../../design/swiftui";
import { PressButton } from "../../design/support";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { SLHairline, slBody, slDisplay, slLead, slMeta } from "../../design/components/SLText";
import { SLAnchoredScroll } from "../../design/components/SLAnchoredScroll";
import { slLineHeight, slMeasure } from "../../design/SLDynamicType";
import { entryBottom, entryScreen, monospaced } from "./IntakeChrome";

const beats: { title: string; body: string; lime?: string }[] = [
  { title: "Your plan is ready", body: "Exercises, sets and reps for every day. No empty log." },
  { title: "Log in two taps", body: "Last time's weight is already filled in. Tap it off and rest." },
  { title: "SETLINE plans ahead", body: "All reps done? Next session +2.5 kg. Not done? Same weight.", lime: "+2.5 kg" },
];

export function HowItWorksView({ onContinue }: { onContinue: () => void }) {
  return (
    <div style={entryScreen}>
      {/* 02a: the kicker and headline at the top, the beats and footnote down
          by the pill, and the room between them flexible. */}
      <SLAnchoredScroll>
        <VStack alignment="leading" spacing={0} style={{ flex: "1 0 auto", paddingLeft: SL.Space.gutterEntry, paddingRight: SL.Space.gutterEntry, paddingTop: SL.Space.s8 }}>
          <Text as="h1" size={SL.TypeSize.meta} weight={SL.Weight.medium} tracking={SL.TypeSize.meta * 0.14} color={SL.Ink.tertiary}>
            HOW IT WORKS
          </Text>

          <Text
            size={SL.TypeSize.displayL}
            weight={SL.Weight.semibold}
            tracking={SL.TypeSize.displayL * -0.015}
            color={SL.Ink.primary}
            style={{ ...slLineHeight(1.06, { size: SL.TypeSize.displayL }), whiteSpace: "pre-line", paddingTop: 14 }}
          >
            {"Lift a little\nheavier every week."}
          </Text>

          <Spacer minLength={SL.Space.s8} />

          <VStack spacing={2} style={{ alignSelf: "stretch", alignItems: "stretch" }}>
            {beats.map((beat, index) => (
              <VStack key={index} spacing={0} style={{ alignItems: "stretch" }}>
                <SLHairline />
                <BeatRow index={index} beat={beat} />
                {index === beats.length - 1 && <SLHairline />}
              </VStack>
            ))}
          </VStack>

          <Text {...slMeta()} color={SL.Ink.tertiary} style={{ ...slLineHeight(1.5, { size: SL.TypeSize.meta }), paddingTop: SL.Space.s5 }}>
            You don't have to program anything. You just have to show up.
          </Text>
        </VStack>
      </SLAnchoredScroll>

      <div style={entryBottom(SL.Space.s6)}>
        <SLPrimaryButton onPress={onContinue}>Continue</SLPrimaryButton>
      </div>
    </div>
  );
}

function BeatRow({ index, beat }: { index: number; beat: { title: string; body: string; lime?: string } }) {
  return (
    <HStack alignment="top" spacing={SL.Space.s4} style={{ paddingTop: 18, paddingBottom: 18, alignSelf: "stretch" }}>
      <span style={{ ...monospaced(SL.TypeSize.meta, SL.Weight.semibold), color: SL.Ink.tertiary, paddingTop: 3 }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <VStack alignment="leading" spacing={SL.Space.s1} style={{ flex: "1 1 0" }}>
        <Text {...slLead()} color={SL.Ink.primary}>{beat.title}</Text>
        <Text {...slBody()} color={SL.Ink.secondary} style={slLineHeight(1.45, { size: SL.TypeSize.body })}>
          {attributed(beat.body, beat.lime)}
        </Text>
      </VStack>
    </HStack>
  );
}

function attributed(text: string, fragment: string | undefined) {
  const at = fragment ? text.indexOf(fragment) : -1;
  if (!fragment || at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span style={{ ...slFont(SL.TypeSize.body, SL.Weight.semibold), color: SL.Signal.action }}>{fragment}</span>
      {text.slice(at + fragment.length)}
    </>
  );
}

/** Artboard 02b · what intake costs, and what each question changes. */
export function IntakeIntroView({ onBack, onBegin, onSkip }: { onBack: () => void; onBegin: () => void; onSkip: () => void }) {
  const rows: [string, string][] = [
    ["Days a week", "shape of your week"],
    ["How long you've lifted", "progress pace"],
    ["Plan shape", "split per day"],
    ["Plates in your gym", "smallest jump"],
  ];
  return (
    <div style={entryScreen}>
      <div style={{ paddingLeft: SL.Space.gutterEntry, paddingRight: SL.Space.gutterEntry, display: "flex" }}>
        <PressButton onPress={onBack} style={{ minHeight: SL.Space.hitMin, display: "flex", alignItems: "center" }}>
          <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>Back</Text>
        </PressButton>
      </div>

      <SLAnchoredScroll>
        {/* 02b: the title 36 below `Terug`'s text, which sits centred in its
            44pt row — 22 below the row. */}
        <VStack alignment="leading" spacing={0} style={{ flex: "1 0 auto", paddingLeft: SL.Space.gutterEntry, paddingRight: SL.Space.gutterEntry, paddingTop: 22 }}>
          <Text as="h1" {...slDisplay()} color={SL.Ink.primary} style={{ ...slLineHeight(SL.LineHeight.display, { size: SL.TypeSize.display }), whiteSpace: "pre-line" }}>
            {"Four questions and\nyour plan is ready."}
          </Text>

          <Text
            {...slBody()}
            color={SL.Ink.secondary}
            style={{ ...slLineHeight(1.5, { size: SL.TypeSize.body }), ...slMeasure(32, { fontSize: SL.TypeSize.body }), paddingTop: SL.Space.s3 }}
          >
            We only ask what changes today's screen. About 40 seconds.
          </Text>

          <Spacer minLength={28} />

          <VStack spacing={0} style={{ alignSelf: "stretch", alignItems: "stretch", padding: "6px 18px", ...slCard() }}>
            {rows.map((row, index) => (
              <Fragment key={index}>
                {index > 0 && <SLHairline />}
                <HStack alignment="firstTextBaseline" spacing={SL.Space.s4} style={{ paddingTop: 14, paddingBottom: 14 }}>
                  <Text {...slLead()} color={SL.Ink.primary}>{row[0]}</Text>
                  <Spacer minLength={SL.Space.s3} />
                  <Text {...slMeta()} color={SL.Ink.tertiary}>{row[1]}</Text>
                </HStack>
              </Fragment>
            ))}
          </VStack>

          <Text {...slMeta()} color={SL.Ink.tertiary} style={{ ...slLineHeight(1.5, { size: SL.TypeSize.meta }), paddingTop: SL.Space.s5 }}>
            You can change everything later in Account. Skipping gives you a standard four-day plan.
          </Text>
        </VStack>
      </SLAnchoredScroll>

      <div style={{ ...entryBottom(SL.Space.s6), gap: SL.Space.s2 }}>
        <SLPrimaryButton onPress={onBegin}>Start with question 1</SLPrimaryButton>
        <PressButton onPress={onSkip} style={{ minHeight: SL.Metric.tertiaryHeight, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>Skip · standard plan</Text>
        </PressButton>
      </div>
    </div>
  );
}
