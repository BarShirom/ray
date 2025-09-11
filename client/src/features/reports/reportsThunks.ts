// features/reports/reportsThunks.ts
import { createAsyncThunk } from "@reduxjs/toolkit";
import { http } from "../../api/http";
import type { RootState } from "../../app/store";
import { selectToken } from "../auth/authSelectors";
import type { Report, ReportType } from "./reportsSlice";

const authHeader = (token: string | null) =>
  token ? { Authorization: `Bearer ${token}` } : undefined;

// --- Fetch all (public) ---
export const fetchReports = createAsyncThunk<Report[]>(
  "reports/fetchAll",
  async () => {
    const { data } = await http.get<Report[]>("/api/reports");
    return data;
  }
);

// --- Create ---
type CreateReportPayload = {
  description: string;
  type: ReportType;
  location: { lat: number; lng: number };
  media?: string[]; // Cloudinary URLs
};

export const createReport = createAsyncThunk<
  Report,
  CreateReportPayload,
  { state: RootState }
>("reports/create", async (payload, { getState }) => {
  const token = selectToken(getState());
  const { data } = await http.post<Report>("/api/reports", payload, {
    headers: authHeader(token),
  });
  return data;
});

// --- Claim ---
export const claimReport = createAsyncThunk<
  Report,
  { reportId: string },
  { state: RootState }
>("reports/claim", async ({ reportId }, { getState }) => {
  const token = selectToken(getState());
  const { data } = await http.patch<Report>(
    `/api/reports/${reportId}/claim`,
    {},
    {
      headers: authHeader(token),
    }
  );
  return data;
});

// --- Resolve ---
export const resolveReport = createAsyncThunk<
  Report,
  { reportId: string },
  { state: RootState }
>("reports/resolve", async ({ reportId }, { getState }) => {
  const token = selectToken(getState());
  const { data } = await http.patch<Report>(
    `/api/reports/${reportId}/resolve`,
    {},
    {
      headers: authHeader(token),
    }
  );
  return data;
});

// --- Stats (me) ---
export const fetchUserStats = createAsyncThunk<
  { total: number; resolved: number; inProgress: number },
  void,
  { state: RootState }
>("reports/fetchUserStats", async (_void, { getState }) => {
  const token = selectToken(getState());
  const { data } = await http.get("/api/reports/stats/me", {
    headers: authHeader(token),
  });
  return data as { total: number; resolved: number; inProgress: number };
});

// --- My reports ---
export const fetchMyReports = createAsyncThunk<
  Report[],
  void,
  { state: RootState }
>("reports/fetchMyReports", async (_void, { getState }) => {
  const token = selectToken(getState());
  const { data } = await http.get<Report[]>("/api/reports/me", {
    headers: authHeader(token),
  });
  return data;
});

// --- Global stats ---
export const fetchGlobalStats = createAsyncThunk<
  { total: number; resolved: number; inProgress: number; new: number },
  void,
  { state: RootState }
>("reports/fetchGlobalStats", async (_void, { getState }) => {
  const token = selectToken(getState());
  const { data } = await http.get("/api/reports/stats", {
    headers: authHeader(token),
  });
  return data as {
    total: number;
    resolved: number;
    inProgress: number;
    new: number;
  };
});

// import { createAsyncThunk } from "@reduxjs/toolkit";
// import type { Report, ReportType } from "./reportsSlice";
// import { http } from "../../api/http";

// const authHeader = (token: string | null) =>
//   token ? { Authorization: `Bearer ${token}` } : {};

// export const fetchReports = createAsyncThunk<Report[]>(
//   "reports/fetchAll",
//   async () => {
//     const { data } = await http.get<Report[]>("/api/reports");
//     return data;
//   }
// );

// export const createReport = createAsyncThunk<
//   Report,
//   {
//     description: string;
//     type: ReportType;
//     location: { lat: number; lng: number };
//     media?: string[]; // Cloudinary URLs
//     token: string | null;
//   }
// >(
//   "reports/create",
//   async ({ description, type, location, media = [], token }) => {
//     const payload = { description, type, location, media };
//     const { data } = await http.post<Report>("/api/reports", payload, {
//       headers: { ...authHeader(token) },
//     });
//     return data;
//   }
// );

// export const claimReport = createAsyncThunk<
//   Report,
//   { reportId: string; token: string | null }
// >("reports/claim", async ({ reportId, token }) => {
//   const { data } = await http.patch<Report>(
//     `/api/reports/${reportId}/claim`,
//     {},
//     {
//       headers: { ...authHeader(token) },
//     }
//   );
//   return data;
// });

// export const resolveReport = createAsyncThunk<
//   Report,
//   { reportId: string; token: string | null }
// >("reports/resolve", async ({ reportId, token }) => {
//   const { data } = await http.patch<Report>(
//     `/api/reports/${reportId}/resolve`,
//     {},
//     {
//       headers: { ...authHeader(token) },
//     }
//   );
//   return data;
// });

// export const fetchUserStats = createAsyncThunk<
//   { total: number; resolved: number; inProgress: number },
//   string | null
// >("reports/fetchUserStats", async (token) => {
//   const { data } = await http.get("/api/reports/stats/me", {
//     headers: { ...authHeader(token) },
//   });
//   return data;
// });

// export const fetchMyReports = createAsyncThunk<Report[], string | null>(
//   "reports/fetchMyReports",
//   async (token) => {
//     const { data } = await http.get<Report[]>("/api/reports/me", {
//       headers: { ...authHeader(token) },
//     });
//     return data;
//   }
// );

// export const fetchGlobalStats = createAsyncThunk<
//   { total: number; resolved: number; inProgress: number; new: number },
//   string | null
// >("reports/fetchGlobalStats", async (token) => {
//   const { data } = await http.get("/api/reports/stats", {
//     headers: { ...authHeader(token) },
//   });
//   return data;
// });
