"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../store/authStore";
import { api } from "../lib/api";
import { Users, TrendingUp, TrendingDown, Wallet, Banknote, Receipt, GraduationCap, UserRound } from "lucide-react";

import StatCard from "@/components/dashboard/StatCard";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DashboardLoading from "@/components/dashboard/DashboardLoading";
import DashboardError from "@/components/dashboard/DashboardError";
import StudentStatusChart from "@/components/dashboard/StudentsStatusChart";
import StudentsPerClassChart from "@/components/dashboard/StudentsPerClassChart";
import MonthlyFinancialChart from "@/components/dashboard/MonthlyFinancialChart";
import YearSummaryCard from "@/components/dashboard/YearSummaryCard";
import { fmt } from "@/components/dashboard/CustomTooltip";

export default function HomePage() {
  const { user, loading: authLoading } = useAuthStore();
  const role = user?.org_role;
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const can = {
    viewStudents: role === "admin",
    viewTeachers: role === "admin",
    viewFees: role === "admin" || role === "accountant",
    viewMyClasses: role === "teacher" || role === "admin",
    viewAttendance: role === "teacher" || role === "admin",
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/signin"); return; }

    (async () => {
      try {
        const cached = localStorage.getItem("dashboard_stats");
        if (cached) { setStats(JSON.parse(cached)); setLoading(false); }
        const res = await api.get("/dashboard/stats");
        const fresh = res.data;
        if (JSON.stringify(fresh) !== cached) {
          localStorage.setItem("dashboard_stats", JSON.stringify(fresh));
          setStats(fresh);
        }
        setError(null);
      } catch (err: any) {
        console.error("Dashboard error:", err);
        if (err.response?.status === 400) {
          const detail = err.response?.data?.detail;
          if (detail === "No active academic session found") {
            setError(
              role === "admin"
                ? "No active academic session found. Please go to Settings → Academic Sessions and activate or create a session for the current term."
                : "No active academic session found. Please contact your school administrator to activate the current academic session."
            );
          } else {
            setError(detail || "Unable to load dashboard data. Please try again later.");
          }
        } else if (err.response?.status === 401) {
          router.replace("/signin");
        } else {
          setError("An unexpected error occurred. Please refresh the page or contact support.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user, router, authLoading, role]);

  if (loading && !stats) return <DashboardLoading />;

  if (error) {
    return (
      <DashboardError
        error={error}
        role={role}
        onGoToSessions={() => router.push("/academics/sessions")}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (!stats) return null;

  const fin = stats.financials;
  const classData = stats.overview.studentsPerClass.map((item: any) => ({
    class: item.class, students: item.students,
  }));
  const financialData = fin.monthlyComparison.map((item: any) => ({
    month: item.month,
    Revenue: item.revenue,
    Salary: item.salary ?? 0,
    Expense: item.expense ?? 0,
    Net: item.net,
  }));
  const netColor = fin.net.yearTotal >= 0 ? "#34D399" : "#F87171";

  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }`}</style>

      <DashboardHeader
        year={fin.year}
        subtitle={role === "teacher" ? "Your classes and attendance" : "Students, faculty and financial performance"}
      />

      {/* Row 1 — overview stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {can.viewStudents && (
          <StatCard
            title="Total Students" icon={Users}
            value={stats.overview.students.total}
            colorHex="#F59E0B" dimBgClass="bg-amber-50 dark:bg-[#F59E0B]/10"
            sub={`${stats.overview.students.active} active`} delay={0}
          />
        )}
        {can.viewTeachers && (
          <StatCard
            title="Teachers" icon={GraduationCap}
            value={stats.overview.faculty}
            colorHex="#60A5FA" dimBgClass="bg-blue-50 dark:bg-[#60A5FA]/10"
            sub={`${stats.overview.classes} classes`} delay={60}
          />
        )}
        {can.viewFees && (
          <StatCard
            title="Year Revenue" icon={TrendingUp}
            value={fmt(fin.revenue.yearTotal)}
            colorHex="#34D399" dimBgClass="bg-green-50 dark:bg-[#34D399]/10"
            sub="Total fee collections" delay={120}
          />
        )}
        {can.viewFees && (
          <StatCard
            title="Net Profit" icon={Wallet}
            value={fmt(fin.net.yearTotal)}
            colorHex={netColor}
            dimBgClass={fin.net.yearTotal >= 0 ? "bg-green-50 dark:bg-[#34D399]/10" : "bg-red-50 dark:bg-[#F87171]/10"}
            sub="Revenue − expenses − salaries" delay={180}
          />
        )}
        {can.viewMyClasses && role === "teacher" && (
          <StatCard
            title="My Classes" icon={GraduationCap}
            value={stats.overview.classes}
            colorHex="#60A5FA" dimBgClass="bg-blue-50 dark:bg-[#60A5FA]/10"
            sub="Assigned to you" delay={0}
          />
        )}
        {can.viewAttendance && role === "teacher" && (
          <StatCard
            title="Today Attendance"
            value={
              stats.attendance?.marked
                ? `Present:${stats.attendance.present} | Absent:${stats.attendance.absent}`
                : "Not marked"
            }
            sub={stats.attendance?.marked ? `${stats.attendance.percentage}%` : ""}
            icon={UserRound}
            colorHex="#A78BFA" dimBgClass="bg-violet-50 dark:bg-[#A78BFA]/10"
            delay={60}
          />
        )}
      </div>

      {/* Row 2 — financial breakdown */}
      {can.viewFees && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            title="Operational Expenses" icon={Receipt}
            value={fmt(fin.expenses.yearTotal)}
            colorHex="#F87171" dimBgClass="bg-red-50 dark:bg-[#F87171]/10"
            sub="Non-salary costs" delay={0}
          />
          <StatCard
            title="Salaries Paid" icon={Banknote}
            value={fmt(fin.expenses.salaryYearTotal)}
            colorHex="#A78BFA" dimBgClass="bg-violet-50 dark:bg-[#A78BFA]/10"
            sub="Teacher payroll disbursed" delay={60}
          />
          <StatCard
            title="Pending Payroll" icon={Banknote}
            value={fmt(fin.expenses.pendingSalaryTotal ?? 0)}
            colorHex="#F59E0B" dimBgClass="bg-amber-50 dark:bg-[#F59E0B]/10"
            sub="Generated but not yet paid" delay={120}
          />
          <StatCard
            title="Total Outflow" icon={TrendingDown}
            value={fmt(fin.expenses.combinedYearTotal)}
            colorHex="#F87171" dimBgClass="bg-red-50 dark:bg-[#F87171]/10"
            sub="Expenses + salaries combined" delay={180}
          />
        </div>
      )}

      {/* Charts row 1 */}
      <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-12">
        {can.viewStudents && (
          <div className="md:col-span-4">
            <StudentStatusChart
              active={stats.overview.students.active}
              inactive={stats.overview.students.inactive}
            />
          </div>
        )}
        {can.viewMyClasses && (
          <div className={can.viewStudents ? "md:col-span-8" : "md:col-span-12"}>
            <StudentsPerClassChart data={classData} />
          </div>
        )}
      </div>

      {/* Charts row 2 — financials */}
      {can.viewFees && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <MonthlyFinancialChart data={financialData} year={fin.year} />
          </div>
          <div className="lg:col-span-4">
            <YearSummaryCard
              year={fin.year}
              revenue={fin.revenue.yearTotal}
              expenses={fin.expenses.yearTotal}
              salaries={fin.expenses.salaryYearTotal}
              totalOutflow={fin.expenses.combinedYearTotal}
              netProfit={fin.net.yearTotal}
              pendingPayroll={fin.expenses.pendingSalaryTotal ?? 0}
            />
          </div>
        </div>
      )}
    </div>
  );
}