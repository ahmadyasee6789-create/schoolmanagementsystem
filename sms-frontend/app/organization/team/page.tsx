"use client";

import { useEffect, useState } from "react";
import {
  Box, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Typography, Tooltip, Button,
  useMediaQuery, useTheme,
} from "@mui/material";
import {
  Delete, Close, PersonOutlined, AdminPanelSettingsOutlined,
  ManageAccountsOutlined, SchoolOutlined, PeopleOutlined,
} from "@mui/icons-material";
import { useAuthStore } from "@/app/store/authStore";
import { useRouter } from "next/navigation";
import { api } from "@/app/lib/api";
import {
  C, FONT, EASE, thSx, tdSx,
  GlobalStyles, PageHeader, EmptyState, DataTable,
  DeleteDialog, StatCard,
} from "@/components/ui";
import DashboardLayout from "@/app/(dashboard)/layout";

// ─── Types ──────────────────────────────────────────────────────────────
type Member = {
  id: number;
  full_name: string;
  email: string;
  role: "admin" | "manager" | "teacher"|"accountant";
};

// ─── Role config ─────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  admin:   { label: "Admin",   color: C.red,    dim: C.redDim,    icon: AdminPanelSettingsOutlined  },
  manager: { label: "Manager", color: C.blue,   dim: C.blueDim,   icon: ManageAccountsOutlined      },
  teacher: { label: "Teacher", color: C.green,  dim: C.greenDim,  icon: SchoolOutlined              },
  accountant:{label:"accountant",color:C.purple,dim:C.purpleDim,icon:ManageAccountsOutlined}

};

function RoleChip({ role }: { role: Member["role"] }) {
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.teacher;
  return (
    <Chip
      label={cfg.label} size="small"
      sx={{
        backgroundColor: cfg.dim, color: cfg.color,
        fontFamily: FONT, fontWeight: 600, fontSize: "0.7rem",
        height: 22, border: `1px solid ${cfg.color}25`,
      }}
    />
  );
}

// ─── Mobile member card ──────────────────────────────────────────────────
function MemberCard({ member, onDelete }: { member: Member; onDelete: () => void }) {
  const cfg = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.teacher;
  return (
    <Box sx={{
      backgroundColor: C.surface, border: `1px solid ${C.border}`,
      borderRadius: "12px", p: 2, mb: 1.5,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      transition: `border-color ${EASE}`,
      "&:hover": { borderColor: `${cfg.color}30` },
    }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box sx={{
          width: 36, height: 36, borderRadius: "50%",
          backgroundColor: cfg.dim, border: `1px solid ${cfg.color}25`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <PersonOutlined sx={{ fontSize: 18, color: cfg.color }} />
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: "0.925rem", color: C.textPrimary, fontFamily: FONT, lineHeight: 1.2 }}>
            {member.full_name}
          </Typography>
          <Typography sx={{ fontSize: "0.72rem", color: C.textSecondary, fontFamily: FONT }}>
            {member.email}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <RoleChip role={member.role} />
        <IconButton size="small" onClick={onDelete} sx={{
          color: C.textSecondary, borderRadius: "8px", p: 0.75,
          "&:hover": { backgroundColor: C.redDim, color: C.red },
          transition: `all ${EASE}`,
        }}>
          <Delete sx={{ fontSize: 15 }} />
        </IconButton>
      </Box>
    </Box>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function OrganizationTeamPage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const router   = useRouter();
  const { user, hydrated, token } = useAuthStore();

  const [members,  setMembers]  = useState<Member[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Delete
  const [deleteId,  setDeleteId]  = useState<number | null>(null);
  const [deleting,  setDeleting]  = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    if (!user || !token) {
      setError("Unauthorized. Redirecting…");
      setTimeout(() => router.replace("/signin"), 1500);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        const res = await api.get("/organization/team");
        setMembers(res.data);
        setError(null);
      } catch (err: any) {
        if (err.response?.status === 401) {
          setError("Session expired. Redirecting to login…");
          setTimeout(() => router.replace("/signin"), 2000);
        } else if (err.response?.status === 403) {
          setError("Access denied.");
          setTimeout(() => router.replace("/"), 2000);
        } else {
          setError(err.response?.data?.detail || "Failed to load team members");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, token, user, router]);

  // ── Delete ─────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/organization/team/${deleteId}`);
      setMembers(prev => prev.filter(m => m.id !== deleteId));
      setDeleteId(null);
    } catch (err: any) {
      // re-use toast if available, else fallback
      console.error(err.response?.data?.detail || "Failed to remove member");
    } finally {
      setDeleting(false);
    }
  };

  // ── Stats ──────────────────────────────────────────────────────────
  const stats = {
    total:   members.length,
    admins:  members.filter(m => m.role === "admin").length,
    teachers:members.filter(m => m.role === "teacher").length,
    managers:members.filter(m => m.role === "manager").length,
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
    <>
      <GlobalStyles />

      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: "100%" }}>

        {/* ── Header ──────────────────────────────────────────── */}
        <PageHeader
          title="Team Members"
          subtitle="Manage staff roles and access across your organization"
          isMobile={isMobile}
        />

        {/* ── Stat cards ──────────────────────────────────────── */}
        {!loading && !error && (
          <Grid container spacing={{ xs: 1.5, md: 2 }} sx={{ mb: { xs: 2.5, md: 3 } }}>
            {[
              { label: "Total Members", value: stats.total,    color: C.accent, dim: C.accentDim, icon: PeopleOutlined,              delay: 0   },
              { label: "Admins",        value: stats.admins,   color: C.red,    dim: C.redDim,    icon: AdminPanelSettingsOutlined,   delay: 60  },
              { label: "Teachers",      value: stats.teachers, color: C.green,  dim: C.greenDim,  icon: SchoolOutlined,              delay: 120 },
              { label: "Managers",      value: stats.managers, color: C.blue,   dim: C.blueDim,   icon: ManageAccountsOutlined,      delay: 180 },
            ].map((s, i) => (
              <Grid item xs={6} md={3} key={i}>
                <StatCard {...s} />
              </Grid>
            ))}
          </Grid>
        )}

        {/* ── Error state ──────────────────────────────────────── */}
        {error ? (
          <Box sx={{
            p: 3, borderRadius: "12px",
            backgroundColor: C.redDim, border: `1px solid ${C.red}25`,
          }}>
            <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem", color: C.red }}>
              {error}
            </Typography>
          </Box>

        ) : loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <Box sx={{
              width: 32, height: 32, borderRadius: "50%",
              border: `3px solid ${C.accentDim}`, borderTopColor: C.accent,
              animation: "spin 0.7s linear infinite",
              "@keyframes spin": { to: { transform: "rotate(360deg)" } },
            }} />
          </Box>

        ) : members.length === 0 ? (
          <EmptyState icon={PeopleOutlined} message="No team members found" />

        ) : isMobile ? (
          /* ── Mobile cards ──────────────────────────────────── */
          <Box>
            {members.map(m => (
              <MemberCard key={m.id} member={m} onDelete={() => setDeleteId(m.id)} />
            ))}
          </Box>

        ) : (
          /* ── Desktop table ──────────────────────────────────── */
          <DataTable>
            <Table>
              <TableHead>
                <TableRow>
                  {["Member", "Email", "Role", "Actions"].map(h => (
                    <TableCell key={h} sx={thSx}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {members.map((m, i) => {
                  const cfg = ROLE_CONFIG[m.role] ?? ROLE_CONFIG.teacher;
                  return (
                    <TableRow
                      key={m.id}
                      sx={{
                        "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" },
                        transition: `background ${EASE}`,
                        animation: `fadeUp 0.3s ${i * 30}ms ease both`,
                        "@keyframes fadeUp": {
                          from: { opacity: 0, transform: "translateY(8px)" },
                          to:   { opacity: 1, transform: "translateY(0)" },
                        },
                      }}
                    >
                      {/* Name */}
                      <TableCell sx={tdSx}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          <Box sx={{
                            width: 32, height: 32, borderRadius: "50%",
                            backgroundColor: cfg.dim, border: `1px solid ${cfg.color}25`,
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
                            <PersonOutlined sx={{ fontSize: 15, color: cfg.color }} />
                          </Box>
                          <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: "0.875rem", color: C.textPrimary }}>
                            {m.full_name}
                          </Typography>
                        </Box>
                      </TableCell>

                      {/* Email */}
                      <TableCell sx={{ ...tdSx, fontFamily: '"DM Mono", monospace', fontSize: "0.8rem", color: C.textSecondary }}>
                        {m.email}
                      </TableCell>

                      {/* Role */}
                      <TableCell sx={tdSx}>
                        <RoleChip role={m.role} />
                      </TableCell>

                      {/* Actions */}
                      <TableCell sx={tdSx}>
                        <Tooltip title="Remove Member" arrow>
                          <IconButton size="small" onClick={() => setDeleteId(m.id)} sx={{
                            color: C.textSecondary, borderRadius: "8px", p: 0.75,
                            "&:hover": { backgroundColor: C.redDim, color: C.red },
                            transition: `all ${EASE}`,
                          }}>
                            <Delete sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </DataTable>
        )}

        {/* ── Delete Confirm ─────────────────────────────────── */}
        <DeleteDialog
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={confirmDelete}
          loading={deleting}
          title="Remove Team Member?"
          description="This will remove the member from your organization. They will lose access immediately."
        />

      </Box>
    </>
      </DashboardLayout>
  );
}