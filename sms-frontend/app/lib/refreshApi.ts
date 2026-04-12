// lib/refreshApi.ts
import axios from "axios";

// ✅ CORRECT - Uses environment variable
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const refreshApi = axios.create({
  baseURL: API_BASE_URL,
});
