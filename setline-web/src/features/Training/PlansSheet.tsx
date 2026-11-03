// PlansSheet.swift — "Your plan": the week you train, every week. Your own
// plans first — each a name and a workout per day — then the ready-made ones,
// in one list, so a plan of your own is as much a plan as Push / Pull / Legs.
// Tapping one uses it; Training's week follows it from today.
import { useState, type ReactNode } from "react";
import { SL, slFont } from "../../design/tokens";
import { Alert, HStack, Menu, Sheet, Spacer, Text, VStack } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLOutlineButton, SLPrimaryButton, colorOpacity } from "../../design/SetlineTokens";
import { SLPress } from "../../design/components/SLPress";
import { SLHairline, SLEyebrow, slBody, slMeta } from "../../design/components/SLText";
import { SLOverline, SLRowButton } from "../../design/components/SLPieces";
import { SLSheet } from "../../design/components/SLSheet";
import { AppState, OwnPlan, useApp } from "../../data/AppState";
import { LegacyState } from "../../core/Legacy/LegacyState";
import { ProgramCatalog, Program } from "../../core/Catalog/Program";
import { Schedule } from "../../core/Engine/Schedule";
import { CustomWorkout } from "../../core/Domain/CustomWorkout";
import type { WorkoutDay } from "../../core/Domain/Model";
import { ownWeekSummary, weekdayNames } from "./WorkoutChooser";

const sheetBody = { flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" } as const;

/** The plan being made or changed: a new one, one of yours, or the week you already made, still without a name. */
interface Editing {
  plan: OwnPlan;
  isNew: boolean;
}

export function PlansSheet({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [editing, setEditing] = useState<Editing | undefined>(undefined);
  const current = ProgramCatalog.current({ in: app.state ?? LegacyState.make({ raw: {} }), plan: app.plan });
  const own = app.ownPlans;
  const active = app.activeOwnPlan;
  const week = app.ownWeek;

  const startDays = (): string[] =>
    week ??
    AppState.weekdaysMondayFirst.map((index) => Schedule.day({ for: Schedule.defaultWeek[index] ?? "rest", in: app.plan })?.id ?? "rest");

  /** Making one is what most people open this for: its own card, first. */
  const createCard = (
    <SLPress
      scale={0.98}
      onPress={() => setEditing({ plan: { id: OwnPlan.newID(), name: "", days: startDays() }, isNew: true })}
      aria-label="Make your own plan"
      style={{
        alignSelf: "stretch",
        display: "flex",
        flexDirection: "column",
        gap: SL.Space.s4,
        padding: SL.Space.s4,
        borderRadius: SL.Radius.xl,
        background: SL.Signal.actionTint,
        boxShadow: `inset 0 0 0 1px ${colorOpacity(SL.Signal.action, 0.35)}`,
        textAlign: "left",
      }}
    >
      <HStack alignment="top" spacing={SL.Space.s3}>
        <div style={{ width: 44, height: 44, borderRadius: SL.Radius.md, background: SL.Signal.action, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <SFSymbol name="calendar" size={18} weight={600} color={SL.Signal.onAction} />
        </div>
        <VStack alignment="leading" spacing={4} style={{ minWidth: 0 }}>
          <Text size={SL.TypeSize.lead} weight={SL.Weight.bold} color={SL.Ink.primary}>
            Make your own plan
          </Text>
          <Text {...slMeta()} color={SL.Ink.secondary}>
            Name it, like Week 1, and pick a workout for each day: one of yours or one of ours.
          </Text>
        </VStack>
      </HStack>
      <span
        style={{
          ...slFont(SL.TypeSize.body, SL.Weight.semibold),
          color: SL.Signal.onAction,
          background: SL.Signal.action,
          borderRadius: 999,
          minHeight: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <SFSymbol name="plus" size={14} weight={700} color={SL.Signal.onAction} />
        Create plan
      </span>
    </SLPress>
  );

  const section = (title: string, rows: ReactNode[]) => (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch", alignItems: "stretch" }}>
      <SLOverline text={title} style={{ paddingLeft: SL.Space.s1 }} />
      <VStack spacing={0} style={{ alignItems: "stretch", background: SL.Surface.raised2, borderRadius: SL.Radius.lg, overflow: "hidden" }}>
        {rows.map((row, index) => (
          <div key={index}>
            {index > 0 && <SLHairline style={{ marginLeft: SL.Space.s4 }} />}
            {row}
          </div>
        ))}
      </VStack>
    </VStack>
  );

  /** A plan: its name and its week, "In use" on the one the week follows, and for your own an Edit beside it. */
  const planRow = (a: { title: string; detail: string; inUse: boolean; use: () => void; edit?: () => void }) => (
    <HStack spacing={0} style={{ alignSelf: "stretch" }}>
      <SLRowButton
        onPress={a.inUse ? (a.edit ?? (() => undefined)) : a.use}
        aria-label={`${a.title}. ${a.detail}${a.inUse ? ". In use" : ""}`}
        style={{ flex: "1 1 0", minWidth: 0 }}
      >
        <HStack spacing={SL.Space.s3} style={{ minHeight: 64, paddingLeft: SL.Space.s4, paddingRight: a.edit ? SL.Space.s2 : SL.Space.s4, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3 }}>
          <VStack alignment="leading" spacing={2} style={{ minWidth: 0, flex: "1 1 0" }}>
            <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>{a.title}</Text>
            <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={2}>{a.detail}</Text>
          </VStack>
          {a.inUse ? (
            <span style={{ ...slFont(SL.TypeSize.meta, SL.Weight.semibold), color: SL.Signal.action, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <SFSymbol name="checkmark" size={12} weight={700} color={SL.Signal.action} />
              In use
            </span>
          ) : (
            <span style={{ ...slFont(SL.TypeSize.meta, SL.Weight.semibold), color: SL.Signal.action, background: SL.Signal.actionTint, borderRadius: 999, padding: `0 ${SL.Space.s3}px`, minHeight: 30, display: "flex", alignItems: "center", flexShrink: 0 }}>
              Use
            </span>
          )}
        </HStack>
      </SLRowButton>
      {a.edit && (
        <SLPress onPress={a.edit} aria-label={`Edit ${a.title}`} style={{ minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin, paddingRight: SL.Space.s2, display: "grid", placeItems: "center", background: "transparent", flexShrink: 0 }}>
          <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>Edit</Text>
        </SLPress>
      )}
    </HStack>
  );

  const yourRows: ReactNode[] = [];
  // A week made before plans had names: in use, waiting for one.
  if (week && !active) {
    yourRows.push(
      planRow({
        title: "Your own week",
        detail: ownWeekSummary(week, app.schedulePlan),
        inUse: true,
        use: () => undefined,
        edit: () => setEditing({ plan: { id: OwnPlan.newID(), name: "", days: week }, isNew: true }),
      }),
    );
  }
  for (const plan of own) {
    yourRows.push(
      planRow({
        title: plan.name,
        detail: ownWeekSummary(plan.days, app.schedulePlan),
        inUse: plan.id === active?.id,
        use: () => {
          void app.saveOwnPlan(plan, true);
          onClose();
        },
        edit: () => setEditing({ plan, isNew: false }),
      }),
    );
  }

  return (
    <>
      <SLSheet title="Your plan" subtitle="The week you train, every week. Use one of ours or make your own." onClose={onClose}>
        <VStack alignment="leading" spacing={SL.Space.s6} style={{ alignSelf: "stretch", alignItems: "stretch", paddingTop: SL.Space.s2, paddingBottom: SL.Space.s6 }}>
          {createCard}
          {yourRows.length > 0 && section("Your plans", yourRows)}
          {section(
            "Ready-made plans",
            ProgramCatalog.all({ personalPlan: app.plan }).map((program) =>
              planRow({
                title: program.name,
                detail: program.shape,
                inUse: week === undefined && Program.id(program) === Program.id(current),
                use: () => {
                  void app.useReadyMadePlan(program);
                  onClose();
                },
              }),
            ),
          )}
        </VStack>
      </SLSheet>

      <Sheet isPresented={editing !== undefined} onDismiss={() => setEditing(undefined)}>
        {editing && (
          <div style={sheetBody}>
            <PlanEditorSheet key={editing.plan.id} plan={editing.plan} isNew={editing.isNew} onDone={() => setEditing(undefined)} />
          </div>
        )}
      </Sheet>
    </>
  );
}

/** A plan of your own: its name, then a workout for each day — one of yours or one of the ready-made ones — or rest. */
export function PlanEditorSheet({ plan, isNew, onDone }: { plan: OwnPlan; isNew: boolean; onDone: () => void }) {
  const app = useApp();
  const [name, setName] = useState(plan.name);
  const [days, setDays] = useState<string[]>(plan.days);
  const [confirmsDelete, setConfirmsDelete] = useState(false);
  const workouts = app.schedulePlan;
  const count = days.filter((id) => workouts.some((w) => w.id === id)).length;
  const trimmed = name.trim();
  const active = app.activeOwnPlan;
  const week = app.ownWeek;
  /** The plan the week already follows, or the unnamed week being named. */
  const inUse = active?.id === plan.id || (isNew && active === undefined && week !== undefined && week.every((day, index) => day === plan.days[index]));

  const label = (id: string) => workouts.find((w) => w.id === id)?.short ?? "Rest";

  const save = (use: boolean) => {
    void app.saveOwnPlan({ id: plan.id, name: trimmed, days }, use);
    onDone();
  };

  const dayRow = (index: number) => {
    const id = days[index];
    const isRest = !workouts.some((w) => w.id === id);
    const pick = (value: string) => setDays(days.map((d, i) => (i === index ? value : d)));
    const entry = (w: WorkoutDay) => ({ kind: "button" as const, title: w.short, checked: w.id === id, action: () => pick(w.id) });
    return (
      <div key={index} style={{ position: "relative", display: "flex" }}>
        <HStack spacing={SL.Space.s3} style={{ flex: "1 1 0", minWidth: 0, minHeight: 56, paddingLeft: SL.Space.s4, paddingRight: SL.Space.s2 }}>
          <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary} style={{ width: 104, flexShrink: 0 }}>
            {weekdayNames[index]}
          </Text>
          <Spacer />
          <Menu
            aria-label={`${weekdayNames[index]}: ${label(id)}. Change`}
            entries={[
              ...(app.customWorkouts.length > 0
                ? [{ kind: "section" as const, title: "Your workouts", entries: app.customWorkouts.map((c) => entry(CustomWorkout.workoutDay(c))) }]
                : []),
              { kind: "section" as const, title: "Ready-made workouts", entries: app.plan.map(entry) },
              { kind: "divider" as const },
              { kind: "button" as const, title: "Rest", checked: isRest, action: () => pick("rest") },
            ]}
            label={
              <HStack
                spacing={6}
                style={{
                  minHeight: SL.Space.hitMin,
                  paddingLeft: SL.Space.s3,
                  paddingRight: SL.Space.s3,
                  borderRadius: 999,
                  background: isRest ? "transparent" : SL.Signal.actionTint,
                  border: isRest ? `1px dashed ${SL.Surface.hairlineStrong}` : "none",
                  maxWidth: 200,
                }}
              >
                <Text {...slBody(SL.Weight.semibold)} color={isRest ? SL.Ink.secondary : SL.Signal.action} lineLimit={1}>
                  {label(id)}
                </Text>
                <SFSymbol name="chevron.up.chevron.down" size={11} weight={600} color={isRest ? SL.Ink.tertiary : SL.Signal.action} />
              </HStack>
            }
          />
        </HStack>
        {index > 0 && (
          <div style={{ position: "absolute", top: 0, left: SL.Space.s4, right: 0, pointerEvents: "none" }}>
            <SLHairline />
          </div>
        )}
      </div>
    );
  };

  return (
    <SLSheet title={isNew ? "New plan" : "Edit plan"} subtitle="A workout for each day. It repeats every week." onClose={onDone}>
      <VStack alignment="leading" spacing={SL.Space.s5} style={{ alignSelf: "stretch", alignItems: "stretch", paddingTop: SL.Space.s2, paddingBottom: SL.Space.s6 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 2, padding: "12px 14px", borderRadius: SL.Radius.lg, background: SL.Surface.raised2 }}>
          <SLEyebrow text="PLAN NAME" size={SL.TypeSize.micro} />
          <input
            autoFocus={isNew}
            placeholder="Week 1"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={{ ...slFont(SL.TypeSize.lead, SL.Weight.semibold), background: "transparent", border: "none", outline: "none", padding: 0, color: SL.Ink.primary, caretColor: SL.Signal.action, width: "100%" }}
          />
        </label>
        <VStack spacing={0} style={{ alignSelf: "stretch", alignItems: "stretch", background: SL.Surface.raised2, borderRadius: SL.Radius.lg, overflow: "hidden" }}>
          {days.map((_, index) => dayRow(index))}
        </VStack>
        <Text {...slMeta()} numerals color={SL.Ink.secondary} style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>
          {`${count === 1 ? "1 workout" : `${count} workouts`} a week. A day you move in the Agenda still changes just that date.`}
        </Text>
        <VStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", alignItems: "stretch" }}>
          <SLPrimaryButton disabled={trimmed.length === 0} onPress={() => save(true)}>
            {inUse ? "Save" : "Save and use"}
          </SLPrimaryButton>
          {!inUse && (
            <SLOutlineButton disabled={trimmed.length === 0} onPress={() => save(false)}>
              Save for later
            </SLOutlineButton>
          )}
          {!isNew && (
            <SLPress onPress={() => setConfirmsDelete(true)} style={{ minHeight: SL.Space.hitMin, color: SL.Signal.loss, ...slFont(SL.TypeSize.body, SL.Weight.medium), display: "grid", placeItems: "center", background: "transparent" }}>
              Delete plan
            </SLPress>
          )}
        </VStack>
      </VStack>
      <Alert
        isPresented={confirmsDelete}
        onDismiss={() => setConfirmsDelete(false)}
        title={`Delete ${plan.name}?`}
        message={active?.id === plan.id ? "Your week goes back to your ready-made plan. Workouts you logged stay." : "Workouts you logged with it stay."}
        actions={[
          { title: "Cancel", role: "cancel" },
          {
            title: "Delete",
            role: "destructive",
            action: () => {
              void app.removeOwnPlan(plan);
              onDone();
            },
          },
        ]}
      />
    </SLSheet>
  );
}
