import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";

// Static SPA build of the real app for a preview host (Vercel).
// It imports the actual screens from app/, so this cannot drift from the app.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");

export default defineConfig(({ mode }) => {
  // Unlike the Next build, plain Vite does not touch `process.env` in source.
  // The Supabase config is read from the repo-root .env files (locally) or the
  // host's build environment (Vercel) and inlined here, otherwise the shipped
  // bundle reports itself as unconfigured and sign-in is dead on arrival.
  const env = { ...loadEnv(mode, repoRoot, ""), ...process.env };
  const publicEnv = {
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL ?? ""),
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""),
  };

  return {
  root: fileURLToPath(new URL("./", import.meta.url)),
  define: publicEnv,
  publicDir: path.join(repoRoot, "public"),
  plugins: [react()],
  resolve: { alias: { "@": repoRoot } },
  css: { postcss: repoRoot },
  build: { outDir: "dist", emptyOutDir: true },
  };
});
