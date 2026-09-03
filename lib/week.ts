/**
 * Calendar helpers shared by the training app and the first-run setup flow.
 *
 * A week runs Monday to Sunday, and every date key is a local `YYYY-MM-DD`
 * string. Both surfaces write the same `scheduleOverrides` map, so they must
 * agree on week boundaries exactly — hence one definition, not two.
 */

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Noon avoids every DST edge where midnight does not exist or repeats. */
export function parseDateKey(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function startOfWeek(date = new Date()) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  const distanceFromMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - distanceFromMonday);
  return result;
}

export function datesInWeek(date = new Date()) {
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => {
    const result = new Date(monday);
    result.setDate(monday.getDate() + index);
    return result;
  });
}
