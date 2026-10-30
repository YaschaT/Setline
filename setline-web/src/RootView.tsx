// RootView.swift — launch, the way in, onboarding, and the five tabs with
// the workout as a full-screen presentation over them.
//
// Left out on the web: the App lock (Face ID does not exist here —
// `AppLock.isAvailable` is false, so the lock can never be on and the shield
// never shows), haptics, and the DEBUG launch arguments other than the
// development-only URL switches noted below.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SL } from "./design/tokens";
import { FullScreenCover, Sheet, useAppStorage, useScenePhase } from "./design/swiftui";
import { SLTabBar, SLTab } from "./design/components/SLTabBar";
import { SLCelebration, Celebration } from "./design/components/SLCelebration";
import { maxBy } from "./core/Support/swift";
import { Schedule } from "./core/Engine/Schedule";
import { Milestone } from "./core/Progress/Milestones";
import type { WorkoutDay, TrainingSession } from "./core/Domain/Model";
import { ActiveSessionSnapshot, type ActiveSessionSnapshot as Snapshot } from "./core/Domain/ActiveSession";
import { useApp } from "./data/AppState";
import { useSocial } from "./data/SocialStore";
import { LoadingView } from "./features/Auth/LoadingView";
import { ColdOpenView } from "./features/Auth/ColdOpenView";
import { NewPasswordView, SignInView } from "./features/Auth/SignInView";
import { OnboardingFlow } from "./features/Onboarding/OnboardingFlow";
import { AccountView } from "./features/Account/AccountView";
import { TrainingHomeView } from "./features/Training/TrainingHomeView";
import { NutritionHomeView } from "./features/Nutrition/NutritionHomeView";
import { ProgressHomeView } from "./features/Progress/ProgressHomeView";
import { FriendsView } from "./features/Friends/FriendsView";
import { PhotosHomeView } from "./features/Photos/PhotosHomeView";
import { SessionView } from "./features/Session/SessionView";
import { InviteLandingSheet } from "./features/Friends/InviteViews";
import { SharedWorkoutInbox, SharedWorkoutSheet } from "./features/Training/SharedWorkoutSheet";
import { PatchNotes, usePatchNotes } from "./features/Account/PatchNotes";
import { PatchNotesDialog } from "./features/Account/PatchNotesView";
import type { CustomWorkoutLink_Received } from "./core/Domain/CustomWorkoutLink";
import { PostComposerView } from "./features/Friends/PostComposerView";
import { StreakReminder } from "./features/Training/StreakReminder";
import { NutritionReminders, habitMilestones } from "./features/Progress/GoalViews";
import { WorkoutReminder } from "./features/Session/WorkoutReminder";

/**
 * A session in progress, optionally resumed from a paused snapshot.
 *
 * `loggingFor` is set when the workout is being written down afterwards for
 * a date that has passed — the same screen, the same logging, with that date
 * on the session instead of today.
 */
export interface RootView_RunningSession {
  day: WorkoutDay;
  snapshot?: Snapshot;
  loggingFor?: Date;
}
export const RootView_RunningSession = {
  id(self: RootView_RunningSession): string {
    if (self.loggingFor === undefined) return self.day.id;
    return `${self.day.id}:${Schedule.dateKey(self.loggingFor)}`;
  },
};

type Entry = "beginning" | "returning";

/**
 * Development builds only, in place of the Swift DEBUG launch arguments:
 * `?onboarding=1` (-SetlineOnboarding), `?coldOpen=1` (-SetlineColdOpen),
 * `?tab=voeding` (-SetlineTab), `?openAccount=1` (-SetlineAccount). A
 * production build reads none of them.
 */
function devFlag(name: string): string | undefined {
  if (!import.meta.env.DEV) return undefined;
  return new URLSearchParams(location.search).get(name) ?? undefined;
}

/** `.onChange(of:)` without `initial`: runs when the value changes, not on appear. */
function useOnChange<T>(value: T, action: (value: T) => void) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    action(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

/** A presented item kept through its exit animation (`.sheet(item:)`, `.fullScreenCover(item:)`). */
function useLastItem<T>(item: T | undefined): T | undefined {
  const [last, setLast] = useState<T | undefined>(item);
  if (item !== undefined && item !== last) setLast(item);
  return item ?? last;
}

/** The safe area around a full-screen presentation, as SwiftUI keeps it. */
function SafeArea({ children }: { children?: ReactNode }) {
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

/** Whatever loading led to fades in where the loading screen stood. */
function Fade({ duration, children }: { duration: number; children?: ReactNode }) {
  return <div style={{ height: "100%", animation: `slRootFade ${duration}s ease-in-out` }}>{children}</div>;
}

export function RootView() {
  const app = useApp();
  const scenePhase = useScenePhase();
  const [tab, setTab] = useState<SLTab>(() => {
    const requested = devFlag("tab");
    return requested && (SLTab.allCases as string[]).includes(requested) ? (requested as SLTab) : "training";
  });
  /** The launch intro has played to its end. */
  const [launchIntroDone, setLaunchIntroDone] = useState(false);
  /** The first load after launch is over; later loads (after a sign-in) get the ordinary loading screen. */
  const [launchLoadDone, setLaunchLoadDone] = useState(false);
  const [running, setRunning] = useState<RootView_RunningSession | undefined>(undefined);
  /** Which way the reader came in from the cold open, and therefore which side of the one identity screen opens. */
  const [entry, setEntry] = useState<Entry | undefined>(undefined);
  const [onboarded, setOnboarded] = useState(false);
  /** Account, opened from the avatar. */
  const [showsAccount, setShowsAccount] = useState(devFlag("openAccount") === "1");
  /** A saved workout being turned into a post. */
  const [composing, setComposing] = useState<TrainingSession | undefined>(undefined);
  /** A food or progress badge just earned. */
  const [habitBadge, setHabitBadge] = useState<Celebration | undefined>(undefined);
  /** Habit badges already seen, so each is celebrated once. */
  const [habitsSeen, setHabitsSeen] = useAppStorage("setline.badges.habitsSeen", "");
  /** An invite link opened: setline://add/<username>. */
  const [invite, setInvite] = useState<string | undefined>(undefined);
  /** A workout a friend sent as a link, offered once the account is open. */
  const [sharedWorkout, setSharedWorkout] = useState<CustomWorkoutLink_Received | undefined>(undefined);
  /** "What's new", opened by itself once for an update not read yet. */
  const [showsUpdates, setShowsUpdates] = useState(false);
  const updatesOffered = useRef(false);
  const updates = usePatchNotes();

  /** `?onboarding=1` walks the new-account flow without making one (development builds). */
  const showsOnboarding = devFlag("onboarding") === "1" && !onboarded;
  /** `?coldOpen=1` shows the way in without signing anybody out (development builds). */
  const showsColdOpen = devFlag("coldOpen") === "1" && entry === undefined;

  /** The day as the programme has it. A date read through the agenda already carries the lighter week; the session applies that itself, and handing it the lightened day would cut the sets twice. */
  const programmed = (day: WorkoutDay): WorkoutDay => app.plan.find((d) => d.id === day.id) ?? day;

  /**
   * A workout left open — the app was closed in the background mid-workout —
   * opens again where it was, rather than waiting on the home screen. A
   * workout paused by hand stays paused; one left for hours stays too.
   */
  const reopenLeftWorkout = () => {
    const left = app.resumableSession;
    if (running !== undefined || !left || !ActiveSessionSnapshot.reopensOnLaunch(left, { at: new Date() })) return;
    const day = app.day({ for: left });
    if (!day) return;
    setRunning({ day, snapshot: left });
  };

  /**
   * A food or progress badge reached since the last look gets its moment;
   * the first look only remembers, so nothing old is celebrated.
   */
  const celebrateHabits = () => {
    if (!app.isSignedIn || app.isLoading) return;
    const reached = (habitMilestones(app) as Milestone[]).filter((m) => Milestone.isReached(m));
    const ids = new Set(reached.map((m) => m.id));
    if (habitsSeen === "") {
      setHabitsSeen(ids.size === 0 ? "-" : [...ids].sort().join(","));
      return;
    }
    const seen = new Set(habitsSeen.split(",").filter((s) => s !== ""));
    const fresh = maxBy(reached.filter((m) => !seen.has(m.id)), (a, b) => a.tier < b.tier);
    if (fresh) setHabitBadge(Celebration.make({ symbol: "rosette", title: "Badge earned", detail: fresh.title, badge: fresh }));
    setHabitsSeen([...new Set([...seen, ...ids])].sort().join(","));
  };

  // Re-decided whenever the account changes: a logged workout takes
  // tonight's reminder away.
  useEffect(() => {
    void StreakReminder.update(app);
    void NutritionReminders.update(app);
    celebrateHabits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.revision]);

  // `.onChange(of: app.isLoading, initial: true)`.
  useEffect(() => {
    if (!app.isLoading) {
      setLaunchLoadDone(true);
      reopenLeftWorkout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.isLoading]);

  // Resumed, finished or ended anywhere: no reminder about it is left.
  useOnChange(app.resumableSession === undefined, (none) => {
    if (none) WorkoutReminder.cancel();
  });
  const runningID = running ? RootView_RunningSession.id(running) : undefined;
  useOnChange(runningID, (id) => {
    if (id !== undefined) WorkoutReminder.cancel();
  });

  // `.onOpenURL`: setline://add/<username>. A browser never hands the page a
  // setline:// link, so on the web this only reads the address it opened at.
  useEffect(() => {
    let url: URL;
    try {
      url = new URL(location.href);
    } catch {
      return;
    }
    if (url.protocol !== "setline:" || url.host !== "add") return;
    const name = url.pathname.split("/").filter((s) => s !== "")[0];
    if (!name) return;
    setTab("friends");
    setInvite(name.toLowerCase());
  }, []);

  let content: ReactNode;
  if (!launchIntroDone || (app.isLoading && !launchLoadDone)) {
    // The cold launch: the intro plays once, whole, even when the account is
    // read in a fraction of a second.
    content = <LoadingView key="launch" speed={1.6} delay={0} onIntroFinished={() => setLaunchIntroDone(true)} />;
  } else if (app.isLoading) {
    content = (
      <Fade key="loading" duration={0.25}>
        <LoadingView />
      </Fade>
    );
  } else if (app.isSignedIn && app.needsNewPassword) {
    // Web only: opened from a password-reset email.
    content = (
      <Fade key="newPassword" duration={0.3}>
        <NewPasswordView />
      </Fade>
    );
  } else if (app.isSignedIn && (app.isNewAccount || showsOnboarding)) {
    content = (
      <Fade key="onboarding" duration={0.3}>
        <OnboardingFlow
          onFinish={() => {
            setOnboarded(true);
            app.finishOnboarding();
          }}
        />
      </Fade>
    );
  } else if (app.isSignedIn && !showsColdOpen) {
    content = (
      <Fade key="signedIn" duration={0.3}>
        <SignedIn
          tab={tab}
          setTab={setTab}
          scenePhase={scenePhase}
          onStart={(day) => setRunning({ day: programmed(day) })}
          onResume={(day, snapshot) => setRunning({ day, snapshot })}
          onLogPast={(day, date) => setRunning({ day: programmed(day), loggingFor: date })}
          onAccount={() => setShowsAccount(true)}
        />
      </Fade>
    );
  } else if (entry !== undefined) {
    content = (
      <Fade key={`signIn-${entry}`} duration={0.3}>
        <SignInView registering={entry === "beginning"} onBack={() => setEntry(undefined)} />
      </Fade>
    );
  } else {
    content = (
      <Fade key="coldOpen" duration={0.3}>
        <ColdOpenView onBegin={() => setEntry("beginning")} onSignIn={() => setEntry("returning")} />
      </Fade>
    );
  }

  const shownRunning = useLastItem(running);
  const shownComposing = useLastItem(composing);
  const shownInvite = useLastItem(invite);
  const shownSharedWorkout = useLastItem(sharedWorkout);
  const signedInShell = app.isSignedIn && !app.isLoading && !app.needsNewPassword && !(app.isNewAccount || showsOnboarding) && !showsColdOpen;
  // Offered once the account is open; taken from the inbox so it's offered once.
  useEffect(() => {
    if (!signedInShell || sharedWorkout !== undefined) return;
    const received = SharedWorkoutInbox.take();
    if (received) setSharedWorkout(received);
  }, [signedInShell, sharedWorkout]);

  // A new update, shown once as the app opens: on the home screen, never over
  // a workout, a shared link or an invite. Someone who hasn't trained yet has
  // nothing it changed for them, so it is simply marked read.
  const hasUnseenUpdate = updates.hasUnseen;
  useEffect(() => {
    // On Training only: the first screen, and never in the middle of something.
    if (updatesOffered.current || !hasUnseenUpdate || !signedInShell || tab !== "training") return;
    if (running !== undefined || sharedWorkout !== undefined || invite !== undefined) return;
    updatesOffered.current = true;
    if (app.sessions.length === 0) {
      PatchNotes.markSeen();
      return;
    }
    setShowsUpdates(true);
  }, [hasUnseenUpdate, signedInShell, tab, running, sharedWorkout, invite, app.sessions.length]);

  return (
    <div style={{ height: "100%", background: SL.Surface.ground, color: SL.Ink.primary }}>
      <style>{"@keyframes slRootFade { from { opacity: 0 } to { opacity: 1 } }"}</style>
      {content}

      {/* `.slCelebration($habitBadge)`, under the status bar. */}
      <div style={{ position: "fixed", top: "env(safe-area-inset-top)", left: 0, right: 0, zIndex: 45, pointerEvents: "none" }}>
        <SLCelebration item={{ value: habitBadge, set: setHabitBadge }} />
      </div>

      {signedInShell && (
        <>
          <Sheet isPresented={showsAccount} onDismiss={() => setShowsAccount(false)} background={SL.Surface.ground} dragIndicator>
            <AccountView onClose={() => setShowsAccount(false)} />
          </Sheet>

          {/* The session is a full-screen presentation over the tab shell, so
              the tab bar is gone the moment it starts: mid-set there is one task. */}
          <FullScreenCover isPresented={running !== undefined}>
            {shownRunning && (
              <SafeArea>
                <SessionView
                  key={RootView_RunningSession.id(shownRunning)}
                  day={shownRunning.day}
                  app={app}
                  resuming={shownRunning.snapshot}
                  loggingFor={shownRunning.loggingFor}
                  onFinish={(finished: TrainingSession, createPost: boolean) => {
                    setRunning(undefined);
                    WorkoutReminder.cancel();
                    void (async () => {
                      await app.save({ session: finished });
                      // The composer opens once the session cover is gone.
                      if (createPost) {
                        await new Promise((r) => setTimeout(r, 450));
                        setComposing(finished);
                      }
                    })();
                  }}
                  onPause={(snapshot: Snapshot) => {
                    setRunning(undefined);
                    void app.pauseSession(snapshot);
                  }}
                  // Opened and left with nothing done: there is nothing to
                  // park, and nothing an earlier autosave may have kept either.
                  onClose={() => {
                    setRunning(undefined);
                    WorkoutReminder.cancel();
                    void app.clearActiveSession();
                  }}
                />
              </SafeArea>
            )}
          </FullScreenCover>

          {showsUpdates && <PatchNotesDialog onClose={() => setShowsUpdates(false)} />}

          <Sheet isPresented={sharedWorkout !== undefined} onDismiss={() => setSharedWorkout(undefined)}>
            {shownSharedWorkout !== undefined && (
              <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
                <SharedWorkoutSheet received={shownSharedWorkout} onClose={() => setSharedWorkout(undefined)} />
              </div>
            )}
          </Sheet>

          <Sheet isPresented={invite !== undefined} onDismiss={() => setInvite(undefined)}>
            {shownInvite !== undefined && <InviteLandingSheet username={shownInvite} onClose={() => setInvite(undefined)} />}
          </Sheet>

          <FullScreenCover isPresented={composing !== undefined}>
            {shownComposing && (
              <SafeArea>
                <PostComposerView mode={{ kind: "create", value: shownComposing }} onClose={() => setComposing(undefined)} />
              </SafeArea>
            )}
          </FullScreenCover>
        </>
      )}
    </div>
  );
}

/** `signedIn`: the five tabs and the bar. */
function SignedIn(p: {
  tab: SLTab;
  setTab: (tab: SLTab) => void;
  scenePhase: "active" | "background";
  onStart: (day: WorkoutDay) => void;
  onResume: (day: WorkoutDay, snapshot: Snapshot) => void;
  onLogPast: (day: WorkoutDay, date: Date) => void;
  onAccount: () => void;
}) {
  const app = useApp();
  const social = useSocial();

  // Requests are known before Friends is opened, so its badge can say so.
  useEffect(() => {
    void social.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.userID]);

  // Back in the foreground, often back online: queued posts go out.
  useOnChange(p.scenePhase, (phase) => {
    if (phase === "active" && social.pending.length > 0) void social.load();
  });

  // The bar rests on the home band: at the bottom safe area, or 21 from the
  // edge on a phone without one — where every artboard draws it.
  const lift = `max(0px, calc(${SL.Space.homeBand}px - env(safe-area-inset-bottom)))`;

  let screen: ReactNode;
  switch (p.tab) {
    case "training":
      screen = (
        <TrainingHomeView
          // "Start training → logscherm": the session opens at once. Looking
          // first is `Oefeningen bekijken`, which starts nothing.
          onStart={p.onStart}
          onResume={p.onResume}
          // A workout that was done but never written down opens the same
          // session screen, with that date on it.
          onLogPast={p.onLogPast}
          onAccount={p.onAccount}
          onProgress={() => p.setTab("progressie")}
          onNutrition={() => p.setTab("voeding")}
        />
      );
      break;
    case "voeding":
      screen = <NutritionHomeView onAccount={p.onAccount} />;
      break;
    case "progressie":
      screen = <ProgressHomeView onAccount={p.onAccount} />;
      break;
    case "friends":
      screen = <FriendsView onAccount={p.onAccount} />;
      break;
    case "fotos":
      screen = <PhotosHomeView onAccount={p.onAccount} />;
      break;
  }

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        background: SL.Surface.ground,
        // Scrolled content stops at the status bar: the clock always sits on
        // the ground, as every artboard draws it.
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div style={{ position: "relative", height: "100%" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            // The bar, then the 4 the design leaves under it.
            paddingBottom: `calc(${SL.Metric.tabBarHeight + 4}px + ${lift})`,
          }}
        >
          <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>{screen}</div>
        </div>

        <div style={{ position: "absolute", left: 0, right: 0, bottom: lift, display: "flex", flexDirection: "column" }}>
          <SLTabBar selection={{ value: p.tab, set: p.setTab }} badges={{ friends: social.incoming.length }} />
        </div>
      </div>
    </div>
  );
}
