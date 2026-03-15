'use client';

import React, { useEffect, useState } from 'react';
import {
  Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, IconButton, MenuItem, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Typography,
  useMediaQuery, useTheme, Fab, Tooltip,
} from '@mui/material';
import {
  Add, Edit, Delete, Search, Close, DescriptionOutlined,
  ClassOutlined, MenuBookOutlined, QuizOutlined,
} from '@mui/icons-material';
import { api } from '@/app/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/app/store/authStore';
import { useRouter } from 'next/navigation';

// ─── Design tokens ────────────────────────────────────────────────────
const C = {
  bg:           '#0D1117',
  surface:      '#161B27',
  surfaceHover: '#1C2333',
  border:       'rgba(255,255,255,0.07)',
  accent:       '#F59E0B',
  accentDim:    'rgba(245,158,11,0.12)',
  accentGlow:   'rgba(245,158,11,0.28)',
  textPrimary:  '#F9FAFB',
  textSecondary:'rgba(249,250,251,0.45)',
  green:        '#34D399',
  greenDim:     'rgba(52,211,153,0.1)',
  blue:         '#60A5FA',
  blueDim:      'rgba(96,165,250,0.1)',
  red:          '#F87171',
  redDim:       'rgba(248,113,113,0.1)',
  purple:       '#A78BFA',
  purpleDim:    'rgba(167,139,250,0.1)',
  inputBg:      '#1C2333',
};
const FONT = "'DM Sans', sans-serif";
const EASE = '280ms cubic-bezier(0.4,0,0.2,1)';

// ─── Shared styles ────────────────────────────────────────────────────
const inputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: C.inputBg, borderRadius: '10px',
    fontFamily: FONT, color: C.textPrimary, fontSize: '0.875rem',
    '& fieldset': { borderColor: C.border },
    '&:hover fieldset': { borderColor: 'rgba(245,158,11,0.35)' },
    '&.Mui-focused fieldset': { borderColor: C.accent },
  },
  '& .MuiInputLabel-root': { color: C.textSecondary, fontFamily: FONT, fontSize: '0.875rem' },
  '& .MuiInputLabel-root.Mui-focused': { color: C.accent },
  '& input': { color: C.textPrimary, fontFamily: FONT },
  '& .MuiSelect-select': { color: C.textPrimary, fontFamily: FONT },
  '& .MuiSvgIcon-root': { color: C.textSecondary },
};

const menuProps = {
  PaperProps: {
    sx: {
      backgroundColor: C.surfaceHover, border: `1px solid ${C.border}`,
      borderRadius: '10px', boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
      '& .MuiMenuItem-root': {
        fontFamily: FONT, fontSize: '0.875rem', color: C.textPrimary,
        '&:hover': { backgroundColor: C.accentDim },
        '&.Mui-selected': { backgroundColor: C.accentDim, color: C.accent },
      },
    },
  },
};

const thSx = {
  borderColor: C.border, color: C.textSecondary, fontFamily: FONT,
  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase' as const, py: 1.5, whiteSpace: 'nowrap' as const,
  backgroundColor: C.surfaceHover,
};
const tdSx = {
  borderColor: C.border, color: C.textPrimary,
  fontFamily: FONT, fontSize: '0.855rem', py: 1.75,
};

// ─── Types — match ExamPaperOut exactly ───────────────────────────────
type ExamPaper = {
  id: number;
  exam_id: number;
  classroom_id: number;
  subject_id: number;
  total_marks: number;
  pass_marks: number;
  exam_name: string;
  classroom_name: string;
  subject_name: string;
};

// ExamPaperCreate: exam_id, classroom_id, subject_id, total_marks, pass_marks
type PaperForm = {
  exam_id: number;
  classroom_id: number;
  subject_id: number;
  total_marks: number;
  pass_marks: number;
};

const emptyForm: PaperForm = {
  exam_id: 0, classroom_id: 0, subject_id: 0,
  total_marks: 100, pass_marks: 40,
};

type Exam      = { id: number; name: string };
type Classroom = {
  id: number;
  grade_name: string | null;
  section: string;
  class_name: string;
};
type Subject   = { id: number; name: string };

// Build a readable label from the /classes/ response shape
function classroomLabel(c: Classroom) {
  if (c.grade_name && c.section) return `${c.grade_name} – ${c.section}`;
  if (c.grade_name) return c.grade_name;
  return c.class_name || c.section || `Class #${c.id}`;
}

// ─── Sub-components ───────────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return (
    <Grid item xs={12}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, mb: 0.5 }}>
        <Box sx={{ width: 3, height: 15, borderRadius: 1, backgroundColor: C.accent }} />
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSecondary, fontFamily: FONT }}>
          {label}
        </Typography>
      </Box>
    </Grid>
  );
}

function StatCard({ label, value, color, dim, icon: Icon }: any) {
  return (
    <Card sx={{
      backgroundColor: C.surface, border: `1px solid ${C.border}`,
      borderRadius: '12px', p: 2.5, position: 'relative', overflow: 'hidden',
      transition: `transform ${EASE}, box-shadow ${EASE}`,
      '&:hover': { transform: 'translateY(-3px)', boxShadow: `0 12px 32px rgba(0,0,0,0.3), 0 0 0 1px ${color}25` },
      '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, ${color}, transparent)` },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontSize: '0.68rem', color: C.textSecondary, fontFamily: FONT, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.75 }}>
            {label}
          </Typography>
          <Typography sx={{ fontSize: '1.6rem', fontWeight: 700, color: C.textPrimary, fontFamily: FONT, letterSpacing: '-0.02em', lineHeight: 1 }}>
            {value}
          </Typography>
        </Box>
        <Box sx={{ width: 40, height: 40, borderRadius: '10px', backgroundColor: dim, border: `1px solid ${color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon sx={{ fontSize: 20, color }} />
        </Box>
      </Box>
    </Card>
  );
}

// Pass rate pill
function PassRate({ total, pass }: { total: number; pass: number }) {
  const pct = total > 0 ? Math.round((pass / total) * 100) : 0;
  const color = pct >= 60 ? C.green : pct >= 40 ? C.accent : C.red;
  const dim   = pct >= 60 ? C.greenDim : pct >= 40 ? C.accentDim : C.redDim;
  return (
    <Chip label={`${pct}%`} size="small"
      sx={{ backgroundColor: dim, color, fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', height: 22, border: `1px solid ${color}30` }} />
  );
}

// Mobile paper card
function PaperCard({ paper, onEdit, onDelete }: { paper: ExamPaper; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', p: 2, mb: 1.5, transition: `border-color ${EASE}`, '&:hover': { borderColor: 'rgba(245,158,11,0.25)' } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
        <Box sx={{ flex: 1, mr: 1 }}>
          {/* Exam name */}
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: C.textPrimary, fontFamily: FONT, mb: 0.5 }}>
            {paper.exam_name}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            <Chip label={paper.subject_name} size="small"
              sx={{ backgroundColor: C.accentDim, color: C.accent, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid rgba(245,158,11,0.2)` }} />
            <Chip label={paper.classroom_name} size="small"
              sx={{ backgroundColor: C.blueDim, color: C.blue, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid ${C.blue}25` }} />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={onEdit} sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.accentDim, color: C.accent }, transition: `all ${EASE}` }}>
            <Edit sx={{ fontSize: 15 }} />
          </IconButton>
          <IconButton size="small" onClick={onDelete} sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.redDim, color: C.red }, transition: `all ${EASE}` }}>
            <Delete sx={{ fontSize: 15 }} />
          </IconButton>
        </Box>
      </Box>

      <Grid container spacing={1}>
        {[
          { label: `Total: ${paper.total_marks}`, color: C.textPrimary },
          { label: `Pass: ${paper.pass_marks}`,   color: C.textSecondary },
        ].map(({ label, color }, i) => (
          <Grid item xs={6} key={i}>
            <Typography sx={{ fontSize: '0.78rem', color, fontFamily: FONT }}>{label}</Typography>
          </Grid>
        ))}
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <Typography sx={{ fontSize: '0.72rem', color: C.textSecondary, fontFamily: FONT }}>Pass rate</Typography>
            <PassRate total={paper.total_marks} pass={paper.pass_marks} />
          </Box>
        </Grid>
      </Grid>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────
export default function ExamPapersPage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const router   = useRouter();
  const { user, loading: authLoading } = useAuthStore();

  const [papers, setPapers]       = useState<ExamPaper[]>([]);
  const [exams, setExams]         = useState<Exam[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [subjects, setSubjects]   = useState<Subject[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [examFilter, setExamFilter] = useState<number | 'all'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm]           = useState<PaperForm>(emptyForm);
  const [saving, setSaving]       = useState(false);
  const [deleteId, setDeleteId]   = useState<number | null>(null);
  const [deleting, setDeleting]   = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────
  const fetchPapers = async () => {
    try {
      const res = await api.get('/exam-papers/');
      setPapers(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Failed to load exam papers'); }
  };

  const fetchDeps = async () => {
    try {
      const [examsRes, classRes, subRes] = await Promise.all([
        api.get('/exams/'),
        api.get('/classes'),
        api.get('/subjects'),
      ]);
      setExams(Array.isArray(examsRes.data) ? examsRes.data : []);
      setClassrooms(Array.isArray(classRes.data) ? classRes.data : []);
      setSubjects(Array.isArray(subRes.data) ? subRes.data : []);
    } catch { toast.error('Failed to load dependencies'); }
  };

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchPapers(), fetchDeps()]);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/signin'); return; }
    fetchAll();
  }, [user, authLoading]);

  // ── Filtering ─────────────────────────────────────────────────────
  const filtered = papers.filter(p => {
    const matchSearch = (
      p.exam_name.toLowerCase().includes(search.toLowerCase()) ||
      p.subject_name.toLowerCase().includes(search.toLowerCase()) ||
      p.classroom_name.toLowerCase().includes(search.toLowerCase())
    );
    const matchExam = examFilter === 'all' || p.exam_id === examFilter;
    return matchSearch && matchExam;
  });

  // Group by exam for table display
  const grouped = filtered.reduce<Record<string, { examName: string; papers: ExamPaper[] }>>((acc, p) => {
    const key = String(p.exam_id);
    if (!acc[key]) acc[key] = { examName: p.exam_name, papers: [] };
    acc[key].papers.push(p);
    return acc;
  }, {});

  // ── Stats ─────────────────────────────────────────────────────────
  const uniqueExams     = new Set(papers.map(p => p.exam_id)).size;
  const uniqueSubjects  = new Set(papers.map(p => p.subject_id)).size;
  const avgPassRate     = papers.length
    ? Math.round(papers.reduce((s, p) => s + (p.pass_marks / (p.total_marks || 1)), 0) / papers.length * 100)
    : 0;

  // ── Handlers ──────────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ ...emptyForm, exam_id: exams[0]?.id ?? 0 });
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (p: ExamPaper) => {
    setForm({ exam_id: p.exam_id, classroom_id: p.classroom_id, subject_id: p.subject_id, total_marks: p.total_marks, pass_marks: p.pass_marks });
    setEditingId(p.id);
    setDialogOpen(true);
  };

  const savePaper = async () => {
    if (!form.exam_id || !form.classroom_id || !form.subject_id) return;
    if (form.pass_marks > form.total_marks) {
      toast.error('Pass marks cannot exceed total marks');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        // PUT only allows total_marks and pass_marks
        await api.put(`/exam-papers/${editingId}`, {
          total_marks: form.total_marks,
          pass_marks: form.pass_marks,
        });
        toast.success('Exam paper updated');
      } else {
        await api.post('/exam-papers/', form);
        toast.success('Exam paper created');
      }
      setDialogOpen(false);
      fetchPapers();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Failed to save exam paper');
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/exam-papers/${deleteId}`);
      toast.success('Exam paper deleted');
      setDeleteId(null);
      fetchPapers();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Cannot delete exam paper');
    } finally { setDeleting(false); }
  };

  const noExams = exams.length === 0;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: '100%' }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', mb: { xs: 3, md: 4 }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
              <Box sx={{ width: 3, height: 22, borderRadius: 2, backgroundColor: C.accent, boxShadow: `0 0 8px ${C.accent}` }} />
              <Typography sx={{ fontSize: { xs: '1.15rem', md: '1.35rem' }, fontWeight: 700, color: C.textPrimary, fontFamily: FONT, letterSpacing: '-0.02em' }}>
                Exam Papers
              </Typography>
            </Box>
            <Typography sx={{ color: C.textSecondary, fontSize: '0.82rem', fontFamily: FONT, ml: '19px' }}>
              Assign subjects and mark schemes to exams per classroom
            </Typography>
          </Box>

          {!isMobile && (
            <Tooltip title={noExams ? 'Create an exam first' : ''} arrow>
              <span>
                <Button onClick={openAdd} disabled={noExams} startIcon={<Add sx={{ fontSize: 18 }} />} sx={{
                  backgroundColor: noExams ? 'rgba(255,255,255,0.06)' : C.accent,
                  color: noExams ? C.textSecondary : '#111827',
                  fontFamily: FONT, fontWeight: 600, fontSize: '0.82rem',
                  borderRadius: '10px', px: 2.5, py: 1, textTransform: 'none', whiteSpace: 'nowrap',
                  boxShadow: noExams ? 'none' : `0 4px 16px ${C.accentDim}`,
                  '&:hover': noExams ? {} : { backgroundColor: '#FBBF24', boxShadow: '0 6px 20px rgba(245,158,11,0.35)' },
                  '&.Mui-disabled': { backgroundColor: 'rgba(255,255,255,0.05)', color: C.textSecondary },
                }}>
                  Add Exam Paper
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>

        {/* ── No exams warning ───────────────────────────────────── */}
        {!loading && noExams && (
          <Box sx={{ p: 2.5, mb: 3, borderRadius: '12px', backgroundColor: C.redDim, border: `1px solid ${C.red}25`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography sx={{ fontSize: '0.875rem', color: C.red, fontFamily: FONT, fontWeight: 600, mb: 0.25 }}>⚠️ No exams available</Typography>
              <Typography sx={{ fontSize: '0.78rem', color: C.textSecondary, fontFamily: FONT }}>
                Exam papers must be linked to an exam. Create an exam first.
              </Typography>
            </Box>
            <Button size="small" onClick={() => router.push('/academics/exams')}
              sx={{ color: C.red, border: `1px solid ${C.red}40`, fontFamily: FONT, fontWeight: 600, fontSize: '0.78rem', textTransform: 'none', borderRadius: '8px', px: 2, '&:hover': { backgroundColor: C.redDim } }}>
              Go to Exams →
            </Button>
          </Box>
        )}

        {/* ── Stat cards ─────────────────────────────────────────── */}
        <Grid container spacing={{ xs: 1.5, md: 2 }} sx={{ mb: { xs: 2.5, md: 3 } }}>
          {[
            { label: 'Total Papers',  value: papers.length, color: C.accent,  dim: C.accentDim,  icon: DescriptionOutlined, delay: 0   },
            { label: 'Exams Covered', value: uniqueExams,   color: C.blue,    dim: C.blueDim,    icon: QuizOutlined,        delay: 60  },
            { label: 'Subjects',      value: uniqueSubjects,color: C.purple,  dim: C.purpleDim,  icon: MenuBookOutlined,    delay: 120 },
            { label: 'Avg Pass Rate', value: `${avgPassRate}%`, color: C.green, dim: C.greenDim, icon: ClassOutlined,       delay: 180 },
          ].map(({ label, value, color, dim, icon, delay }, i) => (
            <Grid item xs={6} md={3} key={i} sx={{ animation: `fadeUp 0.4s ${delay}ms ease both` }}>
              <StatCard label={label} value={value} color={color} dim={dim} icon={icon} />
            </Grid>
          ))}
        </Grid>

        {/* ── Search + exam filter ───────────────────────────────── */}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5, flexDirection: { xs: 'column', sm: 'row' } }}>
          <TextField fullWidth placeholder="Search by exam, subject or class…" value={search} size="small"
            onChange={(e) => setSearch(e.target.value)} sx={inputSx}
            InputProps={{ startAdornment: <Search sx={{ color: C.textSecondary, mr: 1, fontSize: 18 }} /> }} />
          <TextField select size="small" label="Exam" value={examFilter}
            onChange={(e) => setExamFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            sx={{ ...inputSx, minWidth: { xs: '100%', sm: 200 } }} SelectProps={{ MenuProps: menuProps }}>
            <MenuItem value="all">All Exams</MenuItem>
            {exams.map(e => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}
          </TextField>
        </Box>

        {/* ── Content ────────────────────────────────────────────── */}
        {(loading || authLoading) ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} thickness={3} sx={{ color: C.accent }} />
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 10 }}>
            <DescriptionOutlined sx={{ fontSize: 44, color: C.textSecondary, mb: 1.5, opacity: 0.4 }} />
            <Typography sx={{ color: C.textSecondary, fontFamily: FONT, fontSize: '0.9rem' }}>
              {search ? 'No papers match your search' : 'No exam papers yet — add your first one'}
            </Typography>
            {!noExams && (
              <Button onClick={openAdd} sx={{ mt: 2, color: C.accent, fontFamily: FONT, textTransform: 'none', fontSize: '0.85rem' }}>
                + Add Exam Paper
              </Button>
            )}
          </Box>
        ) : isMobile ? (
          /* Mobile cards */
          <Box>
            {Object.entries(grouped).map(([key, group]) => (
              <Box key={key} sx={{ mb: 3 }}>
                {/* Exam group header */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <QuizOutlined sx={{ fontSize: 13, color: C.accent }} />
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: C.accent, fontFamily: FONT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {group.examName}
                  </Typography>
                  <Box sx={{ flex: 1, height: '1px', backgroundColor: C.border, ml: 1 }} />
                </Box>
                {group.papers.map(p => (
                  <PaperCard key={p.id} paper={p} onEdit={() => openEdit(p)} onDelete={() => setDeleteId(p.id)} />
                ))}
              </Box>
            ))}
          </Box>
        ) : (
          /* Desktop table grouped by exam */
          <Card sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', boxShadow: '0 4px 24px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    {['Subject', 'Classroom', 'Total Marks', 'Pass Marks', 'Pass Rate', 'Actions'].map(h => (
                      <TableCell key={h} sx={thSx}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(grouped).map(([key, group]) => (
                    <React.Fragment key={key}>
                      {/* Exam group header row */}
                      <TableRow>
                        <TableCell colSpan={6} sx={{ borderColor: C.border, backgroundColor: 'rgba(245,158,11,0.05)', py: 1, px: 2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <QuizOutlined sx={{ fontSize: 13, color: C.accent }} />
                            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: C.accent, fontFamily: FONT, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                              {group.examName}
                            </Typography>
                            <Chip
                              label={`${group.papers.length} paper${group.papers.length !== 1 ? 's' : ''}`}
                              size="small"
                              sx={{ backgroundColor: C.accentDim, color: C.accent, fontFamily: FONT, fontWeight: 600, fontSize: '0.65rem', height: 18, border: `1px solid rgba(245,158,11,0.2)` }}
                            />
                          </Box>
                        </TableCell>
                      </TableRow>

                      {/* Paper rows */}
                      {group.papers.map((p, i) => (
                        <TableRow key={p.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, transition: `background ${EASE}`, animation: `fadeUp 0.35s ${i * 35}ms ease both` }}>

                          {/* Subject */}
                          <TableCell sx={{ ...tdSx, fontWeight: 600 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Box sx={{ width: 30, height: 30, borderRadius: '8px', backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.18)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <MenuBookOutlined sx={{ fontSize: 14, color: C.accent }} />
                              </Box>
                              {p.subject_name}
                            </Box>
                          </TableCell>

                          {/* Classroom */}
                          <TableCell sx={tdSx}>
                            <Chip label={p.classroom_name} size="small"
                              sx={{ backgroundColor: C.blueDim, color: C.blue, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid ${C.blue}25` }} />
                          </TableCell>

                          {/* Total marks */}
                          <TableCell sx={{ ...tdSx, fontWeight: 700, color: C.textPrimary }}>
                            {p.total_marks}
                          </TableCell>

                          {/* Pass marks */}
                          <TableCell sx={{ ...tdSx, color: C.textSecondary }}>
                            {p.pass_marks}
                          </TableCell>

                          {/* Pass rate */}
                          <TableCell sx={tdSx}>
                            <PassRate total={p.total_marks} pass={p.pass_marks} />
                          </TableCell>

                          {/* Actions */}
                          <TableCell sx={tdSx}>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <IconButton size="small" onClick={() => openEdit(p)} sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.accentDim, color: C.accent }, transition: `all ${EASE}` }}>
                                <Edit sx={{ fontSize: 15 }} />
                              </IconButton>
                              <Tooltip title={p.pass_marks > 0 ? 'Delete paper' : ''} arrow>
                                <IconButton size="small" onClick={() => setDeleteId(p.id)} sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.redDim, color: C.red }, transition: `all ${EASE}` }}>
                                  <Delete sx={{ fontSize: 15 }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Card>
        )}

        {/* Mobile FAB */}
        {isMobile && (
          <Tooltip title={noExams ? 'Create an exam first' : 'Add Exam Paper'} arrow>
            <span style={{ position: 'fixed', bottom: 24, right: 24 }}>
              <Fab onClick={openAdd} disabled={noExams}
                sx={{ backgroundColor: noExams ? 'rgba(255,255,255,0.08)' : C.accent, color: noExams ? C.textSecondary : '#111827', boxShadow: noExams ? 'none' : `0 8px 24px ${C.accentGlow}`, '&.Mui-disabled': { backgroundColor: 'rgba(255,255,255,0.05)' } }}>
                <Add />
              </Fab>
            </span>
          </Tooltip>
        )}

        {/* ── Add / Edit Dialog ───────────────────────────────────── */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}
          fullWidth maxWidth="sm" fullScreen={isMobile}
          PaperProps={{ sx: { backgroundColor: C.surface, border: isMobile ? 'none' : `1px solid ${C.border}`, borderRadius: isMobile ? 0 : '16px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' } }}>

          <DialogTitle sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '1.05rem', color: C.textPrimary, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {editingId ? 'Edit Exam Paper' : 'Add Exam Paper'}
            {isMobile && <IconButton onClick={() => setDialogOpen(false)} sx={{ color: C.textSecondary }}><Close /></IconButton>}
          </DialogTitle>

          <DialogContent sx={{ pt: 2 }}>
            <Grid container spacing={2} mt={0}>

              <SectionLabel label="Assignment" />

              {/* Exam — disabled on edit (can't change exam) */}
              <Grid item xs={12}>
                <TextField select fullWidth label="Exam" required sx={inputSx}
                  disabled={!!editingId}
                  value={form.exam_id}
                  onChange={(e) => setForm({ ...form, exam_id: Number(e.target.value) })}
                  SelectProps={{ MenuProps: menuProps }}
                  helperText={editingId ? 'Exam cannot be changed after creation' : ''}
                  FormHelperTextProps={{ sx: { color: C.textSecondary, fontFamily: FONT, fontSize: '0.72rem' } }}>
                  <MenuItem value={0} disabled>Select Exam</MenuItem>
                  {exams.map(e => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}
                </TextField>
              </Grid>

              {/* Classroom — disabled on edit */}
              <Grid item xs={12} md={6}>
                <TextField select fullWidth label="Classroom" required sx={inputSx}
                  disabled={!!editingId}
                  value={form.classroom_id}
                  onChange={(e) => setForm({ ...form, classroom_id: Number(e.target.value) })}
                  SelectProps={{ MenuProps: menuProps }}>
                  <MenuItem value={0} disabled>Select Classroom</MenuItem>
                  {classrooms.map(c => <MenuItem key={c.id} value={c.id}>{classroomLabel(c)}</MenuItem>)}
                </TextField>
              </Grid>

              {/* Subject — disabled on edit */}
              <Grid item xs={12} md={6}>
                <TextField select fullWidth label="Subject" required sx={inputSx}
                  disabled={!!editingId}
                  value={form.subject_id}
                  onChange={(e) => setForm({ ...form, subject_id: Number(e.target.value) })}
                  SelectProps={{ MenuProps: menuProps }}>
                  <MenuItem value={0} disabled>Select Subject</MenuItem>
                  {subjects.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </TextField>
              </Grid>

              <SectionLabel label="Marks" />

              {/* Total marks */}
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Total Marks" type="number" required sx={inputSx}
                  value={form.total_marks} inputProps={{ min: 1 }}
                  onChange={(e) => setForm({ ...form, total_marks: Number(e.target.value) })} />
              </Grid>

              {/* Pass marks */}
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Pass Marks" type="number" required sx={inputSx}
                  value={form.pass_marks} inputProps={{ min: 0, max: form.total_marks }}
                  onChange={(e) => setForm({ ...form, pass_marks: Number(e.target.value) })} />
              </Grid>

              {/* Pass rate live preview */}
              <Grid item xs={12}>
                <Box sx={{ p: 1.75, borderRadius: '10px', backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.18)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.78rem', color: C.textSecondary, fontFamily: FONT }}>Pass rate preview</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.78rem', color: C.textSecondary, fontFamily: FONT }}>
                      {form.pass_marks} / {form.total_marks}
                    </Typography>
                    <PassRate total={form.total_marks} pass={form.pass_marks} />
                  </Box>
                </Box>
              </Grid>

              {/* Validation warning */}
              {form.pass_marks > form.total_marks && (
                <Grid item xs={12}>
                  <Box sx={{ p: 1.5, borderRadius: '10px', backgroundColor: C.redDim, border: `1px solid ${C.red}25` }}>
                    <Typography sx={{ fontSize: '0.78rem', color: C.red, fontFamily: FONT }}>
                      ⚠️ Pass marks cannot exceed total marks
                    </Typography>
                  </Box>
                </Grid>
              )}
            </Grid>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, borderTop: `1px solid ${C.border}` }}>
            <Button onClick={() => setDialogOpen(false)} disabled={saving}
              sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: 'none', borderRadius: '8px' }}>
              Cancel
            </Button>
            <Button variant="contained" onClick={savePaper}
              disabled={saving || !form.exam_id || !form.classroom_id || !form.subject_id || form.pass_marks > form.total_marks}
              sx={{ backgroundColor: C.accent, color: '#111827', fontFamily: FONT, fontWeight: 600, textTransform: 'none', borderRadius: '10px', px: 3, '&:hover': { backgroundColor: '#FBBF24' }, '&.Mui-disabled': { backgroundColor: 'rgba(245,158,11,0.2)', color: 'rgba(17,24,39,0.4)' } }}>
              {saving ? 'Saving…' : editingId ? 'Update Paper' : 'Create Paper'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Delete confirm ──────────────────────────────────────── */}
        <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth
          PaperProps={{ sx: { backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' } }}>
          <DialogTitle sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '1rem', color: C.textPrimary, pb: 1 }}>
            Delete Exam Paper?
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ color: C.textSecondary, fontFamily: FONT, fontSize: '0.875rem' }}>
              This will permanently delete the paper. Deletion is blocked if student results are already linked to it.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, borderTop: `1px solid ${C.border}` }}>
            <Button onClick={() => setDeleteId(null)} disabled={deleting}
              sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: 'none', borderRadius: '8px' }}>Cancel</Button>
            <Button variant="contained" onClick={confirmDelete} disabled={deleting}
              sx={{ backgroundColor: C.red, color: '#fff', fontFamily: FONT, fontWeight: 600, textTransform: 'none', borderRadius: '10px', px: 3, '&:hover': { backgroundColor: '#ef4444' } }}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>

      </Box>
    </>
  );
}