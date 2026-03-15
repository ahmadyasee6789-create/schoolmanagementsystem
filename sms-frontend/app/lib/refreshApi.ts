// lib/refreshApi.ts
import axios from "axios";

export const refreshApi = axios.create({
  baseURL: "http://localhost:8000",
});
