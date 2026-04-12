// lib/api.ts
import axios from "axios";
import { useAuthStore } from "../store/authStore";

// ✅ CORRECT - Uses environment variable
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
});

// Attach access token only
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
