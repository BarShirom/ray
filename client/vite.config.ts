// Vite runs this configuration in Node; the frontend has no @types/node dependency.
declare const process: { env: Record<string, string | undefined> };
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const preview = mode === "postgres";
  if (preview && process.env.VITE_API_URL && process.env.VITE_API_URL !== "http://127.0.0.1:4001") {
    throw new Error("PostgreSQL preview refuses inherited VITE_API_URL; unset it or use http://127.0.0.1:4001");
  }
  return {
    ...(preview ? {
      envDir: false as const,
      envPrefix: [],
      define: { "import.meta.env.VITE_API_URL": JSON.stringify("http://127.0.0.1:4001") },
      server: { host: "127.0.0.1", port: 5175, strictPort: true },
      preview: { host: "127.0.0.1", port: 5175, strictPort: true },
    } : {}),
    plugins: [react()],
    build: {
      outDir: preview ? "dist-postgres" : "dist",
      target: "es2020",
      sourcemap: false, // set to true if you want production source maps
    },
    // Local dev helper: uncomment if you proxy API during "vite" dev
    // server: {
    //   proxy: {
    //     "/api": "http://localhost:3000"
    //   }
    // }
  };
});
