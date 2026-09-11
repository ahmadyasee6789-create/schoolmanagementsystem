"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Save, Users } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import AttendanceFilters from "./AttendanceFilters";
import AttendanceEmptyState from "./AttendanceEmptyState";
import AttendanceSummary from "./AttendanceSummary";
import AttendanceTable from "./AttendanceTable";
import type { AttendanceRecord, AttendanceStatus, AttendanceStudent, Classroom } from "./types";

type StudentResponse = {
  id: number;
  first_name: string;
  last_name: string;
  roll_number?: string;
};

export default function TeacherAttendance({ classes }: { classes: Classroom[] }) {
  const [classId, setClassId] = useState<number | "">("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!classId) return;
    const loadAttendance = async () => {
      setLoading(true);
      try {
        const [studentsResponse, attendanceResponse] = await Promise.all([
          api.get(`/students/by-class/${classId}`),
          api.get(`/attendance?class_id=${classId}&attendance_date=${date}`),
        ]);
        const attendance = Array.isArray(attendanceResponse.data) ? attendanceResponse.data as AttendanceRecord[] : [];
        const statuses = attendance.reduce<Record<number, AttendanceStatus>>((allStatuses, record) => {
          if (record.student_id !== undefined) allStatuses[record.student_id] = record.status;
          return allStatuses;
        }, {});
        const classStudents = Array.isArray(studentsResponse.data) ? studentsResponse.data as StudentResponse[] : [];
        setStudents(classStudents.map((student) => ({ ...student, status: statuses[student.id] ?? "present" })));
      } catch {
        toast.error("Failed to load students or attendance");
      } finally {
        setLoading(false);
      }
    };
    void loadAttendance();
  }, [classId, date]);

  const toggleStatus = (studentId: number) => setStudents((current) => current.map((student) => student.id === studentId ? { ...student, status: student.status === "present" ? "absent" : "present" } : student));
  const markAll = (status: AttendanceStatus) => setStudents((current) => current.map((student) => ({ ...student, status })));
  const saveAttendance = async () => {
    if (!classId) { toast.error("Please select a class"); return; }
    setSaving(true);
    try {
      await api.post("/attendance", students.map((student) => ({ student_id: student.id, class_id: classId, date, status: student.status })));
      toast.success("Attendance saved successfully");
    } catch {
      toast.error("Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  const filteredStudents = students.filter((student) => `${student.first_name} ${student.last_name}`.toLowerCase().includes(search.toLowerCase()) || (student.roll_number ?? "").toLowerCase().includes(search.toLowerCase()));
  const present = students.filter((student) => student.status === "present").length;
  const absent = students.filter((student) => student.status === "absent").length;

  return (
    <section>
      <div className="mb-6"><h1 className="text-[1.45rem] font-bold text-slate-900 dark:text-slate-50">Mark Attendance</h1><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Record daily student attendance for your class</p></div>
      <AttendanceFilters classes={classes} classId={classId} date={date} onClassChange={setClassId} onDateChange={setDate} search={search} onSearchChange={setSearch} />
      {students.length > 0 && <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><AttendanceSummary present={present} absent={absent} /><div className="flex gap-2"><button type="button" onClick={() => markAll("present")} className="rounded-lg border border-emerald-400/25 px-3 py-2 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:border-emerald-400/20 dark:text-emerald-400 dark:hover:bg-emerald-500/10">All Present</button><button type="button" onClick={() => markAll("absent")} className="rounded-lg border border-red-400/25 px-3 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50 dark:border-red-400/20 dark:hover:bg-red-500/10">All Absent</button></div></div>}
      {loading ? <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#8B6DF2]/20 border-t-[#8B6DF2]" /></div> : !classId ? <AttendanceEmptyState icon={CalendarDays} message="Select a class to begin marking attendance" /> : filteredStudents.length === 0 ? <AttendanceEmptyState icon={Users} message={search ? "No students match your search" : "No students found for this class"} /> : <AttendanceTable students={filteredStudents} onToggle={toggleStatus} />}
      {students.length > 0 && <div className="mt-5 flex justify-end"><button type="button" onClick={saveAttendance} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"><Save size={16} />{saving ? "Saving…" : "Save Attendance"}</button></div>}
    </section>
  );
}
