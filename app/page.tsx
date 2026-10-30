"use client";
/* eslint-disable @next/next/no-img-element -- private R2 and local blob URLs are intentionally rendered directly */

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { AuthGate } from "./auth-gate";
import { signOutEverywhere } from "./auth/supabase-auth";
import { clearCloudState, loadCloudState, saveCloudState } from "@/lib/cloud-state";
import { refinishSession } from "@/lib/refinish-session";
import { estimate1RM } from "@/lib/one-rep-max";
import { boundPausedReps, completedReps, pausedReps, setSummary } from "@/lib/set-reps";
import { clearOnboarded } from "./auth-gate";
import { dateKey, datesInWeek, parseDateKey, startOfWeek } from "@/lib/week";
import {
  bestSetsSince,
  defaultSetValues,
  estimateSessionMinutes,
  formatKg,
  formatThousands,
  isLoggedSet,
  isoWeek,
  parseRestSeconds,
  sessionVolumeKg,
  summarizeSets,
  trailingAverage,
  weeklyVolume,
} from "@/lib/setline-log";
import {
  CategoryGlyph,
  IconBarbell,
  IconCalendar,
  IconCamera,
  IconCameraSmall,
  IconChart,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconDone,
  IconFork,
  IconImage,
  IconMoon,
  IconPlates,
  IconPlay,
  IconPlus,
  PlateStack,
  RestPill,
  SessionClock,
  Sheet,
  Stepper,
  VolumeBars,
  WeightChart,
  useElementHeight,
  type CategoryKind,
  type RestTimerState,
} from "./setline-ui";
import {
  ArrowRightLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  ExternalLink,
  LoaderCircle,
  LogOut,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  PackageSearch,
  Save,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  TrendingUp,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Exercise = {
  id: string;
  name: string;
  prescription: string;
  load: string;
  rest: string;
};

type WorkoutDay = {
  id: string;
  label: string;
  short: string;
  focus: string;
  exercises: Exercise[];
};

type PlanMode = "personal" | "science";

type SciencePlanId = "ppl-ul" | "upper-lower" | "full-body";

type CanonicalDayId = "push" | "pull" | "legs" | "lower" | "upper" | "rest";

type SciencePlanDefinition = {
  id: SciencePlanId;
  label: string;
  daysLabel: string;
  summary: string;
  frequency: string;
  distribution: string;
  comparison: string;
  plan: WorkoutDay[];
  slots: CanonicalDayId[];
  slotMap: Partial<Record<CanonicalDayId, string>>;
  schedule: Record<number, CanonicalDayId>;
};

type ScheduleOverrides = Record<string, CanonicalDayId>;

type SetResult = {
  weight: string;
  reps: string;
  pausedReps?: string;
  pauseSeconds?: string;
  pauseEnabled?: boolean;
};

type ExerciseLog = {
  sets: SetResult[];
  note: string;
};

type Performance = Record<string, ExerciseLog>;

type Session = {
  id: string;
  date: string;
  dayId: string;
  dayLabel: string;
  completion: number;
  sessionType?: "workout" | "recovery";
  results: Array<{
    exerciseId: string;
    name: string;
    sets?: SetResult[];
    weight?: string;
    reps?: string;
    recoveryDetail?: string;
  }>;
  recovery?: {
    sleep: string;
    soreness: string;
    energy: string;
    note: string;
    activities: Array<{
      id: string;
      name: string;
      dose: string;
    }>;
  };
};

type RecoveryDraft = {
  date: string;
  sleep: string;
  soreness: string;
  energy: string;
  note: string;
  completedIds: string[];
};

type RecoveryActivity = {
  id: string;
  category: string;
  name: string;
  dose: string;
  detail: string;
  tone: "calves" | "shoulders" | "mobility" | "cardio";
};

type Metric = {
  id: string;
  date: string;
  weight: number;
  waist?: number;
};

type ProgressPhoto = {
  id: string;
  capturedOn: string;
  weight: number;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  imageUrl: string;
};

type SetSignal = {
  metric: string;
  label: string;
  tone: "good" | "ready" | "neutral";
};

type StrengthTrendPoint = {
  label: string;
  value: number;
  weight: number;
  reps: number;
  current?: boolean;
};

type LegacyNutrition = {
  date: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
};

type MealType = "Ontbijt" | "Lunch" | "Pre-workout" | "Avondeten" | "Snack";

type MealIdeaType = Extract<MealType, "Ontbijt" | "Lunch" | "Avondeten">;

type MealIdea = {
  id: string;
  meal: MealIdeaType;
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type NutritionEntry = {
  id: string;
  date: string;
  meal: MealType;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type NutritionDraft = {
  meal: MealType;
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
};

type FoodSearchResult = {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: "Open Food Facts" | "Generiek";
  sourceNote: string;
};

type Targets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type PlanChange = {
  exerciseId: string;
  field: "name" | "prescription" | "load" | "rest";
  value: string;
  reason: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  changes?: PlanChange[];
  applied?: boolean;
};

type AccountUser = {
  email: string;
  displayName: string;
};

type SyncStatus = "connecting" | "saving" | "synced" | "offline";

type StoredState = {
  plan?: WorkoutDay[];
  planMode?: PlanMode;
  sciencePlanId?: SciencePlanId;
  planSchemaVersion?: number;
  scheduleOverrides?: ScheduleOverrides;
  completed?: Record<string, boolean>;
  performance?: unknown;
  sessions?: Session[];
  metrics?: Metric[];
  targets?: Targets;
  nutrition?: LegacyNutrition;
  nutritionEntries?: NutritionEntry[];
  chatMessages?: ChatMessage[];
  recoveryDraft?: RecoveryDraft;
  updatedAt?: string;
};

type ExerciseGuide = {
  warmup: string;
  progression: string;
  advanceAt?: number;
};

type ExerciseAlternative = {
  name: string;
  fit: string;
  why: string;
};

const STORAGE_KEY = "yascha-training-v1";

/**
 * A workout in progress, on this device only: the running rest, when the
 * session started and the bar the plates calculator assumes. It never syncs —
 * a timer belongs to the phone it is running on — and it survives a reload or
 * a trip to another tab, which is what keeps the rest timer persistent.
 */
const LIVE_STORAGE_KEY = "setline-live-v1";

type LiveSession = { key: string; startedAt: number };

type LiveState = { rest: RestTimerState | null; session: LiveSession | null; bar: number };

/** Rests that ended long ago and sessions from yesterday are not "live". */
function readLiveState(now: number): LiveState {
  try {
    const raw = window.localStorage.getItem(LIVE_STORAGE_KEY);
    const parsed = (raw ? JSON.parse(raw) : {}) as Partial<LiveState>;
    const rest = parsed.rest
      && [parsed.rest.endsAt, parsed.rest.total, parsed.rest.planned].every(Number.isFinite)
      && parsed.rest.endsAt > now - 10 * 60_000
      ? parsed.rest
      : null;
    const session = parsed.session
      && typeof parsed.session.key === "string"
      && Number.isFinite(parsed.session.startedAt)
      && now - parsed.session.startedAt < 12 * 3_600_000
      ? parsed.session
      : null;
    return { rest, session, bar: parsed.bar === 15 ? 15 : 20 };
  } catch {
    return { rest: null, session: null, bar: 20 };
  }
}

/** The numbers on the steppers before they are saved as a set. */
type StepDraft = {
  key: string;
  weight: number | null;
  reps: number | null;
  pauseEnabled: boolean;
  pausedReps: number | null;
  pauseSeconds: number | null;
};

/** The word behind a day's title: PUSH, PULL, LEGS, UPPER, LOWER, FULL, RUST. */
function letterForTemplate(template: { id: string; short: string }) {
  if (template.id === "rest") return "RUST";
  return (template.short.split(/\s+/)[0] ?? "").toUpperCase();
}

function categoryForTemplate(template: { id: string; short: string }): CategoryKind {
  if (template.id === "rest") return "rest";
  const word = (template.short.split(/\s+/)[0] ?? "").toLowerCase();
  if (word === "push" || word === "pull" || word === "legs" || word === "upper" || word === "lower") return word;
  return "full";
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

const GUIDANCE: Record<string, ExerciseGuide> = {
  "flat-bench": {
    warmup: "Stang×15 → 60×8 → 80×5 → 100×3 → 110×1. Geen set tot falen.",
    progression: "120 kg×6 met RIR 1 in 2 sessies? Ga naar 122,5 kg voor 4–6; back-offs pas verhogen wanneer beide 8 halen.",
    advanceAt: 6,
  },
  "upper-paused-bench": {
    warmup: "Stang×10 → 60×5 → 80×3 → 100×1 met 2 sec pauze. Alles ruim voor falen.",
    progression: "Alle 3 sets 6 met een echte 2 sec borstpauze en RIR 2 in 2 sessies? Voeg 2,5 kg toe en start opnieuw bij 4–5 reps.",
    advanceAt: 6,
  },
  "incline-bench": {
    warmup: "Stang×12 → 60×6 → 80×3 → 90×1. Na flat bench volstaan meestal de laatste 2 stappen.",
    progression: "100 kg×6 in 2 sessies? Verhoog naar 102,5 kg. Eerst alle back-offs op 8 krijgen.",
    advanceAt: 6,
  },
  "pec-fly": {
    warmup: "1 lichte set van 15 met volledige stretch; niet vermoeien.",
    progression: "Beide sets 15 technisch zuiver? Volgende plaatje en terug naar 10–12 reps.",
    advanceAt: 15,
  },
  "push-shoulder": {
    warmup: "2 oplopende sets: ongeveer 50%×10 en 70%×4.",
    progression: "Beide sets 10 met RIR 1? Kleinste gewichtsstap verhogen.",
    advanceAt: 10,
  },
  "upper-shoulder": {
    warmup: "1–2 oplopende sets: ongeveer 50%×10 en 70%×4.",
    progression: "Beide sets 12 met RIR 1? Kleinste gewichtsstap verhogen.",
    advanceAt: 12,
  },
  "push-lateral": { warmup: "1 zeer lichte set van 15–20.", progression: "Alle 4 sets 20 zonder zwaaien? Kleinste stap verhogen en terug naar 12–15.", advanceAt: 20 },
  "legs-lateral": { warmup: "Geen extra set nodig na eerdere schoudertraining; start gecontroleerd.", progression: "Alle 3 sets 20 strikt? Kleinste stap verhogen.", advanceAt: 20 },
  "upper-lateral": { warmup: "1 zeer lichte set van 15–20.", progression: "Alle 3 sets 20 strikt? Kleinste stap verhogen.", advanceAt: 20 },
  "overhead-triceps": { warmup: "1 lichte set van 12–15 om ellebogen warm te maken.", progression: "3×15 met dezelfde ROM? Eén kabelstap verhogen.", advanceAt: 15 },
  pressdown: { warmup: "1 lichte set van 15.", progression: "Beide sets 12 met RIR 1? Eén kabelstap verhogen.", advanceAt: 12 },
  "upper-pressdown": { warmup: "Meestal geen aparte opwarming nodig na presses.", progression: "Beide sets 15? Eén kabelstap verhogen.", advanceAt: 15 },
  "pull-up": { warmup: "Scapular pull-up×8 → bodyweight×5 → +5 kg×3.", progression: "3×8 met +10 kg in 2 sessies? Ga naar +12,5 kg en mik opnieuw op 5–6.", advanceAt: 8 },
  "lat-pulldown": { warmup: "40 kg×10 → 60 kg×5 → 75 kg×2.", progression: "86 kg×6 én back-off 82 kg×10 in 2 sessies? Verhoog top- en back-offset één stap.", advanceAt: 6 },
  "neutral-row": { warmup: "50 kg×10 → 70 kg×5 → 80 kg×2.", progression: "Alle 3 sets 10 rond 90 kg? Verhoog 2,5–5 kg en begin weer bij 6–8.", advanceAt: 10 },
  "wide-row": { warmup: "1 lichte set van 10; je rug is al warm van de neutral row.", progression: "Beide sets 12 zonder schouders op te trekken? Kleinste stap verhogen.", advanceAt: 12 },
  "upper-wide-row": { warmup: "50%×10 → 70%×4.", progression: "3×12 met dezelfde borstpositie? Kleinste stap verhogen.", advanceAt: 12 },
  "reverse-pec": { warmup: "1 lichte set van 15.", progression: "3×20 zonder momentum? Eén plaatje verhogen.", advanceAt: 20 },
  "rear-delt": { warmup: "Geen extra set nodig na rows; begin licht.", progression: "Beide sets 20 zuiver? Eén plaatje verhogen.", advanceAt: 20 },
  "strict-curl": {
    warmup: "8 kg×12 → 12 kg×6 → 16 kg×3; alles ver van falen.",
    progression: "18 kg pas verhogen nadat je 10 strikt gecontroleerde reps in 2 opeenvolgende sessies haalt. Dan 20 kg voor 5–7; geen heupzwaai.",
    advanceAt: 10,
  },
  "hammer-curl": { warmup: "1 lichte set van 8–10; biceps zijn al warm.", progression: "Beide sets 12 zonder zwaaien? Ga 2 kg omhoog en mik op 8.", advanceAt: 12 },
  "cable-curl": { warmup: "Geen aparte opwarming nodig na je rugwerk.", progression: "Beide sets 15? Eén kabelstap verhogen.", advanceAt: 15 },
  "hack-squat": { warmup: "5 min fiets → lege machine×12 → 40%×8 → 60%×5 → 75%×2.", progression: "3×10 op dezelfde diepte en RIR 1–2? Voeg 5–10 kg totaal toe.", advanceAt: 10 },
  bulgarian: { warmup: "Bodyweight×8 per been → 1 lichte dumbbellset×5.", progression: "3×12 per been stabiel? Voeg de kleinste dumbbellstap toe.", advanceAt: 12 },
  "seated-curl": { warmup: "1 lichte set van 12–15.", progression: "3×12 met volledige kniebuiging? Eén plaatje verhogen.", advanceAt: 12 },
  "leg-extension": { warmup: "1 lichte, pijnvrije set van 15.", progression: "Beide sets 15 zonder knie-irritatie? Eén plaatje verhogen.", advanceAt: 15 },
  "standing-calf": { warmup: "Bodyweight×15 met 2 sec stretch onderaan.", progression: "4×15 met volledige ROM? Kleinste stap verhogen.", advanceAt: 15 },
  "cable-crunch": { warmup: "1 lichte set van 10 om de beweging te voelen.", progression: "3×15 zonder heupbeweging? Eén kabelstap verhogen.", advanceAt: 15 },
  rdl: { warmup: "Stang×10 → 40%×8 → 60%×5 → 75%×2.", progression: "3×10 met neutrale rug en dezelfde hamstringstretch? Voeg 5 kg toe.", advanceAt: 10 },
  "leg-press": { warmup: "Lege slee×12 → 50%×8 → 70%×4.", progression: "3×15 op dezelfde diepte? Voeg 5–10 kg totaal toe.", advanceAt: 15 },
  "hip-thrust": { warmup: "Bodyweight bridge×12 → 50%×8 → 70%×4.", progression: "Beide sets 12 met 1 sec lock-out? Voeg 5 kg toe.", advanceAt: 12 },
  "lying-curl": { warmup: "1 lichte set van 12–15.", progression: "3×15 met volledige ROM? Eén plaatje verhogen.", advanceAt: 15 },
  "seated-calf": { warmup: "1 lichte set van 15 met trage stretch.", progression: "3×20 met volledige ROM? Kleinste stap verhogen.", advanceAt: 20 },
  "hanging-raise": { warmup: "Dead hang 20 sec → 6 rustige knee raises.", progression: "3×15 zonder zwaaien? Ga naar gestrekte benen of voeg licht gewicht toe.", advanceAt: 15 },
  "incline-machine": { warmup: "50%×10 → 70%×4.", progression: "3×12 met RIR 1–2? Eén machinestap verhogen.", advanceAt: 12 },
  "kneeling-lat": { warmup: "1 lichte set per kant van 10.", progression: "Beide kanten 15 met volledige stretch? Eén kabelstap verhogen.", advanceAt: 15 },
  "upper-fly": { warmup: "1 lichte set van 12.", progression: "Beide sets 15 met controle? Eén plaatje verhogen.", advanceAt: 15 },
  "science-lateral": { warmup: "1 zeer lichte set van 15–20.", progression: "3×20 strikt in 2 sessies? Verhoog de kleinste kabelstap.", advanceAt: 20 },
  "science-preacher": { warmup: "1–2 lichte sets van 10 en 5 reps.", progression: "3×12 zonder schouderbeweging in 2 sessies? Verhoog de kleinste stap.", advanceAt: 12 },
};

const DEFAULT_GUIDE: ExerciseGuide = {
  warmup: "1–2 lichte oplopende sets zonder vermoeidheid.",
  progression: "Haal alle voorgeschreven sets aan de bovengrens in 2 sessies; verhoog daarna de kleinste stap.",
};

const ALTERNATIVES: Record<string, ExerciseAlternative[]> = {
  "flat-bench": [
    { name: "Dumbbell bench press", fit: "Zelfde rol", why: "Horizontale press met grote ROM; behoud sets, reps en RIR maar reset het gewicht." },
    { name: "Converging chest press", fit: "Stabieler", why: "Zelfde borst- en tricepsdoel met minder stabiliteitsvraag. Handig als alle benches bezet zijn." },
  ],
  "upper-paused-bench": [
    { name: "Flat bench press", fit: "Zonder pauze", why: "Behoud dezelfde press en belasting, maar laat 1–2 reps extra in reserve omdat dit je tweede benchmoment is." },
    { name: "Dumbbell bench press", fit: "Minder specifiek", why: "Goede horizontale press wanneer de bench bezet is; behoud 3 sets en werk in 6–10 reps." },
  ],
  "incline-bench": [
    { name: "Incline dumbbell press", fit: "Zelfde patroon", why: "Schuine press met vrije armpositie en diepe, controleerbare borststretch." },
    { name: "Incline chest-pressmachine", fit: "Zelfde rol", why: "Meer stabiliteit; daardoor kun je dicht bij falen trainen zonder spotter." },
  ],
  "incline-machine": [
    { name: "Incline dumbbell press", fit: "Sterke match", why: "Behoudt de schuine press en bovenborstfocus; start conservatief met het gewicht." },
    { name: "Low-to-high cable press", fit: "Apparaatvrij", why: "Vergelijkbare pressrichting en constante kabelspanning, met lagere absolute belasting." },
  ],
  "pec-fly": [
    { name: "Cable fly", fit: "Zelfde isolatie", why: "Horizontale adductie met instelbare lijn; behoud de 10–15 rep-range." },
    { name: "Dumbbell fly", fit: "Redelijke match", why: "Vergelijkbaar doel, maar minder spanning bovenaan. Gebruik licht gewicht en gecontroleerde ROM." },
  ],
  "upper-fly": [
    { name: "Pec-deck", fit: "Sterke match", why: "Stabiele borstisolatie; makkelijk progressief te loggen en dicht bij falen te trainen." },
    { name: "Cable fly", fit: "1-op-1", why: "Behoud dezelfde lijn, rep-range en volledige pijnvrije ROM." },
  ],
  "push-shoulder": [
    { name: "Seated dumbbell press", fit: "Zelfde patroon", why: "Verticale press met vrije armpositie; verlaag het startgewicht en behoud RIR 1–2." },
    { name: "Smith shoulder press", fit: "Stabiele match", why: "Verticale press met minder stabiliteitsvraag en voorspelbare progressie." },
  ],
  "upper-shoulder": [
    { name: "Seated dumbbell press", fit: "Zelfde patroon", why: "Verticale press en vergelijkbare doelspieren; reset de belasting." },
    { name: "Smith shoulder press", fit: "Stabiele match", why: "Handig om veilig dicht bij falen te trainen met dezelfde rep-range." },
  ],
  "push-lateral": [
    { name: "Machine lateral raise", fit: "Sterke match", why: "Zelfde schouderabductie met extra stabiliteit; behoud 12–20 reps." },
    { name: "Dumbbell lateral raise", fit: "Praktische swap", why: "Zelfde doelspier, maar een andere weerstandscurve. Gebruik strikte techniek." },
  ],
  "legs-lateral": [
    { name: "Machine lateral raise", fit: "Sterke match", why: "Zelfde schouderabductie met minder coördinatievraag." },
    { name: "Dumbbell lateral raise", fit: "Praktische swap", why: "Behoud hoge reps en stop zodra je moet zwaaien." },
  ],
  "upper-lateral": [
    { name: "Machine lateral raise", fit: "Sterke match", why: "Zelfde doel en eenvoudige progressie in de 12–20 rep-range." },
    { name: "Dumbbell lateral raise", fit: "Praktische swap", why: "Zelfde doelspier; vergelijk het dumbbellgewicht niet met de kabelbelasting." },
  ],
  "science-lateral": [
    { name: "Machine lateral raise", fit: "Sterke match", why: "Stabiel alternatief dat je dicht bij falen kunt uitvoeren." },
    { name: "Dumbbell lateral raise", fit: "Praktische swap", why: "Zelfde doelspier met een andere weerstandscurve; behoud strikte reps." },
  ],
  "overhead-triceps": [
    { name: "Overhead dumbbell extension", fit: "Zelfde armpositie", why: "Behoudt schouderflexie en tricepstraining op lange spierlengte." },
    { name: "EZ-bar skull crusher", fit: "Sterke match", why: "Vergelijkbare elleboogextensie; kies een pijnvrije hoek en gecontroleerde excentrische fase." },
  ],
  pressdown: [
    { name: "Single-arm cable pressdown", fit: "1-op-1", why: "Zelfde elleboogextensie en rep-range, met vrije polspositie." },
    { name: "Machine dip", fit: "Compound swap", why: "Meer borst- en schouderbijdrage; gebruik hem alleen als je een compound wilt." },
  ],
  "upper-pressdown": [
    { name: "Single-arm cable pressdown", fit: "1-op-1", why: "Zelfde doel met vrije polspositie en afzonderlijke armen." },
    { name: "Cross-body cable extension", fit: "Sterke match", why: "Zelfde elleboogfunctie; makkelijk pijnvrij af te stellen." },
  ],
  "pull-up": [
    { name: "Neutral-grip lat pulldown", fit: "Zelfde verticale pull", why: "Vergelijkbare lat- en armfunctie, maar makkelijker exact te doseren." },
    { name: "Assisted pull-up", fit: "1-op-1 patroon", why: "Behoudt de pull-upbeweging wanneer bodyweight of extra gewicht niet past." },
  ],
  "lat-pulldown": [
    { name: "Neutral-grip pull-up", fit: "Zelfde verticale pull", why: "Behoudt de richting en grote ROM; log de extra belasting apart." },
    { name: "Single-arm cable pulldown", fit: "Unilaterale match", why: "Zelfde schouderextensie met meer vrijheid voor elleboogbaan en stretch." },
  ],
  "kneeling-lat": [
    { name: "Single-arm seated pulldown", fit: "1-op-1", why: "Zelfde unilaterale latfunctie met extra rompstabiliteit." },
    { name: "Neutral-grip pulldown", fit: "Sterke match", why: "Bilaterale verticale pull die eenvoudiger te laden is." },
  ],
  "neutral-row": [
    { name: "Neutral cable row", fit: "Zelfde trekbaan", why: "Horizontale pull met vergelijkbare elleboogbaan; houd je romp stabiel." },
    { name: "Chest-supported dumbbell row", fit: "Sterke match", why: "Zelfde rugdoel zonder onderrug als limiterende factor." },
  ],
  "wide-row": [
    { name: "Wide cable row", fit: "Zelfde trekbaan", why: "Elleboog naar buiten voor bovenrug en rear delts; behoud borstpositie." },
    { name: "Chest-supported rear-delt row", fit: "Sterke match", why: "Vergelijkbare bovenrugfocus met dumbbells en een vaste bank." },
  ],
  "upper-wide-row": [
    { name: "Wide cable row", fit: "Zelfde trekbaan", why: "Behoudt de horizontale pull en bovenrugfocus." },
    { name: "Chest-supported dumbbell row", fit: "Sterke match", why: "Stabiele horizontale pull zonder extra belasting voor je onderrug." },
  ],
  "reverse-pec": [
    { name: "Cable rear-delt fly", fit: "Zelfde isolatie", why: "Zelfde doelspier en controleerbare lijn; behoud 12–20 reps." },
    { name: "Chest-supported rear-delt row", fit: "Meer compound", why: "Vergelijkbaar rear-deltdoel met extra bovenrugbijdrage." },
  ],
  "rear-delt": [
    { name: "Reverse pec deck", fit: "Sterke match", why: "Stabiele rear-deltisolatie die eenvoudig progressief te laden is." },
    { name: "Cable rear-delt fly", fit: "Zelfde isolatie", why: "Vrije kabelrichting en constante spanning; behoud hoge reps." },
  ],
  "strict-curl": [
    { name: "Bayesian cable curl", fit: "Zelfde armdoel", why: "Bicepstraining met spanning in een verlengde positie; reset het gewicht." },
    { name: "Incline dumbbell curl", fit: "Sterke match", why: "Vrije dumbbellvariant met weinig ruimte voor momentum." },
  ],
  "science-preacher": [
    { name: "Machine preacher curl", fit: "1-op-1", why: "Zelfde gestabiliseerde bovenarm en eenvoudige progressie." },
    { name: "Spider curl", fit: "Sterke match", why: "Beperkt momentum, maar heeft een andere weerstandscurve." },
  ],
  "hammer-curl": [
    { name: "Rope hammer curl", fit: "1-op-1 greep", why: "Neutrale greep en dezelfde armflexoren met constante kabelspanning." },
    { name: "Cross-body hammer curl", fit: "Sterke match", why: "Zelfde neutrale greep, één arm tegelijk en weinig setup." },
  ],
  "cable-curl": [
    { name: "Machine preacher curl", fit: "Stabiele match", why: "Zelfde bicepsdoel en eenvoudig dicht bij falen te trainen." },
    { name: "Incline dumbbell curl", fit: "Vrije variant", why: "Behoudt een lange spierlengte, maar reset de belasting." },
  ],
  "hack-squat": [
    { name: "Leg press", fit: "Zelfde kniefocus", why: "Stabiele quad-dominante compound; match diepte en RIR, niet het absolute gewicht." },
    { name: "Heel-elevated Smith squat", fit: "Sterke match", why: "Grote knieflexie en vaste baan; kies een pijnvrije stance." },
  ],
  bulgarian: [
    { name: "Reverse lunge", fit: "Unilaterale match", why: "Zelfde benen één voor één, vaak iets eenvoudiger te balanceren." },
    { name: "Single-leg press", fit: "Stabieler", why: "Behoudt unilaterale belasting met minder stabiliteitsvraag." },
  ],
  "seated-curl": [
    { name: "Single-leg seated curl", fit: "1-op-1", why: "Zelfde heuphoek en kniebuiging, met afzonderlijke benen." },
    { name: "Lying leg curl", fit: "Zelfde functie", why: "Kniebuiging blijft gelijk, maar de hamstrings starten minder verlengd." },
  ],
  "lying-curl": [
    { name: "Seated leg curl", fit: "Sterke hypertrofieswap", why: "De heupbuiging traint hamstrings langer; een studie vond meer groei dan prone curls." },
    { name: "Nordic hamstring curl", fit: "Zwaardere swap", why: "Kniebuiging met sterke excentrische belasting; gebruik assistentie om de rep-range haalbaar te maken." },
  ],
  "leg-extension": [
    { name: "Sissy squat machine", fit: "Quad-isolatie", why: "Veel knieflexie met weinig heupbijdrage; alleen in pijnvrije ROM." },
    { name: "Reverse Nordic", fit: "Bodyweight swap", why: "Quad-dominant alternatief; schaal de ROM en gebruik controle." },
  ],
  rdl: [
    { name: "Dumbbell Romanian deadlift", fit: "1-op-1 patroon", why: "Dezelfde hip hinge en hamstringstretch. Behoud sets/reps/RIR, maar reset het gewicht." },
    { name: "Assisted Nordic hamstring curl", fit: "Zelfde doel, ander patroon", why: "Een RCT uit 2025 vond vergelijkbare hamstringarchitectuur en -groei als bij eccentrische RDL-training; hij vervangt niet de glute- en hingeprikkel." },
  ],
  "leg-press": [
    { name: "Hack squat", fit: "Zelfde kniefocus", why: "Stabiele compound met grote knieflexie; vergelijk inspanning en ROM, niet kilo’s." },
    { name: "Heel-elevated Smith squat", fit: "Sterke match", why: "Quad-dominante squat met vaste baan en voorspelbare progressie." },
  ],
  "hip-thrust": [
    { name: "Smith glute bridge", fit: "Zelfde verkorte positie", why: "Horizontale heupextensie met stabiele lock-out en minder setup." },
    { name: "45° hip extension", fit: "Zelfde heupfunctie", why: "Train glutes en hamstrings via heupextensie; rond niet door je onderrug om de rep af te maken." },
  ],
  "standing-calf": [
    { name: "Leg-press calf raise", fit: "Gestrekte-knie match", why: "Zelfde gastrocnemiusbias en makkelijke progressie met volledige stretch." },
    { name: "Single-leg standing calf raise", fit: "Unilaterale match", why: "Zelfde kniestand met minder totaalgewicht nodig." },
  ],
  "seated-calf": [
    { name: "Bent-knee calf raise op leg press", fit: "Soleusmatch", why: "Gebogen knie behoudt de soleusfocus; train door volledige ROM." },
    { name: "Dumbbell seated calf raise", fit: "Praktische swap", why: "Zelfde kniestand wanneer de machine bezet is; voeg gewicht stabiel toe." },
  ],
  "cable-crunch": [
    { name: "Machine crunch", fit: "Zelfde rompflexie", why: "Stabiel alternatief dat eenvoudig progressief te laden is." },
    { name: "Weighted decline crunch", fit: "Vrije variant", why: "Zelfde dynamische buikfunctie; houd de belasting tegen je borst." },
  ],
  "hanging-raise": [
    { name: "Captain's-chair knee raise", fit: "Stabieler", why: "Zelfde bekkenkanteling met minder grip als limiterende factor." },
    { name: "Reverse crunch", fit: "Vloervariant", why: "Behoud de bekkenbeweging en voeg pas reps toe zonder zwaai." },
  ],
};

const STARTER_CHAT: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Vraag me iets over je gelogde trainingen, progressie of calorieën. Ik stel wijzigingen eerst voor; jij beslist of ze in je schema komen.",
  },
];

const WORKING_SETS: Record<string, number> = {
  "flat-bench": 3,
  "upper-paused-bench": 3,
  "incline-bench": 3,
  "pec-fly": 2,
  "push-shoulder": 2,
  "push-lateral": 4,
  "overhead-triceps": 3,
  pressdown: 2,
  "pull-up": 3,
  "lat-pulldown": 2,
  "neutral-row": 3,
  "wide-row": 2,
  "reverse-pec": 3,
  "strict-curl": 3,
  "hammer-curl": 2,
  "hack-squat": 3,
  bulgarian: 3,
  "seated-curl": 3,
  "leg-extension": 2,
  "standing-calf": 4,
  "legs-lateral": 3,
  "cable-crunch": 3,
  rdl: 3,
  "leg-press": 3,
  "hip-thrust": 2,
  "lying-curl": 3,
  "seated-calf": 3,
  "hanging-raise": 3,
  "incline-machine": 3,
  "upper-wide-row": 3,
  "kneeling-lat": 2,
  "upper-shoulder": 2,
  "upper-fly": 2,
  "upper-lateral": 3,
  "rear-delt": 2,
  "cable-curl": 2,
  "upper-pressdown": 2,
};

function emptySetForExercise(exerciseId: string): SetResult {
  return exerciseId === "upper-paused-bench"
    ? { weight: "", reps: "", pausedReps: "", pauseSeconds: "2", pauseEnabled: true }
    : { weight: "", reps: "" };
}

function emptySetsForExercise(exerciseId: string, count: number): SetResult[] {
  return Array.from({ length: count }, () => emptySetForExercise(exerciseId));
}

function normalizePerformance(raw: unknown): Performance {
  if (!raw || typeof raw !== "object") return {};
  const normalized: Performance = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const log = value as {
      sets?: SetResult[];
      weight?: string;
      reps?: string;
      note?: string;
    };
    normalized[key] = {
      sets: Array.isArray(log.sets)
        ? log.sets.map((set) => ({
            weight: String(set.weight ?? ""),
            reps: String(set.reps ?? ""),
            pausedReps: String(set.pausedReps ?? ""),
            pauseSeconds: String(set.pauseSeconds ?? ""),
            pauseEnabled: Boolean(
              set.pauseEnabled || set.pausedReps || set.pauseSeconds,
            ),
          }))
        : [{ weight: String(log.weight ?? ""), reps: String(log.reps ?? "") }],
      note: String(log.note ?? ""),
    };
  }
  return normalized;
}

function resultSets(result: Session["results"][number]): SetResult[] {
  if (Array.isArray(result.sets)) return result.sets;
  return [{ weight: result.weight ?? "", reps: result.reps ?? "" }];
}

function progressionTargets(prescription: string) {
  const targets: number[] = [];
  const pattern = /(\d+)×(?:\d+–)?(\d+)/g;
  for (const match of prescription.matchAll(pattern)) {
    const count = Number(match[1]);
    const target = Number(match[2]);
    for (let index = 0; index < count; index += 1) targets.push(target);
  }
  return targets;
}

function bestStrengthSet(sets: SetResult[]) {
  return sets.reduce<{
    value: number;
    weight: number;
    reps: number;
  } | null>((best, set) => {
    const weight = numberValue(set.weight);
    const reps = completedReps(set);
    if (!weight || !reps) return best;
    const value = estimate1RM(weight, reps);
    if (value === null) return best;
    return !best || value > best.value ? { value, weight, reps } : best;
  }, null);
}

/**
 * Photo requests reach a backend that does not exist on every deployment, so a
 * failure often arrives as an HTML error page parsed as JSON — which surfaced
 * to the user as: Unexpected token '<', "<!doctype "... is not valid JSON.
 * Messages this app wrote are shown as-is; anything else is named in terms of
 * what went wrong and what to do about it.
 */
function photoErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  const message = error.message.toLowerCase();
  if (
    message.includes("json") ||
    message.includes("unexpected token") ||
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("networkerror")
  ) {
    return "We krijgen geen antwoord van de fotoservice. Check je verbinding en probeer het zo opnieuw.";
  }
  return error.message;
}

function recoveryLevelLabel(field: keyof typeof RECOVERY_SCALE, value: string) {
  return RECOVERY_SCALE[field].find((option) => option.value === value)?.label ?? "Niet ingevuld";
}

const PAUSED_BENCH_EXERCISE: Exercise = {
  id: "upper-paused-bench",
  name: "Paused bench press",
  prescription: "3×4–6",
  load: "105–110 kg · 2 sec pauze · RIR 2",
  rest: "4 min",
};

const DEFAULT_PLAN: WorkoutDay[] = [
  {
    id: "push",
    label: "Maandag · Push",
    short: "Push",
    focus: "Zware borst · schouders · triceps",
    exercises: [
      { id: "flat-bench", name: "Flat bench press", prescription: "1×5–6 + 2×6–8", load: "120 kg → 105–110 kg", rest: "4–5 min" },
      { id: "incline-bench", name: "Incline bench press", prescription: "1×4–6 + 2×6–8", load: "100 kg → 90–95 kg", rest: "3–4 min" },
      { id: "pec-fly", name: "Pec-flymachine", prescription: "2×10–15", load: "50–60 kg · RIR 1–2", rest: "90 sec" },
      { id: "push-shoulder", name: "Machine shoulder press", prescription: "2×6–10", load: "RIR 1–2", rest: "2–3 min" },
      { id: "push-lateral", name: "Cable lateral raise", prescription: "4×12–20", load: "Strikt", rest: "60–90 sec" },
      { id: "overhead-triceps", name: "Overhead cable extension", prescription: "3×10–15", load: "RIR 1", rest: "90 sec" },
      { id: "pressdown", name: "Triceps pressdown", prescription: "2×8–12", load: "RIR 1", rest: "90 sec" },
    ],
  },
  {
    id: "pull",
    label: "Dinsdag · Pull",
    short: "Pull",
    focus: "Latbreedte · rugdikte · biceps",
    exercises: [
      { id: "pull-up", name: "Weighted pull-up", prescription: "3×5–8", load: "+10 kg", rest: "3–4 min" },
      { id: "lat-pulldown", name: "Vertical lat pulldown", prescription: "1×5–6 + 1×8–10", load: "86 kg → 78–82 kg", rest: "2–3 min" },
      { id: "neutral-row", name: "Neutral chest-supported row", prescription: "3×6–10", load: "Start rond 90 kg", rest: "2–3 min" },
      { id: "wide-row", name: "Wide chest-supported row", prescription: "2×8–12", load: "80–90 kg", rest: "2 min" },
      { id: "reverse-pec", name: "Reverse pec deck", prescription: "3×12–20", load: "Gecontroleerd", rest: "60–90 sec" },
      { id: "strict-curl", name: "Strikte dumbbellcurl", prescription: "1×6–8 + 2×8–10", load: "18 kg → 16 kg", rest: "2 min" },
      { id: "hammer-curl", name: "Hammer curl", prescription: "2×8–12", load: "14–16 kg", rest: "90 sec" },
    ],
  },
  {
    id: "legs",
    label: "Woensdag · Legs",
    short: "Legs",
    focus: "Quadriceps · kuiten · core",
    exercises: [
      { id: "hack-squat", name: "Hack squat", prescription: "3×6–10", load: "RIR 1–2", rest: "3 min" },
      { id: "bulgarian", name: "Bulgarian split squat", prescription: "3×8–12 / been", load: "Pijnvrije ROM", rest: "2–3 min" },
      { id: "seated-curl", name: "Seated leg curl", prescription: "3×8–12", load: "RIR 1–2", rest: "2 min" },
      { id: "leg-extension", name: "Leg extension", prescription: "2×12–15", load: "Gecontroleerd", rest: "90 sec" },
      { id: "standing-calf", name: "Standing calf raise", prescription: "4×8–15", load: "Volledige stretch", rest: "90 sec" },
      { id: "legs-lateral", name: "Cable lateral raise", prescription: "3×15–20", load: "Strikt", rest: "60 sec" },
      { id: "cable-crunch", name: "Cable crunch", prescription: "3×10–15", load: "Progressief", rest: "90 sec" },
    ],
  },
  {
    id: "lower",
    label: "Vrijdag · Lower",
    short: "Lower",
    focus: "Hamstrings · billen · core",
    exercises: [
      { id: "rdl", name: "Romanian deadlift", prescription: "3×6–10", load: "RIR 1–2", rest: "3 min" },
      { id: "leg-press", name: "Leg press", prescription: "3×10–15", load: "RIR 1–2", rest: "2–3 min" },
      { id: "hip-thrust", name: "Hip thrust", prescription: "2×8–12", load: "RIR 1–2", rest: "2–3 min" },
      { id: "lying-curl", name: "Lying leg curl", prescription: "3×10–15", load: "RIR 1", rest: "90 sec" },
      { id: "seated-calf", name: "Seated calf raise", prescription: "3×12–20", load: "Volledige ROM", rest: "90 sec" },
      { id: "hanging-raise", name: "Hanging knee/leg raise", prescription: "3×8–15", load: "Gecontroleerd", rest: "90 sec" },
    ],
  },
  {
    id: "upper",
    label: "Zaterdag · Upper",
    short: "Upper",
    focus: "Bench-techniek · lats · schouders",
    exercises: [
      PAUSED_BENCH_EXERCISE,
      { id: "upper-wide-row", name: "Wide chest-supported row", prescription: "3×8–12", load: "RIR 1–2", rest: "2–3 min" },
      { id: "kneeling-lat", name: "Eén-knie lat pulldown", prescription: "2×10–15 / kant", load: "Volledige stretch", rest: "90 sec" },
      { id: "upper-shoulder", name: "Machine shoulder press", prescription: "2×8–12", load: "RIR 1–2", rest: "2 min" },
      { id: "upper-fly", name: "Cable/machine fly", prescription: "2×12–15", load: "RIR 1", rest: "90 sec" },
      { id: "upper-lateral", name: "Cable lateral raise", prescription: "3×12–20", load: "Strikt", rest: "60–90 sec" },
      { id: "rear-delt", name: "Rear-delt fly", prescription: "2×15–20", load: "Gecontroleerd", rest: "60–90 sec" },
      { id: "cable-curl", name: "Cable curl", prescription: "2×10–15", load: "RIR 1", rest: "90 sec" },
      { id: "upper-pressdown", name: "Triceps pressdown", prescription: "2×10–15", load: "RIR 1", rest: "90 sec" },
    ],
  },
];

const SCIENCE_PLAN: WorkoutDay[] = [
  {
    id: "science-push",
    label: "Maandag · Push",
    short: "Push",
    focus: "Krachtbasis · borst · delts · triceps",
    exercises: [
      { id: "flat-bench", name: "Flat bench press", prescription: "1×4–6 + 2×6–8", load: "Topset + back-offs · RIR 1–2", rest: "3–5 min" },
      { id: "incline-machine", name: "Incline chest press", prescription: "3×8–12", load: "RIR 1–2 · diepe stretch", rest: "2–3 min" },
      { id: "push-shoulder", name: "Machine shoulder press", prescription: "2×6–10", load: "RIR 1–2", rest: "2–3 min" },
      { id: "upper-fly", name: "Cable fly", prescription: "2×12–15", load: "RIR 1 · volledige ROM", rest: "90–120 sec" },
      { id: "science-lateral", name: "Cable lateral raise", prescription: "3×12–20", load: "RIR 1 · strikt", rest: "60–90 sec" },
      { id: "overhead-triceps", name: "Overhead cable extension", prescription: "3×10–15", load: "RIR 1 · lange spierlengte", rest: "90–120 sec" },
      { id: "pressdown", name: "Triceps pressdown", prescription: "2×10–15", load: "Laatste set RIR 0–1", rest: "90 sec" },
    ],
  },
  {
    id: "science-pull",
    label: "Dinsdag · Pull",
    short: "Pull",
    focus: "Verticale pull · rugdikte · biceps",
    exercises: [
      { id: "pull-up", name: "Weighted pull-up", prescription: "3×5–8", load: "RIR 1–2", rest: "3 min" },
      { id: "neutral-row", name: "Neutral chest-supported row", prescription: "3×6–10", load: "RIR 1–2 · stabiele borst", rest: "2–3 min" },
      { id: "kneeling-lat", name: "Eén-knie lat pulldown", prescription: "2×10–15 / kant", load: "Volledige stretch", rest: "90–120 sec" },
      { id: "reverse-pec", name: "Reverse pec deck", prescription: "2×12–20", load: "RIR 1 · gecontroleerd", rest: "90 sec" },
      { id: "science-preacher", name: "Preacher curl", prescription: "3×8–12", load: "RIR 1 · geen momentum", rest: "2 min" },
      { id: "hammer-curl", name: "Hammer curl", prescription: "2×10–15", load: "RIR 1", rest: "90 sec" },
    ],
  },
  {
    id: "science-legs",
    label: "Woensdag · Legs",
    short: "Legs",
    focus: "Quads · hamstrings · volledige ROM",
    exercises: [
      { id: "hack-squat", name: "Hack squat", prescription: "3×6–10", load: "RIR 1–2 · constante diepte", rest: "3 min" },
      { id: "rdl", name: "Romanian deadlift", prescription: "3×6–10", load: "RIR 1–2 · hamstringstretch", rest: "3 min" },
      { id: "bulgarian", name: "Bulgarian split squat", prescription: "2×8–12 / been", load: "RIR 1–2 · pijnvrije ROM", rest: "2–3 min" },
      { id: "seated-curl", name: "Seated leg curl", prescription: "3×10–15", load: "RIR 1 · heup gebogen", rest: "2 min" },
      { id: "leg-extension", name: "Leg extension", prescription: "2×12–15", load: "Laatste set RIR 0–1", rest: "90 sec" },
      { id: "standing-calf", name: "Standing calf raise", prescription: "3×8–15", load: "2 sec stretch onderaan", rest: "90 sec" },
      { id: "cable-crunch", name: "Cable crunch", prescription: "3×10–15", load: "Progressief", rest: "90 sec" },
    ],
  },
  {
    id: "science-lower",
    label: "Vrijdag · Lower",
    short: "Lower",
    focus: "Tweede beenprikkel · herstelbaar volume",
    exercises: [
      { id: "leg-press", name: "Leg press", prescription: "3×8–12", load: "RIR 1–2 · diepe ROM", rest: "3 min" },
      { id: "hip-thrust", name: "Hip thrust", prescription: "2×8–12", load: "RIR 1–2 · 1 sec lock-out", rest: "2–3 min" },
      { id: "leg-extension", name: "Leg extension", prescription: "2×12–15", load: "RIR 1", rest: "90 sec" },
      { id: "lying-curl", name: "Lying leg curl", prescription: "3×10–15", load: "RIR 1", rest: "2 min" },
      { id: "seated-calf", name: "Seated calf raise", prescription: "3×12–20", load: "Volledige stretch", rest: "90 sec" },
      { id: "hanging-raise", name: "Hanging leg raise", prescription: "3×8–15", load: "Geen zwaai", rest: "90 sec" },
    ],
  },
  {
    id: "science-upper",
    label: "Zaterdag · Upper",
    short: "Upper",
    focus: "Tweede benchprikkel · gebalanceerd",
    exercises: [
      { ...PAUSED_BENCH_EXERCISE, load: "2 sec pauze · RIR 2" },
      { id: "lat-pulldown", name: "Vertical lat pulldown", prescription: "3×6–10", load: "RIR 1–2 · volledige stretch", rest: "2–3 min" },
      { id: "upper-wide-row", name: "Wide chest-supported row", prescription: "3×8–12", load: "RIR 1–2", rest: "2–3 min" },
      { id: "upper-fly", name: "Cable fly", prescription: "2×10–15", load: "RIR 1", rest: "90–120 sec" },
      { id: "upper-lateral", name: "Cable lateral raise", prescription: "3×12–20", load: "RIR 1", rest: "60–90 sec" },
      { id: "rear-delt", name: "Rear-delt fly", prescription: "2×12–20", load: "RIR 1", rest: "90 sec" },
      { id: "cable-curl", name: "Cable curl", prescription: "2×10–15", load: "RIR 1", rest: "90 sec" },
      { id: "upper-pressdown", name: "Triceps pressdown", prescription: "2×10–15", load: "RIR 1", rest: "90 sec" },
    ],
  },
];

const SCIENCE_UPPER_LOWER_PLAN: WorkoutDay[] = [
  {
    id: "science-ul-upper-a",
    label: "Maandag · Upper A",
    short: "Upper A",
    focus: "Bench-kracht · rug · schouders",
    exercises: [
      { id: "flat-bench", name: "Flat bench press", prescription: "1×4–6 + 2×6–8", load: "Topset + back-offs · RIR 1–2", rest: "3–5 min" },
      { id: "pull-up", name: "Weighted pull-up", prescription: "3×5–8", load: "RIR 1–2", rest: "3 min" },
      { id: "push-shoulder", name: "Machine shoulder press", prescription: "2×6–10", load: "RIR 1–2", rest: "2–3 min" },
      { id: "neutral-row", name: "Neutral chest-supported row", prescription: "3×6–10", load: "RIR 1–2", rest: "2–3 min" },
      { id: "science-lateral", name: "Cable lateral raise", prescription: "3×12–20", load: "RIR 1 · strikt", rest: "60–90 sec" },
      { id: "overhead-triceps", name: "Overhead cable extension", prescription: "2×10–15", load: "RIR 1", rest: "90 sec" },
      { id: "science-preacher", name: "Preacher curl", prescription: "2×8–12", load: "RIR 1", rest: "90 sec" },
    ],
  },
  {
    id: "science-ul-lower-a",
    label: "Dinsdag · Lower A",
    short: "Lower A",
    focus: "Quads · hamstrings · kuiten",
    exercises: [
      { id: "hack-squat", name: "Hack squat", prescription: "3×6–10", load: "RIR 1–2 · constante diepte", rest: "3 min" },
      { id: "rdl", name: "Romanian deadlift", prescription: "3×6–10", load: "RIR 1–2 · hamstringstretch", rest: "3 min" },
      { id: "leg-extension", name: "Leg extension", prescription: "2×12–15", load: "RIR 1", rest: "90 sec" },
      { id: "seated-curl", name: "Seated leg curl", prescription: "3×10–15", load: "RIR 1", rest: "2 min" },
      { id: "standing-calf", name: "Standing calf raise", prescription: "3×8–15", load: "2 sec stretch", rest: "90 sec" },
      { id: "cable-crunch", name: "Cable crunch", prescription: "3×10–15", load: "Progressief", rest: "90 sec" },
    ],
  },
  {
    id: "science-ul-upper-b",
    label: "Donderdag · Upper B",
    short: "Upper B",
    focus: "Paused bench · lats · armen",
    exercises: [
      { ...PAUSED_BENCH_EXERCISE, load: "2 sec pauze · RIR 2" },
      { id: "lat-pulldown", name: "Vertical lat pulldown", prescription: "3×6–10", load: "RIR 1–2 · volledige stretch", rest: "2–3 min" },
      { id: "incline-machine", name: "Incline chest press", prescription: "2×8–12", load: "RIR 1–2", rest: "2–3 min" },
      { id: "upper-wide-row", name: "Wide chest-supported row", prescription: "3×8–12", load: "RIR 1–2", rest: "2–3 min" },
      { id: "upper-lateral", name: "Cable lateral raise", prescription: "3×12–20", load: "RIR 1", rest: "60–90 sec" },
      { id: "rear-delt", name: "Rear-delt fly", prescription: "2×12–20", load: "RIR 1", rest: "90 sec" },
      { id: "cable-curl", name: "Cable curl", prescription: "2×10–15", load: "RIR 1", rest: "90 sec" },
      { id: "upper-pressdown", name: "Triceps pressdown", prescription: "2×10–15", load: "RIR 1", rest: "90 sec" },
    ],
  },
  {
    id: "science-ul-lower-b",
    label: "Vrijdag · Lower B",
    short: "Lower B",
    focus: "Tweede beenprikkel · billen · core",
    exercises: [
      { id: "leg-press", name: "Leg press", prescription: "3×8–12", load: "RIR 1–2 · diepe ROM", rest: "3 min" },
      { id: "hip-thrust", name: "Hip thrust", prescription: "2×8–12", load: "RIR 1–2 · 1 sec lock-out", rest: "2–3 min" },
      { id: "bulgarian", name: "Bulgarian split squat", prescription: "2×8–12 / been", load: "Pijnvrije ROM", rest: "2–3 min" },
      { id: "lying-curl", name: "Lying leg curl", prescription: "3×10–15", load: "RIR 1", rest: "2 min" },
      { id: "seated-calf", name: "Seated calf raise", prescription: "3×12–20", load: "Volledige stretch", rest: "90 sec" },
      { id: "hanging-raise", name: "Hanging leg raise", prescription: "3×8–15", load: "Geen zwaai", rest: "90 sec" },
    ],
  },
];

const SCIENCE_FULL_BODY_PLAN: WorkoutDay[] = [
  {
    id: "science-fb-a",
    label: "Maandag · Full body A",
    short: "Full body A",
    focus: "Bench-kracht · squat · verticale pull",
    exercises: [
      { id: "flat-bench", name: "Flat bench press", prescription: "1×4–6 + 2×6–8", load: "Topset + back-offs · RIR 1–2", rest: "3–5 min" },
      { id: "hack-squat", name: "Hack squat", prescription: "3×6–10", load: "RIR 1–2", rest: "3 min" },
      { id: "pull-up", name: "Weighted pull-up", prescription: "3×5–8", load: "RIR 1–2", rest: "3 min" },
      { id: "rdl", name: "Romanian deadlift", prescription: "2×6–10", load: "RIR 2", rest: "3 min" },
      { id: "science-lateral", name: "Cable lateral raise", prescription: "2×12–20", load: "RIR 1", rest: "60–90 sec" },
      { id: "overhead-triceps", name: "Overhead cable extension", prescription: "2×10–15", load: "RIR 1", rest: "90 sec" },
    ],
  },
  {
    id: "science-fb-b",
    label: "Woensdag · Full body B",
    short: "Full body B",
    focus: "Bovenborst · benen · rugdikte",
    exercises: [
      { id: "leg-press", name: "Leg press", prescription: "3×8–12", load: "RIR 1–2", rest: "3 min" },
      { id: "incline-bench", name: "Incline bench press", prescription: "3×6–10", load: "RIR 1–2", rest: "3 min" },
      { id: "neutral-row", name: "Neutral chest-supported row", prescription: "3×6–10", load: "RIR 1–2", rest: "2–3 min" },
      { id: "seated-curl", name: "Seated leg curl", prescription: "3×10–15", load: "RIR 1", rest: "2 min" },
      { id: "push-shoulder", name: "Machine shoulder press", prescription: "2×8–12", load: "RIR 1–2", rest: "2 min" },
      { id: "science-preacher", name: "Preacher curl", prescription: "2×8–12", load: "RIR 1", rest: "90 sec" },
      { id: "standing-calf", name: "Standing calf raise", prescription: "3×8–15", load: "Volledige stretch", rest: "90 sec" },
    ],
  },
  {
    id: "science-fb-c",
    label: "Vrijdag · Full body C",
    short: "Full body C",
    focus: "Paused bench · unilateraal · lats",
    exercises: [
      { ...PAUSED_BENCH_EXERCISE, prescription: "3×5–8", load: "2 sec pauze · RIR 2" },
      { id: "bulgarian", name: "Bulgarian split squat", prescription: "3×8–12 / been", load: "Pijnvrije ROM", rest: "2–3 min" },
      { id: "lat-pulldown", name: "Vertical lat pulldown", prescription: "3×6–10", load: "RIR 1–2", rest: "2–3 min" },
      { id: "hip-thrust", name: "Hip thrust", prescription: "2×8–12", load: "RIR 1–2", rest: "2–3 min" },
      { id: "upper-wide-row", name: "Wide chest-supported row", prescription: "2×8–12", load: "RIR 1–2", rest: "2 min" },
      { id: "rear-delt", name: "Rear-delt fly", prescription: "2×12–20", load: "RIR 1", rest: "90 sec" },
      { id: "cable-curl", name: "Cable curl", prescription: "2×10–15", load: "RIR 1", rest: "90 sec" },
    ],
  },
];

const DEFAULT_SCIENCE_PLAN_ID: SciencePlanId = "ppl-ul";

const SCIENCE_PLAN_ORDER: SciencePlanId[] = ["ppl-ul", "upper-lower", "full-body"];

const SCIENCE_PLANS: Record<SciencePlanId, SciencePlanDefinition> = {
  "ppl-ul": {
    id: "ppl-ul",
    label: "PPL + Upper/Lower",
    daysLabel: "5 dagen",
    summary: "Veel oefenruimte en specialisatie, verdeeld over vijf herstelbare sessies.",
    frequency: "Grote spiergroepen circa 2× per week",
    distribution: "PPL–rust–Lower–Upper verdeelt meer weekvolume over vijf kortere sessies.",
    comparison: "Lijkt het meest op jouw persoonlijke plan, maar gebruikt neutralere volumes en minder fysieke specialisatie.",
    plan: SCIENCE_PLAN,
    slots: ["push", "pull", "legs", "lower", "upper"],
    slotMap: { push: "science-push", pull: "science-pull", legs: "science-legs", lower: "science-lower", upper: "science-upper" },
    schedule: { 0: "rest", 1: "push", 2: "pull", 3: "legs", 4: "rest", 5: "lower", 6: "upper" },
  },
  "upper-lower": {
    id: "upper-lower",
    label: "Upper/Lower",
    daysLabel: "4 dagen",
    summary: "Sterke balans tussen trainingsfrequentie, herstel en agenda voor ervaren lifters.",
    frequency: "Elke spiergroep 2× per week",
    distribution: "Upper A–Lower A–rust–Upper B–Lower B geeft elke spiergroep twee kwaliteitsprikkels met voorspelbaar herstel.",
    comparison: "Minder dagen dan PPL/UL, maar dezelfde hoofdprioriteiten. Sessies zijn iets langer en combineren meer spiergroepen.",
    plan: SCIENCE_UPPER_LOWER_PLAN,
    slots: ["push", "pull", "lower", "upper"],
    slotMap: { push: "science-ul-upper-a", pull: "science-ul-lower-a", lower: "science-ul-upper-b", upper: "science-ul-lower-b" },
    schedule: { 0: "rest", 1: "push", 2: "pull", 3: "rest", 4: "lower", 5: "upper", 6: "rest" },
  },
  "full-body": {
    id: "full-body",
    label: "Full body",
    daysLabel: "3 dagen",
    summary: "Maximale consistentie met drie volledige sessies en veel herhaalde techniekprikkels.",
    frequency: "Grote spiergroepen 2–3× per week",
    distribution: "Maandag–woensdag–vrijdag spreidt het volume over drie full-body sessies met telkens een rustdag ertussen.",
    comparison: "Minder weekdagen en meer frequentie per beweging; elke sessie bevat wel zowel boven- als onderlichaam.",
    plan: SCIENCE_FULL_BODY_PLAN,
    slots: ["push", "legs", "lower"],
    slotMap: { push: "science-fb-a", legs: "science-fb-b", lower: "science-fb-c" },
    schedule: { 0: "rest", 1: "push", 2: "rest", 3: "legs", 4: "rest", 5: "lower", 6: "rest" },
  },
};

const REST_DAY: WorkoutDay = {
  id: "rest",
  label: "Flexibel · Rustdag",
  short: "Rustdag",
  focus: "Herstellen zonder er een workout van te maken",
  exercises: [],
};

const RECOVERY_ACTIVITIES: RecoveryActivity[] = [
  {
    id: "calf-mobility",
    category: "Kuiten · prioriteit",
    name: "Kuit + soleus mobility",
    dose: "2 rondes · 30–45 sec per positie/kant",
    detail: "Eerst met gestrekte knie, daarna licht gebogen. Hiel laag en alleen een zachte rek.",
    tone: "calves",
  },
  {
    id: "calf-capacity",
    category: "Achilles · optioneel",
    name: "Rustige calf raises",
    dose: "2×12 · 3 sec gecontroleerd zakken",
    detail: "Alleen pijnarm en zonder forceren. Sla over als de pees vandaag duidelijk geïrriteerd voelt.",
    tone: "calves",
  },
  {
    id: "band-external-rotation",
    category: "Schouders · controle",
    name: "Band external rotation",
    dose: "2×12 per kant · zeer lichte band",
    detail: "Elleboog tegen je zij, schouder laag en elke herhaling rustig uitvoeren.",
    tone: "shoulders",
  },
  {
    id: "wall-slides",
    category: "Schouders · mobiliteit",
    name: "Wall slides",
    dose: "2×8–10 · pijnvrije range",
    detail: "Ribben laag houden en omhoog glijden zonder je schouders naar je oren te trekken.",
    tone: "shoulders",
  },
  {
    id: "open-books",
    category: "Bovenrug",
    name: "Open-book rotations",
    dose: "1–2×8 per kant",
    detail: "Draai vanuit je bovenrug; knieën blijven rustig op elkaar zodat je onderrug niet overneemt.",
    tone: "mobility",
  },
  {
    id: "easy-walk",
    category: "Actief herstel",
    name: "Rustige wandeling",
    dose: "10–20 min · praattempo",
    detail: "Geen cardio-doel. Je hoort je na afloop losser te voelen, niet vermoeider.",
    tone: "cardio",
  },
];

const RECOVERY_SCALE = {
  sleep: [
    { value: "1", label: "Slecht" },
    { value: "2", label: "Oké" },
    { value: "3", label: "Goed" },
  ],
  soreness: [
    { value: "1", label: "Laag" },
    { value: "2", label: "Normaal" },
    { value: "3", label: "Hoog" },
  ],
  energy: [
    { value: "1", label: "Laag" },
    { value: "2", label: "Oké" },
    { value: "3", label: "Goed" },
  ],
} as const;

const SCIENCE_SOURCES = [
  { label: "ACSM 2026", href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/" },
  { label: "Split vs full body · meta-analyse", href: "https://pubmed.ncbi.nlm.nih.gov/38595233/" },
  { label: "Volume dose-response", href: "https://pubmed.ncbi.nlm.nih.gov/41343037/" },
  { label: "Proximity to failure", href: "https://pubmed.ncbi.nlm.nih.gov/38970765/" },
  { label: "Trainingsfrequentie", href: "https://pubmed.ncbi.nlm.nih.gov/30558493/" },
  { label: "Rustintervallen", href: "https://pubmed.ncbi.nlm.nih.gov/39205815/" },
  { label: "RDL versus Nordic · RCT 2025", href: "https://pubmed.ncbi.nlm.nih.gov/40085810/" },
  { label: "Hamstring-oefeningen · EMG", href: "https://pubmed.ncbi.nlm.nih.gov/24149748/" },
  { label: "Seated versus lying leg curl", href: "https://pubmed.ncbi.nlm.nih.gov/33009197/" },
  { label: "Jeff Nippard · PPL system", href: "https://jeffnippard.com/products/the-ultimate-push-pull-legs-system" },
];

const MEAL_OPTIONS: MealType[] = ["Ontbijt", "Lunch", "Pre-workout", "Avondeten", "Snack"];
const MEAL_IDEA_TYPES: MealIdeaType[] = ["Ontbijt", "Lunch", "Avondeten"];
const MEAL_IDEAS: Record<MealIdeaType, MealIdea[]> = {
  Ontbijt: [
    { id: "protein-oats", meal: "Ontbijt", name: "Protein oats", description: "80 g havermout · whey · banaan · pindakaas", calories: 622, protein: 42, carbs: 82, fat: 14 },
    { id: "skyr-crunch", meal: "Ontbijt", name: "Skyr crunch bowl", description: "Skyr · Rice Krispies · banaan · beetje honing", calories: 542, protein: 39, carbs: 92, fat: 2 },
    { id: "eggs-toast", meal: "Ontbijt", name: "Eieren & bruin brood", description: "3 eieren · 4 kleine sneden · ham · groenten", calories: 568, protein: 45, carbs: 52, fat: 20 },
  ],
  Lunch: [
    { id: "crispy-chicken-prep", meal: "Lunch", name: "Krokante kip meal prep", description: "Kip · gebakken patat · broccoli · paprika", calories: 754, protein: 60, carbs: 88, fat: 18 },
    { id: "chicken-rice", meal: "Lunch", name: "Kip-rijst bowl", description: "Kip · rijst · wokgroenten · lichte sojasaus", calories: 742, protein: 58, carbs: 96, fat: 14 },
    { id: "tuna-wraps", meal: "Lunch", name: "Tonijnwraps", description: "2 wraps · tonijn · yoghurtsaus · rauwkost", calories: 616, protein: 50, carbs: 68, fat: 16 },
  ],
  Avondeten: [
    { id: "lean-spaghetti", meal: "Avondeten", name: "Spaghetti met mager gehakt", description: "Pasta · mager gehakt · tomatensaus · parmezaan", calories: 798, protein: 55, carbs: 95, fat: 22 },
    { id: "salmon-potatoes", meal: "Avondeten", name: "Zalm & aardappelen", description: "Zalm · aardappelen · broccoli · citroen", calories: 729, protein: 48, carbs: 78, fat: 25 },
    { id: "chicken-nasi", meal: "Avondeten", name: "Nasi met kip & ei", description: "Rijst · kip · ei · wokgroenten · sojasaus", calories: 786, protein: 58, carbs: 98, fat: 18 },
  ],
};
const WORKOUT_CHOICES: CanonicalDayId[] = ["push", "pull", "legs", "lower", "upper", "rest"];

const DEFAULT_SCHEDULE: Record<number, CanonicalDayId> = {
  0: "rest",
  1: "push",
  2: "pull",
  3: "legs",
  4: "rest",
  5: "lower",
  6: "upper",
};

function shiftDateKey(value: string, days: number) {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function timestampForDate(value: string) {
  const now = new Date();
  const selected = parseDateKey(value);
  selected.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return selected.toISOString();
}

/** A session id only has to be unique on this device, and the clock is the
 *  cheapest thing that is. Called from the save handlers, never while
 *  rendering — an id minted during a render would change on every re-render. */
function newSessionId() {
  return `${Date.now()}`;
}

/** Six weeks of Mondays-to-Sundays covering the month the anchor week sits in.
 *  A week belongs to the month containing its Thursday (ISO 8601), so the week
 *  of 31 Aug - 6 Sep shows September, not August. */
function monthOfWeek(anchor: Date) {
  const thursday = new Date(anchor);
  thursday.setDate(thursday.getDate() + 3);
  return thursday;
}

function datesInMonthGrid(anchor = new Date()) {
  const first = monthOfWeek(anchor);
  first.setDate(1);
  first.setHours(12, 0, 0, 0);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => {
    const result = new Date(start);
    result.setDate(start.getDate() + index);
    return result;
  });
}

function sciencePlanFromId(value: SciencePlanId) {
  return SCIENCE_PLANS[value] ?? SCIENCE_PLANS[DEFAULT_SCIENCE_PLAN_ID];
}

function programKey(mode: PlanMode, sciencePlanId: SciencePlanId) {
  return mode === "personal" ? "personal" : `science-${sciencePlanId}`;
}

function defaultScheduleForDate(value: string, mode: PlanMode = "personal", sciencePlanId: SciencePlanId = DEFAULT_SCIENCE_PLAN_ID) {
  const schedule = mode === "science" ? sciencePlanFromId(sciencePlanId).schedule : DEFAULT_SCHEDULE;
  return schedule[parseDateKey(value).getDay()] ?? "rest";
}

function planIdForMode(dayId: CanonicalDayId, mode: PlanMode, sciencePlanId: SciencePlanId = DEFAULT_SCIENCE_PLAN_ID) {
  if (mode === "personal" || dayId === "rest") return dayId;
  return sciencePlanFromId(sciencePlanId).slotMap[dayId] ?? "rest";
}

const CURRENT_PLAN_SCHEMA_VERSION = 2;

function upgradePersonalPlan(source: WorkoutDay[], schemaVersion = 0) {
  if (schemaVersion >= CURRENT_PLAN_SCHEMA_VERSION) return source;
  return source.map((workoutDay) => {
    if (workoutDay.id !== "upper") return workoutDay;
    if (workoutDay.exercises.some((exercise) => exercise.id === PAUSED_BENCH_EXERCISE.id)) return workoutDay;
    const replaceIndex = workoutDay.exercises.findIndex((exercise) => exercise.id === "incline-machine");
    const exercises = [...workoutDay.exercises];
    if (replaceIndex >= 0) exercises.splice(replaceIndex, 1, PAUSED_BENCH_EXERCISE);
    else exercises.unshift(PAUSED_BENCH_EXERCISE);
    return {
      ...workoutDay,
      focus: "Bench-techniek · lats · schouders",
      exercises,
    };
  });
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function numberValue(value: string | undefined) {
  return Number((value ?? "").replace(",", ".")) || 0;
}

function photoDateLabel(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("nl-BE", options ?? {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function prepareProgressPhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Kies een geldige foto.");
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1440 / bitmap.width, 1920 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Afbeelding kon niet worden voorbereid.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("Afbeelding kon niet worden verkleind.")),
        "image/jpeg",
        0.86,
      ),
    );
    return { blob, filename: `${dateKey()}-check-in.jpg` };
  } catch {
    return { blob: file as Blob, filename: file.name || `${dateKey()}-check-in.jpg` };
  }
}

function TrainingApp() {
  const [plan, setPlan] = useState<WorkoutDay[]>(DEFAULT_PLAN);
  const [planMode, setPlanMode] = useState<PlanMode>("personal");
  const [sciencePlanId, setSciencePlanId] = useState<SciencePlanId>(DEFAULT_SCIENCE_PLAN_ID);
  const [selectedDate, setSelectedDate] = useState(dateKey());
  const [scheduleOverrides, setScheduleOverrides] = useState<ScheduleOverrides>({});
  const [moveSourceDate, setMoveSourceDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("training");
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [openExerciseByScope, setOpenExerciseByScope] = useState<Record<string, string | null>>({});
  const [performance, setPerformance] = useState<Performance>({});
  const [sessions, setSessions] = useState<Session[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [targets, setTargets] = useState<Targets>({
    calories: 2750,
    protein: 175,
    carbs: 350,
    fat: 70,
  });
  const [nutritionEntries, setNutritionEntries] = useState<NutritionEntry[]>([]);
  const [nutritionDate, setNutritionDate] = useState(dateKey());
  const [nutritionDraft, setNutritionDraft] = useState<NutritionDraft>({
    meal: "Ontbijt",
    name: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
  });
  const [mealIdeaType, setMealIdeaType] = useState<MealIdeaType>("Ontbijt");
  const [foodQuery, setFoodQuery] = useState("");
  const [foodResults, setFoodResults] = useState<FoodSearchResult[]>([]);
  const [foodSearchLoading, setFoodSearchLoading] = useState(false);
  const [foodSearchError, setFoodSearchError] = useState("");
  const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null);
  const [foodAmount, setFoodAmount] = useState("100");
  const [metricDraft, setMetricDraft] = useState({
    date: "",
    weight: "",
    waist: "",
  });
  const [recoveryDraft, setRecoveryDraft] = useState<RecoveryDraft>({
    date: "",
    sleep: "",
    soreness: "",
    energy: "",
    note: "",
    completedIds: [],
  });
  const [editing, setEditing] = useState<{
    dayId: string;
    exercise: Exercise;
  } | null>(null);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [sessionEditError, setSessionEditError] = useState("");
  const [targetDialog, setTargetDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "session" | "metric" | "photo" | "nutrition";
    id: string;
    label: string;
  } | null>(null);
  const [banner, setBanner] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [accountDialog, setAccountDialog] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(STARTER_CHAT);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photoUploadLoading, setPhotoUploadLoading] = useState(false);
  const [photoDraft, setPhotoDraft] = useState({ capturedOn: "", weight: "" });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoPlaying, setPhotoPlaying] = useState(false);
  const [photoSpeed, setPhotoSpeed] = useState(1500);
  // SETLINE screens: sheets, the logging steppers and the live workout.
  const [returnTab, setReturnTab] = useState("training");
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [agendaDay, setAgendaDay] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [platesOpen, setPlatesOpen] = useState(false);
  const [foodSheetOpen, setFoodSheetOpen] = useState(false);
  const [metricSheetOpen, setMetricSheetOpen] = useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [compareSheetOpen, setCompareSheetOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<{ before: string; after: string } | null>(null);
  const [stepDraft, setStepDraft] = useState<StepDraft | null>(null);
  const [correcting, setCorrecting] = useState<{ key: string; index: number } | null>(null);
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
  const [barWeight, setBarWeight] = useState(20);
  const [logAnnouncement, setLogAnnouncement] = useState("");
  const [cardDrag, setCardDrag] = useState({ x: 0, animate: false });
  const cardSwipe = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const [setDockElement, dockHeight] = useElementHeight<HTMLDivElement>();

  useEffect(() => {
    const today = dateKey();
    const applyStoredState = (parsed: StoredState) => {
      const mode: PlanMode = parsed.planMode === "science" ? "science" : "personal";
      const storedSciencePlanId: SciencePlanId = parsed.sciencePlanId === "upper-lower" || parsed.sciencePlanId === "full-body"
        ? parsed.sciencePlanId
        : DEFAULT_SCIENCE_PLAN_ID;
      const storedSchedule = parsed.scheduleOverrides && typeof parsed.scheduleOverrides === "object"
        ? parsed.scheduleOverrides
        : {};
      if (parsed.plan) setPlan(upgradePersonalPlan(parsed.plan, parsed.planSchemaVersion));
      setPlanMode(mode);
      setSciencePlanId(storedSciencePlanId);
      setScheduleOverrides(storedSchedule);
      setCompleted(parsed.completed ?? {});
      setPerformance(normalizePerformance(parsed.performance));
      setSessions(parsed.sessions ?? []);
      setMetrics(parsed.metrics ?? []);
      if (parsed.targets) setTargets(parsed.targets);
      setChatMessages(parsed.chatMessages ?? STARTER_CHAT);
      const storedNutritionEntries = Array.isArray(parsed.nutritionEntries)
        ? parsed.nutritionEntries.filter((entry) =>
            entry &&
            typeof entry.id === "string" &&
            typeof entry.date === "string" &&
            typeof entry.name === "string" &&
            MEAL_OPTIONS.includes(entry.meal) &&
            [entry.calories, entry.protein, entry.carbs, entry.fat].every(Number.isFinite),
          )
        : [];
      if (storedNutritionEntries.length > 0) {
        setNutritionEntries(storedNutritionEntries);
      } else if (parsed.nutrition && [parsed.nutrition.calories, parsed.nutrition.protein, parsed.nutrition.carbs, parsed.nutrition.fat].some((value) => numberValue(value) > 0)) {
        setNutritionEntries([{
          id: `legacy-${parsed.nutrition.date || today}`,
          date: parsed.nutrition.date || today,
          meal: "Snack",
          name: "Eerder gelogd dagtotaal",
          calories: numberValue(parsed.nutrition.calories),
          protein: numberValue(parsed.nutrition.protein),
          carbs: numberValue(parsed.nutrition.carbs),
          fat: numberValue(parsed.nutrition.fat),
        }]);
      } else {
        setNutritionEntries([]);
      }
      setNutritionDate(today);
      setRecoveryDraft(
        parsed.recoveryDraft?.date === today
          ? {
              date: today,
              sleep: String(parsed.recoveryDraft.sleep ?? ""),
              soreness: String(parsed.recoveryDraft.soreness ?? ""),
              energy: String(parsed.recoveryDraft.energy ?? ""),
              note: String(parsed.recoveryDraft.note ?? ""),
              completedIds: Array.isArray(parsed.recoveryDraft.completedIds)
                ? parsed.recoveryDraft.completedIds.filter((id): id is string => typeof id === "string")
                : [],
            }
          : { date: today, sleep: "", soreness: "", energy: "", note: "", completedIds: [] },
      );
      setSelectedDate(today);
    };
    const saved = window.localStorage.getItem(STORAGE_KEY);
    let localState: StoredState = {};
    if (saved) {
      try {
        localState = JSON.parse(saved) as StoredState;
      } catch {
        // Keep safe defaults if browser storage is malformed.
      }
    }
    // Restoring the stored state is a whole second render on top of the one
    // that just committed. Handing it to a microtask keeps it off the
    // synchronous effect path instead of cascading inside the same commit.
    void Promise.resolve().then(() => {
      applyStoredState(localState);
      const live = readLiveState(Date.now());
      setRestTimer(live.rest);
      setLiveSession(live.session);
      setBarWeight(live.bar);
      setMetricDraft((current) => ({ ...current, date: today }));
      setPhotoDraft((current) => ({ ...current, capturedOn: today }));
      // The meal tab opens on whatever meal is next. Only the browser knows
      // the local hour, so this cannot be picked while rendering.
      const hour = new Date().getHours();
      setMealIdeaType(hour < 11 ? "Ontbijt" : hour < 16 ? "Lunch" : "Avondeten");
      setHydrated(true);
    });

    // Identity and cloud sync are separate concerns. /api/auth/session exists
    // on every deployment; /api/user-state only where D1 is bound. Reading
    // identity from the sync endpoint meant a signed-in user on a
    // sync-less host was reported as "not signed in".
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as { user?: AccountUser };
        return payload.user ?? null;
      })
      .catch(() => null)
      .then((user) => {
        if (user) setAccount(user);
      });

    void (async () => {
      // Supabase exists in every deployment; the D1 route only on Cloudflare.
      const cloud = await loadCloudState().catch(() => null);
      if (cloud?.state) {
        setSyncStatus("saving");
        const localUpdatedAt = localState.updatedAt ? Date.parse(localState.updatedAt) : 0;
        const cloudUpdatedAt = cloud.updatedAt ? Date.parse(cloud.updatedAt) : 0;
        if (cloudUpdatedAt >= localUpdatedAt) applyStoredState(cloud.state as StoredState);
        else await saveCloudState(localState as unknown as Record<string, unknown>);
        setLastSyncedAt(cloud.updatedAt ?? new Date().toISOString());
        setSyncStatus("synced");
        setCloudHydrated(true);
        return;
      }
      if (cloud === null && saved) {
        // Nothing stored for this account yet: seed it from this device.
        if (await saveCloudState(localState as unknown as Record<string, unknown>)) {
          setLastSyncedAt(new Date().toISOString());
          setSyncStatus("synced");
          setCloudHydrated(true);
          return;
        }
      }

      fetch("/api/user-state", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as {
          authenticated?: boolean;
          user?: AccountUser;
          state?: StoredState | null;
          updatedAt?: string | null;
          message?: string;
        };
        if (!response.ok || !payload.authenticated || !payload.user) {
          throw new Error(payload.message || "Cloudsync is niet beschikbaar.");
        }
        setAccount(payload.user);
        setSyncStatus("saving");
        const localUpdatedAt = localState.updatedAt ? Date.parse(localState.updatedAt) : 0;
        const cloudUpdatedAt = payload.updatedAt ? Date.parse(payload.updatedAt) : 0;
        if (payload.state && cloudUpdatedAt >= localUpdatedAt) {
          applyStoredState(payload.state);
        } else if (saved) {
          const migrationResponse = await fetch("/api/user-state", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: localState }),
          });
          if (!migrationResponse.ok) throw new Error("Lokale data kon niet worden gemigreerd.");
        }
        setLastSyncedAt(payload.updatedAt ?? new Date().toISOString());
        setSyncStatus("synced");
      })
      .catch(() => {
        setSyncStatus("offline");
      })
      .finally(() => setCloudHydrated(true));
    })();

    fetch("/api/progress-photos", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "Foto's konden niet worden geladen.");
        return payload as { photos: ProgressPhoto[] };
      })
      .then((payload) => setPhotos([...payload.photos].sort((a, b) => a.capturedOn.localeCompare(b.capturedOn))))
      .catch((error) => setPhotoError(photoErrorMessage(error, "Foto's konden niet worden geladen.")))
      .finally(() => setPhotosLoading(false));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const updatedAt = new Date().toISOString();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        plan,
        planMode,
        sciencePlanId,
        planSchemaVersion: CURRENT_PLAN_SCHEMA_VERSION,
        scheduleOverrides,
        completed,
        performance,
        sessions,
        metrics,
        targets,
        nutritionEntries,
        chatMessages,
        recoveryDraft,
        updatedAt,
      }),
    );
  }, [hydrated, plan, planMode, sciencePlanId, scheduleOverrides, completed, performance, sessions, metrics, targets, nutritionEntries, chatMessages, recoveryDraft]);

  useEffect(() => {
    if (!hydrated || !cloudHydrated || !account) return;
    const timer = window.setTimeout(() => {
      // The debounce decides when a save really starts, so the status flips
      // here rather than on every edit that only reschedules this timer.
      setSyncStatus("saving");
      const snapshot = {
        plan, planMode, sciencePlanId,
        planSchemaVersion: CURRENT_PLAN_SCHEMA_VERSION,
        scheduleOverrides, completed, performance, sessions, metrics, targets,
        nutritionEntries, chatMessages, recoveryDraft,
      };
      void saveCloudState(snapshot as unknown as Record<string, unknown>).then((ok) => {
        if (ok) {
          setLastSyncedAt(new Date().toISOString());
          setSyncStatus("synced");
        }
      });
      fetch("/api/user-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: {
            plan,
            planMode,
            sciencePlanId,
            planSchemaVersion: CURRENT_PLAN_SCHEMA_VERSION,
            scheduleOverrides,
            completed,
            performance,
            sessions,
            metrics,
            targets,
            nutritionEntries,
            chatMessages,
            recoveryDraft,
          },
        }),
      })
        .then(async (response) => {
          const payload = await response.json() as { updatedAt?: string; message?: string };
          if (!response.ok) throw new Error(payload.message || "Synchronisatie mislukt.");
          setLastSyncedAt(payload.updatedAt ?? new Date().toISOString());
          setSyncStatus("synced");
        })
        .catch(() => setSyncStatus((current) => (current === "synced" ? current : "offline")));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [hydrated, cloudHydrated, account, plan, planMode, sciencePlanId, scheduleOverrides, completed, performance, sessions, metrics, targets, nutritionEntries, chatMessages, recoveryDraft]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        LIVE_STORAGE_KEY,
        JSON.stringify({ rest: restTimer, session: liveSession, bar: barWeight } satisfies LiveState),
      );
    } catch {
      // Private mode or a full disk: the timer still runs for this visit.
    }
  }, [hydrated, restTimer, liveSession, barWeight]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(""), 3200);
    return () => window.clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    if (!photoViewerOpen || !photoPlaying || photos.length < 2) return;
    const lastIndex = photos.length - 1;
    const timer = window.setTimeout(() => {
      // A run ends on the last photo. Deciding that here, in the callback that
      // actually advances, keeps the effect body free of synchronous setState.
      if (photoIndex < lastIndex) setPhotoIndex(photoIndex + 1);
      if (photoIndex + 1 >= lastIndex) setPhotoPlaying(false);
    }, photoSpeed);
    return () => window.clearTimeout(timer);
  }, [photoIndex, photoPlaying, photoSpeed, photoViewerOpen, photos.length]);

  const activeSciencePlan = sciencePlanFromId(sciencePlanId);
  const basePlan = planMode === "personal" ? plan : activeSciencePlan.plan;
  const activePlan = [...basePlan, REST_DAY];
  const editableExerciseCatalog = useMemo(() => {
    const exercises = [
      ...plan.flatMap((workoutDay) => workoutDay.exercises),
      ...Object.values(SCIENCE_PLANS).flatMap((definition) => definition.plan.flatMap((workoutDay) => workoutDay.exercises)),
    ];
    return [...new Map(exercises.map((exercise) => [exercise.id, exercise])).values()]
      .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  }, [plan]);
  const workoutChoices = planMode === "personal"
    ? WORKOUT_CHOICES
    : [...activeSciencePlan.slots, "rest" as const];
  const activeProgramKey = programKey(planMode, sciencePlanId);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOpen, setMonthOpen] = useState(false);
  const weekAnchor = useMemo(() => {
    const anchor = startOfWeek();
    anchor.setDate(anchor.getDate() + weekOffset * 7);
    return anchor;
  }, [weekOffset]);
  const weekDays = useMemo(() => datesInWeek(weekAnchor), [weekAnchor]);
  const monthDays = useMemo(() => datesInMonthGrid(weekAnchor), [weekAnchor]);
  const monthAnchor = useMemo(() => monthOfWeek(weekAnchor), [weekAnchor]);
  const monthLabel = monthAnchor.toLocaleDateString("nl-BE", { month: "long", year: "numeric" });
  const weekLabel =
    weekOffset === 0 ? "Deze week"
      : weekOffset === -1 ? "Vorige week"
      : weekOffset === 1 ? "Volgende week"
      : weekOffset < 0 ? `${Math.abs(weekOffset)} weken geleden`
      : `Over ${weekOffset} weken`;
  const todayKey = dateKey();
  const selectedDateLabel = parseDateKey(selectedDate).toLocaleDateString("nl-BE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).replaceAll(".", "");
  const nutritionDateLabel = parseDateKey(nutritionDate).toLocaleDateString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const selectedNutritionEntries = useMemo(
    () => nutritionEntries.filter((entry) => entry.date === nutritionDate),
    [nutritionDate, nutritionEntries],
  );
  const nutritionTotals = useMemo(
    () => selectedNutritionEntries.reduce(
      (total, entry) => ({
        calories: total.calories + entry.calories,
        protein: total.protein + entry.protein,
        carbs: total.carbs + entry.carbs,
        fat: total.fat + entry.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    ),
    [selectedNutritionEntries],
  );
  const caloriesRemaining = Math.round(targets.calories - nutritionTotals.calories);
  const scheduleForDate = (value: string, mode: PlanMode = planMode, selectedSciencePlanId: SciencePlanId = sciencePlanId) => {
    const key = programKey(mode, selectedSciencePlanId);
    return scheduleOverrides[`${key}:${value}`]
      ?? (mode === "personal" || selectedSciencePlanId === "ppl-ul" ? scheduleOverrides[value] : undefined)
      ?? defaultScheduleForDate(value, mode, selectedSciencePlanId);
  };
  const workoutLabelForSlot = (dayId: CanonicalDayId) => {
    if (dayId === "rest") return "Rust";
    const templateId = planIdForMode(dayId, planMode, sciencePlanId);
    return activePlan.find((item) => item.id === templateId)?.short ?? "Training";
  };
  // The schedule is the one source of truth for which day is open. Every
  // handler that used to set this alongside a schedule change wrote back
  // exactly this value, so deriving it keeps the two from ever disagreeing.
  const selectedDay = planIdForMode(scheduleForDate(selectedDate), planMode, sciencePlanId);
  const day = activePlan.find((item) => item.id === selectedDay) ?? activePlan[0];
  const isRestDay = day.id === "rest";
  const exerciseScopeKey = `${activeProgramKey}:${selectedDate}:${day.id}`;
  // On the logging screen this is the exercise being logged.
  const storedOpenExerciseKey = openExerciseByScope[exerciseScopeKey];
  const primaryGuide = GUIDANCE[day.exercises[0]?.id ?? ""] ?? DEFAULT_GUIDE;
  const doneCount = isRestDay
    ? recoveryDraft.completedIds.length
    : day.exercises.filter((exercise) => completed[`${day.id}:${exercise.id}`]).length;
  const dayItemCount = isRestDay ? RECOVERY_ACTIVITIES.length : day.exercises.length;
  const completion = dayItemCount ? Math.round((doneCount / dayItemCount) * 100) : 0;
  const recoveryInsight = (() => {
    const sleep = Number(recoveryDraft.sleep);
    const soreness = Number(recoveryDraft.soreness);
    const energy = Number(recoveryDraft.energy);
    if (!sleep && !soreness && !energy) {
      return {
        tone: "neutral",
        title: "Vul je korte check-in in",
        body: "Dan stemt de app het herstelmenu af op hoe je je vandaag voelt.",
      };
    }
    if (sleep === 1 || energy === 1 || soreness === 3) {
      return {
        tone: "protect",
        title: "Vandaag echt licht houden",
        body: "Kies wandelen en zachte mobiliteit. Laat calf loading weg als je stijf of gevoelig bent.",
      };
    }
    if (sleep === 3 && energy === 3 && soreness <= 1) {
      return {
        tone: "good",
        title: "Herstelstatus is groen",
        body: "Je voelt je goed, maar hou dit een rustdag: drie korte blokken zijn ruim voldoende.",
      };
    }
    return {
      tone: "steady",
      title: "Normale herstelbehoefte",
      body: "Kies twee tot vier blokken die goed voelen. Je hoeft de lijst niet volledig af te werken.",
    };
  })();

  /**
   * The history panel reads newest first, but `sessions` is kept in the order
   * entries were saved. A workout logged late for an earlier day therefore
   * lands above the days that actually came after it, so order the panel by
   * the date on the entry instead of by when it was typed in.
   *
   * The stored array keeps its own order: `recentExerciseHistory` sorts by
   * timestamp itself and leans on that insertion order only to break ties.
   */
  const orderedSessions = useMemo(() => {
    // An unparseable date sorts last rather than dragging the list with it.
    const timestampOf = (session: Session) => {
      const value = new Date(session.date).getTime();
      return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
    };
    return [...sessions].sort((a, b) => timestampOf(b) - timestampOf(a));
  }, [sessions]);

  const orderedMetrics = useMemo(
    () => [...metrics].sort((a, b) => a.date.localeCompare(b.date)),
    [metrics],
  );

  const weightTrend = useMemo(() => {
    if (orderedMetrics.length < 2) return null;
    const first = orderedMetrics[0];
    const last = orderedMetrics[orderedMetrics.length - 1];
    const days = Math.max(
      1,
      (new Date(last.date).getTime() - new Date(first.date).getTime()) /
        86_400_000,
    );
    return ((last.weight - first.weight) / days) * 7;
  }, [orderedMetrics]);

  function changePlanMode(mode: PlanMode) {
    setPlanMode(mode);
  }

  function changeSciencePlan(value: string) {
    if (value !== "ppl-ul" && value !== "upper-lower" && value !== "full-body") return;
    const nextSciencePlanId: SciencePlanId = value;
    setSciencePlanId(nextSciencePlanId);
    setPlanMode("science");
    const nextPlan = sciencePlanFromId(nextSciencePlanId);
    setBanner(`${nextPlan.label} · ${nextPlan.daysLabel} actief`);
  }

  function selectAgendaDay(value: string) {
    setSelectedDate(value);
  }

  /**
   * Turns one calendar day into a training day or a rest day.
   *
   * Switching a rest day on hands it the plan slot used least that week, so
   * rearranging the week never silently drops a movement pattern.
   */
  function toggleScheduleDay(dateValue: string) {
    const current = scheduleForDate(dateValue);
    let next: CanonicalDayId = "rest";
    if (current === "rest") {
      const slots: CanonicalDayId[] = planMode === "personal"
        ? ["push", "pull", "legs", "lower", "upper"]
        : sciencePlanFromId(sciencePlanId).slots;
      const counts = new Map<CanonicalDayId, number>(slots.map((slot) => [slot, 0]));
      for (const calendarDate of weekDays) {
        const assigned = scheduleForDate(dateKey(calendarDate));
        if (counts.has(assigned)) counts.set(assigned, (counts.get(assigned) ?? 0) + 1);
      }
      next = slots.reduce((best, slot) => ((counts.get(slot) ?? 0) < (counts.get(best) ?? 0) ? slot : best), slots[0]);
    }
    setScheduleOverrides((currentOverrides) => ({
      ...currentOverrides,
      [`${activeProgramKey}:${dateValue}`]: next,
    }));
  }

  function chooseWorkoutForDate(dayId: CanonicalDayId) {
    setScheduleOverrides((current) => ({ ...current, [`${activeProgramKey}:${selectedDate}`]: dayId }));
    const template = activePlan.find((item) => item.id === planIdForMode(dayId, planMode, sciencePlanId)) ?? REST_DAY;
    setBanner(`${template.short} gekozen voor ${selectedDateLabel}`);
  }

  function movePlannedDay(targetDate: string) {
    if (!moveSourceDate || targetDate === moveSourceDate) return;
    const sourceAssignment = scheduleForDate(moveSourceDate);
    const targetAssignment = scheduleForDate(targetDate);
    setScheduleOverrides((current) => ({
      ...current,
      [`${activeProgramKey}:${moveSourceDate}`]: targetAssignment,
      [`${activeProgramKey}:${targetDate}`]: sourceAssignment,
    }));
    setSelectedDate(targetDate);
    const sourceName = activePlan.find((item) => item.id === planIdForMode(sourceAssignment, planMode, sciencePlanId))?.short ?? "Planning";
    const targetName = parseDateKey(targetDate).toLocaleDateString("nl-BE", { weekday: "long" });
    setMoveSourceDate(null);
    setBanner(`${sourceName} verplaatst naar ${targetName}`);
  }

  function setCountFor(exerciseId: string) {
    const exercise = day.exercises.find((item) => item.id === exerciseId);
    const count = exercise ? progressionTargets(exercise.prescription).length : 0;
    return count || WORKING_SETS[exerciseId] || 3;
  }

  function setRecoveryLevel(field: "sleep" | "soreness" | "energy", value: string) {
    setRecoveryDraft((current) => ({
      ...current,
      [field]: current[field] === value ? "" : value,
    }));
  }

  function toggleRecoveryActivity(activityId: string) {
    setRecoveryDraft((current) => ({
      ...current,
      completedIds: current.completedIds.includes(activityId)
        ? current.completedIds.filter((id) => id !== activityId)
        : [...current.completedIds, activityId],
    }));
  }

  function finishRecovery() {
    if (parseDateKey(selectedDate).getTime() > parseDateKey(todayKey).getTime()) {
      setBanner("Je kunt een toekomstige rest day nog niet opslaan");
      return false;
    }
    const activities = RECOVERY_ACTIVITIES.filter((activity) =>
      recoveryDraft.completedIds.includes(activity.id),
    );
    const session: Session = {
      id: newSessionId(),
      date: timestampForDate(selectedDate),
      dayId: "rest",
      dayLabel: "Rest day",
      sessionType: "recovery",
      completion,
      results: activities.map((activity) => ({
        exerciseId: activity.id,
        name: activity.name,
        recoveryDetail: activity.dose,
      })),
      recovery: {
        sleep: recoveryDraft.sleep,
        soreness: recoveryDraft.soreness,
        energy: recoveryDraft.energy,
        note: recoveryDraft.note.trim(),
        activities: activities.map((activity) => ({
          id: activity.id,
          name: activity.name,
          dose: activity.dose,
        })),
      },
    };
    setSessions((current) => {
      const existing = current.find(
        (entry) =>
          (entry.sessionType === "recovery" || entry.dayId === "rest") &&
          dateKey(new Date(entry.date)) === selectedDate,
      );
      return existing
        ? current.map((entry) => (entry.id === existing.id ? { ...session, id: existing.id, date: existing.date } : entry))
        : [session, ...current];
    });
    setRecoveryDraft({
      date: dateKey(),
      sleep: "",
      soreness: "",
      energy: "",
      note: "",
      completedIds: [],
    });
    setBanner(
      activities.length
        ? `Rest day opgeslagen voor ${selectedDateLabel} · ${activities.length} ${activities.length === 1 ? "herstelblok" : "herstelblokken"}`
        : `Volledige rustdag opgeslagen voor ${selectedDateLabel}`,
    );
    return true;
  }

  function finishSession() {
    if (parseDateKey(selectedDate).getTime() > parseDateKey(todayKey).getTime()) {
      setBanner("Je kunt een toekomstige sessie nog niet opslaan");
      return false;
    }
    const resultRows = day.exercises.map((exercise) => {
      const result = performance[`${day.id}:${exercise.id}`];
      return {
        exerciseId: exercise.id,
        name: exercise.name,
        sets: (result?.sets ?? emptySetsForExercise(exercise.id, progressionTargets(exercise.prescription).length || WORKING_SETS[exercise.id] || 3)).filter(
          (set) => set.weight || set.reps || set.pausedReps,
        ),
      };
    });
    // A date can only hold one workout. Re-opening a day you already logged
    // updates that session in place; appending a second one would double-count
    // every set in the history, the trend and the personal-record checks.
    const existing = sessions.find(
      (entry) =>
        entry.sessionType !== "recovery" &&
        entry.dayId === day.id &&
        dateKey(new Date(entry.date)) === selectedDate,
    );

    // The draft only holds what was typed this time, and finishing again changes
    // only that. Untouched exercises keep exactly what was saved; results this
    // plan does not list (a swap, a replacement or a custom exercise logged on
    // iOS) and fields this page does not know are kept, not dropped.
    const session: Session = existing
      ? refinishSession(existing, { dayId: day.id, dayLabel: day.short, completion, rows: resultRows })
      : {
          id: newSessionId(),
          date: timestampForDate(selectedDate),
          dayId: day.id,
          dayLabel: day.short,
          completion,
          results: resultRows,
        };
    const readyCount = day.exercises.filter((exercise) => {
      const sets = performance[`${day.id}:${exercise.id}`]?.sets ?? [];
      return sets.some((set) => set.weight || set.reps || set.pausedReps) &&
        liveProgressStatus(exercise, sets).tone === "ready";
    }).length;
    setSessions((current) =>
      existing
        ? current.map((entry) => (entry.id === existing.id ? session : entry))
        : [session, ...current],
    );
    setCompleted((current) => {
      const next = { ...current };
      day.exercises.forEach((exercise) => delete next[`${day.id}:${exercise.id}`]);
      return next;
    });
    setPerformance((current) => {
      const next = { ...current };
      day.exercises.forEach((exercise) => delete next[`${day.id}:${exercise.id}`]);
      return next;
    });
    const verb = existing ? "bijgewerkt" : "opgeslagen";
    setBanner(
      readyCount > 0
        ? `${day.short} ${verb} voor ${selectedDateLabel} · ${readyCount} ${readyCount === 1 ? "oefening mag" : "oefeningen mogen"} hoger`
        : `${day.short} ${verb} voor ${selectedDateLabel}`,
    );
    return true;
  }

  /**
   * Wipes this account's training progress everywhere, then hands the person
   * back to the same four questions they answered when they registered.
   *
   * Progress photos are deliberately left alone: they live in object storage,
   * deleting them is not undoable, and "ik heb me vergist bij het loggen" is
   * almost never a reason to throw away a year of photos. The dialog says so.
   */
  async function resetProgress() {
    setResetting(true);
    await clearCloudState().catch(() => false);
    await fetch("/api/user-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: {} }),
    }).catch(() => {});
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // The reload below still lands on a clean slate from the cloud.
    }
    clearOnboarded();
    // A full reload is the honest way to restart: every derived value in this
    // component is rebuilt from scratch rather than half-cleared in place.
    window.location.href = "/";
  }

  function saveExercise() {
    if (!editing) return;
    setPlan((current) =>
      current.map((workoutDay) =>
        workoutDay.id !== editing.dayId
          ? workoutDay
          : {
              ...workoutDay,
              exercises: workoutDay.exercises.map((exercise) =>
                exercise.id === editing.exercise.id ? editing.exercise : exercise,
              ),
            },
      ),
    );
    setEditing(null);
    setBanner("Oefening aangepast");
  }

  function chooseExerciseVariant(workoutDayId: string, exercise: Exercise, value: string) {
    if (value === "__manual__") {
      setEditing({ dayId: workoutDayId, exercise: { ...exercise } });
      return;
    }
    if (!value || value === exercise.name) return;
    setPlan((current) => current.map((workoutDay) =>
      workoutDay.id !== workoutDayId
        ? workoutDay
        : {
            ...workoutDay,
            exercises: workoutDay.exercises.map((item) =>
              item.id === exercise.id ? { ...item, name: value } : item,
            ),
          },
    ));
    setBanner(`${value} gekozen · je krachtgeschiedenis blijft gekoppeld`);
  }

  function addMetric() {
    const weight = Number(metricDraft.weight.replace(",", "."));
    const waist = Number(metricDraft.waist.replace(",", "."));
    if (!weight || !metricDraft.date) {
      setBanner("Vul minstens datum en gewicht in");
      return false;
    }
    const metric: Metric = {
      id: `${Date.now()}`,
      date: metricDraft.date,
      weight,
      waist: waist || undefined,
    };
    setMetrics((current) => [...current, metric].slice(-30));
    setMetricDraft((current) => ({ ...current, weight: "", waist: "" }));
    setBanner("Meting opgeslagen");
    return true;
  }

  async function uploadProgressPhoto() {
    const weight = Number(photoDraft.weight.replace(",", "."));
    setPhotoError("");
    if (!photoFile || !photoDraft.capturedOn || !Number.isFinite(weight) || weight < 35 || weight > 250) {
      setPhotoError("Kies een foto, datum en geldig gewicht.");
      return false;
    }
    if (photos.some((photo) => photo.capturedOn === photoDraft.capturedOn)) {
      setPhotoError("Voor deze datum bestaat al een check-in.");
      return false;
    }

    setPhotoUploadLoading(true);
    try {
      const prepared = await prepareProgressPhoto(photoFile);
      const form = new FormData();
      form.append("image", prepared.blob, prepared.filename);
      form.append("capturedOn", photoDraft.capturedOn);
      form.append("weight", String(weight));
      const response = await fetch("/api/progress-photos", { method: "POST", body: form });
      const payload = (await response.json()) as { photo?: ProgressPhoto; message?: string };
      if (!response.ok || !payload.photo) throw new Error(payload.message || "Upload mislukt.");
      setPhotos((current) => [...current, payload.photo!].sort((a, b) => a.capturedOn.localeCompare(b.capturedOn)));
      choosePhotoFile(null);
      setPhotoDraft((current) => ({ ...current, weight: "" }));
      setBanner("Dagelijkse check-in opgeslagen");
      return true;
    } catch (error) {
      setPhotoError(photoErrorMessage(error, "Upload mislukt."));
      return false;
    } finally {
      setPhotoUploadLoading(false);
    }
  }

  /**
   * Owns the preview blob URL. Minting it where the file is chosen ties the
   * blob's lifetime to that choice rather than to a render pass, and revoking
   * the previous one here leaves no cleanup for an effect to do.
   */
  function choosePhotoFile(file: File | null) {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : "");
  }

  function openPhoto(photoId: string) {
    const index = photos.findIndex((photo) => photo.id === photoId);
    setPhotoIndex(Math.max(0, index));
    setPhotoPlaying(false);
    setPhotoViewerOpen(true);
  }

  async function deleteEntry() {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "session") {
      setSessions((current) => current.filter((session) => session.id !== deleteTarget.id));
      setBanner("Trainingssessie verwijderd");
    } else if (deleteTarget.kind === "metric") {
      setMetrics((current) => current.filter((metric) => metric.id !== deleteTarget.id));
      setBanner("Lichaamsmeting verwijderd");
    } else if (deleteTarget.kind === "nutrition") {
      setNutritionEntries((current) => current.filter((entry) => entry.id !== deleteTarget.id));
      setBanner("Voedingsitem verwijderd");
    } else {
      try {
        const response = await fetch(`/api/progress-photos?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
        const payload = (await response.json()) as { message?: string };
        if (!response.ok) throw new Error(payload.message || "Foto kon niet worden verwijderd.");
        setPhotos((current) => current.filter((photo) => photo.id !== deleteTarget.id));
        setPhotoViewerOpen(false);
        setPhotoPlaying(false);
        setPhotoIndex(0);
        setBanner("Check-in en foto verwijderd");
      } catch (error) {
        setPhotoError(photoErrorMessage(error, "Foto kon niet worden verwijderd."));
      }
    }
    setDeleteTarget(null);
  }

  function openSessionEditor(session: Session) {
    setSessionEditError("");
    setEditingSession({
      ...session,
      results: session.results.map((row) => ({
        ...row,
        sets: resultSets(row).map((set) => ({ ...set })),
        weight: undefined,
        reps: undefined,
      })),
    });
  }

  function changeEditingSessionExercise(resultIndex: number, exerciseId: string) {
    const selectedExercise = editableExerciseCatalog.find((exercise) => exercise.id === exerciseId);
    if (!selectedExercise) return;
    setEditingSession((current) => current ? {
      ...current,
      results: current.results.map((row, index) => index === resultIndex
        ? { ...row, exerciseId: selectedExercise.id, name: selectedExercise.name }
        : row),
    } : current);
  }

  function updateEditingSessionSet(
    resultIndex: number,
    setIndex: number,
    field: "weight" | "reps" | "pausedReps" | "pauseSeconds",
    value: string,
  ) {
    setEditingSession((current) => {
      if (!current) return current;
      return {
        ...current,
        results: current.results.map((row, index) => {
          if (index !== resultIndex) return row;
          const sets = resultSets(row).map((set) => ({ ...set }));
          while (sets.length <= setIndex) sets.push({ weight: "", reps: "" });
          sets[setIndex] = boundPausedReps({ ...sets[setIndex], [field]: value });
          return { ...row, sets, weight: undefined, reps: undefined };
        }),
      };
    });
  }

  function toggleEditingSessionPause(resultIndex: number, setIndex: number) {
    setEditingSession((current) => {
      if (!current) return current;
      return {
        ...current,
        results: current.results.map((row, index) => {
          if (index !== resultIndex) return row;
          const sets = resultSets(row).map((set) => ({ ...set }));
          const set = sets[setIndex] ?? { weight: "", reps: "" };
          const pauseEnabled = !set.pauseEnabled;
          sets[setIndex] = {
            ...set,
            pauseEnabled,
            pausedReps: pauseEnabled ? set.pausedReps ?? "" : "",
            pauseSeconds: pauseEnabled ? set.pauseSeconds ?? "" : "",
          };
          return { ...row, sets, weight: undefined, reps: undefined };
        }),
      };
    });
  }

  function addEditingSessionSet(resultIndex: number) {
    setEditingSession((current) => current ? {
      ...current,
      results: current.results.map((row, index) => index === resultIndex
        ? { ...row, sets: [...resultSets(row), { weight: "", reps: "" }], weight: undefined, reps: undefined }
        : row),
    } : current);
  }

  function removeEditingSessionSet(resultIndex: number, setIndex: number) {
    setEditingSession((current) => current ? {
      ...current,
      results: current.results.map((row, index) => index === resultIndex
        ? { ...row, sets: resultSets(row).filter((_, indexToKeep) => indexToKeep !== setIndex), weight: undefined, reps: undefined }
        : row),
    } : current);
  }

  function removeEditingSessionExercise(resultIndex: number) {
    setEditingSession((current) => current ? {
      ...current,
      results: current.results.filter((_, index) => index !== resultIndex),
    } : current);
  }

  function addEditingSessionExercise() {
    setEditingSession((current) => {
      if (!current) return current;
      const usedIds = new Set(current.results.map((row) => row.exerciseId));
      const nextExercise = editableExerciseCatalog.find((exercise) => !usedIds.has(exercise.id)) ?? editableExerciseCatalog[0];
      if (!nextExercise) return current;
      return {
        ...current,
        results: [...current.results, {
          exerciseId: nextExercise.id,
          name: nextExercise.name,
          sets: [{ weight: "", reps: "" }],
        }],
      };
    });
  }

  function saveEditedSession() {
    if (!editingSession) return;
    const results = editingSession.results.map((row) => ({
      ...row,
      sets: resultSets(row).filter((set) => set.weight || set.reps || set.pausedReps || set.pauseSeconds),
      weight: undefined,
      reps: undefined,
    })).filter((row) => row.name.trim() && row.sets.length > 0);

    if (!results.length) {
      setSessionEditError("Behoud minstens één oefening met een ingevulde set.");
      return;
    }

    setSessions((current) => current.map((session) => session.id === editingSession.id
      ? { ...editingSession, results }
      : session));
    setEditingSession(null);
    setSessionEditError("");
    setBanner("Workout aangepast · progressie opnieuw berekend");
  }

  function shiftNutritionDate(days: number) {
    setNutritionDate((current) => shiftDateKey(current, days));
  }

  function fillNutritionFromFood(food: FoodSearchResult, amountValue: string) {
    const amount = Math.max(0, numberValue(amountValue));
    const factor = amount / 100;
    const macro = (value: number) => String(Math.round(value * factor * 10) / 10);
    setNutritionDraft((current) => ({
      ...current,
      name: amount > 0 ? `${amountValue.replace(".", ",")} g ${food.name}` : food.name,
      calories: amount > 0 ? String(Math.round(food.calories * factor)) : "",
      protein: amount > 0 ? macro(food.protein) : "",
      carbs: amount > 0 ? macro(food.carbs) : "",
      fat: amount > 0 ? macro(food.fat) : "",
    }));
  }

  function chooseFood(food: FoodSearchResult) {
    setSelectedFood(food);
    setFoodAmount("100");
    fillNutritionFromFood(food, "100");
    setFoodResults([]);
    setFoodSearchError("");
  }

  function changeFoodAmount(value: string) {
    setFoodAmount(value);
    if (selectedFood) fillNutritionFromFood(selectedFood, value);
  }

  function chooseMealIdea(idea: MealIdea) {
    setNutritionDraft({
      meal: idea.meal,
      name: idea.name,
      calories: String(idea.calories),
      protein: String(idea.protein),
      carbs: String(idea.carbs),
      fat: String(idea.fat),
    });
    setFoodQuery("");
    setFoodResults([]);
    setSelectedFood(null);
    setFoodAmount("100");
    setFoodSearchError("");
    setBanner(`${idea.name} staat klaar · controleer je portie`);
    window.requestAnimationFrame(() => {
      document.getElementById("nutrition-entry-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function searchFoodProducts() {
    const query = foodQuery.trim();
    if (query.length < 2 || foodSearchLoading) {
      if (query.length < 2) setFoodSearchError("Typ minstens twee tekens.");
      return;
    }
    setFoodSearchLoading(true);
    setFoodSearchError("");
    setSelectedFood(null);
    try {
      const response = await fetch(`/api/food-search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const payload = (await response.json()) as { results?: FoodSearchResult[]; message?: string };
      if (!response.ok) throw new Error(payload.message || "Producten konden niet worden gezocht.");
      setFoodResults(payload.results ?? []);
      if (!payload.results?.length) setFoodSearchError("Geen producten gevonden. Je kunt het nog altijd handmatig invullen.");
    } catch (error) {
      setFoodResults([]);
      setFoodSearchError(error instanceof Error ? error.message : "Producten konden niet worden gezocht.");
    } finally {
      setFoodSearchLoading(false);
    }
  }

  function addNutritionEntry() {
    const name = nutritionDraft.name.trim();
    const protein = numberValue(nutritionDraft.protein);
    const carbs = numberValue(nutritionDraft.carbs);
    const fat = numberValue(nutritionDraft.fat);
    const enteredCalories = numberValue(nutritionDraft.calories);
    const calculatedCalories = Math.round((protein * 4) + (carbs * 4) + (fat * 9));
    const calories = enteredCalories || calculatedCalories;

    if (!name || calories <= 0) {
      setBanner("Vul een naam en calorieën of macro’s in");
      return false;
    }

    const entry: NutritionEntry = {
      id: `food-${Date.now()}`,
      date: nutritionDate,
      meal: nutritionDraft.meal,
      name,
      calories,
      protein,
      carbs,
      fat,
    };
    setNutritionEntries((current) => [...current, entry]);
    setNutritionDraft((current) => ({
      ...current,
      name: "",
      calories: "",
      protein: "",
      carbs: "",
      fat: "",
    }));
    setFoodQuery("");
    setFoodResults([]);
    setSelectedFood(null);
    setFoodAmount("100");
    setFoodSearchError("");
    setBanner(`${name} toegevoegd aan ${nutritionDateLabel}`);
    return true;
  }

  function recentExerciseHistory(exerciseId: string) {
    const selectedDateEnd = parseDateKey(selectedDate);
    selectedDateEnd.setHours(23, 59, 59, 999);
    const activeScienceDayIds = new Set(activeSciencePlan.plan.map((workoutDay) => workoutDay.id));

    return sessions.flatMap((session, sourceIndex) => {
      const isScienceSession = session.dayId.startsWith("science-");
      if (isScienceSession !== (planMode === "science")) return [];
      if (planMode === "science" && !activeScienceDayIds.has(session.dayId)) return [];
      const timestamp = new Date(session.date).getTime();
      if (!Number.isFinite(timestamp) || timestamp > selectedDateEnd.getTime()) return [];
      const result = session.results.find((row) => row.exerciseId === exerciseId);
      if (!result) return [];
      const sets = resultSets(result).filter((set) => set.weight || set.reps || set.pausedReps);
      return sets.length ? [{ date: session.date, sets, sourceIndex, timestamp }] : [];
    }).sort((a, b) => b.timestamp - a.timestamp || a.sourceIndex - b.sourceIndex)
      .map(({ date, sets }) => ({ date, sets }));
  }

  function recentExerciseSets(exerciseId: string) {
    return recentExerciseHistory(exerciseId).map(({ sets }) => ({ sets }));
  }

  function strengthTrendPoints(exerciseId: string, currentSets: SetResult[]): StrengthTrendPoint[] {
    const history = recentExerciseHistory(exerciseId)
      .map((entry) => {
        const best = bestStrengthSet(entry.sets);
        if (!best) return null;
        return {
          label: new Date(entry.date).toLocaleDateString("nl-BE", { day: "numeric", month: "short" }).replaceAll(".", ""),
          ...best,
        };
      })
      .filter((point): point is StrengthTrendPoint => Boolean(point))
      .slice(0, 5)
      .reverse();
    const current = bestStrengthSet(currentSets);
    if (current) history.push({ label: "Nu", ...current, current: true });
    return history;
  }

  function strengthRecord(exerciseId: string, currentSets: SetResult[]) {
    const current = bestStrengthSet(currentSets);
    const history = recentExerciseHistory(exerciseId);
    const previous = history[0] ? bestStrengthSet(history[0].sets) : null;
    if (!current || !previous || current.value <= previous.value + 0.05) return null;

    const allTimeBest = Math.max(
      ...history.map((entry) => bestStrengthSet(entry.sets)?.value ?? 0),
    );
    const isAllTime = current.value > allTimeBest + 0.05;
    const sameWeightRepGain = current.weight === previous.weight && current.reps > previous.reps;
    return {
      allTime: isAllTime,
      title: isAllTime ? "Nieuw persoonlijk record" : "Sterker dan vorige sessie",
      detail: sameWeightRepGain
        ? `+${current.reps - previous.reps} ${current.reps - previous.reps === 1 ? "rep" : "reps"} op ${current.weight.toLocaleString("nl-BE")} kg`
        : `+${(current.value - previous.value).toLocaleString("nl-BE", { maximumFractionDigits: 1 })} kg geschatte kracht`,
    };
  }

  function setProgressSignal(exerciseId: string, setIndex: number, current: SetResult): SetSignal | null {
    const previous = recentExerciseSets(exerciseId)[0]?.sets[setIndex];
    if (!previous) return null;
    const currentWeight = numberValue(current.weight);
    const previousWeight = numberValue(previous.weight);
    const currentReps = completedReps(current);
    const previousReps = completedReps(previous);
    if (!currentWeight || !currentReps || !previousWeight || !previousReps) return null;

    if (currentWeight > previousWeight) {
      const gain = currentWeight - previousWeight;
      // Above ten reps there is no estimate to compare (§10.2 guard 2), so the
      // set states the weight it added and claims nothing about strength.
      const estimatedNow = estimate1RM(currentWeight, currentReps);
      const estimatedBefore = estimate1RM(previousWeight, previousReps);
      const stronger = estimatedNow !== null && estimatedBefore !== null
        ? estimatedNow >= estimatedBefore
        : null;
      return {
        metric: `+${gain.toLocaleString("nl-BE")} kg`,
        label: stronger === null
          ? `Meer gewicht · ${currentWeight.toLocaleString("nl-BE")} kg`
          : stronger
            ? "Sterkere set dan vorige keer"
            : "Meer gewicht · bouw je reps verder op",
        tone: stronger ? "good" : "neutral",
      };
    }
    if (currentWeight === previousWeight && currentReps > previousReps) {
      const gain = currentReps - previousReps;
      return {
        metric: `+${gain} ${gain === 1 ? "rep" : "reps"}`,
        label: `Zelfde gewicht · ${currentWeight.toLocaleString("nl-BE")} kg`,
        tone: "good",
      };
    }

    const estimatedNow = estimate1RM(currentWeight, currentReps);
    const estimatedBefore = estimate1RM(previousWeight, previousReps);
    if (estimatedNow === null || estimatedBefore === null) return null;
    const estimatedGain = ((estimatedNow / estimatedBefore) - 1) * 100;
    if (estimatedGain >= 0.5) {
      return {
        metric: `+${estimatedGain.toLocaleString("nl-BE", { maximumFractionDigits: 1 })}%`,
        label: "Meer geschatte kracht dan vorige keer",
        tone: "good",
      };
    }
    return null;
  }

  function liveProgressStatus(exercise: Exercise, currentSets: SetResult[]) {
    const targets = progressionTargets(exercise.prescription);
    const filled = currentSets.filter((set) => set.weight || set.reps || set.pausedReps);
    if (!filled.length || !targets.length) return progressStatus(exercise);

    const relevantTargets = targets.slice(0, Math.min(targets.length, filled.length));
    const currentQualifies = relevantTargets.length === targets.length && relevantTargets.every(
      (target, index) => completedReps(currentSets[index] ?? { weight: "", reps: "" }) >= target,
    );
    const previous = recentExerciseSets(exercise.id)[0]?.sets;
    const sameLoads = Boolean(previous) && relevantTargets.every(
      (_, index) => numberValue(currentSets[index]?.weight) === numberValue(previous?.[index]?.weight),
    );
    const previousQualifies = Boolean(previous) && relevantTargets.length === targets.length && relevantTargets.every(
      (target, index) => completedReps(previous?.[index] ?? { weight: "", reps: "" }) >= target,
    );

    if (currentQualifies && previousQualifies && sameLoads) {
      return { label: "Bovengrens bevestigd — je mag volgende sessie hoger", tone: "ready" };
    }
    if (currentQualifies) {
      return { label: "Bovengrens gehaald — bevestig dit nog 1 sessie", tone: "close" };
    }

    const signals = currentSets
      .map((set, index) => setProgressSignal(exercise.id, index, set))
      .filter((signal): signal is SetSignal => Boolean(signal));
    if (signals.length) {
      return { label: `Live progressie op ${signals.length} ${signals.length === 1 ? "set" : "sets"}`, tone: "close" };
    }
    return progressStatus(exercise);
  }

  function progressStatus(exercise: Exercise) {
    const guide = GUIDANCE[exercise.id] ?? DEFAULT_GUIDE;
    const targets = progressionTargets(exercise.prescription);
    const advanceAt = guide.advanceAt ?? Math.max(...targets);
    if (!Number.isFinite(advanceAt) || targets.length === 0) {
      return { label: "Dubbele progressie", tone: "neutral" };
    }

    const recent = recentExerciseSets(exercise.id);

    const latest = recent[0];
    if (!latest) {
      return { label: "Nog geen historie", tone: "neutral" };
    }

    const relevantTargets = targets.slice(0, latest.sets.length);
    const qualifies = (sets: SetResult[]) =>
      relevantTargets.length > 0 &&
      relevantTargets.every((target, index) =>
        sets[index] ? completedReps(sets[index]) >= target : false,
      );
    const sameLoads = (sets: SetResult[]) =>
      relevantTargets.every((_, index) =>
        (sets[index]?.weight ?? "").replace(",", ".") ===
        (latest.sets[index]?.weight ?? "").replace(",", "."),
      );

    let streak = 0;
    for (const result of recent) {
      if (!sameLoads(result.sets) || !qualifies(result.sets)) break;
      streak += 1;
    }

    const topSet = latest.sets[0];
    const loadLabel = topSet?.weight ? `${topSet.weight} kg` : "dit gewicht";
    if (streak >= 2) {
      return { label: `Klaar om te verhogen vanaf ${loadLabel}`, tone: "ready" };
    }
    if (streak === 1) {
      return { label: `Nog 1 bevestiging op ${loadLabel}`, tone: "close" };
    }

    const missing = relevantTargets.reduce(
      (total, target, index) =>
        total + Math.max(0, target - completedReps(latest.sets[index] ?? { weight: "", reps: "" })),
      0,
    );
    const previous = recent[1];
    if (previous && sameLoads(previous.sets)) {
      const latestTotal = latest.sets.reduce((total, set) => total + completedReps(set), 0);
      const previousTotal = previous.sets.reduce((total, set) => total + completedReps(set), 0);
      if (latestTotal > previousTotal) {
        return {
          label: `Vooruitgang: +${latestTotal - previousTotal} reps op hetzelfde gewicht`,
          tone: "close",
        };
      }
    }
    return {
      label: missing > 0 ? `Nog ${missing} reps verdeeld over je sets` : `Bouw verder op ${loadLabel}`,
      tone: "neutral",
    };
  }

  const viewerPhoto = photos[Math.min(photoIndex, Math.max(0, photos.length - 1))];
  const weekRangeLabel = `${weekDays[0].toLocaleDateString("nl-BE", { day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString("nl-BE", { day: "numeric", month: "short" })}`.replaceAll(".", "");
  const moveSourceAssignment = moveSourceDate ? scheduleForDate(moveSourceDate) : null;
  const moveSourceTemplate = moveSourceAssignment
    ? activePlan.find((item) => item.id === planIdForMode(moveSourceAssignment, planMode, sciencePlanId))
    : null;
  const selectedActualSessions = sessions.filter((session) => dateKey(new Date(session.date)) === selectedDate);
  const selectedActualWorkout = selectedActualSessions.find((session) => session.sessionType !== "recovery" && session.dayId !== "rest");
  const selectedActualRecovery = selectedActualSessions.find((session) => session.sessionType === "recovery" || session.dayId === "rest");
  const plannedSetCount = isRestDay
    ? 0
    : day.exercises.reduce(
        (total, exercise) => total + (progressionTargets(exercise.prescription).length || WORKING_SETS[exercise.id] || 3),
        0,
      );
  const draftTrackedSetCount = isRestDay
    ? 0
    : day.exercises.reduce((total, exercise) => {
        const sets = performance[`${day.id}:${exercise.id}`]?.sets ?? [];
        return total + sets.filter((set) => set.weight || set.reps || set.pausedReps).length;
      }, 0);
  const savedTrackedSetCount = selectedActualWorkout?.dayId === day.id
    ? selectedActualWorkout.results.reduce(
        (total, result) => total + resultSets(result).filter((set) => set.weight || set.reps || set.pausedReps).length,
        0,
      )
    : 0;
  const trackedSetCount = Math.max(draftTrackedSetCount, savedTrackedSetCount);
  const accountInitials = account?.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "YT";

  const syncLabel = syncStatus === "saving"
    ? "Opslaan…"
    : syncStatus === "synced"
      ? "Opgeslagen in de cloud"
      : syncStatus === "offline"
        ? "Alleen op dit toestel"
        : "Verbinden…";

  /** The banner has room for a state, not a sentence. Same meaning, fewer words. */
  const shortSyncLabel = !account
    ? "Niet aangemeld"
    : syncStatus === "synced"
      ? "Opgeslagen"
      : syncStatus === "offline"
        ? "Alleen dit toestel"
        : "Opslaan…";

  /* ======================================================================
     SETLINE screens. Everything below reads the same state as before; the
     screens only arrange it differently.
     ====================================================================== */

  const isToday = selectedDate === todayKey;
  const selectedIsFuture = selectedDate > todayKey;
  const programLabel = planMode === "personal" ? "Mijn plan" : activeSciencePlan.label;
  const setsPlannedFor = (exercise: Exercise) =>
    progressionTargets(exercise.prescription).length || WORKING_SETS[exercise.id] || 3;
  const minutesFor = (template: WorkoutDay) =>
    estimateSessionMinutes(
      template.exercises.map((exercise) => ({ sets: setsPlannedFor(exercise), restSeconds: parseRestSeconds(exercise.rest) })),
    );
  const templateForDate = (value: string) =>
    activePlan.find((item) => item.id === planIdForMode(scheduleForDate(value), planMode, sciencePlanId)) ?? REST_DAY;
  const isWorkoutSession = (session: Session) => session.sessionType !== "recovery" && session.dayId !== "rest";
  const loggedSetsIn = (session: Session) =>
    session.results.reduce((total, row) => total + resultSets(row).filter(isLoggedSet).length, 0);
  const shortDate = (date: Date) =>
    date.toLocaleDateString("nl-BE", { day: "numeric", month: "short" }).replaceAll(".", "");
  const weekdayShort = (date: Date) =>
    date.toLocaleDateString("nl-BE", { weekday: "short" }).replaceAll(".", "");
  const topWeightOf = (sets: SetResult[]) =>
    sets.reduce((best, set) => Math.max(best, numberValue(set.weight)), 0);
  const selectedDateLong = capitalize(
    parseDateKey(selectedDate).toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" }),
  );
  const firstName = account?.displayName?.trim().split(/\s+/)[0] ?? "";
  const avatarInitial = (account?.displayName?.trim() || account?.email || "").charAt(0).toUpperCase();
  const dataOnlyHere = !account || syncStatus === "offline";

  // --- Training: the day card
  const cardSession = selectedActualWorkout ?? (isRestDay ? selectedActualRecovery : undefined);
  const cardKind: "train" | "active" | "rest" | "done" = cardSession
    ? "done"
    : isRestDay
      ? "rest"
      : draftTrackedSetCount > 0 && !selectedIsFuture
        ? "active"
        : "train";
  const cardTitle = cardKind === "done" ? "Voltooid" : isRestDay ? "Rust" : day.short;
  const cardFocus = cardKind === "done"
    ? selectedActualWorkout
      ? `${selectedActualWorkout.dayLabel} · ${loggedSetsIn(selectedActualWorkout)} sets gelogd`
      : `Herstel gelogd · ${selectedActualRecovery?.recovery?.activities.length ?? selectedActualRecovery?.results.length ?? 0} herstelblokken`
    : isRestDay
      ? "Geen training gepland"
      : day.focus;
  const cardLetter = cardKind === "done" ? "" : letterForTemplate(day);
  const stripKeys = weekDays.map((date) => dateKey(date));
  const stripIndex = stripKeys.indexOf(selectedDate);
  const prevKey = stripIndex > 0 ? stripKeys[stripIndex - 1] : null;
  const nextKey = stripIndex >= 0 && stripIndex < stripKeys.length - 1 ? stripKeys[stripIndex + 1] : null;
  const restOfWeek = datesInWeek(parseDateKey(todayKey))
    .filter((date) => dateKey(date) > todayKey)
    .map((date) => {
      const key = dateKey(date);
      return { date, key, template: templateForDate(key) };
    });

  function changeTab(value: string) {
    if (value === "account" && activeTab !== "account") setReturnTab(activeTab);
    setActiveTab(value);
    window.scrollTo({ top: 0 });
  }

  /** Moves the day card, sliding in from the side it came from. */
  function goToDate(value: string, direction: 1 | -1 | 0 = 0) {
    if (value === selectedDate) return;
    selectAgendaDay(value);
    setStepDraft(null);
    setCorrecting(null);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!direction || reduceMotion) {
      setCardDrag({ x: 0, animate: false });
      return;
    }
    setCardDrag({ x: direction * 56, animate: false });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => setCardDrag({ x: 0, animate: true })));
  }

  function cardPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cardSwipe.current = { x: event.clientX, y: event.clientY, dragging: false };
  }

  function cardPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const swipe = cardSwipe.current;
    if (!swipe) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (!swipe.dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipe.dragging = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; the swipe still ends.
      }
    }
    if (swipe.dragging) setCardDrag({ x: dx * 0.9, animate: false });
  }

  function cardPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const swipe = cardSwipe.current;
    cardSwipe.current = null;
    if (!swipe?.dragging) return;
    const dx = event.clientX - swipe.x;
    if (dx < -64 && nextKey) goToDate(nextKey, 1);
    else if (dx > 64 && prevKey) goToDate(prevKey, -1);
    else setCardDrag({ x: 0, animate: true });
  }

  const liveKey = `${selectedDate}:${day.id}`;

  /** Start is the only way into a session; the preview never starts one. */
  function startTraining() {
    if (!liveSession || liveSession.key !== liveKey) setLiveSession({ key: liveKey, startedAt: Date.now() });
    setPreviewOpen(false);
    setAgendaOpen(false);
    changeTab("loggen");
  }

  /** Logging a day that has passed: no session clock, no rest timer. */
  function logAfterwards() {
    setPreviewOpen(false);
    setAgendaOpen(false);
    changeTab("loggen");
  }

  function openAgenda(expandSelected: boolean) {
    setAgendaDay(expandSelected ? selectedDate : null);
    setAgendaOpen(true);
  }

  // --- Loggen
  const logRows = isRestDay
    ? []
    : day.exercises.map((exercise) => {
        const key = `${day.id}:${exercise.id}`;
        const prescribed = setsPlannedFor(exercise);
        const draft = performance[key]?.sets;
        const savedRow = selectedActualWorkout?.dayId === day.id
          ? selectedActualWorkout.results.find((row) => row.exerciseId === exercise.id)
          : undefined;
        // What was typed this time wins; a day already saved shows what was saved.
        const base = draft?.some(isLoggedSet) ? draft : savedRow ? resultSets(savedRow) : draft ?? [];
        const sets = [...base, ...emptySetsForExercise(exercise.id, Math.max(0, prescribed - base.length))];
        const logged = sets.filter(isLoggedSet).length;
        return { exercise, key, prescribed, sets, logged, done: Boolean(completed[key]) || logged >= prescribed };
      });
  const storedLogIndex = logRows.findIndex((row) => row.key === storedOpenExerciseKey);
  const logIndex = storedLogIndex >= 0 ? storedLogIndex : Math.max(0, logRows.findIndex((row) => !row.done));
  const logRow = logRows[logIndex] as (typeof logRows)[number] | undefined;
  const logExercise = logRow?.exercise;
  const logHistory = logExercise ? recentExerciseHistory(logExercise.id) : [];
  const logPrevious = logHistory[0];
  const logPreviousSets = logPrevious?.sets ?? [];
  const logTargets = logExercise ? progressionTargets(logExercise.prescription) : [];
  const firstOpenSet = logRow ? logRow.sets.findIndex((set) => !isLoggedSet(set)) : -1;
  const correctingIndex = logRow && correcting?.key === logRow.key && correcting.index < logRow.sets.length
    ? correcting.index
    : null;
  const focusIndex = correctingIndex ?? (firstOpenSet >= 0 ? firstOpenSet : null);
  const focusKey = logRow && focusIndex !== null ? `${logRow.key}#${focusIndex}` : null;
  const supportsPause = Boolean(
    logExercise && (logExercise.id.includes("bench") || logExercise.name.toLowerCase().includes("bench")),
  );
  const focusDefaults = (() => {
    if (!logRow || !logExercise || focusIndex === null) return null;
    if (correctingIndex !== null) {
      const set = logRow.sets[correctingIndex];
      return {
        weight: numberValue(set.weight),
        reps: completedReps(set) || null,
        source: "correct" as const,
        pauseEnabled: Boolean(set.pauseEnabled),
        pausedReps: numberValue(set.pausedReps) || null,
        pauseSeconds: numberValue(set.pauseSeconds) || null,
      };
    }
    const guess = defaultSetValues({
      current: logRow.sets,
      previous: logPreviousSets,
      index: focusIndex,
      targetReps: logTargets[focusIndex] ?? logTargets[logTargets.length - 1] ?? null,
    });
    const template = emptySetForExercise(logExercise.id);
    const previousSet = logPreviousSets[focusIndex];
    return {
      weight: guess.weight,
      reps: guess.reps,
      source: guess.source,
      pauseEnabled: Boolean(template.pauseEnabled || previousSet?.pauseEnabled),
      pausedReps: null,
      pauseSeconds: numberValue(previousSet?.pauseSeconds) || numberValue(template.pauseSeconds) || null,
    };
  })();
  const focusEdited = Boolean(focusDefaults && focusKey && stepDraft?.key === focusKey);
  const focusValues = focusDefaults && focusEdited && stepDraft ? { ...focusDefaults, ...stepDraft } : focusDefaults;
  const focusStatus = !focusValues || !logExercise
    ? ""
    : correctingIndex !== null
      ? focusEdited ? "aangepast · nog niet bewaard" : "al opgeslagen"
      : focusEdited
        ? "aangepast"
        : focusValues.source === "current" && focusValues.weight !== null
          ? `overgenomen: ${formatKg(focusValues.weight)} kg`
          : focusValues.source === "previous" && logPrevious
            ? `doel uit ${shortDate(new Date(logPrevious.date))}`
            : focusValues.source === "plan"
              ? `doel uit je plan · ${logExercise.prescription}`
              : "nog niet opgeslagen";
  // A day that has not come yet can be looked at, not logged: its sets would
  // land in the draft that today's session of the same workout also uses.
  const canSaveFocus = !selectedIsFuture
    && Boolean(focusValues && focusValues.weight !== null && focusValues.reps !== null && focusValues.reps > 0);
  const nextOpenIndex = (() => {
    const after = logRows.findIndex((row, index) => index > logIndex && !row.done);
    return after >= 0 ? after : logRows.findIndex((row, index) => index !== logIndex && !row.done);
  })();
  const canFinishSession = !selectedIsFuture && (draftTrackedSetCount > 0 || doneCount > 0 || selectedActualWorkout?.dayId === day.id);
  const logStatus = logExercise ? liveProgressStatus(logExercise, logRow?.sets ?? []) : null;
  const logRecord = logExercise && logRow ? strengthRecord(logExercise.id, logRow.sets) : null;
  const logGuide = logExercise ? GUIDANCE[logExercise.id] ?? DEFAULT_GUIDE : DEFAULT_GUIDE;
  const logTrend = logExercise && logRow ? strengthTrendPoints(logExercise.id, logRow.sets) : [];
  const logVariants = (() => {
    if (!logExercise || planMode !== "personal") return [];
    const originalExercise = DEFAULT_PLAN.flatMap((workoutDay) => workoutDay.exercises).find((item) => item.id === logExercise.id);
    const options: Array<{ name: string; fit: string; why?: string }> = [
      ...(originalExercise ? [{ name: originalExercise.name, fit: "Jouw schema" }] : []),
      ...(ALTERNATIVES[logExercise.id] ?? []).map((alternative) => ({ name: alternative.name, fit: alternative.fit, why: alternative.why })),
    ].filter((option, index, list) => list.findIndex((item) => item.name === option.name) === index);
    if (!options.some((option) => option.name === logExercise.name)) options.unshift({ name: logExercise.name, fit: "Actief" });
    return options;
  })();

  function updateFocus(patch: Partial<Omit<StepDraft, "key">>) {
    if (!focusKey || !focusValues) return;
    setStepDraft({
      key: focusKey,
      weight: focusValues.weight,
      reps: focusValues.reps,
      pauseEnabled: focusValues.pauseEnabled,
      pausedReps: focusValues.pausedReps,
      pauseSeconds: focusValues.pauseSeconds,
      ...patch,
    });
  }

  /**
   * Writes one exercise's sets. A day that was already saved seeds the draft
   * with what was saved, because finishing again replaces an exercise's saved
   * sets with the draft's (see refinishSession) — a draft holding only the
   * corrected set would drop the others.
   */
  function writeExerciseSets(exerciseId: string, update: (sets: SetResult[]) => SetResult[]) {
    const key = `${day.id}:${exerciseId}`;
    const prescribed = setCountFor(exerciseId);
    const savedRow = selectedActualWorkout?.dayId === day.id
      ? selectedActualWorkout.results.find((row) => row.exerciseId === exerciseId)
      : undefined;
    const saved = savedRow ? resultSets(savedRow).map((set) => ({ ...set })) : null;
    setPerformance((current) => {
      const existing = current[key];
      const base = existing?.sets.some(isLoggedSet) ? existing.sets : saved ?? existing?.sets ?? [];
      const sets = base.map((set) => ({ ...set }));
      while (sets.length < prescribed) sets.push(emptySetForExercise(exerciseId));
      return { ...current, [key]: { sets: update(sets), note: existing?.note ?? "" } };
    });
  }

  function saveFocusedSet() {
    if (!logRow || !logExercise || focusIndex === null || !focusValues || !canSaveFocus) return;
    const weight = focusValues.weight ?? 0;
    const reps = focusValues.reps ?? 0;
    const pause = supportsPause && focusValues.pauseEnabled;
    const value: SetResult = boundPausedReps({
      weight: weight > 0 ? formatKg(weight) : "",
      reps: String(reps),
      ...(supportsPause
        ? {
            pauseEnabled: pause,
            pausedReps: pause && focusValues.pausedReps ? String(focusValues.pausedReps) : "",
            pauseSeconds: pause && focusValues.pauseSeconds ? String(focusValues.pauseSeconds) : "",
          }
        : {}),
    });
    const index = focusIndex;
    writeExerciseSets(logExercise.id, (sets) => {
      sets[index] = value;
      return sets;
    });
    // Stay on this exercise once its last set is in: moving on is a tap on
    // "Volgende oefening", not something the screen does on its own.
    setOpenExerciseByScope((current) => ({ ...current, [exerciseScopeKey]: logRow.key }));
    const loggedAfter = logRow.sets.filter((set, position) => position === index || isLoggedSet(set)).length;
    if (loggedAfter >= logRow.prescribed) setCompleted((current) => ({ ...current, [logRow.key]: true }));
    const correction = correctingIndex !== null;
    setStepDraft(null);
    setCorrecting(null);
    setLogAnnouncement(
      `Set ${index + 1} ${correction ? "bijgewerkt" : "opgeslagen"}: ${weight > 0 ? `${formatKg(weight)} kilo` : "zonder gewicht"} maal ${reps}`,
    );
    // A rest and a session clock only mean something while training today.
    if (!correction && isToday) {
      const planned = parseRestSeconds(logExercise.rest) ?? 120;
      const now = Date.now();
      setRestTimer({ endsAt: now + planned * 1000, total: planned, planned });
      if (!liveSession || liveSession.key !== liveKey) setLiveSession({ key: liveKey, startedAt: now });
    }
  }

  function clearCorrectedSet() {
    if (!logRow || !logExercise || correctingIndex === null) return;
    const index = correctingIndex;
    const exerciseId = logExercise.id;
    const prescribed = logRow.prescribed;
    writeExerciseSets(exerciseId, (sets) => {
      if (index >= prescribed) sets.splice(index, 1);
      else sets[index] = emptySetForExercise(exerciseId);
      return sets;
    });
    setCompleted((current) => ({ ...current, [logRow.key]: false }));
    setCorrecting(null);
    setStepDraft(null);
    setLogAnnouncement(`Set ${index + 1} gewist`);
  }

  function addExtraSet() {
    if (!logExercise) return;
    const exerciseId = logExercise.id;
    writeExerciseSets(exerciseId, (sets) => [...sets, emptySetForExercise(exerciseId)]);
    setCorrecting(null);
    setStepDraft(null);
  }

  function selectLogExercise(index: number) {
    const row = logRows[index];
    if (!row) return;
    setOpenExerciseByScope((current) => ({ ...current, [exerciseScopeKey]: row.key }));
    setCorrecting(null);
    setStepDraft(null);
    window.scrollTo({ top: 0 });
  }

  function toggleExerciseDone(key: string, done: boolean) {
    setCompleted((current) => ({ ...current, [key]: done }));
  }

  function finishFromLog() {
    if (!finishSession()) return;
    setRestTimer(null);
    setLiveSession(null);
    setStepDraft(null);
    setCorrecting(null);
    changeTab("training");
  }

  function finishRecoveryFromLog() {
    if (finishRecovery()) changeTab("training");
  }

  /** +30 s lengthens the running rest; after it ended, it starts a new one. */
  function adjustRest(seconds: number) {
    const now = Date.now();
    setRestTimer((current) => {
      if (!current) return current;
      const running = current.endsAt > now;
      const endsAt = Math.max(now, (running ? current.endsAt : now) + seconds * 1000);
      const remaining = Math.ceil((endsAt - now) / 1000);
      return { ...current, endsAt, total: Math.max(running ? current.total : 0, remaining) };
    });
  }

  function resetRestToPlan() {
    const now = Date.now();
    setRestTimer((current) => (current ? { ...current, endsAt: now + current.planned * 1000, total: current.planned } : current));
  }

  function skipRest() {
    const now = Date.now();
    setRestTimer((current) => (current ? { ...current, endsAt: now } : current));
  }

  // --- Agenda
  const agendaWeek = weekDays.map((date) => {
    const key = dateKey(date);
    const template = templateForDate(key);
    const onDay = sessions.filter((session) => dateKey(new Date(session.date)) === key);
    return {
      date,
      key,
      template,
      isRest: template.id === "rest",
      workout: onDay.find(isWorkoutSession),
      recovery: onDay.find((session) => !isWorkoutSession(session)),
      isToday: key === todayKey,
    };
  });
  const agendaPlanned = agendaWeek.filter((entry) => !entry.isRest).length;
  const agendaDone = agendaWeek.filter((entry) => entry.workout).length;
  const previousWeekStart = new Date(weekDays[0]);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  const previousWeekKeys = datesInWeek(previousWeekStart).map((date) => dateKey(date));
  const previousWeekSessions = orderedSessions.filter(
    (session) => isWorkoutSession(session) && previousWeekKeys.includes(dateKey(new Date(session.date))),
  );
  const previousWeekRange = `${shortDate(parseDateKey(previousWeekKeys[0]))} – ${shortDate(parseDateKey(previousWeekKeys[6]))}`;
  const bestOfSession = (session: Session) => {
    let best: { name: string; weight: number; reps: number; value: number } | null = null;
    for (const row of session.results) {
      const top = bestStrengthSet(resultSets(row));
      if (top && (!best || top.value > best.value)) best = { name: row.name, ...top };
    }
    return best;
  };

  // --- Preview
  const lastSameWorkout = orderedSessions.find((session) => session.dayId === day.id && isWorkoutSession(session));
  const lastSameVolume = lastSameWorkout ? sessionVolumeKg(lastSameWorkout) : 0;

  // --- Voeding
  const nutritionIsToday = nutritionDate === todayKey;
  const caloriePercent = targets.calories > 0 ? clamp((nutritionTotals.calories / targets.calories) * 100) : 0;
  const proteinStreak = (() => {
    const byDate = new Map<string, number>();
    for (const entry of nutritionEntries) byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.protein);
    // Only whole days count: the day on screen joins once it is over.
    let cursor = nutritionDate < todayKey ? nutritionDate : shiftDateKey(nutritionDate, -1);
    let days = 0;
    let shortfall = 0;
    while (byDate.has(cursor) && (byDate.get(cursor) ?? 0) < targets.protein && days < 60) {
      shortfall += targets.protein - (byDate.get(cursor) ?? 0);
      days += 1;
      cursor = shiftDateKey(cursor, -1);
    }
    return days >= 2 ? { days, average: Math.round(shortfall / days) } : null;
  })();
  /** Entries logged here carry the moment they were added; older ones do not. */
  const loggedAtLabel = (entry: NutritionEntry) => {
    const match = /^food-(\d{12,})$/.exec(entry.id);
    if (!match) return null;
    const moment = new Date(Number(match[1]));
    if (!Number.isFinite(moment.getTime()) || dateKey(moment) !== entry.date) return null;
    return moment.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
  };
  const eatenEntries = [...selectedNutritionEntries].sort(
    (a, b) => (loggedAtLabel(a) ?? "99").localeCompare(loggedAtLabel(b) ?? "99")
      || MEAL_OPTIONS.indexOf(a.meal) - MEAL_OPTIONS.indexOf(b.meal),
  );

  // --- Progressie
  const weightPoints = trailingAverage(orderedMetrics.map((metric) => ({ date: metric.date, value: metric.weight })), 14);
  const latestMetric = orderedMetrics[orderedMetrics.length - 1];
  const averageChange = (() => {
    const last = weightPoints[weightPoints.length - 1];
    if (!last) return null;
    const cutoff = parseDateKey(last.date).getTime() - 14 * 86_400_000;
    const earlier = [...weightPoints].reverse().find((point) => parseDateKey(point.date).getTime() <= cutoff);
    return earlier ? Math.round((last.average - earlier.average) * 10) / 10 : null;
  })();
  const monthName = (value: string) => parseDateKey(value).toLocaleDateString("nl-BE", { month: "long" });
  const progressRange = orderedMetrics.length
    ? capitalize(
        monthName(orderedMetrics[0].date) === monthName(orderedMetrics[orderedMetrics.length - 1].date)
          ? monthName(orderedMetrics[0].date)
          : `${monthName(orderedMetrics[0].date)} – ${monthName(orderedMetrics[orderedMetrics.length - 1].date)}`,
      )
    : "Nog geen metingen";
  const bestRows = bestSetsSince(sessions, shiftDateKey(todayKey, -56), 5);
  const volumeWeeks = weeklyVolume(sessions, todayKey, 7);

  // --- Foto's
  const photoById = (id: string | undefined) => photos.find((photo) => photo.id === id);
  const compareBefore = photoById(compareIds?.before) ?? photos[0];
  const compareAfter = photoById(compareIds?.after) ?? photos[photos.length - 1];
  const compareDays = compareBefore && compareAfter
    ? Math.round(
        (new Date(`${compareAfter.capturedOn}T12:00:00`).getTime() - new Date(`${compareBefore.capturedOn}T12:00:00`).getTime())
          / 86_400_000,
      )
    : 0;
  const compareLabel = Math.abs(compareDays) >= 14
    ? `${Math.round(Math.abs(compareDays) / 7)} weken verschil`
    : `${Math.abs(compareDays)} ${Math.abs(compareDays) === 1 ? "dag" : "dagen"} verschil`;

  const restFloating = Boolean(restTimer) && activeTab !== "loggen";

  return (
    <main className="sl-app">
      {/*
        The live region itself is always in the document; only the message
        inside it comes and goes. A role="status" element that appears together
        with its text is announced unreliably. (WCAG 4.1.3)
      */}
      <div role="status" aria-live="polite">
        {banner && (
          <div className="sl-toast">
            <IconCheck size={16} />
            <span>{banner}</span>
          </div>
        )}
      </div>

      <TabsPrimitive.Root value={activeTab} onValueChange={changeTab}>
        {/* ============================================================ 1a Training */}
        <TabsPrimitive.Content value="training" className="sl-screen" data-rest-floating={restFloating || undefined}>
          <header className="sl-hello">
            <button
              type="button"
              className="sl-avatar"
              onClick={() => changeTab("account")}
              aria-label={`Account openen · ${shortSyncLabel}`}
            >
              {avatarInitial ? <span aria-hidden="true">{avatarInitial}</span> : <UserRound size={20} aria-hidden="true" />}
              {dataOnlyHere && <span className="sl-avatar-dot" aria-hidden="true" />}
            </button>
            <div className="sl-hello-copy">
              <h1 className="sl-hello-title">Hoi{firstName ? ` ${firstName}` : ""}</h1>
              <span className="sl-hello-date">{selectedDateLong}</span>
            </div>
          </header>

          <section className="sl-week" aria-labelledby="sl-week-label">
            <div className="sl-week-head">
              <h2 id="sl-week-label" className="sl-overline">{weekLabel}</h2>
              <button type="button" className="sl-link-action" onClick={() => openAgenda(false)}>
                <IconCalendar size={18} />
                Agenda
                <IconChevronRight />
              </button>
            </div>
            <div className="sl-strip" role="group" aria-label={`Dagen van ${weekLabel.toLowerCase()}`}>
              {weekDays.map((date) => {
                const key = dateKey(date);
                const template = templateForDate(key);
                const done = sessions.some((session) => dateKey(new Date(session.date)) === key);
                return (
                  <button
                    key={key}
                    type="button"
                    className="sl-strip-day"
                    aria-pressed={key === selectedDate}
                    aria-current={key === todayKey ? "date" : undefined}
                    data-today={key === todayKey || undefined}
                    data-rest={template.id === "rest" || undefined}
                    aria-label={`${date.toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" })}: ${template.id === "rest" ? "rust" : template.short}${done ? ", afgerond" : ""}${key === todayKey ? ", vandaag" : ""}`}
                    onClick={() => goToDate(key, key > selectedDate ? 1 : -1)}
                  >
                    <span className="sl-strip-d">{weekdayShort(date)}</span>
                    <span className="sl-strip-n sl-num">{date.getDate()}</span>
                    <span className="sl-strip-mark" aria-hidden="true"><i /></span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="sl-daycard-wrap">
            <article
              className="sl-daycard"
              aria-labelledby="sl-day-title"
              data-dragging={cardDrag.x !== 0 || undefined}
              style={{
                transform: `translateX(${cardDrag.x}px)`,
                opacity: 1 - Math.min(Math.abs(cardDrag.x) / 400, 0.4),
                transition: cardDrag.animate ? "transform 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms" : "none",
              }}
              onPointerDown={cardPointerDown}
              onPointerMove={cardPointerMove}
              onPointerUp={cardPointerUp}
              onPointerCancel={cardPointerUp}
            >
              <div className="sl-daycard-top">
                <span className="sl-eyebrow sl-num">Week {isoWeek(parseDateKey(selectedDate))} · {programLabel}</span>
                {isToday ? (
                  <span className="sl-badge">Vandaag</span>
                ) : (
                  <button type="button" className="sl-back-today" onClick={() => goToDate(todayKey, todayKey > selectedDate ? 1 : -1)}>
                    <IconChevronLeft />
                    Naar vandaag
                  </button>
                )}
              </div>
              <div className="sl-daycard-body">
                <div className="sl-daycard-titlerow">
                  <div className="sl-daycard-titles">
                    <h2 id="sl-day-title" className="sl-daycard-title" data-tone={cardKind === "rest" ? "rest" : undefined}>{cardTitle}</h2>
                    <p className="sl-daycard-focus">{cardFocus}</p>
                  </div>
                  {cardLetter && (
                    <span className="sl-letter" data-tone={isRestDay ? "rest" : undefined} aria-hidden="true">{cardLetter}</span>
                  )}
                </div>
                {(cardKind === "train" || cardKind === "active") && (
                  <div className="sl-daycard-meta sl-num">
                    <span>
                      {cardKind === "active"
                        ? `${draftTrackedSetCount} van ${plannedSetCount} sets gelogd`
                        : `${day.exercises.length} oefeningen`}
                    </span>
                    <span>
                      <IconClock />~{minutesFor(day)} min
                    </span>
                  </div>
                )}
              </div>
              {(cardKind !== "rest" || isToday) && (
                <div className="sl-daycard-actions">
                  {isToday && (cardKind === "train" || cardKind === "active") && (
                    <>
                      <button type="button" className="sl-btn-start" onClick={startTraining}>
                        <IconPlay />
                        {cardKind === "active" ? "Hervat training" : "Start training"}
                      </button>
                      <button type="button" className="sl-btn-quiet" onClick={() => setPreviewOpen(true)}>
                        Oefeningen bekijken
                        <IconChevronRight className="sl-chev" />
                      </button>
                    </>
                  )}
                  {isToday && cardKind === "rest" && (
                    <button type="button" className="sl-btn-outline" onClick={logAfterwards}>
                      Herstel loggen
                      <IconChevronRight className="sl-chev" />
                    </button>
                  )}
                  {!isToday && (cardKind === "train" || cardKind === "active") && (
                    <button type="button" className="sl-btn-outline" onClick={() => openAgenda(true)}>
                      Details in agenda
                      <IconChevronRight className="sl-chev" />
                    </button>
                  )}
                  {cardKind === "done" && (
                    <button type="button" className="sl-btn-outline" onClick={() => openAgenda(true)}>
                      Resultaten bekijken
                      <IconChevronRight className="sl-chev" />
                    </button>
                  )}
                </div>
              )}
            </article>
            <div className="sl-daynav">
              <button
                type="button"
                className="sl-daynav-btn"
                data-hidden={!prevKey || undefined}
                disabled={!prevKey}
                aria-label={prevKey ? `Vorige dag, ${parseDateKey(prevKey).toLocaleDateString("nl-BE", { weekday: "long", day: "numeric" })}` : undefined}
                onClick={() => prevKey && goToDate(prevKey, -1)}
              >
                <IconChevronLeft />
                <span className="sl-num">{prevKey ? `${weekdayShort(parseDateKey(prevKey))} ${parseDateKey(prevKey).getDate()}` : ""}</span>
              </button>
              <span className="sl-daynav-hint" aria-hidden="true">veeg om van dag te wisselen</span>
              <button
                type="button"
                className="sl-daynav-btn"
                data-hidden={!nextKey || undefined}
                disabled={!nextKey}
                aria-label={nextKey ? `Volgende dag, ${parseDateKey(nextKey).toLocaleDateString("nl-BE", { weekday: "long", day: "numeric" })}` : undefined}
                onClick={() => nextKey && goToDate(nextKey, 1)}
              >
                <span className="sl-num">{nextKey ? `${weekdayShort(parseDateKey(nextKey))} ${parseDateKey(nextKey).getDate()}` : ""}</span>
                <IconChevronRight />
              </button>
            </div>
          </div>

          {restOfWeek.length > 0 && (
            <section className="sl-section" aria-labelledby="sl-rest-of-week">
              <div className="sl-section-head">
                <h2 id="sl-rest-of-week" className="sl-section-title">Rest van de week</h2>
              </div>
              <div className="sl-list">
                {restOfWeek.map(({ date, key, template }) =>
                  template.id === "rest" ? (
                    <div key={key} className="sl-row" data-kind="rest">
                      <span className="sl-row-date sl-num">{weekdayShort(date)}<b>{date.getDate()}</b></span>
                      <span className="sl-row-rest">Rust</span>
                      <span className="sl-row-end sl-rest-ink"><IconMoon /></span>
                    </div>
                  ) : (
                    <button
                      key={key}
                      type="button"
                      className="sl-row"
                      onClick={() => {
                        goToDate(key);
                        setAgendaDay(key);
                        setAgendaOpen(true);
                      }}
                      aria-label={`${date.toLocaleDateString("nl-BE", { weekday: "long", day: "numeric" })}: ${template.short}, ${template.exercises.reduce((total, exercise) => total + setsPlannedFor(exercise), 0)} sets — in agenda bekijken`}
                    >
                      <span className="sl-row-date sl-num">{weekdayShort(date)}<b>{date.getDate()}</b></span>
                      <span className="sl-row-main">
                        <span className="sl-row-title">{template.short}</span>
                        <span className="sl-row-sub sl-num">
                          {template.focus} · {template.exercises.reduce((total, exercise) => total + setsPlannedFor(exercise), 0)} sets
                        </span>
                      </span>
                      <IconChevronRight size={16} className="sl-chev" />
                    </button>
                  ),
                )}
              </div>
            </section>
          )}
        </TabsPrimitive.Content>

        {/* ============================================================ 1b Loggen */}
        <TabsPrimitive.Content
          value="loggen"
          className="sl-log"
          style={{ "--sl-dock-h": `${dockHeight}px` } as CSSProperties}
        >
          <span className="sl-sr-only" role="status" aria-live="polite">{logAnnouncement}</span>
          <div className="sl-log-top">
            <button type="button" className="sl-log-back" onClick={() => changeTab("training")}>
              <IconChevronLeft size={18} />
              Training
            </button>
            {isToday && liveSession?.key === liveKey && <SessionClock startedAt={liveSession.startedAt} />}
          </div>
          {!isToday && (
            <div className="sl-log-context">
              <p>
                {selectedIsFuture ? (
                  <>Gepland voor <b>{selectedDateLabel}</b>. Opslaan kan vanaf die dag.</>
                ) : (
                  <>Je logt <b>{selectedDateLabel}</b> achteraf; alles wordt op die datum bewaard.</>
                )}
              </p>
              <button type="button" className="sl-link-action" onClick={() => goToDate(todayKey)}>
                Naar vandaag
              </button>
            </div>
          )}

          {isRestDay ? (
            <>
              <div className="sl-log-head">
                <div>
                  <h1 className="sl-log-title">Herstel</h1>
                  <p className="sl-log-meta sl-num">Rustdag · optioneel 10–15 min</p>
                </div>
              </div>
              <section className="sl-section" aria-labelledby="sl-checkin-title">
                <div className="sl-section-head">
                  <h2 id="sl-checkin-title" className="sl-section-title">Hoe voelt je lichaam vandaag?</h2>
                  <span className="sl-section-meta">optioneel</span>
                </div>
                <div className="sl-list sl-checkin">
                  {([
                    { key: "sleep", label: "Slaap" },
                    { key: "soreness", label: "Spierstijfheid" },
                    { key: "energy", label: "Energie" },
                  ] as const).map((field) => (
                    <div className="sl-checkin-field" key={field.key}>
                      <span id={`sl-scale-${field.key}`}>{field.label}</span>
                      <div className="sl-segmented" role="group" aria-labelledby={`sl-scale-${field.key}`}>
                        {RECOVERY_SCALE[field.key].map((option) => (
                          <button
                            type="button"
                            key={option.value}
                            aria-pressed={recoveryDraft[field.key] === option.value}
                            onClick={() => setRecoveryLevel(field.key, option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <div className="sl-note-line" data-tone={recoveryInsight.tone === "protect" ? "attention" : "rest"}>
                <i aria-hidden="true" />
                <p>
                  {recoveryInsight.title}
                  <small>{recoveryInsight.body}</small>
                </p>
              </div>
              <section className="sl-section" aria-labelledby="sl-activities-title">
                <div className="sl-section-head">
                  <h2 id="sl-activities-title" className="sl-section-title">Herstelblokken</h2>
                  <span className="sl-section-meta sl-num">{doneCount} van {RECOVERY_ACTIVITIES.length} gekozen</span>
                </div>
                <div className="sl-list">
                  {RECOVERY_ACTIVITIES.map((activity) => {
                    const selected = recoveryDraft.completedIds.includes(activity.id);
                    return (
                      <button
                        type="button"
                        key={activity.id}
                        className="sl-activity"
                        aria-pressed={selected}
                        onClick={() => toggleRecoveryActivity(activity.id)}
                      >
                        <span>
                          <small>{activity.category}</small>
                          <b>{activity.name}</b>
                          <small className="sl-num">{activity.dose}</small>
                          <p>{activity.detail}</p>
                        </span>
                        <span className="sl-setrow-ring" aria-hidden="true">{selected ? <IconCheck /> : null}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
              <label className="sl-field">
                Notitie voor je coach · optioneel
                <textarea
                  className="sl-text"
                  value={recoveryDraft.note}
                  onChange={(event) => setRecoveryDraft((current) => ({ ...current, note: event.target.value.slice(0, 280) }))}
                  placeholder="Bijv. kuiten stijf bij opstaan, rechterschouder voelt goed…"
                  rows={3}
                />
              </label>
              <p className="sl-help">Volledige rust zonder checklist is ook een geldige keuze. Bij scherpe of aanhoudende pijn: niet forceren.</p>
            </>
          ) : logRow && logExercise ? (
            <>
              <div className="sl-log-head">
                <div>
                  <h1 className="sl-log-title">{logExercise.name}</h1>
                  <p className="sl-log-meta sl-num">
                    Oefening {logIndex + 1} van {logRows.length} · {logExercise.prescription}
                  </p>
                </div>
                {logVariants.length > 0 && (
                  <button type="button" className="sl-pill-btn" onClick={() => setSwapOpen(true)} aria-label={`${logExercise.name} wisselen`}>
                    Wissel
                    <IconChevronRight className="sl-chev" />
                  </button>
                )}
              </div>

              {logStatus?.tone === "ready" && (
                <div className="sl-note-line">
                  <i aria-hidden="true" />
                  <p>{logStatus.label}</p>
                </div>
              )}

              <div className="sl-prev">
                <div className="sl-prev-head">
                  <span className="sl-prev-label sl-num">
                    {logPrevious ? `Vorige sessie · ${shortDate(new Date(logPrevious.date))}` : "Vorige sessie"}
                  </span>
                  {logPrevious ? (
                    (() => {
                      const logged = logPreviousSets.filter(isLoggedSet);
                      const firstWeight = numberValue(logged[0]?.weight);
                      const sameWeight = firstWeight > 0 && logged.every((set) => numberValue(set.weight) === firstWeight);
                      return (
                        <span className="sl-prev-value sl-num">
                          {sameWeight ? (
                            <>
                              {formatKg(firstWeight)} kg <em>× {logged.map((set) => completedReps(set)).join("/")}</em>
                            </>
                          ) : (
                            summarizeSets(logPreviousSets)
                          )}
                        </span>
                      );
                    })()
                  ) : (
                    <span className="sl-prev-value" data-none>nog niet gelogd</span>
                  )}
                </div>
                {logRow.sets.map((set, index) => {
                  const state = index === focusIndex ? "open" : isLoggedSet(set) ? "done" : "pending";
                  const previousSet = logPreviousSets[index];
                  const previousText = previousSet && isLoggedSet(previousSet)
                    ? `vorige ${numberValue(previousSet.weight) > 0 ? formatKg(numberValue(previousSet.weight)) : "—"} × ${completedReps(previousSet)}`
                    : "";
                  const weightText = (value: number | null) => (value === null ? "—" : value > 0 ? formatKg(value) : "0");
                  const valueText = state === "open" && focusValues
                    ? `${weightText(focusValues.weight)} × ${focusValues.reps ?? "—"}`
                    : state === "done"
                      ? `${weightText(numberValue(set.weight))} × ${completedReps(set)}`
                      : "—";
                  const paused = pausedReps(set);
                  const content = (
                    <>
                      <span className="sl-setrow-ring" aria-hidden="true">{state === "done" ? <IconCheck /> : null}</span>
                      <span className="sl-setrow-label sl-num">
                        {state === "open" ? `Set ${index + 1} · ${correctingIndex === index ? "corrigeren" : "open"}` : `Set ${index + 1}`}
                        {state === "done" && paused > 0 && (
                          <span className="sl-setrow-note">{paused} gepauzeerd{set.pauseSeconds ? ` · ${set.pauseSeconds}s` : ""}</span>
                        )}
                      </span>
                      <span className="sl-setrow-prev sl-num">{previousText}</span>
                      <span className="sl-setrow-value sl-num">{valueText}</span>
                    </>
                  );
                  return state === "done" ? (
                    <button
                      key={`${logRow.key}-${index}`}
                      type="button"
                      className="sl-setrow"
                      data-state={state}
                      onClick={() => {
                        setCorrecting({ key: logRow.key, index });
                        setStepDraft(null);
                      }}
                      aria-label={`Set ${index + 1}: ${valueText}${previousText ? `, ${previousText}` : ""}. Tik om te corrigeren.`}
                    >
                      {content}
                    </button>
                  ) : (
                    <div
                      key={`${logRow.key}-${index}`}
                      className="sl-setrow"
                      data-state={state}
                      aria-current={state === "open" ? "step" : undefined}
                    >
                      {content}
                    </div>
                  );
                })}
                <button type="button" className="sl-setrow-add" onClick={addExtraSet}>
                  <IconPlus size={14} />
                  Extra set
                </button>
              </div>

              {logRecord && (
                <div className="sl-note-line" role="status">
                  <i aria-hidden="true" />
                  <p>
                    {logRecord.title}
                    <small>{logRecord.detail}</small>
                  </p>
                </div>
              )}

              <Collapsible className="sl-disclosure">
                <CollapsibleTrigger className="sl-disclosure-trigger">
                  <span>
                    Opwarming &amp; progressie
                    {logStatus && <small>{logStatus.label}</small>}
                  </span>
                  <IconChevronDown />
                </CollapsibleTrigger>
                <CollapsibleContent className="sl-disclosure-body">
                  {logIndex === 0 && (
                    <div>
                      <strong>Algemeen · ongeveer 5 min</strong>
                      <p>5 minuten rustig bewegen en 2 dynamische mobiliteitsrondes.</p>
                    </div>
                  )}
                  <div>
                    <strong>Opwarming</strong>
                    <p>{logIndex === 0 ? primaryGuide.warmup : logGuide.warmup}</p>
                  </div>
                  <div>
                    <strong>Wanneer verhogen?</strong>
                    <p>{logGuide.progression}</p>
                  </div>
                  <div>
                    <strong>Plan</strong>
                    <p className="sl-num">{logExercise.prescription} · {logExercise.load} · rust {logExercise.rest}</p>
                  </div>
                  <StrengthTrendChart points={logTrend} />
                </CollapsibleContent>
              </Collapsible>

              <section className="sl-section" aria-labelledby="sl-session-title">
                <div className="sl-section-head">
                  <h2 id="sl-session-title" className="sl-section-title">{day.short} · {selectedDateLabel}</h2>
                  <span className="sl-section-meta sl-num">{trackedSetCount} van {plannedSetCount} sets</span>
                </div>
                <div className="sl-list">
                  {logRows.map((row, index) => (
                    <div key={row.key} className="sl-exrow" data-active={index === logIndex || undefined}>
                      <button
                        type="button"
                        className="sl-exrow-open"
                        onClick={() => selectLogExercise(index)}
                        aria-current={index === logIndex ? "step" : undefined}
                      >
                        <span className="sl-num">{index + 1}</span>
                        <span>
                          <b>{row.exercise.name}</b>
                          <small className="sl-num">{row.logged} van {row.prescribed} sets{row.done ? " · klaar" : ""}</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="sl-ring-btn"
                        aria-pressed={row.done}
                        disabled={row.logged >= row.prescribed}
                        onClick={() => toggleExerciseDone(row.key, !completed[row.key])}
                        aria-label={
                          row.logged >= row.prescribed
                            ? `${row.exercise.name}: alle sets gelogd`
                            : `${row.exercise.name} ${row.done ? "niet meer als klaar markeren" : "als klaar markeren"}`
                        }
                      >
                        <span className="sl-num">{row.done ? <IconCheck /> : `${row.logged}/${row.prescribed}`}</span>
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="sl-btn-outline" onClick={finishFromLog} disabled={!canFinishSession}>
                  {selectedActualWorkout?.dayId === day.id ? "Training bijwerken" : "Training afronden"} · {selectedDateLabel}
                </button>
                <p className="sl-help">Stop bij techniekverlies. Is pijn scherp? Kies een pijnvrije ROM.</p>
              </section>
            </>
          ) : (
            <div className="sl-list">
              <p className="sl-empty">
                <strong>Geen oefeningen</strong>
                Kies in de agenda een training voor deze dag.
              </p>
            </div>
          )}

          <div className="sl-dock" ref={setDockElement}>
            {restTimer && (
              <RestPill
                timer={restTimer}
                onAdjust={adjustRest}
                onReset={resetRestToPlan}
                onSkip={skipRest}
                onDismiss={() => setRestTimer(null)}
              />
            )}
            {isRestDay ? (
              <div className="sl-inputcard">
                <button type="button" className="sl-cta" style={{ marginTop: 0 }} onClick={finishRecoveryFromLog} disabled={selectedIsFuture}>
                  {selectedActualRecovery ? "Rustdag bijwerken" : "Rustdag opslaan"}
                  <small className="sl-num">{selectedDateLabel}</small>
                </button>
              </div>
            ) : logRow && logExercise ? (
              <div className="sl-inputcard">
                {focusIndex !== null && focusValues ? (
                  <>
                    <div className="sl-inputcard-head">
                      <span className="sl-inputcard-status sl-num">
                        <i aria-hidden="true" />
                        <span>
                          <span>Set {focusIndex + 1} van {Math.max(logRow.prescribed, logRow.sets.length)}</span>
                          <small>{focusStatus}</small>
                        </span>
                      </span>
                      <span className="sl-inputcard-tools">
                        {supportsPause && (
                          <button
                            type="button"
                            className="sl-pill-btn"
                            aria-pressed={focusValues.pauseEnabled}
                            onClick={() => updateFocus({ pauseEnabled: !focusValues.pauseEnabled })}
                          >
                            Pauze
                          </button>
                        )}
                        <button type="button" className="sl-pill-btn" data-quiet onClick={() => setPlatesOpen(true)}>
                          <IconPlates />
                          Schijven
                        </button>
                      </span>
                    </div>
                    <div className="sl-steppers">
                      <Stepper
                        label="gewicht"
                        value={focusValues.weight}
                        step={2.5}
                        min={0}
                        max={500}
                        unit="kg"
                        decimals
                        onChange={(value) => updateFocus({ weight: value })}
                      />
                      <Stepper
                        label="reps"
                        kind="reps"
                        value={focusValues.reps}
                        step={1}
                        min={1}
                        max={100}
                        unit="herhalingen"
                        onChange={(value) => updateFocus({ reps: value })}
                      />
                    </div>
                    {supportsPause && focusValues.pauseEnabled && (
                      <div className="sl-pause-row">
                        <Stepper
                          label="gepauzeerd"
                          kind="small"
                          value={focusValues.pausedReps}
                          step={1}
                          min={0}
                          max={focusValues.reps ?? 100}
                          unit="herhalingen"
                          onChange={(value) => updateFocus({ pausedReps: value })}
                        />
                        <Stepper
                          label="pauze (sec)"
                          kind="small"
                          value={focusValues.pauseSeconds}
                          step={1}
                          min={1}
                          max={10}
                          unit="seconden"
                          onChange={(value) => updateFocus({ pauseSeconds: value })}
                        />
                      </div>
                    )}
                    <button type="button" className="sl-cta" onClick={saveFocusedSet} disabled={!canSaveFocus}>
                      {correctingIndex !== null ? `Set ${focusIndex + 1} bijwerken` : "Set opslaan"}
                      <small className="sl-num">
                        {selectedIsFuture
                          ? `vanaf ${selectedDateLabel}`
                          : canSaveFocus
                            ? `${formatKg(focusValues.weight ?? 0)} × ${focusValues.reps}`
                            : "kies een gewicht"}
                      </small>
                    </button>
                    {correctingIndex !== null && (
                      <div className="sl-cta-secondary">
                        <button type="button" className="sl-btn-outline" data-tone="danger" onClick={clearCorrectedSet}>
                          Set wissen
                        </button>
                        <button
                          type="button"
                          className="sl-btn-outline"
                          onClick={() => {
                            setCorrecting(null);
                            setStepDraft(null);
                          }}
                        >
                          Annuleren
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="sl-inputcard-head">
                      <span className="sl-inputcard-status sl-num">
                        <i aria-hidden="true" />
                        <span>
                          <span>Alle {logRow.sets.length} sets gelogd</span>
                          <small>{logExercise.name}</small>
                        </span>
                      </span>
                      <span className="sl-inputcard-tools">
                        <button type="button" className="sl-pill-btn" data-quiet onClick={addExtraSet}>
                          <IconPlus size={14} />
                          Extra set
                        </button>
                      </span>
                    </div>
                    {nextOpenIndex >= 0 ? (
                      <button type="button" className="sl-cta" onClick={() => selectLogExercise(nextOpenIndex)}>
                        Volgende oefening
                        <small>{logRows[nextOpenIndex].exercise.name}</small>
                      </button>
                    ) : (
                      <button type="button" className="sl-cta" onClick={finishFromLog} disabled={!canFinishSession}>
                        {selectedActualWorkout?.dayId === day.id ? "Training bijwerken" : "Training opslaan"}
                        <small className="sl-num">{selectedDateLabel}</small>
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </div>
        </TabsPrimitive.Content>

        {/* ============================================================ 1c Voeding */}
        <TabsPrimitive.Content value="voeding" className="sl-screen" data-rest-floating={restFloating || undefined}>
          <header className="sl-page-head">
            <div>
              <h1 className="sl-page-title">Voeding</h1>
              <label className="sl-page-sub sl-date-pick">
                {capitalize(nutritionDateLabel)}
                <input
                  type="date"
                  value={nutritionDate}
                  onChange={(event) => setNutritionDate(event.target.value || dateKey())}
                  onClick={(event) => {
                    try {
                      event.currentTarget.showPicker?.();
                    } catch {
                      // Some browsers only open the picker from their own icon.
                    }
                  }}
                  aria-label="Datum van je voedingsdagboek kiezen"
                />
              </label>
            </div>
            <div className="sl-head-tools">
              {!nutritionIsToday && (
                <button type="button" className="sl-link-action" onClick={() => setNutritionDate(todayKey)}>Vandaag</button>
              )}
              <button type="button" className="sl-icon-btn" onClick={() => shiftNutritionDate(-1)} aria-label="Vorige dag">
                <IconChevronLeft size={18} />
              </button>
              <button type="button" className="sl-icon-btn" onClick={() => shiftNutritionDate(1)} aria-label="Volgende dag">
                <IconChevronRight size={18} />
              </button>
            </div>
          </header>

          <section className="sl-hero" aria-labelledby="sl-kcal-label">
            <div className="sl-hero-top">
              <div className="sl-hero-figure">
                <span id="sl-kcal-label">{caloriesRemaining < 0 ? "Boven je doel" : "Nog te eten"}</span>
                <span className="sl-hero-value sl-num">
                  <b data-tone={caloriesRemaining < 0 ? "attention" : "action"}>{formatThousands(Math.abs(caloriesRemaining))}</b>
                  <span>kcal</span>
                </span>
              </div>
              <span className="sl-letter" aria-hidden="true">KCAL</span>
            </div>
            <div
              className="sl-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(caloriePercent)}
              aria-label={`${Math.round(caloriePercent)}% van je caloriedoel gegeten`}
            >
              <i style={{ width: `${caloriePercent}%` }} data-tone={caloriesRemaining < 0 ? "over" : undefined} />
            </div>
            <div className="sl-hero-stats sl-num">
              <div className="sl-hero-stat">
                <b>{formatThousands(nutritionTotals.calories)} <small>kcal</small></b>
                <span>gegeten</span>
              </div>
              <button
                type="button"
                className="sl-hero-stat"
                onClick={() => setTargetDialog(true)}
                aria-label={`Doel ${targets.calories} kcal. Doelen aanpassen.`}
              >
                <b>{formatThousands(targets.calories)} <small>kcal</small></b>
                <span>doel <Pencil size={12} aria-hidden="true" /></span>
              </button>
            </div>
            <button type="button" className="sl-btn-start" onClick={() => setFoodSheetOpen(true)}>
              <IconPlus />
              Maaltijd loggen
            </button>
          </section>

          <section className="sl-section" aria-labelledby="sl-macros-title">
            <div className="sl-section-head">
              <h2 id="sl-macros-title" className="sl-section-title">Macro’s</h2>
              <span className="sl-section-meta">gegeten / doel</span>
            </div>
            <div className="sl-list">
              {([
                ["Eiwit", nutritionTotals.protein, targets.protein, "1"],
                ["Koolhydraten", nutritionTotals.carbs, targets.carbs, "2"],
                ["Vet", nutritionTotals.fat, targets.fat, "3"],
              ] as const).map(([label, value, target, level]) => {
                const left = Math.round(target - value);
                const percent = target > 0 ? clamp((value / target) * 100) : 0;
                return (
                  <div key={label} className="sl-macro">
                    <div className="sl-macro-head sl-num">
                      <span>{label}</span>
                      <span>
                        {Math.round(value)}
                        <small> / {target} g</small>
                      </span>
                    </div>
                    <div className="sl-bar" data-size="small" aria-hidden="true">
                      <i data-level={level} style={{ width: `${percent}%` }} />
                    </div>
                    <span className="sl-num">{left >= 0 ? `nog ${left} g` : `${Math.abs(left)} g boven doel`}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {proteinStreak && (
            <aside className="sl-attention" aria-label="Aandacht">
              <i aria-hidden="true" />
              <div>
                <b>Aandacht</b>
                <p className="sl-num">
                  {proteinStreak.days} dagen op rij onder je eiwitdoel. Gemiddeld {proteinStreak.average} g tekort.
                </p>
              </div>
            </aside>
          )}

          <section className="sl-section" aria-labelledby="sl-eaten-title">
            <div className="sl-section-head">
              <h2 id="sl-eaten-title" className="sl-section-title">
                {nutritionIsToday ? "Vandaag gegeten" : `Gegeten op ${parseDateKey(nutritionDate).toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" }).replaceAll(".", "")}`}
              </h2>
              <span className="sl-section-meta sl-num">
                {eatenEntries.length} {eatenEntries.length === 1 ? "item" : "items"}
              </span>
            </div>
            <div className="sl-list">
              {eatenEntries.length === 0 ? (
                <p className="sl-empty">
                  <strong>Nog niets gelogd</strong>
                  Voeg je eerste maaltijd toe; je totalen en dagbudget rekenen meteen mee.
                </p>
              ) : (
                eatenEntries.map((entry) => {
                  const loggedAt = loggedAtLabel(entry);
                  return (
                    <div key={entry.id} className="sl-eaten">
                      <span className="sl-eaten-time sl-num" aria-label={loggedAt ? `gelogd om ${loggedAt}` : undefined}>{loggedAt ?? ""}</span>
                      <span className="sl-row-main">
                        <span className="sl-row-title">{entry.name}</span>
                        <span className="sl-row-sub sl-num">{entry.meal} · {Math.round(entry.protein)} g eiwit</span>
                      </span>
                      <span className="sl-eaten-kcal sl-num">
                        {Math.round(entry.calories)}
                        <small> kcal</small>
                      </span>
                      <button
                        type="button"
                        className="sl-icon-btn"
                        onClick={() => setDeleteTarget({ kind: "nutrition", id: entry.id, label: `${entry.name} · ${Math.round(entry.calories)} kcal` })}
                        aria-label={`${entry.name} verwijderen`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </TabsPrimitive.Content>

        {/* ============================================================ 1d Progressie */}
        <TabsPrimitive.Content value="progressie" className="sl-screen" data-rest-floating={restFloating || undefined}>
          <header className="sl-page-head">
            <div>
              <h1 className="sl-page-title">Progressie</h1>
              <span className="sl-page-sub">{progressRange}</span>
            </div>
            <button type="button" className="sl-pill-primary" onClick={() => setMetricSheetOpen(true)}>
              <IconPlus size={14} />
              Meting
            </button>
          </header>

          <section className="sl-hero" aria-labelledby="sl-weight-label">
            <div className="sl-hero-top" data-align="end">
              <div className="sl-hero-figure">
                <span id="sl-weight-label">Lichaamsgewicht</span>
                <span className="sl-hero-value sl-num">
                  <b>{latestMetric ? formatKg(Math.round(latestMetric.weight * 10) / 10) : "—"}</b>
                  <span>kg</span>
                </span>
              </div>
              {averageChange !== null ? (
                <div className="sl-trend sl-num">
                  <b data-tone={averageChange !== 0 ? "change" : undefined}>
                    {averageChange > 0 ? "+" : averageChange < 0 ? "−" : ""}
                    {formatKg(Math.abs(averageChange))} kg
                  </b>
                  <span>14-daags gem.</span>
                </div>
              ) : weightTrend !== null ? (
                <div className="sl-trend sl-num">
                  <b data-tone={Math.round(weightTrend * 10) !== 0 ? "change" : undefined}>
                    {weightTrend > 0.05 ? "+" : weightTrend < -0.05 ? "−" : ""}
                    {formatKg(Math.abs(Math.round(weightTrend * 10) / 10))} kg
                  </b>
                  <span>per week</span>
                </div>
              ) : null}
            </div>
            {weightPoints.length >= 2 ? (
              <WeightChart points={weightPoints} />
            ) : (
              <p className="sl-help">Log twee ochtendmetingen; daarna verschijnen je trend en het 14-daagse gemiddelde.</p>
            )}
          </section>

          <section className="sl-section" aria-labelledby="sl-best-title">
            <div className="sl-section-head">
              <h2 id="sl-best-title" className="sl-section-title">Beste sets</h2>
              <span className="sl-section-meta">laatste 8 weken</span>
            </div>
            <div className="sl-list">
              {bestRows.length === 0 ? (
                <p className="sl-empty">
                  <strong>Nog geen sets met gewicht</strong>
                  Sla een training op; je beste set per oefening verschijnt hier.
                </p>
              ) : (
                bestRows.map((row) => (
                  <div key={row.exerciseId} className="sl-best">
                    <span className="sl-row-main">
                      <span className="sl-row-title">{row.name}</span>
                      <span className="sl-row-sub sl-num">
                        {formatKg(row.weight)} kg × {row.reps} · {shortDate(new Date(row.date))}
                      </span>
                    </span>
                    <span className="sl-best-delta sl-num">
                      {/* "nieuw" only where nothing came before: a lift trained
                          before in another way is neither compared nor new. */}
                      {row.delta === null ? (
                        row.hasEarlierBest ? null : (
                          <>
                            <b>nieuw</b>
                            <span>geen eerdere beste</span>
                          </>
                        )
                      ) : (
                        <>
                          <b data-tone={row.delta > 0 ? "gain" : row.delta < 0 ? "loss" : undefined}>
                            {row.delta > 0 ? "+" : row.delta < 0 ? "−" : ""}
                            {formatKg(Math.abs(row.delta))} kg
                          </b>
                          <span>geschat t.o.v. vorige beste</span>
                        </>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="sl-section" aria-labelledby="sl-volume-title">
            <div className="sl-section-head">
              <h2 id="sl-volume-title" className="sl-section-title">Volume per week</h2>
              <span className="sl-section-meta sl-num">
                ton · w{volumeWeeks[0].week}–w{volumeWeeks[volumeWeeks.length - 1].week}
              </span>
            </div>
            <VolumeBars weeks={volumeWeeks} />
          </section>
        </TabsPrimitive.Content>

        {/* ============================================================ 1e Foto's */}
        <TabsPrimitive.Content value="transformatie" className="sl-screen" data-rest-floating={restFloating || undefined}>
          <header className="sl-page-head">
            <div>
              <h1 className="sl-page-title">Foto’s</h1>
              <span className="sl-page-sub sl-num">
                {photosLoading ? "Laden…" : `${photos.length} ${photos.length === 1 ? "opname" : "opnames"}`}
              </span>
            </div>
            <button type="button" className="sl-pill-primary" onClick={() => setPhotoSheetOpen(true)}>
              <IconCameraSmall />
              Nieuwe opname
            </button>
          </header>

          {photoError && !photoSheetOpen && <p className="sl-error" role="alert">{photoError}</p>}

          {photosLoading ? (
            <p className="sl-help">
              <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> Tijdlijn laden…
            </p>
          ) : photos.length === 0 ? (
            <div className="sl-list">
              <p className="sl-empty">
                <strong>Je eerste foto wordt het startpunt</strong>
                Zelfde pose, licht en afstand. Vanaf twee foto’s verschijnt de vergelijking.
              </p>
            </div>
          ) : (
            <>
              <section className="sl-section" aria-labelledby="sl-compare-title">
                <div className="sl-section-head">
                  <h2 id="sl-compare-title" className="sl-section-title">Vergelijking</h2>
                  {photos.length > 1 && <span className="sl-section-meta sl-num">{compareLabel}</span>}
                </div>
                <div className="sl-compare">
                  {[
                    { photo: compareBefore, tag: "voor" },
                    ...(photos.length > 1 ? [{ photo: compareAfter, tag: "nu" }] : []),
                  ].map(({ photo, tag }) =>
                    photo ? (
                      <button
                        key={`${tag}-${photo.id}`}
                        type="button"
                        className="sl-compare-item"
                        onClick={() => openPhoto(photo.id)}
                        aria-label={`Foto ${tag} van ${photoDateLabel(photo.capturedOn)}, ${formatKg(photo.weight)} kg, openen`}
                      >
                        <span className="sl-photo">
                          <IconImage />
                          <img src={photo.imageUrl} alt="" />
                        </span>
                        <span className="sl-compare-caption sl-num">
                          <b>{photoDateLabel(photo.capturedOn, { day: "numeric", month: "short" }).replaceAll(".", "")} · {tag}</b>
                          <span>{formatKg(photo.weight)} kg</span>
                        </span>
                      </button>
                    ) : null,
                  )}
                </div>
                {photos.length > 2 && (
                  <button type="button" className="sl-btn-outline" onClick={() => setCompareSheetOpen(true)}>
                    Andere datums kiezen
                    <IconChevronRight className="sl-chev" />
                  </button>
                )}
              </section>

              <section className="sl-section" aria-labelledby="sl-all-photos-title">
                <div className="sl-section-head">
                  <h2 id="sl-all-photos-title" className="sl-section-title">Alle opnames</h2>
                  <span className="sl-head-tools">
                    {photos.length > 1 && (
                      <button
                        type="button"
                        className="sl-link-action"
                        onClick={() => {
                          setPhotoIndex(0);
                          setPhotoPlaying(true);
                          setPhotoViewerOpen(true);
                        }}
                      >
                        <IconPlay size={12} />
                        Afspelen
                      </button>
                    )}
                    <span className="sl-section-meta sl-num">{photos.length}</span>
                  </span>
                </div>
                <div className="sl-thumbs">
                  {[...photos].reverse().map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      className="sl-thumb"
                      onClick={() => openPhoto(photo.id)}
                      aria-label={`Foto van ${photoDateLabel(photo.capturedOn)}, ${formatKg(photo.weight)} kg, openen`}
                    >
                      <span className="sl-photo" data-size="small">
                        <IconImage />
                        <img loading="lazy" src={photo.imageUrl} alt="" />
                      </span>
                      <span className="sl-num">
                        {photoDateLabel(photo.capturedOn, { day: "numeric", month: "short" }).replaceAll(".", "")}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
          <p className="sl-help">’s Morgens nuchter, zelfde plek, afstand, licht en een ontspannen pose. Geen pump.</p>
        </TabsPrimitive.Content>

        {/* ============================================================ Account */}
        <TabsPrimitive.Content
          value="account"
          className="sl-screen"
          aria-labelledby="sl-account-title"
          data-rest-floating={restFloating || undefined}
        >
          <div className="sl-account-top">
            <button type="button" className="sl-log-back" onClick={() => changeTab(returnTab === "account" ? "training" : returnTab)}>
              <IconChevronLeft size={18} />
              Terug
            </button>
            <h1 id="sl-account-title" className="sl-sr-only">Account</h1>
          </div>
          <section className="account-page">
              <header className="account-identity">
                <span className="account-identity-avatar">{accountInitials}</span>
                <div className="account-identity-copy">
                  <h2>{account?.email ?? "Niet aangemeld"}</h2>
                  <p>{account ? "Persoonlijk account" : "Je data staat alleen op dit toestel"}</p>
                </div>
              </header>

              {/* The question this page exists to answer: is my laptop showing
                  the same thing as my phone? */}
              <div className={`account-link account-link-${account ? syncStatus : "offline"}`}>
                <div className="account-link-diagram" aria-hidden="true">
                  <span className="account-link-node">
                    <Smartphone />
                  </span>
                  <span className="account-link-track">
                    <i />
                  </span>
                  <span className="account-link-node">
                    {account && syncStatus !== "offline" ? <Cloud /> : <CloudOff />}
                  </span>
                </div>
                <div className="account-link-copy">
                  <strong>
                    {!account
                      ? "Nog niet gekoppeld"
                      : syncStatus === "synced"
                        ? "Alles staat gelijk"
                        : syncStatus === "saving"
                          ? "Bezig met opslaan"
                          : syncStatus === "connecting"
                            ? "Verbinden"
                            : "Alleen op dit toestel"}
                  </strong>
                  <p>
                    {!account
                      ? "Meld je aan om je sessies op je telefoon én je laptop te zien."
                      : syncStatus === "synced"
                        ? "Je telefoon en je laptop tonen dezelfde sessies, metingen en doelen."
                        : syncStatus === "saving"
                          ? "Je laatste wijziging wordt weggeschreven naar je account."
                          : syncStatus === "connecting"
                            ? "We halen je opgeslagen data op."
                            : "Je wijzigingen staan lokaal en gaan mee zodra er weer verbinding is."}
                  </p>
                  {account && lastSyncedAt && (
                    <span className="account-link-stamp">
                      Laatst gelijkgezet om{" "}
                      {new Date(lastSyncedAt).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>

              <div className="account-vault">
                <p>Bewaard op je account</p>
                <div>
                  <span>
                    <strong>{sessions.length}</strong>
                    <small>{sessions.length === 1 ? "sessie" : "sessies"}</small>
                  </span>
                  <span>
                    <strong>{metrics.length}</strong>
                    <small>{metrics.length === 1 ? "meting" : "metingen"}</small>
                  </span>
                  <span>
                    <strong>{photos.length}</strong>
                    <small>{photos.length === 1 ? "foto" : "foto\u2019s"}</small>
                  </span>
                </div>
              </div>

              <div className="account-settings">
                <p className="account-settings-title">Instellingen</p>

                <div className="account-setting">
                  <div className="account-setting-head">
                    <strong>Trainingsplan</strong>
                    <small>Bepaalt je oefeningen en je weekindeling.</small>
                  </div>
                  <div className="account-choice">
                    <button
                      type="button"
                      className={planMode === "personal" ? "is-chosen" : ""}
                      aria-pressed={planMode === "personal"}
                      onClick={() => changePlanMode("personal")}
                    >
                      Mijn plan
                    </button>
                    {SCIENCE_PLAN_ORDER.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={planMode === "science" && sciencePlanId === id ? "is-chosen" : ""}
                        aria-pressed={planMode === "science" && sciencePlanId === id}
                        onClick={() => changeSciencePlan(id)}
                      >
                        {SCIENCE_PLANS[id].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="account-setting">
                  <div className="account-setting-head">
                    <strong>Trainingsdagen</strong>
                    <small>Tik een dag aan of uit. Geldt vanaf deze week.</small>
                  </div>
                  <div className="account-week" role="group" aria-label="Trainingsdagen aanpassen">
                    {weekDays.map((calendarDate) => {
                      const key = dateKey(calendarDate);
                      const assignment = scheduleForDate(key);
                      const training = assignment !== "rest";
                      const label = calendarDate.toLocaleDateString("nl-BE", { weekday: "short" }).slice(0, 2);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`account-day ${training ? "is-training" : ""}`}
                          aria-pressed={training}
                          onClick={() => toggleScheduleDay(key)}
                        >
                          <span>{label}</span>
                          <em>{training ? (activePlan.find((item) => item.id === planIdForMode(assignment, planMode, sciencePlanId))?.short ?? "").slice(0, 5) : "rust"}</em>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="account-setting">
                  <div className="account-setting-head">
                    <strong>Dagdoelen</strong>
                    <small>Calorieën en macro&rsquo;s waar je voeding tegen afzet.</small>
                  </div>
                  <div className="account-targets">
                    {([
                      ["calories", "kcal"],
                      ["protein", "g eiwit"],
                      ["carbs", "g kh"],
                      ["fat", "g vet"],
                    ] as Array<[keyof Targets, string]>).map(([field, unit]) => (
                      <label key={field}>
                        <input
                          inputMode="numeric"
                          value={targets[field]}
                          aria-label={unit}
                          onChange={(event) => {
                            const value = Number(event.target.value.replace(/[^0-9]/g, ""));
                            setTargets((current) => ({ ...current, [field]: Number.isFinite(value) ? value : 0 }));
                          }}
                        />
                        <span>{unit}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="account-rows">
                <div className="account-row">
                  <span className="account-row-icon"><ShieldCheck /></span>
                  <div>
                    <strong>Afgeschermd</strong>
                    <small>Alles wordt per account bewaard. Uitloggen laat je instellingen staan; ze verdwijnen alleen als iemand anders zich hier aanmeldt.</small>
                  </div>
                </div>
              </div>

              <div className="account-danger">
                <div>
                  <strong>Opnieuw beginnen</strong>
                  <small>Wist je sessies, metingen, voeding en planning, en stelt je account opnieuw in.</small>
                </div>
                <button type="button" className="account-danger-action" onClick={() => setResetOpen(true)}>
                  <RefreshCw /> Wis alle progressie
                </button>
              </div>

              <div className="account-actions">
                {account ? (
                  <button
                    type="button"
                    className="account-action account-action-quiet"
                    onClick={() => {
                      void signOutEverywhere().finally(() => {
                        window.location.href = "/login";
                      });
                    }}
                  >
                    <LogOut /> Uitloggen
                  </button>
                ) : (
                  <a className="account-action account-action-primary" href="/login">
                    <Cloud /> Aanmelden en synchroniseren
                  </a>
                )}
                {syncStatus === "offline" && account && (
                  <button type="button" className="account-action account-action-quiet" onClick={() => window.location.reload()}>
                    <RefreshCw /> Opnieuw proberen
                  </button>
                )}
              </div>
            </section>
        </TabsPrimitive.Content>

        <div className="sl-tabbar-wrap" hidden={activeTab === "loggen"}>
          <TabsPrimitive.List className="sl-tabbar" aria-label="Hoofdmenu">
            <TabsPrimitive.Trigger value="training" className="sl-tab">
              <IconCalendar />
              <span>Training</span>
            </TabsPrimitive.Trigger>
            <TabsPrimitive.Trigger value="loggen" className="sl-tab">
              <IconBarbell />
              <span>Loggen</span>
            </TabsPrimitive.Trigger>
            <TabsPrimitive.Trigger value="voeding" className="sl-tab">
              <IconFork />
              <span>Voeding</span>
            </TabsPrimitive.Trigger>
            <TabsPrimitive.Trigger value="progressie" className="sl-tab">
              <IconChart />
              <span>Progressie</span>
            </TabsPrimitive.Trigger>
            <TabsPrimitive.Trigger value="transformatie" className="sl-tab">
              <IconCamera />
              <span>Foto’s</span>
            </TabsPrimitive.Trigger>
          </TabsPrimitive.List>
        </div>
      </TabsPrimitive.Root>

      {restFloating && restTimer && (
        <div className="sl-float-rest">
          <RestPill
            timer={restTimer}
            onAdjust={adjustRest}
            onReset={resetRestToPlan}
            onSkip={skipRest}
            onDismiss={() => setRestTimer(null)}
            onOpenLog={() => changeTab("loggen")}
          />
        </div>
      )}

      {/* ------------------------------------------------------------ Agenda */}
      <Sheet open={agendaOpen} onOpenChange={setAgendaOpen} title="Agenda" subtitle="Planning en resultaten">
        <div className="sl-weeknav">
          <button type="button" className="sl-icon-btn" onClick={() => setWeekOffset((value) => value - 1)} aria-label="Vorige week">
            <IconChevronLeft size={18} />
          </button>
          <div className="sl-weeknav-mid" aria-live="polite">
            <b>{weekLabel}</b>
            <span className="sl-num">{weekRangeLabel}</span>
          </div>
          <button type="button" className="sl-icon-btn" onClick={() => setWeekOffset((value) => value + 1)} aria-label="Volgende week">
            <IconChevronRight size={18} />
          </button>
        </div>
        <div className="sl-weeknav-tools">
          {weekOffset !== 0 && (
            <button type="button" className="sl-btn-outline" onClick={() => setWeekOffset(0)}>Naar deze week</button>
          )}
          <button type="button" className="sl-btn-outline" aria-expanded={monthOpen} onClick={() => setMonthOpen((value) => !value)}>
            <IconCalendar size={16} />
            {monthOpen ? "Week tonen" : "Hele maand"}
          </button>
        </div>
        {monthOpen && (
          <div className="sl-month" role="group" aria-label={`Maandoverzicht ${monthLabel}`}>
            <p className="sl-month-label">{monthLabel}</p>
            <div className="sl-month-grid">
              {["ma", "di", "wo", "do", "vr", "za", "zo"].map((label) => (
                <span key={label} aria-hidden="true">{label}</span>
              ))}
              {monthDays.map((calendarDate) => {
                const iso = dateKey(calendarDate);
                const inMonth = calendarDate.getMonth() === monthAnchor.getMonth();
                const isDone = sessions.some((entry) => dateKey(new Date(entry.date)) === iso);
                return (
                  <button
                    key={iso}
                    type="button"
                    className="sl-month-day sl-num"
                    data-muted={!inMonth || undefined}
                    data-today={iso === todayKey || undefined}
                    aria-pressed={iso === selectedDate}
                    aria-current={iso === todayKey ? "date" : undefined}
                    aria-label={`${calendarDate.toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" })}${isDone ? ", sessie gelogd" : ""}`}
                    onClick={() => {
                      goToDate(iso);
                      const diff = Math.round((startOfWeek(calendarDate).getTime() - startOfWeek().getTime()) / (7 * 24 * 60 * 60 * 1000));
                      setWeekOffset(diff);
                      setMonthOpen(false);
                      setAgendaDay(iso);
                    }}
                  >
                    {calendarDate.getDate()}
                    {isDone && <i aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="sl-agenda-summary">
          <span className="sl-num">
            <b>{agendaDone} van {agendaPlanned}</b> trainingen gedaan {weekLabel.toLowerCase()}
          </span>
          <div className="sl-segments" aria-hidden="true">
            {agendaWeek.map((entry) => (
              <i
                key={entry.key}
                data-kind={entry.workout ? "done" : entry.isToday && !entry.isRest ? "today" : entry.isRest ? "rest" : undefined}
              />
            ))}
          </div>
        </div>

        <div className="sl-section-head">
          <h3 className="sl-section-title">{weekLabel}</h3>
          <span className="sl-section-meta sl-num">{weekRangeLabel}</span>
        </div>
        <div className="sl-list" data-raised>
          {agendaWeek.map((entry) => {
            const expanded = agendaDay === entry.key && entry.key === selectedDate;
            const setCount = entry.template.exercises.reduce((total, exercise) => total + setsPlannedFor(exercise), 0);
            const dateLabel = entry.date.toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });
            return (
              <Fragment key={entry.key}>
                <button
                  type="button"
                  className="sl-row"
                  data-kind={entry.isRest && !entry.workout ? "rest" : undefined}
                  data-today={(entry.isToday && !entry.workout) || undefined}
                  aria-expanded={expanded}
                  aria-controls={expanded ? `sl-day-${entry.key}` : undefined}
                  onClick={() => {
                    if (entry.key !== selectedDate) goToDate(entry.key);
                    setAgendaDay(expanded ? null : entry.key);
                  }}
                >
                  <span className="sl-row-date sl-num">{weekdayShort(entry.date)}<b>{entry.date.getDate()}</b></span>
                  {entry.workout ? (
                    <span className="sl-row-main">
                      <span className="sl-row-title">Voltooid</span>
                      <span className="sl-row-sub sl-num">{entry.workout.dayLabel} · {loggedSetsIn(entry.workout)} sets</span>
                    </span>
                  ) : entry.isRest ? (
                    <span className="sl-row-rest">{entry.recovery ? "Rust · herstel gelogd" : "Rust"}</span>
                  ) : (
                    <span className="sl-row-main">
                      <span className="sl-row-title">{entry.template.short}</span>
                      <span className="sl-row-sub sl-num">{entry.template.focus} · {setCount} sets</span>
                    </span>
                  )}
                  <span className="sl-row-end">
                    {entry.workout || entry.recovery ? (
                      <IconDone />
                    ) : entry.isRest ? (
                      <span className="sl-rest-ink"><IconMoon /></span>
                    ) : entry.isToday ? (
                      <span className="sl-badge-small">Vandaag</span>
                    ) : null}
                    <IconChevronDown className={expanded ? "sl-chev sl-chev-open" : "sl-chev"} />
                  </span>
                </button>
                {expanded && (
                  <div id={`sl-day-${entry.key}`} className="sl-row-panel">
                    {entry.workout && (
                      <div className="sl-result-lines">
                        <p className="sl-panel-label">Resultaten</p>
                        {entry.workout.results.map((row) => {
                          const sets = resultSets(row).filter(isLoggedSet);
                          return sets.length ? (
                            <div key={row.exerciseId} className="sl-result-line sl-num">
                              <span>{row.name}</span>
                              <span>{summarizeSets(sets)}</span>
                            </div>
                          ) : null;
                        })}
                        <div className="sl-btn-row">
                          <button type="button" className="sl-btn-outline" onClick={() => entry.workout && openSessionEditor(entry.workout)}>
                            <Pencil size={16} aria-hidden="true" />
                            Bewerken
                          </button>
                          <button
                            type="button"
                            className="sl-btn-outline"
                            data-tone="danger"
                            onClick={() => entry.workout && setDeleteTarget({ kind: "session", id: entry.workout.id, label: `${entry.workout.dayLabel} · ${dateLabel}` })}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                            Verwijderen
                          </button>
                        </div>
                      </div>
                    )}
                    {entry.recovery && (
                      <div className="sl-result-lines">
                        <p className="sl-panel-label">Herstel</p>
                        <div className="sl-result-line"><span>Slaap</span><span>{recoveryLevelLabel("sleep", entry.recovery.recovery?.sleep ?? "")}</span></div>
                        <div className="sl-result-line"><span>Spierstijfheid</span><span>{recoveryLevelLabel("soreness", entry.recovery.recovery?.soreness ?? "")}</span></div>
                        <div className="sl-result-line"><span>Energie</span><span>{recoveryLevelLabel("energy", entry.recovery.recovery?.energy ?? "")}</span></div>
                        {(entry.recovery.recovery?.activities ?? []).map((activity) => (
                          <div key={activity.id} className="sl-result-line"><span>{activity.name}</span><span>{activity.dose}</span></div>
                        ))}
                        {entry.recovery.recovery?.note && <p className="sl-panel-note">{entry.recovery.recovery.note}</p>}
                        <button
                          type="button"
                          className="sl-btn-outline"
                          data-tone="danger"
                          onClick={() => entry.recovery && setDeleteTarget({ kind: "session", id: entry.recovery.id, label: `Rest day · ${dateLabel}` })}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                          Verwijderen
                        </button>
                      </div>
                    )}
                    {!entry.workout && (
                      <>
                        <div>
                          <p className="sl-panel-label">Training voor deze dag</p>
                          <div className="sl-chips" role="group" aria-label={`Training kiezen voor ${selectedDateLabel}`} style={{ marginTop: 8 }}>
                            {workoutChoices.map((choice) => {
                              const template = choice === "rest"
                                ? REST_DAY
                                : activePlan.find((item) => item.id === planIdForMode(choice, planMode, sciencePlanId)) ?? REST_DAY;
                              return (
                                <button
                                  key={choice}
                                  type="button"
                                  className="sl-chip"
                                  data-rest={choice === "rest" || undefined}
                                  aria-pressed={scheduleForDate(selectedDate) === choice}
                                  onClick={() => chooseWorkoutForDate(choice)}
                                >
                                  <span className="sl-chip-tile"><CategoryGlyph kind={categoryForTemplate(template)} /></span>
                                  <span>{workoutLabelForSlot(choice)}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <button type="button" className="sl-btn-outline" onClick={() => setMoveSourceDate(selectedDate)}>
                          <ArrowRightLeft size={16} aria-hidden="true" />
                          Verplaatsen naar een andere dag
                        </button>
                        {!entry.isRest && entry.isToday && (
                          <div className="sl-daycard-actions">
                            <button type="button" className="sl-btn-start" onClick={startTraining}>
                              <IconPlay />
                              {draftTrackedSetCount > 0 ? "Hervat training" : "Start training"}
                            </button>
                            <button
                              type="button"
                              className="sl-btn-quiet"
                              onClick={() => {
                                setAgendaOpen(false);
                                setPreviewOpen(true);
                              }}
                            >
                              Oefeningen bekijken
                              <IconChevronRight className="sl-chev" />
                            </button>
                          </div>
                        )}
                        {!entry.isRest && entry.key < todayKey && (
                          <div className="sl-btn-row">
                            <button type="button" className="sl-btn-outline" onClick={logAfterwards}>Achteraf loggen</button>
                            <button
                              type="button"
                              className="sl-btn-outline"
                              onClick={() => {
                                setAgendaOpen(false);
                                setPreviewOpen(true);
                              }}
                            >
                              Oefeningen
                            </button>
                          </div>
                        )}
                        {!entry.isRest && entry.key > todayKey && (
                          <button
                            type="button"
                            className="sl-btn-outline"
                            onClick={() => {
                              setAgendaOpen(false);
                              setPreviewOpen(true);
                            }}
                          >
                            Oefeningen bekijken
                          </button>
                        )}
                        {entry.isRest && !entry.recovery && entry.key <= todayKey && (
                          <button type="button" className="sl-btn-outline" data-tone="rest" onClick={logAfterwards}>
                            Herstel loggen
                          </button>
                        )}
                      </>
                    )}
                    <p className="sl-panel-note">Historiek blijft op de werkelijk opgeslagen dag staan.</p>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

        {previousWeekSessions.length > 0 && (
          <>
            <div className="sl-section-head">
              <h3 className="sl-section-title">{weekOffset === 0 ? "Vorige week" : "Week ervoor"}</h3>
              <span className="sl-section-meta sl-num">{previousWeekRange}</span>
            </div>
            <div className="sl-list" data-raised>
              {previousWeekSessions.map((session) => {
                const best = bestOfSession(session);
                const date = new Date(session.date);
                return (
                  <div key={session.id} className="sl-row">
                    <span className="sl-row-date sl-num">{weekdayShort(date)}<b>{date.getDate()}</b></span>
                    <span className="sl-row-main">
                      <span className="sl-row-title">{session.dayLabel}</span>
                      <span className="sl-row-sub sl-num">
                        {best ? `Beste set ${best.name} ${formatKg(best.weight)} kg × ${best.reps}` : `${loggedSetsIn(session)} sets`}
                      </span>
                    </span>
                    <span className="sl-row-end"><IconDone /></span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <Collapsible className="sl-disclosure">
          <CollapsibleTrigger className="sl-disclosure-trigger">
            <span>
              Schema
              <small>{planMode === "personal" ? "Mijn plan · PPL + Upper/Lower op maat" : `${activeSciencePlan.label} · ${activeSciencePlan.daysLabel}`}</small>
            </span>
            <IconChevronDown />
          </CollapsibleTrigger>
          <CollapsibleContent className="sl-disclosure-body">
            <div className="sl-segmented" role="group" aria-label="Trainingsplan kiezen">
              <button type="button" aria-pressed={planMode === "personal"} onClick={() => changePlanMode("personal")}>Mijn plan</button>
              <button type="button" aria-pressed={planMode === "science"} onClick={() => changePlanMode("science")}>Science-based</button>
            </div>
            {planMode === "science" && (
              <>
                <div className="sl-list" data-raised>
                  {SCIENCE_PLAN_ORDER.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="sl-activity"
                      aria-pressed={sciencePlanId === id}
                      onClick={() => changeSciencePlan(id)}
                    >
                      <span>
                        <small>{SCIENCE_PLANS[id].daysLabel}</small>
                        <b>{SCIENCE_PLANS[id].label}</b>
                        <p>{SCIENCE_PLANS[id].summary}</p>
                      </span>
                      <span className="sl-setrow-ring" aria-hidden="true">{sciencePlanId === id ? <IconCheck /> : null}</span>
                    </button>
                  ))}
                </div>
                <div>
                  <strong>Waarom {activeSciencePlan.label}?</strong>
                  <p>{activeSciencePlan.comparison}</p>
                </div>
                <div>
                  <strong>Verdeling</strong>
                  <p>{activeSciencePlan.frequency}. {activeSciencePlan.distribution}</p>
                </div>
                <div>
                  <strong>Volume</strong>
                  <p>Ongeveer 9–14 directe sets per grote spiergroep; onder de zone waar rendement sterk begint af te vlakken.</p>
                </div>
                <div>
                  <strong>Inspanning</strong>
                  <p>Praktisch uitgangspunt: compounds RIR 1–2. Falentraining is niet verplicht; isolatie mag op de laatste set dichterbij.</p>
                </div>
                <div>
                  <strong>Uitvoering</strong>
                  <p>Prioriteitsoefeningen eerst, volledige pijnvrije ROM en voldoende rust om reps en techniek te behouden.</p>
                </div>
                <div>
                  <strong>Jouw persoonlijke plan</strong>
                  <p>Zware flat bench op Push en een lichtere paused bench op Upper. De rest blijft gericht op jouw side delts, latbreedte en bovenborst.</p>
                </div>
                <div className="sl-sources">
                  {SCIENCE_SOURCES.map((source) => (
                    <a key={source.href} href={source.href} target="_blank" rel="noreferrer">
                      {source.label}
                      <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  ))}
                </div>
                <p>Origineel referentieprogramma op basis van publieke literatuur en principes; geen kopie van of samenwerking met Jeff Nippard.</p>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>

        <Collapsible className="sl-disclosure">
          <CollapsibleTrigger className="sl-disclosure-trigger">
            <span>
              Historiek
              <small className="sl-num">
                {sessions.length} {sessions.length === 1 ? "sessie" : "sessies"} · bekijken, bewerken en verwijderen
              </small>
            </span>
            <IconChevronDown />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {sessions.length === 0 ? (
              <p className="sl-empty">
                <strong>Nog geen sessies</strong>
                Sla je eerste workout of rustdag op; oefeningen, sets en check-ins verschijnen daarna hier.
              </p>
            ) : (
              <div className="sl-history">
                {orderedSessions.map((session) => {
                  const isRecoverySession = session.sessionType === "recovery" || session.dayId === "rest";
                  const loggedSets = loggedSetsIn(session);
                  const recoveryActivities = session.recovery?.activities
                    ?? session.results.map((row) => ({ id: row.exerciseId, name: row.name, dose: row.recoveryDetail ?? "" }));
                  const sessionDate = new Date(session.date);
                  const dateLabel = sessionDate.toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });
                  return (
                    <Collapsible key={session.id}>
                      <div className="sl-history-row">
                        <CollapsibleTrigger className="sl-history-open">
                          <b>{session.dayLabel}</b>
                          <span className="sl-num">
                            {dateLabel} · {isRecoverySession ? `${recoveryActivities.length} herstelblokken` : `${loggedSets} werksets · ${session.completion}%`}
                          </span>
                        </CollapsibleTrigger>
                        <span className="sl-history-actions">
                          {!isRecoverySession && (
                            <button
                              type="button"
                              className="sl-icon-btn"
                              onClick={() => openSessionEditor(session)}
                              aria-label={`${session.dayLabel} van ${dateLabel} bewerken`}
                            >
                              <Pencil size={18} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="sl-icon-btn"
                            onClick={() => setDeleteTarget({ kind: "session", id: session.id, label: `${session.dayLabel} · ${dateLabel}` })}
                            aria-label={`${session.dayLabel} van ${dateLabel} verwijderen`}
                          >
                            <Trash2 size={18} />
                          </button>
                        </span>
                      </div>
                      <CollapsibleContent className="sl-history-detail">
                        {isRecoverySession ? (
                          <>
                            <div className="sl-result-line"><span>Slaap</span><span>{recoveryLevelLabel("sleep", session.recovery?.sleep ?? "")}</span></div>
                            <div className="sl-result-line"><span>Stijfheid</span><span>{recoveryLevelLabel("soreness", session.recovery?.soreness ?? "")}</span></div>
                            <div className="sl-result-line"><span>Energie</span><span>{recoveryLevelLabel("energy", session.recovery?.energy ?? "")}</span></div>
                            {recoveryActivities.length ? (
                              recoveryActivities.map((activity) => (
                                <div key={`${session.id}-${activity.id}`} className="sl-result-line"><span>{activity.name}</span><span>{activity.dose}</span></div>
                              ))
                            ) : (
                              <p className="sl-panel-note">Volledige rust; geen herstelblokken nodig of gelogd.</p>
                            )}
                            {session.recovery?.note && <p className="sl-panel-note">{session.recovery.note}</p>}
                          </>
                        ) : (
                          session.results.map((row) => {
                            const sets = resultSets(row).filter((set) => set.weight || set.reps || set.pausedReps);
                            return (
                              <div key={`${session.id}-${row.exerciseId}`} className="sl-result-lines">
                                <div className="sl-result-line"><span><b>{row.name}</b></span><span>{sets.length ? `${sets.length} sets` : "Geen cijfers gelogd"}</span></div>
                                {sets.map((set, index) => (
                                  <div key={`${row.exerciseId}-${index}`} className="sl-result-line sl-num">
                                    <span>Set {index + 1}</span>
                                    <span>{set.weight ? `${set.weight} kg` : "—"} · {setSummary(set)}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </Sheet>

      {/* ----------------------------------------------------------- Preview */}
      <Sheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={isRestDay ? "Rustdag" : `${day.short} · ${day.focus.charAt(0).toLowerCase()}${day.focus.slice(1)}`}
        subtitle="Voorbeeld · start nog niet"
      >
        {isRestDay ? (
          <p className="sl-help">Geen training gepland op {selectedDateLabel}.</p>
        ) : (
          <>
            <div className="sl-stats" style={{ "--sl-stat-count": lastSameVolume > 0 ? 4 : 3 } as CSSProperties}>
              <div className="sl-stat">
                <b className="sl-num">~{minutesFor(day)}</b>
                <span>min</span>
              </div>
              <div className="sl-stat">
                <b className="sl-num">{day.exercises.length}</b>
                <span>oefeningen</span>
              </div>
              <div className="sl-stat">
                <b className="sl-num">{plannedSetCount}</b>
                <span>sets</span>
              </div>
              {lastSameVolume > 0 && (
                <div className="sl-stat">
                  <b className="sl-num">{formatKg(Math.round(lastSameVolume / 100) / 10)} t</b>
                  <span>vorige keer</span>
                </div>
              )}
            </div>
            <ol className="sl-numbered" aria-label="Oefeningen">
              {day.exercises.map((exercise, index) => {
                const previous = recentExerciseHistory(exercise.id)[0];
                const top = previous ? topWeightOf(previous.sets) : 0;
                return (
                  <li key={exercise.id} className="sl-numbered-row">
                    <span className="sl-num">{index + 1}</span>
                    <span className="sl-numbered-name">{exercise.name}</span>
                    <span className="sl-numbered-meta sl-num">
                      {exercise.prescription}
                      {top > 0 ? ` · vorige ${formatKg(top)} kg` : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="sl-daycard-actions">
              {isToday && cardKind !== "done" && (
                <button type="button" className="sl-btn-start" onClick={startTraining}>
                  <IconPlay />
                  {cardKind === "active" ? "Hervat training" : "Start training"}
                </button>
              )}
              {!isToday && !selectedIsFuture && cardKind !== "done" && (
                <button type="button" className="sl-btn-start" onClick={logAfterwards}>Achteraf loggen</button>
              )}
              <button type="button" className="sl-btn-quiet" onClick={() => setPreviewOpen(false)}>Terug naar overzicht</button>
            </div>
          </>
        )}
      </Sheet>

      {/* -------------------------------------------------------------- Swap */}
      <Sheet
        open={swapOpen}
        onOpenChange={setSwapOpen}
        title="Oefening wisselen"
        subtitle={logExercise ? `${logExercise.name} · je krachtgeschiedenis blijft gekoppeld` : undefined}
      >
        <div className="sl-list" data-raised>
          {logVariants.map((option) => (
            <button
              key={option.name}
              type="button"
              className="sl-activity"
              aria-pressed={logExercise?.name === option.name}
              onClick={() => {
                if (logExercise) chooseExerciseVariant(day.id, logExercise, option.name);
                setSwapOpen(false);
              }}
            >
              <span>
                <small>{option.fit}</small>
                <b>{option.name}</b>
                {option.why && <p>{option.why}</p>}
              </span>
              <span className="sl-setrow-ring" aria-hidden="true">{logExercise?.name === option.name ? <IconCheck /> : null}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="sl-btn-outline"
          onClick={() => {
            if (logExercise) chooseExerciseVariant(day.id, logExercise, "__manual__");
            setSwapOpen(false);
          }}
        >
          <Pencil size={16} aria-hidden="true" />
          Meer aanpassen…
        </button>
      </Sheet>

      {/* ------------------------------------------------------------ Plates */}
      <Sheet
        open={platesOpen}
        onOpenChange={setPlatesOpen}
        title="Schijven per kant"
        subtitle={`stang ${barWeight} kg · ${formatKg(focusValues?.weight ?? 0)} kg totaal`}
      >
        <PlateStack total={focusValues?.weight ?? 0} bar={barWeight} />
        <div className="sl-bar-choice">
          <button type="button" aria-pressed={barWeight === 20} onClick={() => setBarWeight(20)}>stang 20 kg</button>
          <button type="button" aria-pressed={barWeight === 15} onClick={() => setBarWeight(15)}>stang 15 kg</button>
          <button type="button" data-kind="close" onClick={() => setPlatesOpen(false)}>Sluiten</button>
        </div>
      </Sheet>

      {/* -------------------------------------------------------------- Food */}
      <Sheet open={foodSheetOpen} onOpenChange={setFoodSheetOpen} title="Maaltijd loggen" subtitle={capitalize(nutritionDateLabel)}>
        <form
          id="nutrition-entry-form"
          className="sl-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (addNutritionEntry()) setFoodSheetOpen(false);
          }}
        >
          <div className="sl-choice-row" role="group" aria-label="Maaltijd">
            {MEAL_OPTIONS.map((meal) => (
              <button
                key={meal}
                type="button"
                className="sl-pill-btn"
                aria-pressed={nutritionDraft.meal === meal}
                onClick={() => setNutritionDraft((current) => ({ ...current, meal }))}
              >
                {meal}
              </button>
            ))}
          </div>
          <div className="sl-field">
            <label htmlFor="food-search">Product zoeken · Belgisch of generiek</label>
            <div className="sl-search">
              <input
                id="food-search"
                className="sl-text"
                value={foodQuery}
                onChange={(event) => setFoodQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void searchFoodProducts();
                  }
                }}
                placeholder="Bijv. Boni skyr, banaan…"
              />
              <button
                type="button"
                className="sl-pill-btn"
                onClick={() => void searchFoodProducts()}
                disabled={foodSearchLoading || foodQuery.trim().length < 2}
              >
                {foodSearchLoading ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
                Zoek
              </button>
            </div>
          </div>
          {foodSearchError && <p className="sl-error">{foodSearchError}</p>}
          {foodResults.length > 0 && (
            <div className="sl-list" data-raised role="listbox" aria-label="Gevonden voedingsproducten">
              {foodResults.map((food) => (
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  key={food.id}
                  className="sl-food-result"
                  onClick={() => chooseFood(food)}
                >
                  {food.imageUrl ? <img src={food.imageUrl} alt="" /> : <span className="sl-food-thumb"><PackageSearch size={18} /></span>}
                  <span>
                    <b>{food.name}</b>
                    <small>{food.brand} · {food.sourceNote}</small>
                    <small className="sl-num">P {food.protein.toFixed(1)} · C {food.carbs.toFixed(1)} · V {food.fat.toFixed(1)} g</small>
                  </span>
                  <span className="sl-food-kcal sl-num">
                    {Math.round(food.calories)}
                    <small> kcal</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          {selectedFood && (
            <>
              <div className="sl-note-line">
                <i aria-hidden="true" />
                <p>
                  {selectedFood.name}
                  <small>{selectedFood.source} · waarden blijven handmatig aanpasbaar</small>
                </p>
              </div>
              <label className="sl-field">
                Hoeveelheid (g)
                <input className="sl-text" inputMode="decimal" value={foodAmount} onChange={(event) => changeFoodAmount(event.target.value)} />
              </label>
            </>
          )}
          <label className="sl-field">
            Product of maaltijd
            <input
              className="sl-text"
              value={nutritionDraft.name}
              onChange={(event) => setNutritionDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Bijv. 40 g Rice Krispies"
            />
          </label>
          <div className="sl-field-row" style={{ "--sl-cols": 4 } as CSSProperties}>
            {([
              ["calories", "kcal", "0"],
              ["protein", "Eiwit", "g"],
              ["carbs", "Carbs", "g"],
              ["fat", "Vet", "g"],
            ] as const).map(([field, label, placeholder]) => (
              <label key={field} className="sl-field">
                {label}
                <input
                  className="sl-text"
                  inputMode="decimal"
                  value={nutritionDraft[field]}
                  onChange={(event) => setNutritionDraft((current) => ({ ...current, [field]: event.target.value }))}
                  placeholder={placeholder}
                />
              </label>
            ))}
          </div>
          <p className="sl-help">Laat kcal leeg en de app rekent ze uit eiwit, carbs en vet.</p>
          <button type="submit" className="sl-btn-start">
            <IconPlus />
            Toevoegen aan {nutritionIsToday ? "vandaag" : nutritionDateLabel}
          </button>
          <p className="sl-help">
            Productdata via <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>; controleer altijd het Belgische etiket.
          </p>
        </form>
        <section className="sl-section" aria-labelledby="sl-ideas-title">
          <div className="sl-section-head">
            <h3 id="sl-ideas-title" className="sl-section-title">Eetideeën</h3>
            <span className="sl-section-meta sl-num">{formatThousands(targets.calories)} kcal · {targets.protein} g eiwit</span>
          </div>
          <div className="sl-segmented" role="tablist" aria-label="Maaltijdmoment kiezen">
            {MEAL_IDEA_TYPES.map((meal) => (
              <button type="button" role="tab" key={meal} aria-selected={mealIdeaType === meal} onClick={() => setMealIdeaType(meal)}>
                {meal === "Avondeten" ? "Diner" : meal}
              </button>
            ))}
          </div>
          <div className="sl-list" data-raised role="tabpanel" aria-label={`${mealIdeaType} ideeën`}>
            {MEAL_IDEAS[mealIdeaType].map((idea) => (
              <div key={idea.id} className="sl-idea">
                <span>
                  <b>{idea.name}</b>
                  <p className="sl-num">
                    {idea.description} · {idea.calories} kcal · P {idea.protein} · C {idea.carbs} · V {idea.fat}
                  </p>
                </span>
                <button type="button" className="sl-pill-btn" onClick={() => chooseMealIdea(idea)} aria-label={`${idea.name} vooraf invullen`}>
                  Invullen
                </button>
              </div>
            ))}
          </div>
        </section>
      </Sheet>

      {/* ------------------------------------------------------------ Metric */}
      <Sheet open={metricSheetOpen} onOpenChange={setMetricSheetOpen} title="Nieuwe meting" subtitle="’s Ochtends nuchter, voor het ontbijt">
        <form
          className="sl-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (addMetric()) setMetricSheetOpen(false);
          }}
        >
          <label className="sl-field">
            Datum
            <input
              className="sl-text"
              type="date"
              value={metricDraft.date}
              onChange={(event) => setMetricDraft((current) => ({ ...current, date: event.target.value }))}
            />
          </label>
          <div className="sl-field-row">
            <label className="sl-field">
              Gewicht (kg)
              <input
                className="sl-text"
                inputMode="decimal"
                value={metricDraft.weight}
                onChange={(event) => setMetricDraft((current) => ({ ...current, weight: event.target.value }))}
                placeholder="78,0"
              />
            </label>
            <label className="sl-field">
              Taille (cm)
              <input
                className="sl-text"
                inputMode="decimal"
                value={metricDraft.waist}
                onChange={(event) => setMetricDraft((current) => ({ ...current, waist: event.target.value }))}
                placeholder="Optioneel"
              />
            </label>
          </div>
          <button type="submit" className="sl-btn-start">Meting opslaan</button>
        </form>
        {orderedMetrics.length > 0 && (
          <section className="sl-section" aria-labelledby="sl-metrics-title">
            <div className="sl-section-head">
              <h3 id="sl-metrics-title" className="sl-section-title">Metingen</h3>
              <span className="sl-section-meta sl-num">laatste {orderedMetrics.length}</span>
            </div>
            <div className="sl-list" data-raised>
              {[...orderedMetrics].reverse().map((metric, index, list) => {
                const previous = list[index + 1];
                const delta = previous ? Math.round((metric.weight - previous.weight) * 10) / 10 : null;
                const dateLabel = new Date(`${metric.date}T12:00:00`).toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });
                return (
                  <div key={metric.id} className="sl-metric sl-num">
                    <span>
                      {dateLabel}
                      {metric.waist ? <small>{formatKg(Math.round(metric.waist * 10) / 10)} cm taille</small> : null}
                    </span>
                    <b>{formatKg(Math.round(metric.weight * 10) / 10)} kg</b>
                    <span>{delta === null ? "start" : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${formatKg(Math.abs(delta))}`}</span>
                    <button
                      type="button"
                      className="sl-icon-btn"
                      onClick={() => setDeleteTarget({ kind: "metric", id: metric.id, label: `${dateLabel} · ${metric.weight.toFixed(1)} kg` })}
                      aria-label={`Meting van ${dateLabel} verwijderen`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </Sheet>

      {/* ------------------------------------------------------ Photo upload */}
      <Sheet open={photoSheetOpen} onOpenChange={setPhotoSheetOpen} title="Nieuwe opname" subtitle="Zelfde pose, licht en afstand">
        <form
          className="sl-form"
          onSubmit={(event) => {
            event.preventDefault();
            void uploadProgressPhoto().then((saved) => {
              if (saved) setPhotoSheetOpen(false);
            });
          }}
        >
          <label className="sl-dropzone">
            {photoPreview ? (
              <img src={photoPreview} alt="Voorbeeld van je gekozen progressiefoto" />
            ) : (
              <>
                <IconCameraSmall size={24} />
                <strong>Kies een foto</strong>
                <span>Camera of fotobibliotheek · max. 10 MB</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="sl-sr-only"
              onChange={(event) => choosePhotoFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <div className="sl-field-row">
            <label className="sl-field">
              Datum
              <input
                className="sl-text"
                type="date"
                value={photoDraft.capturedOn}
                max={todayKey}
                onChange={(event) => setPhotoDraft((current) => ({ ...current, capturedOn: event.target.value }))}
              />
            </label>
            <label className="sl-field">
              Gewicht (kg)
              <input
                className="sl-text"
                inputMode="decimal"
                value={photoDraft.weight}
                onChange={(event) => setPhotoDraft((current) => ({ ...current, weight: event.target.value }))}
                placeholder="78,0"
              />
            </label>
          </div>
          {photoError && <p className="sl-error" role="alert">{photoError}</p>}
          <button type="submit" className="sl-btn-start" disabled={photoUploadLoading}>
            {photoUploadLoading ? "Foto voorbereiden…" : "Check-in opslaan"}
          </button>
          <p className="sl-help">Foto’s worden verkleind voor snelle weergave en privé bij je account bewaard.</p>
        </form>
      </Sheet>

      {/* ----------------------------------------------------------- Compare */}
      <Sheet open={compareSheetOpen} onOpenChange={setCompareSheetOpen} title="Datums kiezen" subtitle="Welke twee foto’s zet je naast elkaar?">
        {(["before", "after"] as const).map((slot) => (
          <section key={slot} className="sl-section" aria-labelledby={`sl-compare-${slot}`}>
            <div className="sl-section-head">
              <h3 id={`sl-compare-${slot}`} className="sl-section-title">{slot === "before" ? "Voor" : "Nu"}</h3>
            </div>
            <div className="sl-list" data-raised>
              {photos.map((photo) => {
                const chosen = (slot === "before" ? compareBefore : compareAfter)?.id === photo.id;
                return (
                  <button
                    key={photo.id}
                    type="button"
                    className="sl-activity"
                    aria-pressed={chosen}
                    onClick={() =>
                      setCompareIds({
                        before: slot === "before" ? photo.id : compareBefore?.id ?? photo.id,
                        after: slot === "after" ? photo.id : compareAfter?.id ?? photo.id,
                      })
                    }
                  >
                    <span>
                      <b className="sl-num">{photoDateLabel(photo.capturedOn)}</b>
                      <small className="sl-num">{formatKg(photo.weight)} kg</small>
                    </span>
                    <span className="sl-setrow-ring" aria-hidden="true">{chosen ? <IconCheck /> : null}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <button type="button" className="sl-btn-start" onClick={() => setCompareSheetOpen(false)}>Vergelijken</button>
      </Sheet>

      <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
        <DialogContent className="sl-dialog account-dialog border-white/10 bg-[#101612] text-[#f3f7f4] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Account & clouddata</DialogTitle>
            <DialogDescription className="text-[#8e9a91]">Je voortgang wordt veilig gekoppeld aan je account.</DialogDescription>
          </DialogHeader>
          <div className="account-dialog-profile">
            <span className="account-dialog-avatar">{accountInitials}</span>
            <div><strong>{account?.displayName ?? "Nog niet verbonden"}</strong><small>{account?.email ?? "Log in om tussen toestellen te synchroniseren"}</small></div>
            <span className={`account-sync-badge account-sync-${syncStatus}`}>{syncStatus === "offline" ? <CloudOff /> : syncStatus === "saving" || syncStatus === "connecting" ? <LoaderCircle className="account-spinner" /> : <Cloud />}{syncLabel}</span>
          </div>
          <div className="account-data-card">
            <div><Cloud /><span><strong>Cloudback-up actief</strong><small>Schema, sessies, sets, metingen, voeding en planning.</small></span></div>
            <div><Check /><span><strong>Automatisch migreren</strong><small>Bestaande lokale data wordt behouden en naar je account gekopieerd.</small></span></div>
            <div><ShieldCheck /><span><strong>Persoonlijk afgeschermd</strong><small>Foto’s en trainingsdata worden per ingelogde gebruiker bewaard.</small></span></div>
          </div>
          {lastSyncedAt && <p className="account-last-sync">Laatst gesynchroniseerd · {new Date(lastSyncedAt).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}</p>}
          <DialogFooter className="account-dialog-actions">
            {account ? (
              <button
                type="button"
                className="account-signout"
                onClick={() => {
                  void signOutEverywhere().finally(() => {
                    window.location.href = "/login";
                  });
                }}
              >
                <LogOut /> Uitloggen
              </button>
            ) : (
              <a href="/login" className="account-signin"><Cloud /> Aanmelden</a>
            )}
            {syncStatus === "offline" && <Button variant="ghost" onClick={() => window.location.reload()} className="text-[#a9b5ad] hover:bg-white/5 hover:text-white">Opnieuw proberen</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sl-dialog border-white/10 bg-[#121714] text-[#f3f7f4] sm:max-w-md">
          <DialogHeader><DialogTitle>Oefening aanpassen</DialogTitle><DialogDescription className="text-[#8e9a91]">Je wijziging wordt alleen op dit toestel bewaard.</DialogDescription></DialogHeader>
          {editing && <div className="space-y-4 py-2">
            <label className="field-label">Naam<Input value={editing.exercise.name} onChange={(event) => setEditing((current) => current ? { ...current, exercise: { ...current.exercise, name: event.target.value } } : current)} className="dark-input mt-1.5" /></label>
            <label className="field-label">Sets en reps<Input value={editing.exercise.prescription} onChange={(event) => setEditing((current) => current ? { ...current, exercise: { ...current.exercise, prescription: event.target.value } } : current)} className="dark-input mt-1.5" /></label>
            <label className="field-label">Gewichtsadvies<Input value={editing.exercise.load} onChange={(event) => setEditing((current) => current ? { ...current, exercise: { ...current.exercise, load: event.target.value } } : current)} className="dark-input mt-1.5" /></label>
            <label className="field-label">Rust<Input value={editing.exercise.rest} onChange={(event) => setEditing((current) => current ? { ...current, exercise: { ...current.exercise, rest: event.target.value } } : current)} className="dark-input mt-1.5" /></label>
          </div>}
          <DialogFooter><Button variant="ghost" onClick={() => setEditing(null)} className="text-[#9ba69e] hover:bg-white/5 hover:text-white">Annuleren</Button><Button onClick={saveExercise} className="bg-[#b9f45b] text-[#0a0d0b] hover:bg-[#c7fa74]">Opslaan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingSession)} onOpenChange={(open) => { if (!open) { setEditingSession(null); setSessionEditError(""); } }}>
        <DialogContent className="sl-dialog session-edit-dialog border-white/10 bg-[#0d120f] text-[#f3f7f4] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Workout bewerken</DialogTitle>
            <DialogDescription className="text-[#8e9a91]">
              {editingSession ? `${editingSession.dayLabel} · ${new Date(editingSession.date).toLocaleDateString("nl-BE", { day: "numeric", month: "long", year: "numeric" })}` : "Pas oefeningen en gelogde sets aan."} Je progressie wordt daarna opnieuw berekend.
            </DialogDescription>
          </DialogHeader>
          {editingSession && (
            <div className="session-edit-body">
              <div className="session-edit-note"><Pencil /><span><strong>Wat kun je wijzigen?</strong><small>Kies de juiste oefening, corrigeer kg/reps of voeg een ontbrekende set toe.</small></span></div>
              <div className="session-edit-list">
                {editingSession.results.map((row, resultIndex) => {
                  const sets = resultSets(row);
                  const supportsPausedReps = row.exerciseId.includes("bench") || row.name.toLowerCase().includes("bench");
                  const rowOptions = editableExerciseCatalog.some((exercise) => exercise.id === row.exerciseId)
                    ? editableExerciseCatalog
                    : [{ id: row.exerciseId, name: row.name, prescription: "", load: "", rest: "" }, ...editableExerciseCatalog];
                  return (
                    <article className="session-edit-exercise" key={`${editingSession.id}-${resultIndex}`}>
                      <div className="session-edit-exercise-head">
                        <span className="session-edit-index">{String(resultIndex + 1).padStart(2, "0")}</span>
                        <Select value={row.exerciseId} onValueChange={(value) => changeEditingSessionExercise(resultIndex, value)}>
                          <SelectTrigger className="session-edit-select" aria-label={`Oefening ${resultIndex + 1} wijzigen`}><SelectValue /></SelectTrigger>
                          <SelectContent position="popper" className="session-edit-select-content">
                            {rowOptions.map((option) => (
                              <SelectItem key={option.id} value={option.id} disabled={editingSession.results.some((otherRow, otherIndex) => otherIndex !== resultIndex && otherRow.exerciseId === option.id)}>{option.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" onClick={() => removeEditingSessionExercise(resultIndex)} className="session-edit-remove" aria-label={`${row.name} uit workout verwijderen`}><Trash2 /></Button>
                      </div>
                      <div className="session-edit-sets">
                        {sets.map((set, setIndex) => (
                          <div className="session-edit-set" key={`${row.exerciseId}-${setIndex}`}>
                            <div className="session-edit-set-main">
                              <span>Set {setIndex + 1}</span>
                              <label><input inputMode="decimal" value={set.weight} onChange={(event) => updateEditingSessionSet(resultIndex, setIndex, "weight", event.target.value)} aria-label={`${row.name} set ${setIndex + 1} gewicht`} /><small>kg</small></label>
                              <label><input inputMode="numeric" value={set.reps} onChange={(event) => updateEditingSessionSet(resultIndex, setIndex, "reps", event.target.value)} aria-label={`${row.name} set ${setIndex + 1} reps`} /><small>reps</small></label>
                              <Button variant="ghost" size="icon" onClick={() => removeEditingSessionSet(resultIndex, setIndex)} className="session-edit-set-remove" aria-label={`Set ${setIndex + 1} verwijderen`}><Trash2 /></Button>
                            </div>
                            {(supportsPausedReps || set.pauseEnabled) && (
                              set.pauseEnabled ? <div className="session-edit-pause">
                                <Pause />
                                <label><input inputMode="numeric" value={set.pausedReps ?? ""} onChange={(event) => updateEditingSessionSet(resultIndex, setIndex, "pausedReps", event.target.value)} aria-label={`${row.name} set ${setIndex + 1} gepauzeerde reps, van de reps in deze set`} /><small>paused</small></label>
                                <label><input inputMode="decimal" value={set.pauseSeconds ?? ""} onChange={(event) => updateEditingSessionSet(resultIndex, setIndex, "pauseSeconds", event.target.value)} aria-label={`${row.name} set ${setIndex + 1} pauzeduur`} /><small>sec</small></label>
                                <button type="button" onClick={() => toggleEditingSessionPause(resultIndex, setIndex)}>Verwijder pauze</button>
                              </div> : <button type="button" className="session-edit-add-pause" onClick={() => toggleEditingSessionPause(resultIndex, setIndex)}><Pause /> Paused reps toevoegen</button>
                            )}
                          </div>
                        ))}
                        <button type="button" className="session-edit-add-set" onClick={() => addEditingSessionSet(resultIndex)}><Plus /> Set toevoegen</button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <button type="button" className="session-edit-add-exercise" onClick={addEditingSessionExercise}><Plus /> Oefening toevoegen</button>
              {sessionEditError && <p className="session-edit-error" role="alert">{sessionEditError}</p>}
            </div>
          )}
          <DialogFooter className="session-edit-footer">
            <Button variant="ghost" onClick={() => { setEditingSession(null); setSessionEditError(""); }} className="text-[#9ba69e] hover:bg-white/5 hover:text-white">Annuleren</Button>
            <Button onClick={saveEditedSession} className="bg-[#b9f45b] text-[#0a0d0b] hover:bg-[#c7fa74]"><Save /> Wijzigingen opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={targetDialog} onOpenChange={setTargetDialog}>
        <DialogContent className="sl-dialog border-white/10 bg-[#121714] text-[#f3f7f4] sm:max-w-md">
          <DialogHeader><DialogTitle>Voedingsdoelen aanpassen</DialogTitle><DialogDescription className="text-[#8e9a91]">Pas alleen aan op basis van je weekgemiddelde en tailletrend.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {(["calories", "protein", "carbs", "fat"] as const).map((field) => <label key={field} className="field-label capitalize">{field === "calories" ? "Calorieën" : field === "protein" ? "Eiwit" : field === "carbs" ? "Carbs" : "Vet"}<Input type="number" value={targets[field]} onChange={(event) => setTargets((current) => ({ ...current, [field]: Number(event.target.value) }))} className="dark-input mt-1.5" /></label>)}
          </div>
          <DialogFooter><Button onClick={() => { setTargetDialog(false); setBanner("Doelen aangepast"); }} className="bg-[#b9f45b] text-[#0a0d0b] hover:bg-[#c7fa74]">Doelen opslaan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(moveSourceDate)} onOpenChange={(open) => !open && setMoveSourceDate(null)}>
        <DialogContent className="sl-dialog schedule-dialog border-white/10 bg-[#121714] text-[#f3f7f4] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{moveSourceTemplate?.short ?? "Planning"} verplaatsen</DialogTitle>
            <DialogDescription className="text-[#8e9a91]">Kies een andere dag in deze week. De twee dagen wisselen van planning, zodat geen training verdwijnt of dubbel komt te staan.</DialogDescription>
          </DialogHeader>
          <div className="schedule-target-grid">
            {weekDays.map((calendarDate) => {
              const key = dateKey(calendarDate);
              const assignment = scheduleForDate(key);
              const template = activePlan.find((item) => item.id === planIdForMode(assignment, planMode, sciencePlanId)) ?? REST_DAY;
              const isSource = key === moveSourceDate;
              return (
                <button key={key} type="button" disabled={isSource} onClick={() => movePlannedDay(key)}>
                  <span>{calendarDate.toLocaleDateString("nl-BE", { weekday: "long" })}<small>{calendarDate.getDate()} {calendarDate.toLocaleDateString("nl-BE", { month: "short" })}</small></span>
                  <strong>{isSource ? "Huidige dag" : template.short}</strong>
                  {!isSource && <ArrowRightLeft />}
                </button>
              );
            })}
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setMoveSourceDate(null)} className="text-[#9ba69e] hover:bg-white/5 hover:text-white">Annuleren</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={photoViewerOpen} onOpenChange={(open) => { setPhotoViewerOpen(open); if (!open) setPhotoPlaying(false); }}>
        <DialogContent className="sl-dialog photo-viewer-dialog border-white/10 bg-[#090d0b] text-[#f3f7f4] sm:max-w-5xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Transformatie bekijken</DialogTitle>
            <DialogDescription>Bekijk of speel je dagelijkse progressiefoto’s chronologisch af.</DialogDescription>
          </DialogHeader>
          {viewerPhoto && (
            <div className="photo-viewer-shell">
              <div className="photo-viewer-topbar">
                <div><span>{photoIndex + 1} / {photos.length}</span><strong>{photoDateLabel(viewerPhoto.capturedOn)}</strong><em>{viewerPhoto.weight.toFixed(1)} kg</em></div>
                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ kind: "photo", id: viewerPhoto.id, label: `Foto van ${photoDateLabel(viewerPhoto.capturedOn)} · ${viewerPhoto.weight.toFixed(1)} kg` })} aria-label="Deze foto verwijderen"><Trash2 /></Button>
              </div>
              <div className="photo-viewer-stage">
                <button type="button" onClick={() => setPhotoIndex((current) => (current - 1 + photos.length) % photos.length)} aria-label="Vorige foto"><ChevronLeft /></button>
                <img key={viewerPhoto.id} src={viewerPhoto.imageUrl} alt={`Progressiefoto van ${photoDateLabel(viewerPhoto.capturedOn)}`} />
                <button type="button" onClick={() => setPhotoIndex((current) => (current + 1) % photos.length)} aria-label="Volgende foto"><ChevronRight /></button>
              </div>
              <div className="photo-viewer-progress"><span style={{ width: `${((photoIndex + 1) / photos.length) * 100}%` }} /></div>
              <div className="photo-viewer-controls">
                <div className="viewer-playback-buttons">
                  <Button variant="ghost" size="icon" onClick={() => setPhotoIndex((current) => (current - 1 + photos.length) % photos.length)} aria-label="Vorige foto"><ChevronLeft /></Button>
                  <Button onClick={() => { if (photoPlaying) { setPhotoPlaying(false); } else { if (photoIndex >= photos.length - 1) setPhotoIndex(0); setPhotoPlaying(true); } }} disabled={photos.length < 2} className="viewer-play-button">{photoPlaying ? <Pause /> : <Play />}{photoPlaying ? "Pauzeren" : "Afspelen"}</Button>
                  <Button variant="ghost" size="icon" onClick={() => setPhotoIndex((current) => (current + 1) % photos.length)} aria-label="Volgende foto"><ChevronRight /></Button>
                </div>
                <div className="viewer-speed" aria-label="Afspeelsnelheid">
                  {[{ label: "Snel", value: 800 }, { label: "Normaal", value: 1500 }, { label: "Rustig", value: 3000 }].map((option) => (
                    <button type="button" key={option.value} className={photoSpeed === option.value ? "active" : ""} onClick={() => setPhotoSpeed(option.value)}>{option.label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetOpen} onOpenChange={(open) => !resetting && setResetOpen(open)}>
        <AlertDialogContent className="sl-dialog border-white/10 bg-[#121714] text-[#f3f7f4]">
          <AlertDialogHeader>
            <AlertDialogTitle>Alle progressie wissen?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#93a096]">
              Dit verwijdert je {sessions.length} {sessions.length === 1 ? "sessie" : "sessies"},{" "}
              {metrics.length} {metrics.length === 1 ? "meting" : "metingen"} en je voedingsdagboek,
              op al je toestellen. Je foto&rsquo;s blijven staan. Daarna stellen we je account
              opnieuw in met dezelfde vragen als bij je registratie. Dit kan niet ongedaan gemaakt worden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting} className="border-white/10 bg-white/5 text-[#e4ece6] hover:bg-white/10">
              Annuleer
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={resetting}
              onClick={(event) => {
                event.preventDefault();
                void resetProgress();
              }}
              className="bg-[#ff6b6b] text-[#1a0b0b] hover:bg-[#ff8585]"
            >
              {resetting ? "Bezig met wissen…" : "Ja, wis alles"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="sl-dialog border-white/10 bg-[#121714] text-[#f3f7f4]">
          <AlertDialogHeader>
            <AlertDialogTitle>Entry verwijderen?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#8e9a91]">
              {deleteTarget?.label} wordt definitief uit je historiek verwijderd. Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-white/5 text-[#c3cdc6] hover:bg-white/10 hover:text-white">Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={deleteEntry} className="bg-[#ff6b6b] text-[#160606] hover:bg-[#ff8585]">Verwijderen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function StrengthTrendChart({ points }: { points: StrengthTrendPoint[] }) {
  const latest = points[points.length - 1];
  const first = points[0];
  if (points.length < 2) {
    return (
      <div className="strength-trend-pending">
        <TrendingUp />
        <div>
          <span>Krachttrend</span>
          <strong>{latest ? `${latest.weight.toLocaleString("nl-BE")} kg × ${latest.reps}` : "Nog geen complete set"}</strong>
          <p>{latest ? `Geschatte 1RM: ongeveer ${latest.value.toLocaleString("nl-BE", { maximumFractionDigits: 1 })} kg. Dit is een berekening, niet een gewicht dat je hebt gelift.` : "Na je eerste complete set start de app een referentie."}</p>
        </div>
        <em>Nog 1 sessie nodig</em>
      </div>
    );
  }
  const width = 300;
  const height = 86;
  const paddingX = 10;
  const paddingY = 10;
  const values = points.map((point) => point.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const range = max - min;
  const coordinates = points.map((point, index) => ({
    x: points.length === 1 ? width / 2 : paddingX + (index / (points.length - 1)) * (width - paddingX * 2),
    y: range === 0 ? height / 2 : height - paddingY - ((point.value - min) / range) * (height - paddingY * 2),
    point,
  }));
  const line = coordinates.map((coordinate) => `${coordinate.x},${coordinate.y}`).join(" ");
  const area = coordinates.length > 1
    ? `M ${coordinates[0].x} ${height - paddingY} L ${coordinates.map((coordinate) => `${coordinate.x} ${coordinate.y}`).join(" L ")} L ${coordinates[coordinates.length - 1].x} ${height - paddingY} Z`
    : "";
  const delta = latest && first ? latest.value - first.value : 0;

  return (
    <div className="strength-trend-card">
      <div className="strength-trend-head">
        <div><span>Krachttrend</span><strong>{latest ? `${latest.weight.toLocaleString("nl-BE")} kg × ${latest.reps}` : "Nog geen data"}</strong>{latest && <small>Geschatte 1RM · ±{latest.value.toLocaleString("nl-BE", { maximumFractionDigits: 1 })} kg</small>}</div>
        <em className={delta >= 0 ? "strength-delta-positive" : ""}>{delta >= 0 ? "+" : ""}{delta.toLocaleString("nl-BE", { maximumFractionDigits: 1 })} kg e1RM</em>
      </div>
      <svg className="strength-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Krachtprogressie op basis van de beste geschatte set per sessie">
        <path d={area} fill="rgba(200,255,102,.12)" />
        <polyline points={line} fill="none" stroke="#c8ff66" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {coordinates.map((coordinate, index) => (
          <circle key={`${coordinate.point.label}-${index}`} cx={coordinate.x} cy={coordinate.y} r={coordinate.point.current ? 4 : 3} fill={coordinate.point.current ? "#72efd0" : "#c8ff66"} stroke="#0c120e" strokeWidth="2" />
        ))}
      </svg>
      <div className="strength-trend-labels"><span>{first.label}</span><span>{latest.label}</span></div>
      <p className="strength-trend-note">e1RM is een berekende schatting om sessies te vergelijken, geen werkelijk gelift gewicht.</p>
    </div>
  );
}

export default function Home() {
  return (
    <AuthGate>
      <TrainingApp />
    </AuthGate>
  );
}
