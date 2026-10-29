// RestActivity.swift — the rest countdown as a Live Activity. Live Activities
// do not exist on the web: the names are kept (the session still sets them),
// and showing or ending one does nothing.

/**
 * The rest countdown as a Live Activity, at the top of the iPhone. On the
 * web there is none; the session's own rest pill is the countdown.
 */
export const RestActivity = {
  /** What the activity names: the exercise just done and what comes next. */
  exercise: "",
  next: "",

  get isAvailable(): boolean {
    return false;
  },

  show(_a: { startedAt: Date; endsAt: Date }): void {
    /* no Live Activities on the web */
  },

  end(): void {
    /* no Live Activities on the web */
  },
};
