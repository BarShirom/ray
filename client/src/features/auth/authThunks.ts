// features/auth/authThunks.ts
import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AxiosError, AxiosResponse } from "axios";
import { http } from "../../api/http";
import { setAuth, logout } from "./authSlice";

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

    const token = resp.data.token;
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

    const token = resp.data.token;
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
