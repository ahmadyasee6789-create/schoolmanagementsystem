"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box, Button, Grid, InputAdornment,
  TextField, Typography,
} from "@mui/material";
import {
  EmailOutlined, SchoolOutlined,
  CheckCircleOutlined, ArrowBackOutlined,
} from "@mui/icons-material";
import Link from "next/link";
import { api } from "../../lib/api";
import toast from "react-hot-toast";
import { C, FONT, EASE, inputSx, GlobalStyles } from "@/components/ui";

export default function ForgotPasswordPage() {
  const router  = useRouter();
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email)                                     return toast.error("Please enter your email address");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Invalid email format");

    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err: any) {
      // Always show success to avoid email enumeration
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <GlobalStyles />

      <Box sx={{
        minHeight: "100vh",
        backgroundColor: C.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        p: 2,
      }}>
        <Box sx={{ width: "100%", maxWidth: 420 }}>

          {/* ── Brand header ─────────────────────────────────── */}
          <Box sx={{ textAlign: "center", mb: 3.5 }}>
            <Box sx={{
              width: 56, height: 56, borderRadius: "16px",
              backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.25)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              mx: "auto", mb: 2,
              transition: `background ${EASE}`,
            }}>
              {sent
                ? <CheckCircleOutlined sx={{ fontSize: 28, color: C.green }} />
                : <SchoolOutlined      sx={{ fontSize: 28, color: C.accent }} />
              }
            </Box>

            <Typography sx={{
              fontFamily: '"DM Serif Display", serif',
              fontSize: "2rem", color: C.textPrimary,
              lineHeight: 1.1, letterSpacing: "-0.02em",
            }}>
              {sent ? "Check your inbox" : "Forgot password?"}
            </Typography>
            <Typography sx={{
              fontFamily: FONT, fontSize: "0.82rem",
              color: C.textSecondary, mt: 0.75, fontWeight: 300,
              maxWidth: 300, mx: "auto",
            }}>
              {sent
                ? `We sent a password reset link to ${email}`
                : "Enter your email and we'll send you a reset link"
              }
            </Typography>
          </Box>

          {/* ── Card ─────────────────────────────────────────── */}
          <Box sx={{
            backgroundColor: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: "16px",
            p: { xs: 2.5, sm: 3.5 },
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}>

            {/* ── Sent state ───────────────────────────────── */}
            {sent ? (
              <Box sx={{ textAlign: "center", py: 1 }}>
                {/* Email pill */}
                <Box sx={{
                  display: "inline-flex", alignItems: "center", gap: 1,
                  backgroundColor: C.greenDim, border: `1px solid ${C.green}30`,
                  borderRadius: "10px", px: 2, py: 0.9, mb: 3,
                }}>
                  <EmailOutlined sx={{ fontSize: 15, color: C.green }} />
                  <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.82rem", color: C.green, fontWeight: 600 }}>
                    {email}
                  </Typography>
                </Box>

                <Typography sx={{ fontFamily: FONT, fontSize: "0.82rem", color: C.textSecondary, mb: 3, lineHeight: 1.6 }}>
                  If this email is registered, you'll receive a reset link shortly.
                  Check your spam folder if you don't see it.
                </Typography>

                {/* Resend */}
                <Button
                  fullWidth variant="contained"
                  onClick={() => { setSent(false); setEmail(""); }}
                  sx={{
                    backgroundColor: C.accent, color: "#111827",
                    fontFamily: FONT, fontWeight: 600, fontSize: "0.9rem",
                    textTransform: "none", borderRadius: "10px", height: 44,
                    "&:hover": { backgroundColor: "#FBBF24" },
                    transition: `all ${EASE}`,
                  }}
                >
                  Send another link
                </Button>
              </Box>

            ) : (
              /* ── Form ───────────────────────────────────── */
              <Box component="form" onSubmit={handleSubmit}>
                <Grid container spacing={2}>

                  {/* Email */}
                  <Grid item xs={12}>
                    <TextField
                      fullWidth required label="Email Address" type="email" sx={inputSx}
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

                  {/* Submit */}
                  <Grid item xs={12}>
                    <Button
                      type="submit" fullWidth variant="contained"
                      disabled={loading || !email}
                      sx={{
                        backgroundColor: C.accent, color: "#111827",
                        fontFamily: FONT, fontWeight: 600, fontSize: "0.9rem",
                        textTransform: "none", borderRadius: "10px", height: 44, mt: 0.5,
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
                      ) : "Send Reset Link"}
                    </Button>
                  </Grid>

                </Grid>
              </Box>
            )}
          </Box>

          {/* ── Footer ───────────────────────────────────────── */}
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5, mt: 2.5 }}>
            <ArrowBackOutlined sx={{ fontSize: 13, color: C.textSecondary }} />
            <Typography sx={{ fontFamily: FONT, fontSize: "0.78rem", color: C.textSecondary }}>
              <Link href="/signin" style={{ color: C.accent, fontWeight: 600, textDecoration: "none" }}>
                Back to Sign In
              </Link>
            </Typography>
          </Box>

        </Box>
      </Box>
    </>
  );
}