"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, LoaderCircle, Rocket } from "lucide-react";
import toast from "react-hot-toast";
import AuthPage, { authStyles as styles } from "@/components/auth/AuthPage";
import { useAuthStore } from "../../store/authStore";
import { authenticatedHome, loginDestination } from "@/app/lib/authRoutes";

type ApiError = { response?: { data?: { detail?: string } } };

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
      router.replace(authenticatedHome(user));
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
      router.replace(loginDestination(redirect, useAuthStore.getState().user));
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
    <AuthPage headingId="signin-heading">
          <header className={styles.cardHeader}>
            <h1 id="signin-heading">Sign in to your account</h1>
            <p>Welcome back! Please enter your credentials.</p>
          </header>

          <form onSubmit={handleSubmit} className={styles.form} aria-busy={loading}>
            <div className={styles.field}>
              <label htmlFor="signin-email">Email address</label>
              <input
                id="signin-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email"
                className={styles.input}
              />
            </div>

            <div className={styles.field}>
              <div className={styles.passwordLabel}>
                <label htmlFor="signin-password">Password</label>
                <Link href="/forgot-password">Forgot password?</Link>
              </div>
              <div className={styles.passwordInput}>
                <input
                  id="signin-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className={styles.input}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  aria-controls="signin-password"
                  className={styles.passwordToggle}
                >
                  {showPassword ? <EyeOff size={21} aria-hidden="true" /> : <Eye size={21} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className={styles.submit}
            >
              {loading && <LoaderCircle size={20} className={styles.spinner} aria-hidden="true" />}
              <span aria-live="polite">{loading ? "Signing in…" : "Sign in"}</span>
            </button>
          </form>

          <div className={styles.divider}><span>OR</span></div>
          <Link href="/#product" className={styles.demo}>
            <Rocket size={20} aria-hidden="true" /> Explore product demo
          </Link>
          <p className={styles.register}>
            Don&apos;t have an account?{" "}
            <Link href="/signup">Create School Account</Link>
          </p>
    </AuthPage>
  );
}
