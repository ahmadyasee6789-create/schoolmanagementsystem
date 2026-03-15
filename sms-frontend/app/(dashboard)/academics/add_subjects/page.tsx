"use client";

import React, { useEffect, useState } from "react";
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography, Tooltip, useMediaQuery, useTheme,
} from "@mui/material";
import { Delete, Edit, Search, Close, MenuBook } from "@mui/icons-material";
import { api } from "@/app/lib/api";
import toast from "react-hot-toast";
import {
  C, FONT, EASE, inputSx,
  GlobalStyles, PageHeader, EmptyState,
  DeleteDialog, DataTable, MobileFab,
  thSx,tdSx
} from "@/components/ui";

// ─── Types ─────────────────────────────────────────────────────────────
type Subject    = { id: number; name: string };
type SubjectForm = { name: string };

// ─── Mobile card ────────────────────────────────────────────────────────
function SubjectCard({ subject, onEdit, onDelete }: {
  subject: Subject; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <Box sx={{
      backgroundColor: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "12px",
      p: 2, mb: 1.5,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      transition: `border-color ${EASE}`,
      "&:hover": { borderColor: "rgba(245,158,11,0.25)" },
    }}>
      {/* Left */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box sx={{
          width: 36, height: 36, borderRadius: "10px",
          backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.2)`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <MenuBook sx={{ fontSize: 18, color: C.accent }} />
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: "0.925rem", color: C.textPrimary, fontFamily: FONT, lineHeight: 1.2 }}>
            {subject.name}
          </Typography>
          <Typography sx={{ fontSize: "0.72rem", color: C.textSecondary, fontFamily: FONT }}>
            #{String(subject.id).padStart(3, "0")}
          </Typography>
        </Box>
      </Box>

      {/* Actions */}
      <Box sx={{ display: "flex", gap: 0.5 }}>
        <IconButton size="small" onClick={onEdit} sx={{
          color: C.textSecondary, borderRadius: "8px", p: 0.75,
          "&:hover": { backgroundColor: C.accentDim, color: C.accent },
          transition: `all ${EASE}`,
        }}>
          <Edit sx={{ fontSize: 15 }} />
        </IconButton>
        <IconButton size="small" onClick={onDelete} sx={{
          color: C.textSecondary, borderRadius: "8px", p: 0.75,
          "&:hover": { backgroundColor: C.redDim, color: C.red },
          transition: `all ${EASE}`,
        }}>
          <Delete sx={{ fontSize: 15 }} />
        </IconButton>
      </Box>
    </Box>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────
export default function SubjectsPage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");

  // Add / Edit
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form,    setForm]    = useState<SubjectForm>({ name: "" });
  const [saving,  setSaving]  = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────
  const fetchSubjects = async () => {
    try {
      const res = await api.get("/subjects");
      setSubjects(res.data);
    } catch {
      toast.error("Failed to load subjects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSubjects(); }, []);

  // ── Derived ────────────────────────────────────────────────────────
  const filtered = subjects.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Handlers ──────────────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    setForm({ name: "" });
    setOpen(true);
  };

  const openEdit = (s: Subject) => {
    setEditing(s);
    setForm({ name: s.name });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/subjects/${editing.id}`, form);
        toast.success("Subject updated");
        setSubjects(prev => prev.map(s => s.id === editing.id ? { ...s, name: form.name } : s));
      } else {
        await api.post("/subjects", form);
        toast.success("Subject created");
        await fetchSubjects();
      }
      setOpen(false);
      setEditing(null);
      setForm({ name: "" });
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Error saving subject");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/subjects/${deleteId}`);
      toast.success("Subject deleted");
      setSubjects(prev => prev.filter(s => s.id !== deleteId));
      setDeleteId(null);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
      <GlobalStyles />

      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: "100%" }}>

        {/* ── Page Header (reused) ─────────────────────────────── */}
        <PageHeader
          title="Subjects"
          subtitle="Manage academic subjects offered in your school"
          actionLabel="Add Subject"
          onAction={openAdd}
          isMobile={isMobile}
        />

        {/* ── Search bar ──────────────────────────────────────── */}
        <Box sx={{ mb: 2.5 }}>
          <TextField
            fullWidth
            placeholder="Search subjects…"
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
            icon={MenuBook}
            message={search ? "No subjects match your search" : "No subjects found"}
            actionLabel="Add Subject"
            onAction={openAdd}
          />

        ) : isMobile ? (
          /* ── Mobile cards ──────────────────────────────────── */
          <Box>
            {filtered.map(s => (
              <SubjectCard
                key={s.id}
                subject={s}
                onEdit={() => openEdit(s)}
                onDelete={() => setDeleteId(s.id)}
              />
            ))}
          </Box>

        ) : (
          /* ── Desktop table (DataTable reused) ─────────────── */
          <DataTable>
            <Table>
              <TableHead>
                <TableRow>
                  {["#", "Subject Name", "Actions"].map(h => (
                    <TableCell key={h} sx={thSx}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((s, i) => (
                  <TableRow
                    key={s.id}
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
                    {/* ID */}
                    <TableCell sx={{ ...tdSx, color: C.textSecondary, fontFamily: '"DM Mono", monospace', width: 80 }}>
                      {String(s.id).padStart(3, "0")}
                    </TableCell>

                    {/* Name */}
                    <TableCell sx={tdSx}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Box sx={{
                          width: 32, height: 32, borderRadius: "9px",
                          backgroundColor: C.accentDim,
                          border: `1px solid rgba(245,158,11,0.18)`,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          <MenuBook sx={{ fontSize: 15, color: C.accent }} />
                        </Box>
                        <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: "0.875rem", color: C.textPrimary }}>
                          {s.name}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Actions */}
                    <TableCell sx={tdSx}>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <Tooltip title="Edit Subject" arrow>
                          <IconButton size="small" onClick={() => openEdit(s)} sx={{
                            color: C.textSecondary, borderRadius: "8px", p: 0.75,
                            "&:hover": { backgroundColor: C.accentDim, color: C.accent },
                            transition: `all ${EASE}`,
                          }}>
                            <Edit sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Subject" arrow>
                          <IconButton size="small" onClick={() => setDeleteId(s.id)} sx={{
                            color: C.textSecondary, borderRadius: "8px", p: 0.75,
                            "&:hover": { backgroundColor: C.redDim, color: C.red },
                            transition: `all ${EASE}`,
                          }}>
                            <Delete sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        )}

        {/* Mobile FAB */}
        {isMobile && <MobileFab onClick={openAdd} />}

        {/* ── Add / Edit Dialog ──────────────────────────────── */}
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
              <MenuBook sx={{ fontSize: 18, color: C.accent }} />
              {editing ? "Edit Subject" : "Add Subject"}
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
                  fullWidth
                  label="Subject Name"
                  required
                  sx={inputSx}
                  placeholder="e.g. Mathematics"
                  value={form.name}
                  autoFocus
                  inputProps={{ maxLength: 100 }}
                  onKeyDown={e => e.key === "Enter" && handleSave()}
                  onChange={e => setForm({ name: e.target.value })}
                />
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
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              sx={{
                backgroundColor: C.accent, color: "#111827",
                fontFamily: FONT, fontWeight: 600,
                textTransform: "none", borderRadius: "10px", px: 3,
                "&:hover": { backgroundColor: "#FBBF24" },
                "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" },
              }}
            >
              {saving
                ? (editing ? "Saving…" : "Creating…")
                : (editing ? "Save Changes" : "Add Subject")}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Delete Confirm (reused) ────────────────────────── */}
        <DeleteDialog
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={confirmDelete}
          loading={deleting}
          title="Delete Subject?"
          description="This will permanently remove the subject and may affect related records."
        />

      </Box>
    </>
  );
}