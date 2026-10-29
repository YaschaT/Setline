// SessionCompleteView.swift — Artboard 17R. Four kinds of record, each stated
// once, as a fact — with, since, the medals a lift earns against its own
// history, the week it fills and any badge it wins. The one addition is
// `Terug`, in the handoff's own back-link style, so a mis-tap on
// `Sessie afronden` never forces a save.
//
// Left out on the web: haptics (`sensoryFeedback`) and `#if DEBUG` arguments.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../data/AppState";
import { useSocial } from "../../data/SocialStore";
import { HStack, Pressable, ScrollView, Spacer, Text, VStack } from "../../design/swiftui";
import { SL, slListCard } from "../../design/tokens";
import { SLOutlineButton, SLPrimaryButton, colorOpacity, spring } from "../../design/SetlineTokens";
import { useReduceMotion, usePresence } from "../../design/support";
import { SFSymbol } from "../../design/SFSymbol";
import { SLSound } from "../../design/SLSound";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLBadge } from "../../design/components/SLBadge";
import { SLMedal, SLMedalRow } from "../../design/components/SLMedal";
import { Celebration, SLCelebration } from "../../design/components/SLCelebration";
import { SLEyebrow, SLHairline, slBody, slDisplay, slLead, slMeta, slTitle } from "../../design/components/SLText";
import type { TrainingSession } from "../../core/Domain/Model";
import { CustomWorkout, CustomWorkout_Item } from "../../core/Domain/CustomWorkout";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { WeekPlan } from "../../core/Engine/WeekPlan";
import { type LiftMedal, LiftMedal as LiftMedalNS, LiftMedal_Place, Medals } from "../../core/Progress/Medals";
import { type Milestone, Milestone as MilestoneNS, Milestones } from "../../core/Progress/Milestones";
import { startOfMondayWeek } from "../../core/Support/calendar";
import { rounded } from "../../core/Support/swift";
import { TallyMascot } from "../Training/TallyMascot";
import { DurationRow } from "./DurationRow";
import { type SessionRunner, useSessionRunner } from "./SessionRunner";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `Calendar.isDate(_:equalTo:toGranularity: .weekOfYear)` — the app's Monday weeks. */
function isSameWeek(a: Date, b: Date): boolean {
  return startOfMondayWeek(a).getTime() === startOfMondayWeek(b).getTime();
}

export function SessionCompleteView(p: {
  runner: SessionRunner;
  previous: TrainingSession | undefined;
  /**
   * Back to the session without saving — a mis-tap on `Sessie afronden`,
   * or one set to fix, must not force a save.
   */
  onBack: () => void;
  /** Saves the workout; `true` then opens the post composer. Saving never posts on its own. */
  onSave: (createPost: boolean) => void;
}) {
  const app = useApp();
  const runner = useSessionRunner(p.runner);
  const social = useSocial();
  const reduceMotion = useReduceMotion();
  const [celebration, setCelebration] = useState<Celebration | undefined>(undefined);
  /**
   * The week this workout secured, as a full-screen moment; the streak it
   * makes. `nil` once it has played or when the week isn't secured.
   */
  const [securedWeeks, setSecuredWeeks] = useState<number | undefined>(undefined);
  const securedRef = useRef<number | undefined>(undefined);
  securedRef.current = securedWeeks;
  /** This workout was kept as one of the lifter's own. */
  const [savedAsOwn, setSavedAsOwn] = useState(false);
  /** This workout's bar has gone in; until then Tally shows the week before it. */
  const [tallyFilled, setTallyFilled] = useState(false);
  const [tallyJumps, setTallyJumps] = useState(0);

  /** Milestones this workout reaches, worked out before it is saved. */
  const newMilestones = (): Milestone[] => {
    const pending = runner.finishedSession({ existing: undefined });
    const best = app.streakAdding({ adding: runner.startedAt, day: runner.day }).best;
    const before = new Set(
      Milestones.make({ sessions: app.sessions, bestStreak: app.streak.best })
        .filter(MilestoneNS.isReached)
        .map((m) => m.id),
    );
    return Milestones.make({ sessions: [...app.sessions, pending], bestStreak: best }).filter(
      (m) => MilestoneNS.isReached(m) && !before.has(m.id),
    );
  };

  /** Gold, silver and bronze this workout earns, judged before it is saved. */
  const medals = (): LiftMedal[] => {
    const pending = runner.finishedSession({ existing: undefined });
    return Medals.medals({ for: pending, in: [...app.sessions, pending] });
  };

  /**
   * The clock's minutes, rounded to five; a workout written down
   * afterwards starts from what the plan says it takes.
   */
  const clockMinutes = (): number => {
    if (runner.isLoggedAfterwards) return Math.max(5, WeekPlan.minutes({ of: runner.day }));
    return Math.max(5, rounded(runner.elapsedSeconds / 300) * 5);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Written down afterwards: the planned length is saved unless
      // changed, never the minutes it took to type.
      if (runner.isLoggedAfterwards && runner.durationMinutes === undefined) {
        runner.durationMinutes = clockMinutes();
      }
      // The workout done, heard as the screen arrives. A secured week
      // gets the whole screen first — it's the reason to come back —
      // then the badge or medal it may also have won, as a card.
      SLSound.play("success");
      const streak = app.streakAdding({ adding: runner.startedAt, day: runner.day });
      const securesWeek = isSameWeek(runner.startedAt, new Date()) && streak.thisWeekDone === streak.thisWeekGoal;
      if (securesWeek) {
        await sleep(500);
        if (cancelled) return;
        securedRef.current = Math.max(streak.weeks, 1);
        setSecuredWeeks(securedRef.current);
        // Wait for it to be dismissed (tap or its own timer).
        while (securedRef.current !== undefined && !cancelled) await sleep(150);
        await sleep(300);
      } else {
        await sleep(900);
      }
      if (cancelled) return;
      const milestone = newMilestones()[0];
      const gold = medals().find((m) => m.place === LiftMedal_Place.gold);
      if (milestone) {
        setCelebration(Celebration.make({ symbol: "rosette", title: "Badge earned", detail: milestone.title, badge: milestone }));
      } else if (gold) {
        setCelebration(
          Celebration.make({ symbol: "medal.fill", title: "Best ever", detail: `${gold.name} · ${NumberDisplay.kg(app.display, gold.weightKg)} × ${gold.reps}` }),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * "Save as my workout": this session's exercises and set counts, kept to
   * start again from "Choose a different workout". Not offered for a
   * workout that already is one.
   */
  const saveAsOwnRow = () => {
    if (CustomWorkout.isCustom({ dayID: runner.day.id })) return null;
    return (
      <Pressable
        onPress={() => {
          if (savedAsOwn) return;
          const items = runner.slots
            .filter((s) => setCount(s.model) > 0)
            .map((s) => CustomWorkout_Item.make({ exerciseID: s.model.active.exerciseID, sets: setCount(s.model) }));
          if (items.length === 0) return;
          const name = app.customWorkouts.some((w) => w.name === runner.day.short) ? `${runner.day.short} (copy)` : runner.day.short;
          void app.saveCustomWorkout(CustomWorkout.make({ name, items }));
          setSavedAsOwn(true);
        }}
        style={{ alignSelf: "stretch", minHeight: SL.Space.hitMin, marginTop: SL.Space.s4, background: "transparent", display: "flex", alignItems: "center", gap: SL.Space.s2, color: savedAsOwn ? SL.Signal.action : SL.Ink.secondary }}
      >
        <SFSymbol name={savedAsOwn ? "checkmark" : "square.stack.3d.up"} size={14} weight={600} />
        <Text {...slBody(SL.Weight.medium)} color={savedAsOwn ? SL.Signal.action : SL.Ink.secondary}>
          {savedAsOwn ? "Saved to your workouts" : "Save as my workout"}
        </Text>
        <Spacer />
      </Pressable>
    );
  };

  /** The medals, gold first: how many, then one row a lift. */
  const medalBlock = (list: LiftMedal[]) => (
    <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch", paddingTop: SL.Space.s5 }}>
      <HStack alignment="firstTextBaseline" style={{ alignSelf: "stretch" }}>
        <SLEyebrow text={list.length === 1 ? "1 medal" : `${list.length} medals`} />
        <Spacer />
        <HStack spacing={-8} aria-hidden>
          {list.slice(0, 5).map((medal, i) => (
            <SLMedal key={i} place={medal.place} size={22} />
          ))}
        </HStack>
      </HStack>
      <VStack spacing={0} style={{ ...slListCard(), alignSelf: "stretch", paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4 }}>
        {list.map((medal, index) => (
          <div key={LiftMedalNS.id(medal)} style={{ position: "relative", alignSelf: "stretch", paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3 }}>
            <SLMedalRow medal={medal} display={app.display} />
            {index > 0 && <SLHairline style={{ position: "absolute", top: 0, left: 0, right: 0 }} />}
          </div>
        ))}
      </VStack>
    </VStack>
  );

  useEffect(() => {
    if (tallyFilled) return;
    const t = window.setTimeout(() => {
      setTallyFilled(true);
      if (!reduceMotion) setTallyJumps((j) => j + 1);
    }, reduceMotion ? 0 : 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Where this workout leaves the week, said by Tally: the bar this
   * workout adds fills in as the screen opens, Tally jumps, and says
   * what it means — or strikes the week through.
   */
  const streakBlock = () => {
    const streak = app.streakAdding({ adding: runner.startedAt, day: runner.day });
    const completes = streak.thisWeekDone >= streak.thisWeekGoal;
    const left = Math.max(streak.thisWeekGoal - streak.thisWeekDone, 0);
    const line = completes
      ? streak.weeks === 1
        ? "Week struck. Your streak has started."
        : `Week struck. That's ${streak.weeks} in a row.`
      : left === 1
        ? "Bar added. One more strikes the week."
        : `Bar added. ${left} to go this week.`;
    return (
      <HStack
        alignment="center"
        spacing={SL.Space.s4}
        aria-label={`${Math.min(streak.thisWeekDone, streak.thisWeekGoal)} of ${streak.thisWeekGoal} workouts this week. ${line}`}
        style={{ ...slListCard(), alignSelf: "stretch", padding: SL.Space.s4, marginTop: SL.Space.s5 }}
      >
        <TallyMascot
          done={tallyFilled ? streak.thisWeekDone : Math.max(streak.thisWeekDone - 1, 0)}
          goal={streak.thisWeekGoal}
          mood={tallyFilled && completes ? "struck" : "proud"}
          unit={15}
          jumps={tallyJumps}
        />
        <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", justifyContent: "flex-start" }}>
          <Text
            {...slBody(SL.Weight.semibold)}
            color={SL.Ink.primary}
            style={{
              paddingLeft: SL.Space.s3,
              paddingRight: SL.Space.s3,
              paddingTop: SL.Space.s2,
              paddingBottom: SL.Space.s2,
              background: SL.Surface.raised2,
              borderRadius: "4px 14px 14px 14px",
              opacity: tallyFilled ? 1 : 0,
              transform: `translateX(${tallyFilled ? 0 : -8}px)`,
              transition: reduceMotion ? undefined : `opacity ${spring(0.45, 0.7)}, transform ${spring(0.45, 0.7)}`,
            }}
          >
            {line}
          </Text>
        </div>
      </HStack>
    );
  };

  const volumeBlock = () => {
    const summary = runner.volumeSummary({ previous: p.previous });
    return (
      <div style={{ position: "relative", alignSelf: "stretch", paddingTop: SL.Space.s2, paddingBottom: SL.Space.s5 }}>
        <VStack alignment="leading" spacing={0}>
          <SLEyebrow text="Volume" />
          {/* A number never breaks across lines. */}
          <HStack alignment="firstTextBaseline" spacing={SL.Space.s3} style={{ paddingTop: 6, maxWidth: "100%" }}>
            <Text {...slDisplay(SL.TypeSize.displayXL)} numerals lineHeight={1.04} lineLimit={1} minimumScaleFactor={0.5} color={SL.Ink.primary}>
              {NumberDisplay.volumeKg(app.display, summary.volume)}
            </Text>
            {summary.delta !== undefined && summary.delta > 0 && (
              <Text {...slLead()} numerals color={SL.Ink.primary}>{NumberDisplay.signedDelta(app.display, summary.delta)}</Text>
            )}
          </HStack>
        </VStack>
        <SLHairline style={{ position: "absolute", bottom: 0, left: 0, right: 0 }} />
      </div>
    );
  };

  /**
   * Plain blocks separated by hairlines — no cards. The highest-ranked
   * record takes the screen's one lime; the rest stay tertiary, and a
   * reference still being built never takes it.
   */
  const records = () => {
    const entries = runner.records();
    return (
      <VStack alignment="leading" spacing={SL.Space.s4} style={{ alignSelf: "stretch", paddingTop: SL.Space.s5 }}>
        {entries.flatMap((entry, index) => {
          const block = (
            <VStack key={`r${index}`} alignment="leading" spacing={0}>
              <SLEyebrow text={entry.name} color={index === 0 && !entry.record.buildsReference ? SL.Signal.action : SL.Ink.tertiary} />
              <Text {...slTitle()} numerals color={SL.Ink.primary} style={{ paddingTop: 4 }}>{entry.record.headline}</Text>
              <Text {...slMeta()} color={SL.Ink.tertiary} style={{ paddingTop: 2 }}>{entry.record.detail}</Text>
            </VStack>
          );
          return index < entries.length - 1 ? [block, <SLHairline key={`h${index}`} style={{ alignSelf: "stretch" }} />] : [block];
        })}
      </VStack>
    );
  };

  const medalList = medals();
  const milestones = newMilestones();
  const minutes = runner.durationMinutes ?? clockMinutes();

  return (
    <SLCelebration item={{ value: celebration, set: setCelebration }} style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, background: SL.Surface.ground, paddingTop: "env(safe-area-inset-top)" }}>
        <ScrollView style={{ flex: "1 1 0" }}>
          <VStack
            alignment="leading"
            spacing={0}
            style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s12 }}
          >
            <Pressable onPress={p.onBack} aria-label="Back to session" style={{ background: "transparent", minHeight: SL.Space.hitMin, display: "flex", alignItems: "center" }}>
              <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>Back</Text>
            </Pressable>

            <SLEyebrow text={`Done · ${runner.completedSetCount}/${runner.plannedSetCount} sets`} style={{ paddingTop: SL.Space.s5 }} />

            {/* The date is the session's own, and a workout written down afterwards claims no duration. */}
            <Text {...slTitle()} color={SL.Ink.primary} style={{ paddingTop: SL.Space.s2 }}>
              {`${runner.day.short} · ${NumberDisplay.shortDate(app.display, runner.startedAt)}`}
            </Text>

            {/* The clock knows a live workout's length; one written down afterwards — or typed in at the end — it doesn't, so the minutes are the lifter's to set. */}
            <div style={{ alignSelf: "stretch", paddingTop: SL.Space.s4, paddingBottom: SL.Space.s3 }}>
              <DurationRow
                minutes={{ value: minutes, set: (v) => (runner.durationMinutes = v) }}
                note={
                  runner.isLoggedAfterwards ? "Planned length — set what it took" : runner.durationMinutes !== undefined ? "Set by you" : "From the session clock"
                }
              />
            </div>

            {volumeBlock()}

            {saveAsOwnRow()}

            {medalList.length > 0 && medalBlock(medalList)}

            {/* A workout written down for an earlier week does not move this week's dots, so it shows none. */}
            {isSameWeek(runner.startedAt, new Date()) && streakBlock()}

            {milestones.map((milestone) => (
              <HStack key={milestone.id} spacing={SL.Space.s3} style={{ ...slListCard(), alignSelf: "stretch", padding: SL.Space.s4, marginTop: SL.Space.s3 }}>
                <SLBadge milestone={milestone} size={44} />
                <VStack alignment="leading" spacing={2}>
                  <Text {...slMeta()} color={SL.Signal.action}>Badge earned</Text>
                  <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>{milestone.title}</Text>
                </VStack>
                <Spacer />
              </HStack>
            ))}

            {records()}
          </VStack>
        </ScrollView>

        <VStack
          spacing={SL.Space.s2}
          style={{
            alignSelf: "stretch",
            paddingLeft: SL.Space.gutterSession,
            paddingRight: SL.Space.gutterSession,
            paddingTop: SL.Space.s3,
            paddingBottom: `calc(${SL.Space.s3}px + env(safe-area-inset-bottom))`,
            // Opaque, like the session's own bottom bar: records scroll underneath it.
            background: SL.Surface.ground,
            flexShrink: 0,
          }}
        >
          {/* Only once there is a profile to post from (made in Friends). */}
          {social.me != null && (
            <SLOutlineButton onPress={() => p.onSave(true)}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: SL.Space.s2 }}>
                <SLGlyph name="people" size={18} />
                Create post
              </span>
            </SLOutlineButton>
          )}
          <SLPrimaryButton onPress={() => p.onSave(false)}>Save session</SLPrimaryButton>
        </VStack>

        {/* Over everything, the actions included: for these seconds the week is the only thing on screen. */}
        <WeekSecuredOverlay
          weeks={securedWeeks}
          onDone={() => {
            securedRef.current = undefined;
            setSecuredWeeks(undefined);
          }}
        />
      </div>
    </SLCelebration>
  );
}

function setCount(model: import("../../core/Domain/SessionSlot").SessionSlot): number {
  return model.preserved.reduce((t, r) => t + r.sets.length, 0) + model.active.sets.length;
}

/** `.overlay { if let weeks … .transition(.opacity) }`. */
function WeekSecuredOverlay({ weeks, onDone }: { weeks: number | undefined; onDone: () => void }) {
  const { mounted, shown } = usePresence(weeks !== undefined, 260);
  const [last, setLast] = useState(weeks);
  if (weeks !== undefined && weeks !== last) setLast(weeks);
  if (!mounted || last === undefined) return null;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 5, opacity: shown ? 1 : 0, transition: "opacity 0.25s ease-out" }}>
      <WeekSecuredMoment weeks={last} onDone={onDone} />
    </div>
  );
}

/**
 * The week secured, given the whole screen for a moment: Tally strikes its
 * bars through into the full mark, the streak counts up to its new number,
 * and the phone answers. It leaves by itself after a few seconds, or on a
 * tap. With Reduce Motion it simply appears, already struck.
 */
function WeekSecuredMoment({ weeks, onDone }: { weeks: number; onDone: () => void }) {
  const reduceMotion = useReduceMotion();
  const [struck, setStruck] = useState(false);
  const [shown, setShown] = useState(0);
  const [jumps, setJumps] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (reduceMotion) {
        setStruck(true);
        setShown(weeks);
        await sleep(3000);
        if (!cancelled) done.current();
        return;
      }
      setShown(Math.max(weeks - 1, 0));
      await sleep(350);
      if (cancelled) return;
      setStruck(true);
      setJumps((j) => j + 1);
      await sleep(250);
      if (cancelled) return;
      setShown(weeks);
      await sleep(2600);
      if (!cancelled) done.current();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = weeks === 1 ? "Week secured. Your streak has started." : `Week secured. ${weeks}-week streak.`;
  return (
    <div
      role="button"
      aria-label={label}
      onClick={onDone}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `radial-gradient(circle at center, ${colorOpacity(SL.Signal.action, 0.22)} 0px, transparent 320px), ${colorOpacity(SL.Surface.ground, 0.94)}`,
        cursor: "pointer",
      }}
    >
      <VStack spacing={SL.Space.s5} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession }}>
        <TallyMascot done={3} goal={3} mood={struck ? "struck" : "proud"} unit={30} jumps={jumps} />
        <VStack spacing={SL.Space.s1}>
          <Text size={96} weight={SL.Weight.bold} numerals color={SL.Signal.action} lineHeight={1.1}>{`${shown}`}</Text>
          <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary} align="center">
            {weeks === 1 ? "Week secured. Your streak has started." : `Week secured. ${weeks} weeks in a row.`}
          </Text>
        </VStack>
        <Text {...slMeta()} color={SL.Ink.secondary} style={{ paddingTop: SL.Space.s4 }}>Tap to continue</Text>
      </VStack>
    </div>
  );
}

