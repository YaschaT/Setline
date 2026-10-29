import { AccountSummary } from "../Account/AccountSummary";
import type { WorkoutDay } from "../Domain/Model";
import { Schedule } from "../Engine/Schedule";
import { LegacyAdapter } from "../Legacy/LegacyAdapter";
import type { LegacyState } from "../Legacy/LegacyState";
import { PlanCatalog } from "./PlanCatalog";

/**
 * A programme the account can be on.
 *
 * Switching between them changes which plan the week is built from. It does
 * not rewrite anything: the account's own edited plan stays exactly as the web
 * app left it, and each programme keeps its own schedule overrides, because
 * those are scoped by programme key.
 */
export interface Program {
  readonly mode: string;
  readonly sciencePlanID?: string;
  readonly name: string;
  /** What the week looks like on it, in the plan's own day names. */
  readonly shape: string;
}

export const Program = {
  make(p: { mode: string; sciencePlanID: string | undefined; name: string; shape: string }): Program {
    return { mode: p.mode, sciencePlanID: p.sciencePlanID, name: p.name, shape: p.shape };
  },

  id(self: Program): string {
    return Schedule.programKey({ mode: self.mode, sciencePlanID: self.sciencePlanID ?? "ppl-ul" });
  },

  matches(self: Program, a: { mode: string; sciencePlanID: string }): boolean {
    return self.mode === a.mode && (self.mode === "personal" || self.sciencePlanID === a.sciencePlanID);
  },
};

function shape(a: { of: readonly WorkoutDay[] }): string {
  return a.of.map((day) => day.short).join(" · ");
}

let scienceCache: Program[] | undefined;

export const ProgramCatalog = {
  /** The account's own plan, described by what is actually in it. */
  personal(plan: WorkoutDay[]): Program {
    return Program.make({
      mode: "personal",
      sciencePlanID: undefined,
      name: AccountSummary.planName({ plan, mode: "personal", sciencePlanID: "ppl-ul" }),
      shape: shape({ of: plan }),
    });
  },

  /** `static let science` — lazy, as a Swift static is. */
  get science(): Program[] {
    scienceCache ??= [
      Program.make({
        mode: "science",
        sciencePlanID: "ppl-ul",
        name: "PPL + Upper / Lower",
        shape: shape({ of: PlanCatalog.sciencePPLUL }),
      }),
      Program.make({
        mode: "science",
        sciencePlanID: "upper-lower",
        name: "Upper / Lower",
        shape: shape({ of: PlanCatalog.scienceUpperLower }),
      }),
      Program.make({
        mode: "science",
        sciencePlanID: "full-body",
        name: "Full body",
        shape: shape({ of: PlanCatalog.scienceFullBody }),
      }),
    ];
    return scienceCache;
  },

  all(a: { personalPlan: WorkoutDay[] }): Program[] {
    return [ProgramCatalog.personal(a.personalPlan), ...ProgramCatalog.science];
  },

  current(a: { in: LegacyState; plan: WorkoutDay[] }): Program {
    const { mode, sciencePlanID: scienceID } = LegacyAdapter.planMode({ from: a.in });
    return (
      ProgramCatalog.all({ personalPlan: a.plan }).find((program) =>
        Program.matches(program, { mode, sciencePlanID: scienceID }),
      ) ?? ProgramCatalog.personal(a.plan)
    );
  },
};
