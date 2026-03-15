"use client";

import React, { useEffect, useState } from "react";
import {
  Box, Button, Chip, Grid, IconButton, MenuItem, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
  Tooltip, useMediaQuery, useTheme,
} from "@mui/material";
import {
  Search, CheckCircleOutlined, CancelOutlined,
  CalendarTodayOutlined, ClassOutlined, PersonOutlined,
  BarChartOutlined, SaveOutlined,
} from "@mui/icons-material";
import { api } from "@/app/lib/api";
import toast from "react-hot-toast";
import { useAuthStore } from "@/app/store/authStore";
import {
  C, FONT, EASE, inputSx, menuProps, thSx, tdSx,
  GlobalStyles, PageHeader, EmptyState, DataTable,
} from "@/components/ui";

// ─── Types ──────────────────────────────────────────────────────────────
type Cls = { id: number; section: string; grade?: { name: string } };
type StudentRow = {
  id: number;
  first_name: string;
  last_name: string;
  roll_number?: string;
  status: string;
  date?: string;
  teacher_name?: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────
const classLabel = (c: Cls) => c.grade ? `${c.grade.name} – ${c.section}` : c.section;
const fullName   = (s: StudentRow) => `${s.first_name} ${s.last_name}`;

// ─── Status chip ─────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const present = status === "present";
  return (
    <Chip
      icon={present
        ? <CheckCircleOutlined sx={{ fontSize: "13px !important", color: `${C.green} !important` }} />
        : <CancelOutlined     sx={{ fontSize: "13px !important", color: `${C.red}   !important` }} />
      }
      label={present ? "Present" : "Absent"}
      size="small"
      sx={{
        backgroundColor: present ? C.greenDim : C.redDim,
        color:           present ? C.green    : C.red,
        fontFamily: FONT, fontWeight: 600, fontSize: "0.7rem",
        height: 22, border: `1px solid ${present ? C.green : C.red}25`,
        "& .MuiChip-icon": { ml: "6px" },
      }}
    />
  );
}

// ─── Stat pill ───────────────────────────────────────────────────────────
function StatPill({ label, value, color, dim }: { label: string; value: number; color: string; dim: string }) {
  return (
    <Box sx={{
      display: "flex", alignItems: "center", gap: 1,
      backgroundColor: dim, border: `1px solid ${color}25`,
      borderRadius: "10px", px: 1.75, py: 1,
    }}>
      <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: "1.1rem", color, lineHeight: 1 }}>
        {value}
      </Typography>
      <Typography sx={{ fontFamily: FONT, fontSize: "0.72rem", color: C.textSecondary }}>
        {label}
      </Typography>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  TEACHER — mark attendance
// ═══════════════════════════════════════════════════════════════════════════
function TeacherAttendance({ classes }: { classes: Cls[] }) {
  const isMobile = useMediaQuery("(max-width:600px)");
  const [classId,  setClassId]  = useState<number | "">("");
  const [date,     setDate]     = useState(new Date().toISOString().split("T")[0]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [search,   setSearch]   = useState("");
  const [saving,   setSaving]   = useState(false);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (!classId) return;
    setLoading(true);
    Promise.all([
      api.get(`/students/by-class/${classId}`),
      api.get(`/attendance?class_id=${classId}&attendance_date=${date}`),
    ]).then(([studentsRes, attendanceRes]) => {
      const map: Record<number, string> = {};
      for (const a of attendanceRes.data) map[a.student_id] = a.status;
      setStudents(studentsRes.data.map((s: StudentRow) => ({ ...s, status: map[s.id] ?? "present" })));
    }).catch(() => toast.error("Failed to load students or attendance"))
      .finally(() => setLoading(false));
  }, [classId, date]);

  const toggle = (id: number) =>
    setStudents(prev => prev.map(s => s.id === id ? { ...s, status: s.status === "present" ? "absent" : "present" } : s));

  const markAll = (status: string) =>
    setStudents(prev => prev.map(s => ({ ...s, status })));

  const handleSave = async () => {
    if (!classId) return toast.error("Please select a class");
    setSaving(true);
    try {
      await api.post("/attendance", students.map(s => ({
        student_id: s.id, class_id: classId, date, status: s.status,
      })));
      toast.success("Attendance saved successfully");
    } catch { toast.error("Failed to save attendance"); }
    finally { setSaving(false); }
  };

  const filtered = students.filter(s =>
    fullName(s).toLowerCase().includes(search.toLowerCase()) ||
    (s.roll_number ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const presentCount = students.filter(s => s.status === "present").length;
  const absentCount  = students.filter(s => s.status === "absent").length;

  return (
    <Box>
      <PageHeader
        title="Mark Attendance"
        subtitle="Record daily student attendance for your class"
        isMobile={isMobile}
      />

      {/* ── Filters ──────────────────────────────────────────── */}
      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        <Grid item xs={12} sm={5}>
          <TextField
            select fullWidth size="small" label="Class" sx={inputSx}
            value={classId}
            onChange={e => setClassId(Number(e.target.value))}
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
        <Grid item xs={12} sm={4}>
          <TextField
            type="date" fullWidth size="small" label="Date" sx={inputSx}
            value={date}
            onChange={e => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={3}>
          <TextField
            fullWidth size="small" placeholder="Search students…" sx={inputSx}
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <Search sx={{ color: C.textSecondary, mr: 1, fontSize: 16 }} /> }}
          />
        </Grid>
      </Grid>

      {/* ── Quick-mark + stats ────────────────────────────────── */}
      {students.length > 0 && (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, flexWrap: "wrap", gap: 1.5 }}>
          <Box sx={{ display: "flex", gap: 1.5 }}>
            <StatPill label="Present" value={presentCount} color={C.green} dim={C.greenDim} />
            <StatPill label="Absent"  value={absentCount}  color={C.red}   dim={C.redDim}   />
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button size="small" onClick={() => markAll("present")} sx={{
              color: C.green, fontFamily: FONT, textTransform: "none", fontSize: "0.78rem",
              borderRadius: "8px", border: `1px solid ${C.green}30`, px: 1.5,
              "&:hover": { backgroundColor: C.greenDim },
            }}>
              All Present
            </Button>
            <Button size="small" onClick={() => markAll("absent")} sx={{
              color: C.red, fontFamily: FONT, textTransform: "none", fontSize: "0.78rem",
              borderRadius: "8px", border: `1px solid ${C.red}30`, px: 1.5,
              "&:hover": { backgroundColor: C.redDim },
            }}>
              All Absent
            </Button>
          </Box>
        </Box>
      )}

      {/* ── Table ────────────────────────────────────────────── */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <Box sx={{
            width: 32, height: 32, borderRadius: "50%",
            border: `3px solid ${C.accentDim}`, borderTopColor: C.accent,
            animation: "spin 0.7s linear infinite",
            "@keyframes spin": { to: { transform: "rotate(360deg)" } },
          }} />
        </Box>
      ) : filtered.length === 0 && !classId ? (
        <EmptyState icon={CalendarTodayOutlined} message="Select a class to begin marking attendance" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={PersonOutlined} message="No students found for this class" />
      ) : (
        <DataTable>
          <Table>
            <TableHead>
              <TableRow>
                {["Roll", "Student", "Status", "Toggle"].map(h => (
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
                    animation: `fadeUp 0.3s ${i * 25}ms ease both`,
                    "@keyframes fadeUp": {
                      from: { opacity: 0, transform: "translateY(6px)" },
                      to:   { opacity: 1, transform: "translateY(0)" },
                    },
                  }}
                >
                  <TableCell sx={{ ...tdSx, fontFamily: '"DM Mono", monospace', color: C.textSecondary, width: 80 }}>
                    {s.roll_number || String(i + 1).padStart(3, "0")}
                  </TableCell>
                  <TableCell sx={tdSx}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                      <Box sx={{
                        width: 30, height: 30, borderRadius: "50%",
                        backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.2)`,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        <PersonOutlined sx={{ fontSize: 14, color: C.accent }} />
                      </Box>
                      <Typography sx={{ fontFamily: FONT, fontWeight: 600, fontSize: "0.875rem", color: C.textPrimary }}>
                        {fullName(s)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={tdSx}>
                    <StatusChip status={s.status} />
                  </TableCell>
                  <TableCell sx={tdSx}>
                    <Tooltip title={`Mark as ${s.status === "present" ? "Absent" : "Present"}`} arrow>
                      <IconButton
                        size="small"
                        onClick={() => toggle(s.id)}
                        sx={{
                          borderRadius: "8px", p: 0.75,
                          color: s.status === "present" ? C.green : C.red,
                          backgroundColor: s.status === "present" ? C.greenDim : C.redDim,
                          border: `1px solid ${s.status === "present" ? C.green : C.red}25`,
                          "&:hover": {
                            backgroundColor: s.status === "present" ? C.redDim : C.greenDim,
                            color:           s.status === "present" ? C.red    : C.green,
                          },
                          transition: `all ${EASE}`,
                        }}
                      >
                        {s.status === "present"
                          ? <CheckCircleOutlined sx={{ fontSize: 15 }} />
                          : <CancelOutlined     sx={{ fontSize: 15 }} />}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTable>
      )}

      {/* ── Save ─────────────────────────────────────────────── */}
      {students.length > 0 && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2.5 }}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={<SaveOutlined sx={{ fontSize: 16 }} />}
            sx={{
              backgroundColor: C.accent, color: "#111827",
              fontFamily: FONT, fontWeight: 600,
              textTransform: "none", borderRadius: "10px", px: 3,
              "&:hover": { backgroundColor: "#FBBF24" },
              "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" },
            }}
          >
            {saving ? "Saving…" : "Save Attendance"}
          </Button>
        </Box>
      )}
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN — attendance report
// ═══════════════════════════════════════════════════════════════════════════
function AdminAttendanceReport({ classes }: { classes: Cls[] }) {
  const isMobile = useMediaQuery("(max-width:600px)");
  const [classId, setClassId] = useState<number | "">("");
  const [date,    setDate]    = useState(new Date().toISOString().split("T")[0]);
  const [report,  setReport]  = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    if (!classId) return toast.error("Please select a class");
    setLoading(true);
    try {
      const res = await api.get(`/attendance?class_id=${classId}&attendance_date=${date}`);
      setReport(res.data.map((item: any, i: number) => ({
        id:           item.student_id ?? item.id,
        first_name:   item.first_name ?? item.name ?? "Unknown",
        last_name:    item.last_name ?? "",
        roll_number:  item.roll_number ?? String(i + 1),
        date:         item.date ?? date,
        status:       item.status,
        teacher_name: item.teacher_name ?? "—",
      })));
    } catch { toast.error("Failed to load report"); }
    finally   { setLoading(false); }
  };

  const presentCount = report.filter(s => s.status === "present").length;
  const absentCount  = report.filter(s => s.status === "absent").length;

  return (
    <Box sx={{ mt: 5 }}>
      <PageHeader
        title="Attendance Reports"
        subtitle="View and export attendance records by class and date"
        isMobile={isMobile}
      />

      {/* ── Filters ──────────────────────────────────────────── */}
      <Grid container spacing={1.5} sx={{ mb: 2.5 }} alignItems="center">
        <Grid item xs={12} sm={5}>
          <TextField
            select fullWidth size="small" label="Class" sx={inputSx}
            value={classId}
            onChange={e => setClassId(Number(e.target.value))}
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
        <Grid item xs={12} sm={4}>
          <TextField
            type="date" fullWidth size="small" label="Date" sx={inputSx}
            value={date}
            onChange={e => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={3}>
          <Button
            fullWidth variant="contained"
            onClick={generateReport}
            disabled={loading}
            startIcon={<BarChartOutlined sx={{ fontSize: 16 }} />}
            sx={{
              backgroundColor: C.accent, color: "#111827",
              fontFamily: FONT, fontWeight: 600,
              textTransform: "none", borderRadius: "10px",
              height: 40,
              "&:hover": { backgroundColor: "#FBBF24" },
              "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" },
            }}
          >
            {loading ? "Loading…" : "Generate"}
          </Button>
        </Grid>
      </Grid>

      {/* ── Stats ───────────────────────────────────────────── */}
      {report.length > 0 && (
        <Box sx={{ display: "flex", gap: 1.5, mb: 2 }}>
          <StatPill label="Present" value={presentCount} color={C.green} dim={C.greenDim} />
          <StatPill label="Absent"  value={absentCount}  color={C.red}   dim={C.redDim}   />
          <StatPill label="Total"   value={report.length} color={C.accent} dim={C.accentDim} />
        </Box>
      )}

      {/* ── Table ────────────────────────────────────────────── */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <Box sx={{
            width: 32, height: 32, borderRadius: "50%",
            border: `3px solid ${C.accentDim}`, borderTopColor: C.accent,
            animation: "spin 0.7s linear infinite",
            "@keyframes spin": { to: { transform: "rotate(360deg)" } },
          }} />
        </Box>
      ) : report.length === 0 ? (
        <EmptyState icon={BarChartOutlined} message="Select a class and date, then click Generate" />
      ) : (
        <DataTable>
          <Table>
            <TableHead>
              <TableRow>
                {["Roll", "Student", "Status", "Date", "Teacher"].map(h => (
                  <TableCell key={h} sx={thSx}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {report.map((s, i) => (
                <TableRow
                  key={`${s.id}-${s.date}`}
                  sx={{
                    "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" },
                    transition: `background ${EASE}`,
                    animation: `fadeUp 0.3s ${i * 25}ms ease both`,
                    "@keyframes fadeUp": {
                      from: { opacity: 0, transform: "translateY(6px)" },
                      to:   { opacity: 1, transform: "translateY(0)" },
                    },
                  }}
                >
                  <TableCell sx={{ ...tdSx, fontFamily: '"DM Mono", monospace', color: C.textSecondary, width: 80 }}>
                    {s.roll_number || String(i + 1).padStart(3, "0")}
                  </TableCell>
                  <TableCell sx={tdSx}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                      <Box sx={{
                        width: 30, height: 30, borderRadius: "50%",
                        backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.2)`,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        <PersonOutlined sx={{ fontSize: 14, color: C.accent }} />
                      </Box>
                      <Typography sx={{ fontFamily: FONT, fontWeight: 600, fontSize: "0.875rem", color: C.textPrimary }}>
                        {fullName(s)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={tdSx}>
                    <StatusChip status={s.status} />
                  </TableCell>
                  <TableCell sx={{ ...tdSx, fontFamily: '"DM Mono", monospace', fontSize: "0.8rem", color: C.textSecondary }}>
                    {s.date}
                  </TableCell>
                  <TableCell sx={tdSx}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                      <PersonOutlined sx={{ fontSize: 13, color: C.textSecondary }} />
                      <Typography sx={{ fontFamily: FONT, fontSize: "0.855rem", color: C.textPrimary }}>
                        {s.teacher_name}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTable>
      )}
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function AttendancePage() {
  const [classes, setClasses] = useState<Cls[]>([]);
  const { user } = useAuthStore();

  const isAdmin   = user?.org_role === "admin";
  const isTeacher = user?.org_role === "teacher";

  useEffect(() => {
    api.get("/classes")
      .then(res => setClasses(res.data))
      .catch(() => toast.error("Failed to load classes"));
  }, []);

  return (
    <>
      <GlobalStyles />
      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: "100%" }}>
        {isTeacher && <TeacherAttendance classes={classes} />}
        {isAdmin   && <AdminAttendanceReport classes={classes} />}
      </Box>
    </>
  );
}