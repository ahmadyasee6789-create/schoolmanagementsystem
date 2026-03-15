"use client";

import { useState, useEffect } from "react";
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, IconButton, MenuItem, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
  Tooltip, useMediaQuery, useTheme,
} from "@mui/material";
import { Edit, Close, AttachMoneyOutlined, ClassOutlined, SchoolOutlined, ReceiptOutlined } from "@mui/icons-material";
import { api } from "@/app/lib/api";
import toast from "react-hot-toast";
import {
  C, FONT, EASE, inputSx, menuProps, thSx, tdSx,
  GlobalStyles, PageHeader, EmptyState, DataTable, MobileFab,
} from "@/components/ui";

// ─── Types ───────────────────────────────────────────────────────────────
type FeeStructure = {
  id: number;
  class_id: number;
  class_name: string;
  monthly_fee: number;
  admission_fee: number;
  exam_fee: number;
  session_id: number;
};
type Classroom = {
  id: number; section: string;
  grade_id?: number; grade_name?: string;
  grade?: { name: string };
};
type AcademicSession = { id: number; name: string };
type FeeForm = {
  id: number; class_id: string; session_id: string;
  monthly_fee: string; admission_fee: string; exam_fee: string;
};

const emptyForm: FeeForm = { id: 0, class_id: "", session_id: "", monthly_fee: "", admission_fee: "", exam_fee: "" };

const classLabel = (c: Classroom) => {
  const grade = c.grade?.name ?? c.grade_name ?? "";
  return grade ? `${grade} – ${c.section}` : c.section;
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(n);

// ─── Mobile card ─────────────────────────────────────────────────────────
function FeeCard({ s, onEdit }: { s: FeeStructure; onEdit: () => void }) {
  return (
    <Box sx={{
      backgroundColor: C.surface, border: `1px solid ${C.border}`,
      borderRadius: "12px", p: 2, mb: 1.5,
      transition: `border-color ${EASE}`,
      "&:hover": { borderColor: "rgba(245,158,11,0.25)" },
    }}>
      {/* Header row */}
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: "10px",
            backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.2)`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <ClassOutlined sx={{ fontSize: 18, color: C.accent }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "0.925rem", color: C.textPrimary, fontFamily: FONT, lineHeight: 1.2 }}>
              {s.class_name}
            </Typography>
            <Typography sx={{ fontSize: "0.72rem", color: C.textSecondary, fontFamily: FONT }}>
              Fee Structure
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={onEdit} sx={{
          color: C.textSecondary, borderRadius: "8px", p: 0.75,
          "&:hover": { backgroundColor: C.accentDim, color: C.accent },
          transition: `all ${EASE}`,
        }}>
          <Edit sx={{ fontSize: 15 }} />
        </IconButton>
      </Box>

      {/* Fee pills */}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {[
          { label: "Monthly", value: s.monthly_fee, color: C.accent,  dim: C.accentDim  },
          { label: "Admission", value: s.admission_fee, color: C.green, dim: C.greenDim },
          { label: "Exam",    value: s.exam_fee,     color: C.blue,   dim: C.blueDim    },
        ].map(f => (
          <Box key={f.label} sx={{
            backgroundColor: f.dim, border: `1px solid ${f.color}25`,
            borderRadius: "8px", px: 1.25, py: 0.5,
          }}>
            <Typography sx={{ fontFamily: FONT, fontSize: "0.68rem", color: C.textSecondary, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {f.label}
            </Typography>
            <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.85rem", fontWeight: 700, color: f.color }}>
              {formatCurrency(f.value)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function FeeStructurePage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [classes,    setClasses]    = useState<Classroom[]>([]);
  const [sessions,   setSessions]   = useState<AcademicSession[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [form,       setForm]       = useState<FeeForm>(emptyForm);
  const [saving,     setSaving]     = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────
  const fetchStructures = async () => {
    setLoading(true);
    try {
      const res = await api.get("/fee-structure");
      setStructures(res.data);
    } catch { toast.error("Failed to load fee structures"); }
    finally   { setLoading(false); }
  };

  useEffect(() => {
    Promise.all([api.get("/classes"), api.get("/sessions")]).then(
      ([classesRes, sessionsRes]) => {
        setClasses(classesRes.data);
        setSessions(sessionsRes.data);
      }
    );
    fetchStructures();
  }, []);

  // ── Dialog helpers ─────────────────────────────────────────────────
  const openAdd = () => { setForm(emptyForm); setOpenDialog(true); };

  const openEdit = (s: FeeStructure) => {
    setForm({
      id: s.id,
      class_id:     String(s.class_id),
      session_id:   String(s.session_id),
      monthly_fee:  String(s.monthly_fee),
      admission_fee:String(s.admission_fee),
      exam_fee:     String(s.exam_fee),
    });
    setOpenDialog(true);
  };

  // ── Save ───────────────────────────────────────────────────────────
  const saveStructure = async () => {
    if (!form.class_id || !form.session_id || !form.monthly_fee) {
      toast.error("Please select class, session and enter monthly fee");
      return;
    }
    setSaving(true);
    const payload = {
      class_id:     Number(form.class_id),
      session_id:   Number(form.session_id),
      monthly_fee:  Number(form.monthly_fee),
      admission_fee:Number(form.admission_fee || 0),
      exam_fee:     Number(form.exam_fee || 0),
    };
    try {
      if (form.id) {
        await api.put(`/fee-structure/${form.id}`, payload);
        toast.success("Fee structure updated");
      } else {
        await api.post("/fee-structure", payload);
        toast.success("Fee structure created");
      }
      setOpenDialog(false);
      fetchStructures();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Error saving fee structure");
    } finally { setSaving(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
      <GlobalStyles />

      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: "100%" }}>

        {/* ── Header ──────────────────────────────────────────── */}
        <PageHeader
          title="Fee Structure"
          subtitle="Manage class-wise fee structures per academic session"
          actionLabel="Add Fee Structure"
          onAction={openAdd}
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

        ) : structures.length === 0 ? (
          <EmptyState
            icon={ReceiptOutlined}
            message="No fee structures found"
            actionLabel="Add Fee Structure"
            onAction={openAdd}
          />

        ) : isMobile ? (
          /* ── Mobile cards ──────────────────────────────────── */
          <Box>
            {structures.map(s => (
              <FeeCard key={s.id} s={s} onEdit={() => openEdit(s)} />
            ))}
          </Box>

        ) : (
          /* ── Desktop table ──────────────────────────────────── */
          <DataTable>
            <Table>
              <TableHead>
                <TableRow>
                  {["Class", "Monthly Fee", "Admission Fee", "Exam Fee", "Actions"].map(h => (
                    <TableCell key={h} sx={thSx}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {structures.map((s, i) => (
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
                    {/* Class */}
                    <TableCell sx={tdSx}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Box sx={{
                          width: 32, height: 32, borderRadius: "9px",
                          backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.18)`,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          <ClassOutlined sx={{ fontSize: 15, color: C.accent }} />
                        </Box>
                        <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: "0.875rem", color: C.textPrimary }}>
                          {s.class_name}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Monthly Fee */}
                    <TableCell sx={tdSx}>
                      <Chip
                        label={formatCurrency(s.monthly_fee)} size="small"
                        sx={{
                          backgroundColor: C.accentDim, color: C.accent,
                          fontFamily: '"DM Mono", monospace', fontWeight: 700, fontSize: "0.72rem",
                          height: 22, border: `1px solid rgba(245,158,11,0.25)`,
                        }}
                      />
                    </TableCell>

                    {/* Admission Fee */}
                    <TableCell sx={tdSx}>
                      <Chip
                        label={formatCurrency(s.admission_fee)} size="small"
                        sx={{
                          backgroundColor: C.greenDim, color: C.green,
                          fontFamily: '"DM Mono", monospace', fontWeight: 700, fontSize: "0.72rem",
                          height: 22, border: `1px solid ${C.green}25`,
                        }}
                      />
                    </TableCell>

                    {/* Exam Fee */}
                    <TableCell sx={tdSx}>
                      <Chip
                        label={formatCurrency(s.exam_fee)} size="small"
                        sx={{
                          backgroundColor: C.blueDim, color: C.blue,
                          fontFamily: '"DM Mono", monospace', fontWeight: 700, fontSize: "0.72rem",
                          height: 22, border: `1px solid ${C.blue}25`,
                        }}
                      />
                    </TableCell>

                    {/* Actions */}
                    <TableCell sx={tdSx}>
                      <Tooltip title="Edit Fee Structure" arrow>
                        <IconButton size="small" onClick={() => openEdit(s)} sx={{
                          color: C.textSecondary, borderRadius: "8px", p: 0.75,
                          "&:hover": { backgroundColor: C.accentDim, color: C.accent },
                          transition: `all ${EASE}`,
                        }}>
                          <Edit sx={{ fontSize: 15 }} />
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
        {isMobile && <MobileFab onClick={openAdd} />}

        {/* ── Add / Edit Dialog ──────────────────────────────── */}
        <Dialog
          open={openDialog}
          onClose={() => setOpenDialog(false)}
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
              <ReceiptOutlined sx={{ fontSize: 18, color: C.accent }} />
              {form.id ? "Edit Fee Structure" : "Add Fee Structure"}
            </Box>
            {isMobile && (
              <IconButton onClick={() => setOpenDialog(false)} sx={{ color: C.textSecondary }}>
                <Close />
              </IconButton>
            )}
          </DialogTitle>

          <DialogContent sx={{ pt: 2.5 }}>
            <Grid container spacing={2}>

              {/* Class */}
              <Grid item xs={12}>
                <TextField
                  select fullWidth required label="Class" sx={inputSx}
                  value={form.class_id}
                  onChange={e => setForm({ ...form, class_id: e.target.value })}
                  SelectProps={{ MenuProps: menuProps }}
                >
                  <MenuItem value="" disabled>Select Class</MenuItem>
                  {classes.map(c => (
                    <MenuItem key={c.id} value={c.id}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <ClassOutlined sx={{ fontSize: 14, color: C.accent }} />
                        <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>{classLabel(c)}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Session */}
              <Grid item xs={12}>
                <TextField
                  select fullWidth required label="Academic Session" sx={inputSx}
                  value={form.session_id}
                  onChange={e => setForm({ ...form, session_id: e.target.value })}
                  SelectProps={{ MenuProps: menuProps }}
                >
                  <MenuItem value="" disabled>Select Session</MenuItem>
                  {sessions.map(s => (
                    <MenuItem key={s.id} value={s.id}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <SchoolOutlined sx={{ fontSize: 14, color: C.accent }} />
                        <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>{s.name}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Monthly Fee */}
              <Grid item xs={12}>
                <TextField
                  fullWidth required label="Monthly Fee" type="number" sx={inputSx}
                  placeholder="0"
                  value={form.monthly_fee}
                  onChange={e => setForm({ ...form, monthly_fee: e.target.value })}
                  InputProps={{ startAdornment: <AttachMoneyOutlined sx={{ fontSize: 16, color: C.textSecondary, mr: 0.5 }} /> }}
                />
              </Grid>

              {/* Admission + Exam side by side */}
              <Grid item xs={6}>
                <TextField
                  fullWidth label="Admission Fee" type="number" sx={inputSx}
                  placeholder="0"
                  value={form.admission_fee}
                  onChange={e => setForm({ ...form, admission_fee: e.target.value })}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth label="Exam Fee" type="number" sx={inputSx}
                  placeholder="0"
                  value={form.exam_fee}
                  onChange={e => setForm({ ...form, exam_fee: e.target.value })}
                />
              </Grid>

            </Grid>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, borderTop: `1px solid ${C.border}` }}>
            <Button
              onClick={() => setOpenDialog(false)}
              disabled={saving}
              sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: "none", borderRadius: "8px" }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={saveStructure}
              disabled={saving || !form.class_id || !form.session_id || !form.monthly_fee}
              sx={{
                backgroundColor: C.accent, color: "#111827",
                fontFamily: FONT, fontWeight: 600,
                textTransform: "none", borderRadius: "10px", px: 3,
                "&:hover": { backgroundColor: "#FBBF24" },
                "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" },
              }}
            >
              {saving ? "Saving…" : form.id ? "Save Changes" : "Add Structure"}
            </Button>
          </DialogActions>
        </Dialog>

      </Box>
    </>
  );
}