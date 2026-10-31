// Chat notifications for the web: the browser's own push. The worker
// (public/sw.js) shows them; the database sends them through /api/chat-push
// when someone writes to you. On an iPhone, Safari allows push only to a web
// app on the Home Screen.
import { social } from "../../data/SocialStore";

/** The public half of the VAPID key pair; the private half lives on Vercel. */
const PUBLIC_KEY = "BCksi0To8y-PNVd8vdshLaMgCA-zaxROL-JxYsbtu7zksJm_ZdWis2AV1A-3c4W_NJLtp7N7yCfjA7xrcCeETKE";

export type ChatPushState = "on" | "off" | "blocked" | "homeScreen" | "unsupported";

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator)) return undefined;
  try {
    await navigator.serviceWorker.register("/sw.js");
    return await navigator.serviceWorker.ready;
  } catch {
    return undefined;
  }
}

export const ChatPush = {
  async state(): Promise<ChatPushState> {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
    if (!("PushManager" in window) || typeof Notification === "undefined") return isIOS() && !standalone() ? "homeScreen" : "unsupported";
    if (Notification.permission === "denied") return "blocked";
    if (Notification.permission !== "granted") return "off";
    const reg = await registration();
    const subscription = await reg?.pushManager.getSubscription();
    return subscription ? "on" : "off";
  },

  /** Asks once, subscribes this browser and tells the database it belongs to you. */
  async enable(): Promise<ChatPushState> {
    const ready = await ChatPush.state();
    if (ready === "unsupported" || ready === "homeScreen" || ready === "blocked") return ready;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
    const reg = await registration();
    if (!reg) return "unsupported";
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
    const keys = subscription.toJSON().keys ?? {};
    if (!keys.p256dh || !keys.auth) return "off";
    await social.savePushSubscription({ endpoint: subscription.endpoint, p256dh: keys.p256dh, auth: keys.auth });
    return "on";
  },

  async disable(): Promise<ChatPushState> {
    const reg = await registration();
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription) {
      await social.forgetPushSubscription(subscription.endpoint).catch(() => undefined);
      await subscription.unsubscribe().catch(() => false);
    }
    return "off";
  },
};
