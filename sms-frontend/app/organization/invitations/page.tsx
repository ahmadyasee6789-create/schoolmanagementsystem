"use client";

import { useState, useEffect } from "react";
import {
  Box, Chip, Grid, IconButton, MenuItem, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
  Tooltip, Button, useMediaQuery, useTheme,
} from "@mui/material";
import {
  Delete, ContentCopy, EmailOutlined, SendOutlined,
  CheckCircleOutlined, HourglassEmptyOutlined,
  AdminPanelSettingsOutlined, SchoolOutlined, ManageAccountsOutlined,
  PersonAddOutlined,
} from "@mui/icons-material";
import { useAuthStore } from "@/app/store/authStore";
import { getInvitations, sendInvitation, deleteInvitation } from "@/app/lib/invitations";
import toast from "react-hot-toast";
import {
  C, FONT, EASE, inputSx, menuProps, thSx, tdSx,
  GlobalStyles, PageHeader, EmptyState, DataTable, DeleteDialog,
} from "@/components/ui";
import DashboardLayout from "@/app/(dashboard)/layout";

// ─── Types ──────────────────────────────────────────────────────────────
type Invitation = {
  id: number;
  email: string;
  role: string;
  status: "pending" | "accepted";
  token?: string;
};

// ─── Config ──────────────────────────────────────────────────────────────
const ROLES = ["admin", "teacher", "accountant"];

const ROLE_CONFIG: Record<string, { color: string; dim: string; icon: any }> = {
  admin:      { color: C.red,    dim: C.redDim,    icon: AdminPanelSettingsOutlined  },
  teacher:    { color: C.green,  dim: C.greenDim,  icon: SchoolOutlined              },
  accountant: { color: C.blue,   dim: C.blueDim,   icon: ManageAccountsOutlined      },
};
const roleConf = (r: string) => ROLE_CONFIG[r] ?? { color: C.accent, dim: C.accentDim, icon: PersonAddOutlined };

// ─── Chips ────────────────────────────────────────────────────────────────
function RoleChip({ role }: { role: string }) {
  const cfg = roleConf(role);
  return (
    <Chip label={role.charAt(0).toUpperCase() + role.slice(1)} size="small" sx={{
      backgroundColor: cfg.dim, color: cfg.color,
      fontFamily: FONT, fontWeight: 600, fontSize: "0.7rem",
      height: 22, border: `1px solid ${cfg.color}25`,
    }} />
  );
}

function StatusChip({ status }: { status: string }) {
  const accepted = status === "accepted";
  return (
    <Chip
      icon={accepted
        ? <CheckCircleOutlined      sx={{ fontSize: "13px !important", color: `${C.green}  !important` }} />
        : <HourglassEmptyOutlined   sx={{ fontSize: "13px !important", color: `${C.accent} !important` }} />
      }
      label={accepted ? "Accepted" : "Pending"} size="small"
      sx={{
        backgroundColor: accepted ? C.greenDim  : C.accentDim,
        color:           accepted ? C.green     : C.accent,
        fontFamily: FONT, fontWeight: 600, fontSize: "0.7rem",
        height: 22, border: `1px solid ${accepted ? C.green : C.accent}25`,
        "& .MuiChip-icon": { ml: "6px" },
      }}
    />
  );
}

// ─── Mobile invite card ───────────────────────────────────────────────────
function InviteCard({ invite, onCopy, onDelete }: {
  invite: Invitation; onCopy: () => void; onDelete: () => void;
}) {
  const cfg = roleConf(invite.role);
  return (
    <Box sx={{
      backgroundColor: C.surface, border: `1px solid ${C.border}`,
      borderRadius: "12px", p: 2, mb: 1.5,
      transition: `border-color ${EASE}`,
      "&:hover": { borderColor: `${cfg.color}30` },
    }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1.25 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Box sx={{
            width: 34, height: 34, borderRadius: "50%",
            backgroundColor: cfg.dim, border: `1px solid ${cfg.color}25`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <EmailOutlined sx={{ fontSize: 16, color: cfg.color }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "0.88rem", color: C.textPrimary, fontFamily: FONT, lineHeight: 1.2 }}>
              {invite.email}
            </Typography>
            <Box sx={{ display: "flex", gap: 0.75, mt: 0.4 }}>
              <RoleChip role={invite.role} />
              <StatusChip status={invite.status} />
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {invite.status === "pending" && (
            <IconButton size="small" onClick={onCopy} sx={{
              color: C.textSecondary, borderRadius: "7px", p: 0.6,
              "&:hover": { backgroundColor: C.accentDim, color: C.accent },
              transition: `all ${EASE}`,
            }}>
              <ContentCopy sx={{ fontSize: 14 }} />
            </IconButton>
          )}
          <IconButton size="small" onClick={onDelete} sx={{
            color: C.textSecondary, borderRadius: "7px", p: 0.6,
            "&:hover": { backgroundColor: C.redDim, color: C.red },
            transition: `all ${EASE}`,
          }}>
            <Delete sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function InvitationsPage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { user } = useAuthStore();

  const [email,           setEmail]           = useState("");
  const [role,            setRole]            = useState("teacher");
  const [sending,         setSending]         = useState(false);
  const [invitations,     setInvitations]     = useState<Invitation[]>([]);
  const [loadingInvites,  setLoadingInvites]  = useState(true);
  const [deleteId,        setDeleteId]        = useState<number | null>(null);
  const [deleting,        setDeleting]        = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await getInvitations();
        setInvitations(data);
      } catch (err: any) {
        toast.error(err.response?.data?.detail || "Failed to fetch invitations");
      } finally {
        setLoadingInvites(false);
      }
    })();
  }, []);

  // ── Send invite ────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!email)              return toast.error("Please enter an email address");
    if (!email.includes("@")) return toast.error("Please enter a valid email address");
    setSending(true);
    try {
      await sendInvitation({ email, role });
      const updated = await getInvitations();
      setInvitations(updated);
      setEmail("");
      toast.success(`Invitation sent to ${email}`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to send invitation");
    } finally { setSending(false); }
  };

  // ── Copy link ──────────────────────────────────────────────────────
  const copyInviteLink = (token?: string) => {
    if (!token) return toast.error("No invite token available");
    const link = `${window.location.origin}/signup?invite=${token}`;
    navigator.clipboard.writeText(link)
      .then(() => toast.success("Invite link copied to clipboard!"))
      .catch(() => toast.error("Failed to copy invite link"));
  };

  // ── Delete ─────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteInvitation(deleteId);
      setInvitations(prev => prev.filter(i => i.id !== deleteId));
      setDeleteId(null);
      toast.success("Invitation deleted");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to delete invitation");
    } finally { setDeleting(false); }
  };

  // ── Stats ──────────────────────────────────────────────────────────
  const pending  = invitations.filter(i => i.status === "pending").length;
  const accepted = invitations.filter(i => i.status === "accepted").length;

  if (!user) return null;

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
    <>
      <GlobalStyles />

      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: "100%" }}>

        {/* ── Header ──────────────────────────────────────────── */}
        <PageHeader
          title="Invitations"
          subtitle="Invite team members to join your organization"
          isMobile={isMobile}
        />

        {/* ── Send invite form ─────────────────────────────────── */}
        <Box sx={{
          backgroundColor: C.surface, border: `1px solid ${C.border}`,
          borderRadius: "14px", p: { xs: 2, sm: 2.5 }, mb: 3,
        }}>
          {/* Section label */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <SendOutlined sx={{ fontSize: 14, color: C.accent }} />
            <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.7rem", fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase", color: C.textSecondary }}>
              Send Invitation
            </Typography>
          </Box>

          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} sm={5}>
              <TextField
                fullWidth size="small" label="Email Address" type="email"
                placeholder="user@example.com" sx={inputSx}
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && email && handleInvite()}
                InputProps={{ startAdornment: <EmailOutlined sx={{ fontSize: 16, color: C.textSecondary, mr: 0.75 }} /> }}
              />
            </Grid>

            <Grid item xs={12} sm={3}>
              <TextField
                select fullWidth size="small" label="Role" sx={inputSx}
                value={role}
                onChange={e => setRole(e.target.value)}
                SelectProps={{ MenuProps: menuProps }}
              >
                {ROLES.map(r => {
                  const cfg = roleConf(r);
                  return (
                    <MenuItem key={r} value={r}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: cfg.color }} />
                        <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </Typography>
                      </Box>
                    </MenuItem>
                  );
                })}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={4}>
              <Button
                fullWidth variant="contained"
                onClick={handleInvite}
                disabled={sending || !email}
                startIcon={<SendOutlined sx={{ fontSize: 15 }} />}
                sx={{
                  backgroundColor: C.accent, color: "#111827",
                  fontFamily: FONT, fontWeight: 600,
                  textTransform: "none", borderRadius: "10px", height: 40,
                  "&:hover": { backgroundColor: "#FBBF24" },
                  "&.Mui-disabled": { backgroundColor: "rgba(245,158,11,0.2)", color: "rgba(17,24,39,0.4)" },
                }}
              >
                {sending ? "Sending…" : "Send Invite"}
              </Button>
            </Grid>
          </Grid>
        </Box>

        {/* ── Stats row ────────────────────────────────────────── */}
        {!loadingInvites && invitations.length > 0 && (
          <Box sx={{ display: "flex", gap: 1.5, mb: 2.5 }}>
            {[
              { label: "Total",    value: invitations.length, color: C.accent, dim: C.accentDim },
              { label: "Pending",  value: pending,            color: C.accent, dim: C.accentDim },
              { label: "Accepted", value: accepted,           color: C.green,  dim: C.greenDim  },
            ].map(s => (
              <Box key={s.label} sx={{
                display: "flex", alignItems: "center", gap: 1,
                backgroundColor: s.dim, border: `1px solid ${s.color}25`,
                borderRadius: "10px", px: 1.75, py: 0.9,
              }}>
                <Typography sx={{ fontFamily: '"DM Mono", monospace', fontWeight: 700, fontSize: "1rem", color: s.color, lineHeight: 1 }}>
                  {s.value}
                </Typography>
                <Typography sx={{ fontFamily: FONT, fontSize: "0.72rem", color: C.textSecondary }}>
                  {s.label}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* ── Content ─────────────────────────────────────────── */}
        {loadingInvites ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <Box sx={{
              width: 32, height: 32, borderRadius: "50%",
              border: `3px solid ${C.accentDim}`, borderTopColor: C.accent,
              animation: "spin 0.7s linear infinite",
              "@keyframes spin": { to: { transform: "rotate(360deg)" } },
            }} />
          </Box>

        ) : invitations.length === 0 ? (
          <EmptyState icon={PersonAddOutlined} message="No invitations found. Send one above to get started." />

        ) : isMobile ? (
          /* ── Mobile cards ──────────────────────────────────── */
          <Box>
            {invitations.map(invite => (
              <InviteCard
                key={invite.id}
                invite={invite}
                onCopy={() => copyInviteLink(invite.token)}
                onDelete={() => setDeleteId(invite.id)}
              />
            ))}
          </Box>

        ) : (
          /* ── Desktop table ──────────────────────────────────── */
          <DataTable>
            <Table>
              <TableHead>
                <TableRow>
                  {["Email", "Role", "Status", "Actions"].map(h => (
                    <TableCell key={h} sx={thSx}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {invitations.map((invite, i) => (
                  <TableRow
                    key={invite.id}
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
                    {/* Email */}
                    <TableCell sx={tdSx}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Box sx={{
                          width: 30, height: 30, borderRadius: "50%",
                          backgroundColor: roleConf(invite.role).dim,
                          border: `1px solid ${roleConf(invite.role).color}20`,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          <EmailOutlined sx={{ fontSize: 14, color: roleConf(invite.role).color }} />
                        </Box>
                        <Typography sx={{ fontFamily: '"DM Mono", monospace', fontSize: "0.82rem", color: C.textPrimary }}>
                          {invite.email}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Role */}
                    <TableCell sx={tdSx}>
                      <RoleChip role={invite.role} />
                    </TableCell>

                    {/* Status */}
                    <TableCell sx={tdSx}>
                      <StatusChip status={invite.status} />
                    </TableCell>

                    {/* Actions */}
                    <TableCell sx={tdSx}>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        {invite.status === "pending" && (
                          <Tooltip title="Copy invite link" arrow>
                            <IconButton size="small" onClick={() => copyInviteLink(invite.token)} sx={{
                              color: C.textSecondary, borderRadius: "8px", p: 0.75,
                              "&:hover": { backgroundColor: C.accentDim, color: C.accent },
                              transition: `all ${EASE}`,
                            }}>
                              <ContentCopy sx={{ fontSize: 15 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Delete invitation" arrow>
                          <IconButton size="small" onClick={() => setDeleteId(invite.id)} sx={{
                            color: C.textSecondary, borderRadius: "8px", p: 0.75,
                            "&:hover": { backgroundColor: C.redDim, color: C.red },
                            transition: `all ${EASE}`,
                          }}>
                            <Delete sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
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
          title="Delete Invitation?"
          description="This will permanently revoke the invitation. The invite link will no longer work."
        />

      </Box>
    </>
      </DashboardLayout>
  );
}