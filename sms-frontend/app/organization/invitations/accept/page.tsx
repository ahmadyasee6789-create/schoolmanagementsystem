"use client";

import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, MailCheck, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { inputClass, primaryButtonClass } from "@/components/exams/ExamUi";

const inviteError = (error: unknown) => {
  const request = error as { response?: { status?: number; data?: { detail?: string } }; request?: unknown; message?: string };
  if (request.response?.status === 400) return request.response.data?.detail || "Invalid request data";
  if (request.response?.status === 401) return "Unauthorized — invalid or expired invite link";
  if (request.response?.status === 403) return "This invitation is no longer valid";
  if (request.request) return "No response from server";
  return request.message || "Something went wrong";
};

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) return toast.error("Passwords do not match");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setLoading(true);
    try {
      const response = await api.post("/organization/invitations/accept", { token, name, password });
      localStorage.setItem("token", response.data.access_token);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      setSuccess(true);
      toast.success("Welcome! Redirecting to dashboard…");
      window.setTimeout(() => router.push("/app/dashboard"), 1500);
    } catch (requestError: unknown) { toast.error(inviteError(requestError)); }
    finally { setLoading(false); }
  };

  const passwordMatches = Boolean(confirmPassword) && password === confirmPassword;
  const passwordMismatch = Boolean(confirmPassword) && password !== confirmPassword;
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-[#0D1117] sm:p-6"><div className="w-full max-w-md"><header className="mb-7 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#8B6DF2]/20 bg-[#8B6DF2]/10"><MailCheck size={27} className="text-[#8B6DF2]" /></span><h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Accept Invitation</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Complete your profile to join the organization</p></header>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/40 dark:border-white/10 dark:bg-[#1a2233] dark:shadow-black/20 sm:p-7">{success ? <div className="py-8 text-center"><span className="mx-auto flex h-13 w-13 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-500/10"><CheckCircle2 size={27} className="text-emerald-600 dark:text-emerald-400" /></span><h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-50">Invitation accepted!</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Redirecting you to the dashboard…</p></div> : <form className="space-y-5" onSubmit={handleSubmit}><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Full Name<span className="ml-1 text-red-500">*</span><span className="relative mt-1.5 block"><UserRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" /><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" className={`${inputClass} pl-9`} /></span></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Password<span className="ml-1 text-red-500">*</span><span className="relative mt-1.5 block"><KeyRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" /><input required type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Min. 6 characters" className={`${inputClass} px-9`} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#8B6DF2] dark:text-slate-500 dark:hover:bg-white/5"><>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</></button></span></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Confirm Password<span className="ml-1 text-red-500">*</span><span className="relative mt-1.5 block"><KeyRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" /><input required type={showConfirm ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" className={`${inputClass} px-9 ${passwordMismatch ? "border-red-400 focus:border-red-500" : passwordMatches ? "border-emerald-400 focus:border-emerald-500" : ""}`} /><button type="button" aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"} onClick={() => setShowConfirm((visible) => !visible)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#8B6DF2] dark:text-slate-500 dark:hover:bg-white/5"><>{showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}</></button></span>{passwordMismatch && <span className="mt-1.5 block text-xs text-red-600 dark:text-red-400">Passwords do not match</span>}{passwordMatches && <span className="mt-1.5 block text-xs text-emerald-600 dark:text-emerald-400">Passwords match</span>}</label><button type="submit" disabled={loading || !name || !password || !confirmPassword} className={`${primaryButtonClass} flex h-11 w-full items-center justify-center gap-2`}>{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}{loading ? "Accepting…" : "Accept Invitation"}</button></form>}</section>
    {!success && <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">This invitation link is single-use and expires after acceptance.</p>}
  </div></main>;
}
