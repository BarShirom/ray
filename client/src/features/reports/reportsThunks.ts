import { createAsyncThunk } from "@reduxjs/toolkit";
import type { Report } from "./reportsSlice";


export const fetchReports = createAsyncThunk("reports/fetchAll", async () => {
  const response = await fetch("/api/reports");
  const data = await response.json();
  return data as Report[];
});
