import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import Page from "../../app/page";
import { LoginScreen } from "../../app/login/login-screen";
import "./app.css";
import "../../app/login/login.css";

const host = document.getElementById("root");
if (!host) throw new Error("#root ontbreekt");

const isLogin = window.location.pathname.replace(/\/+$/, "") === "/login";

createRoot(host).render(
  <StrictMode>{isLogin ? <LoginScreen /> : <Page />}</StrictMode>,
);
