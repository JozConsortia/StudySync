import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the built files load from file:// inside the Electron desktop app.
// host: true lets phones and other computers on the same network open the web app.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173, host: true },
  preview: { port: 5173, host: true },
});
