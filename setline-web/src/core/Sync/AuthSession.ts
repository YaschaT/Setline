import type { JSONValue, JSONObject } from "../Legacy/JSONValue";
import { decodeNumber, decodeString, KeyedContainer } from "../Support/codable";
import { dateFromEpoch, timeIntervalSince } from "../Support/calendar";

/** A signed-in account's tokens, as the Keychain holds them. */
export interface AuthSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly userID: string;
  readonly email: string;
  /**
   * When the access token stops working. `nil` for sessions saved before
   * expiry was recorded; those are refreshed before their first use.
   */
  readonly expiresAt?: Date;
}

export const AuthSession = {
  make(a: { accessToken: string; refreshToken: string; userID: string; email: string; expiresAt: Date | undefined }): AuthSession {
    return {
      accessToken: a.accessToken,
      refreshToken: a.refreshToken,
      userID: a.userID,
      email: a.email,
      expiresAt: a.expiresAt,
    };
  },

  /** Expired, about to expire, or of unknown age. */
  needsRefresh(self: AuthSession, a: { at: Date; leeway: number }): boolean {
    if (self.expiresAt === undefined) return true;
    return timeIntervalSince(self.expiresAt, a.at) <= a.leeway;
  },

  // The keys match what the Keychain already holds, so a session saved by
  // an earlier build still signs the user in.
  //   accessToken = "access_token", refreshToken = "refresh_token", userID,
  //   email, expiresAt = "expires_at" (seconds since 1970).

  /** `init(from:)`. Throws `DecodingError` where `JSONDecoder` would. */
  decode(json: JSONValue): AuthSession {
    const container = new KeyedContainer(json);
    const accessToken = container.decode("access_token", decodeString);
    const refreshToken = container.decode("refresh_token", decodeString);
    const userID = container.decode("userID", decodeString);
    const email = container.decode("email", decodeString);
    const seconds = container.decodeIfPresent("expires_at", decodeNumber);
    return {
      accessToken,
      refreshToken,
      userID,
      email,
      expiresAt: seconds === undefined ? undefined : dateFromEpoch(seconds),
    };
  },

  /** `encode(to:)`, as the JSON object `JSONEncoder` writes. */
  encode(self: AuthSession): JSONObject {
    const object: JSONObject = {
      access_token: self.accessToken,
      refresh_token: self.refreshToken,
      userID: self.userID,
      email: self.email,
    };
    if (self.expiresAt !== undefined) object["expires_at"] = self.expiresAt.getTime() / 1000;
    return object;
  },
};

/** Why an authorised request could not be made. */
export type AuthFailure_Kind =
  /** The server rejected the access token. */
  | "unauthorized"
  /** The refresh token itself was rejected: only signing in again helps. */
  | "expired"
  /** The auth server could not be reached. The session may be perfectly fine. */
  | "unreachable";

export class AuthFailure extends Error {
  constructor(readonly kind: AuthFailure_Kind) {
    super(`AuthFailure.${kind}`);
  }

  static readonly unauthorized = (): AuthFailure => new AuthFailure("unauthorized");
  static readonly expired = (): AuthFailure => new AuthFailure("expired");
  static readonly unreachable = (): AuthFailure => new AuthFailure("unreachable");

  /** `error as? AuthFailure == kind`. */
  static is(error: unknown, kind: AuthFailure_Kind): boolean {
    return error instanceof AuthFailure && error.kind === kind;
  }
}

export interface TokenRefresher {
  /**
   * Exchanges the session's refresh token for a new session. Throws
   * `AuthFailure.expired` when the refresh token is no longer valid, and
   * `AuthFailure.unreachable` when the server could not be asked.
   */
  refreshSession(session: AuthSession): Promise<AuthSession>;
}
