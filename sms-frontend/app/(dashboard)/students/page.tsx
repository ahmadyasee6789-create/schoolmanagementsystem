'use client';

import { useEffect, useState } from 'react';
import {
  Box, Button, Card, Dialog, DialogTitle, DialogContent,
  DialogActions, Grid, IconButton, MenuItem, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography, CircularProgress,
  FormControl, RadioGroup, FormLabel, FormControlLabel, Radio, Chip,
} from '@mui/material';
import { Add, Edit, Delete, Search } from '@mui/icons-material';
import { api } from '@/app/lib/api';
import { usePaginatedQuery } from '@/app/hooks/usePaginatedQuery';

// ─── Design tokens ────────────────────────────────────────────────────
const C = {
  bg:            "#0D1117",
  surface:       "#161B27",
  surfaceHover:  "#1C2333",
  border:        "rgba(255,255,255,0.07)",
  accent:        "#F59E0B",
  accentDim:     "rgba(245,158,11,0.12)",
  textPrimary:   "#F9FAFB",
  textSecondary: "rgba(249,250,251,0.45)",
  green:         "#34D399",
  greenDim:      "rgba(52,211,153,0.1)",
  red:           "#F87171",
  redDim:        "rgba(248,113,113,0.1)",
  inputBg:       "#1C2333",
};
const FONT = "'DM Sans', sans-serif";
const EASE = "260ms cubic-bezier(0.4,0,0.2,1)";

// ─── Shared styles ────────────────────────────────────────────────────
const inputSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: C.inputBg,
    borderRadius: "10px",
    fontFamily: FONT,
    color: C.textPrimary,
    fontSize: "0.875rem",
    "& fieldset": { borderColor: C.border },
    "&:hover fieldset": { borderColor: "rgba(245,158,11,0.35)" },
    "&.Mui-focused fieldset": { borderColor: C.accent },
  },
  "& .MuiInputLabel-root": { color: C.textSecondary, fontFamily: FONT, fontSize: "0.875rem" },
  "& .MuiInputLabel-root.Mui-focused": { color: C.accent },
  "& input": { color: C.textPrimary, fontFamily: FONT },
  "& .MuiSelect-select": { color: C.textPrimary, fontFamily: FONT },
  "& .MuiSvgIcon-root": { color: C.textSecondary },
};

const menuPaperSx = {
  PaperProps: {
    sx: {
      backgroundColor: C.surfaceHover,
      border: `1px solid ${C.border}`,
      borderRadius: "10px",
      "& .MuiMenuItem-root": {
        fontFamily: FONT, fontSize: "0.875rem", color: C.textPrimary,
        "&:hover": { backgroundColor: C.accentDim },
        "&.Mui-selected": { backgroundColor: C.accentDim, color: C.accent },
      },
    },
  },
};

const thSx = {
  borderColor: C.border, color: C.textSecondary, fontFamily: FONT,
  fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em",
  textTransform: "uppercase" as const, py: 1.5, whiteSpace: "nowrap" as const,
};

const tdSx = {
  borderColor: C.border, color: C.textPrimary,
  fontFamily: FONT, fontSize: "0.855rem", py: 1.5,
};

// ─── Section divider inside dialog ───────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return (
    <Grid item xs={12}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 2, mb: 0.5 }}>
        <Box sx={{ width: 3, height: 16, borderRadius: 1, backgroundColor: C.accent }} />
        <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.textSecondary, fontFamily: FONT }}>
          {label}
        </Typography>
      </Box>
    </Grid>
  );
}

// ─── Types ────────────────────────────────────────────────────────────
type Grade = { id: number; name: string };
type Classroom = { id: number; name: string; grade_id: number; section: string; grade_name: string };
type Student = {
  id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  father_name: string | null;
  father_phone: string | null;
  mother_name: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  gender: string;
  date_of_birth: string;
  is_active: boolean;
  grade_name?: string;
  section?: string;
  roll_number?: number;
  discount_percent?: number;
};
type StudentFormData = {
  id: number; first_name: string; last_name: string;
  phone: string; email: string; father_name: string; father_phone: string;
  mother_name: string; guardian_name: string; guardian_phone: string;
  gender: string; date_of_birth: string;
  classroom_id: number; discount_percent: number; enrollment_date: string;
};

const emptyForm: StudentFormData = {
  id: 0, first_name: '', last_name: '', phone: '', email: '',
  father_name: '', father_phone: '', mother_name: '', guardian_name: '', guardian_phone: '',
  gender: 'male', date_of_birth: '', classroom_id: 0,
  discount_percent: 0, enrollment_date: new Date().toISOString().split('T')[0],
};

// ─── Main component ───────────────────────────────────────────────────
export default function StudentsPage() {
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string | 'all'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<StudentFormData>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([api.get('/classes'), api.get('/grades'), api.get('/sessions/active')])
      .then(([c, g, s]) => {
        setClasses(c.data); setGrades(g.data);
        setActiveSessionId(s.data?.id ?? null);
        setLoadingClasses(false);
      });
  }, []);

  const { data: students = [], loading, refetch, page, totalPages, setPage } = usePaginatedQuery({
    fetcher: async ({ page, limit, search, grade_name }) => {
      const res = await api.get('/students', {
        params: { page, limit, search, grade_name }
      });
      console.log('API response:', res.data);
      const data = Array.isArray(res.data) ? res.data : (res.data.items ?? []);
      const totalPages = Array.isArray(res.data) ? 1 : (res.data.total_pages ?? 1);
      return { data, totalPages };
    },
    filters: {
      search,
      grade_name: gradeFilter !== "all" ? gradeFilter : undefined
    },
    debounceKeys: ["search"]
  });

  const openAddDialog = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };
  const openEditDialog = (s: Student) => {
    setForm({
      id: s.id, first_name: s.first_name, last_name: s.last_name,
      phone: s.phone || '', email: s.email || '', father_name: s.father_name || '',
      father_phone: s.father_phone || '', mother_name: s.mother_name || '',
      guardian_name: s.guardian_name || '', guardian_phone: s.guardian_phone || '',
      gender: s.gender, date_of_birth: s.date_of_birth, classroom_id: 0,
      discount_percent: s.discount_percent || 0,
      enrollment_date: new Date().toISOString().split('T')[0],
    });
    setEditingId(s.id); setDialogOpen(true);
  };

  const saveStudent = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/students/${editingId}`, {
          first_name: form.first_name, last_name: form.last_name,
          phone: form.phone || null, email: form.email || null,
          father_name: form.father_name || null, father_phone: form.father_phone || null,
          mother_name: form.mother_name || null, guardian_name: form.guardian_name || null,
          guardian_phone: form.guardian_phone || null, gender: form.gender,
          date_of_birth: form.date_of_birth || null,
        });
      } else {
        await api.post('/students/with-enrollment', {
          ...form, phone: form.phone || null, email: form.email || null,
          father_name: form.father_name || null, father_phone: form.father_phone || null,
          mother_name: form.mother_name || null, guardian_name: form.guardian_name || null,
          guardian_phone: form.guardian_phone || null, date_of_birth: form.date_of_birth || null,
          classroom_id: Number(form.classroom_id), session_id: activeSessionId,
          discount_percent: Number(form.discount_percent) || 0,
        });
      }
      setDialogOpen(false); refetch();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const deleteStudent = async (id: number) => {
    if (confirm('Delete this student?')) {
      try { await api.delete(`/students/${id}`); refetch(); }
      catch (e) { console.error(e); }
    }
  };

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      <Box sx={{ p: { xs: 2, sm: 3 }, backgroundColor: C.bg, minHeight: "100%" }}>

        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 4 }}>
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
              <Box sx={{ width: 3, height: 22, borderRadius: 2, backgroundColor: C.accent, boxShadow: `0 0 8px ${C.accent}` }} />
              <Typography sx={{ fontSize: "1.35rem", fontWeight: 700, color: C.textPrimary, fontFamily: FONT, letterSpacing: "-0.02em" }}>
                Students
              </Typography>
            </Box>
            <Typography sx={{ color: C.textSecondary, fontSize: "0.82rem", fontFamily: FONT, ml: "19px" }}>
              Manage student records, enrolments and information
            </Typography>
          </Box>
          <Button onClick={openAddDialog} startIcon={<Add sx={{ fontSize: 18 }} />}
            sx={{
              backgroundColor: C.accent, color: "#111827", fontFamily: FONT, fontWeight: 600,
              fontSize: "0.82rem", borderRadius: "10px", px: 2.5, py: 1, textTransform: "none",
              boxShadow: `0 4px 16px ${C.accentDim}`,
              "&:hover": { backgroundColor: "#FBBF24", boxShadow: "0 6px 20px rgba(245,158,11,0.35)" },
            }}>
            Add Student
          </Button>
        </Box>

        {/* Filters */}
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          <Grid item xs={12} md={7}>
            <TextField
              fullWidth
              placeholder="Search by name or admission no…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              sx={inputSx}
              InputProps={{ startAdornment: <Search sx={{ color: C.textSecondary, mr: 1, fontSize: 20 }} /> }}
            />
          </Grid>
          <Grid item xs={12} md={5}>
            <TextField
              select fullWidth label="Grade" value={gradeFilter}
              onChange={(e) => { setGradeFilter(e.target.value); setPage(1); }}
              sx={inputSx} SelectProps={{ MenuProps: menuPaperSx }}>
              <MenuItem value="all">All Grades</MenuItem>
              {grades.map((g) => <MenuItem key={g.id} value={g.name}>{g.name}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>

        {/* Table */}
        <Card sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: "14px", boxShadow: "0 4px 24px rgba(0,0,0,0.2)", overflow: "hidden" }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress size={32} thickness={3} sx={{ color: C.accent }} />
            </Box>
          ) : (
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: C.surfaceHover }}>
                  {["Adm. No.", "Name", "Grade / Section", "Parent", "Contact", "Roll No.", "Discount", "Actions"].map(h => (
                    <TableCell key={h} sx={thSx}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {(students as Student[]).map((s) => (
                  <TableRow key={s.id} sx={{ "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" }, transition: `background ${EASE}` }}>
                    <TableCell sx={{ ...tdSx, color: C.accent, fontWeight: 600 }}>{s.admission_no}</TableCell>
                    <TableCell sx={{ ...tdSx, fontWeight: 600 }}>{`${s.first_name} ${s.last_name}`}</TableCell>
                    <TableCell sx={tdSx}>
                      {s.grade_name ? (
                        <Chip label={`${s.grade_name} – ${s.section}`} size="small" sx={{
                          backgroundColor: C.accentDim, color: C.accent, fontFamily: FONT,
                          fontWeight: 600, fontSize: "0.72rem", border: `1px solid rgba(245,158,11,0.2)`, height: 22,
                        }} />
                      ) : (
                        <Typography sx={{ fontSize: "0.78rem", color: C.textSecondary, fontFamily: FONT }}>Not enrolled</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={tdSx}>{s.father_name || s.mother_name || s.guardian_name || "—"}</TableCell>
                    <TableCell sx={{ ...tdSx, color: C.textSecondary }}>{s.father_phone || s.guardian_phone || "—"}</TableCell>
                    <TableCell sx={tdSx}>{s.roll_number || "—"}</TableCell>
                    <TableCell sx={tdSx}>{s.discount_percent ? `${s.discount_percent}%` : "—"}</TableCell>
                    <TableCell sx={tdSx}>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <IconButton size="small" onClick={() => openEditDialog(s)} sx={{
                          color: C.textSecondary, borderRadius: "8px", p: 0.75,
                          "&:hover": { backgroundColor: C.accentDim, color: C.accent },
                          transition: `all ${EASE}`,
                        }}>
                          <Edit sx={{ fontSize: 16 }} />
                        </IconButton>
                        <IconButton size="small" onClick={() => deleteStudent(s.id)} sx={{
                          color: C.textSecondary, borderRadius: "8px", p: 0.75,
                          "&:hover": { backgroundColor: C.redDim, color: C.red },
                          transition: `all ${EASE}`,
                        }}>
                          <Delete sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {(students as Student[]).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ ...tdSx, textAlign: "center", color: C.textSecondary, py: 5 }}>
                      No students found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* ── Pagination ───────────────────────────────────────────── */}
        {totalPages > 1 && (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", mt: 3, gap: 1 }}>
            <Button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              sx={{
                color: C.textSecondary, fontFamily: FONT, textTransform: "none",
                borderRadius: "8px", border: `1px solid ${C.border}`, px: 2,
                "&:hover": { backgroundColor: C.accentDim, color: C.accent, borderColor: C.accent },
                "&.Mui-disabled": { opacity: 0.3 },
              }}>
              ← Previous
            </Button>

            {/* Page number pills */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === '...' ? (
                  <Typography key={`ellipsis-${idx}`} sx={{ color: C.textSecondary, fontFamily: FONT, px: 1 }}>…</Typography>
                ) : (
                  <Button
                    key={p}
                    onClick={() => setPage(p as number)}
                    sx={{
                      minWidth: 36, height: 36, p: 0, fontFamily: FONT, fontWeight: 600,
                      fontSize: "0.82rem", borderRadius: "8px", textTransform: "none",
                      border: `1px solid ${page === p ? C.accent : C.border}`,
                      backgroundColor: page === p ? C.accentDim : "transparent",
                      color: page === p ? C.accent : C.textSecondary,
                      "&:hover": { backgroundColor: C.accentDim, color: C.accent, borderColor: C.accent },
                    }}>
                    {p}
                  </Button>
                )
              )}

            <Button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              sx={{
                color: C.textSecondary, fontFamily: FONT, textTransform: "none",
                borderRadius: "8px", border: `1px solid ${C.border}`, px: 2,
                "&:hover": { backgroundColor: C.accentDim, color: C.accent, borderColor: C.accent },
                "&.Mui-disabled": { opacity: 0.3 },
              }}>
              Next →
            </Button>
          </Box>
        )}

        {/* ── Dialog ──────────────────────────────────────────────── */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md"
          PaperProps={{ sx: { backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: "16px", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" } }}>
          <DialogTitle sx={{ fontFamily: FONT, fontWeight: 700, fontSize: "1.05rem", color: C.textPrimary, borderBottom: `1px solid ${C.border}` }}>
            {editingId ? 'Edit Student' : 'Add Student'}
          </DialogTitle>

          <DialogContent sx={{ pt: 2, pb: 1 }}>
            <Grid container spacing={2} mt={0}>
              <SectionLabel label="Personal Information" />

              {[
                { label: "First Name", key: "first_name", required: true, md: 6 },
                { label: "Last Name",  key: "last_name",  required: true, md: 6 },
              ].map(({ label, key, required, md }) => (
                <Grid item xs={12} md={md} key={key}>
                  <TextField fullWidth label={label} required={required} sx={inputSx}
                    value={(form as any)[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                </Grid>
              ))}

              <Grid item xs={12} md={6}>
                <FormControl sx={{ ml: 0.5 }}>
                  <FormLabel sx={{ color: C.textSecondary, fontFamily: FONT, fontSize: "0.82rem", "&.Mui-focused": { color: C.accent } }}>Gender</FormLabel>
                  <RadioGroup row value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                    {["male", "female", "other"].map(g => (
                      <FormControlLabel key={g} value={g} label={g.charAt(0).toUpperCase() + g.slice(1)}
                        control={<Radio size="small" sx={{ color: C.textSecondary, "&.Mui-checked": { color: C.accent } }} />}
                        sx={{ "& .MuiFormControlLabel-label": { fontFamily: FONT, fontSize: "0.875rem", color: C.textPrimary } }} />
                    ))}
                  </RadioGroup>
                </FormControl>
              </Grid>

              {[
                { label: "Date of Birth", key: "date_of_birth", type: "date", md: 6 },
                { label: "Phone",         key: "phone",         type: "text", md: 6 },
                { label: "Email",         key: "email",         type: "email", md: 6 },
              ].map(({ label, key, type, md }) => (
                <Grid item xs={12} md={md} key={key}>
                  <TextField fullWidth label={label} type={type} InputLabelProps={type === "date" ? { shrink: true } : undefined}
                    sx={inputSx} value={(form as any)[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                </Grid>
              ))}

              <SectionLabel label="Parent / Guardian" />

              {[
                { label: "Father's Name",    key: "father_name",    md: 6 },
                { label: "Father's Phone",   key: "father_phone",   md: 6 },
                { label: "Mother's Name",    key: "mother_name",    md: 6 },
                { label: "Guardian's Name",  key: "guardian_name",  md: 6 },
                { label: "Guardian's Phone", key: "guardian_phone", md: 6 },
              ].map(({ label, key, md }) => (
                <Grid item xs={12} md={md} key={key}>
                  <TextField fullWidth label={label} sx={inputSx} value={(form as any)[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                </Grid>
              ))}

              {!editingId && (
                <>
                  <SectionLabel label="Enrolment" />

                  <Grid item xs={12} md={6}>
                    <TextField select fullWidth label="Class" required sx={inputSx}
                      value={form.classroom_id} disabled={loadingClasses}
                      onChange={(e) => setForm({ ...form, classroom_id: Number(e.target.value) })}
                      SelectProps={{ MenuProps: menuPaperSx }}>
                      <MenuItem value={0} disabled>Select Class</MenuItem>
                      {classes.map(c => (
                        <MenuItem key={c.id} value={c.id}>{c.grade_name} – {c.section}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>

                  {[
                    { label: "Discount %",     key: "discount_percent", type: "number", md: 6 },
                    { label: "Enrolment Date", key: "enrollment_date",  type: "date",   md: 6 },
                  ].map(({ label, key, type, md }) => (
                    <Grid item xs={12} md={md} key={key}>
                      <TextField fullWidth label={label} type={type}
                        InputLabelProps={type === "date" ? { shrink: true } : undefined}
                        inputProps={type === "number" ? { min: 0, max: 100 } : undefined}
                        sx={inputSx} value={(form as any)[key]}
                        onChange={(e) => setForm({ ...form, [key]: type === "number" ? Number(e.target.value) : e.target.value })} />
                    </Grid>
                  ))}
                </>
              )}
            </Grid>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, borderTop: `1px solid ${C.border}` }}>
            <Button onClick={() => setDialogOpen(false)} disabled={saving}
              sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: "none", borderRadius: "8px" }}>
              Cancel
            </Button>
            <Button variant="contained" onClick={saveStudent}
              disabled={saving || !form.first_name || !form.last_name || (!editingId && !form.classroom_id) || (!editingId && !activeSessionId)}
              sx={{
                backgroundColor: C.accent, color: "#111827", fontFamily: FONT, fontWeight: 600,
                textTransform: "none", borderRadius: "10px", px: 3,
                "&:hover": { backgroundColor: "#FBBF24" },
                "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" },
              }}>
              {saving ? 'Saving…' : editingId ? 'Update Student' : 'Add Student'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </>
  );
}