"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { useAuthStore } from "@/app/store/authStore";
import AttendanceEmptyState from "@/components/attendance/AttendanceEmptyState";
import AttendanceReport from "@/components/attendance/AttendanceReport";
import TeacherAttendance from "@/components/attendance/TeacherAttendance";
import type { Classroom } from "@/components/attendance/types";

export default function AttendancePage() {
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const { user } = useAuthStore();
  const isAdmin = user?.org_role === "admin";
  const isTeacher = user?.org_role === "teacher";

  useEffect(() => {
    api.get("/classes")
      .then((response) => setClasses(Array.isArray(response.data) ? response.data : []))
      .catch(() => toast.error("Failed to load classes"))
      .finally(() => setLoadingClasses(false));
  }, []);

  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      {loadingClasses ? <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#8B6DF2]/20 border-t-[#8B6DF2]" /></div> : isTeacher ? <TeacherAttendance classes={classes} /> : isAdmin ? <AttendanceReport classes={classes} /> : <AttendanceEmptyState icon={CalendarDays} message="Attendance is available to teachers and administrators." />}
    </div>
  );
}
