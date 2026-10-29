// DurationRow.swift — "Duration  − 45 min +": how long the workout took, in
// steps of five. Used where the clock can't know — a workout written down
// afterwards — and wherever a saved workout is corrected.
import { HStack, Pressable, Spacer, Text, VStack, type Binding } from "../../design/swiftui";
import { SL, slNumerals } from "../../design/tokens";
import { SFSymbol } from "../../design/SFSymbol";
import { slBody, slMeta } from "../../design/components/SLText";

export function DurationRow({ minutes, note }: { minutes: Binding<number>; /** Says where the number came from: "from the clock", "planned". */ note?: string }) {
  const step = (symbol: string, label: string, action: () => void) => (
    <Pressable
      aria-label={label}
      onPress={action}
      style={{ width: 44, height: SL.Space.hitMin, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", color: SL.Ink.primary }}
    >
      <SFSymbol name={symbol} size={13} weight={700} />
    </Pressable>
  );
  return (
    <HStack
      spacing={SL.Space.s3}
      aria-label={`Duration, ${minutes.value} minutes`}
      style={{
        alignSelf: "stretch",
        paddingLeft: SL.Space.s4,
        paddingRight: SL.Space.s4,
        paddingTop: SL.Space.s2,
        paddingBottom: SL.Space.s2,
        background: SL.Surface.raised,
        borderRadius: SL.Radius.lg,
        boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}`,
      }}
    >
      <VStack alignment="leading" spacing={2}>
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary}>Duration</Text>
        {note !== undefined && <Text {...slMeta()} color={SL.Ink.secondary}>{note}</Text>}
      </VStack>
      <Spacer minLength={SL.Space.s2} />
      <HStack spacing={0} style={{ background: SL.Surface.raised2, borderRadius: SL.Radius.pill }}>
        {step("minus", "Five minutes less", () => minutes.set(Math.max(5, minutes.value - 5)))}
        <Text size={SL.TypeSize.body} weight={SL.Weight.semibold} color={SL.Ink.primary} align="center" style={{ minWidth: 64, ...slNumerals }}>
          {`${minutes.value} min`}
        </Text>
        {step("plus", "Five minutes more", () => minutes.set(Math.min(300, minutes.value + 5)))}
      </HStack>
    </HStack>
  );
}
