// EnergyCheck.swift — height, sex and age, and whether the numbers point the
// right way for the goal.
import { GoalCheck_Verdict, WeightGoal } from "./WeightGoal";
import type { ClosedRange } from "../Support/range";

/**
 * Height, sex and age: what the energy equations need besides weight.
 * The birth year is kept rather than the age, so the age stays right.
 */
export type BodyProfile_Sex = "male" | "female";

export interface BodyProfile {
  heightCm: number;
  sex: BodyProfile_Sex;
  birthYear: number;
}

export const BodyProfile = {
  sexLabel(sex: BodyProfile_Sex): string {
    return sex === "male" ? "Male" : "Female";
  },

  age(self: BodyProfile, now: Date = new Date()): number {
    return now.getFullYear() - self.birthYear;
  },

  /** Plausible values only: 120–230 cm, 13–100 years. */
  isValid(self: BodyProfile, now: Date = new Date()): boolean {
    const age = BodyProfile.age(self, now);
    return self.heightCm >= 120 && self.heightCm <= 230 && age >= 13 && age <= 100;
  },

  decode(raw: unknown): BodyProfile | undefined {
    if (typeof raw !== "object" || raw === null) return undefined;
    const o = raw as Record<string, unknown>;
    const heightCm = Number(o.heightCm);
    const birthYear = Number(o.birthYear);
    if (!Number.isFinite(heightCm) || !Number.isFinite(birthYear)) return undefined;
    if (o.sex !== "male" && o.sex !== "female") return undefined;
    return { heightCm, sex: o.sex, birthYear };
  },
};

export type EnergyCheck_Status = "good" | "high" | "low" | "unknown";
export type EnergyCheck_Direction = "right" | "off" | "unknown";

export interface EnergyCheck_Source {
  id: string;
  claim: string;
  citation: string;
}

/**
 * Whether the numbers point the right way for the goal, from the equations
 * sports dietitians start from: resting energy by Mifflin–St Jeor, times an
 * activity factor from how often the lifter trains, plus or minus the energy
 * the goal's weekly pace asks for (about 7,700 kcal per kilo). The scale
 * stays the judge: these are estimates, and the weight trend wins once there
 * is one.
 */
export interface EnergyCheck {
  /** Resting energy, kcal a day. */
  bmr: number;
  activityFactor: number;
  /** "3–4 workouts a week". */
  activityLabel: string;
  /** Resting energy times activity, kcal a day. */
  maintenance: number;
  /** What the goal's pace asks to eat, kcal a day. */
  calorieRange: ClosedRange;
  /** Protein for the goal, grams a day. */
  proteinRange: ClosedRange;
  bmi: number;
  bmiLabel: string;
  /** The calorie target against the range. */
  target: EnergyCheck_Status;
  /** What was eaten, on average over the logged days, against the range. */
  intake: EnergyCheck_Status;
  averageKcal?: number;
  /** Protein eaten against the goal's range. */
  protein: EnergyCheck_Status;
  averageProtein?: number;
}

/** Logging is never exact: within this many kcal of the range is in it. */
const tolerance = 100;
/** The energy in a kilo of body weight change (Wishnofsky's rule of thumb). */
const kcalPerKg = 7_700;

const round50 = (value: number) => Math.round(value / 50) * 50;

export const EnergyCheck = {
  make(a: {
    profile: BodyProfile;
    weightKg: number;
    goal: WeightGoal;
    workoutsPerWeek: number;
    calorieTarget?: number;
    averageKcal?: number;
    averageProtein?: number;
    now?: Date;
  }): EnergyCheck {
    const age = BodyProfile.age(a.profile, a.now ?? new Date());
    const rest = 10 * a.weightKg + 6.25 * a.profile.heightCm - 5 * age + (a.profile.sex === "male" ? 5 : -161);
    const [factor, label] = EnergyCheck.activity(a.workoutsPerWeek);
    const maintenance = rest * factor;
    const pace = WeightGoal.weeklyRange(a.goal);
    // Never below resting energy: a deficit deeper than that costs muscle.
    const low = Math.max(rest, maintenance + (pace.lowerBound * a.weightKg * kcalPerKg) / 7);
    const high = Math.max(rest, maintenance + (pace.upperBound * a.weightKg * kcalPerKg) / 7);
    const calorieRange = { lowerBound: round50(low), upperBound: Math.max(round50(low), round50(high)) };
    const perKg = WeightGoal.proteinPerKg(a.goal);
    const proteinRange = { lowerBound: Math.round(perKg.lowerBound * a.weightKg), upperBound: Math.round(perKg.upperBound * a.weightKg) };
    const meters = a.profile.heightCm / 100;
    const bmi = a.weightKg / (meters * meters);

    const status = (value: number | undefined, range: ClosedRange): EnergyCheck_Status => {
      if (value === undefined) return "unknown";
      if (value < range.lowerBound - tolerance) return "low";
      if (value > range.upperBound + tolerance) return "high";
      return "good";
    };
    // More protein than the range costs nothing but money.
    const protein: EnergyCheck_Status =
      a.averageProtein === undefined ? "unknown" : a.averageProtein >= proteinRange.lowerBound * 0.9 ? "good" : "low";

    return {
      bmr: Math.round(rest / 10) * 10,
      activityFactor: factor,
      activityLabel: label,
      maintenance: Math.round(maintenance / 10) * 10,
      calorieRange,
      proteinRange,
      bmi: Math.round(bmi * 10) / 10,
      bmiLabel: EnergyCheck.bmiLabel(bmi),
      target: status(a.calorieTarget, calorieRange),
      intake: status(a.averageKcal, calorieRange),
      averageKcal: a.averageKcal === undefined ? undefined : Math.round(a.averageKcal),
      protein,
      averageProtein: a.averageProtein === undefined ? undefined : Math.round(a.averageProtein),
    };
  },

  /** The weight trend decides once it can; before that, what was eaten. */
  direction(trend: GoalCheck_Verdict | undefined, intake: EnergyCheck_Status): EnergyCheck_Direction {
    const kind = trend?.kind;
    if (kind === "onTrack") return "right";
    if (kind === "tooSlow" || kind === "tooFast" || kind === "wrongWay") return "off";
    if (intake === "good") return "right";
    if (intake === "high" || intake === "low") return "off";
    return "unknown";
  },

  /** Workouts a week from the last four weeks. */
  workoutsPerWeek(sessionDates: Date[], now: Date = new Date()): number {
    const start = now.getTime() - 28 * 86_400_000;
    return sessionDates.filter((d) => d.getTime() > start && d.getTime() <= now.getTime()).length / 4;
  },

  activity(perWeek: number): [number, string] {
    if (perWeek < 1) return [1.2, "Under 1 workout a week"];
    if (perWeek < 3) return [1.375, "1–2 workouts a week"];
    if (perWeek < 5) return [1.55, "3–4 workouts a week"];
    return [1.725, "5 or more workouts a week"];
  },

  bmiLabel(bmi: number): string {
    if (bmi < 18.5) return "Underweight";
    if (bmi < 25) return "Healthy range";
    if (bmi < 30) return "Overweight";
    return "Obese";
  },

  sources: [
    { id: "mifflin", claim: "Resting energy from weight, height, age and sex.", citation: "Mifflin MD et al. (1990). Am J Clin Nutr 51(2):241–247." },
    {
      id: "frankenfield",
      claim: "Mifflin–St Jeor is the most accurate of the common equations, within 10 % for most adults.",
      citation: "Frankenfield D et al. (2005). J Am Diet Assoc 105(5):775–789.",
    },
    {
      id: "helms",
      claim: "On a cut, lose 0.5–1 % of body weight a week and keep protein high to hold on to muscle.",
      citation: "Helms ER, Aragon AA, Fitschen PJ (2014). J Int Soc Sports Nutr 11:20.",
    },
    {
      id: "morton",
      claim: "Protein beyond about 1.6 g per kilo a day adds little muscle; up to 2.2 g covers nearly everyone.",
      citation: "Morton RW et al. (2018). Br J Sports Med 52(6):376–384.",
    },
    { id: "iraki", claim: "When building, gain about 0.25–0.5 % of body weight a week to limit fat gain.", citation: "Iraki J et al. (2019). Sports 7(7):154." },
    { id: "who", claim: "BMI bands: 18.5–24.9 healthy. Muscular lifters often read high without excess fat.", citation: "World Health Organization, BMI classification." },
  ] as EnergyCheck_Source[],
};
