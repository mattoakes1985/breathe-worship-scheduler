import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // fail loudly rather than drift to another port —
    // Supabase auth redirects are registered for exactly this origin
  },
  resolve: {
    alias: { "@": "/src" },
  },
  build: {
    target: "es2020",
    sourcemap: false,
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**", "node_modules/**"], // e2e/ is Playwright's, not Vitest's
  },
});
