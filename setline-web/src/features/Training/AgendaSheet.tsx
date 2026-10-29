// AgendaSheet.swift — Redesign 1a · "Agenda · Planning and results".
//
// One week at a time: how much of it is done, its seven days, and the
// sessions of the week before with the best set of each. The week can be
// stepped and a whole month opened to jump to a date.
//
// It reads dates. A row opens what its day holds — the results of a session
// that was saved, the exercises of one that is planned, the choice of what a
// rest day should become — and nothing is written until that choice is made
// in "Change this day".
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SL } from "../../design/tokens";
import { FullScreenCover, HStack, Sheet, Text, VStack } from "../../design/swiftui";
import { SLOutlineButton, colorOpacity } from "../../design/SetlineTokens";
import { slLineHeight } from "../../design/SLDynamicType";
import { SLGlyph, type SLGlyph_NameCase } from "../../design/components/SLGlyph";
import { SLHairline, slBody, slLead, slMeta } from "../../design/components/SLText";
import {
  SLAdaptiveRow, SLDateColumn, SLDoneMark, SLRowButton, SLSectionHead, SLTodayBadge, slUnbroken,
} from "../../design/components/SLPieces";
import { SLSheet } from "../../design/components/SLSheet";
import { useApp } from "../../data/AppState";
import { addDays, addMonths, addWeeks, formatEnUS, startOfDay } from "../../core/Support/calendar";
import { Agenda, AgendaDay } from "../../core/Engine/Agenda";
import { DayPlan } from "../../core/Engine/DayPlan";
import { Schedule } from "../../core/Engine/Schedule";
import { WeekPlan } from "../../core/Engine/WeekPlan";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { ProgressOverview, Agenda_weekLabel } from "../../core/Progress/ProgressOverview";
import type { TrainingSession, WorkoutDay } from "../../core/Domain/Model";
import { DayPlanSheet } from "./DayPlanSheet";
import { StripDay } from "./WeekStrip";
import { SessionDetailView } from "../Progress/SessionDetailView";

const listCard = {
  alignSelf: "stretch",
  alignItems: "stretch",
  background: SL.Surface.raised2,
  border: `${SL.Metric.border}px solid ${SL.Surface.hairline}`,
  borderRadius: SL.Radius.lg,
  overflow: "hidden",
} as const;

function TopHairline({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, pointerEvents: "none" }}>
      <SLHairline />
    </div>
  );
}

export function AgendaSheet({
  initialDate,
  selectedKey,
  onSelect,
  onPreview,
  onClose,
}: {
  initialDate: Date;
  /** The date whose day is selected on Training. */
  selectedKey: string;
  /** Puts Training on a date picked from the month. */
  onSelect: (day: AgendaDay) => void;
  /** Opens a planned day's exercises, which takes the agenda's place. */
  onPreview: (day: AgendaDay) => void;
  onClose: () => void;
}) {
  const app = useApp();
  /** A date inside the week, or the month, being shown. */
  const [anchor, setAnchor] = useState<Date>(initialDate);
  const [showsMonth, setShowsMonth] = useState(false);
  const [openedSession, setOpenedSession] = useState<string | undefined>(undefined);
  const [planning, setPlanning] = useState<Date | undefined>(undefined);
  /** Holding a row opens "Change this day"; the tap that ends the hold must not open the row as well. */
  const heldRow = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastPlanning = useRef<Date | undefined>(undefined);
  if (planning !== undefined) lastPlanning.current = planning;
  const lastSession = useRef<string | undefined>(undefined);
  if (openedSession !== undefined) lastSession.current = openedSession;

  useEffect(() => {
    if (planning === undefined) heldRow.current = false;
  }, [planning]);

  // MARK: - What is shown

  const days = (containing: Date): AgendaDay[] =>
    Agenda.week({
      containing,
      plan: app.schedulePlan,
      overrides: app.scheduleOverrides,
      sessions: app.sessions,
      deload: app.activeDeload,
    });
  const week = days(anchor);
  const weekLabel = Agenda_weekLabel({ containing: anchor });
  const isThisWeek = week.some((d) => d.isToday);

  const dayPlan = (date: Date): DayPlan =>
    DayPlan.make({
      for: date,
      plan: app.schedulePlan,
      overrides: app.scheduleOverrides,
      sessions: app.sessions,
      deload: app.activeDeload,
    });

  // MARK: - The month

  const monthLabel = (() => {
    const text = formatEnUS(anchor, "MMMM yyyy");
    return text.replace(/\b\w/g, (c) => c.toUpperCase());
  })();
  const now = new Date();
  const monthHoldsToday = anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth();

  /** Every week that touches the month, Monday first. */
  const monthWeeks = (() => {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = addMonths(start, 1);
    const lastDay = addDays(end, -1);
    const weeks: AgendaDay[][] = [];
    let cursor = start;
    for (;;) {
      const w = days(cursor);
      weeks.push(w);
      const last = w[w.length - 1]?.date;
      if (last === undefined || !(last.getTime() < startOfDay(lastDay).getTime())) break;
      cursor = addDays(cursor, 7);
    }
    return weeks;
  })();

  // MARK: - Stepping

  const step = (glyph: SLGlyph_NameCase, label: string, direction: number) => (
    <button
      type="button"
      className="sl-pressable"
      aria-label={label}
      onClick={() => setAnchor(showsMonth ? addMonths(anchor, direction) : addWeeks(anchor, direction))}
      style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, display: "grid", placeItems: "center", borderRadius: SL.Radius.md, background: "transparent", flexShrink: 0 }}
    >
      <SLGlyph name={glyph} size={18} color={SL.Ink.secondary} />
    </button>
  );

  /** The week, or with the month open the month, and a step either side. */
  const stepper = (
    <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      {step("chevronLeft", showsMonth ? "Previous month" : "Previous week", -1)}
      <VStack spacing={0} style={{ flex: "1 1 0", textAlign: "center" }}>
        <Text {...slLead()} color={SL.Ink.primary} align="center">
          {showsMonth ? monthLabel : weekLabel}
        </Text>
        {!showsMonth && (
          <Text {...slMeta()} numerals color={SL.Ink.secondary} align="center">
            {WeekPlan.range(week.map((d) => d.date))}
          </Text>
        )}
      </VStack>
      {step("chevronRight", showsMonth ? "Next month" : "Next week", 1)}
    </HStack>
  );

  const tools = (
    <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      {(showsMonth ? !monthHoldsToday : !isThisWeek) && (
        <SLOutlineButton onPress={() => setAnchor(new Date())}>{showsMonth ? "This month" : "This week"}</SLOutlineButton>
      )}
      <SLOutlineButton onPress={() => setShowsMonth(!showsMonth)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <SLGlyph name="calendar" size={16} />
          <span>{showsMonth ? "Show week" : "Whole month"}</span>
        </span>
      </SLOutlineButton>
    </HStack>
  );

  const monthDay = (day: AgendaDay, inMonth: boolean) => {
    const isSelected = day.key === selectedKey;
    const ink = isSelected ? SL.Signal.onAction : day.isToday ? SL.Signal.action : inMonth ? SL.Ink.primary : SL.Ink.secondary;
    return (
      <button
        key={AgendaDay.id(day)}
        type="button"
        className="sl-pressable"
        aria-label={StripDay.spokenLabel(day)}
        aria-pressed={isSelected}
        onClick={() => {
          onSelect(day);
          setAnchor(day.date);
          setShowsMonth(false);
        }}
        style={{
          position: "relative",
          flex: "1 1 0",
          minWidth: 0,
          minHeight: SL.Space.hitMin,
          display: "grid",
          placeItems: "center",
          borderRadius: SL.Radius.md,
          background: isSelected ? SL.Signal.action : "transparent",
        }}
      >
        <Text {...slBody(SL.Weight.semibold)} numerals color={ink}>
          {`${day.dayNumber}`}
        </Text>
        {/* A session saved on the day: the same dot wherever it shows. */}
        {AgendaDay.isLogged(day) && (
          <div style={{ position: "absolute", bottom: 6, left: "50%", marginLeft: -2, width: 4, height: 4, borderRadius: "50%", background: isSelected ? SL.Signal.onAction : SL.Signal.action }} />
        )}
      </button>
    );
  };

  const month = (
    <VStack spacing={2} style={{ ...listCard, padding: SL.Space.s3 }}>
      <HStack spacing={2} aria-hidden style={{ paddingBottom: SL.Space.s1 }}>
        {(monthWeeks[0] ?? []).map((day, i) => (
          <Text key={i} size={SL.TypeSize.micro} weight={SL.Weight.regular} color={SL.Ink.secondary} align="center" style={{ flex: "1 1 0" }}>
            {day.weekday}
          </Text>
        ))}
      </HStack>
      {monthWeeks.map((w, i) => (
        <HStack key={i} spacing={2}>
          {w.map((day) => monthDay(day, day.date.getFullYear() === anchor.getFullYear() && day.date.getMonth() === anchor.getMonth()))}
        </HStack>
      ))}
    </VStack>
  );

  // MARK: - The week, counted

  const segment = (day: AgendaDay): string => {
    if (AgendaDay.isLogged(day)) return SL.Signal.action;
    if (AgendaDay.isRest(day)) return colorOpacity(SL.Signal.recovery, 0.25);
    if (day.isToday) return colorOpacity(SL.Signal.action, 0.45);
    return SL.Surface.hairlineStrong;
  };

  const summary = (() => {
    const trained = week.filter((d) => !AgendaDay.isRest(d)).length;
    const done = week.filter((d) => AgendaDay.isLogged(d)).length;
    const isAhead = week.every((d) => !d.isToday && !d.isPast);
    const count = isAhead ? `${trained}` : `${done} of ${trained}`;
    const noun = trained === 1 && isAhead ? "workout" : "workouts";
    const rest = isAhead ? ` ${noun} planned ${weekLabel.toLowerCase()}` : ` ${noun} done ${weekLabel.toLowerCase()}`;
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch", paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1, paddingTop: SL.Space.s1, paddingBottom: SL.Space.s2 }}>
        <Text size={SL.TypeSize.lead} weight={SL.Weight.semibold} numerals color={SL.Ink.primary}>
          {count}
          <span style={{ fontSize: SL.TypeSize.body, fontWeight: SL.Weight.regular, color: SL.Ink.secondary }}>{rest}</span>
        </Text>
        <HStack spacing={SL.Space.s1} aria-hidden style={{ alignSelf: "stretch" }}>
          {week.map((day) => (
            <div key={AgendaDay.id(day)} style={{ flex: "1 1 0", height: 6, borderRadius: 3, background: segment(day) }} />
          ))}
        </HStack>
      </VStack>
    );
  })();

  // MARK: - The week's days

  /** "Bench & shoulders · 22 sets" */
  const plannedLine = (workout: WorkoutDay): string => {
    const sets = `${WeekPlan.sets({ of: workout })} sets`;
    return workout.focus === "" ? sets : `${workout.focus} · ${sets}`;
  };

  /** "18 of 18 sets", or the share older sessions stored instead. */
  const setsLine = (session: TrainingSession): string => {
    if (session.plannedSetCount !== undefined && session.completedSetCount !== undefined && session.plannedSetCount > 0) {
      return `${session.completedSetCount} of ${session.plannedSetCount} sets`;
    }
    return `${session.completion}% done`;
  };

  const rowText = (title: string, sub: string) => (
    <VStack alignment="leading" spacing={3}>
      <Text {...slLead()} color={SL.Ink.primary} style={slLineHeight(1.3, { size: SL.TypeSize.lead })}>
        {title}
      </Text>
      <Text {...slBody()} numerals color={SL.Ink.secondary} style={slLineHeight(1.35, { size: SL.TypeSize.body })}>
        {slUnbroken(sub)}
      </Text>
    </VStack>
  );

  const rowMain = (day: AgendaDay): ReactNode => {
    const content = day.content;
    switch (content.kind) {
      case "session":
        return rowText("Done", `${content.value.dayLabel} · ${setsLine(content.value)}`);
      case "planned":
        return rowText(content.value.short, plannedLine(content.value));
      case "missed":
        return rowText(content.value.short, `Not logged · ${WeekPlan.sets({ of: content.value })} sets`);
      case "rest":
        return (
          <Text {...slBody()} color={SL.Ink.secondary}>
            Rest
          </Text>
        );
    }
  };

  /** A row opens what its day holds. Nothing here starts or writes. */
  const open = (day: AgendaDay) => {
    const content = day.content;
    switch (content.kind) {
      case "session":
        setOpenedSession(content.value.id);
        break;
      case "planned":
      case "missed":
        onPreview(day);
        break;
      case "rest":
        setPlanning(day.date);
        break;
    }
  };

  const holdHandlers = (day: AgendaDay) => {
    const clear = () => {
      if (holdTimer.current !== undefined) clearTimeout(holdTimer.current);
      holdTimer.current = undefined;
    };
    return {
      onPointerDown: () => {
        clear();
        holdTimer.current = setTimeout(() => {
          heldRow.current = true;
          setPlanning(day.date);
        }, 500);
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    };
  };

  const dayRow = (day: AgendaDay, index: number) => {
    const highlighted = day.isToday && !AgendaDay.isLogged(day) && !AgendaDay.isRest(day);
    const rest = AgendaDay.isRest(day);
    return (
      <div key={AgendaDay.id(day)} style={{ position: "relative", display: "flex", flexDirection: "column", WebkitUserSelect: "none", userSelect: "none" }} {...holdHandlers(day)}>
        <SLRowButton
          aria-label={StripDay.spokenLabel(day)}
          onPress={() => {
            if (heldRow.current) heldRow.current = false;
            else open(day);
          }}
        >
          <SLAdaptiveRow
            style={{
              paddingLeft: SL.Space.s4,
              paddingRight: SL.Space.s4,
              paddingTop: rest ? SL.Space.s2 : SL.Space.s3,
              paddingBottom: rest ? SL.Space.s2 : SL.Space.s3,
              minHeight: rest ? 54 : 72,
              background: highlighted ? colorOpacity(SL.Signal.action, 0.06) : "transparent",
            }}
            leading={
              <SLDateColumn
                weekday={day.weekday}
                day={day.dayNumber}
                weekdayInk={highlighted ? SL.Signal.action : SL.Ink.secondary}
                dayInk={highlighted ? SL.Signal.action : rest ? SL.Ink.secondary : SL.Ink.primary}
              />
            }
            main={rowMain(day)}
            trailing={
              <HStack spacing={SL.Space.s2} style={{ flexShrink: 0 }}>
                {AgendaDay.isLogged(day) ? (
                  <SLDoneMark />
                ) : rest ? (
                  <SLGlyph name="moon" size={16} color={SL.Signal.recovery} />
                ) : day.isToday ? (
                  <SLTodayBadge height={24} />
                ) : null}
                <SLGlyph name="chevronRight" size={14} color={SL.Ink.secondary} />
              </HStack>
            }
          />
        </SLRowButton>
        <TopHairline show={index > 0} />
      </div>
    );
  };

  const weekList = <VStack spacing={0} style={listCard}>{week.map((day, i) => dayRow(day, i))}</VStack>;

  // MARK: - The week before

  const previousWeekDates = (() => {
    const first = week[0]?.date;
    if (first === undefined) return [];
    return Schedule.mondayFirstWeek({ containing: addDays(first, -7) });
  })();

  /** The workouts of the week before the one shown, newest first. */
  const previousSessions = (() => {
    const keys = new Set(previousWeekDates.map((d) => Schedule.dateKey(d)));
    return app.sessions
      .filter((s) => s.kind === "workout" && keys.has(Schedule.dateKey(s.date)))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  })();

  /** "Best set Bench press 92.5 kg × 5" */
  const bestLine = (session: TrainingSession): string => {
    const best = ProgressOverview.bestIn({ in: session });
    if (best === undefined) return setsLine(session);
    return `Best set ${best.name} ${NumberDisplay.kg(app.display, best.weightKg)} × ${best.reps}`;
  };

  const previousList = (
    <VStack spacing={0} style={listCard}>
      {previousSessions.map((session, index) => (
        <div key={session.id} style={{ position: "relative", display: "flex", flexDirection: "column" }}>
          <SLRowButton onPress={() => setOpenedSession(session.id)}>
            <SLAdaptiveRow
              style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3, minHeight: 72 }}
              leading={<SLDateColumn weekday={Schedule.weekdayLabel(session.date)} day={session.date.getDate()} />}
              main={rowText(session.dayLabel, bestLine(session))}
              trailing={
                <HStack spacing={SL.Space.s2} style={{ flexShrink: 0 }}>
                  <SLDoneMark />
                  <SLGlyph name="chevronRight" size={14} color={SL.Ink.secondary} />
                </HStack>
              }
            />
          </SLRowButton>
          <TopHairline show={index > 0} />
        </div>
      ))}
    </VStack>
  );

  return (
    <>
      <SLSheet title="Agenda" subtitle="Planning and results" onClose={onClose}>
        <VStack alignment="leading" spacing={SL.Space.s3}>
          {stepper}
          {tools}
          {showsMonth ? (
            month
          ) : (
            <>
              {summary}
              <SLSectionHead title={weekLabel} meta={WeekPlan.range(week.map((d) => d.date))} />
              {weekList}
              {previousSessions.length > 0 && (
                <>
                  <div style={{ alignSelf: "stretch", display: "flex", paddingTop: SL.Space.s1 }}>
                    <SLSectionHead title={isThisWeek ? "Last week" : "Week before"} meta={WeekPlan.range(previousWeekDates)} />
                  </div>
                  {previousList}
                </>
              )}
            </>
          )}
        </VStack>
      </SLSheet>

      <FullScreenCover isPresented={openedSession !== undefined}>
        {lastSession.current !== undefined && <SessionDetailView sessionID={lastSession.current} onClose={() => setOpenedSession(undefined)} />}
      </FullScreenCover>

      <Sheet isPresented={planning !== undefined} onDismiss={() => setPlanning(undefined)}>
        {lastPlanning.current !== undefined && (
          <div key={Schedule.dateKey(lastPlanning.current)} style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
            <DayPlanSheet
              plan={dayPlan(lastPlanning.current)}
              onApply={(option) => {
                const plan = dayPlan(lastPlanning.current!);
                setPlanning(undefined);
                const change = DayPlan.change(plan, { for: option, programKey: app.programKey });
                if (change === undefined) return;
                void app.record([change]);
              }}
              onOpenSession={(session) => {
                setPlanning(undefined);
                setOpenedSession(session.id);
              }}
              onClose={() => setPlanning(undefined)}
            />
          </div>
        )}
      </Sheet>
    </>
  );
}
