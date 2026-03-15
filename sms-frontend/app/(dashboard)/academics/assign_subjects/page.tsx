"use client";

import React, { useEffect, useState } from "react";
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, IconButton, MenuItem, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
  Tooltip, useMediaQuery, useTheme,
} from "@mui/material";
import { Close, Delete, LayersOutlined, MenuBook, Search } from "@mui/icons-material";
import { ClassOutlined } from "@mui/icons-material";
import { api } from "@/app/lib/api";
import toast from "react-hot-toast";
import {
  C, FONT, EASE, inputSx, menuProps, thSx, tdSx,
  GlobalStyles, PageHeader, EmptyState,
  DeleteDialog, DataTable, MobileFab,
} from "@/components/ui";

// ─── Types ──────────────────────────────────────────────────────────────
type Assignment = {
  id: number;
  classroom_id: number;
  classroom_name: string;
  section: string;
  subject_id: number;
  subject_name: string;
};
type ClassItem   = { id: number; class_name: string; section: string };
type SubjectItem = { id: number; name: string };
type AssignForm  = { classroom_id: number | ""; subject_id: number | "" };

// ─── Mobile card ─────────────────────────────────────────────────────────
function AssignmentCard({ a, onDelete }: { a: Assignment; onDelete: () => void }) {
  return (
    <Box sx={{
      backgroundColor: C.surface, border: `1px solid ${C.border}`,
      borderRadius: "12px", p: 2, mb: 1.5,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      transition: `border-color ${EASE}`,
      "&:hover": { borderColor: "rgba(245,158,11,0.25)" },
    }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        {/* Icon */}
        <Box sx={{
          width: 36, height: 36, borderRadius: "10px",
          backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.2)`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <LayersOutlined sx={{ fontSize: 18, color: C.accent }} />
        </Box>

        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: "0.925rem", color: C.textPrimary, fontFamily: FONT, lineHeight: 1.2 }}>
            {a.subject_name}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.4 }}>
            <ClassOutlined sx={{ fontSize: 12, color: C.textSecondary }} />
            <Typography sx={{ fontSize: "0.72rem", color: C.textSecondary, fontFamily: FONT }}>
              {a.classroom_name} · Section {a.section}
            </Typography>
          </Box>
        </Box>
      </Box>

      <IconButton size="small" onClick={onDelete} sx={{
        color: C.textSecondary, borderRadius: "8px", p: 0.75,
        "&:hover": { backgroundColor: C.redDim, color: C.red },
        transition: `all ${EASE}`,
      }}>
        <Delete sx={{ fontSize: 15 }} />
      </IconButton>
    </Box>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function ClassSubjectsPage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [classes,     setClasses]     = useState<ClassItem[]>([]);
  const [subjects,    setSubjects]    = useState<SubjectItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");

  // Assign dialog
  const [open,     setOpen]     = useState(false);
  const [form,     setForm]     = useState<AssignForm>({ classroom_id: "", subject_id: "" });
  const [saving,   setSaving]   = useState(false);

  // Delete
  const [deleteId,  setDeleteId]  = useState<number | null>(null);
  const [deleting,  setDeleting]  = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────
  const fetchAssignments = async () => {
    try {
      const res = await api.get("/subjects/assignments");
      setAssignments(res.data);
    } catch {
      toast.error("Failed to load assignments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      api.get("/classes").then(r => setClasses(r.data)),
      api.get("/subjects").then(r => setSubjects(r.data)),
    ]).catch(() => toast.error("Failed to load data"));
    fetchAssignments();
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────
  const filtered = assignments.filter(a =>
    a.subject_name.toLowerCase().includes(search.toLowerCase()) ||
    a.classroom_name.toLowerCase().includes(search.toLowerCase()) ||
    a.section.toLowerCase().includes(search.toLowerCase())
  );

  // ── Handlers ─────────────────────────────────────────────────────────
  const openAssign = () => {
    setForm({ classroom_id: "", subject_id: "" });
    setOpen(true);
  };

  const handleAssign = async () => {
    if (!form.classroom_id || !form.subject_id) return;
    setSaving(true);
    try {
      await api.post("/subjects/assign-to-class", form);
      toast.success("Subject assigned successfully");
      setOpen(false);
      setForm({ classroom_id: "", subject_id: "" });
      fetchAssignments();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to assign");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/subjects/assignments/${deleteId}`);
      toast.success("Assignment removed");
      setAssignments(prev => prev.filter(a => a.id !== deleteId));
      setDeleteId(null);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      <GlobalStyles />

      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: "100%" }}>

        {/* ── Header ──────────────────────────────────────────── */}
        <PageHeader
          title="Class Subjects"
          subtitle="Manage subject assignments across classrooms"
          actionLabel="Assign Subject"
          onAction={openAssign}
          isMobile={isMobile}
        />

        {/* ── Search ──────────────────────────────────────────── */}
        <Box sx={{ mb: 2.5 }}>
          <TextField
            fullWidth
            placeholder="Search by subject, class or section…"
            value={search}
            size="small"
            onChange={e => setSearch(e.target.value)}
            sx={inputSx}
            InputProps={{
              startAdornment: <Search sx={{ color: C.textSecondary, mr: 1, fontSize: 18 }} />,
            }}
          />
        </Box>

        {/* ── Content ─────────────────────────────────────────── */}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <Box sx={{
              width: 32, height: 32, borderRadius: "50%",
              border: `3px solid ${C.accentDim}`,
              borderTopColor: C.accent,
              animation: "spin 0.7s linear infinite",
              "@keyframes spin": { to: { transform: "rotate(360deg)" } },
            }} />
          </Box>

        ) : filtered.length === 0 ? (
          <EmptyState
            icon={LayersOutlined}
            message={search ? "No assignments match your search" : "No subject assignments yet"}
            actionLabel="Assign Subject"
            onAction={openAssign}
          />

        ) : isMobile ? (
          /* ── Mobile cards ──────────────────────────────────── */
          <Box>
            {filtered.map(a => (
              <AssignmentCard
                key={a.id}
                a={a}
                onDelete={() => setDeleteId(a.id)}
              />
            ))}
          </Box>

        ) : (
          /* ── Desktop table ──────────────────────────────────── */
          <DataTable>
            <Table>
              <TableHead>
                <TableRow>
                  {["Class", "Section", "Subject", "Actions"].map(h => (
                    <TableCell key={h} sx={thSx}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((a, i) => (
                  <TableRow
                    key={a.id}
                    sx={{
                      "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" },
                      transition: `background ${EASE}`,
                      animation: `fadeUp 0.3s ${i * 30}ms ease both`,
                      "@keyframes fadeUp": {
                        from: { opacity: 0, transform: "translateY(8px)" },
                        to:   { opacity: 1, transform: "translateY(0)" },
                      },
                    }}
                  >
                    {/* Class */}
                    <TableCell sx={tdSx}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Box sx={{
                          width: 32, height: 32, borderRadius: "9px",
                          backgroundColor: C.accentDim,
                          border: `1px solid rgba(245,158,11,0.18)`,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          <ClassOutlined sx={{ fontSize: 15, color: C.accent }} />
                        </Box>
                        <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: "0.875rem", color: C.textPrimary }}>
                          {a.classroom_name}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Section */}
                    <TableCell sx={tdSx}>
                      <Chip
                        label={`Section ${a.section}`} size="small"
                        sx={{
                          backgroundColor: C.blueDim, color: C.blue,
                          fontFamily: FONT, fontWeight: 600, fontSize: "0.7rem",
                          height: 22, border: `1px solid ${C.blue}25`,
                        }}
                      />
                    </TableCell>

                    {/* Subject */}
                    <TableCell sx={tdSx}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <MenuBook sx={{ fontSize: 14, color: C.textSecondary }} />
                        <Typography sx={{ fontFamily: FONT, fontSize: "0.855rem", color: C.textPrimary }}>
                          {a.subject_name}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Actions */}
                    <TableCell sx={tdSx}>
                      <Tooltip title="Remove Assignment" arrow>
                        <IconButton size="small" onClick={() => setDeleteId(a.id)} sx={{
                          color: C.textSecondary, borderRadius: "8px", p: 0.75,
                          "&:hover": { backgroundColor: C.redDim, color: C.red },
                          transition: `all ${EASE}`,
                        }}>
                          <Delete sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        )}

        {/* Mobile FAB */}
        {isMobile && <MobileFab onClick={openAssign} />}

        {/* ── Assign Dialog ──────────────────────────────────── */}
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          fullWidth maxWidth="xs"
          fullScreen={isMobile}
          PaperProps={{
            sx: {
              backgroundColor: C.surface,
              border: isMobile ? "none" : `1px solid ${C.border}`,
              borderRadius: isMobile ? 0 : "16px",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            },
          }}
        >
          <DialogTitle sx={{
            fontFamily: FONT, fontWeight: 700, fontSize: "1.05rem",
            color: C.textPrimary, borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <LayersOutlined sx={{ fontSize: 18, color: C.accent }} />
              Assign Subject to Class
            </Box>
            {isMobile && (
              <IconButton onClick={() => setOpen(false)} sx={{ color: C.textSecondary }}>
                <Close />
              </IconButton>
            )}
          </DialogTitle>

          <DialogContent sx={{ pt: 2.5 }}>
            <Grid container spacing={2}>

              {/* Class select */}
              <Grid item xs={12}>
                <TextField
                  select fullWidth required label="Class" sx={inputSx}
                  value={form.classroom_id}
                  onChange={e => setForm({ ...form, classroom_id: Number(e.target.value) })}
                  SelectProps={{ MenuProps: menuProps }}
                >
                  <MenuItem value="" disabled>Select Class</MenuItem>
                  {classes.map(c => (
                    <MenuItem key={c.id} value={c.id}>
                      <Box>
                        <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>
                          {c.class_name}
                        </Typography>
                        <Typography sx={{ fontFamily: FONT, fontSize: "0.72rem", color: C.textSecondary }}>
                          Section {c.section}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Subject select */}
              <Grid item xs={12}>
                <TextField
                  select fullWidth required label="Subject" sx={inputSx}
                  value={form.subject_id}
                  onChange={e => setForm({ ...form, subject_id: Number(e.target.value) })}
                  SelectProps={{ MenuProps: menuProps }}
                >
                  <MenuItem value="" disabled>Select Subject</MenuItem>
                  {subjects.map(s => (
                    <MenuItem key={s.id} value={s.id}>
                      <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>{s.name}</Typography>
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

            </Grid>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, borderTop: `1px solid ${C.border}` }}>
            <Button
              onClick={() => setOpen(false)}
              disabled={saving}
              sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: "none", borderRadius: "8px" }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleAssign}
              disabled={saving || !form.classroom_id || !form.subject_id}
              sx={{
                backgroundColor: C.accent, color: "#111827",
                fontFamily: FONT, fontWeight: 600,
                textTransform: "none", borderRadius: "10px", px: 3,
                "&:hover": { backgroundColor: "#FBBF24" },
                "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" },
              }}
            >
              {saving ? "Assigning…" : "Assign Subject"}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Delete Confirm ─────────────────────────────────── */}
        <DeleteDialog
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={confirmDelete}
          loading={deleting}
          title="Remove Assignment?"
          description="This will unassign the subject from the class. This action cannot be undone."
        />

      </Box>
    </>
  );
}