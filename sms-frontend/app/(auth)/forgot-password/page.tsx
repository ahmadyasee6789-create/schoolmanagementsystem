"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, GraduationCap, Mail } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../../lib/api";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Invalid email format");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch {
      // Always show success to avoid email enumeration
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4 dark:bg-[#0D1117]">
      <div className="w-full max-w-[420px]">
        {/* Brand header */}
        <div className="mb-7 text-center">
          <span
            className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border transition-colors ${
              sent
                ? "border-emerald-400/25 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-500/10"
                : "border-[#8B6DF2]/20 bg-[#8B6DF2]/10"
            }`}
          >
            {sent ? (
              <CheckCircle2 size={28} className="text-emerald-500" />
            ) : (
              <GraduationCap size={28} className="text-[#8B6DF2]" />
            )}
          </span>
          <h1 className="text-[2rem] font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
            {sent ? "Check your inbox" : "Forgot password?"}
          </h1>
          <p className="mx-auto mt-1.5 max-w-[300px] text-sm text-slate-500 dark:text-slate-400">
            {sent
              ? `We sent a password reset link to ${email}`
              : "Enter your email and we'll send you a reset link"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-white/[0.03] sm:p-7">
          {sent ? (
            <div className="py-1 text-center">
              <span className="mb-6 inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-50 px-4 py-2 dark:border-emerald-400/20 dark:bg-emerald-500/10">
                <Mail size={15} className="text-emerald-600 dark:text-emerald-400" />
                <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {email}
                </span>
              </span>

              <p className="mb-6 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                If this email is registered, you&apos;ll receive a reset link
                shortly. Check your spam folder if you don&apos;t see it.
              </p>

              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
                className="w-full rounded-lg bg-[#8B6DF2] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
              >
                Send another link
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Email Address
                <div className="relative mt-1.5">
                  <Mail
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                  />
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={loading || !email}
                className="flex w-full items-center justify-center rounded-lg bg-[#8B6DF2] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  "Send Reset Link"
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <ArrowLeft size={13} />
          <Link href="/signin" className="font-semibold text-[#8B6DF2] hover:text-indigo-400">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}