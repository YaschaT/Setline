// RestNotifier.swift — the end of rest, when the app is not on screen.
// A web page cannot schedule a local notification for later, so the rest is
// handed to the service worker (public/sw.js) the moment the page leaves the
// screen: it shows "ready at 14:32" at once and "Rest done" when the time is
// up. Android Chrome shows notifications only that way. Coming back takes
// them away again; on screen, the session's own rest bar is the countdown.
import { RestActivity } from "./RestActivity";

/** `UNAuthorizationStatus`, as far as the web can tell. */
export type UNAuthorizationStatus = "notDetermined" | "denied" | "authorized" | "provisional" | "ephemeral";

/** The rest still to come, while there is one. */
let pending: { endsAt: Date } | undefined;
let handedOver = false;

const worker = async (): Promise<ServiceWorker | undefined> => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;
  try {
    const registration = await navigator.serviceWorker.ready;
    return registration.active ?? undefined;
  } catch {
    return undefined;
  }
};

const clock = (date: Date) => date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** The page left the screen mid-rest: the worker takes the rest over. */
async function handOver(): Promise<void> {
  const rest = pending;
  if (!rest || rest.endsAt.getTime() <= Date.now()) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const active = await worker();
  if (!active) return;
  handedOver = true;
  active.postMessage({
    type: "rest",
    endsAt: rest.endsAt.getTime(),
    title: `Resting · ready at ${clock(rest.endsAt)}`,
    body: RestActivity.exercise ? `${RestActivity.exercise} · next: ${RestActivity.next}` : `Next: ${RestActivity.next}`,
    next: RestActivity.next,
  });
}

async function takeBack(): Promise<void> {
  if (!handedOver) return;
  handedOver = false;
  (await worker())?.postMessage({ type: "cancel" });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void handOver();
    else void takeBack();
  });
}

export const RestNotifier = {
  identifier: "setline.rest.finished",

  /** Registered once at launch; without it no notification can be shown on Android. */
  register(): void {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    });
  },

  schedule(fireDate: Date, a: { startedAt?: Date } = {}): void {
    pending = { endsAt: fireDate };
    RestActivity.show({ startedAt: a.startedAt ?? new Date(), endsAt: fireDate });
    if (typeof document !== "undefined" && document.visibilityState === "hidden") void handOver();
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
    pending = undefined;
    void takeBack();
    RestActivity.end();
  },
};
