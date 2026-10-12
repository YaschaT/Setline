/**
 * Reading a meal the way a person would: a vision model looks at the photo
 * (and whatever was typed), names every food with its grams and macros, and
 * asks one question when something it can't see changes the numbers — the
 * sauce, the oil, the portion.
 *
 * Gemini Flash does the looking, reached one of two ways: Vercel's AI
 * Gateway, which this project signs in to by itself (its own OIDC token, free
 * monthly credit, no key to keep), or Google directly when a GEMINI_API_KEY
 * is set. The phone only ever talks to this server.
 */

export type ScanConfidence = "high" | "medium" | "low";

export type ScanItem = {
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: ScanConfidence;
};

export type ScanQuestion = { text: string; options: string[] };

export type ScanAnswer = {
  /** One short line for Tally to say, in the app's voice. */
  say: string;
  items: ScanItem[];
  question: ScanQuestion | null;
};

export type ScanTurn = { role: "user" | "assistant"; text: string };

export type ScanRequest = {
  /** A JPEG, base64, no data: prefix. */
  image?: string;
  text?: string;
  /** The plate as it stands, when this is a follow-up. */
  plate?: ScanItem[];
  /** Earlier turns of this scan: Tally's questions and the answers. */
  turns?: ScanTurn[];
};

export type ScanOutcome = { status: number; body: ScanAnswer | { error: string; message: string } };

const LARGEST_IMAGE = 4_000_000; // base64 characters, ~3 MB of JPEG

export const SYSTEM_PROMPT = `You are Tally, the nutrition helper in the fitness app Setline.
You read a photo of a meal, a drink, a packaged product or a nutrition label, and/or a line the user typed, and return what they ate.

Rules:
- Name each separate food or drink on its own row, as specifically as the photo allows ("Spaghetti bolognese", "Grilled chicken breast", "Coca-Cola Zero 330 ml"). Recognise regional dishes, including Belgian and Dutch ones (stoofvlees, vol-au-vent, stoemp, frietjes, waterzooi, boulets).
- For a packaged product, read the brand and product name from the package and use the label's nutrition values when they are visible. A typical serving (one scoop of protein powder is about 30 g) unless the user says otherwise.
- Estimate grams from what is visible: plate size, cutlery, hands and packaging are the scale. Calories and macros are for those grams, from standard nutrition data.
- confidence: "high" when you can clearly see or read it, "medium" when the dish is clear but the amount or recipe is a guess, "low" when you are unsure what it is.
- Ask at most ONE question, only when the answer would change the calories noticeably and you cannot see it (cooking oil or butter, the sauce, the drink, the portion, whether it was whole or half). Give 2 to 4 short tappable options. No question when the plate is clear.
- When the user answers a question or adds or corrects something, return the WHOLE updated plate, not only the change.
- If the photo shows no food, return no items and say so in "say".
- "say": one short, friendly sentence in English, at most 20 words, about what you see. No numbers, no lists.
- Never invent items the user did not eat. Respond with JSON only.`;

export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    say: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          grams: { type: "NUMBER" },
          calories: { type: "NUMBER" },
          protein: { type: "NUMBER" },
          carbs: { type: "NUMBER" },
          fat: { type: "NUMBER" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["name", "grams", "calories", "protein", "carbs", "fat", "confidence"],
      },
    },
    question: {
      type: "OBJECT",
      nullable: true,
      properties: {
        text: { type: "STRING" },
        options: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["text", "options"],
    },
  },
  required: ["say", "items"],
} as const;

export function modelName(env: Record<string, string | undefined> = process.env) {
  return env.GEMINI_MODEL?.trim() || "gemini-flash-latest";
}

export function gatewayModel(env: Record<string, string | undefined> = process.env) {
  return env.MEAL_SCAN_MODEL?.trim() || "google/gemini-3.8-flash";
}

/** How the scan reaches the model; nil when it can't. */
export type ScanProvider =
  | { kind: "gateway"; token: string; model: string }
  | { kind: "google"; apiKey: string; model: string };

/**
 * A Google key wins when one is set; otherwise the gateway, with its own
 * key or the project's OIDC token (on Vercel, a request header).
 */
export function providerFor(
  env: Record<string, string | undefined>,
  oidcHeader: string | null,
): ScanProvider | null {
  if (env.GEMINI_API_KEY) return { kind: "google", apiKey: env.GEMINI_API_KEY, model: modelName(env) };
  const token = env.AI_GATEWAY_API_KEY || oidcHeader || env.VERCEL_OIDC_TOKEN;
  return token ? { kind: "gateway", token, model: gatewayModel(env) } : null;
}

/** The same request in the gateway's OpenAI-style shape. */
export function gatewayBody(request: ScanRequest, model: string) {
  const google = geminiBody(request);
  const text = (google.contents[0].parts.find((part) => "text" in part) as { text: string }).text;
  const content: Array<Record<string, unknown>> = [];
  if (request.image) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${request.image}` } });
  content.push({ type: "text", text });
  return {
    model,
    temperature: 0.2,
    reasoning_effort: "low",
    response_format: {
      type: "json_schema",
      json_schema: { name: "meal_scan", strict: false, schema: openSchema(RESPONSE_SCHEMA) },
    },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
  };
}

/** Gemini's schema dialect (OBJECT, nullable) in plain JSON Schema. */
function openSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(openSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  const source = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(source)) {
    if (key === "nullable") continue;
    if (key === "type" && typeof value === "string") {
      const lower = value.toLowerCase();
      out.type = source.nullable ? [lower, "null"] : lower;
      continue;
    }
    out[key] = openSchema(value);
  }
  return out;
}

/** The request Gemini gets: the photo first, then what was said. */
export function geminiBody(request: ScanRequest) {
  const parts: Array<Record<string, unknown>> = [];
  if (request.image) parts.push({ inline_data: { mime_type: "image/jpeg", data: request.image } });

  const lines: string[] = [];
  if (request.plate?.length) lines.push(`The plate so far (JSON): ${JSON.stringify(request.plate)}`);
  for (const turn of request.turns ?? []) {
    lines.push(`${turn.role === "assistant" ? "Tally" : "User"}: ${turn.text}`);
  }
  if (request.text?.trim()) lines.push(`User: ${request.text.trim()}`);
  if (lines.length === 0) lines.push("What is in this photo?");
  parts.push({ text: lines.join("\n") });

  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };
}

function number(value: unknown, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(max, Math.max(0, Math.round(parsed * 10) / 10));
}

/** Gemini's answer, checked: nothing nameless, nothing impossible. Reads
 * Google's shape and the gateway's alike. */
export function parseAnswer(raw: unknown): ScanAnswer | null {
  const google = (raw as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    ?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  const gateway = (raw as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  const text = google || (typeof gateway === "string" ? gateway : "");
  if (!text) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
  const items = (Array.isArray(data.items) ? data.items : [])
    .map((item: Record<string, unknown>): ScanItem | null => {
      const name = typeof item?.name === "string" ? item.name.trim().slice(0, 80) : "";
      const grams = number(item?.grams, 3000);
      if (!name || grams <= 0) return null;
      const confidence = ["high", "medium", "low"].includes(item.confidence as string)
        ? (item.confidence as ScanConfidence)
        : "medium";
      return {
        name,
        grams: Math.round(grams),
        calories: Math.round(number(item.calories, 6000)),
        protein: number(item.protein, 500),
        carbs: number(item.carbs, 1000),
        fat: number(item.fat, 500),
        confidence,
      };
    })
    .filter((item): item is ScanItem => Boolean(item))
    .slice(0, 12);

  const rawQuestion = data.question as { text?: unknown; options?: unknown } | null | undefined;
  const options = Array.isArray(rawQuestion?.options)
    ? rawQuestion.options.filter((option): option is string => typeof option === "string" && option.trim() !== "")
        .map((option) => option.trim().slice(0, 40)).slice(0, 4)
    : [];
  const question = typeof rawQuestion?.text === "string" && rawQuestion.text.trim() && options.length >= 2
    ? { text: rawQuestion.text.trim().slice(0, 140), options }
    : null;

  const say = typeof data.say === "string" && data.say.trim()
    ? data.say.trim().slice(0, 160)
    : items.length ? "Here's what I see." : "I couldn't find food in that photo.";
  return { say, items, question };
}

export function validRequest(body: unknown): ScanRequest | null {
  if (!body || typeof body !== "object") return null;
  const request = body as ScanRequest;
  const image = typeof request.image === "string" ? request.image.replace(/^data:image\/\w+;base64,/, "") : undefined;
  const text = typeof request.text === "string" ? request.text.slice(0, 500) : undefined;
  if (!image && !text?.trim()) return null;
  if (image && (image.length > LARGEST_IMAGE || !/^[A-Za-z0-9+/=\s]+$/.test(image.slice(0, 200)))) return null;
  const turns = Array.isArray(request.turns)
    ? request.turns
        .filter((turn) => (turn?.role === "user" || turn?.role === "assistant") && typeof turn.text === "string")
        .slice(-8)
        .map((turn) => ({ role: turn.role, text: turn.text.slice(0, 300) }))
    : undefined;
  const plate = Array.isArray(request.plate) ? request.plate.slice(0, 12) : undefined;
  return { image, text, turns, plate };
}

/** The whole scan, minus authorisation: the caller hands in its own fetch. */
export async function scanMeal(
  request: ScanRequest,
  provider: ScanProvider | null,
  fetchImpl: typeof fetch = fetch,
): Promise<ScanOutcome> {
  if (!provider) {
    return { status: 503, body: { error: "SCAN_NOT_CONFIGURED", message: "Photo recognition isn't set up yet." } };
  }
  try {
    const response = provider.kind === "google"
      ? await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": provider.apiKey },
            body: JSON.stringify(geminiBody(request)),
            signal: AbortSignal.timeout(25_000),
          },
        )
      : await fetchImpl("https://ai-gateway.vercel.sh/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.token}` },
          body: JSON.stringify(gatewayBody(request, provider.model)),
          signal: AbortSignal.timeout(25_000),
        });
    if (response.status === 429) {
      return { status: 429, body: { error: "SCAN_BUSY", message: "Tally is busy. Try again in a minute." } };
    }
    if (!response.ok) {
      return { status: 502, body: { error: "SCAN_FAILED", message: `The recogniser answered ${response.status}.` } };
    }
    const answer = parseAnswer(await response.json());
    if (!answer) return { status: 502, body: { error: "SCAN_UNREADABLE", message: "The answer couldn't be read." } };
    return { status: 200, body: answer };
  } catch {
    return { status: 504, body: { error: "SCAN_TIMEOUT", message: "No answer in time. Try again." } };
  }
}
