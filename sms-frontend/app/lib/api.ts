// lib/api.ts
import axios from "axios";
import { useAuthStore } from "../store/authStore";

// ✅ CORRECT
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://schoolmanagementsystem-production-b1f0.up.railway.app";
console.log("🔍 API_BASE_URL:", API_BASE_URL);
console.log("🔍 ENV VAR:", process.env.NEXT_PUBLIC_API_URL);
export const api = axios.create({
  baseURL: API_BASE_URL,
  
});

// Attach access token only
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});