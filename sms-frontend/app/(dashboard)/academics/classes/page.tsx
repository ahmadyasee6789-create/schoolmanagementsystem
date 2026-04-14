'use client';

import React, { useEffect, useState } from 'react';
import {
  Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, IconButton, MenuItem, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Typography,
  useMediaQuery, useTheme, Tooltip,
} from '@mui/material';
import {
  Add, Edit, Delete, Search, Close, ClassOutlined,
  PersonOutlined, SchoolOutlined, LayersOutlined,
  PersonAdd, PeopleOutlined,
} from '@mui/icons-material';
import { api } from '@/app/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/app/store/authStore';
import { useRouter } from 'next/navigation';
import {
  C, FONT, EASE, inputSx, menuProps, thSx, tdSx,
  GlobalStyles, StatCard, PageHeader, EmptyState,
  SectionLabel, DeleteDialog, DataTable, MobileFab,
} from '@/components/ui';

// ─── Types — match router response exactly ────────────────────────────
type ClassType = {
  id: number;
  grade_id?: number;
  grade?: { id: number; name: string };
  grade_name?: string | null;
  section: string;
  class_name: string;
  teacher_id: number | null;
  teacher_name: string | null;
  session_id?: number;
   student_count?: number;
};

type TeacherType = { id: number; full_name: string; email: string };
type Grade       = { id: number; name: string };
type Student = {
  id: number;
  first_name: string;
  last_name: string;
  admission_no: string;
  roll_number: string | null;
  grade_name: string | null;
  section: string | null;
  father_name: string | null;
  father_phone: string | null;
  phone: string | null;
};
type ClassForm = { grade_id: number | string; section: string };

// ─── Helper ───────────────────────────────────────────────────────────
function classLabel(c: ClassType) {
  const grade = c.grade?.name ?? c.grade_name;
  if (grade && c.section) return `${grade} – ${c.section}`;
  if (grade) return grade;
  return c.class_name || c.section || `Class #${c.id}`;
}

// ─── Mobile class card ────────────────────────────────────────────────
function ClassCard({ cls, isAdmin, onAssign, onDelete, onViewStudents }: {
  cls: ClassType; isAdmin: boolean;
  onAssign: () => void; onDelete: () => void; onViewStudents: () => void;
}) {
  return (
    <Card sx={{
      backgroundColor: C.surface, border: `1px solid ${C.border}`,
      borderRadius: '12px', p: 2, mb: 1.5,
      transition: `border-color ${EASE}`,
      '&:hover': { borderColor: 'rgba(245,158,11,0.25)' },
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: '10px', backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ClassOutlined sx={{ fontSize: 18, color: C.accent }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: C.textPrimary, fontFamily: FONT, lineHeight: 1.2 }}>
              {classLabel(cls)}
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: C.textSecondary, fontFamily: FONT }}>
              Section {cls.section}
            </Typography>
          </Box>
        </Box>
        {isAdmin && (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton size="small" onClick={onAssign} sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.accentDim, color: C.accent }, transition: `all ${EASE}` }}>
              <PersonAdd sx={{ fontSize: 15 }} />
            </IconButton>
            <IconButton size="small" onClick={onDelete} sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.redDim, color: C.red }, transition: `all ${EASE}` }}>
              <Delete sx={{ fontSize: 15 }} />
            </IconButton>
          </Box>
        )}
      </Box>

      {/* Teacher row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
        <PersonOutlined sx={{ fontSize: 13, color: C.textSecondary }} />
        {cls.teacher_name
          ? <Typography sx={{ fontSize: '0.78rem', color: C.textSecondary, fontFamily: FONT }}>{cls.teacher_name}</Typography>
          : <Typography sx={{ fontSize: '0.78rem', color: C.red, fontFamily: FONT, fontStyle: 'italic' }}>No teacher assigned</Typography>
        }
      </Box>

      <Button size="small" onClick={onViewStudents}
        startIcon={<PeopleOutlined sx={{ fontSize: 14 }} />}
        sx={{ color: C.blue, fontFamily: FONT, fontWeight: 600, fontSize: '0.75rem', textTransform: 'none', borderRadius: '7px', px: 1.5, border: `1px solid ${C.blue}30`, '&:hover': { backgroundColor: C.blueDim } }}>
        View Students
      </Button>
    </Card>
  );
}

// ─── Students dialog ──────────────────────────────────────────────────
function StudentsDialog({ open, onClose, classId, className, isMobile }: {
  open: boolean; onClose: () => void; classId: number; className: string; isMobile: boolean;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (!open || !classId) return;
    setLoading(true);
    api.get(`/students/by-class/${classId}`)
      .then(r => setStudents(Array.isArray(r.data) ? r.data : []))
      .catch(() => toast.error('Failed to load students'))
      .finally(() => setLoading(false));
  }, [open, classId]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={isMobile}
      PaperProps={{ sx: { backgroundColor: C.surface, border: isMobile ? 'none' : `1px solid ${C.border}`, borderRadius: isMobile ? 0 : '16px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' } }}>
      <DialogTitle sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '1.05rem', color: C.textPrimary, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PeopleOutlined sx={{ fontSize: 18, color: C.accent }} />
          {className}
        </Box>
        <IconButton onClick={onClose} sx={{ color: C.textSecondary }}><Close /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress size={28} thickness={3} sx={{ color: C.accent }} />
          </Box>
        ) : students.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <PeopleOutlined sx={{ fontSize: 36, color: C.textSecondary, opacity: 0.4, mb: 1 }} />
            <Typography sx={{ color: C.textSecondary, fontFamily: FONT, fontSize: '0.875rem' }}>No students enrolled</Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Roll', 'Name', 'Father', 'Phone'].map(h => (
                    <TableCell key={h} sx={{ ...thSx, py: 1 }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {students.map((s) => (
                  <TableRow key={s.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' } }}>
                    <TableCell sx={{ ...tdSx, color: C.accent, fontWeight: 700, py: 1.25 }}>{s.roll_number}</TableCell>
                    <TableCell sx={{ ...tdSx, py: 1.25 }}>{s.first_name} {s.last_name}</TableCell>
                    <TableCell sx={{ ...tdSx, color: C.textSecondary, py: 1.25 }}>{s.father_name}</TableCell>
                    <TableCell sx={{ ...tdSx, color: C.textSecondary, py: 1.25 }}>{s.phone}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, borderTop: `1px solid ${C.border}` }}>
        <Button onClick={onClose} sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: 'none', borderRadius: '8px' }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────
export default function ClassesPage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const router   = useRouter();
  const { user, loading: authLoading } = useAuthStore();

  const [classes, setClasses]   = useState<ClassType[]>([]);
  const [teachers, setTeachers] = useState<TeacherType[]>([]);
  const [grades, setGrades]     = useState<Grade[]>([]);
  const [role, setRole]         = useState<'admin' | 'teacher' | null>(null);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');

  // Assign teacher
  const [assignOpen, setAssignOpen]   = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassType | null>(null);
  const [teacherId, setTeacherId]     = useState<number | ''>('');
  const [assigning, setAssigning]     = useState(false);

  // Add classroom
  const [addOpen, setAddOpen]   = useState(false);
  const [form, setForm]         = useState<ClassForm>({ grade_id: '', section: '' });
  const [saving, setSaving]     = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Students
  const [studentsOpen, setStudentsOpen]         = useState(false);
  const [studentsClassId, setStudentsClassId]   = useState(0);
  const [studentsClassName, setStudentsClassName] = useState('');

  // ── Fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/signin'); return; }

    const fetchData = async () => {
  try {
    const [classesRes, teachersRes, meRes, gradesRes] = await Promise.all([
      api.get('/classes/'),
      api.get('/organization/team/', { params: { role: 'teacher' } }),
      api.get('/auth/me').catch((err) => {
        console.error('Failed to fetch /auth/me', err);
        return { data: null }; // prevent Promise.all from rejecting
      }),
      api.get('/grades'),
    ]);

        const me = meRes.data;
        setRole(me.org_role);
        setTeachers(teachersRes.data);
        setGrades(gradesRes.data);

        // Teachers only see their own classes
        const allClasses: ClassType[] = classesRes.data;
        setClasses(
          me.org_role === 'teacher'
            ? allClasses.filter(c => c.teacher_id === me.id)
            : allClasses
        );
      } catch {
        toast.error('Failed to load classrooms');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading]);

  // ── Derived ───────────────────────────────────────────────────────
  const isAdmin = role === 'admin';

  const uniqueGrades = Array.from(
    new Set(classes.map(c => c.grade?.name ?? c.grade_name).filter(Boolean))
  ) as string[];

  const filtered = classes.filter(c => {
    const label = classLabel(c).toLowerCase();
    const matchSearch = label.includes(search.toLowerCase())
      || (c.teacher_name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchGrade = gradeFilter === 'all'
      || (c.grade?.name ?? c.grade_name) === gradeFilter;
    return matchSearch && matchGrade;
  });

  // Group by grade
  const grouped = uniqueGrades.reduce<Record<string, ClassType[]>>((acc, g) => {
    acc[g] = filtered.filter(c => (c.grade?.name ?? c.grade_name) === g);
    return acc;
  }, {});
  const ungrouped = filtered.filter(c => !(c.grade?.name ?? c.grade_name));

  const stats = {
    total:      classes.length,
    grades:     uniqueGrades.length,
    assigned:   classes.filter(c => c.teacher_name).length,
    unassigned: classes.filter(c => !c.teacher_name).length,
  };

  // ── Assign teacher ────────────────────────────────────────────────
  const openAssign = (cls: ClassType) => {
    setSelectedClass(cls);
    setTeacherId(cls.teacher_id ?? '');
    setAssignOpen(true);
  };

  const submitAssign = async () => {
    if (!selectedClass || !teacherId) return;
    setAssigning(true);
    try {
      await api.post(`/classes/${selectedClass.id}/assign-teacher`, { teacher_id: teacherId });
      const teacher = teachers.find(t => t.id === teacherId);
      setClasses(prev => prev.map(c =>
        c.id === selectedClass.id
          ? { ...c, teacher_id: Number(teacherId), teacher_name: teacher?.full_name ?? null }
          : c
      ));
      toast.success(`Teacher assigned to ${classLabel(selectedClass)}`);
      setAssignOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Failed to assign teacher');
    } finally { setAssigning(false); }
  };

  // ── Add classroom ─────────────────────────────────────────────────
  const submitAdd = async () => {
    if (!form.grade_id || !form.section.trim()) return;
    setSaving(true);
    try {
      // Matches existing: POST /grades/{grade_id}/sections
      await api.post(`/grades/${form.grade_id}/sections`, { section: form.section });
      toast.success('Classroom created');
      setAddOpen(false);
      setForm({ grade_id: '', section: '' });
      // Re-fetch to get updated list
      const res = await api.get('/classes/');
      setClasses(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Failed to create classroom');
    } finally { setSaving(false); }
  };

  // ── Delete ────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/classes/${deleteId}`);
      toast.success('Classroom deleted');
      setClasses(prev => prev.filter(c => c.id !== deleteId));
      setDeleteId(null);
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Failed to delete');
    } finally { setDeleting(false); }
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      <GlobalStyles />

      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: '100%' }}>

        <PageHeader
          title="Classes"
          subtitle={isAdmin ? 'Manage classrooms and assign class teachers' : 'Your assigned classrooms'}
          actionLabel={isAdmin ? 'Add Class' : undefined}
          onAction={() => setAddOpen(true)}
          isMobile={isMobile}
        />

        {/* Stats */}
        <Grid container spacing={{ xs: 1.5, md: 2 }} sx={{ mb: { xs: 2.5, md: 3 } }}>
          {[
            { label: 'Total Classes', value: stats.total,      color: C.accent, dim: C.accentDim, icon: ClassOutlined,  delay: 0   },
            { label: 'Grades',        value: stats.grades,     color: C.purple, dim: C.purpleDim, icon: SchoolOutlined, delay: 60  },
            { label: 'With Teacher',  value: stats.assigned,   color: C.green,  dim: C.greenDim,  icon: PersonOutlined, delay: 120 },
            { label: 'No Teacher',    value: stats.unassigned, color: C.red,    dim: C.redDim,    icon: LayersOutlined, delay: 180 },
          ].map((s, i) => (
            <Grid item xs={6} md={3} key={i}>
              <StatCard {...s} />
            </Grid>
          ))}
        </Grid>

        {/* Search + grade filter */}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5, flexDirection: { xs: 'column', sm: 'row' } }}>
          <TextField
            fullWidth placeholder="Search by class or teacher…"
            value={search} size="small"
            onChange={(e) => setSearch(e.target.value)} sx={inputSx}
            InputProps={{ startAdornment: <Search sx={{ color: C.textSecondary, mr: 1, fontSize: 18 }} /> }}
          />
          <TextField
            select size="small" label="Grade" value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            sx={{ ...inputSx, minWidth: { xs: '100%', sm: 180 } }}
            SelectProps={{ MenuProps: menuProps }}
          >
            <MenuItem value="all">All Grades</MenuItem>
            {uniqueGrades.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
          </TextField>
        </Box>

        {/* Content */}
        {(loading || authLoading) ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} thickness={3} sx={{ color: C.accent }} />
          </Box>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ClassOutlined}
            message={search ? 'No classrooms match your search' : 'No classrooms found'}
            actionLabel={isAdmin ? 'Add Classroom' : undefined}
            onAction={() => setAddOpen(true)}
          />
        ) : isMobile ? (
          /* ── Mobile cards grouped by grade ────────────────────── */
          <Box>
            {Object.entries(grouped).map(([grade, gradeClasses]) => gradeClasses.length === 0 ? null : (
              <Box key={grade} sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <SchoolOutlined sx={{ fontSize: 13, color: C.accent }} />
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: C.accent, fontFamily: FONT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {grade}
                  </Typography>
                  <Box sx={{ flex: 1, height: '1px', backgroundColor: C.border, ml: 1 }} />
                </Box>
                {gradeClasses.map(cls => (
                  <ClassCard key={cls.id} cls={cls} isAdmin={isAdmin}
                    onAssign={() => openAssign(cls)}
                    onDelete={() => setDeleteId(cls.id)}
                    onViewStudents={() => { setStudentsClassId(cls.id); setStudentsClassName(classLabel(cls)); setStudentsOpen(true); }} />
                ))}
              </Box>
            ))}
            {ungrouped.map(cls => (
              <ClassCard key={cls.id} cls={cls} isAdmin={isAdmin}
                onAssign={() => openAssign(cls)}
                onDelete={() => setDeleteId(cls.id)}
                onViewStudents={() => { setStudentsClassId(cls.id); setStudentsClassName(classLabel(cls)); setStudentsOpen(true); }} />
            ))}
          </Box>
        ) : (
          /* ── Desktop table grouped by grade ───────────────────── */
          <DataTable>
            <Table>
              <TableHead>
                <TableRow>
                  {['Class', 'Grade', 'Section', 'Class Teacher', 'Status', 'Actions'].map(h => (
                    <TableCell key={h} sx={thSx}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(grouped).map(([grade, gradeClasses]) => gradeClasses.length === 0 ? null : (
                  <React.Fragment key={grade}>
                    {/* Grade group header */}
                    <TableRow>
                      <TableCell colSpan={6} sx={{ borderColor: C.border, backgroundColor: 'rgba(245,158,11,0.05)', py: 1, px: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <SchoolOutlined sx={{ fontSize: 13, color: C.accent }} />
                          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: C.accent, fontFamily: FONT, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                            {grade}
                          </Typography>
                          <Chip label={`${gradeClasses.length} section${gradeClasses.length !== 1 ? 's' : ''}`} size="small"
                            sx={{ backgroundColor: C.accentDim, color: C.accent, fontFamily: FONT, fontWeight: 600, fontSize: '0.65rem', height: 18, border: `1px solid rgba(245,158,11,0.2)` }} />
                        </Box>
                      </TableCell>
                    </TableRow>

                    {gradeClasses.map((cls, i) => (
                      <TableRow key={cls.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, transition: `background ${EASE}`, animation: `fadeUp 0.35s ${i * 35}ms ease both` }}>

                        {/* Class name */}
                        <TableCell sx={{ ...tdSx, fontWeight: 700 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ width: 32, height: 32, borderRadius: '9px', backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.18)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <ClassOutlined sx={{ fontSize: 15, color: C.accent }} />
                            </Box>
                            <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.875rem', color: C.textPrimary }}>
                              {classLabel(cls)}
                            </Typography>
                          </Box>
                        </TableCell>

                        {/* Grade */}
                        <TableCell sx={tdSx}>
                          <Chip label={cls.grade?.name ?? cls.grade_name ?? '—'} size="small"
                            sx={{ backgroundColor: C.purpleDim, color: C.purple, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid ${C.purple}30` }} />
                        </TableCell>

                        {/* Section */}
                        <TableCell sx={tdSx}>
                          <Chip label={`Section ${cls.section}`} size="small"
                            sx={{ backgroundColor: C.blueDim, color: C.blue, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid ${C.blue}25` }} />
                        </TableCell>

                        {/* Teacher */}
                        <TableCell sx={tdSx}>
                          {cls.teacher_name ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box sx={{ width: 26, height: 26, borderRadius: '50%', backgroundColor: C.greenDim, border: `1px solid ${C.green}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <PersonOutlined sx={{ fontSize: 13, color: C.green }} />
                              </Box>
                              <Typography sx={{ fontFamily: FONT, fontSize: '0.855rem', color: C.textPrimary }}>{cls.teacher_name}</Typography>
                            </Box>
                          ) : (
                            <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: C.textSecondary, fontStyle: 'italic' }}>Not assigned</Typography>
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell sx={tdSx}>
                          <Chip
                            label={cls.teacher_name ? 'Assigned' : 'Unassigned'} size="small"
                            sx={{ backgroundColor: cls.teacher_name ? C.greenDim : C.redDim, color: cls.teacher_name ? C.green : C.red, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid ${cls.teacher_name ? C.green : C.red}25` }}
                          />
                        </TableCell>

                        {/* Actions */}
                        <TableCell sx={tdSx}>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title="View Students" arrow>
                              <IconButton size="small"
                                onClick={() => { setStudentsClassId(cls.id); setStudentsClassName(classLabel(cls)); setStudentsOpen(true); }}
                                sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.blueDim, color: C.blue }, transition: `all ${EASE}` }}>
                                <PeopleOutlined sx={{ fontSize: 15 }} />
                              </IconButton>
                            </Tooltip>

                            {isAdmin && (
                              <>
                                <Tooltip title={cls.teacher_name ? 'Reassign Teacher' : 'Assign Teacher'} arrow>
                                  <IconButton size="small" onClick={() => openAssign(cls)}
                                    sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.accentDim, color: C.accent }, transition: `all ${EASE}` }}>
                                    <PersonAdd sx={{ fontSize: 15 }} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete Classroom" arrow>
                                  <IconButton size="small" onClick={() => setDeleteId(cls.id)}
                                    sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.redDim, color: C.red }, transition: `all ${EASE}` }}>
                                    <Delete sx={{ fontSize: 15 }} />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}

                {/* Ungrouped */}
                {ungrouped.map(cls => (
                  <TableRow key={cls.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' } }}>
                    <TableCell sx={{ ...tdSx, fontWeight: 700 }}>{classLabel(cls)}</TableCell>
                    <TableCell sx={{ ...tdSx, color: C.textSecondary }}>—</TableCell>
                    <TableCell sx={tdSx}>{cls.section}</TableCell>
                    <TableCell sx={tdSx}>{cls.teacher_name ?? <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: C.textSecondary, fontStyle: 'italic' }}>Not assigned</Typography>}</TableCell>
                    <TableCell sx={tdSx}>
                      <Chip label={cls.teacher_name ? 'Assigned' : 'Unassigned'} size="small"
                        sx={{ backgroundColor: cls.teacher_name ? C.greenDim : C.redDim, color: cls.teacher_name ? C.green : C.red, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
                    </TableCell>
                    <TableCell sx={tdSx}>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton size="small" onClick={() => { setStudentsClassId(cls.id); setStudentsClassName(classLabel(cls)); setStudentsOpen(true); }}
                          sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.blueDim, color: C.blue } }}>
                          <PeopleOutlined sx={{ fontSize: 15 }} />
                        </IconButton>
                        {isAdmin && (
                          <IconButton size="small" onClick={() => openAssign(cls)}
                            sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.accentDim, color: C.accent } }}>
                            <PersonAdd sx={{ fontSize: 15 }} />
                          </IconButton>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        )}

        {/* Mobile FAB — admin only */}
        {isMobile && isAdmin && (
          <MobileFab onClick={() => setAddOpen(true)} />
        )}

        {/* ── Assign Teacher Dialog ──────────────────────────────── */}
        <Dialog open={assignOpen} onClose={() => setAssignOpen(false)}
          fullWidth maxWidth="xs" fullScreen={isMobile}
          PaperProps={{ sx: { backgroundColor: C.surface, border: isMobile ? 'none' : `1px solid ${C.border}`, borderRadius: isMobile ? 0 : '16px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' } }}>
          <DialogTitle sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '1.05rem', color: C.textPrimary, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {selectedClass?.teacher_name ? 'Reassign Teacher' : 'Assign Teacher'}
            {isMobile && <IconButton onClick={() => setAssignOpen(false)} sx={{ color: C.textSecondary }}><Close /></IconButton>}
          </DialogTitle>
          <DialogContent sx={{ pt: 2.5 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Class info pill */}
              <Box sx={{ p: 1.75, borderRadius: '10px', backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.18)`, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <ClassOutlined sx={{ fontSize: 18, color: C.accent }} />
                <Box>
                  <Typography sx={{ fontSize: '0.68rem', color: C.accent, fontFamily: FONT, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Assigning to</Typography>
                  <Typography sx={{ fontSize: '0.95rem', color: C.textPrimary, fontFamily: FONT, fontWeight: 700 }}>
                    {selectedClass ? classLabel(selectedClass) : ''}
                  </Typography>
                </Box>
              </Box>

              {/* Current teacher chip */}
              {selectedClass?.teacher_name && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: C.textSecondary, fontFamily: FONT }}>Current:</Typography>
                  <Chip label={selectedClass.teacher_name} size="small"
                    sx={{ backgroundColor: C.greenDim, color: C.green, fontFamily: FONT, fontWeight: 600, fontSize: '0.72rem', height: 22, border: `1px solid ${C.green}25` }} />
                </Box>
              )}

              {/* Teacher dropdown */}
              <TextField select fullWidth label="Teacher" required sx={inputSx}
                value={teacherId}
                onChange={e => setTeacherId(Number(e.target.value))}
                SelectProps={{ MenuProps: menuProps }}>
                {teachers.map(t => (
                  <MenuItem key={t.id} value={t.id}>
                    <Box>
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.875rem' }}>{t.full_name}</Typography>
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: C.textSecondary }}>{t.email}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </TextField>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, borderTop: `1px solid ${C.border}` }}>
            <Button onClick={() => setAssignOpen(false)} disabled={assigning}
              sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: 'none', borderRadius: '8px' }}>Cancel</Button>
            <Button variant="contained" onClick={submitAssign} disabled={assigning || !teacherId}
              sx={{ backgroundColor: C.accent, color: '#111827', fontFamily: FONT, fontWeight: 600, textTransform: 'none', borderRadius: '10px', px: 3, '&:hover': { backgroundColor: '#FBBF24' }, '&.Mui-disabled': { backgroundColor: 'rgba(245,158,11,0.2)', color: 'rgba(17,24,39,0.4)' } }}>
              {assigning ? 'Assigning…' : 'Save'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Add Classroom Dialog ───────────────────────────────── */}
        <Dialog open={addOpen} onClose={() => setAddOpen(false)}
          fullWidth maxWidth="xs" fullScreen={isMobile}
          PaperProps={{ sx: { backgroundColor: C.surface, border: isMobile ? 'none' : `1px solid ${C.border}`, borderRadius: isMobile ? 0 : '16px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' } }}>
          <DialogTitle sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '1.05rem', color: C.textPrimary, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            Add Classroom
            {isMobile && <IconButton onClick={() => setAddOpen(false)} sx={{ color: C.textSecondary }}><Close /></IconButton>}
          </DialogTitle>
          <DialogContent sx={{ pt: 2.5 }}>
            <Grid container spacing={2}>
              <SectionLabel label="Class Details" />

              {/* Grade */}
              <Grid item xs={12}>
                <TextField select fullWidth label="Grade" required sx={inputSx}
                  value={form.grade_id}
                  onChange={(e) => setForm({ ...form, grade_id: Number(e.target.value) })}
                  SelectProps={{ MenuProps: menuProps }}>
                  <MenuItem value="" disabled>Select Grade</MenuItem>
                  {grades.map(g => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
                </TextField>
              </Grid>

              {/* Section */}
              <Grid item xs={12}>
                <TextField fullWidth label="Section" required sx={inputSx}
                  placeholder="e.g. A, B, C"
                  value={form.section}
                  inputProps={{ maxLength: 5 }}
                  onChange={(e) => setForm({ ...form, section: e.target.value.toUpperCase() })} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, borderTop: `1px solid ${C.border}` }}>
            <Button onClick={() => setAddOpen(false)} disabled={saving}
              sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: 'none', borderRadius: '8px' }}>Cancel</Button>
            <Button variant="contained" onClick={submitAdd}
              disabled={saving || !form.grade_id || !form.section.trim()}
              sx={{ backgroundColor: C.accent, color: '#111827', fontFamily: FONT, fontWeight: 600, textTransform: 'none', borderRadius: '10px', px: 3, '&:hover': { backgroundColor: '#FBBF24' }, '&.Mui-disabled': { backgroundColor: 'rgba(245,158,11,0.2)', color: 'rgba(17,24,39,0.4)' } }}>
              {saving ? 'Creating…' : 'Save Classroom'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Delete confirm ─────────────────────────────────────── */}
        <DeleteDialog
          open={!!deleteId} onClose={() => setDeleteId(null)}
          onConfirm={confirmDelete} loading={deleting}
          title="Delete Classroom?"
          description="This will permanently delete the classroom and may affect enrolled students."
        />

        {/* ── Students viewer ────────────────────────────────────── */}
        <StudentsDialog
          open={studentsOpen}
          onClose={() => setStudentsOpen(false)}
          classId={studentsClassId}
          className={studentsClassName}
          isMobile={isMobile}
        />

      </Box>
    </>
  );
}