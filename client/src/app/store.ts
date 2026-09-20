import { configureStore } from "@reduxjs/toolkit";
import {
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  persistReducer,
  persistStore,
} from "redux-persist";
import storage from "redux-persist/lib/storage";
import { combineReducers } from "redux";
import authReducer from "../features/auth/authSlice";
import reportsReducer from "../features/reports/reportsSlice"; 
import feedingStationsReducer from "../features/feedingStations/feedingStationsSlice";
import feedingLogsReducer from "../features/feedingLogs/feedingLogsSlice";

const rootReducer = combineReducers({
  auth: authReducer,
  reports: reportsReducer, 
  feedingStations: feedingStationsReducer,
  feedingLogs: feedingLogsReducer,
});

const persistConfig = {
  key: "root",
  storage,
  whitelist: ["auth"],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
