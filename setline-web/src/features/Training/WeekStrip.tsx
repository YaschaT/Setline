// WeekStrip.swift — Redesign 1a · the week strip.
//
// Seven days on one line. The selected day is the one filled lime, its ink
// dark on the fill; under each number sits what the day is — a short bar on
// today, a dot on every other day, mint where the plan rests.
//
// Every day is read from `Agenda.week`, so the strip never has an opinion of
// its own about a date. Tapping one selects it and writes nothing.
import { useRef } from "react";
import { SL } from "../../design/tokens";
import { HStack, Text, VStack } from "../../design/swiftui";
import { slLineHeight } from "../../design/SLDynamicType";
import { AgendaDay } from "../../core/Engine/Agenda";
import { WeekPlan } from "../../core/Engine/WeekPlan";
import { formatEnUS } from "../../core/Support/calendar";

/** `.onTapGesture` + `.onLongPressGesture` (0.5 s, as SwiftUI's default). */
export function useTapAndHold(onTap: () => void, onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  const clear = () => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  };
  return {
    onPointerDown: () => {
      held.current = false;
      clear();
      timer.current = setTimeout(() => {
        held.current = true;
        onHold();
      }, 500);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    onClick: () => {
      if (held.current) {
        held.current = false;
        return;
      }
      onTap();
    },
  };
}

export function WeekStrip({
  days,
  selected,
  onSelect,
  onPlan,
}: {
  days: AgendaDay[];
  selected: string;
  onSelect: (day: AgendaDay) => void;
  /** Long-press is the shortcut into "Wijzig deze dag". */
  onPlan: (day: AgendaDay) => void;
}) {
  return (
    <HStack spacing={SL.Space.s1} style={{ alignSelf: "stretch" }}>
      {days.map((day) => (
        <WeekStripCell key={AgendaDay.id(day)} day={day} isSelected={day.key === selected} onSelect={onSelect} onPlan={onPlan} />
      ))}
    </HStack>
  );
}

function WeekStripCell({ day, isSelected, onSelect, onPlan }: { day: AgendaDay; isSelected: boolean; onSelect: (d: AgendaDay) => void; onPlan: (d: AgendaDay) => void }) {
  const gestures = useTapAndHold(() => onSelect(day), () => onPlan(day));
  return (
    <button
      type="button"
      className="sl-pressable"
      aria-label={StripDay.spokenLabel(day)}
      aria-pressed={isSelected}
      {...gestures}
      style={{ flex: "1 1 0", minWidth: 0, borderRadius: SL.Radius.md, background: "transparent", touchAction: "manipulation", WebkitUserSelect: "none", userSelect: "none" }}
    >
      <StripDay day={day} isSelected={isSelected} />
    </button>
  );
}

/** One day of the strip: 60 high, radius 12. */
export function StripDay({ day, isSelected }: { day: AgendaDay; isSelected: boolean }) {
  /** One shape per state, never a colour on its own: a bar on today, a dot everywhere else. */
  const mark = (() => {
    if (day.isToday && !AgendaDay.isLogged(day)) {
      return <div style={{ width: 12, height: 2, borderRadius: 2, background: isSelected ? SL.Signal.onAction : SL.Signal.action }} />;
    }
    if (AgendaDay.isLogged(day)) {
      // Trained: the strip is the week's progress, so a logged day is a full lime dot.
      return <div style={{ width: 6, height: 6, borderRadius: "50%", background: isSelected ? SL.Signal.onAction : SL.Signal.action }} />;
    }
    return <div style={{ width: 4, height: 4, borderRadius: "50%", background: AgendaDay.isRest(day) ? SL.Signal.recovery : SL.Surface.mute }} />;
  })();
  return (
    <VStack
      spacing={2}
      style={{
        alignSelf: "stretch",
        justifyContent: "center",
        minHeight: 60,
        borderRadius: SL.Radius.md,
        background: isSelected ? SL.Signal.action : "transparent",
      }}
    >
      <Text size={SL.TypeSize.micro} weight={isSelected ? SL.Weight.semibold : SL.Weight.regular} color={isSelected ? SL.Signal.onAction : SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.7} style={{ maxWidth: "100%" }}>
        {day.weekday}
      </Text>
      <Text
        size={SL.TypeSize.lead}
        weight={SL.Weight.semibold}
        numerals
        lineLimit={1}
        minimumScaleFactor={0.7}
        color={isSelected ? SL.Signal.onAction : SL.Ink.primary}
        style={{ ...slLineHeight(1.1, { size: SL.TypeSize.lead }), maxWidth: "100%" }}
      >
        {`${day.dayNumber}`}
      </Text>
      <div style={{ height: 6, display: "grid", placeItems: "center" }}>{mark}</div>
    </VStack>
  );
}

/** Spoken as the date, today, what it holds and how it got there. */
StripDay.spokenLabel = (day: AgendaDay): string => {
  const parts = [`${WeekPlan.fullWeekday(day.date)} ${formatEnUS(day.date, "d MMMM")}`];
  if (day.isToday) parts.push("today");
  switch (day.content.kind) {
    case "session":
      parts.push(`${day.content.value.dayLabel}, logged`);
      break;
    case "planned":
      parts.push(`${day.content.value.short}, planned`);
      break;
    case "missed":
      parts.push(`${day.content.value.short}, not logged`);
      break;
    case "rest":
      parts.push("rest day");
      break;
  }
  if (AgendaDay.isMoved(day) || day.isOverridden) parts.push("moved by you");
  return parts.join(", ");
};
