import { LoggedSet, type NutritionTargets, type WorkoutDay } from "../Domain/Model";
import type { ExerciseRole } from "../Domain/Vocabulary";
import { LegacyAdapter } from "../Legacy/LegacyAdapter";
import type { LegacyState } from "../Legacy/LegacyState";
import { RestPrescription } from "../Engine/RestPrescription";
import { Schedule } from "../Engine/Schedule";

/**
 * Rest inherits from the exercise's role (addendum 13R, TRAINING_LOGIC
 * §6), so the account states the prescriptions it actually uses instead
 * of the single 2:00 the base artboard shows.
 */
export interface AccountSummary_RestLine {
  readonly role: ExerciseRole;
  readonly roleLabel: string;
  readonly label: string;
}
export const AccountSummary_RestLine = {
  make(a: { role: ExerciseRole; roleLabel: string; label: string }): AccountSummary_RestLine {
    return { role: a.role, roleLabel: a.roleLabel, label: a.label };
  },
};

/**
 * What the Account screen (artboard 23) states about this account.
 *
 * Every value is read from what is actually stored. A row the data cannot
 * fill is left out rather than filled in: the design's `2.250 kcal · 165 g`
 * is a mock's numbers, not a default to ship.
 */
export interface AccountSummary {
  readonly planName: string;
  /** Weekday labels carrying a session this week — "ma", "wo", "vr", "za". */
  readonly trainingDays: string[];
  /** Only when the account stores them; otherwise the row is not shown. */
  readonly targets?: NutritionTargets;
  readonly rest: AccountSummary_RestLine[];
  readonly sessionCount: number;
  readonly loggedExerciseCount: number;
  readonly weighInCount: number;
}
export const AccountSummary = {
  make(a: { state: LegacyState; plan: WorkoutDay[]; now?: Date }): AccountSummary {
    const { state, plan } = a;
    const now = a.now ?? new Date();
    const { mode, sciencePlanID: scienceID } = LegacyAdapter.planMode({ from: state });
    const overrides = LegacyAdapter.scheduleOverrides({ from: state });
    const sessions = LegacyAdapter.sessions({ from: state });

    const days = Schedule.mondayFirstWeek({ containing: now })
      .filter((date) => {
        const canonical = Schedule.canonicalDay({ for: date, overrides });
        return Schedule.day({ for: canonical, in: plan }) !== undefined;
      })
      .map((d) => Schedule.weekdayLabel(d));

    // An exercise counts as trained once it carries a written set, so the
    // export line never promises more than it holds.
    const trained = new Set(
      sessions
        .flatMap((s) => s.results)
        .filter((r) => r.sets.some((set) => LoggedSet.isLogged(set)))
        .map((r) => r.exerciseID),
    );

    return {
      planName: AccountSummary.planName({ plan, mode, sciencePlanID: scienceID }),
      trainingDays: days,
      targets: LegacyAdapter.targets({ from: state }),
      rest: AccountSummary.restLines(),
      sessionCount: sessions.filter((s) => s.kind === "workout").length,
      loggedExerciseCount: trained.size,
      weighInCount: LegacyAdapter.metrics({ from: state }).length,
    };
  },

  /**
   * The plan as the user picked it, worded as the plan row on the training
   * home already words it, so the two screens never disagree.
   */
  planName(a: { plan: WorkoutDay[]; mode: string; sciencePlanID: string }): string {
    if (a.mode === "science") {
      switch (a.sciencePlanID) {
        case "upper-lower": return "Upper / Lower";
        case "full-body": return "Full body";
        default: return "Push / Pull / Legs";
      }
    }
    return a.plan.length === 5 ? "Push / Pull / Legs" : `${a.plan.length} days`;
  },

  /**
   * One line per distinct rest prescription, strongest role first. Accessory
   * and isolation share a prescription, so they share a line.
   */
  restLines(): AccountSummary_RestLine[] {
    const seen = new Set<number>();
    const out: AccountSummary_RestLine[] = [];
    for (const role of ["primaryStrength", "secondaryCompound", "isolation"] as ExerciseRole[]) {
      const prescription = RestPrescription.forRole(role);
      if (seen.has(prescription.defaultSeconds)) continue;
      seen.add(prescription.defaultSeconds);
      out.push(AccountSummary_RestLine.make({
        role,
        roleLabel: AccountSummary.roleLabel(role),
        label: RestPrescription.displayLabel(prescription),
      }));
    }
    return out;
  },

  /** The role names the rest timer already announces during a session. */
  roleLabel(role: ExerciseRole): string {
    switch (role) {
      case "primaryStrength": return "main lift";
      case "secondaryCompound": return "compound";
      case "accessory":
      case "isolation":
        return "isolation";
    }
  },
};
