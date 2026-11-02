// AppState.swift — the app's one observable model, method for method.
//
// Local first: the device's copy is authoritative for what the screen shows,
// and every change lands there before the network is touched. A change is
// recorded as a `StateChange` and synced by applying it to the account's
// latest stored state — never by sending this device's copy.
import { useSyncExternalStore } from "react";
import { addDays, daysBetween, formatEnUS, isSameDay, startOfDay } from "../core/Support/calendar";
import { deepEqual, uuid } from "../core/Support/swift";
import { LegacyState } from "../core/Legacy/LegacyState";
import { LegacyAdapter } from "../core/Legacy/LegacyAdapter";
import { PlanCatalog } from "../core/Catalog/PlanCatalog";
import { ExerciseCatalog } from "../core/Catalog/ExerciseCatalog";
import type { WorkoutDay, TrainingSession, PlannedExercise, Exercise, BodyMetric, NutritionTargets } from "../core/Domain/Model";
import { Exercise as ExerciseNS, TrainingSession as TrainingSessionNS, LoggedSet } from "../core/Domain/Model";
import { PlateInventory, type Experience } from "../core/Domain/Intake";
import { NutritionEntry } from "../core/Nutrition/NutritionDay";
import { Deload, SessionPrescription } from "../core/Engine/Fatigue";
import type { ActiveSessionSnapshot } from "../core/Domain/ActiveSession";
import { ActiveSessionSnapshot as ActiveSessionSnapshotNS } from "../core/Domain/ActiveSession";
import { CustomWorkout, CustomWorkout_Item } from "../core/Domain/CustomWorkout";
import { PainFlag, PainRegion } from "../core/Domain/PainFlag";
import type { LoadTag } from "../core/Domain/ExerciseAttributes";
import { ProgramReplacement, CustomExercise as CustomExerciseNS, type CustomExercise } from "../core/Domain/Substitution";
import { SessionSlot } from "../core/Domain/SessionSlot";
import { AuthSession, AuthFailure } from "../core/Sync/AuthSession";
import { AuthSessionCoordinator } from "../core/Sync/AuthSessionCoordinator";
import { StateChange } from "../core/Sync/StateChange";
import { StateMerge } from "../core/Sync/StateMerge";
import { StateSync } from "../core/Sync/StateSync";
import { TrainingSession_adding, type SetCorrection, type SetRemoval, type SetAddition } from "../core/Sync/SetCorrection";
import { TrainingStreak } from "../core/Progress/TrainingStreak";
import { WeighIn } from "../core/Progress/WeighIn";
import { NumberDisplay } from "../core/Engine/NumberDisplay";
import { Agenda, type AgendaDay } from "../core/Engine/Agenda";
import { Schedule } from "../core/Engine/Schedule";
import { ExerciseHistory } from "../core/Engine/ExerciseHistory";
import { ProgressionEngine } from "../core/Engine/ProgressionEngine";
import { RecordsEngine } from "../core/Engine/RecordsEngine";
import { Fatigue, Fatigue_Reading as Fatigue_ReadingNS, type Fatigue_Reading } from "../core/Engine/Fatigue";
import { SubstitutionRanker, type SwapContext, type RankedAlternative } from "../core/Engine/SubstitutionRanking";
import { NutritionDay } from "../core/Nutrition/NutritionDay";
import { NutritionHistory } from "../core/Nutrition/NutritionHistory";
import type { FoodSearchOutcome } from "../core/Nutrition/FoodSearch";
import { FavoriteFood, type FoodScanRequest } from "../core/Nutrition/FoodLookup";
import { SavedMeal } from "../core/Nutrition/SavedMeal";
import { CheckInStore } from "../core/Photos/CheckInStore";
import { ProfileStore } from "../core/Photos/ProfileStore";
import { PhotoOwner } from "../core/Photos/PhotoOwner";
import { SupabaseClient, SupabaseStateStore } from "./SupabaseClient";
import { LocalStore } from "./LocalStore";
import { Keychain } from "./Keychain";
import { ProfilePhoto } from "./ProfilePhoto";
import { FoodSearchService } from "./FoodSearchService";
import { MealScanService, type MealScanService_Outcome } from "./MealScanService";
import { FoodLookupService, type FoodLookupService_BarcodeOutcome } from "./FoodLookupService";
import { UserDefaults } from "../design/swiftui";

export type SyncState =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "synced"; value: Date }
  | { kind: "offline" }
  /** The account's refresh token was rejected, so only signing in again resumes sync. */
  | { kind: "sessionExpired" }
  | { kind: "notConfigured" };

/** A lift the engine proposes to raise: last time's working weight and the one it suggests today. */
export interface ReadyLift {
  name: string;
  fromKg?: number;
  toKg: number;
}

export class AppState {
  // MARK: Identity
  session: AuthSession | undefined;
  authError: string | undefined;
  isWorking = false;
  get isSignedIn(): boolean {
    return this.session !== undefined;
  }
  /** From launch until the device knows who is signed in and has something of theirs to show. */
  isLoading = true;
  /** The signed-in account's progress photos: on this device only. */
  photos: CheckInStore | undefined;
  profileName: string | undefined;
  /** An object URL of the avatar picture. */
  profilePhoto: string | undefined;
  private profile: ProfileStore | undefined;

  // MARK: Data
  state: LegacyState | undefined;
  sync: SyncState = { kind: "idle" };
  /** Changes made on this device that the account does not have yet, oldest first. */
  pendingChanges: StateChange[] = [];
  get hasPendingChanges(): boolean {
    return this.pendingChanges.length > 0;
  }
  lastSyncedAt: Date | undefined;

  // MARK: Derived
  plan: WorkoutDay[] = PlanCatalog.personal;
  sessions: TrainingSession[] = [];
  /** Moves every time the state is read again. */
  revision = 0;
  scheduleOverrides: Record<string, string> = {};
  /** A workout that was started and paused. */
  activeSession: ActiveSessionSnapshot | undefined;
  hiddenWarmups: Set<string> = new Set();
  favoriteExercises: Set<string> = new Set();
  painFlags: PainFlag[] = [];
  programReplacements: ProgramReplacement[] = [];
  customExercises: CustomExercise[] = [];
  customWorkouts: CustomWorkout[] = [];
  nutritionEntries: NutritionEntry[] = [];
  targets: NutritionTargets | undefined;
  plateInventory: PlateInventory = PlateInventory.default;
  experience: Experience | undefined;
  deload: Deload | undefined;

  readonly display = NumberDisplay.english;
  private readonly client: SupabaseClient;
  private readonly foodSearch = new FoodSearchService();
  private readonly mealScan = new MealScanService();
  private store: LocalStore | undefined;
  private isSyncing = false;
  private syncRequested = false;
  private auth: AuthSessionCoordinator | undefined;
  private authGeneration = uuid();

  private static readonly sessionKey = "supabase.session";
  /** Development builds only: the demo module while `?demo=1` is on (DemoData.swift's `isEnabled`). */
  private demo: typeof import("./DemoData").DemoData | undefined;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  attach(store: LocalStore): void {
    this.store = store;
  }

  // MARK: - Observation (SwiftUI's @Observable)

  private listeners = new Set<() => void>();
  private version = 0;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getVersion = (): number => this.version;
  /** Every view reading the model draws again. */
  changed(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  // MARK: - Pending changes on the device

  private encodePending(): { encoded: string; count: number } {
    return { encoded: StateChange.encodeList(this.pendingChanges), count: this.pendingChanges.length };
  }

  // MARK: - Launch

  async restore(): Promise<void> {
    // The Swift `#if DEBUG` demo path: a development build opened with
    // `?demo=1`. The module is imported only inside this branch, so a
    // production build neither contains nor enables it.
    if (import.meta.env.DEV && new URLSearchParams(location.search).get("demo") === "1") {
      const { DemoData } = await import("./DemoData");
      this.demo = DemoData;
      // `&slowLoad=1` holds the loading screen for a few seconds.
      if (DemoData.flag("slowLoad")) await new Promise((r) => setTimeout(r, 4000));
      const demoSession = DemoData.session;
      this.session = demoSession;
      // A folder of its own, and never the photos the phone kept before
      // photos had owners: those can only be a real account's.
      this.openPhotos(PhotoOwner.demo(demoSession.userID), false);
      this.openProfile(PhotoOwner.demo(demoSession.userID));
      // Read back what the device already holds, so a paused session
      // survives a relaunch exactly as it does for a real account.
      // `&reset=1` starts from the fabricated data again.
      const stored = DemoData.flag("reset") ? undefined : this.store?.load(demoSession.email);
      const demo = stored ?? DemoData.state();
      this.apply(demo);
      if (stored === undefined) this.store?.markSynced(demo, { encoded: StateChange.encodeList([]), count: 0 }, new Date(), demoSession.email);
      this.lastSyncedAt = this.store?.lastSyncedAt(demoSession.email) ?? new Date();
      this.sync = { kind: "synced", value: new Date() };
      this.isLoading = false;
      this.changed();
      return;
    }
    if (!this.client.isConfigured) {
      this.sync = { kind: "notConfigured" };
      this.isLoading = false;
      this.changed();
      return;
    }
    // Opened from a link in an account email (confirm sign-up, reset password).
    if (await this.signInFromEmailLink()) return;
    const text = Keychain.get(AppState.sessionKey);
    let saved: AuthSession | undefined;
    if (text) {
      try {
        saved = AuthSession.decode(JSON.parse(text));
      } catch {
        saved = undefined;
      }
    }
    if (saved) {
      this.begin(saved);
      await this.loadState();
    }
    this.isLoading = false;
    this.changed();
  }

  // MARK: - Links from account emails (web only)

  /** Set after a password-reset link: the account is signed in and asks for a new password. */
  needsNewPassword = false;

  /**
   * A confirmation or reset link lands here with the session in the address.
   * It signs that account in: a confirmed new account starts its onboarding,
   * a reset asks for the new password. `true` when it handled a link.
   */
  private async signInFromEmailLink(): Promise<boolean> {
    const link = SupabaseClient.linkFromAddress(location.hash);
    if (!link) return false;
    // The tokens leave the address bar at once.
    history.replaceState(null, "", "/");
    if (link.kind === "error") {
      this.authError = `That link didn't work (${link.message}). Sign in, or tap Forgot password for a new one.`;
      return false;
    }
    try {
      const user = await this.client.user(link.accessToken);
      const session: AuthSession = { accessToken: link.accessToken, refreshToken: link.refreshToken, userID: user.id, email: user.email, expiresAt: link.expiresAt };
      this.clearData();
      this.begin(session);
      this.persist(session);
      this.isNewAccount = link.type === "signup";
      this.needsNewPassword = link.type === "recovery";
      await this.loadState();
      this.isLoading = false;
      this.changed();
      return true;
    } catch {
      this.authError = "That link has expired. Sign in, or tap Forgot password for a new one.";
      return false;
    }
  }

  /** Saves the new password after a reset link. Returns an error message, or undefined when it worked. */
  async setNewPassword(password: string): Promise<string | undefined> {
    if (password.length < 6) return "Use at least 6 characters.";
    if (!this.auth) return "Sign in again to change your password.";
    try {
      await this.auth.perform((session) => this.client.updatePassword(session, password));
      this.needsNewPassword = false;
      this.changed();
      return undefined;
    } catch (error) {
      return (error as Error).message || "That didn't work. Try again in a moment.";
    }
  }

  // MARK: - Auth

  async signIn(a: { email: string; password: string }): Promise<void> {
    await this.authenticate(() => this.client.signIn(a.email, a.password));
  }

  /** True for exactly as long as it takes to walk a new account through onboarding. */
  isNewAccount = false;

  async signUp(a: { email: string; password: string }): Promise<void> {
    await this.authenticate(() => this.client.signUp(a.email, a.password));
    this.isNewAccount = this.authError === undefined && this.session !== undefined;
    this.changed();
  }

  finishOnboarding(): void {
    this.isNewAccount = false;
    this.changed();
  }

  async sendPasswordReset(a: { email: string }): Promise<void> {
    if (a.email === "") {
      this.authError = "Enter your email address first.";
      this.changed();
      return;
    }
    try {
      await this.client.sendPasswordReset(a.email);
      this.authError = `We sent a reset email to ${a.email}.`;
    } catch (error) {
      this.authError = (error as Error).message;
    }
    this.changed();
  }

  private async authenticate(work: () => Promise<AuthSession>): Promise<void> {
    this.isWorking = true;
    this.authError = undefined;
    this.changed();
    try {
      const result = await work();
      if (this.auth && this.session?.email.toLowerCase() === result.email.toLowerCase()) {
        // Signing in again after the session expired: the same account keeps
        // its device copy and its pending changes.
        this.session = result;
        this.persist(result);
        await this.auth.replace(result);
      } else {
        // Another account's data never stays on screen for this one.
        this.clearData();
        this.begin(result);
        this.persist(result);
      }
      await this.loadState();
    } catch (error) {
      this.authError = (error as Error).message;
    } finally {
      this.isWorking = false;
      this.changed();
    }
  }

  /** Leaves the account on this device. Its local copy and any pending changes stay stored under that account. */
  signOut(): void {
    this.isNewAccount = false;
    // The demo signed nothing in. The session in storage belongs to a real
    // account on this device, and leaving the demo must not end it.
    const keepsSavedSession = import.meta.env.DEV && this.demo !== undefined;
    if (!keepsSavedSession) Keychain.remove(AppState.sessionKey);
    this.session = undefined;
    this.photos = undefined;
    this.profile = undefined;
    this.profileName = undefined;
    this.setProfilePhotoURL(undefined);
    this.auth = undefined;
    this.authGeneration = uuid();
    this.clearData();
    this.sync = { kind: "idle" };
    this.changed();
  }

  /** Starts using a session, with a token coordinator tied to this sign-in. */
  private begin(newSession: AuthSession): void {
    const generation = uuid();
    this.authGeneration = generation;
    this.session = newSession;
    this.openPhotos(PhotoOwner.account(newSession.userID), this.mayAdoptUnownedPhotos(newSession));
    this.openProfile(PhotoOwner.account(newSession.userID));
    this.auth = new AuthSessionCoordinator({
      session: newSession,
      refresher: this.client,
      onRefresh: async (renewed: AuthSession) => this.didRefresh(renewed, generation),
    });
  }

  private openPhotos(owner: PhotoOwner, mayAdopt: boolean): void {
    if (this.photos && deepEqual(this.photos.owner, owner)) return;
    const opened = new CheckInStore({ owner, mayAdoptUnownedPhotos: mayAdopt });
    this.photos = opened;
    void opened.migrateUnownedPhotos().then(() => this.changed());
  }

  // MARK: - Social

  get userID(): string | undefined {
    return this.session?.userID;
  }

  /** Runs a social request through this sign-in's token coordinator. */
  async social<Value>(request: (client: SupabaseClient, session: AuthSession) => Promise<Value>): Promise<Value> {
    if (!this.auth) throw new Error("Sign in to see your friends.");
    return this.auth.perform((session) => request(this.client, session));
  }

  // MARK: - Name and picture

  get greetingName(): string | undefined {
    return ProfileStore.firstName({ of: this.profileName });
  }

  get avatarInitial(): string | undefined {
    return ProfileStore.initial({ name: this.profileName, email: this.session?.email });
  }

  private openProfile(owner: PhotoOwner): void {
    if (this.profile && deepEqual(this.profile.owner, owner)) return;
    const opened = new ProfileStore({ owner });
    this.profile = opened;
    this.profileName = opened.name();
    const photo = opened.photo();
    this.setProfilePhotoURL(photo ? new Blob([photo as BlobPart], { type: "image/jpeg" }) : undefined);
  }

  private setProfilePhotoURL(blob: Blob | undefined): void {
    if (this.profilePhoto) URL.revokeObjectURL(this.profilePhoto);
    this.profilePhoto = blob ? URL.createObjectURL(blob) : undefined;
  }

  /** An empty name removes it. */
  setProfileName(name: string): void {
    if (!this.profile) return;
    try {
      this.profile.setName(name);
    } catch {
      /* ignore */
    }
    this.profileName = this.profile.name();
    this.changed();
  }

  /** Keeps a square copy of the picture, small enough for an avatar. `false` when it could not be read or written. */
  async setProfilePhoto(data: Blob): Promise<boolean> {
    const profile = this.profile;
    if (!profile) return false;
    const square = await ProfilePhoto.square(data);
    if (!square || this.profile !== profile) return false;
    try {
      profile.setPhoto(new Uint8Array(await square.arrayBuffer()));
    } catch {
      return false;
    }
    this.setProfilePhotoURL(square);
    this.changed();
    return true;
  }

  removeProfilePhoto(): void {
    if (!this.profile) return;
    try {
      this.profile.removePhoto();
    } catch {
      /* ignore */
    }
    const photo = this.profile.photo();
    this.setProfilePhotoURL(photo ? new Blob([photo as BlobPart], { type: "image/jpeg" }) : undefined);
    this.changed();
  }

  private mayAdoptUnownedPhotos(session: AuthSession): boolean {
    if (!this.store) return false;
    return PhotoOwner.mayAdoptUnownedPhotos(PhotoOwner.account(session.userID), {
      email: session.email,
      accountsOnDevice: this.store.accountEmails(),
    });
  }

  /** Supabase retires a refresh token as soon as it is used, so the new one is stored before anything else can need it. */
  private didRefresh(renewed: AuthSession, generation: string): void {
    if (generation !== this.authGeneration || this.session === undefined) return;
    this.session = renewed;
    this.persist(renewed);
    this.changed();
  }

  private persist(session: AuthSession): void {
    Keychain.set(JSON.stringify(AuthSession.encode(session)), AppState.sessionKey);
  }

  private clearData(): void {
    this.state = undefined;
    this.plan = PlanCatalog.personal;
    this.sessions = [];
    this.scheduleOverrides = {};
    this.nutritionEntries = [];
    this.targets = undefined;
    this.plateInventory = PlateInventory.default;
    this.experience = undefined;
    this.deload = undefined;
    this.activeSession = undefined;
    this.hiddenWarmups = new Set();
    this.favoriteExercises = new Set();
    this.painFlags = [];
    this.programReplacements = [];
    this.customExercises = [];
    this.pendingChanges = [];
    this.lastSyncedAt = undefined;
  }

  // MARK: - State

  /** The device's copy first, so the screen never waits on the network, then a sync with the account. */
  async loadState(): Promise<void> {
    const session = this.session;
    if (!session) {
      this.isLoading = false;
      this.changed();
      return;
    }
    const encoded = this.store?.pendingChangesData(session.email);
    this.pendingChanges = encoded ? StateChange.decodeList(encoded) : [];
    this.lastSyncedAt = this.store?.lastSyncedAt(session.email);
    const local = this.store?.load(session.email);
    if (local) {
      this.apply(local);
      this.isLoading = false;
    } else {
      this.isLoading = true;
    }
    this.changed();
    await this.syncNow();
    // A brand-new account starts on the catalogue plan rather than an empty screen.
    if (this.state === undefined) this.apply(LegacyState.make({ raw: {} }));
    this.isLoading = false;
    this.changed();
  }

  /**
   * Brings this device and the account together. A failure of any kind keeps
   * every pending change for the next sync. Nothing here ever signs the
   * account out.
   */
  async syncNow(): Promise<void> {
    if (this.session === undefined) return;
    if (import.meta.env.DEV && this.demo) {
      // The three states a demo cannot reach on its own: no connection,
      // work still queued, and a sign-in that has run out.
      if (this.demo.flag("offline")) {
        this.sync = { kind: "offline" };
        this.changed();
        return;
      }
      if (this.demo.flag("expired")) {
        this.sync = { kind: "sessionExpired" };
        this.changed();
        return;
      }
      if (this.demo.flag("pending")) {
        this.sync = { kind: "idle" };
        this.changed();
        return;
      }
      // Demo data never leaves the device.
      this.pendingChanges = [];
      const syncedAt = new Date();
      if (this.state && this.session) this.store?.markSynced(this.state, this.encodePending(), syncedAt, this.session.email);
      this.lastSyncedAt = syncedAt;
      this.sync = { kind: "synced", value: syncedAt };
      this.changed();
      return;
    }
    if (!this.client.isConfigured) {
      this.sync = { kind: "notConfigured" };
      this.changed();
      return;
    }
    if (this.isSyncing) {
      this.syncRequested = true;
      return;
    }
    this.isSyncing = true;
    try {
      do {
        this.syncRequested = false;
        const session: AuthSession | undefined = this.session;
        const auth: AuthSessionCoordinator | undefined = this.auth;
        if (!session || !auth) return;
        if (auth.isExpired) {
          this.sync = { kind: "sessionExpired" };
          this.changed();
          continue;
        }
        this.sync = { kind: "syncing" };
        this.changed();
        try {
          const outcome = await StateSync.run({
            changes: this.pendingChanges,
            recovering: this.store?.unrecordedWork(session.email),
            store: new SupabaseStateStore(this.client, auth),
          });
          if (this.session?.userID !== session.userID) return;
          if (!outcome) {
            this.sync = { kind: "offline" };
            this.changed();
            continue;
          }
          this.pendingChanges = this.pendingChanges.filter((c) => !outcome.settled.has(c.id));
          const shown = StateMerge.apply(this.pendingChanges, { to: outcome.state });
          this.apply(shown);
          const now = new Date();
          this.lastSyncedAt = now;
          this.store?.markSynced(shown, this.encodePending(), now, session.email);
          this.sync = { kind: "synced", value: now };
          this.changed();
        } catch (error) {
          if (this.session?.userID !== session.userID) return;
          this.sync = error instanceof AuthFailure && error.kind === "expired" ? { kind: "sessionExpired" } : { kind: "offline" };
          this.changed();
        }
      } while (this.syncRequested);
    } finally {
      this.isSyncing = false;
    }
  }

  /** Records changes: shown at once, kept on the device until the account has them, and synced straight away. */
  private async commit(changes: StateChange[]): Promise<void> {
    const session = this.session;
    const current = this.state;
    if (!session || !current || changes.length === 0) return;
    const next = StateMerge.apply(changes, { to: current });
    this.apply(next);
    this.pendingChanges = [...this.pendingChanges, ...changes];
    this.store?.save(next, this.encodePending(), session.email);
    this.changed();
    await this.syncNow();
  }

  private apply(next: LegacyState | undefined): void {
    this.state = next;
    this.revision += 1;
    if (!next) return;
    this.plan = LegacyAdapter.plan({ from: next });
    this.sessions = [...LegacyAdapter.sessions({ from: next })].sort((a, b) => b.date.getTime() - a.date.getTime());
    this.scheduleOverrides = LegacyAdapter.scheduleOverrides({ from: next });
    this.activeSession = LegacyAdapter.activeSession({ from: next });
    this.hiddenWarmups = LegacyAdapter.hiddenWarmups({ from: next });
    this.favoriteExercises = LegacyAdapter.favoriteExercises({ from: next });
    this.painFlags = PainFlag.active(LegacyAdapter.painFlags({ from: next }));
    this.programReplacements = LegacyAdapter.programReplacements({ from: next });
    this.customExercises = LegacyAdapter.customExercises({ from: next });
    this.customWorkouts = LegacyAdapter.customWorkouts({ from: next });
    this.nutritionEntries = LegacyAdapter.nutritionEntries({ from: next });
    this.targets = LegacyAdapter.targets({ from: next });
    this.plateInventory = LegacyAdapter.plateInventory({ from: next });
    this.experience = LegacyAdapter.experience({ from: next });
    this.deload = LegacyAdapter.deload({ from: next });
    this.plan = this.applyReplacements(this.plan);
  }

  /** Rewrites the plan wherever a permanent replacement reaches it, on read. */
  private applyReplacements(days: WorkoutDay[]): WorkoutDay[] {
    if (this.programReplacements.length === 0) return days;
    return days.map((day) => ({
      ...day,
      exercises: day.exercises.map((planned) => {
        const replacement = [...this.programReplacements]
          .reverse()
          .find((r) => r.originExerciseID === planned.exerciseID && ProgramReplacement.applies(r, { toDay: day.id }));
        if (!replacement) return planned;
        return { ...planned, exerciseID: replacement.substituteExerciseID };
      }),
    }));
  }

  /** Saves a paused workout, locally first. */
  async pauseSession(snapshot: ActiveSessionSnapshot): Promise<void> {
    await this.commit([StateChange.activeSession(snapshot)]);
  }

  /** "Altijd verbergen" on the ramp. */
  async hideWarmup(a: { exerciseID: string }): Promise<void> {
    if (this.hiddenWarmups.has(a.exerciseID)) return;
    await this.commit([StateChange.make({ kind: "hideWarmup", exerciseID: a.exerciseID })]);
  }

  /** The star in Progressie's picker. */
  async setFavorite(a: { exerciseID: string; isFavorite: boolean }): Promise<void> {
    if (this.favoriteExercises.has(a.exerciseID) === a.isFavorite) return;
    await this.commit([StateChange.make({ kind: "setFavoriteExercise", exerciseID: a.exerciseID, isFavorite: a.isFavorite })]);
  }

  /**
   * The open workout, written to this device the moment it changes — every
   * set logged, and whenever the page leaves the foreground. One open
   * workout is one row in the sync queue, however often it is kept.
   */
  keepOpenSession(snapshot: ActiveSessionSnapshot): void {
    const session = this.session;
    const current = this.state;
    if (!session || !current) return;
    const change = StateChange.activeSession(snapshot);
    const next = StateMerge.apply([change], { to: current });
    this.apply(next);
    this.pendingChanges = [...this.pendingChanges.filter((c) => c.kind.kind !== "setActiveSession"), change];
    this.store?.save(next, this.encodePending(), session.email);
    this.changed();
    void this.syncNow();
  }

  async clearActiveSession(): Promise<void> {
    if (this.activeSession === undefined) return;
    await this.commit([StateChange.activeSession(undefined)]);
  }

  /** The paused snapshot, whatever day it was started on. */
  get resumableSession(): ActiveSessionSnapshot | undefined {
    return this.activeSession;
  }

  /** The plan day a paused session belongs to, which need not be today's. */
  day(a: { for: ActiveSessionSnapshot }): WorkoutDay | undefined {
    const snapshot = a.for;
    const day = this.plan.find((d) => d.id === snapshot.dayID);
    if (day) return day;
    if (CustomWorkout.isCustom({ dayID: snapshot.dayID })) {
      const custom = this.customWorkouts.find((c) => c.id === snapshot.dayID);
      if (custom) return CustomWorkout.workoutDay(custom);
      const rebuilt = CustomWorkout.make({
        id: snapshot.dayID,
        name: snapshot.dayLabel,
        items: (snapshot.slots ?? []).map((slot) => CustomWorkout_Item.make({ exerciseID: slot.active.exerciseID, sets: Math.max(1, SessionSlot.setCount(slot)) })),
      });
      return CustomWorkout.workoutDay(rebuilt);
    }
    return this.todayDay;
  }

  async saveCustomWorkout(workout: CustomWorkout): Promise<void> {
    await this.commit([StateChange.make({ kind: "upsertCustomWorkout", value: workout })]);
  }

  /** Monday first, as the week sheet lists it; `Schedule.weekKey` counts from Sunday. */
  static readonly weekdaysMondayFirst = [1, 2, 3, 4, 5, 6, 0];

  /** Your own week, Monday first (a day id or "rest" each), when you made one. */
  get ownWeek(): string[] | undefined {
    const week = Schedule.weekOnly(this.scheduleOverrides);
    if (Object.keys(week).length === 0) return undefined;
    return AppState.weekdaysMondayFirst.map((index) => week[Schedule.weekKey(index)] ?? Schedule.defaultWeek[index] ?? "rest");
  }

  /**
   * Writes your own week, Monday first, for the plan you're on — every
   * weekday, so the week is wholly yours — or with `undefined` hands the week
   * back to the plan. Days you moved by date keep their change.
   */
  async saveOwnWeek(days: string[] | undefined): Promise<void> {
    const changes = AppState.weekdaysMondayFirst.map((index, position) => {
      const key = `${this.programKey}:${Schedule.weekKey(index)}`;
      return days === undefined
        ? StateChange.make({ kind: "removeScheduleOverride", key })
        : StateChange.make({ kind: "setScheduleDay", key, dayID: days[position] ?? "rest" });
    });
    // It holds from the day it was first made; an edit keeps that start.
    const fromKey = `${this.programKey}:${Schedule.weekFromKey}`;
    const from = this.scheduleOverrides[Schedule.weekFromKey] ?? Schedule.dateKey(new Date());
    changes.push(
      days === undefined
        ? StateChange.make({ kind: "removeScheduleOverride", key: fromKey })
        : StateChange.make({ kind: "setScheduleDay", key: fromKey, dayID: from }),
    );
    await this.record(changes);
  }

  async removeCustomWorkout(a: { id: string }): Promise<void> {
    await this.commit([StateChange.make({ kind: "removeCustomWorkout", id: a.id })]);
  }

  /** Ends a paused session from the home screen, keeping what was logged. */
  async endActiveSession(): Promise<void> {
    const snapshot = this.activeSession;
    if (!snapshot) return;
    if (!ActiveSessionSnapshotNS.hasProgress(snapshot)) {
      await this.clearActiveSession();
      return;
    }
    const finished = ActiveSessionSnapshotNS.finishedSession(snapshot, {
      id: this.sessions.find((s) => s.dayID === snapshot.dayID && isSameDay(s.date, snapshot.startedAt) && s.kind === "workout")?.id,
    });
    await this.save({ session: finished });
  }

  /** "today" / "from yesterday" / "from Friday" / "from 3 Sep". */
  pausedWhenLabel(a: { for: ActiveSessionSnapshot }): string {
    const startedAt = a.for.startedAt;
    const now = new Date();
    if (isSameDay(startedAt, now)) return "today";
    if (isSameDay(startedAt, addDays(now, -1))) return "from yesterday";
    const days = Math.floor((now.getTime() - startedAt.getTime()) / 86_400_000);
    if (days < 7) return `from ${formatEnUS(startedAt, "EEEE")}`;
    return `from ${NumberDisplay.shortDate(this.display, startedAt)}`;
  }

  /** Writes a finished session, locally first, and clears the paused snapshot. */
  async save(a: { session: TrainingSession }): Promise<void> {
    await this.commit([StateChange.upsert(a.session), StateChange.activeSession(undefined)]);
  }

  /** Corrects sets in a session already saved. */
  async correct(corrections: SetCorrection[], a: { sessionID: string }): Promise<void> {
    if (corrections.length === 0) return;
    await this.commit([StateChange.correct(corrections, { sessionID: a.sessionID })]);
  }

  /** Takes sets out of one stored session. */
  async removeSets(removals: SetRemoval[], a: { sessionID: string }): Promise<void> {
    if (removals.length === 0) return;
    await this.commit([StateChange.make({ kind: "removeSessionSets", sessionID: a.sessionID, removals })]);
  }

  /** Sets done that day but not logged at the time, added to a saved workout. */
  async addSets(additions: SetAddition[], a: { sessionID: string }): Promise<void> {
    const session = this.sessions.find((s) => s.id === a.sessionID);
    if (additions.length === 0 || !session) return;
    await this.commit([StateChange.upsert(TrainingSession_adding(session, additions))]);
  }

  /** A saved workout written again as a whole. */
  async replace(a: { session: TrainingSession; removing?: SetRemoval[] }): Promise<void> {
    const removals = a.removing ?? [];
    const changes: StateChange[] = [];
    if (removals.length > 0) changes.push(StateChange.make({ kind: "removeSessionSets", sessionID: a.session.id, removals }));
    changes.push(StateChange.upsert(a.session));
    await this.commit(changes);
  }

  /** Takes one logged workout out of the account, everywhere. */
  async removeSession(a: { id: string }): Promise<void> {
    await this.commit([StateChange.make({ kind: "removeSession", id: a.id })]);
  }

  /** Every logged workout out of the account, everywhere, with the paused one. */
  async removeAllSessions(): Promise<void> {
    const changes = this.sessions.map((s) => StateChange.make({ kind: "removeSession", id: s.id }));
    if (this.activeSession !== undefined) changes.push(StateChange.activeSession(undefined));
    await this.commit(changes);
  }

  // MARK: - Streak

  /** Weeks in a row with as many workouts as the plan asked for. */
  get streak(): TrainingStreak {
    return TrainingStreak.make({ sessions: this.sessions, plan: this.schedulePlan, overrides: this.scheduleOverrides });
  }

  /** `streak(adding:day:)`: the streak once a workout on `date` is saved. */
  streakAdding(a: { adding: Date; day: WorkoutDay }): TrainingStreak {
    const pending = TrainingSessionNS.make({ id: "pending", date: a.adding, dayID: a.day.id, dayLabel: a.day.short, completion: 100, results: [] });
    return TrainingStreak.make({ sessions: [...this.sessions, pending], plan: this.schedulePlan, overrides: this.scheduleOverrides });
  }

  // MARK: - Missed days

  private static readonly answeredMissedKey = "setline.alerts.answeredMissed";

  get answeredMissed(): Set<string> {
    return new Set(UserDefaults.get<string[]>(AppState.answeredMissedKey) ?? []);
  }

  answerMissed(key: string): void {
    const keys = this.answeredMissed;
    keys.add(key);
    UserDefaults.set(AppState.answeredMissedKey, [...keys]);
    this.revision += 1;
    this.changed();
  }

  /** Planned days of the last two weeks that passed with nothing logged and were not answered yet, newest first. */
  get missedDays(): AgendaDay[] {
    return Agenda.missed({
      plan: this.schedulePlan,
      overrides: this.scheduleOverrides,
      sessions: this.sessions,
      deload: this.activeDeload,
      dismissed: this.answeredMissed,
    });
  }

  /** Records changes the user made outside a workout. */
  async record(changes: StateChange[]): Promise<void> {
    await this.commit(changes);
  }

  /** Logs one item of food, or rewrites one already logged. */
  async log(a: { food: NutritionEntry }): Promise<void> {
    await this.record([StateChange.make({ kind: "upsertNutritionEntry", value: NutritionEntry.json(a.food) })]);
  }

  async removeFood(a: { id: string }): Promise<void> {
    await this.record([StateChange.make({ kind: "removeNutritionEntry", id: a.id })]);
  }

  /** The shared product search, as this account. */
  async searchFood(query: string): Promise<FoodSearchOutcome> {
    return this.foodSearch.search(query, { auth: this.auth });
  }

  nutrition(a: { on?: Date } = {}): NutritionDay {
    return NutritionDay.makeEntries({ entries: this.nutritionEntries, on: a.on ?? new Date(), targets: this.targets });
  }

  // MARK: - Food without typing

  async scanMeal(request: FoodScanRequest): Promise<MealScanService_Outcome> {
    return this.mealScan.scan(request, { auth: this.auth });
  }

  async lookupBarcode(code: string): Promise<FoodLookupService_BarcodeOutcome> {
    return new FoodLookupService().barcode(code);
  }

  // MARK: - Favorite foods

  foodFavoritesRevision = 0;

  private get favoritesKey(): string {
    return `setline.food.favorites.${this.session?.email.toLowerCase() ?? "none"}`;
  }

  get foodFavorites(): FavoriteFood[] {
    const raw = UserDefaults.get<unknown[]>(this.favoritesKey);
    if (!raw) return [];
    try {
      return raw.map((x) => FavoriteFood.decode(x));
    } catch {
      return [];
    }
  }

  isFavorite(entry: NutritionEntry): boolean {
    return this.foodFavorites.some((f) => FavoriteFood.matches(f, entry));
  }

  toggleFavorite(entry: NutritionEntry): void {
    const list = this.foodFavorites;
    const index = list.findIndex((f) => FavoriteFood.matches(f, entry));
    if (index >= 0) list.splice(index, 1);
    else list.unshift(FavoriteFood.make(entry));
    UserDefaults.set(this.favoritesKey, list.map((f) => FavoriteFood.encode(f)));
    this.foodFavoritesRevision += 1;
    this.changed();
  }

  // MARK: - Saved meals

  /** Meals of your own, with their ingredients. Kept on this device, per account, like favorites. */
  savedMealsRevision = 0;

  private get savedMealsKey(): string {
    return `setline.food.meals.${this.session?.email.toLowerCase() ?? "none"}`;
  }

  get savedMeals(): SavedMeal[] {
    const raw = UserDefaults.get<unknown[]>(this.savedMealsKey);
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => SavedMeal.decode(item)).filter((meal): meal is SavedMeal => meal !== undefined);
  }

  saveMeal(meal: SavedMeal): void {
    const list = this.savedMeals;
    const index = list.findIndex((m) => m.id === meal.id);
    if (index >= 0) list[index] = meal;
    else list.unshift(meal);
    UserDefaults.set(this.savedMealsKey, list);
    this.savedMealsRevision += 1;
    this.changed();
  }

  removeMeal(id: string): void {
    UserDefaults.set(this.savedMealsKey, this.savedMeals.filter((m) => m.id !== id));
    this.savedMealsRevision += 1;
    this.changed();
  }

  /** The days before today as eaten, newest first. */
  nutritionHistory(a: { days?: number; before?: Date } = {}): NutritionHistory {
    return NutritionHistory.make({ entries: this.nutritionEntries, targets: this.targets, days: a.days ?? 14, before: a.before ?? new Date() });
  }

  // MARK: - Weigh-ins

  /** Every weigh-in the account holds, newest last. */
  get metrics(): BodyMetric[] {
    return this.state ? LegacyAdapter.metrics({ from: this.state }) : [];
  }

  /** What the scale said today, if it has been asked. */
  weighIn(a: { on?: Date } = {}): BodyMetric | undefined {
    return WeighIn.stored({ on: a.on ?? new Date(), in: this.metrics });
  }

  /** Writes the day's weight: a new weigh-in, or the day's own written again. */
  async saveWeighIn(weightKg: number, a: { on?: Date } = {}): Promise<void> {
    if (!(weightKg > 0)) return;
    const entry = WeighIn.entry({ weightKg, on: a.on ?? new Date(), in: this.metrics });
    await this.record([StateChange.make({ kind: "upsertMetric", value: WeighIn.json(entry) })]);
  }

  // MARK: - Fatigue

  get fatigue(): Fatigue_Reading {
    return Fatigue.read({ sessions: this.sessions, display: this.display });
  }

  /** The lighter week now running, if one is. */
  get activeDeload(): Deload | undefined {
    return this.deload && Deload.isActive(this.deload, { on: new Date() }) ? this.deload : undefined;
  }

  /** Shown only when two signals agree, nothing is already running, and the last proposal was not waved away this week. */
  get proposesDeload(): boolean {
    if (this.activeDeload !== undefined || !Fatigue_ReadingNS.proposes(this.fatigue)) return false;
    const dismissed = UserDefaults.get<number>(AppState.deloadDismissedKey);
    if (dismissed === undefined) return true;
    return daysBetween(new Date(dismissed), new Date()) >= Fatigue.windowDays;
  }

  async applyDeload(): Promise<void> {
    const proposal = Deload.make({ startedAt: new Date() });
    await this.record([StateChange.make({ kind: "setDeload", value: LegacyAdapter.json(proposal) })]);
  }

  dismissDeload(): void {
    UserDefaults.set(AppState.deloadDismissedKey, Date.now());
    this.changed();
  }

  private static readonly deloadDismissedKey = "setline.deload.dismissed";

  /** Which program the account is running, which is what scopes a schedule override. */
  get programKey(): string {
    if (!this.state) return "personal";
    const { mode, sciencePlanID } = LegacyAdapter.planMode({ from: this.state });
    return Schedule.programKey({ mode, sciencePlanID });
  }

  // MARK: - Today

  get todayCanonicalDay(): string {
    return Schedule.canonicalDay({ for: new Date(), overrides: this.scheduleOverrides });
  }

  get todayDay(): WorkoutDay | undefined {
    return Schedule.day({ for: this.todayCanonicalDay, in: this.schedulePlan });
  }

  /** Every workout a day of the week can hold: the plan's days, then the lifter's own. */
  get schedulePlan(): WorkoutDay[] {
    return [...this.plan, ...this.customWorkouts.map((c) => CustomWorkout.workoutDay(c))];
  }

  get isRestDay(): boolean {
    return this.todayDay === undefined;
  }

  history(a: { for: PlannedExercise; before?: Date }): ExerciseHistory {
    return ExerciseHistory.build({ exerciseID: a.for.exerciseID, modifiers: a.for.modifiers, from: this.sessions, before: a.before ?? new Date() });
  }

  /** The lifts in a workout the engine says are ready to go up, with the weight it proposes. None during lighter days. */
  liftsReady(a: { in: WorkoutDay }): ReadyLift[] {
    if (this.activeDeload !== undefined) return [];
    const ready: ReadyLift[] = [];
    for (const planned of a.in.exercises) {
      const exercise = this.exercise(planned.exerciseID);
      const history = this.history({ for: planned });
      const proposal = ProgressionEngine.proposal({ planned, exercise, history });
      if (proposal.tone !== "ready" || proposal.weightKg === undefined) continue;
      const last = ExerciseHistory.mostRecent(history)?.sets.find((s) => LoggedSet.countsTowardProgression(s))?.weightKg;
      ready.push({ name: exercise.name, fromKg: last, toKg: proposal.weightKg });
    }
    return ready;
  }

  exercise(id: string): Exercise {
    return (
      ExerciseCatalog.exercise(id) ??
      (() => { const c = this.customExercises.find((x) => x.id === id); return c ? CustomExerciseNS.exercise(c) : undefined; })() ??
      ExerciseNS.make({ id, name: id, equipment: "machineSelectorised", isCompound: false })
    );
  }

  // MARK: - Substitution

  get painfulLoadTags(): Set<LoadTag> {
    return PainFlag.activeLoadTags(this.painFlags);
  }

  get familiarExerciseIDs(): Set<string> {
    return new Set(this.sessions.flatMap((s) => s.results).filter((r) => r.sets.some((x) => LoggedSet.isLogged(x))).map((r) => r.exerciseID));
  }

  swapContext(a: { for: string; occupied: boolean; excluding: Set<string> }): SwapContext {
    return {
      currentExerciseID: a.for,
      role: ExerciseCatalog.role(a.for),
      isOccupied: a.occupied,
      painfulLoadTags: this.painfulLoadTags,
      familiarExerciseIDs: this.familiarExerciseIDs,
      excludedExerciseIDs: a.excluding,
    };
  }

  alternatives(a: { for: string; occupied: boolean; excluding: Set<string> }): RankedAlternative[] {
    return SubstitutionRanker.rank(this.swapContext(a));
  }

  browsableAlternatives(a: { for: string; occupied: boolean; excluding: Set<string> }): RankedAlternative[] {
    return SubstitutionRanker.browse(this.swapContext(a));
  }

  painChangesList(a: { region: PainRegion; for: string; occupied: boolean; excluding: Set<string> }): boolean {
    const others = new Set<LoadTag>();
    for (const flag of PainFlag.active(this.painFlags)) {
      if (flag.region !== a.region) for (const tag of PainRegion.loadTags(flag.region)) others.add(tag);
    }
    const tags = new Set([...PainRegion.loadTags(a.region)].filter((t) => !others.has(t)));
    return SubstitutionRanker.painChangesRecommendations(this.swapContext(a), { tags });
  }

  painWouldChangeList(a: { region: PainRegion; for: string; occupied: boolean; excluding: Set<string> }): boolean {
    return SubstitutionRanker.painChangesRecommendations(this.swapContext(a), { tags: PainRegion.loadTags(a.region) });
  }

  painEmptiesList(a: { for: string; occupied: boolean; excluding: Set<string> }): boolean {
    const context = this.swapContext(a);
    if (context.painfulLoadTags.size === 0 || SubstitutionRanker.rank(context).length > 0) return false;
    return SubstitutionRanker.rank({ ...context, painfulLoadTags: new Set() }).length > 0;
  }

  /** Regions currently narrowing the list, newest first. */
  get activePainRegions(): PainRegion[] {
    const seen = new Set<PainRegion>();
    const regions: PainRegion[] = [];
    for (const flag of [...PainFlag.active(this.painFlags)].sort((x, y) => y.date.getTime() - x.date.getTime())) {
      if (!seen.has(flag.region)) {
        seen.add(flag.region);
        regions.push(flag.region);
      }
    }
    return regions;
  }

  async forgetPain(a: { region: PainRegion }): Promise<void> {
    await this.commit(this.painFlags.filter((f) => f.region === a.region).map((f) => StateChange.make({ kind: "removePainFlag", id: PainFlag.id(f) })));
  }

  /** `record(pain:)`. */
  async recordPain(a: { pain: PainFlag }): Promise<void> {
    await this.commit([StateChange.make({ kind: "addPainFlag", value: a.pain })]);
  }

  async forget(a: { pain: PainFlag }): Promise<void> {
    await this.commit([StateChange.make({ kind: "removePainFlag", id: PainFlag.id(a.pain) })]);
  }

  async replaceInProgram(replacement: ProgramReplacement): Promise<void> {
    await this.commit([StateChange.make({ kind: "addProgramReplacement", value: replacement })]);
  }

  async undoReplacement(replacement: ProgramReplacement): Promise<void> {
    await this.commit([StateChange.make({ kind: "removeProgramReplacement", id: ProgramReplacement.id(replacement) })]);
  }

  async addCustomExercise(exercise: CustomExercise): Promise<void> {
    if (this.customExercises.some((c) => c.id === exercise.id)) return;
    await this.commit([StateChange.make({ kind: "addCustomExercise", value: exercise })]);
  }

  /** "18 sets · doel 6.240 kg · laatst 3 sep" */
  todayMetaLine(): string | undefined {
    const day = this.todayDay;
    if (!day) return undefined;
    const setCount = SessionPrescription.setCount({ of: day, deload: this.activeDeload });
    const parts = [`${setCount} sets`];
    const target = day.exercises.reduce((total, planned) => {
      const last = ExerciseHistory.mostRecent(this.history({ for: planned }));
      return last ? total + RecordsEngine.volumeLoad(last.sets) : total;
    }, 0);
    if (target > 0) parts.push(`target ${NumberDisplay.volumeKg(this.display, target)}`);
    const last = this.sessions.find((s) => s.dayID === day.id && s.kind === "workout");
    if (last) parts.push(`laatst ${NumberDisplay.shortDate(this.display, last.date)}`);
    return parts.join(" · ");
  }
}

// MARK: - The one instance, and SwiftUI's @Environment(AppState.self)

export const app = new AppState(new SupabaseClient());

/** `@Environment(AppState.self) private var app` — redraws whenever the model changes. */
export function useApp(): AppState {
  useSyncExternalStore(app.subscribe, app.getVersion);
  return app;
}

// Unused-import guards for names only referenced in types above.
void startOfDay;
