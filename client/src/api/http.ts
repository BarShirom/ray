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

export default http;
