import type { RootState } from "../../app/store";

export const selectUser = (state: RootState) => state.auth.user;
export const selectToken = (state: RootState) => state.auth.user?.token;
export const selectIsLoggedIn = (state: RootState) => !!state.auth.user;
export const selectAuthLoading = (state: RootState) => state.auth.loading;
export const selectAuthError = (state: RootState) => state.auth.error;
export const selectUserId = (state: RootState) => state.auth.user?.id ?? null;
export const selectName = (state: RootState) => {
  const user = state.auth.user;
  return user ? `${user.firstName} ${user.lastName}` : "Guest";
};
