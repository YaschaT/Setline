// WeekPlanView.swift — Artboard 19 · Weekplanning.
//
// Seven rows, one week, and one gesture: drag a session onto another day.
// The rows carry the whole state — what is planned, what was decided, and
// what is sitting away from its usual day — so nothing else has to be said.
//
// On the web the drag is a press-and-hold that lifts the row (as iOS's
// `.draggable` does on touch), then a move over the day to drop it on.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { SL } from "../../design/tokens";
import { ConfirmationDialog, HStack, ScrollView, Spacer, Text, VStack } from "../../design/swiftui";
import { DashedBorder } from "../../design/support";
import { slCard } from "../../design/tokens";
import { slLineHeight } from "../../design/SLDynamicType";
import { slBody, slDisplay, slHitTarget, slLead, slMeta } from "../../design/components/SLText";
import { useApp } from "../../data/AppState";
import { Schedule } from "../../core/Engine/Schedule";
import { WeekDraft, WeekPlan, WeekPlan_Day } from "../../core/Engine/WeekPlan";
import type { WorkoutDay } from "../../core/Domain/Model";

export function WeekPlanView({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [draft, setDraft] = useState<WeekDraft | undefined>(undefined);
  const [targeted, setTargeted] = useState<string | undefined>(undefined);
  const [confirmsDiscard, setConfirmsDiscard] = useState(false);
  /** The row being dragged, and where the finger is. */
  const [dragging, setDragging] = useState<{ key: string; name: string; x: number; y: number } | undefined>(undefined);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The artboard's 28pt column. */
  const weekdayWidth = 28;

  useEffect(() => {
    if (draft === undefined) {
      setDraft(WeekDraft.make({ dates: Schedule.mondayFirstWeek({ containing: new Date() }), overrides: app.scheduleOverrides }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MARK: - Moving

  const dates = draft?.dates ?? Schedule.mondayFirstWeek({ containing: new Date() });
  const week: WeekPlan_Day[] =
    draft !== undefined
      ? WeekDraft.week(draft, { plan: app.schedulePlan })
      : WeekPlan.week({ containing: new Date(), overrides: app.scheduleOverrides, plan: app.schedulePlan });
  const hasChanges = draft !== undefined ? WeekDraft.isChanged(draft) : false;

  const drop = (items: string[], day: WeekPlan_Day): boolean => {
    const source = items[0];
    if (source === undefined || source === day.key || draft === undefined) return false;
    setDraft(WeekDraft.move(draft, { from: source, to: day.key }));
    return true;
  };

  const save = () => {
    if (draft === undefined || !WeekDraft.isChanged(draft)) return onClose();
    const changes = WeekDraft.changes(draft, { programKey: app.programKey });
    onClose();
    void app.record(changes);
  };

  // MARK: - Drag on the web

  const keyAt = (x: number, y: number): string | undefined => {
    const el = document.elementFromPoint(x, y)?.closest("[data-week-key]") as HTMLElement | null;
    return el?.dataset.weekKey;
  };

  const dragHandlers = (day: WeekPlan_Day, name: string) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      const { clientX, clientY, pointerId } = e;
      const target = e.currentTarget;
      if (holdTimer.current !== undefined) clearTimeout(holdTimer.current);
      holdTimer.current = setTimeout(() => {
        try {
          target.setPointerCapture(pointerId);
        } catch {
          /* the pointer may already be gone */
        }
        setDragging({ key: day.key, name, x: clientX, y: clientY });
      }, 400);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) {
        return;
      }
      e.preventDefault();
      setDragging({ ...dragging, x: e.clientX, y: e.clientY });
      const over = keyAt(e.clientX, e.clientY);
      setTargeted(over !== undefined && over !== dragging.key ? over : undefined);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (holdTimer.current !== undefined) clearTimeout(holdTimer.current);
      holdTimer.current = undefined;
      if (!dragging) return;
      const over = keyAt(e.clientX, e.clientY);
      const target = week.find((d) => d.key === over);
      if (target !== undefined) drop([dragging.key], target);
      setDragging(undefined);
      setTargeted(undefined);
    },
    onPointerCancel: () => {
      if (holdTimer.current !== undefined) clearTimeout(holdTimer.current);
      holdTimer.current = undefined;
      setDragging(undefined);
      setTargeted(undefined);
    },
    onPointerLeave: () => {
      if (!dragging && holdTimer.current !== undefined) {
        clearTimeout(holdTimer.current);
        holdTimer.current = undefined;
      }
    },
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  });

  // MARK: - Chrome

  const title = `Week ${WeekPlan.number({ firstSession: app.sessions[app.sessions.length - 1]?.date })} · ${WeekPlan.range(dates)}`;
  const subtitle = (() => {
    const count = week.filter((d) => WeekPlan_Day.isTraining(d)).length;
    const days = count === 1 ? "1 training day" : `${count} training days`;
    return `Drag a session to another day. ${days} set.`;
  })();

  const header = (
    <HStack style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s3, alignSelf: "stretch" }}>
      <button
        type="button"
        className="sl-pressable"
        onClick={() => (draft !== undefined && WeekDraft.isChanged(draft) ? setConfirmsDiscard(true) : onClose())}
        style={{ background: "transparent", ...slHitTarget() }}
      >
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>
          Back
        </Text>
      </button>
      <Spacer />
      <button type="button" className="sl-pressable" onClick={save} disabled={!hasChanges} style={{ background: "transparent", ...slHitTarget() }}>
        <Text {...slBody(SL.Weight.medium)} color={hasChanges ? SL.Signal.action : SL.Ink.tertiary}>
          Save
        </Text>
      </button>
    </HStack>
  );

  // MARK: - Rows

  const border = (day: WeekPlan_Day, moved: boolean): string => {
    if (targeted === day.key) return SL.Signal.action;
    return moved ? SL.Surface.selection : SL.Surface.hairlineStrong;
  };

  const weekday = (day: WeekPlan_Day, bright: boolean) => (
    <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} color={bright ? SL.Ink.primary : SL.Ink.tertiary} style={{ width: weekdayWidth, flexShrink: 0, whiteSpace: "nowrap", overflow: "visible" }}>
      {day.weekday}
    </Text>
  );

  const handle = (bright: boolean) => (
    <VStack spacing={3} aria-hidden style={{ flexShrink: 0 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ width: 16, height: 2, background: bright ? SL.Ink.secondary : SL.Ink.tertiary }} />
      ))}
    </VStack>
  );

  const accessibilityLabel = (day: WeekPlan_Day, workout: WorkoutDay): string => {
    const parts = [`${WeekPlan.fullWeekday(day.date)}, ${workout.short}`];
    if (day.movedFrom !== undefined) parts.push(`moved from ${day.movedFrom}`);
    else parts.push(`${WeekPlan.sets({ of: workout })} sets, about ${WeekPlan.minutes({ of: workout })} minutes`);
    return parts.join(", ");
  };

  const trainingRow = (day: WeekPlan_Day, workout: WorkoutDay) => {
    const moved = day.movedFrom !== undefined;
    return (
      <div
        key={day.key}
        data-week-key={day.key}
        role="group"
        aria-label={accessibilityLabel(day, workout)}
        {...dragHandlers(day, workout.short)}
        style={{
          alignSelf: "stretch",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: `14px ${SL.Space.s4}px`,
          minHeight: SL.Space.hitMin + 2,
          borderRadius: SL.Radius.lg,
          background: moved ? SL.Surface.raised : SL.Surface.raised2,
          border: `1px solid ${border(day, moved)}`,
          transform: `translateY(${moved ? -2 : 0}px)`,
          opacity: dragging?.key === day.key ? 0.5 : 1,
          touchAction: dragging ? "none" : "pan-y",
          WebkitUserSelect: "none",
          userSelect: "none",
          transition: `background ${SL.Motion.base}s ease-out, transform ${SL.Motion.base}s ease-out`,
        }}
      >
        {weekday(day, moved)}
        <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0" }}>
          <Text {...slLead()} color={SL.Ink.primary}>
            {workout.short}
          </Text>
          <Text {...slMeta()} numerals color={moved ? SL.Ink.secondary : SL.Ink.tertiary}>
            {day.movedFrom !== undefined
              ? `Moved from ${day.movedFrom}`
              : `${WeekPlan.sets({ of: workout })} sets · ±${WeekPlan.minutes({ of: workout })} min`}
          </Text>
        </VStack>
        {handle(moved)}
      </div>
    );
  };

  const quietRow = (day: WeekPlan_Day) => {
    const decided = day.kind.kind === "rest";
    return (
      <button
        key={day.key}
        type="button"
        className="sl-pressable"
        data-week-key={day.key}
        aria-label={`${WeekPlan.fullWeekday(day.date)}, ${decided ? "rest day" : "nothing planned"}`}
        onClick={() => {
          if (draft === undefined) return;
          setDraft(decided ? WeekDraft.clear(draft, day.key) : WeekDraft.markRest(draft, day.key));
        }}
        style={{
          position: "relative",
          alignSelf: "stretch",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: `${14 + 1}px ${SL.Space.s4 + 1}px`,
          minHeight: SL.Space.hitMin + 2,
          borderRadius: SL.Radius.lg,
          background: "transparent",
          textAlign: "left",
        }}
      >
        {weekday(day, false)}
        <Text {...slBody()} color={SL.Ink.tertiary} style={{ flex: "1 1 0" }}>
          {decided ? "Rest day" : "Empty · mark as rest day"}
        </Text>
        <DashedBorder color={border(day, false)} radius={SL.Radius.lg} dash={targeted === day.key ? "none" : "4 4"} />
      </button>
    );
  };

  return (
    <VStack alignment="leading" spacing={0} style={{ flex: "1 1 0", minHeight: 0, alignSelf: "stretch", justifyContent: "flex-start", background: SL.Surface.ground }}>
      {header}
      <ScrollView style={{ flex: "1 1 0", alignSelf: "stretch" }}>
        <VStack alignment="leading" spacing={0} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s6, paddingBottom: SL.Space.s8 }}>
          <Text as="h1" {...slDisplay()} numerals color={SL.Ink.primary} style={slLineHeight(SL.LineHeight.display, { size: SL.TypeSize.display })}>
            {title}
          </Text>
          <Text {...slMeta()} color={SL.Ink.tertiary} style={{ paddingTop: 6, paddingBottom: SL.Space.s5 }}>
            {subtitle}
          </Text>
          <VStack spacing={6} style={{ alignSelf: "stretch" }}>
            {week.map((day) => (day.kind.kind === "training" ? trainingRow(day, day.kind.value) : quietRow(day)))}
          </VStack>
        </VStack>
      </ScrollView>

      {dragging !== undefined && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: dragging.x,
            top: dragging.y,
            transform: "translate(-50%, -50%)",
            zIndex: 100,
            pointerEvents: "none",
            padding: `${SL.Space.s2}px ${SL.Space.s4}px`,
            ...slCard({ radius: SL.Radius.md, loud: true }),
          }}
        >
          <Text {...slLead()} color={SL.Ink.primary}>
            {dragging.name}
          </Text>
        </div>
      )}

      <ConfirmationDialog
        isPresented={confirmsDiscard}
        onDismiss={() => setConfirmsDiscard(false)}
        title="Discard changes?"
        message="The week stays as it was."
        actions={[
          { title: "Discard", role: "destructive", action: onClose },
          { title: "Cancel", role: "cancel" },
        ]}
      />
    </VStack>
  );
}
