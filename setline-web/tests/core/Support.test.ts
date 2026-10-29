import { test } from "node:test";
import { assertEqual } from "../helpers";
import { rounded, maxOf, minOf, dec } from "../../src/core/Support/swift";
import { addDays, daysBetween, startOfMondayWeek, formatEnUS, weekday } from "../../src/core/Support/calendar";

test("rounded is Swift's: halves away from zero", () => {
  assertEqual([rounded(2.5), rounded(-2.5), rounded(1.49), rounded(-0.5)], [3, -3, 1, -1]);
});
test("max(by:) and min(by:) keep the first extreme, as Swift does", () => {
  const xs = [{ k: 1, n: "a" }, { k: 3, n: "b" }, { k: 3, n: "c" }, { k: 1, n: "d" }];
  assertEqual(maxOf(xs, (x) => x.k)?.n, "b");
  assertEqual(minOf(xs, (x) => x.k)?.n, "a");
  assertEqual(dec(0.1 + 0.2), 0.3);
});
test("calendar: Monday weeks, whole days across DST, en_US formats", () => {
  const sunday = new Date(2026, 9, 25, 12); // Sun 25 Oct 2026, DST ends that night in Brussels
  assertEqual(weekday(sunday), 1);
  assertEqual(startOfMondayWeek(sunday).getDate(), 19);
  assertEqual(daysBetween(new Date(2026, 9, 24, 23), addDays(new Date(2026, 9, 24, 23), 2)), 2);
  assertEqual(formatEnUS(sunday, "EEEEEE d MMM"), "Su 25 Oct");
  assertEqual(formatEnUS(sunday, "EEEE, d MMMM yyyy"), "Sunday, 25 October 2026");
});
