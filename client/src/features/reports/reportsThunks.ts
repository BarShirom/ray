import { createAsyncThunk } from "@reduxjs/toolkit";
import type { Report } from "./reportsSlice";
import axios from "axios";

const API_REPORTS_URL = "http://localhost:3000/api/reports";

const getAuthHeader = (token: string | null) => ({
  headers: {
    Authorization: token ? `Bearer ${token}` : "",
  },
});

export const fetchReports = createAsyncThunk<Report[]>(
  "reports/fetchAll",
  async () => {
    try {
      const response = await axios.get(`${API_REPORTS_URL}`);
      return response.data as Report[];
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
);

export const createReport = createAsyncThunk<
  Report,
  {
    description: string;
    type: Report["type"];
    location: { lat: number; lng: number };
    media?: File[];
    token: string | null;
  }
>("reports/create", async ({ description, type, location, media, token }) => {
  try {
    const formData = new FormData();
    formData.append("description", description);
    formData.append("type", type);
    formData.append("location", JSON.stringify(location));

    if (media && media.length > 0) {
      media.forEach((file) => {
        formData.append("media", file); // ✅ File objects only
      });
    }

    // ✅ Let axios set Content-Type (important for FormData with boundary)
    const config = {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    };

    const response = await axios.post(`${API_REPORTS_URL}`, formData, config);
    return response.data as Report;
  } catch (error) {
    console.log(error);
    throw error;
  }
});

export const claimReport = createAsyncThunk<
  Report,
  { reportId: string; token: string | null }
>("reports/claim", async ({ reportId, token }) => {
  try {
    const response = await axios.patch(
      `${API_REPORTS_URL}/${reportId}/claim`,
      {},
      getAuthHeader(token)
    );
    return response.data as Report;
  } catch (error) {
    console.log(error);
    throw error;
  }
});

export const resolveReport = createAsyncThunk<
  Report,
  { reportId: string; token: string | null }
>("reports/resolve", async ({ reportId, token }) => {
  try {
    const response = await axios.patch(
      `${API_REPORTS_URL}/${reportId}/resolve`,
      {},
      getAuthHeader(token)
    );
    return response.data as Report;
  } catch (error) {
    console.log(error);
    throw error;
  }
});

export const fetchUserStats = createAsyncThunk<
  { total: number; resolved: number; inProgress: number },
  string | null
>("reports/fetchUserStats", async (token) => {
  try {
    const response = await axios.get(
      `${API_REPORTS_URL}/stats/me`,
      getAuthHeader(token)
    );
    return response.data;
  } catch (error) {
    console.log(error);
    throw error;
  }
});

export const fetchMyReports = createAsyncThunk<Report[], string | null>(
  "reports/fetchMyReports",
  async (token) => {
    try {
      const response = await axios.get(
        `${API_REPORTS_URL}/me`,
        getAuthHeader(token)
      );
      return response.data as Report[];
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
);

export const fetchGlobalStats = createAsyncThunk<
  { total: number; resolved: number; inProgress: number; new: number },
  string | null
>("reports/fetchGlobalStats", async (token) => {
  try {
    const response = await axios.get(
      `${API_REPORTS_URL}/stats`,
      getAuthHeader(token)
    );
    return response.data;
  } catch (error) {
    console.log(error);
    throw error;
  }
});

// import { createAsyncThunk } from "@reduxjs/toolkit";
// import type { Report } from "./reportsSlice";
// import axios from "axios";

// const API_REPORTS_URL = "http://localhost:3000/api/reports";

// const getAuthHeader = (token: string | null) => ({
//   headers: {
//     Authorization: token ? `Bearer ${token}` : "",
//   },
// });

// export const fetchReports = createAsyncThunk<Report[]>(
//   "reports/fetchAll",
//   async () => {
//     try {
//       const response = await axios.get(`${API_REPORTS_URL}`);
//       return response.data as Report[];
//     } catch (error) {
//       console.log(error);
//       throw error;
//     }
//   }
// );

// export const createReport = createAsyncThunk<
//   Report,
//   {
//     description: string;
//     type: Report["type"];
//     location: { lat: number; lng: number };
//     media?: File[];
//     token: string | null;
//   }
// >("reports/create", async ({ description, type, location, media, token }) => {
//   try {
//     const formData = new FormData();
//     formData.append("description", description);
//     formData.append("type", type);
//     formData.append("location", JSON.stringify(location));

//     if (media && media.length > 0) {
//       media.forEach((file) => {
//         formData.append("media", file); // ✅ Raw File objects
//       });
//     }

//     const headers: Record<string, string> = {};
//     if (token) {
//       headers.Authorization = `Bearer ${token}`;
//     }

//     const response = await axios.post(`${API_REPORTS_URL}`, formData, {
//       headers, // ✅ Let axios set content-type with boundary
//     });

//     return response.data as Report;
//   } catch (error) {
//     console.log(error);
//     throw error;
//   }
// });

// export const claimReport = createAsyncThunk<
//   Report,
//   { reportId: string; token: string | null }
// >("reports/claim", async ({ reportId, token }) => {
//   try {
//     const response = await axios.patch(
//       `${API_REPORTS_URL}/${reportId}/claim`,
//       {},
//       getAuthHeader(token)
//     );
//     return response.data as Report;
//   } catch (error) {
//     console.log(error);
//     throw error;
//   }
// });

// export const resolveReport = createAsyncThunk<
//   Report,
//   { reportId: string; token: string | null }
// >("reports/resolve", async ({ reportId, token }) => {
//   try {
//     const response = await axios.patch(
//       `${API_REPORTS_URL}/${reportId}/resolve`,
//       {},
//       getAuthHeader(token)
//     );
//     return response.data as Report;
//   } catch (error) {
//     console.log(error);
//     throw error;
//   }
// });

// export const fetchUserStats = createAsyncThunk<
//   { total: number; resolved: number; inProgress: number },
//   string | null
// >("reports/fetchUserStats", async (token) => {
//   try {
//     const response = await axios.get(
//       `${API_REPORTS_URL}/stats/me`,
//       getAuthHeader(token)
//     );
//     return response.data;
//   } catch (error) {
//     console.log(error);
//     throw error;
//   }
// });

// export const fetchMyReports = createAsyncThunk<Report[], string | null>(
//   "reports/fetchMyReports",
//   async (token) => {
//     try {
//       const response = await axios.get(
//         `${API_REPORTS_URL}/me`,
//         getAuthHeader(token)
//       );
//       return response.data as Report[];
//     } catch (error) {
//       console.log(error);
//       throw error;
//     }
//   }
// );

// export const fetchGlobalStats = createAsyncThunk<
//   { total: number; resolved: number; inProgress: number; new: number },
//   string | null
// >("reports/fetchGlobalStats", async (token) => {
//   try {
//     const response = await axios.get(
//       `${API_REPORTS_URL}/stats`,
//       getAuthHeader(token)
//     );
//     return response.data;
//   } catch (error) {
//     console.log(error);
//     throw error;
//   }
// });
