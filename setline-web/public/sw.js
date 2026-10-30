// Setline's service worker: the rest timer when the app is not on screen.
//
// A web page cannot schedule a notification for later, and Android Chrome
// shows notifications only through a service worker. So the page hands the
// rest over as it leaves the screen: a quiet "ready at 14:32" notification
// right away — the countdown you can still see from the lock screen — and
// "Rest done" when the time is up. Coming back to the app takes both away.

const TAG = "setline-rest";
let generation = 0;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function closeRest() {
  const shown = await self.registration.getNotifications({ tag: TAG });
  for (const notification of shown) notification.close();
}

/** The app on screen right now, if any: it signals the end itself. */
async function appIsVisible() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return windows.some((client) => client.visibilityState === "visible");
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "rest") {
    const mine = ++generation;
    event.waitUntil(
      (async () => {
        const left = data.endsAt - Date.now();
        if (left <= 0) return;
        await self.registration.showNotification(data.title, {
          body: data.body,
          tag: TAG,
          silent: true,
          icon: "/app-icon.png",
          badge: "/icons/badge.png",
          data: { url: "/" },
        });
        // The worker stays awake while it waits (up to five minutes in
        // Chrome), which covers every rest the plans prescribe.
        await sleep(left);
        if (mine !== generation) return;
        if (await appIsVisible()) {
          await closeRest();
          return;
        }
        await self.registration.showNotification("Rest done", {
          body: data.next ? `Time for your next set · ${data.next}` : "Time for your next set.",
          tag: TAG,
          renotify: true,
          requireInteraction: true,
          vibrate: [250, 120, 250],
          icon: "/app-icon.png",
          badge: "/icons/badge.png",
          data: { url: "/" },
        });
      })(),
    );
  } else if (data.type === "cancel") {
    generation += 1;
    event.waitUntil(closeRest());
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.length > 0) return windows[0].focus();
      return self.clients.openWindow("/");
    })(),
  );
});
