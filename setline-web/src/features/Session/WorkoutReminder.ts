// WorkoutReminder.swift — a nudge when a workout is left open or paused and
// not picked up again. The setting and its key are kept; a web page cannot
// schedule the notification itself, so `schedule` and `cancel` do nothing.
import { UserDefaults } from "../../design/swiftui";

export const WorkoutReminder = {
  minutesKey: "setline.reminders.openWorkoutMinutes",
  choices: [0, 10, 20, 30, 60],
  id: "setline.workout.open",

  /** Minutes to wait; 0 is off. 20 until changed. */
  get minutes(): number {
    const v = UserDefaults.get<number>(WorkoutReminder.minutesKey);
    return typeof v === "number" ? v : 20;
  },

  label(minutes: number): string {
    return minutes === 0 ? "Off" : minutes === 60 ? "After 1 hour" : `After ${minutes} min`;
  },

  /**
   * The workout was left — the app went to the background mid-workout, or
   * it was paused by hand. No scheduled notifications on the web.
   */
  schedule(_a: { dayLabel: string; paused: boolean }): void {
    WorkoutReminder.cancel();
    if (!(WorkoutReminder.minutes > 0)) return;
    // The notification ("<day> is paused" / "<day> is still open") cannot be
    // scheduled by a web page.
  },

  /** Back in the workout, or it was finished or ended. */
  cancel(): void {
    /* nothing pending on the web */
  },
};
