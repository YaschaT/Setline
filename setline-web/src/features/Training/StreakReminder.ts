// StreakReminder.swift — the one reminder the app sends on its own: at 19:00
// on a planned training day that has nothing logged yet, saying what is still
// on and what the streak stands at. A web page cannot schedule a local
// notification, so `update` works out the same reminder and schedules nothing.
import type { AppState } from "../../data/AppState";
import { Agenda } from "../../core/Engine/Agenda";
import { settingTime } from "../../core/Support/calendar";

export const StreakReminder = {
  identifier: "setline.streak.reminder",
  hour: 19,

  async update(app: AppState, a: { now?: Date } = {}): Promise<void> {
    const now = a.now ?? new Date();
    // `removePendingNotificationRequests`: nothing is pending on the web.
    if (!app.isSignedIn) return;
    // Notification permission is never granted to the web build: the
    // authorization check below always ends here on iOS's terms too.
    const week = Agenda.week({
      containing: now,
      plan: app.schedulePlan,
      overrides: app.scheduleOverrides,
      sessions: app.sessions,
      deload: app.activeDeload,
    });
    const today = week.find((d) => d.isToday);
    if (today === undefined || today.content.kind !== "planned") return;
    const fire = settingTime(now, StreakReminder.hour, 0, 0);
    if (!(fire.getTime() > now.getTime())) return;
    const workout = today.content.value;
    const streak = app.streak;
    const content = {
      title: `${workout.short} is still on today`,
      body:
        streak.weeks > 0
          ? `Train today to keep your ${streak.weeks}-week streak going.`
          : `${streak.thisWeekDone} of ${streak.thisWeekGoal} this week. A good day to start a streak.`,
    };
    // `center.add(UNNotificationRequest(…))` — no scheduled notifications on the web.
    void content;
  },
};
