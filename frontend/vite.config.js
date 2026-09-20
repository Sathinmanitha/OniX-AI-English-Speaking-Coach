import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/OniX-AI-English-Speaking-Coach/",
  plugins: [react()],
  envDir: "..",
  server: {
    port: 5173
  }
});
