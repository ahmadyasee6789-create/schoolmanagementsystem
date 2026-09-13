"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, GraduationCap, Lock, Mail } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "../../store/authStore";

type ApiError = { response?: { data?: { detail?: string } } };

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500";

export default function SignInPage() {
  const router = useRouter();
  const { hydrated, user } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!hydrated) return;
    if (user) {
      router.replace(user.is_superadmin ? "/superadmin" : "/");
    }
  }, [hydrated, user, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      toast.error("All fields are required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Invalid email format");
      return;
    }

    setLoading(true);
    try {
      const redirect = await useAuthStore.getState().login(email, password);
      router.replace(redirect ?? "/");
    } catch (error: unknown) {
      const msg =
        (error as ApiError).response?.data?.detail || "Invalid email or password";
      if (msg.includes("expired")) {
        toast.error(`⏳ ${msg}`, { duration: 6000 });
      } else if (msg.includes("suspended")) {
        toast.error(`🚫 ${msg}`, { duration: 6000 });
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!hydrated) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4 dark:bg-[#0D1117]">
      <div className="w-full max-w-[420px]">
        {/* Brand header */}
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#8B6DF2]/20 bg-[#8B6DF2]/10">
            <GraduationCap size={28} className="text-[#8B6DF2]" />
          </span>
          <h1 className="text-[2rem] font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Sign in to your school dashboard
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-white/[0.03] sm:p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
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
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
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
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Your password"
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

            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-slate-500 transition-colors hover:text-[#8B6DF2] dark:text-slate-400"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="flex w-full items-center justify-center rounded-lg bg-[#8B6DF2] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-[#8B6DF2] hover:text-indigo-400">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}