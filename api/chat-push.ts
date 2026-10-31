import webpush from "web-push";

/**
 * Chat notifications. The database calls this when a message lands (the
 * `chat_push` trigger in db/supabase/social.sql), with the browsers to tell
 * and the shared secret; this signs a push for each with the VAPID key and
 * hands it to that browser's push service. Node, not edge: web-push needs
 * Node's crypto.
 */

type Target = { endpoint: string; p256dh: string; auth: string };
type Message = {
  to?: Target[];
  sender?: string;
  body?: string;
  photo?: boolean;
  kind?: "friends" | "direct" | "room";
  room?: string | null;
  roomID?: string | null;
};

// Node resolves imports as written, so this function keeps its own helper
// rather than reaching into ./v/_shared the way the edge functions do.
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

const PUBLIC_KEY = "BCksi0To8y-PNVd8vdshLaMgCA-zaxROL-JxYsbtu7zksJm_ZdWis2AV1A-3c4W_NJLtp7N7yCfjA7xrcCeETKE";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CHAT_PUSH_SECRET;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!secret || !privateKey) return json({ error: "NOT_CONFIGURED" }, 503);
  if (request.headers.get("x-chat-push-secret") !== secret) return json({ error: "FORBIDDEN" }, 403);

  let message: Message;
  try {
    message = (await request.json()) as Message;
  } catch {
    return json({ error: "BAD_REQUEST" }, 400);
  }
  const targets = (message.to ?? []).filter((t) => t && t.endpoint && t.p256dh && t.auth).slice(0, 500);
  if (targets.length === 0) return json({ sent: 0 });

  const sender = message.sender || "A friend";
  const title = message.kind === "room" && message.room ? `${sender} in ${message.room}` : message.kind === "friends" ? `${sender} · Friends` : sender;
  const words = (message.body ?? "").trim();
  const body = words ? (words.length > 140 ? `${words.slice(0, 139)}…` : words) : message.photo ? "Sent a photo" : "New message";
  const payload = JSON.stringify({ title, body, tag: `chat-${message.roomID ?? "friends"}`, url: "/" });

  webpush.setVapidDetails("https://youfit-app.vercel.app", PUBLIC_KEY, privateKey);
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    targets.map(async (t) => {
      try {
        await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, { TTL: 3600, urgency: "high" });
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(t.endpoint);
      }
    }),
  );

  // The push service has forgotten these browsers; so does the database.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (gone.length > 0 && url && anonKey) {
    await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/forget_push_subscriptions`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_secret: secret, p_endpoints: gone }),
    }).catch(() => undefined);
  }
  return json({ sent, gone: gone.length });
}
