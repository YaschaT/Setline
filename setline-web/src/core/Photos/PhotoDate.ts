import { startOfDay } from "../Support/calendar";
import { trimmingWhitespacesAndNewlines } from "../Support/nutrition";
import { exifDates } from "../Support/photos";

/** `DateFormatter` with en_US_POSIX, Gregorian, "yyyy:MM:dd HH:mm:ss", in the device's time zone. */
function exifStamp(text: string): Date | undefined {
  const match = /^(\d+):(\d{1,2}):(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(text);
  if (!match) return undefined;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate()) return undefined;
  if (hour > 23 || minute > 59 || second > 59) return undefined;
  const date = new Date(year, month - 1, day, hour, minute, second);
  date.setFullYear(year, month - 1, day);
  return date;
}

/**
 * When a picture was taken, as the camera wrote it into the file.
 *
 * A check-in is dated by the day its picture was taken, not the day it was
 * added: a photo from July picked out of the library today is a July
 * check-in, beside July's weigh-in. The camera's own record is read —
 * `DateTimeOriginal`, else the moment it was digitised; never the file's
 * `DateTime`, which an edit moves — as the wall-clock time it states, which
 * is the day the person lived it.
 */
export const PhotoDate = {
  /**
   * `nil` when the picture carries no date, or a date after today: a camera
   * clock that is wrong is not a check-in from the future.
   */
  taken(a: { in: Uint8Array; now?: Date }): Date | undefined {
    const now = a.now ?? new Date();
    const exif = exifDates(a.in);
    if (exif === undefined) return undefined;
    const stamp = exif.original ?? exif.digitized;
    if (stamp === undefined) return undefined;

    const taken = exifStamp(trimmingWhitespacesAndNewlines(stamp));
    if (taken === undefined || !(startOfDay(taken) <= startOfDay(now))) return undefined;
    return taken;
  },
};
