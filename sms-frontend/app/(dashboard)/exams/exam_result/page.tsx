'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Card, Chip, CircularProgress, Grid, IconButton, LinearProgress,
  MenuItem, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography, useMediaQuery, useTheme, Button, Tooltip,
} from '@mui/material';
import {
  Search, Delete, GradeOutlined, PersonOutlined, QuizOutlined,
  SaveOutlined, CheckCircleOutlined, CancelOutlined, DescriptionOutlined,
} from '@mui/icons-material';
import { api } from '@/app/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/app/store/authStore';
import { useRouter } from 'next/navigation';
import {
  C, FONT, EASE, inputSx, menuProps, thSx, tdSx,
  GlobalStyles, StatCard, PageHeader, EmptyState,
  DeleteDialog, DataTable,
} from '@/components/ui';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type ExamResult = {
  id: number;
  exam_paper_id: number;
  student_enrollment_id: number;
  obtained_marks: number;
  grade: string | null;
  gpa: number | null;
};

type Exam = {
  id: number;
  name: string;
  is_locked: boolean;
  is_published: boolean;
};

type ExamPaper = {
  id: number;
  exam_id: number;
  exam_name: string;
  subject_name: string;
  classroom_id: number;
  classroom_name: string;
  total_marks: number;
  pass_marks: number;
};

type Student = {
  id: number;
  first_name: string;
  last_name: string;
  admission_no: string | null;
  roll_number: string | null;
  grade_name: string | null;
  section: string | null;
  is_active: boolean;
  enrollment_id: number;
};

type Classroom = {
  id: number;
  grade_name: string | null;
  section: string;
};

// ─────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────
const fullName  = (s: Student) => `${s.first_name} ${s.last_name}`.trim();
const rollLabel = (s: Student) => s.roll_number ?? s.admission_no ?? null;

function gradeColor(grade: string | null) {
  if (!grade) return { color: C.textSecondary, dim: 'rgba(255,255,255,0.05)' };
  const g = grade.toUpperCase();
  if (['A+', 'A', 'A1'].includes(g))  return { color: C.green,  dim: C.greenDim  };
  if (['B+', 'B', 'B1'].includes(g))  return { color: C.blue,   dim: C.blueDim   };
  if (['C+', 'C', 'C1'].includes(g))  return { color: C.accent, dim: C.accentDim };
  if (['D',  'D1'].includes(g))       return { color: C.purple, dim: C.purpleDim };
  return { color: C.red, dim: C.redDim };
}

// ─────────────────────────────────────────────
// MarkBar
// ─────────────────────────────────────────────
function MarkBar({ obtained, total, pass }: { obtained: number; total: number; pass: number }) {
  const pct   = total > 0 ? Math.round((obtained / total) * 100) : 0;
  const color = obtained >= pass ? C.green : C.red;
  return (
    <Box sx={{ minWidth: 110 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
        <Typography sx={{ fontSize: '0.75rem', fontFamily: FONT, color: C.textPrimary, fontWeight: 700 }}>
          {obtained}/{total}
        </Typography>
        <Typography sx={{ fontSize: '0.72rem', fontFamily: FONT, color, fontWeight: 600 }}>{pct}%</Typography>
      </Box>
      <LinearProgress variant="determinate" value={pct}
        sx={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.07)',
          '& .MuiLinearProgress-bar': { backgroundColor: color, borderRadius: 3 } }} />
    </Box>
  );
}

// ─────────────────────────────────────────────
// StudentCell
// ─────────────────────────────────────────────
function StudentCell({ student }: { student: Student }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: C.blueDim,
        border: `1px solid ${C.blue}25`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0 }}>
        <PersonOutlined sx={{ fontSize: 13, color: C.blue }} />
      </Box>
      <Box>
        <Typography sx={{ fontFamily: FONT, fontSize: '0.855rem', color: C.textPrimary, fontWeight: 600, lineHeight: 1.2 }}>
          {fullName(student)}
        </Typography>
        {rollLabel(student) && (
          <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: C.textSecondary }}>
            {rollLabel(student)}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────
// MarksEntryRow — controlled, no internal save
// ─────────────────────────────────────────────
function MarksEntryRow({ student, paper, existing, onMarkChange }: {
  student: Student;
  paper: ExamPaper;
  existing?: ExamResult;
  onMarkChange: (enrollmentId: number, value: string) => void;
}) {
  const [marks, setMarks] = useState<string>(
    existing != null ? String(existing.obtained_marks) : ''
  );

  // Sync when existing result arrives after initial render
  useEffect(() => {
    if (existing != null) setMarks(String(existing.obtained_marks));
  }, [existing?.id]);

  const val   = Number(marks);
  const valid = marks !== '' && val >= 0 && val <= paper.total_marks;

  const handleChange = (value: string) => {
    setMarks(value);
    onMarkChange(student.enrollment_id, value);
  };

  const gc = existing?.grade ? gradeColor(existing.grade) : null;

  return (
    <TableRow sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, transition: `background ${EASE}` }}>
      {/* Student */}
      <TableCell sx={{ ...tdSx, fontWeight: 600 }}>
        <StudentCell student={student} />
      </TableCell>

      {/* Marks input */}
      <TableCell sx={{ ...tdSx, width: 140 }}>
        <TextField
          size="small" type="number"
          placeholder={`0–${paper.total_marks}`}
          value={marks}
          onChange={e => handleChange(e.target.value)}
          inputProps={{ min: 0, max: paper.total_marks }}
          sx={{
            width: 110,
            '& .MuiOutlinedInput-root': {
              backgroundColor: C.inputBg, borderRadius: '8px',
              '& fieldset': { borderColor: marks !== '' && !valid ? C.red : C.border },
              '&:hover fieldset': { borderColor: valid ? C.accent : C.red },
              '&.Mui-focused fieldset': { borderColor: valid ? C.accent : C.red },
            },
            '& input': { color: C.textPrimary, fontFamily: FONT, fontSize: '0.855rem', py: '7px' },
          }}
        />
      </TableCell>

      <TableCell sx={{ ...tdSx, color: C.textSecondary }}>{paper.total_marks}</TableCell>
      <TableCell sx={{ ...tdSx, color: C.textSecondary }}>{paper.pass_marks}</TableCell>

      {/* Grade */}
      <TableCell sx={tdSx}>
        {gc
          ? <Chip label={existing!.grade} size="small" sx={{ backgroundColor: gc.dim, color: gc.color, fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', height: 22, border: `1px solid ${gc.color}30` }} />
          : <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: C.textSecondary }}>—</Typography>
        }
      </TableCell>

      {/* GPA */}
      <TableCell sx={{ ...tdSx, color: C.blue, fontWeight: 700 }}>
        {existing?.gpa != null ? existing.gpa.toFixed(2) : '—'}
      </TableCell>

      {/* Status */}
      <TableCell sx={tdSx}>
        {existing
          ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CheckCircleOutlined sx={{ fontSize: 16, color: C.green }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: C.green }}>Saved</Typography>
            </Box>
          : <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: C.textSecondary }}>Pending</Typography>
        }
      </TableCell>
    </TableRow>
  );
}

// ─────────────────────────────────────────────
// MobileEntryCard — controlled, no internal save
// ─────────────────────────────────────────────
function MobileEntryCard({ student, paper, existing, onMarkChange }: {
  student: Student;
  paper: ExamPaper;
  existing?: ExamResult;
  onMarkChange: (enrollmentId: number, value: string) => void;
}) {
  const [marks, setMarks] = useState<string>(
    existing != null ? String(existing.obtained_marks) : ''
  );

  useEffect(() => {
    if (existing != null) setMarks(String(existing.obtained_marks));
  }, [existing?.id]);

  const val   = Number(marks);
  const valid = marks !== '' && val >= 0 && val <= paper.total_marks;
  const gc    = existing?.grade ? gradeColor(existing.grade) : null;

  const handleChange = (value: string) => {
    setMarks(value);
    onMarkChange(student.enrollment_id, value);
  };

  return (
    <Card sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', p: 2, mb: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.25 }}>
        <StudentCell student={student} />
        {gc && <Chip label={existing!.grade} size="small" sx={{ backgroundColor: gc.dim, color: gc.color, fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', height: 22, ml: 1 }} />}
      </Box>

      {existing && currentPaperRef && (
        <Box sx={{ mb: 1.5 }}>
          <MarkBar obtained={existing.obtained_marks} total={paper.total_marks} pass={paper.pass_marks} />
        </Box>
      )}

      <TextField
        fullWidth size="small" type="number"
        placeholder={`0–${paper.total_marks}`}
        value={marks}
        onChange={e => handleChange(e.target.value)}
        inputProps={{ min: 0, max: paper.total_marks }}
        sx={{
          '& .MuiOutlinedInput-root': {
            backgroundColor: C.inputBg, borderRadius: '8px',
            '& fieldset': { borderColor: marks !== '' && !valid ? C.red : C.border },
            '&:hover fieldset': { borderColor: C.accent },
            '&.Mui-focused fieldset': { borderColor: C.accent },
          },
          '& input': { color: C.textPrimary, fontFamily: FONT, fontSize: '0.855rem' },
        }}
      />

      <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {existing
          ? <><CheckCircleOutlined sx={{ fontSize: 14, color: C.green }} /><Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: C.green }}>Saved</Typography></>
          : <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: C.textSecondary }}>Pending save</Typography>
        }
      </Box>
    </Card>
  );
}

// ref used by MobileEntryCard to show MarkBar without prop drilling
let currentPaperRef: ExamPaper | null = null;

// ─────────────────────────────────────────────
// StudentPicker (by-student mode)
// ─────────────────────────────────────────────
function StudentPicker({ onSelect, selected }: { onSelect: (id: number) => void; selected: number }) {
  const [all, setAll]         = useState<Student[]>([]);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/students/', { params: { limit: 100 } })
      .then(r => {
        const data = Array.isArray(r.data) ? r.data : r.data?.items ?? [];
        setAll(data);
      })
      .catch(() => toast.error('Failed to load students'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = all.filter(s =>
    fullName(s).toLowerCase().includes(search.toLowerCase()) ||
    (s.admission_no ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box>
      <TextField fullWidth placeholder="Search by name or admission no…" value={search}
        size="small" onChange={e => setSearch(e.target.value)} sx={inputSx}
        InputProps={{ startAdornment: <Search sx={{ color: C.textSecondary, mr: 1, fontSize: 18 }} /> }} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} sx={{ color: C.accent }} />
        </Box>
      ) : (
        <Box sx={{ mt: 1.5, maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {filtered.slice(0, 30).map(s => (
            <Box key={s.id} onClick={() => onSelect(s.id)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25,
                borderRadius: '10px', cursor: 'pointer', transition: `all ${EASE}`,
                border: `1px solid ${selected === s.id ? C.accent : C.border}`,
                backgroundColor: selected === s.id ? C.accentDim : C.surfaceHover,
                '&:hover': { borderColor: C.accent, backgroundColor: C.accentDim },
              }}>
              <Box sx={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: C.blueDim,
                border: `1px solid ${C.blue}25`, display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0 }}>
                <PersonOutlined sx={{ fontSize: 13, color: C.blue }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontFamily: FONT, fontWeight: 600, fontSize: '0.855rem', color: C.textPrimary, lineHeight: 1.2 }}>
                  {fullName(s)}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, mt: 0.3, flexWrap: 'wrap' }}>
                  {s.admission_no && (
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.68rem', color: C.textSecondary }}>
                      {s.admission_no}
                    </Typography>
                  )}
                  {s.grade_name && (
                    <Chip
                      label={`${s.grade_name}${s.section ? ` – ${s.section}` : ''}`}
                      size="small"
                      sx={{ backgroundColor: C.purpleDim, color: C.purple, fontFamily: FONT, fontWeight: 600, fontSize: '0.62rem', height: 16 }}
                    />
                  )}
                </Box>
              </Box>
              {selected === s.id && <CheckCircleOutlined sx={{ fontSize: 16, color: C.accent, flexShrink: 0 }} />}
            </Box>
          ))}
          {filtered.length === 0 && (
            <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', color: C.textSecondary, textAlign: 'center', py: 3 }}>
              No students found
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function ExamResultsPage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const router   = useRouter();
  const { user, loading: authLoading } = useAuthStore();

  // ── View mode ─────────────────────────────
  const [viewMode, setViewMode] = useState<'by-exam' | 'by-student'>('by-exam');

  // ── Data ──────────────────────────────────
  const [exams, setExams]           = useState<Exam[]>([]);
  const [papers, setPapers]         = useState<ExamPaper[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents]     = useState<Student[]>([]);
  const [results, setResults]       = useState<ExamResult[]>([]);

  // ── Selections ────────────────────────────
  const [selectedExam,    setSelectedExam]    = useState<number>(0);
  const [selectedPaper,   setSelectedPaper]   = useState<number>(0);
  const [selectedStudent, setSelectedStudent] = useState<number>(0);

  // ── Bulk marks state ──────────────────────
  // { [enrollment_id]: marks_string }
  const [localMarks, setLocalMarks] = useState<Record<number, string>>({});

  // ── UI state ──────────────────────────────
  const [search,          setSearch]          = useState('');
  const [pageLoading,     setPageLoading]     = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [bulkSaving,      setBulkSaving]      = useState(false);
  const [deleteId,        setDeleteId]        = useState<number | null>(null);
  const [deleting,        setDeleting]        = useState(false);

  // ─────────────────────────────────────────
  // Initial load — exams, papers, classrooms
  // ─────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/signin'); return; }

    setPageLoading(true);
    Promise.all([
      api.get('/exams'),
      api.get('/exam-papers'),
      api.get('/classes'),
    ])
      .then(([examsRes, papersRes, classRes]) => {
        setExams(Array.isArray(examsRes.data) ? examsRes.data : []);
        setPapers(Array.isArray(papersRes.data) ? papersRes.data : []);
        setClassrooms(Array.isArray(classRes.data) ? classRes.data : []);
      })
      .catch(() => toast.error('Failed to load data'))
      .finally(() => setPageLoading(false));
  }, [user, authLoading]);

  // ─────────────────────────────────────────
  // Load results when exam changes
  // ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedExam) { setResults([]); return; }
    api.get(`/exam-results/exam/${selectedExam}`)
      .then(r => setResults(Array.isArray(r.data) ? r.data : []))
      .catch(() => setResults([]));
  }, [selectedExam]);

  // ─────────────────────────────────────────
  // Load students when paper changes
  // ─────────────────────────────────────────
  useEffect(() => {
    setLocalMarks({});
    setSearch('');
    if (!selectedPaper) { setStudents([]); return; }

    const paper     = papers.find(p => p.id === selectedPaper);
    const classroom = classrooms.find(c => c.id === paper?.classroom_id);

    setStudentsLoading(true);
    setStudents([]);

    const url    = classroom?.id ? `/students/by-class/${classroom.id}` : '/students/';
    const params = classroom?.id ? {} : { limit: 200 };

    api.get(url, { params })
      .then(r => setStudents(Array.isArray(r.data) ? r.data : []))
      .catch(() => toast.error('Failed to load students'))
      .finally(() => setStudentsLoading(false));
  }, [selectedPaper, classrooms]);

  // ─────────────────────────────────────────
  // Load results when student changes (by-student mode)
  // ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedStudent || viewMode !== 'by-student') return;
    api.get(`/exam-results/student/${selectedStudent}`)
      .then(r => setResults(Array.isArray(r.data) ? r.data : []))
      .catch(e => {
        if (e?.response?.status !== 404) toast.error('Failed to load results');
        setResults([]);
      });
  }, [selectedStudent, viewMode]);

  // ─────────────────────────────────────────
  // Derived values
  // ─────────────────────────────────────────
  const papersForExam = papers.filter(p => p.exam_id === selectedExam);
  const currentPaper  = papers.find(p => p.id === selectedPaper);
  const currentExam   = exams.find(e => e.id === selectedExam);
  const isLocked      = currentExam?.is_locked ?? false;

  // Keep module-level ref in sync for MobileEntryCard
  currentPaperRef = currentPaper ?? null;

  const paperResults = results.filter(r => r.exam_paper_id === selectedPaper);

  // Find a result by student — matches via enrollment_id
  const resultFor = (student: Student) =>
    paperResults.find(r => r.student_enrollment_id === student.enrollment_id);

  const filteredStudents = students.filter(s =>
    fullName(s).toLowerCase().includes(search.toLowerCase()) ||
    (s.admission_no ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total:   paperResults.length,
    passing: currentPaper ? paperResults.filter(r => r.obtained_marks >= currentPaper.pass_marks).length : 0,
    graded:  paperResults.filter(r => r.grade).length,
    avgPct:  paperResults.length && currentPaper
      ? Math.round(
          paperResults.reduce((sum, r) => sum + (r.obtained_marks / (currentPaper.total_marks || 1)) * 100, 0)
          / paperResults.length
        )
      : 0,
  };

  const pendingCount = Object.values(localMarks).filter(v => v !== '').length;

  // ─────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────
  const handleMarkChange = useCallback((enrollmentId: number, value: string) => {
    setLocalMarks(prev => ({ ...prev, [enrollmentId]: value }));
  }, []);

  const handleExamChange = (examId: number) => {
    setSelectedExam(examId);
    setSelectedPaper(0);
    setStudents([]);
    setLocalMarks({});
    setSearch('');
  };

  // ─────────────────────────────────────────
  // Bulk save
  // ─────────────────────────────────────────
  const saveBulkResults = async () => {
    if (!currentPaper) return;

    const payload = Object.entries(localMarks)
      .filter(([, val]) => val !== '' && Number(val) >= 0 && Number(val) <= currentPaper.total_marks)
      .map(([enrollmentId, val]) => ({
        exam_paper_id:          selectedPaper,
        student_enrollment_id:  Number(enrollmentId),
        obtained_marks:         Number(val),
      }));

    if (payload.length === 0) {
      toast.error('No valid marks to save');
      return;
    }

    setBulkSaving(true);
    try {
      const res = await api.post('/exam-results/bulk', payload);
      const { succeeded, failed } = res.data as { succeeded: ExamResult[]; failed: any[] };

      if (succeeded.length > 0) {
        // Merge into results state (upsert)
        setResults(prev => {
          const updated = [...prev];
          for (const r of succeeded) {
            const idx = updated.findIndex(x => x.id === r.id);
            if (idx !== -1) updated[idx] = r;
            else updated.push(r);
          }
          return updated;
        });
        setLocalMarks({});
        toast.success(`${succeeded.length} result${succeeded.length > 1 ? 's' : ''} saved`);
      }

      if (failed.length > 0) {
        toast.error(`${failed.length} row${failed.length > 1 ? 's' : ''} failed`);
        console.warn('Failed rows:', failed);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Bulk save failed');
    } finally {
      setBulkSaving(false);
    }
  };

  // ─────────────────────────────────────────
  // Delete
  // ─────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/exam-results/${deleteId}`);
      toast.success('Result deleted');
      setResults(prev => prev.filter(r => r.id !== deleteId));
      setDeleteId(null);
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  // ─────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────

  // Locked row — read-only display
  const LockedRow = ({ s }: { s: Student }) => {
    const r  = resultFor(s);
    const gc = r?.grade ? gradeColor(r.grade) : null;
    return (
      <TableRow sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' } }}>
        <TableCell sx={{ ...tdSx, fontWeight: 600 }}><StudentCell student={s} /></TableCell>
        <TableCell sx={tdSx}>
          {r && currentPaper
            ? <MarkBar obtained={r.obtained_marks} total={currentPaper.total_marks} pass={currentPaper.pass_marks} />
            : <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: C.textSecondary }}>—</Typography>}
        </TableCell>
        <TableCell sx={{ ...tdSx, color: C.textSecondary }}>{currentPaper?.total_marks}</TableCell>
        <TableCell sx={{ ...tdSx, color: C.textSecondary }}>{currentPaper?.pass_marks}</TableCell>
        <TableCell sx={tdSx}>
          {gc
            ? <Chip label={r!.grade} size="small" sx={{ backgroundColor: gc.dim, color: gc.color, fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', height: 22 }} />
            : <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: C.textSecondary }}>—</Typography>}
        </TableCell>
        <TableCell sx={{ ...tdSx, color: C.blue, fontWeight: 700 }}>
          {r?.gpa != null ? r.gpa.toFixed(2) : '—'}
        </TableCell>
        <TableCell sx={tdSx}>
          {r
            ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CheckCircleOutlined sx={{ fontSize: 15, color: C.green }} />
                <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: C.green }}>Entered</Typography>
              </Box>
            : <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: C.textSecondary }}>Missing</Typography>}
        </TableCell>
      </TableRow>
    );
  };

  // ─────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────
  return (
    <>
      <GlobalStyles />
      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: '100%' }}>

        <PageHeader
          title="Exam Results"
          subtitle="Enter marks by exam paper · view student report cards"
          isMobile={isMobile}
        />

        {/* ── Mode toggle ── */}
        <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
          {(['by-exam', 'by-student'] as const).map(mode => (
            <Button key={mode} size="small" onClick={() => setViewMode(mode)}
              sx={{
                fontFamily: FONT, fontWeight: 600, fontSize: '0.78rem',
                textTransform: 'none', borderRadius: '8px', px: 2,
                backgroundColor: viewMode === mode ? C.accent : 'rgba(255,255,255,0.05)',
                color: viewMode === mode ? '#111827' : C.textSecondary,
                border: `1px solid ${viewMode === mode ? C.accent : C.border}`,
                '&:hover': { backgroundColor: viewMode === mode ? '#FBBF24' : C.accentDim },
              }}>
              {mode === 'by-exam' ? '📋 Enter by Exam' : '👤 View by Student'}
            </Button>
          ))}
        </Box>

        {/* ── Page loading ── */}
        {pageLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} thickness={3} sx={{ color: C.accent }} />
          </Box>

        ) : viewMode === 'by-exam' ? (
          // ══════════════════════════════════════════════
          // MODE 1 — ENTER MARKS BY EXAM
          // ══════════════════════════════════════════════
          <Box>

            {/* Exam + paper selectors */}
            <Card sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', p: 2.5, mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Box sx={{ width: 3, height: 16, borderRadius: 1, backgroundColor: C.accent }} />
                <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.85rem', color: C.textPrimary }}>
                  Select Exam &amp; Paper
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                {/* Exam dropdown */}
                <TextField select fullWidth size="small" label="Exam" sx={inputSx}
                  value={selectedExam}
                  onChange={e => handleExamChange(Number(e.target.value))}
                  SelectProps={{ MenuProps: menuProps }}>
                  <MenuItem value={0} disabled>Choose an exam</MenuItem>
                  {exams.map(e => (
                    <MenuItem key={e.id} value={e.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.875rem', flex: 1 }}>{e.name}</Typography>
                        {e.is_locked    && <Chip label="Locked" size="small" sx={{ backgroundColor: C.redDim,               color: C.red,           fontFamily: FONT, fontWeight: 600, fontSize: '0.62rem', height: 18 }} />}
                        {!e.is_published && <Chip label="Draft"  size="small" sx={{ backgroundColor: 'rgba(255,255,255,0.07)', color: C.textSecondary, fontFamily: FONT, fontWeight: 600, fontSize: '0.62rem', height: 18 }} />}
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>

                {/* Paper dropdown */}
                <TextField select fullWidth size="small" label="Subject / Class" sx={inputSx}
                  value={selectedPaper} disabled={!selectedExam}
                  onChange={e => setSelectedPaper(Number(e.target.value))}
                  SelectProps={{ MenuProps: menuProps }}>
                  <MenuItem value={0} disabled>Choose subject &amp; class</MenuItem>
                  {papersForExam.map(p => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.subject_name} — {p.classroom_name}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>

              {/* Paper meta pills */}
              {currentPaper && (
                <Box sx={{ display: 'flex', gap: 1.5, mt: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[
                    { label: 'Total Marks', value: currentPaper.total_marks,                       color: C.accent  },
                    { label: 'Pass Marks',  value: currentPaper.pass_marks,                        color: C.green   },
                    { label: 'Students',    value: studentsLoading ? '…' : students.length,        color: C.blue    },
                    { label: 'Entered',     value: paperResults.length,                            color: C.purple  },
                  ].map(({ label, value, color }) => (
                    <Box key={label} sx={{ px: 1.5, py: 0.6, borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}` }}>
                      <Typography sx={{ fontSize: '0.62rem', color: C.textSecondary, fontFamily: FONT, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</Typography>
                      <Typography sx={{ fontSize: '0.92rem', color, fontFamily: FONT, fontWeight: 700, lineHeight: 1.3 }}>{value}</Typography>
                    </Box>
                  ))}

                  {isLocked && (
                    <Box sx={{ px: 1.5, py: 0.75, borderRadius: '8px', backgroundColor: C.redDim, border: `1px solid ${C.red}25`, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <CancelOutlined sx={{ fontSize: 14, color: C.red }} />
                      <Typography sx={{ fontSize: '0.75rem', color: C.red, fontFamily: FONT, fontWeight: 600 }}>
                        Exam locked — editing disabled
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Card>

            {/* Stats */}
            {selectedPaper && paperResults.length > 0 && (
              <Grid container spacing={{ xs: 1.5, md: 2 }} sx={{ mb: 3 }}>
                {[
                  { label: 'Entered',   value: stats.total,        color: C.accent, dim: C.accentDim, icon: DescriptionOutlined, delay: 0   },
                  { label: 'Passing',   value: stats.passing,      color: C.green,  dim: C.greenDim,  icon: CheckCircleOutlined, delay: 60  },
                  { label: 'Graded',    value: stats.graded,       color: C.blue,   dim: C.blueDim,   icon: GradeOutlined,       delay: 120 },
                  { label: 'Avg Score', value: `${stats.avgPct}%`, color: C.purple, dim: C.purpleDim, icon: QuizOutlined,        delay: 180 },
                ].map((s, i) => (
                  <Grid item xs={6} md={3} key={i}>
                    <StatCard {...s} />
                  </Grid>
                ))}
              </Grid>
            )}

            {/* Marks entry area */}
            {!selectedPaper ? (
              <EmptyState icon={QuizOutlined}
                message={
                  !selectedExam           ? 'Select an exam to begin'
                  : papersForExam.length === 0 ? 'No exam papers set up for this exam yet'
                  : 'Select a subject / class above to enter marks'
                }
              />
            ) : studentsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size={28} thickness={3} sx={{ color: C.accent }} />
              </Box>
            ) : (
              <>
                {/* Search + Save All row */}
                <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                  <TextField fullWidth placeholder="Search students…" value={search}
                    size="small" onChange={e => setSearch(e.target.value)} sx={inputSx}
                    InputProps={{ startAdornment: <Search sx={{ color: C.textSecondary, mr: 1, fontSize: 18 }} /> }} />

                  {!isLocked && (
                    <Button
                      onClick={saveBulkResults}
                      disabled={bulkSaving || pendingCount === 0}
                      startIcon={bulkSaving
                        ? <CircularProgress size={14} sx={{ color: '#111827' }} />
                        : <SaveOutlined sx={{ fontSize: 16 }} />}
                      sx={{
                        fontFamily: FONT, fontWeight: 700, fontSize: '0.82rem',
                        textTransform: 'none', borderRadius: '10px',
                        px: 2.5, py: 1, whiteSpace: 'nowrap', flexShrink: 0,
                        backgroundColor: C.accent, color: '#111827',
                        '&:hover': { backgroundColor: '#FBBF24' },
                        '&.Mui-disabled': { opacity: 0.4 },
                      }}>
                      {bulkSaving ? 'Saving…' : `Save All${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
                    </Button>
                  )}
                </Box>

                {filteredStudents.length === 0 ? (
                  <EmptyState icon={PersonOutlined} message="No students found for this class" />
                ) : isMobile ? (
                  /* ── Mobile cards ── */
                  <Box>
                    {filteredStudents.map(s =>
                      isLocked ? (
                        <Card key={s.id} sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', p: 2, mb: 1.5 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: resultFor(s) ? 1.25 : 0 }}>
                            <StudentCell student={s} />
                            {resultFor(s)?.grade && (
                              <Chip label={resultFor(s)!.grade} size="small"
                                sx={{ backgroundColor: gradeColor(resultFor(s)!.grade).dim, color: gradeColor(resultFor(s)!.grade).color, fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', height: 22 }} />
                            )}
                          </Box>
                          {resultFor(s) && currentPaper && (
                            <MarkBar obtained={resultFor(s)!.obtained_marks} total={currentPaper.total_marks} pass={currentPaper.pass_marks} />
                          )}
                        </Card>
                      ) : (
                        <MobileEntryCard key={s.id} student={s} paper={currentPaper!}
                          existing={resultFor(s)} onMarkChange={handleMarkChange} />
                      )
                    )}

                    {/* Mobile Save All */}
                    {!isLocked && (
                      <Button fullWidth onClick={saveBulkResults}
                        disabled={bulkSaving || pendingCount === 0}
                        startIcon={bulkSaving ? <CircularProgress size={14} sx={{ color: '#111827' }} /> : <SaveOutlined />}
                        sx={{
                          mt: 1, fontFamily: FONT, fontWeight: 700, fontSize: '0.85rem',
                          textTransform: 'none', borderRadius: '10px', py: 1.25,
                          backgroundColor: C.accent, color: '#111827',
                          '&:hover': { backgroundColor: '#FBBF24' },
                          '&.Mui-disabled': { opacity: 0.4 },
                        }}>
                        {bulkSaving ? 'Saving…' : `Save All${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
                      </Button>
                    )}
                  </Box>
                ) : (
                  /* ── Desktop table ── */
                  <DataTable>
                    <Table>
                      <TableHead>
                        <TableRow>
                          {['Student', 'Marks', 'Total', 'Pass', 'Grade', 'GPA', isLocked ? 'Status' : 'Status'].map(h => (
                            <TableCell key={h} sx={thSx}>{h}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredStudents.map(s =>
                          isLocked
                            ? <LockedRow key={s.id} s={s} />
                            : <MarksEntryRow key={s.id} student={s} paper={currentPaper!}
                                existing={resultFor(s)} onMarkChange={handleMarkChange} />
                        )}
                      </TableBody>
                    </Table>
                  </DataTable>
                )}
              </>
            )}
          </Box>

        ) : (
          // ══════════════════════════════════════════════
          // MODE 2 — VIEW BY STUDENT
          // ══════════════════════════════════════════════
          <Box>
            <Card sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', p: 2.5, mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Box sx={{ width: 3, height: 16, borderRadius: 1, backgroundColor: C.accent }} />
                <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.85rem', color: C.textPrimary }}>
                  Select Student
                </Typography>
              </Box>
              <StudentPicker onSelect={setSelectedStudent} selected={selectedStudent} />
            </Card>

            {selectedStudent > 0 && (
              results.length === 0 ? (
                <EmptyState icon={GradeOutlined} message="No results found for this student" />
              ) : (
                <DataTable>
                  <Table>
                    <TableHead>
                      <TableRow>
                        {['Exam', 'Subject', 'Marks', 'Grade', 'GPA', 'Actions'].map(h => (
                          <TableCell key={h} sx={thSx}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {results.map((r, i) => {
                        const paper = papers.find(p => p.id === r.exam_paper_id);
                        const gc    = r.grade ? gradeColor(r.grade) : null;
                        return (
                          <TableRow key={r.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, transition: `background ${EASE}`, animation: `fadeUp 0.35s ${i * 35}ms ease both` }}>
                            <TableCell sx={{ ...tdSx, fontWeight: 600 }}>
                              {paper?.exam_name ?? `Exam #${r.exam_paper_id}`}
                            </TableCell>
                            <TableCell sx={tdSx}>
                              <Chip label={paper?.subject_name ?? '—'} size="small"
                                sx={{ backgroundColor: C.accentDim, color: C.accent, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid rgba(245,158,11,0.2)` }} />
                            </TableCell>
                            <TableCell sx={tdSx}>
                              {paper
                                ? <MarkBar obtained={r.obtained_marks} total={paper.total_marks} pass={paper.pass_marks} />
                                : r.obtained_marks}
                            </TableCell>
                            <TableCell sx={tdSx}>
                              {gc
                                ? <Chip label={r.grade} size="small" sx={{ backgroundColor: gc.dim, color: gc.color, fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', height: 22, border: `1px solid ${gc.color}30` }} />
                                : <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: C.textSecondary }}>—</Typography>}
                            </TableCell>
                            <TableCell sx={{ ...tdSx, color: C.blue, fontWeight: 700 }}>
                              {r.gpa != null ? r.gpa.toFixed(2) : '—'}
                            </TableCell>
                            <TableCell sx={tdSx}>
                              <Tooltip title="Delete result" arrow>
                                <IconButton size="small" onClick={() => setDeleteId(r.id)}
                                  sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.redDim, color: C.red }, transition: `all ${EASE}` }}>
                                  <Delete sx={{ fontSize: 15 }} />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </DataTable>
              )
            )}
          </Box>
        )}

        <DeleteDialog
          open={!!deleteId} onClose={() => setDeleteId(null)}
          onConfirm={confirmDelete} loading={deleting}
          title="Delete Result?"
          description="This result can be re-entered at any time."
        />

      </Box>
    </>
  );
}