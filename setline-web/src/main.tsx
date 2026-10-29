import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./design/base.css";
import { App } from "./App";
import { app } from "./data/AppState";
import { LocalStore } from "./data/LocalStore";
import { social } from "./data/SocialStore";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// RootView's launch `.task`: the local store has to be attached before the
// first read, or restore falls back to a fresh state and a paused session
// looks like it was never saved. The loading screen plays meanwhile.
void (async () => {
  social.attach(app);
  const store = await LocalStore.open();
  app.attach(store);
  await app.restore();
})();
