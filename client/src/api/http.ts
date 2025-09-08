// api/http.ts
import axios from "axios";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

if (!BASE) {
  throw new Error(
    "VITE_API_URL is not set. Define it in client/.env.local for dev and in Vercel env for prod."
  );
}

export const http = axios.create({
  baseURL: BASE, // e.g. https://ray-production-f8b3.up.railway.app
  headers: { "Content-Type": "application/json" },
  withCredentials: false, // set true only if your API uses cookies
});

export default http;
