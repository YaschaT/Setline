import { ExerciseCatalog } from "../Catalog/ExerciseCatalogV1";
import type { JSONValue } from "../Legacy/JSONValue";
import { KeyedContainer, decodeArray, decodeDate, decodeInt, decodeString, encodeJSON } from "../Support/codable";
import { closedRange } from "../Support/range";
import { uuid } from "../Support/swift";
import { PlannedExercise, SetPrescription, WorkoutDay } from "./Model";

export interface CustomWorkout_Item {
  exerciseID: string;
  sets: number;
  repLow: number;
  repHigh: number;
}

export const CustomWorkout_Item = {
  make(p: { exerciseID: string; sets?: number; repLow?: number; repHigh?: number }): CustomWorkout_Item {
    const repLow = Math.max(1, p.repLow ?? 8);
    return {
      exerciseID: p.exerciseID,
      sets: Math.max(1, Math.min(10, p.sets ?? 3)),
      repLow,
      repHigh: Math.max(repLow, p.repHigh ?? 12),
    };
  },

  decode(json: JSONValue): CustomWorkout_Item {
    const c = new KeyedContainer(json);
    return {
      exerciseID: c.decode("exerciseID", decodeString),
      sets: c.decode("sets", decodeInt),
      repLow: c.decode("repLow", decodeInt),
      repHigh: c.decode("repHigh", decodeInt),
    };
  },
};

/**
 * A workout the lifter put together: a name and a list of exercises with how
 * many sets each. Kept in the account (`iosCustomWorkouts`), so it follows
 * the account to every phone; started like any plan day, and logged like one.
 */
export interface CustomWorkout {
  id: string;
  name: string;
  items: CustomWorkout_Item[];
  createdAt: Date;
}

export const CustomWorkout = {
  make(p: { id?: string; name: string; items: CustomWorkout_Item[]; createdAt?: Date }): CustomWorkout {
    return {
      id: p.id ?? CustomWorkout.newID(),
      name: p.name,
      items: p.items,
      createdAt: p.createdAt ?? new Date(),
    };
  },

  /** Namespaced so it can never be taken for a plan day's id. */
  idPrefix: "custom-",

  newID(): string {
    return CustomWorkout.idPrefix + uuid().slice(0, 8).toLowerCase();
  },

  isCustom(a: { dayID: string }): boolean {
    return a.dayID.startsWith(CustomWorkout.idPrefix);
  },

  /**
   * The workout as the session screen reads a plan day. Roles come from
   * the catalogue, so progression treats a squat as a squat wherever it
   * was put.
   */
  workoutDay(self: CustomWorkout): WorkoutDay {
    return WorkoutDay.make({
      id: self.id,
      label: self.name,
      short: self.name,
      focus: "",
      exercises: self.items.map((item) =>
        PlannedExercise.make({
          exerciseID: item.exerciseID,
          role: ExerciseCatalog.roles[item.exerciseID] ?? "accessory",
          sets: Array.from({ length: item.sets }, () =>
            SetPrescription.make({ repRange: closedRange(item.repLow, item.repHigh) }),
          ),
        }),
      ),
    });
  },

  encode(self: CustomWorkout): JSONValue {
    return encodeJSON(self);
  },

  decode(json: JSONValue): CustomWorkout {
    const c = new KeyedContainer(json);
    return {
      id: c.decode("id", decodeString),
      name: c.decode("name", decodeString),
      items: c.decode("items", decodeArray(CustomWorkout_Item.decode)),
      createdAt: c.decode("createdAt", decodeDate),
    };
  },
};
