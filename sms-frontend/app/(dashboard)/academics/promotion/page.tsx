'use client';

import { useEffect, useState } from 'react';
import {
  Box, Button, Card, Grid, MenuItem, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography, CircularProgress, Chip, Dialog,
  DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { ArrowForward, CheckCircle, Cancel, Visibility, School, HelpOutline } from '@mui/icons-material';
import { api } from '@/app/lib/api';

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
  yellow:        "#FBBF24",
  yellowDim:     "rgba(251,191,36,0.1)",
  inputBg:       "#1C2333",
};
const FONT = "'DM Sans', sans-serif";
const EASE = "260ms cubic-bezier(0.4,0,0.2,1)";

const inputSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: C.inputBg, borderRadius: "10px", fontFamily: FONT,
    color: C.textPrimary, fontSize: "0.875rem",
    "& fieldset": { borderColor: C.border },
    "&:hover fieldset": { borderColor: "rgba(245,158,11,0.35)" },
    "&.Mui-focused fieldset": { borderColor: C.accent },
  },
  "& .MuiInputLabel-root": { color: C.textSecondary, fontFamily: FONT, fontSize: "0.875rem" },
  "& .MuiInputLabel-root.Mui-focused": { color: C.accent },
  "& .MuiSelect-select": { color: C.textPrimary, fontFamily: FONT },
  "& .MuiSvgIcon-root": { color: C.textSecondary },
};

const menuPaperSx = {
  PaperProps: {
    sx: {
      backgroundColor: C.surfaceHover, border: `1px solid ${C.border}`, borderRadius: "10px",
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
  textTransform: "uppercase" as const, py: 1.5,
};

const tdSx = {
  borderColor: C.border, color: C.textPrimary,
  fontFamily: FONT, fontSize: "0.855rem", py: 1.5,
};

type Classroom    = { id: number; grade_name: string; section: string };
type Session      = { id: number; name: string };
type StudentInfo  = { student_id: number; name: string; admission_no: string };
type Preview      = {
  classroom_id: number;
  total_students: number;
  passed_students: StudentInfo[];
  failed_students: StudentInfo[];
  no_result_students: StudentInfo[];
};
type PromoteResult = {
  message: string;
  promoted_students: number;
  failed_students: number;
  total_students: number;
};

export default function PromotionPage() {
  const [classes, setClasses]               = useState<Classroom[]>([]);
  const [sessions, setSessions]             = useState<Session[]>([]);
  const [selectedClass, setSelectedClass]   = useState<number>(0);
  const [nextSession, setNextSession]       = useState<number>(0);
  const [preview, setPreview]               = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [promoting, setPromoting]           = useState(false);
  const [result, setResult]                 = useState<PromoteResult | null>(null);
  const [confirmOpen, setConfirmOpen]       = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get('/classes'), api.get('/sessions')])
      .then(([c, s]) => { setClasses(c.data); setSessions(s.data); });
  }, []);

  const handlePreview = async () => {
    if (!selectedClass) return;
    setLoadingPreview(true);
    setPreview(null);
    setResult(null);
    setError(null);
    try {
      const res = await api.get(`/promotion/preview/${selectedClass}`);
      setPreview(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handlePromote = async () => {
    if (!selectedClass || !nextSession) return;
    setPromoting(true);
    setConfirmOpen(false);
    setError(null);
    try {
      const res = await api.post(`/promotion/class/${selectedClass}`, null, {
        params: { next_session_id: nextSession },
      });
      setResult(res.data);
      setPreview(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Promotion failed');
    } finally {
      setPromoting(false);
    }
  };

  const selectedClassObj = classes.find(c => c.id === selectedClass);

  const allRows = preview ? [
    ...preview.passed_students.map(s    => ({ ...s, status: 'pass' as const })),
    ...preview.failed_students.map(s    => ({ ...s, status: 'fail' as const })),
    ...preview.no_result_students.map(s => ({ ...s, status: 'none' as const })),
  ] : [];

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      <Box sx={{ p: { xs: 2, sm: 3 }, backgroundColor: C.bg, minHeight: "100%" }}>

        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
            <Box sx={{ width: 3, height: 22, borderRadius: 2, backgroundColor: C.accent, boxShadow: `0 0 8px ${C.accent}` }} />
            <Typography sx={{ fontSize: "1.35rem", fontWeight: 700, color: C.textPrimary, fontFamily: FONT, letterSpacing: "-0.02em" }}>
              Student Promotion
            </Typography>
          </Box>
          <Typography sx={{ color: C.textSecondary, fontSize: "0.82rem", fontFamily: FONT, ml: "19px" }}>
            Preview exam results and promote students to the next grade
          </Typography>
        </Box>

        {/* Controls */}
        <Card sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: "14px", p: 3, mb: 3 }}>
          <Typography sx={{ color: C.textSecondary, fontFamily: FONT, fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", mb: 2 }}>
            Select Class &amp; Target Session
          </Typography>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid item xs={12} md={4}>
              <TextField select fullWidth label="Current Class" value={selectedClass}
                onChange={(e) => { setSelectedClass(Number(e.target.value)); setPreview(null); setResult(null); setError(null); }}
                sx={inputSx} SelectProps={{ MenuProps: menuPaperSx }}>
                <MenuItem value={0} disabled>Select Class</MenuItem>
                {classes.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.grade_name} – {c.section}</MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField select fullWidth label="Promote To Session" value={nextSession}
                onChange={(e) => setNextSession(Number(e.target.value))}
                sx={inputSx} SelectProps={{ MenuProps: menuPaperSx }}>
                <MenuItem value={0} disabled>Select Next Session</MenuItem>
                {sessions.map(s => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} md={4}>
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <Button fullWidth onClick={handlePreview}
                  disabled={!selectedClass || loadingPreview}
                  startIcon={loadingPreview
                    ? <CircularProgress size={15} sx={{ color: C.accent }} />
                    : <Visibility sx={{ fontSize: 17 }} />}
                  sx={{
                    border: `1px solid ${C.accent}`, color: C.accent, fontFamily: FONT,
                    fontWeight: 600, fontSize: "0.82rem", borderRadius: "10px",
                    textTransform: "none", py: 1,
                    "&:hover": { backgroundColor: C.accentDim },
                    "&.Mui-disabled": { opacity: 0.4, borderColor: C.border, color: C.textSecondary },
                  }}>
                  Preview
                </Button>

                <Button fullWidth onClick={() => setConfirmOpen(true)}
                  disabled={!preview || !nextSession || promoting || (preview?.passed_students.length === 0)}
                  startIcon={promoting
                    ? <CircularProgress size={15} sx={{ color: "#111" }} />
                    : <ArrowForward sx={{ fontSize: 17 }} />}
                  sx={{
                    backgroundColor: C.accent, color: "#111827", fontFamily: FONT,
                    fontWeight: 600, fontSize: "0.82rem", borderRadius: "10px",
                    textTransform: "none", py: 1,
                    "&:hover": { backgroundColor: "#FBBF24" },
                    "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" },
                  }}>
                  Promote
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Card>

        {/* Error */}
        {error && (
          <Card sx={{ backgroundColor: C.redDim, border: `1px solid ${C.red}44`, borderRadius: "12px", p: 2, mb: 3 }}>
            <Typography sx={{ color: C.red, fontFamily: FONT, fontSize: "0.875rem", fontWeight: 500 }}>
              ⚠ {error}
            </Typography>
          </Card>
        )}

        {/* Success */}
        {result && (
          <Card sx={{ backgroundColor: C.greenDim, border: `1px solid ${C.green}44`, borderRadius: "14px", p: 3, mb: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2.5 }}>
              <CheckCircle sx={{ color: C.green, fontSize: 20 }} />
              <Typography sx={{ color: C.green, fontFamily: FONT, fontWeight: 700, fontSize: "0.95rem" }}>
                Promotion Completed Successfully
              </Typography>
            </Box>
            <Grid container spacing={2}>
              {[
                { label: "Total",     value: result.total_students,    color: C.textPrimary },
                { label: "Promoted",  value: result.promoted_students, color: C.green },
                { label: "Held Back", value: result.failed_students,   color: C.red },
              ].map(({ label, value, color }) => (
                <Grid item xs={4} key={label}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography sx={{ fontSize: "2rem", fontWeight: 700, color, fontFamily: FONT, lineHeight: 1 }}>{value}</Typography>
                    <Typography sx={{ fontSize: "0.73rem", color: C.textSecondary, fontFamily: FONT, mt: 0.5 }}>{label}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Card>
        )}

        {/* Loading */}
        {loadingPreview && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={32} thickness={3} sx={{ color: C.accent }} />
          </Box>
        )}

        {/* Preview */}
        {preview && (
          <>
            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              {[
                { label: "Total Students",    value: preview.total_students,            color: C.accent, dim: C.accentDim },
                { label: "Will be Promoted",  value: preview.passed_students.length,   color: C.green,  dim: C.greenDim  },
                { label: "Will be Held Back", value: preview.failed_students.length,   color: C.red,    dim: C.redDim    },
                { label: "No Results Yet",    value: preview.no_result_students.length,color: C.yellow, dim: C.yellowDim },
              ].map(({ label, value, color, dim }) => (
                <Grid item xs={6} md={3} key={label}>
                  <Card sx={{ backgroundColor: dim, border: `1px solid ${color}22`, borderRadius: "12px", p: 2, textAlign: "center" }}>
                    <Typography sx={{ fontSize: "1.8rem", fontWeight: 700, color, fontFamily: FONT, lineHeight: 1 }}>{value}</Typography>
                    <Typography sx={{ fontSize: "0.72rem", color: C.textSecondary, fontFamily: FONT, mt: 0.75 }}>{label}</Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Card sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: "14px", overflow: "hidden" }}>
              <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 1 }}>
                <School sx={{ color: C.accent, fontSize: 18 }} />
                <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: "0.9rem", color: C.textPrimary }}>
                  {selectedClassObj?.grade_name} – {selectedClassObj?.section}
                  <span style={{ color: C.textSecondary, fontWeight: 400, fontSize: "0.82rem" }}> · {preview.total_students} students</span>
                </Typography>
              </Box>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: C.surfaceHover }}>
                    {["Adm. No.", "Name", "Result"].map(h => (
                      <TableCell key={h} sx={thSx}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allRows.map((row) => (
                    <TableRow key={row.student_id}
                      sx={{ "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" }, transition: `background ${EASE}` }}>
                      <TableCell sx={{ ...tdSx, color: C.accent, fontWeight: 600 }}>{row.admission_no}</TableCell>
                      <TableCell sx={{ ...tdSx, fontWeight: 600 }}>{row.name}</TableCell>
                      <TableCell sx={tdSx}>
                        {row.status === 'pass' && (
                          <Chip icon={<CheckCircle sx={{ fontSize: "14px !important", color: `${C.green} !important` }} />}
                            label="Will be Promoted" size="small"
                            sx={{ backgroundColor: C.greenDim, color: C.green, fontFamily: FONT, fontWeight: 600, fontSize: "0.72rem", border: `1px solid ${C.green}33`, height: 24 }} />
                        )}
                        {row.status === 'fail' && (
                          <Chip icon={<Cancel sx={{ fontSize: "14px !important", color: `${C.red} !important` }} />}
                            label="Will be Held Back" size="small"
                            sx={{ backgroundColor: C.redDim, color: C.red, fontFamily: FONT, fontWeight: 600, fontSize: "0.72rem", border: `1px solid ${C.red}33`, height: 24 }} />
                        )}
                        {row.status === 'none' && (
                          <Chip icon={<HelpOutline sx={{ fontSize: "14px !important", color: `${C.yellow} !important` }} />}
                            label="No Results" size="small"
                            sx={{ backgroundColor: C.yellowDim, color: C.yellow, fontFamily: FONT, fontWeight: 600, fontSize: "0.72rem", border: `1px solid ${C.yellow}33`, height: 24 }} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        )}

        {/* Confirm dialog */}
        <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth
          PaperProps={{ sx: { backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: "16px" } }}>
          <DialogTitle sx={{ fontFamily: FONT, fontWeight: 700, fontSize: "1rem", color: C.textPrimary, borderBottom: `1px solid ${C.border}` }}>
            Confirm Promotion
          </DialogTitle>
          <DialogContent sx={{ pt: 2.5 }}>
            <Typography sx={{ color: C.textSecondary, fontFamily: FONT, fontSize: "0.875rem", lineHeight: 1.8 }}>
              You are about to promote{" "}
              <strong style={{ color: C.green }}>{preview?.passed_students.length} students</strong> from{" "}
              <strong style={{ color: C.accent }}>{selectedClassObj?.grade_name} – {selectedClassObj?.section}</strong>.
              <br />
              <strong style={{ color: C.red }}>{preview?.failed_students.length} students</strong> will be held back.
              {(preview?.no_result_students.length ?? 0) > 0 && (
                <><br /><strong style={{ color: C.yellow }}>{preview?.no_result_students.length} students</strong> with no results will also be held back.</>
              )}
              <br /><br />
              <span style={{ color: C.red, fontSize: "0.8rem" }}>⚠ This action cannot be undone.</span>
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, borderTop: `1px solid ${C.border}` }}>
            <Button onClick={() => setConfirmOpen(false)}
              sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: "none", borderRadius: "8px" }}>
              Cancel
            </Button>
            <Button onClick={handlePromote} variant="contained"
              sx={{
                backgroundColor: C.accent, color: "#111827", fontFamily: FONT, fontWeight: 600,
                textTransform: "none", borderRadius: "10px", px: 3,
                "&:hover": { backgroundColor: "#FBBF24" },
              }}>
              Yes, Promote
            </Button>
          </DialogActions>
        </Dialog>

      </Box>
    </>
  );
}