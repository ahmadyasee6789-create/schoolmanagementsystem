"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, CheckCircle2, CircleDollarSign, Clock3, History, Pencil, Plus, ReceiptText, RefreshCw, Settings2, UsersRound } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { EmptyState, LoadingState, Modal, PageHeader, StatGrid, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/exams/ExamUi";
import { Badge, DataTable, InitialsAvatar, LabeledField, Money, SectionLabel, panelClass, tableCellClass, tableHeadClass } from "@/components/finance/FinanceUi";

type Teacher = { id: number; full_name: string; email: string; role: string };
type TeacherSalary = { id: number; employee_id: number; base_salary: number; pay_frequency: string; effective_from: string; effective_to?: string | null };
type SalaryPayment = { id: number; employee_id: number; month: number; year: number; gross_amount: number; deductions: number; bonus: number; net_amount: number; payment_method?: string; paid_date?: string; status: "pending" | "paid" };
type Tab = "pending" | "structures" | "history";

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const payFrequencies = ["monthly", "bi-weekly", "weekly"];
const paymentMethods = ["bank_transfer", "cash", "cheque", "online"];
const errorDetail = (error: unknown, fallback: string) => (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;
const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const titleCase = (value: string) => value.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function PaymentStatus({ status }: { status: SalaryPayment["status"] }) {
  return status === "paid" ? <Badge tone="green"><CheckCircle2 size={13} />Paid</Badge> : <Badge tone="purple"><Clock3 size={13} />Pending</Badge>;
}

function Person({ name, email }: { name: string; email?: string }) {
  return <span className="flex items-center gap-2"><InitialsAvatar name={name} /><span><span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</span>{email && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{email}</span>}</span></span>;
}

function PaymentCard({ payment, name, onPay, showPeriod = true }: { payment: SalaryPayment; name: string; onPay?: () => void; showPeriod?: boolean }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="flex items-start justify-between gap-3"><Person name={name} /><PaymentStatus status={payment.status} /></div>{showPeriod && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{months[payment.month - 1]} {payment.year}</p>}<div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 dark:border-white/5"><div><p className="text-[11px] text-slate-400 dark:text-slate-500">Gross</p><Money value={payment.gross_amount} className="mt-1 block" /></div><div><p className="text-[11px] text-slate-400 dark:text-slate-500">Net</p><Money value={payment.net_amount} className="mt-1 block text-[#8B6DF2]" /></div><div><p className="text-[11px] text-slate-400 dark:text-slate-500">Deductions</p><Money value={payment.deductions} className="mt-1 block text-red-600 dark:text-red-400" /></div><div><p className="text-[11px] text-slate-400 dark:text-slate-500">Bonus</p><Money value={payment.bonus} className="mt-1 block text-emerald-600 dark:text-emerald-400" /></div></div>{onPay && <button type="button" onClick={onPay} className={`${secondaryButtonClass} mt-4 w-full border-emerald-400/30 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10`}>Mark as Paid</button>}</article>;
}

function StructureCard({ structure, name, onEdit }: { structure: TeacherSalary; name: string; onEdit: () => void }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="flex items-start justify-between gap-3"><Person name={name} /><button type="button" title="Edit salary structure" onClick={onEdit} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-500"><Pencil size={16} /></button></div><div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/5"><Money value={structure.base_salary} className="text-lg text-[#8B6DF2]" /><div className="mt-2 flex items-center justify-between gap-2"><Badge tone="blue">{titleCase(structure.pay_frequency)}</Badge><span className="text-xs text-slate-500 dark:text-slate-400">From {formatDate(structure.effective_from)}</span></div></div></article>;
}

export default function PayrollPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [salaries, setSalaries] = useState<TeacherSalary[]>([]);
  const [pending, setPending] = useState<SalaryPayment[]>([]);
  const [allPayments, setAllPayments] = useState<SalaryPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [generating, setGenerating] = useState(false);
  const [histMonth, setHistMonth] = useState(new Date().getMonth() + 1);
  const [histYear, setHistYear] = useState(new Date().getFullYear());
  const [histLoading, setHistLoading] = useState(false);
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [editingSalary, setEditingSalary] = useState<TeacherSalary | null>(null);
  const [salaryForm, setSalaryForm] = useState({ employee_id: "", base_salary: "", pay_frequency: "monthly", effective_from: "", effective_to: "" });
  const [savingSalary, setSavingSalary] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<SalaryPayment | null>(null);
  const [payForm, setPayForm] = useState({ deductions: "0", bonus: "0", payment_method: "bank_transfer" });
  const [paying, setPaying] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [teamResponse, pendingResponse, salaryResponse] = await Promise.all([api.get("/employees"), api.get("/payroll/pending"), api.get("/payroll/staff-salaries")]);
      setTeachers((teamResponse.data as Teacher[]).filter((member) => member.role !== "admin"));
      setPending(pendingResponse.data ?? []);
      setSalaries(salaryResponse.data ?? []);
    } catch { toast.error("Failed to load payroll data"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const fetchHistory = async () => {
    setHistLoading(true);
    try {
      const response = await api.get("/payroll/salaries", { params: { month: histMonth, year: histYear } });
      setAllPayments(response.data ?? []);
    } catch (error: unknown) { toast.error(errorDetail(error, "Failed to load salary history")); }
    finally { setHistLoading(false); }
  };
  const generatePayroll = async () => {
    setGenerating(true);
    try {
      const response = await api.post("/payroll/generate-all", null, { params: { month: genMonth, year: genYear } });
      toast.success(response.data.message || `Generated ${response.data.count} records`);
      await fetchAll();
    } catch (error: unknown) { toast.error(errorDetail(error, "Failed to generate payroll")); }
    finally { setGenerating(false); }
  };
  const saveSalary = async () => {
    if (!salaryForm.employee_id || !salaryForm.base_salary || !salaryForm.effective_from) return toast.error("Staff member, base salary, and effective date are required");
    setSavingSalary(true);
    const payload = { employee_id: Number(salaryForm.employee_id), base_salary: Number(salaryForm.base_salary), pay_frequency: salaryForm.pay_frequency, effective_from: salaryForm.effective_from, effective_to: salaryForm.effective_to || null };
    try {
      if (editingSalary) { await api.put(`/payroll/staff-salary${editingSalary.id}`, payload); toast.success("Salary structure updated"); }
      else { await api.post("/payroll/staff-salary", payload); toast.success("Salary structure created"); }
      setSalaryOpen(false); setEditingSalary(null); setSalaryForm({ employee_id: "", base_salary: "", pay_frequency: "monthly", effective_from: "", effective_to: "" });
      await fetchAll();
    } catch (error: unknown) { toast.error(errorDetail(error, "Failed to save salary structure")); }
    finally { setSavingSalary(false); }
  };
  const handlePay = async () => {
    if (!payTarget) return;
    setPaying(true);
    try {
      await api.post(`/payroll/pay/${payTarget.id}`, { deductions: Number(payForm.deductions) || 0, bonus: Number(payForm.bonus) || 0, payment_method: payForm.payment_method });
      toast.success("Salary marked as paid");
      setPayOpen(false); setPayTarget(null);
      await fetchAll();
    } catch (error: unknown) { toast.error(errorDetail(error, "Failed to process payment")); }
    finally { setPaying(false); }
  };

  const nameFor = (employeeId: number) => teachers.find((teacher) => teacher.id === employeeId)?.full_name ?? `Teacher #${employeeId}`;
  const pendingTotal = pending.reduce((sum, payment) => sum + payment.net_amount, 0);
  const openNewSalary = () => { setEditingSalary(null); setSalaryForm({ employee_id: "", base_salary: "", pay_frequency: "monthly", effective_from: "", effective_to: "" }); setSalaryOpen(true); };
  const openEditSalary = (salary: TeacherSalary) => { setEditingSalary(salary); setSalaryForm({ employee_id: String(salary.employee_id), base_salary: String(salary.base_salary), pay_frequency: salary.pay_frequency, effective_from: salary.effective_from, effective_to: salary.effective_to ?? "" }); setSalaryOpen(true); };
  const openPay = (payment: SalaryPayment) => { setPayTarget(payment); setPayForm({ deductions: "0", bonus: "0", payment_method: "bank_transfer" }); setPayOpen(true); };

  return <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
    <PageHeader title="Payroll" subtitle="Manage staff salary structures and monthly payments" />
    {!loading && <StatGrid stats={[{ label: "Staff", value: teachers.length, Icon: UsersRound, tone: "border-[#8B6DF2]/20 bg-[#8B6DF2]/10 text-[#8B6DF2]" }, { label: "Salary Structures", value: salaries.length, Icon: Settings2, tone: "border-blue-400/20 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400" }, { label: "Pending Payments", value: pending.length, Icon: Clock3, tone: "border-amber-400/20 bg-amber-50 text-amber-600 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-400" }, { label: "Amount Due", value: `PKR ${new Intl.NumberFormat("en-PK").format(pendingTotal)}`, Icon: CircleDollarSign, tone: "border-red-400/20 bg-red-50 text-red-600 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-400" }]} />}

    <section className={`${panelClass} mb-6 p-4`}><SectionLabel icon={RefreshCw}>Generate Monthly Payroll</SectionLabel><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12"><select value={genMonth} onChange={(event) => setGenMonth(Number(event.target.value))} className={`${inputClass} lg:col-span-4`} aria-label="Payroll month">{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select><input type="number" min={2020} max={2099} value={genYear} onChange={(event) => setGenYear(Number(event.target.value))} className={`${inputClass} lg:col-span-3`} aria-label="Payroll year" /><button type="button" disabled={generating} onClick={() => void generatePayroll()} className={`${primaryButtonClass} flex items-center justify-center gap-2 lg:col-span-5`}><RefreshCw size={16} className={generating ? "animate-spin" : ""} />{generating ? "Generating…" : `Generate ${months[genMonth - 1]} ${genYear}`}</button></div></section>

    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-white/10" aria-label="Payroll sections">{([{ id: "pending", label: `Pending (${pending.length})`, Icon: Clock3 }, { id: "structures", label: "Salary Structures", Icon: Settings2 }, { id: "history", label: "Pay History", Icon: History }] as const).map(({ id, label, Icon }) => <button type="button" key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${tab === id ? "border-[#8B6DF2] text-[#8B6DF2]" : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}><Icon size={16} />{label}</button>)}</nav>

    {loading ? <LoadingState /> : tab === "pending" ? <>{pending.length === 0 ? <EmptyState icon={Banknote} message="No pending payments. Generate payroll above to create records." /> : <><div className="grid gap-3 sm:hidden">{pending.map((payment) => <PaymentCard key={payment.id} payment={payment} name={nameFor(payment.employee_id)} onPay={() => openPay(payment)} />)}</div><DataTable><thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>{["Staff Member", "Period", "Gross", "Deductions", "Bonus", "Net", "Status", ""].map((heading) => <th key={heading} className={tableHeadClass}>{heading}</th>)}</tr></thead><tbody>{pending.map((payment) => <tr key={payment.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"><td className={tableCellClass}><Person name={nameFor(payment.employee_id)} /></td><td className={`${tableCellClass} text-xs text-slate-500 dark:text-slate-400`}>{months[payment.month - 1]} {payment.year}</td><td className={tableCellClass}><Money value={payment.gross_amount} /></td><td className={tableCellClass}><Money value={payment.deductions} className="text-red-600 dark:text-red-400" /></td><td className={tableCellClass}><Money value={payment.bonus} className="text-emerald-600 dark:text-emerald-400" /></td><td className={tableCellClass}><Money value={payment.net_amount} className="text-[#8B6DF2]" /></td><td className={tableCellClass}><PaymentStatus status={payment.status} /></td><td className={tableCellClass}><button type="button" onClick={() => openPay(payment)} className="rounded-lg border border-emerald-400/30 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10">Pay</button></td></tr>)}</tbody></DataTable></>}</> : tab === "structures" ? <><div className="mb-5 flex justify-end"><button type="button" onClick={openNewSalary} className={`${primaryButtonClass} inline-flex items-center gap-2`}><Plus size={16} />Add Salary Structure</button></div>{salaries.length === 0 ? <EmptyState icon={Settings2} message="No salary structures yet. Add one per staff member to enable payroll generation." actionLabel="Add Salary Structure" onAction={openNewSalary} /> : <><div className="grid gap-3 sm:hidden">{salaries.map((salary) => <StructureCard key={salary.id} structure={salary} name={nameFor(salary.employee_id)} onEdit={() => openEditSalary(salary)} />)}</div><DataTable><thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>{["Staff Member", "Base Salary", "Frequency", "Effective From", "Effective To", ""].map((heading) => <th key={heading} className={tableHeadClass}>{heading}</th>)}</tr></thead><tbody>{salaries.map((salary) => <tr key={salary.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"><td className={tableCellClass}><Person name={nameFor(salary.employee_id)} /></td><td className={tableCellClass}><Badge tone="purple"><Money value={salary.base_salary} className="text-[#8B6DF2]" /></Badge></td><td className={tableCellClass}><Badge tone="blue">{titleCase(salary.pay_frequency)}</Badge></td><td className={`${tableCellClass} text-xs text-slate-500 dark:text-slate-400`}>{formatDate(salary.effective_from)}</td><td className={`${tableCellClass} text-xs text-slate-500 dark:text-slate-400`}>{formatDate(salary.effective_to ?? undefined)}</td><td className={tableCellClass}><button type="button" title="Edit salary structure" onClick={() => openEditSalary(salary)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-500"><Pencil size={16} /></button></td></tr>)}</tbody></DataTable></>}</> : <><section className={`${panelClass} mb-6 p-4`}><SectionLabel icon={History}>Filter by Month</SectionLabel><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12"><select value={histMonth} onChange={(event) => setHistMonth(Number(event.target.value))} className={`${inputClass} lg:col-span-4`} aria-label="History month">{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select><input type="number" min={2020} max={2099} value={histYear} onChange={(event) => setHistYear(Number(event.target.value))} className={`${inputClass} lg:col-span-3`} aria-label="History year" /><button type="button" disabled={histLoading} onClick={() => void fetchHistory()} className={`${primaryButtonClass} inline-flex items-center justify-center gap-2 lg:col-span-5`}><History size={16} />{histLoading ? "Loading…" : `View ${months[histMonth - 1]} ${histYear}`}</button></div></section>{histLoading ? <LoadingState /> : allPayments.length === 0 ? <EmptyState icon={History} message={`No salary records for ${months[histMonth - 1]} ${histYear}. Select a month and click View.`} /> : <><div className="grid gap-3 sm:hidden">{allPayments.map((payment) => <PaymentCard key={payment.id} payment={payment} name={nameFor(payment.employee_id)} showPeriod={false} />)}</div><DataTable><thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>{["Staff Member", "Gross", "Deductions", "Bonus", "Net", "Method", "Paid Date", "Status"].map((heading) => <th key={heading} className={tableHeadClass}>{heading}</th>)}</tr></thead><tbody>{allPayments.map((payment) => <tr key={payment.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"><td className={tableCellClass}><Person name={nameFor(payment.employee_id)} /></td><td className={tableCellClass}><Money value={payment.gross_amount} /></td><td className={tableCellClass}><Money value={payment.deductions} className="text-red-600 dark:text-red-400" /></td><td className={tableCellClass}><Money value={payment.bonus} className="text-emerald-600 dark:text-emerald-400" /></td><td className={tableCellClass}><Money value={payment.net_amount} className="text-[#8B6DF2]" /></td><td className={`${tableCellClass} text-xs capitalize text-slate-500 dark:text-slate-400`}>{payment.payment_method ? titleCase(payment.payment_method) : "—"}</td><td className={`${tableCellClass} text-xs text-slate-500 dark:text-slate-400`}>{formatDate(payment.paid_date)}</td><td className={tableCellClass}><PaymentStatus status={payment.status} /></td></tr>)}</tbody></DataTable></>}</>}

    {salaryOpen && <Modal title={editingSalary ? "Edit Salary Structure" : "Add Salary Structure"} onClose={() => !savingSalary && setSalaryOpen(false)}><div className="space-y-5"><section><SectionLabel icon={UsersRound}>Staff & Structure</SectionLabel><div className="space-y-4"><LabeledField label="Staff Member" required><select disabled={Boolean(editingSalary)} value={salaryForm.employee_id} onChange={(event) => setSalaryForm({ ...salaryForm, employee_id: event.target.value })} className={inputClass}><option value="" disabled>Select staff member</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name} · {teacher.email}</option>)}</select></LabeledField><LabeledField label="Base Salary (PKR)" required><input type="number" min={0} value={salaryForm.base_salary} onChange={(event) => setSalaryForm({ ...salaryForm, base_salary: event.target.value })} placeholder="0" className={inputClass} /></LabeledField><LabeledField label="Pay Frequency"><select value={salaryForm.pay_frequency} onChange={(event) => setSalaryForm({ ...salaryForm, pay_frequency: event.target.value })} className={inputClass}>{payFrequencies.map((frequency) => <option key={frequency} value={frequency}>{titleCase(frequency)}</option>)}</select></LabeledField></div></section><section><SectionLabel icon={ReceiptText}>Effective Dates</SectionLabel><div className="grid gap-4 sm:grid-cols-2"><LabeledField label="Effective From" required><input type="date" value={salaryForm.effective_from} onChange={(event) => setSalaryForm({ ...salaryForm, effective_from: event.target.value })} className={inputClass} /></LabeledField><LabeledField label="Effective To"><input type="date" value={salaryForm.effective_to} onChange={(event) => setSalaryForm({ ...salaryForm, effective_to: event.target.value })} className={inputClass} /></LabeledField></div></section><div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/5"><button type="button" disabled={savingSalary} onClick={() => setSalaryOpen(false)} className={secondaryButtonClass}>Cancel</button><button type="button" disabled={savingSalary || !salaryForm.employee_id || !salaryForm.base_salary || !salaryForm.effective_from} onClick={() => void saveSalary()} className={primaryButtonClass}>{savingSalary ? "Saving…" : editingSalary ? "Save Changes" : "Add Structure"}</button></div></div></Modal>}
    {payOpen && payTarget && <Modal title="Process Salary Payment" onClose={() => !paying && setPayOpen(false)}><div className="space-y-5"><div className="flex items-center justify-between gap-3 rounded-xl border border-[#8B6DF2]/20 bg-[#8B6DF2]/10 p-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#8B6DF2]">{months[payTarget.month - 1]} {payTarget.year}</p><p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-50">{nameFor(payTarget.employee_id)}</p></div><div className="text-right"><p className="text-xs text-slate-500 dark:text-slate-400">Gross</p><Money value={payTarget.gross_amount} className="mt-1 block" /></div></div><div className="grid gap-4 sm:grid-cols-2"><LabeledField label="Deductions"><input type="number" min={0} value={payForm.deductions} onChange={(event) => setPayForm({ ...payForm, deductions: event.target.value })} className={inputClass} /></LabeledField><LabeledField label="Bonus"><input type="number" min={0} value={payForm.bonus} onChange={(event) => setPayForm({ ...payForm, bonus: event.target.value })} className={inputClass} /></LabeledField></div><LabeledField label="Payment Method"><select value={payForm.payment_method} onChange={(event) => setPayForm({ ...payForm, payment_method: event.target.value })} className={inputClass}>{paymentMethods.map((method) => <option key={method} value={method}>{titleCase(method)}</option>)}</select></LabeledField><div className="flex items-center justify-between rounded-xl border border-emerald-400/25 bg-emerald-50 p-4 dark:border-emerald-400/20 dark:bg-emerald-500/10"><span className="text-sm text-slate-600 dark:text-slate-300">Net Payable</span><Money value={payTarget.gross_amount - (Number(payForm.deductions) || 0) + (Number(payForm.bonus) || 0)} className="text-emerald-600 dark:text-emerald-400" /></div><div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/5"><button type="button" disabled={paying} onClick={() => setPayOpen(false)} className={secondaryButtonClass}>Cancel</button><button type="button" disabled={paying} onClick={() => void handlePay()} className={primaryButtonClass}>{paying ? "Processing…" : "Confirm Payment"}</button></div></div></Modal>}
  </div>;
}
