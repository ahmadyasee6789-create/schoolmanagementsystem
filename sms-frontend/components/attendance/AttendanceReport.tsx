"use client";

import { useState } from "react";
import { ChartBar } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import AttendanceEmptyState from "./AttendanceEmptyState";
import AttendanceFilters from "./AttendanceFilters";
import AttendanceSummary from "./AttendanceSummary";
import AttendanceTable from "./AttendanceTable";
import type { AttendanceRecord, AttendanceStudent, Classroom } from "./types";

export default function AttendanceReport({ classes }: { classes: Classroom[] }) {
  const [classId, setClassId] = useState<number | "">("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [report, setReport] = useState<AttendanceStudent[]>([]);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    if (!classId) { toast.error("Please select a class"); return; }
    setLoading(true);
    try {
      const response = await api.get(`/attendance?class_id=${classId}&attendance_date=${date}`);
      const records = Array.isArray(response.data) ? response.data as AttendanceRecord[] : [];
      setReport(records.map((record, index) => ({
        id: record.student_id ?? record.id ?? index,
        first_name: record.first_name ?? record.name ?? "Unknown",
        last_name: record.last_name ?? "",
        roll_number: record.roll_number ?? String(index + 1),
        date: record.date ?? date,
        status: record.status,
        teacher_name: record.teacher_name ?? "—",
      })));
    } catch {
      toast.error("Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const present = report.filter((student) => student.status === "present").length;
  const absent = report.filter((student) => student.status === "absent").length;

  return (
    <section>
      <div className="mb-6"><h1 className="text-[1.45rem] font-bold text-slate-900 dark:text-slate-50">Attendance Reports</h1><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">View attendance records by class and date</p></div>
      <AttendanceFilters classes={classes} classId={classId} date={date} onClassChange={setClassId} onDateChange={setDate} onGenerate={generateReport} generating={loading} />
      {report.length > 0 && <div className="mb-4"><AttendanceSummary present={present} absent={absent} total={report.length} /></div>}
      {loading ? <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#8B6DF2]/20 border-t-[#8B6DF2]" /></div> : report.length === 0 ? <AttendanceEmptyState icon={ChartBar} message="Select a class and date, then generate the report" /> : <AttendanceTable students={report} showDate showTeacher />}
    </section>
  );
}
