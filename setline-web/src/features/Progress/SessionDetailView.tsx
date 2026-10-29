// SessionDetailView.swift — one saved workout, opened from Historiek.
//
// Review context, not a session: no set grid, no timer, no commit pill. The
// blocks are 17R's — eyebrow, title, volume, then one block per exercise —
// because that is the vocabulary the app already uses for a workout that is
// over. It shows what was saved that day and nothing reconstructed from
// today's plan: the exercises in the order they were performed, each set as
// it was logged, and the markers the data actually carries.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { SL } from "../../design/tokens";
import { Alert, ConfirmationDialog, FullScreenCover, HStack, Pressable, ScrollView, Sheet, Spacer, Text, VStack } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { colorOpacity } from "../../design/SetlineTokens";
import { DashedBorder } from "../../design/support";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLMedal, SLMedalRow } from "../../design/components/SLMedal";
import { SLEyebrow, SLHairline, slBody, slDisplay, slHitTarget, slLead, slMeta, slTitle } from "../../design/components/SLText";
import { SLValueRow } from "../../design/components/SLValueRow";
import { slLineHeight } from "../../design/SLDynamicType";
import { useApp } from "../../data/AppState";
import { useSocial } from "../../data/SocialStore";
import { Exercise, LoggedSet, SetSide, SideReps, type ExerciseResult, type TrainingSession } from "../../core/Domain/Model";
import { SetFlags, SetModifiers } from "../../core/Domain/Vocabulary";
import { ExerciseHistory } from "../../core/Engine/ExerciseHistory";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { RecordsEngine } from "../../core/Engine/RecordsEngine";
import { WeekPlan } from "../../core/Engine/WeekPlan";
import { ExercisePicker } from "../../core/Progress/ExercisePicker";
import { Medals } from "../../core/Progress/Medals";
import { SetAddition, SetCorrection, SetRemoval } from "../../core/Sync/SetCorrection";
import { dec, deepEqual, maxBy, rounded } from "../../core/Support/swift";
import { DurationRow } from "../Session/DurationRow";
import { PostComposerView } from "../Friends/PostComposerView";
import { ExercisePickerSheet } from "./ExercisePickerSheet";
import { SetCorrectionSheet } from "./SetCorrectionSheet";
import { WorkoutShareCard } from "./WorkoutShareCard";

/** Which set the correction sheet is open on. */
interface Target {
  resultIndex: number;
  setIndex: number;
}
const targetID = (t: Target) => `${t.resultIndex}-${t.setIndex}`;

const micro = (color: string, numerals = false) => ({ size: SL.TypeSize.micro, weight: SL.Weight.semibold, color, numerals });

export function SessionDetailView({ sessionID, onClose }: { sessionID: string; onClose: () => void }) {
  const app = useApp();
  const social = useSocial();
  const display = app.display;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExerciseResult[]>([]);
  const [correcting, setCorrecting] = useState<Target | undefined>(undefined);
  const [confirmsDiscard, setConfirmsDiscard] = useState(false);
  const [confirmsDelete, setConfirmsDelete] = useState(false);
  const [posting, setPosting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  /** Sets taken out while editing, by where they sit in the stored session. */
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  /** Asked before the last set of the session goes, because that takes the session with it. */
  const [confirmsLastSet, setConfirmsLastSet] = useState<Target | undefined>(undefined);
  /** The workout's name while editing. */
  const [titleDraft, setTitleDraft] = useState("");
  /** Minutes while editing; `undefined` until the duration is touched. */
  const [durationDraft, setDurationDraft] = useState<number | undefined>(undefined);
  /** The exercise whose identity is being changed. */
  const [pickingExercise, setPickingExercise] = useState<number | undefined>(undefined);
  /** The share picture, drawn when the page opens. */
  const [shareImage, setShareImage] = useState<Blob | undefined>(undefined);
  const lastCorrecting = useRef<Target | undefined>(undefined);
  if (correcting !== undefined) lastCorrecting.current = correcting;

  const session = app.sessions.find((s) => s.id === sessionID);

  /** This workout's post, if it has one. */
  const existingPost = session === undefined ? undefined : social.feed.find((p) => p.session_id === session.id && p.user_id === social.myID);

  /** The medals the day earned against everything before it. */
  const medals = session === undefined ? [] : Medals.medals({ for: session, in: app.sessions });

  const results = editing ? draft : (session?.results ?? []);

  const durationChanged = session !== undefined && durationDraft !== undefined && durationDraft * 60 !== (session.durationSeconds ?? -1);
  const titleChanged = (() => {
    if (session === undefined) return false;
    const typed = titleDraft.trim();
    return typed.length > 0 && typed !== session.dayLabel;
  })();
  const hasChanges = editing && (!deepEqual(draft, session?.results) || removed.size > 0 || titleChanged || durationChanged);

  /** A different exercise or a new name can't travel as set corrections: then the whole session is written. */
  const changesStructure = (() => {
    if (session === undefined) return false;
    if (titleChanged || durationChanged) return true;
    return draft.some((d, index) => index >= session.results.length || d.exerciseID !== session.results[index].exerciseID);
  })();

  /** The sets of one result that are still in the session, each with the index the stored session knows it by. */
  const visibleSets = (result: ExerciseResult, resultIndex: number) =>
    result.sets.map((set, index) => ({ index, set })).filter((e) => !removed.has(targetID({ resultIndex, setIndex: e.index })));

  /** How many sets the whole session would still hold. */
  const remainingSetCount = results.reduce((total, result, index) => total + visibleSets(result, index).length, 0);

  useEffect(() => {
    if (session === undefined) return;
    let cancelled = false;
    void WorkoutShareCard.image({ session, medals, streakWeeks: app.streak.weeks, display }).then((blob) => {
      if (!cancelled) setShareImage(blob);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.results]);

  const share = async () => {
    if (shareImage === undefined || session === undefined) return;
    const title = `${session.dayLabel} · ${NumberDisplay.shortDate(display, session.date)}`;
    const file = new File([shareImage], "setline-workout.png", { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return;
      }
    } catch {
      return;
    }
    const url = URL.createObjectURL(shareImage);
    const a = document.createElement("a");
    a.href = url;
    a.download = "setline-workout.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // MARK: - Editing

  const startEditing = () => {
    setDraft(session?.results ?? []);
    setTitleDraft(session?.dayLabel ?? "");
    setDurationDraft(undefined);
    setRemoved(new Set());
    setEditing(true);
  };

  const stopEditing = () => {
    setEditing(false);
    setDraft([]);
    setRemoved(new Set());
  };

  const remove = (target: Target) => setRemoved((r) => new Set(r).add(targetID(target)));

  /** A set done but not logged: it starts as a copy of the exercise's last set and opens straight away to be corrected. */
  const addSet = (resultIndex: number) => {
    if (!(resultIndex >= 0 && resultIndex < draft.length)) return;
    const sets = draft[resultIndex].sets;
    const last = sets[sets.length - 1];
    const set: LoggedSet = {
      ...LoggedSet.make({ index: sets.length, weightKg: last?.weightKg, reps: last?.reps ?? 8, modifiers: last?.modifiers ?? SetModifiers.none, origin: "sessionAdded" }),
      substitutedFrom: last?.substitutedFrom,
    };
    setDraft(draft.map((r, i) => (i === resultIndex ? { ...r, sets: [...r.sets, set] } : r)));
    setCorrecting({ resultIndex, setIndex: set.index });
  };

  /** A new name or a different exercise: the session as the screen shows it, written whole. */
  const saveWhole = (stored: TrainingSession) => {
    let updated: TrainingSession = { ...stored };
    const typed = titleDraft.trim();
    if (typed.length > 0) updated = { ...updated, dayLabel: [...typed].slice(0, 60).join("") };
    if (durationDraft !== undefined) updated = { ...updated, durationSeconds: durationDraft * 60 };
    updated = {
      ...updated,
      results: draft.flatMap((result, resultIndex) => {
        const sets = result.sets
          .filter((_, offset) => !removed.has(targetID({ resultIndex, setIndex: offset })))
          .map((set, position) => ({ ...set, index: position }));
        return sets.length === 0 ? [] : [{ ...result, sets }];
      }),
    };
    // Stored exercises that are no longer there as themselves: their sets go, back to front.
    const removals: SetRemoval[] = [];
    const seen = new Map<string, number>();
    stored.results.forEach((s, index) => {
      const occurrence = seen.get(s.exerciseID) ?? 0;
      seen.set(s.exerciseID, occurrence + 1);
      const stays = index < draft.length && draft[index].exerciseID === s.exerciseID && updated.results.some((r) => r.exerciseID === s.exerciseID);
      if (stays) return;
      for (let i = s.sets.length - 1; i >= 0; i--) removals.push(SetRemoval.make({ exerciseID: s.exerciseID, occurrence, setIndex: i }));
    });
    setIsSaving(true);
    void (async () => {
      if (updated.results.length === 0) await app.removeSession({ id: stored.id });
      else await app.replace({ session: updated, removing: removals });
      setIsSaving(false);
      stopEditing();
      if (!app.sessions.some((s) => s.id === stored.id)) onClose();
    })();
  };

  /** Only the sets that actually changed travel, each named by where it sits in the session. */
  const save = () => {
    if (session === undefined || !hasChanges) return stopEditing();
    if (changesStructure) return saveWhole(session);
    const corrections: SetCorrection[] = [];
    const removals: SetRemoval[] = [];
    let seen = new Map<string, number>();
    draft.forEach((result, resultIndex) => {
      const occurrence = seen.get(result.exerciseID) ?? 0;
      seen.set(result.exerciseID, occurrence + 1);
      if (resultIndex >= session.results.length) return;
      const stored = session.results[resultIndex];
      result.sets.forEach((set, setIndex) => {
        if (setIndex >= stored.sets.length) return;
        if (removed.has(targetID({ resultIndex, setIndex }))) {
          // A set on its way out is not corrected on the way.
          removals.push(SetRemoval.make({ exerciseID: result.exerciseID, occurrence, setIndex }));
          return;
        }
        if (deepEqual(set, stored.sets[setIndex])) return;
        corrections.push(SetCorrection.make({ exerciseID: result.exerciseID, occurrence, setIndex, set }));
      });
    });

    // Sets past the end of what was stored are new, unless taken out again.
    const additions: SetAddition[] = [];
    seen = new Map<string, number>();
    draft.forEach((result, resultIndex) => {
      const occurrence = seen.get(result.exerciseID) ?? 0;
      seen.set(result.exerciseID, occurrence + 1);
      const storedCount = resultIndex < session.results.length ? session.results[resultIndex].sets.length : 0;
      const added = result.sets.filter((_, offset) => offset >= storedCount && !removed.has(targetID({ resultIndex, setIndex: offset })));
      if (added.length > 0) additions.push(SetAddition.make({ exerciseID: result.exerciseID, occurrence, sets: added }));
    });

    if (corrections.length === 0 && removals.length === 0 && additions.length === 0) return stopEditing();
    setIsSaving(true);
    const id = session.id;
    void (async () => {
      // Corrections first, by the indices the reader saw; the removals then take their sets out from the back forward.
      if (corrections.length > 0) await app.correct(corrections, { sessionID: id });
      if (removals.length > 0) await app.removeSets(removals, { sessionID: id });
      if (additions.length > 0) await app.addSets(additions, { sessionID: id });
      setIsSaving(false);
      stopEditing();
      // A session whose last set has gone is gone: there is nothing left for this screen to show.
      if (!app.sessions.some((s) => s.id === id)) onClose();
    })();
  };

  // MARK: - Chrome

  const saveTone = !editing ? SL.Ink.secondary : hasChanges && !isSaving ? SL.Signal.action : SL.Ink.tertiary;

  const header = (
    <HStack style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s3, alignSelf: "stretch", flexShrink: 0 }}>
      <Pressable
        onPress={() => {
          if (hasChanges) setConfirmsDiscard(true);
          else if (editing) stopEditing();
          else onClose();
        }}
        style={{ background: "transparent", padding: 0 }}
      >
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary} style={{ ...slHitTarget(), display: "block" }}>
          {editing ? "Cancel" : "Back"}
        </Text>
      </Pressable>

      <Spacer />

      {shareImage !== undefined && !editing && session !== undefined && (
        <Pressable onPress={() => void share()} aria-label="Share this workout" style={{ background: "transparent", padding: 0 }}>
          <span style={{ ...slHitTarget(), display: "block" }}>
            <SLGlyph name="share" size={20} fixed color={SL.Ink.secondary} />
          </span>
        </Pressable>
      )}

      {/* A saved workout can become a post later, or its post be edited. */}
      {session !== undefined && !editing && session.kind === "workout" && social.me !== undefined && (
        <Pressable onPress={() => setPosting(true)} aria-label={existingPost === undefined ? "Create post" : "Edit post"} style={{ background: "transparent", padding: 0 }}>
          <span style={{ ...slHitTarget(), display: "block" }}>
            <SLGlyph name="people" size={20} fixed color={SL.Ink.secondary} />
          </span>
        </Pressable>
      )}

      {session !== undefined && (
        <Pressable onPress={() => (editing ? save() : startEditing())} disabled={editing && (!hasChanges || isSaving)} style={{ background: "transparent", padding: 0 }}>
          <Text {...slBody(SL.Weight.medium)} color={saveTone} style={{ ...slHitTarget(), display: "block" }}>
            {editing ? "Save" : "Edit"}
          </Text>
        </Pressable>
      )}
    </HStack>
  );

  // MARK: - What the day was

  /** Sets when the session counted them, the stored percentage when it did not. */
  const completionLabel = (s: TrainingSession): string => {
    if (s.plannedSetCount !== undefined && s.completedSetCount !== undefined && s.plannedSetCount > 0) return `${s.completedSetCount} of ${s.plannedSetCount} sets`;
    return `${s.completion}% done`;
  };

  const titleLine = (s: TrainingSession): string => {
    const parts = [s.dayLabel];
    if (s.durationSeconds !== undefined && s.durationSeconds > 0) parts.push(NumberDisplay.minutes(display, s.durationSeconds));
    return parts.join(" · ");
  };

  const previousSession = (s: TrainingSession): TrainingSession | undefined =>
    maxBy(
      app.sessions.filter((x) => x.kind === "workout" && x.dayID === s.dayID && x.date.getTime() < s.date.getTime()),
      (a, b) => a.date.getTime() < b.date.getTime(),
    );

  /** 35: "Tegenover 29 aug · 17 van 17 sets". */
  const againstLine = (s: TrainingSession): string => {
    const parts: string[] = [];
    const previous = previousSession(s);
    if (previous !== undefined) parts.push(`Against ${NumberDisplay.shortDate(display, previous.date)}`);
    parts.push(completionLabel(s));
    return parts.join(" · ");
  };

  const volumeDelta = (s: TrainingSession, volume: number): number | undefined => {
    const previous = previousSession(s);
    if (previous === undefined) return undefined;
    const before = RecordsEngine.volumeLoad(previous.results.flatMap((r) => r.sets));
    if (!(before > 0) || volume === before) return undefined;
    return dec(volume - before);
  };

  /** A correction made offline waits like any other change; the screen says so. */
  const pendingNote = app.pendingChanges.some((change) => change.kind.kind === "correctSessionSets" && change.kind.sessionID === sessionID)
    ? "Correction waiting to sync."
    : undefined;

  const summary = (s: TrainingSession) => {
    const volume = RecordsEngine.volumeLoad(results.flatMap((r) => r.sets));
    const delta = volumeDelta(s, volume);
    return (
      <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch", paddingBottom: SL.Space.s5, position: "relative" }}>
        {/* 35: the date names the screen, the duration travels with the session's own name. */}
        <SLEyebrow text={`Log · ${WeekPlan.fullWeekday(s.date)} ${NumberDisplay.shortDate(display, s.date)}`} />

        {editing ? (
          <>
            <div style={{ paddingTop: SL.Space.s2, alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
              <HStack spacing={SL.Space.s2} style={{ paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: 48, background: SL.Surface.raised, borderRadius: SL.Radius.md }}>
                <style>{`.sl-title-field::placeholder { color: ${SL.Ink.tertiary}; opacity: 1; }`}</style>
                <input
                  className="sl-title-field"
                  aria-label="Workout name"
                  value={titleDraft}
                  placeholder={s.dayLabel}
                  enterKeyHint="done"
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  style={{
                    flex: "1 1 0",
                    minWidth: 0,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    padding: 0,
                    color: SL.Ink.primary,
                    caretColor: SL.Signal.action,
                    fontFamily: "Archivo, system-ui, sans-serif",
                    fontSize: SL.TypeSize.title,
                    fontWeight: SL.Weight.semibold,
                  }}
                />
                <SFSymbol name="pencil" size={14} weight={600} color={SL.Signal.action} />
              </HStack>
            </div>
            {/* A workout logged afterwards, or with the clock left running, gets its real length here. */}
            <div style={{ paddingTop: SL.Space.s2, alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
              <DurationRow
                minutes={{
                  value: durationDraft ?? Math.max(5, Math.trunc(rounded((s.durationSeconds ?? 0) / 300)) * 5),
                  set: (v) => setDurationDraft(v),
                }}
                note={s.durationSeconds === undefined ? "Not recorded yet" : undefined}
              />
            </div>
          </>
        ) : (
          <Text {...slTitle()} numerals color={SL.Ink.primary} style={{ paddingTop: SL.Space.s2 }}>
            {titleLine(s)}
          </Text>
        )}

        <SLEyebrow text="Volume" style={{ paddingTop: SL.Space.s4 }} />
        <div role="group" aria-label={`Volume ${NumberDisplay.volumeKg(display, volume)}`} style={{ paddingTop: 6, alignSelf: "stretch" }}>
          <SLValueRow>
            <Text {...slDisplay(SL.TypeSize.displayXL)} numerals color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.5} style={slLineHeight(1.04, { size: SL.TypeSize.displayXL })}>
              {NumberDisplay.volumeKg(display, volume)}
            </Text>
            {delta !== undefined && (
              <Text {...slLead()} numerals color={delta > 0 ? SL.Signal.action : SL.Ink.secondary}>
                {NumberDisplay.signedDelta(display, delta)}
              </Text>
            )}
          </SLValueRow>
        </div>

        <Text {...slBody()} numerals color={SL.Ink.secondary} style={{ paddingTop: SL.Space.s2 }}>
          {againstLine(s)}
        </Text>

        {medals.length > 0 && !editing && (
          <VStack spacing={0} style={{ alignSelf: "stretch", alignItems: "stretch", marginTop: SL.Space.s4, paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, ...{ background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.lg, overflow: "hidden" } }}>
            {medals.map((medal, index) => (
              <div key={medal.exerciseID} style={{ position: "relative", paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3 }}>
                <SLMedalRow medal={medal} display={display} />
                {index > 0 && <SLHairline style={{ position: "absolute", top: 0, left: 0, right: 0 }} />}
              </div>
            ))}
          </VStack>
        )}

        {pendingNote !== undefined && (
          <Text {...slMeta()} color={SL.Signal.attention} style={{ paddingTop: SL.Space.s3 }}>
            {pendingNote}
          </Text>
        )}
        <SLHairline style={{ position: "absolute", left: 0, right: 0, bottom: 0 }} />
      </VStack>
    );
  };

  // MARK: - What was logged

  const value = (set: LoggedSet) => `${NumberDisplay.kg(display, set.weightKg ?? 0)} × ${set.reps}`;

  /** Only what the set itself carries: nothing here is inferred from the programme as it stands today. */
  const markers = (set: LoggedSet, isRecord: boolean) => {
    const out: ReactNode[] = [];
    if (isRecord) out.push(<Text key="pr" {...micro(SL.Signal.action)}>PR</Text>);
    if (set.side !== undefined) {
      out.push(
        <Text key="side" {...micro(SL.Ink.secondary, true)}>
          {set.sideReps !== undefined ? SideReps.label(set.sideReps) : SetSide.label(set.side)}
        </Text>,
      );
    }
    if (set.rirReported !== undefined) {
      out.push(
        set.rirReported === 0 ? (
          <Text key="rir" {...micro(SL.Signal.attention)}>to failure</Text>
        ) : (
          <Text key="rir" {...slMeta()} numerals color={SL.Ink.tertiary}>
            {`RIR ${set.rirReported}`}
          </Text>
        ),
      );
    }
    if ((set.flags & SetFlags.failed) !== 0) out.push(<Text key="failed" {...micro(SL.Signal.loss)}>failed</Text>);
    if (set.drops.length > 0) {
      out.push(
        <Text key="drops" {...micro(SL.Signal.attention, true)}>
          {"then " + set.drops.map((d) => `${NumberDisplay.number(display, d.weightKg)} × ${d.reps}`).join(", ")}
        </Text>,
      );
    }
    // One mark, never two: the whole set paused, or the reps of it that were.
    if (set.pausedReps !== undefined && set.pausedReps > 0) {
      out.push(<Text key="paused" {...micro(SL.Signal.attention, true)}>{`last ${set.pausedReps} paused`}</Text>);
    } else if (set.modifiers.pauseEnabled) {
      out.push(<Text key="paused" {...micro(SL.Signal.attention)}>pause</Text>);
    }
    if (set.partialReps !== undefined && set.partialReps > 0) out.push(<Text key="partial" {...micro(SL.Signal.attention, true)}>{`partial +${set.partialReps}`}</Text>);
    if (set.origin === "sessionAdded") out.push(<Text key="extra" {...micro(SL.Ink.tertiary)}>extra</Text>);
    if (set.isWarmup) out.push(<Text key="warmup" {...micro(SL.Ink.tertiary)}>warm-up</Text>);
    return (
      <HStack alignment="firstTextBaseline" spacing={SL.Space.s2} style={{ flexWrap: "nowrap" }}>
        {out}
      </HStack>
    );
  };

  const label = (set: LoggedSet, number: number, isRecord: boolean): string => {
    const parts = [`Set ${number}`, NumberDisplay.kg(display, set.weightKg ?? 0), `${set.reps} reps`];
    if (isRecord) parts.push("personal record");
    if (set.sideReps !== undefined) parts.push(`left ${set.sideReps.left}, right ${set.sideReps.right} reps`);
    else if (set.side !== undefined) parts.push(set.side === "both" ? "both sides" : set.side === "L" ? "left side" : "right side");
    if (set.rirReported !== undefined) parts.push(set.rirReported === 0 ? "to failure" : `RIR ${set.rirReported}`);
    if ((set.flags & SetFlags.failed) !== 0) parts.push("failed");
    if (set.drops.length > 0) parts.push("drop set: then " + set.drops.map((d) => `${NumberDisplay.kg(display, d.weightKg)} × ${d.reps}`).join(", "));
    if (set.pausedReps !== undefined && set.pausedReps > 0) parts.push(`the last ${set.pausedReps} paused`);
    else if (set.modifiers.pauseEnabled) parts.push("paused");
    if (set.partialReps !== undefined && set.partialReps > 0) parts.push(`${set.partialReps} partial reps`);
    if (set.origin === "sessionAdded") parts.push("extra set");
    if (set.isWarmup) parts.push("warm-up");
    return parts.join(", ");
  };

  const rowContent = (set: LoggedSet, number: number, isRecord: boolean) => (
    <HStack alignment="firstTextBaseline" spacing={SL.Space.s2} style={{ flex: "1 1 0", minWidth: 0 }}>
      <HStack alignment="firstTextBaseline" spacing={SL.Space.s3} style={{ flexShrink: 0 }}>
        <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} numerals color={SL.Ink.tertiary} style={{ width: 20 }}>
          {`${number}`}
        </Text>
        <Text {...slLead()} numerals color={SL.Ink.primary}>
          {value(set)}
        </Text>
      </HStack>
      <Spacer minLength={SL.Space.s2} />
      {markers(set, isRecord)}
    </HStack>
  );

  const row = (set: LoggedSet, number: number, isRecord: boolean, target: Target) => {
    if (editing) {
      return (
        <div key={targetID(target)} style={{ paddingTop: SL.Space.s2 + 6, alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
          <Pressable
            onPress={() => setCorrecting(target)}
            aria-label={label(set, number, isRecord)}
            style={{ background: SL.Surface.raised, borderRadius: SL.Radius.md, padding: SL.Metric.border, textAlign: "left" }}
          >
            <HStack spacing={SL.Space.s2} style={{ paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: SL.Space.hitMin }}>
              {rowContent(set, number, isRecord)}
              <SLGlyph name="chevronRight" size={20} color={SL.Ink.tertiary} />
            </HStack>
          </Pressable>
        </div>
      );
    }
    return (
      <div key={targetID(target)} role="group" aria-label={label(set, number, isRecord)} style={{ paddingTop: SL.Space.s2, alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
        <div style={{ minHeight: SL.Space.hitMin, display: "flex", alignItems: "center" }}>{rowContent(set, number, isRecord)}</div>
      </div>
    );
  };

  const block = (result: ExerciseResult, resultIndex: number, s: TrainingSession) => {
    // Records are judged against what came before that day, never against sessions logged since.
    const history = ExerciseHistory.build({ exerciseID: result.exerciseID, modifiers: result.sets[0]?.modifiers ?? SetModifiers.none, from: app.sessions, before: s.date });
    const medal = editing ? undefined : medals.find((m) => m.exerciseID === result.exerciseID);
    const stoodInFor = result.sets.map((x) => x.substitutedFrom).find((x) => x !== undefined);
    const visible = visibleSets(result, resultIndex);
    return (
      <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch" }}>
        <HStack spacing={SL.Space.s2}>
          {editing ? (
            <Pressable onPress={() => setPickingExercise(resultIndex)} aria-label={`Change exercise, now ${result.name}`} style={{ background: "transparent", padding: 0 }}>
              <HStack spacing={6} style={{ minHeight: SL.Space.hitMin }}>
                <SLEyebrow text={result.name} />
                <SFSymbol name="pencil" size={12} weight={600} color={SL.Signal.action} />
              </HStack>
            </Pressable>
          ) : (
            <SLEyebrow text={result.name} />
          )}
          {medal !== undefined && <SLMedal place={medal.place} size={18} />}
        </HStack>
        {stoodInFor !== undefined && (
          <Text {...slMeta()} color={SL.Ink.tertiary} style={{ paddingTop: 2 }}>
            {`stood in for ${app.exercise(stoodInFor).name.toLowerCase()}`}
          </Text>
        )}

        {visible.map((entry, position) =>
          row(
            entry.set,
            position + 1,
            RecordsEngine.isLoadPR({ set: entry.set, history, earlierInSession: result.sets.slice(0, entry.index) }),
            { resultIndex, setIndex: entry.index },
          ),
        )}

        {editing && visible.length === 0 && (
          <Text {...slMeta()} color={SL.Ink.tertiary} style={{ paddingTop: SL.Space.s2 }}>
            No sets. Add one, or this exercise is left out when you save.
          </Text>
        )}
        {editing && (
          <div style={{ paddingTop: 6, alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
            <Pressable onPress={() => addSet(resultIndex)} style={{ position: "relative", minHeight: SL.Space.hitMin, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: SL.Signal.action }}>
              <SFSymbol name="plus" size={SL.TypeSize.body} weight={500} color={SL.Signal.action} />
              <Text size={SL.TypeSize.body} weight={SL.Weight.medium} color={SL.Signal.action}>
                Add set
              </Text>
              <DashedBorder color={colorOpacity(SL.Signal.action, 0.45)} radius={SL.Radius.md} dash="4 4" />
            </Pressable>
          </div>
        )}
      </VStack>
    );
  };

  const exercises = (s: TrainingSession) => (
    <VStack alignment="leading" spacing={SL.Space.s4} style={{ paddingTop: SL.Space.s5, alignSelf: "stretch" }}>
      {results.map((result, index) =>
        editing || visibleSets(result, index).length > 0 ? (
          <Fragment key={index}>
            {block(result, index, s)}
            {index < results.length - 1 && <SLHairline />}
          </Fragment>
        ) : null,
      )}
    </VStack>
  );

  // MARK: - Correcting

  const correctionSheet = (target: Target) => {
    if (!(target.resultIndex < draft.length && target.setIndex < draft[target.resultIndex].sets.length)) return null;
    const result = draft[target.resultIndex];
    return (
      <SetCorrectionSheet
        key={targetID(target)}
        exerciseName={result.name}
        setNumber={target.setIndex + 1}
        increment={Exercise.incrementKg(app.exercise(result.exerciseID))}
        display={display}
        original={result.sets[target.setIndex]}
        onApply={(corrected) => {
          setDraft(draft.map((r, i) => (i === target.resultIndex ? { ...r, sets: r.sets.map((x, j) => (j === target.setIndex ? corrected : x)) } : r)));
          setCorrecting(undefined);
        }}
        onDelete={() => {
          setCorrecting(undefined);
          if (remainingSetCount <= 1) setConfirmsLastSet(target);
          else remove(target);
        }}
        onClose={() => setCorrecting(undefined)}
      />
    );
  };

  const pickedSelected = pickingExercise !== undefined && pickingExercise < draft.length ? draft[pickingExercise].exerciseID : undefined;
  const sheetBody = { display: "flex", flexDirection: "column" as const, flex: "1 1 0", minHeight: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, height: "100%", width: "100%", background: SL.Surface.ground }}>
      {header}

      {session !== undefined ? (
        <ScrollView style={{ flex: "1 1 0" }}>
          <VStack alignment="leading" spacing={0} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s12 }}>
            {summary(session)}
            {exercises(session)}
            <Text {...slMeta()} color={SL.Ink.tertiary} style={{ ...slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.meta }), paddingTop: SL.Space.s5 }}>
              Saved as you did it. Changes to your plan don't affect this session.
            </Text>

            {/* The whole workout, out of the account. Last on the page and in the loss red. */}
            {!editing && (
              <div style={{ paddingTop: SL.Space.s8, alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
                <Pressable onPress={() => setConfirmsDelete(true)} style={{ background: "transparent", padding: 0 }}>
                  <HStack spacing={SL.Space.s2} style={{ ...slHitTarget(), justifyContent: "center", color: SL.Signal.loss }}>
                    <SLGlyph name="trash" size={17} color={SL.Signal.loss} />
                    <Text size={SL.TypeSize.body} weight={SL.Weight.medium} color={SL.Signal.loss}>
                      Delete this session
                    </Text>
                  </HStack>
                </Pressable>
              </div>
            )}
          </VStack>
        </ScrollView>
      ) : (
        // The session is no longer in the account — deleted on the web while this screen was open.
        <>
          <Text {...slBody()} color={SL.Ink.secondary} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s5 }}>
            This session is no longer in your account.
          </Text>
          <Spacer />
        </>
      )}

      <Sheet isPresented={correcting !== undefined} onDismiss={() => setCorrecting(undefined)}>
        {lastCorrecting.current !== undefined && <div style={sheetBody}>{correctionSheet(lastCorrecting.current)}</div>}
      </Sheet>

      <Sheet isPresented={pickingExercise !== undefined} onDismiss={() => setPickingExercise(undefined)}>
        {pickingExercise !== undefined && (
          <div style={sheetBody}>
            <ExercisePickerSheet
              rows={ExercisePicker.rowsSessions({ sessions: app.sessions, favorites: app.favoriteExercises })}
              selected={pickedSelected}
              onPick={(picked) => {
                const index = pickingExercise;
                if (index !== undefined && index < draft.length) {
                  setDraft(draft.map((r, i) => (i === index ? { ...r, exerciseID: picked.exerciseID, name: picked.name } : r)));
                }
                setPickingExercise(undefined);
              }}
              onStar={(picked) => void app.setFavorite({ exerciseID: picked.exerciseID, isFavorite: !picked.isFavorite })}
              onClose={() => setPickingExercise(undefined)}
            />
          </div>
        )}
      </Sheet>

      {session !== undefined && (
        <FullScreenCover isPresented={posting}>
          {posting &&
            (existingPost !== undefined ? (
              <PostComposerView mode={{ kind: "edit", value: existingPost }} onClose={() => setPosting(false)} />
            ) : (
              <PostComposerView mode={{ kind: "create", value: session }} onClose={() => setPosting(false)} />
            ))}
        </FullScreenCover>
      )}

      {/* An alert rather than a dialog, because both answers have to be visible. */}
      <Alert
        isPresented={confirmsLastSet !== undefined}
        onDismiss={() => setConfirmsLastSet(undefined)}
        title="This is the last set of this session."
        message="Without sets there's no session left. It disappears from your log when you save."
        actions={[
          { title: "Keep", role: "cancel", action: () => setConfirmsLastSet(undefined) },
          {
            title: "Delete the session",
            role: "destructive",
            action: () => {
              if (confirmsLastSet !== undefined) remove(confirmsLastSet);
              setConfirmsLastSet(undefined);
            },
          },
        ]}
      />
      <Alert
        isPresented={confirmsDelete}
        onDismiss={() => setConfirmsDelete(false)}
        title="Delete this session?"
        message="All sets of this day disappear from your log and your progress, on the web too."
        actions={[
          { title: "Cancel", role: "cancel" },
          {
            title: "Delete",
            role: "destructive",
            action: () => {
              if (session === undefined) return;
              const id = session.id;
              void (async () => {
                await app.removeSession({ id });
                onClose();
              })();
            },
          },
        ]}
      />
      <ConfirmationDialog
        isPresented={confirmsDiscard}
        onDismiss={() => setConfirmsDiscard(false)}
        title="Discard corrections?"
        message="The session stays as it was."
        actions={[
          { title: "Discard", role: "destructive", action: stopEditing },
          { title: "Cancel", role: "cancel" },
        ]}
      />
    </div>
  );
}
