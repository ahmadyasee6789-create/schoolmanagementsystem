// app/superadmin/hooks/useSuperAdminOrgs.ts
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { useAuthStore } from "@/app/store/authStore";
import { getErrorMessage, isUnauthorized } from "../helpers";
import type { Organization, Stats } from "../types";

export function useSuperAdminOrgs() {
  const router = useRouter();
  const { logout } = useAuthStore();

  // ── data ──
  const [orgs,    setOrgs]    = useState<Organization[]>([]);
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // ── filters ──
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchText,   setSearchText]   = useState("");

  // ── activate dialog ──
  const [activateOpen, setActivateOpen] = useState(false);
  const [selectedOrg,  setSelectedOrg]  = useState<Organization | null>(null);

  // ── suspend confirm dialog ──
  const [suspendTarget, setSuspendTarget] = useState<Organization | null>(null);

  // ── per-row action spinner ──
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  function handleSessionExpired() {
    toast.error("Your session has expired. Please sign in again.");
    logout();
    router.replace("/signin");
  }

  async function loadData() {
    setLoading(true);
    try {
      const [orgsRes, statsRes] = await Promise.all([
        api.get("/superadmin/organizations"),
        api.get("/superadmin/stats"),
      ]);
      setOrgs(orgsRes.data);
      setStats(statsRes.data);
    } catch (err) {
      if (isUnauthorized(err)) {
        handleSessionExpired();
        return;
      }
      toast.error(getErrorMessage(err, "Failed to load organizations"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  // ── activate / extend ──
  function openActivate(org: Organization) {
    setSelectedOrg(org);
    setActivateOpen(true);
  }
  function closeActivate() {
    setActivateOpen(false);
    setSelectedOrg(null);
  }

  // ── suspend (with confirmation) ──
  function requestSuspend(org: Organization) {
    setSuspendTarget(org);
  }
  function cancelSuspend() {
    setSuspendTarget(null);
  }
  async function confirmSuspend() {
    const org = suspendTarget;
    if (!org) return;
    setActionLoading(org.id);
    try {
      await api.post(`/superadmin/organizations/${org.id}/suspend`);
      toast.success(`${org.name} suspended`);
      setSuspendTarget(null);
      await loadData();
    } catch (err) {
      if (isUnauthorized(err)) { handleSessionExpired(); return; }
      toast.error(getErrorMessage(err, "Failed to suspend organization"));
    } finally {
      setActionLoading(null);
    }
  }

  // ── reactivate ──
  async function handleReactivate(org: Organization) {
    setActionLoading(org.id);
    try {
      await api.post(`/superadmin/organizations/${org.id}/reactivate`);
      toast.success(`${org.name} reactivated`);
      await loadData();
    } catch (err) {
      if (isUnauthorized(err)) { handleSessionExpired(); return; }
      toast.error(getErrorMessage(err, "Failed to reactivate organization"));
    } finally {
      setActionLoading(null);
    }
  }

  // ── filtered list ──
  const filteredOrgs = useMemo(() => {
    const q = searchText.toLowerCase();
    return orgs.filter((org) => {
      const matchesStatus = filterStatus === "all" || org.status === filterStatus;
      const matchesSearch =
        org.name.toLowerCase().includes(q) ||
        org.admin_email.toLowerCase().includes(q) ||
        org.admin_name.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [orgs, filterStatus, searchText]);

  return {
    // data
    stats, loading, filteredOrgs,
    // filters
    searchText, setSearchText, filterStatus, setFilterStatus,
    // refresh
    loadData,
    // activate dialog
    activateOpen, selectedOrg, openActivate, closeActivate,
    // suspend confirm dialog
    suspendTarget, requestSuspend, cancelSuspend, confirmSuspend,
    // reactivate
    handleReactivate,
    // row spinner state
    actionLoading,
  };
}