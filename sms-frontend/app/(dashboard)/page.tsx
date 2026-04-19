"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Box, Card, CardContent, Grid, Typography, Divider,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../store/authStore";
import { api } from "../lib/api";
import {
  PeopleOutline, TrendingUp, TrendingDown,
  AccountBalanceWalletOutlined, PaymentsOutlined,
  ReceiptLongOutlined, SchoolOutlined, People,
} from "@mui/icons-material";

// ─── Design tokens ────────────────────────────────────────────────────
const C = {
  bg:            "#111827",
  surface:       "#161D2B",
  surfaceHover:  "#1C2535",
  border:        "rgba(255,255,255,0.07)",
  accent:        "#F59E0B",
  accentDim:     "rgba(245,158,11,0.12)",
  textPrimary:   "#F9FAFB",
  textSecondary: "rgba(249,250,251,0.45)",
  green:         "#34D399",
  greenDim:      "rgba(52,211,153,0.12)",
  red:           "#F87171",
  redDim:        "rgba(248,113,113,0.12)",
  blue:          "#60A5FA",
  blueDim:       "rgba(96,165,250,0.12)",
  purple:        "#A78BFA",
  purpleDim:     "rgba(167,139,250,0.12)",
};
const FONT = "'DM Sans', sans-serif";
const EASE = "300ms cubic-bezier(0.4, 0, 0.2, 1)";
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmt = (n: number) =>
  n >= 1_000_000 ? `Rs ${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `Rs ${(n / 1_000).toFixed(0)}k`
  : `Rs ${n}`;

// ─── Custom tooltip ───────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const countKeys = ["students", "classes", "faculty"];
  const countNames = ["Active", "Inactive"];
  return (
    <Box sx={{
      backgroundColor: C.surfaceHover, border: `1px solid ${C.border}`,
      borderRadius: "10px", p: 1.75, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      minWidth: 160,
    }}>
      {label && (
        <Typography sx={{ fontSize: "0.7rem", color: C.textSecondary, mb: 1, fontFamily: FONT, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {typeof label === "number" ? MONTHS_SHORT[label - 1] : label}
        </Typography>
      )}
      {payload.map((p: any, i: number) => (
        <Box key={i} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 0.4 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Box sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: p.color, flexShrink: 0 }} />
            <Typography sx={{ fontSize: "0.75rem", color: C.textSecondary, fontFamily: FONT }}>{p.name}</Typography>
          </Box>
          <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, color: C.textPrimary, fontFamily: FONT }}>
            {countKeys.includes(p.dataKey) || countNames.includes(p.name) ? p.value : fmt(p.value)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

// ─── Stat card ────────────────────────────────────────────────────────
function StatCard({ title, value, icon: Icon, color, dim, sub, delay = 0 }: {
  title: string; value: string | number; icon: React.ElementType;
  color: string; dim: string; sub?: string; delay?: number;
}) {
  return (
    <Card sx={{
      backgroundColor: C.surface, border: `1px solid ${C.border}`,
      borderRadius: "14px", overflow: "hidden", position: "relative",
      transition: `transform ${EASE}, box-shadow ${EASE}`,
      animation: "fadeUp 0.5s ease both", animationDelay: `${delay}ms`,
      "&:hover": {
        transform: "translateY(-3px)",
        boxShadow: `0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px ${color}25`,
      },
      "&::before": {
        content: '""', position: "absolute", top: 0, left: 0, right: 0,
        height: "2px", background: `linear-gradient(90deg, ${color}, transparent)`,
      },
    }}>
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 2 }}>
          <Box sx={{
            width: 42, height: 42, borderRadius: "11px",
            backgroundColor: dim, border: `1px solid ${color}25`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon sx={{ fontSize: 20, color }} />
          </Box>
        </Box>
        <Typography sx={{ fontSize: "0.7rem", color: C.textSecondary, fontFamily: FONT, letterSpacing: "0.06em", textTransform: "uppercase", mb: 0.5 }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: "1.6rem", fontWeight: 700, color: C.textPrimary, fontFamily: FONT, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          {value}
        </Typography>
        {sub && (
          <Typography sx={{ fontSize: "0.7rem", color: C.textSecondary, fontFamily: FONT, mt: 0.5 }}>
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Chart wrapper ────────────────────────────────────────────────────
function ChartCard({ title, subtitle, children, action }: {
  title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <Card sx={{
      backgroundColor: C.surface, border: `1px solid ${C.border}`,
      borderRadius: "14px", height: "100%",
    }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 0.5 }}>
          <Box>
            <Typography sx={{ fontSize: "0.92rem", fontWeight: 700, color: C.textPrimary, fontFamily: FONT }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography sx={{ fontSize: "0.72rem", color: C.textSecondary, fontFamily: FONT, mt: 0.2 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {action}
        </Box>
        <Divider sx={{ borderColor: C.border, my: 2 }} />
        {children}
      </CardContent>
    </Card>
  );
}

// ─── Financial summary row ────────────────────────────────────────────
function FinSummaryRow({ label, value, color, border = false }: {
  label: string; value: number; color: string; border?: boolean;
}) {
  return (
    <Box sx={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      py: 1.1, borderTop: border ? `1px solid ${C.border}` : "none",
    }}>
      <Typography sx={{ fontFamily: FONT, fontSize: "0.82rem", color: C.textSecondary }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: "'DM Mono', monospace", fontSize: "0.88rem", fontWeight: 700, color }}>
        {fmt(value)}
      </Typography>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════
export default function HomePage() {
  const { user, loading: authLoading } = useAuthStore();
  const role = user?.org_role; // "admin" | "teacher" | "accountant"
  const router  = useRouter();
  const [stats,   setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
  // ── What each role can see ─────────────────────────────────────────
  // Think of this as a list of true/false switches per role
  const can = {
    viewStudents:   role === "admin",                              // only admin
    viewTeachers:   role === "admin",                              // only admin
    viewFees:       role === "admin" || role === "accountant",     // admin + accountant
    viewMyClasses:  role === "teacher" || role === "admin",        // teacher + admin
    viewAttendance: role === "teacher" || role === "admin",        // teacher + admin
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
        setError(null); // Clear any previous error
      } catch (err: any) {
        console.error("Dashboard error:", err);
        
        // 👇 Handle the specific 400 error professionally
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
        } 
        else if (err.response?.status === 401) {
          router.replace("/signin");
        } 
        else {
          setError("An unexpected error occurred. Please refresh the page or contact support.");
        }
      } finally { 
        setLoading(false); 
      }
    })();
  }, [user, router, authLoading, role]);

  if (loading && !stats) return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", backgroundColor: C.bg }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono&display=swap');`}</style>
      <Box sx={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${C.accentDim}`, borderTopColor: C.accent, animation: "spin 0.7s linear infinite", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />
    </Box>
  );

  if (!stats) return null;

  // ── Derived data ───────────────────────────────────────────────────
  const fin = stats.financials;

  const pieData = [
    { name: "Active",   value: stats.overview.students.active   },
    { name: "Inactive", value: stats.overview.students.inactive },
  ];

  const classData = stats.overview.studentsPerClass.map((item: any) => ({
    class: item.class, students: item.students,
  }));

  const financialData = fin.monthlyComparison.map((item: any) => ({
    month:   item.month,
    Revenue: item.revenue,
    Salary:  item.salary  ?? 0,
    Expense: item.expense ?? 0,
    Net:     item.net,
  }));

  const netColor = fin.net.yearTotal >= 0 ? C.green : C.red;
  const axisStyle = { fill: "rgba(249,250,251,0.3)", fontSize: 11, fontFamily: FONT };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: "100%" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────── */}
      {/* Everyone sees the header */}
      <Box sx={{ mb: 3.5, animation: "fadeUp 0.4s ease both" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.4 }}>
          <Box sx={{ width: 3, height: 24, borderRadius: 2, backgroundColor: C.accent, boxShadow: `0 0 8px ${C.accent}` }} />
          <Typography sx={{ fontSize: "1.45rem", fontWeight: 700, color: C.textPrimary, fontFamily: FONT, letterSpacing: "-0.02em" }}>
            Dashboard
          </Typography>
        </Box>
        <Typography sx={{ color: C.textSecondary, fontSize: "0.82rem", fontFamily: FONT, ml: "19px" }}>
          {fin.year} · {role === "teacher" ? "Your classes and attendance" : "Students, faculty and financial performance"}
        </Typography>
      </Box>

      {/* ── Stat cards row 1 — overview ─────────────────────────── */}
      {/* Each card is wrapped individually so roles only see their cards */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>

        {/* ADMIN + TEACHER: Total Students */}
        {can.viewStudents && (
          <Grid item xs={6} md={3}>
            <StatCard
              title="Total Students" icon={PeopleOutline}
              value={stats.overview.students.total}
              color={C.accent} dim={C.accentDim}
              sub={`${stats.overview.students.active} active`}
              delay={0}
            />
          </Grid>
        )}

        {/* ADMIN only: Teachers */}
        {can.viewTeachers && (
          <Grid item xs={6} md={3}>
            <StatCard
              title="Teachers" icon={SchoolOutlined}
              value={stats.overview.faculty}
              color={C.blue} dim={C.blueDim}
              sub={`${stats.overview.classes} classes`}
              delay={60}
            />
          </Grid>
        )}

        {/* ADMIN + ACCOUNTANT: Year Revenue */}
        {can.viewFees && (
          <Grid item xs={6} md={3}>
            <StatCard
              title="Year Revenue" icon={TrendingUp}
              value={fmt(fin.revenue.yearTotal)}
              color={C.green} dim={C.greenDim}
              sub="Total fee collections"
              delay={120}
            />
          </Grid>
        )}

        {/* ADMIN + ACCOUNTANT: Net Profit */}
        {can.viewFees && (
          <Grid item xs={6} md={3}>
            <StatCard
              title="Net Profit" icon={AccountBalanceWalletOutlined}
              value={fmt(fin.net.yearTotal)}
              color={netColor} dim={fin.net.yearTotal >= 0 ? C.greenDim : C.redDim}
              sub="Revenue − expenses − salaries"
              delay={180}
            />
          </Grid>
        )}

        {/* TEACHER only: My Classes */}
        {can.viewMyClasses && role === "teacher" && (
          <Grid item xs={6} md={3}>
            <StatCard
              title="My Classes" icon={SchoolOutlined}
              value={stats.overview.classes}
              color={C.blue} dim={C.blueDim}
              sub="Assigned to you"
              delay={0}
            />
          </Grid>
        )}
        {/* TEACHER only: Attendance */}
        {can.viewAttendance && role==="teacher" &&(
          <Grid item xs={6} md={3}>
            <StatCard
              title="Today Attendance"
              value={
                 stats.attendance?.marked
                  ? `Present:${stats.attendance.present} | Absent:${stats.attendance.absent}`
                  : "Not marked"
            }
            sub={
               stats.attendance?.marked
                 ?`${stats.attendance.percentage}%`
                 :""
            }
            icon={People}     // ✅ REQUIRED
      color={C.purple}  dim={C.purpleDim}     // ✅ REQUIRED
            delay={60}
            
            
            />
          </Grid>
        )}

      </Grid>

      {/* ── Stat cards row 2 — financial breakdown ──────────────── */}
      {/* Only admin and accountant see financial breakdown */}
      {can.viewFees && (
        <Grid container spacing={2} sx={{ mb: 3 }}>

          <Grid item xs={6} md={3}>
            <StatCard
              title="Operational Expenses" icon={ReceiptLongOutlined}
              value={fmt(fin.expenses.yearTotal)}
              color={C.red} dim={C.redDim}
              sub="Non-salary costs"
              delay={0}
            />
          </Grid>

          <Grid item xs={6} md={3}>
            <StatCard
              title="Salaries Paid" icon={PaymentsOutlined}
              value={fmt(fin.expenses.salaryYearTotal)}
              color={C.purple} dim={C.purpleDim}
              sub="Teacher payroll disbursed"
              delay={60}
            />
          </Grid>

          <Grid item xs={6} md={3}>
            <StatCard
              title="Pending Payroll" icon={PaymentsOutlined}
              value={fmt(fin.expenses.pendingSalaryTotal ?? 0)}
              color={C.accent} dim={C.accentDim}
              sub="Generated but not yet paid"
              delay={120}
            />
          </Grid>

          <Grid item xs={6} md={3}>
            <StatCard
              title="Total Outflow" icon={TrendingDown}
              value={fmt(fin.expenses.combinedYearTotal)}
              color={C.red} dim={C.redDim}
              sub="Expenses + salaries combined"
              delay={180}
            />
          </Grid>

        </Grid>
      )}

      {/* ── Charts row 1 ────────────────────────────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>

        {/* ADMIN only: Pie — student status */}
        {can.viewStudents && (
          <Grid item xs={12} md={4}>
            <ChartCard title="Student Status" subtitle="Active vs inactive enrolment">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name"
                    outerRadius={88} innerRadius={54} paddingAngle={4} strokeWidth={0}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={[C.accent, C.blue][i]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={7}
                    formatter={v => <span style={{ color: C.textSecondary, fontSize: "0.75rem", fontFamily: FONT }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </Grid>
        )}

        {/* ADMIN + TEACHER: Bar — students per class */}
        {can.viewMyClasses && (
          <Grid item xs={12} md={can.viewStudents ? 8 : 12}>
            {/* md={8} when pie is visible (admin), md={12} when pie is hidden (teacher) */}
            <ChartCard title="Students Per Class" subtitle="Enrolment breakdown by grade">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={classData} barSize={26}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="class" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="students" fill={C.accent} radius={[5, 5, 0, 0]}
                    background={{ fill: "rgba(255,255,255,0.02)", radius: 5 }} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </Grid>
        )}

      </Grid>

      {/* ── Charts row 2 — financials ────────────────────────────── */}
      {/* Only admin and accountant see financial charts */}
      {can.viewFees && (
        <Grid container spacing={2.5}>

          {/* Stacked bar — revenue / salary / expense / net */}
          <Grid item xs={12} lg={8}>
            <ChartCard
              title="Monthly Financial Overview"
              subtitle={`${fin.year} — Revenue, salaries, expenses and net profit`}
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={financialData} barSize={14} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="month" tick={axisStyle} axisLine={false} tickLine={false}
                    tickFormatter={v => MONTHS_SHORT[v - 1]} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Legend iconType="circle" iconSize={7}
                    formatter={v => <span style={{ color: C.textSecondary, fontSize: "0.75rem", fontFamily: FONT }}>{v}</span>} />
                  <Bar dataKey="Revenue" fill={C.green}  radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expense" fill={C.red}    radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Salary"  fill={C.purple} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Net"     fill={C.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </Grid>

          {/* Financial summary card */}
          <Grid item xs={12} lg={4}>
            <ChartCard title="Year Summary" subtitle={`Full ${fin.year} financial breakdown`}>
              <Box sx={{ pt: 1 }}>
                <FinSummaryRow label="Fee Revenue"          value={fin.revenue.yearTotal}          color={C.green}  />
                <FinSummaryRow label="Operational Expenses" value={fin.expenses.yearTotal}         color={C.red}    />
                <FinSummaryRow label="Salaries Paid"        value={fin.expenses.salaryYearTotal}   color={C.purple} />
                <FinSummaryRow label="Total Outflow"        value={fin.expenses.combinedYearTotal} color={C.red}    />
                <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${C.border}` }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography sx={{ fontFamily: FONT, fontSize: "0.9rem", fontWeight: 700, color: C.textPrimary }}>
                      Net Profit
                    </Typography>
                    <Typography sx={{ fontFamily: "'DM Mono', monospace", fontSize: "1.05rem", fontWeight: 700, color: netColor }}>
                      {fmt(fin.net.yearTotal)}
                    </Typography>
                  </Box>
                  {(fin.expenses.pendingSalaryTotal ?? 0) > 0 && (
                    <Box sx={{ mt: 1.5, p: 1.25, borderRadius: "8px", backgroundColor: C.accentDim, border: `1px solid ${C.accent}20` }}>
                      <Typography sx={{ fontFamily: FONT, fontSize: "0.72rem", color: C.accent, fontWeight: 600 }}>
                        ⚠ Pending payroll: {fmt(fin.expenses.pendingSalaryTotal)} not yet disbursed
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            </ChartCard>
          </Grid>

        </Grid>
      )}

    </Box>
  );
}