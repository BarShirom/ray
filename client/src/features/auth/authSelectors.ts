// features/auth/authSelectors.ts
import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "../../app/store";

export const selectUser = (s: RootState) => s.auth.user;

// Token is the single source of truth
export const selectToken = createSelector(selectUser, (u) => u?.token ?? null);

// Logged-in iff there is a non-empty token
export const selectIsLoggedIn = createSelector(selectToken, (t) => Boolean(t));

export const selectAuthLoading = (s: RootState) => s.auth.loading;
export const selectAuthError = (s: RootState) => s.auth.error;
export const selectUserId = (s: RootState) => s.auth.user?.id ?? null;
export const selectName = (s: RootState) =>
  s.auth.user ? `${s.auth.user.firstName} ${s.auth.user.lastName}` : "Guest";
