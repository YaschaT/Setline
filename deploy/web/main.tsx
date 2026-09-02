import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";

import "./app.css";
import "../../app/login/login.css";

/**
 * Both routes are lazy on purpose. Importing the login screen eagerly put it
 * in the entry chunk while the app chunk also imported it, which is a circular
 * chunk dependency — at runtime the component resolved to undefined and React
 * rendered nothing (error #306).
 */
const Page = lazy(() => import("../../app/page"));
const LoginScreen = lazy(() =>
  import("../../app/login/login-screen").then((m) => ({ default: m.LoginScreen })),
);

const host = document.getElementById("root");
if (!host) throw new Error("#root ontbreekt");

/**
 * index.html paints a splash before any JavaScript runs. Remove it as soon as
 * React has rendered real content — whichever route that turns out to be.
 */
function watchForFirstPaint() {
  const splash = document.getElementById("splash");
  if (!splash) return;

  const remove = () => {
    observer.disconnect();
    clearTimeout(safety);
    splash.remove();
  };
  const observer = new MutationObserver(() => {
    if (host!.childElementCount > 0) remove();
  });
  observer.observe(host!, { childList: true, subtree: true });
  // Never leave the splash stuck if something goes wrong downstream.
  const safety = setTimeout(remove, 8000);
  if (host!.childElementCount > 0) remove();
}

watchForFirstPaint();

const isLogin = window.location.pathname.replace(/\/+$/, "") === "/login";

createRoot(host).render(
  <StrictMode>
    {isLogin ? (
      <Suspense fallback={null}>
        <LoginScreen />
      </Suspense>
    ) : (
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    )}
  </StrictMode>,
);
