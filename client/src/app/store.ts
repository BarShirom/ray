import { configureStore, nanoid, type Middleware, type UnknownAction } from "@reduxjs/toolkit";
import {
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  createTransform,
  persistReducer,
  persistStore,
} from "redux-persist";
import { combineReducers } from "redux";
import authReducer, { externalSessionChanged, invalidateSession, restoreAuth, sessionStorageUnavailable, logoutPersistenceFailed, type AuthState } from "../features/auth/authSlice";
import { createAuthPersistence, persistedIdentity, AUTH_STORAGE_KEY } from "../features/auth/authPersistence";
import { AUTHORITY_STORAGE_KEY, browserStorage } from "../features/auth/session";
import { isApiFailure } from "../api/errors";
import { t } from "../i18n";
import reportsReducer from "../features/reports/reportsSlice"; 
import feedingStationsReducer from "../features/feedingStations/feedingStationsSlice";
import feedingLogsReducer from "../features/feedingLogs/feedingLogsSlice";

const combinedReducer = combineReducers({
  auth: authReducer,
  reports: reportsReducer, 
  feedingStations: feedingStationsReducer,
  feedingLogs: feedingLogsReducer,
});

type AppState = ReturnType<typeof combinedReducer>;

export function createRayStore(storage = browserStorage()) {
  const persistence = createAuthPersistence(storage);
  const rootReducer = (state: AppState | undefined, action: UnknownAction): AppState => {
    let next = combinedReducer(state, action);
    if (state && (state.auth.sessionId !== next.auth.sessionId
      || state.auth.user?.id !== next.auth.user?.id || state.auth.user?.token !== next.auth.user?.token)) {
      // Reset all account-sensitive collections in the same Redux transition.
      // Public reports can load again under their independent guest policy.
      next = { ...next,
        reports: reportsReducer(undefined, { type: "session/reset" }),
        feedingStations: feedingStationsReducer(undefined, { type: "session/reset" }),
        feedingLogs: feedingLogsReducer(undefined, { type: "session/reset" }),
      };
    }
    return next;
  };

  const sessionMiddleware: Middleware<object, AppState> = (api) => (next) => (unknownAction) => {
    let action = unknownAction as UnknownAction;
    if (action.type === REHYDRATE && action.key === "root" && !api.getState().auth.hasAuthIntent) {
      const identity = persistence.restore((action.payload as { auth?: unknown } | undefined)?.auth);
      if (identity?.user) api.dispatch(restoreAuth({ ...identity, user: identity.user }));
    }
    if ((action.type === "auth/loginUser/fulfilled" || action.type === "auth/registerUser/fulfilled"
      || action.type === "auth/loginUser/rejected" || action.type === "auth/registerUser/rejected")
      && api.getState().auth.attemptId && storage && !persistence.owns(api.getState().auth.sessionId)) {
      api.dispatch(externalSessionChanged());
    }
    if (["auth/loginUser/pending", "auth/registerUser/pending", "auth/logoutUser/pending"].includes(action.type)) {
      action = { ...action, meta: { ...(action.meta as Record<string, unknown> | undefined), sessionId: nanoid() } };
    }
    const before = api.getState().auth;
    const after = authReducer(before, action);
    const changed = before.sessionId !== after.sessionId || before.user?.id !== after.user?.id
      || before.user?.token !== after.user?.token;
    if (action.type === externalSessionChanged.type || action.type === sessionStorageUnavailable.type
      || action.type === logoutPersistenceFailed.type) persistence.block();
    else if (changed && (storage || typeof window !== "undefined")) {
      // Publish an explicit new intent before subscribers can observe it.
      // Completion/restoration only commit identity under existing authority;
      // they can never overwrite a newer tab's authority marker.
      const restoredOrCompleted = action.type === restoreAuth.type
        || action.type === "auth/loginUser/fulfilled" || action.type === "auth/registerUser/fulfilled";
      if (action.type === "auth/logoutUser/pending") {
        const meta = action.meta as { requestId: string; arg?: { retrySessionId: string } };
        const outcome = persistence.publishLogout(after, before.sessionId, Boolean(meta.arg?.retrySessionId));
        if (outcome !== "complete") return api.dispatch(outcome === "superseded"
          ? externalSessionChanged() : logoutPersistenceFailed(meta.requestId));
      }
      const accepted = action.type === "auth/logoutUser/pending" || (restoredOrCompleted ? persistence.commit(after) : persistence.publish(after));
      if (!accepted) {
        return api.dispatch(restoredOrCompleted && storage && !persistence.owns(after.sessionId)
          ? externalSessionChanged() : sessionStorageUnavailable(t("auth.storageUnavailable")));
      }
    }
    const result = next(action);
    const failure = action.payload;
    if (action.type.endsWith("/rejected") && isApiFailure(failure) && failure.source === "http" && failure.status === 401
      && failure.sessionId === api.getState().auth.sessionId) {
      if (storage && !persistence.owns(api.getState().auth.sessionId)) api.dispatch(externalSessionChanged());
      else api.dispatch(invalidateSession({ sessionId: api.getState().auth.sessionId }));
    }
    return result;
  };

  const persistedReducer = persistReducer({
    key: "root", storage: persistence.storage, whitelist: ["auth"], stateReconciler: false,
    transforms: [createTransform(
      (auth: AuthState) => persistedIdentity(auth),
      (auth) => ({ ...authReducer(undefined, { type: "session/restoration" }), ...auth, sessionId: auth.sessionId }),
      { whitelist: ["auth"] },
    )],
  }, rootReducer);
  const store = configureStore({
    reducer: persistedReducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({
      serializableCheck: { ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER] },
    }).concat(sessionMiddleware),
  });
  const persistor = persistStore(store);
  const checkExternalIdentity = () => {
    const auth = store.getState().auth;
    if ((auth.user || auth.attemptId) && !persistence.matches(auth)) store.dispatch(externalSessionChanged());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea && event.storageArea !== storage) return;
    if (event.key === null || event.key === AUTHORITY_STORAGE_KEY || event.key === AUTH_STORAGE_KEY) checkExternalIdentity();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", checkExternalIdentity);
    window.addEventListener("pageshow", checkExternalIdentity);
  }
  return { store, persistor, dispose: () => {
    persistor.pause();
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", checkExternalIdentity);
      window.removeEventListener("pageshow", checkExternalIdentity);
    }
  } };
}

export const { store, persistor } = createRayStore();

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
