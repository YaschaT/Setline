// IntakeFlow.swift — Artboards 03–06, in order, and what they leave behind.
//
// Four questions, each skippable, each stating what it produces. Nothing here
// is asked twice and nothing is asked that the app cannot act on: the review
// kept the plate question precisely because the calculator needs it from the
// first session.
import { useState } from "react";
import { SL, slCard, slFont, slNumerals } from "../../design/tokens";
import { HStack, Text, VStack } from "../../design/swiftui";
import { PressButton } from "../../design/support";
import { SLEyebrow, slLead, slMeta } from "../../design/components/SLText";
import { SLFlow } from "../../design/components/SLFlow";
import { SLChip } from "../../design/components/SLChip";
import { rounded } from "../../core/Support/swift";
import { Experience, PlateInventory } from "../../core/Domain/Intake";
import { Program, ProgramCatalog } from "../../core/Catalog/Program";
import { PlateMath } from "../../core/Engine/PlateMath";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { WeekPlan, WeekDraft } from "../../core/Engine/WeekPlan";
import { Schedule } from "../../core/Engine/Schedule";
import { StateChange } from "../../core/Sync/StateChange";
import { useApp } from "../../data/AppState";
import { IntakeOption, IntakeStep } from "./IntakeChrome";

const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fullWeekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function spelled(count: number): string {
  return ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven"][Math.min(count, 7)];
}

export function IntakeFlow({ onFinish }: { onFinish: () => void }) {
  const app = useApp();
  const [step, setStep] = useState(1);
  const [days, setDays] = useState(4);
  /** ma · wo · vr · za, the spread the handoff opens on. */
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set([0, 2, 4, 5]));
  const [experience, setExperience] = useState<Experience>("week");
  const [program, setProgram] = useState<Program | undefined>(undefined);
  const [plates, setPlates] = useState<Set<number>>(new Set(PlateMath.defaultPlates));

  const programs = ProgramCatalog.all({ personalPlan: app.plan });
  const chosenProgram = program ?? programs[0];

  // MARK: 03 · Days

  const daysConsequence = (): string => {
    const chosen = [...weekdays].sort((a, b) => a - b).map((i) => weekdayNames[i]);
    if (chosen.length === 0) return "Pick at least one day, or skip and keep your current week.";
    const dayLine = `${spelled(chosen.length)} ${chosen.length === 1 ? "day" : "days"}: ${chosen.join(" · ")}.`;
    // 03 closes on what a session costs: the plan's own estimate, averaged
    // over its training days.
    const minutes = app.plan.map((d) => WeekPlan.minutes({ of: d }));
    if (minutes.length === 0) return dayLine;
    const average = Math.trunc(rounded(minutes.reduce((a, b) => a + b, 0) / minutes.length));
    return `${dayLine} About ${average} min per session.`;
  };

  /** Keeps the two answers honest about each other: picking a number fills the week from the plan's own shape. */
  const fitWeekdays = (count: number) => {
    // Spread first, so four days never land on four in a row.
    const preferred = [0, 2, 4, 5, 1, 3, 6];
    setWeekdays(new Set(preferred.slice(0, count)));
  };

  const countTile = (count: number) => {
    const selected = days === count;
    return (
      <PressButton
        key={count}
        onPress={() => {
          setDays(count);
          fitWeekdays(count);
        }}
        aria-label={`${count} days a week`}
        aria-pressed={selected}
        style={{
          flex: "1 1 0",
          minWidth: 0,
          minHeight: 56 + 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: SL.Radius.lg,
          background: selected ? SL.Surface.raised2 : SL.Surface.raised,
          boxShadow: `inset 0 0 0 1px ${selected ? SL.Surface.selection : SL.Surface.hairline}`,
        }}
      >
        <span style={{ ...slFont(SL.TypeSize.title, SL.Weight.semibold), ...slNumerals, color: selected ? SL.Ink.primary : SL.Ink.secondary }}>{count}</span>
      </PressButton>
    );
  };

  const weekdayTile = (index: number) => {
    const selected = weekdays.has(index);
    return (
      <PressButton
        key={index}
        onPress={() => {
          const next = new Set(weekdays);
          if (selected) next.delete(index);
          else next.add(index);
          setWeekdays(next);
          setDays(Math.max(2, next.size));
        }}
        aria-label={fullWeekdayNames[index]}
        aria-pressed={selected}
        style={{
          flex: "1 1 0",
          minWidth: 0,
          minHeight: 64 + 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          borderRadius: SL.Radius.lg,
          background: selected ? SL.Surface.raised2 : SL.Surface.raised,
          boxShadow: `inset 0 0 0 1px ${selected ? SL.Surface.hairlineStrong : SL.Surface.hairline}`,
        }}
      >
        <span style={{ ...slFont(SL.TypeSize.micro, SL.Weight.regular), color: selected ? SL.Ink.secondary : SL.Ink.tertiary, lineHeight: 1.25 }}>{weekdayNames[index]}</span>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: selected ? SL.Ink.primary : SL.Surface.hairlineStrong }} />
      </PressButton>
    );
  };

  // MARK: 06 · Plates

  /** Artboard 06: a plate you have is a selected chip, one you do not is the dashed "off" chip — the shared component, not a local copy. */
  const plateChip = (plate: number) => {
    const selected = plates.has(plate);
    return (
      <span key={plate} aria-label={`${NumberDisplay.kg(NumberDisplay.english, plate)} plate`}>
        <SLChip
          title={NumberDisplay.number(NumberDisplay.english, plate)}
          look={selected ? "selected" : "off"}
          horizontalPadding={18}
          action={() => {
            const next = new Set(plates);
            if (selected) next.delete(plate);
            else next.add(plate);
            setPlates(next);
          }}
        />
      </span>
    );
  };

  const platesHeadline = (): string => {
    const inventory = PlateInventory.make({ plates: [...plates], barKg: PlateMath.defaultBar });
    const jump = PlateInventory.smallestJump(inventory);
    if (jump === undefined) return "Without plates the calculator can't work anything out. Pick at least one.";
    return `Smallest jump · ${NumberDisplay.kg(NumberDisplay.english, jump)}`;
  };

  // MARK: Leaving

  /**
   * The chosen weekdays, written onto this week through the same per-date
   * operations the week agenda uses. Later weeks follow the plan's shape
   * until they are changed there.
   */
  const scheduleChanges = (now: Date): StateChange[] => {
    const dates = Schedule.mondayFirstWeek({ containing: now });
    let draft = WeekDraft.make({ dates, overrides: app.scheduleOverrides });
    // Sessions go on the days that were picked, in the plan's own order;
    // every other day is a rest day the account asked for.
    const planDays = app.plan.map((d) => d.id);
    let next = 0;
    dates.forEach((date, index) => {
      const key = Schedule.dateKey(date);
      if (weekdays.has(index)) {
        const day = next < planDays.length ? planDays[next++] : planDays[0];
        if (day !== undefined) draft = WeekDraft.assign(draft, day, { to: key });
      } else {
        draft = WeekDraft.assign(draft, "rest", { to: key });
      }
    });
    return WeekDraft.changes(draft, { programKey: app.programKey, now });
  };

  /** Everything the four answers changed, written as the changes they are. */
  const finish = () => {
    let changes: StateChange[] = [];
    const now = new Date();
    if (weekdays.size > 0) changes = [...changes, ...scheduleChanges(now)];
    changes.push(StateChange.make({ kind: "setExperience", value: experience }, { createdAt: now }));
    if (program !== undefined) {
      changes.push(StateChange.make({ kind: "setProgram", mode: chosenProgram.mode, sciencePlanID: chosenProgram.sciencePlanID }, { createdAt: now }));
    }
    if (plates.size > 0) {
      changes.push(StateChange.make({ kind: "setEquipment", plates: [...plates].sort((a, b) => b - a), barKg: PlateMath.defaultBar }, { createdAt: now }));
    }
    onFinish();
    void app.record(changes);
  };

  let content;
  switch (step) {
    case 1:
      content = (
        <IntakeStep
          step={1}
          total={4}
          title="How many days a week?"
          subtitle="This sets the shape of your week. You can change it later."
          consequence={daysConsequence()}
          commit="Continue"
          onSkip={finish}
          onCommit={() => setStep(2)}
        >
          <VStack alignment="leading" spacing={0} style={{ alignItems: "stretch" }}>
            <HStack spacing={SL.Space.s2}>{[2, 3, 4, 5, 6].map(countTile)}</HStack>
            <SLEyebrow text="WHICH DAYS" style={{ paddingTop: SL.Space.s8, paddingBottom: SL.Space.s3 }} />
            <HStack spacing={6}>{[0, 1, 2, 3, 4, 5, 6].map(weekdayTile)}</HStack>
          </VStack>
        </IntakeStep>
      );
      break;
    case 2:
      content = (
        <IntakeStep
          step={2}
          total={4}
          title="How long have you been lifting?"
          subtitle="Sets how fast you progress at the start, not your program."
          consequence={Experience.consequence(experience)}
          commit="Continue"
          onSkip={finish}
          onCommit={() => setStep(3)}
        >
          <VStack spacing={SL.Space.s2} style={{ alignItems: "stretch" }}>
            {Experience.allCases.map((option) => (
              <IntakeOption
                key={option}
                title={Experience.title(option)}
                detail={Experience.detail(option)}
                selected={experience === option}
                onTap={() => setExperience(option)}
              />
            ))}
          </VStack>
        </IntakeStep>
      );
      break;
    case 3:
      content = (
        <IntakeStep
          step={3}
          total={4}
          title="Which plan shape?"
          subtitle="You can change everything in Account."
          consequence={`${chosenProgram.shape}. The same shape every week.`}
          commit="Continue"
          onSkip={finish}
          onCommit={() => setStep(4)}
        >
          <VStack spacing={SL.Space.s2} style={{ alignItems: "stretch" }}>
            {programs.map((option) => (
              <IntakeOption
                key={Program.id(option)}
                title={option.name}
                detail={option.shape}
                selected={Program.id(chosenProgram) === Program.id(option)}
                onTap={() => setProgram(option)}
              />
            ))}
          </VStack>
        </IntakeStep>
      );
      break;
    default:
      content = (
        <IntakeStep
          step={4}
          total={4}
          title="Which plates do you have?"
          subtitle="The plate calculator uses these. Kilograms, based on your region — change it in Account if that's wrong."
          subtitleMeasure={32}
          consequence=""
          commit="Done"
          onSkip={finish}
          onCommit={finish}
        >
          <VStack alignment="leading" spacing={0} style={{ alignItems: "stretch" }}>
            <SLEyebrow text="PLATES IN YOUR GYM · KG" style={{ paddingBottom: SL.Space.s3 }} />
            <div style={{ padding: 8, ...slCard({ radius: SL.Radius.option }) }}>
              <SLFlow spacing={6}>{PlateInventory.offered.map(plateChip)}</SLFlow>
            </div>
            {/* 06's close: the smallest jump at 17/600, the bar under it. */}
            <VStack alignment="leading" spacing={SL.Space.s1} style={{ paddingTop: SL.Space.s5 }}>
              <Text {...slLead()} numerals color={SL.Ink.primary}>{platesHeadline()}</Text>
              <Text {...slMeta()} color={SL.Ink.tertiary}>
                Bar {NumberDisplay.kg(NumberDisplay.english, PlateMath.defaultBar)} · used by the plate calculator
              </Text>
            </VStack>
          </VStack>
        </IntakeStep>
      );
  }

  // `.animation(.easeOut(duration: SL.Motion.base), value: step)`.
  return (
    <div key={step} style={{ height: "100%", animation: `slRootFade ${SL.Motion.base}s ease-out` }}>
      {content}
    </div>
  );
}
