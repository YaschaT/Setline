/**
 * Static-preview shim.
 *
 * Vercel serves this build with no backend, so /api/* has nowhere to go.
 * The app already degrades to offline when cloud sync fails, and it stores
 * everything in localStorage — that part is genuinely the real app. Only the
 * auth endpoints are answered here so the login flow stays reviewable.
 *
 * Demo rules: code 000000 is rejected, any other six digits are accepted,
 * passkey is unavailable (there is no server to verify a signature).
 */
export function installPreviewAuth(): void {
  const realFetch = globalThis.fetch.bind(globalThis);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (!url.includes("/api/auth/")) return realFetch(input, init);

    await new Promise((resolve) => setTimeout(resolve, 700));

    // A viewer-local session so the login → app flow works without a server.
    const SESSION_KEY = "youfit-preview-session";
    const readSession = () => {
      try {
        return window.localStorage.getItem(SESSION_KEY);
      } catch {
        return null;
      }
    };
    const writeSession = (email: string | null) => {
      try {
        if (email) window.localStorage.setItem(SESSION_KEY, email);
        else window.localStorage.removeItem(SESSION_KEY);
      } catch {
        // Private browsing: the preview simply stays signed out.
      }
    };

    if (url.includes("/api/auth/session")) {
      const email = readSession();
      return email
        ? json({ authenticated: true, user: { email, displayName: email } })
        : json({ authenticated: false }, 401);
    }
    if (url.includes("/api/auth/signout")) {
      writeSession(null);
      return json({ signedOut: true });
    }
    if (url.includes("/api/auth/google/start")) {
      writeSession("demo@youfit.app");
      return json({ authenticated: true });
    }
    if (url.includes("/api/auth/code/request")) {
      return json({ sent: true, expiresInSeconds: 600 });
    }
    if (url.includes("/api/auth/code/verify")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { code?: string };
      if (body.code === "000000") {
        return json({ error: "INVALID_CODE", message: "Deze code is niet geldig of verlopen." }, 400);
      }
      writeSession(JSON.parse(String(init?.body ?? "{}")).email ?? "demo@youfit.app");
      return json({ authenticated: true });
    }
    return json(
      {
        error: "DEMO",
        message: "Face ID werkt alleen in de echte app met server. Gebruik een e-mailcode.",
      },
      400,
    );
  };
}

/**
 * The Google button is a plain link to a server route, so fetch interception
 * never sees it. On the static preview, catch the click instead.
 */
export function installPreviewGoogleLink(): void {
  document.addEventListener(
    "click",
    (event) => {
      const target = (event.target as HTMLElement | null)?.closest?.(
        'a[href="/api/auth/google/start"]',
      );
      if (!target) return;
      event.preventDefault();
      try {
        window.localStorage.setItem("youfit-preview-session", "demo@youfit.app");
      } catch {
        // Preview stays signed out in private browsing.
      }
      window.location.href = "/";
    },
    true,
  );
}
