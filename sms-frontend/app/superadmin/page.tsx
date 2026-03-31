"use client";

import { useEffect, useState } from "react";
import {
  Box, Button, Chip, Grid, MenuItem,
  Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Typography, Dialog,
  DialogTitle, DialogContent, DialogActions,
  IconButton, Tooltip,
} from "@mui/material";
import {
  CheckCircleOutlined, BlockOutlined,
  RefreshOutlined, BusinessOutlined,
  PeopleOutlined, AccessTimeOutlined,
  AttachMoneyOutlined, WarningAmberOutlined,
  CloseOutlined, FilterListOutlined,
} from "@mui/icons-material";
import { api } from "@/app/lib/api";
import toast from "react-hot-toast";
import LogoutIcon          from "@mui/icons-material/Logout";
import { useAuthStore }    from "@/app/store/authStore";
import { log } from "console";
import { useRouter } from "next/navigation";


// ─── COLORS (matches your existing theme) ────────────────────────────────────
const C = {
  bg:            "#0a0f1a",        // deeper dark for superadmin
  surface:       "#111827",
  surfaceHover:  "#1a2235",
  border:        "#1f2d40",
  accent:        "#f59e0b",
  accentDim:     "rgba(245,158,11,0.1)",
  green:         "#10b981",
  greenDim:      "rgba(16,185,129,0.1)",
  red:           "#ef4444",
  redDim:        "rgba(239,68,68,0.1)",
  blue:          "#3b82f6",
  blueDim:       "rgba(59,130,246,0.1)",
  purple:        "#8b5cf6",
  purpleDim:     "rgba(139,92,246,0.1)",
  textPrimary:   "#f1f5f9",
  textSecondary: "#64748b",
  textMuted:     "#334155",
};

const FONT = '"IBM Plex Mono", monospace';
const DISPLAY = '"DM Serif Display", serif';

// ─── TYPES ────────────────────────────────────────────────────────────────────
type OrgStatus = "trial" | "active" | "expired" | "suspended";

type Organization = {
  id:           number;
  name:         string;
  status:       OrgStatus;
  plan:         string;
  trial_ends_at: string | null;
  created_at:   string;
  member_count: number;
  admin_name:   string;
  admin_email:  string;
  days_left:    number | null;
};

type Stats = {
  total:    number;
  trial:    number;
  active:   number;
  expired:  number;
  suspended: number;
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function fmtDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PK", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ─── STATUS CHIP ─────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: OrgStatus }) {
  const config = {
    trial:     { color: C.accent,  bg: C.accentDim,  label: "Trial"     },
    active:    { color: C.green,   bg: C.greenDim,   label: "Active"    },
    expired:   { color: C.red,     bg: C.redDim,     label: "Expired"   },
    suspended: { color: C.purple,  bg: C.purpleDim,  label: "Suspended" },
  }[status] ?? { color: C.textSecondary, bg: "transparent", label: status };

  return (
    <Chip
      label={config.label}
      size="small"
      sx={{
        backgroundColor: config.bg,
        color:           config.color,
        border:          `1px solid ${config.color}30`,
        fontFamily:      FONT,
        fontWeight:      700,
        fontSize:        "0.65rem",
        height:          22,
        letterSpacing:   "0.05em",
      }}
    />
  );
}

// ─── PLAN CHIP ────────────────────────────────────────────────────────────────
function PlanChip({ plan }: { plan: string }) {
  const config: Record<string, { color: string; bg: string }> = {
    trial:    { color: C.accent, bg: C.accentDim  },
    basic:    { color: C.blue,   bg: C.blueDim    },
    standard: { color: C.green,  bg: C.greenDim   },
    premium:  { color: C.purple, bg: C.purpleDim  },
  };
  const c = config[plan] ?? { color: C.textSecondary, bg: "transparent" };

  return (
    <Chip
      label={plan.toUpperCase()}
      size="small"
      sx={{
        backgroundColor: c.bg,
        color:           c.color,
        border:          `1px solid ${c.color}30`,
        fontFamily:      FONT,
        fontWeight:      700,
        fontSize:        "0.6rem",
        height:          20,
        letterSpacing:   "0.08em",
      }}
    />
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, color, icon: Icon, delay = 0,
}: {
  label: string;
  value: number;
  color: string;
  icon: any;
  delay?: number;
}) {
  return (
    <Box sx={{
      backgroundColor: C.surface,
      border:          `1px solid ${C.border}`,
      borderRadius:    "12px",
      p:               2.5,
      position:        "relative",
      overflow:        "hidden",
      animation:       `fadeUp 0.4s ${delay}ms ease both`,
      "@keyframes fadeUp": {
        from: { opacity: 0, transform: "translateY(12px)" },
        to:   { opacity: 1, transform: "translateY(0)"    },
      },
      "&::before": {
        content:      '""',
        position:     "absolute",
        top:          0, left: 0, right: 0,
        height:       "2px",
        background:   color,
        opacity:      0.6,
      },
      "&:hover": { borderColor: `${color}40` },
      transition: "border-color 0.2s",
    }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography sx={{
            fontFamily:    FONT,
            fontSize:      "0.65rem",
            color:         C.textSecondary,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            mb:            1,
          }}>
            {label}
          </Typography>
          <Typography sx={{
            fontFamily: FONT,
            fontSize:   "2rem",
            fontWeight: 700,
            color,
            lineHeight: 1,
          }}>
            {value}
          </Typography>
        </Box>
        <Box sx={{
          width:           40,
          height:          40,
          borderRadius:    "10px",
          backgroundColor: `${color}15`,
          border:          `1px solid ${color}25`,
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
        }}>
          <Icon sx={{ fontSize: 18, color }} />
        </Box>
      </Box>
    </Box>
  );
}

// ─── ACTIVATE DIALOG ──────────────────────────────────────────────────────────
function ActivateDialog({
  open, org, onClose, onSuccess,
}: {
  open:      boolean;
  org:       Organization | null;
  onClose:   () => void;
  onSuccess: () => void;
}) {
  const [plan,    setPlan]    = useState("basic");
  const [days,    setDays]    = useState(30);
  const [saving,  setSaving]  = useState(false);

  const PLANS = ["basic", "standard", "premium"];

  async function handleActivate() {
    if (!org) return;
    setSaving(true);
    try {
      await api.post(`/superadmin/organizations/${org.id}/activate`, {
        plan, days,
      });
      toast.success(`${org.name} activated on ${plan} plan for ${days} days!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to activate");
    } finally {
      setSaving(false);
    }
  }

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      backgroundColor: "#0a0f1a",
      borderRadius:    "8px",
      fontFamily:      FONT,
      color:           C.textPrimary,
      fontSize:        "0.85rem",
      "& fieldset":              { borderColor: C.border },
      "&:hover fieldset":        { borderColor: C.accent },
      "&.Mui-focused fieldset":  { borderColor: C.accent },
    },
    "& .MuiInputLabel-root": {
      color:      C.textSecondary,
      fontFamily: FONT,
      fontSize:   "0.8rem",
      "&.Mui-focused": { color: C.accent },
    },
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: C.surface,
          border:          `1px solid ${C.border}`,
          borderRadius:    "16px",
        }
      }}
    >
      <DialogTitle sx={{
        fontFamily:   FONT,
        fontWeight:   700,
        fontSize:     "0.95rem",
        color:        C.textPrimary,
        borderBottom: `1px solid ${C.border}`,
        pb:           2,
        display:      "flex",
        justifyContent: "space-between",
        alignItems:   "center",
      }}>
        Activate Organization
        <IconButton size="small" onClick={onClose} sx={{ color: C.textSecondary }}>
          <CloseOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        {/* Org info */}
        <Box sx={{
          backgroundColor: C.accentDim,
          border:          `1px solid ${C.accent}30`,
          borderRadius:    "10px",
          p:               2,
          mb:              2.5,
        }}>
          <Typography sx={{ fontFamily: FONT, fontSize: "0.7rem", color: C.accent, mb: 0.5 }}>
            ORGANIZATION
          </Typography>
          <Typography sx={{ fontFamily: FONT, fontSize: "0.95rem", fontWeight: 700, color: C.textPrimary }}>
            {org?.name}
          </Typography>
          <Typography sx={{ fontFamily: FONT, fontSize: "0.72rem", color: C.textSecondary }}>
            {org?.admin_email}
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {/* Plan selector */}
          <Grid item xs={12}>
            <TextField
              select fullWidth size="small"
              label="Select Plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              sx={inputSx}
            >
              {PLANS.map((p) => (
                <MenuItem key={p} value={p}>
                  <Typography sx={{ fontFamily: FONT, fontSize: "0.85rem", textTransform: "capitalize" }}>
                    {p}
                  </Typography>
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/* Days input */}
          <Grid item xs={12}>
            <TextField
              fullWidth size="small"
              type="number"
              label="Active for (days)"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              inputProps={{ min: 1, max: 365 }}
              sx={inputSx}
              helperText={`Expires: ${new Date(Date.now() + days * 86400000).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}`}
              FormHelperTextProps={{
                sx: { fontFamily: FONT, fontSize: "0.7rem", color: C.textSecondary }
              }}
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ borderTop: `1px solid ${C.border}`, px: 3, py: 2, gap: 1 }}>
        <Button
          onClick={onClose}
          sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: "none", fontSize: "0.8rem" }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleActivate}
          disabled={saving}
          sx={{
            backgroundColor: C.green,
            color:           "#fff",
            fontFamily:      FONT,
            fontWeight:      700,
            textTransform:   "none",
            borderRadius:    "8px",
            fontSize:        "0.82rem",
            "&:hover":       { backgroundColor: "#0da271" },
            "&.Mui-disabled": { backgroundColor: `${C.green}40`, color: "#fff6" },
          }}
        >
          {saving ? "Activating…" : `Activate — ${plan} / ${days}d`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN SUPERADMIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function SuperAdminPage() {

  // ── DATA STATE ──
  const [orgs,    setOrgs]    = useState<Organization[]>([]);
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // ── FILTER STATE ──
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchText,   setSearchText]   = useState("");

  // ── DIALOG STATE ──
  const [activateOpen, setActivateOpen] = useState(false);
  const [selectedOrg,  setSelectedOrg]  = useState<Organization | null>(null);

  // ── ACTION LOADING ──
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const handleLogout = async () => {
    logout();
    router.replace("/signin");
  };

  // ── LOAD DATA ──
  async function loadData() {
    setLoading(true);
    try {
      const [orgsRes, statsRes] = await Promise.all([
        api.get("/superadmin/organizations"),
        api.get("/superadmin/stats"),
      ]);
      setOrgs(orgsRes.data);
      setStats(statsRes.data);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  // ── SUSPEND ──
  async function handleSuspend(org: Organization) {
    if (!confirm(`Suspend ${org.name}? They will lose access immediately.`)) return;
    setActionLoading(org.id);
    try {
      await api.post(`/superadmin/organizations/${org.id}/suspend`);
      toast.success(`${org.name} suspended`);
      await loadData();
    } catch {
      toast.error("Failed to suspend");
    } finally {
      setActionLoading(null);
    }
  }

  // ── REACTIVATE ──
  async function handleReactivate(org: Organization) {
    setActionLoading(org.id);
    try {
      await api.post(`/superadmin/organizations/${org.id}/reactivate`);
      toast.success(`${org.name} reactivated`);
      await loadData();
    } catch {
      toast.error("Failed to reactivate");
    } finally {
      setActionLoading(null);
    }
  }

  // ── FILTERED LIST ──
  const filteredOrgs = orgs.filter((org) => {
    const matchesStatus = filterStatus === "all" || org.status === filterStatus;
    const matchesSearch =
      org.name.toLowerCase().includes(searchText.toLowerCase()) ||
      org.admin_email.toLowerCase().includes(searchText.toLowerCase()) ||
      org.admin_name.toLowerCase().includes(searchText.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // ── STYLES ──
  const thSx = {
    backgroundColor: C.bg,
    color:           C.textSecondary,
    fontSize:        "0.62rem",
    fontWeight:      700,
    textTransform:   "uppercase",
    letterSpacing:   "0.1em",
    borderBottom:    `1px solid ${C.border}`,
    fontFamily:      FONT,
    padding:         "10px 16px",
    whiteSpace:      "nowrap",
  };

  const tdSx = {
    borderBottom: `1px solid ${C.border}10`,
    color:        C.textPrimary,
    fontSize:     "0.8rem",
    fontFamily:   FONT,
    padding:      "14px 16px",
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      backgroundColor: C.surface,
      borderRadius:    "10px",
      fontFamily:      FONT,
      color:           C.textPrimary,
      fontSize:        "0.82rem",
      "& fieldset":             { borderColor: C.border },
      "&:hover fieldset":       { borderColor: C.accent },
      "&.Mui-focused fieldset": { borderColor: C.accent },
    },
    "& .MuiInputLabel-root": {
      color:      C.textSecondary,
      fontFamily: FONT,
      fontSize:   "0.8rem",
      "&.Mui-focused": { color: C.accent },
    },
  };

  const actionBtnSx = (color: string) => ({
    color:         color,
    border:        `1px solid ${color}30`,
    borderRadius:  "7px",
    p:             0.75,
    "&:hover":     { backgroundColor: `${color}15`, borderColor: color },
    "&.Mui-disabled": { opacity: 0.4 },
    transition:    "all 0.15s",
  });

  // ─── JSX ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{
      p:               { xs: 2, md: 3 },
      backgroundColor: C.bg,
      minHeight:       "100vh",
      fontFamily:      FONT,
    }}>

      {/* ── PAGE HEADER ── */}
      <Box sx={{ mb: 4, animation: "fadeUp 0.3s ease both", "@keyframes fadeUp": { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
          <Box sx={{
            width:           36,
            height:          36,
            borderRadius:    "10px",
            backgroundColor: C.accentDim,
            border:          `1px solid ${C.accent}30`,
            display:         "flex",
            alignItems:      "center",
            justifyContent:  "center",
          }}>
            <BusinessOutlined sx={{ fontSize: 18, color: C.accent }} />
          </Box>
          <Typography sx={{
            fontFamily:    DISPLAY,
            fontSize:      "1.8rem",
            color:         C.textPrimary,
            lineHeight:    1,
            letterSpacing: "-0.02em",
          }}>
            Super Admin
          </Typography>
        </Box>
        <Typography sx={{
          fontFamily: FONT,
          fontSize:   "0.75rem",
          color:      C.textSecondary,
          ml:         6.5,
        }}>
          Manage all organizations · approve · suspend · extend plans
        </Typography>
        <Button onClick={handleLogout} startIcon={<LogoutIcon />}>
          Logout
        </Button>
      </Box>

      {/* ── STAT CARDS ── */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: "Total Orgs",  value: stats.total,     color: C.textPrimary, icon: BusinessOutlined,    delay: 0   },
            { label: "On Trial",    value: stats.trial,     color: C.accent,      icon: AccessTimeOutlined,  delay: 60  },
            { label: "Active",      value: stats.active,    color: C.green,       icon: CheckCircleOutlined, delay: 120 },
            { label: "Expired",     value: stats.expired,   color: C.red,         icon: WarningAmberOutlined,delay: 180 },
            { label: "Suspended",   value: stats.suspended, color: C.purple,      icon: BlockOutlined,       delay: 240 },
          ].map((s) => (
            <Grid item xs={6} sm={4} md key={s.label}>
              <StatCard {...s} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* ── SEARCH + FILTER ROW ── */}
      <Box sx={{ display: "flex", gap: 2, mb: 2.5, flexWrap: "wrap", alignItems: "center" }}>
        {/* Search */}
        <TextField
          size="small"
          placeholder="Search by org name or admin email…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          sx={{ ...inputSx, flex: 1, minWidth: 220 }}
        />

        {/* Status filter */}
        <TextField
          select size="small"
          label="Status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          sx={{ ...inputSx, width: 160 }}
        >
          {["all", "trial", "active", "expired", "suspended"].map((s) => (
            <MenuItem key={s} value={s}>
              <Typography sx={{ fontFamily: FONT, fontSize: "0.82rem", textTransform: "capitalize" }}>
                {s === "all" ? "All Status" : s}
              </Typography>
            </MenuItem>
          ))}
        </TextField>

        {/* Refresh button */}
        <Tooltip title="Refresh" arrow>
          <span>
          <IconButton
            onClick={loadData}
            disabled={loading}
            sx={{
              color:        C.accent,
              border:       `1px solid ${C.accent}30`,
              borderRadius: "10px",
              p:            1,
              "&:hover":    { backgroundColor: C.accentDim },
              animation:    loading ? "spin 1s linear infinite" : "none",
              "@keyframes spin": { to: { transform: "rotate(360deg)" } },
            }}
          >
            <RefreshOutlined sx={{ fontSize: 18 }} />
          </IconButton>
          </span>
        </Tooltip>

        {/* Count */}
        <Typography sx={{ fontFamily: FONT, fontSize: "0.72rem", color: C.textSecondary, ml: "auto" }}>
          {filteredOrgs.length} organization{filteredOrgs.length !== 1 ? "s" : ""}
        </Typography>
      </Box>

      {/* ── TABLE ── */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
          <Box sx={{
            width: 36, height: 36,
            borderRadius:   "50%",
            border:         `3px solid ${C.border}`,
            borderTopColor: C.accent,
            animation:      "spin 0.7s linear infinite",
            "@keyframes spin": { to: { transform: "rotate(360deg)" } },
          }} />
        </Box>
      ) : (
        <Box sx={{
          backgroundColor: C.surface,
          border:          `1px solid ${C.border}`,
          borderRadius:    "14px",
          overflow:        "hidden",
        }}>
          <Table>
            <TableHead>
              <TableRow>
                {["Organization", "Admin", "Plan", "Status", "Days Left", "Members", "Created", "Actions"].map((h) => (
                  <TableCell key={h} sx={thSx}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {filteredOrgs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    sx={{ textAlign: "center", py: 8, color: C.textSecondary, fontFamily: FONT, fontSize: "0.82rem" }}
                  >
                    No organizations found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrgs.map((org, i) => (
                  <TableRow
                    key={org.id}
                    sx={{
                      "&:hover":  { backgroundColor: C.surfaceHover },
                      transition: "background 0.15s",
                      animation:  `fadeUp 0.3s ${i * 20}ms ease both`,
                      "@keyframes fadeUp": {
                        from: { opacity: 0, transform: "translateY(4px)" },
                        to:   { opacity: 1, transform: "translateY(0)"   },
                      },
                    }}
                  >
                    {/* COLUMN 1: Org name + id */}
                    <TableCell sx={tdSx}>
                      <Typography sx={{ fontWeight: 700, color: C.textPrimary, fontFamily: FONT, fontSize: "0.85rem" }}>
                        {org.name}
                      </Typography>
                      <Typography sx={{ fontSize: "0.65rem", color: C.textMuted, fontFamily: FONT }}>
                        #{org.id}
                      </Typography>
                    </TableCell>

                    {/* COLUMN 2: Admin info */}
                    <TableCell sx={tdSx}>
                      <Typography sx={{ fontSize: "0.8rem", color: C.textPrimary, fontFamily: FONT }}>
                        {org.admin_name}
                      </Typography>
                      <Typography sx={{ fontSize: "0.68rem", color: C.textSecondary, fontFamily: FONT }}>
                        {org.admin_email}
                      </Typography>
                    </TableCell>

                    {/* COLUMN 3: Plan */}
                    <TableCell sx={tdSx}>
                      <PlanChip plan={org.plan} />
                    </TableCell>

                    {/* COLUMN 4: Status */}
                    <TableCell sx={tdSx}>
                      <StatusChip status={org.status} />
                    </TableCell>

                    {/* COLUMN 5: Days left */}
                    <TableCell sx={tdSx}>
                      {org.days_left !== null ? (
                        <Typography sx={{
                          fontFamily: FONT,
                          fontSize:   "0.82rem",
                          fontWeight: 700,
                          color:      org.days_left <= 3
                            ? C.red
                            : org.days_left <= 7
                              ? C.accent
                              : C.green,
                        }}>
                          {org.days_left === 0 ? "Expired" : `${org.days_left}d`}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontFamily: FONT, fontSize: "0.82rem", color: C.textMuted }}>—</Typography>
                      )}
                    </TableCell>

                    {/* COLUMN 6: Member count */}
                    <TableCell sx={tdSx}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        <PeopleOutlined sx={{ fontSize: 13, color: C.textSecondary }} />
                        <Typography sx={{ fontFamily: FONT, fontSize: "0.82rem" }}>
                          {org.member_count}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* COLUMN 7: Created date */}
                    <TableCell sx={{ ...tdSx, color: C.textSecondary, fontSize: "0.75rem" }}>
                      {fmtDate(org.created_at)}
                    </TableCell>

                    {/* COLUMN 8: Actions */}
                    <TableCell sx={tdSx}>
                      <Box sx={{ display: "flex", gap: 0.75 }}>

                        {/* ACTIVATE / EXTEND button — always shown */}
                        <Tooltip title={org.status === "active" ? "Extend Plan" : "Activate"} arrow>
                          <span>
                          <IconButton
                            size="small"
                            disabled={actionLoading === org.id}
                            onClick={() => { setSelectedOrg(org); setActivateOpen(true); }}
                            sx={actionBtnSx(C.green)}
                          >
                            <AttachMoneyOutlined sx={{ fontSize: 15 }} />
                          </IconButton>
                          </span>
                        </Tooltip>

                        {/* SUSPEND button — shown when active or trial */}
                        {(org.status === "active" || org.status === "trial") && (
                          <Tooltip title="Suspend" arrow>
                            <span>
                            <IconButton
                              size="small"
                              disabled={actionLoading === org.id}
                              onClick={() => handleSuspend(org)}
                              sx={actionBtnSx(C.red)}
                            >
                              <BlockOutlined sx={{ fontSize: 15 }} />
                            </IconButton>
                            </span>
                          </Tooltip>
                        )}

                        {/* REACTIVATE button — shown when suspended or expired */}
                        {(org.status === "suspended" || org.status === "expired") && (
                          <Tooltip title="Reactivate" arrow>
                            <span>
                            <IconButton
                              size="small"
                              disabled={actionLoading === org.id}
                              onClick={() => handleReactivate(org)}
                              sx={actionBtnSx(C.accent)}
                            >
                              <RefreshOutlined sx={{ fontSize: 15 }} />
                            </IconButton>
                            </span>
                          </Tooltip>
                        )}

                      </Box>
                    </TableCell>

                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Box>
      )}

      {/* ── ACTIVATE DIALOG ── */}
      <ActivateDialog
        open={activateOpen}
        org={selectedOrg}
        onClose={() => { setActivateOpen(false); setSelectedOrg(null); }}
        onSuccess={loadData}
      />

    </Box>
  );
}