"use client";

import React, { useEffect, useState } from "react";
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, IconButton, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography, Tooltip,
  useMediaQuery, useTheme,
} from "@mui/material";
import {
  Close, CalendarTodayOutlined, CheckCircleOutlined,
  RadioButtonUncheckedOutlined, EventOutlined, PlayArrowOutlined,
} from "@mui/icons-material";
import { api } from "@/app/lib/api";
import toast from "react-hot-toast";
import {
  C, FONT, EASE, inputSx,
  GlobalStyles, PageHeader, EmptyState, DataTable, MobileFab,
} from "@/components/ui";

// ─── Types ──────────────────────────────────────────────────────────────
type Session = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};
type SessionForm = { name: string; start_date: string; end_date: string };

// ─── Helpers ─────────────────────────────────────────────────────────────
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// ─── Status chip ─────────────────────────────────────────────────────────
function StatusChip({ active }: { active: boolean }) {
  return (
    <Chip
      icon={active
        ? <CheckCircleOutlined          sx={{ fontSize: "13px !important", color: `${C.green}  !important` }} />
        : <RadioButtonUncheckedOutlined sx={{ fontSize: "13px !important", color: `${C.textSecondary} !important` }} />
      }
      label={active ? "Active" : "Inactive"} size="small"
      sx={{
        backgroundColor: active ? C.greenDim : "rgba(255,255,255,0.04)",
        color:           active ? C.green    : C.textSecondary,
        fontFamily: FONT, fontWeight: 600, fontSize: "0.7rem",
        height: 22,
        border: `1px solid ${active ? C.green + "30" : C.border}`,
        "& .MuiChip-icon": { ml: "6px" },
      }}
    />
  );
}

// ─── Mobile session card ─────────────────────────────────────────────────
function SessionCard({ session, onActivate }: {
  session: Session; onActivate: () => void;
}) {
  return (
    <Box sx={{
      backgroundColor: C.surface, border: `1px solid ${session.is_active ? C.green + "40" : C.border}`,
      borderRadius: "12px", p: 2, mb: 1.5,
      transition: `border-color ${EASE}`,
      "&:hover": { borderColor: session.is_active ? C.green + "60" : "rgba(245,158,11,0.25)" },
    }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1.25 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: "10px",
            backgroundColor: session.is_active ? C.greenDim : C.accentDim,
            border: `1px solid ${session.is_active ? C.green + "25" : "rgba(245,158,11,0.2)"}`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <CalendarTodayOutlined sx={{ fontSize: 17, color: session.is_active ? C.green : C.accent }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "0.925rem", color: C.textPrimary, fontFamily: FONT, lineHeight: 1.2 }}>
              {session.name}
            </Typography>
            <StatusChip active={session.is_active} />
          </Box>
        </Box>

        {!session.is_active && (
          <Button
            size="small"
            onClick={onActivate}
            startIcon={<PlayArrowOutlined sx={{ fontSize: 13 }} />}
            sx={{
              color: C.accent, fontFamily: FONT, fontWeight: 600, fontSize: "0.72rem",
              textTransform: "none", borderRadius: "7px", px: 1.25,
              border: `1px solid ${C.accent}30`,
              "&:hover": { backgroundColor: C.accentDim },
            }}
          >
            Activate
          </Button>
        )}
      </Box>

      {/* Date range */}
      <Box sx={{ display: "flex", gap: 2, mt: 0.5 }}>
        {[
          { label: "Start", value: fmtDate(session.start_date) },
          { label: "End",   value: fmtDate(session.end_date)   },
        ].map(d => (
          <Box key={d.label}>
            <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.65rem", color: C.textSecondary, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {d.label}
            </Typography>
            <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.78rem", color: C.textPrimary, fontWeight: 500 }}>
              {d.value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function AcademicSessionsPage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [open,     setOpen]     = useState(false);
  const [form,     setForm]     = useState<SessionForm>({ name: "", start_date: "", end_date: "" });
  const [saving,   setSaving]   = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────
  const fetchSessions = async () => {
    try {
      const res = await api.get("/sessions");
      setSessions(res.data);
    } catch { toast.error("Failed to load sessions"); }
    finally  { setLoading(false); }
  };



  // ── Create ─────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.name.trim() || !form.start_date || !form.end_date)
      return toast.error("Please fill in all fields");
    setSaving(true);
    try {
      await api.post("/sessions", { ...form, is_active: false });
      toast.success("Session created");
      setOpen(false);
      setForm({ name: "", start_date: "", end_date: "" });
      fetchSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Error creating session");
    } finally { setSaving(false); }
  };

  // ── Activate ───────────────────────────────────────────────────────
  const handleSetActive = async (id: number) => {
    try {
      const res = await api.put(`/sessions/${id}/activate`);
      toast.success(`Session "${res.data.name}" activated`);
      fetchSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to activate session");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
      <GlobalStyles />

      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: "100%" }}>

        {/* ── Header ──────────────────────────────────────────── */}
        <PageHeader
          title="Academic Sessions"
          subtitle="Manage school years and set the active academic session"
          actionLabel="Add Session"
          onAction={() => setOpen(true)}
          isMobile={isMobile}
        />

        {/* ── Content ─────────────────────────────────────────── */}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <Box sx={{
              width: 32, height: 32, borderRadius: "50%",
              border: `3px solid ${C.accentDim}`, borderTopColor: C.accent,
              animation: "spin 0.7s linear infinite",
              "@keyframes spin": { to: { transform: "rotate(360deg)" } },
            }} />
          </Box>

        ) : sessions.length === 0 ? (
          <EmptyState
            icon={CalendarTodayOutlined}
            message="No academic sessions found"
            actionLabel="Add Session"
            onAction={() => setOpen(true)}
          />

        ) : isMobile ? (
          /* ── Mobile cards ──────────────────────────────────── */
          <Box>
            {sessions.map(s => (
              <SessionCard key={s.id} session={s} onActivate={() => handleSetActive(s.id)} />
            ))}
          </Box>

        ) : (
          /* ── Desktop table ──────────────────────────────────── */
          <DataTable>
            <Table>
              <TableHead>
                <TableRow>
                  {["Session", "Start Date", "End Date", "Status", "Actions"].map(h => (
                    <TableCell key={h} sx={{
                      fontFamily: '"DM Mono", monospace',
                      fontSize: "0.68rem", fontWeight: 500,
                      letterSpacing: "0.12em", textTransform: "uppercase",
                      color: C.textSecondary, borderBottom: `1px solid ${C.border}`,
                      py: 1.25, px: 2,
                    }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {sessions.map((s, i) => (
                  <TableRow
                    key={s.id}
                    sx={{
                      "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" },
                      transition: `background ${EASE}`,
                      animation: `fadeUp 0.3s ${i * 35}ms ease both`,
                      "@keyframes fadeUp": {
                        from: { opacity: 0, transform: "translateY(8px)" },
                        to:   { opacity: 1, transform: "translateY(0)" },
                      },
                    }}
                  >
                    {/* Name */}
                    <TableCell sx={{ borderColor: C.border, py: 1.5, px: 2 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Box sx={{
                          width: 32, height: 32, borderRadius: "9px",
                          backgroundColor: s.is_active ? C.greenDim : C.accentDim,
                          border: `1px solid ${s.is_active ? C.green + "25" : "rgba(245,158,11,0.18)"}`,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          <CalendarTodayOutlined sx={{ fontSize: 15, color: s.is_active ? C.green : C.accent }} />
                        </Box>
                        <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: "0.875rem", color: C.textPrimary }}>
                          {s.name}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Start date */}
                    <TableCell sx={{ borderColor: C.border, py: 1.5, px: 2 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        <EventOutlined sx={{ fontSize: 13, color: C.textSecondary }} />
                        <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.8rem", color: C.textPrimary }}>
                          {fmtDate(s.start_date)}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* End date */}
                    <TableCell sx={{ borderColor: C.border, py: 1.5, px: 2 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        <EventOutlined sx={{ fontSize: 13, color: C.textSecondary }} />
                        <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.8rem", color: C.textPrimary }}>
                          {fmtDate(s.end_date)}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Status */}
                    <TableCell sx={{ borderColor: C.border, py: 1.5, px: 2 }}>
                      <StatusChip active={s.is_active} />
                    </TableCell>

                    {/* Actions */}
                    <TableCell sx={{ borderColor: C.border, py: 1.5, px: 2 }}>
                      {!s.is_active ? (
                        <Tooltip title="Set as active session" arrow>
                          <Button
                            size="small"
                            onClick={() => handleSetActive(s.id)}
                            startIcon={<PlayArrowOutlined sx={{ fontSize: 13 }} />}
                            sx={{
                              color: C.accent, fontFamily: FONT, fontWeight: 600,
                              fontSize: "0.72rem", textTransform: "none",
                              borderRadius: "8px", px: 1.5,
                              border: `1px solid ${C.accent}30`,
                              "&:hover": { backgroundColor: C.accentDim },
                              transition: `all ${EASE}`,
                            }}
                          >
                            Activate
                          </Button>
                        </Tooltip>
                      ) : (
                        <Typography sx={{ fontFamily: FONT, fontSize: "0.75rem", color: C.green, fontStyle: "italic" }}>
                          Current session
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        )}

        {/* Mobile FAB */}
        {isMobile && <MobileFab onClick={() => setOpen(true)} />}

        {/* ── Add Session Dialog ─────────────────────────────── */}
        <Dialog
          open={open} onClose={() => setOpen(false)}
          fullWidth maxWidth="xs" fullScreen={isMobile}
          PaperProps={{ sx: {
            backgroundColor: C.surface,
            border: isMobile ? "none" : `1px solid ${C.border}`,
            borderRadius: isMobile ? 0 : "16px",
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}}
        >
          <DialogTitle sx={{
            fontFamily: FONT, fontWeight: 700, fontSize: "1.05rem",
            color: C.textPrimary, borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <CalendarTodayOutlined sx={{ fontSize: 18, color: C.accent }} />
              Add Academic Session
            </Box>
            {isMobile && (
              <IconButton onClick={() => setOpen(false)} sx={{ color: C.textSecondary }}>
                <Close />
              </IconButton>
            )}
          </DialogTitle>

          <DialogContent sx={{ pt: 2.5 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth required label="Session Name" sx={inputSx}
                  placeholder="e.g. 2025 – 2026"
                  value={form.name}
                  autoFocus
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth required type="date" label="Start Date" sx={inputSx}
                  value={form.start_date}
                  InputLabelProps={{ shrink: true }}
                  onChange={e => setForm({ ...form, start_date: e.target.value })}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth required type="date" label="End Date" sx={inputSx}
                  value={form.end_date}
                  InputLabelProps={{ shrink: true }}
                  onChange={e => setForm({ ...form, end_date: e.target.value })}
                />
              </Grid>
            </Grid>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, borderTop: `1px solid ${C.border}` }}>
            <Button
              onClick={() => setOpen(false)} disabled={saving}
              sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: "none", borderRadius: "8px" }}
            >
              Cancel
            </Button>
            <Button
              variant="contained" onClick={handleCreate}
              disabled={saving || !form.name.trim() || !form.start_date || !form.end_date}
              sx={{
                backgroundColor: C.accent, color: "#111827",
                fontFamily: FONT, fontWeight: 600,
                textTransform: "none", borderRadius: "10px", px: 3,
                "&:hover": { backgroundColor: "#FBBF24" },
                "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" },
              }}
            >
              {saving ? "Creating…" : "Save Session"}
            </Button>
          </DialogActions>
        </Dialog>

      </Box>
    </>
  );
}