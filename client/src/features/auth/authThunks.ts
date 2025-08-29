// features/auth/authThunks.ts
import { createAsyncThunk } from "@reduxjs/toolkit";
import type {
  AxiosError,
  AxiosResponse,
  AxiosResponseHeaders,
  RawAxiosResponseHeaders,
} from "axios";
import { http } from "../../api/http";
import { setAuth, logout } from "./authSlice";

/* ===========
 * API Types
 * =========== */

export interface BackendUser {
  _id?: string; // some APIs send _id
  id?: string; // your API sends id
  firstName?: string;
  lastName?: string;
  email: string;
  company?: string;
  token?: string; // your API currently nests token under user
}

export interface AuthResponseFromAPI {
  token?: string; // some APIs put token here
  user: BackendUser;
}

export interface SliceUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  token: string;
}

export interface RegisterDTO {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  company?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

/* =================
 * Helper functions
 * ================= */

function coerceHeaderValue(v: unknown): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? String(v[0]) : null;
  if (
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  ) {
    return String(v);
  }
  return null;
}

function headerValue(
  headers: AxiosResponseHeaders | RawAxiosResponseHeaders,
  name: string
): string | null {
  const hLike = headers as AxiosResponseHeaders;
  if (typeof hLike.get === "function") {
    const v = hLike.get(name);
    return coerceHeaderValue(v);
  }
  const raw = headers as RawAxiosResponseHeaders;
  const key = Object.keys(raw).find(
    (k) => k.toLowerCase() === name.toLowerCase()
  );
  const v: unknown = key ? (raw as Record<string, unknown>)[key] : null;
  return coerceHeaderValue(v);
}

function pickToken<D>(
  resp: AxiosResponse<AuthResponseFromAPI, D>
): string | null {
  // 1) token in body
  const body = resp.data;
  const fromBody = body.token ?? null;

  // 2) token nested in user (your current backend)
  const fromUser = body.user?.token ?? null;

  // 3) token in headers
  const authHeader = headerValue(resp.headers, "authorization"); // "Bearer <jwt>"
  const bearer =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader;
  const xAuth = headerValue(resp.headers, "x-auth-token");

  return fromBody ?? fromUser ?? bearer ?? xAuth ?? null;
}

function extractId(u: BackendUser): string {
  return u.id ?? u._id ?? "";
}

function toSliceUser(apiUser: BackendUser, token: string): SliceUser {
  return {
    id: extractId(apiUser),
    firstName: apiUser.firstName ?? "",
    lastName: apiUser.lastName ?? "",
    email: apiUser.email,
    company: apiUser.company,
    token,
  };
}

function getErrorMessage(err: unknown): string {
  const ax = err as AxiosError<
    { message?: string; error?: string; msg?: string },
    unknown
  >;
  return (
    ax?.response?.data?.message ??
    ax?.response?.data?.error ??
    ax?.response?.data?.msg ??
    ax?.message ??
    "Request failed"
  );
}

/* ======
 * Thunks
 * ====== */

export const registerUser = createAsyncThunk<
  { user: SliceUser },
  RegisterDTO,
  { rejectValue: string }
>("auth/registerUser", async (dto, { dispatch, rejectWithValue }) => {
  try {
    const resp = await http.post<
      AuthResponseFromAPI,
      AxiosResponse<AuthResponseFromAPI, RegisterDTO>,
      RegisterDTO
    >("/api/auth/register", dto);

    const token = pickToken(resp);
    if (!token) throw new Error("Missing token in register response");

    const mapped = toSliceUser(resp.data.user, token);
    dispatch(setAuth(mapped));
    return { user: mapped };
  } catch (err) {
    return rejectWithValue(getErrorMessage(err));
  }
});

export const loginUser = createAsyncThunk<
  { user: SliceUser },
  LoginDTO,
  { rejectValue: string }
>("auth/loginUser", async (dto, { dispatch, rejectWithValue }) => {
  try {
    const resp = await http.post<
      AuthResponseFromAPI,
      AxiosResponse<AuthResponseFromAPI, LoginDTO>,
      LoginDTO
    >("/api/auth/login", dto);

    const token = pickToken(resp);
    if (!token) throw new Error("Missing token in login response");

    const mapped = toSliceUser(resp.data.user, token);
    dispatch(setAuth(mapped));
    return { user: mapped };
  } catch (err) {
    return rejectWithValue(getErrorMessage(err));
  }
});

export const logoutUser = createAsyncThunk(
  "auth/logoutUser",
  async (_, { dispatch }) => {
    try {
      localStorage.removeItem("persist:root");
    } catch (e) {
      // non-fatal; avoid empty block for ESLint
      void e;
    } finally {
      dispatch(logout());
    }
  }
);
