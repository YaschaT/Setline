import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

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
  plugins: [react()],
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
