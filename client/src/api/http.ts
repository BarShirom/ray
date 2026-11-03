import axios from "axios";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

if (!BASE) {
  throw new Error(
    "VITE_API_URL is not set. Define it in client/.env.local for dev and in Vercel env for prod."
  );
}

export const http = axios.create({
  baseURL: BASE, 
  headers: { "Content-Type": "application/json" },
  withCredentials: false, 
});

// All bearer-bearing requests belong to the configured Ray origin. Never allow
// an absolute/protocol-relative URL supplied by data to inherit Ray credentials.
http.interceptors.request.use((config) => {
  if (config.headers.get("Authorization")) {
    const ray = new URL(BASE);
    const target = new URL(config.url ?? "", `${config.baseURL ?? BASE}/`);
    if (target.origin !== ray.origin || target.username || target.password) {
      throw new Error("Refusing credentials outside the configured Ray API");
    }
  }
  return config;
}, (error) => { throw error; }, { synchronous: true });

export default http;
