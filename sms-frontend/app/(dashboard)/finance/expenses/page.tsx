"use client";

import { useState, useEffect } from "react";
import { usePaginatedQuery } from "@/app/hooks/usePaginatedQuery";
import {
  Box, Button, Chip, Grid, IconButton, MenuItem, Pagination, Table,
  TableBody, TableCell, TableHead, TableRow, TextField,
  Typography, Tooltip, useMediaQuery, useTheme,
} from "@mui/material";
import {
  Delete, Search, AttachMoneyOutlined,
  CategoryOutlined, ReceiptLongOutlined, AddOutlined,
} from "@mui/icons-material";
import { api } from "@/app/lib/api";
import toast from "react-hot-toast";
import {
  C, FONT, EASE, inputSx, menuProps, thSx, tdSx,
  GlobalStyles, PageHeader, EmptyState, DataTable,
  DeleteDialog, MobileFab, DialogShell, SectionLabel,
} from "@/components/ui";

// ─── Types ──────────────────────────────────────────────────────────────
interface Expense {
  id: number; category_id: number;
  category: { id: number; name: string };
  description: string; amount: number; created_at: string;
}
interface Category { id: number; name: string }

// ─── Helpers ─────────────────────────────────────────────────────────────
const fmt     = (n: number) => new Intl.NumberFormat("en-PK", { minimumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });

const CAT_COLORS = [
  { color: C.accent, dim: C.accentDim },
  { color: C.blue,   dim: C.blueDim   },
  { color: C.green,  dim: C.greenDim  },
  { color: C.purple, dim: C.purpleDim },
  { color: C.red,    dim: C.redDim    },
];
const catColor = (id: number) => CAT_COLORS[id % CAT_COLORS.length];

// ─── Mobile expense card ──────────────────────────────────────────────────
function ExpenseCard({ e }: { e: Expense }) {
  const cc = catColor(e.category_id);
  return (
    <Box sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: "12px", p: 2, mb: 1.5, transition: `border-color ${EASE}`, "&:hover": { borderColor: "rgba(245,158,11,0.25)" } }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: "10px", backgroundColor: cc.dim, border: `1px solid ${cc.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ReceiptLongOutlined sx={{ fontSize: 18, color: cc.color }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", color: C.textPrimary, fontFamily: FONT, lineHeight: 1.2 }}>{e.description || "—"}</Typography>
            <Typography sx={{ fontSize: "0.72rem", color: C.textSecondary, fontFamily: FONT }}>{fmtDate(e.created_at)}</Typography>
          </Box>
        </Box>
        <Typography sx={{ fontFamily: '"DM Mono", monospace', fontWeight: 700, fontSize: "0.95rem", color: C.textPrimary }}>PKR {fmt(e.amount)}</Typography>
      </Box>
      <Chip label={e.category?.name} size="small" sx={{ backgroundColor: cc.dim, color: cc.color, fontFamily: FONT, fontWeight: 600, fontSize: "0.68rem", height: 20, border: `1px solid ${cc.color}25` }} />
    </Box>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [categories,     setCategories]     = useState<Category[]>([]);
  const [search,         setSearch]         = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Add expense dialog
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [form,        setForm]        = useState({ category_id: "", description: "", amount: "" });
  const [saving,      setSaving]      = useState(false);

  // Manage categories dialog
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory,  setNewCategory]  = useState("");
  const [addingCat,    setAddingCat]    = useState(false);
  const [deleteCatId,  setDeleteCatId]  = useState<number | null>(null);
  const [deletingCat,  setDeletingCat]  = useState(false);

  // ── Paginated query ────────────────────────────────────────────────
  const { data: expenses, loading, page, totalPages, setPage, refetch } =
    usePaginatedQuery({
      fetcher: async ({ page, limit, search, category }) => {
        const res = await api.get("/expenses", { params: { page, limit, search, category } });
        return { data: res.data.data, totalPages: res.data.totalPages };
      },
      filters: {
        search,
        category: categoryFilter ? Number(categoryFilter) : undefined,
      },
      debounceKeys: ["search"],
    });

  const fetchCategories = async () => {
    try { const res = await api.get("/expenses/categories"); setCategories(res.data); }
    catch { console.error("Failed to load categories"); }
  };

  useEffect(() => { fetchCategories(); }, []);

  // ── Add expense ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.category_id || !form.amount) return toast.error("Category and amount are required");
    setSaving(true);
    try {
      await api.post("/expenses", { category_id: Number(form.category_id), description: form.description, amount: Number(form.amount) });
      toast.success("Expense added");
      setExpenseOpen(false);
      setForm({ category_id: "", description: "", amount: "" });
      refetch();
    } catch (err: any) { toast.error(err.response?.data?.detail || "Failed to add expense"); }
    finally { setSaving(false); }
  };

  // ── Add category ───────────────────────────────────────────────────
  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;
    setAddingCat(true);
    try {
      await api.post("/expenses/categories", { name: newCategory });
      toast.success("Category added");
      setNewCategory(""); fetchCategories();
    } catch (err: any) { toast.error(err.response?.data?.detail || "Failed to add category"); }
    finally { setAddingCat(false); }
  };

  // ── Delete category ────────────────────────────────────────────────
  const confirmDeleteCat = async () => {
    if (!deleteCatId) return;
    setDeletingCat(true);
    try {
      await api.delete(`/expenses/categories/${deleteCatId}`);
      toast.success("Category deleted");
      setDeleteCatId(null); fetchCategories();
    } catch (err: any) { toast.error(err.response?.data?.detail || "Failed to delete category"); }
    finally { setDeletingCat(false); }
  };

  const totalAmount = (expenses as Expense[]).reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <GlobalStyles />
      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: "100%" }}>

        {/* Header — shared PageHeader */}
        <PageHeader
          title="Expenses"
          subtitle="Track and manage school expenditures by category"
          isMobile={isMobile}
        />

        {/* Action buttons */}
        <Box sx={{ display: "flex", gap: 1.5, mb: 2.5, flexWrap: "wrap" }}>
          <Button variant="contained" onClick={() => setExpenseOpen(true)} startIcon={<AddOutlined sx={{ fontSize: 16 }} />}
            sx={{ backgroundColor: C.accent, color: "#111827", fontFamily: FONT, fontWeight: 600, textTransform: "none", borderRadius: "10px", px: 2.5, "&:hover": { backgroundColor: "#FBBF24" } }}>
            Add Expense
          </Button>
          <Button variant="outlined" onClick={() => setCategoryOpen(true)} startIcon={<CategoryOutlined sx={{ fontSize: 16 }} />}
            sx={{ color: C.textSecondary, fontFamily: FONT, fontWeight: 600, textTransform: "none", borderRadius: "10px", px: 2.5, borderColor: C.border, "&:hover": { borderColor: C.accent, color: C.accent, backgroundColor: C.accentDim } }}>
            Manage Categories
          </Button>

          {/* Running total */}
          {(expenses as Expense[]).length > 0 && (
            <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1, backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.2)`, borderRadius: "10px", px: 1.75, py: 0.75 }}>
              <AttachMoneyOutlined sx={{ fontSize: 15, color: C.accent }} />
              <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.82rem", fontWeight: 700, color: C.accent }}>PKR {fmt(totalAmount)}</Typography>
              <Typography sx={{ fontFamily: FONT, fontSize: "0.7rem", color: C.textSecondary }}>this page</Typography>
            </Box>
          )}
        </Box>

        {/* Filters */}
        <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
          <Grid item xs={12} sm={7}>
            <TextField fullWidth size="small" placeholder="Search by description…" sx={inputSx} value={search} onChange={e => setSearch(e.target.value)} InputProps={{ startAdornment: <Search sx={{ color: C.textSecondary, mr: 1, fontSize: 18 }} /> }} />
          </Grid>
          <Grid item xs={12} sm={5}>
            <TextField select fullWidth size="small" label="Category" sx={inputSx} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} SelectProps={{ MenuProps: menuProps }}>
              <MenuItem value="">All Categories</MenuItem>
              {categories.map(cat => (
                <MenuItem key={cat.id} value={cat.id}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: catColor(cat.id).color }} />
                    <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>{cat.name}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>

        {/* Content */}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <Box sx={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${C.accentDim}`, borderTopColor: C.accent, animation: "spin 0.7s linear infinite", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />
          </Box>

        ) : (expenses as Expense[]).length === 0 ? (
          /* Empty state — shared EmptyState */
          <EmptyState icon={ReceiptLongOutlined} message="No expenses found" actionLabel="Add Expense" onAction={() => setExpenseOpen(true)} />

        ) : isMobile ? (
          <Box>{(expenses as Expense[]).map(e => <ExpenseCard key={e.id} e={e} />)}</Box>

        ) : (
          /* Table — shared DataTable */
          <DataTable>
            <Table>
              <TableHead>
                <TableRow>{["#","Category","Description","Amount","Date"].map(h => <TableCell key={h} sx={thSx}>{h}</TableCell>)}</TableRow>
              </TableHead>
              <TableBody>
                {(expenses as Expense[]).map((e, i) => {
                  const cc = catColor(e.category_id);
                  return (
                    <TableRow key={e.id} sx={{ "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" }, transition: `background ${EASE}`, animation: `fadeUp 0.3s ${i * 25}ms ease both`, "@keyframes fadeUp": { from: { opacity: 0, transform: "translateY(6px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}>
                      <TableCell sx={{ ...tdSx, fontFamily: '"DM Mono", monospace', color: C.textSecondary, width: 70 }}>{String(e.id).padStart(3, "0")}</TableCell>
                      <TableCell sx={tdSx}>
                        <Chip label={e.category?.name} size="small" sx={{ backgroundColor: cc.dim, color: cc.color, fontFamily: FONT, fontWeight: 600, fontSize: "0.7rem", height: 22, border: `1px solid ${cc.color}25` }} />
                      </TableCell>
                      <TableCell sx={tdSx}>
                        <Typography sx={{ fontFamily: FONT, fontSize: "0.855rem", color: C.textPrimary }}>
                          {e.description || <span style={{ color: C.textSecondary, fontStyle: "italic" }}>No description</span>}
                        </Typography>
                      </TableCell>
                      <TableCell sx={tdSx}>
                        <Typography sx={{ fontFamily: '"DM Mono", monospace', fontWeight: 700, fontSize: "0.855rem", color: C.textPrimary }}>PKR {fmt(e.amount)}</Typography>
                      </TableCell>
                      <TableCell sx={{ ...tdSx, fontFamily: '"DM Mono", monospace', fontSize: "0.78rem", color: C.textSecondary }}>{fmtDate(e.created_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <Box sx={{ display: "flex", justifyContent: "center", py: 2, borderTop: `1px solid ${C.border}` }}>
                <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)}
                  sx={{ "& .MuiPaginationItem-root": { fontFamily: FONT, color: C.textSecondary, borderColor: C.border }, "& .Mui-selected": { backgroundColor: `${C.accent} !important`, color: "#111827 !important" } }} />
              </Box>
            )}
          </DataTable>
        )}

        {isMobile && <MobileFab onClick={() => setExpenseOpen(true)} />}

        {/* Add Expense Dialog — shared DialogShell */}
        <DialogShell
          open={expenseOpen} onClose={() => setExpenseOpen(false)}
          title="Add Expense" maxWidth="xs" isMobile={isMobile}
          saving={saving} saveLabel="Add Expense" onSave={handleSubmit}
          saveDisabled={!form.category_id || !form.amount}
        >
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <SectionLabel label="Expense Details" />
            <Grid item xs={12}>
              <TextField select fullWidth required label="Category" sx={inputSx} value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} SelectProps={{ MenuProps: menuProps }}>
                <MenuItem value="" disabled>Select Category</MenuItem>
                {categories.map(cat => (
                  <MenuItem key={cat.id} value={cat.id}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: catColor(cat.id).color }} />
                      <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>{cat.name}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Description" sx={inputSx} placeholder="What was this expense for?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth required label="Amount" type="number" sx={inputSx} placeholder="0" value={form.amount}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                InputProps={{ startAdornment: <AttachMoneyOutlined sx={{ fontSize: 16, color: C.textSecondary, mr: 0.5 }} /> }} />
            </Grid>
          </Grid>
        </DialogShell>

        {/* Manage Categories Dialog — shared DialogShell (no save button, just close) */}
        <DialogShell
          open={categoryOpen} onClose={() => setCategoryOpen(false)}
          title="Manage Categories" maxWidth="xs" isMobile={isMobile}
        >
          {/* Add new category */}
          <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
            <TextField fullWidth size="small" label="New Category" sx={inputSx} placeholder="e.g. Utilities" value={newCategory}
              onKeyDown={e => e.key === "Enter" && handleAddCategory()}
              onChange={e => setNewCategory(e.target.value)} />
            <Button variant="contained" onClick={handleAddCategory} disabled={addingCat || !newCategory.trim()}
              sx={{ backgroundColor: C.accent, color: "#111827", fontFamily: FONT, fontWeight: 600, textTransform: "none", borderRadius: "10px", px: 2, whiteSpace: "nowrap", "&:hover": { backgroundColor: "#FBBF24" }, "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" } }}>
              {addingCat ? "Adding…" : "Add"}
            </Button>
          </Box>

          {/* Category list */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {categories.length === 0 ? (
              <Typography sx={{ fontFamily: FONT, fontSize: "0.82rem", color: C.textSecondary, textAlign: "center", py: 2, fontStyle: "italic" }}>No categories yet</Typography>
            ) : categories.map(cat => {
              const cc = catColor(cat.id);
              return (
                <Box key={cat.id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1.25, borderRadius: "10px", backgroundColor: C.bg, border: `1px solid ${C.border}`, transition: `border-color ${EASE}`, "&:hover": { borderColor: cc.color + "40" } }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: cc.color, flexShrink: 0 }} />
                    <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem", color: C.textPrimary, fontWeight: 500 }}>{cat.name}</Typography>
                  </Box>
                  <Tooltip title="Delete Category" arrow>
                    <IconButton size="small" onClick={() => setDeleteCatId(cat.id)} sx={{ color: C.textSecondary, borderRadius: "7px", p: 0.6, "&:hover": { backgroundColor: C.redDim, color: C.red }, transition: `all ${EASE}` }}>
                      <Delete sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              );
            })}
          </Box>
        </DialogShell>

        {/* Delete Category Confirm — shared DeleteDialog */}
        <DeleteDialog
          open={!!deleteCatId} onClose={() => setDeleteCatId(null)}
          onConfirm={confirmDeleteCat} loading={deletingCat}
          title="Delete Category?"
          description="This will permanently delete the category. Existing expenses may be affected."
        />

      </Box>
    </>
  );
}