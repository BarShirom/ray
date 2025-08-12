import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { setAuth, logout } from "./authSlice";

 const API_AUTH_URL = "http://localhost:3000/api/auth";

export const registerUser = createAsyncThunk(
  "auth/registerUser",
  async (
    userData: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      company?: string;
    },
    { dispatch, rejectWithValue }
  ) => {
    try {
      const res = await axios.post(`${API_AUTH_URL}/register`, userData);
      dispatch(setAuth(res.data.user));
      return res.data;
    } catch (error) {
      console.log(error);
      return rejectWithValue("Registration failed");
    }
  }
);

export const loginUser = createAsyncThunk(
  "auth/loginUser",
  async (
    userData: { email: string; password: string },
    { dispatch, rejectWithValue }
  ) => {
    try {
      const res = await axios.post(`${API_AUTH_URL}/login`, userData);
      dispatch(setAuth(res.data.user));
      return res.data;
    } catch (error) {
      console.log(error);
      return rejectWithValue("Login failed");
    }
  }
);

export const logoutUser = createAsyncThunk(
  "auth/logoutUser",
  async (_, { dispatch }) => {
    localStorage.clear();
    dispatch(logout());
  }
);
