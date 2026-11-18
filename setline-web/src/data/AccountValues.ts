// The weight goal and the body profile are read by small helpers next to their screens (GoalPreference,
// BodyProfilePreference), as on iOS. This is how their changes reach the account, and how the account's copies reach
// them: AppState sets `send` and mirrors on every state it applies; each helper registers itself by its account key.
import type { JSONValue } from "../core/Legacy/JSONValue";

export interface AccountValueHelper {
  /** The account's value, copied to this device; `undefined` (the account has none yet) leaves this device's own. */
  mirror(value: JSONValue | undefined): void;
  /** This device's own value, as the account keeps it; `undefined` when there is none. */
  localValue(): JSONValue | undefined;
}

export const AccountValues = {
  send: undefined as ((key: string, value: JSONValue) => void) | undefined,
  helpers: new Map<string, AccountValueHelper>(),
};
