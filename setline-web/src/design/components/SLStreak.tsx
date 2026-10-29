// SLStreak.swift — the streak chip on Training, this week as dots, the
// streak sheet, the milestone collection and one badge large.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { SL, slListCard } from "../tokens";
import { HStack, Sheet, Spacer, Text, VStack } from "../swiftui";
import { spring } from "../SetlineTokens";
import { slFixed } from "../SLDynamicType";
import { PressButton, Presentation, useReduceMotion } from "../support";
import { slBody, slHitTarget, slLead, slMeta } from "./SLText";
import { SLGlyph } from "./SLGlyph";
import { SLBadge } from "./SLBadge";
import { SLBar, SLSectionHead } from "./SLPieces";
import { useApp } from "../../data/AppState";
// `app.habitMilestones(photoDates:)` — an AppState extension in GoalViews.swift.
import { habitMilestones } from "../../features/Progress/GoalViews";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { Schedule } from "../../core/Engine/Schedule";
import { TrainingStreak } from "../../core/Progress/TrainingStreak";
import { Milestone, Milestone_Kind, Milestones, type Milestone_Family } from "../../core/Progress/Milestones";

const streakTitle = (weeks: number) => (weeks === 0 ? "No streak yet" : weeks === 1 ? "1-week streak" : `${weeks}-week streak`);

/** The streak chip on Training: a flame and the weeks in a row. Lime once there is a streak, grey while there is none. */
export function SLStreakChip({ streak, action }: { streak: TrainingStreak; action: () => void }) {
  const lit = streak.weeks > 0;
  return (
    <PressButton
      onPress={action}
      aria-label={`${streakTitle(streak.weeks)}. Shows this week's progress`}
      style={{
        flexShrink: 0,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        color: lit ? SL.Signal.action : SL.Ink.secondary,
        paddingLeft: SL.Space.s3,
        paddingRight: SL.Space.s3,
        minHeight: SL.Space.hitMin,
        borderRadius: SL.Radius.pill,
        background: SL.Surface.raised,
        boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${SL.Surface.hairline}`,
      }}
    >
      <SLGlyph name={lit ? "IconFlameFill" : "IconFlame"} size={17} fixed />
      <Text color={lit ? SL.Signal.action : SL.Ink.secondary} numerals style={slFixed(SL.TypeSize.body, SL.Weight.semibold)}>
        {`${streak.weeks}`}
      </Text>
    </PressButton>
  );
}

/** This week as dots: one per workout the plan asks for, filled as they are logged. */
export function SLWeekDots({ done, goal, size = 12 }: { done: number; goal: number; size?: number }) {
  return (
    <HStack spacing={6} role="img" aria-label={`${Math.min(done, goal)} of ${goal} workouts this week`}>
      {Array.from({ length: Math.max(goal, 1) }, (_, index) => (
        <div
          key={index}
          style={{
            width: size,
            height: size,
            flexShrink: 0,
            borderRadius: "50%",
            background: index < done ? SL.Signal.action : SL.Surface.raised2,
            boxShadow: `inset 0 0 0 1px ${index < done ? "transparent" : SL.Surface.hairlineStrong}`,
          }}
        />
      ))}
    </HStack>
  );
}

/** `.slBorderBox().slListCard()`. */
const listCard: CSSProperties = { ...slListCard() };

/** What the streak is and where this week stands, from the chip. */
export function StreakSheet({ streak, onClose }: { streak: TrainingStreak; onClose: () => void }) {
  const app = useApp();
  const [showsMilestones, setShowsMilestones] = useState(false);
  const milestones = Milestones.make({ sessions: app.sessions, bestStreak: streak.best });
  const reached = milestones.filter(Milestone.isReached);
  const recent = [...reached].sort((a, b) => (b.reachedOn?.getTime() ?? -Infinity) - (a.reachedOn?.getTime() ?? -Infinity)).slice(0, 3);

  const left = Math.max(streak.thisWeekGoal - streak.thisWeekDone, 0);
  const headline = TrainingStreak.thisWeekMet(streak)
    ? "This week is done. Keep it going next week."
    : streak.weeks === 0
      ? left === 1
        ? "One more workout this week starts your streak."
        : `${left} more workouts this week start your streak.`
      : left === 1
        ? "One more workout this week keeps it alive."
        : `${left} more workouts this week keep it alive.`;

  const stat = (value: string, label: string) => (
    <VStack spacing={2} style={{ ...listCard, flex: "1 1 0", minWidth: 0, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3 }}>
      <Text {...slLead(SL.Weight.semibold)} numerals color={SL.Ink.primary}>
        {value}
      </Text>
      <Text {...slMeta()} color={SL.Ink.secondary}>
        {label}
      </Text>
    </VStack>
  );

  return (
    <VStack
      spacing={SL.Space.s5}
      style={{
        flex: "1 1 0",
        minHeight: 0,
        alignSelf: "stretch",
        paddingLeft: SL.Space.gutterSession,
        paddingRight: SL.Space.gutterSession,
        paddingTop: SL.Space.s3,
        background: SL.Surface.ground,
        overflowY: "auto",
      }}
    >
      <HStack style={{ alignSelf: "stretch" }}>
        <Spacer />
        <PressButton onPress={onClose}>
          <Text size={SL.TypeSize.body} weight={SL.Weight.medium} color={SL.Ink.secondary} style={{ display: "inline-block", ...slHitTarget() }}>
            Done
          </Text>
        </PressButton>
      </HStack>

      <SLGlyph name={streak.weeks > 0 ? "IconFlameFill" : "IconFlame"} size={60} fixed color={streak.weeks > 0 ? SL.Signal.action : SL.Ink.tertiary} />

      <VStack spacing={SL.Space.s1}>
        <Text size={SL.TypeSize.display} weight={SL.Weight.semibold} color={SL.Ink.primary} align="center">
          {streakTitle(streak.weeks)}
        </Text>
        <Text {...slBody()} color={SL.Ink.secondary} align="center">
          {headline}
        </Text>
      </VStack>

      <VStack spacing={SL.Space.s3} style={{ ...listCard, alignSelf: "stretch", padding: SL.Space.s4 }}>
        <SLWeekDots done={streak.thisWeekDone} goal={streak.thisWeekGoal} size={18} />
        <Text {...slMeta()} color={SL.Ink.secondary}>
          {`${Math.min(streak.thisWeekDone, streak.thisWeekGoal)} of ${streak.thisWeekGoal} workouts this week`}
        </Text>
      </VStack>

      <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
        {stat(streak.best === 1 ? "1 week" : `${streak.best} weeks`, "best streak")}
        {stat(streak.freezeAvailable ? "Ready" : "Used", "streak freeze")}
      </HStack>

      <PressButton onPress={() => setShowsMilestones(true)} style={{ alignSelf: "stretch", display: "flex" }}>
        <HStack
          spacing={SL.Space.s2}
          style={{ ...listCard, flex: "1 1 0", minWidth: 0, paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 52 + 2 * SL.Metric.border }}
        >
          <HStack spacing={-10}>
            {recent.map((badge) => (
              <SLBadge key={badge.id} milestone={badge} size={30} />
            ))}
          </HStack>
          <Text size={SL.TypeSize.body} weight={SL.Weight.medium} color={SL.Ink.primary}>
            Milestones
          </Text>
          <Text size={SL.TypeSize.body} weight={SL.Weight.medium} color={SL.Ink.secondary}>
            {`${reached.length} of ${milestones.length}`}
          </Text>
          <Spacer />
          <SLGlyph name="IconChevronRight" size={14} color={SL.Ink.tertiary} />
        </HStack>
      </PressButton>

      <Text {...slMeta()} color={SL.Ink.tertiary} align="center">
        {streak.freezeUsedLastWeek
          ? "Last week was missed; the streak freeze covered it. It's back after four good weeks."
          : "A week counts when you train as often as your plan asks, on any days. One missed week in four is forgiven."}
      </Text>

      <Spacer />

      <Sheet isPresented={showsMilestones} onDismiss={() => setShowsMilestones(false)}>
        <MilestonesView milestones={milestones} onClose={() => setShowsMilestones(false)} />
      </Sheet>
    </VStack>
  );
}

const kinds = (family: Milestone_Family): Milestone_Kind[] => {
  switch (family) {
    case "training":
      return ["sessions", "streak", "heaviest", "volume"];
    case "food":
      return ["logging", "protein", "fullDay"];
    case "progress":
      return ["onTrack", "weighIns", "photos"];
  }
};

const familyTitle = (family: Milestone_Family): string => {
  switch (family) {
    case "training":
      return "Training";
    case "food":
      return "Food";
    case "progress":
      return "Progress";
  }
};

const kindTitle = (kind: Milestone_Kind): string => {
  switch (kind) {
    case "sessions":
      return "Sessions";
    case "streak":
      return "Streaks";
    case "heaviest":
      return "Heaviest set";
    case "volume":
      return "Total lifted";
    case "logging":
      return "Days logged";
    case "protein":
      return "Protein streak";
    case "fullDay":
      return "Full days";
    case "onTrack":
      return "On track with your goal";
    case "weighIns":
      return "Weigh-in habit";
    case "photos":
      return "Check-in photos";
  }
};


/** The collection: every badge of each kind, earned ones in their metal and the rest locked with their progress. */
export function MilestonesView({ milestones, onClose }: { milestones: Milestone[]; onClose: () => void }) {
  const app = useApp();
  const [opened, setOpened] = useState<Milestone | undefined>(undefined);
  const [family, setFamily] = useState<Milestone_Family>("training");
  const [photoDates, setPhotoDates] = useState<Date[]>([]);

  useEffect(() => {
    let cancelled = false;
    const photos = app.photos;
    if (photos) {
      void photos.load().then((list) => {
        if (cancelled) return;
        setPhotoDates(list.map((p) => Schedule.date({ fromKey: p.date })).filter((d): d is Date => d !== undefined));
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const all = [...milestones, ...habitMilestones(app, { photoDates })];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, background: SL.Surface.ground }}>
      {/* NavigationStack · .navigationTitle("Milestones") inline · Done */}
      <div style={{ position: "relative", flexShrink: 0, height: 56, display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: 16, paddingRight: 16 }}>
        <Text as="h2" size={17} weight={600} color={SL.Ink.primary}>
          Milestones
        </Text>
        <PressButton
          onPress={onClose}
          style={{ position: "absolute", right: 16, top: 0, bottom: 0, display: "flex", alignItems: "center", color: SL.Signal.action, fontSize: 17, fontWeight: 600, fontFamily: "Archivo, system-ui, sans-serif" }}
        >
          Done
        </PressButton>
      </div>
      <div className="sl-scroll" style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto" }}>
        <VStack alignment="leading" spacing={SL.Space.s8} style={{ padding: `${SL.Space.s5}px ${SL.Space.gutterSession}px` }}>
          <SegmentedPicker
            label="Badges"
            selection={family}
            onChange={setFamily}
            options={(["training", "food", "progress"] as Milestone_Family[]).map((f) => {
              const items = all.filter((m) => Milestone_Kind.family(m.kind) === f);
              return { value: f, title: `${familyTitle(f)} ${items.filter(Milestone.isReached).length}` };
            })}
          />
          {kinds(family).map((kind) => {
            const items = all.filter((m) => m.kind === kind);
            return (
              <VStack key={kind} alignment="leading" spacing={SL.Space.s4} style={{ alignSelf: "stretch" }}>
                <SLSectionHead title={kindTitle(kind)} meta={`${items.filter(Milestone.isReached).length} of ${items.length}`} />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                    columnGap: SL.Space.s4,
                    rowGap: SL.Space.s5,
                    alignItems: "start",
                    alignSelf: "stretch",
                  }}
                >
                  {items.map((item) => (
                    <PressButton key={item.id} onPress={() => setOpened(item)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: SL.Space.s2 }}>
                      <SLBadge milestone={item} size={80} />
                      <Text {...slMeta(Milestone.isReached(item) ? SL.Weight.semibold : SL.Weight.regular)} color={Milestone.isReached(item) ? SL.Ink.primary : SL.Ink.secondary} align="center" lineLimit={2}>
                        {item.title}
                      </Text>
                      <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} numerals color={Milestone.isReached(item) ? SL.Signal.action : SL.Ink.tertiary}>
                        {item.reachedOn !== undefined ? NumberDisplay.shortDate(app.display, item.reachedOn) : `${Math.trunc(Milestone.fraction(item) * 100)}%`}
                      </Text>
                    </PressButton>
                  ))}
                </div>
              </VStack>
            );
          })}
        </VStack>
      </div>
      <Sheet isPresented={opened !== undefined} onDismiss={() => setOpened(undefined)}>
        {opened && (
          <>
            <Presentation detents={["medium"]} />
            <BadgeDetail milestone={opened} />
          </>
        )}
      </Sheet>
    </div>
  );
}

/** `Picker(…).pickerStyle(.segmented)`. */
function SegmentedPicker<T extends string>({ label, selection, onChange, options }: { label: string; selection: T; onChange: (v: T) => void; options: { value: T; title: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", alignSelf: "stretch", padding: 2, borderRadius: SL.Radius.pill, background: "rgba(118, 118, 128, 0.24)" }}>
      {options.map((o) => {
        const on = o.value === selection;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            className="sl-pressable sl-segment"
            onClick={() => onChange(o.value)}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              height: 28,
              borderRadius: SL.Radius.pill,
              background: on ? "rgba(99, 99, 102, 1)" : "transparent",
              color: SL.Ink.primary,
              fontFamily: "Archivo, system-ui, sans-serif",
              fontSize: 13,
              fontWeight: on ? 600 : 500,
              whiteSpace: "nowrap",
              transition: "background-color 0.2s ease-out",
            }}
          >
            {o.title}
          </button>
        );
      })}
    </div>
  );
}

/** One badge, large: what it is, when it was earned or how far there is to go. The badge turns in like a coin. */
export function BadgeDetail({ milestone }: { milestone: Milestone }) {
  const app = useApp();
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  const turned = shown || reduceMotion;
  const body: ReactNode =
    milestone.reachedOn !== undefined ? (
      <Text {...slBody(SL.Weight.medium)} color={SL.Signal.action}>
        {`Earned ${NumberDisplay.shortDate(app.display, milestone.reachedOn)}`}
      </Text>
    ) : (
      <VStack spacing={SL.Space.s2}>
        <SLBar fraction={Milestone.fraction(milestone)} height={6} fill={SL.Signal.action} style={{ width: 180, flex: "0 0 auto", alignSelf: "center" }} />
        <Text {...slMeta()} color={SL.Ink.secondary}>
          {`${Math.trunc(Milestone.fraction(milestone) * 100)}% of the way`}
        </Text>
      </VStack>
    );
  return (
    <VStack spacing={SL.Space.s4} style={{ flex: "1 1 0", minHeight: 0, alignSelf: "stretch", background: SL.Surface.ground }}>
      <div
        style={{
          marginTop: SL.Space.s8,
          transform: turned ? "perspective(400px) rotateY(0deg) scale(1)" : "perspective(400px) rotateY(-110deg) scale(0.7)",
          transition: reduceMotion ? "none" : `transform ${spring(0.7, 0.55)} 0.12s`,
        }}
      >
        <SLBadge milestone={milestone} size={150} />
      </div>
      <Text size={SL.TypeSize.title} weight={SL.Weight.semibold} color={SL.Ink.primary} align="center">
        {milestone.title}
      </Text>
      {body}
      <Text {...slBody()} color={SL.Ink.secondary} align="center" style={{ paddingLeft: SL.Space.s8, paddingRight: SL.Space.s8 }}>
        {milestone.howTo}
      </Text>
      <Spacer />
    </VStack>
  );
}
