// SharedWorkoutSheet.swift — a workout a friend sent as a link: what's in
// it, and one tap to keep a copy among your own workouts. Opening the link
// never adds anything by itself.
import { useState } from "react";
import { SL } from "../../design/tokens";
import { HStack, Text, VStack } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLOutlineButton, SLPrimaryButton } from "../../design/SetlineTokens";
import { SLHairline, slBody, slMeta } from "../../design/components/SLText";
import { SLSheet } from "../../design/components/SLSheet";
import { useApp } from "../../data/AppState";
import { ExerciseCatalog } from "../../core/Catalog/ExerciseCatalog";
import { CustomWorkoutLink, type CustomWorkoutLink_Received } from "../../core/Domain/CustomWorkoutLink";

const storageKey = "setline.sharedWorkout";

/**
 * The link's code, taken off the address as the app opens so a sign-in (even by e-mail link, in a new tab) or a
 * reload never loses it, and so the address bar doesn't keep it.
 */
export const SharedWorkoutInbox = {
  capture(): void {
    try {
      const url = new URL(location.href);
      const code = url.searchParams.get(CustomWorkoutLink.parameter);
      if (code === null) return;
      localStorage.setItem(storageKey, code);
      url.searchParams.delete(CustomWorkoutLink.parameter);
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    } catch {
      /* no storage: the link simply isn't offered */
    }
  },

  take(): CustomWorkoutLink_Received | undefined {
    try {
      const code = localStorage.getItem(storageKey);
      if (code === null) return undefined;
      localStorage.removeItem(storageKey);
      return CustomWorkoutLink.received(code);
    } catch {
      return undefined;
    }
  },
};

/** An iPhone, where the native app may be the one this account uses. */
const onIPhone = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

export function SharedWorkoutSheet({ received, onClose }: { received: CustomWorkoutLink_Received; onClose: () => void }) {
  const app = useApp();
  const [saved, setSaved] = useState(false);
  const { workout, skipped } = received;
  const sets = workout.items.reduce((total, item) => total + item.sets, 0);

  return (
    <SLSheet
      title={saved ? "Saved to your workouts" : "A workout for you"}
      subtitle={`${workout.name} · ${workout.items.length === 1 ? "1 exercise" : `${workout.items.length} exercises`} · ${sets} sets`}
      onClose={onClose}
    >
      <VStack alignment="leading" spacing={SL.Space.s5} style={{ paddingTop: SL.Space.s2, paddingBottom: SL.Space.s6 }}>
        <VStack spacing={0} style={{ alignSelf: "stretch", alignItems: "stretch", background: SL.Surface.raised2, borderRadius: SL.Radius.lg, overflow: "hidden" }}>
          {workout.items.map((item, index) => (
            <div key={`${item.exerciseID}-${index}`} style={{ position: "relative" }}>
              {index > 0 && <SLHairline />}
              <HStack spacing={SL.Space.s3} style={{ minHeight: 52, paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4 }}>
                <Text {...slMeta(SL.Weight.semibold)} numerals color={SL.Ink.tertiary} style={{ width: 18, flexShrink: 0 }}>
                  {`${index + 1}`}
                </Text>
                <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary} lineLimit={1} style={{ flex: "1 1 0", minWidth: 0 }}>
                  {ExerciseCatalog.exercise(item.exerciseID)?.name ?? item.exerciseID}
                </Text>
                <Text {...slMeta()} numerals color={SL.Ink.secondary} style={{ flexShrink: 0 }}>
                  {`${item.sets} × ${item.repLow === item.repHigh ? item.repLow : `${item.repLow}–${item.repHigh}`}`}
                </Text>
              </HStack>
            </div>
          ))}
        </VStack>
        {skipped > 0 && (
          <Text {...slMeta()} color={SL.Ink.secondary}>
            {skipped === 1 ? "1 exercise isn't in Setline's list and was left out." : `${skipped} exercises aren't in Setline's list and were left out.`}
          </Text>
        )}
        {saved ? (
          <VStack spacing={SL.Space.s3} style={{ alignSelf: "stretch", alignItems: "stretch" }}>
            <HStack spacing={SL.Space.s2}>
              <SFSymbol name="checkmark" size={16} weight={700} color={SL.Signal.action} />
              <Text {...slBody()} color={SL.Ink.primary}>Find it in Plan & workouts, or put it in your week.</Text>
            </HStack>
            <SLPrimaryButton onPress={onClose}>Done</SLPrimaryButton>
          </VStack>
        ) : (
          <VStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", alignItems: "stretch" }}>
            <SLPrimaryButton
              onPress={() => {
                void app.saveCustomWorkout(workout);
                setSaved(true);
              }}
            >
              Save to my workouts
            </SLPrimaryButton>
            <SLOutlineButton onPress={onClose}>Not now</SLOutlineButton>
            {/* The link opened in Safari; the iPhone app can take it from here. */}
            {onIPhone && (
              <a
                href={`setline://workout?${CustomWorkoutLink.parameter}=${CustomWorkoutLink.code(workout)}`}
                style={{ minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
              >
                <Text {...slBody(SL.Weight.medium)} color={SL.Signal.action}>Open in the iPhone app instead</Text>
              </a>
            )}
          </VStack>
        )}
      </VStack>
    </SLSheet>
  );
}
