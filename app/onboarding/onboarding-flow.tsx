"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DAY_LABELS, WeekCanvas, type WeekSlot } from "@/components/week-canvas";
import {
  DAY_SHORT,
  GOALS,
  PLAN_CHOICES,
  slotForNewTrainingDay,
  scheduleOverridesForWeek,
  targetsFor,
  type CanonicalDayId,
  type Goal,
  type PlanChoice,
} from "./setup-state";

const STORAGE_KEY = "yascha-training-v1";

const STEPS = ["Doel", "Plan", "Week", "Gewicht"] as const;

/** Turns a plan's weekday map into a Monday-first array. */
function weekFromPlan(plan: PlanChoice): CanonicalDayId[] {
  return Array.from({ length: 7 }, (_, position) => plan.schedule[(position + 1) % 7] ?? "rest");
}

export function OnboardingFlow({
  email,
  onDone,
}: {
  email?: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [plan, setPlan] = useState<PlanChoice | null>(null);
  const [week, setWeek] = useState<CanonicalDayId[]>([]);
  const [weight, setWeight] = useState("");
  const [weightError, setWeightError] = useState("");
  const [saving, setSaving] = useState(false);
  const [handingOver, setHandingOver] = useState(false);

  const trainingDayCount = week.filter((day) => day !== "rest").length;

  const slots: WeekSlot[] = useMemo(
    () =>
      DAY_LABELS.map((label, position) => {
        const assignment = week[position];
        // The week stays at rest until a plan has actually been chosen.
        if (!assignment) return { label, training: null, decided: false };
        return {
          label,
          training: assignment === "rest" ? null : DAY_SHORT[assignment],
          decided: true,
        };
      }),
    [week],
  );

  /** Shows the answer doing something, before the button is pressed. */
  const previewTargets = useMemo(() => {
    if (!goal) return null;
    const parsed = Number(weight.replace(",", "."));
    if (!parsed || parsed < 30 || parsed > 300) return null;
    return targetsFor(parsed, goal);
  }, [goal, weight]);

  function choosePlan(next: PlanChoice) {
    setPlan(next);
    setWeek(weekFromPlan(next));
  }

  function toggleDay(position: number) {
    if (!plan) return;
    setWeek((current) => {
      const next = [...current];
      if (next[position] === "rest") {
        next[position] = slotForNewTrainingDay(next, plan.slots);
      } else {
        next[position] = "rest";
      }
      return next;
    });
  }

  async function finish() {
    if (!plan || !goal) return;

    const parsedWeight = Number(weight.replace(",", "."));

    if (!parsedWeight || parsedWeight < 30 || parsedWeight > 300) {
      setWeightError("Vul je gewicht in, tussen 30 en 300 kg.");
      return;
    }
    setWeightError("");
    setSaving(true);

    const today = new Date();
    const isoDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}`;

    // Merge rather than overwrite: a returning device may already hold state,
    // and setup adds to it instead of erasing what is there.
    let existing: Record<string, unknown> = {};
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      existing = {};
    }

    const existingMetrics = Array.isArray(existing.metrics) ? (existing.metrics as unknown[]) : [];

    const nextState = {
      ...existing,
      planMode: plan.planMode,
      sciencePlanId: plan.sciencePlanId,
      scheduleOverrides: {
        ...(typeof existing.scheduleOverrides === "object" && existing.scheduleOverrides
          ? (existing.scheduleOverrides as Record<string, CanonicalDayId>)
          : {}),
        ...scheduleOverridesForWeek(week, plan),
      },
      targets: targetsFor(parsedWeight, goal),
      metrics: [
        ...existingMetrics,
        { id: `${Date.now()}`, date: isoDate, weight: parsedWeight },
      ],
      updatedAt: new Date().toISOString(),
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // A full or locked store must not strand someone in setup: the app still
      // opens, it just starts from its defaults.
    }

    // Publish before handing over, so the same account opening on another
    // device lands in the app instead of being asked to set up a second time.
    // A failure here is not fatal: the app pushes state again once it mounts.
    try {
      // The server stamps its own updatedAt; sending ours would only compete.
      const cloudState: Record<string, unknown> = { ...nextState };
      delete cloudState.updatedAt;
      await fetch("/api/user-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: cloudState }),
        cache: "no-store",
      });
    } catch {
      // Offline setup still works; the sync effect retries on every change.
    }

    setHandingOver(true);
    window.setTimeout(onDone, 900);
  }

  const canAdvance =
    step === 0 ? Boolean(goal)
    : step === 1 ? Boolean(plan)
    : step === 2 ? trainingDayCount > 0
    : Boolean(weight.trim());

  function next() {
    if (!canAdvance) return;
    if (step === STEPS.length - 1) void finish();
    else setStep((value) => value + 1);
  }

  return (
    <main className={`gate gate-setup ${handingOver ? "gate-handing-over" : ""}`}>
      <div className="gate-ambient" aria-hidden="true">
        <span />
        <span />
      </div>

      <div className="gate-stage">
        <WeekCanvas
          slots={slots}
          igniting={handingOver}
        />

        <div className="gate-panel">
          <div className="setup-rail" aria-hidden="true">
            {STEPS.map((label, index) => (
              <span key={label} className={index <= step ? "is-reached" : ""} />
            ))}
          </div>
          <p className="setup-count">
            Stap {step + 1} van {STEPS.length}
          </p>

          {step === 0 && (
            <>
              <h1 className="gate-headline">Waar train je naartoe?</h1>
              <p className="gate-sub">Dit bepaalt je calorieën en eiwit. Je kunt het later bijstellen.</p>
              <div className="setup-options">
                {GOALS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`setup-option ${goal === option.id ? "is-chosen" : ""}`}
                    aria-pressed={goal === option.id}
                    onClick={() => setGoal(option.id)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                    {goal === option.id && <Check className="setup-option-check" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="gate-headline">Welk plan volg je?</h1>
              <p className="gate-sub">Je week vult zich achter dit paneel zodra je kiest.</p>
              <div className="setup-options setup-options-stack">
                {PLAN_CHOICES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`setup-option setup-option-wide ${plan?.id === option.id ? "is-chosen" : ""}`}
                    aria-pressed={plan?.id === option.id}
                    onClick={() => choosePlan(option)}
                  >
                    <span className="setup-option-top">
                      <strong>{option.label}</strong>
                      <em>{option.days}</em>
                    </span>
                    <small>{option.summary}</small>
                    {plan?.id === option.id && <Check className="setup-option-check" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="gate-headline">Op welke dagen train je?</h1>
              <p className="gate-sub">
                Tik een dag aan of uit. Nu {trainingDayCount}{" "}
                {trainingDayCount === 1 ? "trainingsdag" : "trainingsdagen"} per week.
              </p>
              <div className="setup-week" role="group" aria-label="Trainingsdagen kiezen">
                {DAY_LABELS.map((label, position) => {
                  const assignment = week[position] ?? "rest";
                  const training = assignment !== "rest";
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`setup-day ${training ? "is-training" : ""}`}
                      aria-pressed={training}
                      onClick={() => toggleDay(position)}
                    >
                      <span className="setup-day-label">{label}</span>
                      <span className="setup-day-value">
                        {training ? DAY_SHORT[assignment] : "rust"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {trainingDayCount === 0 && (
                <p className="gate-field-error" role="alert">
                  Kies minstens één trainingsdag.
                </p>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="gate-headline">Wat weeg je nu?</h1>
              <p className="gate-sub">Hiermee zetten we je eerste calorie- en eiwitdoel.</p>
              <div className="gate-field">
                <Label htmlFor="setup-weight">Gewicht vandaag</Label>
                <div className="setup-unit-field">
                  <Input
                    id="setup-weight"
                    inputMode="decimal"
                    placeholder="82,4"
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                    aria-invalid={Boolean(weightError)}
                    aria-describedby={weightError ? "setup-weight-error" : "setup-preview"}
                  />
                  <span>kg</span>
                </div>
              </div>
              {previewTargets && (
                <div className="setup-preview" id="setup-preview" role="status">
                  <p>Daarmee start je op</p>
                  <div>
                    <span>
                      <strong>{previewTargets.calories.toLocaleString("nl-BE")}</strong>
                      <small>kcal per dag</small>
                    </span>
                    <span>
                      <strong>{previewTargets.protein}</strong>
                      <small>g eiwit</small>
                    </span>
                    <span>
                      <strong>{previewTargets.carbs}</strong>
                      <small>g koolhydraten</small>
                    </span>
                    <span>
                      <strong>{previewTargets.fat}</strong>
                      <small>g vet</small>
                    </span>
                  </div>
                </div>
              )}
              {weightError && (
                <p className="gate-field-error" id="setup-weight-error" role="alert">
                  {weightError}
                </p>
              )}
            </>
          )}

          <div className="setup-actions">
            <Button
              type="button"
              className="gate-submit"
              onClick={next}
              disabled={!canAdvance || saving || handingOver}
            >
              {handingOver ? (
                <>
                  <Check aria-hidden="true" /> Je week staat klaar
                </>
              ) : saving ? (
                <>
                  <LoaderCircle className="gate-spin" aria-hidden="true" /> Opslaan
                </>
              ) : step === STEPS.length - 1 ? (
                <>
                  Zet op de lijn <ArrowRight aria-hidden="true" />
                </>
              ) : (
                <>
                  Verder <ArrowRight aria-hidden="true" />
                </>
              )}
            </Button>
            {step > 0 && !handingOver && (
              <button type="button" className="setup-back" onClick={() => setStep((value) => value - 1)}>
                <ArrowLeft aria-hidden="true" /> Terug
              </button>
            )}
          </div>

          {email && (
            <p className="setup-account">
              Je zet dit op voor <strong>{email}</strong>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
