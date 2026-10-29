// SetlineApp.swift — the one window: RootView with the app's model.
import { useEffect } from "react";
import { RootView } from "./RootView";
import { app } from "./data/AppState";
import { useScenePhase } from "./design/swiftui";

export function App() {
  const scenePhase = useScenePhase();
  // Coming back to the app retries anything still waiting to sync, so a
  // change made offline never simply waits for the next one.
  useEffect(() => {
    if (scenePhase === "active") void app.syncNow();
  }, [scenePhase]);
  return <RootView />;
}
