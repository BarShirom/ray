import { createAsyncThunk } from "@reduxjs/toolkit";
import { http } from "../../api/http";
import type { RootState } from "../../app/store";
import { selectToken } from "../auth/authSelectors";
import type { Report, ReportType } from "./reportsSlice";

const authHeader = (token: string | null) =>
  token ? { Authorization: `Bearer ${token}` } : undefined;

export const fetchReports = createAsyncThunk<Report[]>(
  "reports/fetchAll",
  async () => {
    const { data } = await http.get<Report[]>("/api/reports");
    return data;
  }
);

type CreateReportPayload = {
  description: string;
  type: ReportType;
  location: { lat: number; lng: number };
  media?: string[];
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
