"use client";

import React, { useEffect, useState } from "react";
import {
  Box, Button, Grid, IconButton, InputAdornment,
  TextField, Typography,
} from "@mui/material";
import {
  EmailOutlined, LockOutlined,
  Visibility, VisibilityOff, SchoolOutlined,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "../../store/authStore";
import toast from "react-hot-toast";
import { C, FONT, EASE, inputSx, GlobalStyles } from "@/components/ui";

export default function SignInPage() {
  const router = useRouter();
  const { hydrated, user } = useAuthStore();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);

  // ── Redirect if already logged in ─────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    if (user) router.replace("/");
  }, [hydrated, user, router]);

  // ── Submit ─────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password)           return toast.error("All fields are required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Invalid email format");

    setLoading(true);
    try {
      await useAuthStore.getState().login(email, password);
      router.replace("/");
    } catch {
      toast.error("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  if (!hydrated) return null;

  return (
    <>
      <GlobalStyles />

      <Box sx={{
        minHeight: "100vh",
        backgroundColor: C.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
      }}>
        <Box sx={{ width: "100%", maxWidth: 420 }}>

          {/* ── Brand header ────────────────────────────────── */}
          <Box sx={{ textAlign: "center", mb: 3.5 }}>
            <Box sx={{
              width: 56, height: 56, borderRadius: "16px",
              backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.25)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              mx: "auto", mb: 2,
            }}>
              <SchoolOutlined sx={{ fontSize: 28, color: C.accent }} />
            </Box>
            <Typography sx={{
              fontFamily: '"DM Serif Display", serif',
              fontSize: "2rem", color: C.textPrimary,
              lineHeight: 1.1, letterSpacing: "-0.02em",
            }}>
              Welcome back
            </Typography>
            <Typography sx={{
              fontFamily: FONT, fontSize: "0.82rem",
              color: C.textSecondary, mt: 0.75, fontWeight: 300,
            }}>
              Sign in to your school dashboard
            </Typography>
          </Box>

          {/* ── Card ────────────────────────────────────────── */}
          <Box sx={{
            backgroundColor: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: "16px",
            p: { xs: 2.5, sm: 3.5 },
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}>
            <Box component="form" onSubmit={handleSubmit}>
              <Grid container spacing={2}>

                {/* Email */}
                <Grid item xs={12}>
                  <TextField
                    fullWidth required label="Email" type="email" sx={inputSx}
                    placeholder="you@example.com"
                    value={email}
                    autoFocus
                    onChange={e => setEmail(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <EmailOutlined sx={{ fontSize: 17, color: C.textSecondary }} />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>

                {/* Password */}
                <Grid item xs={12}>
                  <TextField
                    fullWidth required label="Password" sx={inputSx}
                    type={showPass ? "text" : "password"}
                    placeholder="Your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlined sx={{ fontSize: 17, color: C.textSecondary }} />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowPass(p => !p)} edge="end"
                            sx={{ color: C.textSecondary, "&:hover": { color: C.accent } }}>
                            {showPass
                              ? <VisibilityOff sx={{ fontSize: 17 }} />
                              : <Visibility    sx={{ fontSize: 17 }} />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>

                {/* Forgot password */}
                <Grid item xs={12} sx={{ pt: "4px !important", textAlign: "right" }}>
                  <Typography
                    component="span"
                    onClick={() => router.push("/forgot-password")}
                    sx={{
                      fontFamily: FONT, fontSize: "0.78rem",
                      color: C.textSecondary, cursor: "pointer",
                      "&:hover": { color: C.accent },
                      transition: `color ${EASE}`,
                    }}
                  >
                    Forgot password?
                  </Typography>
                </Grid>

                {/* Submit */}
                <Grid item xs={12}>
                  <Button
                    type="submit" fullWidth variant="contained"
                    disabled={loading || !email || !password}
                    sx={{
                      backgroundColor: C.accent, color: "#111827",
                      fontFamily: FONT, fontWeight: 600, fontSize: "0.9rem",
                      textTransform: "none", borderRadius: "10px", height: 44,
                      "&:hover": { backgroundColor: "#FBBF24" },
                      "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" },
                      transition: `all ${EASE}`,
                    }}
                  >
                    {loading ? (
                      <Box sx={{
                        width: 20, height: 20, borderRadius: "50%",
                        border: "2px solid rgba(17,24,39,0.3)",
                        borderTopColor: "#111827",
                        animation: "spin 0.7s linear infinite",
                        "@keyframes spin": { to: { transform: "rotate(360deg)" } },
                      }} />
                    ) : "Sign In"}
                  </Button>
                </Grid>

              </Grid>
            </Box>
          </Box>

          {/* ── Footer ──────────────────────────────────────── */}
          <Typography sx={{
            fontFamily: FONT, fontSize: "0.78rem",
            color: C.textSecondary, textAlign: "center", mt: 2.5,
          }}>
            Don't have an account?{" "}
            <Link href="/signup" style={{
              color: C.accent,
              fontWeight: 600,
              textDecoration: "none",
            }}>
              Sign Up
            </Link>
          </Typography>

        </Box>
      </Box>
    </>
  );
}