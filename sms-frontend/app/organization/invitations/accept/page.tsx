"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Box, Button, Grid, IconButton, InputAdornment,
  TextField, Typography,
} from "@mui/material";
import {
  PersonOutlined, LockOutlined, CheckCircleOutlined,
  Visibility, VisibilityOff, MarkEmailReadOutlined,
} from "@mui/icons-material";
import { api } from "@/app/lib/api";
import toast from "react-hot-toast";
import { C, FONT, EASE, inputSx, GlobalStyles } from "@/components/ui";

export default function AcceptInvitePage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get("token");

  const [name,            setName]            = useState("");
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass,        setShowPass]        = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [success,         setSuccess]         = useState(false);

  // ── Submit ───────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) return toast.error("Passwords do not match");
    if (password.length < 6)          return toast.error("Password must be at least 6 characters");

    setLoading(true);
    try {
      const res = await api.post("/organization/invitations/accept", { token, name, password });
      localStorage.setItem("token", res.data.access_token);
      localStorage.setItem("user",  JSON.stringify(res.data.user));
      setSuccess(true);
      toast.success("Welcome! Redirecting to dashboard…");
      setTimeout(() => router.push("/app/dashboard"), 1500);
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 400) toast.error(err.response.data?.detail || "Invalid request data");
      else if (status === 401) toast.error("Unauthorized — invalid or expired invite link");
      else if (status === 403) toast.error("This invitation is no longer valid");
      else if (err.request)    toast.error("No response from server");
      else                     toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      <GlobalStyles />

      {/* Full-page centered layout */}
      <Box sx={{
        minHeight: "100vh",
        backgroundColor: C.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
      }}>
        <Box sx={{ width: "100%", maxWidth: 440 }}>

          {/* ── Brand / icon ─────────────────────────────────── */}
          <Box sx={{ textAlign: "center", mb: 3.5 }}>
            <Box sx={{
              width: 56, height: 56, borderRadius: "16px",
              backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.25)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              mx: "auto", mb: 2,
            }}>
              <MarkEmailReadOutlined sx={{ fontSize: 26, color: C.accent }} />
            </Box>
            <Typography sx={{ fontFamily: '"DM Serif Display", serif', fontSize: "1.9rem", color: C.textPrimary, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              Accept Invitation
            </Typography>
            <Typography sx={{ fontFamily: FONT, fontSize: "0.82rem", color: C.textSecondary, mt: 0.75, fontWeight: 300 }}>
              Complete your profile to join the organization
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

            {/* Success state */}
            {success ? (
              <Box sx={{ textAlign: "center", py: 3 }}>
                <Box sx={{
                  width: 52, height: 52, borderRadius: "50%",
                  backgroundColor: C.greenDim, border: `1px solid ${C.green}30`,
                  display: "flex", alignItems: "center", justifyContent: "center", mx: "auto", mb: 2,
                }}>
                  <CheckCircleOutlined sx={{ fontSize: 26, color: C.green }} />
                </Box>
                <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: "1rem", color: C.textPrimary, mb: 0.5 }}>
                  Invitation accepted!
                </Typography>
                <Typography sx={{ fontFamily: FONT, fontSize: "0.82rem", color: C.textSecondary }}>
                  Redirecting you to the dashboard…
                </Typography>
              </Box>
            ) : (
              <Box component="form" onSubmit={handleSubmit}>
                <Grid container spacing={2}>

                  {/* Full name */}
                  <Grid item xs={12}>
                    <TextField
                      fullWidth required label="Full Name" sx={inputSx}
                      placeholder="Your full name"
                      value={name}
                      autoFocus
                      onChange={e => setName(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <PersonOutlined sx={{ fontSize: 17, color: C.textSecondary }} />
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
                      placeholder="Min. 6 characters"
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
                              {showPass ? <VisibilityOff sx={{ fontSize: 17 }} /> : <Visibility sx={{ fontSize: 17 }} />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>

                  {/* Confirm password */}
                  <Grid item xs={12}>
                    <TextField
                      fullWidth required label="Confirm Password" sx={inputSx}
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      // Inline match indicator
                      helperText={
                        confirmPassword && password !== confirmPassword
                          ? "Passwords do not match"
                          : confirmPassword && password === confirmPassword
                          ? "✓ Passwords match"
                          : ""
                      }
                      FormHelperTextProps={{
                        sx: {
                          fontFamily: FONT, fontSize: "0.72rem",
                          color: confirmPassword && password === confirmPassword ? C.green : C.red,
                          mt: 0.5,
                        },
                      }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LockOutlined sx={{ fontSize: 17, color: C.textSecondary }} />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setShowConfirm(p => !p)} edge="end"
                              sx={{ color: C.textSecondary, "&:hover": { color: C.accent } }}>
                              {showConfirm ? <VisibilityOff sx={{ fontSize: 17 }} /> : <Visibility sx={{ fontSize: 17 }} />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>

                  {/* Submit */}
                  <Grid item xs={12}>
                    <Button
                      type="submit" fullWidth variant="contained"
                      disabled={loading || !name || !password || !confirmPassword}
                      sx={{
                        backgroundColor: C.accent, color: "#111827",
                        fontFamily: FONT, fontWeight: 600, fontSize: "0.9rem",
                        textTransform: "none", borderRadius: "10px",
                        height: 44, mt: 0.5,
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
                      ) : "Accept Invitation"}
                    </Button>
                  </Grid>

                </Grid>
              </Box>
            )}
          </Box>

          {/* Footer note */}
          {!success && (
            <Typography sx={{ fontFamily: FONT, fontSize: "0.72rem", color: C.textSecondary, textAlign: "center", mt: 2.5 }}>
              This invitation link is single-use and will expire after acceptance.
            </Typography>
          )}

        </Box>
      </Box>
    </>
  );
}