import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    target: "es2020",
    sourcemap: false, // set to true if you want production source maps
  },
  // Local dev helper: uncomment if you proxy API during "vite" dev
  // server: {
  //   proxy: {
  //     "/api": "http://localhost:3000"
  //   }
  // }
});
