import axios from "axios";

// In dev -> use Vite proxy (BASE = "")
// In prod -> use full VITE_API_URL
const BASE =
  import.meta.env.MODE === "development"
    ? ""
    : (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export const http = axios.create({
  baseURL: BASE, // "" in dev -> calls /api/... through Vite proxy
  headers: { "Content-Type": "application/json" },
  withCredentials: false, // set to true only if your API uses cookies
});

export default http;
