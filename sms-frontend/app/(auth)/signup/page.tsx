"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  Mail,
  School,
  UserRound,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../../lib/api";

type ApiError = { response?: { data?: { detail?: string } }; message?: string };

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500";

type FormState = {
  full_name: string;
  email: string;
  password: string;
  confirmPassword: string;
  organization_name: string;
};

const emptyForm: FormState = {
  full_name: "",
  email: "",
  password: "",
  confirmPassword: "",
  organization_name: "",
};

export default function SignUpPage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const updateField =
    (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const passMatch = form.confirmPassword && form.password === form.confirmPassword;
  const passMismatch = form.confirmPassword && form.password !== form.confirmPassword;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.full_name || !form.email || !form.password || !form.organization_name) {
      toast.error("All fields are required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("Invalid email format");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/signup", {
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        organization_name: form.organization_name,
      });
      toast.success("Account created! Redirecting…");
      router.push("/signin");
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.detail || apiError.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4 dark:bg-[#0D1117]">
      <div className="w-full max-w-[440px]">
        {/* Brand header */}
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#8B6DF2]/20 bg-[#8B6DF2]/10">
            <GraduationCap size={28} className="text-[#8B6DF2]" />
          </span>
          <h1 className="text-[2rem] font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
            Create your organization account
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Set up your school admin account to get started
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-white/[0.03] sm:p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Full Name
              <div className="relative mt-1.5">
                <UserRound
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <input
                  required
                  autoFocus
                  value={form.full_name}
                  onChange={updateField("full_name")}
                  placeholder="Your full name"
                  className={inputClass}
                />
              </div>
            </label>

            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Email
              <div className="relative mt-1.5">
                <Mail
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={updateField("email")}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
            </label>

            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Password
              <div className="relative mt-1.5">
                <Lock
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={updateField("password")}
                  placeholder="Min. 6 characters"
                  className={`${inputClass} pr-9`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-[#8B6DF2] dark:text-slate-500"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Confirm Password
              <div className="relative mt-1.5">
                <Lock
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <input
                  type={showConfirm ? "text" : "password"}
                  required
                  value={form.confirmPassword}
                  onChange={updateField("confirmPassword")}
                  placeholder="Repeat your password"
                  className={`${inputClass} pr-9`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-[#8B6DF2] dark:text-slate-500"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {passMatch ? (
                <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={13} />
                  Passwords match
                </span>
              ) : passMismatch ? (
                <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-500">
                  <XCircle size={13} />
                  Passwords do not match
                </span>
              ) : null}
            </label>

            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              School Name
              <div className="relative mt-1.5">
                <School
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <input
                  required
                  value={form.organization_name}
                  onChange={updateField("organization_name")}
                  placeholder="Enter your school name"
                  className={inputClass}
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={
                loading ||
                !form.full_name ||
                !form.email ||
                !form.password ||
                !form.confirmPassword ||
                !form.organization_name
              }
              className="flex w-full items-center justify-center rounded-lg bg-[#8B6DF2] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
          Already have an account?{" "}
          <Link href="/signin" className="font-semibold text-[#8B6DF2] hover:text-indigo-400">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}