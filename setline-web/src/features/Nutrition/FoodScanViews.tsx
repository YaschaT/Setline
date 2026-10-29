// FoodScanViews.swift — the barcode scan and Tally's meal scan.
//
// On the web: the live barcode reader is the browser's `BarcodeDetector` on a
// camera stream (getUserMedia) where the browser has both, else the typed
// number the iPhone also offers. The meal photo is picked with a file input
// (`capture` for the camera) and sent to Tally (/api/meal-scan) resized and
// encoded exactly as the iPhone does: 1024 px on the long side, JPEG at 0.7.
// Apple's on-device fallbacks have no web equivalent: text recognition (Vision
// OCR of a package) reads nothing, and image classification names nothing —
// only a barcode in the photo is still read (BarcodeDetector).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { SL, slFont, slNumerals } from "../../design/tokens";
import { HStack, Menu, Pressable, ScrollView, Spacer, Text, VStack, type Binding } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLOutlineButton, SLPrimaryButton, SLQuietButton, colorOpacity } from "../../design/SetlineTokens";
import { DashedBorder, PressButton } from "../../design/support";
import { SLSound } from "../../design/SLSound";
import { SLFoodPhoto } from "../../design/components/SLFoodPhoto";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLHairline, slBody, slLead, slMeta, slTitle } from "../../design/components/SLText";
import { SLPress } from "../../design/components/SLPress";
import { useApp, type AppState } from "../../data/AppState";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { Schedule } from "../../core/Engine/Schedule";
import {
  FoodScanRequest, FoodScanRequest_Turn, ScannedFood,
  type BarcodeProduct, type FoodScanAnswer_Question, type ScannedFood_Confidence,
} from "../../core/Nutrition/FoodLookup";
import { FoodSearch, type FoodProduct } from "../../core/Nutrition/FoodSearch";
import {
  MealRecognition, MealRecognition_Food,
  type MealRecognition_Part, type MealRecognition_Question, type MealRecognition_Question_Answer,
} from "../../core/Nutrition/MealRecognition";
import { Meal, NutritionEntry } from "../../core/Nutrition/NutritionDay";
import { PackageLabel, PackageLabel_Nutrition, type PackageLabel_Observation, type PackageLabel_Reading } from "../../core/Nutrition/PackageLabel";
import { charCount, prefixChars, trimmingWhitespaces, trimmingWhitespacesAndNewlines } from "../../core/Support/nutrition";
import { rounded } from "../../core/Support/swift";
import { TallyMascot, type TallyMascot_Mood } from "../Training/TallyMascot";

// MARK: - Browser capabilities

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource | ImageBitmap | Blob): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

/** `[.ean13, .ean8, .upce, .code128]`. */
const symbologies = ["ean_13", "ean_8", "upc_e", "code_128"];

function barcodeDetector(): BarcodeDetectorLike | undefined {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return undefined;
  try {
    return new Ctor({ formats: symbologies });
  } catch {
    return undefined;
  }
}

/** `DataScannerViewController.isSupported && .isAvailable`. */
function canLiveScan(): boolean {
  return (
    typeof (globalThis as unknown as { BarcodeDetector?: unknown }).BarcodeDetector !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/** `UIImagePickerController.isSourceTypeAvailable(.camera)`: a phone or tablet, where `capture` opens the camera. */
function cameraAvailable(): boolean {
  return typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
}

const isNumberChar = (c: string) => /^\p{N}$/u.test(c);
const digitsOnly = (s: string) => [...s].filter(isNumberChar).join("");

const spinnerCSS = `
@keyframes sl-scan-turn { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

// MARK: - Barcode

type BarcodePhase =
  | { kind: "scanning" }
  | { kind: "looking"; value: string }
  | { kind: "found"; value: BarcodeProduct }
  | { kind: "missing"; value: string }
  | { kind: "failed"; value: string };

/**
 * Point the camera at a barcode; the product comes back from Open Food Facts
 * with its values per 100 g, the amount starts at the packaging's serving,
 * and one lime button logs it. Where the phone has no scanner (or the
 * barcode will not read), the number can be typed.
 */
export function BarcodeScanSheet({ date, meal, onLog, onClose }: { date: Date; meal: Meal; onLog: (entry: NutritionEntry) => void; onClose: () => void }) {
  const app = useApp();
  const [phase, setPhaseState] = useState<BarcodePhase>({ kind: "scanning" });
  const phaseRef = useRef(phase);
  const setPhase = (p: BarcodePhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [typed, setTyped] = useState("");
  const [grams, setGrams] = useState(100);
  const inputRef = useRef<HTMLInputElement>(null);
  const [canScan, setCanScan] = useState(canLiveScan);

  const look = (code: string) => {
    if (phaseRef.current.kind !== "scanning") return;
    inputRef.current?.blur();
    setPhase({ kind: "looking", value: code });
    void (async () => {
      const outcome = await app.lookupBarcode(code);
      switch (outcome.kind) {
        case "found":
          setGrams(outcome.value.servingGrams ?? 100);
          SLSound.play("pop");
          setPhase({ kind: "found", value: outcome.value });
          break;
        case "notFound":
          setPhase({ kind: "missing", value: code });
          break;
        case "failed":
          setPhase({ kind: "failed", value: outcome.value });
          break;
      }
    })();
  };

  const viewfinder = (
    <div
      style={{
        position: "relative",
        height: 300,
        alignSelf: "stretch",
        flexShrink: 0,
        borderRadius: SL.Radius.xl,
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        background: canScan ? "#000" : SL.Surface.raised,
      }}
    >
      {canScan ? (
        <BarcodeScanner onCode={look} onUnavailable={() => setCanScan(false)} />
      ) : (
        <VStack spacing={SL.Space.s2} style={{ padding: SL.Space.s5 }}>
          <SFSymbol name="barcode.viewfinder" size={34} color={SL.Surface.mute} />
          <Text {...slMeta()} color={SL.Ink.secondary} align="center">
            The camera can't scan here. Type the number below.
          </Text>
        </VStack>
      )}
      {/* The frame to aim with. */}
      <div aria-hidden style={{ position: "absolute", left: SL.Space.s6, right: SL.Space.s6, top: "50%", height: 120, marginTop: -60, pointerEvents: "none" }}>
        <DashedBorder color={SL.Signal.action} radius={SL.Radius.md} dash="18 10" lineWidth={2.5} />
      </div>
      <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: SL.Radius.xl, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`, pointerEvents: "none" }} />
    </div>
  );

  const typedDigits = digitsOnly(typed);
  const manualEntry = (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: SL.Space.s2,
        paddingLeft: 14,
        paddingRight: 14,
        minHeight: SL.Space.hitMin + 4,
        borderRadius: SL.Radius.md,
        background: SL.Surface.raised2,
        alignSelf: "stretch",
        flexShrink: 0,
      }}
    >
      <SFSymbol name="number" color={SL.Ink.tertiary} />
      <input
        ref={inputRef}
        className="sl-stepper-field"
        value={typed}
        placeholder="Or type the barcode number"
        inputMode="numeric"
        enterKeyHint="search"
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && typedDigits.length >= 8) look(typedDigits);
        }}
        style={{ ...bare, ...slFont(SL.TypeSize.lead, SL.Weight.regular), color: SL.Ink.primary, flex: "1 1 0", minHeight: SL.Space.hitMin }}
      />
      {typedDigits.length >= 8 && (
        <Pressable onPress={() => look(typedDigits)} style={{ background: "transparent", ...slFont(SL.TypeSize.body, SL.Weight.semibold), color: SL.Signal.action, flexShrink: 0, minHeight: SL.Space.hitMin }}>
          Look up
        </Pressable>
      )}
    </div>
  );

  const productCard = (found: BarcodeProduct) => {
    const product = found.product;
    const portion = FoodSearch.portion({ of: product, grams });
    return (
      <VStack
        alignment="leading"
        spacing={SL.Space.s4}
        style={{ alignSelf: "stretch", padding: SL.Space.s4, background: SL.Surface.raised, borderRadius: SL.Radius.xl, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}`, flexShrink: 0 }}
      >
        <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
          <SLFoodPhoto source={{ kind: "url", value: product.imageURL }} style={{ width: 56, height: 56 }} />
          <VStack alignment="leading" spacing={2} style={{ flex: "0 1 auto" }}>
            <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>
              {product.name}
            </Text>
            <Text {...slMeta()} color={SL.Ink.secondary}>
              {[product.brand, `${NumberDisplay.whole(app.display, product.calories)} kcal per 100 g`].filter((s) => s.length > 0).join(" · ")}
            </Text>
          </VStack>
        </HStack>
        <GramsStepper grams={{ value: grams, set: setGrams }} serving={found.servingGrams} />
        <MacroLine calories={portion.calories} protein={portion.protein} carbs={portion.carbs} fat={portion.fat} />
        <Text {...slMeta()} color={SL.Ink.tertiary}>
          Check the packaging; Open Food Facts is maintained by its users.
        </Text>
      </VStack>
    );
  };

  const entry = (found: BarcodeProduct): NutritionEntry => {
    const portion = FoodSearch.portion({ of: found.product, grams });
    return NutritionEntry.make({
      id: `food-${Math.trunc(Date.now())}`,
      date: Schedule.dateKey(date),
      meal,
      name: portion.name,
      calories: portion.calories,
      protein: portion.protein,
      carbs: portion.carbs,
      fat: portion.fat,
      amount: portion.amount,
      unit: portion.unit,
      loggedAt: new Date(),
    });
  };

  const button = (node: ReactNode) => <div style={{ display: "flex", flexDirection: "column", alignSelf: "stretch", flexShrink: 0 }}>{node}</div>;

  let content: ReactNode;
  switch (phase.kind) {
    case "scanning":
      content = (
        <>
          {viewfinder}
          {manualEntry}
          <Spacer minLength={0} />
        </>
      );
      break;
    case "looking":
      content = (
        <>
          <Spacer />
          <ScanWorking text={`Looking up ${phase.value}…`} />
          <Spacer />
        </>
      );
      break;
    case "found": {
      const product = phase.value;
      content = (
        <>
          {productCard(product)}
          <Spacer minLength={0} />
          {button(<SLPrimaryButton onPress={() => onLog(entry(product))}>{`Add to ${Meal.spoken(meal)}`}</SLPrimaryButton>)}
          {button(<SLQuietButton onPress={() => setPhase({ kind: "scanning" })}>Scan another</SLQuietButton>)}
        </>
      );
      break;
    }
    case "missing":
      content = (
        <>
          <Spacer />
          <ScanMessage
            symbol="questionmark.square.dashed"
            title="Not in Open Food Facts yet"
            text={`Barcode ${phase.value} isn't in the database. Search the product by name, or enter it yourself.`}
          />
          <Spacer />
          {button(<SLOutlineButton onPress={() => setPhase({ kind: "scanning" })}>Scan again</SLOutlineButton>)}
        </>
      );
      break;
    case "failed":
      content = (
        <>
          <Spacer />
          <ScanMessage symbol="wifi.exclamationmark" title="Couldn't look it up" text={phase.value} />
          <Spacer />
          {button(<SLOutlineButton onPress={() => setPhase({ kind: "scanning" })}>Try again</SLOutlineButton>)}
        </>
      );
      break;
  }

  return (
    <VStack
      spacing={SL.Space.s4}
      style={{
        flex: "1 1 0",
        minHeight: 0,
        height: "100%",
        alignItems: "center",
        paddingLeft: SL.Space.gutterSession,
        paddingRight: SL.Space.gutterSession,
        paddingTop: `calc(${SL.Space.s3}px + env(safe-area-inset-top))`,
        paddingBottom: `calc(${SL.Space.s3}px + env(safe-area-inset-bottom))`,
        background: SL.Surface.ground,
        overflowY: "auto",
      }}
    >
      <style>{spinnerCSS}</style>
      <ScanTopBar title="Scan barcode" subtitle="Hold the barcode inside the frame" onClose={onClose} />
      {content}
    </VStack>
  );
}

const bare: CSSProperties = { border: "none", outline: "none", background: "transparent", padding: 0, margin: 0, minWidth: 0, appearance: "none" };

/**
 * VisionKit's live barcode reader on the web: the camera stream with the
 * browser's `BarcodeDetector`, reporting the first code it is sure of.
 */
function BarcodeScanner({ onCode, onUnavailable }: { onCode: (code: string) => void; onUnavailable: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const handlers = useRef({ onCode, onUnavailable });
  handlers.current = { onCode, onUnavailable };
  useEffect(() => {
    let stream: MediaStream | undefined;
    let frame = 0;
    let stopped = false;
    let sent = false;
    let busy = false;
    const detector = barcodeDetector();
    if (!detector) {
      handlers.current.onUnavailable();
      return;
    }
    const tick = async () => {
      if (stopped || sent) return;
      const v = video.current;
      if (v && v.readyState >= 2 && !busy) {
        busy = true;
        try {
          const codes = await detector.detect(v);
          for (const code of codes) {
            if (code.rawValue && !sent) {
              sent = true;
              handlers.current.onCode(code.rawValue);
              return;
            }
          }
        } catch {
          /* a frame that would not read */
        }
        busy = false;
      }
      frame = requestAnimationFrame(() => void tick());
    };
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = video.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play().catch(() => {});
        frame = requestAnimationFrame(() => void tick());
      } catch {
        handlers.current.onUnavailable();
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return <video ref={video} muted playsInline autoPlay style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />;
}

// MARK: - Photo scan

type ScanPhase = "start" | "reading" | "results" | "empty";

/** `FoodPhotoScanSheet.TallyChat`. */
export interface FoodPhotoScanSheet_TallyChat {
  say: string;
  question?: FoodScanAnswer_Question;
  turns: FoodScanRequest_Turn[];
}

interface LastAnswer {
  food: string;
  answer: string;
  question: string;
}

/** The photo picked: the file, and a URL to show it by. */
interface PickedPhoto {
  file: Blob;
  url: string;
}

/** Every `@State` of the sheet, held in one place so an awaited scan reads them as they are now, as Swift's do. */
interface ScanState {
  phase: ScanPhase;
  photo?: PickedPhoto;
  text: string;
  items: ScannedFood[];
  /** Per row, what else it could be — offered under "Other match". */
  alternatives: Map<string, ScannedFood[]>;
  /** Per row, the answers tapped to its questions. */
  answered: Map<string, Set<string>>;
  /** Per row, the rows its answers added, by answer. */
  added: Map<string, Map<string, string>>;
  /** Tally's jumps, and the last thing Tally reacted to. */
  tallyJumps: number;
  lastAnswer?: LastAnswer;
  /** Questions answered with Done or Skip, by "row-question". */
  closed: Set<string>;
  /** What the last line typed after a scan added, for Tally to say so. */
  lastAdded: string[];
  /** Rows that came from the photo: Tally checks those first. */
  fromPhoto: Set<string>;
  /** The photo guess "Something else" points at: what is typed next takes its place. */
  replacing?: string;
  /** The conversation with Tally on the server, when it answered. */
  chat?: FoodPhotoScanSheet_TallyChat;
  /** Tally is redoing the plate after an answer. */
  thinking: boolean;
  leftOut: Set<string>;
  typing: boolean;
}

/** "rice, fries and mayo" */
function list(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
}

function capitalized(text: string): string {
  const chars = [...text];
  return (chars[0] ?? "").toUpperCase() + chars.slice(1).join("");
}

/** "White rice, cooked" → "rice"; "Chicken pie (vol-au-vent)" → "chicken pie". */
function short(name: string): string {
  const base = name.split("(").filter((s) => s.length > 0)[0] ?? name;
  const first = base.split(",").filter((s) => s.length > 0)[0] ?? base;
  const words = first.split(" ").filter((s) => s.length > 0);
  const trimmed = words.length > 1 && ["white", "mixed", "fried"].includes(words[0].toLowerCase()) ? words.slice(1).join(" ") : first;
  return trimmingWhitespaces(trimmed.toLowerCase());
}

/**
 * A photo of the plate — or a line saying what it was — comes back as the
 * foods on it with an amount each. Nothing is logged until the grams are
 * checked.
 */
export function FoodPhotoScanSheet({ date, meal, onLog, onClose }: { date: Date; meal: Meal; onLog: (entries: NutritionEntry[]) => void; onClose: () => void }) {
  const app = useApp();
  const display = app.display;
  const whole = (v: number) => NumberDisplay.whole(display, v);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const ref = useRef<ScanState>({
    phase: "start",
    text: "",
    items: [],
    alternatives: new Map(),
    answered: new Map(),
    added: new Map(),
    tallyJumps: 0,
    closed: new Set(),
    lastAdded: [],
    fromPhoto: new Set(),
    thinking: false,
    leftOut: new Set(),
    typing: false,
  });
  const s = ref.current;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  // The photo's URL is let go of when the sheet closes.
  useEffect(() => () => {
    if (ref.current.photo) URL.revokeObjectURL(ref.current.photo.url);
  }, []);

  const setTyping = (on: boolean) => {
    s.typing = on;
    if (on) inputRef.current?.focus();
    else inputRef.current?.blur();
    bump();
  };

  const addedIDs = (): Set<string> => new Set([...s.added.values()].flatMap((m) => [...m.values()]));

  const questionKey = (item: ScannedFood): string | undefined => item.key ?? MealRecognition.match(item.name)?.key;

  /** The first question still open, and the food it's about. */
  const openQuestion = (): { food: ScannedFood; question: MealRecognition_Question } | undefined => {
    if (s.chat) return undefined;
    for (const item of s.items) {
      if (s.fromPhoto.has(item.id) && !s.closed.has(`${item.id}-what`)) return { food: item, question: MealRecognition.identityQuestion({ for: item }) };
    }
    const ids = addedIDs();
    for (const item of s.items) {
      if (s.leftOut.has(item.id) || ids.has(item.id)) continue;
      for (const question of MealRecognition.questions({ for: questionKey(item) })) {
        if (!s.closed.has(`${item.id}-${question.id}`)) return { food: item, question };
      }
    }
    return undefined;
  };

  const tallyMood = (): TallyMascot_Mood => {
    switch (s.phase) {
      case "start":
        return "ready";
      case "reading":
        return "focused";
      case "empty":
        return "resting";
      case "results":
        return s.thinking ? "focused" : openQuestion() === undefined && s.chat?.question === undefined ? "proud" : "ready";
    }
  };

  /** What Tally says: always about what is on screen now, never chat. */
  const tallyLine = (): string => {
    const chat = s.chat;
    if (chat) {
      if (s.thinking) return "Got it, redoing the plate…";
      switch (s.phase) {
        case "results":
          if (chat.question) return `${chat.say} ${chat.question.text}`;
          return `${chat.say} Check the grams, then add it to ${Meal.spoken(meal)}.`;
        case "empty":
          return `${chat.say} Tell me what it was?`;
        default:
          break;
      }
    }
    switch (s.phase) {
      case "start":
        return "Hi! Show me your plate or the package, or tell me what you ate.";
      case "reading":
        return "Hmm, let me have a look…";
      case "empty":
        return "I couldn't make that out. Tell me what it was?";
      case "results": {
        const ids = addedIDs();
        const names = s.items.filter((i) => !ids.has(i.id)).map((i) => short(i.name));
        const seen = names.length <= 1 ? (names[0] ?? "something") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
        const open = openQuestion();
        const last = s.lastAnswer;
        if (open) {
          const food = short(open.food.name);
          let ask: string;
          switch (open.question.kind) {
            case "size":
              ask = `how big was the ${food}?`;
              break;
            case "identity":
              ask = `is that ${food}?`;
              break;
            case "adds":
              ask =
                open.question.id === "on"
                  ? `anything on that ${food}?`
                  : open.question.id === "sauce"
                    ? `any sauce with the ${food}?`
                    : open.question.id === "dressing"
                      ? "dressing on the salad?"
                      : open.question.id === "milk"
                        ? `milk or sugar in your ${food}?`
                        : `anything on top of the ${food}?`;
              break;
          }
          if (last && last.question === `${open.food.id}-${open.question.id}`) {
            return `${capitalized(last.answer)} on the ${last.food}, nice. Anything else on it? Tap Done when that's it.`;
          }
          if (s.lastAdded.length > 0) return `Added ${list(s.lastAdded)}. And ${ask}`;
          if (open.question.kind === "identity") {
            return s.replacing !== undefined
              ? "No problem — type what it was just below, and I'll swap it."
              : `I think I see ${short(open.food.name)}. Is that right?`;
          }
          if (last && last.question === "what") return `${capitalized(last.answer)} it is! And ${ask}`;
          if (last && last.question === "size") return `${capitalized(last.answer)} of ${last.food}, noted. And ${ask}`;
          return `I see ${seen}. Quick one: ${ask}`;
        }
        if (s.lastAdded.length > 0) return `Added ${list(s.lastAdded)}. Anything else? Otherwise, add it to ${Meal.spoken(meal)}.`;
        if (last && last.question === "what") return `${capitalized(last.answer)} it is! Check the grams, then add it to ${Meal.spoken(meal)}.`;
        if (last !== undefined || s.closed.size > 0) return `Got it! Check the grams, then add it to ${Meal.spoken(meal)}.`;
        return `I see ${seen}. Check the grams, then add it to ${Meal.spoken(meal)}.`;
      }
    }
  };

  // MARK: - Tally's answers

  const choose = (answer: MealRecognition_Question_Answer, question: MealRecognition_Question, item: ScannedFood) => {
    const chosen = new Set(s.answered.get(item.id) ?? []);
    switch (question.kind) {
      case "identity": {
        if (answer.id === "else") {
          s.replacing = item.id;
          setTyping(true);
          return;
        }
        s.closed = new Set(s.closed).add(`${item.id}-what`);
        s.replacing = undefined;
        const food = answer.id !== "yes" && answer.addsKey !== undefined ? MealRecognition.foods.find((f) => f.key === answer.addsKey) : undefined;
        const index = s.items.findIndex((i) => i.id === item.id);
        if (food && index >= 0) {
          const swapped = MealRecognition_Food.scanned(food, { confidence: "high" });
          const kept = ScannedFood.make({
            name: swapped.name, grams: swapped.grams, calories: swapped.calories,
            protein: swapped.protein, carbs: swapped.carbs, fat: swapped.fat,
            confidence: "high", key: swapped.key, id: item.id,
          });
          const items = [...s.items];
          items[index] = kept;
          s.items = items;
          s.lastAnswer = { food: short(food.name), answer: short(food.name), question: "what" };
        } else {
          s.lastAnswer = { food: short(item.name), answer: short(item.name), question: "what" };
        }
        s.tallyJumps += 1;
        SLSound.play("pop");
        bump();
        return;
      }
      case "size": {
        for (const a of question.answers) chosen.delete(a.id);
        chosen.add(answer.id);
        const index = s.items.findIndex((i) => i.id === item.id);
        if (index >= 0) {
          const items = [...s.items];
          items[index] = MealRecognition.sized(item, { by: answer });
          s.items = items;
        }
        s.closed = new Set(s.closed).add(`${item.id}-${question.id}`);
        s.lastAnswer = { food: short(item.name), answer: `${answer.label} plate`, question: "size" };
        s.tallyJumps += 1;
        break;
      }
      case "adds": {
        if (chosen.has(answer.id)) {
          chosen.delete(answer.id);
          const childID = s.added.get(item.id)?.get(answer.id);
          if (childID !== undefined) {
            s.items = s.items.filter((i) => i.id !== childID);
            s.leftOut.delete(childID);
            s.added.get(item.id)?.delete(answer.id);
          }
        } else {
          const child = MealRecognition.added(answer, { to: item });
          const index = s.items.findIndex((i) => i.id === item.id);
          if (child && index >= 0) {
            chosen.add(answer.id);
            const after = index + 1 + (s.added.get(item.id)?.size ?? 0);
            const items = [...s.items];
            items.splice(Math.min(after, items.length), 0, child);
            s.items = items;
            if (!s.added.has(item.id)) s.added.set(item.id, new Map());
            s.added.get(item.id)!.set(answer.id, child.id);
            s.lastAnswer = { food: short(item.name), answer: answer.label.split(" / ")[0] ?? answer.label, question: `${item.id}-${question.id}` };
            s.tallyJumps += 1;
            SLSound.play("pop");
          }
        }
        break;
      }
    }
    s.answered.set(item.id, chosen);
    bump();
  };

  /** Takes a row off the plate, with whatever its answers added to it. */
  const remove = (id: string, keepPlace = false) => {
    const children = [...(s.added.get(id)?.values() ?? [])];
    s.items = s.items.filter((i) => i.id !== id && !children.includes(i.id));
    s.added.delete(id);
    for (const [parent, map] of [...s.added]) {
      const answer = [...map].find(([, value]) => value === id)?.[0];
      if (answer !== undefined) {
        s.added.get(parent)?.delete(answer);
        s.answered.get(parent)?.delete(answer);
      }
    }
    s.answered.delete(id);
    s.fromPhoto.delete(id);
    s.alternatives.delete(id);
    if (s.replacing === id && !keepPlace) s.replacing = undefined;
    if (!keepPlace) {
      s.lastAnswer = undefined;
      s.lastAdded = [];
    }
    if (s.items.length === 0 && !keepPlace) s.phase = "start";
    bump();
  };

  // MARK: - Reading the plate

  /** Before a scan, reads what was typed; after one, adds it to the plate. */
  const send = () => {
    if (charCount(trimmingWhitespaces(s.text)) < 2) return;
    if (s.phase === "results") scan(true);
    else scan();
  };

  /**
   * Asks Tally on the server: the photo, what was typed and — on a follow-up —
   * the plate and every turn so far. True when Tally answered and the screen
   * shows that answer; false sends the scan to the phone's own reading.
   */
  const askTally = async (line: string, image: Blob | undefined, adding: boolean, answer?: string): Promise<boolean> => {
    const following = adding || answer !== undefined;
    if (following && s.chat === undefined) return false;
    let turns = [...(s.chat?.turns ?? [])];
    if (answer !== undefined && s.chat?.question) {
      turns = [...turns, FoodScanRequest_Turn.tally(s.chat.question.text), FoodScanRequest_Turn.user(answer)];
    }
    const source = image ?? (following ? s.photo?.file : undefined);
    const request = FoodScanRequest.make({
      imageJPEG: source ? await jpeg(source) : undefined,
      text: answer === undefined ? line : undefined,
      plate: following ? s.items.filter((i) => !s.leftOut.has(i.id)) : [],
      turns,
    });
    if (following) {
      s.thinking = true;
      bump();
    }
    const outcome = await app.scanMeal(request);
    s.thinking = false;
    if (outcome.kind !== "answer") {
      bump();
      return false;
    }
    const reply = outcome.value;
    if (line !== "" && answer === undefined) turns.push(FoodScanRequest_Turn.user(line));
    turns.push(FoodScanRequest_Turn.tally(reply.say));
    s.chat = { say: reply.say, question: reply.question, turns };
    if (adding) s.text = "";
    s.items = reply.items;
    s.alternatives = new Map();
    s.fromPhoto = new Set();
    s.leftOut = new Set();
    s.answered = new Map();
    s.added = new Map();
    s.closed = new Set();
    s.lastAnswer = undefined;
    s.lastAdded = [];
    s.replacing = undefined;
    if (line !== "" && !adding) s.text = "";
    if (reply.items.length === 0 && !following) {
      s.phase = "empty";
    } else {
      SLSound.play("pop");
      s.tallyJumps += 1;
      s.phase = "results";
    }
    bump();
    return true;
  };

  /** A tap on one of Tally's options, or Skip. */
  const answerTally = (option: string | undefined) => {
    if (option === undefined) {
      if (s.chat) s.chat = { ...s.chat, question: undefined };
      bump();
      return;
    }
    void askTally("", undefined, false, option);
  };

  /** What the search finds for a typed food, the names closest to what was typed first. */
  const searched = async (part: MealRecognition_Part): Promise<ScannedFood[]> => {
    const outcome = await app.searchFood(part.words);
    if (outcome.kind === "failed") return [];
    const products = outcome.value;
    const grams = part.grams ?? 100;
    return products
      .map((product) => ({ product, score: MealRecognition.similarity(part.words, { to: product.name, brand: product.brand }) }))
      .filter((x) => x.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ product, score }) => {
        const portion = FoodSearch.portion({ of: product, grams });
        const label = product.brand === "" || product.brand === "Generiek" ? product.name : `${product.name} · ${product.brand}`;
        return ScannedFood.make({
          name: label, grams, calories: portion.calories,
          protein: portion.protein, carbs: portion.carbs, fat: portion.fat,
          confidence: score >= 0.9 ? "medium" : "low",
        });
      });
  };

  /**
   * Reads the photo and what was typed. `adding` keeps the plate as it is and
   * puts only the newly typed foods on it — "and a coke".
   */
  const scan = (adding = false) => {
    setTyping(false);
    if (!adding) {
      s.phase = "reading";
      s.leftOut = new Set();
      s.chat = undefined;
    }
    const image = adding ? undefined : s.photo?.file;
    const line = trimmingWhitespacesAndNewlines(s.text);
    if (adding) s.text = "";
    bump();
    void (async () => {
      if (await askTally(line, image, adding)) return;
      const found: ScannedFood[] = [];
      const others = new Map<string, ScannedFood[]>();
      let photoRows = new Set<string>();
      // What was typed comes first: it says exactly what and how much.
      for (const part of MealRecognition.parts({ of: line })) {
        const tableOthers = MealRecognition.candidates(part.words).map((food) => MealRecognition_Food.scanned(food, { grams: part.grams, confidence: "medium" }));
        const searchedOthers = await searched(part);
        // A table dish that is only part of what was typed gives way to the product.
        const matched = MealRecognition.match(part.words);
        const tableFits = matched ? MealRecognition.coverage(part.words, { by: matched }) >= 0.6 : false;
        const food = MealRecognition.scanned(part);
        if (food && (tableFits || searchedOthers.length === 0)) {
          found.push(food);
          others.set(food.id, [...tableOthers, ...searchedOthers].filter((o) => o.name !== food.name));
        } else if (searchedOthers.length > 0) {
          const product = searchedOthers[0];
          // Without a typed amount, the dish's usual portion (a pizza is 250 g, not 100).
          const usual = part.grams ?? MealRecognition.match(part.words)?.grams ?? product.grams;
          const sized = ScannedFood.scaled(product, { to: usual });
          const pick = ScannedFood.make({ name: sized.name, grams: sized.grams, calories: sized.calories, protein: sized.protein, carbs: sized.carbs, fat: sized.fat, confidence: "medium" });
          found.push(pick);
          const scannedPart = MealRecognition.scanned(part);
          others.set(pick.id, [...searchedOthers.slice(1), ...(scannedPart ? [scannedPart] : []), ...tableOthers]);
        } else {
          const all = [...tableOthers, ...searchedOthers];
          const first = all[0];
          if (first) {
            const pick = ScannedFood.make({
              name: first.name, grams: first.grams, calories: first.calories,
              protein: first.protein, carbs: first.carbs, fat: first.fat,
              confidence: tableOthers.length === 0 ? "low" : "medium",
            });
            found.push(pick);
            others.set(pick.id, all.slice(1));
          }
        }
      }
      let readPackage = false;
      if (image) {
        const looked = await MealScanner.look(image);
        // A package says what it is in print: its barcode, its nutrition table, its name.
        const product = await packaged(app, looked);
        if (product) {
          found.push(product.food);
          others.set(product.food.id, product.others);
          if (product.food.confidence !== "high") photoRows.add(product.food.id);
          readPackage = true;
        }
      }
      if (image && !readPackage) {
        const labels = await MealScanner.labels(image);
        const seen = MealRecognition.fromLabels(labels, { limit: 8 });
        const shown = seen.slice(0, 4).filter((item) => !found.some((f) => f.name === item.name));
        for (const item of shown) {
          others.set(item.id, seen.filter((o) => o.name !== item.name && !shown.some((x) => x.id === o.id)));
        }
        found.push(...shown);
        photoRows = new Set(shown.map((i) => i.id));
      }
      const target = s.replacing;
      const targetIndex = target === undefined ? -1 : s.items.findIndex((i) => i.id === target);
      if (adding && target !== undefined && targetIndex >= 0 && found.length > 0) {
        // "Something else": the typed food takes the guess's place.
        const first = found[0];
        remove(target, true);
        const items = [...s.items];
        items.splice(Math.min(targetIndex, items.length), 0, first);
        items.splice(Math.min(targetIndex + 1, items.length), 0, ...found.slice(1));
        s.items = items;
        for (const [k, v] of others) s.alternatives.set(k, v);
        s.replacing = undefined;
        s.lastAdded = [];
        s.lastAnswer = { food: short(first.name), answer: short(first.name), question: "what" };
        SLSound.play("pop");
        s.tallyJumps += 1;
        bump();
        return;
      }
      if (adding) {
        s.items = [...s.items, ...found];
        for (const [k, v] of others) s.alternatives.set(k, v);
        s.lastAdded = found.map((f) => short(f.name));
        s.lastAnswer = undefined;
        if (found.length > 0) {
          SLSound.play("pop");
          s.tallyJumps += 1;
        }
        bump();
        return;
      }
      s.items = found;
      s.alternatives = others;
      s.fromPhoto = photoRows;
      s.replacing = undefined;
      s.answered = new Map();
      s.added = new Map();
      s.closed = new Set();
      s.lastAnswer = undefined;
      s.lastAdded = [];
      if (line !== "") s.text = "";
      if (found.length === 0) {
        s.phase = "empty";
      } else {
        SLSound.play("pop");
        s.tallyJumps += 1;
        s.phase = "results";
      }
      bump();
    })();
  };

  // MARK: - Picking a photo

  const pick = (source: "camera" | "photoLibrary") => {
    (source === "camera" && cameraAvailable() ? cameraInput : libraryInput).current?.click();
  };

  const picked = (file: File | undefined) => {
    if (!file) return;
    if (s.photo) URL.revokeObjectURL(s.photo.url);
    s.photo = { file, url: URL.createObjectURL(file) };
    SLSound.shutter();
    scan();
  };

  // MARK: - Pieces

  const chipStyle = (on: boolean): CSSProperties => ({
    ...slFont(SL.TypeSize.meta, SL.Weight.semibold),
    color: on ? SL.Signal.onAction : SL.Ink.primary,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    paddingLeft: SL.Space.s3,
    paddingRight: SL.Space.s3,
    minHeight: 36,
    borderRadius: SL.Radius.pill,
    background: on ? SL.Signal.action : SL.Surface.raised2,
    boxShadow: `inset 0 0 0 1px ${on ? "transparent" : SL.Surface.hairlineStrong}`,
    whiteSpace: "nowrap",
  });

  const quietChip = (text: string, solid: boolean, ink: string, edge: string) => (
    <span style={{ position: "relative", ...slFont(SL.TypeSize.meta, SL.Weight.semibold), color: ink, display: "inline-flex", alignItems: "center", paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: 36, borderRadius: SL.Radius.pill, whiteSpace: "nowrap", boxShadow: solid ? `inset 0 0 0 1px ${edge}` : undefined }}>
      {text}
      {!solid && <DashedBorder color={edge} radius={18} dash="4 3" />}
    </span>
  );

  /** The answers to Tally's question as chips, then Done (after an answer) or Skip. */
  const answerChips = (question: MealRecognition_Question, item: ScannedFood) => {
    const chosen = s.answered.get(item.id) ?? new Set<string>();
    const anyChosen = question.answers.some((a) => chosen.has(a.id));
    return (
      <ScrollView axis="horizontal" style={{ marginLeft: 64, alignSelf: "stretch" }}>
        <HStack spacing={6} style={{ width: "max-content" }}>
          {question.answers.map((answer) => {
            const on = chosen.has(answer.id) || (answer.id === "else" && s.replacing === item.id);
            return (
              <SLPress key={answer.id} scale={0.92} bounces onPress={() => choose(answer, question, item)} style={{ borderRadius: SL.Radius.pill, flexShrink: 0 }}>
                <span style={chipStyle(on)}>
                  {on && <SFSymbol name="checkmark" size={11} weight={700} color={SL.Signal.onAction} />}
                  {answer.label}
                </span>
              </SLPress>
            );
          })}
          {question.kind !== "identity" && (
            <SLPress
              scale={0.92}
              onPress={() => {
                s.closed = new Set(s.closed).add(`${item.id}-${question.id}`);
                s.lastAnswer = undefined;
                bump();
              }}
              style={{ borderRadius: SL.Radius.pill, flexShrink: 0 }}
            >
              {quietChip(anyChosen ? "Done" : "Skip", anyChosen, anyChosen ? SL.Signal.action : SL.Ink.secondary, anyChosen ? colorOpacity(SL.Signal.action, 0.6) : SL.Surface.hairlineStrong)}
            </SLPress>
          )}
        </HStack>
      </ScrollView>
    );
  };

  const chatChips = (question: FoodScanAnswer_Question) => (
    <ScrollView axis="horizontal" style={{ marginLeft: 64, alignSelf: "stretch" }}>
      <HStack spacing={6} style={{ width: "max-content" }}>
        {question.options.map((option) => (
          <SLPress key={option} scale={0.92} bounces onPress={() => answerTally(option)} style={{ borderRadius: SL.Radius.pill, flexShrink: 0 }}>
            <span style={chipStyle(false)}>{option}</span>
          </SLPress>
        ))}
        <SLPress scale={0.92} onPress={() => answerTally(undefined)} style={{ borderRadius: SL.Radius.pill, flexShrink: 0 }}>
          {quietChip("Skip", false, SL.Ink.secondary, SL.Surface.hairlineStrong)}
        </SLPress>
      </HStack>
    </ScrollView>
  );

  /** The one place to tell Tally anything: what you ate, what to add, or what a wrong guess really was. */
  const canSend = charCount(trimmingWhitespaces(s.text)) >= 2;
  const prompt = s.replacing !== undefined ? "What was it? e.g. nasi goreng" : s.items.length === 0 ? "Tell Tally what you ate…" : "Add more: a coke, 2 eggs…";
  const inputField = (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: SL.Space.s2,
        alignSelf: "stretch",
        borderRadius: 22,
        background: SL.Surface.ground,
        boxShadow: `inset 0 0 0 1px ${s.typing || s.replacing !== undefined ? colorOpacity(SL.Signal.action, 0.5) : SL.Surface.hairlineStrong}`,
      }}
    >
      <AutoGrowField
        innerRef={inputRef}
        value={s.text}
        placeholder={prompt}
        onChange={(v) => {
          s.text = v;
          bump();
        }}
        onFocus={() => {
          s.typing = true;
          bump();
        }}
        onBlur={() => {
          s.typing = false;
          bump();
        }}
        onSubmit={send}
      />
      <SLPress
        scale={0.9}
        disabled={!canSend}
        aria-label="Send to Tally"
        onPress={send}
        style={{ borderRadius: "50%", marginRight: 6, marginBottom: 6, flexShrink: 0 }}
      >
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: canSend ? SL.Signal.action : SL.Surface.hairlineStrong, display: "grid", placeItems: "center" }}>
          <SFSymbol name="arrow.up" size={14} weight={700} color={canSend ? SL.Signal.onAction : SL.Ink.tertiary} />
        </div>
      </SLPress>
    </div>
  );

  /** Tally, what Tally says, and — when Tally asks something — the answers right under it. */
  const tallyCard = (() => {
    const open = s.phase === "results" ? openQuestion() : undefined;
    return (
      <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch", padding: SL.Space.s4, background: SL.Surface.raised, borderRadius: SL.Radius.xl, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}` }}>
        <TallyGuide
          line={tallyLine()}
          mood={tallyMood()}
          jumps={s.tallyJumps}
          onTap={() => {
            s.tallyJumps += 1;
            bump();
          }}
        />
        {s.phase === "results" && s.chat?.question && !s.thinking
          ? chatChips(s.chat.question)
          : s.phase === "results" && open
            ? answerChips(open.question, open.food)
            : null}
        {/* Telling Tally, right under what Tally says. */}
        {inputField}
      </VStack>
    );
  })();

  const captureTile = (title: string, symbol: string, action: () => void) => (
    <SLPress key={title} scale={0.97} onPress={action} style={{ flex: "1 1 0", minWidth: 0 }}>
      <VStack spacing={SL.Space.s2} style={{ minHeight: 120, justifyContent: "center", background: SL.Surface.raised, borderRadius: SL.Radius.xl, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}` }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: SL.Signal.actionTint, display: "grid", placeItems: "center" }}>
          <SFSymbol name={symbol} size={22} weight={600} color={SL.Signal.action} />
        </div>
        <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
          {title}
        </Text>
      </VStack>
    </SLPress>
  );

  /** The two ways in with a picture, as big quiet tiles. */
  const captureTiles = (
    <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
      {cameraAvailable() && captureTile("Take a photo", "camera.fill", () => pick("camera"))}
      {captureTile("From your photos", "photo.on.rectangle", () => pick("photoLibrary"))}
    </HStack>
  );

  /** The photo, small, once it has been read — with the way to take another. */
  const photoStrip = s.photo && (
    <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
      <img src={s.photo.url} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: SL.Radius.md, flexShrink: 0 }} />
      <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
        Your photo
      </Text>
      <Spacer minLength={0} />
      <SLPress scale={0.94} onPress={() => pick(cameraAvailable() ? "camera" : "photoLibrary")} style={{ borderRadius: SL.Radius.pill, flexShrink: 0 }}>
        <span style={{ ...slFont(SL.TypeSize.meta, SL.Weight.semibold), color: SL.Ink.secondary, display: "inline-flex", alignItems: "center", gap: 6, paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: 34, borderRadius: SL.Radius.pill, background: SL.Surface.raised2 }}>
          <SFSymbol name="arrow.counterclockwise" size={SL.TypeSize.meta} weight={600} />
          Retake
        </span>
      </SLPress>
    </HStack>
  );

  const confidence = (level: ScannedFood_Confidence) => {
    const [text, ink] = level === "high" ? ["Sure", SL.Signal.recovery] : level === "medium" ? ["Likely", SL.Ink.secondary] : ["Guess", SL.Signal.attention];
    return (
      <span style={{ ...slFont(SL.TypeSize.micro, SL.Weight.semibold), color: ink, paddingLeft: SL.Space.s2, paddingRight: SL.Space.s2, paddingTop: 3, paddingBottom: 3, borderRadius: SL.Radius.pill, background: colorOpacity(ink, 0.14), whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.25 }}>
        {text}
      </span>
    );
  };

  /** What else a row could be, one tap from its grams. */
  const otherMatch = (others: ScannedFood[], item: ScannedFood, index: number) => (
    <Menu
      aria-label={`Other match for ${item.name}`}
      style={{ flexShrink: 0 }}
      entries={others.map((other) => ({
        kind: "button" as const,
        title: `${other.name} · ${whole(ScannedFood.scaled(other, { to: item.grams }).calories)} kcal`,
        action: () => {
          const swapped = ScannedFood.scaled(other, { to: item.grams });
          const replaced = ScannedFood.make({
            name: swapped.name, grams: swapped.grams, calories: swapped.calories,
            protein: swapped.protein, carbs: swapped.carbs, fat: swapped.fat,
            confidence: "high", key: swapped.key,
          });
          s.alternatives.set(replaced.id, [...others.filter((o) => o.id !== other.id), item]);
          const items = [...s.items];
          items[index] = replaced;
          s.items = items;
          bump();
        },
      }))}
      label={
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
          <SFSymbol name="arrow.triangle.2.circlepath" size={14} weight={600} color={SL.Ink.secondary} />
        </div>
      }
    />
  );

  const resultRow = (index: number, item: ScannedFood) => {
    const included = !s.leftOut.has(item.id);
    const isAdded = addedIDs().has(item.id);
    const others = s.alternatives.get(item.id);
    return (
      <VStack
        alignment="leading"
        spacing={SL.Space.s2}
        style={{ alignSelf: "stretch", padding: SL.Space.s3, paddingLeft: SL.Space.s3 + (isAdded ? SL.Space.s6 : 0), background: isAdded ? colorOpacity(SL.Signal.actionTint, 0.35) : "transparent" }}
      >
        <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
          <VStack alignment="leading" spacing={1} style={{ flex: "0 1 auto", minWidth: 0 }}>
            <Text {...slBody(SL.Weight.semibold)} color={included ? SL.Ink.primary : SL.Ink.tertiary}>
              {item.name}
            </Text>
            <Text {...slMeta()} numerals color={SL.Ink.secondary}>
              {`${whole(item.calories)} kcal · ${whole(item.protein)} g protein`}
            </Text>
          </VStack>
          <Spacer minLength={SL.Space.s2} />
          {confidence(item.confidence)}
          <SLPress scale={0.9} aria-label={`Remove ${item.name}`} onPress={() => remove(item.id)} style={{ marginRight: -SL.Space.s2, flexShrink: 0 }}>
            <div style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, display: "grid", placeItems: "center" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
                <SFSymbol name="xmark" size={12} weight={700} color={SL.Ink.secondary} />
              </div>
            </div>
          </SLPress>
        </HStack>
        {included && (
          <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
            <GramsStepper
              grams={{
                value: s.items[index].grams,
                set: (v) => {
                  const items = [...s.items];
                  items[index] = ScannedFood.scaled(items[index], { to: v });
                  s.items = items;
                  bump();
                },
              }}
              compact
            />
            <Spacer minLength={0} />
            {others && others.length > 0 && otherMatch(others, item, index)}
          </HStack>
        )}
      </VStack>
    );
  };

  const results = (() => {
    const chosen = s.items.filter((i) => !s.leftOut.has(i.id));
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        <Text size={SL.TypeSize.micro} weight={SL.Weight.bold} tracking={1} color={SL.Ink.secondary}>
          ON YOUR PLATE
        </Text>
        <VStack spacing={0} style={{ alignSelf: "stretch", alignItems: "stretch", background: SL.Surface.raised, borderRadius: SL.Radius.lg, overflow: "hidden" }}>
          {s.items.map((item, index) => (
            <div key={item.id} style={{ position: "relative", display: "flex", flexDirection: "column" }}>
              {resultRow(index, item)}
              {index > 0 && <SLHairline style={{ position: "absolute", top: 0, left: 0, right: 0 }} />}
            </div>
          ))}
        </VStack>
        <div style={{ paddingTop: SL.Space.s2 }}>
          <MacroLine
            calories={chosen.reduce((t, i) => t + i.calories, 0)}
            protein={chosen.reduce((t, i) => t + i.protein, 0)}
            carbs={chosen.reduce((t, i) => t + i.carbs, 0)}
            fat={chosen.reduce((t, i) => t + i.fat, 0)}
          />
        </div>
        <Text {...slMeta()} color={SL.Ink.tertiary}>
          {s.chat !== undefined ? "Estimated by Tally from what it sees. Weighing beats guessing." : "Usual portions and standard values. Weighing beats guessing."}
        </Text>
      </VStack>
    );
  })();

  /** One place to tell Tally anything, and under it the one lime action. */
  const dock = (() => {
    const chosen = s.items.filter((i) => !s.leftOut.has(i.id));
    if (!(s.phase === "results" && chosen.length > 0 && !s.typing)) return null;
    return (
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          paddingLeft: SL.Space.gutterSession,
          paddingRight: SL.Space.gutterSession,
          paddingTop: SL.Space.s2,
          paddingBottom: SL.Space.s2,
          background: SL.Surface.ground,
        }}
      >
        <SLPrimaryButton
          onPress={() => {
            const stamp = Math.trunc(Date.now());
            onLog(chosen.map((item, offset) => ScannedFood.entry(item, { id: `food-${stamp + offset}`, on: date, meal })));
          }}
        >
          {chosen.length === 1 ? `Add to ${Meal.spoken(meal)}` : `Add ${chosen.length} items to ${Meal.spoken(meal)}`}
        </SLPrimaryButton>
      </div>
    );
  })();

  let phaseContent: ReactNode;
  switch (s.phase) {
    case "start":
      phaseContent = (
        <>
          {captureTiles}
          <div style={{ alignSelf: "stretch", display: "flex", justifyContent: "center", alignItems: "center", gap: 6, color: SL.Ink.tertiary }}>
            <SFSymbol name="sparkles" size={SL.TypeSize.micro} />
            <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} color={SL.Ink.tertiary}>
              Tally reads your photo with Google's Gemini AI. Setline doesn't keep it.
            </Text>
          </div>
        </>
      );
      break;
    case "reading":
      phaseContent = (
        <>
          {photoStrip}
          <div style={{ alignSelf: "stretch", display: "flex", justifyContent: "center", paddingTop: SL.Space.s4 }}>
            <ScanWorking text="Reading your plate…" />
          </div>
        </>
      );
      break;
    case "results":
      phaseContent = (
        <>
          {photoStrip}
          {results}
        </>
      );
      break;
    case "empty":
      phaseContent = (
        <>
          {photoStrip}
          {captureTiles}
        </>
      );
      break;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, height: "100%", background: SL.Surface.ground, paddingBottom: "env(safe-area-inset-bottom)" }}>
      <style>{spinnerCSS}</style>
      <div style={{ flexShrink: 0, paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: `calc(${SL.Space.s3}px + env(safe-area-inset-top))`, paddingBottom: SL.Space.s3 }}>
        <ScanTopBar title="Scan your meal" subtitle="A photo, or a line about what you ate" onClose={onClose} />
      </div>

      <ScrollView style={{ flex: "1 1 0" }}>
        <VStack alignment="leading" spacing={SL.Space.s4} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingBottom: SL.Space.s4 }}>
          {/* One place to talk: Tally asks, the chips under it answer. */}
          {tallyCard}
          {phaseContent}
        </VStack>
      </ScrollView>

      {dock}

      {/* `ImagePicker`: the camera, or the photo library. */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          picked(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          picked(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** `TextField(axis: .vertical).lineLimit(1...3)`: grows with what is typed up to three lines. */
function AutoGrowField({
  innerRef,
  value,
  placeholder,
  onChange,
  onFocus,
  onBlur,
  onSubmit,
}: {
  innerRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSubmit: () => void;
}) {
  const lineHeight = SL.TypeSize.body * 1.25;
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, lineHeight * 3)}px`;
  }, [value, innerRef, lineHeight]);
  return (
    <textarea
      ref={innerRef}
      className="sl-stepper-field"
      rows={1}
      value={value}
      placeholder={placeholder}
      enterKeyHint="send"
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
      }}
      style={{
        ...bare,
        ...slFont(SL.TypeSize.body, SL.Weight.regular),
        color: SL.Ink.primary,
        lineHeight: `${lineHeight}px`,
        resize: "none",
        overflowY: "auto",
        flex: "1 1 0",
        marginLeft: SL.Space.s4,
        marginTop: 11,
        marginBottom: 11,
        display: "block",
      }}
    />
  );
}

/** The photo as Tally gets it: 1024 px on the long side is plenty to read a plate or a label, and keeps the upload small. */
async function jpeg(image: Blob): Promise<Uint8Array | undefined> {
  try {
    const bitmap = await loadImage(image);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, 1024 / Math.max(longest, 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(bitmap, 0, 0, width, height);
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
    if (!blob) return undefined;
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return undefined;
  }
}

/** The picked photo, upright as the camera held it (EXIF orientation applied). */
async function loadImage(image: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(image, { imageOrientation: "from-image" });
    } catch {
      /* fall back to an <img> */
    }
  }
  const url = URL.createObjectURL(image);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Open Food Facts asked with the big print; only products whose own name and brand the package shows are kept. */
async function brandedProducts(app: AppState, reading: PackageLabel_Reading): Promise<FoodProduct[]> {
  let found: FoodProduct[] = [];
  for (const query of [reading.title, reading.printed]) {
    if (charCount(query) < 3) continue;
    const trimmed = prefixChars(query, 80);
    const outcome = await app.searchFood(trimmed);
    if (outcome.kind !== "failed") found = [...found, ...outcome.value];
    if (PackageLabel.products(found, { matching: reading.printed }).length > 0) break;
  }
  const seen = new Set<string>();
  return PackageLabel.products(found, { matching: reading.printed }).filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

function displayName(product: FoodProduct): string {
  const brand = product.brand;
  const unknown = brand === "" || brand === "Generiek" || brand === "Merk onbekend" || product.name.toLocaleLowerCase().includes(brand.toLocaleLowerCase());
  return unknown ? product.name : `${product.name} · ${brand}`;
}

function productRow(product: FoodProduct, grams: number, key: string | undefined, confidence: ScannedFood_Confidence = "high"): ScannedFood {
  const portion = FoodSearch.portion({ of: product, grams });
  return ScannedFood.make({ name: displayName(product), grams, calories: portion.calories, protein: portion.protein, carbs: portion.carbs, fat: portion.fat, confidence, key });
}

/**
 * The product a photo of a package shows, best evidence first: the barcode in
 * Open Food Facts, then the label's own nutrition table, then the name in big
 * print — matched to a common food or searched.
 */
async function packaged(app: AppState, looked: MealScanner_Look): Promise<{ food: ScannedFood; others: ScannedFood[] } | undefined> {
  const reading = PackageLabel.read(looked.text);
  const table = reading.tableFood;

  for (const code of looked.barcodes) {
    const outcome = await app.lookupBarcode(code);
    if (outcome.kind === "found") {
      const product = outcome.value;
      const grams = product.servingGrams ?? reading.nutrition?.servingGrams ?? table?.grams ?? 100;
      return { food: productRow(product.product, grams, table?.key), others: [] };
    }
  }

  // The product itself, found by the brand and name on the package.
  const branded = await brandedProducts(app, reading);
  const grams = reading.nutrition?.servingGrams ?? table?.grams ?? 100;
  const others = [
    ...branded.slice(1, 5).map((p) => productRow(p, grams, table?.key, "medium")),
    ...(table ? [MealRecognition_Food.scanned(table, { confidence: "low" })] : []),
  ];

  if (reading.nutrition) {
    // The label's own numbers are this exact product; the search only lends it its name.
    const name = branded[0] ? displayName(branded[0]) : reading.title === "" ? (table?.name ?? "Product from the label") : PackageLabel.displayName(reading.title);
    const food = PackageLabel_Nutrition.scanned(reading.nutrition, { name, grams });
    return {
      food: ScannedFood.make({ name: food.name, grams: food.grams, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, confidence: "high", key: table?.key }),
      others,
    };
  }
  if (branded[0]) return { food: productRow(branded[0], grams, table?.key, "medium"), others };
  if (table) return { food: MealRecognition_Food.scanned(table, { confidence: "medium" }), others: [] };
  return undefined;
}

/** `MealScanner.Look` — the print on a photo: text with where it sits, and any barcode. */
export interface MealScanner_Look {
  text: PackageLabel_Observation[];
  barcodes: string[];
}

/**
 * Apple's on-device image recognition, asked what is in a photo. On the web
 * only the barcode part exists (BarcodeDetector): there is no text
 * recognition and no image classification, so those come back empty.
 */
export const MealScanner = {
  async look(image: Blob): Promise<MealScanner_Look> {
    const look: MealScanner_Look = { text: [], barcodes: [] };
    const detector = barcodeDetector();
    if (!detector) return look;
    try {
      const bitmap = await loadImage(image);
      const codes = await detector.detect(bitmap);
      look.barcodes = [...new Set(codes.map((c) => c.rawValue).filter((v) => v.length > 0))];
    } catch {
      /* nothing readable */
    }
    return look;
  },

  async labels(_image: Blob): Promise<{ label: string; confidence: number }[]> {
    return [];
  },
};

// MARK: - Shared pieces

/**
 * Tally, the app's mascot, guiding the scan: a few bars with a face beside
 * one speech bubble that says what is happening and what Tally wants to know.
 */
function TallyGuide({ line, mood, jumps, onTap }: { line: string; mood: TallyMascot_Mood; jumps: number; onTap: () => void }) {
  return (
    <HStack alignment="top" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
      <div aria-hidden onClick={onTap} style={{ width: 52, height: 56, flexShrink: 0, display: "flex", alignItems: "flex-end", justifyContent: "flex-start", overflow: "visible", cursor: "pointer" }}>
        <TallyMascot done={3} goal={3} mood={mood} unit={12} jumps={jumps} />
      </div>
      <div onClick={onTap} aria-label={`Tally says: ${line}`} role="status" style={{ position: "relative", flex: "1 1 0", minWidth: 0, paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3 }}>
        {/* A rounded bubble with a small tail on the left, toward Tally. */}
        <svg aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
          <rect x={0} y={0} width="100%" height="100%" rx={16} fill={SL.Surface.raised2} />
          <path d="M2 16 L-8 28 L2 32 Z" fill={SL.Surface.raised2} />
          <rect x={0} y={0} width="100%" height="100%" rx={16} fill="none" stroke={SL.Surface.hairlineStrong} strokeWidth={1} />
          <path d="M2 16 L-8 28 L2 32 Z" fill="none" stroke={SL.Surface.hairlineStrong} strokeWidth={1} />
        </svg>
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary} style={{ position: "relative", display: "block" }}>
          {line}
        </Text>
      </div>
    </HStack>
  );
}

function ScanTopBar({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch", flexShrink: 0 }}>
      <VStack alignment="leading" spacing={2} style={{ flex: "0 1 auto", minWidth: 0 }}>
        <Text as="h2" {...slTitle()} color={SL.Ink.primary}>
          {title}
        </Text>
        <Text {...slMeta()} color={SL.Ink.secondary}>
          {subtitle}
        </Text>
      </VStack>
      <Spacer minLength={0} />
      <PressButton onPress={onClose} aria-label="Close" style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <SLGlyph name="close" size={16} fixed color={SL.Ink.primary} />
      </PressButton>
    </HStack>
  );
}

function ScanWorking({ text }: { text: string }) {
  return (
    <VStack spacing={SL.Space.s3} role="status">
      <svg aria-hidden width={32} height={32} viewBox="0 0 32 32" style={{ animation: "sl-scan-turn 0.9s linear infinite", overflow: "visible" }}>
        <circle cx={16} cy={16} r={16} fill="none" stroke={SL.Signal.action} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 16 * 0.7} ${2 * Math.PI * 16}`} />
      </svg>
      <Text {...slBody()} color={SL.Ink.secondary}>
        {text}
      </Text>
    </VStack>
  );
}

function ScanMessage({ symbol, title, text }: { symbol: string; title: string; text: string }) {
  return (
    <VStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", padding: SL.Space.s5 }}>
      <SFSymbol name={symbol} size={28} color={SL.Surface.mute} />
      <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
        {title}
      </Text>
      <Text {...slMeta()} color={SL.Ink.secondary} align="center">
        {text}
      </Text>
    </VStack>
  );
}

/** Grams, changed in steps of 10 (or set to the serving), the way a lifter thinks about a portion. */
export function GramsStepper({ grams, serving, compact = false }: { grams: Binding<number>; serving?: number; compact?: boolean }) {
  const shown = Math.trunc(rounded(grams.value));
  const stepButton = (symbol: string, label: string, action: () => void) => (
    <SLPress scale={0.9} onPress={action} aria-label={label} style={{ borderRadius: "50%", flexShrink: 0 }}>
      <div style={{ width: compact ? 34 : 40, height: compact ? 34 : 40, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
        <SFSymbol name={symbol} size={14} weight={700} color={SL.Ink.primary} />
      </div>
    </SLPress>
  );
  return (
    <HStack spacing={SL.Space.s2} role="group" aria-label={`Amount, ${shown} grams`} style={{ flex: "1 1 auto", minWidth: 0 }}>
      {stepButton("minus", "Less", () => grams.set(Math.max(5, grams.value - 10)))}
      <Text size={compact ? SL.TypeSize.body : SL.TypeSize.title} weight={SL.Weight.semibold} numerals color={SL.Ink.primary} align="center" style={{ minWidth: compact ? 64 : 88, ...slNumerals }}>
        {`${shown} g`}
      </Text>
      {stepButton("plus", "More", () => grams.set(grams.value + 10))}
      <Spacer minLength={0} />
      {serving !== undefined && serving > 0 && serving !== grams.value && (
        <Pressable
          onPress={() => grams.set(serving)}
          style={{ ...slFont(SL.TypeSize.meta, SL.Weight.semibold), color: SL.Ink.secondary, paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: 34, borderRadius: SL.Radius.pill, background: SL.Surface.raised2, flexShrink: 0, whiteSpace: "nowrap" }}
        >
          {`1 serving · ${Math.trunc(serving)} g`}
        </Pressable>
      )}
    </HStack>
  );
}

/** "248 kcal · P 46 · C 0 · F 5" as one quiet line of numbers. */
export function MacroLine({ calories, protein, carbs, fat }: { calories: number; protein: number; carbs: number; fat: number }) {
  const app = useApp();
  const figure = (value: string, label: string, strong = false) => (
    <VStack key={label} alignment="leading" spacing={0}>
      <Text size={strong ? SL.TypeSize.title : SL.TypeSize.lead} weight={SL.Weight.semibold} numerals color={SL.Ink.primary}>
        {value}
      </Text>
      <Text {...slMeta()} color={SL.Ink.secondary}>
        {label === "kcal" ? label : `g ${label}`}
      </Text>
    </VStack>
  );
  return (
    <HStack spacing={SL.Space.s4} style={{ alignSelf: "flex-start" }}>
      {figure(NumberDisplay.whole(app.display, calories), "kcal", true)}
      {figure(NumberDisplay.whole(app.display, protein), "protein")}
      {figure(NumberDisplay.whole(app.display, carbs), "carbs")}
      {figure(NumberDisplay.whole(app.display, fat), "fat")}
    </HStack>
  );
}
