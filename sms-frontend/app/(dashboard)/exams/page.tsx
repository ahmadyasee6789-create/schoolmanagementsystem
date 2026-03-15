'use client';

import React, { useEffect, useState } from 'react';
import {
  Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, IconButton, MenuItem, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Typography,
  useMediaQuery, useTheme, Fab, Tooltip, Drawer,
} from '@mui/material';
import {
  Add, Edit, Delete, Search, Close, QuizOutlined, FilterList,
  CalendarToday, LockOutlined, PublishedWithChangesOutlined,
  LockOpenOutlined, UnpublishedOutlined, Assignment,
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

// ─── Types — match ExamOut schema exactly ─────────────────────────────
type Term = { id: number; name: string };
type AcademicSession = { id: number; name: string; is_active: boolean };

type Exam = {
  id: number;
  name: string;
  start_date: string;   // date
  end_date: string;     // date
  weightage: number;    // float, e.g. 0.4 = 40%
  is_published: boolean;
  is_locked: boolean;
  term_id: number;
  organization_id: number;
  term?: Term;
};

// ExamCreate: name, start_date, end_date, weightage, term_id
type ExamForm = {
  name: string;
  start_date: string;
  end_date: string;
  weightage: number;
  term_id: number;
};

const emptyForm: ExamForm = {
  name: '', start_date: '', end_date: '', weightage: 0, term_id: 0,
};

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

// Status badges derived from is_published + is_locked
function ExamStatusBadge({ exam }: { exam: Exam }) {
  if (exam.is_locked) return (
    <Chip icon={<LockOutlined sx={{ fontSize: '11px !important', color: `${C.red} !important` }} />}
      label="Locked" size="small"
      sx={{ backgroundColor: C.redDim, color: C.red, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid ${C.red}30` }} />
  );
  if (exam.is_published) return (
    <Chip icon={<PublishedWithChangesOutlined sx={{ fontSize: '11px !important', color: `${C.green} !important` }} />}
      label="Published" size="small"
      sx={{ backgroundColor: C.greenDim, color: C.green, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid ${C.green}30` }} />
  );
  return (
    <Chip icon={<UnpublishedOutlined sx={{ fontSize: '11px !important', color: `${C.textSecondary} !important` }} />}
      label="Draft" size="small"
      sx={{ backgroundColor: 'rgba(255,255,255,0.05)', color: C.textSecondary, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid ${C.border}` }} />
  );
}

// Mobile exam card
function ExamCard({ exam, onEdit, onPublish, onLock, onDelete }: {
  exam: Exam; onEdit: () => void; onPublish: () => void; onLock: () => void; onDelete: () => void;
}) {
  return (
    <Card sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', p: 2, mb: 1.5, transition: `border-color ${EASE}`, '&:hover': { borderColor: 'rgba(245,158,11,0.25)' } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
        <Box sx={{ flex: 1, mr: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: C.textPrimary, fontFamily: FONT, mb: 0.75 }}>
            {exam.name}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
            <ExamStatusBadge exam={exam} />
            <Chip label={`${(exam.weightage * 100).toFixed(0)}% weight`} size="small"
              sx={{ backgroundColor: C.purpleDim, color: C.purple, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid ${C.purple}30` }} />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {!exam.is_locked && (
            <IconButton size="small" onClick={onEdit} sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.accentDim, color: C.accent }, transition: `all ${EASE}` }}>
              <Edit sx={{ fontSize: 15 }} />
            </IconButton>
          )}
          {!exam.is_published && !exam.is_locked && (
            <IconButton size="small" onClick={onDelete} sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.redDim, color: C.red }, transition: `all ${EASE}` }}>
              <Delete sx={{ fontSize: 15 }} />
            </IconButton>
          )}
        </Box>
      </Box>

      <Grid container spacing={1} sx={{ mb: 1.5 }}>
        <Grid item xs={6}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <CalendarToday sx={{ fontSize: 12, color: C.textSecondary }} />
            <Typography sx={{ fontSize: '0.75rem', color: C.textSecondary, fontFamily: FONT }}>
              {exam.start_date} → {exam.end_date}
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={6}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Assignment sx={{ fontSize: 12, color: C.textSecondary }} />
            <Typography sx={{ fontSize: '0.75rem', color: C.textSecondary, fontFamily: FONT }}>
              {exam.term?.name ?? `Term #${exam.term_id}`}
            </Typography>
          </Box>
        </Grid>
      </Grid>

      {/* Publish / Lock actions */}
      <Box sx={{ display: 'flex', gap: 1, pt: 1, borderTop: `1px solid ${C.border}` }}>
        {!exam.is_published && !exam.is_locked && (
          <Button size="small" onClick={onPublish} startIcon={<PublishedWithChangesOutlined sx={{ fontSize: 14 }} />}
            sx={{ color: C.green, fontFamily: FONT, fontWeight: 600, fontSize: '0.72rem', textTransform: 'none', borderRadius: '7px', px: 1.5, border: `1px solid ${C.green}30`, '&:hover': { backgroundColor: C.greenDim } }}>
            Publish
          </Button>
        )}
        {exam.is_published && !exam.is_locked && (
          <Button size="small" onClick={onLock} startIcon={<LockOutlined sx={{ fontSize: 14 }} />}
            sx={{ color: C.red, fontFamily: FONT, fontWeight: 600, fontSize: '0.72rem', textTransform: 'none', borderRadius: '7px', px: 1.5, border: `1px solid ${C.red}30`, '&:hover': { backgroundColor: C.redDim } }}>
            Lock
          </Button>
        )}
      </Box>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────
export default function ExamsPage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const router   = useRouter();
  const { user, loading: authLoading } = useAuthStore();

  const [exams, setExams]             = useState<Exam[]>([]);
  const [terms, setTerms]             = useState<Term[]>([]);
  const [activeSession, setActiveSession] = useState<AcademicSession | null>(null);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [termFilter, setTermFilter]   = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'locked'>('all');
  const [filterOpen, setFilterOpen]   = useState(false);
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [form, setForm]               = useState<ExamForm>(emptyForm);
  const [saving, setSaving]           = useState(false);
  const [deleteId, setDeleteId]       = useState<number | null>(null);
  const [deleting, setDeleting]       = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────
  const fetchActiveSession = async () => {
    try {
      const res = await api.get('/sessions/active');
      setActiveSession(res.data);
    } catch { setActiveSession(null); }
  };

  const fetchTerms = async () => {
    try {
      const res = await api.get('/terms/');
      const data = Array.isArray(res.data) ? res.data : [];
      setTerms(data);
      // Auto-select first term if only one exists
      if (data.length === 1) setForm(prev => ({ ...prev, term_id: data[0].id }));
    } catch { setTerms([]); }
  };

  const fetchExams = async () => {
    try {
      const res = await api.get('/exams/');
      setExams(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      toast.error('Failed to load exams');
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchActiveSession(), fetchTerms(), fetchExams()]);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/signin'); return; }
    fetchAll();
  }, [user, authLoading]);

  // ── Filtering ─────────────────────────────────────────────────────
  const filtered = exams.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase());
    const matchTerm   = termFilter === 'all' || e.term_id === termFilter;
    const matchStatus = statusFilter === 'all'
      || (statusFilter === 'locked'    && e.is_locked)
      || (statusFilter === 'published' && e.is_published && !e.is_locked)
      || (statusFilter === 'draft'     && !e.is_published && !e.is_locked);
    return matchSearch && matchTerm && matchStatus;
  });

  // ── Stats ─────────────────────────────────────────────────────────
  const stats = {
    total:     exams.length,
    draft:     exams.filter(e => !e.is_published && !e.is_locked).length,
    published: exams.filter(e => e.is_published && !e.is_locked).length,
    locked:    exams.filter(e => e.is_locked).length,
  };

  // ── Handlers ──────────────────────────────────────────────────────
  const openAdd = () => {
    const firstTerm = terms[0];
    setForm({ ...emptyForm, term_id: firstTerm?.id ?? 0 });
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (exam: Exam) => {
    setForm({
      name: exam.name,
      start_date: exam.start_date,
      end_date: exam.end_date,
      weightage: exam.weightage,
      term_id: exam.term_id,
    });
    setEditingId(exam.id);
    setDialogOpen(true);
  };

  const saveExam = async () => {
    if (!form.name.trim() || !form.start_date || !form.end_date || !form.term_id) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        start_date: form.start_date,
        end_date: form.end_date,
        weightage: Number(form.weightage),
        term_id: form.term_id,
      };
      if (editingId) {
        await api.put(`/exams/${editingId}`, payload);
        toast.success('Exam updated');
      } else {
        await api.post('/exams/', payload);
        toast.success('Exam scheduled');
      }
      setDialogOpen(false);
      fetchExams();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Failed to save exam');
    } finally { setSaving(false); }
  };

  const publishExam = async (id: number) => {
    try {
      await api.put(`/exams/${id}/publish`);
      toast.success('Exam published');
      fetchExams();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Failed to publish');
    }
  };

  const lockExam = async (id: number) => {
    try {
      await api.put(`/exams/${id}/lock`);
      toast.success('Exam locked');
      fetchExams();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Failed to lock');
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/exams/${deleteId}`);
      toast.success('Exam deleted');
      setDeleteId(null);
      fetchExams();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Cannot delete exam');
    } finally { setDeleting(false); }
  };

  const noTerms = terms.length === 0;

  // ── Filter bar ────────────────────────────────────────────────────
  const FilterBar = () => (
    <Box sx={{ display: 'flex', gap: 1.5, flexDirection: isMobile ? 'column' : 'row', width: isMobile ? '100%' : 'auto' }}>
      <TextField select size="small" label="Term" value={termFilter}
        onChange={(e) => setTermFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        sx={{ ...inputSx, minWidth: 150 }} SelectProps={{ MenuProps: menuProps }}>
        <MenuItem value="all">All Terms</MenuItem>
        {terms.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
      </TextField>
      <TextField select size="small" label="Status" value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as any)}
        sx={{ ...inputSx, minWidth: 130 }} SelectProps={{ MenuProps: menuProps }}>
        <MenuItem value="all">All Status</MenuItem>
        <MenuItem value="draft">Draft</MenuItem>
        <MenuItem value="published">Published</MenuItem>
        <MenuItem value="locked">Locked</MenuItem>
      </TextField>
    </Box>
  );

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
                Examinations
              </Typography>
              {activeSession && (
                <Chip label={activeSession.name} size="small"
                  sx={{ backgroundColor: C.greenDim, color: C.green, fontFamily: FONT, fontWeight: 600, fontSize: '0.72rem', border: `1px solid ${C.green}25`, height: 24 }} />
              )}
            </Box>
            <Typography sx={{ color: C.textSecondary, fontSize: '0.82rem', fontFamily: FONT, ml: '19px' }}>
              Schedule and manage exams · publish to make visible · lock after results entry
            </Typography>
          </Box>

          {!isMobile && (
            <Tooltip title={noTerms ? 'Create a term first before adding exams' : ''} arrow>
              <span>
                <Button onClick={openAdd} disabled={noTerms} startIcon={<Add sx={{ fontSize: 18 }} />} sx={{
                  backgroundColor: noTerms ? 'rgba(255,255,255,0.06)' : C.accent,
                  color: noTerms ? C.textSecondary : '#111827',
                  fontFamily: FONT, fontWeight: 600, fontSize: '0.82rem',
                  borderRadius: '10px', px: 2.5, py: 1, textTransform: 'none', whiteSpace: 'nowrap',
                  boxShadow: noTerms ? 'none' : `0 4px 16px ${C.accentDim}`,
                  '&:hover': noTerms ? {} : { backgroundColor: '#FBBF24', boxShadow: '0 6px 20px rgba(245,158,11,0.35)' },
                  '&.Mui-disabled': { backgroundColor: 'rgba(255,255,255,0.05)', color: C.textSecondary },
                }}>
                  Schedule Exam
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>

        {/* ── No terms warning ───────────────────────────────────── */}
        {!loading && noTerms && (
          <Box sx={{ p: 2.5, mb: 3, borderRadius: '12px', backgroundColor: C.redDim, border: `1px solid ${C.red}25`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography sx={{ fontSize: '0.875rem', color: C.red, fontFamily: FONT, fontWeight: 600, mb: 0.25 }}>⚠️ No terms available</Typography>
              <Typography sx={{ fontSize: '0.78rem', color: C.textSecondary, fontFamily: FONT }}>
                Exams must belong to a term. Create at least one term first.
              </Typography>
            </Box>
            <Button size="small" onClick={() => router.push('/academics/terms')}
              sx={{ color: C.red, border: `1px solid ${C.red}40`, fontFamily: FONT, fontWeight: 600, fontSize: '0.78rem', textTransform: 'none', borderRadius: '8px', px: 2, '&:hover': { backgroundColor: C.redDim } }}>
              Go to Terms →
            </Button>
          </Box>
        )}

        {/* ── Stat cards ─────────────────────────────────────────── */}
        <Grid container spacing={{ xs: 1.5, md: 2 }} sx={{ mb: { xs: 2.5, md: 3 } }}>
          {[
            { label: 'Total Exams',  value: stats.total,     color: C.accent,  dim: C.accentDim,  icon: QuizOutlined,              delay: 0   },
            { label: 'Draft',        value: stats.draft,     color: C.blue,    dim: C.blueDim,    icon: UnpublishedOutlined,        delay: 60  },
            { label: 'Published',    value: stats.published, color: C.green,   dim: C.greenDim,   icon: PublishedWithChangesOutlined,delay: 120 },
            { label: 'Locked',       value: stats.locked,    color: C.red,     dim: C.redDim,     icon: LockOutlined,              delay: 180 },
          ].map(({ label, value, color, dim, icon, delay }, i) => (
            <Grid item xs={6} md={3} key={i} sx={{ animation: `fadeUp 0.4s ${delay}ms ease both` }}>
              <StatCard label={label} value={value} color={color} dim={dim} icon={icon} />
            </Grid>
          ))}
        </Grid>

        {/* ── Search + filters ───────────────────────────────────── */}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5, alignItems: 'center' }}>
          <TextField fullWidth placeholder="Search exams…" value={search} size="small"
            onChange={(e) => setSearch(e.target.value)} sx={inputSx}
            InputProps={{ startAdornment: <Search sx={{ color: C.textSecondary, mr: 1, fontSize: 18 }} /> }} />
          {!isTablet ? <FilterBar /> : (
            <IconButton onClick={() => setFilterOpen(true)} sx={{ border: `1px solid ${C.border}`, borderRadius: '10px', p: 1, color: C.textSecondary, '&:hover': { backgroundColor: C.accentDim, borderColor: C.accent, color: C.accent }, transition: `all ${EASE}` }}>
              <FilterList />
            </IconButton>
          )}
        </Box>

        {/* Mobile filter drawer */}
        <Drawer anchor="bottom" open={filterOpen && isTablet} onClose={() => setFilterOpen(false)}
          PaperProps={{ sx: { backgroundColor: C.surface, border: `1px solid ${C.border}`, borderTopLeftRadius: 16, borderTopRightRadius: 16, p: 3 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography sx={{ fontFamily: FONT, fontWeight: 600, color: C.textPrimary }}>Filters</Typography>
            <IconButton onClick={() => setFilterOpen(false)} sx={{ color: C.textSecondary }}><Close /></IconButton>
          </Box>
          <FilterBar />
          <Button onClick={() => setFilterOpen(false)} sx={{ mt: 2, backgroundColor: C.accent, color: '#111827', fontFamily: FONT, fontWeight: 600, textTransform: 'none', borderRadius: '10px', '&:hover': { backgroundColor: '#FBBF24' } }}>
            Apply
          </Button>
        </Drawer>

        {/* ── Content ────────────────────────────────────────────── */}
        {(loading || authLoading) ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} thickness={3} sx={{ color: C.accent }} />
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 10 }}>
            <QuizOutlined sx={{ fontSize: 44, color: C.textSecondary, mb: 1.5, opacity: 0.4 }} />
            <Typography sx={{ color: C.textSecondary, fontFamily: FONT, fontSize: '0.9rem' }}>
              {search ? 'No exams match your search' : 'No exams yet — schedule your first exam'}
            </Typography>
            {!noTerms && (
              <Button onClick={openAdd} sx={{ mt: 2, color: C.accent, fontFamily: FONT, textTransform: 'none', fontSize: '0.85rem' }}>
                + Schedule Exam
              </Button>
            )}
          </Box>
        ) : isMobile ? (
          <Box>
            {filtered.map(exam => (
              <ExamCard key={exam.id} exam={exam}
                onEdit={() => openEdit(exam)}
                onPublish={() => publishExam(exam.id)}
                onLock={() => lockExam(exam.id)}
                onDelete={() => setDeleteId(exam.id)} />
            ))}
          </Box>
        ) : (
          <Card sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', boxShadow: '0 4px 24px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    {['Exam Name', 'Term', 'Start Date', 'End Date', 'Weightage', 'Status', 'Actions'].map(h => (
                      <TableCell key={h} sx={thSx}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((exam, i) => (
                    <TableRow key={exam.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, transition: `background ${EASE}`, animation: `fadeUp 0.35s ${i * 35}ms ease both` }}>

                      {/* Name */}
                      <TableCell sx={{ ...tdSx, fontWeight: 600, maxWidth: 220 }}>
                        <Typography sx={{ fontFamily: FONT, fontWeight: 600, fontSize: '0.875rem', color: C.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {exam.name}
                        </Typography>
                      </TableCell>

                      {/* Term */}
                      <TableCell sx={tdSx}>
                        <Chip label={exam.term?.name ?? `Term #${exam.term_id}`} size="small"
                          sx={{ backgroundColor: C.accentDim, color: C.accent, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid rgba(245,158,11,0.2)` }} />
                      </TableCell>

                      {/* Dates */}
                      <TableCell sx={{ ...tdSx, color: C.textSecondary, whiteSpace: 'nowrap' }}>{exam.start_date}</TableCell>
                      <TableCell sx={{ ...tdSx, color: C.textSecondary, whiteSpace: 'nowrap' }}>{exam.end_date}</TableCell>

                      {/* Weightage */}
                      <TableCell sx={tdSx}>
                        <Chip label={`${(exam.weightage * 100).toFixed(0)}%`} size="small"
                          sx={{ backgroundColor: C.purpleDim, color: C.purple, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid ${C.purple}30` }} />
                      </TableCell>

                      {/* Status */}
                      <TableCell sx={tdSx}><ExamStatusBadge exam={exam} /></TableCell>

                      {/* Actions */}
                      <TableCell sx={tdSx}>
                        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                          {/* Edit — blocked if locked */}
                          <Tooltip title={exam.is_locked ? 'Locked — cannot edit' : 'Edit'} arrow>
                            <span>
                              <IconButton size="small" disabled={exam.is_locked} onClick={() => openEdit(exam)}
                                sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.accentDim, color: C.accent }, '&.Mui-disabled': { opacity: 0.3 }, transition: `all ${EASE}` }}>
                                <Edit sx={{ fontSize: 15 }} />
                              </IconButton>
                            </span>
                          </Tooltip>

                          {/* Publish */}
                          {!exam.is_published && !exam.is_locked && (
                            <Tooltip title="Publish exam" arrow>
                              <IconButton size="small" onClick={() => publishExam(exam.id)}
                                sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.greenDim, color: C.green }, transition: `all ${EASE}` }}>
                                <PublishedWithChangesOutlined sx={{ fontSize: 15 }} />
                              </IconButton>
                            </Tooltip>
                          )}

                          {/* Lock */}
                          {exam.is_published && !exam.is_locked && (
                            <Tooltip title="Lock exam" arrow>
                              <IconButton size="small" onClick={() => lockExam(exam.id)}
                                sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.redDim, color: C.red }, transition: `all ${EASE}` }}>
                                <LockOutlined sx={{ fontSize: 15 }} />
                              </IconButton>
                            </Tooltip>
                          )}

                          {/* Delete — only draft */}
                          <Tooltip title={exam.is_published || exam.is_locked ? 'Cannot delete published/locked exam' : 'Delete'} arrow>
                            <span>
                              <IconButton size="small" disabled={exam.is_published || exam.is_locked} onClick={() => setDeleteId(exam.id)}
                                sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.redDim, color: C.red }, '&.Mui-disabled': { opacity: 0.3 }, transition: `all ${EASE}` }}>
                                <Delete sx={{ fontSize: 15 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Card>
        )}

        {/* Mobile FAB */}
        {isMobile && (
          <Tooltip title={noTerms ? 'Create a term first' : 'Schedule Exam'} arrow>
            <span style={{ position: 'fixed', bottom: 24, right: 24 }}>
              <Fab onClick={openAdd} disabled={noTerms}
                sx={{ backgroundColor: noTerms ? 'rgba(255,255,255,0.08)' : C.accent, color: noTerms ? C.textSecondary : '#111827', boxShadow: noTerms ? 'none' : `0 8px 24px ${C.accentGlow}`, '&:hover': noTerms ? {} : { backgroundColor: '#FBBF24' }, '&.Mui-disabled': { backgroundColor: 'rgba(255,255,255,0.05)' } }}>
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
            {editingId ? 'Edit Exam' : 'Schedule New Exam'}
            {isMobile && <IconButton onClick={() => setDialogOpen(false)} sx={{ color: C.textSecondary }}><Close /></IconButton>}
          </DialogTitle>

          <DialogContent sx={{ pt: 2 }}>
            <Grid container spacing={2} mt={0}>

              <SectionLabel label="Exam Details" />

              {/* Name */}
              <Grid item xs={12}>
                <TextField fullWidth label="Exam Name" required autoFocus sx={inputSx}
                  placeholder="e.g. Mid-Term Examination 2025"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Grid>

              {/* Term */}
              <Grid item xs={12} md={6}>
                <TextField select fullWidth label="Term" required sx={inputSx}
                  value={form.term_id} onChange={(e) => setForm({ ...form, term_id: Number(e.target.value) })}
                  SelectProps={{ MenuProps: menuProps }}>
                  <MenuItem value={0} disabled>Select Term</MenuItem>
                  {terms.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                </TextField>
              </Grid>

              {/* Weightage */}
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Weightage (0–1)" type="number" sx={inputSx}
                  placeholder="e.g. 0.4 for 40%"
                  value={form.weightage}
                  inputProps={{ min: 0, max: 1, step: 0.05 }}
                  onChange={(e) => setForm({ ...form, weightage: Number(e.target.value) })}
                  helperText={`= ${(form.weightage * 100).toFixed(0)}% of final grade`}
                  FormHelperTextProps={{ sx: { color: C.accent, fontFamily: FONT, fontSize: '0.72rem' } }}
                />
              </Grid>

              <SectionLabel label="Schedule" />

              {/* Start date */}
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Start Date" type="date" required
                  InputLabelProps={{ shrink: true }} sx={inputSx}
                  value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </Grid>

              {/* End date */}
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="End Date" type="date" required
                  InputLabelProps={{ shrink: true }} sx={inputSx}
                  value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </Grid>

              {/* Date validation feedback */}
              {form.start_date && form.end_date && form.start_date >= form.end_date && (
                <Grid item xs={12}>
                  <Box sx={{ p: 1.5, borderRadius: '10px', backgroundColor: C.redDim, border: `1px solid ${C.red}25` }}>
                    <Typography sx={{ fontSize: '0.78rem', color: C.red, fontFamily: FONT }}>
                      ⚠️ Start date must be before end date
                    </Typography>
                  </Box>
                </Grid>
              )}

              {/* Info */}
              <Grid item xs={12}>
                <Box sx={{ p: 1.5, borderRadius: '10px', backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.18)` }}>
                  <Typography sx={{ fontSize: '0.75rem', color: C.accent, fontFamily: FONT }}>
                    💡 After creation, publish the exam to make it visible, then lock it once marks have been entered.
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, borderTop: `1px solid ${C.border}` }}>
            <Button onClick={() => setDialogOpen(false)} disabled={saving}
              sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: 'none', borderRadius: '8px' }}>
              Cancel
            </Button>
            <Button variant="contained" onClick={saveExam}
              disabled={saving || !form.name.trim() || !form.start_date || !form.end_date || !form.term_id || form.start_date >= form.end_date}
              sx={{ backgroundColor: C.accent, color: '#111827', fontFamily: FONT, fontWeight: 600, textTransform: 'none', borderRadius: '10px', px: 3, '&:hover': { backgroundColor: '#FBBF24' }, '&.Mui-disabled': { backgroundColor: 'rgba(245,158,11,0.2)', color: 'rgba(17,24,39,0.4)' } }}>
              {saving ? 'Saving…' : editingId ? 'Update Exam' : 'Schedule Exam'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Delete confirm ──────────────────────────────────────── */}
        <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth
          PaperProps={{ sx: { backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' } }}>
          <DialogTitle sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '1rem', color: C.textPrimary, pb: 1 }}>
            Delete Exam?
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ color: C.textSecondary, fontFamily: FONT, fontSize: '0.875rem' }}>
              Only draft exams can be deleted. Published or locked exams cannot be removed.
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