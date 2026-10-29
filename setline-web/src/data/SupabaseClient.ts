// SupabaseClient.swift. Minimal GoTrue + PostgREST client over fetch.
//
// It speaks to exactly the endpoints the iOS app and the old web app use, so
// all clients share one account and one `public.user_state` row.
import type { AuthSession, TokenRefresher } from "../core/Sync/AuthSession";
import { AuthFailure } from "../core/Sync/AuthSession";
import type { AuthSessionCoordinator } from "../core/Sync/AuthSessionCoordinator";
import type { RemoteState, StateStore, WriteOutcome } from "../core/Sync/StateSync";
import { LegacyState } from "../core/Legacy/LegacyState";
import { JSONValue } from "../core/Legacy/JSONValue";
import { SupabaseConfig } from "./SupabaseConfig";

export class SupabaseFailure extends Error {
  constructor(
    readonly kind: "notConfigured" | "message" | "network" | "conflict",
    readonly text?: string,
  ) {
    super(SupabaseFailure.describe(kind, text));
  }

  static describe(kind: SupabaseFailure["kind"], text?: string): string {
    switch (kind) {
      case "notConfigured":
        return "Accounts aren't connected yet. Set SUPABASE_URL and SUPABASE_ANON_KEY in Setline.xcconfig and restart.";
      case "message":
        return text ?? "";
      case "network":
        return "No answer from the server. Check your connection and try again in a moment.";
      case "conflict":
        return "Something else was saved in the meantime. Try again in a moment.";
    }
  }
}

export class SupabaseClient implements TokenRefresher {
  constructor(private readonly config: SupabaseConfig | undefined = SupabaseConfig.fromBundle()) {}

  get isConfigured(): boolean {
    return this.config !== undefined;
  }

  // MARK: - Auth

  signIn(email: string, password: string): Promise<AuthSession> {
    return this.authenticate("/auth/v1/token?grant_type=password", { email, password });
  }

  /**
   * Where the links in the account emails (confirm, reset) bring people back:
   * this site. Without it Supabase sends them to the project's Site URL,
   * which is localhost until someone changes it by hand.
   */
  static redirectQuery(): string {
    return `redirect_to=${encodeURIComponent(`${location.origin}/login`)}`;
  }

  signUp(email: string, password: string): Promise<AuthSession> {
    return this.authenticate(`/auth/v1/signup?${SupabaseClient.redirectQuery()}`, { email, password });
  }

  async sendPasswordReset(email: string): Promise<void> {
    await this.send(this.jsonRequest(`/auth/v1/recover?${SupabaseClient.redirectQuery()}`, "POST", { email }, undefined));
  }

  /** The account behind an access token: who a link from an email signed in. */
  async user(accessToken: string): Promise<{ id: string; email: string }> {
    const data = await this.send(this.makeRequest("/auth/v1/user", "GET", accessToken), true);
    const user = JSON.parse(data) as { id?: string; email?: string };
    if (typeof user.id !== "string") throw new SupabaseFailure("network");
    return { id: user.id, email: user.email ?? "" };
  }

  /** A new password for the signed-in account (after a reset link). */
  async updatePassword(session: AuthSession, password: string): Promise<void> {
    await this.send(this.makeRequest("/auth/v1/user", "PUT", session.accessToken, JSON.stringify({ password })), true);
  }

  /**
   * What a link from an account email brought back in the address:
   * `#access_token=…&refresh_token=…&expires_in=…&type=signup|recovery`, or
   * `#error=…&error_description=…` when the link was used or expired.
   */
  static linkFromAddress(hash: string):
    | { kind: "session"; accessToken: string; refreshToken: string; expiresAt?: Date; type: string }
    | { kind: "error"; message: string }
    | undefined {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const error = params.get("error_description") ?? params.get("error");
    if (error) return { kind: "error", message: error.replaceAll("+", " ") };
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return undefined;
    const at = Number(params.get("expires_at"));
    const inSeconds = Number(params.get("expires_in"));
    const expiresAt = at > 0 ? new Date(at * 1000) : inSeconds > 0 ? new Date(Date.now() + inSeconds * 1000) : undefined;
    return { kind: "session", accessToken, refreshToken, expiresAt, type: params.get("type") ?? "" };
  }

  /**
   * Exchanges the refresh token for a new session. Any refusal from the token
   * endpoint means the refresh token is no longer valid, and only signing in
   * again helps. No answer, or a server error, is not that: the session is
   * kept and tried again later.
   */
  async refreshSession(current: AuthSession): Promise<AuthSession> {
    let request: Request;
    try {
      request = this.jsonRequest("/auth/v1/token?grant_type=refresh_token", "POST", { refresh_token: current.refreshToken }, undefined);
    } catch {
      throw new AuthFailure("unreachable");
    }
    let response: Response;
    try {
      response = await fetch(request);
    } catch {
      throw new AuthFailure("unreachable");
    }
    if (response.status >= 200 && response.status < 300) {
      const renewed = SupabaseClient.parseSession(await response.text(), current.email);
      if (!renewed) throw new AuthFailure("unreachable");
      return renewed;
    }
    if ([400, 401, 403].includes(response.status)) throw new AuthFailure("expired");
    throw new AuthFailure("unreachable");
  }

  private async authenticate(path: string, body: Record<string, string>): Promise<AuthSession> {
    const data = await this.send(this.jsonRequest(path, "POST", body, undefined));
    const session = SupabaseClient.parseSession(data, body.email ?? "");
    if (!session) {
      // A sign-up on a project that requires e-mail confirmation returns a
      // user but no session. Say so rather than failing opaquely.
      throw new SupabaseFailure("message", "Your account is created. Confirm your email address, then sign in.");
    }
    return session;
  }

  /** GoTrue's session payload. `expires_at` is seconds since 1970; older servers only send `expires_in`. */
  static parseSession(data: string, fallbackEmail: string, now: Date = new Date()): AuthSession | undefined {
    let object: Record<string, unknown>;
    try {
      object = JSON.parse(data);
    } catch {
      return undefined;
    }
    const user = object.user as Record<string, unknown> | undefined;
    if (typeof object.access_token !== "string" || typeof object.refresh_token !== "string" || !user || typeof user.id !== "string") {
      return undefined;
    }
    let expiresAt: Date | undefined;
    if (typeof object.expires_at === "number") expiresAt = new Date(object.expires_at * 1000);
    else if (typeof object.expires_in === "number") expiresAt = new Date(now.getTime() + object.expires_in * 1000);
    return {
      accessToken: object.access_token,
      refreshToken: object.refresh_token,
      userID: user.id,
      email: typeof user.email === "string" ? user.email : fallbackEmail,
      expiresAt,
    };
  }

  // MARK: - State

  /** Reads `public.user_state` and the version it is at. */
  async fetchState(token: AuthSession): Promise<RemoteState | undefined> {
    const path = `/rest/v1/user_state?select=state,updated_at&user_id=eq.${token.userID}`;
    const data = await this.send(this.makeRequest(path, "GET", token.accessToken), true);
    const rows = JSON.parse(data) as { state: JSONValue; updated_at: string }[];
    const row = rows[0];
    if (!row) return undefined;
    return { state: LegacyState.make({ raw: JSONValue.objectValue(row.state) ?? {} }), version: row.updated_at };
  }

  /** Writes only while the row is still at `expectedVersion`. An empty response means another client wrote first. */
  async updateState(state: LegacyState, expectedVersion: string, nextVersion: string, token: AuthSession): Promise<WriteOutcome> {
    const path = `/rest/v1/user_state?user_id=eq.${token.userID}&updated_at=eq.${SupabaseClient.queryValue(expectedVersion)}&select=updated_at`;
    const request = this.makeRequest(path, "PATCH", token.accessToken, JSON.stringify({ state: state.raw, updated_at: nextVersion }), "return=representation");
    const data = await this.send(request, true);
    const row = (JSON.parse(data) as { updated_at: string }[])[0];
    if (!row) return { kind: "conflict" };
    return { kind: "written", version: row.updated_at };
  }

  /** Creates the row. A row that appeared in the meantime is a conflict. */
  async insertState(state: LegacyState, nextVersion: string, token: AuthSession): Promise<WriteOutcome> {
    const request = this.makeRequest(
      "/rest/v1/user_state?select=updated_at",
      "POST",
      token.accessToken,
      JSON.stringify({ user_id: token.userID, state: state.raw, updated_at: nextVersion }),
      "return=representation",
    );
    try {
      const data = await this.send(request, true);
      const row = (JSON.parse(data) as { updated_at: string }[])[0];
      if (!row) throw new SupabaseFailure("network");
      return { kind: "written", version: row.updated_at };
    } catch (error) {
      if (error instanceof SupabaseFailure && error.kind === "conflict") return { kind: "conflict" };
      throw error;
    }
  }

  // MARK: - Social

  /** One PostgREST call for the social tables, as the signed-in account. */
  async rest(path: string, a: { method?: string; body?: string; prefer?: string; session: AuthSession }): Promise<string> {
    const request = this.makeRequest("/rest/v1/" + path, a.method ?? "GET", a.session.accessToken, a.body, a.prefer);
    return this.send(request, true);
  }

  /** Supabase Storage, with the account's token. */
  async storage(path: string, a: { method?: string; body?: Blob | ArrayBuffer | string; contentType?: string; session: AuthSession }): Promise<ArrayBuffer> {
    const request = this.makeRequest("/storage/v1/" + path, a.method ?? "GET", a.session.accessToken, a.body, undefined, a.contentType);
    return this.sendBinary(request, true);
  }

  /** A filter value safe inside a query string: versions carry `+` and `:`. */
  static queryValue(value: string): string {
    return value.replace(/[^A-Za-z0-9\-._~]/g, (c) => encodeURIComponent(c));
  }

  // MARK: - Plumbing

  private makeRequest(path: string, method: string, accessToken: string | undefined, body?: BodyInit, prefer?: string, contentType = "application/json"): Request {
    if (!this.config) throw new SupabaseFailure("notConfigured");
    const headers: Record<string, string> = {
      apikey: this.config.anonKey,
      Authorization: `Bearer ${accessToken ?? this.config.anonKey}`,
      "Content-Type": contentType,
    };
    if (prefer) headers.Prefer = prefer;
    return new Request(this.config.url + path, { method, headers, body, cache: "no-store" });
  }

  private jsonRequest(path: string, method: string, body: Record<string, string>, accessToken: string | undefined): Request {
    return this.makeRequest(path, method, accessToken, JSON.stringify(body));
  }

  private async raw(request: Request, signedIn: boolean): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(request);
    } catch {
      throw new SupabaseFailure("network");
    }
    if (response.status < 200 || response.status >= 300) {
      if (response.status === 409) throw new SupabaseFailure("conflict");
      // The coordinator refreshes the token and retries once.
      if (response.status === 401 && signedIn) throw new AuthFailure("unauthorized");
      throw new SupabaseFailure("message", SupabaseClient.readableMessage(await response.text(), response.status));
    }
    return response;
  }

  /** `signedIn`: the request carries the account's access token, so a 401 means that token is no longer accepted. */
  private async send(request: Request, signedIn = false): Promise<string> {
    return (await this.raw(request, signedIn)).text();
  }

  private async sendBinary(request: Request, signedIn = false): Promise<ArrayBuffer> {
    return (await this.raw(request, signedIn)).arrayBuffer();
  }

  /**
   * Supabase reports failures under several different keys. Anything we
   * cannot read becomes a sentence that names what to do next, never a raw
   * status code.
   */
  static readableMessage(data: string, status: number): string {
    try {
      const object = JSON.parse(data) as Record<string, unknown>;
      for (const key of ["error_description", "msg", "message", "error"]) {
        const text = object[key];
        if (typeof text === "string" && text !== "") {
          if (text.toLowerCase().includes("invalid login credentials")) return "Email or password is incorrect.";
          if (text.toLowerCase().includes("email not confirmed")) {
            return "Confirm your email address first: open the link we sent you (check your spam folder too). No email? Tap Forgot password.";
          }
          return text;
        }
      }
    } catch {
      /* not JSON */
    }
    if (status === 401 || status === 403) return "Your session has expired. Sign in again.";
    return "Something went wrong on the server. Try again in a moment.";
  }
}

/** The account's stored state, as the sync loop sees it. Every request goes through the coordinator. */
export class SupabaseStateStore implements StateStore {
  constructor(
    private readonly client: SupabaseClient,
    private readonly auth: AuthSessionCoordinator,
  ) {}

  fetch(): Promise<RemoteState | undefined> {
    return this.auth.perform((session) => this.client.fetchState(session));
  }

  update(state: LegacyState, a: { expectedVersion: string; nextVersion: string }): Promise<WriteOutcome> {
    return this.auth.perform((session) => this.client.updateState(state, a.expectedVersion, a.nextVersion, session));
  }

  insert(state: LegacyState, a: { nextVersion: string }): Promise<WriteOutcome> {
    return this.auth.perform((session) => this.client.insertState(state, a.nextVersion, session));
  }
}
