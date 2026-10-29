import type { BodyMetric } from "../Domain/Model";
import { addDays, daysBetween } from "../Support/calendar";
import { decodeString, keyedContainer } from "../Support/nutrition";
import { dec, rounded } from "../Support/swift";

/**
 * A progress photo, as it is kept on the phone.
 *
 * The picture itself is a file in the app's own container. This is the record
 * beside it: when it was taken, and which file it is. Nothing here goes to a
 * server — the account's state has no room for it and is not asked for any.
 */
export interface CheckIn {
  id: string;
  date: string;
  fileName: string;
}

export const CheckIn = {
  make(p: { id: string; date: string; fileName: string }): CheckIn {
    return { id: p.id, date: p.date, fileName: p.fileName };
  },

  /** Synthesized `Encodable`. */
  encode(self: CheckIn): { id: string; date: string; fileName: string } {
    return { id: self.id, date: self.date, fileName: self.fileName };
  },

  /** Synthesized `Decodable`. */
  decode(json: unknown): CheckIn {
    const container = keyedContainer(json);
    return { id: decodeString(container, "id"), date: decodeString(container, "date"), fileName: decodeString(container, "fileName") };
  },
};

export interface CheckInGallery_Shown {
  checkIn: CheckIn;
  date: Date;
  weightKg?: number;
}

/**
 * How far apart two check-ins are, as far as their dates can say it: the
 * same day, days below a week, and weeks from a week on — rounded, as 97
 * days reads "14 weken". Never more time than there was: two pictures a
 * day apart are a day apart, not a week.
 */
export type CheckInGallery_Span =
  | { kind: "sameDay" }
  | { kind: "days"; value: number }
  | { kind: "weeks"; value: number };

export const CheckInGallery_Span = {
  sameDay: { kind: "sameDay" } as CheckInGallery_Span,
  days(value: number): CheckInGallery_Span { return { kind: "days", value }; },
  weeks(value: number): CheckInGallery_Span { return { kind: "weeks", value }; },

  /** `init(days:)`. */
  make(a: { days: number }): CheckInGallery_Span {
    const days = a.days;
    if (days <= 0) return { kind: "sameDay" };
    if (days >= 1 && days < 7) return { kind: "days", value: days };
    return { kind: "weeks", value: Math.trunc(rounded(days / 7)) };
  },
};

/**
 * Two check-ins next to each other: the earlier one, the later one, and
 * what lies between them.
 */
export interface CheckInGallery_Comparison {
  before: CheckInGallery_Shown;
  after: CheckInGallery_Shown;
  /** How far apart the two are. */
  span: CheckInGallery_Span;
  /** What the scale did between them, when both have a weigh-in. */
  change?: number;
}

/**
 * One picture in the player: when it was taken counted from the first
 * picture the player shows.
 */
export interface CheckInGallery_Frame {
  shown: CheckInGallery_Shown;
  since: CheckInGallery_Span;
}

/**
 * How far back the player looks: every picture, or the last stretch of
 * them — counted back from the latest picture, not from today, so a
 * month without photos does not empty "the last three months".
 */
export type CheckInGallery_Period = "all" | "year" | "halfYear" | "quarter" | "month";

export const CheckInGallery_Period = {
  all: "all" as CheckInGallery_Period,
  year: "year" as CheckInGallery_Period,
  halfYear: "halfYear" as CheckInGallery_Period,
  quarter: "quarter" as CheckInGallery_Period,
  month: "month" as CheckInGallery_Period,
  allCases: ["all", "year", "halfYear", "quarter", "month"] as CheckInGallery_Period[],

  days(self: CheckInGallery_Period): number | undefined {
    switch (self) {
      case "all": return undefined;
      case "year": return 365;
      case "halfYear": return 182;
      case "quarter": return 91;
      case "month": return 30;
    }
  },
};

/** The check-ins an account has, and what they say next to each other. */
export interface CheckInGallery {
  /** Oldest first, as the strip reads. */
  all: CheckInGallery_Shown[];
  first?: CheckInGallery_Shown;
  latest?: CheckInGallery_Shown;
  /** How far apart the first and the latest check-in are. */
  span?: CheckInGallery_Span;
  /** What the scale did between them, when both have a weigh-in. */
  change?: number;
}

/** `DateFormatter` with en_US_POSIX and "yyyy-MM-dd", in the device's time zone. */
function dateFromKey(text: string): Date | undefined {
  const match = /^(\d+)-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate()) return undefined;
  const date = new Date(year, month - 1, day);
  date.setFullYear(year); // years below 100 are not 19xx
  return date;
}

function pictures(self: CheckInGallery, period: CheckInGallery_Period): CheckInGallery_Shown[] {
  const days = CheckInGallery_Period.days(period);
  const latest = self.all[self.all.length - 1]?.date;
  if (days === undefined || latest === undefined) return self.all;
  const start = addDays(latest, -days);
  return self.all.filter((shown) => shown.date >= start);
}

export const CheckInGallery = {
  make(p: {
    all: CheckInGallery_Shown[];
    first: CheckInGallery_Shown | undefined;
    latest: CheckInGallery_Shown | undefined;
    span: CheckInGallery_Span | undefined;
    change: number | undefined;
  }): CheckInGallery {
    return { all: p.all, first: p.first, latest: p.latest, span: p.span, change: p.change };
  },

  get empty(): CheckInGallery {
    return CheckInGallery.make({ all: [], first: undefined, latest: undefined, span: undefined, change: undefined });
  },

  /**
   * The weight beside a check-in is the account's own weigh-in for that day,
   * never a number typed twice: add a weigh-in later and the caption fills
   * itself in.
   */
  makeCheckIns(checkIns: CheckIn[], a: { metrics: BodyMetric[] }): CheckInGallery {
    const weights = new Map<string, number>();
    for (const metric of a.metrics) weights.set(metric.date, metric.weight);

    const shown: CheckInGallery_Shown[] = checkIns
      .map((checkIn): CheckInGallery_Shown | undefined => {
        const date = dateFromKey(checkIn.date);
        if (date === undefined) return undefined;
        return { checkIn, date, weightKg: weights.get(checkIn.date) };
      })
      .filter((s): s is CheckInGallery_Shown => s !== undefined)
      .sort((l, r) => (l.date < r.date ? -1 : r.date < l.date ? 1 : 0));

    const first = shown[0];
    const latest = shown[shown.length - 1];
    if (first === undefined || latest === undefined || first.checkIn.id === latest.checkIn.id) {
      return CheckInGallery.make({ all: shown, first, latest, span: undefined, change: undefined });
    }

    const days = daysBetween(first.date, latest.date);
    const change = first.weightKg !== undefined && latest.weightKg !== undefined ? dec(latest.weightKg - first.weightKg) : undefined;

    return CheckInGallery.make({ all: shown, first, latest, span: CheckInGallery_Span.make({ days }), change });
  },

  // MARK: - Two of them, side by side

  /**
   * The pair the screen compares. By default the first check-in against
   * the latest; any two can be chosen instead, and whichever is earlier is
   * the "before" — the order they were picked in does not matter.
   *
   * `nil` until there are two different check-ins to compare. An id that no
   * longer exists (the photo was removed) falls back to the default.
   */
  comparison(self: CheckInGallery, firstID?: string, secondID?: string): CheckInGallery_Comparison | undefined {
    const find = (id: string | undefined) => (id === undefined ? undefined : self.all.find((s) => s.checkIn.id === id));
    let pair: [CheckInGallery_Shown, CheckInGallery_Shown] | undefined;
    const one = find(firstID);
    const other = one === undefined ? undefined : find(secondID);
    if (one !== undefined && other !== undefined && one.checkIn.id !== other.checkIn.id) {
      pair = one.date <= other.date ? [one, other] : [other, one];
    } else if (self.first !== undefined && self.latest !== undefined && self.first.checkIn.id !== self.latest.checkIn.id) {
      pair = [self.first, self.latest];
    }
    if (pair === undefined) return undefined;
    const [before, after] = pair;

    const days = daysBetween(before.date, after.date);
    const change = before.weightKg !== undefined && after.weightKg !== undefined ? dec(after.weightKg - before.weightKg) : undefined;
    return { before, after, span: CheckInGallery_Span.make({ days }), change };
  },

  // MARK: - All of them, one after another

  /**
   * The pictures of a period, oldest first, each with how long after the
   * period's first picture it was taken.
   */
  frames(self: CheckInGallery, a: { in: CheckInGallery_Period }): CheckInGallery_Frame[] {
    const shown = pictures(self, a.in);
    const start = shown[0]?.date;
    if (start === undefined) return [];
    return shown.map((picture) => ({ shown: picture, since: CheckInGallery_Span.make({ days: daysBetween(start, picture.date) }) }));
  },

  /**
   * The periods worth offering: every picture, and each shorter stretch
   * that still holds two pictures and shows fewer than the one before it.
   */
  periods(self: CheckInGallery): CheckInGallery_Period[] {
    if (!(self.all.length > 1)) return [];
    const offered: CheckInGallery_Period[] = ["all"];
    let shown = self.all.length;
    for (const period of CheckInGallery_Period.allCases.slice(1)) {
      const count = pictures(self, period).length;
      if (count < 2) break;
      if (count < shown) {
        offered.push(period);
        shown = count;
      }
    }
    return offered;
  },
};
