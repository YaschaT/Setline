// HistoriekSegmentView.swift — Logboek: every logged workout, newest first,
// grouped by month.
//
// Artboard 20's rows (`Push A · 7 sep` / `18/18 · 53 min` / `6.480 kg`), now
// in one dedicated place reached from Progressie's head. A row opens
// `SessionDetailView`, the one screen that reads a saved workout back and
// corrects it; swiping a row left deletes the workout after asking, as the
// detail screen's own button does.
import { useRef, useState, type ReactNode } from "react";
import { SL } from "../../design/tokens";
import { Alert, FullScreenCover, HStack, Pressable, ScrollView, Spacer, Text, VStack } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLGlyph, SLWorkoutSymbol } from "../../design/components/SLGlyph";
import { slBody, slLead, slMeta } from "../../design/components/SLText";
import { useSidewaysDrag } from "../../design/components/SidewaysDrag";
import { useApp } from "../../data/AppState";
import { SessionHistory, type SessionHistoryRow } from "../../core/Progress/SessionHistory";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { WeekPlan } from "../../core/Engine/WeekPlan";
import { formatEnUS } from "../../core/Support/calendar";
import { capitalized } from "../../core/Support/engine";
import { SessionDetailView } from "./SessionDetailView";

/** The trailing swipe action's width, as a List draws one. */
const actionWidth = 74;

/** `.swipeActions(edge: .trailing, allowsFullSwipe: false) { Button("Delete", systemImage: "trash") }`. */
function SwipeRow({ open, onOpen, onDelete, children }: { open: boolean; onOpen: (open: boolean) => void; onDelete: () => void; children?: ReactNode }) {
  const [drag, setDrag] = useState<number | undefined>(undefined);
  const base = open ? -actionWidth : 0;
  const offset = drag ?? base;
  const gesture = useSidewaysDrag({
    onChanged: (dx) => setDrag(Math.min(0, Math.max(-actionWidth * 1.5, base + dx))),
    onEnded: (dx) => {
      setDrag(undefined);
      onOpen(base + dx < -actionWidth / 2);
    },
  });
  return (
    <div style={{ position: "relative", overflow: "hidden", alignSelf: "stretch" }}>
      <button
        type="button"
        className="sl-pressable"
        aria-label="Delete"
        tabIndex={open ? 0 : -1}
        onClick={() => {
          onOpen(false);
          onDelete();
        }}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: Math.max(actionWidth, -offset),
          background: SL.Signal.loss,
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          visibility: offset < 0 ? "visible" : "hidden",
        }}
      >
        <SFSymbol name="trash" size={17} weight={500} color="#fff" />
        <Text size={SL.TypeSize.body} weight={SL.Weight.medium} color="#fff">
          Delete
        </Text>
      </button>
      <div
        {...gesture}
        onClickCapture={(e) => {
          gesture.onClickCapture(e);
          if (open && !e.defaultPrevented) {
            e.stopPropagation();
            e.preventDefault();
            onOpen(false);
          }
        }}
        style={{
          ...gesture.style,
          transform: `translateX(${offset}px)`,
          transition: drag === undefined ? "transform 0.25s cubic-bezier(0,0,.2,1)" : "none",
          paddingTop: 4,
          paddingBottom: 4,
          paddingLeft: SL.Space.gutterSession,
          paddingRight: SL.Space.gutterSession,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function HistoriekSegmentView() {
  const app = useApp();
  const display = app.display;
  const rows = SessionHistory.rows({ from: app.sessions });
  /** The workout the reader asked to see. */
  const [opened, setOpened] = useState<string | undefined>(undefined);
  const lastOpened = useRef<string | undefined>(undefined);
  if (opened !== undefined) lastOpened.current = opened;
  const [deleting, setDeleting] = useState<SessionHistoryRow | undefined>(undefined);
  const lastDeleting = useRef<SessionHistoryRow | undefined>(undefined);
  if (deleting !== undefined) lastDeleting.current = deleting;
  const [swiped, setSwiped] = useState<string | undefined>(undefined);

  /** Rows by month, newest month first. */
  const months = (() => {
    const order: string[] = [];
    const grouped = new Map<string, SessionHistoryRow[]>();
    for (const row of rows) {
      const title = capitalized(formatEnUS(row.date, "MMMM yyyy"));
      if (!grouped.has(title)) order.push(title);
      grouped.set(title, [...(grouped.get(title) ?? []), row]);
    }
    return order.map((title) => ({ title, rows: grouped.get(title) ?? [] }));
  })();

  /** Sets when the session counted them, the stored percentage when it did not, and time only when it was recorded. */
  const detail = (row: SessionHistoryRow): string | undefined => {
    const parts: string[] = [];
    if (row.counts !== undefined) parts.push(`${row.counts.completed}/${row.counts.planned} sets`);
    else if (row.completionPercent !== undefined) parts.push(`${row.completionPercent}%`);
    if (row.durationSeconds !== undefined) parts.push(NumberDisplay.minutes(display, row.durationSeconds));
    return parts.length === 0 ? undefined : parts.join(" · ");
  };

  const accessibilityLabel = (row: SessionHistoryRow): string => {
    const parts = [`${row.dayLabel}, ${NumberDisplay.shortDate(display, row.date)}`];
    const d = detail(row);
    if (d !== undefined) parts.push(d);
    parts.push(NumberDisplay.volumeKg(display, row.volumeKg));
    return parts.join(", ");
  };

  /** A workout as a card: its kind of day as an icon, when, how complete, and the weight it moved. */
  const rowView = (row: SessionHistoryRow) => {
    const complete = row.counts !== undefined ? row.counts.completed >= row.counts.planned : (row.completionPercent ?? 0) >= 100;
    const d = detail(row);
    return (
      <Pressable onPress={() => setOpened(row.id)} aria-label={accessibilityLabel(row)} style={{ background: "transparent", padding: 0, textAlign: "left", alignSelf: "stretch" }}>
        <HStack
          alignment="center"
          spacing={SL.Space.s3}
          style={{
            paddingLeft: SL.Space.s4,
            paddingRight: SL.Space.s4,
            paddingTop: SL.Space.s3,
            paddingBottom: SL.Space.s3,
            minHeight: SL.Space.hitMin,
            background: SL.Surface.raised,
            borderRadius: SL.Radius.lg,
            boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}`,
          }}
        >
          <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: SL.Radius.md, background: complete ? SL.Signal.actionTint : SL.Surface.raised2, display: "grid", placeItems: "center" }}>
            <SLWorkoutSymbol dayName={row.dayLabel} size={21} color={complete ? SL.Signal.action : SL.Ink.primary} />
          </div>
          <VStack alignment="leading" spacing={2} style={{ minWidth: 0, flex: "0 1 auto" }}>
            <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
              {row.dayLabel}
            </Text>
            <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.85} style={{ maxWidth: "100%" }}>
              {[`${WeekPlan.fullWeekday(row.date).slice(0, 3)} ${NumberDisplay.shortDate(display, row.date)}`, ...(d !== undefined ? [d] : [])].join(" · ")}
            </Text>
          </VStack>
          <Spacer minLength={SL.Space.s2} />
          <VStack alignment="trailing" spacing={2} style={{ flexShrink: 0 }}>
            <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Ink.primary} style={{ whiteSpace: "nowrap" }}>
              {NumberDisplay.volumeKg(display, row.volumeKg)}
            </Text>
            <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} color={SL.Ink.secondary}>
              moved
            </Text>
          </VStack>
          <SLGlyph name="chevronRight" size={13} color={SL.Ink.tertiary} />
        </HStack>
      </Pressable>
    );
  };

  const emptyState = (
    <VStack alignment="leading" spacing={SL.Space.s2}>
      <Text {...slLead()}>No sessions yet</Text>
      <Text {...slBody()} color={SL.Ink.secondary}>
        Your first session sets the starting weights.
      </Text>
    </VStack>
  );

  const deletingRow = lastDeleting.current;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, alignSelf: "stretch", width: "100%" }}>
      {rows.length === 0 ? (
        <div style={{ paddingLeft: SL.Space.s5, paddingRight: SL.Space.s5, paddingTop: SL.Space.s5, flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>{emptyState}</div>
      ) : (
        <ScrollView style={{ flex: "1 1 0" }}>
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: SL.Space.s6 }}>
            {months.map((month) => (
              <div key={month.title} style={{ display: "flex", flexDirection: "column" }}>
                {/* The month heads its cards as a row of its own, so it scrolls with them. */}
                <HStack
                  alignment="firstTextBaseline"
                  role="heading"
                  style={{ paddingTop: SL.Space.s5, paddingBottom: SL.Space.s1, paddingLeft: SL.Space.gutterSession + SL.Space.s1, paddingRight: SL.Space.gutterSession + SL.Space.s1 }}
                >
                  <Text {...slLead()} color={SL.Ink.primary}>
                    {month.title}
                  </Text>
                  <Spacer />
                  <Text {...slMeta()} color={SL.Ink.secondary}>
                    {month.rows.length === 1 ? "1 session" : `${month.rows.length} sessions`}
                  </Text>
                </HStack>
                {month.rows.map((row) => (
                  <SwipeRow key={row.id} open={swiped === row.id} onOpen={(o) => setSwiped(o ? row.id : undefined)} onDelete={() => setDeleting(row)}>
                    {rowView(row)}
                  </SwipeRow>
                ))}
              </div>
            ))}
          </div>
        </ScrollView>
      )}

      <FullScreenCover isPresented={opened !== undefined}>
        {lastOpened.current !== undefined && <SessionDetailView sessionID={lastOpened.current} onClose={() => setOpened(undefined)} />}
      </FullScreenCover>

      <Alert
        isPresented={deleting !== undefined}
        onDismiss={() => setDeleting(undefined)}
        title="Delete this session?"
        message={deletingRow !== undefined ? `${deletingRow.dayLabel} on ${NumberDisplay.shortDate(display, deletingRow.date)} disappears from your log and your progress, on the web too.` : ""}
        actions={[
          { title: "Cancel", role: "cancel", action: () => setDeleting(undefined) },
          {
            title: "Delete",
            role: "destructive",
            action: () => {
              const row = deleting;
              if (row === undefined) return;
              setDeleting(undefined);
              void app.removeSession({ id: row.id });
            },
          },
        ]}
      />
    </div>
  );
}
