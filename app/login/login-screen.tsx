"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { ArrowRight, Check, CircleAlert, LoaderCircle, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RESTING_WEEK, WeekCanvas } from "@/components/week-canvas";
import { friendlyAuthError, validateEmail, validatePassword } from "@/app/auth/auth-messages";
import {
  isSupabaseConfigured,
  sendPasswordReset,
  signInWithEmail,
  signUpWithEmail,
  updatePassword,
} from "@/app/auth/supabase-auth";
import { readRecoveryLink, startRecovery } from "@/app/auth/password-recovery";

type Mode = "signin" | "signup" | "reset" | "newPassword";

const COPY: Record<Mode, { headline: string; sub: string; submit: string }> = {
  signin: {
    headline: "Welkom terug.",
    sub: "Meld je aan en pak verder waar je gestopt bent.",
    submit: "Aanmelden",
  },
  signup: {
    headline: "Zet je week op de lijn.",
    sub: "Eén account houdt je sessies, gewicht en foto’s gelijk op elk toestel.",
    submit: "Account maken",
  },
  reset: {
    headline: "Wachtwoord kwijt.",
    sub: "We sturen een link waarmee je een nieuw wachtwoord kiest.",
    submit: "Stuur de link",
  },
  newPassword: {
    headline: "Kies een nieuw wachtwoord.",
    sub: "De link klopt. Zet hieronder je nieuwe wachtwoord en je bent meteen binnen.",
    submit: "Wachtwoord opslaan",
  },
};

export function LoginScreen({
  onAuthenticated,
}: {
  onAuthenticated?: (email: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [handingOver, setHandingOver] = useState(false);

  const emailId = useId();
  const passwordId = useId();
  const copy = COPY[mode];

  /**
   * A recovery link lands on this screen with its token in the URL fragment.
   * Nothing else in the app reads the address bar, so it is picked up here
   * explicitly — and only to open the "choose a new password" step, never to
   * wave someone straight into the app.
   */
  useEffect(() => {
    const link = readRecoveryLink();
    if (link.kind === "none") return;

    let cancelled = false;
    void (async () => {
      if (link.kind === "error") {
        setMode("reset");
        setError(link.message);
        return;
      }
      setBusy(true);
      try {
        const recoveredEmail = await startRecovery(link);
        if (cancelled) return;
        if (recoveredEmail) setEmail(recoveredEmail);
        setMode("newPassword");
      } catch (cause) {
        if (cancelled) return;
        setMode("reset");
        setError(friendlyAuthError(cause));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setFieldErrors({});
    setError("");
    setNotice("");
    if (next === "reset") setPassword("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || handingOver) return;

    const nextFieldErrors: { email?: string; password?: string } = {
      // The recovery link already says who this is, so there is no field to check.
      email: mode === "newPassword" ? undefined : validateEmail(email),
      password: mode === "reset" ? undefined : validatePassword(password),
    };
    setFieldErrors(nextFieldErrors);
    if (nextFieldErrors.email || nextFieldErrors.password) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "reset") {
        await sendPasswordReset(email.trim());
        setNotice("Check je inbox. De link is een uur geldig.");
        setBusy(false);
        return;
      }

      let signedInAs = email.trim().toLowerCase();

      if (mode === "newPassword") {
        signedInAs = (await updatePassword(password)) || signedInAs;
      } else if (mode === "signup") {
        const { hasSession } = await signUpWithEmail(email.trim(), password);
        if (!hasSession) {
          setNotice("Bevestig je e-mailadres via de link in je inbox, en meld je daarna aan.");
          setBusy(false);
          return;
        }
      } else {
        await signInWithEmail(email.trim(), password);
      }

      // The one authored moment: the week behind the panel ignites while the
      // panel lets go, so arriving in the app reads as continuous.
      setHandingOver(true);
      window.setTimeout(() => {
        if (onAuthenticated) onAuthenticated(signedInAs);
        else window.location.href = "/";
      }, 900);
    } catch (cause) {
      setError(friendlyAuthError(cause));
      setBusy(false);
    }
  }

  return (
    <main className={`gate ${handingOver ? "gate-handing-over" : ""}`}>
      <div className="gate-ambient" aria-hidden="true">
        <span />
        <span />
      </div>

      <div className="gate-stage">
        <WeekCanvas slots={RESTING_WEEK} igniting={handingOver} />

        <div className="gate-panel" role={handingOver ? "status" : undefined}>
          <div className="gate-brand">
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
            <span className="gate-wordmark">Setline</span>
          </div>

          {!isSupabaseConfigured ? (
            <div className="gate-unconfigured">
              <h1 className="gate-headline">Accounts zijn nog niet aangesloten.</h1>
              <p className="gate-sub">
                Setline werkt lokaal verder, maar synchroniseren kan pas als de accountservice
                gekoppeld is.
              </p>
              <div className="gate-envblock">
                <code>NEXT_PUBLIC_SUPABASE_URL</code>
                <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
              </div>
              <p className="gate-sub gate-sub-quiet">
                Zet deze twee waarden in <code>.env.local</code> en herstart de app.
              </p>
            </div>
          ) : (
            <>
              <h1 className="gate-headline">{copy.headline}</h1>
              <p className="gate-sub">
                {mode === "newPassword" && email ? `Voor ${email}. ${copy.sub}` : copy.sub}
              </p>

              <form className="gate-form" onSubmit={handleSubmit} noValidate>
                {mode !== "newPassword" && (
                <div className="gate-field">
                  <Label htmlFor={emailId}>E-mailadres</Label>
                  <Input
                    id={emailId}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="jij@voorbeeld.be"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
                    disabled={busy || handingOver}
                  />
                  {fieldErrors.email && (
                    <p className="gate-field-error" id={`${emailId}-error`}>
                      {fieldErrors.email}
                    </p>
                  )}
                </div>
                )}

                {mode !== "reset" && (
                  <div className="gate-field">
                    <div className="gate-field-head">
                      <Label htmlFor={passwordId}>
                        {mode === "newPassword" ? "Nieuw wachtwoord" : "Wachtwoord"}
                      </Label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          className="gate-inline-link"
                          onClick={() => switchMode("reset")}
                        >
                          Vergeten?
                        </button>
                      )}
                    </div>
                    <Input
                      id={passwordId}
                      type="password"
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      placeholder={mode === "signin" ? "••••••••" : "Minstens 8 tekens"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={fieldErrors.password ? `${passwordId}-error` : undefined}
                      disabled={busy || handingOver}
                    />
                    {fieldErrors.password && (
                      <p className="gate-field-error" id={`${passwordId}-error`}>
                        {fieldErrors.password}
                      </p>
                    )}
                  </div>
                )}

                {/* Both regions stay mounted so a message inserted into them is
                    announced. An alert that appears together with its text is
                    announced unreliably, which on this screen means a failed
                    sign-in can pass a screen-reader user in silence. */}
                <div role="alert">
                  {error && (
                    <p className="gate-error">
                      <CircleAlert aria-hidden="true" />
                      <span>{error}</span>
                    </p>
                  )}
                </div>

                <div role="status">
                  {notice && (
                    <p className="gate-notice">
                      <Mail aria-hidden="true" />
                      <span>{notice}</span>
                    </p>
                  )}
                </div>

                <Button type="submit" className="gate-submit" disabled={busy || handingOver}>
                  {handingOver ? (
                    <>
                      <Check aria-hidden="true" /> Je week staat klaar
                    </>
                  ) : busy ? (
                    <>
                      <LoaderCircle className="gate-spin" aria-hidden="true" /> Even geduld
                    </>
                  ) : (
                    <>
                      {copy.submit} <ArrowRight aria-hidden="true" />
                    </>
                  )}
                </Button>
              </form>

              <div className="gate-switch">
                {mode === "signin" && (
                  <p>
                    Nog geen account?{" "}
                    <button type="button" onClick={() => switchMode("signup")}>
                      Maak er een
                    </button>
                  </p>
                )}
                {mode === "signup" && (
                  <p>
                    Heb je al een account?{" "}
                    <button type="button" onClick={() => switchMode("signin")}>
                      Meld je aan
                    </button>
                  </p>
                )}
                {mode === "reset" && (
                  <p>
                    Weet je het weer?{" "}
                    <button type="button" onClick={() => switchMode("signin")}>
                      Terug naar aanmelden
                    </button>
                  </p>
                )}
                {mode === "newPassword" && (
                  <p>
                    Toch niet nodig?{" "}
                    <button type="button" onClick={() => switchMode("signin")}>
                      Terug naar aanmelden
                    </button>
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
