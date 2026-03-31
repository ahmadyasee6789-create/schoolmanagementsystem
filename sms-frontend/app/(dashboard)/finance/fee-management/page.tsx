"use client";

import { useState, useEffect } from "react";
import { api } from "@/app/lib/api";
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, IconButton, MenuItem, Table,
  TableBody, TableCell, TableHead, TableRow, TextField,
  Typography, Tooltip, useMediaQuery, useTheme, Pagination,
} from "@mui/material";
import {
  Close, ClassOutlined, PersonOutlined, ReceiptOutlined,
  AttachMoneyOutlined, AutorenewOutlined, CheckCircleOutlined,
  CancelOutlined, RemoveCircleOutlined,
} from "@mui/icons-material";
import toast from "react-hot-toast";
import {
  C, FONT, EASE, inputSx, menuProps, thSx, tdSx,
  GlobalStyles, PageHeader, EmptyState, DataTable, StatCard,
  FeeStatusChip, StudentCell, PayBar,
} from "@/components/ui";

// ─── Types ────────────────────────────────────────────────────────────────
type Fee = {
  id: number;
  student_name: string;
  month: string;
  admission_fee: number;
  monthly_fee: number;
  exam_fee: number;
  total_amount: number;
  discount_percent: number;
  discount_amount: number;
  final_amount: number;
  paid_amount: number;
  due_amount: number;
  status: "paid" | "partial" | "unpaid";
};
type Classroom       = { id: number; section: string; grade?: { name: string }; grade_name?: string };
type AcademicSession = { id: number; name: string; start_date: string };

// ─── Helpers ──────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const classLabel = (c: Classroom) => {
  const grade = c.grade?.name ?? c.grade_name ?? "";
  return grade ? `${grade} – ${c.section}` : c.section;
};
const fmt = (n: number) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: 0 }).format(n);

// ─── Mono amount cell ─────────────────────────────────────────────────────
function MonoAmt({ value, color }: { value: number; color?: string }) {
  return (
    <Typography sx={{
      fontFamily: '"DM Mono", monospace', fontSize: "0.8rem",
      fontWeight: 600, color: color ?? C.textPrimary,
    }}>
      {fmt(value)}
    </Typography>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
const LIMIT = 10;

export default function FeeManagementPage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [classes,       setClasses]       = useState<Classroom[]>([]);
  const [classId,       setClassId]       = useState("");
  const [month,         setMonth]         = useState("");
  const [orderedMonths, setOrderedMonths] = useState(MONTH_NAMES);

  const [fees,       setFees]       = useState<Fee[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [generating, setGenerating] = useState(false);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Collect dialog
  const [selectedFee,   setSelectedFee]   = useState<Fee | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paying,        setPaying]        = useState(false);

  // ── Fetch lookups ──────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([api.get("/classes"), api.get("/sessions")]).then(
      ([classesRes, sessionsRes]) => {
        setClasses(classesRes.data);
        const active: AcademicSession = sessionsRes.data[0];
        if (active?.start_date) {
          const startIdx = new Date(active.start_date).getMonth();
          setOrderedMonths([...MONTH_NAMES.slice(startIdx), ...MONTH_NAMES.slice(0, startIdx)]);
        }
      }
    );
  }, []);

  // ── Fetch ledger ───────────────────────────────────────────────────
  const fetchLedger = async (p = page) => {
    if (!classId || !month) return;
    setLoading(true);
    try {
      const res = await api.get("/fees/ledger", {
        params: { class_id: classId, month, page: p, limit: LIMIT },
      });
      setFees(res.data.items);
      setTotalPages(res.data.total_pages);
    } catch { toast.error("Failed to load fee ledger"); }
    finally  { setLoading(false); }
  };

  useEffect(() => { fetchLedger(page); }, [classId, month, page]);

  // ── Generate ───────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!classId || !month) return toast.error("Select class and month first");
    setGenerating(true);
    try {
      const res = await api.post("/fees/generate", null, { params: { class_id: classId, month } });
      toast.success(res.data.message);
      setPage(1);
      await fetchLedger(1);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to generate fees");
    } finally { setGenerating(false); }
  };

  // ── Collect ────────────────────────────────────────────────────────
  const handleCollect = async () => {
    if (!selectedFee) return;
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0)          return toast.error("Enter a valid amount");
    if (amount > selectedFee.due_amount) return toast.error(`Amount exceeds due of ${fmt(selectedFee.due_amount)}`);
    setPaying(true);
    try {
      await api.post(`/fees/${selectedFee.id}/collect`, { amount });
      toast.success("Payment collected successfully");
      setSelectedFee(null);
      setPaymentAmount("");
      await fetchLedger(page);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to collect payment");
    } finally { setPaying(false); }
  };

  // ── Summary stats ──────────────────────────────────────────────────
  const totalCollected = fees.reduce((s, f) => s + f.paid_amount, 0);
  const totalDue       = fees.reduce((s, f) => s + f.due_amount,  0);
  const paidCount      = fees.filter(f => f.status === "paid").length;
  const unpaidCount    = fees.filter(f => f.status !== "paid").length;

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
      <GlobalStyles />
      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: "100%" }}>

        {/* Header */}
        <PageHeader
          title="Fee Management"
          subtitle="Generate and collect student fee payments by class and month"
          isMobile={isMobile}
        />

        {/* Filters + Generate */}
        <Grid container spacing={1.5} sx={{ mb: 2.5 }} alignItems="center">
          <Grid item xs={12} sm={4}>
            <TextField
              select fullWidth size="small" label="Class" sx={inputSx}
              value={classId}
              onChange={e => { setClassId(e.target.value); setPage(1); }}
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

          <Grid item xs={12} sm={3}>
            <TextField
              select fullWidth size="small" label="Month" sx={inputSx}
              value={month}
              onChange={e => { setMonth(e.target.value); setPage(1); }}
              SelectProps={{ MenuProps: menuProps }}
            >
              <MenuItem value="" disabled>Select Month</MenuItem>
              {orderedMonths.map(m => (
                <MenuItem key={m} value={m}>
                  <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>{m}</Typography>
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} sm={3}>
            <Button
              fullWidth variant="contained"
              onClick={handleGenerate}
              disabled={generating || !classId || !month}
              startIcon={<AutorenewOutlined sx={{ fontSize: 16, animation: generating ? "spin 1s linear infinite" : "none", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />}
              sx={{
                backgroundColor: C.accent, color: "#111827",
                fontFamily: FONT, fontWeight: 600,
                textTransform: "none", borderRadius: "10px", height: 40,
                "&:hover": { backgroundColor: "#FBBF24" },
                "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" },
              }}
            >
              {generating ? "Generating…" : "Generate Fees"}
            </Button>
          </Grid>
        </Grid>

        {/* Stat cards — using shared StatCard */}
        {fees.length > 0 && (
          <Grid container spacing={{ xs: 1.5, md: 2 }} sx={{ mb: { xs: 2.5, md: 3 } }}>
            {[
              { label: "Collected",     value: `₨${fmt(totalCollected)}`, color: C.green,  dim: C.greenDim,  icon: CheckCircleOutlined, delay: 0   },
              { label: "Due",           value: `₨${fmt(totalDue)}`,       color: C.red,    dim: C.redDim,    icon: CancelOutlined,      delay: 60  },
              { label: "Paid Students", value: paidCount,                  color: C.accent, dim: C.accentDim, icon: PersonOutlined,      delay: 120 },
              { label: "Pending",       value: unpaidCount,                color: C.purple, dim: C.purpleDim, icon: ReceiptOutlined,     delay: 180 },
            ].map((s, i) => (
              <Grid item xs={6} md={3} key={i}>
                <StatCard {...s} />
              </Grid>
            ))}
          </Grid>
        )}

        {/* Table */}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <Box sx={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${C.accentDim}`, borderTopColor: C.accent, animation: "spin 0.7s linear infinite", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />
          </Box>

        ) : fees.length === 0 ? (
          <EmptyState
            icon={ReceiptOutlined}
            message={classId && month
              ? "No fees found. Click Generate Fees to create them."
              : "Select a class and month to view fees"}
          />

        ) : (
          <DataTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {["Student", "Admission", "Monthly", "Exam", "Total", "Disc%", "Discount", "Final", "Payment", "Status", ""].map(h => (
                    <TableCell key={h} sx={thSx}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {fees.map((fee, i) => (
                  <TableRow key={fee.id} sx={{ "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" }, transition: `background ${EASE}`, animation: `fadeUp 0.3s ${i * 20}ms ease both`, "@keyframes fadeUp": { from: { opacity: 0, transform: "translateY(6px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}>

                    {/* Student — using shared StudentCell */}
                    <TableCell sx={tdSx}>
                      <StudentCell name={fee.student_name} />
                    </TableCell>

                    <TableCell sx={tdSx}><MonoAmt value={fee.admission_fee} /></TableCell>
                    <TableCell sx={tdSx}><MonoAmt value={fee.monthly_fee} /></TableCell>
                    <TableCell sx={tdSx}><MonoAmt value={fee.exam_fee} /></TableCell>
                    <TableCell sx={tdSx}><MonoAmt value={fee.total_amount} /></TableCell>

                    {/* Discount % */}
                    <TableCell sx={tdSx}>
                      {fee.discount_percent > 0 ? (
                        <Chip label={`${fee.discount_percent}%`} size="small" sx={{ backgroundColor: C.purpleDim, color: C.purple, fontFamily: FONT, fontWeight: 700, fontSize: "0.68rem", height: 20 }} />
                      ) : (
                        <Typography sx={{ fontFamily: FONT, fontSize: "0.78rem", color: C.textSecondary }}>—</Typography>
                      )}
                    </TableCell>

                    <TableCell sx={tdSx}><MonoAmt value={fee.discount_amount} color={C.textSecondary} /></TableCell>
                    <TableCell sx={tdSx}>
                      <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.82rem", fontWeight: 700, color: C.textPrimary }}>{fmt(fee.final_amount)}</Typography>
                    </TableCell>

                    {/* Payment bar — using shared PayBar */}
                    <TableCell sx={tdSx}>
                      <PayBar paid={fee.paid_amount} total={fee.final_amount} />
                    </TableCell>

                    {/* Status — using shared FeeStatusChip */}
                    <TableCell sx={tdSx}>
                      <FeeStatusChip status={fee.status} />
                    </TableCell>

                    {/* Collect button */}
                    <TableCell sx={tdSx}>
                      {fee.status !== "paid" && (
                        <Tooltip title="Collect Payment" arrow>
                          <Button
                            size="small"
                            onClick={() => { setSelectedFee(fee); setPaymentAmount(String(fee.due_amount)); }}
                            startIcon={<AttachMoneyOutlined sx={{ fontSize: 13 }} />}
                            sx={{
                              backgroundColor: C.greenDim, color: C.green,
                              fontFamily: FONT, fontWeight: 600, fontSize: "0.72rem",
                              textTransform: "none", borderRadius: "8px", px: 1.25,
                              border: `1px solid ${C.green}30`,
                              "&:hover": { backgroundColor: C.green, color: "#fff" },
                              transition: `all ${EASE}`, whiteSpace: "nowrap",
                            }}
                          >
                            Collect
                          </Button>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <Box sx={{ display: "flex", justifyContent: "center", py: 2, borderTop: `1px solid ${C.border}` }}>
                <Pagination
                  count={totalPages} page={page}
                  onChange={(_, v) => setPage(v)}
                  sx={{
                    "& .MuiPaginationItem-root": { fontFamily: FONT, color: C.textSecondary, borderColor: C.border },
                    "& .Mui-selected": { backgroundColor: `${C.accent} !important`, color: "#111827 !important" },
                  }}
                />
              </Box>
            )}
          </DataTable>
        )}

        {/* Collect Payment Dialog */}
        <Dialog
          open={!!selectedFee}
          onClose={() => !paying && setSelectedFee(null)}
          fullWidth maxWidth="xs" fullScreen={isMobile}
          PaperProps={{ sx: { backgroundColor: C.surface, border: isMobile ? "none" : `1px solid ${C.border}`, borderRadius: isMobile ? 0 : "16px", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" } }}
        >
          <DialogTitle sx={{ fontFamily: FONT, fontWeight: 700, fontSize: "1.05rem", color: C.textPrimary, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <AttachMoneyOutlined sx={{ fontSize: 18, color: C.accent }} />
              Collect Payment
            </Box>
            {isMobile && <IconButton onClick={() => setSelectedFee(null)} sx={{ color: C.textSecondary }}><Close /></IconButton>}
          </DialogTitle>

          <DialogContent sx={{ pt: 2.5 }}>
            {/* Student info — using shared StudentCell */}
            <Box sx={{ p: 1.75, borderRadius: "10px", backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.18)`, mb: 2.5 }}>
              <Typography sx={{ fontSize: "0.65rem", color: C.accent, fontFamily: FONT, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", mb: 0.75 }}>Student</Typography>
              <StudentCell name={selectedFee?.student_name ?? ''} />
            </Box>

            {/* Due amount */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
              <Typography sx={{ fontFamily: FONT, fontSize: "0.82rem", color: C.textSecondary }}>Due Amount</Typography>
              <Chip
                label={`₨${fmt(selectedFee?.due_amount ?? 0)}`} size="small"
                sx={{ backgroundColor: C.redDim, color: C.red, fontFamily: '"DM Mono", monospace', fontWeight: 700, fontSize: "0.78rem", height: 24 }}
              />
            </Box>

            {/* Also show the PayBar for context */}
            {selectedFee && (
              <Box sx={{ mb: 2 }}>
                <PayBar paid={selectedFee.paid_amount} total={selectedFee.final_amount} />
              </Box>
            )}

            <TextField
              fullWidth autoFocus required
              type="number" label="Payment Amount" sx={inputSx}
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCollect()}
              inputProps={{ min: 1, max: selectedFee?.due_amount }}
              InputProps={{ startAdornment: <AttachMoneyOutlined sx={{ fontSize: 16, color: C.textSecondary, mr: 0.5 }} /> }}
            />
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, borderTop: `1px solid ${C.border}` }}>
            <Button onClick={() => setSelectedFee(null)} disabled={paying}
              sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: "none", borderRadius: "8px" }}>
              Cancel
            </Button>
            <Button variant="contained" onClick={handleCollect} disabled={paying || !paymentAmount}
              sx={{ backgroundColor: C.accent, color: "#111827", fontFamily: FONT, fontWeight: 600, textTransform: "none", borderRadius: "10px", px: 3, "&:hover": { backgroundColor: "#FBBF24" }, "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" } }}>
              {paying ? "Processing…" : "Submit Payment"}
            </Button>
          </DialogActions>
        </Dialog>

      </Box>
    </>
  );
}