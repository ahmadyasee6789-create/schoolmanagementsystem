"use client";

import { useEffect, useState } from "react";
import { DollarSign, ReceiptText, Search, Tags, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { usePaginatedQuery } from "@/app/hooks/usePaginatedQuery";
import { api } from "@/app/lib/api";
import { EmptyState, LoadingState, Modal, PageHeader, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/exams/ExamUi";
import { Badge, DataTable, errorMessage, LabeledField, Money, Pagination, SectionLabel, tableCellClass, tableHeadClass } from "@/components/finance/FinanceUi";

type Expense = { id: number; category_id: number; category: { id: number; name: string }; description: string; amount: number; created_at: string };
type ExpenseCategory = { id: number; name: string };

const formatDate = (value: string) => new Date(value).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
const toneForCategory = (id: number): "purple" | "blue" | "green" | "red" | "slate" => ["purple", "blue", "green", "red", "slate"][id % 5] as "purple" | "blue" | "green" | "red" | "slate";

function ExpenseCard({ expense }: { expense: Expense }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10"><ReceiptText size={18} className="text-[#8B6DF2]" /></span><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">{expense.description || "No description"}</p><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{formatDate(expense.created_at)}</p></div></div><Money value={expense.amount} /></div><div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/5"><Badge tone={toneForCategory(expense.category_id)}>{expense.category?.name ?? "Uncategorised"}</Badge></div></article>;
}

export default function ExpensesPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [form, setForm] = useState({ category_id: "", description: "", amount: "" });
  const [saving, setSaving] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null);
  const [deletingCategory, setDeletingCategory] = useState(false);

  const { data: expenses, loading, page, totalPages, setPage, refetch } = usePaginatedQuery({
    fetcher: async ({ page: currentPage, limit, search: query, category }) => {
      const response = await api.get("/expenses", { params: { page: currentPage, limit, search: query, category } });
      return { data: response.data.data, totalPages: response.data.totalPages };
    },
    filters: { search, category: categoryFilter ? Number(categoryFilter) : undefined },
    debounceKeys: ["search"],
  });
  const expenseItems = expenses as Expense[];

  const fetchCategories = async () => {
    try {
      const response = await api.get("/expenses/categories");
      setCategories(response.data ?? []);
    } catch { toast.error("Failed to load expense categories"); }
  };
  useEffect(() => { void fetchCategories(); }, []);

  const addExpense = async () => {
    if (!form.category_id || !form.amount) return toast.error("Category and amount are required");
    setSaving(true);
    try {
      await api.post("/expenses", { category_id: Number(form.category_id), description: form.description, amount: Number(form.amount) });
      toast.success("Expense added");
      setExpenseOpen(false);
      setForm({ category_id: "", description: "", amount: "" });
      refetch();
    } catch (error: unknown) { toast.error(errorMessage(error, "Failed to add expense")); }
    finally { setSaving(false); }
  };
  const addCategory = async () => {
    if (!newCategory.trim()) return;
    setAddingCategory(true);
    try {
      await api.post("/expenses/categories", { name: newCategory.trim() });
      toast.success("Category added");
      setNewCategory("");
      await fetchCategories();
    } catch (error: unknown) { toast.error(errorMessage(error, "Failed to add category")); }
    finally { setAddingCategory(false); }
  };
  const deleteCategory = async () => {
    if (!deleteCategoryId) return;
    setDeletingCategory(true);
    try {
      await api.delete(`/expenses/categories/${deleteCategoryId}`);
      toast.success("Category deleted");
      setDeleteCategoryId(null);
      await fetchCategories();
    } catch (error: unknown) { toast.error(errorMessage(error, "Failed to delete category")); }
    finally { setDeletingCategory(false); }
  };

  const pageTotal = expenseItems.reduce((sum, expense) => sum + expense.amount, 0);
  return <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
    <PageHeader title="Expenses" subtitle="Track and manage school expenditures by category" actionLabel="Add Expense" onAction={() => setExpenseOpen(true)} />
    <div className="mb-6 flex flex-wrap items-center gap-3"><button type="button" onClick={() => setCategoryOpen(true)} className={`${secondaryButtonClass} inline-flex items-center gap-2`}><Tags size={16} />Manage Categories</button>{expenseItems.length > 0 && <span className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10 px-3 py-2 text-xs font-semibold text-[#8B6DF2]"><DollarSign size={15} />{new Intl.NumberFormat("en-PK").format(pageTotal)} <span className="font-medium text-slate-500 dark:text-slate-400">this page</span></span>}</div>
    <div className="mb-6 grid gap-3 lg:grid-cols-12"><div className="relative lg:col-span-7"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by description…" className={`${inputClass} pl-9`} /></div><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={`${inputClass} lg:col-span-5`} aria-label="Filter by category"><option value="">All Categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>

    {loading ? <LoadingState /> : expenseItems.length === 0 ? <EmptyState icon={ReceiptText} message="No expenses found" actionLabel="Add Expense" onAction={() => setExpenseOpen(true)} /> : <><div className="grid gap-3 sm:hidden">{expenseItems.map((expense) => <ExpenseCard key={expense.id} expense={expense} />)}</div><DataTable><thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>{["#", "Category", "Description", "Amount", "Date"].map((heading) => <th key={heading} className={tableHeadClass}>{heading}</th>)}</tr></thead><tbody>{expenseItems.map((expense) => <tr key={expense.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"><td className={`${tableCellClass} font-mono text-xs text-slate-400 dark:text-slate-500`}>{String(expense.id).padStart(3, "0")}</td><td className={tableCellClass}><Badge tone={toneForCategory(expense.category_id)}>{expense.category?.name ?? "Uncategorised"}</Badge></td><td className={`${tableCellClass} font-medium text-slate-800 dark:text-slate-100`}>{expense.description || <span className="italic text-slate-400">No description</span>}</td><td className={tableCellClass}><Money value={expense.amount} /></td><td className={`${tableCellClass} text-xs text-slate-500 dark:text-slate-400`}>{formatDate(expense.created_at)}</td></tr>)}</tbody></DataTable><Pagination page={page} totalPages={totalPages} onChange={setPage} /></>}

    {expenseOpen && <Modal title="Add Expense" onClose={() => !saving && setExpenseOpen(false)}><div className="space-y-5"><section><SectionLabel icon={Tags}>Expense Details</SectionLabel><div className="space-y-4"><LabeledField label="Category" required><select value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })} className={inputClass}><option value="" disabled>Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></LabeledField><LabeledField label="Description"><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What was this expense for?" className={inputClass} /></LabeledField><LabeledField label="Amount" required><input type="number" min={0} value={form.amount} onKeyDown={(event) => event.key === "Enter" && void addExpense()} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0" className={inputClass} /></LabeledField></div></section><div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/5"><button type="button" disabled={saving} onClick={() => setExpenseOpen(false)} className={secondaryButtonClass}>Cancel</button><button type="button" disabled={saving || !form.category_id || !form.amount} onClick={() => void addExpense()} className={primaryButtonClass}>{saving ? "Saving…" : "Add Expense"}</button></div></div></Modal>}
    {categoryOpen && <Modal title="Manage Categories" onClose={() => setCategoryOpen(false)}><div className="space-y-5"><div className="flex gap-2"><input value={newCategory} onKeyDown={(event) => event.key === "Enter" && void addCategory()} onChange={(event) => setNewCategory(event.target.value)} placeholder="e.g. Utilities" className={inputClass} /><button type="button" disabled={addingCategory || !newCategory.trim()} onClick={() => void addCategory()} className={`${primaryButtonClass} shrink-0`}>{addingCategory ? "Adding…" : "Add"}</button></div><div className="space-y-2">{categories.length === 0 ? <p className="py-3 text-center text-sm italic text-slate-500 dark:text-slate-400">No categories yet</p> : categories.map((category) => <div key={category.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-white/10"><Badge tone={toneForCategory(category.id)}>{category.name}</Badge><button type="button" title="Delete category" onClick={() => setDeleteCategoryId(category.id)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"><Trash2 size={16} /></button></div>)}</div></div></Modal>}
    {deleteCategoryId !== null && <Modal title="Delete Category?" onClose={() => !deletingCategory && setDeleteCategoryId(null)}><div className="space-y-5"><p className="text-sm text-slate-600 dark:text-slate-300">This will permanently delete the category. Existing expenses may be affected.</p><div className="flex justify-end gap-2"><button type="button" disabled={deletingCategory} onClick={() => setDeleteCategoryId(null)} className={secondaryButtonClass}>Cancel</button><button type="button" disabled={deletingCategory} onClick={() => void deleteCategory()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">{deletingCategory ? "Deleting…" : "Delete Category"}</button></div></div></Modal>}
  </div>;
}
