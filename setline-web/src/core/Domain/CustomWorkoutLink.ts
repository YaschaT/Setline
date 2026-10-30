// CustomWorkoutLink.swift — a workout of your own as a link, to send through
// any chat. Everything the workout is travels in the link itself, so it needs
// no server, works from iPhone to Android and back, and opening it only ever
// offers to save a copy: nothing is added without a tap.
import { ExerciseCatalog } from "../Catalog/ExerciseCatalog";
import { CustomWorkout, CustomWorkout_Item } from "./CustomWorkout";

/** The live site, which every phone can open. */
const site = "https://youfit-app.vercel.app";

const toBase64URL = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64URL = (code: string): string | undefined => {
  try {
    const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return undefined;
  }
};

export interface CustomWorkoutLink_Received {
  readonly workout: CustomWorkout;
  /** Exercises this app's catalogue doesn't know, left out of the copy. */
  readonly skipped: number;
}

export const CustomWorkoutLink = {
  parameter: "workout",

  /** `{"n":"Push A","i":["flat-bench-press~3~6~8", …]}`, base64url. */
  code(workout: CustomWorkout): string {
    return toBase64URL(
      JSON.stringify({ n: workout.name, i: workout.items.map((item) => `${item.exerciseID}~${item.sets}~${item.repLow}~${item.repHigh}`) }),
    );
  },

  url(workout: CustomWorkout, a: { origin?: string } = {}): string {
    return `${a.origin ?? site}/?${CustomWorkoutLink.parameter}=${CustomWorkoutLink.code(workout)}`;
  },

  /** What the chat message says around the link. */
  message(workout: CustomWorkout, url: string): string {
    return `Try my workout “${workout.name}” on Setline: ${url}`;
  },

  /**
   * A copy to save: a new id, today's date, only exercises this app knows,
   * every number kept in range. Nothing at all when the link is damaged or
   * holds no exercise this app knows.
   */
  received(code: string, a: { now?: Date } = {}): CustomWorkoutLink_Received | undefined {
    const text = fromBase64URL(code.trim());
    if (text === undefined) return undefined;
    let wire: { n?: unknown; i?: unknown };
    try {
      wire = JSON.parse(text) as { n?: unknown; i?: unknown };
    } catch {
      return undefined;
    }
    const name = typeof wire.n === "string" ? [...wire.n.trim()].slice(0, 40).join("") : "";
    const lines = Array.isArray(wire.i) ? wire.i.filter((x): x is string => typeof x === "string") : [];
    const items = lines.flatMap((line) => {
      const [id, sets, low, high] = line.split("~");
      if (!id || ExerciseCatalog.exercise(id) === undefined) return [];
      const number = (value: string | undefined, fallback: number) => {
        const n = Number(value);
        return Number.isInteger(n) && n > 0 && n <= 100 ? n : fallback;
      };
      return [CustomWorkout_Item.make({ exerciseID: id, sets: number(sets, 3), repLow: number(low, 8), repHigh: number(high, 12) })];
    });
    if (items.length === 0) return undefined;
    return {
      workout: CustomWorkout.make({ name: name === "" ? "Shared workout" : name, items, createdAt: a.now ?? new Date() }),
      skipped: lines.length - items.length,
    };
  },
};
