import type { BodyMetric } from "../Domain/Model";
import { LegacyAdapter } from "../Legacy/LegacyAdapter";
import { addWeeks, timeIntervalSince } from "../Support/calendar";
import { dayComponent } from "../Support/engine";
import { dateFromUTCDayKey, decimalFromTwoPlaces } from "../Support/progress";
import { dec, minBy, rounded } from "../Support/swift";

// Artboard 20 · segment Lichaam, read-only.
//
// The weigh-ins the account already holds: what the scale last said, how it
// moved over four weeks, and the series behind it. Waist and entry are not
// drawn anywhere in the approved design, so neither is built.

export interface BodyProgress_Entry {
  id: string;
  date: Date;
  weightKg: number;
  /** Against the weigh-in before it, when there is one. */
  change?: number;
}

export const BodyProgress_Entry = {
  make(a: { id: string; date: Date; weightKg: number; change: number | undefined }): BodyProgress_Entry {
    return { id: a.id, date: a.date, weightKg: a.weightKg, change: a.change };
  },
};

export interface BodyProgress_Change {
  value: number;
  weeks: number;
}

export const BodyProgress_Change = {
  make(a: { value: number; weeks: number }): BodyProgress_Change {
    return { value: a.value, weeks: a.weeks };
  },
};

export interface BodyProgress {
  /** Newest first, as the list shows them. */
  entries: BodyProgress_Entry[];
  change?: BodyProgress_Change;
}

function makeFromMetrics(a: { metrics: BodyMetric[] }): BodyProgress {
  const weighed = a.metrics
    .flatMap((metric) => {
      if (!(metric.weight > 0)) return [];
      const date = BodyProgress.parse(metric.date);
      if (!date) return [];
      return [{ id: metric.id, date, weight: BodyProgress.decimal(metric.weight) }];
    })
    .sort((x, y) => x.date.getTime() - y.date.getTime());

  const entries: BodyProgress_Entry[] = [];
  weighed.forEach((weighIn, index) => {
    const previous = index > 0 ? weighed[index - 1].weight : undefined;
    entries.push(
      BodyProgress_Entry.make({
        id: weighIn.id,
        date: weighIn.date,
        weightKg: weighIn.weight,
        change: previous === undefined ? undefined : dec(weighIn.weight - previous),
      }),
    );
  });

  return { entries: [...entries].reverse(), change: BodyProgress.change({ in: entries }) };
}

export const BodyProgress = {
  /**
   * `init(entries:change:)`, and `static func make(metrics:calendar:)` — the
   * two share Swift's spelling `make` here, told apart by their labels.
   */
  make: ((a: { entries: BodyProgress_Entry[]; change: BodyProgress_Change | undefined } | { metrics: BodyMetric[] }) => {
    if ("metrics" in a) return makeFromMetrics(a);
    return { entries: a.entries, change: a.change };
  }) as {
    (a: { entries: BodyProgress_Entry[]; change: BodyProgress_Change | undefined }): BodyProgress;
    (a: { metrics: BodyMetric[] }): BodyProgress;
  },

  /** No weigh-ins yet. */
  empty: { entries: [], change: undefined } as BodyProgress,

  latest(self: BodyProgress): BodyProgress_Entry | undefined {
    return self.entries[0];
  },
  /** Oldest first, for the chart. */
  points(self: BodyProgress): BodyProgress_Entry[] {
    return [...self.entries].reverse();
  },

  /** The window the design states on the wide layout ("+0,3 / 4 weken"). */
  changeWindowWeeks: 4,

  /**
   * Against the weigh-in nearest to four weeks back — before or after it,
   * whichever is closer, so a gap in the series does not silently stretch
   * the window. The weeks are then counted, never assumed.
   */
  change(a: { in: BodyProgress_Entry[] }): BodyProgress_Change | undefined {
    const oldestFirst = a.in;
    const latest = oldestFirst[oldestFirst.length - 1];
    if (latest === undefined || !(oldestFirst.length > 1)) return undefined;
    const windowStart = addWeeks(latest.date, -BodyProgress.changeWindowWeeks);
    const earlier = oldestFirst.slice(0, -1);
    const baseline = minBy(
      earlier,
      (x, y) => Math.abs(timeIntervalSince(x.date, windowStart)) < Math.abs(timeIntervalSince(y.date, windowStart)),
    );
    if (baseline === undefined) return undefined;
    if (!(baseline.date.getTime() < latest.date.getTime())) return undefined;

    const days = dayComponent(baseline.date, latest.date);
    return BodyProgress_Change.make({
      value: dec(latest.weightKg - baseline.weightKg),
      weeks: Math.max(1, Math.trunc(rounded(days / 7))),
    });
  },

  /** The web app writes `yyyy-MM-dd`; older rows carry a full timestamp. */
  parse(text: string): Date | undefined {
    return dateFromUTCDayKey(text) ?? LegacyAdapter.isoDate(text);
  },

  /** Scale readings arrive as doubles; one decimal is all a scale claims. */
  decimal(value: number): number {
    return decimalFromTwoPlaces(value);
  },
};
