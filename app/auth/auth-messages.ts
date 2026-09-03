import { AuthNotConfiguredError } from "./supabase-auth";

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return "Vul je e-mailadres in.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Dit e-mailadres klopt niet.";
  return undefined;
}

export function validatePassword(password: string): string | undefined {
  if (!password) return "Vul een wachtwoord in.";
  if (password.length < 8) return "Gebruik minstens 8 tekens.";
  return undefined;
}

const KNOWN: Record<string, string> = {
  "invalid login credentials": "Dit e-mailadres of wachtwoord klopt niet.",
  "user already registered": "Er bestaat al een account met dit e-mailadres. Meld je aan.",
  "email not confirmed": "Bevestig eerst je e-mailadres. Check je inbox voor de link.",
  "email rate limit exceeded": "Te veel pogingen na elkaar. Wacht een minuut en probeer opnieuw.",
  "password should be at least 6 characters": "Gebruik minstens 8 tekens.",
};

/** Never shows a raw Supabase or browser error: every message names the problem
 *  and the way out, in the app's own voice. */
export function friendlyAuthError(error: unknown): string {
  if (error instanceof AuthNotConfiguredError) return error.message;
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Browsers report every unreachable-server failure (offline, DNS, CORS) as
    // a bare "Failed to fetch" TypeError. That string never reaches a person.
    if (
      message.includes("failed to fetch") ||
      message.includes("load failed") ||
      message.includes("networkerror")
    ) {
      return "We krijgen geen verbinding. Check je internet en probeer het zo opnieuw.";
    }
    const known = KNOWN[message];
    if (known) return known;
    if (error.message) return error.message;
  }
  return "Er ging iets mis. Probeer het zo opnieuw.";
}
