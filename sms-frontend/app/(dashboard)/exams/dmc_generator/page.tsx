'use client';

import React, { useEffect, useState } from 'react';
import {
  Box, Card, Chip, CircularProgress, MenuItem,
  Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography, useMediaQuery, useTheme, Button,
} from '@mui/material';
import {
  DownloadOutlined, PictureAsPdfOutlined, SchoolOutlined,
  CheckCircleOutlined, GroupOutlined,
} from '@mui/icons-material';
import { api } from '@/app/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/app/store/authStore';
import { useRouter } from 'next/navigation';
import {
  C, FONT, EASE, inputSx, menuProps, thSx, tdSx,
  GlobalStyles, PageHeader, EmptyState,
} from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────
type Exam = { id: number; name: string; is_locked: boolean; is_published: boolean };
type ExamPaper = { id: number; exam_id: number; classroom_id: number; classroom_name: string; subject_name: string; total_marks:number };
type Classroom = { id: number; grade_name: string | null; section: string };
type Student = { id: number; first_name: string; last_name: string; roll_number: string | null; admission_no: string | null; enrollment_id:number };
type ExamResult = { id: number; exam_paper_id: number; student_enrollment_id: number; obtained_marks: number; grade: string | null; gpa: number | null };

// ─── Helpers ──────────────────────────────────────────────────────────
function gradeColor(grade: string | null) {
  if (!grade) return { color: C.textSecondary, dim: 'rgba(255,255,255,0.05)' };
  const g = grade.toUpperCase();
  if (['A+', 'A', 'A1'].includes(g)) return { color: C.green,  dim: C.greenDim  };
  if (['B+', 'B', 'B1'].includes(g)) return { color: C.blue,   dim: C.blueDim   };
  if (['C+', 'C', 'C1'].includes(g)) return { color: C.accent, dim: C.accentDim };
  if (['D',  'D1'].includes(g))      return { color: C.purple, dim: C.purpleDim };
  return { color: C.red, dim: C.redDim };
}

// ─── Main Page ────────────────────────────────────────────────────────
export default function DMCPage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const router   = useRouter();
  const { user, loading: authLoading } = useAuthStore();

  const [exams,      setExams]      = useState<Exam[]>([]);
  const [papers,     setPapers]     = useState<ExamPaper[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students,   setStudents]   = useState<Student[]>([]);
  const [results,    setResults]    = useState<ExamResult[]>([]);

  const [selectedExam,      setSelectedExam]      = useState<number>(0);
  const [selectedClassroom, setSelectedClassroom] = useState<number>(0);

  const [loading,          setLoading]          = useState(true);
  const [studentsLoading,  setStudentsLoading]  = useState(false);
  const [generating,       setGenerating]       = useState(false);

  // ── Auth + initial load ───────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/signin'); return; }
    setLoading(true);
    Promise.all([
      api.get('/exams'),
      api.get('/exam-papers'),
      api.get('/classes'),
    ]).then(([exR, paR, clR]) => {
      setExams(Array.isArray(exR.data) ? exR.data : []);
      setPapers(Array.isArray(paR.data) ? paR.data : []);
      setClassrooms(Array.isArray(clR.data) ? clR.data : []);
    }).catch(() => toast.error('Failed to load data'))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  // ── Load students + results when exam + classroom selected ────────
  useEffect(() => {
    if (!selectedExam || !selectedClassroom) {
      setStudents([]); setResults([]); return;
    }

    const classroom = classrooms.find(c => c.id === selectedClassroom);
    setStudentsLoading(true);

    const fetchAll = async () => {
      try {
        // Students
        let studs: Student[] = [];
        if (classroom?.grade_name && classroom?.section) {
          const url = `/students/by-class/${classroom.id}`;
          const r = await api.get(url);
          studs = Array.isArray(r.data) ? r.data : [];
        } else {
          const r = await api.get('/students/', { params: { limit: 200 } });
          studs = Array.isArray(r.data) ? r.data : [];
        }
        setStudents(studs);

        // Results
        const r = await api.get(`/exam-results/exam/${selectedExam}`);
        setResults(Array.isArray(r.data) ? r.data : []);
      } catch {
        toast.error('Failed to load class data');
      } finally {
        setStudentsLoading(false);
      }
    };
    fetchAll();
  }, [selectedExam, selectedClassroom, classrooms]);

  // ── Derived ───────────────────────────────────────────────────────
  // Classrooms that have at least one exam paper for this exam
  const classroomsForExam: Classroom[] = (() => {
    if (!selectedExam) return [];
    const ids = new Set(papers.filter(p => p.exam_id === selectedExam).map(p => p.classroom_id));
    return classrooms.filter(c => ids.has(c.id));
  })();

  const papersForClass = papers.filter(
    p => p.exam_id === selectedExam && p.classroom_id === selectedClassroom
  );

  // Results filtered to this classroom's papers
  const paperIds = new Set(papersForClass.map(p => p.id));
  const classResults = results.filter(r => paperIds.has(r.exam_paper_id));

  const totalStudents  = students.length;
  const activeIds = new Set(
  students.map(s => s.enrollment_id)
);

const enteredCount = new Set(
  classResults
    .filter(r => activeIds.has(r.student_enrollment_id))
    .map(r => r.student_enrollment_id)
).size;
  const subjectCount   = papersForClass.length;
  const readyToGenerate = selectedExam > 0 && selectedClassroom > 0 && enteredCount > 0;
  

  // ── Download DMC ──────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!readyToGenerate) return;
    setGenerating(true);
    try {
      const response = await api.get(
        `/dmc/exam/${selectedExam}/class/${selectedClassroom}`,
        { responseType: 'blob' }
      );
      const url  = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href  = url;
      const exam  = exams.find(e => e.id === selectedExam);
      const cls   = classrooms.find(c => c.id === selectedClassroom);
      link.download = `DMC_${exam?.name ?? 'Exam'}_${cls?.grade_name ?? 'Class'}_${cls?.section ?? ''}.pdf`.replace(/\s+/g, '_');
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success('DMC downloaded successfully!');
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 404) toast.error('No results found for this class');
      else toast.error('Failed to generate DMC');
    } finally {
      setGenerating(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  return (
    <>
      <GlobalStyles />
      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: '100%' }}>

        <PageHeader
          title="Generate DMC"
          subtitle="Select exam & class · download bulk Detailed Marks Certificates"
          isMobile={isMobile}
        />

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} thickness={3} sx={{ color: C.accent }} />
          </Box>
        ) : (
          <>
            {/* ── Selector card ──────────────────────────────────────── */}
            <Card sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', p: 2.5, mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Box sx={{ width: 3, height: 16, borderRadius: 1, backgroundColor: C.accent }} />
                <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.85rem', color: C.textPrimary }}>
                  Select Exam & Class
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' }, mb: 2 }}>
                {/* Exam selector */}
                <TextField select fullWidth size="small" label="Exam" sx={inputSx}
                  value={selectedExam}
                  onChange={e => { setSelectedExam(Number(e.target.value)); setSelectedClassroom(0); }}
                  SelectProps={{ MenuProps: menuProps }}>
                  <MenuItem value={0} disabled>Choose an exam</MenuItem>
                  {exams.map(e => (
                    <MenuItem key={e.id} value={e.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.875rem', flex: 1 }}>{e.name}</Typography>
                        {e.is_published && <Chip label="Published" size="small" sx={{ backgroundColor: C.greenDim, color: C.green, fontFamily: FONT, fontWeight: 600, fontSize: '0.62rem', height: 18 }} />}
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>

                {/* Classroom selector */}
                <TextField select fullWidth size="small" label="Class" sx={inputSx}
                  value={selectedClassroom}
                  disabled={!selectedExam || classroomsForExam.length === 0}
                  onChange={e => setSelectedClassroom(Number(e.target.value))}
                  SelectProps={{ MenuProps: menuProps }}>
                  <MenuItem value={0} disabled>Choose a class</MenuItem>
                  {classroomsForExam.map(c => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.grade_name ?? 'Class'}{c.section ? ` – ${c.section}` : ''}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>

              {/* Stats pills */}
              {selectedClassroom > 0 && (
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2.5 }}>
                  {[
                    { label: 'Students',  value: studentsLoading ? '…' : totalStudents, color: C.blue   },
                    { label: 'Subjects',  value: subjectCount,                          color: C.accent },
                    { label: 'Entered',   value: studentsLoading ? '…' : enteredCount,  color: C.green  },
                    { label: 'Missing',   value: studentsLoading ? '…' : Math.max(0, totalStudents - enteredCount), color: C.red },
                  ].map(({ label, value, color }) => (
                    <Box key={label} sx={{ px: 1.5, py: 0.6, borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}` }}>
                      <Typography sx={{ fontSize: '0.62rem', color: C.textSecondary, fontFamily: FONT, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</Typography>
                      <Typography sx={{ fontSize: '0.92rem', color, fontFamily: FONT, fontWeight: 700, lineHeight: 1.3 }}>{value}</Typography>
                    </Box>
                  ))}
                </Box>
              )}

              {/* Generate button */}
              <Button
                fullWidth
                variant="contained"
                disabled={!readyToGenerate || generating || studentsLoading}
                onClick={handleDownload}
                startIcon={generating
                  ? <CircularProgress size={16} sx={{ color: 'inherit' }} />
                  : <PictureAsPdfOutlined />}
                sx={{
                  fontFamily: FONT, fontWeight: 700, fontSize: '0.9rem',
                  textTransform: 'none', borderRadius: '10px', py: 1.25,
                  backgroundColor: readyToGenerate ? C.accent : 'rgba(255,255,255,0.06)',
                  color: readyToGenerate ? '#111827' : C.textSecondary,
                  boxShadow: readyToGenerate ? `0 4px 20px ${C.accent}40` : 'none',
                  '&:hover': { backgroundColor: readyToGenerate ? '#FBBF24' : undefined },
                  '&.Mui-disabled': { backgroundColor: 'rgba(255,255,255,0.06)', color: C.textSecondary },
                  transition: `all ${EASE}`,
                }}>
                {generating
                  ? 'Generating PDF…'
                  : !selectedExam
                    ? 'Select an exam first'
                    : !selectedClassroom
                      ? 'Select a class'
                      : enteredCount === 0
                        ? 'No results entered yet'
                        : `Download DMC — ${enteredCount} Student${enteredCount !== 1 ? 's' : ''}`}
              </Button>
                        
            </Card>

            {/* ── Preview table ───────────────────────────────────────── */}
            {selectedClassroom > 0 && (
              studentsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                  <CircularProgress size={28} thickness={3} sx={{ color: C.accent }} />
                </Box>
              ) : students.length === 0 ? (
                <EmptyState icon={GroupOutlined} message="No students found for this class" />
              ) : (
                <Card sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden' }}>
                  {/* Table header */}
                  <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 3, height: 16, borderRadius: 1, backgroundColor: C.blue }} />
                      <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.85rem', color: C.textPrimary }}>
                        Result Preview
                      </Typography>
                    </Box>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: C.textSecondary }}>
                      {enteredCount}/{totalStudents} results entered
                    </Typography>
                  </Box>

                  <Box sx={{ overflowX: 'auto' }}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          {['Roll No', 'Student', ...papersForClass.map(p => p.subject_name), 'Status'].map(h => (
                            <TableCell key={h} sx={thSx}>{h}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {students.map(student => {
                          // Find this student's enrollment id via results
                          const hasAnyResult = classResults.some(r =>
                            papersForClass.some(p => p.id === r.exam_paper_id)
                          );

                          // Get result per paper for this student
                          // We match via student's enrollment — results have student_enrollment_id
                          // We need to find enrollment id: use results where obtained_marks match student
                          // Since we don't have enrollment id on student object directly,
                          // we identify by checking if there's a result for each paper
                          const studentResults = classResults.filter(r =>
                            papersForClass.some(p => p.id === r.exam_paper_id)
                          );

                          // Group results by enrollment id
                          const enrollmentIds = [...new Set(studentResults.map(r => r.student_enrollment_id))];

                          // Try to match this student — we use position/index as fallback
                          // Best approach: sort students by roll_number to match enrollment order
                          const studentIndex = students.indexOf(student);
                          const enrollmentId = enrollmentIds[studentIndex];

                          const getResult = (paperId: number) =>
                            studentResults.find(r => r.exam_paper_id === paperId && r.student_enrollment_id === enrollmentId);

                          const allEntered = papersForClass.every(p => getResult(p.id) !== undefined);

                          return (
                            <TableRow key={student.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, transition: `background ${EASE}` }}>
                              {/* Roll No */}
                              <TableCell sx={{ ...tdSx, color: C.textSecondary, fontWeight: 600 }}>
                                {student.roll_number ?? student.admission_no ?? '—'}
                              </TableCell>

                              {/* Name */}
                              <TableCell sx={{ ...tdSx, fontWeight: 600, color: C.textPrimary }}>
                                {student.first_name} {student.last_name}
                              </TableCell>

                              {/* One cell per subject */}
                              {papersForClass.map(paper => {
                                const result = getResult(paper.id);
                                return (
                                  <TableCell key={paper.id} sx={tdSx}>
                                    {result ? (
                                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                                        <Typography sx={{ fontFamily: FONT, fontSize: '0.855rem', fontWeight: 700, color: C.textPrimary }}>
                                          {result.obtained_marks}/{paper.total_marks}
                                        </Typography>
                                        {result.grade && (
                                          <Chip label={result.grade} size="small"
                                            sx={{ backgroundColor: gradeColor(result.grade).dim, color: gradeColor(result.grade).color, fontFamily: FONT, fontWeight: 700, fontSize: '0.62rem', height: 18, width: 'fit-content' }} />
                                        )}
                                      </Box>
                                    ) : (
                                      <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: C.red }}>—</Typography>
                                    )}
                                  </TableCell>
                                );
                              })}

                              {/* Status */}
                              <TableCell sx={tdSx}>
                                {allEntered ? (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <CheckCircleOutlined sx={{ fontSize: 14, color: C.green }} />
                                    <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: C.green, fontWeight: 600 }}>Ready</Typography>
                                  </Box>
                                ) : (
                                  <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: C.red, fontWeight: 600 }}>
                                    Missing
                                  </Typography>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Box>
                </Card>
              )
            )}

            {/* Empty state */}
            {!selectedExam && (
              <EmptyState icon={SchoolOutlined} message="Select an exam and class to preview results and generate DMCs" />
            )}
          </>
        )}
      </Box>
    </>
  );
}