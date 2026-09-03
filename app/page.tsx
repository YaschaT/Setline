"use client";
/* eslint-disable @next/next/no-img-element -- private R2 and local blob URLs are intentionally rendered directly */

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "./auth-gate";
import { signOutEverywhere } from "./auth/supabase-auth";
import { loadCloudState, saveCloudState } from "@/lib/cloud-state";
import { dateKey, datesInWeek, parseDateKey, startOfWeek } from "@/lib/week";
import {
  Activity,
  ArrowRightLeft,
  BrainCircuit,
  Camera,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Clock3,
  Cloud,
  CloudOff,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  History,
  Images,
  ExternalLink,
  LoaderCircle,
  LogOut,
  Microscope,
  Moon,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  PackageSearch,
  Save,
  Search,
  SendHorizontal,
  ShieldCheck,
  Smartphone,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  Upload,
  UserRound,
  Utensils,
  Weight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

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

const COACH_PROMPTS = [
  { code: "01", label: "Progressie", prompt: "Kan ik mijn 18 kg curls verhogen? Gebruik alleen mijn gelogde sets." },
  { code: "02", label: "Herstel", prompt: "Wat zegt mijn laatste herstelcheck-in over mijn training van vandaag?" },
  { code: "03", label: "Voeding", prompt: "Moet ik mijn calorieën aanpassen op basis van mijn gewichts- en tailletrend?" },
  { code: "04", label: "Plan", prompt: "Bekijk mijn Pull-dag en stel alleen een wijziging voor als mijn data daar reden voor geeft." },
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

function completedReps(set: SetResult) {
  return (Number(set.reps) || 0) + (Number(set.pausedReps) || 0);
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

function setSummary(set: SetResult) {
  const regular = Number(set.reps) || 0;
  const paused = Number(set.pausedReps) || 0;
  if (!paused) return `${regular} reps`;
  const seconds = set.pauseSeconds ? ` · ${set.pauseSeconds}s` : "";
  return `${regular} normaal + ${paused} paused${seconds}`;
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
    const value = weight * (1 + reps / 30);
    return !best || value > best.value ? { value, weight, reps } : best;
  }, null);
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
  label: "Flexibel · Rest day",
  short: "Rest day",
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
  const [selectedDay, setSelectedDay] = useState("push");
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(STARTER_CHAT);
  const [chatDraft, setChatDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [aiConfig, setAiConfig] = useState({ model: "gpt-5.6", mode: "pro", effort: "max" });
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
      const storedProgramKey = programKey(mode, storedSciencePlanId);
      const scheduledDay = storedSchedule[`${storedProgramKey}:${today}`]
        ?? (mode === "personal" || storedSciencePlanId === "ppl-ul" ? storedSchedule[today] : undefined)
        ?? defaultScheduleForDate(today, mode, storedSciencePlanId);
      setSelectedDay(planIdForMode(scheduledDay, mode, storedSciencePlanId));
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
    applyStoredState(localState);
    setMetricDraft((current) => ({ ...current, date: today }));
    setPhotoDraft((current) => ({ ...current, capturedOn: today }));
    setHydrated(true);

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

    fetch("/api/coach", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setAiReady(Boolean(data.configured));
        setAiConfig({
          model: typeof data.model === "string" ? data.model : "gpt-5.6",
          mode: typeof data.mode === "string" ? data.mode : "pro",
          effort: typeof data.effort === "string" ? data.effort : "max",
        });
      })
      .catch(() => setAiReady(false));
    fetch("/api/progress-photos", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "Foto's konden niet worden geladen.");
        return payload as { photos: ProgressPhoto[] };
      })
      .then((payload) => setPhotos([...payload.photos].sort((a, b) => a.capturedOn.localeCompare(b.capturedOn))))
      .catch((error) => setPhotoError(error instanceof Error ? error.message : "Foto's konden niet worden geladen."))
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
    setSyncStatus("saving");
    const timer = window.setTimeout(() => {
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
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(""), 3200);
    return () => window.clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    const hour = new Date().getHours();
    setMealIdeaType(hour < 11 ? "Ontbijt" : hour < 16 ? "Lunch" : "Avondeten");
  }, []);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview("");
      return;
    }
    const preview = URL.createObjectURL(photoFile);
    setPhotoPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [photoFile]);

  useEffect(() => {
    if (!photoViewerOpen || !photoPlaying || photos.length < 2) return;
    if (photoIndex >= photos.length - 1) {
      setPhotoPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setPhotoIndex((current) => current + 1), photoSpeed);
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
  const trainingNutritionTotals = useMemo(
    () => nutritionEntries
      .filter((entry) => entry.date === selectedDate)
      .reduce(
        (total, entry) => ({
          calories: total.calories + entry.calories,
          protein: total.protein + entry.protein,
        }),
        { calories: 0, protein: 0 },
      ),
    [nutritionEntries, selectedDate],
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
  useEffect(() => {
    const scheduledDay = scheduleOverrides[`${activeProgramKey}:${selectedDate}`]
      ?? (planMode === "personal" || sciencePlanId === "ppl-ul" ? scheduleOverrides[selectedDate] : undefined)
      ?? defaultScheduleForDate(selectedDate, planMode, sciencePlanId);
    const matchingDay = planIdForMode(scheduledDay, planMode, sciencePlanId);
    setSelectedDay((current) => current === matchingDay ? current : matchingDay);
  }, [activeProgramKey, planMode, sciencePlanId, scheduleOverrides, selectedDate]);
  const day = activePlan.find((item) => item.id === selectedDay) ?? activePlan[0];
  const isRestDay = day.id === "rest";
  const exerciseScopeKey = `${activeProgramKey}:${selectedDate}:${day.id}`;
  const storedOpenExerciseKey = openExerciseByScope[exerciseScopeKey];
  const openExerciseKey = storedOpenExerciseKey === undefined
    || (storedOpenExerciseKey !== null && !day.exercises.some((exercise) => `${day.id}:${exercise.id}` === storedOpenExerciseKey))
    ? null
    : storedOpenExerciseKey;
  const bannerSessionMark = isRestDay
    ? "OFF"
    : String(Math.max(1, datesInWeek(parseDateKey(selectedDate)).filter((date) => {
        const key = dateKey(date);
        return key <= selectedDate && scheduleForDate(key) !== "rest";
      }).length)).padStart(2, "0");
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

  const calorieDelta = useMemo(() => {
    if (weightTrend === null) return 0;
    const firstWaist = orderedMetrics.find((metric) => metric.waist)?.waist;
    const lastWaist = [...orderedMetrics].reverse().find((metric) => metric.waist)?.waist;
    if (weightTrend < -0.3) return 100;
    if (
      weightTrend > 0.25 &&
      firstWaist !== undefined &&
      lastWaist !== undefined &&
      lastWaist >= firstWaist
    ) return -100;
    return 0;
  }, [orderedMetrics, weightTrend]);

  const coachDossier = useMemo(() => {
    const recentWorkoutCount = sessions.filter(
      (session) =>
        session.sessionType !== "recovery" &&
        session.dayId !== "rest" &&
        Date.now() - new Date(session.date).getTime() < 8 * 86_400_000,
    ).length;
    const latestMetric = orderedMetrics[orderedMetrics.length - 1];
    return {
      recentWorkoutCount,
      latestWeight: latestMetric ? `${latestMetric.weight.toFixed(1)} kg` : "Nog leeg",
      proteinToday: `${Math.round(nutritionTotals.protein)} / ${targets.protein} g`,
    };
  }, [nutritionTotals.protein, orderedMetrics, sessions, targets.protein]);

  const coachCards = useMemo(() => {
    const cards: Array<{ title: string; body: string; tone: string }> = [];
    if (weightTrend === null) {
      cards.push({
        title: "Eerst een betrouwbare trend",
        body: "Log minstens twee ochtendmetingen. Daarna kan ik je calorieën onderbouwd bijsturen.",
        tone: "neutral",
      });
    } else if (calorieDelta > 0) {
      cards.push({
        title: "Herstel iets meer voeden",
        body: `Je daalt ongeveer ${Math.abs(weightTrend).toFixed(2)} kg per week. Voeg 100 kcal toe, liefst 25 g koolhydraten rond je training.`,
        tone: "warn",
      });
    } else if (calorieDelta < 0) {
      cards.push({
        title: "Kleine correctie",
        body: `Je stijgt ongeveer ${weightTrend.toFixed(2)} kg per week en je taille daalt niet. Trek 100 kcal af; eiwit blijft gelijk.`,
        tone: "warn",
      });
    } else {
      cards.push({
        title: "Calorieën behouden",
        body: `Je trend van ${weightTrend >= 0 ? "+" : ""}${weightTrend.toFixed(2)} kg per week past bij recompositie. Houd ${targets.calories} kcal voorlopig aan.`,
        tone: "good",
      });
    }

    const recentSessions = sessions.filter(
      (session) =>
        session.sessionType !== "recovery" &&
        session.dayId !== "rest" &&
        Date.now() - new Date(session.date).getTime() < 8 * 86_400_000,
    );
    if (recentSessions.length >= 4) {
      cards.push({
        title: "Frequentie zit goed",
        body: `${recentSessions.length} sessies in de laatste zeven dagen. Voeg alleen gewicht toe wanneer alle sets de bovenkant van de rep-range halen.`,
        tone: "good",
      });
    } else {
      cards.push({
        title: "Prioriteit: consistente sessies",
        body: "Rond vier à vijf kwaliteitsvolle sessies af voordat je extra sets of intensiteit toevoegt.",
        tone: "neutral",
      });
    }

    cards.push({
      title: "Fysiek-focus",
      body: "Zijkant schouders, latbreedte en bovenborst blijven je hoogste rendement geven voor een sterkere V-vorm.",
      tone: "accent",
    });
    return cards;
  }, [calorieDelta, sessions, targets.calories, weightTrend]);

  function changePlanMode(mode: PlanMode) {
    setPlanMode(mode);
    const scheduledDay = scheduleForDate(selectedDate, mode, sciencePlanId);
    setSelectedDay(planIdForMode(scheduledDay, mode, sciencePlanId));
  }

  function changeSciencePlan(value: string) {
    if (value !== "ppl-ul" && value !== "upper-lower" && value !== "full-body") return;
    const nextSciencePlanId: SciencePlanId = value;
    setSciencePlanId(nextSciencePlanId);
    setPlanMode("science");
    const scheduledDay = scheduleForDate(selectedDate, "science", nextSciencePlanId);
    setSelectedDay(planIdForMode(scheduledDay, "science", nextSciencePlanId));
    const nextPlan = sciencePlanFromId(nextSciencePlanId);
    setBanner(`${nextPlan.label} · ${nextPlan.daysLabel} actief`);
  }

  function selectAgendaDay(value: string) {
    setSelectedDate(value);
    setSelectedDay(planIdForMode(scheduleForDate(value), planMode, sciencePlanId));
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
    setSelectedDay(planIdForMode(dayId, planMode, sciencePlanId));
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
    setSelectedDay(planIdForMode(sourceAssignment, planMode, sciencePlanId));
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

  function setExerciseDone(exerciseId: string, checked: boolean) {
    const key = `${day.id}:${exerciseId}`;
    setCompleted((current) => ({ ...current, [key]: checked }));
    setOpenExerciseByScope((current) => ({
      ...current,
      [exerciseScopeKey]: null,
    }));
  }

  function setResult(
    exerciseId: string,
    setIndex: number,
    field: "weight" | "reps" | "pausedReps" | "pauseSeconds",
    value: string,
  ) {
    const key = `${day.id}:${exerciseId}`;
    const prescribedSets = setCountFor(exerciseId);
    setPerformance((current) => {
      const existing = current[key] ?? {
        sets: emptySetsForExercise(exerciseId, prescribedSets),
        note: "",
      };
      const sets = [...existing.sets];
      while (sets.length <= setIndex) sets.push(emptySetForExercise(exerciseId));
      sets[setIndex] = { ...sets[setIndex], [field]: value };
      return { ...current, [key]: { ...existing, sets } };
    });
  }

  function togglePausedReps(exerciseId: string, setIndex: number) {
    const key = `${day.id}:${exerciseId}`;
    const prescribedSets = setCountFor(exerciseId);
    setPerformance((current) => {
      const existing = current[key] ?? {
        sets: emptySetsForExercise(exerciseId, prescribedSets),
        note: "",
      };
      const sets = [...existing.sets];
      while (sets.length <= setIndex) sets.push(emptySetForExercise(exerciseId));
      const enabled = !sets[setIndex].pauseEnabled;
      sets[setIndex] = {
        ...sets[setIndex],
        pauseEnabled: enabled,
        pausedReps: enabled ? sets[setIndex].pausedReps ?? "" : "",
        pauseSeconds: enabled ? sets[setIndex].pauseSeconds ?? "" : "",
      };
      return { ...current, [key]: { ...existing, sets } };
    });
  }

  function addSet(exerciseId: string) {
    const key = `${day.id}:${exerciseId}`;
    const prescribedSets = setCountFor(exerciseId);
    setPerformance((current) => {
      const existing = current[key] ?? {
        sets: emptySetsForExercise(exerciseId, prescribedSets),
        note: "",
      };
      return {
        ...current,
        [key]: {
          ...existing,
          sets: [...existing.sets, emptySetForExercise(exerciseId)],
        },
      };
    });
  }

  function clearOrRemoveSet(exerciseId: string, setIndex: number) {
    const key = `${day.id}:${exerciseId}`;
    const prescribedSets = setCountFor(exerciseId);
    setPerformance((current) => {
      const existing = current[key] ?? {
        sets: emptySetsForExercise(exerciseId, prescribedSets),
        note: "",
      };
      const sets = [...existing.sets];
      if (setIndex >= prescribedSets) {
        sets.splice(setIndex, 1);
      } else {
        sets[setIndex] = emptySetForExercise(exerciseId);
      }
      return { ...current, [key]: { ...existing, sets } };
    });
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
      return;
    }
    const activities = RECOVERY_ACTIVITIES.filter((activity) =>
      recoveryDraft.completedIds.includes(activity.id),
    );
    const session: Session = {
      id: `${Date.now()}`,
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
    setSessions((current) => [session, ...current]);
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
  }

  function finishSession() {
    if (parseDateKey(selectedDate).getTime() > parseDateKey(todayKey).getTime()) {
      setBanner("Je kunt een toekomstige sessie nog niet opslaan");
      return;
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
    const session: Session = {
      id: `${Date.now()}`,
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
    setSessions((current) => [session, ...current]);
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
    setBanner(
      readyCount > 0
        ? `${day.short} opgeslagen voor ${selectedDateLabel} · ${readyCount} ${readyCount === 1 ? "oefening mag" : "oefeningen mogen"} hoger`
        : `${day.short} opgeslagen voor ${selectedDateLabel}`,
    );
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
      return;
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
  }

  async function uploadProgressPhoto() {
    const weight = Number(photoDraft.weight.replace(",", "."));
    setPhotoError("");
    if (!photoFile || !photoDraft.capturedOn || !Number.isFinite(weight) || weight < 35 || weight > 250) {
      setPhotoError("Kies een foto, datum en geldig gewicht.");
      return;
    }
    if (photos.some((photo) => photo.capturedOn === photoDraft.capturedOn)) {
      setPhotoError("Voor deze datum bestaat al een check-in.");
      return;
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
      setPhotoFile(null);
      setPhotoDraft((current) => ({ ...current, weight: "" }));
      setBanner("Dagelijkse check-in opgeslagen");
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Upload mislukt.");
    } finally {
      setPhotoUploadLoading(false);
    }
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
        setPhotoError(error instanceof Error ? error.message : "Foto kon niet worden verwijderd.");
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
          sets[setIndex] = { ...sets[setIndex], [field]: value };
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
      return;
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
      const estimatedNow = currentWeight * (1 + currentReps / 30);
      const estimatedBefore = previousWeight * (1 + previousReps / 30);
      return {
        metric: `+${gain.toLocaleString("nl-BE")} kg`,
        label: estimatedNow >= estimatedBefore
          ? "Sterkere set dan vorige keer"
          : "Meer gewicht · bouw je reps verder op",
        tone: estimatedNow >= estimatedBefore ? "good" : "neutral",
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

    const estimatedNow = currentWeight * (1 + currentReps / 30);
    const estimatedBefore = previousWeight * (1 + previousReps / 30);
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

  function setComparisonFeedback(exerciseId: string, setIndex: number, current: SetResult): SetSignal | null {
    const progress = setProgressSignal(exerciseId, setIndex, current);
    if (progress) return progress;

    const previous = recentExerciseSets(exerciseId)[0]?.sets[setIndex];
    if (!previous) return null;
    const currentWeight = numberValue(current.weight);
    const previousWeight = numberValue(previous.weight);
    const currentReps = completedReps(current);
    const previousReps = completedReps(previous);
    if (!currentWeight || !currentReps || !previousWeight || !previousReps) return null;

    if (currentWeight === previousWeight && currentReps === previousReps) {
      return {
        metric: "Gelijk",
        label: "Zelfde prestatie als vorige sessie",
        tone: "neutral",
      };
    }

    if (currentWeight === previousWeight && currentReps < previousReps) {
      const repsToMatch = previousReps - currentReps;
      return {
        metric: `Nog ${repsToMatch} ${repsToMatch === 1 ? "rep" : "reps"}`,
        label: "Om je vorige sessie te evenaren",
        tone: "neutral",
      };
    }

    return {
      metric: "Referentie",
      label: `Vorige keer · ${previousWeight.toLocaleString("nl-BE")} kg × ${previousReps}`,
      tone: "neutral",
    };
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

  function applyPlanChanges(messageId: string, changes: PlanChange[]) {
    setPlan((current) =>
      current.map((workoutDay) => ({
        ...workoutDay,
        exercises: workoutDay.exercises.map((exercise) => {
          const matching = changes.filter(
            (change) => change.exerciseId === exercise.id,
          );
          if (!matching.length) return exercise;
          const next = { ...exercise };
          matching.forEach((change) => {
            next[change.field] = change.value.slice(0, 140);
          });
          return next;
        }),
      })),
    );
    setChatMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, applied: true } : message,
      ),
    );
    setBanner("AI-voorstel toegepast op je schema");
  }

  async function sendChat(suggestedPrompt?: string) {
    const message = (suggestedPrompt ?? chatDraft).trim();
    if (!message || chatLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };
    setChatMessages((current) => [...current, userMessage]);
    setChatDraft("");

    if (aiReady !== true) {
      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content:
            "De chatinterface is klaar, maar live AI-antwoorden zijn nog niet geactiveerd. Daarvoor ontbreekt nog een beveiligde server-side OpenAI API-sleutel.",
        },
      ]);
      return;
    }

    setChatLoading(true);
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: chatMessages.slice(-8).map(({ role, content }) => ({
            role,
            content,
          })),
          context: {
            targets,
            nutrition: {
              date: nutritionDate,
              totals: nutritionTotals,
              entries: selectedNutritionEntries,
            },
            metrics: metrics.slice(-12),
            sessions: sessions.slice(0, 12),
            planMode,
            sciencePlanId,
            plan: activePlan.map((workoutDay) => ({
              id: workoutDay.id,
              label: workoutDay.label,
              exercises: workoutDay.exercises,
            })),
            alternatives: activePlan.flatMap((workoutDay) =>
              workoutDay.exercises
                .filter((exercise) => ALTERNATIVES[exercise.id]?.length)
                .map((exercise) => ({
                  exerciseId: exercise.id,
                  exercise: exercise.name,
                  alternatives: ALTERNATIVES[exercise.id],
                })),
            ),
          },
        }),
      });
      const payload = (await response.json()) as {
        reply?: string;
        planChanges?: PlanChange[];
        message?: string;
      };
      if (!response.ok) throw new Error(payload.message || "Geen antwoord ontvangen");
      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: payload.reply || "Ik heb geen bruikbaar antwoord ontvangen.",
          changes: payload.planChanges ?? [],
        },
      ]);
    } catch (error) {
      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: `De coach kon nu niet antwoorden: ${error instanceof Error ? error.message : "onbekende fout"}.`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  const weekSessions = sessions.filter(
    (session) =>
      session.sessionType !== "recovery" &&
      session.dayId !== "rest" &&
      Date.now() - new Date(session.date).getTime() < 8 * 86_400_000,
  ).length;
  const weekRecoveryDays = sessions.filter(
    (session) =>
      (session.sessionType === "recovery" || session.dayId === "rest") &&
      Date.now() - new Date(session.date).getTime() < 8 * 86_400_000,
  ).length;
  const photoSpanDays = photos.length > 1
    ? Math.round((new Date(`${photos[photos.length - 1].capturedOn}T12:00:00`).getTime() - new Date(`${photos[0].capturedOn}T12:00:00`).getTime()) / 86_400_000)
    : 0;
  const photoWeightDelta = photos.length > 1 ? photos[photos.length - 1].weight - photos[0].weight : 0;
  const viewerPhoto = photos[Math.min(photoIndex, Math.max(0, photos.length - 1))];
  const weekRangeLabel = `${weekDays[0].toLocaleDateString("nl-BE", { day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString("nl-BE", { day: "numeric", month: "short" })}`;
  const moveSourceAssignment = moveSourceDate ? scheduleForDate(moveSourceDate) : null;
  const moveSourceTemplate = moveSourceAssignment
    ? activePlan.find((item) => item.id === planIdForMode(moveSourceAssignment, planMode, sciencePlanId))
    : null;
  const scrollToSession = () => {
    document.getElementById("session-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
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
  const selectedIsDone = Boolean(selectedActualWorkout || selectedActualRecovery);
  const selectedStatusLabel = selectedActualWorkout
    ? `Afgerond · ${selectedActualWorkout.dayLabel}`
    : selectedActualRecovery
      ? "Rust gelogd"
      : selectedDate === todayKey
        ? "Vandaag gepland"
        : "Nog niet uitgevoerd";
  const completedWeekDays = weekDays.filter((calendarDate) => {
    const key = dateKey(calendarDate);
    return sessions.some((session) => dateKey(new Date(session.date)) === key);
  }).length;
  const accountInitials = account?.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "YT";
  const syncLabel = syncStatus === "saving"
    ? "Synchroniseren…"
    : syncStatus === "synced"
      ? "Cloud gesynchroniseerd"
      : syncStatus === "offline"
        ? "Lokale modus"
        : "Account verbinden…";

  return (
    <main className="app-shell min-h-screen text-[#f3f7f4] selection:bg-[#c8ff66] selection:text-[#071009]">
      <div className="performance-line" aria-hidden="true" />
      <div className="ambient-canvas" aria-hidden="true"><span /><span /><span /></div>
      <div className="app-frame mx-auto min-h-screen max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-14 lg:pt-7">

        {banner && (
          <div className="fixed left-1/2 top-4 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#b9f45b]/30 bg-[#182018] px-4 py-2 text-sm font-medium shadow-2xl">
            <Check className="size-4 text-[#b9f45b]" /> {banner}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="main-nav fixed inset-x-0 bottom-0 z-40 grid !h-[calc(70px+env(safe-area-inset-bottom))] !w-full max-w-none grid-cols-5 rounded-none px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 lg:sticky lg:top-4 lg:mx-auto lg:mb-8 lg:!h-12 lg:!w-fit lg:grid-cols-5 lg:rounded-[18px] lg:p-1.5">
            <TabsTrigger value="training" className="nav-tab"><Dumbbell /> <span>Training</span></TabsTrigger>
            <TabsTrigger value="voeding" className="nav-tab"><Utensils /> <span>Voeding</span></TabsTrigger>
            <TabsTrigger value="progressie" className="nav-tab"><TrendingUp /> <span>Progressie</span></TabsTrigger>
            <TabsTrigger value="transformatie" className="nav-tab"><Images /> <span>Foto’s</span></TabsTrigger>
            <TabsTrigger value="account" className="nav-tab"><UserRound /> <span>Account</span></TabsTrigger>
          </TabsList>

          <TabsContent value="training" className="training-stack">
            <section className="training-overview" aria-label="Training en dagdoel">
              <div className={`session-banner ${isRestDay ? "session-banner-rest" : ""}`}>
                <div className="session-banner-line" aria-hidden="true"><span /><i /></div>
                <div className="session-banner-mark" aria-hidden="true"><strong>{bannerSessionMark}</strong></div>
                <div className="session-banner-content">
                  <div className="session-banner-topline">
                    <div className="session-banner-context">
                      <span>{selectedDate === todayKey ? "Vandaag" : selectedDateLabel}</span>
                      <i>·</i>
                      <b>{isRestDay ? "Herstel" : `Sessie ${bannerSessionMark}`}</b>
                    </div>
                  </div>

                  {/* Who is signed in, and whether their data is safe. */}
                  <button
                    type="button"
                    className={`banner-profile banner-profile-${account ? syncStatus : "offline"}`}
                    onClick={() => setActiveTab("account")}
                    aria-label={account ? `Aangemeld als ${account.email}. Open account` : "Aanmelden"}
                  >
                    <span className="banner-profile-avatar">{accountInitials}</span>
                    <span className="banner-profile-copy">
                      <strong>{account?.email ?? "Niet aangemeld"}</strong>
                      <small>
                        {account
                          ? `${planMode === "personal" ? "Mijn plan" : activeSciencePlan.label} · ${
                              syncStatus === "synced"
                                ? "gesynchroniseerd"
                                : syncStatus === "offline"
                                  ? "alleen dit toestel"
                                  : "opslaan…"
                            }`
                          : "Tik om aan te melden"}
                      </small>
                    </span>
                    <span className="banner-profile-dot" aria-hidden="true" />
                  </button>
                  <div className="session-banner-copy">
                    <h2>
                      <span>{day.short}.</span>
                      <em>{isRestDay ? "Herstel slim." : doneCount > 0 ? "Maak het af." : "Bouw verder."}</em>
                    </h2>
                    <p>{isRestDay ? "Optioneel · 10–15 min" : `${day.exercises.length} oefeningen · ${day.focus}`}</p>
                  </div>
                  <div className="session-banner-footer">
                    <div className="session-banner-progress">
                      <div><strong>{isRestDay ? `${doneCount}/${dayItemCount}` : `${trackedSetCount}/${plannedSetCount}`}</strong><span>{isRestDay ? "herstelblokken" : "sets gelogd"}</span></div>
                      <button
                        type="button"
                        className="session-banner-nutrition"
                        onClick={() => {
                          setNutritionDate(selectedDate);
                          setActiveTab("voeding");
                        }}
                        aria-label={`Voeding voor ${selectedDateLabel} openen: ${Math.round(trainingNutritionTotals.calories)} van ${targets.calories} kilocalorieën en ${Math.round(trainingNutritionTotals.protein)} van ${targets.protein} gram eiwit`}
                      >
                        <strong>{Math.round(trainingNutritionTotals.calories)} <small>/ {targets.calories} kcal</small></strong>
                        <span><Utensils /> {Math.round(trainingNutritionTotals.protein)}/{targets.protein} g eiwit</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      className="session-banner-start"
                      onClick={scrollToSession}
                      aria-label={`${isRestDay ? "Herstel openen" : doneCount > 0 || trackedSetCount > 0 ? "Training hervatten" : "Training starten"}: ${day.short} voor ${selectedDateLabel}`}
                    >
                      <span>{isRestDay ? "Open herstel" : doneCount > 0 || trackedSetCount > 0 ? "Hervat" : "Start"}</span><ChevronRight />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="week-agenda" aria-labelledby="week-agenda-title">
              <div className="week-agenda-head">
                <div className="week-agenda-title">
                  <span className="week-agenda-icon"><CalendarDays /></span>
                  <div>
                    <p className="eyebrow">{weekLabel}</p>
                    <h2 id="week-agenda-title">{weekRangeLabel}</h2>
                  </div>
                </div>
                <span className="week-agenda-count"><Check /> {completedWeekDays}/7</span>
              </div>

              <div className="agenda-nav">
                <button
                  type="button"
                  className="agenda-nav-step"
                  onClick={() => setWeekOffset((value) => value - 1)}
                  aria-label="Vorige week"
                >
                  <ChevronLeft />
                </button>
                <div className="agenda-nav-mid">
                  {weekOffset !== 0 && (
                    <button type="button" className="agenda-nav-today" onClick={() => setWeekOffset(0)}>
                      Naar deze week
                    </button>
                  )}
                  <button
                    type="button"
                    className={`agenda-nav-month ${monthOpen ? "agenda-nav-month-open" : ""}`}
                    onClick={() => setMonthOpen((value) => !value)}
                    aria-expanded={monthOpen}
                  >
                    <CalendarDays /> {monthOpen ? "Week tonen" : "Hele maand"}
                  </button>
                </div>
                <button
                  type="button"
                  className="agenda-nav-step"
                  onClick={() => setWeekOffset((value) => value + 1)}
                  aria-label="Volgende week"
                >
                  <ChevronRight />
                </button>
              </div>

              {monthOpen && (
                <div className="agenda-month" role="group" aria-label={`Maandoverzicht ${monthLabel}`}>
                  <p className="agenda-month-label">{monthLabel}</p>
                  <div className="agenda-month-weekdays" aria-hidden="true">
                    {["ma", "di", "wo", "do", "vr", "za", "zo"].map((label) => <span key={label}>{label}</span>)}
                  </div>
                  <div className="agenda-month-grid">
                    {monthDays.map((calendarDate) => {
                      const iso = dateKey(calendarDate);
                      const inMonth = calendarDate.getMonth() === monthAnchor.getMonth();
                      const isToday = iso === todayKey;
                      const isSelected = iso === selectedDate;
                      const isDone = sessions.some((entry) => entry.date === iso);
                      return (
                        <button
                          key={iso}
                          type="button"
                          className={`agenda-month-day ${inMonth ? "" : "agenda-month-day-muted"} ${isSelected ? "agenda-month-day-selected" : ""} ${isToday ? "agenda-month-day-today" : ""}`}
                          onClick={() => {
                            setSelectedDate(iso);
                            const diff = Math.round((startOfWeek(calendarDate).getTime() - startOfWeek().getTime()) / (7 * 24 * 60 * 60 * 1000));
                            setWeekOffset(diff);
                            setMonthOpen(false);
                          }}
                          aria-label={`${calendarDate.toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" })}${isDone ? ", sessie gelogd" : ""}`}
                          aria-current={isToday ? "date" : undefined}
                        >
                          <span>{calendarDate.getDate()}</span>
                          {isDone && <i aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="plan-selector agenda-plan-selector" aria-label="Trainingsplan kiezen">
                <div className="plan-selector-primary">
                  <div className="plan-selector-copy">
                    <span className="eyebrow">Schema</span>
                    <strong>{planMode === "personal" ? "PPL + Upper/Lower · op maat" : `${activeSciencePlan.label} · ${activeSciencePlan.daysLabel}`}</strong>
                  </div>
                  <div className="plan-toggle" role="tablist" aria-label="Trainingsplan kiezen">
                    <button role="tab" aria-selected={planMode === "personal"} className={planMode === "personal" ? "plan-toggle-active" : ""} onClick={() => changePlanMode("personal")}><UserRound /> Mijn plan</button>
                    <button role="tab" aria-selected={planMode === "science"} className={planMode === "science" ? "plan-toggle-active" : ""} onClick={() => changePlanMode("science")}><Microscope /> Science-based</button>
                  </div>
                </div>
                {planMode === "science" && (
                  <div className="plan-template-row">
                    <div className="plan-template-copy">
                      <span><ShieldCheck /> Geselecteerd · {activeSciencePlan.daysLabel}</span>
                      <strong>{activeSciencePlan.label}</strong>
                      <small>{activeSciencePlan.summary}</small>
                    </div>
                    <Select value={sciencePlanId} onValueChange={changeSciencePlan}>
                      <SelectTrigger className="plan-template-select" aria-label="Evidence-based trainingsschema kiezen">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" align="end" className="plan-template-menu">
                        <SelectItem value="ppl-ul">PPL + Upper/Lower · 5 dagen</SelectItem>
                        <SelectItem value="upper-lower">Upper/Lower · 4 dagen</SelectItem>
                        <SelectItem value="full-body">Full body · 3 dagen</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="week-agenda-grid" role="group" aria-label="Dagen van deze trainingsweek">
                {weekDays.map((calendarDate) => {
                  const key = dateKey(calendarDate);
                  const canonicalId = scheduleForDate(key);
                  const template = activePlan.find((item) => item.id === planIdForMode(canonicalId, planMode, sciencePlanId)) ?? REST_DAY;
                  const actualSessions = sessions.filter((session) => dateKey(new Date(session.date)) === key);
                  const actualWorkout = actualSessions.find((session) => session.sessionType !== "recovery" && session.dayId !== "rest");
                  const actualRecovery = actualSessions.find((session) => session.sessionType === "recovery" || session.dayId === "rest");
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDate;
                  const isDone = Boolean(actualWorkout || actualRecovery);
                  return (
                    <button
                      type="button"
                      key={key}
                      className={`agenda-day ${isSelected ? "agenda-day-selected" : ""} ${isToday ? "agenda-day-today" : ""} ${isDone ? "agenda-day-done" : ""}`}
                      onClick={() => selectAgendaDay(key)}
                      aria-pressed={isSelected}
                      aria-current={isToday ? "date" : undefined}
                      aria-label={`${calendarDate.toLocaleDateString("nl-BE", { weekday: "long", day: "numeric" })}: ${template.short}, ${isDone ? "afgerond" : isToday ? "vandaag" : "gepland"}`}
                    >
                      <span className="agenda-day-date"><strong>{calendarDate.toLocaleDateString("nl-BE", { weekday: "short" }).replace(".", "")}</strong><em>{calendarDate.getDate()}</em></span>
                      <span className="agenda-day-plan">{workoutLabelForSlot(canonicalId).replace("Full body ", "Full ")}</span>
                      <span className={`agenda-day-status ${isDone ? "agenda-day-status-done" : isToday ? "agenda-day-status-today" : ""}`} aria-hidden="true">
                        {isDone ? <Check /> : isToday ? <i /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              <Collapsible className="agenda-manage">
                <div className="agenda-selected-panel">
                  <div className="agenda-selected-copy">
                    <span className="agenda-selected-icon">{isRestDay ? <Moon /> : <Dumbbell />}</span>
                    <div>
                      <small>{selectedDateLabel}{selectedDate === todayKey ? " · Vandaag" : ""}</small>
                      <strong>{day.short}</strong>
                      <p className={selectedIsDone ? "agenda-selected-done" : ""}>{selectedIsDone && <Check />}{selectedStatusLabel}</p>
                    </div>
                  </div>
                  <CollapsibleTrigger className="agenda-manage-trigger" aria-label={`Planning voor ${selectedDateLabel} aanpassen`}>
                    <span>Planning</span><ChevronDown />
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="agenda-manage-content">
                  <div className="agenda-manage-head">
                    <div><span>Sessie kiezen</span><small>Voor {selectedDateLabel}; opslaan blijft aan deze datum gekoppeld.</small></div>
                    <button type="button" className="agenda-move-selected" onClick={() => setMoveSourceDate(selectedDate)} aria-label={`${day.short} van ${selectedDateLabel} verplaatsen`}>
                      <ArrowRightLeft /><span>Verplaatsen</span>
                    </button>
                  </div>
                  <div className="day-workout-options" data-count={workoutChoices.length} role="group" aria-label={`Sessie kiezen voor ${selectedDateLabel}`}>
                    {workoutChoices.map((choice) => {
                      const active = scheduleForDate(selectedDate) === choice;
                      return (
                        <button key={choice} type="button" className={active ? "day-workout-choice-active" : ""} aria-pressed={active} onClick={() => chooseWorkoutForDate(choice)}>
                          {choice === "rest" ? <Moon /> : <Dumbbell />}
                          <span>{workoutLabelForSlot(choice)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="week-agenda-note"><Check /> Historiek blijft op de werkelijk opgeslagen dag staan.</div>
                </CollapsibleContent>
              </Collapsible>
            </section>

            {planMode === "science" && !isRestDay && (
              <Collapsible className="science-brief">
                <CollapsibleTrigger className="science-brief-trigger">
                  <div className="science-brief-title"><span className="science-icon"><Microscope /></span><div><p className="eyebrow">Onderbouwing & vergelijking</p><strong>Waarom {activeSciencePlan.label}?</strong></div></div>
                  <div className="science-trigger-meta"><span>{activeSciencePlan.frequency}</span><ChevronDown /></div>
                </CollapsibleTrigger>
                <CollapsibleContent className="science-brief-content">
                  <div className="science-compare-grid">
                    <article><span><UserRound /> Persoonlijk</span><h4>Bench twee keer</h4><p>Zware flat bench op Push en een lichtere paused bench op Upper. De rest blijft gericht op jouw side delts, latbreedte en bovenborst.</p></article>
                    <article className="science-reference"><span><Microscope /> {activeSciencePlan.label}</span><h4>{activeSciencePlan.daysLabel}</h4><p>{activeSciencePlan.comparison}</p></article>
                  </div>
                  <div className="science-principles">
                    <div><strong>Volume</strong><p>Ongeveer 9–14 directe sets per grote spiergroep; onder de zone waar rendement sterk begint af te vlakken.</p></div>
                    <div><strong>Inspanning</strong><p>Praktisch uitgangspunt: compounds RIR 1–2. Falentraining is niet verplicht; isolatie mag op de laatste set dichterbij.</p></div>
                    <div><strong>Verdeling</strong><p>{activeSciencePlan.distribution}</p></div>
                    <div><strong>Uitvoering</strong><p>Prioriteitsoefeningen eerst, volledige pijnvrije ROM en voldoende rust om reps en techniek te behouden.</p></div>
                  </div>
                  <div className="science-sources">
                    <span>Bronnen</span>
                    {SCIENCE_SOURCES.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.label}<ExternalLink /></a>)}
                  </div>
                  <p className="science-disclaimer">Origineel referentieprogramma op basis van publieke literatuur en principes; geen kopie van of samenwerking met Jeff Nippard.</p>
                </CollapsibleContent>
              </Collapsible>
            )}

            {isRestDay ? (
              <section id="session-workspace" className="recovery-panel scroll-mt-24">
                <div className="recovery-panel-head">
                  <div>
                    <p className="eyebrow">Rest day · persoonlijk herstel</p>
                    <h3>Doe alleen wat vandaag nuttig voelt.</h3>
                    <p>Start met de korte check-in. Alles blijft optioneel; stop bij scherpe pijn en maak hiervan geen extra trainingssessie.</p>
                  </div>
                  <div className="recovery-time-pill"><Moon /><span><strong>10–15</strong> min</span></div>
                </div>

                <div className="recovery-content">
                  <section className="recovery-checkin-card" aria-labelledby="recovery-checkin-title">
                    <div className="recovery-section-title">
                      <div><p className="eyebrow">Snelle check-in</p><h4 id="recovery-checkin-title">Hoe voelt je lichaam vandaag?</h4></div>
                      <span>Optioneel · 10 sec</span>
                    </div>
                    <div className="recovery-status-grid">
                      {([
                        { key: "sleep", label: "Slaap", icon: <Moon /> },
                        { key: "soreness", label: "Spierstijfheid", icon: <Activity /> },
                        { key: "energy", label: "Energie", icon: <HeartPulse /> },
                      ] as const).map((field) => (
                        <div className="recovery-status-field" key={field.key}>
                          <div className="recovery-status-label">{field.icon}<span>{field.label}</span></div>
                          <div className="recovery-status-options" role="group" aria-label={field.label}>
                            {RECOVERY_SCALE[field.key].map((option) => (
                              <button type="button" key={option.value} aria-pressed={recoveryDraft[field.key] === option.value} onClick={() => setRecoveryLevel(field.key, option.value)}>{option.label}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <div className={`recovery-insight recovery-insight-${recoveryInsight.tone}`}>
                    <span><HeartPulse /></span>
                    <div><small>Live hersteladvies</small><strong>{recoveryInsight.title}</strong><p>{recoveryInsight.body}</p></div>
                  </div>

                  <div className="recovery-activities-head">
                    <div><p className="eyebrow">Kies je herstelblokken</p><h4>{doneCount} van {RECOVERY_ACTIVITIES.length} geselecteerd</h4></div>
                    <span>Je hoeft ze niet allemaal te doen</span>
                  </div>

                  <div className="recovery-activity-grid">
                    {RECOVERY_ACTIVITIES.map((activity) => {
                      const selected = recoveryDraft.completedIds.includes(activity.id);
                      const ActivityIcon = activity.tone === "calves" || activity.tone === "cardio" ? Footprints : Activity;
                      return (
                        <button type="button" key={activity.id} aria-pressed={selected} onClick={() => toggleRecoveryActivity(activity.id)} className={`recovery-activity-card recovery-tone-${activity.tone} ${selected ? "recovery-activity-selected" : ""}`}>
                          <span className="recovery-activity-icon"><ActivityIcon /></span>
                          <span className="recovery-activity-copy"><small>{activity.category}</small><strong>{activity.name}</strong><em>{activity.dose}</em><p>{activity.detail}</p></span>
                          <span className="recovery-activity-check">{selected ? <Check /> : <Plus />}</span>
                        </button>
                      );
                    })}
                  </div>

                  <label className="recovery-note-label">Notitie voor je coach <span>optioneel</span>
                    <Textarea value={recoveryDraft.note} onChange={(event) => setRecoveryDraft((current) => ({ ...current, note: event.target.value.slice(0, 280) }))} placeholder="Bijv. kuiten stijf bij opstaan, rechterschouder voelt goed…" rows={3} />
                  </label>
                </div>

                <div className="recovery-panel-footer">
                  <p><ShieldCheck /> Volledige rust zonder checklist is ook een geldige keuze. Bij scherpe of aanhoudende pijn: niet forceren.</p>
                  <Button onClick={finishRecovery} className="recovery-save-button"><Save /> Opslaan · {selectedDateLabel}</Button>
                </div>
              </section>
            ) : (
            <section id="session-workspace" className="workout-panel scroll-mt-24 overflow-hidden">
              <div className="workout-panel-head">
                <div>
                  <p className="eyebrow">{planMode === "personal" ? "Persoonlijk plan" : `Science-based · ${activeSciencePlan.label}`}</p>
                  <h3>Jouw oefeningen</h3>
                  <p>Tik een oefening om je sets te loggen.</p>
                </div>
                <span className="workout-panel-count"><strong>{doneCount}/{dayItemCount}</strong><small>klaar</small></span>
              </div>
              <Collapsible className="session-warmup-disclosure">
                <CollapsibleTrigger className="session-warmup-trigger" aria-label="Opwarming voor deze training bekijken">
                  <span className="session-warmup-icon"><Flame /></span>
                  <span className="session-warmup-copy"><small>Voor je eerste werkset</small><strong>Opwarming · ongeveer 5 min</strong></span>
                  <span className="session-warmup-action">Bekijk <ChevronDown /></span>
                </CollapsibleTrigger>
                <CollapsibleContent className="session-warmup-content">
                  <div><span>Algemeen</span><p>5 minuten rustig bewegen en 2 dynamische mobiliteitsrondes.</p></div>
                  <div><span>{day.exercises[0]?.name}</span><p>{primaryGuide.warmup}</p></div>
                </CollapsibleContent>
              </Collapsible>
              <div className="exercise-list">
                {day.exercises.map((exercise, index) => {
                  const key = `${day.id}:${exercise.id}`;
                  const prescribedSets = progressionTargets(exercise.prescription).length || WORKING_SETS[exercise.id] || 3;
                  const storedResult = performance[key];
                  const visibleSets = storedResult
                    ? [
                        ...storedResult.sets,
                        ...emptySetsForExercise(exercise.id, Math.max(0, prescribedSets - storedResult.sets.length)),
                      ]
                    : emptySetsForExercise(exercise.id, prescribedSets);
                  const guide = GUIDANCE[exercise.id] ?? DEFAULT_GUIDE;
                  const alternatives = ALTERNATIVES[exercise.id] ?? [];
                  const originalExercise = DEFAULT_PLAN.flatMap((workoutDay) => workoutDay.exercises).find((item) => item.id === exercise.id);
                  const variantOptions: Array<{ name: string; fit: string }> = [
                    ...(originalExercise ? [{ name: originalExercise.name, fit: "Jouw schema" }] : []),
                    ...alternatives.map((alternative) => ({ name: alternative.name, fit: alternative.fit })),
                  ].filter((option, optionIndex, options) => options.findIndex((item) => item.name === option.name) === optionIndex);
                  if (!variantOptions.some((option) => option.name === exercise.name)) {
                    variantOptions.unshift({ name: exercise.name, fit: "Actief" });
                  }
                  const status = liveProgressStatus(exercise, visibleSets);
                  const trendPoints = strengthTrendPoints(exercise.id, visibleSets);
                  const record = strengthRecord(exercise.id, visibleSets);
                  const setSignals = visibleSets.map((set, setIndex) => setProgressSignal(exercise.id, setIndex, set));
                  const strongestSignal = setSignals.find((signal) => signal?.tone === "good") ?? setSignals.find(Boolean) ?? null;
                  const previousSessionSets = recentExerciseSets(exercise.id)[0]?.sets ?? [];
                  const currentBest = bestStrengthSet(visibleSets);
                  const hasCurrentInput = visibleSets.some((set) => set.weight || set.reps || set.pausedReps);
                  const loggedSets = visibleSets.filter((set) => numberValue(set.weight) > 0 && completedReps(set) > 0).length;
                  const remainingSets = Math.max(0, prescribedSets - loggedSets);
                  const setProgress = prescribedSets ? Math.min(100, Math.round((loggedSets / prescribedSets) * 100)) : 0;
                  const supportsPausedReps = exercise.id.includes("bench") || exercise.name.toLowerCase().includes("bench");
                  const isDone = Boolean(completed[key]);
                  const isExpanded = openExerciseKey === key;
                  const compactResult = currentBest
                    ? `${currentBest.weight.toLocaleString("nl-BE")} kg × ${currentBest.reps}`
                    : exercise.prescription;
                  const motivation = record
                    ? `${record.allTime ? "Nieuw PR" : "Sterker"} · ${record.detail}`
                    : strongestSignal
                      ? `${strongestSignal.metric} vooruit`
                      : isDone
                        ? "Oefening afgerond"
                        : loggedSets >= prescribedSets
                          ? "Alle werksets gelogd"
                          : loggedSets === 0
                            ? hasCurrentInput ? "Maak set 1 compleet" : "Klaar voor set 1"
                            : remainingSets === 1
                              ? "Nog één sterke set"
                              : `Nog ${remainingSets} werksets`;
                  const motivationDetail = record
                    ? record.title
                    : strongestSignal
                      ? strongestSignal.label
                      : loggedSets >= prescribedSets
                        ? "Vink de oefening af wanneer je klaar bent."
                        : loggedSets === 0
                          ? hasCurrentInput ? "Vul gewicht én reps in om de set te tellen." : "Start gecontroleerd en bouw van daaruit op."
                          : `Sterke start — houd je techniek vast voor ${remainingSets === 1 ? "je laatste set" : `de volgende ${remainingSets} sets`}.`;
                  return (
                    <Collapsible
                      key={exercise.id}
                      open={isExpanded}
                      onOpenChange={(open) => setOpenExerciseByScope((current) => ({ ...current, [exerciseScopeKey]: open ? key : null }))}
                      className={`exercise-row ${isExpanded ? "exercise-active" : ""} ${isDone ? "exercise-done" : ""}`}
                    >
                      <div className="exercise-summary">
                        <Checkbox checked={isDone} onCheckedChange={(checked) => setExerciseDone(exercise.id, checked === true)} aria-label={`${exercise.name} voltooid`} className="exercise-check border-white/20 data-[state=checked]:border-[#b9f45b] data-[state=checked]:bg-[#b9f45b] data-[state=checked]:text-[#0b0e0c]" />
                        <CollapsibleTrigger className="exercise-summary-trigger" aria-label={`${isExpanded ? "Sluit" : "Open"} ${exercise.name}`}>
                          <span className="exercise-summary-copy">
                            <span className="exercise-title-line"><span className="exercise-number">{String(index + 1).padStart(2, "0")}</span><strong className="exercise-name">{exercise.name}</strong></span>
                            <span className="exercise-summary-meta"><strong>{compactResult}</strong><i /><small>{motivation}</small></span>
                          </span>
                          <span className="exercise-summary-status">
                            <span className="exercise-set-ring" style={{ background: `conic-gradient(#c8ff66 ${setProgress}%, rgba(255,255,255,.075) ${setProgress}% 100%)` }} role="progressbar" aria-valuemin={0} aria-valuemax={prescribedSets} aria-valuenow={Math.min(loggedSets, prescribedSets)} aria-label={`${loggedSets} van ${prescribedSets} werksets gelogd`}>
                              <span><strong>{loggedSets}</strong><small>/{prescribedSets}</small></span>
                            </span>
                            <span className="exercise-expand-icon"><ChevronDown /></span>
                          </span>
                        </CollapsibleTrigger>
                      </div>

                      <CollapsibleContent className="exercise-details">
                        <div className="exercise-detail-toolbar">
                          <div className="exercise-meta"><strong>{exercise.prescription}</strong><span>{exercise.load}</span><span><Clock3 /> {exercise.rest}</span></div>
                          {planMode === "personal" ? (
                            <Select value="" onValueChange={(value) => chooseExerciseVariant(day.id, exercise, value)}>
                              <SelectTrigger className="exercise-swap-trigger" aria-label={`${exercise.name} wisselen of aanpassen`}>
                                <ArrowRightLeft /><span>Wissel</span>
                              </SelectTrigger>
                              <SelectContent position="popper" align="end" className="exercise-swap-menu">
                                {variantOptions.map((option) => (
                                  <SelectItem key={option.name} value={option.name}>{option.name} · {option.fit}</SelectItem>
                                ))}
                                <SelectItem value="__manual__"><Pencil /> Meer aanpassen…</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : <span className="research-lock" title="Onderdeel van het science-based referentieplan"><Microscope /></span>}
                        </div>

                        <div className={`exercise-motivation ${strongestSignal || record ? "exercise-motivation-win" : ""}`} role={strongestSignal || record ? "status" : undefined} aria-live={strongestSignal || record ? "polite" : undefined}>
                          <span>{strongestSignal || record ? <Trophy /> : <Flame />}</span>
                          <p><strong>{motivation}</strong><small>{motivationDetail}</small></p>
                        </div>

                        <div className="sets-grid">
                          {!previousSessionSets.length && hasCurrentInput && (
                            <div className="set-comparison-baseline set-comparison-empty">
                              <TrendingUp />
                              <span>Eerste referentie</span>
                              <strong>Na opslaan vergelijken we je volgende sessie</strong>
                            </div>
                          )}
                          <div className="sets-column-head" aria-hidden="true"><span>Set</span><span>Gewicht</span><span>Herhalingen</span><span>Opties</span></div>
                          {visibleSets.map((set, setIndex) => {
                            const signal = setComparisonFeedback(exercise.id, setIndex, set);
                            const previousSet = previousSessionSets[setIndex];
                            return <div className="set-entry" key={`${exercise.id}-set-${setIndex}`}>
                              <div className="set-line">
                                <span className="set-index" aria-label={`Set ${setIndex + 1}`}>{String(setIndex + 1).padStart(2, "0")}</span>
                                <label className="log-field"><input inputMode="decimal" enterKeyHint="next" value={set.weight} onChange={(event) => setResult(exercise.id, setIndex, "weight", event.target.value)} placeholder="0" aria-label={`${exercise.name} set ${setIndex + 1} gewicht`} /><span>kg</span></label>
                                <label className="log-field"><input inputMode="numeric" enterKeyHint="next" value={set.reps} onChange={(event) => setResult(exercise.id, setIndex, "reps", event.target.value)} placeholder="0" aria-label={`${exercise.name} set ${setIndex + 1} normale herhalingen`} /><span>reps</span></label>
                                <span className="set-actions">
                                  {supportsPausedReps && !set.pauseEnabled && <button type="button" className="pause-add" onClick={() => togglePausedReps(exercise.id, setIndex)} aria-label={`Paused reps toevoegen aan set ${setIndex + 1}`}><Pause /><span>Pauze</span></button>}
                                  {(set.weight || set.reps || set.pausedReps || setIndex >= prescribedSets) && <button type="button" className="set-clear" onClick={() => clearOrRemoveSet(exercise.id, setIndex)} aria-label={`${exercise.name} set ${setIndex + 1} ${setIndex >= prescribedSets ? "verwijderen" : "wissen"}`}><Trash2 /><span>{setIndex >= prescribedSets ? "Verwijder" : "Wis"}</span></button>}
                                </span>
                              </div>
                              {supportsPausedReps && set.pauseEnabled && (
                                <div className="pause-line">
                                  <span className="pause-mark"><Pause /></span>
                                  <label className="log-field pause-field"><input inputMode="numeric" enterKeyHint="next" value={set.pausedReps ?? ""} onChange={(event) => setResult(exercise.id, setIndex, "pausedReps", event.target.value)} placeholder="0" aria-label={`${exercise.name} set ${setIndex + 1} paused herhalingen`} /><span>paused</span></label>
                                  <label className="log-field pause-field"><input inputMode="decimal" value={set.pauseSeconds ?? ""} onChange={(event) => setResult(exercise.id, setIndex, "pauseSeconds", event.target.value)} placeholder="3" aria-label={`${exercise.name} set ${setIndex + 1} pauzeduur`} /><span>sec</span></label>
                                  <button type="button" className="pause-remove" onClick={() => togglePausedReps(exercise.id, setIndex)} aria-label={`Paused reps uit set ${setIndex + 1} verwijderen`}><Trash2 /><span>Verwijder</span></button>
                                </div>
                              )}
                              {signal && (
                                <div className={`set-live-signal set-live-${signal.tone}`} role="status" aria-live="polite" aria-atomic="true">
                                  <span className="set-live-icon">{signal.tone === "good" ? <Trophy /> : <TrendingUp />}</span>
                                  <span className="set-live-copy"><strong>{signal.metric}</strong><small>{signal.label}</small></span>
                                  <em>{signal.tone === "good" ? `Set ${setIndex + 1} verbeterd` : "Live vergelijking"}</em>
                                </div>
                              )}
                              {!signal && previousSet && numberValue(previousSet.weight) > 0 && completedReps(previousSet) > 0 && (
                                <div className="set-benchmark">
                                  <History />
                                  <span>Vorige set {setIndex + 1}</span>
                                  <strong>{numberValue(previousSet.weight).toLocaleString("nl-BE")} kg · {setSummary(previousSet)}</strong>
                                </div>
                              )}
                            </div>;
                          })}
                          <Button variant="ghost" size="sm" onClick={() => addSet(exercise.id)} className="extra-set-button"><Plus /> Extra set</Button>
                        </div>

                        {record && (
                          <div className={`exercise-record ${record.allTime ? "exercise-record-alltime" : ""}`} role="status">
                            <span className="exercise-record-icon"><Trophy /></span>
                            <div><small>{record.title}</small><strong>{record.detail}</strong></div>
                            <em>PR</em>
                          </div>
                        )}

                        <Collapsible className="guidance-box">
                          <CollapsibleTrigger className="guidance-trigger">
                            <span className={`progress-signal progress-${status.tone}`}><TrendingUp /> {status.label}</span>
                            <span className="guidance-label">Opwarming & progressie <ChevronDown /></span>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="guidance-content">
                            <div><span>Opwarming</span><p>{guide.warmup}</p></div>
                            <div><span>Wanneer verhogen?</span><p>{guide.progression}</p></div>
                            <StrengthTrendChart points={trendPoints} />
                          </CollapsibleContent>
                        </Collapsible>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
              <div className="flex flex-col gap-3 border-t border-white/8 bg-black/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-xs leading-5 text-[#7e8a82]">Stop bij techniekverlies. Is pijn scherp? Kies een pijnvrije ROM.</p>
                <Button onClick={finishSession} disabled={doneCount === 0} className="h-11 rounded-xl bg-[#b9f45b] px-5 font-semibold text-[#0a0d0b] hover:bg-[#c7fa74]"><Save /> Opslaan · {selectedDateLabel}</Button>
              </div>
            </section>
            )}
          </TabsContent>

          <TabsContent value="account" className="space-y-5">
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
                      ? "Alleen op dit toestel"
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
          </TabsContent>

          <TabsContent value="voeding" className="space-y-5">
            <section className="nutrition-top-grid">
              <article className="nutrition-overview-card">
                <div className="nutrition-date-nav">
                  <button type="button" onClick={() => shiftNutritionDate(-1)} aria-label="Vorige voedingsdag"><ChevronLeft /></button>
                  <label>
                    <CalendarDays />
                    <input type="date" value={nutritionDate} onChange={(event) => setNutritionDate(event.target.value || dateKey())} aria-label="Datum van voedingsdagboek" />
                  </label>
                  <button type="button" onClick={() => shiftNutritionDate(1)} aria-label="Volgende voedingsdag"><ChevronRight /></button>
                  {nutritionDate !== todayKey && <button type="button" className="nutrition-today-button" onClick={() => setNutritionDate(todayKey)}>Vandaag</button>}
                </div>

                <div className="nutrition-summary-row">
                  <div>
                    <p className="eyebrow">{nutritionDateLabel}</p>
                    <h2>{Math.round(nutritionTotals.calories).toLocaleString("nl-BE")} <span>/ {targets.calories.toLocaleString("nl-BE")} kcal</span></h2>
                  </div>
                  <button type="button" className={`nutrition-balance ${caloriesRemaining < 0 ? "nutrition-balance-over" : ""}`} onClick={() => setTargetDialog(true)} aria-label="Voedingsdoelen aanpassen">
                    <span>{caloriesRemaining < 0 ? "Over target" : "Nog beschikbaar"}</span>
                    <strong>{Math.abs(caloriesRemaining).toLocaleString("nl-BE")} kcal</strong>
                    <Pencil />
                  </button>
                </div>

                <div className="nutrition-calorie-track" aria-label={`${Math.round(clamp((nutritionTotals.calories / targets.calories) * 100))}% van caloriedoel`}>
                  <span style={{ width: `${clamp((nutritionTotals.calories / targets.calories) * 100)}%` }} />
                </div>

                <div className="nutrition-macro-grid">
                  <NutritionMacroCard label="Eiwit" value={nutritionTotals.protein} target={targets.protein} color="#c8ff66" />
                  <NutritionMacroCard label="Carbs" value={nutritionTotals.carbs} target={targets.carbs} color="#72efd0" />
                  <NutritionMacroCard label="Vet" value={nutritionTotals.fat} target={targets.fat} color="#f4c65b" />
                </div>
              </article>

              <form id="nutrition-entry-form" className="nutrition-add-card" onSubmit={(event) => { event.preventDefault(); addNutritionEntry(); }}>
                <div className="nutrition-add-head">
                  <span><Plus /></span>
                  <div><p className="eyebrow">Nieuwe entry</p><h3>Voeding toevoegen</h3></div>
                </div>

                <div className="food-lookup">
                  <label htmlFor="food-search">Belgisch of generiek product zoeken</label>
                  <div className="food-search-row">
                    <div><Search /><Input id="food-search" value={foodQuery} onChange={(event) => setFoodQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchFoodProducts(); } }} placeholder="Bijv. Boni skyr, banaan…" className="dark-input" /></div>
                    <Button type="button" onClick={() => void searchFoodProducts()} disabled={foodSearchLoading || foodQuery.trim().length < 2} aria-label="Product zoeken">{foodSearchLoading ? <LoaderCircle className="animate-spin" /> : <Search />}<span>Zoek</span></Button>
                  </div>

                  {foodSearchError && <p className="food-search-error">{foodSearchError}</p>}

                  {foodResults.length > 0 && (
                    <div className="food-search-results" role="listbox" aria-label="Gevonden voedingsproducten">
                      {foodResults.map((food) => (
                        <button type="button" role="option" aria-selected="false" key={food.id} onClick={() => chooseFood(food)}>
                          <span className="food-result-image">{food.imageUrl ? <img src={food.imageUrl} alt="" /> : <PackageSearch />}</span>
                          <span className="food-result-copy"><strong>{food.name}</strong><small>{food.brand} · {food.sourceNote}</small><em>P {food.protein.toFixed(1)} · C {food.carbs.toFixed(1)} · V {food.fat.toFixed(1)} g</em></span>
                          <span className="food-result-kcal"><strong>{Math.round(food.calories)}</strong><small>kcal</small></span>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedFood && (
                    <div className="food-selection">
                      <div><Check /><span><strong>{selectedFood.name}</strong><small>{selectedFood.source} · waarden blijven handmatig aanpasbaar</small></span></div>
                      <label>Hoeveelheid<Input inputMode="decimal" value={foodAmount} onChange={(event) => changeFoodAmount(event.target.value)} className="dark-input" /><span>g</span></label>
                    </div>
                  )}
                  <p className="food-source-note">Productdata via <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>; controleer altijd het Belgische etiket.</p>
                </div>

                <label className="nutrition-form-label">Maaltijd
                  <Select value={nutritionDraft.meal} onValueChange={(value) => setNutritionDraft((current) => ({ ...current, meal: value as MealType }))}>
                    <SelectTrigger className="nutrition-select"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#111713] text-[#edf4ef]">
                      {MEAL_OPTIONS.map((meal) => <SelectItem value={meal} key={meal}>{meal}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>

                <label className="nutrition-form-label">Product of maaltijd
                  <Input value={nutritionDraft.name} onChange={(event) => setNutritionDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Bijv. 40 g Rice Krispies" className="dark-input" />
                </label>

                <div className="nutrition-number-grid">
                  <label>kcal<Input inputMode="decimal" value={nutritionDraft.calories} onChange={(event) => setNutritionDraft((current) => ({ ...current, calories: event.target.value }))} placeholder="0" className="dark-input" /></label>
                  <label>Eiwit<Input inputMode="decimal" value={nutritionDraft.protein} onChange={(event) => setNutritionDraft((current) => ({ ...current, protein: event.target.value }))} placeholder="g" className="dark-input" /></label>
                  <label>Carbs<Input inputMode="decimal" value={nutritionDraft.carbs} onChange={(event) => setNutritionDraft((current) => ({ ...current, carbs: event.target.value }))} placeholder="g" className="dark-input" /></label>
                  <label>Vet<Input inputMode="decimal" value={nutritionDraft.fat} onChange={(event) => setNutritionDraft((current) => ({ ...current, fat: event.target.value }))} placeholder="g" className="dark-input" /></label>
                </div>
                <p className="nutrition-calc-note">Laat kcal leeg en ik bereken ze uit eiwit, carbs en vet.</p>
                <Button type="submit" className="nutrition-add-button"><Plus /> Toevoegen aan {nutritionDate === todayKey ? "vandaag" : nutritionDateLabel}</Button>
              </form>

              <section className="nutrition-ideas-panel" aria-labelledby="meal-ideas-title">
                <div className="meal-ideas-head">
                  <div className="meal-ideas-title">
                    <span><Utensils /></span>
                    <div><p className="eyebrow">Wat kan ik eten?</p><h3 id="meal-ideas-title">Eetideeën voor jouw doel</h3></div>
                  </div>
                  <div className="meal-idea-tabs" role="tablist" aria-label="Maaltijdmoment kiezen">
                    {MEAL_IDEA_TYPES.map((meal) => (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={mealIdeaType === meal}
                        className={mealIdeaType === meal ? "active" : ""}
                        onClick={() => setMealIdeaType(meal)}
                        key={meal}
                      >
                        {meal === "Avondeten" ? "Diner" : meal}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="meal-ideas-context">Afgestemd op {targets.calories.toLocaleString("nl-BE")} kcal en {targets.protein} g eiwit. Macro’s zijn praktische schattingen.</p>
                <div className="meal-idea-grid" role="tabpanel" aria-label={`${mealIdeaType} ideeën`}>
                  {MEAL_IDEAS[mealIdeaType].map((idea, index) => (
                    <article className="meal-idea-card" key={idea.id}>
                      <div className="meal-idea-index"><span>{String(index + 1).padStart(2, "0")}</span><strong>{Math.round(idea.calories)} kcal</strong></div>
                      <h4>{idea.name}</h4>
                      <p>{idea.description}</p>
                      <div className="meal-idea-macros"><span>P {idea.protein}</span><span>C {idea.carbs}</span><span>V {idea.fat}</span></div>
                      <button type="button" onClick={() => chooseMealIdea(idea)} aria-label={`${idea.name} vooraf invullen`}><span>Voorinvullen</span><Plus /></button>
                    </article>
                  ))}
                </div>
              </section>
            </section>

            <section className="nutrition-diary-panel">
              <div className="nutrition-diary-head">
                <div><p className="eyebrow">Dagboek</p><h3>{selectedNutritionEntries.length ? `${selectedNutritionEntries.length} ${selectedNutritionEntries.length === 1 ? "item" : "items"} gelogd` : "Nog niets gelogd"}</h3></div>
                <span>{Math.round(nutritionTotals.protein)} g eiwit</span>
              </div>

              {selectedNutritionEntries.length === 0 ? (
                <EmptyState title="Je voedingsdag is nog leeg" body="Voeg je eerste maaltijd of snack toe. De totalen en je resterende dagbudget worden automatisch bijgewerkt." />
              ) : (
                <div className="nutrition-meal-groups">
                  {MEAL_OPTIONS.map((meal) => {
                    const entries = selectedNutritionEntries.filter((entry) => entry.meal === meal);
                    if (entries.length === 0) return null;
                    const mealCalories = entries.reduce((sum, entry) => sum + entry.calories, 0);
                    return (
                      <section className="nutrition-meal-group" key={meal}>
                        <div className="nutrition-meal-head"><h4>{meal}</h4><span>{Math.round(mealCalories)} kcal</span></div>
                        <div>
                          {entries.map((entry) => (
                            <article className="nutrition-entry-row" key={entry.id}>
                              <span className="nutrition-entry-mark">{entry.name.slice(0, 1).toUpperCase()}</span>
                              <div className="nutrition-entry-copy"><strong>{entry.name}</strong><span>P {Math.round(entry.protein)} · C {Math.round(entry.carbs)} · V {Math.round(entry.fat)} g</span></div>
                              <strong className="nutrition-entry-kcal">{Math.round(entry.calories)} <span>kcal</span></strong>
                              <Button variant="ghost" size="icon" className="nutrition-entry-delete entry-delete" onClick={() => setDeleteTarget({ kind: "nutrition", id: entry.id, label: `${entry.name} · ${Math.round(entry.calories)} kcal` })} aria-label={`${entry.name} verwijderen`} title="Entry verwijderen"><Trash2 /></Button>
                            </article>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="progressie" className="space-y-5">
            <section className="grid gap-4 sm:grid-cols-3">
              <StatCard icon={<Weight />} label="Laatste gewicht" value={orderedMetrics.length ? `${orderedMetrics[orderedMetrics.length - 1].weight.toFixed(1)} kg` : "Nog leeg"} />
              <StatCard icon={<TrendingUp />} label="Weektrend" value={weightTrend === null ? "Meer data nodig" : `${weightTrend >= 0 ? "+" : ""}${weightTrend.toFixed(2)} kg`} />
              <StatCard icon={<Moon />} label="Weekbalans · 7 dagen" value={`${weekSessions}/5 training · ${weekRecoveryDays} rust`} />
            </section>

            <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
              <div className="panel-card">
                <div className="mb-5 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#b9f45b]/10 text-[#b9f45b]"><Plus className="size-4" /></div><div><p className="eyebrow">Ochtend · nuchter</p><h3 className="font-semibold">Nieuwe meting</h3></div></div>
                <div className="space-y-4">
                  <label className="field-label">Datum<Input type="date" value={metricDraft.date} onChange={(event) => setMetricDraft((current) => ({ ...current, date: event.target.value }))} className="dark-input mt-1.5" /></label>
                  <div className="grid grid-cols-2 gap-3"><label className="field-label">Gewicht (kg)<Input inputMode="decimal" value={metricDraft.weight} onChange={(event) => setMetricDraft((current) => ({ ...current, weight: event.target.value }))} placeholder="78,0" className="dark-input mt-1.5" /></label><label className="field-label">Taille (cm)<Input inputMode="decimal" value={metricDraft.waist} onChange={(event) => setMetricDraft((current) => ({ ...current, waist: event.target.value }))} placeholder="Optioneel" className="dark-input mt-1.5" /></label></div>
                  <Button onClick={addMetric} className="h-11 w-full rounded-xl bg-[#b9f45b] font-semibold text-[#0a0d0b] hover:bg-[#c7fa74]"><Save /> Meting opslaan</Button>
                </div>
              </div>

              <div className="surface-panel overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 sm:px-6"><div><p className="eyebrow">Laatste 30</p><h3 className="mt-1 font-semibold">Lichaamstrend</h3></div><History className="size-5 text-[#68736c]" /></div>
                {orderedMetrics.length === 0 ? <EmptyState title="Nog geen metingen" body="Start met één ochtendgewicht. Na twee datapunten verschijnt je weektrend en coachadvies." /> : (
                  <div className="divide-y divide-white/[.065]">
                    {[...orderedMetrics].reverse().map((metric, index, list) => {
                      const previous = list[index + 1];
                      const delta = previous ? metric.weight - previous.weight : null;
                      const dateLabel = new Date(`${metric.date}T12:00:00`).toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });
                      return <div key={metric.id} className="measurement-row"><span className="text-sm text-[#aab5ad]">{dateLabel}</span><div className="text-right"><strong className="tabular-nums">{metric.weight.toFixed(1)} kg</strong>{metric.waist && <p className="text-xs text-[#87938a]">{metric.waist.toFixed(1)} cm taille</p>}</div><span className={`w-14 text-right text-xs tabular-nums ${delta === null ? "text-[#87938a]" : delta <= 0 ? "text-[#b9f45b]" : "text-[#f4c65b]"}`}>{delta === null ? "start" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}</span><Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ kind: "metric", id: metric.id, label: `${dateLabel} · ${metric.weight.toFixed(1)} kg` })} className="history-delete entry-delete" aria-label={`Meting van ${dateLabel} verwijderen`} title="Meting verwijderen"><Trash2 /></Button></div>;
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="surface-panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 sm:px-6"><div><p className="eyebrow">Training & herstel</p><h3 className="mt-1 font-semibold">Volledige historiek</h3></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-[#87938a]">{sessions.length} sessies</span></div>
              {sessions.length === 0 ? <EmptyState title="Nog geen sessies" body="Sla je eerste workout of rest day op. Oefeningen, sets en herstelcheck-ins verschijnen daarna hier." /> : (
                <div className="divide-y divide-white/[.065]">
                  {sessions.map((session) => {
                    const isRecoverySession = session.sessionType === "recovery" || session.dayId === "rest";
                    const loggedSets = session.results.reduce(
                      (total, row) => total + resultSets(row).filter((set) => set.weight || set.reps || set.pausedReps).length,
                      0,
                    );
                    const recoveryActivities = session.recovery?.activities ?? session.results.map((row) => ({ id: row.exerciseId, name: row.name, dose: row.recoveryDetail ?? "" }));
                    const sessionDate = new Date(session.date);
                    const dateLabel = sessionDate.toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });
                    return <Collapsible key={session.id} className={`history-session ${isRecoverySession ? "history-recovery-session" : ""}`}>
                      <div className="history-summary">
                        <CollapsibleTrigger className="history-open">
                          <div><strong>{isRecoverySession && <Moon />} {session.dayLabel}</strong><p>{dateLabel} · {sessionDate.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })} · {isRecoverySession ? `${recoveryActivities.length} herstelblokken` : `${loggedSets} werksets`}</p></div>
                          <div className="history-summary-meta"><span>{isRecoverySession ? "Rust" : `${session.completion}%`}</span><ChevronDown /></div>
                        </CollapsibleTrigger>
                        <div className="history-actions">
                          {!isRecoverySession && <Button variant="ghost" onClick={() => openSessionEditor(session)} className="history-edit" aria-label={`${session.dayLabel}-sessie bewerken`} title="Workout bewerken"><Pencil /><span>Bewerk</span></Button>}
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ kind: "session", id: session.id, label: `${session.dayLabel} · ${dateLabel}` })} className="history-delete entry-delete" aria-label={`${session.dayLabel}-sessie verwijderen`} title="Sessie verwijderen"><Trash2 /></Button>
                        </div>
                      </div>
                      <CollapsibleContent className="history-details">
                        {isRecoverySession ? <div className="recovery-history-details">
                          <div className="recovery-history-pulse">
                            <span><small>Slaap</small><strong>{recoveryLevelLabel("sleep", session.recovery?.sleep ?? "")}</strong></span>
                            <span><small>Stijfheid</small><strong>{recoveryLevelLabel("soreness", session.recovery?.soreness ?? "")}</strong></span>
                            <span><small>Energie</small><strong>{recoveryLevelLabel("energy", session.recovery?.energy ?? "")}</strong></span>
                          </div>
                          {recoveryActivities.length ? <div className="recovery-history-activities">{recoveryActivities.map((activity) => <div key={`${session.id}-${activity.id}`}><Check /><span><strong>{activity.name}</strong><small>{activity.dose}</small></span></div>)}</div> : <div className="recovery-history-rest"><Moon /><span><strong>Volledige rust</strong><small>Geen herstelblokken nodig of gelogd.</small></span></div>}
                          {session.recovery?.note && <div className="recovery-history-note"><span>Notitie</span><p>{session.recovery.note}</p></div>}
                        </div> : session.results.map((row) => {
                          const sets = resultSets(row).filter((set) => set.weight || set.reps || set.pausedReps);
                          return <div className="history-exercise" key={`${session.id}-${row.exerciseId}`}>
                            <div className="history-exercise-title"><strong>{row.name}</strong><span>{sets.length ? `${sets.length} sets` : "Geen cijfers gelogd"}</span></div>
                            {sets.length > 0 && <div className="history-set-list">{sets.map((set, index) => <div key={`${row.exerciseId}-${index}`}><span>Set {index + 1}</span><strong>{set.weight ? `${set.weight} kg` : "—"}</strong><strong>{setSummary(set)}</strong></div>)}</div>}
                          </div>;
                        })}
                      </CollapsibleContent>
                    </Collapsible>;
                  })}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="transformatie" className="space-y-5">
            <section className="transformation-hero">
              <div className="transformation-hero-copy">
                <span className="transformation-kicker"><Camera /> Dagelijkse visuele check-in</span>
                <h2>Zie de verandering die je spiegel mist.</h2>
                <p>Zelfde pose, licht en afstand. De tijdlijn zet je foto’s en gewicht naast elkaar en speelt je volledige transformatie chronologisch af.</p>
                <Button
                  onClick={() => { setPhotoIndex(0); setPhotoPlaying(true); setPhotoViewerOpen(true); }}
                  disabled={photos.length < 2}
                  className="transformation-play"
                >
                  <Play /> Transformatie afspelen
                </Button>
              </div>
              <div className="transformation-stats">
                <div><strong>{photos.length}</strong><span>check-ins</span></div>
                <div><strong>{photoSpanDays}</strong><span>dagen gevolgd</span></div>
                <div><strong>{photos.length > 1 ? `${photoWeightDelta > 0 ? "+" : ""}${photoWeightDelta.toFixed(1)}` : "—"}</strong><span>kg verschil</span></div>
              </div>
            </section>

            <section className="transformation-workspace">
              <div className="photo-upload-card">
                <div className="photo-section-head">
                  <div className="photo-head-icon"><Upload /></div>
                  <div><p className="eyebrow">Vandaag vastleggen</p><h3>Nieuwe check-in</h3></div>
                </div>

                <label htmlFor="progress-photo" className={`photo-dropzone ${photoPreview ? "photo-dropzone-filled" : ""}`}>
                  {photoPreview ? (
                    <><img src={photoPreview} alt="Voorbeeld van je gekozen progressiefoto" /><span><Camera /> Andere foto kiezen</span></>
                  ) : (
                    <div><Camera /><strong>Tik om een foto te kiezen</strong><small>Camera of fotobibliotheek · max. 10 MB</small></div>
                  )}
                </label>
                <input
                  id="progress-photo"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
                />

                <div className="photo-form-grid">
                  <label className="field-label">Datum<Input type="date" value={photoDraft.capturedOn} max={dateKey()} onChange={(event) => setPhotoDraft((current) => ({ ...current, capturedOn: event.target.value }))} className="dark-input mt-1.5" /></label>
                  <label className="field-label">Gewicht (kg)<Input inputMode="decimal" value={photoDraft.weight} onChange={(event) => setPhotoDraft((current) => ({ ...current, weight: event.target.value }))} placeholder="78,0" className="dark-input mt-1.5" /></label>
                </div>
                {photoError && <p className="photo-error">{photoError}</p>}
                <Button onClick={() => void uploadProgressPhoto()} disabled={photoUploadLoading} className="photo-save-button">
                  {photoUploadLoading ? <LoaderCircle className="animate-spin" /> : <Save />}
                  {photoUploadLoading ? "Foto voorbereiden…" : "Check-in opslaan"}
                </Button>
                <p className="photo-storage-note">Foto’s worden verkleind voor snelle weergave en privé bij je account bewaard.</p>
              </div>

              <div className="photo-compare-card">
                <div className="photo-card-title">
                  <div><p className="eyebrow">Overview</p><h3>Eerste versus nieuwste</h3></div>
                  {photos.length > 1 && <span>{photoSpanDays} dagen ertussen</span>}
                </div>
                {photosLoading ? (
                  <div className="photo-loading"><LoaderCircle className="animate-spin" /> Tijdlijn laden…</div>
                ) : photos.length === 0 ? (
                  <EmptyState title="Je eerste foto wordt het startpunt" body="Voeg vandaag één consistente check-in toe. Vanaf twee foto's verschijnt de directe vergelijking en afspeelmodus." />
                ) : (
                  <div className={`photo-comparison ${photos.length === 1 ? "photo-comparison-single" : ""}`}>
                    <button type="button" onClick={() => openPhoto(photos[0].id)}>
                      <img src={photos[0].imageUrl} alt={`Startfoto van ${photoDateLabel(photos[0].capturedOn)}`} />
                      <span><small>Start</small><strong>{photoDateLabel(photos[0].capturedOn, { day: "numeric", month: "short" })}</strong><em>{photos[0].weight.toFixed(1)} kg</em></span>
                    </button>
                    {photos.length > 1 && <button type="button" onClick={() => openPhoto(photos[photos.length - 1].id)}>
                      <img src={photos[photos.length - 1].imageUrl} alt={`Nieuwste foto van ${photoDateLabel(photos[photos.length - 1].capturedOn)}`} />
                      <span><small>Nu</small><strong>{photoDateLabel(photos[photos.length - 1].capturedOn, { day: "numeric", month: "short" })}</strong><em>{photos[photos.length - 1].weight.toFixed(1)} kg</em></span>
                    </button>}
                  </div>
                )}
                <div className="consistency-note">
                  <Target />
                  <p><strong>Maak de vergelijking betrouwbaar</strong><span>’s morgens nuchter, na toilet, zelfde plek, afstand, licht en ontspannen pose. Geen pump.</span></p>
                </div>
              </div>
            </section>

            <section className="photo-timeline-panel">
              <div className="photo-timeline-head">
                <div><p className="eyebrow">Chronologische tijdlijn</p><h3>Alle check-ins</h3></div>
                <div className="photo-timeline-actions">
                  <span>{photos.length} foto’s</span>
                  <Button variant="ghost" onClick={() => { setPhotoIndex(0); setPhotoPlaying(true); setPhotoViewerOpen(true); }} disabled={photos.length < 2}><Play /> Afspelen</Button>
                </div>
              </div>
              {photosLoading ? (
                <div className="photo-loading"><LoaderCircle className="animate-spin" /> Foto’s ophalen…</div>
              ) : photos.length === 0 ? (
                <EmptyState title="Nog geen fototijdlijn" body="Je opgeslagen check-ins verschijnen hier van nieuw naar oud. In de afspeelmodus lopen ze juist chronologisch vooruit." />
              ) : (
                <div className="photo-gallery">
                  {[...photos].reverse().map((photo) => (
                    <article key={photo.id} className="photo-gallery-card">
                      <button type="button" className="photo-gallery-open" onClick={() => openPhoto(photo.id)}>
                        <img loading="lazy" src={photo.imageUrl} alt={`Progressiefoto van ${photoDateLabel(photo.capturedOn)}`} />
                        <span className="photo-gallery-hover"><ChevronRight /></span>
                      </button>
                      <div className="photo-gallery-meta">
                        <div><strong>{photoDateLabel(photo.capturedOn, { day: "numeric", month: "short", year: "2-digit" })}</strong><span>{photo.weight.toFixed(1)} kg</span></div>
                        <Button variant="ghost" size="icon" className="entry-delete" onClick={() => setDeleteTarget({ kind: "photo", id: photo.id, label: `Foto van ${photoDateLabel(photo.capturedOn)} · ${photo.weight.toFixed(1)} kg` })} aria-label={`Foto van ${photoDateLabel(photo.capturedOn)} verwijderen`} title="Foto en check-in verwijderen"><Trash2 /></Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
        <DialogContent className="account-dialog border-white/10 bg-[#101612] text-[#f3f7f4] sm:max-w-md">
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
        <DialogContent className="border-white/10 bg-[#121714] text-[#f3f7f4] sm:max-w-md">
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
        <DialogContent className="session-edit-dialog border-white/10 bg-[#0d120f] text-[#f3f7f4] sm:max-w-2xl">
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
                                <label><input inputMode="numeric" value={set.pausedReps ?? ""} onChange={(event) => updateEditingSessionSet(resultIndex, setIndex, "pausedReps", event.target.value)} aria-label={`${row.name} set ${setIndex + 1} paused reps`} /><small>paused</small></label>
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
        <DialogContent className="border-white/10 bg-[#121714] text-[#f3f7f4] sm:max-w-md">
          <DialogHeader><DialogTitle>Voedingsdoelen aanpassen</DialogTitle><DialogDescription className="text-[#8e9a91]">Pas alleen aan op basis van je weekgemiddelde en tailletrend.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {(["calories", "protein", "carbs", "fat"] as const).map((field) => <label key={field} className="field-label capitalize">{field === "calories" ? "Calorieën" : field === "protein" ? "Eiwit" : field === "carbs" ? "Carbs" : "Vet"}<Input type="number" value={targets[field]} onChange={(event) => setTargets((current) => ({ ...current, [field]: Number(event.target.value) }))} className="dark-input mt-1.5" /></label>)}
          </div>
          <DialogFooter><Button onClick={() => { setTargetDialog(false); setBanner("Doelen aangepast"); }} className="bg-[#b9f45b] text-[#0a0d0b] hover:bg-[#c7fa74]">Doelen opslaan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(moveSourceDate)} onOpenChange={(open) => !open && setMoveSourceDate(null)}>
        <DialogContent className="schedule-dialog border-white/10 bg-[#121714] text-[#f3f7f4] sm:max-w-lg">
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
        <DialogContent className="photo-viewer-dialog border-white/10 bg-[#090d0b] text-[#f3f7f4] sm:max-w-5xl">
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

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="border-white/10 bg-[#121714] text-[#f3f7f4]">
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

function NutritionMacroCard({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const progress = clamp((value / target) * 100);
  return <div className="nutrition-macro-card"><div><span>{label}</span><strong>{Math.round(value)} <small>/ {target} g</small></strong></div><div className="nutrition-macro-track"><span style={{ width: `${progress}%`, background: color }} /></div></div>;
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <article className="metric-card rounded-[24px] border border-white/8 p-5"><div className="mb-5 flex size-9 items-center justify-center rounded-xl bg-white/5 text-[#64dfc5] [&_svg]:size-4">{icon}</div><p className="text-xs text-[#748078]">{label}</p><strong className="mt-1 block text-xl tracking-tight">{value}</strong></article>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="px-6 py-14 text-center"><div className="mx-auto mb-4 grid size-11 place-items-center rounded-2xl bg-white/5 text-[#68746c]"><History className="size-5" /></div><h4 className="font-medium">{title}</h4><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#748078]">{body}</p></div>;
}

export default function Home() {
  return (
    <AuthGate>
      <TrainingApp />
    </AuthGate>
  );
}
