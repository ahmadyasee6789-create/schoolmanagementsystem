// lib/refreshApi.ts
import axios from "axios";

// ✅ CORRECT - Proper variable assignment
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://schoolmanagementsystem-production-b1f0.up.railway.app";

export const refreshApi = axios.create({
  baseURL: API_BASE_URL,
});