import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";

// Static SPA build of the real app for a preview host (Vercel).
// It imports the actual screens from app/, so this cannot drift from the app.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  publicDir: path.join(repoRoot, "public"),
  plugins: [react()],
  resolve: { alias: { "@": repoRoot } },
  css: { postcss: repoRoot },
  build: { outDir: "dist", emptyOutDir: true },
});
