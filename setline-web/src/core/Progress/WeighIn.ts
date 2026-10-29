import type { BodyMetric } from "../Domain/Model";
import type { JSONObject, JSONValue } from "../Legacy/JSONValue";
import { formatPOSIX, isSameDay } from "../Support/calendar";
import { roundPlaces } from "../Support/swift";
import { BodyProgress } from "./BodyProgress";

/**
 * Writing a weigh-in, by the one rule both clients can live with: a day
 * holds one weigh-in.
 *
 * The account already stores weigh-ins under `metrics`, dated `yyyy-MM-dd`,
 * and the web app has always been able to add one. This is the same row,
 * written from here: weighing again on a day the account already has replaces
 * that day's number in place, keeping its id — and with it everything else
 * the row carries, a waist the web app measured included.
 *
 * Every other weigh-in is left exactly as stored; the trend is never written,
 * only recomputed from the series (`BodyProgress`).
 */
export const WeighIn = {
  /** `yyyy-MM-dd`, the shape the web app writes and `BodyProgress` reads. */
  dateKey(date: Date): string {
    return formatPOSIX(date, "yyyy-MM-dd");
  },

  /**
   * The weigh-in already stored for that day, if there is one. Rows written
   * before the web app settled on `yyyy-MM-dd` carry a full timestamp, so
   * the day is compared, never the string.
   */
  stored(a: { on: Date; in: BodyMetric[] }): BodyMetric | undefined {
    for (let i = a.in.length - 1; i >= 0; i--) {
      const metric = a.in[i];
      const stored = BodyProgress.parse(metric.date);
      if (stored !== undefined && isSameDay(stored, a.on)) return metric;
    }
    return undefined;
  },

  /**
   * The row to write for a weight on a day: that day's row updated in
   * place, or a new one. It never touches another day, and never adds a
   * second row for a day that already has one.
   *
   * `id` is Swift's `@autoclosure`: evaluated only when a new row is made.
   */
  entry(a: { weightKg: number; on: Date; in: BodyMetric[]; id?: string | (() => string) }): BodyMetric {
    const weight = a.weightKg;
    const existing = WeighIn.stored({ on: a.on, in: a.in });
    if (existing === undefined) {
      const id =
        a.id === undefined ? `${Math.trunc(Date.now())}` : typeof a.id === "function" ? a.id() : a.id;
      return { id, date: WeighIn.dateKey(a.on), weight };
    }
    return { ...existing, weight };
  },

  /**
   * The same row as the shared state stores it. `waist` is written only
   * where the row already carried one, because this client never measures
   * it and absent is how both clients read "not measured".
   */
  json(metric: BodyMetric): JSONValue {
    // A scale reads to a tenth. Rounding here keeps the binary artifacts
    // of a Double out of the shared state, where both clients read it.
    const rounded = roundPlaces(metric.weight, 1);
    const object: JSONObject = {
      id: metric.id,
      date: metric.date,
      weight: rounded,
    };
    if (metric.waist !== undefined) object["waist"] = metric.waist;
    return object;
  },
};
