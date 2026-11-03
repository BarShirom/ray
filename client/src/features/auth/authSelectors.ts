// features/auth/authSelectors.ts
import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "../../app/store";
import { captureSession } from "./session";

export const selectUser = (s: RootState) => s.auth.user;
export const selectSessionId = (s: RootState) => s.auth.sessionId;

// Token is the single source of truth
export const selectToken = (s: RootState) => captureSession(s).token;

// Logged-in iff there is a non-empty token
export const selectIsLoggedIn = createSelector(selectToken, (t) => Boolean(t));

export const selectAuthLoading = (s: RootState) => s.auth.loading;
export const selectAuthError = (s: RootState) => s.auth.error;
export const selectLogoutFailure = (s: RootState) => s.auth.logoutFailure;
export const selectUserId = (s: RootState) => s.auth.user?.id ?? null;
export const selectName = (s: RootState) =>
  s.auth.user ? `${s.auth.user.firstName} ${s.auth.user.lastName}` : "Guest";
