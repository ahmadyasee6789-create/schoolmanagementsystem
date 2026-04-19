"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Box, Button, Chip, Grid, IconButton, MenuItem, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
  Tooltip, useMediaQuery, useTheme, Tab, Tabs,
} from "@mui/material";
import {
  Edit, AttachMoneyOutlined, AutorenewOutlined, CheckCircleOutlined,
  HourglassEmptyOutlined, PaymentsOutlined, SettingsOutlined,
  AddOutlined, SchoolOutlined, HistoryOutlined,
  ExpandMoreOutlined, ExpandLessOutlined,
} from "@mui/icons-material";
import { api } from "@/app/lib/api";
import toast from "react-hot-toast";
import {
  C, FONT, EASE, inputSx, menuProps, thSx, tdSx,
  GlobalStyles, PageHeader, EmptyState, DataTable, StatCard,
  MobileFab, DialogShell, SectionLabel, InitialsAvatar,
  StatusChip, editIconSx,
} from "@/components/ui";

// ─── Types ──────────────────────────────────────────────────────────────────
type Teacher = { id: number;  full_name: string; email: string; role: string };
type TeacherSalary = { id: number; employee_id: number; base_salary: number; pay_frequency: string; effective_from: string; effective_to?: string | null };
type SalaryPayment = { id: number; employee_id: number; month: number; year: number; gross_amount: number; deductions: number; bonus: number; net_amount: number; payment_method?: string; paid_date?: string; status: "pending" | "paid" };

// ─── Constants ───────────────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const PAY_FREQUENCIES = ["monthly","bi-weekly","weekly"];
const PAYMENT_METHODS = ["bank_transfer","cash","cheque","online"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt     = (n: number) => new Intl.NumberFormat("en-PK", { minimumFractionDigits: 0 }).format(n ?? 0);
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// ─── Local small components ───────────────────────────────────────────────────

// Payroll-specific status chip (paid/pending) — different from FeeStatusChip
function PaymentStatusChip({ status }: { status: string }) {
  const paid = status === "paid";
  return (
    <Chip
      icon={paid
        ? <CheckCircleOutlined    sx={{ fontSize: "13px !important", color: `${C.green}  !important` }} />
        : <HourglassEmptyOutlined sx={{ fontSize: "13px !important", color: `${C.accent} !important` }} />}
      label={paid ? "Paid" : "Pending"} size="small"
      sx={{
        backgroundColor: paid ? C.greenDim : C.accentDim,
        color: paid ? C.green : C.accent,
        fontFamily: FONT, fontWeight: 600, fontSize: "0.7rem",
        height: 22, border: `1px solid ${paid ? C.green : C.accent}25`,
        "& .MuiChip-icon": { ml: "6px" },
      }}
    />
  );
}

function FreqChip({ freq }: { freq: string }) {
  return (
    <Chip label={freq} size="small" sx={{
      backgroundColor: C.blueDim, color: C.blue, fontFamily: FONT,
      fontWeight: 600, fontSize: "0.7rem", height: 20,
      border: `1px solid ${C.blue}25`, textTransform: "capitalize",
    }} />
  );
}

function MonoAmt({ value, color = C.textPrimary, size = "0.82rem" }: { value: number; color?: string; size?: string }) {
  return (
    <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: size, fontWeight: 700, color }}>
      {fmt(value)}
    </Typography>
  );
}

// ─── Mobile cards ──────────────────────────────────────────────────────────────
function PendingCard({ p, tName, onPay }: { p: SalaryPayment; tName: string; onPay: () => void }) {
  return (
    <Box sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: "12px", p: 2, mb: 1.5, transition: `border-color ${EASE}`, "&:hover": { borderColor: "rgba(245,158,11,0.3)" } }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          {/* using shared InitialsAvatar */}
          <InitialsAvatar name={tName} />
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", color: C.textPrimary, fontFamily: FONT, lineHeight: 1.2 }}>{tName}</Typography>
            <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.7rem", color: C.textSecondary }}>{MONTHS[p.month - 1]} {p.year}</Typography>
          </Box>
        </Box>
        <PaymentStatusChip status={p.status} />
      </Box>
      <Box sx={{ display: "flex", gap: 1.5, mb: 1.5, flexWrap: "wrap" }}>
        {[
          { label: "Gross",  value: p.gross_amount, color: C.textPrimary },
          { label: "Deduct", value: p.deductions,   color: C.red        },
          { label: "Bonus",  value: p.bonus,        color: C.green      },
          { label: "Net",    value: p.net_amount,   color: C.accent     },
        ].map(f => (
          <Box key={f.label}>
            <Typography sx={{ fontFamily: FONT, fontSize: "0.6rem", color: C.textSecondary, textTransform: "uppercase", letterSpacing: "0.1em" }}>{f.label}</Typography>
            <MonoAmt value={f.value} color={f.color} size="0.78rem" />
          </Box>
        ))}
      </Box>
      <Button size="small" onClick={onPay} startIcon={<PaymentsOutlined sx={{ fontSize: 13 }} />}
        sx={{ color: C.green, fontFamily: FONT, fontWeight: 600, fontSize: "0.72rem", textTransform: "none", borderRadius: "7px", px: 1.5, border: `1px solid ${C.green}30`, "&:hover": { backgroundColor: C.greenDim }, transition: `all ${EASE}` }}>
        Mark as Paid
      </Button>
    </Box>
  );
}

function SalaryStructureCard({ s, tName, onEdit }: { s: TeacherSalary; tName: string; onEdit: () => void }) {
  return (
    <Box sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: "12px", p: 2, mb: 1.5, transition: `border-color ${EASE}`, "&:hover": { borderColor: "rgba(245,158,11,0.3)" } }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <InitialsAvatar name={tName} />
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", color: C.textPrimary, fontFamily: FONT, lineHeight: 1.2 }}>{tName}</Typography>
            <FreqChip freq={s.pay_frequency} />
          </Box>
        </Box>
        {/* using shared editIconSx */}
        <IconButton size="small" onClick={onEdit} sx={editIconSx}><Edit sx={{ fontSize: 15 }} /></IconButton>
      </Box>
      <Typography sx={{ fontFamily: '"DM Mono", monospace', fontWeight: 700, fontSize: "1.1rem", color: C.accent, mt: 1 }}>PKR {fmt(s.base_salary)}</Typography>
      <Typography sx={{ fontFamily: FONT, fontSize: "0.72rem", color: C.textSecondary, mt: 0.25 }}>
        From {fmtDate(s.effective_from)}{s.effective_to ? ` → ${fmtDate(s.effective_to)}` : ""}
      </Typography>
    </Box>
  );
}

// ─── Pay history expandable row ───────────────────────────────────────────────
function HistoryTeacherRow({ teacher }: { teacher: Teacher }) {
  const [expanded, setExpanded] = useState(false);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [fetched,  setFetched]  = useState(false);

  const toggle = async () => {
    if (fetched) { setExpanded(e => !e); return; }
    setLoading(true);
    try {
      const res = await api.get(`/payroll/staff${teacher.id}`);
      setPayments(res.data); setFetched(true); setExpanded(true);
    } catch { toast.error("Failed to load history"); }
    finally  { setLoading(false); }
  };

  return (
    <>
      <TableRow onClick={toggle} sx={{ cursor: "pointer", "&:hover": { backgroundColor: "rgba(255,255,255,0.025)" }, transition: `background ${EASE}` }}>
        <TableCell sx={tdSx}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <InitialsAvatar name={teacher.full_name} />
            <Box>
              <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: "0.875rem", color: C.textPrimary }}>{teacher.full_name}</Typography>
              <Typography sx={{ fontFamily: FONT, fontSize: "0.7rem", color: C.textSecondary }}>{teacher.email}</Typography>
            </Box>
          </Box>
        </TableCell>
        <TableCell sx={tdSx}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            {loading
              ? <Box sx={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${C.accentDim}`, borderTopColor: C.accent, animation: "spin 0.7s linear infinite", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />
              : expanded ? <ExpandLessOutlined sx={{ fontSize: 16, color: C.accent }} /> : <ExpandMoreOutlined sx={{ fontSize: 16, color: C.textSecondary }} />}
            <Typography sx={{ fontFamily: FONT, fontSize: "0.78rem", color: expanded ? C.accent : C.textSecondary }}>
              {fetched ? `${payments.length} record${payments.length !== 1 ? "s" : ""}` : "View history"}
            </Typography>
          </Box>
        </TableCell>
        {[...Array(4)].map((_, i) => <TableCell key={i} sx={tdSx} />)}
      </TableRow>

      {expanded && payments.map((p, i) => (
        <TableRow key={p.id} sx={{ backgroundColor: "rgba(255,255,255,0.012)", animation: `fadeUp 0.22s ${i * 18}ms ease both`, "@keyframes fadeUp": { from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}>
          <TableCell sx={{ ...tdSx, pl: 7, fontFamily: '"DM Mono", monospace', fontSize: "0.78rem", color: C.textSecondary }}>{MONTHS[p.month - 1]} {p.year}</TableCell>
          <TableCell sx={tdSx}><MonoAmt value={p.gross_amount} /></TableCell>
          <TableCell sx={tdSx}><MonoAmt value={p.deductions} color={p.deductions > 0 ? C.red : C.textSecondary} /></TableCell>
          <TableCell sx={tdSx}><MonoAmt value={p.bonus} color={p.bonus > 0 ? C.green : C.textSecondary} /></TableCell>
          <TableCell sx={tdSx}><MonoAmt value={p.net_amount} color={C.accent} size="0.855rem" /></TableCell>
          <TableCell sx={tdSx}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <PaymentStatusChip status={p.status} />
              {p.paid_date && <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.72rem", color: C.textSecondary }}>{fmtDate(p.paid_date)}</Typography>}
            </Box>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function PayrollPage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [tab,         setTab]         = useState(0);
  const [teachers,    setTeachers]    = useState<Teacher[]>([]);
  const [salaries,    setSalaries]    = useState<TeacherSalary[]>([]);
  const [pending,     setPending]     = useState<SalaryPayment[]>([]);
  const [allPayments, setAllPayments] = useState<SalaryPayment[]>([]);
  const [loading,     setLoading]     = useState(true);

  const [genMonth,   setGenMonth]   = useState(new Date().getMonth() + 1);
  const [genYear,    setGenYear]    = useState(new Date().getFullYear());
  const [generating, setGenerating] = useState(false);

  const [histMonth,   setHistMonth]   = useState(new Date().getMonth() + 1);
  const [histYear,    setHistYear]    = useState(new Date().getFullYear());
  const [histLoading, setHistLoading] = useState(false);

  // Salary structure dialog
  const [salaryOpen,    setSalaryOpen]    = useState(false);
  const [editingSalary, setEditingSalary] = useState<TeacherSalary | null>(null);
  const [salaryForm,    setSalaryForm]    = useState({ employee_id: "", base_salary: "", pay_frequency: "monthly", effective_from: "", effective_to: "" });
  const [savingSalary,  setSavingSalary]  = useState(false);

  // Pay dialog
  const [payOpen,   setPayOpen]   = useState(false);
  const [payTarget, setPayTarget] = useState<SalaryPayment | null>(null);
  const [payForm,   setPayForm]   = useState({ deductions: "0", bonus: "0", payment_method: "bank_transfer" });
  const [paying,    setPaying]    = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [teamRes, pendingRes, salariesRes] = await Promise.all([
        api.get("/employees"),
        api.get("/payroll/pending"),
        api.get("/payroll/staff-salaries"),
      ]);
      setTeachers((teamRes.data as Teacher[]).filter(m => m.role !== "admin"));
      setPending(pendingRes.data);
      setSalaries(salariesRes.data);
    } catch { toast.error("Failed to load payroll data"); }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchHistory = async () => {
    setHistLoading(true);
    try {
      const res = await api.get("/payroll/salaries", { params: { month: histMonth, year: histYear } });
      setAllPayments(res.data);
    } catch (err: any) { toast.error(err.response?.data?.detail || "Failed to load salary history"); }
    finally { setHistLoading(false); }
  };

  const handleGenerateAll = async () => {
    setGenerating(true);
    try {
      const res = await api.post("/payroll/generate-all", null, { params: { month: genMonth, year: genYear } });
      toast.success(res.data.message || `Generated ${res.data.count} records`);
      await fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.detail || "Failed to generate payroll"); }
    finally { setGenerating(false); }
  };

  const handleSaveSalary = async () => {
    if (!salaryForm.employee_id || !salaryForm.base_salary || !salaryForm.effective_from)
      return toast.error("Teacher, base salary, and effective from date are required");
    setSavingSalary(true);
    try {
      const payload = { employee_id: Number(salaryForm.employee_id), base_salary: Number(salaryForm.base_salary), pay_frequency: salaryForm.pay_frequency, effective_from: salaryForm.effective_from, effective_to: salaryForm.effective_to || null };
      if (editingSalary) { await api.put(`/payroll/staff-salary${editingSalary.id}`, payload); toast.success("Salary structure updated"); }
      else               { await api.post("/payroll/staff-salary", payload);                    toast.success("Salary structure created"); }
      setSalaryOpen(false); setEditingSalary(null);
      setSalaryForm({ employee_id: "", base_salary: "", pay_frequency: "monthly", effective_from: "", effective_to: "" });
      await fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.detail || "Failed to save salary structure"); }
    finally { setSavingSalary(false); }
  };

  const openEditSalary = (s: TeacherSalary) => {
    setEditingSalary(s);
    setSalaryForm({ employee_id: String(s.employee_id), base_salary: String(s.base_salary), pay_frequency: s.pay_frequency, effective_from: s.effective_from, effective_to: s.effective_to ?? "" });
    setSalaryOpen(true);
  };

  const handlePay = async () => {
    if (!payTarget) return;
    setPaying(true);
    try {
      await api.post(`/payroll/pay/${payTarget.id}`, { deductions: Number(payForm.deductions) || 0, bonus: Number(payForm.bonus) || 0, payment_method: payForm.payment_method });
      toast.success("Salary marked as paid");
      setPayOpen(false); setPayTarget(null); await fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.detail || "Failed to process payment"); }
    finally { setPaying(false); }
  };

  const openPay = (p: SalaryPayment) => { setPayTarget(p); setPayForm({ deductions: "0", bonus: "0", payment_method: "bank_transfer" }); setPayOpen(true); };

  const pendingTotal = pending.reduce((s, p) => s + p.net_amount, 0);
  const tName = (employeeId: number) => teachers.find(t => t.id === employeeId)?.full_name ?? `Teacher #${employeeId}`;

  const Spinner = () => (
    <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
      <Box sx={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${C.accentDim}`, borderTopColor: C.accent, animation: "spin 0.7s linear infinite", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />
    </Box>
  );

  return (
    <>
      <GlobalStyles />
      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: "100%" }}>

        {/* Header — shared PageHeader */}
        <PageHeader title="Payroll" subtitle="Manage teacher salary structures and monthly payments" isMobile={isMobile} />

        {/* Stat cards — shared StatCard */}
        {!loading && (
          <Grid container spacing={{ xs: 1.5, md: 2 }} sx={{ mb: { xs: 2.5, md: 3 } }}>
            {[
              { label: "Staff",              value: teachers.length, color: C.accent, dim: C.accentDim, icon: SchoolOutlined,        delay: 0   },
              { label: "Salary Structures",  value: salaries.length, color: C.blue,   dim: C.blueDim,   icon: SettingsOutlined,       delay: 60  },
              { label: "Pending Payments",   value: pending.length,  color: C.accent, dim: C.accentDim, icon: HourglassEmptyOutlined, delay: 120 },
              { label: "Amount Due",         value: pendingTotal,    color: C.red,    dim: C.redDim,    icon: AttachMoneyOutlined,    delay: 180 },
            ].map((s, i) => <Grid item xs={6} md={3} key={i}><StatCard {...s} /></Grid>)}
          </Grid>
        )}

        {/* Generate payroll card */}
        <Box sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: "14px", p: { xs: 2, sm: 2.5 }, mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <AutorenewOutlined sx={{ fontSize: 14, color: C.accent }} />
            <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.7rem", fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase", color: C.textSecondary }}>
              Generate Monthly Payroll
            </Typography>
          </Box>
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} sm={4}>
              <TextField select fullWidth size="small" label="Month" sx={inputSx} value={genMonth} onChange={e => setGenMonth(Number(e.target.value))} SelectProps={{ MenuProps: menuProps }}>
                {MONTHS.map((m, i) => <MenuItem key={i} value={i + 1}><Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>{m}</Typography></MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField fullWidth size="small" label="Year" type="number" sx={inputSx} value={genYear} inputProps={{ min: 2020, max: 2099 }} onChange={e => setGenYear(Number(e.target.value))} />
            </Grid>
            <Grid item xs={12} sm={5}>
              <Button fullWidth variant="contained" onClick={handleGenerateAll} disabled={generating}
                startIcon={<AutorenewOutlined sx={{ fontSize: 16, animation: generating ? "spin 1s linear infinite" : "none", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />}
                sx={{ backgroundColor: C.accent, color: "#111827", fontFamily: FONT, fontWeight: 600, textTransform: "none", borderRadius: "10px", height: 40, "&:hover": { backgroundColor: "#FBBF24" }, "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" } }}>
                {generating ? "Generating…" : `Generate ${MONTHS[genMonth - 1]} ${genYear}`}
              </Button>
            </Grid>
          </Grid>
        </Box>

        {/* Tabs */}
        <Box sx={{ borderBottom: `1px solid ${C.border}`, mb: 2.5 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ "& .MuiTab-root": { fontFamily: FONT, textTransform: "none", fontSize: "0.85rem", color: C.textSecondary, minHeight: 44 }, "& .Mui-selected": { color: `${C.accent} !important`, fontWeight: 700 }, "& .MuiTabs-indicator": { backgroundColor: C.accent } }}>
            <Tab icon={<HourglassEmptyOutlined sx={{ fontSize: 16 }} />} iconPosition="start" label={`Pending (${pending.length})`} />
            <Tab icon={<SettingsOutlined      sx={{ fontSize: 16 }} />} iconPosition="start" label="Salary Structures" />
            <Tab icon={<HistoryOutlined       sx={{ fontSize: 16 }} />} iconPosition="start" label="Pay History" />
          </Tabs>
        </Box>

        {loading && <Spinner />}

        {/* ── TAB 0: PENDING ── */}
        {!loading && tab === 0 && (
          pending.length === 0
            ? <EmptyState icon={PaymentsOutlined} message="No pending payments. Generate payroll above to create records." />
            : isMobile
              ? <Box>{pending.map(p => <PendingCard key={p.id} p={p} tName={tName(p.employee_id)} onPay={() => openPay(p)} />)}</Box>
              : (
                <DataTable>
                  <Table>
                    <TableHead><TableRow>{["Teacher","Period","Gross","Deductions","Bonus","Net","Status",""].map(h => <TableCell key={h} sx={thSx}>{h}</TableCell>)}</TableRow></TableHead>
                    <TableBody>
                      {pending.map((p, i) => (
                        <TableRow key={p.id} sx={{ "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" }, transition: `background ${EASE}`, animation: `fadeUp 0.3s ${i * 25}ms ease both`, "@keyframes fadeUp": { from: { opacity: 0, transform: "translateY(6px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}>
                          <TableCell sx={tdSx}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                              <InitialsAvatar name={tName(p.employee_id)} />
                              <Typography sx={{ fontFamily: FONT, fontWeight: 600, fontSize: "0.875rem", color: C.textPrimary }}>{tName(p.employee_id)}</Typography>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ ...tdSx, fontFamily: '"DM Mono", monospace', fontSize: "0.8rem", color: C.textSecondary }}>{MONTHS[p.month - 1]} {p.year}</TableCell>
                          <TableCell sx={tdSx}><MonoAmt value={p.gross_amount} /></TableCell>
                          <TableCell sx={tdSx}><MonoAmt value={p.deductions} color={p.deductions > 0 ? C.red : C.textSecondary} /></TableCell>
                          <TableCell sx={tdSx}><MonoAmt value={p.bonus} color={p.bonus > 0 ? C.green : C.textSecondary} /></TableCell>
                          <TableCell sx={tdSx}><MonoAmt value={p.net_amount} color={C.accent} size="0.875rem" /></TableCell>
                          <TableCell sx={tdSx}><PaymentStatusChip status={p.status} /></TableCell>
                          <TableCell sx={tdSx}>
                            <Tooltip title="Process Payment" arrow>
                              <Button size="small" onClick={() => openPay(p)} startIcon={<PaymentsOutlined sx={{ fontSize: 13 }} />}
                                sx={{ color: C.green, fontFamily: FONT, fontWeight: 600, fontSize: "0.72rem", textTransform: "none", borderRadius: "8px", px: 1.5, border: `1px solid ${C.green}30`, "&:hover": { backgroundColor: C.greenDim }, transition: `all ${EASE}` }}>
                                Pay
                              </Button>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </DataTable>
              )
        )}

        {/* ── TAB 1: SALARY STRUCTURES ── */}
        {!loading && tab === 1 && (
          <>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
              <Button variant="contained" startIcon={<AddOutlined sx={{ fontSize: 16 }} />}
                onClick={() => { setEditingSalary(null); setSalaryForm({ employee_id: "", base_salary: "", pay_frequency: "monthly", effective_from: "", effective_to: "" }); setSalaryOpen(true); }}
                sx={{ backgroundColor: C.accent, color: "#111827", fontFamily: FONT, fontWeight: 600, textTransform: "none", borderRadius: "10px", px: 2.5, "&:hover": { backgroundColor: "#FBBF24" } }}>
                Add Salary Structure
              </Button>
            </Box>

            {salaries.length === 0
              ? <EmptyState icon={SettingsOutlined} message="No salary structures yet. Add one per teacher to enable payroll generation." actionLabel="Add Salary Structure" onAction={() => setSalaryOpen(true)} />
              : isMobile
                ? <Box>{salaries.map(s => <SalaryStructureCard key={s.id} s={s} tName={tName(s.employee_id)} onEdit={() => openEditSalary(s)} />)}</Box>
                : (
                  <DataTable>
                    <Table>
                      <TableHead><TableRow>{["Teacher","Base Salary","Frequency","Effective From","Effective To",""].map(h => <TableCell key={h} sx={thSx}>{h}</TableCell>)}</TableRow></TableHead>
                      <TableBody>
                        {salaries.map((s, i) => (
                          <TableRow key={s.id} sx={{ "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" }, transition: `background ${EASE}`, animation: `fadeUp 0.3s ${i * 30}ms ease both`, "@keyframes fadeUp": { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}>
                            <TableCell sx={tdSx}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                <InitialsAvatar name={tName(s.employee_id)} />
                                <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: "0.875rem", color: C.textPrimary }}>{tName(s.employee_id)}</Typography>
                              </Box>
                            </TableCell>
                            <TableCell sx={tdSx}>
                              <Chip label={`PKR ${fmt(s.base_salary)}`} size="small" sx={{ backgroundColor: C.accentDim, color: C.accent, fontFamily: '"DM Mono", monospace', fontWeight: 700, fontSize: "0.72rem", height: 22, border: `1px solid rgba(245,158,11,0.25)` }} />
                            </TableCell>
                            <TableCell sx={tdSx}><FreqChip freq={s.pay_frequency} /></TableCell>
                            <TableCell sx={{ ...tdSx, fontFamily: '"DM Mono", monospace', fontSize: "0.78rem", color: C.textSecondary }}>{fmtDate(s.effective_from)}</TableCell>
                            <TableCell sx={{ ...tdSx, fontFamily: '"DM Mono", monospace', fontSize: "0.78rem", color: C.textSecondary }}>{s.effective_to ? fmtDate(s.effective_to) : "—"}</TableCell>
                            <TableCell sx={tdSx}>
                              <Tooltip title="Edit" arrow>
                                <IconButton size="small" onClick={() => openEditSalary(s)} sx={editIconSx}><Edit sx={{ fontSize: 15 }} /></IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </DataTable>
                )
            }
            {isMobile && <MobileFab onClick={() => setSalaryOpen(true)} />}
          </>
        )}

        {/* ── TAB 2: PAY HISTORY ── */}
        {!loading && tab === 2 && (
          <>
            <Box sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: "14px", p: { xs: 2, sm: 2.5 }, mb: 2.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <HistoryOutlined sx={{ fontSize: 14, color: C.accent }} />
                <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.7rem", fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase", color: C.textSecondary }}>Filter by Month</Typography>
              </Box>
              <Grid container spacing={1.5} alignItems="center">
                <Grid item xs={12} sm={4}>
                  <TextField select fullWidth size="small" label="Month" sx={inputSx} value={histMonth} onChange={e => setHistMonth(Number(e.target.value))} SelectProps={{ MenuProps: menuProps }}>
                    {MONTHS.map((m, i) => <MenuItem key={i} value={i + 1}><Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>{m}</Typography></MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField fullWidth size="small" label="Year" type="number" sx={inputSx} value={histYear} inputProps={{ min: 2020, max: 2099 }} onChange={e => setHistYear(Number(e.target.value))} />
                </Grid>
                <Grid item xs={12} sm={5}>
                  <Button fullWidth variant="contained" onClick={fetchHistory} disabled={histLoading} startIcon={<HistoryOutlined sx={{ fontSize: 15 }} />}
                    sx={{ backgroundColor: C.accent, color: "#111827", fontFamily: FONT, fontWeight: 600, textTransform: "none", borderRadius: "10px", height: 40, "&:hover": { backgroundColor: "#FBBF24" }, "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" } }}>
                    {histLoading ? "Loading…" : `View ${MONTHS[histMonth - 1]} ${histYear}`}
                  </Button>
                </Grid>
              </Grid>
            </Box>

            {histLoading
              ? <Spinner />
              : allPayments.length === 0
                ? <EmptyState icon={HistoryOutlined} message={`No salary records for ${MONTHS[histMonth - 1]} ${histYear}. Select a month and click View.`} />
                : isMobile
                  ? <Box>{allPayments.map(p => <PendingCard key={p.id} p={p} tName={tName(p.employee_id)} onPay={() => {}} />)}</Box>
                  : (
                    <DataTable>
                      <Table>
                        <TableHead><TableRow>{["Teacher","Gross","Deductions","Bonus","Net","Method","Paid Date","Status"].map(h => <TableCell key={h} sx={thSx}>{h}</TableCell>)}</TableRow></TableHead>
                        <TableBody>
                          {allPayments.map((p, i) => (
                            <TableRow key={p.id} sx={{ "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" }, transition: `background ${EASE}`, animation: `fadeUp 0.3s ${i * 25}ms ease both`, "@keyframes fadeUp": { from: { opacity: 0, transform: "translateY(6px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}>
                              <TableCell sx={tdSx}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                  <InitialsAvatar name={tName(p.employee_id)} />
                                  <Typography sx={{ fontFamily: FONT, fontWeight: 600, fontSize: "0.875rem", color: C.textPrimary }}>{tName(p.employee_id)}</Typography>
                                </Box>
                              </TableCell>
                              <TableCell sx={tdSx}><MonoAmt value={p.gross_amount} /></TableCell>
                              <TableCell sx={tdSx}><MonoAmt value={p.deductions} color={p.deductions > 0 ? C.red : C.textSecondary} /></TableCell>
                              <TableCell sx={tdSx}><MonoAmt value={p.bonus} color={p.bonus > 0 ? C.green : C.textSecondary} /></TableCell>
                              <TableCell sx={tdSx}><MonoAmt value={p.net_amount} color={C.accent} size="0.875rem" /></TableCell>
                              <TableCell sx={{ ...tdSx, fontFamily: FONT, fontSize: "0.78rem", color: C.textSecondary, textTransform: "capitalize" }}>{p.payment_method?.replace("_", " ") ?? "—"}</TableCell>
                              <TableCell sx={{ ...tdSx, fontFamily: '"DM Mono", monospace', fontSize: "0.75rem", color: C.textSecondary }}>{fmtDate(p.paid_date)}</TableCell>
                              <TableCell sx={tdSx}><PaymentStatusChip status={p.status} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </DataTable>
                  )
            }
          </>
        )}

        {/* Salary Structure Dialog — using shared DialogShell */}
        <DialogShell
          open={salaryOpen} onClose={() => setSalaryOpen(false)}
          title={editingSalary ? "Edit Salary Structure" : "Add Salary Structure"}
          maxWidth="xs" isMobile={isMobile} saving={savingSalary}
          saveLabel={editingSalary ? "Save Changes" : "Add Structure"}
          onSave={handleSaveSalary}
          saveDisabled={!salaryForm.employee_id || !salaryForm.base_salary || !salaryForm.effective_from}
        >
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <SectionLabel label="Staff & Structure" />
            <Grid item xs={12}>
              <TextField select fullWidth required label="Staff" sx={inputSx} value={salaryForm.employee_id} onChange={e => setSalaryForm({ ...salaryForm, employee_id: e.target.value })} SelectProps={{ MenuProps: menuProps }} disabled={!!editingSalary}>
                <MenuItem value="" disabled>Select Staff</MenuItem>
                {teachers.map(t => (
                  <MenuItem key={t.id} value={t.id}>
                    <Box><Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>{t.full_name}</Typography><Typography sx={{ fontFamily: FONT, fontSize: "0.7rem", color: C.textSecondary }}>{t.email}</Typography></Box>
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth required label="Base Salary (PKR)" type="number" sx={inputSx} placeholder="0" value={salaryForm.base_salary} onChange={e => setSalaryForm({ ...salaryForm, base_salary: e.target.value })} InputProps={{ startAdornment: <AttachMoneyOutlined sx={{ fontSize: 16, color: C.textSecondary, mr: 0.5 }} /> }} />
            </Grid>
            <Grid item xs={12}>
              <TextField select fullWidth label="Pay Frequency" sx={inputSx} value={salaryForm.pay_frequency} onChange={e => setSalaryForm({ ...salaryForm, pay_frequency: e.target.value })} SelectProps={{ MenuProps: menuProps }}>
                {PAY_FREQUENCIES.map(f => <MenuItem key={f} value={f}><Typography sx={{ fontFamily: FONT, fontSize: "0.875rem", textTransform: "capitalize" }}>{f}</Typography></MenuItem>)}
              </TextField>
            </Grid>
            <SectionLabel label="Effective Dates" />
            <Grid item xs={6}>
              <TextField fullWidth required type="date" label="Effective From" sx={inputSx} value={salaryForm.effective_from} InputLabelProps={{ shrink: true }} onChange={e => setSalaryForm({ ...salaryForm, effective_from: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth type="date" label="Effective To" sx={inputSx} value={salaryForm.effective_to} InputLabelProps={{ shrink: true }} onChange={e => setSalaryForm({ ...salaryForm, effective_to: e.target.value })} />
            </Grid>
          </Grid>
        </DialogShell>

        {/* Pay Salary Dialog — using shared DialogShell */}
        <DialogShell
          open={payOpen} onClose={() => setPayOpen(false)}
          title="Process Salary Payment"
          maxWidth="xs" isMobile={isMobile} saving={paying}
          saveLabel="Confirm Payment" onSave={handlePay}
        >
          {/* Teacher info pill */}
          <Box sx={{ p: 1.75, borderRadius: "10px", backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.18)`, display: "flex", alignItems: "center", gap: 1.5, mb: 2.5 }}>
            <InitialsAvatar name={tName(payTarget?.employee_id ?? 0)} />
            <Box>
              <Typography sx={{ fontSize: "0.68rem", color: C.accent, fontFamily: FONT, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {payTarget ? `${MONTHS[payTarget.month - 1]} ${payTarget.year}` : ""}
              </Typography>
              <Typography sx={{ fontSize: "0.95rem", color: C.textPrimary, fontFamily: FONT, fontWeight: 700 }}>{tName(payTarget?.employee_id ?? 0)}</Typography>
            </Box>
            <Box sx={{ ml: "auto", textAlign: "right" }}>
              <Typography sx={{ fontSize: "0.65rem", color: C.textSecondary, fontFamily: FONT, textTransform: "uppercase", letterSpacing: "0.08em" }}>Gross</Typography>
              <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.95rem", fontWeight: 700, color: C.textPrimary }}>PKR {fmt(payTarget?.gross_amount ?? 0)}</Typography>
            </Box>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField fullWidth label="Deductions" type="number" sx={inputSx} placeholder="0" value={payForm.deductions} onChange={e => setPayForm({ ...payForm, deductions: e.target.value })} InputProps={{ startAdornment: <AttachMoneyOutlined sx={{ fontSize: 15, color: C.red, mr: 0.5 }} /> }} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Bonus" type="number" sx={inputSx} placeholder="0" value={payForm.bonus} onChange={e => setPayForm({ ...payForm, bonus: e.target.value })} InputProps={{ startAdornment: <AttachMoneyOutlined sx={{ fontSize: 15, color: C.green, mr: 0.5 }} /> }} />
            </Grid>
            <Grid item xs={12}>
              <TextField select fullWidth label="Payment Method" sx={inputSx} value={payForm.payment_method} onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })} SelectProps={{ MenuProps: menuProps }}>
                {PAYMENT_METHODS.map(m => <MenuItem key={m} value={m}><Typography sx={{ fontFamily: FONT, fontSize: "0.875rem", textTransform: "capitalize" }}>{m.replace("_", " ")}</Typography></MenuItem>)}
              </TextField>
            </Grid>
            {/* Net preview */}
            <Grid item xs={12}>
              <Box sx={{ p: 1.5, borderRadius: "10px", backgroundColor: C.greenDim, border: `1px solid ${C.green}25`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography sx={{ fontFamily: FONT, fontSize: "0.82rem", color: C.textSecondary }}>Net Payable</Typography>
                <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "1.05rem", fontWeight: 700, color: C.green }}>
                  PKR {fmt((payTarget?.gross_amount ?? 0) - (Number(payForm.deductions) || 0) + (Number(payForm.bonus) || 0))}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </DialogShell>

      </Box>
    </>
  );
}