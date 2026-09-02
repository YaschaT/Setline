import { getCurrentUser } from "@/app/auth/current-user";
import { getUserState, upsertUserState } from "@/db/user-state";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ authenticated: false }, 401);

    const row = await getUserState(user.email);
    let state: unknown = null;
    if (row?.state_json) {
      try {
        state = JSON.parse(row.state_json);
      } catch {
        state = null;
      }
    }

    return json({
      authenticated: true,
      user: {
        email: user.email,
        displayName: user.displayName,
      },
      state,
      updatedAt: row?.updated_at ?? null,
    });
  } catch (error) {
    return json(
      { error: "STATE_READ_ERROR", message: error instanceof Error ? error.message : "Clouddata kon niet worden geladen." },
      500,
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ authenticated: false }, 401);

    const payload = (await request.json()) as { state?: unknown };
    if (!payload.state || typeof payload.state !== "object" || Array.isArray(payload.state)) {
      return json({ error: "INVALID_STATE", message: "Ongeldige trainingsdata." }, 400);
    }

    const stateJson = JSON.stringify(payload.state);
    if (stateJson.length > 1_500_000) {
      return json({ error: "STATE_TOO_LARGE", message: "Je trainingsdata is te groot om te synchroniseren." }, 413);
    }

    const updatedAt = new Date().toISOString();
    await upsertUserState(user.email, stateJson, updatedAt);
    return json({ saved: true, updatedAt });
  } catch (error) {
    return json(
      { error: "STATE_WRITE_ERROR", message: error instanceof Error ? error.message : "Clouddata kon niet worden opgeslagen." },
      500,
    );
  }
}
