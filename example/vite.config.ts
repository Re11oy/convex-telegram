import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  // Read env (e.g. VITE_CONVEX_URL) from the repo root where `convex dev` writes
  // .env.local.
  envDir: "../",
  plugins: [react()],
});
