// SessionView.swift — Redesign 1b · Loggen — the live session.
//
// The tab bar is gone by the time this appears: mid-set there is exactly one
// task, so the session is a full-screen presentation over the tab shell.
//
// Everything a set needs sits in the dock at the foot of the screen, inside
// the thumb's reach: the rest pill, then the input card — weight and reps
// already filled in from what was proposed, one step per tap, and
// `Set opslaan` saying what it will write. Arriving costs no taps, a
// correction costs one, and the next set takes the corrected weight over.
//
// Above it the exercise reads top to bottom: its name, the previous session,
// and one row per set. A row opens the full sheet for that set — to correct
// it, or to say what it was.
//
// Left out on the web: haptics, VoiceOver announcements, `#if DEBUG` launch
// arguments, and the large-text (accessibility size) layouts.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useApp, type AppState } from "../../data/AppState";
import { RIRPreference } from "../../data/RIRPreference";
import {
  Alert, ConfirmationDialog, FullScreenCover, HStack, Menu, Pressable, ScrollView, Sheet, Spacer, Text, VStack,
  UserDefaults, useScenePhase, type DialogAction,
} from "../../design/swiftui";
import { SL, slFont, slListCard, slNumerals } from "../../design/tokens";
import { SLPrimaryButton, colorOpacity } from "../../design/SetlineTokens";
import { DashedBorder, useReduceMotion } from "../../design/support";
import { SFSymbol } from "../../design/SFSymbol";
import { SLSound } from "../../design/SLSound";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLStepper } from "../../design/components/SLStepper";
import { SLUndoToast } from "../../design/components/SLUndoToast";
import { Celebration, SLCelebration } from "../../design/components/SLCelebration";
import { SLFlow } from "../../design/components/SLFlow";
import { SLPress } from "../../design/components/SLPress";
import { SLDoneMark, SLRowButton, slUnbroken } from "../../design/components/SLPieces";
import { SLHairline, slBody, slLead, slMeta, slTitle } from "../../design/components/SLText";
import { SLPillButton, SLWarmupRow, type SLSetRow_Note, type SLSetRow_Phase } from "../../design/components/SLSetRow";
import { SLRestPill } from "../../design/components/SLRestPill";
import type { ActiveSessionSnapshot } from "../../core/Domain/ActiveSession";
import { type DropStep, type ExerciseResult, type LoggedSet, LoggedSet as LoggedSetNS, SetSide, SideReps, type TrainingSession, type WorkoutDay, Exercise } from "../../core/Domain/Model";
import { SessionSlot } from "../../core/Domain/SessionSlot";
import { CustomExercise, ProgramReplacement, ReplacementScope } from "../../core/Domain/Substitution";
import type { Equipment } from "../../core/Domain/Vocabulary";
import { ExerciseHistory } from "../../core/Engine/ExerciseHistory";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { PlateMath } from "../../core/Engine/PlateMath";
import { RestPrescription, RestTimerState } from "../../core/Engine/RestPrescription";
import { Schedule } from "../../core/Engine/Schedule";
import { type SetRowPresentation, SetRowPresenter } from "../../core/Engine/SetRowPresentation";
import { WarmupPlanner } from "../../core/Engine/WarmupPlanner";
import { ExercisePicker, type ExercisePicker_Row } from "../../core/Progress/ExercisePicker";
import type { PainFlag } from "../../core/Domain/PainFlag";
import { closedRange } from "../../core/Support/range";
import { isSameDay } from "../../core/Support/calendar";
import { uuid } from "../../core/Support/swift";
import { ExercisePickerSheet } from "../Progress/ExercisePickerSheet";
import { SwapSheet, type SwapOutcome } from "../Substitution/SwapFlow";
import { DropSetEditor, PerSideRepsTile, SetSidePicker } from "./DropSetEditor";
import { PlateSheet } from "./PlateSheet";
import { RestNotificationSheet } from "./RestNotificationSheet";
import { RestNotifier } from "./RestNotifier";
import { SessionCompleteView } from "./SessionCompleteView";
import { SessionRunner, SessionRunner_ExerciseSlot, useSessionRunner } from "./SessionRunner";
import { SetEntrySheet } from "./SetEntrySheet";
import { WorkoutReminder } from "./WorkoutReminder";

const S = SessionRunner_ExerciseSlot;

/** What just happened, and how to take it back. */
export interface SessionView_SessionToast {
  id: string;
  message: string;
  undo?: () => void;
}

/** `.onChange(of:)`: runs when `value` changes, never on the first draw. */
function useOnChange<T>(value: T, action: (value: T) => void) {
  const first = useRef(true);
  const last = useRef(value);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      last.current = value;
      return;
    }
    if (Object.is(last.current, value)) return;
    last.current = value;
    action(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

/** `.onLongPressGesture` / `.contextMenu`'s press: half a second, without moving. */
function LongPressArea({ onLongPress, children, style }: { onLongPress: () => void; children?: ReactNode; style?: CSSProperties }) {
  const timer = useRef<number | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | undefined>(undefined);
  const fired = useRef(false);
  const cancel = () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
  };
  return (
    <div
      style={style}
      onPointerDown={(e) => {
        fired.current = false;
        origin.current = { x: e.clientX, y: e.clientY };
        cancel();
        timer.current = window.setTimeout(() => {
          fired.current = true;
          onLongPress();
        }, 500);
      }}
      onPointerMove={(e) => {
        const o = origin.current;
        if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) cancel();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        if (fired.current) {
          e.stopPropagation();
          e.preventDefault();
          fired.current = false;
        }
      }}
    >
      {children}
    </div>
  );
}

export function SessionView(p: {
  day: WorkoutDay;
  app: AppState;
  resuming: ActiveSessionSnapshot | undefined;
  loggingFor?: Date;
  onFinish: (finished: TrainingSession, createPost: boolean) => void;
  onPause: (snapshot: ActiveSessionSnapshot) => void;
  /** Leaves a session nothing was done in, without parking it. */
  onClose: () => void;
}) {
  const app = useApp();
  const reduceMotion = useReduceMotion();
  const scenePhase = useScenePhase();
  const [runnerInstance] = useState(() => new SessionRunner({ day: p.day, app: p.app, restoring: p.resuming, loggingFor: p.loggingFor }));
  const runner = useSessionRunner(runnerInstance);
  const [showsComplete, setShowsComplete] = useState(false);
  const [confirmsEarlyFinish, setConfirmsEarlyFinish] = useState(false);
  const [showsSwap, setShowsSwap] = useState(false);
  /** `Schijven`: the plate calculator for the set up next. */
  const [showsPlates, setShowsPlates] = useState(false);
  const [toast, setToast] = useState<SessionView_SessionToast | undefined>(undefined);
  /** The suggestion's reasoning, asked for from its line. */
  const [explainsSuggestion, setExplainsSuggestion] = useState(false);
  /** A new PR, marked the moment it is saved. */
  const [celebration, setCelebration] = useState<Celebration | undefined>(undefined);
  /** The session's full exercise list, folded away until asked for. */
  const [showsExerciseList, setShowsExerciseList] = useState(false);
  /** Picking an exercise to add to this session. */
  const [addingExercise, setAddingExercise] = useState(false);
  const [asksAboutNotifications, setAsksAboutNotifications] = useState(false);
  /**
   * Reps chosen in the input card for a set that is not saved yet. Kept by
   * set, so the next set opens on its own target again.
   */
  const [repsDraft, setRepsDraft] = useState<Record<string, number>>({});
  /** Reps in reserve picked in the card, where the set asks for them. */
  const [rirDraft, setRirDraft] = useState<Record<string, number>>({});
  /**
   * Of the reps in the card, how many were paused or partial, chosen on
   * the card's chips. `0` is turned off by hand; no entry means the set
   * takes over what the exercise's previous set had.
   */
  const [pausedDraft, setPausedDraft] = useState<Record<string, number>>({});
  const [partialDraft, setPartialDraft] = useState<Record<string, number>>({});
  /** The side a one-sided exercise's open set is done with. */
  const [sideDraft, setSideDraft] = useState<Record<string, SetSide>>({});
  /** Taken to failure on purpose — stored as RIR 0. */
  const [failureDraft, setFailureDraft] = useState<Set<string>>(new Set());
  /** The rest's clock, turned into a field to type a length of its own. */
  const [typingRest, setTypingRest] = useState<string | undefined>(undefined);
  /** A drop set's lighter rounds, while the set is open. */
  const [dropsDraft, setDropsDraft] = useState<Record<string, DropStep[]>>({});
  /**
   * Reps per side on a two-sided set of a one-sided exercise; present
   * means the reps tile counts the sides apart.
   */
  const [sideRepsDraft, setSideRepsDraft] = useState<Record<string, SideReps>>({});
  /** Open sets whose weight or reps were moved by hand: "aangepast". */
  const [adjusted, setAdjusted] = useState<Set<string>>(new Set());
  /**
   * The weight each open set had before it was touched, so "aangepast" can
   * tell a correction from a value stepped back to where it started.
   */
  const openingWeight = useRef<Record<string, number>>({});
  /** The set sheet opens on its number field — reached from the weight. */
  const [entryOpensOnKeypad, setEntryOpensOnKeypad] = useState(false);
  /** Latest drafts, for the work done after a state change in the same tap. */
  const repsDraftRef = useRef(repsDraft);
  repsDraftRef.current = repsDraft;

  const topAnchor = useRef<HTMLDivElement>(null);
  const activeAnchor = useRef<HTMLDivElement>(null);

  const setDraft = <V,>(set: (f: (m: Record<string, V>) => Record<string, V>) => void, id: string, value: V | undefined) =>
    set((m) => {
      const next = { ...m };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });

  // MARK: - Lifecycle

  useEffect(() => {
    const id = window.setInterval(() => runner.tick(), 1000);
    return () => window.clearInterval(id);
  }, [runner]);

  // Rest is over. The notification covers the background; this is the
  // foreground's equivalent, felt without looking where the phone can.
  useOnChange(runner.restCompletions, () => {
    try {
      navigator.vibrate?.([250, 120, 250]);
    } catch {
      /* no vibration on this device */
    }
    SLSound.play("chime");
  });

  useEffect(() => {
    const id = toast?.id;
    if (!id) return;
    const t = window.setTimeout(() => setToast((current) => (current?.id === id ? undefined : current)), SL.Metric.undoWindow * 1000);
    return () => window.clearTimeout(t);
  }, [toast?.id]);

  useEffect(() => {
    runner.configureWarmups({ hidden: app.hiddenWarmups });
    runner.resumeRestSignals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useOnChange(app.hiddenWarmups, (hidden) => runner.configureWarmups({ hidden }));

  // Kept on the phone after every set and whenever the app leaves the
  // foreground: the browser may drop a backgrounded page, and the workout
  // must be there when it opens again.
  useOnChange(runner.completedSetCount, () => keepOpen());
  useOnChange(scenePhase, (phase) => {
    switch (phase) {
      case "background":
        keepOpen();
        if (!runner.isUntouched) WorkoutReminder.schedule({ dayLabel: runner.day.short, paused: false });
        break;
      case "active":
        WorkoutReminder.cancel();
        break;
    }
  });

  // ScrollViewReader.
  useOnChange(runner.completedSetCount, () => {
    activeAnchor.current?.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  });
  useOnChange(runner.currentIndex, () => {
    topAnchor.current?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  });

  /**
   * Artboard 07: asked in the one moment where the answer is obvious — a
   * set is logged, the rest is running, and the phone is about to go in a
   * pocket. Asked once per install, and never if the reader has already
   * answered the OS.
   */
  const askAboutNotificationsIfWorthIt = async () => {
    const key = "setline.notifications.asked";
    if (UserDefaults.get<boolean>(key) === true) return;
    if (runner.restTimer === undefined) return;
    if ((await RestNotifier.status()) !== "notDetermined") return;
    UserDefaults.set(key, true);
    setAsksAboutNotifications(true);
  };

  const closeEntry = () => {
    runner.editing = undefined;
    runner.editingStartsPartial = false;
    setEntryOpensOnKeypad(false);
  };

  const show = (message: string, undo: (() => void) | undefined) => {
    setToast({
      id: uuid(),
      message,
      undo: undo
        ? () => {
            undo();
            setToast(undefined);
          }
        : undefined,
    });
  };

  /**
   * Everything the swap sheet can decide, applied in one place. Every
   * change that can be taken back says so for the design system's undo
   * window, right above the primary action.
   */
  const handle = (outcome: SwapOutcome) => {
    const index = runner.currentIndex;
    setShowsSwap(false);
    switch (outcome.kind) {
      case "reorder": {
        const plan = outcome.value;
        runner.takeReorder(plan);
        show(`You'll come back to ${plan.current.name} later.`, () => {
          runner.currentIndex = index;
        });
        break;
      }
      case "substitute": {
        const exercise = outcome._0;
        runner.substitute({ slotIndex: index, with: exercise, reason: outcome._1 });
        const change = runner.latestUndo({ slotIndex: index })?.id;
        show(`For today: ${exercise.name}. Weight starts empty.`, () => {
          runner.undoChange({ slotIndex: index, ifLatestIs: change });
        });
        break;
      }
      case "replaceInProgram": {
        const exercise = outcome._0;
        const scope = outcome._1;
        // The origin is what the *program* says, not what a temporary
        // swap left standing here.
        const origin = runner.substitutedOrigin({ slotIndex: index }) ?? runner.slots[index].exercise;
        const replacement = ProgramReplacement.make({
          originExerciseID: origin.id,
          substituteExerciseID: exercise.id,
          scope,
          dayID: runner.day.id,
        });
        runner.replaceInProgram({ slotIndex: index, with: exercise, recording: replacement });
        void app.replaceInProgram(replacement);
        const change = runner.latestUndo({ slotIndex: index })?.id;
        show(`${exercise.name} is now in your plan · ${ReplacementScope.label(scope).toLowerCase()}.`, () => {
          // Only while this change is still the latest: the header line
          // may already have reversed it.
          const point = runner.undoChange({ slotIndex: index, ifLatestIs: change });
          const record = point?.replacement;
          if (!record) return;
          void app.undoReplacement(record);
        });
        break;
      }
      case "custom": {
        const custom = outcome.value;
        void app.addCustomExercise(custom);
        runner.substitute({ slotIndex: index, with: CustomExercise.exercise(custom), reason: "preference" });
        const change = runner.latestUndo({ slotIndex: index })?.id;
        show(`${custom.name} added. Set 1 is a calibration set.`, () => {
          runner.undoChange({ slotIndex: index, ifLatestIs: change });
        });
        break;
      }
      case "reduceLoad": {
        const previous = runner.reduceLoad({ slotIndex: index });
        show("Weight two steps lighter. Adjust it if that's not right.", () => {
          runner.restoreOpenWeights({ slotIndex: index, from: previous });
        });
        break;
      }
      case "limitRange":
        // The option promised these reps would be logged as partial, so the
        // next set opens that way — once the swap sheet has left.
        window.setTimeout(() => {
          if (!runner.beginPartialSet({ slotIndex: index })) {
            show("All sets of this exercise are already logged.", undefined);
          }
        }, 450);
        break;
      case "skipExercise":
        if (runner.nextSlotIndex !== undefined) {
          runner.advance();
          show("Skipped. That costs your progress nothing.", () => {
            runner.currentIndex = index;
          });
        } else {
          show("That was the last exercise. Finish the session when you're ready.", undefined);
        }
        break;
    }
  };

  /**
   * Adds a working set to the exercise on screen, for this session only.
   * Nothing is logged: the new row is simply the next one up.
   */
  const addSet = () => {
    const index = runner.currentIndex;
    const row = runner.addSet({ slotIndex: index });
    if (!row) return;
    show(`Set ${row.index + 1} added. Just for this session.`, () => {
      runner.removeUntouchedAddedSet({ slotIndex: index, setID: row.id });
    });
  };

  /**
   * Takes an added set out again. A logged one was confirmed in the sheet
   * first; either way the toast can put it back.
   */
  const removeSet = (slot: number, set: number) => {
    closeEntry();
    const removed = runner.removeSet({ slotIndex: slot, setIndex: set });
    if (!removed) return;
    show(`Set ${set + 1} removed.`, () => runner.restore(removed, { slotIndex: slot }));
  };

  // MARK: - Top bar

  /**
   * Nothing to keep: a fresh session left as it opened. A resumed one always
   * has something — closing it would throw away its earlier sets.
   */
  const leavesWithNothing = runner.isUntouched && p.resuming === undefined;

  /**
   * Pausing keeps the session exactly as it stands. A session in which
   * nothing was done has nothing to keep, and simply closes.
   */
  const leave = () => {
    runner.stopRestSignals();
    if (leavesWithNothing) {
      p.onClose();
    } else {
      WorkoutReminder.schedule({ dayLabel: runner.day.short, paused: true });
      p.onPause(runner.snapshot());
    }
  };

  /** The workout as it stands, kept as still open (not paused). */
  function keepOpen() {
    if (runner.isUntouched) return;
    const snapshot = { ...runner.snapshot(), runningSince: new Date() };
    app.keepOpenSession(snapshot);
  }

  const sessionLine = (): string => {
    const count = `${runner.completedSetCount} of ${runner.plannedSetCount} sets`;
    if (runner.isLoggedAfterwards) {
      return `${Schedule.weekdayLabel(runner.startedAt).toLowerCase()} ${NumberDisplay.shortDate(app.display, runner.startedAt)} · ${count}`;
    }
    return `session ${SLRestPill.clockLabel(runner.elapsedSeconds)} · ${count}`;
  };

  /**
   * A workout being written down afterwards has no clock to show — it
   * names the day it is being written for instead, so the sets can never
   * land on the wrong date without anyone noticing.
   */
  const clockLine = (
    <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} numerals color={colorOpacity(SL.Ink.primary, 0.62)} lineLimit={1} minimumScaleFactor={0.8}>
      {sessionLine()}
    </Text>
  );

  /**
   * The way out on the left — nothing is lost by taking it — and on the
   * right the clock, the count, and `Afronden` once there is something to
   * finish.
   */
  const topBar = (
    <VStack alignment="leading" spacing={0} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.gutterSession, alignSelf: "stretch" }}>
      <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
        <Pressable
          onPress={leave}
          aria-label={leavesWithNothing ? "Back to Training" : "Pause the session"}
          style={{ background: "transparent", minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", gap: 2, color: SL.Ink.secondary, flexShrink: 0, whiteSpace: "nowrap" }}
        >
          <SLGlyph name="chevronLeft" size={18} />
          <Text {...slBody()} color={SL.Ink.secondary} lineLimit={1}>{leavesWithNothing ? "Training" : "Pause"}</Text>
        </Pressable>
        <Spacer minLength={0} />
        {clockLine}
        {runner.hasProgress && !runner.isComplete && (
          <Pressable
            onPress={() => setConfirmsEarlyFinish(true)}
            style={{ background: "transparent", minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", flexShrink: 0, whiteSpace: "nowrap" }}
          >
            <Text {...slBody()} color={SL.Ink.secondary} lineLimit={1}>Finish</Text>
          </Pressable>
        )}
      </HStack>
    </VStack>
  );

  // MARK: - The exercise

  const current = runner.current;
  const currentIndex = runner.currentIndex;

  /** "Next: Incline bench press" */
  const headSubtitle = (): string => {
    const next = runner.nextSlotIndex;
    if (next === undefined) return "Last exercise";
    return `Next: ${runner.slots[next].exercise.name}`;
  };

  const segmentColor = (index: number, slot: SessionRunner_ExerciseSlot): string => {
    if (index === runner.currentIndex) return SL.Signal.action;
    if (S.isComplete(slot)) return SL.Ink.secondary;
    return SL.Surface.hairlineStrong;
  };

  const navArrow = (symbol: string, label: string, enabled: boolean, action: () => void) => (
    <SLPress scale={0.92} disabled={!enabled} aria-label={label} onPress={action} style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <span style={{ width: 36, height: 36, borderRadius: 999, background: SL.Surface.raised2, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <SFSymbol name={symbol} size={15} weight={600} color={enabled ? SL.Ink.primary : colorOpacity(SL.Ink.tertiary, 0.5)} />
      </span>
    </SLPress>
  );

  /**
   * Where you are, said in words, with the way to the previous and next
   * exercise and to the whole list — visible buttons, never a gesture to
   * discover.
   */
  const exerciseNavigator = (
    <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      {navArrow("chevron.left", "Previous exercise", runner.currentIndex > 0, () => {
        runner.currentIndex = runner.currentIndex - 1;
      })}
      <Pressable
        onPress={() => setShowsExerciseList(!showsExerciseList)}
        aria-label={`Exercise ${runner.currentIndex + 1} of ${runner.slots.length}`}
        style={{ flex: "1 1 0", minWidth: 0, minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: 36, borderRadius: 999, background: SL.Surface.raised2 }}>
          <Text {...slMeta(SL.Weight.semibold)} numerals color={SL.Ink.primary}>{`Exercise ${runner.currentIndex + 1} of ${runner.slots.length}`}</Text>
          <SFSymbol name={showsExerciseList ? "chevron.up" : "chevron.down"} size={11} weight={600} color={SL.Ink.secondary} />
        </span>
      </Pressable>
      {navArrow("chevron.right", "Next exercise", runner.nextSlotIndex !== undefined, () => runner.advance())}
    </HStack>
  );

  /**
   * The exercise is its own title; `Wissel` sits beside it, visibly
   * secondary to logging but always on screen. Long-press is a shortcut for
   * people who know it, never the only way in.
   */
  const exerciseHead = (
    <div ref={topAnchor} style={{ alignSelf: "stretch", scrollMarginTop: SL.Space.s2 }}>
      <VStack alignment="leading" spacing={SL.Space.s3}>
        {exerciseNavigator}
        {/* Where you are in the session, one segment per exercise. The bar is also the way to the full list. */}
        <Pressable
          onPress={() => setShowsExerciseList(!showsExerciseList)}
          aria-label={`Exercise ${runner.currentIndex + 1} of ${runner.slots.length}`}
          style={{ alignSelf: "stretch", minHeight: 20, display: "flex", alignItems: "center", gap: 3, background: "transparent" }}
        >
          {runner.slots.map((slot, index) => (
            <span key={S.id(slot)} style={{ flex: "1 1 0", height: 4, borderRadius: 999, background: segmentColor(index, slot) }} />
          ))}
        </Pressable>
        <HStack alignment="center" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
          <LongPressArea onLongPress={() => setShowsSwap(true)} style={{ flex: "1 1 0", minWidth: 0 }}>
            <VStack alignment="leading" spacing={2}>
              <Text {...slTitle()} lineHeight={SL.LineHeight.title} color={SL.Ink.primary} as="h2">{current.exercise.name}</Text>
              <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} style={{ alignSelf: "stretch" }}>{headSubtitle()}</Text>
            </VStack>
          </LongPressArea>
          <SLPillButton onPress={() => setShowsSwap(true)} aria-label={`Swap ${current.exercise.name}`}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Swap
              <SLGlyph name="chevronRight" size={14} color={SL.Ink.secondary} />
            </span>
          </SLPillButton>
        </HStack>
      </VStack>
    </div>
  );

  /** "Bewaard: Flat bench press · 1 set" */
  const preservedLine = (results: ExerciseResult[]): string => {
    const parts = results.map((r) => `${r.name} · ${r.sets.length} ${r.sets.length === 1 ? "set" : "sets"}`);
    return "Kept: " + parts.join(", ");
  };

  /**
   * Reverses the latest change in the current slot — and, when that was a
   * program change, takes it out of the program too.
   */
  const undoLatestChange = () => {
    const index = runner.currentIndex;
    const point = runner.undoChange({ slotIndex: index });
    if (!point) return;
    setToast(undefined);
    const replacement = point.replacement;
    if (replacement) {
      void app.undoReplacement(replacement);
      show(`${app.exercise(replacement.originExerciseID).name} is back in your plan.`, undefined);
    }
  };

  /**
   * The quiet, session-long way back from a swap or a program change: a
   * line and a text action, never a button that competes with logging.
   */
  const undoLine = (text: string, accessibility: string) => (
    <HStack alignment="center" spacing={SL.Space.s3} style={{ alignSelf: "stretch", paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1, marginTop: -SL.Space.s2, marginBottom: -SL.Space.s2 }}>
      <Text {...slMeta()} color={SL.Ink.secondary}>{text}</Text>
      <Spacer minLength={SL.Space.s2} />
      <Pressable onPress={undoLatestChange} aria-label={accessibility} style={{ background: "transparent", minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", flexShrink: 0 }}>
        <Text {...slMeta(SL.Weight.semibold)} color={SL.Signal.action}>Undo</Text>
      </Pressable>
    </HStack>
  );

  /**
   * Where the exercise on screen came from, when it is not what the
   * programme had here — with the way back, which stays for the whole
   * session — and the work that was done before a swap.
   */
  const changeLines = (): ReactNode[] => {
    const out: ReactNode[] = [];
    // Before the calibration set, "geen historiek" is said once, on the
    // line that already says where the exercise came from.
    const calibrating = runner.calibrationPrompt({ slotIndex: currentIndex }) !== undefined;
    const noHistory = calibrating ? " · no history" : "";
    const origin = runner.substitutedOrigin({ slotIndex: currentIndex });
    const replacement = runner.latestUndo({ slotIndex: currentIndex })?.replacement;
    if (origin) {
      out.push(<div key="swapped" style={{ alignSelf: "stretch" }}>{undoLine(`Swapped from ${origin.name}${noHistory}`, `Undo the swap from ${origin.name}`)}</div>);
    } else if (replacement) {
      // A program change stays reversible here until the workout ends.
      // The toast is the quick way back; this one is still there after
      // the toast has gone. After the workout, undo belongs to program
      // settings.
      const from = app.exercise(replacement.originExerciseID);
      out.push(
        <div key="replaced" style={{ alignSelf: "stretch" }}>
          {undoLine(`Replaces ${from.name} in your plan${noHistory}`, `Undo replacing ${from.name} in your plan`)}
        </div>,
      );
    }
    if (S.preserved(current).length > 0) {
      // Work done here before a swap is kept, and the screen says so.
      out.push(
        <Text key="kept" {...slMeta()} numerals color={SL.Ink.secondary} style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>
          {preservedLine(S.preserved(current))}
        </Text>,
      );
    }
    return out;
  };

  /** A dot and one sentence: the quietest way the screen can say something. */
  const hintLine = (text: string, tone: string, explains = false) => (
    <div style={{ display: "flex", alignItems: "center", minHeight: SL.Space.hitMin, paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1, alignSelf: "stretch" }}>
      <HStack alignment="top" spacing={SL.Space.s2} style={{ flex: "1 1 0", minWidth: 0 }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: tone, flexShrink: 0, marginTop: 6 }} />
        <Text {...slBody(SL.Weight.medium)} numerals color={SL.Ink.primary} style={{ flex: "1 1 0", textAlign: "left" }}>{slUnbroken(text)}</Text>
        {explains && <SFSymbol name="info.circle" size={14} color={SL.Ink.tertiary} style={{ marginTop: 2 }} />}
      </HStack>
    </div>
  );

  /** "↑ 102.5 kg today" where the top of the range is confirmed, the headline where it is close; nothing otherwise. */
  const suggestionLine = (): { text: string; tone: string } | undefined => {
    const proposal = current.proposal;
    switch (proposal.tone) {
      case "ready": {
        // The engine's own suggestion, never the weight the card now
        // holds: lowering it by hand must not read as earned.
        const suggested = proposal.weightKg;
        if (suggested === undefined) return { text: proposal.headline, tone: SL.Signal.action };
        const open = runner.proposedWeight({ slotIndex: currentIndex }) ?? suggested;
        if (open < suggested) {
          return { text: `${NumberDisplay.kg(app.display, suggested)} was suggested · you're on ${NumberDisplay.kg(app.display, open)}`, tone: SL.Ink.secondary };
        }
        return { text: `↑ ${NumberDisplay.kg(app.display, suggested)} today · you earned it`, tone: SL.Signal.action };
      }
      case "close":
        return { text: proposal.headline, tone: SL.Signal.attention };
      case "neutral":
      case "noReference":
        return undefined;
    }
  };

  /**
   * One line above the sets, and only when it adds something the
   * pre-filled numbers don't already say: what a calibration set asks for,
   * or that the weight goes up (or nearly does) today. A plain "keep
   * building" suggestion says nothing the input card doesn't, so it is not
   * drawn at all.
   */
  const aboveTheSets = (): ReactNode => {
    const prompt = runner.calibrationPrompt({ slotIndex: currentIndex });
    if (prompt) return hintLine(prompt.headline, SL.Signal.action);
    if (runner.calibrationSummary({ slotIndex: currentIndex }) !== undefined) {
      // Set 1 is in; the reference it starts is named under the sets.
      return null;
    }
    const line = runner.showsProposal ? suggestionLine() : undefined;
    if (line) {
      return (
        <Pressable onPress={() => setExplainsSuggestion(true)} style={{ background: "transparent", alignSelf: "stretch", textAlign: "left" }}>
          {hintLine(line.text, line.tone, true)}
        </Pressable>
      );
    }
    return null;
  };

  // MARK: - Warm-up

  /**
   * The ramp is shown when there is one to show and nothing else is sitting
   * above the sets: not while a proposal is up, and not once set 1 is
   * written.
   */
  const showsLadder =
    runner.warmupLadder({ slotIndex: currentIndex }).length > 0 && !runner.isWarmupCollapsed({ slotIndex: currentIndex });

  /** "telt niet mee · topset vandaag 102,5 kg × 5" */
  const warmupLine = (): string => {
    const topSet = runner.topSetLabel({ slotIndex: currentIndex });
    if (topSet === undefined) return "doesn't count";
    return `doesn't count · top set today ${topSet}`;
  };

  /**
   * Generated from today's top set, outside the working sets, with no ring
   * and no rest timer — and no taps: it is a reference strip, not a log.
   */
  const warmupSection = () => {
    const ladder = runner.warmupLadder({ slotIndex: currentIndex });
    const rows = SetRowPresenter.warmupRows(ladder);
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        <HStack alignment="center" spacing={SL.Space.s3} style={{ alignSelf: "stretch", paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>
          <VStack alignment="leading" spacing={2}>
            <Text {...slLead()} color={SL.Ink.primary} as="h3">Warm-up</Text>
            <Text {...slMeta()} numerals color={SL.Ink.secondary}>{warmupLine()}</Text>
          </VStack>
          <Spacer minLength={SL.Space.s2} />
          <Pressable
            onPress={() => void app.hideWarmup({ exerciseID: S.planned(current).exerciseID })}
            style={{ background: "transparent", minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", flexShrink: 0 }}
          >
            <Text {...slMeta()} color={SL.Ink.secondary}>Always hide</Text>
          </Pressable>
        </HStack>
        <div style={{ position: "relative", alignSelf: "stretch", padding: SL.Metric.border }}>
          <VStack spacing={0} style={{ alignSelf: "stretch" }}>
            {rows.map((row, index) => (
              <div key={index} style={{ position: "relative", alignSelf: "stretch" }}>
                <SLWarmupRow label={row.indexLabel} value={`${row.weightLabel} × ${row.repsLabel}`} />
                {index > 0 && <SLHairline style={{ position: "absolute", top: 0, left: 0, right: 0 }} />}
              </div>
            ))}
          </VStack>
          <DashedBorder color={SL.Surface.hairlineStrong} radius={SL.Radius.lg} dash="4 4" />
        </div>
        <Text {...slMeta()} lineHeight={SL.LineHeight.body} color={SL.Ink.secondary} style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>
          {WarmupPlanner.footnote({ topSetKg: ladder[ladder.length - 1]?.weightKg ?? 0, formatter: app.display })}
        </Text>
      </VStack>
    );
  };

  // MARK: - The sets

  const openReps = (slotIndex: number, setIndex: number): number => {
    const set = S.sets(runner.slots[slotIndex])[setIndex];
    return repsDraftRef.current[set.id] ?? runner.openingReps({ slotIndex, setIndex });
  };

  /**
   * RIR is the optional third tap. By default an exercise asks it on its
   * last prescribed set and on any set added after it; asking on every set
   * is an Account setting.
   */
  const asksForRIR = (slotIndex: number, setIndex: number): boolean =>
    // The calibration set's reserve sets the weight of the sets after it.
    RIRPreference.everySet ||
    SessionSlot.asksForRIR(runner.slots[slotIndex].model, { at: setIndex }) ||
    (setIndex === 0 && runner.needsCalibration({ slotIndex }));

  /** The exercise's last logged set before this one. */
  const previousLogged = (slotIndex: number, setIndex: number): LoggedSet | undefined =>
    S.sets(runner.slots[slotIndex]).slice(0, setIndex).findLast(LoggedSetNS.isLogged);

  /**
   * Paused reps as the card shows them: only what was chosen on this set.
   * Every set starts plain — nothing is carried over from the set before or
   * read off the plan, so a tag is always one the lifter put there. Never
   * more than the reps.
   */
  const paused = (slotIndex: number, setIndex: number, reps: number): number | undefined => {
    const id = S.sets(runner.slots[slotIndex])[setIndex].id;
    const count = pausedDraft[id] ?? 0;
    return count > 0 ? Math.min(count, reps) : undefined;
  };

  const partial = (slotIndex: number, setIndex: number, reps: number): number | undefined => {
    const id = S.sets(runner.slots[slotIndex])[setIndex].id;
    const count = partialDraft[id] ?? 0;
    return count > 0 ? Math.min(count, reps) : undefined;
  };

  /**
   * The side of a set on an exercise that is not one-sided by nature: none
   * until "One side" is tapped, which picks the side the last set didn't.
   */
  const oneSide = (slotIndex: number, setIndex: number): SetSide | undefined =>
    sideDraft[S.sets(runner.slots[slotIndex])[setIndex].id];

  /**
   * One side is always picked, so a one-sided set never costs a tap:
   * Both by default (one set, both sides, counted once); after a left
   * set the right, after a right set the left.
   */
  const side = (slotIndex: number, setIndex: number): SetSide => {
    const id = S.sets(runner.slots[slotIndex])[setIndex].id;
    const chosen = sideDraft[id];
    if (chosen !== undefined) return chosen;
    return SetSidePicker.defaultSide({ after: previousLogged(slotIndex, setIndex)?.side });
  };

  /** A set that is a personal record gets its moment. */
  const celebrateIfRecord = (slotIndex: number, setIndex: number) => {
    const row = runner.rows({ for: slotIndex }).find((r) => r.index === setIndex);
    const set = S.sets(runner.slots[slotIndex])[setIndex];
    if (!row || row.delta.kind !== "personalRecord" || set?.weightKg === undefined) return;
    setCelebration(
      Celebration.make({
        symbol: "trophy.fill",
        title: "New PR",
        detail: `${runner.slots[slotIndex].exercise.name} · ${NumberDisplay.setReference(app.display, { weightKg: set.weightKg, reps: set.reps })}`,
      }),
    );
  };

  /** One tap: writes the set as the card shows it and starts the rest. */
  const save = (slotIndex: number, setIndex: number) => {
    const slot = runner.slots[slotIndex];
    const set = S.sets(slot)[setIndex];
    // 0 is a set without weight — bodyweight, or a drop to nothing.
    const weight = set.weightKg;
    if (weight === undefined || !(weight >= 0)) return;
    const sides = slot.exercise.unilateral ? sideRepsDraft[set.id] : undefined;
    // Sides counted apart: the set is the weaker side.
    const reps = sides ? SideReps.weaker(sides) : openReps(slotIndex, setIndex);
    if (!(reps > 0)) return;
    runner.log({
      slotIndex,
      setIndex,
      entry: {
        weightKg: weight,
        reps,
        rir: asksForRIR(slotIndex, setIndex) ? rirDraft[set.id] : undefined,
        failed: failureDraft.has(set.id),
        // Only what the chip says, on every exercise alike.
        pausedReps: paused(slotIndex, setIndex, reps),
        partialReps: partial(slotIndex, setIndex, reps),
        side: slot.exercise.unilateral ? side(slotIndex, setIndex) : oneSide(slotIndex, setIndex),
        drops: dropsDraft[set.id] ?? [],
        sideReps: { value: sides },
      },
    });
    SLSound.play("tick");
    celebrateIfRecord(slotIndex, setIndex);
    void askAboutNotificationsIfWorthIt();
  };

  /**
   * The circle on an open row: one tap logs it as shown, like ticking it
   * off. A row without a weight yet opens its sheet instead.
   */
  const quickCheck = (slotIndex: number, setIndex: number) => {
    const set = S.sets(runner.slots[slotIndex])[setIndex];
    const calibrating = setIndex === 0 && runner.needsCalibration({ slotIndex });
    if (calibrating || set.weightKg === undefined || !(set.weightKg >= 0)) {
      setEntryOpensOnKeypad((set.weightKg ?? 0) <= 0);
      runner.editing = { slot: slotIndex, set: setIndex };
      return;
    }
    save(slotIndex, setIndex);
  };

  /** Takes the last open set out, for today; the toast puts it back. */
  const removeLastOpenSet = () => {
    const slot = runner.currentIndex;
    const index = runner.removableSetIndex({ slotIndex: slot });
    if (index === undefined) return;
    const removed = runner.removeSet({ slotIndex: slot, setIndex: index });
    if (!removed) return;
    show(`Set ${index + 1} removed. Just for this session.`, () => runner.restore(removed, { slotIndex: slot }));
  };

  /** What the set was, where that is more than its numbers. */
  const note = (row: SetRowPresentation): SLSetRow_Note | undefined => {
    const d = row.delta;
    switch (d.kind) {
      case "personalRecord":
        return { text: "PR", tone: SL.Signal.action };
      case "failed":
        return { text: "failed", tone: SL.Signal.loss };
      case "paused":
        // "2 pauze-reps" where only some of them were: the count is part
        // of the set, so the row says which reps it describes.
        return { text: d.reps !== undefined ? `last ${d.reps} paused` : "paused", tone: SL.Signal.attention };
      case "partial":
        return { text: `partial +${d.count}`, tone: SL.Signal.attention };
      case "pausedAndPartial":
        // Two true things about one set; neither hides the other.
        return {
          text: `${d.pausedReps !== undefined ? `last ${d.pausedReps} paused` : "paused"} · partial +${d.count}`,
          tone: SL.Signal.attention,
        };
      case "calibration":
        return { text: "calibration", tone: SL.Ink.secondary };
      case "baseline":
        return { text: "baseline", tone: SL.Ink.secondary };
      case "reserve":
        return d.value === 0 ? { text: "to failure", tone: SL.Signal.attention } : { text: `RIR ${d.value}`, tone: SL.Ink.secondary };
      case "difference":
        if (d.value === "=") return undefined;
        return { text: `${d.value} kg`, tone: d.value.startsWith("−") ? SL.Ink.secondary : SL.Signal.action };
      case "reference":
      case "added":
      case "none":
        return undefined;
    }
  };

  /** "Set 2, 85 × 8, vorige keer 82,5 × 8, persoonlijk record" */
  const spoken = (row: SetRowPresentation, value: string, phase: SLSetRow_Phase): string => {
    const name = row.isAdded ? "Extra set" : "Set";
    const parts = [`${name} ${row.indexLabel}`];
    switch (phase) {
      case "done":
        parts.push(value);
        break;
      case "open":
        parts.push(`open, ${value}`);
        break;
      case "pending":
        parts.push(row.weightKind === "awaitingCalibration" ? "follows from set 1" : "to do");
        break;
    }
    const previous = runner.previousSet({ slotIndex: runner.currentIndex, setIndex: row.index });
    if (previous !== undefined) parts.push(`last time ${previous}`);
    const d = row.delta;
    switch (d.kind) {
      case "personalRecord": parts.push("personal record"); break;
      case "failed": parts.push("failed set"); break;
      case "paused": parts.push(d.reps !== undefined ? `${d.reps} paused reps` : "paused set"); break;
      case "partial": parts.push(`${d.count} partial reps`); break;
      case "pausedAndPartial":
        parts.push(`${d.pausedReps !== undefined ? `${d.pausedReps} paused reps` : "paused set"}, ${d.count} partial reps`);
        break;
      case "calibration": parts.push("calibration set"); break;
      case "baseline": parts.push("baseline for this exercise"); break;
      case "reserve": parts.push(d.value === 0 ? "to failure" : `RIR ${d.value}`); break;
      case "difference": parts.push(`${d.value} kilos compared with last session`); break;
      case "added": parts.push("just for this session"); break;
      case "reference":
      case "none":
        break;
    }
    return parts.join(", ");
  };

  /** "+1 drop" after whatever else the row says. */
  const dropped = (n: SLSetRow_Note | undefined, drops: DropStep[]): SLSetRow_Note | undefined => {
    if (drops.length === 0) return n;
    const text = drops.length === 1 ? "+1 drop" : `+${drops.length} drops`;
    if (!n) return { text, tone: SL.Signal.attention };
    return { text: `${n.text} · ${text}`, tone: n.tone };
  };

  /** A done row's note with the side in front: "L · last 3 paused". */
  const sided = (n: SLSetRow_Note | undefined, s: SetSide | undefined, sides?: SideReps): SLSetRow_Note | undefined => {
    if (s === undefined) return n;
    // Sides counted apart say so: "L 8 · R 7".
    const label = sides ? SideReps.label(sides) : SetSide.label(s);
    if (!n) return { text: label, tone: SL.Ink.secondary };
    return { text: `${label} · ${n.text}`, tone: n.tone };
  };

  /** Done: a filled lime check. Open: an empty ring that reads as a box to tick. */
  const checkCircle = (done: boolean) => (
    <span
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: done ? SL.Signal.action : "transparent",
        boxShadow: done ? undefined : `inset 0 0 0 2px ${SL.Ink.tertiary}`,
        flexShrink: 0,
      }}
    >
      {done && <SFSymbol name="checkmark" size={12} weight={700} color={SL.Surface.ground} />}
    </span>
  );

  /** A done or upcoming set: one line. */
  const setLine = (row: SetRowPresentation, slotIndex: number) => {
    const set = S.sets(runner.slots[slotIndex])[row.index];
    const done = row.status === "written";
    const reps = done ? set.reps : openReps(slotIndex, row.index);
    const value: string = done
      ? set.weightKg !== undefined
        ? NumberDisplay.setReference(app.display, { weightKg: set.weightKg, reps: set.reps })
        : "—"
      : row.weightKind === "awaitingCalibration"
        ? "after set 1"
        : `× ${reps}`;
    const n = done ? dropped(sided(note(row), set.side, set.sideReps), set.drops) : undefined;
    const prev = runner.previousSet({ slotIndex, setIndex: row.index });
    const last = prev !== undefined ? `last ${prev}` : undefined;
    return (
      <HStack spacing={0} style={{ alignSelf: "stretch" }}>
        <SLPress
          scale={0.9}
          aria-label={done ? `Set ${row.indexLabel} done, correct it` : `Log set ${row.indexLabel} as shown, ${value}`}
          onPress={() => {
            if (done) {
              setEntryOpensOnKeypad(false);
              runner.editing = { slot: slotIndex, set: row.index };
            } else {
              quickCheck(slotIndex, row.index);
            }
          }}
          style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s3, minHeight: 52, display: "flex", alignItems: "center", flexShrink: 0 }}
        >
          {checkCircle(done)}
        </SLPress>
        <SLRowButton
          aria-label={spoken(row, value, done ? "done" : "pending")}
          onPress={() => {
            setEntryOpensOnKeypad(false);
            runner.editing = { slot: slotIndex, set: row.index };
          }}
          style={{ flex: "1 1 0", minWidth: 0 }}
        >
          <HStack spacing={SL.Space.s3} style={{ paddingRight: SL.Space.s4, minHeight: 52, alignSelf: "stretch", flex: "1 1 0" }}>
            <Text {...slBody()} color={done ? SL.Ink.primary : SL.Ink.secondary} style={{ flexShrink: 0 }}>{row.isAdded ? "Extra set" : `Set ${row.indexLabel}`}</Text>
            <Spacer minLength={SL.Space.s2} />
            {n ? (
              <Text {...slMeta(SL.Weight.semibold)} color={n.tone} lineLimit={1} minimumScaleFactor={0.8}>{n.text}</Text>
            ) : !done && last !== undefined ? (
              <Text {...slMeta()} numerals color={SL.Ink.tertiary}>{last}</Text>
            ) : null}
            <Text {...slBody(done ? SL.Weight.semibold : SL.Weight.regular)} numerals color={done ? SL.Ink.primary : SL.Ink.secondary} align="trailing" style={{ minWidth: 72, flexShrink: 0 }}>
              {value}
            </Text>
            <SLGlyph name="chevronRight" size={12} color={SL.Ink.tertiary} />
          </HStack>
        </SLRowButton>
      </HStack>
    );
  };

  /** Where the numbers in the card came from, in the design's own words. */
  const status = (setIndex: number, set: LoggedSet): string => {
    const slotIndex = runner.currentIndex;
    if (adjusted.has(set.id)) return "adjusted";
    if (setIndex === 0 && runner.needsCalibration({ slotIndex })) return "calibration set";
    const weight = set.weightKg;
    if (weight === undefined) return "no weight yet";
    if (weight === 0) return "no weight";
    const slot = runner.current;
    const reference = ExerciseHistory.mostRecent(slot.history);
    const prior = reference?.sets.find((s) => s.index === set.index);
    if (reference && prior?.weightKg === weight) {
      return `same as ${NumberDisplay.shortDate(app.display, reference.date)}`;
    }
    if (S.sets(slot).slice(0, setIndex).findLast(LoggedSetNS.isLogged)?.weightKg === weight) {
      return "same as your last set";
    }
    if (slot.proposal.weightKg === weight) return "suggested for today";
    return "ready when you are";
  };

  /**
   * "aangepast" holds for as long as the card differs from what it opened
   * on; stepping back to the opening values takes the word away again.
   */
  const markAdjusted = (set: LoggedSet, slotIndex: number, reps: Record<string, number> = repsDraftRef.current) => {
    const sets = S.sets(runner.slots[slotIndex]);
    const position = sets.findIndex((s) => s.id === set.id);
    if (position < 0) return;
    const opening = openingWeight.current[set.id];
    const weightMoved = opening !== undefined ? opening !== (sets[position].weightKg ?? 0) : false;
    const draft = reps[set.id];
    const repsMoved = draft !== undefined ? draft !== runner.openingReps({ slotIndex, setIndex: position }) : false;
    setAdjusted((a) => {
      const next = new Set(a);
      if (weightMoved || repsMoved) next.add(set.id);
      else next.delete(set.id);
      return next;
    });
  };

  /**
   * One step on the weight moves every set still open, which is what makes
   * the next set one tap again: it takes the correction over.
   */
  const moveWeight = (slotIndex: number, set: LoggedSet, delta: number) => {
    if (openingWeight.current[set.id] === undefined) openingWeight.current[set.id] = set.weightKg ?? 0;
    runner.adjustProposedWeight({ slotIndex, by: delta });
    markAdjusted(set, slotIndex);
  };

  /**
   * A typed weight — "82,5" or "82.5" — for this set and every open set
   * after it, as stepping does.
   */
  const typeWeight = (text: string, slotIndex: number, set: LoggedSet) => {
    const cleaned = text.replace(/,/g, ".").trim();
    if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return;
    const typed = Number(cleaned);
    if (!(typed >= 0 && typed < 1000)) return;
    const current = S.sets(runner.slots[slotIndex]).find((s) => s.id === set.id)?.weightKg ?? 0;
    if (typed === current) return;
    if (openingWeight.current[set.id] === undefined) openingWeight.current[set.id] = current;
    runner.adjustProposedWeight({ slotIndex, by: typed - current });
    markAdjusted(set, slotIndex);
  };

  const moveReps = (set: LoggedSet, reps: number) => {
    const next = { ...repsDraftRef.current, [set.id]: reps };
    repsDraftRef.current = next;
    setRepsDraft(next);
    markAdjusted(set, runner.currentIndex, next);
  };

  const steppers = (slotIndex: number, setIndex: number, set: LoggedSet) => {
    const reps = openReps(slotIndex, setIndex);
    const step = Exercise.incrementKg(runner.slots[slotIndex].exercise);
    const changed = adjusted.has(set.id);
    const opening = openingWeight.current[set.id];
    const sides = sideRepsDraft[set.id];
    return (
      <HStack alignment="top" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        <SLStepper
          label={set.weightKg === 0 ? "No weight" : "Weight"}
          display={set.weightKg !== undefined ? NumberDisplay.number(app.display, set.weightKg) : "—"}
          isChanged={changed && (opening !== undefined ? opening !== (S.sets(runner.slots[slotIndex])[setIndex].weightKg ?? 0) : false)}
          valueHint="Type the weight"
          // Tap the number and type it, right here.
          onTyped={(text) => typeWeight(text, slotIndex, set)}
          startsTyping={(set.weightKg ?? 0) <= 0}
          onDecrement={() => moveWeight(slotIndex, set, -step)}
          onIncrement={() => moveWeight(slotIndex, set, step)}
        />
        {sides ? (
          <PerSideRepsTile reps={{ value: sides, set: (v) => setDraft(setSideRepsDraft, set.id, v) }} style={{ width: 140, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 140, flexShrink: 0, display: "flex" }}>
            <SLStepper
              label="Reps"
              display={`${reps}`}
              isChanged={repsDraft[set.id] !== undefined && repsDraft[set.id] !== runner.openingReps({ slotIndex, setIndex })}
              valueHint="Type the reps"
              onTyped={(text) => {
                const typed = /^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined;
                if (typed !== undefined && typed > 0) moveReps(set, Math.min(typed, 100));
              }}
              keyboard="numberPad"
              onDecrement={() => moveReps(set, Math.max(1, reps - 1))}
              onIncrement={() => moveReps(set, reps + 1)}
            />
          </div>
        )}
      </HStack>
    );
  };

  /** An on/off chip: quiet off, amber on, like the counted ones. */
  const toggleChip = (title: string, isOn: boolean, action: () => void) => (
    <Pressable key={title} onPress={action} aria-label={title} style={{ background: "transparent", minHeight: SL.Space.hitMin, display: "flex", alignItems: "center" }}>
      <span
        aria-pressed={isOn}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          color: isOn ? SL.Signal.attention : SL.Ink.secondary,
          paddingLeft: SL.Space.s3,
          paddingRight: SL.Space.s3,
          height: 34,
          borderRadius: 999,
          background: isOn ? colorOpacity(SL.Signal.attention, 0.14) : SL.Surface.raised2,
          boxShadow: isOn ? `inset 0 0 0 1px ${colorOpacity(SL.Signal.attention, 0.5)}` : undefined,
        }}
      >
        <SFSymbol name={isOn ? "checkmark" : "plus"} size={10} weight={700} />
        <Text size={SL.TypeSize.meta} weight={isOn ? SL.Weight.semibold : SL.Weight.medium} color={isOn ? SL.Signal.attention : SL.Ink.secondary}>{title}</Text>
      </span>
    </Pressable>
  );

  /**
   * Off: a quiet chip. On: the chip holds its own − n + count; stepping
   * below one turns it off again.
   */
  const attributeChip = (title: string, count: number | undefined, reps: number, set: (v: number | undefined) => void) => {
    if (count !== undefined) {
      const button = (symbol: string, label: string, action: () => void, disabled = false) => (
        <Pressable
          aria-label={label}
          onPress={action}
          disabled={disabled}
          style={{ width: 36, height: SL.Space.hitMin, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", color: SL.Signal.attention, opacity: disabled ? 0.4 : 1 }}
        >
          <SFSymbol name={symbol} size={12} weight={700} />
        </Pressable>
      );
      return (
        <div
          key={title}
          aria-label={title === "Paused" ? `Last ${count} of ${reps} reps paused` : `${count} partial reps`}
          style={{ display: "flex", alignItems: "center", color: SL.Signal.attention, borderRadius: 999, background: colorOpacity(SL.Signal.attention, 0.14), boxShadow: `inset 0 0 0 1px ${colorOpacity(SL.Signal.attention, 0.5)}` }}
        >
          {button(count > 1 ? "minus" : "xmark", count > 1 ? `Fewer ${title.toLowerCase()} reps` : `Turn off ${title.toLowerCase()}`, () => set(count > 1 ? count - 1 : undefined))}
          <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} numerals lineLimit={1} color={SL.Signal.attention}>
            {title === "Paused" ? `last ${count} paused` : `${count} partial`}
          </Text>
          {button("plus", `More ${title.toLowerCase()} reps`, () => set(Math.min(count + 1, reps)), count >= reps)}
        </div>
      );
    }
    return (
      <Pressable key={title} onPress={() => set(1)} aria-label={title} style={{ background: "transparent", minHeight: SL.Space.hitMin, display: "flex", alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: SL.Ink.secondary, paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, height: 34, borderRadius: 999, background: SL.Surface.raised2 }}>
          <SFSymbol name="plus" size={10} weight={700} />
          <Text size={SL.TypeSize.meta} weight={SL.Weight.medium} color={SL.Ink.secondary}>{title}</Text>
        </span>
      </Pressable>
    );
  };

  /** L / R / Both, for a one-sided exercise only. */
  const sidePicker = (slotIndex: number, setIndex: number) => {
    const id = S.sets(runner.slots[slotIndex])[setIndex].id;
    return (
      <SetSidePicker
        key="side"
        side={{
          value: side(slotIndex, setIndex),
          set: (picked) => {
            // On a two-sided exercise, Both is simply the ordinary set again.
            const plain = picked === "both" && !runner.slots[slotIndex].exercise.unilateral;
            setDraft(setSideDraft, id, plain ? undefined : picked);
            if (picked !== "both") setDraft(setSideRepsDraft, id, undefined);
          },
        }}
      />
    );
  };

  /**
   * The set's rarer facts, in plain sight and off by default: the same four
   * chips on every set of every exercise — Paused, Partial, Failed, Drop
   * set — then the side. A count chip turned on becomes its own
   * "− 3 paused +" inside the card, so a mixed set is logged without
   * leaving it.
   */
  const attributeRow = (slotIndex: number, setIndex: number, set: LoggedSet) => {
    const slot = runner.slots[slotIndex];
    const reps = openReps(slotIndex, setIndex);
    const drops = dropsDraft[set.id] ?? [];
    const step = Exercise.incrementKg(slot.exercise);
    const unilateral = slot.exercise.unilateral;
    const picked = oneSide(slotIndex, setIndex);
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        {/* Chips wrap to a second line rather than hide behind a menu. */}
        <SLFlow spacing={SL.Space.s2}>
          {attributeChip("Paused", paused(slotIndex, setIndex, reps), reps, (v) => setDraft(setPausedDraft, set.id, v ?? 0))}
          {attributeChip("Partial", partial(slotIndex, setIndex, reps), reps, (v) => setDraft(setPartialDraft, set.id, v ?? 0))}
          {toggleChip("Failed", failureDraft.has(set.id), () =>
            setFailureDraft((f) => {
              const next = new Set(f);
              if (next.has(set.id)) next.delete(set.id);
              else next.add(set.id);
              return next;
            }),
          )}
          {drops.length === 0 &&
            toggleChip("Drop set", false, () => setDraft(setDropsDraft, set.id, [DropSetEditor.next(set.weightKg ?? 0, { reps, step })]))}
          {unilateral && sidePicker(slotIndex, setIndex)}
          {/* Any exercise can be done one side at a time: off until asked. */}
          {!unilateral &&
            (picked === undefined
              ? toggleChip("One side", false, () =>
                  setDraft(setSideDraft, set.id, previousLogged(slotIndex, setIndex)?.side === "L" ? "R" : "L"),
                )
              : sidePicker(slotIndex, setIndex))}
          {/* Both sides in one set, and they didn't match: count them apart. */}
          {unilateral &&
            side(slotIndex, setIndex) === "both" &&
            toggleChip("Per side", sideRepsDraft[set.id] !== undefined, () =>
              setDraft(setSideRepsDraft, set.id, sideRepsDraft[set.id] !== undefined ? undefined : SideReps.make({ left: reps, right: reps })),
            )}
        </SLFlow>
        {drops.length > 0 && (
          <DropSetEditor drops={{ value: dropsDraft[set.id] ?? [], set: (v) => setDraft(setDropsDraft, set.id, v) }} step={step} display={app.display} />
        )}
      </VStack>
    );
  };

  const reserveRow = (set: LoggedSet) => {
    const picked = rirDraft[set.id];
    return (
      <HStack alignment="center" spacing={6} style={{ alignSelf: "stretch" }}>
        <Text {...slMeta()} color={SL.Ink.secondary} style={{ minWidth: 30 }}>RIR</Text>
        {[0, 1, 2, 3, 4].map((value) => {
          const on = picked === value;
          return (
            <Pressable
              key={value}
              aria-label={value === 0 ? "Reps in reserve: 0, to failure" : `Reps in reserve: ${value === 4 ? "4 or more" : `${value}`}`}
              onPress={() => setDraft(setRirDraft, set.id, on ? undefined : value)}
              style={{
                flex: "1 1 0",
                minWidth: 0,
                minHeight: SL.Space.hitMin,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: SL.Radius.md,
                background: on ? SL.Signal.actionTint : SL.Surface.raised2,
                boxShadow: on ? `inset 0 0 0 1px ${SL.Signal.action}` : undefined,
              }}
            >
              <Text {...slBody(on ? SL.Weight.semibold : SL.Weight.regular)} numerals color={on ? SL.Signal.action : SL.Ink.primary}>
                {value === 4 ? "4+" : `${value}`}
              </Text>
            </Pressable>
          );
        })}
      </HStack>
    );
  };

  // MARK: - Schijven

  /**
   * Plates load the bar on a barbell, a smith and a plate-loaded machine,
   * and only a set with a weight has anything to load.
   */
  const showsPlatesButton = (() => {
    const loadsPlates: Equipment[] = ["barbell", "smith", "machinePlate"];
    if (!loadsPlates.includes(current.exercise.equipment)) return false;
    if (runner.nextIndex({ in: current }) === undefined) return false;
    const weight = runner.proposedWeight({ slotIndex: currentIndex });
    if (weight === undefined) return false;
    return weight > 0;
  })();

  /**
   * What to put on the bar, without asking: "20 + 10 + 2.5 per side". The
   * line opens the calculator for other bars and nearby loads.
   */
  const plateLine = () => {
    const weight = runner.proposedWeight({ slotIndex: currentIndex }) ?? 0;
    const rack = app.plateInventory;
    const solution = PlateMath.solve({ target: weight, bar: rack.barKg, plates: rack.plates });
    const text = (() => {
      if (weight < rack.barKg) return `Lighter than the ${NumberDisplay.kg(app.display, rack.barKg)} bar`;
      if (solution.perSide.length === 0) return "Just the bar";
      const plates = solution.perSide.map((x) => NumberDisplay.number(app.display, x)).join(" + ");
      return solution.isExact ? `${plates} per side` : `${plates} per side · ${NumberDisplay.kg(app.display, solution.total)}`;
    })();
    return (
      <Pressable
        onPress={() => setShowsPlates(true)}
        aria-label={`Plates: ${text}, bar ${NumberDisplay.kg(app.display, rack.barKg)}`}
        style={{ alignSelf: "stretch", background: "transparent", display: "flex", alignItems: "center", gap: SL.Space.s2, paddingLeft: SL.Space.s2, paddingRight: SL.Space.s2, minHeight: 36 }}
      >
        <SLGlyph name="plates" size={15} color={SL.Ink.tertiary} />
        <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.8}>{text}</Text>
        <Spacer minLength={SL.Space.s1} />
        <SLGlyph name="chevronRight" size={12} color={SL.Ink.tertiary} />
      </Pressable>
    );
  };

  /**
   * Everything a set rarely needs, as one native menu: the list says what
   * each thing is, so nothing has to be guessed from a button's name.
   */
  const moreMenu = (setIndex: number) => (
    <Menu
      aria-label="More options for this set"
      style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, borderRadius: 999, background: SL.Surface.raised2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
      label={<SFSymbol name="ellipsis" size={17} weight={600} color={SL.Ink.secondary} />}
      entries={[
        { kind: "button", title: "Add an exercise", systemImage: "plus.circle", action: () => setAddingExercise(true) },
        {
          kind: "button",
          title: "Edit set…",
          systemImage: "slider.horizontal.3",
          action: () => {
            setEntryOpensOnKeypad(false);
            runner.editing = { slot: runner.currentIndex, set: setIndex };
          },
        },
        ...(showsPlatesButton
          ? [{ kind: "button" as const, title: "Plate calculator", systemImage: "circle.grid.2x1", action: () => setShowsPlates(true) }]
          : []),
      ]}
    />
  );

  /** "Set 2 van 4" and where its numbers came from, then the two tools. */
  const inputHead = (setIndex: number, set: LoggedSet) => (
    <HStack alignment="center" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <HStack alignment="center" spacing={SL.Space.s2} style={{ flex: "1 1 0", minWidth: 0 }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: SL.Signal.action, flexShrink: 0 }} />
        <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
          <Text {...slLead()} numerals color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.8} style={{ maxWidth: "100%" }}>{`Set ${setIndex + 1} of ${S.sets(current).length}`}</Text>
          <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.8} style={{ maxWidth: "100%" }}>{status(setIndex, set)}</Text>
        </VStack>
      </HStack>
      {moreMenu(setIndex)}
    </HStack>
  );

  /** The commit: 64 high, and it says what it is about to write. */
  const saveButton = (slotIndex: number, setIndex: number, set: LoggedSet) => {
    const reps = openReps(slotIndex, setIndex);
    const weight = set.weightKg ?? 0;
    return (
      <SLPrimaryButton prominent disabled={set.weightKg === undefined || reps <= 0} aria-label={`Save set, ${NumberDisplay.kg(app.display, weight)} × ${reps}`} onPress={() => save(slotIndex, setIndex)}>
        {/* The numbers are right above, in the steppers; the button only has to say what it does. */}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <SFSymbol name="checkmark" size={SL.TypeSize.title} weight={700} />
          Save set
        </span>
      </SLPrimaryButton>
    );
  };

  /**
   * The set you're on, open in place: what it is and what it was last
   * time, then the steppers, the plates, RIR when asked, and Save.
   */
  const activeSet = (slotIndex: number, setIndex: number) => {
    const set = S.sets(runner.slots[slotIndex])[setIndex];
    return (
      <div ref={activeAnchor} key={set.id} style={{ alignSelf: "stretch" }}>
        <VStack spacing={SL.Space.s3} style={{ padding: SL.Space.s3 }}>
          {inputHead(setIndex, set)}
          {steppers(slotIndex, setIndex, set)}
          {attributeRow(slotIndex, setIndex, set)}
          {showsPlatesButton && plateLine()}
          {asksForRIR(slotIndex, setIndex) && reserveRow(set)}
          {saveButton(slotIndex, setIndex, set)}
        </VStack>
      </div>
    );
  };

  /**
   * Fewer or more sets, today only, in plain sight under the list. Remove
   * takes the last set still open; done sets are corrected from their row.
   */
  const setCountControls = (slotIndex: number) => {
    const removable = runner.removableSetIndex({ slotIndex });
    const label = (title: string, symbol: string, color: string) => (
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, color }}>
        <SFSymbol name={symbol} size={SL.TypeSize.body} weight={500} />
        <Text size={SL.TypeSize.body} weight={SL.Weight.medium} color={color}>{title}</Text>
      </span>
    );
    return (
      <HStack spacing={0} style={{ alignSelf: "stretch" }}>
        <SLRowButton onPress={removeLastOpenSet} disabled={removable === undefined} style={{ flex: "1 1 0", minWidth: 0 }}>
          {label("Remove set", "minus", removable === undefined ? SL.Ink.tertiary : SL.Ink.primary)}
        </SLRowButton>
        <span style={{ width: 1, height: 24, background: SL.Surface.hairline, flexShrink: 0 }} />
        <SLRowButton onPress={addSet} style={{ flex: "1 1 0", minWidth: 0 }}>
          {label("Add set", "plus", SL.Signal.action)}
        </SLRowButton>
      </HStack>
    );
  };

  /**
   * One list. Done sets are a line with a check; the set you're on opens
   * in place with its controls; the sets still to come are quiet lines.
   * Nothing is shown twice, and the eye only ever moves down.
   */
  const setsCard = () => {
    const slotIndex = runner.currentIndex;
    const rows = runner.rows({ for: slotIndex });
    const active = runner.isComplete ? undefined : runner.nextIndex({ in: runner.current });
    return (
      <VStack spacing={0} style={{ ...slListCard(), alignSelf: "stretch" }}>
        {rows.map((row, position) => (
          <div key={row.index} style={{ position: "relative", alignSelf: "stretch" }}>
            {row.index === active ? activeSet(slotIndex, row.index) : setLine(row, slotIndex)}
            {position > 0 && <SLHairline style={{ position: "absolute", top: 0, left: 0, right: 0 }} />}
          </div>
        ))}
        <div style={{ position: "relative", alignSelf: "stretch" }}>
          {setCountControls(slotIndex)}
          <SLHairline style={{ position: "absolute", top: 0, left: 0, right: 0 }} />
        </div>
      </VStack>
    );
  };

  /** Under the sets, once the calibration set is in: what it started, in a line. */
  const referenceNote = (
    <VStack alignment="leading" spacing={SL.Space.s1} style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>
      <Text size={SL.TypeSize.meta} weight={SL.Weight.regular} numerals color={SL.Ink.secondary}>
        {`Building a reference · session 1 of ${ExerciseHistory.sessionsBeforeReference}. Suggestions start after three.`}
      </Text>
      {runner.didStepUpAfterCalibration({ slotIndex: currentIndex }) && (
        <Text size={SL.TypeSize.meta} weight={SL.Weight.regular} numerals color={SL.Ink.secondary}>RIR 3 or more, so set 2 is one step heavier.</Text>
      )}
    </VStack>
  );

  /**
   * The advice line once the exercise's last set is written, then what
   * comes after it — or that this was the session's last exercise.
   */
  const afterSets = () => {
    const advice = runner.adviceLine({ for: currentIndex });
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        {advice !== undefined && hintLine(advice, advice.startsWith("Not") ? SL.Ink.tertiary : SL.Signal.action)}
      </VStack>
    );
  };

  // MARK: - The session

  const [contextMenuFor, setContextMenuFor] = useState<number | undefined>(undefined);

  const contextActions = (index: number): DialogAction[] => {
    const isCurrent = index === runner.currentIndex;
    const actions: DialogAction[] = [];
    if (!isCurrent && index !== runner.currentIndex + 1) {
      actions.push({
        title: "Do next",
        action: () => runner.moveExercise({ from: index, to: index > runner.currentIndex ? runner.currentIndex + 1 : runner.currentIndex }),
      });
    }
    if (index > 0) actions.push({ title: "Move up", action: () => runner.moveExercise({ from: index, to: index - 1 }) });
    if (index < runner.slots.length - 1) actions.push({ title: "Move down", action: () => runner.moveExercise({ from: index, to: index + 1 }) });
    actions.push({ title: "Cancel", role: "cancel" });
    return actions;
  };

  /**
   * Every exercise of the session, where you are in it, and the way to
   * another one. Always one scroll away — including while the rest runs.
   */
  const exerciseRow = (index: number, slot: SessionRunner_ExerciseSlot) => {
    const isCurrent = index === runner.currentIndex;
    const logged = SessionSlot.loggedSetCount(slot.model);
    const total = SessionSlot.setCount(slot.model);
    return (
      // Hold to change the order: machine taken, or a superset partner.
      <LongPressArea onLongPress={() => setContextMenuFor(index)} style={{ alignSelf: "stretch" }}>
        <SLRowButton
          aria-label={`${slot.exercise.name}, ${logged} of ${total} sets${S.isComplete(slot) ? ", done" : ""}`}
          onPress={() => {
            runner.currentIndex = index;
            setShowsExerciseList(false);
          }}
          style={{ width: "100%" }}
        >
          <HStack
            alignment="center"
            spacing={SL.Space.s3}
            style={{ flex: "1 1 0", paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: SL.Space.hitMin + 4, background: isCurrent ? colorOpacity(SL.Signal.action, 0.06) : "transparent" }}
          >
            <Text {...slMeta()} numerals color={isCurrent ? SL.Signal.action : SL.Ink.tertiary} style={{ width: 20, flexShrink: 0 }}>{`${index + 1}`}</Text>
            <Text {...slBody(isCurrent ? SL.Weight.semibold : SL.Weight.regular)} color={SL.Ink.primary} lineLimit={1} style={{ flex: "1 1 0", textAlign: "left" }}>
              {slot.exercise.name}
            </Text>
            {S.isComplete(slot) ? <SLDoneMark /> : <Text {...slMeta()} numerals color={SL.Ink.secondary}>{`${logged}/${total}`}</Text>}
          </HStack>
        </SLRowButton>
      </LongPressArea>
    );
  };

  /** Every exercise of the session, opened from the progress bar. */
  const exerciseList = (
    <VStack spacing={0} style={{ ...slListCard(), alignSelf: "stretch" }}>
      {runner.slots.map((slot, index) => (
        <div key={S.id(slot)} style={{ position: "relative", alignSelf: "stretch" }}>
          {exerciseRow(index, slot)}
          {index > 0 && <SLHairline style={{ position: "absolute", top: 0, left: 0, right: 0 }} />}
        </div>
      ))}
      {/* An exercise the plan doesn't have, for today. */}
      <div style={{ position: "relative", alignSelf: "stretch" }}>
        <SLRowButton onPress={() => setAddingExercise(true)} style={{ width: "100%" }}>
          <VStack spacing={2} style={{ flex: "1 1 0", minHeight: 60, justifyContent: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, color: SL.Signal.action }}>
              <SFSymbol name="plus" size={SL.TypeSize.body} weight={600} />
              <Text size={SL.TypeSize.body} weight={SL.Weight.semibold} color={SL.Signal.action}>Add an exercise</Text>
            </span>
            {runner.slots.length > 1 && <Text {...slMeta()} color={SL.Ink.secondary}>Hold an exercise to move it</Text>}
          </VStack>
        </SLRowButton>
        <SLHairline style={{ position: "absolute", top: 0, left: 0, right: 0 }} />
      </div>
    </VStack>
  );

  // MARK: - The dock
  //
  // The undo surface, the rest pill and the input card share one bottom
  // inset, so the scroll view always reserves room for all of them. Nothing
  // in the session can end up underneath, and everything touched between
  // sets stays inside the thumb's reach.

  /**
   * While resting, the card's head is the rest: a small ring that empties,
   * the time left, and the two things you might do about it. No separate
   * panel, no colour shouting — the next set's numbers stay right below.
   */
  const restHead = (timer: RestTimerState) => {
    const remaining = RestTimerState.remaining(timer, { at: runner.now });
    const total = Math.max(timer.targetSeconds + timer.adjustmentSeconds, remaining, 1);
    const fraction = remaining / total;
    const r = 13.5;
    const circumference = 2 * Math.PI * r;
    const next = runner.nextIndex({ in: runner.current });
    return (
      <HStack alignment="center" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
        <svg aria-hidden width={30} height={30} viewBox="0 0 30 30" style={{ flexShrink: 0, transform: "rotate(-90deg)" }}>
          <circle cx={15} cy={15} r={r} fill="none" stroke={SL.Surface.hairlineStrong} strokeWidth={3} />
          <circle cx={15} cy={15} r={r} fill="none" stroke={SL.Signal.recovery} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${circumference * fraction} ${circumference}`} />
        </svg>
        {typingRest !== undefined ? (
          // Type a length of its own: "2:30", "90", "2".
          <VStack alignment="leading" spacing={0} style={{ flex: "1 1 0", minWidth: 0 }}>
            <input
              autoFocus
              value={typingRest}
              inputMode="decimal"
              enterKeyHint="done"
              placeholder={RestTimerState.clockLabel(RestTimerState.length(timer)).replace(/^0(?=\d:)/, "")}
              aria-label="Rest length, minutes and seconds"
              onChange={(e) => setTypingRest(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setTypingRest(undefined);
              }}
              onBlur={() => {
                const seconds = RestTimerState.parseLength(typingRest);
                if (seconds !== undefined) runner.setRestLength({ seconds });
                setTypingRest(undefined);
              }}
              style={{ ...slFont(SL.TypeSize.title, SL.Weight.semibold), ...slNumerals, color: SL.Ink.primary, caretColor: SL.Signal.action, background: SL.Surface.raised2, border: "none", outline: "none", borderRadius: SL.Radius.sm, padding: "2px 8px", width: 96 }}
            />
            <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1}>Rest length</Text>
          </VStack>
        ) : (
          <Pressable
            onPress={() => setTypingRest("")}
            aria-label={`Rest, ${Math.trunc(remaining / 60)} minutes ${remaining % 60} seconds left. Change the rest length`}
            style={{ flex: "1 1 0", minWidth: 0, background: "transparent", display: "flex", flexDirection: "column", alignItems: "flex-start" }}
          >
            <HStack spacing={6}>
              <Text size={SL.TypeSize.title} weight={SL.Weight.semibold} numerals color={SL.Ink.primary}>{SLRestPill.clockLabel(remaining)}</Text>
              <SFSymbol name="pencil" size={12} weight={600} color={SL.Ink.tertiary} />
            </HStack>
            <Text {...slMeta()} color={SL.Ink.secondary}>{next !== undefined ? `Rest · then set ${next + 1}` : "Rest"}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => runner.adjustRest({ by: -SL.Metric.restAdjustStep })}
          aria-label="Rest 30 seconds shorter"
          style={{ paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: SL.Space.hitMin, borderRadius: 999, background: SL.Surface.raised2, display: "flex", alignItems: "center", flexShrink: 0 }}
        >
          <Text {...slMeta(SL.Weight.semibold)} numerals color={SL.Ink.primary}>−30</Text>
        </Pressable>
        <Pressable
          onPress={() => runner.adjustRest({ by: SL.Metric.restAdjustStep })}
          aria-label="Rest 30 seconds longer"
          style={{ paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: SL.Space.hitMin, borderRadius: 999, background: SL.Surface.raised2, display: "flex", alignItems: "center", flexShrink: 0 }}
        >
          <Text {...slMeta(SL.Weight.semibold)} numerals color={SL.Ink.primary}>+30</Text>
        </Pressable>
        <Pressable
          onPress={() => runner.endRest()}
          aria-label="Skip rest"
          style={{ paddingLeft: SL.Space.s2, paddingRight: SL.Space.s2, minHeight: SL.Space.hitMin, background: "transparent", display: "flex", alignItems: "center", flexShrink: 0 }}
        >
          <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>Skip</Text>
        </Pressable>
      </HStack>
    );
  };

  /** One primary action, and it is whichever one is true right now. */
  const inputCard = (): ReactNode => {
    if (runner.isComplete) {
      return <SLPrimaryButton prominent onPress={() => setShowsComplete(true)}>Finish session</SLPrimaryButton>;
    }
    if (runner.nextIndex({ in: runner.current }) !== undefined) {
      // The set up next is edited in its own row in the list.
      return null;
    }
    const next = runner.nextSlotIndex;
    if (next !== undefined) {
      return (
        <SLPrimaryButton prominent onPress={() => runner.advance()}>
          <span style={{ paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, display: "flex", minWidth: 0 }}>
            <Text size={SL.TypeSize.title} weight={SL.Weight.bold} color="inherit" lineLimit={1} minimumScaleFactor={0.7}>
              {`Next · ${runner.slots[next].exercise.name}`}
            </Text>
          </span>
        </SLPrimaryButton>
      );
    }
    const open = runner.firstOpenSlotIndex;
    if (open !== undefined) {
      // The last exercise is done and an earlier one is not.
      return (
        <SLPrimaryButton
          prominent
          onPress={() => {
            runner.currentIndex = open;
          }}
        >
          <span style={{ paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, display: "flex", minWidth: 0 }}>
            <Text size={SL.TypeSize.title} weight={SL.Weight.bold} color="inherit" lineLimit={1} minimumScaleFactor={0.7}>
              {`Continue · ${runner.slots[open].exercise.name}`}
            </Text>
          </span>
        </SLPrimaryButton>
      );
    }
    return null;
  };

  const timer = runner.restTimer;
  const dock = (
    <VStack
      spacing={SL.Space.s2}
      style={{
        alignSelf: "stretch",
        paddingLeft: SL.Space.gutterSession,
        paddingRight: SL.Space.gutterSession,
        paddingTop: SL.Space.s2,
        // The cover's SafeArea (RootView) already keeps the home indicator clear.
        paddingBottom: SL.Space.s1,
        background: SL.Surface.ground,
        flexShrink: 0,
      }}
    >
      {toast && (
        <div style={{ alignSelf: "stretch" }}>
          <SLUndoToast message={toast.message} onUndo={toast.undo} onDismiss={() => setToast(undefined)} />
        </div>
      )}
      {/* The rest, as one slim bar, only while it runs. */}
      {timer && !runner.isComplete && RestTimerState.remaining(timer, { at: runner.now }) > 0 && (
        <div
          style={{
            alignSelf: "stretch",
            paddingLeft: SL.Space.s3,
            paddingRight: SL.Space.s3,
            paddingTop: SL.Space.s2,
            paddingBottom: SL.Space.s2,
            background: SL.Surface.raised,
            borderRadius: SL.Radius.lg,
            boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`,
          }}
        >
          {restHead(timer)}
        </div>
      )}
      {inputCard()}
    </VStack>
  );

  // MARK: - Presentations

  const editing = runner.editing;
  const editingRow =
    editing && editing.slot >= 0 && editing.slot < runner.slots.length && editing.set >= 0 && editing.set < S.sets(runner.slots[editing.slot]).length
      ? S.sets(runner.slots[editing.slot])[editing.set]
      : undefined;

  /** For the set up next. A load chosen here moves every open set, as the card's own weight stepper does. */
  const platesForNextSet = () => {
    const index = runner.currentIndex;
    const next = runner.nextIndex({ in: runner.current }) ?? 0;
    const weight = runner.proposedWeight({ slotIndex: index }) ?? 0;
    const sets = S.sets(runner.current);
    return (
      <PlateSheet
        exercise={runner.current.exercise.name}
        setNumber={next + 1}
        reps={next >= 0 && next < sets.length ? openReps(index, next) : 0}
        target={weight}
        onChoose={(load) => {
          const now = S.sets(runner.current);
          if (next >= 0 && next < now.length) moveWeight(index, now[next], load - weight);
          setShowsPlates(false);
        }}
        onClose={() => setShowsPlates(false)}
      />
    );
  };

  const calibrationSummaryShown = runner.calibrationSummary({ slotIndex: currentIndex }) !== undefined;

  return (
    <SLCelebration item={{ value: celebration, set: setCelebration }} style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, background: SL.Surface.ground }}>
        {topBar}
        <ScrollView style={{ flex: "1 1 0" }}>
          <VStack
            alignment="leading"
            spacing={SL.Space.s4}
            style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s2, paddingBottom: SL.Space.s3 }}
          >
            {exerciseHead}
            {showsExerciseList && exerciseList}
            {changeLines()}
            {aboveTheSets()}
            {showsLadder && warmupSection()}
            {setsCard()}
            {calibrationSummaryShown && referenceNote}
            {afterSets()}
          </VStack>
        </ScrollView>
        {dock}
      </div>

      <Sheet isPresented={editing !== undefined} onDismiss={closeEntry}>
        {/* Rows can be removed now, so a stale position opens nothing rather than the wrong set. */}
        {editing && editingRow && (
          <SetEntrySheet
            key={`${editing.slot}-${editingRow.id}`}
            slot={runner.slots[editing.slot]}
            setIndex={editing.set}
            isCalibration={editing.set === 0 && runner.needsCalibration({ slotIndex: editing.slot })}
            // What the card shows is what the sheet opens on.
            proposedReps={repsDraft[editingRow.id] ?? runner.suggestedReps({ slotIndex: editing.slot, setIndex: editing.set })}
            startsPartial={runner.editingStartsPartial}
            startsOnKeypad={entryOpensOnKeypad}
            proposedRIR={rirDraft[editingRow.id]}
            onLog={(entry) => {
              runner.log({ slotIndex: editing.slot, setIndex: editing.set, entry });
              celebrateIfRecord(editing.slot, editing.set);
              closeEntry();
              void askAboutNotificationsIfWorthIt();
            }}
            onClose={closeEntry}
            onRemove={
              runner.isAddedSet({ slotIndex: editing.slot, setIndex: editing.set }) ||
              (!LoggedSetNS.isLogged(editingRow) && S.sets(runner.slots[editing.slot]).length > 1)
                ? () => removeSet(editing.slot, editing.set)
                : undefined
            }
          />
        )}
      </Sheet>

      <Sheet isPresented={asksAboutNotifications} onDismiss={() => setAsksAboutNotifications(false)}>
        <RestNotificationSheet
          restLabel={
            runner.restTimer
              ? RestPrescription.displayLabel(
                  RestPrescription.make({ defaultSeconds: runner.restTimer.targetSeconds, range: closedRange(runner.restTimer.targetSeconds, runner.restTimer.targetSeconds) }),
                )
              : "2:00"
          }
          onAllow={() => {
            setAsksAboutNotifications(false);
            void (async () => {
              await RestNotifier.request();
              const t = runner.restTimer;
              if (t) RestNotifier.schedule(RestTimerState.fireDate(t), { startedAt: t.startedAt });
            })();
          }}
          onDecline={() => setAsksAboutNotifications(false)}
        />
      </Sheet>

      <Sheet isPresented={showsSwap} onDismiss={() => setShowsSwap(false)}>
        {showsSwap && (
          <SwapSheet
            exercise={runner.current.exercise}
            origin={runner.substitutedOrigin({ slotIndex: runner.currentIndex })}
            reorder={runner.reorderPlan({ slotIndex: runner.currentIndex })}
            hasLoggedSets={runner.hasLoggedSets({ slotIndex: runner.currentIndex })}
            hasOpenSets={!S.isComplete(runner.current)}
            sessionExerciseIDs={runner.sessionExerciseIDs}
            dayLabel={runner.day.short}
            onOutcome={handle}
            onRecordPain={(flag: PainFlag) => void app.recordPain({ pain: flag })}
            onClose={() => setShowsSwap(false)}
          />
        )}
      </Sheet>

      <Sheet isPresented={showsPlates} onDismiss={() => setShowsPlates(false)}>
        {showsPlates && platesForNextSet()}
      </Sheet>

      <Sheet isPresented={addingExercise} onDismiss={() => setAddingExercise(false)}>
        {addingExercise && (
          <ExercisePickerSheet
            rows={ExercisePicker.rowsSessions({ sessions: app.sessions, favorites: app.favoriteExercises })}
            selected={undefined}
            onPick={(row: ExercisePicker_Row) => {
              setAddingExercise(false);
              const index = runner.addExercise(app.exercise(row.exerciseID));
              setShowsExerciseList(false);
              show(`${row.name} added. Just for this session.`, () => runner.removeAddedExercise({ at: index }));
            }}
            onStar={(row: ExercisePicker_Row) => void app.setFavorite({ exerciseID: row.exerciseID, isFavorite: !row.isFavorite })}
            onClose={() => setAddingExercise(false)}
          />
        )}
      </Sheet>

      <Alert
        isPresented={explainsSuggestion}
        onDismiss={() => setExplainsSuggestion(false)}
        title={current.proposal.headline}
        message={current.proposal.body}
        actions={[{ title: "OK", role: "cancel" }]}
      />

      <Alert
        isPresented={confirmsEarlyFinish}
        onDismiss={() => setConfirmsEarlyFinish(false)}
        title={`Finish the session with ${runner.completedSetCount} of ${runner.plannedSetCount} sets?`}
        message="What you logged is kept. The rest counts as not trained — no penalty for your progress."
        actions={[
          { title: "Keep training", role: "cancel" },
          { title: "Finish", action: () => setShowsComplete(true) },
        ]}
      />

      <ConfirmationDialog
        isPresented={contextMenuFor !== undefined}
        onDismiss={() => setContextMenuFor(undefined)}
        actions={contextMenuFor !== undefined ? contextActions(contextMenuFor) : []}
      />

      <FullScreenCover isPresented={showsComplete}>
        {showsComplete && (
          <SessionCompleteView
            runner={runner}
            previous={app.sessions.find((s) => s.dayID === runner.day.id && s.kind === "workout")}
            onBack={() => setShowsComplete(false)}
            onSave={(createPost) => {
              runner.stopRestSignals();
              const existing = app.sessions.find(
                (s) => s.dayID === runner.day.id && isSameDay(s.date, runner.startedAt) && s.kind === "workout",
              );
              p.onFinish(runner.finishedSession({ existing }), createPost);
            }}
          />
        )}
      </FullScreenCover>
    </SLCelebration>
  );
}
