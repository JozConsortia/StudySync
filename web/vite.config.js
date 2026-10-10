import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the built files load from file:// inside the Electron desktop app.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173 },
});
