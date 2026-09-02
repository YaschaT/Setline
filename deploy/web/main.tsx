import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import Page from "../../app/page";
import { LoginScreen } from "../../app/login/login-screen";
import "./app.css";
import "../../app/login/login.css";
import { installPreviewAuth, installPreviewGoogleLink } from "./preview-auth";

// No server on a static host, so the auth endpoints are answered locally.
// The stub lives here on purpose: the app itself carries no demo branch.
installPreviewAuth();
installPreviewGoogleLink();

const host = document.getElementById("root");
if (!host) throw new Error("#root ontbreekt");

const isLogin = window.location.pathname.replace(/\/+$/, "") === "/login";

createRoot(host).render(
  <StrictMode>{isLogin ? <LoginScreen /> : <Page />}</StrictMode>,
);
