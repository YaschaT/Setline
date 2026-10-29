// RestNotifier.swift — the end of rest, when the app is not on screen.
// A web page cannot schedule a local notification for later, so `schedule`
// and `cancel` keep their bookkeeping and schedule nothing. The permission
// status and the prompt map onto the browser's Notification permission, so
// the sheet that explains the notification (RestNotificationSheet) still
// reads and asks as it does on iOS.
import { RestActivity } from "./RestActivity";

/** `UNAuthorizationStatus`, as far as the web can tell. */
export type UNAuthorizationStatus = "notDetermined" | "denied" | "authorized" | "provisional" | "ephemeral";

let generation = 0;

export const RestNotifier = {
  identifier: "setline.rest.finished",

  schedule(fireDate: Date, a: { startedAt?: Date } = {}): void {
    generation += 1;
    RestActivity.show({ startedAt: a.startedAt ?? new Date(), endsAt: fireDate });
    // No scheduled local notifications on the web.
    void fireDate;
  },

  async status(): Promise<UNAuthorizationStatus> {
    if (typeof Notification === "undefined") return "denied";
    switch (Notification.permission) {
      case "granted":
        return "authorized";
      case "denied":
        return "denied";
      default:
        return "notDetermined";
    }
  },

  /** The OS prompt, asked for once the reader has been told what it is for. */
  async request(): Promise<boolean> {
    if (typeof Notification === "undefined") return false;
    try {
      return (await Notification.requestPermission()) === "granted";
    } catch {
      return false;
    }
  },

  cancel(): void {
    generation += 1;
    RestActivity.end();
  },
};
