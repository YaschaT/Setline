// SLTabBar.swift — the tab bar: inset 21 from the sides, 56 high, radius 22,
// on surface-1 inside the hairline. The active tab sits on a raised neutral
// pill that slides to the tab chosen — a lime icon, its label in ink at 600.
import { SL } from "../tokens";
import { Text, type Binding } from "../swiftui";
import { spring } from "../SetlineTokens";
import { slFixed } from "../SLDynamicType";
import { PressButton, useReduceMotion } from "../support";
import { TemplateImage } from "./SLGlyph";

/** The five places the bar leads to. Account is reached from the avatar. */
export type SLTab = "training" | "voeding" | "progressie" | "friends" | "fotos";
export const SLTab = {
  training: "training" as SLTab,
  voeding: "voeding" as SLTab,
  progressie: "progressie" as SLTab,
  friends: "friends" as SLTab,
  fotos: "fotos" as SLTab,
  allCases: ["training", "voeding", "progressie", "friends", "fotos"] as SLTab[],
  id(self: SLTab): string {
    return self;
  },
  label(self: SLTab): string {
    switch (self) {
      case "training":
        return "Training";
      case "voeding":
        return "Nutrition";
      case "progressie":
        return "Progress";
      case "friends":
        return "Friends";
      case "fotos":
        return "Photos";
    }
  },
  /** The redesign's own strokes (`public/icons/<artwork>.svg`). */
  artwork(self: SLTab): string {
    switch (self) {
      case "training":
        return "TabTraining";
      case "voeding":
        return "TabVoeding";
      case "progressie":
        return "TabProgressie";
      case "friends":
        return "TabFriends";
      case "fotos":
        return "TabFotos";
    }
  },
};

/** The pill sits 4 in from each tab's edges; its corners follow the bar's. */
const pillInset = 4;

export function SLTabBar({ selection, badges = {} }: { selection: Binding<SLTab>; badges?: Partial<Record<SLTab, number>> }) {
  const reduceMotion = useReduceMotion();
  const tabs = SLTab.allCases;
  const index = tabs.indexOf(selection.value);
  const share = 100 / tabs.length;
  return (
    <div style={{ paddingLeft: SL.Space.tabInset, paddingRight: SL.Space.tabInset, alignSelf: "stretch" }}>
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "row",
          background: SL.Surface.raised,
          border: `${SL.Metric.border}px solid ${SL.Surface.hairline}`,
          borderRadius: SL.Radius.xl,
        }}
      >
        {index >= 0 && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: pillInset,
              height: SL.Metric.tabItemHeight - 2 * pillInset,
              left: `calc(${index * share}% + ${pillInset}px)`,
              width: `calc(${share}% - ${2 * pillInset}px)`,
              borderRadius: SL.Radius.xl - pillInset - 1,
              // The line colour as a fill: one step above the bar.
              background: SL.Surface.hairline,
              transition: reduceMotion ? "none" : `left ${spring(0.32, 0.86)}`,
            }}
          />
        )}
        {tabs.map((tab) => {
          const isActive = selection.value === tab;
          const count = badges[tab];
          return (
            <PressButton
              key={tab}
              onPress={() => selection.set(tab)}
              aria-label={count !== undefined ? (count > 0 ? `${SLTab.label(tab)}, ${count} waiting` : SLTab.label(tab)) : SLTab.label(tab)}
              aria-current={isActive ? "page" : undefined}
              style={{
                position: "relative",
                flex: "1 1 0",
                minWidth: 0,
                height: SL.Metric.tabItemHeight,
                borderRadius: SL.Radius.lg,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                color: isActive ? SL.Ink.primary : SL.Ink.secondary,
              }}
            >
              <div aria-hidden style={{ position: "relative", width: 22, height: 22 }}>
                <TemplateImage name={SLTab.artwork(tab)} size={22} color={isActive ? SL.Signal.action : SL.Ink.secondary} />
                {count !== undefined && count > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      transform: "translate(8px, -5px)",
                      minWidth: 16,
                      minHeight: 16,
                      borderRadius: "50%",
                      background: SL.Signal.attention,
                      boxShadow: `inset 0 0 0 2px ${SL.Surface.raised}`,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Text color={SL.Signal.onAction} lineHeight={1} style={slFixed(10, SL.Weight.bold)}>
                      {`${Math.min(count, 9)}`}
                    </Text>
                  </div>
                )}
              </div>
              <Text
                color={isActive ? SL.Ink.primary : SL.Ink.secondary}
                lineLimit={1}
                style={{ ...slFixed(SL.TypeSize.tab, isActive ? SL.Weight.semibold : SL.Weight.regular), maxWidth: "100%" }}
              >
                {SLTab.label(tab)}
              </Text>
            </PressButton>
          );
        })}
      </div>
    </div>
  );
}
