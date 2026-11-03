// AccountView.swift — Artboard 23 · Account, opened from the gear as Settings.
//
// States what the account holds, and hands it back. Three rules from the
// approved decisions shape what is drawn:
//
// - every value comes from stored data, so the mock's `2.250 kcal · 165 g`
//   only appears when this account really has targets;
// - a chevron is drawn only where there is somewhere to go;
// - `Account verwijderen` waits for the server action that performs it.
//
// Laid out to be read at a glance: who you are and how the account stands in
// one card on top, then one card per topic — Training, Food, App, Privacy,
// Your data — each row led by an icon tinted by its topic, so the eye finds a
// group before it reads a word. Training and Food are the coloured ones; the
// rest is housekeeping and stays grey. `Uitloggen` leaves the account on this
// device and keeps its local copy and anything still waiting to sync.
//
// On the web: the app-lock row never shows (`AppLock.isAvailable` is false);
// the photo picker is a file input; "Export everything" hands the files to
// the share sheet (`navigator.share`) or, where there is none, downloads them.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { SL, slFont, slHeroCard, slListCard } from "../../design/tokens";
import {
  Alert, ConfirmationDialog, FullScreenCover, HStack, Menu, ScrollView, Sheet, Spacer, Text, Toggle, VStack,
  useAppStorage,
} from "../../design/swiftui";
import { PressButton, Presentation } from "../../design/support";
import { SFSymbol } from "../../design/SFSymbol";
import { SLOutlineButton, SLPrimaryButton, colorOpacity } from "../../design/SetlineTokens";
import { SLSound } from "../../design/SLSound";
import { SLAvatar } from "../../design/components/SLAvatar";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLHairline, slBody, slMeta } from "../../design/components/SLText";
import { SLOverline, SLRowButton, SLScreenTitle } from "../../design/components/SLPieces";
import { slHitTarget } from "../../design/components/SLText";
import { LegacyState } from "../../core/Legacy/LegacyState";
import { AccountSummary } from "../../core/Account/AccountSummary";
import { StateExport } from "../../core/Account/StateExport";
import { Schedule } from "../../core/Engine/Schedule";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { FoodIdeas } from "../../core/Nutrition/FoodIdeas";
import { Recipes } from "../../core/Nutrition/Recipes";
import { StateChange } from "../../core/Sync/StateChange";
import { useApp } from "../../data/AppState";
import { RIRPreference } from "../../data/RIRPreference";
import { PostVisibility, useSocial } from "../../data/SocialStore";
import { SignInView } from "../Auth/SignInView";
import { NutritionReminders } from "../Progress/GoalViews";
import { WorkoutReminder } from "../Session/WorkoutReminder";
import { WorkoutChooserSheet } from "../Training/WorkoutChooser";
import { PlansSheet } from "../Training/PlansSheet";
import { WeekPlanView } from "../Training/WeekPlanView";
import { VisibilitySheet } from "../Friends/PostComposerView";
import { BlockedPeopleSheet } from "../Friends/InviteViews";
import { AppLock, PrivacyPolicyView } from "./PrivacyViews";
import { usePatchNotes } from "./PatchNotes";
import { PatchNotesView } from "./PatchNotesView";
import { TargetsSheet } from "./TargetsSheet";

const iconSize = 30;

/** One reading of where this account stands, so the dot and the line beside it can never disagree. */
type Standing =
  | { kind: "synced"; value: Date }
  | { kind: "waiting"; value: number }
  | { kind: "offline"; value: number }
  | { kind: "expired" }
  | { kind: "never" };

function changes(count: number): string {
  return count === 1 ? "1 change" : `${count} changes`;
}

/** One change stays; two stay. The count decides the verb, not the noun. */
function verb(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/** "main lift, compound" → "Main lift, compound". */
function capitalizedFirst(s: string): string {
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

/**
 * `RelativeDateTimeFormatter` (en_US, `.full`, numeric): the largest unit
 * that is not zero, "3 minutes ago" / "in 2 days", and "in 0 seconds" for now.
 */
function relative(date: Date, now: Date): string {
  const seconds = Math.trunc((date.getTime() - now.getTime()) / 1000);
  const past = seconds < 0;
  const abs = Math.abs(seconds);
  const days = Math.trunc(abs / 86_400);
  const units: [number, string][] = [
    [Math.trunc(days / 365), "year"],
    [Math.trunc(days / 30), "month"],
    [Math.trunc(days / 7), "week"],
    [days, "day"],
    [Math.trunc(abs / 3600), "hour"],
    [Math.trunc(abs / 60), "minute"],
    [abs, "second"],
  ];
  const [count, unit] = units.find(([n]) => n > 0) ?? [0, "second"];
  const phrase = `${count} ${unit}${count === 1 ? "" : "s"}`;
  return past && count > 0 ? `${phrase} ago` : `in ${phrase}`;
}

/** The version, as the web build knows it. */
function versionLine(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const version = env.VITE_SETLINE_VERSION ?? "1.0";
  const build = env.VITE_SETLINE_BUILD;
  if (!build) return `Setline ${version}`;
  return `Setline ${version} (${build})`;
}

/** The options have to be gone before the next thing can be shown, or it is never shown. */
function afterDialog(action: () => void) {
  setTimeout(action, 350);
}

export function AccountView({ onClose }: { /** Account opens as a sheet from the avatar; this closes it. */ onClose?: () => void }) {
  const app = useApp();
  const social = useSocial();
  const [exports, setExports] = useState<File[]>([]);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [reauthenticating, setReauthenticating] = useState(false);
  const [planningWeek, setPlanningWeek] = useState(false);
  const [editingTargets, setEditingTargets] = useState(false);
  const [rirEverySet, setRirEverySet] = useState(RIRPreference.everySet);
  const [namingProfile, setNamingProfile] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);
  const [showsCredits, setShowsCredits] = useState(false);
  const [defaultVisibility, setDefaultVisibility] = useState<PostVisibility>(PostVisibility.defaultForNewPosts);
  const [choosingVisibility, setChoosingVisibility] = useState(false);
  const [confirmsDeleteAll, setConfirmsDeleteAll] = useState(false);
  const [deleteAllFailed, setDeleteAllFailed] = useState(false);
  const [showsBlocked, setShowsBlocked] = useState(false);
  const [confirmsResetWorkouts, setConfirmsResetWorkouts] = useState(false);
  const [mealReminders, setMealReminders] = useAppStorage<boolean>(NutritionReminders.mealsKey, false);
  const [openWorkoutMinutes, setOpenWorkoutMinutes] = useAppStorage<number>(WorkoutReminder.minutesKey, 20);
  const [managingWorkouts, setManagingWorkouts] = useState(false);
  const [choosingPlan, setChoosingPlan] = useState(false);
  const [soundsOn, setSoundsOnStored] = useAppStorage<boolean>(SLSound.preferenceKey, true);
  const [appLock, setAppLock] = useAppStorage<boolean>(AppLock.preferenceKey, false);
  const [showsPolicy, setShowsPolicy] = useState(false);
  const [showsUpdates, setShowsUpdates] = useState(false);
  const updates = usePatchNotes();
  const [remindersDenied, setRemindersDenied] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const summary = AccountSummary.make({ state: app.state ?? LegacyState.make({ raw: {} }), plan: app.plan });

  // MARK: - Exports

  const buildExports = (): File[] => {
    const state = app.state;
    if (!state || !(app.sessions.length > 0 || Object.keys(state.raw).length > 1)) {
      setExports([]);
      return [];
    }
    try {
      const names = StateExport.fileNames();
      const json = new File([StateExport.json({ from: state })], names.json, { type: "application/json" });
      const csv = new File([StateExport.csv({ from: app.sessions })], names.csv, { type: "text/csv" });
      setExports([json, csv]);
      return [json, csv];
    } catch {
      // An export that cannot be written says so in the row rather than
      // handing over a half-written file.
      setExports([]);
      return [];
    }
  };

  /** Your posts and their music, photos (as paths) and counts, beside the training data: "Export everything" means everything. */
  const addPostsToExport = async (built: File[]) => {
    if (social.me == null || built.length === 0) return;
    const data = await social.exportMyPosts();
    if (data == null) return;
    const file = new File([data as BlobPart], "setline-posts.json", { type: "application/json" });
    setExports((current) => (current.some((f) => f.name === file.name) ? current : [...current, file]));
  };

  useEffect(() => {
    const built = buildExports();
    void addPostsToExport(built);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [social.myPostCount]);
  const sessionCount = app.sessions.length;
  const firstSessionCount = useRef(true);
  useEffect(() => {
    if (firstSessionCount.current) {
      firstSessionCount.current = false;
      return;
    }
    buildExports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCount]);

  const share = async () => {
    const files = exports;
    if (files.length === 0) return;
    if (typeof navigator.share === "function" && navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files });
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
      }
    }
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  // MARK: - Preferences written back

  const setRir = (value: boolean) => {
    setRirEverySet(value);
    RIRPreference.everySet = value;
  };
  const setSoundsOn = (on: boolean) => {
    setSoundsOnStored(on);
    if (on) SLSound.play("tick");
  };
  const setVisibility = (value: PostVisibility) => {
    setDefaultVisibility(value);
    PostVisibility.defaultForNewPosts = value;
  };

  // MARK: - Sync

  const standing = ((): Standing => {
    const waiting = app.pendingChanges.length;
    switch (app.sync.kind) {
      case "sessionExpired":
        return { kind: "expired" };
      case "offline":
        return { kind: "offline", value: waiting };
      default: {
        if (waiting > 0) return { kind: "waiting", value: waiting };
        const synced = app.lastSyncedAt;
        if (!synced) return { kind: "never" };
        return { kind: "synced", value: synced };
      }
    }
  })();

  const syncTone = standing.kind === "synced" ? SL.Signal.recovery : SL.Signal.attention;

  const syncText = ((): string => {
    switch (standing.kind) {
      case "synced":
        return `Synced ${relative(standing.value, new Date())}`;
      case "waiting":
        return `Waiting to sync · ${changes(standing.value)}`;
      case "offline":
        return standing.value > 0 ? `Offline · ${changes(standing.value)} waiting` : "Offline · saved on this phone";
      case "expired":
        return "Session expired · your work stays here";
      case "never":
        return "Not synced yet";
    }
  })();

  const sessionsSafe = summary.sessionCount === 1 ? "1 workout" : `${summary.sessionCount} workouts`;

  // Signing in again after the session expired: closes once the account is
  // no longer expired.
  useEffect(() => {
    if (!reauthenticating) return;
    if (app.sync.kind === "sessionExpired") return;
    setReauthenticating(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.sync]);

  // MARK: - Pieces

  /** The tinted square that leads a row. */
  const icon = (symbol: string, tint: string) => (
    <div
      aria-hidden
      style={{
        width: iconSize,
        height: iconSize,
        flexShrink: 0,
        borderRadius: SL.Radius.sm,
        background: colorOpacity(tint, 0.14),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SFSymbol name={symbol} size={14} weight={600} color={tint} />
    </div>
  );

  const value = (text: string) => (
    <Text {...slBody()} numerals color={SL.Ink.secondary} align="trailing" lineLimit={1}>
      {text}
    </Text>
  );

  const chevron = <SLGlyph name="chevronRight" size={16} color={SL.Ink.tertiary} style={{ flexShrink: 0 }} />;

  const rowContent = (symbol: string, a: { tint: string; title: string; detail?: string; titleColor: string; chevron: boolean; trailing?: ReactNode }) => (
    <HStack alignment="center" spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3, minHeight: 56, alignSelf: "stretch" }}>
      {icon(symbol, a.tint)}
      <HStack alignment="center" spacing={SL.Space.s2} style={{ flex: "1 1 0", minWidth: 0 }}>
        <VStack alignment="leading" spacing={1} style={{ flexShrink: 1, minWidth: 0 }}>
          <Text {...slBody(SL.Weight.medium)} color={a.titleColor}>{a.title}</Text>
          {a.detail !== undefined && <Text {...slMeta()} color={SL.Ink.secondary}>{a.detail}</Text>}
        </VStack>
        <Spacer minLength={SL.Space.s2} />
        {a.trailing !== undefined && <div style={{ flexShrink: 0, display: "flex" }}>{a.trailing}</div>}
      </HStack>
      {a.chevron && chevron}
    </HStack>
  );

  /** A settings row: icon, label (and a line about it), its current value on the right, and a chevron when tapping it leads somewhere. */
  const row = (
    symbol: string,
    a: { tint: string; title: string; titleColor?: string; detail?: string; action?: () => void; trailing?: ReactNode; disabled?: boolean; dimmed?: boolean; key?: string },
  ) => {
    const titleColor = a.titleColor ?? SL.Ink.primary;
    // A destructive row asks first; it doesn't lead anywhere, so no chevron.
    const content = rowContent(symbol, {
      tint: a.tint,
      title: a.title,
      detail: a.detail,
      titleColor,
      chevron: a.action !== undefined && titleColor !== SL.Signal.loss,
      trailing: a.trailing,
    });
    const style = { opacity: a.dimmed ? 0.5 : 1 };
    if (a.action) {
      return (
        <SLRowButton key={a.key ?? a.title} onPress={a.action} disabled={a.disabled} style={style}>
          {content}
        </SLRowButton>
      );
    }
    return (
      <div key={a.key ?? a.title} style={{ display: "flex", ...style }}>
        {content}
      </div>
    );
  };

  const toggleRow = (symbol: string, a: { tint: string; title: string; detail: string; isOn: boolean; set: (on: boolean) => void }) => (
    <Toggle
      key={a.title}
      isOn={a.isOn}
      onChange={a.set}
      aria-label={a.title}
      style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3, minHeight: 56 }}
      label={
        <HStack alignment="center" spacing={SL.Space.s3}>
          {icon(symbol, a.tint)}
          <VStack alignment="leading" spacing={1} style={{ flex: "1 1 0", minWidth: 0 }}>
            <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary}>{a.title}</Text>
            <Text {...slMeta()} color={SL.Ink.secondary}>{a.detail}</Text>
          </VStack>
        </HStack>
      }
    />
  );

  /** A topic: its overline, its rows in one card with a hairline between them that starts where the text does, and an optional note beneath. */
  const group = (title: string, rows: ReactNode[], footer?: string) => {
    const shown = rows.filter((r) => r !== null && r !== undefined && r !== false);
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignItems: "stretch" }}>
        <SLOverline text={title} style={{ paddingLeft: SL.Space.s1 }} />
        <VStack spacing={0} style={{ alignItems: "stretch", ...slListCard() }}>
          {shown.map((r, i) => (
            <Fragment key={i}>
              {r}
              {i < shown.length - 1 && <SLHairline style={{ marginLeft: SL.Space.s4 + iconSize + SL.Space.s3 }} />}
            </Fragment>
          ))}
        </VStack>
        {footer !== undefined && (
          <Text {...slMeta()} color={SL.Ink.secondary} style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>
            {footer}
          </Text>
        )}
      </VStack>
    );
  };

  // MARK: - Profile

  /** Says the picture can be changed: the camera, small, on the avatar's edge. */
  const cameraBadge = (
    <div
      style={{
        position: "absolute",
        right: -2,
        bottom: -2,
        width: 22,
        height: 22,
        borderRadius: 11,
        background: SL.Surface.raised,
        boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${SL.Surface.hairlineStrong}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SLGlyph name="camera" size={12} color={SL.Signal.action} />
    </div>
  );

  /** How this account stands right now: one quiet line under the address, since it is reassurance rather than something to act on. */
  const syncLine = (
    <HStack alignment="center" spacing={6} aria-label={`Sync: ${syncText}`} style={{ paddingTop: 2, alignItems: "flex-start" }}>
      <div style={{ width: 7, height: 7, borderRadius: 3.5, background: syncTone, flexShrink: 0, marginTop: 5 }} />
      <Text {...slMeta()} color={SL.Ink.secondary}>{syncText}</Text>
    </HStack>
  );

  /** What the account holds, in three numbers. */
  const statsRow = (() => {
    const streak = app.streak;
    // Before there is a streak, this week's count instead of a zero.
    const run: [string, string] =
      streak.weeks > 0
        ? [`${streak.weeks}`, streak.weeks === 1 ? "week in a row" : "weeks in a row"]
        : [`${streak.thisWeekDone}/${streak.thisWeekGoal}`, "this week"];
    const stats: [string, string][] = [
      [`${summary.sessionCount}`, summary.sessionCount === 1 ? "workout" : "workouts"],
      run,
      [`${summary.loggedExerciseCount}`, summary.loggedExerciseCount === 1 ? "exercise" : "exercises"],
    ];
    return (
      <HStack alignment="top" spacing={SL.Space.s3} style={{ alignSelf: "stretch", paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3 }}>
        {stats.map(([v, label], index) => (
          <VStack key={index} alignment="leading" spacing={0} style={{ flex: "1 1 0", minWidth: 0 }}>
            <Text size={SL.TypeSize.title} weight={SL.Weight.semibold} numerals color={SL.Ink.primary}>{v}</Text>
            <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.85} style={{ maxWidth: "100%" }}>{label}</Text>
          </VStack>
        ))}
      </HStack>
    );
  })();

  /** Who this is and how the account stands. Only an expired session asks for anything, and then the button says what. */
  const profileCard = (
    <VStack spacing={0} style={{ alignItems: "stretch", ...slHeroCard() }}>
      {/* A menu rather than a dialog: it opens where it was tapped. */}
      <Menu
        aria-label="Change your name or photo"
        style={{ display: "flex", width: "100%", textAlign: "left", padding: SL.Space.s4 }}
        entries={[
          {
            kind: "section",
            title: "Your name and photo stay on this phone",
            entries: [
              {
                kind: "button",
                title: app.profileName === undefined ? "Add name" : "Change name",
                systemImage: "character.cursor.ibeam",
                action: () =>
                  afterDialog(() => {
                    setDraftName(app.profileName ?? "");
                    setNamingProfile(true);
                  }),
              },
              {
                kind: "button",
                title: app.profilePhoto === undefined ? "Choose a photo" : "Choose another photo",
                systemImage: "photo",
                action: () => afterDialog(() => photoInput.current?.click()),
              },
              ...(app.profilePhoto !== undefined
                ? [{ kind: "button" as const, title: "Remove photo", systemImage: "trash", role: "destructive" as const, action: () => app.removeProfilePhoto() }]
                : []),
            ],
          },
        ]}
        label={
          <HStack alignment="center" spacing={SL.Space.s4} style={{ flex: "1 1 0" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <SLAvatar photo={app.profilePhoto} initial={app.avatarInitial} size={60} />
              {cameraBadge}
            </div>
            <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
              <Text size={SL.TypeSize.title} weight={SL.Weight.semibold} color={app.profileName === undefined ? SL.Signal.action : SL.Ink.primary} lineLimit={2}>
                {app.profileName ?? "Add your name"}
              </Text>
              {app.session?.email !== undefined && <MiddleTruncated text={app.session.email} />}
              {syncLine}
            </VStack>
            <div
              style={{
                ...slFont(SL.TypeSize.meta, SL.Weight.semibold),
                color: SL.Ink.primary,
                paddingLeft: SL.Space.s3,
                paddingRight: SL.Space.s3,
                minHeight: 30,
                display: "flex",
                alignItems: "center",
                borderRadius: SL.Radius.pill,
                background: SL.Surface.raised2,
                boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${SL.Surface.hairlineStrong}`,
                flexShrink: 0,
              }}
            >
              Edit
            </div>
          </HStack>
        }
      />

      <SLHairline style={{ marginLeft: SL.Space.s4, marginRight: SL.Space.s4 }} />
      {statsRow}

      {standing.kind === "expired" && (
        <div style={{ display: "flex", flexDirection: "column", paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingBottom: SL.Space.s4 }}>
          <SLPrimaryButton onPress={() => setReauthenticating(true)}>Sign in again</SLPrimaryButton>
        </div>
      )}

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          void app.setProfilePhoto(file).then((kept) => {
            if (!kept) setPhotoFailed(true);
          });
        }}
      />
    </VStack>
  );

  // MARK: - Training

  /** This week at a glance: the seven days, the training ones lit. Tapping it moves them. */
  const weekRow = (() => {
    const days = Schedule.mondayFirstWeek({ containing: new Date() }).map((d) => Schedule.weekdayLabel(d));
    const count = summary.trainingDays.length;
    return (
      <SLRowButton key="week" onPress={() => setPlanningWeek(true)} aria-label={`Training days: ${summary.trainingDays.join(", ")}`}>
        <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignItems: "stretch", paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3 }}>
          <HStack alignment="center" spacing={SL.Space.s3}>
            {icon("calendar", SL.Signal.action)}
            <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary}>Training days</Text>
            <Spacer minLength={SL.Space.s2} />
            {value(count === 1 ? "1 this week" : `${count} this week`)}
            {chevron}
          </HStack>
          <HStack spacing={SL.Space.s1} style={{ paddingLeft: iconSize + SL.Space.s3 }}>
            {days.map((day) => {
              const on = summary.trainingDays.includes(day);
              return (
                <div
                  key={day}
                  style={{
                    flex: "1 1 0",
                    minWidth: 0,
                    minHeight: 30,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: SL.Radius.pill,
                    background: on ? SL.Signal.actionTint : SL.Surface.raised2,
                    boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${on ? colorOpacity(SL.Signal.action, 0.35) : "transparent"}`,
                  }}
                >
                  <Text size={SL.TypeSize.micro} weight={on ? SL.Weight.semibold : SL.Weight.medium} color={on ? SL.Signal.action : SL.Ink.tertiary} lineLimit={1} minimumScaleFactor={0.7}>
                    {day}
                  </Text>
                </div>
              );
            })}
          </HStack>
        </VStack>
      </SLRowButton>
    );
  })();

  /** How long a workout may sit open or paused before a nudge. */
  const openWorkoutRow = row("bell.badge.fill", {
    key: "openWorkout",
    tint: SL.Signal.action,
    title: "Unfinished workout",
    detail: "A nudge if it's left open",
    trailing: (
      <Menu
        entries={WorkoutReminder.choices.map((choice) => ({
          kind: "button" as const,
          title: WorkoutReminder.label(choice),
          checked: choice === openWorkoutMinutes,
          action: () => {
            setOpenWorkoutMinutes(choice);
            // Asks once, the first time a reminder is turned on.
            if (choice > 0) void NutritionReminders.requestPermission();
          },
        }))}
        label={
          <HStack spacing={4} style={{ color: SL.Ink.secondary, minHeight: SL.Space.hitMin }}>
            <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>{WorkoutReminder.label(openWorkoutMinutes)}</Text>
            <SFSymbol name="chevron.up.chevron.down" size={11} weight={600} color={SL.Ink.secondary} />
          </HStack>
        }
      />
    ),
  });

  const trainingGroup = group("Training", [
    // One of ours or one of yours: the plans list holds both.
    row("calendar", {
      tint: SL.Signal.action,
      title: "Plan",
      detail: "Change it, or make your own",
      action: () => setChoosingPlan(true),
      trailing: value(app.planName),
    }),
    summary.trainingDays.length > 0 ? weekRow : null,
    row("square.stack.3d.up.fill", {
      tint: SL.Signal.action,
      title: "Your workouts",
      action: () => setManagingWorkouts(true),
      trailing: value(app.customWorkouts.length === 0 ? "Create one" : `${app.customWorkouts.length}`),
    }),
    // The three rests by role read as a sentence for a screen reader; on
    // screen the detail names them in the same order as the times.
    <div key="rest" aria-label={`Rest timer: ${summary.rest.map((r) => `${r.label} ${r.roleLabel}`).join(", ")}`} style={{ display: "flex" }}>
      {rowContent("timer", {
        tint: SL.Signal.action,
        title: "Rest timer",
        detail: capitalizedFirst(summary.rest.map((r) => r.roleLabel).join(", ")),
        titleColor: SL.Ink.primary,
        chevron: false,
        trailing: value(summary.rest.map((r) => r.label).join(" · ")),
      })}
    </div>,
    // 12R: "Per set vragen zet je aan in Account." This is where.
    toggleRow("gauge.with.dots.needle.33percent", { tint: SL.Signal.action, title: "RIR on every set", detail: "Reps in reserve, after each set", isOn: rirEverySet, set: setRir }),
    openWorkoutRow,
  ]);

  // MARK: - Food

  const mealRemindersSet = (on: boolean) => {
    if (on) {
      void (async () => {
        if (await NutritionReminders.requestPermission()) {
          setMealReminders(true);
          await NutritionReminders.update(app);
        } else {
          setRemindersDenied(true);
        }
      })();
    } else {
      setMealReminders(false);
      void NutritionReminders.update(app);
    }
  };

  const targets = summary.targets;
  const foodGroup = group("Food", [
    targets
      ? row("fork.knife", {
          tint: SL.Signal.recovery,
          title: "Daily targets",
          action: () => setEditingTargets(true),
          trailing: value(`${NumberDisplay.number(app.display, targets.calories)} kcal · ${targets.protein} g`),
        })
      : null,
    toggleRow("bell.fill", { tint: SL.Signal.recovery, title: "Meal reminders", detail: "Only when a meal isn't logged yet", isOn: mealReminders, set: mealRemindersSet }),
  ]);

  // MARK: - App

  const appGroup = group("App", [
    row("sparkles", {
      tint: SL.Signal.action,
      title: "What's new",
      detail: updates.notes[0] ? updates.notes[0].title : "Every update, in plain words",
      action: () => setShowsUpdates(true),
      trailing: updates.hasUnseen ? (
        <Text size={SL.TypeSize.micro} weight={SL.Weight.bold} tracking={0.8} color={SL.Signal.onAction} style={{ background: SL.Signal.action, borderRadius: 999, padding: "2px 8px" }}>
          NEW
        </Text>
      ) : undefined,
    }),
    toggleRow("speaker.wave.2.fill", { tint: SL.Ink.secondary, title: "Sounds", detail: "A click for a set, a chime for a record", isOn: soundsOn, set: setSoundsOn }),
    // Face ID / Touch ID / the passcode: never available to a web page, so
    // this row is never drawn here.
    AppLock.isAvailable
      ? toggleRow("lock.fill", {
          tint: SL.Ink.secondary,
          title: `Lock with ${AppLock.methodName}`,
          detail: "Asked each time you come back",
          isOn: appLock,
          // Proving it is you before the lock goes on or off.
          set: (on) => void AppLock.authenticate({ reason: on ? "Turn on the app lock" : "Turn off the app lock" }).then((ok) => ok && setAppLock(on)),
        })
      : null,
  ]);

  // MARK: - Privacy

  const hasProfile = social.me != null;
  // Posts settings only once there is a social profile to post from.
  const privacyGroup = group(
    "Privacy",
    [
      hasProfile
        ? row("eye.fill", {
            tint: SL.Ink.secondary,
            title: "New posts are seen by",
            detail: "Change it on any post",
            action: () => setChoosingVisibility(true),
            trailing: value(PostVisibility.label(defaultVisibility)),
          })
        : null,
      hasProfile ? row("hand.raised.fill", { tint: SL.Ink.secondary, title: "Blocked people", action: () => setShowsBlocked(true) }) : null,
      row("lock.shield.fill", { tint: SL.Ink.secondary, title: "Privacy policy", detail: "What's kept, where, and your rights", action: () => setShowsPolicy(true) }),
    ],
    hasProfile ? "Location is never shared unless you add a place to a post. Photo location data is always removed." : undefined,
  );

  // MARK: - Data

  const exportDetail = (() => {
    const parts = ["CSV and JSON", sessionsSafe];
    parts.push(summary.loggedExerciseCount === 1 ? "1 exercise" : `${summary.loggedExerciseCount} exercises`);
    if (summary.weighInCount > 0) parts.push(summary.weighInCount === 1 ? "1 weigh-in" : `${summary.weighInCount} weigh-ins`);
    return parts.join(" · ");
  })();

  const exportRow =
    exports.length === 0 ? (
      row("square.and.arrow.up", { key: "export", tint: SL.Ink.secondary, title: "Export everything", detail: "No data to export yet" })
    ) : (
      <SLRowButton key="export" onPress={() => void share()} aria-label={`Export everything. ${exportDetail}`}>
        {/* 23: the design's `download` glyph beside "Export", both lime — the screen's one action. */}
        {rowContent("square.and.arrow.up", {
          tint: SL.Ink.secondary,
          title: "Export everything",
          detail: hasProfile ? "CSV, JSON and posts" : "CSV and JSON",
          titleColor: SL.Ink.primary,
          chevron: false,
          trailing: (
            <HStack spacing={6} style={{ color: SL.Signal.action }}>
              <SLGlyph name="download" size={16} color={SL.Signal.action} />
              <Text {...slBody(SL.Weight.semibold)} color={SL.Signal.action}>Export</Text>
            </HStack>
          ),
        })}
      </SLRowButton>
    );

  const workouts = app.sessions.length;
  /** Taking everything out, and starting over. The two deletes sit under the export, so the way to keep a copy is the first thing read. */
  const dataGroup = group(
    "Your data",
    [
      exportRow,
      row("trash.fill", {
        key: "deleteWorkouts",
        tint: SL.Signal.loss,
        title: "Delete all workouts",
        titleColor: SL.Signal.loss,
        detail: workouts === 0 ? "No workouts logged" : `${workouts === 1 ? "1 workout" : `${workouts} workouts`} · everything else stays`,
        action: () => setConfirmsResetWorkouts(true),
        disabled: workouts === 0,
        dimmed: workouts === 0,
      }),
      hasProfile
        ? row("trash.fill", {
            key: "deletePosts",
            tint: SL.Signal.loss,
            title: "Delete all my posts",
            titleColor: SL.Signal.loss,
            detail: "Your workouts stay in your log",
            action: () => setConfirmsDeleteAll(true),
            disabled: social.myPostCount === 0,
            dimmed: social.myPostCount === 0,
          })
        : null,
    ],
    "Deleting can't be undone. Export first if you want a copy.",
  );

  const signOutButton = (
    <div style={{ display: "flex", flexDirection: "column", paddingTop: SL.Space.s2 }}>
      <SLOutlineButton
        emphasis="tertiary"
        onPress={() => {
          if (app.hasPendingChanges) setConfirmSignOut(true);
          else app.signOut();
        }}
      >
        Sign out
      </SLOutlineButton>
    </div>
  );

  /** The version, and the credits the food photos' licences ask for. */
  const footer = (
    <HStack spacing={6} style={{ alignSelf: "stretch", justifyContent: "center", marginTop: -SL.Space.s2, ...slFont(SL.TypeSize.meta, SL.Weight.regular), color: SL.Ink.tertiary }}>
      <Text size={SL.TypeSize.meta} color={SL.Ink.tertiary}>{versionLine()}</Text>
      <span aria-hidden style={{ ...slFont(SL.TypeSize.meta), color: SL.Ink.tertiary }}>·</span>
      <PressButton onPress={() => setShowsCredits(true)} style={{ minHeight: SL.Space.hitMin, display: "flex", alignItems: "center" }}>
        <Text size={SL.TypeSize.meta} color={SL.Ink.secondary}>Photo credits</Text>
      </PressButton>
    </HStack>
  );

  const pending = app.pendingChanges.length;

  return (
    <>
      <ScrollView style={{ flex: "1 1 0", height: "100%" }}>
        <VStack alignment="leading" spacing={0} style={{ alignItems: "stretch", paddingBottom: "env(safe-area-inset-bottom)" }}>
          {/* The same head, at the same place, as every other tab. */}
          <div style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s5 }}>
            <SLScreenTitle
              title="Settings"
              trailing={
                onClose ? (
                  <PressButton onPress={onClose}>
                    <span style={{ ...slFont(SL.TypeSize.body, SL.Weight.semibold), color: SL.Signal.action, ...slHitTarget(), display: "inline-block" }}>Done</span>
                  </PressButton>
                ) : undefined
              }
            />
          </div>

          <VStack alignment="leading" spacing={SL.Space.s6} style={{ alignItems: "stretch", paddingLeft: SL.Space.s5, paddingRight: SL.Space.s5, paddingTop: SL.Space.s4, paddingBottom: SL.Space.s10 }}>
            {profileCard}
            {trainingGroup}
            {foodGroup}
            {appGroup}
            {privacyGroup}
            {dataGroup}
            {signOutButton}
            {footer}
          </VStack>
        </VStack>
      </ScrollView>

      <Sheet isPresented={reauthenticating} onDismiss={() => setReauthenticating(false)}>
        {/* Signing in again after the session expired. The account keeps its
            local copy and everything still queued, so nothing has to be redone. */}
        <SignInView onBack={() => setReauthenticating(false)} />
      </Sheet>

      <Sheet isPresented={showsCredits} onDismiss={() => setShowsCredits(false)}>
        <Credits onDone={() => setShowsCredits(false)} />
      </Sheet>

      <Sheet isPresented={showsUpdates} onDismiss={() => setShowsUpdates(false)}>
        <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
          <PatchNotesView onClose={() => setShowsUpdates(false)} />
        </div>
      </Sheet>
      <Sheet isPresented={showsPolicy} onDismiss={() => setShowsPolicy(false)}>
        <PrivacyPolicyView onClose={() => setShowsPolicy(false)} />
      </Sheet>

      <Sheet isPresented={showsBlocked} onDismiss={() => setShowsBlocked(false)}>
        <BlockedPeopleSheet onClose={() => setShowsBlocked(false)} />
      </Sheet>

      <Sheet isPresented={choosingVisibility} onDismiss={() => setChoosingVisibility(false)}>
        <VisibilitySheet
          selection={{ value: defaultVisibility, set: setVisibility }}
          friendCount={social.friends.length}
          onClose={() => setChoosingVisibility(false)}
        />
      </Sheet>

      <Alert
        isPresented={remindersDenied}
        onDismiss={() => setRemindersDenied(false)}
        title="Notifications are off for Setline"
        message="Turn them on in Settings › Setline › Notifications, then switch meal reminders on here."
        actions={[{ title: "OK", role: "cancel" }]}
      />

      <Sheet isPresented={choosingPlan} onDismiss={() => setChoosingPlan(false)}>
        {choosingPlan && (
          <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
            <PlansSheet onClose={() => setChoosingPlan(false)} />
          </div>
        )}
      </Sheet>

      <Sheet isPresented={managingWorkouts} onDismiss={() => setManagingWorkouts(false)}>
        <WorkoutChooserSheet onStart={undefined} onClose={() => setManagingWorkouts(false)} />
      </Sheet>

      <FullScreenCover isPresented={planningWeek}>
        <CoverSafeArea>
          <WeekPlanView onClose={() => setPlanningWeek(false)} />
        </CoverSafeArea>
      </FullScreenCover>

      <Sheet isPresented={editingTargets} onDismiss={() => setEditingTargets(false)}>
        <TargetsSheet
          targets={summary.targets}
          onSave={(list) => {
            setEditingTargets(false);
            void app.record(list);
          }}
          onClose={() => setEditingTargets(false)}
        />
      </Sheet>

      <ConfirmationDialog
        isPresented={confirmSignOut}
        onDismiss={() => setConfirmSignOut(false)}
        title="Sign out?"
        message={`${changes(pending)} ${verb(pending, "is", "are")} only on this phone. ${verb(pending, "It's", "They're")} kept and will sync when you sign in again.`}
        actions={[
          { title: "Sign out", role: "destructive", action: () => app.signOut() },
          { title: "Cancel", role: "cancel" },
        ]}
      />

      <Alert
        isPresented={confirmsResetWorkouts}
        onDismiss={() => setConfirmsResetWorkouts(false)}
        title={app.sessions.length === 1 ? "Delete your workout?" : `Delete all ${app.sessions.length} workouts?`}
        message="Your log, records, streak and progress start from zero, here and on the web. This can't be undone, so export first if you want a copy. Your plan, food log, weigh-ins, photos and posts stay."
        actions={[
          { title: "Cancel", role: "cancel" },
          { title: "Delete all", role: "destructive", action: () => void app.removeAllSessions() },
        ]}
      />

      <Alert
        isPresented={confirmsDeleteAll}
        onDismiss={() => setConfirmsDeleteAll(false)}
        title={social.myPostCount === 1 ? "Delete your post?" : `Delete all ${social.myPostCount} posts?`}
        message="Their photos, comments and kudos are removed for everyone, right away. Your workouts, records and streak stay in your log."
        actions={[
          { title: "Cancel", role: "cancel" },
          {
            title: "Delete all",
            role: "destructive",
            action: () => {
              void (async () => {
                try {
                  await social.deleteAllMyPosts();
                } catch {
                  setDeleteAllFailed(true);
                }
              })();
            },
          },
        ]}
      />

      <Alert
        isPresented={deleteAllFailed}
        onDismiss={() => setDeleteAllFailed(false)}
        title="Couldn't delete your posts"
        message="Check your connection and try again."
        actions={[{ title: "OK", role: "cancel" }]}
      />

      <Alert
        isPresented={namingProfile}
        onDismiss={() => setNamingProfile(false)}
        title="Your name"
        message="Training greets you by your first name."
        textField={{ value: draftName, onChange: setDraftName, placeholder: "Name", autoCapitalize: "words" }}
        actions={[
          { title: "Save", action: () => app.setProfileName(draftName) },
          { title: "Cancel", role: "cancel" },
        ]}
      />

      <Alert
        isPresented={photoFailed}
        onDismiss={() => setPhotoFailed(false)}
        title="That photo didn't work"
        message="It couldn't be read or saved. Try another one."
        actions={[{ title: "OK", role: "cancel" }]}
      />
    </>
  );
}

/** A full-screen cover's content inside the safe area, as SwiftUI keeps it. */
function CoverSafeArea({ children }: { children?: ReactNode }) {
  return (
    <div
      style={{
        flex: "1 1 0",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {children}
    </div>
  );
}

/** `.lineLimit(1).truncationMode(.middle)` for the address. */
function MiddleTruncated({ text }: { text: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const fit = () => {
      el.textContent = text;
      if (el.scrollWidth <= el.clientWidth) {
        setShown(text);
        return;
      }
      let keep = text.length - 1;
      while (keep > 1) {
        const head = Math.ceil(keep / 2);
        const tail = keep - head;
        const candidate = `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
        el.textContent = candidate;
        if (el.scrollWidth <= el.clientWidth) {
          setShown(candidate);
          return;
        }
        keep -= 1;
      }
      setShown(`${text.slice(0, 1)}…`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);
  return (
    <span ref={host} style={{ ...slFont(SL.TypeSize.meta), color: SL.Ink.secondary, whiteSpace: "nowrap", overflow: "hidden", display: "block", width: "100%", lineHeight: 1.25 }}>
      {shown}
    </span>
  );
}

/** Who made the food photos, as their licences ask — a navigation bar and an inset grouped list. */
function Credits({ onDone }: { onDone: () => void }) {
  const section = (title: string, rows: ReactNode[]) => (
    <VStack alignment="leading" spacing={6} style={{ alignItems: "stretch" }}>
      <Text size={13} color={SL.Ink.secondary} style={{ paddingLeft: 20, textTransform: "uppercase" }}>{title}</Text>
      <VStack spacing={0} style={{ alignItems: "stretch", background: SL.Surface.raised, borderRadius: 10, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <Fragment key={i}>
            {i > 0 && <div style={{ height: 0.5, marginLeft: 20, background: "rgba(84,84,88,0.65)" }} />}
            <div style={{ padding: "11px 20px" }}>{r}</div>
          </Fragment>
        ))}
      </VStack>
    </VStack>
  );
  const item = (name: string, credit: string) => (
    <VStack alignment="leading" spacing={2}>
      <Text {...slBody()} color={SL.Ink.primary}>{name}</Text>
      <Text {...slMeta()} color={SL.Ink.secondary}>{credit}</Text>
    </VStack>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, height: "100%", background: SL.Surface.ground }}>
      <Presentation background={SL.Surface.ground} />
      <div style={{ position: "relative", height: 52, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Text size={17} weight={600} color={SL.Ink.primary}>Photo credits</Text>
        <PressButton onPress={onDone} style={{ position: "absolute", right: 16, top: 0, bottom: 0, display: "flex", alignItems: "center" }}>
          <span style={{ ...slFont(17, SL.Weight.semibold), color: SL.Signal.action }}>Done</span>
        </PressButton>
      </div>
      <ScrollView style={{ flex: "1 1 0" }}>
        <VStack spacing={SL.Space.s6} style={{ alignItems: "stretch", padding: `${SL.Space.s4}px 16px calc(env(safe-area-inset-bottom) + ${SL.Space.s8}px)` }}>
          {section("Quick adds", FoodIdeas.all.map((idea) => item(idea.name, idea.credit)))}
          {section("Recipes", [
            ...Recipes.photoCredits.map((c) => item(c.name, c.credit)),
            <Text key="other" {...slMeta()} color={SL.Ink.secondary}>Other recipes use the photo of their main ingredient, credited above.</Text>,
          ])}
          {section("Search results", [
            <Text key="off" {...slMeta()} color={SL.Ink.secondary}>Product photos and data from Open Food Facts, under the Open Database Licence.</Text>,
          ])}
        </VStack>
      </ScrollView>
    </div>
  );
}
