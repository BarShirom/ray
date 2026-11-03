// features/auth/authThunks.ts
import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AxiosResponse } from "axios";
import { localizeError } from "../../i18n/errors";
import { http } from "../../api/http";
import type { AuthState } from "./authSlice";
import { ownsBrowserAuthority } from "./session";

/* ===========
 * API Types
 * =========== */

export interface BackendUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
}

export interface AuthResponseFromAPI {
  token: string;
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

function toSliceUser(apiUser: BackendUser, token: string): SliceUser {
  return {
    id: apiUser.id,
    firstName: apiUser.firstName,
    lastName: apiUser.lastName,
    email: apiUser.email,
    company: apiUser.company,
    token,
  };
}

function currentAttempt(getState: () => unknown, requestId: string): boolean {
  const { auth } = getState() as { auth: AuthState };
  return auth.attemptId === requestId && ownsBrowserAuthority(auth.sessionId);
}

function obsoleteAttempt(): never {
  throw Object.assign(new Error("Obsolete authentication attempt"), { name: "AbortError" });
}

/* ======
 * Thunks
 * ====== */

export const registerUser = createAsyncThunk<
  { user: SliceUser },
  RegisterDTO,
  { rejectValue: string }
>("auth/registerUser", async (dto, { getState, requestId, signal, rejectWithValue }) => {
  try {
    if (!currentAttempt(getState, requestId)) return obsoleteAttempt();
    const resp = await http.post<
      AuthResponseFromAPI,
      AxiosResponse<AuthResponseFromAPI, RegisterDTO>,
      RegisterDTO
    >("/api/auth/register", dto, { signal });

    if (!currentAttempt(getState, requestId)) return obsoleteAttempt();

    const token = resp.data.token;
    if (!token) throw new Error("Missing token in register response");

    const mapped = toSliceUser(resp.data.user, token);
    return { user: mapped };
  } catch (err) {
    if (!currentAttempt(getState, requestId)) return obsoleteAttempt();
    return rejectWithValue(localizeError(err, "register"));
  }
});

export const loginUser = createAsyncThunk<
  { user: SliceUser },
  LoginDTO,
  { rejectValue: string }
>("auth/loginUser", async (dto, { getState, requestId, signal, rejectWithValue }) => {
  try {
    if (!currentAttempt(getState, requestId)) return obsoleteAttempt();
    const resp = await http.post<
      AuthResponseFromAPI,
      AxiosResponse<AuthResponseFromAPI, LoginDTO>,
      LoginDTO
    >("/api/auth/login", dto, { signal });

    if (!currentAttempt(getState, requestId)) return obsoleteAttempt();

    const token = resp.data.token;
    if (!token) throw new Error("Missing token in login response");

    const mapped = toSliceUser(resp.data.user, token);
    return { user: mapped };
  } catch (err) {
    if (!currentAttempt(getState, requestId)) return obsoleteAttempt();
    return rejectWithValue(localizeError(err, "login"));
  }
});

export const logoutUser = createAsyncThunk<
  { persisted: true },
  { retrySessionId: string } | undefined,
  { state: { auth: AuthState }; rejectValue: { kind: "storage-unavailable" | "superseded"; sessionId: string } }
>(
  "auth/logoutUser",
  (_, { getState, requestId, rejectWithValue }) => {
    const auth = getState().auth;
    if (auth.logoutFailure?.requestId === requestId) {
      return rejectWithValue({ kind: "storage-unavailable", sessionId: auth.sessionId });
    }
    if (auth.completedLogoutId !== requestId) return rejectWithValue({ kind: "superseded", sessionId: auth.sessionId });
    return { persisted: true };
  },
  { condition: (arg, { getState }) => !arg?.retrySessionId || (getState().auth.logoutFailure?.sessionId === arg.retrySessionId
    && getState().auth.sessionId === arg.retrySessionId && !getState().auth.user && !getState().auth.attemptId) }
);
