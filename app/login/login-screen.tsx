"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import {
  Check,
  CircleAlert,
  LoaderCircle,
  Mail,
  ScanFace,
  ShieldCheck,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Auth calls.
 *
 * The one-time-code path is live: it hits /api/auth/code/*, which writes to
 * D1 and sets an HttpOnly signed session cookie. Passkey is still simulated
 * until a credential is enrolled — see unlockWithPasskey below.
 * ------------------------------------------------------------------ */

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    // Fall through to the status-based message below.
  }

  if (!response.ok) {
    const message = typeof payload.message === "string" ? payload.message : null;
    throw new Error(message ?? `Er ging iets mis (${response.status}).`);
  }
  return payload;
}

type RequestOutcome = "code" | "link";

/** Two backends: D1 stores a six-digit code; the serverless deployment sends
 *  a signed magic link. The response says which happened. */
async function requestCode(email: string): Promise<RequestOutcome> {
  try {
    const payload = await postJson("/api/auth/code/request", { email });
    return payload.mode === "link" ? "link" : "code";
  } catch (cause) {
    // Fall through to the magic-link endpoint when the code route is absent.
    const payload = await postJson("/api/auth/email/request", { email });
    if (payload.mode === "link") return "link";
    throw cause;
  }
}

async function verifyCode(email: string, code: string): Promise<void> {
  await postJson("/api/auth/code/verify", { email, code });
}

/** Remembers that this browser enrolled a passkey, so we lead with Face ID. */
const PASSKEY_HINT = "yascha-passkey-enrolled";

function hasLocalPasskey(): boolean {
  try {
    return window.localStorage.getItem(PASSKEY_HINT) === "1";
  } catch {
    return false;
  }
}

function rememberLocalPasskey(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(PASSKEY_HINT, "1");
    else window.localStorage.removeItem(PASSKEY_HINT);
  } catch {
    // Private browsing: the hint is a convenience, not state we depend on.
  }
}

const passkeyListeners = new Set<() => void>();
let passkeyOverride: boolean | null = null;

function subscribePasskey(onChange: () => void): () => void {
  passkeyListeners.add(onChange);
  return () => passkeyListeners.delete(onChange);
}

function readPasskeyReady(): boolean {
  if (passkeyOverride !== null) return passkeyOverride;
  return browserSupportsWebAuthn() && hasLocalPasskey();
}

/** Server render has no browser to ask; it shows the neutral state. */
function readPasskeyReadyOnServer(): boolean | null {
  return null;
}

function setPasskeyReady(value: boolean): void {
  passkeyOverride = value;
  for (const listener of passkeyListeners) listener();
}

async function unlockWithPasskey(): Promise<void> {
  const { challengeId, options } = (await postJson("/api/auth/passkey/options", {})) as {
    challengeId: string;
    options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
  };
  const response = await startAuthentication({ optionsJSON: options });
  await postJson("/api/auth/passkey/verify", { challengeId, response });
}

async function enrollPasskey(): Promise<void> {
  const { challengeId, options } = (await postJson("/api/auth/passkey/register/options", {})) as {
    challengeId: string;
    options: Parameters<typeof startRegistration>[0]["optionsJSON"];
  };
  const response = await startRegistration({ optionsJSON: options });
  await postJson("/api/auth/passkey/register/verify", { challengeId, response });
  rememberLocalPasskey(true);
}

const RESEND_SECONDS = 30;
const CODE_LENGTH = 6;

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 17, height: 17 }}>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.1 7.1 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z" />
    </svg>
  );
}

type Step = "gate" | "email" | "code" | "sent" | "enroll" | "done";

export function LoginScreen() {
  const [step, setStep] = useState<Step>("gate");
  const [enrolling, setEnrolling] = useState(false);
  // Client-only fact, read without a setState-in-effect.
  const passkeyReady = useSyncExternalStore(
    subscribePasskey,
    readPasskeyReady,
    readPasskeyReadyOnServer,
  );
  const [scanning, setScanning] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  // An error handed back by a redirect (a failed or unconfigured Google
  // sign-in). Read once at mount and cleared from the URL so a refresh does
  // not resurrect a stale message.
  const [error, setError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const handedBack = new URLSearchParams(window.location.search).get("error");
    if (handedBack) window.history.replaceState({}, "", window.location.pathname);
    return handedBack;
  });
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [cooldown, setCooldown] = useState(0);
  const [googleReady, setGoogleReady] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const cellRefs = useRef<Array<HTMLInputElement | null>>([]);

  const code = useMemo(() => digits.join(""), [digits]);
  const remaining = CODE_LENGTH - code.length;
  const busy = scanning || sending || verifying || enrolling;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/methods", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { google: false }))
      .then((methods: { google?: boolean }) => {
        if (!cancelled) setGoogleReady(Boolean(methods.google));
      })
      .catch(() => {
        if (!cancelled) setGoogleReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === "email") emailRef.current?.focus();
    if (step === "code") cellRefs.current[0]?.focus();
  }, [step]);

  const handlePasskey = useCallback(async () => {
    setError(null);
    setScanning(true);
    try {
      await unlockWithPasskey();
      setStep("done");
      location.href = "/";
    } catch (cause) {
      const aborted = cause instanceof Error && /NotAllowed|abort/i.test(cause.name + cause.message);
      setError(
        aborted
          ? "Face ID is afgebroken. Probeer opnieuw of gebruik een e-mailcode."
          : cause instanceof Error
            ? cause.message
            : "Face ID is niet gelukt.",
      );
      // The credential is gone server-side; stop leading with Face ID.
      if (!aborted) {
        rememberLocalPasskey(false);
        setPasskeyReady(false);
      }
    } finally {
      setScanning(false);
    }
  }, []);

  const sendCode = useCallback(async (address: string) => {
    setError(null);
    setSending(true);
    try {
      const outcome = await requestCode(address.trim());
      setDigits(Array(CODE_LENGTH).fill(""));
      setCooldown(RESEND_SECONDS);
      setStep(outcome === "link" ? "sent" : "code");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Versturen is mislukt.");
    } finally {
      setSending(false);
    }
  }, []);

  const submitCode = useCallback(async (value: string) => {
    setError(null);
    setVerifying(true);
    try {
      await verifyCode(email, value);
      if (browserSupportsWebAuthn() && !hasLocalPasskey()) {
        setStep("enroll");
      } else {
        setStep("done");
        location.href = "/";
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verifiëren is mislukt.");
      setDigits(Array(CODE_LENGTH).fill(""));
      cellRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }, [email]);

  const handleCell = useCallback(
    (index: number, raw: string) => {
      const clean = raw.replace(/\D/g, "");
      const next = [...digits];
      if (!clean) {
        next[index] = "";
        setDigits(next);
        return;
      }
      // Handles paste and iOS one-time-code autofill in a single path.
      for (let offset = 0; offset < clean.length && index + offset < CODE_LENGTH; offset += 1) {
        next[index + offset] = clean[offset];
      }
      setDigits(next);
      const joined = next.join("");
      if (joined.length === CODE_LENGTH && !next.includes("")) {
        void submitCode(joined);
        return;
      }
      cellRefs.current[Math.min(index + clean.length, CODE_LENGTH - 1)]?.focus();
    },
    [digits, submitCode],
  );

  const handleCellKey = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace" && !digits[index] && index > 0) {
        event.preventDefault();
        const next = [...digits];
        next[index - 1] = "";
        setDigits(next);
        cellRefs.current[index - 1]?.focus();
      }
      if (event.key === "ArrowLeft" && index > 0) cellRefs.current[index - 1]?.focus();
      if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) cellRefs.current[index + 1]?.focus();
    },
    [digits],
  );

  const handleEnroll = useCallback(async () => {
    setError(null);
    setEnrolling(true);
    try {
      await enrollPasskey();
      location.href = "/";
    } catch (cause) {
      const aborted = cause instanceof Error && /NotAllowed|abort/i.test(cause.name + cause.message);
      setError(
        aborted
          ? "Niet ingesteld. Je kan dit later altijd nog doen."
          : cause instanceof Error
            ? cause.message
            : "Face ID instellen is niet gelukt.",
      );
    } finally {
      setEnrolling(false);
    }
  }, []);

  const headline =
    step === "sent" ? "Check je mail."
      : step === "enroll" ? "Sneller de volgende keer?"
      : step === "done" ? "Je bent binnen."
      : step === "code" ? "Voer je code in."
      : step === "email" ? "Waar sturen we hem heen?"
      : "Zwaarder dan vorige keer.";

  return (
    <main className="gate">
      <div className="gate-hairline" aria-hidden="true" />
      <div className="gate-ambient" aria-hidden="true">
        <span /><span /><span />
      </div>

      <svg className="gate-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path d="M32 31V51" stroke="#72EFD0" strokeWidth="9" strokeLinecap="round" />
        <path
          d="M14 14C18 24 24 30 32 35C40 30 46 24 50 14"
          stroke="#C8FF66"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="gate-inner">
        <span className="gate-wordmark">Yascha Training</span>

        <div className="gate-message">
          <h1 className="gate-headline">{headline}</h1>

          {step === "sent" ? (
            <p className="gate-sub">
              We stuurden een aanmeldlink naar <b>{email}</b>. Hij blijft 15 minuten geldig.
            </p>
          ) : step === "enroll" ? (
            <p className="gate-sub">
              Zet Face ID aan op dit toestel, dan hoef je nooit meer een code op te vragen.
            </p>
          ) : step === "gate" ? (
            <p className="gate-sub">Dat is het hele plan. Ontgrendel en pak verder waar je stopte.</p>
          ) : step === "email" ? (
            <p className="gate-sub">Je krijgt een code van 6 cijfers. Geen wachtwoord nodig.</p>
          ) : step === "code" ? (
            <p className="gate-sub">
              We stuurden 6 cijfers naar <b>{email}</b>. Hij blijft 10 minuten geldig.
            </p>
          ) : (
            <p className="gate-sub">Je gegevens worden nu gesynchroniseerd.</p>
          )}

          {error ? (
            <p className="gate-error" role="alert">
              <CircleAlert aria-hidden="true" />
              {error}
            </p>
          ) : null}
        </div>

        <div className="gate-actions">
          {step === "sent" ? (
            <div className="gate-alts">
              <button
                type="button"
                className="gate-alt"
                disabled={cooldown > 0 || sending}
                onClick={() => void sendCode(email)}
              >
                {cooldown > 0 ? `Opnieuw over ${cooldown}s` : "Stuur opnieuw"}
              </button>
              <span className="gate-alt-rule" aria-hidden="true" />
              <button
                type="button"
                className="gate-alt gate-alt-quiet"
                onClick={() => { setStep("gate"); setError(null); }}
              >
                Ander adres
              </button>
            </div>
          ) : step === "enroll" ? (
            <>
              <button
                type="button"
                className="gate-passkey"
                onClick={() => void handleEnroll()}
                disabled={enrolling}
              >
                <span className="gate-scanner">
                  {enrolling ? <LoaderCircle className="gate-spin" aria-hidden="true" /> : <ScanFace aria-hidden="true" />}
                </span>
                <span className="gate-passkey-copy">
                  <strong>{enrolling ? "Instellen…" : "Zet Face ID aan"}</strong>
                  <small>Eén keer instellen, daarna één blik</small>
                </span>
              </button>
              <div className="gate-alts">
                <button
                  type="button"
                  className="gate-alt gate-alt-quiet"
                  onClick={() => { location.href = "/"; }}
                  disabled={enrolling}
                >
                  Later, ga naar mijn dashboard
                </button>
              </div>
            </>
          ) : step === "done" ? (
            <>
              <div className="gate-done-mark"><Check aria-hidden="true" /></div>
              <button type="button" className="gate-submit" onClick={() => { location.href = "/"; }}>
                Ga naar je dashboard
              </button>
            </>
          ) : step === "code" ? (
            <>
              <div className="gate-code" data-error={error ? "true" : "false"}>
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(node) => { cellRefs.current[index] = node; }}
                    value={digit}
                    onChange={(event) => handleCell(index, event.target.value)}
                    onKeyDown={(event) => handleCellKey(index, event)}
                    onFocus={(event) => event.target.select()}
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={CODE_LENGTH}
                    disabled={verifying}
                    data-filled={digit ? "true" : "false"}
                    aria-label={`Cijfer ${index + 1} van ${CODE_LENGTH}`}
                  />
                ))}
              </div>
              <div className="gate-code-meta">
                <span aria-live="polite">
                  {verifying ? "Code controleren…" : remaining === 1 ? "Nog 1 cijfer" : `Nog ${remaining} cijfers`}
                </span>
                <button
                  type="button"
                  className="gate-resend"
                  disabled={cooldown > 0 || sending}
                  onClick={() => void sendCode(email)}
                >
                  {cooldown > 0 ? `Opnieuw over ${cooldown}s` : "Stuur opnieuw"}
                </button>
              </div>
              <div className="gate-alts">
                <button type="button" className="gate-alt" onClick={() => { setStep("email"); setError(null); }}>
                  Ander e-mailadres
                </button>
                <span className="gate-alt-rule" aria-hidden="true" />
                <button type="button" className="gate-alt gate-alt-quiet" onClick={() => { setStep("gate"); setError(null); }}>
                  Terug naar Face ID
                </button>
              </div>
            </>
          ) : step === "email" ? (
            <>
              <form
                className="gate-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendCode(email);
                }}
              >
                <div className="gate-field">
                  <label htmlFor="gate-email">E-mailadres</label>
                  <input
                    id="gate-email"
                    ref={emailRef}
                    type="email"
                    name="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="jij@voorbeeld.be"
                    autoComplete="email"
                    inputMode="email"
                    required
                  />
                </div>
                <button type="submit" className="gate-submit" disabled={sending || !email.trim()}>
                  {sending ? (
                    <>
                      <LoaderCircle className="gate-spin" aria-hidden="true" /> Code versturen…
                    </>
                  ) : (
                    "Stuur mij een code"
                  )}
                </button>
              </form>
              <div className="gate-alts">
                <button type="button" className="gate-alt" onClick={() => { setStep("gate"); setError(null); }}>
                  Terug naar Face ID
                </button>
              </div>
            </>
          ) : passkeyReady === false ? (
            <>
              <button
                type="button"
                className="gate-passkey"
                onClick={() => setStep("email")}
                disabled={busy}
              >
                <span className="gate-scanner"><Mail aria-hidden="true" /></span>
                <span className="gate-passkey-copy">
                  <strong>Stuur mij een code</strong>
                  <small>Per e-mail · daarna kan Face ID aan</small>
                </span>
              </button>
              {googleReady ? (
                <a className="gate-google" href="/api/auth/google/start">
                  <GoogleMark />
                  Ga verder met Google
                </a>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                className="gate-passkey"
                data-scanning={scanning ? "true" : "false"}
                onClick={() => void handlePasskey()}
                disabled={busy}
              >
                <span className="gate-scanner">
                  {scanning ? <LoaderCircle className="gate-spin" aria-hidden="true" /> : <ScanFace aria-hidden="true" />}
                </span>
                <span className="gate-passkey-copy">
                  <strong>{scanning ? "Gezicht herkennen…" : "Ontgrendelen"}</strong>
                  <small>{scanning ? "Houd je toestel voor je" : "Face ID · passkey op dit toestel"}</small>
                </span>
              </button>

              <div className="gate-alts">
                <button type="button" className="gate-alt" onClick={() => setStep("email")} disabled={busy}>
                  <Mail aria-hidden="true" style={{ width: 15, height: 15, marginRight: 7 }} />
                  Liever een e-mailcode
                </button>
              </div>
              {googleReady ? (
                <a className="gate-google" href="/api/auth/google/start">
                  <GoogleMark />
                  Ga verder met Google
                </a>
              ) : null}
            </>
          )}

          <p className="gate-trust">
            <ShieldCheck aria-hidden="true" /> Versleuteld gesynchroniseerd
          </p>
        </div>
      </div>
    </main>
  );
}
