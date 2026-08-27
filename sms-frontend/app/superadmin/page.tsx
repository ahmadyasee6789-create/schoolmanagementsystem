"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Typography } from "@mui/material";
import { BusinessOutlined } from "@mui/icons-material";
import LogoutIcon from "@mui/icons-material/Logout";

import { useAuthStore } from "@/app/store/authStore";
import { C, DISPLAY, FONT } from "./constants";
import { fadeUp, spin } from "./styles";
import { useSuperAdminOrgs } from "./hooks/useSuperAdminOrgs";

import { StatsGrid } from "./components/StatsGrid";
import { FilterBar } from "./components/FilterBar";
import { OrganizationsTable } from "./components/OrganizationsTable";
import { ActivateDialog } from "./components/ActivateDialog";
import { ConfirmDialog } from "./components/ConfirmDialog";

export default function SuperAdminPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const {
    stats, loading, filteredOrgs,
    searchText, setSearchText, filterStatus, setFilterStatus,
    loadData,
    activateOpen, selectedOrg, openActivate, closeActivate,
    suspendTarget, requestSuspend, cancelSuspend, confirmSuspend,
    handleReactivate,
    actionLoading,
  } = useSuperAdminOrgs();

  // ── route guard: only superadmins may view this page ──
  useEffect(() => {
    if (user && !user.is_superadmin) {
      router.replace("/");
    }
  }, [user, router]);

  const handleLogout = async () => {
    logout();
    router.replace("/signin");
  };

  // Don't render admin data while we're not sure the user is authorized
  if (user && !user.is_superadmin) {
    return null;
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, backgroundColor: C.bg, minHeight: "100vh", fontFamily: FONT }}>

      {/* ── HEADER ── */}
      <Box sx={{ mb: 4, animation: "fadeUp 0.3s ease both", ...fadeUp }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: "10px",
            backgroundColor: C.accentDim, border: `1px solid ${C.accent}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <BusinessOutlined sx={{ fontSize: 18, color: C.accent }} />
          </Box>
          <Typography sx={{
            fontFamily: DISPLAY, fontSize: "1.8rem", color: C.textPrimary,
            lineHeight: 1, letterSpacing: "-0.02em",
          }}>
            Super Admin
          </Typography>
        </Box>
        <Typography sx={{ fontFamily: FONT, fontSize: "0.75rem", color: C.textSecondary, ml: 6.5 }}>
          Manage all organizations · approve · suspend · extend plans
        </Typography>
        <Button onClick={handleLogout} startIcon={<LogoutIcon />}>
          Logout
        </Button>
      </Box>

      {/* ── STATS ── */}
      {stats && <StatsGrid stats={stats} />}

      {/* ── FILTERS ── */}
      <FilterBar
        searchText={searchText}
        onSearchChange={setSearchText}
        filterStatus={filterStatus}
        onFilterChange={setFilterStatus}
        onRefresh={loadData}
        loading={loading}
        resultCount={filteredOrgs.length}
      />

      {/* ── TABLE ── */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: "50%",
            border: `3px solid ${C.border}`, borderTopColor: C.accent,
            animation: "spin 0.7s linear infinite", ...spin,
          }} />
        </Box>
      ) : (
        <OrganizationsTable
          orgs={filteredOrgs}
          actionLoadingId={actionLoading}
          onActivate={openActivate}
          onSuspend={requestSuspend}
          onReactivate={handleReactivate}
        />
      )}

      {/* ── DIALOGS ── */}
      <ActivateDialog
        open={activateOpen}
        org={selectedOrg}
        onClose={closeActivate}
        onSuccess={loadData}
      />

      <ConfirmDialog
        open={!!suspendTarget}
        title="Suspend organization"
        message={`Suspend ${suspendTarget?.name ?? "this organization"}? They will lose access immediately. This can be undone with Reactivate.`}
        confirmLabel="Suspend"
        danger 
        loading={actionLoading === suspendTarget?.id}
        onConfirm={confirmSuspend}
        onClose={cancelSuspend}
      />

    </Box>
  );
}