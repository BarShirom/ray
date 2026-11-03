import { createSlice, nanoid, type PayloadAction } from "@reduxjs/toolkit";
import { loginUser, registerUser, logoutUser } from "./authThunks";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  token: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  sessionId: string;
  attemptId: string | null;
  completedAttemptId: string | null;
  hasAuthIntent: boolean;
  completedLogoutId: string | null;
  logoutFailure: { sessionId: string; requestId: string } | null;
}

const initialState = (): AuthState => ({
  user: null,
  loading: false,
  error: null,
  sessionId: nanoid(), attemptId: null, completedAttemptId: null, hasAuthIntent: false,
  completedLogoutId: null, logoutFailure: null,
});

function clearIdentity(state: AuthState, sessionId: string) {
  Object.assign(state, { user: null, loading: false, error: null, sessionId,
    attemptId: null, completedAttemptId: null, completedLogoutId: null, hasAuthIntent: true });
}

function intentGeneration(meta: unknown): string {
  const value = meta && typeof meta === "object" && "sessionId" in meta ? meta.sessionId : null;
  return typeof value === "string" ? value : nanoid();
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    finishAuthRestoration: (state) => {
      if (!state.attemptId) state.loading = false;
    },
    restoreAuth: (state, action: PayloadAction<{ user: User; sessionId: string }>) => {
      if (state.hasAuthIntent) return;
      Object.assign(state, action.payload, { loading: true, error: null, hasAuthIntent: true });
    },
    setAuth: {
      prepare: (user: User) => ({ payload: user, meta: { sessionId: nanoid() } }),
      reducer: (state, action: PayloadAction<User, string, { sessionId: string }>) => {
        clearIdentity(state, action.meta.sessionId);
        state.user = action.payload;
        state.logoutFailure = null;
      },
    },
    logout: {
      prepare: () => ({ payload: undefined, meta: { sessionId: nanoid() } }),
      reducer: (state, action: PayloadAction<undefined, string, { sessionId: string }>) => {
        clearIdentity(state, action.meta.sessionId);
        state.logoutFailure = null;
      },
    },
    invalidateSession: {
      prepare: (payload: { sessionId: string }) => ({ payload, meta: { nextSessionId: nanoid() } }),
      reducer: (state, action: PayloadAction<{ sessionId: string }, string, { nextSessionId: string }>) => {
        if (state.sessionId === action.payload.sessionId) clearIdentity(state, action.meta.nextSessionId);
      },
    },
    externalSessionChanged: {
      prepare: () => ({ payload: undefined, meta: { sessionId: nanoid() } }),
      reducer: (state, action: PayloadAction<undefined, string, { sessionId: string }>) => {
        clearIdentity(state, action.meta.sessionId);
      },
    },
    sessionStorageUnavailable: {
      prepare: (message: string) => ({ payload: message, meta: { sessionId: nanoid() } }),
      reducer: (state, action: PayloadAction<string, string, { sessionId: string }>) => {
        clearIdentity(state, action.meta.sessionId);
        state.error = action.payload;
      },
    },
    logoutPersistenceFailed: {
      prepare: (requestId: string) => ({ payload: requestId, meta: { sessionId: nanoid() } }),
      reducer: (state, action: PayloadAction<string, string, { sessionId: string }>) => {
        clearIdentity(state, action.meta.sessionId);
        state.logoutFailure = { sessionId: state.sessionId, requestId: action.payload };
      },
    },
  },
  extraReducers: (builder) => {
    for (const thunk of [loginUser, registerUser]) {
      builder.addCase(thunk.pending, (state, action) => {
        const requestId = action.meta?.requestId ?? nanoid();
        clearIdentity(state, intentGeneration(action.meta));
        state.attemptId = requestId;
        state.loading = true;
        state.logoutFailure = null;
      });
      builder.addCase(thunk.fulfilled, (state, action) => {
        if (state.attemptId !== action.meta.requestId) return;
        state.user = action.payload.user;
        state.loading = false;
        state.error = null;
        state.completedAttemptId = action.meta.requestId;
        state.attemptId = null;
      });
      builder.addCase(thunk.rejected, (state, action) => {
        if (state.attemptId !== action.meta.requestId) return;
        state.loading = false;
        state.error = action.meta.aborted ? null : action.payload ?? null;
        state.attemptId = null;
      });
    }
    builder.addCase(logoutUser.pending, (state, action) => {
      clearIdentity(state, intentGeneration(action.meta));
      state.completedLogoutId = action.meta.requestId;
      state.logoutFailure = null;
    });
  },
});

export const { finishAuthRestoration, restoreAuth, setAuth, logout, invalidateSession, externalSessionChanged, sessionStorageUnavailable, logoutPersistenceFailed } = authSlice.actions;
export default authSlice.reducer;
