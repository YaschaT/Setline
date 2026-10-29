import { AuthFailure, AuthSession, type TokenRefresher } from "./AuthSession";

/**
 * Keeps an account's access token usable, so sync never silently stops when
 * it expires.
 *
 * - A token about to expire is refreshed before it is used.
 * - A request the server still rejects is retried once, after one refresh.
 * - Only one refresh runs at a time. Supabase issues a new refresh token on
 *   every refresh and retires the old one, so two refreshes racing each other
 *   would sign the user out.
 * - The session counts as expired only when the refresh token itself is
 *   rejected. An unreachable server is not an expired session: nothing is
 *   cleared, and the next request simply tries again.
 *
 * A Swift `actor`: JavaScript runs one piece of it at a time, and like an
 * actor it may interleave at every `await`.
 */
export class AuthSessionCoordinator {
  private _session: AuthSession;
  private _isExpired = false;

  private readonly refresher: TokenRefresher;
  private readonly leeway: number;
  private readonly now: () => Date;
  private readonly onRefresh: (session: AuthSession) => Promise<void>;
  private refreshing: Promise<AuthSession> | undefined;

  /**
   * - Parameter onRefresh: called with every new session, so the rotated
   *   refresh token is stored before anything else can need it.
   */
  constructor(a: {
    session: AuthSession;
    refresher: TokenRefresher;
    leeway?: number;
    now?: () => Date;
    onRefresh: (session: AuthSession) => Promise<void> | void;
  }) {
    this._session = a.session;
    this.refresher = a.refresher;
    this.leeway = a.leeway ?? 60;
    this.now = a.now ?? (() => new Date());
    const onRefresh = a.onRefresh;
    this.onRefresh = async (session) => {
      await onRefresh(session);
    };
  }

  get session(): AuthSession {
    return this._session;
  }

  get isExpired(): boolean {
    return this._isExpired;
  }

  /**
   * After signing in again. A refresh still running for the old session
   * neither replaces this one nor marks it expired.
   */
  async replace(session: AuthSession): Promise<void> {
    this._session = session;
    this._isExpired = false;
    this.refreshing = undefined;
  }

  /** A session whose access token is good for at least `leeway` seconds. */
  async validSession(): Promise<AuthSession> {
    if (this._isExpired) throw new AuthFailure("expired");
    if (!AuthSession.needsRefresh(this._session, { at: this.now(), leeway: this.leeway })) return this._session;
    return this.refresh({ replacing: this._session });
  }

  /**
   * Runs an authorised request. Throws `AuthFailure.expired` only when
   * signing in again is the one remedy left.
   */
  async perform<Value>(request: (session: AuthSession) => Promise<Value>): Promise<Value> {
    const first = await this.validSession();
    try {
      return await request(first);
    } catch (error) {
      if (!AuthFailure.is(error, "unauthorized")) throw error;
      const renewed = await this.refresh({ replacing: first });
      try {
        return await request(renewed);
      } catch (retryError) {
        if (!AuthFailure.is(retryError, "unauthorized")) throw retryError;
        // A token refreshed this very moment was rejected too.
        this._isExpired = true;
        throw new AuthFailure("expired");
      }
    }
  }

  private async refresh(a: { replacing: AuthSession }): Promise<AuthSession> {
    const stale = a.replacing;
    if (this._isExpired) throw new AuthFailure("expired");
    // Someone else refreshed since this token was handed out.
    if (
      this._session.accessToken !== stale.accessToken &&
      !AuthSession.needsRefresh(this._session, { at: this.now(), leeway: this.leeway })
    ) {
      return this._session;
    }

    let task: Promise<AuthSession>;
    if (this.refreshing) {
      task = this.refreshing;
    } else {
      const current = this._session;
      const refresher = this.refresher;
      // A Swift `Task { }` starts on its own, after the current job.
      task = Promise.resolve().then(() => refresher.refreshSession(current));
      // Every awaiter handles the outcome; this keeps an abandoned one quiet.
      task.catch(() => undefined);
      this.refreshing = task;
    }

    let renewed: AuthSession;
    try {
      renewed = await task;
    } catch (error) {
      if (AuthFailure.is(error, "expired")) {
        if (this.refreshing === task) {
          this.refreshing = undefined;
          this._isExpired = true;
        }
        throw new AuthFailure("expired");
      }
      if (this.refreshing === task) this.refreshing = undefined;
      throw new AuthFailure("unreachable");
    }
    if (this.refreshing === task) {
      this.refreshing = undefined;
      this._session = renewed;
      await this.onRefresh(renewed);
    }
    return renewed;
  }
}
