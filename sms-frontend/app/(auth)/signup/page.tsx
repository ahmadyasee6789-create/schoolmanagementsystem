"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box, Button, Grid, IconButton, InputAdornment, TextField, Typography,
} from "@mui/material";
import {
  PersonOutlined, EmailOutlined, LockOutlined,
  Visibility, VisibilityOff, SchoolOutlined,
} from "@mui/icons-material";
import Link from "next/link";
import { api } from "../../lib/api";
import toast from "react-hot-toast";
import { C, FONT, EASE, inputSx, GlobalStyles } from "@/components/ui";

export default function SignUpPage() {
  const router = useRouter();

  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirmPassword: "",organization_name:"" });
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading,     setLoading]     = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.email || !form.password|| !form.organization_name)
      return toast.error("All fields are required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      return toast.error("Invalid email format");
    if (form.password.length < 6)
      return toast.error("Password must be at least 6 characters");
    if (form.password !== form.confirmPassword)
      return toast.error("Passwords do not match");

    setLoading(true);
    try {
      await api.post("/auth/signup", {
        full_name: form.full_name,
        email:     form.email,
        password:  form.password,
        organization_name:form.organization_name
      });
      toast.success("Account created! Redirecting…");
      router.push("/");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const passMatch = form.confirmPassword && form.password === form.confirmPassword;
  const passMismatch = form.confirmPassword && form.password !== form.confirmPassword;

  return (
    <>
      <GlobalStyles />

      <Box sx={{
        minHeight: "100vh",
        backgroundColor: C.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        p: 2,
      }}>
        <Box sx={{ width: "100%", maxWidth: 440 }}>

          {/* ── Brand header ─────────────────────────────────── */}
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
              Create your organization account
            </Typography>
            <Typography sx={{
              fontFamily: FONT, fontSize: "0.82rem",
              color: C.textSecondary, mt: 0.75, fontWeight: 300,
            }}>
              Set up your school admin account to get started
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
            <Box component="form" onSubmit={handleSubmit}>
              <Grid container spacing={2}>

                {/* Full name */}
                <Grid item xs={12}>
                  <TextField
                    fullWidth required name="full_name" label="Full Name" sx={inputSx}
                    placeholder="Your full name"
                    value={form.full_name}
                    autoFocus
                    onChange={handleChange}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonOutlined sx={{ fontSize: 17, color: C.textSecondary }} />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>

                {/* Email */}
                <Grid item xs={12}>
                  <TextField
                    fullWidth required name="email" label="Email" type="email" sx={inputSx}
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={handleChange}
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
                    fullWidth required name="password" label="Password" sx={inputSx}
                    type={showPass ? "text" : "password"}
                    placeholder="Min. 6 characters"
                    value={form.password}
                    onChange={handleChange}
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
                    fullWidth required name="confirmPassword" label="Confirm Password" sx={inputSx}
                    type={showConfirm ? "text" : "password"}
                    placeholder="Repeat your password"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    helperText={
                      passMatch    ? "✓ Passwords match"      :
                      passMismatch ? "Passwords do not match" : ""
                    }
                    FormHelperTextProps={{
                      sx: {
                        fontFamily: FONT, fontSize: "0.72rem", mt: 0.5,
                        color: passMatch ? C.green : C.red,
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
                    <Grid item xs={12}>
      <TextField
        fullWidth
        required
        name="organization_name"
        label="School Name"
        placeholder="Enter your school name"
        value={form.organization_name}
        onChange={handleChange}
        sx={inputSx}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SchoolOutlined sx={{ fontSize: 17, color: C.textSecondary }} />
            </InputAdornment>
          ),
        }}
      />
    </Grid>

                {/* Submit */}
                <Grid item xs={12}>
                  <Button
                    type="submit" fullWidth variant="contained"
                    disabled={loading || !form.full_name || !form.email || !form.password || !form.confirmPassword}
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
                    ) : "Create Account"}
                  </Button>
                </Grid>

              </Grid>
            </Box>
          </Box>

          {/* ── Footer ───────────────────────────────────────── */}
          <Typography sx={{
            fontFamily: FONT, fontSize: "0.78rem",
            color: C.textSecondary, textAlign: "center", mt: 2.5,
          }}>
            Already have an account?{" "}
            <Link href="/signin" style={{ color: C.accent, fontWeight: 600, textDecoration: "none" }}>
              Sign In
            </Link>
          </Typography>

        </Box>
      </Box>
    </>
  );
}