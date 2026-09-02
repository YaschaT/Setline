import { env } from "cloudflare:workers";

import { getCurrentUser } from "@/app/auth/current-user";

export const dynamic = "force-dynamic";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type CoachContext = {
  targets?: Record<string, number>;
  metrics?: unknown[];
  sessions?: unknown[];
  plan?: unknown[];
  alternatives?: unknown[];
};

function runtimeValue(key: string) {
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  return runtimeEnv[key] ?? process.env[key];
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function modelConfig() {
  return {
    model: runtimeValue("OPENAI_MODEL") ?? "gpt-5.6",
    mode: runtimeValue("OPENAI_REASONING_MODE") ?? "pro",
    effort: runtimeValue("OPENAI_REASONING_EFFORT") ?? "max",
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ configured: false, authenticated: false }, 401);
  const config = modelConfig();
  return json({
    configured: Boolean(runtimeValue("OPENAI_API_KEY")),
    authenticated: true,
    ...config,
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return json({ error: "UNAUTHENTICATED", message: "Log in om de AI-coach te gebruiken." }, 401);
  }

  const apiKey = runtimeValue("OPENAI_API_KEY");
  if (!apiKey) {
    return json(
      {
        error: "AI_NOT_CONFIGURED",
        message:
          "De AI-chat is ingebouwd, maar de server heeft nog geen OpenAI API-sleutel.",
      },
      503,
    );
  }

  let body: {
    message?: string;
    history?: ChatTurn[];
    context?: CoachContext;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "INVALID_JSON", message: "Ongeldige aanvraag." }, 400);
  }

  const message = body.message?.trim().slice(0, 2_000);
  if (!message) {
    return json({ error: "EMPTY_MESSAGE", message: "Stel eerst een vraag." }, 400);
  }

  const history = (body.history ?? [])
    .filter(
      (turn): turn is ChatTurn =>
        (turn.role === "user" || turn.role === "assistant") &&
        typeof turn.content === "string",
    )
    .slice(-8)
    .map((turn) => ({ ...turn, content: turn.content.slice(0, 2_000) }));

  const context = JSON.stringify(body.context ?? {}).slice(0, 14_000);
  const config = modelConfig();
  const input = [
    ...history.map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    {
      role: "user",
      content: `Vraag: ${message}\n\nActuele appdata (JSON): ${context}`,
    },
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      store: false,
      reasoning: { mode: config.mode, effort: config.effort },
      max_output_tokens: 5_000,
      instructions:
        "Je bent Yascha's kritische Nederlandstalige fitness- en voedingscoach. Zijn doel is recompositie: sterker en gespierder worden met een stabiele of langzaam dalende taille. Wees concreet, evidence-based en compact. Baseer advies uitsluitend op de meegegeven trainings-, lichaams-, herstel- en voedingsdata en benoem ontbrekende informatie eerlijk. Sessies met sessionType recovery of dayId rest zijn rustdagen en tellen niet als krachttraining; gebruik hun slaap-, stijfheids-, energie- en activiteitsdata om hersteladvies te nuanceren. Maak van een rustdag geen verplichte workout. Gebruik RIR, rep-ranges en dubbele progressie. Verhoog nooit gewicht na één toevallig sterke set: eis twee consistente sessies, tenzij de gebruiker anders vraagt. Voor zijn strikte dumbbellcurl geldt specifiek: 18 kg pas verhogen nadat 10 technisch strikte herhalingen in twee opeenvolgende sessies zijn gelogd. Gebruik bij vervangende oefeningen eerst de meegegeven alternatives en maak expliciet onderscheid tussen hetzelfde bewegingspatroon en alleen hetzelfde spierdoel; kilo's tussen varianten zijn niet 1-op-1 vergelijkbaar. Voedingswaarden uit productdatabases kunnen afwijken van het etiket; behandel ze als trackingdata, niet als medische waarheid. Geef geen diagnose; adviseer bij scherpe of aanhoudende pijn professioneel onderzoek. Stel alleen planChanges voor wanneer de gebruiker expliciet vraagt het schema aan te passen. Gebruik dan uitsluitend bestaande exerciseId-waarden uit de appdata, maximaal drie wijzigingen, en leg elke wijziging kort uit. Wijzig niets automatisch.",
      input,
      text: {
        format: {
          type: "json_schema",
          name: "fitness_coach_answer",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              reply: { type: "string" },
              planChanges: {
                type: "array",
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    exerciseId: { type: "string" },
                    field: {
                      type: "string",
                      enum: ["name", "prescription", "load", "rest"],
                    },
                    value: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["exerciseId", "field", "value", "reason"],
                },
              },
            },
            required: ["reply", "planChanges"],
          },
        },
      },
    }),
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const apiError = payload.error as { message?: string } | undefined;
    return json(
      {
        error: "OPENAI_ERROR",
        message: apiError?.message ?? "De AI-coach kon niet antwoorden.",
      },
      response.status >= 500 ? 502 : response.status,
    );
  }

  const outputText =
    typeof payload.output_text === "string"
      ? payload.output_text
      : ((payload.output as Array<{ content?: Array<{ type?: string; text?: string }> }> | undefined)
          ?.flatMap((item) => item.content ?? [])
          .find((item) => item.type === "output_text")?.text ?? "");

  try {
    const parsed = JSON.parse(outputText) as {
      reply: string;
      planChanges: unknown[];
    };
    return json(parsed);
  } catch {
    return json({ reply: outputText || "Geen antwoord ontvangen.", planChanges: [] });
  }
}
