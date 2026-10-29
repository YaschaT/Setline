// A page to eyeball the design components: one of each, with sample props.
// Not wired into the app; mount <DesignCheck /> by hand to look at it.
import { useState, type ReactNode } from "react";
import { SL } from "./tokens";
import { ScrollView, Sheet, Text, VStack, type Binding } from "./swiftui";
import { SLOutlineButton, SLPrimaryButton, SLQuietButton } from "./SetlineTokens";
import { SLSound } from "./SLSound";
import {
  Celebration, MuscleFigure, SLAnchoredScroll, SLAttentionCard, SLAvatar, SLBadge, SLBar, SLCelebration, SLChip,
  SLDateColumn, SLDateText, SLDoneMark, SLEyebrow, SLFlexPair, SLFlow, SLFoodPhoto, SLFoodPhoto_Source, SLGlyph,
  SLGlyph_Name, SLHairline, SLHeaderButton, SLMedal, SLMedalRow, SLNoteCard, SLOverline, SLPillButton, SLPress,
  SLRestPill, SLRowButton, SLScreenTitle, SLSectionHead, SLSetRow, SLSheet, SLStepper, SLStreakChip, SLTab, SLTabBar,
  SLTabHeader, SLTodayBadge, SLUndoToast, SLValueRow, SLWarmupRow, SLWeekDots, SLWeightedRow, SLWorkoutSymbol,
  SLAdaptiveRow, SidewaysDrag, StreakSheet, slBody, slMeta, slWeight, slUnbroken,
} from "./components";
import { Milestone } from "../core/Progress/Milestones";
import { LiftMedal, LiftMedal_Place } from "../core/Progress/Medals";
import { NumberDisplay } from "../core/Engine/NumberDisplay";
import { TrainingStreak } from "../core/Progress/TrainingStreak";

const won = Milestone.make({ id: "s-25", kind: "sessions", title: "25 sessions", reachedOn: new Date(2026, 8, 14), current: 25, target: 25, badgeLabel: "25", tier: 2, howTo: "Log 25 workouts." });
const locked = Milestone.make({ id: "v-50", kind: "volume", title: "50 tonnes lifted", reachedOn: undefined, current: 31, target: 50, badgeLabel: "50 t", tier: 1, howTo: "Lift 50 tonnes in total." });
const medal = LiftMedal.make({ place: LiftMedal_Place.gold, exerciseID: "bench", name: "Bench press", weightKg: 82.5, reps: 8, sessionsCompared: 6 });
const streak = TrainingStreak.make({ weeks: 3, thisWeekDone: 2, thisWeekGoal: 3, best: 5 });

function useBinding<T>(initial: T): Binding<T> {
  const [value, set] = useState(initial);
  return { value, set };
}

function Section({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
      <SLEyebrow text={title} />
      {children}
    </VStack>
  );
}

export function DesignCheck() {
  const tab = useBinding<SLTab>("training");
  const celebration = useBinding<Celebration | undefined>(undefined);
  const [sheet, setSheet] = useState(false);
  const [streakSheet, setStreakSheet] = useState(false);
  const [weight, setWeight] = useState(82.5);
  const [reps, setReps] = useState(8);
  const [expanded, setExpanded] = useState(false);
  const [chip, setChip] = useState(0);
  const [dx, setDx] = useState(0);
  const [toast, setToast] = useState(true);

  return (
    <SLCelebration item={celebration} style={{ height: "100%", display: "flex", flexDirection: "column", background: SL.Surface.ground }}>
      <ScrollView style={{ flex: "1 1 0" }}>
        <VStack alignment="leading" spacing={SL.Space.s8} style={{ padding: SL.Space.gutterSession, paddingBottom: 140 }}>
          <SLTabHeader title="Good morning" subtitle="Week 3 · 2 of 3 done" ring="linear-gradient(#FFE08A, #B07D12)" onAccount={() => {}} trailing={<SLHeaderButton glyph="bell" label="Alerts" action={() => {}} />} />
          <SLScreenTitle title="Progress" subtitle="Last 8 weeks" trailing={<SLPillButton onPress={() => {}}>Meer</SLPillButton>} />

          <Section title="Buttons">
            <SLPrimaryButton onPress={() => SLSound.play("tick")}>Start training</SLPrimaryButton>
            <SLPrimaryButton prominent onPress={() => SLSound.play("success")}>Save set</SLPrimaryButton>
            <SLPrimaryButton disabled>Disabled</SLPrimaryButton>
            <SLOutlineButton onPress={() => {}}>Details in agenda</SLOutlineButton>
            <SLOutlineButton emphasis="tertiary" edge={SL.Signal.recovery}>Choose other dates</SLOutlineButton>
            <SLQuietButton onPress={() => {}}>View exercises</SLQuietButton>
            <SLPress onPress={() => SLSound.play("pop")} style={{ padding: 12, borderRadius: 12, background: SL.Surface.raised }}>
              <Text>SLPress</Text>
            </SLPress>
          </Section>

          <Section title="Chips">
            <SLFlow>
              {(["selected", "unselected", "check", "quiet", "off"] as const).map((look, i) => (
                <SLChip key={look} title={look} look={chip === i ? "selected" : look} action={() => setChip(i)} />
              ))}
              <SLChip title="Large" size="large" look="selected" action={() => {}} />
            </SLFlow>
          </Section>

          <Section title="Steppers">
            <SLFlexPair>
              <SLStepper label="Weight" display={`${weight}`.replace(".", ",")} isChanged={weight !== 82.5} onTyped={(t) => setWeight(Number(t.replace(",", ".")) || weight)} onDecrement={() => setWeight(weight - 2.5)} onIncrement={() => setWeight(weight + 2.5)} />
              <SLStepper label="Reps" display={`${reps}`} onDecrement={() => setReps(reps - 1)} onIncrement={() => setReps(reps + 1)} />
            </SLFlexPair>
            <SLStepper label="Weight" display="—" level="onRaised2" disabledNote="off (no plates)" onDecrement={() => {}} onIncrement={() => {}} />
          </Section>

          <Section title="Set rows">
            <div style={{ alignSelf: "stretch", background: SL.Surface.raised, borderRadius: SL.Radius.lg, overflow: "hidden", border: `1px solid ${SL.Surface.hairline}` }}>
              <SLWarmupRow label="50%" value="40 × 8" />
              <SLSetRow label="Set 1" phase="done" previous="last 80 × 8" value="82,5 × 8" note={{ text: "Record", tone: SL.Signal.action }} spoken="Set 1, done" onTap={() => {}} />
              <SLSetRow label="Set 2 · open" phase="open" previous="last 80 × 8" value="82,5 × 8" spoken="Set 2, open" onTap={() => {}} />
              <SLSetRow label="Set 3" phase="pending" value="—" spoken="Set 3" onTap={() => {}} />
              <SLSetRow label="Set 4" phase="pending" value="follows from set 1" valueIsSentence spoken="Set 4" onTap={() => {}} />
            </div>
          </Section>

          <Section title="Rest">
            <SLRestPill title="Rest · primary lift 3:00" remaining={148} total={180} planned={180} isExpanded={expanded} onAdjust={() => {}} onReset={() => {}} onToggleExpanded={() => setExpanded(!expanded)} onSkip={() => {}} />
            <SLRestPill title="Rest" remaining={0} total={180} planned={180} isExpanded={false} onAdjust={() => {}} onReset={() => {}} onToggleExpanded={() => {}} onSkip={() => {}} />
            {toast && <SLUndoToast message="Set saved" onUndo={() => setToast(false)} onDismiss={() => setToast(false)} />}
            <SLUndoToast message="Logged 2 eggs" onDismiss={() => {}} />
          </Section>

          <Section title="Rows and cards">
            <SLSectionHead title="This week" meta="3 sessions" />
            <SLRowButton onPress={() => {}}>
              <SLAdaptiveRow
                style={{ padding: 12 }}
                leading={<SLDateColumn weekday="Wed" day={9} />}
                main={<Text {...slBody()}>{slUnbroken("Push · 6 exercises · 45 min")}</Text>}
                trailing={<SLDoneMark />}
              />
            </SLRowButton>
            <SLTodayBadge />
            <SLAttentionCard title="Check this">
              <Text {...slBody()} color={SL.Ink.secondary}>Your weigh-ins are behind your goal.</Text>
            </SLAttentionCard>
            <SLNoteCard tone="action">
              <Text {...slBody()}>A note card</Text>
            </SLNoteCard>
            <SLOverline text="Deze week" />
            <SLValueRow>
              <Text size={34} weight={600} numerals>63,5 kg</Text>
              <Text {...slMeta()} color={SL.Signal.action}>+6,2 in 8 weeks</Text>
            </SLValueRow>
            <SLBar fraction={0.62} />
            <SLHairline />
            <SLWeightedRow>
              <SLOutlineButton>−30s</SLOutlineButton>
              <SLOutlineButton>+30s</SLOutlineButton>
              <SLOutlineButton style={slWeight(1.4)}>3:00 reset</SLOutlineButton>
            </SLWeightedRow>
          </Section>

          <Section title="Marks">
            <SLFlow spacing={16}>
              <SLAvatar initial="Y" />
              <SLAvatar initial="Y" size={40} />
              <SLBadge milestone={won} />
              <SLBadge milestone={locked} />
              <SLMedal place={LiftMedal_Place.gold} shines />
              <SLMedal place={LiftMedal_Place.silver} />
              <SLMedal place={LiftMedal_Place.bronze} />
              <MuscleFigure group="borst" highlight={SL.Signal.action} style={{ width: 24, height: 34 }} />
              <MuscleFigure group="benen" style={{ width: 24, height: 34 }} />
              <SLWorkoutSymbol dayName="Push" />
              <SLStreakChip streak={streak} action={() => setStreakSheet(true)} />
              <SLWeekDots done={2} goal={3} />
            </SLFlow>
            <SLMedalRow medal={medal} display={NumberDisplay.english} />
            <SLFlow>
              {SLGlyph_Name.allCases.map((name) => (
                <SLGlyph key={name} name={name} size={20} color={SL.Ink.primary} />
              ))}
            </SLFlow>
            <SLFlow>
              <SLFoodPhoto source={SLFoodPhoto_Source.asset("FoodEggs")} style={{ width: 44, height: 44 }} />
              <SLFoodPhoto source={SLFoodPhoto_Source.url(undefined)} style={{ width: 44, height: 44 }} />
              <SLFoodPhoto source={SLFoodPhoto_Source.asset("FoodSalmon")} cornerRadius={22} style={{ width: 44, height: 44 }} />
            </SLFlow>
          </Section>

          <Section title="Gestures and presentations">
            <SidewaysDrag onChanged={setDx} onEnded={() => setDx(0)} style={{ alignSelf: "stretch", height: 64, borderRadius: 16, background: SL.Surface.raised, display: "grid", placeItems: "center" }}>
              <Text color={SL.Ink.secondary}>{`Drag sideways: ${Math.round(dx)}`}</Text>
            </SidewaysDrag>
            <SLOutlineButton onPress={() => setSheet(true)}>Open SLSheet</SLOutlineButton>
            <SLOutlineButton onPress={() => celebration.set(Celebration.make({ symbol: "trophy.fill", title: "New record", detail: "Bench press · 82,5 kg × 8" }))}>Celebrate</SLOutlineButton>
            <SLOutlineButton onPress={() => celebration.set(Celebration.make({ symbol: "medal.fill", title: "25 sessions", detail: "A milestone", badge: won }))}>Celebrate a badge</SLOutlineButton>
            <Text {...slMeta()} color={SL.Ink.tertiary}>{SLDateText.long(new Date())}</Text>
          </Section>
        </VStack>
      </ScrollView>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 12 }}>
        <SLTabBar selection={tab} badges={{ friends: 2 }} />
      </div>

      <Sheet isPresented={sheet} onDismiss={() => setSheet(false)}>
        <SLSheet title="Plan & workouts" subtitle="Planning and results" onClose={() => setSheet(false)}>
          <SLAnchoredScroll>
            <VStack alignment="leading" spacing={SL.Space.s3}>
              {Array.from({ length: 12 }, (_, i) => (
                <Text key={i} {...slBody()}>{`Row ${i + 1}`}</Text>
              ))}
            </VStack>
          </SLAnchoredScroll>
        </SLSheet>
      </Sheet>

      <Sheet isPresented={streakSheet} onDismiss={() => setStreakSheet(false)}>
        <StreakSheet streak={streak} onClose={() => setStreakSheet(false)} />
      </Sheet>
    </SLCelebration>
  );
}
