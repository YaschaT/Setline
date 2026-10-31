// PlanViews.swift — weight, goal and whether the eating fits it, on the
// Nutrition tab: the card, the full plan, and height, sex and age.
import { useState } from "react";
import { SL } from "../../design/tokens";
import { slListCard } from "../../design/tokens";
import { HStack, Pressable, Sheet, Spacer, Text, UserDefaults, VStack } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLPrimaryButton, colorOpacity } from "../../design/SetlineTokens";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLSheet } from "../../design/components/SLSheet";
import { SLOverline } from "../../design/components/SLPieces";
import { SLHairline, slBody, slLead, slMeta } from "../../design/components/SLText";
import { useApp, type AppState } from "../../data/AppState";
import { BodyProgress } from "../../core/Progress/BodyProgress";
import { GoalCheck, WeightGoal } from "../../core/Progress/WeightGoal";
import { BodyProfile, EnergyCheck, type BodyProfile_Sex, type EnergyCheck_Direction, type EnergyCheck_Status } from "../../core/Progress/EnergyCheck";
import { NutritionHistory } from "../../core/Nutrition/NutritionHistory";
import { StateChange } from "../../core/Sync/StateChange";
import type { ClosedRange } from "../../core/Support/range";
import { GoalCheckExt, GoalPreference, GoalSheet, GoalSymbol, NutritionReminders } from "../Progress/GoalViews";
import { WeighInSheet } from "../Progress/WeighInSheet";

// MARK: - Height, sex and age

const profileKey = "setline.bodyProfile";

/** Height, sex and age, kept on this device next to the goal. */
export const BodyProfilePreference = {
  get profile(): BodyProfile | undefined {
    return BodyProfile.decode(UserDefaults.get<unknown>(profileKey));
  },
  set profile(newValue: BodyProfile | undefined) {
    UserDefaults.set(profileKey, newValue);
  },
};

/** Everything the plan reads, worked out once per look. */
export interface NutritionPlan {
  goal?: WeightGoal;
  profile?: BodyProfile;
  latestKg?: number;
  check?: GoalCheck;
  energy?: EnergyCheck;
  direction: EnergyCheck_Direction;
}

/** "About 1,150", not "1,154": the estimate isn't that exact. */
const round50 = (value: number) => Math.max(50, Math.round(value / 50) * 50);

export const PlanCopy = {
  thousands: (value: number) => Math.round(value).toLocaleString("en-GB"),
  kcal: (range: ClosedRange) => `${PlanCopy.thousands(range.lowerBound)}–${PlanCopy.thousands(range.upperBound)} kcal`,
  list(parts: string[]): string {
    if (parts.length <= 1) return parts[0] ?? "";
    return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  },
  kg: (value: number) => value.toFixed(1),
  signedKg: (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}`,
};

export const NutritionPlan = {
  make(app: AppState, goal: WeightGoal | undefined, profile: BodyProfile | undefined): NutritionPlan {
    const progress = BodyProgress.make({ metrics: app.metrics });
    const latestKg = BodyProgress.latest(progress)?.weightKg;
    const check =
      goal === undefined
        ? undefined
        : GoalCheck.evaluate({ goal, weighIns: GoalCheckExt.weighIns(progress), startedAt: GoalPreference.since });
    const history = app.nutritionHistory();
    const enough = NutritionHistory.logged(history).length >= 3;
    const calories = app.targets?.calories;
    const energy =
      goal !== undefined && profile !== undefined && latestKg !== undefined && BodyProfile.isValid(profile)
        ? EnergyCheck.make({
            profile,
            weightKg: latestKg,
            goal,
            workoutsPerWeek: EnergyCheck.workoutsPerWeek(app.sessions.map((s) => s.date)),
            calorieTarget: calories !== undefined && calories > 0 ? calories : undefined,
            averageKcal: enough ? NutritionHistory.averageCalories(history) : undefined,
            averageProtein: enough ? NutritionHistory.averageProtein(history) : undefined,
          })
        : undefined;
    return { goal, profile, latestKg, check, energy, direction: EnergyCheck.direction(check?.verdict, energy?.intake ?? "unknown") };
  },

  isSetUp(self: NutritionPlan): boolean {
    return self.goal !== undefined && self.profile !== undefined && self.latestKg !== undefined;
  },

  /** What is still missing before the check can run, in order. */
  missing(self: NutritionPlan): string[] {
    const out: string[] = [];
    if (self.goal === undefined) out.push("your goal");
    if (self.latestKg === undefined) out.push("your weight");
    if (self.profile === undefined) out.push("height, sex and age");
    return out;
  },

  headline(self: NutritionPlan): string {
    if (!NutritionPlan.isSetUp(self)) return "Set up your plan";
    switch (self.direction) {
      case "right":
        return "You're heading the right way";
      case "off":
        return "Slightly off course";
      case "unknown":
        return "Log a few days to see";
    }
  },

  sentence(self: NutritionPlan): string {
    if (!NutritionPlan.isSetUp(self)) {
      return `Add ${PlanCopy.list(NutritionPlan.missing(self))} and Setline checks your eating against what science says works for you.`;
    }
    const check = self.check;
    if (check && GoalCheckExt.needsAction(check)) {
      const kcal = check.dailyKcalAdjustment;
      const fix = kcal !== undefined && kcal !== 0 ? `About ${kcal > 0 ? "+" : "−"}${Math.abs(kcal)} kcal a day fixes it.` : "Open your plan to see what to change.";
      return `${GoalCheckExt.headline(check)}. ${fix}`;
    }
    const goalName = WeightGoal.title(self.goal!).toLowerCase();
    if (check && check.verdict.kind === "onTrack") return `Your weight moves at the pace your ${goalName} asks for.`;
    const energy = self.energy;
    if (!energy) return "Log your weight a few mornings and your food for 3 days.";
    switch (energy.intake) {
      case "good":
        return `You eat inside the ${PlanCopy.kcal(energy.calorieRange)} a ${goalName} asks for. The scale confirms it in a week or two.`;
      case "high":
        return `You eat about ${PlanCopy.thousands(round50((energy.averageKcal ?? 0) - energy.calorieRange.upperBound))} kcal a day more than a ${goalName} asks for.`;
      case "low":
        return `You eat about ${PlanCopy.thousands(round50(energy.calorieRange.lowerBound - (energy.averageKcal ?? 0)))} kcal a day less than a ${goalName} asks for.`;
      case "unknown":
        return `Log your food for 3 days and Setline compares it with the ${PlanCopy.kcal(energy.calorieRange)} your goal asks for.`;
    }
  },

  ink(self: NutritionPlan): string {
    if (!NutritionPlan.isSetUp(self)) return SL.Signal.action;
    return self.direction === "right" ? SL.Signal.action : self.direction === "off" ? SL.Signal.attention : SL.Ink.secondary;
  },

  symbol(self: NutritionPlan): string {
    if (!NutritionPlan.isSetUp(self)) return "scope";
    return self.direction === "right" ? "checkmark.circle.fill" : self.direction === "off" ? "exclamationmark.triangle.fill" : "hourglass";
  },
};

function PlanSymbol({ plan, size, box }: { plan: NutritionPlan; size: number; box: number }) {
  const ink = NutritionPlan.ink(plan);
  const name = NutritionPlan.symbol(plan);
  return (
    <div style={{ width: box, height: box, borderRadius: "50%", background: colorOpacity(ink, 0.14), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {name === "scope" ? <SFSymbol name="target" size={size} weight={700} color={ink} /> : <GoalSymbol name={name} size={size} weight={700} color={ink} />}
    </div>
  );
}

// MARK: - The card on Nutrition

/**
 * Weight, goal and whether the eating fits it, on the Nutrition tab where
 * people look for it: one verdict, three numbers, one clear way in.
 */
export function NutritionPlanCard({ plan, onOpen }: { plan: NutritionPlan; onOpen: () => void }) {
  const setUp = NutritionPlan.isSetUp(plan);
  const weekly = plan.check?.weeklyKg;
  const figure = (value: string, label: string) => (
    <VStack spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
      <Text {...slLead(SL.Weight.bold)} numerals color={SL.Ink.primary} lineLimit={1}>{value}</Text>
      <Text size={SL.TypeSize.micro} weight={SL.Weight.medium} numerals color={SL.Ink.secondary} lineLimit={1}>{label}</Text>
    </VStack>
  );
  const divider = <div style={{ width: 1, height: 30, background: SL.Surface.hairline, flexShrink: 0 }} />;
  const energy = plan.energy;
  return (
    <Pressable
      onPress={onOpen}
      aria-label={`${NutritionPlan.headline(plan)}. ${NutritionPlan.sentence(plan)} Opens your plan.`}
      style={(pressed) => ({
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: SL.Space.s4,
        background: SL.Surface.raised,
        borderRadius: SL.Radius.xl,
        boxShadow: `inset 0 0 0 1px ${plan.direction === "off" && setUp ? colorOpacity(SL.Signal.attention, 0.4) : SL.Surface.hairline}`,
        transform: pressed ? "scale(0.98)" : undefined,
        transition: "transform 120ms ease-out",
      })}
    >
      <VStack alignment="leading" spacing={SL.Space.s4}>
        <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
          <SLOverline text={plan.goal ? `Your plan · ${WeightGoal.title(plan.goal)}` : "Your plan"} color={SL.Ink.secondary} />
          <Spacer minLength={SL.Space.s2} />
          <SLGlyph name="chevronRight" size={12} color={SL.Ink.tertiary} />
        </HStack>
        <HStack alignment="top" spacing={SL.Space.s3}>
          <PlanSymbol plan={plan} size={17} box={38} />
          <VStack alignment="leading" spacing={3} style={{ minWidth: 0 }}>
            <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>{NutritionPlan.headline(plan)}</Text>
            <Text {...slMeta()} numerals color={SL.Ink.secondary}>{NutritionPlan.sentence(plan)}</Text>
          </VStack>
        </HStack>
        {setUp && (
          <HStack spacing={0} style={{ alignSelf: "stretch", padding: `${SL.Space.s3}px 0`, background: SL.Surface.raised2, borderRadius: SL.Radius.md }}>
            {figure(plan.latestKg !== undefined ? `${PlanCopy.kg(plan.latestKg)} kg` : "—", weekly !== undefined ? `${PlanCopy.signedKg(weekly)} kg/wk` : "weight")}
            {divider}
            {figure(energy ? PlanCopy.thousands((energy.calorieRange.lowerBound + energy.calorieRange.upperBound) / 2) : "—", "kcal a day")}
            {divider}
            {figure(energy ? `${energy.proteinRange.lowerBound} g+` : "—", "protein")}
          </HStack>
        )}
        <div
          style={{
            alignSelf: "stretch",
            minHeight: 46,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            background: setUp ? SL.Surface.raised2 : SL.Signal.action,
            boxShadow: setUp ? `inset 0 0 0 1px ${SL.Surface.hairlineStrong}` : undefined,
          }}
        >
          <Text size={SL.TypeSize.body} weight={SL.Weight.semibold} color={setUp ? SL.Ink.primary : SL.Signal.onAction}>
            {setUp ? "Open your plan" : "Set up my plan"}
          </Text>
        </div>
      </VStack>
    </Pressable>
  );
}

// MARK: - The plan, in full

const thisYear = () => new Date().getFullYear();

export function NutritionPlanSheet({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [goal, setGoal] = useState<WeightGoal | undefined>(() => GoalPreference.goal);
  const [profile, setProfile] = useState<BodyProfile | undefined>(() => BodyProfilePreference.profile);
  const [heightText, setHeightText] = useState(() => (profile ? String(Math.round(profile.heightCm)) : ""));
  const [ageText, setAgeText] = useState(() => (profile ? String(BodyProfile.age(profile)) : ""));
  const [sex, setSex] = useState<BodyProfile_Sex | undefined>(() => profile?.sex);
  const [choosingGoal, setChoosingGoal] = useState(false);
  const [weighing, setWeighing] = useState(false);
  const [applied, setApplied] = useState(false);
  const [showsSources, setShowsSources] = useState(false);

  const plan = NutritionPlan.make(app, goal, profile);
  const ink = NutritionPlan.ink(plan);

  const saveProfile = (next: { sex?: BodyProfile_Sex; height?: string; age?: string }) => {
    const s = next.sex ?? sex;
    const height = Number(next.height ?? heightText);
    const age = Number(next.age ?? ageText);
    if (s === undefined || !Number.isFinite(height) || !Number.isInteger(age) || (next.height ?? heightText) === "" || (next.age ?? ageText) === "") return;
    const candidate: BodyProfile = { heightCm: height, sex: s, birthYear: thisYear() - age };
    if (!BodyProfile.isValid(candidate)) return;
    BodyProfilePreference.profile = candidate;
    setProfile(candidate);
  };

  const pill = (text: string, perform: () => void) => (
    <Pressable
      onPress={perform}
      style={{
        minHeight: 36,
        padding: `0 ${SL.Space.s3}px`,
        borderRadius: 999,
        background: "transparent",
        boxShadow: `inset 0 0 0 1px ${colorOpacity(SL.Signal.action, 0.5)}`,
        color: SL.Signal.action,
        fontFamily: "Archivo, system-ui, sans-serif",
        fontSize: SL.TypeSize.meta,
        fontWeight: SL.Weight.semibold,
        flexShrink: 0,
      }}
    >
      {text}
    </Pressable>
  );

  const row = (icon: string, title: string, value: string, detail: string | undefined, action: string, perform: () => void) => (
    <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch", padding: SL.Space.s3 }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: SL.Signal.actionTint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon === "scope" ? <SFSymbol name="target" size={14} weight={600} color={SL.Signal.action} /> : <SFSymbol name={icon} size={14} weight={600} color={SL.Signal.action} />}
      </div>
      <VStack alignment="leading" spacing={1} style={{ minWidth: 0 }}>
        <Text {...slMeta()} color={SL.Ink.secondary}>{title}</Text>
        <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Ink.primary}>{value}</Text>
        {detail !== undefined && <Text {...slMeta()} numerals color={SL.Ink.secondary}>{detail}</Text>}
      </VStack>
      <Spacer minLength={SL.Space.s2} />
      {pill(action, perform)}
    </HStack>
  );

  const badge = (status: EnergyCheck_Status) => {
    const [text, color, symbol] =
      status === "good"
        ? ["On target", SL.Signal.action, "checkmark"]
        : status === "high"
          ? ["Too high", SL.Signal.attention, "arrow.up"]
          : status === "low"
            ? ["Too low", SL.Signal.attention, "arrow.down"]
            : ["No data", SL.Ink.secondary, "minus"];
    return (
      <HStack spacing={4} style={{ padding: "0 8px", minHeight: 24, borderRadius: 999, background: colorOpacity(color, 0.14), flexShrink: 0 }}>
        <SFSymbol name={symbol} size={10} weight={700} color={color} />
        <Text size={SL.TypeSize.micro} weight={SL.Weight.bold} color={color}>{text}</Text>
      </HStack>
    );
  };

  const scienceRow = (title: string, value: string, detail: string, status?: EnergyCheck_Status) => (
    <HStack alignment="top" spacing={SL.Space.s3} style={{ alignSelf: "stretch", padding: SL.Space.s3 }}>
      <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
        <Text {...slMeta()} color={SL.Ink.secondary}>{title}</Text>
        <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Ink.primary}>{value}</Text>
        <Text {...slMeta()} numerals color={SL.Ink.secondary}>{detail}</Text>
      </VStack>
      <Spacer minLength={SL.Space.s2} />
      {status !== undefined && badge(status)}
    </HStack>
  );

  const field = (label: string, value: string, unit: string, placeholder: string, onChange: (v: string) => void) => (
    <VStack alignment="leading" spacing={4} style={{ flex: "1 1 0", minWidth: 0 }}>
      <Text {...slMeta()} color={SL.Ink.secondary}>{label}</Text>
      <label style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 46, padding: `0 ${SL.Space.s3}px`, background: SL.Surface.raised2, borderRadius: SL.Radius.md, width: "100%", boxSizing: "border-box" }}>
        <input
          inputMode="numeric"
          aria-label={label}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          style={{
            flex: "1 1 0",
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            color: SL.Ink.primary,
            caretColor: SL.Signal.action,
            fontFamily: "Archivo, system-ui, sans-serif",
            fontSize: SL.TypeSize.lead,
            fontWeight: SL.Weight.semibold,
          }}
        />
        <Text {...slMeta()} color={SL.Ink.secondary}>{unit}</Text>
      </label>
    </VStack>
  );

  const energy = plan.energy;
  const goalName = goal ? WeightGoal.title(goal).toLowerCase() : "goal";
  const paceWords = goal === "cut" ? "minus 0.5–1 % of your weight a week" : goal === "leanBulk" || goal === "bulk" ? "plus a slow weekly gain" : "held steady";
  const statusWords = (s: EnergyCheck_Status, unknown: string) =>
    s === "good" ? "Inside the range" : s === "high" ? "Above the range for your goal" : s === "low" ? "Below the range for your goal" : unknown;
  const kcalMid = energy ? Math.round((energy.calorieRange.lowerBound + energy.calorieRange.upperBound) / 2) : 0;
  const proteinMid = energy ? Math.round((energy.proteinRange.lowerBound + energy.proteinRange.upperBound) / 2) : 0;
  const weekly = plan.check?.weeklyKg;

  return (
    <>
      <SLSheet title="Your plan" subtitle="Your weight, your goal, and what to eat for it" onClose={onClose}>
        <VStack alignment="leading" spacing={SL.Space.s5} style={{ alignSelf: "stretch" }}>
          {/* The verdict */}
          <HStack
            alignment="top"
            spacing={SL.Space.s3}
            style={{ alignSelf: "stretch", padding: SL.Space.s4, borderRadius: SL.Radius.lg, background: colorOpacity(ink, 0.08), boxShadow: `inset 0 0 0 1px ${colorOpacity(ink, 0.3)}` }}
          >
            <PlanSymbol plan={plan} size={20} box={44} />
            <VStack alignment="leading" spacing={4} style={{ minWidth: 0 }}>
              <Text {...slLead(SL.Weight.bold)} color={SL.Ink.primary}>{NutritionPlan.headline(plan)}</Text>
              <Text {...slBody()} numerals color={SL.Ink.secondary}>{NutritionPlan.sentence(plan)}</Text>
            </VStack>
          </HStack>

          {/* Weight and goal */}
          <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
            <SLOverline text="Weight & goal" />
            <VStack spacing={0} style={{ ...slListCard(), alignSelf: "stretch" }}>
              {row(
                "scalemass.fill",
                "Weight",
                plan.latestKg !== undefined ? `${PlanCopy.kg(plan.latestKg)} kg` : "Not logged yet",
                weekly !== undefined ? `${PlanCopy.signedKg(weekly)} kg a week, last weeks` : undefined,
                app.weighIn() === undefined ? "Log today" : "Edit today",
                () => setWeighing(true),
              )}
              <SLHairline style={{ marginLeft: 52, alignSelf: "stretch" }} />
              {row(
                "scope",
                "Goal",
                goal ? WeightGoal.title(goal) : "No goal yet",
                plan.check ? GoalCheckExt.headline(plan.check) : undefined,
                goal ? "Change" : "Set goal",
                () => setChoosingGoal(true),
              )}
            </VStack>
          </VStack>

          {/* About you */}
          <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
            <SLOverline text="About you" />
            <VStack alignment="leading" spacing={SL.Space.s3} style={{ ...slListCard(), alignSelf: "stretch", padding: SL.Space.s4 }}>
              <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
                {(["male", "female"] as BodyProfile_Sex[]).map((value) => {
                  const on = sex === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => {
                        setSex(value);
                        saveProfile({ sex: value });
                      }}
                      aria-pressed={on}
                      style={{
                        flex: "1 1 0",
                        minHeight: 42,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 999,
                        background: on ? SL.Signal.action : SL.Surface.raised2,
                        color: on ? SL.Signal.onAction : SL.Ink.primary,
                        fontFamily: "Archivo, system-ui, sans-serif",
                        fontSize: SL.TypeSize.body,
                        fontWeight: on ? SL.Weight.semibold : SL.Weight.medium,
                      }}
                    >
                      {BodyProfile.sexLabel(value)}
                    </Pressable>
                  );
                })}
              </HStack>
              <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
                {field("Height", heightText, "cm", "180", (v) => {
                  setHeightText(v);
                  saveProfile({ height: v });
                })}
                {field("Age", ageText, "years", "30", (v) => {
                  setAgeText(v);
                  saveProfile({ age: v });
                })}
              </HStack>
              <Text {...slMeta()} color={SL.Ink.tertiary}>Kept on this device. Used only for the estimate below.</Text>
            </VStack>
          </VStack>

          {/* The science */}
          {energy && (
            <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
              <SLOverline text="What science says for you" />
              <VStack spacing={0} style={{ ...slListCard(), alignSelf: "stretch" }}>
                {scienceRow(
                  "Maintenance",
                  `${PlanCopy.thousands(energy.maintenance)} kcal`,
                  `Resting ${PlanCopy.thousands(energy.bmr)} kcal × ${energy.activityFactor.toFixed(2)} for ${energy.activityLabel.toLowerCase()}`,
                )}
                <SLHairline style={{ alignSelf: "stretch" }} />
                {scienceRow(`Eat for a ${goalName}`, PlanCopy.kcal(energy.calorieRange), `Maintenance ${paceWords}`)}
                <SLHairline style={{ alignSelf: "stretch" }} />
                {scienceRow(
                  "Your calorie target",
                  app.targets ? `${PlanCopy.thousands(app.targets.calories)} kcal` : "None set",
                  statusWords(energy.target, "Set one below, or in Targets"),
                  energy.target,
                )}
                <SLHairline style={{ alignSelf: "stretch" }} />
                {scienceRow(
                  "You ate, last 2 weeks",
                  energy.averageKcal !== undefined ? `${PlanCopy.thousands(energy.averageKcal)} kcal a day` : "Not enough logged",
                  statusWords(energy.intake, "Log 3 days of food to compare"),
                  energy.intake,
                )}
                <SLHairline style={{ alignSelf: "stretch" }} />
                {scienceRow(
                  "Protein",
                  energy.averageProtein !== undefined ? `${energy.averageProtein} g a day` : "Not enough logged",
                  `Aim for ${energy.proteinRange.lowerBound}–${energy.proteinRange.upperBound} g`,
                  energy.protein,
                )}
                <SLHairline style={{ alignSelf: "stretch" }} />
                {scienceRow("BMI", energy.bmi.toFixed(1), `${energy.bmiLabel}. Muscle reads as weight here.`)}
              </VStack>
              {(app.targets?.calories !== kcalMid || app.targets?.protein !== proteinMid) && (
                <div style={{ paddingTop: SL.Space.s2, alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
                  <SLPrimaryButton
                    disabled={applied}
                    onPress={() => {
                      void (async () => {
                        await app.record([
                          StateChange.make({ kind: "setTarget", field: "calories", value: kcalMid }, { createdAt: new Date() }),
                          StateChange.make({ kind: "setTarget", field: "protein", value: proteinMid }, { createdAt: new Date() }),
                        ]);
                        setApplied(true);
                      })();
                    }}
                  >
                    {applied ? "Targets set" : `Use ${PlanCopy.thousands(kcalMid)} kcal and ${proteinMid} g protein as my targets`}
                  </SLPrimaryButton>
                </div>
              )}
              <Text {...slMeta()} color={SL.Ink.tertiary}>
                Estimates are within about 10 % for most people. Your weigh-ins are the final judge: Setline checks them against your goal.
              </Text>
            </VStack>
          )}

          {/* Sources */}
          <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
            <Pressable
              onPress={() => setShowsSources((v) => !v)}
              aria-expanded={showsSources}
              style={{ display: "flex", alignItems: "center", width: "100%", minHeight: SL.Space.hitMin, background: "transparent", padding: 0 }}
            >
              <SLOverline text={`Sources · ${EnergyCheck.sources.length}`} />
              <Spacer />
              <SFSymbol name={showsSources ? "chevron.up" : "chevron.down"} size={12} weight={600} color={SL.Ink.tertiary} />
            </Pressable>
            {showsSources && (
              <VStack alignment="leading" spacing={SL.Space.s3} style={{ ...slListCard(), alignSelf: "stretch", padding: SL.Space.s4 }}>
                {EnergyCheck.sources.map((source) => (
                  <VStack key={source.id} alignment="leading" spacing={2}>
                    <Text {...slMeta()} color={SL.Ink.primary}>{source.claim}</Text>
                    <Text size={SL.TypeSize.micro} weight={SL.Weight.medium} color={SL.Ink.tertiary}>{source.citation}</Text>
                  </VStack>
                ))}
              </VStack>
            )}
          </VStack>
        </VStack>
      </SLSheet>

      <Sheet isPresented={choosingGoal} onDismiss={() => setChoosingGoal(false)}>
        {choosingGoal && (
          <GoalSheet
            latestKg={plan.latestKg}
            onPick={(picked) => {
              GoalPreference.goal = picked;
              setGoal(picked);
              setChoosingGoal(false);
              void NutritionReminders.update(app);
            }}
            onClose={() => setChoosingGoal(false)}
          />
        )}
      </Sheet>
      <Sheet isPresented={weighing} onDismiss={() => setWeighing(false)}>
        {weighing && (
          <WeighInSheet
            date={new Date()}
            existing={app.weighIn()}
            latest={plan.latestKg}
            onSave={(weight) => {
              setWeighing(false);
              void app.saveWeighIn(weight);
            }}
            onClose={() => setWeighing(false)}
          />
        )}
      </Sheet>
    </>
  );
}
