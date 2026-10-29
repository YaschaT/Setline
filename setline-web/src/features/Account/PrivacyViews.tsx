// PrivacyViews.swift — the app lock and the privacy policy.
//
// The app lock needs Face ID / Touch ID / the passcode (LocalAuthentication),
// which a web page cannot ask for: `AppLock.isAvailable` is false, so Account
// never offers the switch, `isOn` stays false and the shield never shows. The
// names are kept so the screens read the same.
import { SL } from "../../design/tokens";
import { HStack, Text, VStack } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { slBody, slMeta } from "../../design/components/SLText";
import { SLSheet } from "../../design/components/SLSheet";

// MARK: - App lock

/**
 * Face ID (or the passcode) in front of the app, when switched on in Account.
 * Locks when the app goes to the background; while it is not in the
 * foreground the app switcher shows a plain shield instead of the log, body
 * weight or photos.
 */
export const AppLock = {
  preferenceKey: "setline.appLock",

  /** Never on in a browser: there is nothing to unlock with. */
  get isOn(): boolean {
    return false;
  },

  /** Whether this phone can lock at all: Face ID, Touch ID or a passcode. Not from a web page. */
  get isAvailable(): boolean {
    return false;
  },

  /** "Face ID", "Touch ID", or "passcode" — what the unlock will ask for. */
  get methodName(): string {
    return "passcode";
  },

  async authenticate(_a: { reason: string }): Promise<boolean> {
    return false;
  },
};

/** The shield's own window, above every sheet and full-screen cover. Never shown on the web. */
export const AppLockWindow = {
  show(_a: { locked: boolean; onUnlock: () => void }): void {},
  hide(): void {},
};

/** The shield over the app: the mark, and while locked the one way in. */
export function AppLockShield({ locked, onUnlock }: { locked: boolean; onUnlock: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: SL.Surface.ground, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <VStack spacing={SL.Space.s4} style={{ paddingLeft: SL.Space.gutterEntry, paddingRight: SL.Space.gutterEntry }}>
        <div style={{ width: 76, height: 76, borderRadius: 38, background: SL.Signal.actionTint, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <SFSymbol name={locked ? "lock.fill" : "lock.shield"} size={34} weight={600} color={SL.Signal.action} />
        </div>
        <Text size={SL.TypeSize.title} weight={SL.Weight.bold} color={SL.Ink.primary}>Setline</Text>
        {locked && (
          <>
            <Text {...slBody()} color={SL.Ink.secondary} align="center">
              Locked to keep your log, body weight and photos private.
            </Text>
            <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", paddingTop: SL.Space.s4 }}>
              <SLPrimaryButton onPress={onUnlock}>Unlock with {AppLock.methodName}</SLPrimaryButton>
            </div>
          </>
        )}
      </VStack>
    </div>
  );
}

// MARK: - Privacy policy

interface PrivacyPolicyView_Section {
  title: string;
  symbol: string;
  lines: string[];
}

const sections: PrivacyPolicyView_Section[] = [
  { title: "In short", symbol: "hand.raised.fill", lines: [
    "Setline has no ads, no tracking and no third-party analytics. Your data is never sold or shared for marketing.",
    "We keep what the app needs to work, and you can export or delete it yourself.",
  ] },
  { title: "Your account", symbol: "person.crop.circle", lines: [
    "Your e-mail address and a password. The password is stored only as a secure hash by our sign-in provider (Supabase); we never see it.",
    "The sign-in token on this phone is kept in the iOS Keychain.",
  ] },
  { title: "Training, food and body weight", symbol: "figure.strengthtraining.traditional", lines: [
    "Your workouts, sets, plan, food log, targets and weigh-ins are saved on this phone first and synced to your Setline account, so the app and the web version show the same.",
    "Body weight and food are health data. They are used only to show your progress and goal checks, and are never shown to friends.",
    "Your weight goal is kept on this phone only.",
  ] },
  { title: "Check-in photos", symbol: "camera.fill", lines: [
    "Progress photos stay on this phone. They are never uploaded, never shared and never analysed.",
  ] },
  { title: "Friends and posts", symbol: "person.2.fill", lines: [
    "Only if you set up a profile: your display name, username and profile photo, the posts you choose to make, your comments and kudos.",
    "Posts are seen by your friends or by you alone — you choose per post. Your log, body weight and photos are never part of a post unless you add them.",
    "Photos you add to a post are resized on this phone and their location data is removed before upload.",
  ] },
  { title: "Location", symbol: "location.fill", lines: [
    "Read once, only when you tap to find gyms near you for a post. The location itself is not stored; only the place name you pick is kept with that post.",
  ] },
  { title: "Camera and notifications", symbol: "bell.fill", lines: [
    "The camera is used only for check-in photos, post photos, barcodes and meal scans — only when you open them.",
    "Reminders are scheduled on this phone. No push service receives your schedule.",
  ] },
  { title: "Services we use", symbol: "server.rack", lines: [
    "Supabase (sign-in, friends and posts) and Cloudflare (sync of your log) host the data above.",
    "Food search sends only what you type to Open Food Facts, through our server, without your account.",
    "A scanned barcode is looked up in Open Food Facts straight from your phone; only the number is sent.",
    "Meal scan sends the meal photo and what you type to Setline's server, which asks Google's Gemini AI what is on it. Setline doesn't store the photo. Google's free service may use what it receives to improve its products, so don't scan anything you wouldn't want seen. Without a connection, the photo is read on this phone with Apple's built-in recognition instead.",
  ] },
  { title: "Your rights", symbol: "checkmark.shield.fill", lines: [
    "Under the GDPR you can see, correct, export and delete your data.",
    "Export everything: Account › Data › Export everything.",
    "Delete posts: Account › Privacy › Delete all my posts. Delete workouts: Account › Data › Delete all workouts.",
    "To have your whole account deleted, or for any privacy question, use the support link on Setline's App Store page.",
  ] },
  { title: "Keeping it safe", symbol: "lock.fill", lines: [
    "All data travels over encrypted connections. Friends' data is protected by row-level security on the server: nobody can read a post they are not allowed to see.",
    "You can lock the app with Face ID in Account › Security.",
    "Setline is meant for people aged 16 and over.",
  ] },
];

/**
 * What Setline keeps, where, and what you can do about it — in plain words,
 * on the phone, readable without an account or a connection.
 */
export function PrivacyPolicyView({ onClose }: { onClose: () => void }) {
  return (
    <SLSheet title="Privacy policy" subtitle={`Last updated ${PrivacyPolicyView.updated}`} onClose={onClose}>
      <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignItems: "stretch" }}>
        {sections.map((section) => (
          <VStack
            key={section.title}
            alignment="leading"
            spacing={SL.Space.s2}
            style={{ padding: SL.Space.s4, borderRadius: SL.Radius.lg, background: SL.Surface.raised2 }}
          >
            <HStack spacing={SL.Space.s2}>
              <div style={{ width: 28, height: 28, borderRadius: 14, background: SL.Signal.recoveryTint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <SFSymbol name={section.symbol} size={13} weight={600} color={SL.Signal.recovery} />
              </div>
              <Text as="h3" {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>{section.title}</Text>
            </HStack>
            {section.lines.map((line) => (
              <Text key={line} {...slMeta()} color={SL.Ink.meta}>{line}</Text>
            ))}
          </VStack>
        ))}
      </VStack>
    </SLSheet>
  );
}
PrivacyPolicyView.updated = "11 October 2026";
