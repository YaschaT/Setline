// WorkoutChooser.swift — "Plan & workouts": the one place to build workouts
// of your own, change the plan, and start any of them. Reached from Training
// (the plan card's row and "or choose a different workout") and from
// Account › Plan. Without `onStart` (from Account) nothing starts here: it is
// for building.
import { useRef, useState, type ReactNode } from "react";
import { SL } from "../../design/tokens";
import { Alert, HStack, Menu, Sheet, Spacer, Text, VStack } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLOutlineButton, SLPrimaryButton } from "../../design/SetlineTokens";
import { SLGlyph, SLWorkoutSymbol } from "../../design/components/SLGlyph";
import { SLHairline, slBody, slMeta } from "../../design/components/SLText";
import { SLOverline, SLRowButton } from "../../design/components/SLPieces";
import { SLSheet } from "../../design/components/SLSheet";
import { slFont } from "../../design/tokens";
import { useApp } from "../../data/AppState";
import { WeekPlan } from "../../core/Engine/WeekPlan";
import { ProgramCatalog } from "../../core/Catalog/Program";
import { ExerciseCatalog } from "../../core/Catalog/ExerciseCatalog";
import { ExercisePicker, type ExercisePicker_Row } from "../../core/Progress/ExercisePicker";
import { CustomWorkout, CustomWorkout_Item } from "../../core/Domain/CustomWorkout";
import type { WorkoutDay } from "../../core/Domain/Model";
import { ExercisePickerSheet } from "../Progress/ExercisePickerSheet";

const sheetBody = { flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" } as const;

export function WorkoutChooserSheet({
  onStart,
  onChangePlan,
  onClose,
}: {
  onStart?: (day: WorkoutDay) => void;
  onChangePlan: () => void;
  onClose: () => void;
}) {
  const app = useApp();
  /** A paused workout is finished or ended before another starts, so its sets are never overwritten. */
  const blocked = app.resumableSession !== undefined;
  const canStart = onStart !== undefined && !blocked;

  const [editing, setEditing] = useState<CustomWorkout | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const lastEditing = useRef<CustomWorkout | undefined>(undefined);
  if (editing !== undefined) lastEditing.current = editing;

  const detail = (day: WorkoutDay): string => {
    const count = day.exercises.length === 1 ? "1 exercise" : `${day.exercises.length} exercises`;
    return `${count} · ${WeekPlan.sets({ of: day })} sets · ~${WeekPlan.minutes({ of: day })} min`;
  };

  const group = (title: string, content: ReactNode, a: { note?: string; trailing?: [string, () => void] } = {}) => (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <HStack alignment="firstTextBaseline" style={{ paddingLeft: SL.Space.s1, alignSelf: "stretch" }}>
        <SLOverline text={title} />
        <Spacer />
        {a.trailing !== undefined && (
          <button type="button" className="sl-pressable" onClick={a.trailing[1]} style={{ minHeight: SL.Space.hitMin, background: "transparent", flexShrink: 0 }}>
            <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} color={SL.Signal.action}>
              {a.trailing[0]}
            </Text>
          </button>
        )}
      </HStack>
      <VStack
        spacing={0}
        style={{ alignSelf: "stretch", alignItems: "stretch", background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.lg, overflow: "hidden" }}
      >
        {content}
      </VStack>
      {a.note !== undefined && (
        <Text {...slMeta()} color={SL.Ink.secondary} style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>
          {a.note}
        </Text>
      )}
    </VStack>
  );

  const row = (key: string, symbol: ReactNode, title: string, rowDetail: string, isToday: boolean, action: () => void, onEdit?: () => void) => (
    <div key={key} style={{ position: "relative", display: "flex", flexDirection: "row", alignItems: "stretch" }}>
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column" }}>
        <SLRowButton
          onPress={action}
          disabled={blocked && onEdit === undefined}
          aria-label={onStart === undefined ? `${title}. ${rowDetail}` : `Start ${title}. ${rowDetail}`}
        >
          <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: onEdit === undefined ? SL.Space.s4 : SL.Space.s2, minHeight: 64 }}>
            <div style={{ width: 40, height: 40, borderRadius: SL.Radius.md, background: SL.Signal.actionTint, color: SL.Signal.action, display: "grid", placeItems: "center", flexShrink: 0 }}>
              {symbol}
            </div>
            <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
              <HStack spacing={6} style={{ maxWidth: "100%" }}>
                <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary} lineLimit={1}>
                  {title}
                </Text>
                {isToday && (
                  <Text size={SL.TypeSize.micro} weight={SL.Weight.bold} tracking={0.8} color={SL.Signal.action} style={{ flexShrink: 0 }}>
                    TODAY
                  </Text>
                )}
              </HStack>
              <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.85} style={{ maxWidth: "100%" }}>
                {rowDetail}
              </Text>
            </VStack>
            <Spacer minLength={SL.Space.s2} />
            {onStart !== undefined && <SFSymbol name="play.fill" size={13} weight={700} color={SL.Ink.secondary} style={{ opacity: blocked ? 0.3 : 1 }} />}
          </HStack>
        </SLRowButton>
      </div>
      {onEdit !== undefined && (
        <button
          type="button"
          className="sl-pressable"
          onClick={onEdit}
          aria-label={`Edit ${title}`}
          style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, alignSelf: "center", marginRight: SL.Space.s2, display: "grid", placeItems: "center", background: "transparent", flexShrink: 0 }}
        >
          <SFSymbol name="pencil" size={14} weight={600} color={SL.Ink.secondary} />
        </button>
      )}
      <div style={{ position: "absolute", top: 0, left: 72, right: 0, pointerEvents: "none" }}>
        <SLHairline />
      </div>
    </div>
  );

  const save = async (saved: CustomWorkout, start: boolean) => {
    await app.saveCustomWorkout(saved);
    if (start && canStart) onStart?.(CustomWorkout.workoutDay(saved));
  };

  return (
    <>
      <SLSheet
        title="Plan & workouts"
        subtitle={onStart === undefined ? "Build your own workouts or change your plan" : "Start any workout, build your own, or change your plan"}
        onClose={onClose}
      >
        <VStack alignment="leading" spacing={SL.Space.s6} style={{ paddingTop: SL.Space.s2 }}>
          {blocked && onStart !== undefined && (
            <Text {...slMeta()} color={SL.Signal.attention}>
              You have a paused workout. Resume or end it on Training before starting another.
            </Text>
          )}

          {/* Your own first: it is what this sheet is opened to build. */}
          {group(
            "Your workouts",
            <>
              <SLRowButton onPress={() => setCreating(true)}>
                <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 60 }}>
                  <div style={{ width: 40, height: 40, borderRadius: SL.Radius.md, background: SL.Signal.action, display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <SFSymbol name="plus" size={15} weight={700} color={SL.Signal.onAction} />
                  </div>
                  <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
                    Create a workout
                  </Text>
                  <Spacer />
                </HStack>
              </SLRowButton>
              {app.customWorkouts.map((workout) =>
                row(
                  workout.id,
                  <SFSymbol name="square.stack.3d.up.fill" size={16} weight={600} />,
                  workout.name,
                  detail(CustomWorkout.workoutDay(workout)),
                  false,
                  () => {
                    if (canStart) onStart?.(CustomWorkout.workoutDay(workout));
                    else setEditing(workout);
                  },
                  () => setEditing(workout),
                ),
              )}
            </>,
            {
              note:
                app.customWorkouts.length === 0
                  ? "Pick exercises and sets once; start it any time, or put it on a day in the Agenda."
                  : "Put one on a day: open that day in the Agenda.",
            },
          )}

          {group(
            "Your plan",
            <>
              <SLRowButton onPress={onChangePlan}>
                <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 60 }}>
                  <VStack alignment="leading" spacing={2}>
                    <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
                      {ProgramCatalog.current({ in: app.state ?? { raw: {} }, plan: app.plan }).name}
                    </Text>
                    <Text {...slMeta()} color={SL.Ink.secondary}>
                      Plan shape · how your week is built
                    </Text>
                  </VStack>
                  <Spacer />
                  <SLGlyph name="chevronRight" size={12} color={SL.Ink.tertiary} />
                </HStack>
              </SLRowButton>
              {onStart !== undefined &&
                app.plan.map((day) =>
                  row(day.id, <SLWorkoutSymbol dayName={day.short} size={18} />, day.short, detail(day), day.id === app.todayDay?.id, () => onStart?.(day)),
                )}
            </>,
            { trailing: ["Change", onChangePlan] },
          )}
        </VStack>
      </SLSheet>

      <Sheet isPresented={creating} onDismiss={() => setCreating(false)}>
        {creating && (
          <div style={sheetBody}>
            <CustomWorkoutBuilder
              workout={undefined}
              onSave={(saved, start) => {
                setCreating(false);
                void save(saved, start);
              }}
              onDelete={undefined}
              onClose={() => setCreating(false)}
            />
          </div>
        )}
      </Sheet>

      <Sheet isPresented={editing !== undefined} onDismiss={() => setEditing(undefined)}>
        {lastEditing.current !== undefined && (
          <div key={lastEditing.current.id} style={sheetBody}>
            <CustomWorkoutBuilder
              workout={lastEditing.current}
              onSave={(saved, start) => {
                setEditing(undefined);
                void save(saved, start);
              }}
              onDelete={() => {
                const id = lastEditing.current!.id;
                setEditing(undefined);
                void app.removeCustomWorkout({ id });
              }}
              onClose={() => setEditing(undefined)}
            />
          </div>
        )}
      </Sheet>
    </>
  );
}

/**
 * Putting a workout together: a name, the exercises in order, and sets for
 * each. Saved to the account; "Save & start" begins it right away.
 */
export function CustomWorkoutBuilder({
  workout,
  onSave,
  onDelete,
  onClose,
}: {
  workout: CustomWorkout | undefined;
  onSave: (workout: CustomWorkout, start: boolean) => void;
  onDelete: (() => void) | undefined;
  onClose: () => void;
}) {
  const app = useApp();
  const [name, setName] = useState(workout?.name ?? "");
  const [items, setItems] = useState<CustomWorkout_Item[]>(workout?.items ?? []);
  const [picking, setPicking] = useState(false);
  const [confirmsDelete, setConfirmsDelete] = useState(false);

  const trimmed = name.trim();
  const canSave = trimmed !== "" && items.length > 0;
  const built = (): CustomWorkout =>
    CustomWorkout.make({ id: workout?.id, name: [...trimmed].slice(0, 40).join(""), items, createdAt: workout?.createdAt ?? new Date() });

  const update = (index: number, change: Partial<CustomWorkout_Item>) => setItems(items.map((it, i) => (i === index ? { ...it, ...change } : it)));
  const swap = (a: number, b: number) => {
    const next = [...items];
    [next[a], next[b]] = [next[b], next[a]];
    setItems(next);
  };

  const miniStep = (symbol: string, label: string, action: () => void) => (
    <button type="button" className="sl-pressable" onClick={action} aria-label={label} style={{ width: 34, height: 36, display: "grid", placeItems: "center", background: "transparent", flexShrink: 0 }}>
      <SFSymbol name={symbol} size={11} weight={700} color={SL.Ink.primary} />
    </button>
  );

  const itemRow = (index: number, item: CustomWorkout_Item) => {
    const exerciseName = ExerciseCatalog.exercise(item.exerciseID)?.name;
    return (
      <HStack spacing={SL.Space.s2} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s2, minHeight: 64 }}>
        <VStack alignment="leading" spacing={2} style={{ minWidth: 0, flex: "0 1 auto" }}>
          <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary} lineLimit={2}>
            {exerciseName ?? item.exerciseID}
          </Text>
          {/* The rep range: what progression aims the sets at. */}
          <Menu
            aria-label={`Rep range, ${item.repLow} to ${item.repHigh}`}
            entries={CustomWorkoutBuilder.repRanges.map(([low, high]) => ({
              kind: "button" as const,
              title: `${low}–${high} reps`,
              action: () => update(index, { repLow: low, repHigh: high }),
            }))}
            label={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, minHeight: 28, color: SL.Signal.action }}>
                <Text {...slMeta(SL.Weight.medium)} numerals color={SL.Signal.action}>
                  {`${item.repLow}–${item.repHigh} reps`}
                </Text>
                <SFSymbol name="chevron.up.chevron.down" size={9} weight={600} color={SL.Signal.action} />
              </span>
            }
          />
        </VStack>
        <Spacer minLength={SL.Space.s2} />
        <HStack spacing={0} style={{ borderRadius: SL.Radius.pill, background: SL.Surface.raised2, flexShrink: 0 }}>
          {miniStep("minus", "Fewer sets", () => update(index, { sets: Math.max(1, item.sets - 1) }))}
          <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} numerals color={SL.Ink.primary} align="center" style={{ minWidth: 52 }}>
            {`${item.sets} sets`}
          </Text>
          {miniStep("plus", "More sets", () => update(index, { sets: Math.min(10, item.sets + 1) }))}
        </HStack>
        <Menu
          aria-label={`More for ${exerciseName ?? "this exercise"}`}
          entries={[
            ...(index > 0 ? [{ kind: "button" as const, title: "Move up", systemImage: "arrow.up", action: () => swap(index, index - 1) }] : []),
            ...(index < items.length - 1 ? [{ kind: "button" as const, title: "Move down", systemImage: "arrow.down", action: () => swap(index, index + 1) }] : []),
            { kind: "button" as const, title: "Remove", systemImage: "trash", role: "destructive" as const, action: () => setItems(items.filter((_, i) => i !== index)) },
          ]}
          label={
            <div style={{ width: 36, height: SL.Space.hitMin, display: "grid", placeItems: "center" }}>
              <SFSymbol name="ellipsis" size={15} weight={600} color={SL.Ink.secondary} />
            </div>
          }
        />
      </HStack>
    );
  };

  return (
    <>
      <SLSheet title={workout === undefined ? "New workout" : "Edit workout"} onClose={onClose}>
        <VStack alignment="leading" spacing={SL.Space.s5} style={{ paddingTop: SL.Space.s2 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name, e.g. Arms or Home workout"
            aria-label="Workout name"
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            style={{
              ...slFont(SL.TypeSize.lead, SL.Weight.semibold),
              color: SL.Ink.primary,
              caretColor: SL.Signal.action,
              alignSelf: "stretch",
              minHeight: 52,
              paddingLeft: SL.Space.s4,
              paddingRight: SL.Space.s4,
              borderRadius: SL.Radius.md,
              border: "none",
              outline: "none",
              background: SL.Surface.raised2,
            }}
          />

          <VStack
            spacing={0}
            style={{ alignSelf: "stretch", alignItems: "stretch", background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.lg, overflow: "hidden" }}
          >
            {items.map((item, index) => (
              <div key={index} style={{ position: "relative" }}>
                {itemRow(index, item)}
                {index > 0 && (
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
                    <SLHairline />
                  </div>
                )}
              </div>
            ))}
            <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
              <SLRowButton onPress={() => setPicking(true)}>
                <HStack spacing={8} style={{ justifyContent: "center", minHeight: 52 }}>
                  <SFSymbol name="plus" size={15} weight={600} color={SL.Signal.action} />
                  <Text size={SL.TypeSize.body} weight={SL.Weight.semibold} color={SL.Signal.action}>
                    Add exercise
                  </Text>
                </HStack>
              </SLRowButton>
              {items.length > 0 && (
                <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
                  <SLHairline />
                </div>
              )}
            </div>
          </VStack>

          <VStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", alignItems: "stretch" }}>
            <SLPrimaryButton onPress={() => onSave(built(), true)} disabled={!canSave}>
              Save &amp; start
            </SLPrimaryButton>
            <SLOutlineButton onPress={() => onSave(built(), false)} disabled={!canSave} style={{ opacity: canSave ? 1 : 0.4 }}>
              Save
            </SLOutlineButton>
            {!canSave && (
              <Text {...slMeta()} color={SL.Ink.secondary} align="center">
                {trimmed === "" ? "Give it a name and add an exercise." : "Add at least one exercise."}
              </Text>
            )}
            {onDelete !== undefined && (
              <button type="button" className="sl-pressable" onClick={() => setConfirmsDelete(true)} style={{ minHeight: SL.Space.hitMin, background: "transparent" }}>
                <Text {...slBody(SL.Weight.medium)} color={SL.Signal.loss}>
                  Delete workout
                </Text>
              </button>
            )}
          </VStack>
        </VStack>
      </SLSheet>

      <Sheet isPresented={picking} onDismiss={() => setPicking(false)}>
        {picking && (
          <div style={sheetBody}>
            <ExercisePickerSheet
              rows={ExercisePicker.rowsSessions({ sessions: app.sessions, favorites: app.favoriteExercises })}
              selected={undefined}
              onPick={(row: ExercisePicker_Row) => {
                setItems([...items, CustomWorkout_Item.make({ exerciseID: row.exerciseID })]);
                setPicking(false);
              }}
              onStar={(row: ExercisePicker_Row) => void app.setFavorite({ exerciseID: row.exerciseID, isFavorite: !row.isFavorite })}
              onClose={() => setPicking(false)}
            />
          </div>
        )}
      </Sheet>

      <Alert
        isPresented={confirmsDelete}
        onDismiss={() => setConfirmsDelete(false)}
        title={`Delete ${trimmed === "" ? "this workout" : trimmed}?`}
        message="Workouts you logged with it stay in your history."
        actions={[
          { title: "Cancel", role: "cancel" },
          { title: "Delete", role: "destructive", action: () => onDelete?.() },
        ]}
      />
    </>
  );
}

CustomWorkoutBuilder.repRanges = [
  [3, 5],
  [4, 6],
  [5, 8],
  [6, 10],
  [8, 12],
  [10, 15],
  [12, 20],
] as [number, number][];
