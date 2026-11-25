import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

// Every build gets its own id, baked into the code and written next to it as
// /version.json. An app left open — a tab, or the home-screen app iOS keeps
// alive in the background — compares the two and updates itself.
const build = `${Date.now().toString(36)}-${(process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7)}`;
const versionFile = (): Plugin => ({
  name: "setline-version",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build }) });
  },
});

// The web copy of the iOS app. Same Supabase project, same account row.
const repoRoot = fileURLToPath(new URL("../", import.meta.url));

export default defineConfig(() => ({
  root: fileURLToPath(new URL("./", import.meta.url)),
  // The Supabase URL and publishable key: the repo's .env.local locally, the
  // host's build environment on Vercel — the same values the iOS app uses.
  envDir: repoRoot,
  envPrefix: ["NEXT_PUBLIC_SUPABASE_", "VITE_"],
  // The site's main address: this app replaced the old web app.
  base: "/",
  plugins: [react(), versionFile()],
  define: { __SETLINE_BUILD__: JSON.stringify(build) },
  build: { outDir: "dist", emptyOutDir: true },
  // The app is served from the same site as the web app's API (meal scan,
  // product search), so it calls /api on its own origin; locally that is
  // forwarded to the live site.
  server: {
    port: 5190,
    strictPort: true,
    proxy: { "/api": { target: "https://youfit-app.vercel.app", changeOrigin: true } },
  },
}));
