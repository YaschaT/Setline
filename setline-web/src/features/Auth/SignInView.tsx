// SignInView.swift — Artboard 02, as redrawn in SETLINE Review.
//
// The review's own words: three social buttons and a passkey primary
// "schendt de scopegrens: identiteit is in deze fase Supabase e-mail plus
// wachtwoord", so the screen became two fields in one grouped container, the
// title went from 21 to 34, and the lime that sat on the passkey button moved
// to the active field's border — lime once before the button and once on it.
//
// Apple, Google and passkeys are Phase 1 decisions deferred, not designed
// away: `SupabaseClient` is the seam they arrive behind.
import { useRef, useState } from "react";
import { SL, slFont } from "../../design/tokens";
import { Spacer, Text } from "../../design/swiftui";
import { PressButton } from "../../design/support";
import { SLPrimaryButton, slBorderBox } from "../../design/SetlineTokens";
import { SLEyebrow, SLHairline, slBody, slDisplay, slMeta } from "../../design/components/SLText";
import { slLineHeight, slMeasure } from "../../design/SLDynamicType";
import { useApp } from "../../data/AppState";

type Field = "email" | "password";

/** `String.trimmed`. */
export function trimmed(s: string): string {
  return s.trim();
}

export function SignInView({ registering = false, onBack }: { registering?: boolean; /** Review 01's `Terug`: back to the cold open, or out of signing in again. */ onBack?: () => void }) {
  const app = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(registering);
  const [focused, setFocused] = useState<Field | undefined>(undefined);

  const canSubmit = !app.isWorking && email.includes("@") && password.length >= 6;

  return (
    <div style={{ height: "100%", background: SL.Surface.ground, paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          height: "100%",
          paddingLeft: `calc(env(safe-area-inset-left) + ${SL.Space.gutterEntry}px)`,
          paddingRight: `calc(env(safe-area-inset-right) + ${SL.Space.gutterEntry}px)`,
          // 12 to `Terug`, 40 from it to the title — the same 40 when there
          // is nothing to go back to.
          paddingTop: onBack === undefined ? SL.Space.s10 : 0,
          // Review 01's bottom block ends 98 above the frame's edge, home
          // band included: 77 above the bottom safe area.
          paddingBottom: SL.Space.entryBlockBottom,
        }}
      >
        {onBack && (
          <PressButton onPress={onBack} style={{ minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", marginBottom: SL.Space.s6 }}>
            <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>Back</Text>
          </PressButton>
        )}

        <Text as="h1" {...slDisplay()} color={SL.Ink.primary} style={slLineHeight(SL.LineHeight.display, { size: SL.TypeSize.display })}>
          {isRegistering ? "Create account" : "Sign in"}
        </Text>

        <Text
          {...slBody()}
          color={SL.Ink.secondary}
          style={{ ...slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.body }), ...slMeasure(32, { fontSize: SL.TypeSize.body }), paddingTop: 10, paddingBottom: 28 }}
        >
          Your data stays yours and can always be exported.
        </Text>

        <FieldGroup>
          <FieldRow label="E-mail" text={email} setText={setEmail} isSecure={false} field="email" focused={focused} setFocused={setFocused} isRegistering={isRegistering} />
          <SLHairline style={{ marginLeft: 14, marginRight: 14 }} />
          <FieldRow label="Password" text={password} setText={setPassword} isSecure field="password" focused={focused} setFocused={setFocused} isRegistering={isRegistering} />
        </FieldGroup>

        <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "row", paddingTop: 14, paddingLeft: 2, paddingRight: 2 }}>
          <Spacer />
          <PressButton
            onPress={() => void app.sendPasswordReset({ email })}
            style={{ minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", justifyContent: "flex-end" }}
          >
            <Text {...slMeta()} color={SL.Ink.secondary}>Forgot password</Text>
          </PressButton>
        </div>

        {app.authError !== undefined && (
          <Text {...slMeta()} color={SL.Signal.attention} style={{ paddingTop: SL.Space.s3 }}>
            {app.authError}
          </Text>
        )}

        {app.sync.kind === "notConfigured" && (
          <Text {...slMeta()} color={SL.Signal.attention} style={{ paddingTop: SL.Space.s3 }}>
            Accounts aren't connected yet. Set SUPABASE_URL and SUPABASE_ANON_KEY in Setline.xcconfig.
          </Text>
        )}

        <Spacer />

        <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
          <SLPrimaryButton
            disabled={!canSubmit}
            onPress={() => {
              if (isRegistering) void app.signUp({ email: trimmed(email), password });
              else void app.signIn({ email: trimmed(email), password });
            }}
          >
            {isRegistering ? "Create account" : "Sign in"}
          </SLPrimaryButton>
        </div>

        <PressButton
          onPress={() => setIsRegistering(!isRegistering)}
          style={{ alignSelf: "stretch", marginTop: SL.Space.s2, minHeight: SL.Metric.tertiaryHeight, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>
            {isRegistering ? "I already have an account" : "No account yet · create one"}
          </Text>
        </PressButton>
      </div>
    </div>
  );
}

/**
 * One container of radius 20 with 6 padding, so the fields inside are radius
 * 14 — the concentric rule, stated in the review's intervention.
 */
function FieldGroup({ children }: { children?: React.ReactNode }) {
  return (
    <div
      style={{
        alignSelf: "stretch",
        display: "flex",
        flexDirection: "column",
        // `.padding(6).slBorderBox()`: 6, then the 1pt the stroked border takes.
        padding: 6 + (slBorderBox().padding as number),
        background: SL.Surface.raised,
        borderRadius: SL.Radius.option,
        boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}`,
      }}
    >
      {children}
    </div>
  );
}

function FieldRow(p: {
  label: string;
  text: string;
  setText: (v: string) => void;
  isSecure: boolean;
  field: Field;
  focused: Field | undefined;
  setFocused: (f: Field | undefined) => void;
  isRegistering: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const isFocused = p.focused === p.field;
  return (
    <div
      onClick={() => input.current?.focus()}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        gap: 2,
        paddingLeft: 14,
        paddingRight: 14,
        paddingTop: 10,
        paddingBottom: 10,
        minHeight: 60,
        alignSelf: "stretch",
        borderRadius: 14,
        background: isFocused ? SL.Surface.raised2 : "transparent",
        boxShadow: `inset 0 0 0 1px ${isFocused ? SL.Signal.action : "transparent"}`,
      }}
    >
      <SLEyebrow text={p.label} size={SL.TypeSize.micro} />
      <input
        ref={input}
        aria-label={p.label}
        type={p.isSecure ? "password" : "email"}
        value={p.text}
        onChange={(e) => p.setText(e.target.value)}
        onFocus={() => p.setFocused(p.field)}
        onBlur={() => p.setFocused(undefined)}
        autoComplete={p.isSecure ? (p.isRegistering ? "new-password" : "current-password") : "email"}
        inputMode={p.isSecure ? undefined : "email"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        style={{
          // 17pt, comfortably above the 16pt floor that stops a phone zooming
          // a field on focus.
          ...slFont(SL.TypeSize.lead, SL.Weight.medium),
          color: SL.Ink.primary,
          caretColor: SL.Signal.action,
          background: "transparent",
          border: "none",
          outline: "none",
          padding: 0,
          margin: 0,
          width: "100%",
          lineHeight: 1.25,
        }}
      />
    </div>
  );
}
