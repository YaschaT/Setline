// ProgramSheet.swift — choosing the programme, on artboard 05's option cards.
//
// Changing it says which plan the week is built from. It rewrites nothing:
// the account's own plan stays where it is, every logged session stays, and
// each programme keeps the week it was given, because schedule overrides are
// scoped per programme.
import { useState } from "react";
import { SL } from "../../design/tokens";
import { HStack, ScrollView, Spacer, Text, VStack } from "../../design/swiftui";
import { PressButton } from "../../design/support";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { slBody, slDisplay, slHitTarget, slLead, slMeta } from "../../design/components/SLText";
import { slLineHeight } from "../../design/SLDynamicType";
import { Program } from "../../core/Catalog/Program";

export function ProgramSheet({ programs, current, onSave, onClose }: { programs: Program[]; current: Program; onSave: (program: Program) => void; onClose: () => void }) {
  const [chosen, setChosen] = useState<Program | undefined>(undefined);
  const selection = chosen ?? current;
  const isCurrent = Program.id(selection) === Program.id(current);

  /** What the choice produces, stated before it is made. */
  const consequence = isCurrent
    ? `You're training on ${current.name} now.`
    : `Your week is built from ${selection.name}. Your logged sessions and your own plan stay.`;

  const save = () => {
    if (isCurrent) return onClose();
    onSave(selection);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, height: "100%", background: SL.Surface.ground }}>
      {/* header */}
      <HStack style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s3, flexShrink: 0 }}>
        <PressButton onPress={onClose}>
          <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary} style={{ ...slHitTarget(), display: "inline-block" }}>Back</Text>
        </PressButton>
        <Spacer />
      </HStack>

      <ScrollView style={{ flex: "1 1 0" }}>
        <VStack alignment="leading" spacing={0} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s6, paddingBottom: SL.Space.s12 }}>
          <Text as="h1" {...slDisplay()} color={SL.Ink.primary} style={slLineHeight(SL.LineHeight.display, { size: SL.TypeSize.display })}>
            Which plan shape?
          </Text>
          <Text {...slBody()} color={SL.Ink.secondary} style={{ ...slLineHeight(1.5, { size: SL.TypeSize.body }), paddingTop: SL.Space.s3 }}>
            Your own plan is kept. Each program keeps its own week.
          </Text>

          <VStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", alignItems: "stretch", paddingTop: SL.Space.s6 }}>
            {programs.map((program) => {
              const selected = Program.id(selection) === Program.id(program);
              return (
                <PressButton
                  key={Program.id(program)}
                  onPress={() => setChosen(program)}
                  aria-label={`${program.name}, ${program.shape}`}
                  aria-pressed={selected}
                  style={{
                    width: "100%",
                    display: "flex",
                    textAlign: "left",
                    borderRadius: SL.Radius.option,
                    background: selected ? SL.Surface.raised2 : SL.Surface.raised,
                    boxShadow: `inset 0 0 0 1px ${selected ? SL.Surface.selection : SL.Surface.hairline}`,
                    padding: `${SL.Space.s4 + 1}px ${18 + 1}px`,
                    transition: `background ${SL.Motion.base}s ease-out, box-shadow ${SL.Motion.base}s ease-out`,
                  }}
                >
                  <HStack alignment="top" spacing={SL.Space.s4} style={{ flex: "1 1 0" }}>
                    <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
                      <Text {...slLead()} color={SL.Ink.primary}>{program.name}</Text>
                      <Text {...slMeta()} color={selected ? SL.Ink.secondary : SL.Ink.tertiary}>{program.shape}</Text>
                    </VStack>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        flexShrink: 0,
                        background: selected ? SL.Ink.primary : "transparent",
                        boxShadow: `inset 0 0 0 1px ${selected ? "transparent" : SL.Surface.hairlineStrong}`,
                      }}
                    />
                  </HStack>
                </PressButton>
              );
            })}
          </VStack>

          <Text {...slBody()} color={SL.Ink.secondary} style={{ ...slLineHeight(1.45, { size: SL.TypeSize.body }), paddingTop: SL.Space.s5 }}>
            {consequence}
          </Text>
        </VStack>
      </ScrollView>

      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingBottom: SL.Space.s3, background: SL.Surface.ground }}>
        <SLPrimaryButton disabled={isCurrent} onPress={save}>Save</SLPrimaryButton>
      </div>
    </div>
  );
}
