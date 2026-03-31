"use client";

// ─── IMPORTS ────────────────────────────────────────────────
import { useState, useEffect } from "react";
import {
  Box, Typography,
  Table, TableBody,
  TableRow, TableHead,
  TableCell, Chip,
  TextField, MenuItem,
  Button, Dialog,
  DialogTitle, DialogContent,
  DialogActions, Grid,
  IconButton, Tooltip,
  useMediaQuery, useTheme,
} from "@mui/material";
import { Edit, Delete } from "@mui/icons-material";
import { api } from "@/app/lib/api";

// ─── TYPE ────────────────────────────────────────────────────
// Shape of one employee — matches your database model
type Employee = {
  id:           number;
  full_name:    string;
  email:        string;
  phone:        string;
  role:         string;
  joining_date: string;
  status:       string;
  source:"employee"|"member";
};

// ─── COLORS ──────────────────────────────────────────────────
const C = {
  bg:            "#111827",
  surface:       "#1f2937",
  border:        "#374151",
  accent:        "#f59e0b",
  textPrimary:   "#f9fafb",
  textSecondary: "#9ca3af",
};

const FONT = '"Inter", sans-serif';

// ─── TABLE STYLES ────────────────────────────────────────────
const thSx = {
  backgroundColor: "#1f2937",
  color:           "#6b7280",
  fontSize:        "0.72rem",
  fontWeight:      700,
  textTransform:   "uppercase",
  letterSpacing:   "0.08em",
  borderBottom:    "1px solid #374151",
  fontFamily:      FONT,
  padding:         "12px 16px",
};

const tdSx = {
  borderBottom: "1px solid #1f2937",
  color:        "#d1d5db",
  fontSize:     "0.875rem",
  fontFamily:   FONT,
  padding:      "14px 16px",
};

// ─── INPUT STYLE ─────────────────────────────────────────────
// FIX 1: borderColor (lowercase b), &:hover (no space), Mui-focused (not focuses)
const inputSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "#1f2937",
    borderRadius:    "10px",
    fontFamily:      FONT,
    color:           "#f9fafb",
    "& fieldset": {
      borderColor: "#374151",           // ✅ fixed: was BorderColor
    },
    "&:hover fieldset": {
      borderColor: "#f59e0b",           // ✅ fixed: was "&: hover" with space
    },
    "&.Mui-focused fieldset": {
      borderColor: "#f59e0b",           // ✅ fixed: was "Mui-focuses"
    },
  },
  "& .MuiInputLabel-root": {
    color:      "#6b7280",
    fontFamily: FONT,
    "&.Mui-focused": { color: "#f59e0b" },
  },
};

// ─── BUTTON STYLE ────────────────────────────────────────────
const primaryBtnSx = {
  backgroundColor: "#f59e0b",
  color:           "#111827",
  fontFamily:      FONT,
  fontWeight:      700,
  textTransform:   "none",
  borderRadius:    "10px",
  px:              2.5,
  "&:hover":       { backgroundColor: "#fbbf24" },
  "&.Mui-disabled": {
    backgroundColor: "rgba(245,158,11,0.2)",
    color:           "rgba(17,24,39,0.4)",
  },
};

// ─── SMALL COMPONENTS ────────────────────────────────────────

// Loading spinner
function Spinner() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
      <Box sx={{
        width:          32,
        height:         32,
        borderRadius:   "50%",
        border:         "3px solid #374151",
        borderTopColor: "#f59e0b",
        animation:      "spin 0.7s linear infinite",
        "@keyframes spin": { to: { transform: "rotate(360deg)" } },
      }} />
    </Box>
  );
}
function SourceBadge({ source }: { source: string }) {
  const isMember = source === "member";
  return (
    <Chip
      label={isMember ? "Member" : "Employee"}
      size="small"
      sx={{
        backgroundColor: isMember ? "#1e1b4b" : "#064e3b",
        color:           isMember ? "#818cf8" : "#10b981",
        border:          `1px solid ${isMember ? "#818cf830" : "#10b98130"}`,
        fontWeight:      700,
        fontSize:        "0.7rem",
        height:          22,
        fontFamily:      FONT,
      }}
    />
  );
}
// ── MOBILE CARD ──
// Shows one employee as a card on small screens
function EmployeeCard({
  emp,
  onEdit,
  onDelete,
  formatDate,
}: {
  emp:        Employee;
  onEdit:     () => void;
  onDelete:   () => void;
  formatDate: (d?: string) => string;
}) {
  const isMember = emp.source === "member";

  return (
    <Box sx={{
      backgroundColor: "#1f2937",
      border:          "1px solid #374151",
      borderRadius:    "12px",
      p:               2,
      mb:              1.5,
      transition:      "border-color 0.15s",
      "&:hover":       { borderColor: "#f59e0b40" },
    }}>

      {/* TOP ROW: name + status */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1.5 }}>
        <Box>
          <Typography sx={{
            fontWeight:  700,
            fontSize:    "0.95rem",
            color:       "#f9fafb",
            fontFamily:  FONT,
            lineHeight:  1.2,
          }}>
            {emp.full_name}
          </Typography>
          <Typography sx={{ fontSize: "0.75rem", color: "#9ca3af", fontFamily: FONT, mt: 0.25 }}>
            {emp.email || "—"}
          </Typography>
        </Box>
        <StatusBadge status={emp.status} />
      </Box>

      {/* MIDDLE ROW: role + source badges */}
      <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
        {/* Role badge */}
        <Chip
          label={emp.role}
          size="small"
          sx={{
            backgroundColor: "#1e3a5f",
            color:           "#60a5fa",
            fontWeight:      600,
            fontSize:        "0.7rem",
            height:          22,
            fontFamily:      FONT,
            textTransform:   "capitalize",
          }}
        />
        {/* Source badge */}
        <Chip
          label={isMember ? "Member" : "Employee"}
          size="small"
          sx={{
            backgroundColor: isMember ? "#1e1b4b" : "#064e3b",
            color:           isMember ? "#818cf8" : "#10b981",
            fontWeight:      700,
            fontSize:        "0.7rem",
            height:          22,
            fontFamily:      FONT,
          }}
        />
      </Box>

      {/* INFO ROW: phone + joined date */}
      <Box sx={{ display: "flex", gap: 3, mb: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: "0.65rem", color: "#6b7280", fontFamily: FONT, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Phone
          </Typography>
          <Typography sx={{ fontSize: "0.8rem", color: "#d1d5db", fontFamily: "monospace" }}>
            {emp.phone || "—"}
          </Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: "0.65rem", color: "#6b7280", fontFamily: FONT, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Joined
          </Typography>
          <Typography sx={{ fontSize: "0.8rem", color: "#d1d5db", fontFamily: "monospace" }}>
            {formatDate(emp.joining_date)}
          </Typography>
        </Box>
      </Box>

      {/* BOTTOM ROW: action buttons */}
      {!isMember && (
        <Box sx={{ display: "flex", gap: 1 }}>
          {/* Edit button */}
          <Button
            size="small"
            onClick={onEdit}
            startIcon={<Edit sx={{ fontSize: 13 }} />}
            sx={{
              color:           "#f59e0b",
              fontFamily:      FONT,
              fontWeight:      600,
              fontSize:        "0.72rem",
              textTransform:   "none",
              borderRadius:    "7px",
              px:              1.5,
              border:          "1px solid #f59e0b30",
              "&:hover":       { backgroundColor: "rgba(245,158,11,0.08)" },
              transition:      "all 0.15s",
            }}
          >
            Edit
          </Button>

          {/* Delete button */}
          <Button
            size="small"
            onClick={onDelete}
            startIcon={<Delete sx={{ fontSize: 13 }} />}
            sx={{
              color:         "#ef4444",
              fontFamily:    FONT,
              fontWeight:    600,
              fontSize:      "0.72rem",
              textTransform: "none",
              borderRadius:  "7px",
              px:            1.5,
              border:        "1px solid #ef444430",
              "&:hover":     { backgroundColor: "rgba(239,68,68,0.08)" },
              transition:    "all 0.15s",
            }}
          >
            Delete
          </Button>
        </Box>
      )}

      {/* Members show "Via invitation" instead of buttons */}
      {isMember && (
        <Typography sx={{ fontSize: "0.72rem", color: "#6b7280", fontFamily: FONT }}>
          Via invitation
        </Typography>
      )}

    </Box>
  );
}
// Green "Active" or red "Inactive" badge
function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active";
  return (
    <Chip
      label={isActive ? "Active" : "Inactive"}
      size="small"
      sx={{
        backgroundColor: isActive ? "#064e3b" : "#450a0a",
        color:           isActive ? "#10b981" : "#ef4444",
        border:          `1px solid ${isActive ? "#10b98130" : "#ef444430"}`,
        fontWeight:      700,
        fontSize:        "0.7rem",
        height:          22,
        fontFamily:      FONT,
      }}
    />
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────
export default function EmployeePage() {
   // ── SCREEN SIZE DETECTION ──
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  // ── DATA STATE ──
  const [employees,    setEmployees]    = useState<Employee[]>([]);
  const [loading,      setLoading]      = useState(false);

  // ── SEARCH & FILTER STATE ──
  const [searchText,   setSearchText]   = useState("");
  const [filterRole,   setFilterRole]   = useState("all");

  // ── ADD DIALOG STATE ──
  const [addDialogOpen, setAddDialogOpen] = useState(false); 
  const [saving,        setSaving]        = useState(false);

  // ── EDIT DIALOG STATE ──
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editDialogOpen,  setEditDialogOpen]  = useState(false);
  const [savingEdit,      setSavingEdit]      = useState(false);

  // ── DELETE DIALOG STATE ──
  const [deletingId,      setDeletingId]      = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // ── SHARED FORM STATE (used by both Add and Edit) ──
  const [form, setForm] = useState({
    full_name:    "",
    email:        "",
    phone:        "",
    role:         "",
    joining_date: "",
    status:       "active",
  });

  // ── HELPER: update one form field at a time ──
  function updateForm(field: string, value: string) {
    setForm((prev) => ({
      ...prev,       // keep all other fields
      [field]: value // update only this field
    }));
  }

  // ── HELPER: format date "2024-01-15" → "15 Jan 2024" ──
  function formatDate(d?: string): string {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-PK", {
      day:   "2-digit",
      month: "short",
      year:  "numeric",
    });
  }

  // ── API: load all employees ──
  async function loadEmployees() {
    setLoading(true);
    try {
      const res = await api.get("/employees");
      setEmployees(res.data);
    } catch {
      alert("Failed to load employees");
    } finally {
      setLoading(false);
    }
  }

  // Run once when page opens
  useEffect(() => {
    loadEmployees();
  }, []);

  // ── API: add new employee ──
  async function saveEmployee() {
    if (!form.full_name.trim()) { alert("Full name is required"); return; }
    if (!form.role.trim())      { alert("Role is required");      return; }

    setSaving(true);
    try {
      await api.post("/employees", {
        full_name:    form.full_name,
        email:        form.email        || null,
        phone:        form.phone        || null,
        role:         form.role,
        joining_date: form.joining_date || null,
        status:       form.status,
      });
      await loadEmployees();
      setAddDialogOpen(false);
      setForm({ full_name: "", email: "", phone: "", role: "", joining_date: "", status: "active" });
    } catch {
      alert("Failed to add employee");
    } finally {
      setSaving(false);
    }
  }

  // ── OPEN EDIT DIALOG: pre-fill form with employee data ──
  function openEditDialog(emp: Employee) {
    setEditingEmployee(emp);
    setForm({
      full_name:    emp.full_name,
      email:        emp.email        || "",
      phone:        emp.phone        || "",
      role:         emp.role,
      joining_date: emp.joining_date || "",
      status:       emp.status,
    });
    setEditDialogOpen(true);
  }

  // ── API: save edited employee ──
  async function saveEdit() {
    if (!form.full_name.trim()) { alert("Full name is required"); return; }
    if (!form.role.trim())      { alert("Role is required");      return; }

    setSavingEdit(true);
    try {
      await api.put(`/employees/${editingEmployee?.id}`, {
        full_name:    form.full_name,
        email:        form.email        || null,
        phone:        form.phone        || null,
        role:         form.role,
        joining_date: form.joining_date || null,
        status:       form.status,
      });
      await loadEmployees();
      setEditDialogOpen(false);
      setEditingEmployee(null);
    } catch {
      alert("Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  }

  // ── API: delete employee ──
  async function deleteEmployee() {
    try {
      await api.delete(`/employees/${deletingId}`);
      await loadEmployees();
      setDeleteDialogOpen(false);
      setDeletingId(null);
    } catch {
      alert("Failed to delete employee");
    }
  }

  // ── COMPUTED: filtered list (recalculates automatically) ──
  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.full_name.toLowerCase().includes(searchText.toLowerCase()) ||
      emp.email?.toLowerCase().includes(searchText.toLowerCase());
    const matchesRole =
      filterRole === "all" || emp.role === filterRole;
    return matchesSearch && matchesRole;
  });

  // Unique roles for the filter dropdown (no duplicates)
  const uniqueRoles = [...new Set(employees.map((emp) => emp.role))];

  // ─── JSX ─────────────────────────────────────────────────
  return (
    <Box sx={{
      p:               { xs: 2, md: 3 },
      backgroundColor: C.bg,
      minHeight:       "100vh",
      fontFamily:      FONT,
    }}>

      {/* PAGE TITLE */}
      <Typography sx={{ fontSize: 24, fontWeight: 800, color: C.textPrimary, mb: 0.5 }}>
        Employees
      </Typography>
      <Typography sx={{ fontSize: 14, color: C.textSecondary, mb: 3 }}>
        Manage your organization's employees
      </Typography>

      {/* SPINNER while loading */}
      {loading && <Spinner />}

      {/* FIX 4: everything hidden while loading */}
      {!loading && (
        <>
          {/* TOP ROW: count + Add button */}
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography sx={{ fontSize: 13, color: "#6b7280", fontFamily: FONT }}>
              {/* FIX 3: added space before "employee" */}
              {filteredEmployees.length} employee{filteredEmployees.length !== 1 ? "s" : ""} found
            </Typography>
            <Button
              variant="contained"
              onClick={() => setAddDialogOpen(true)}
              sx={primaryBtnSx}
            >
              + Add Employee
            </Button>
          </Box>

          {/* SEARCH & FILTER ROW */}
          <Box sx={{ display: "flex", gap: 2, mb: 2.5, flexWrap: "wrap" }}>
            <TextField
              size="small"
              label="Search by name or email"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              sx={{ ...inputSx, flex: 1, minWidth: 200 }}
            />
            <TextField
              select
              size="small"
              label="Filter by Role"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              sx={{ ...inputSx, width: 180 }}
            >
              <MenuItem value="all">
                <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>All Roles</Typography>
              </MenuItem>
              {uniqueRoles.map((role) => (
                <MenuItem key={role} value={role}>
                  <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>{role}</Typography>
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {/* EMPLOYEE TABLE */}
          {/* FIX 6: removed p:3 and textAlign from wrapper — breaks table */}
          {isMobile && (
            <Box>
              {filteredEmployees.length === 0 ? (
                <Typography sx={{ textAlign: "center", py: 6, color: "#6b7280", fontFamily: FONT }}>
                  No employees found matching your search.
                </Typography>
              ) : (
                filteredEmployees.map((emp) => (
                  <EmployeeCard
                    key={emp.id}
                    emp={emp}
                    formatDate={formatDate}
                    onEdit={()   => openEditDialog(emp)}
                    onDelete={() => { setDeletingId(emp.id); setDeleteDialogOpen(true); }}
                  />
                ))
              )}
            </Box>
          )}

          {/* ── DESKTOP: show table ── */}
          {!isMobile && (
            <Box sx={{
              backgroundColor: C.surface,
              border:          `1px solid ${C.border}`,
              borderRadius:    "14px",
              overflow:        "hidden",
            }}>
              <Table>
                <TableHead>
                  <TableRow>
                    {["Name", "Role", "Phone", "Email", "Joined", "Status", "Source", "Actions"].map((header) => (
                      <TableCell key={header} sx={thSx}>{header}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredEmployees.map((emp) => (
                    <TableRow
                      key={emp.id}
                      sx={{
                        "&:hover":  { backgroundColor: "rgba(255,255,255,0.03)" },
                        transition: "background 0.15s",
                      }}
                    >
                      <TableCell sx={tdSx}>
                        <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: C.textPrimary, fontFamily: FONT }}>
                          {emp.full_name}
                        </Typography>
                        <Typography sx={{ fontSize: "0.75rem", color: "#6b7280", fontFamily: FONT }}>
                          {emp.email || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell sx={tdSx}>
                        <Chip label={emp.role} size="small" sx={{ backgroundColor: "#1e3a5f", color: "#60a5fa", fontWeight: 600, fontSize: "0.72rem", height: 22, fontFamily: FONT, textTransform: "capitalize" }} />
                      </TableCell>
                      <TableCell sx={{ ...tdSx, fontFamily: "monospace", fontSize: "0.8rem" }}>{emp.phone || "—"}</TableCell>
                      <TableCell sx={{ ...tdSx, color: "#9ca3af" }}>{emp.email || "—"}</TableCell>
                      <TableCell sx={{ ...tdSx, fontFamily: "monospace", fontSize: "0.78rem", color: "#9ca3af" }}>{formatDate(emp.joining_date)}</TableCell>
                      <TableCell sx={tdSx}><StatusBadge status={emp.status} /></TableCell>
                      <TableCell sx={tdSx}>
                        <Chip
                          label={emp.source === "member" ? "Member" : "Employee"}
                          size="small"
                          sx={{
                            backgroundColor: emp.source === "member" ? "#1e1b4b" : "#064e3b",
                            color:           emp.source === "member" ? "#818cf8" : "#10b981",
                            fontWeight:      700,
                            fontSize:        "0.7rem",
                            height:          22,
                            fontFamily:      FONT,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={tdSx}>
                        {emp.source === "employee" ? (
                          <Box sx={{ display: "flex", gap: 1 }}>
                            <Tooltip title="Edit" arrow>
                              <IconButton size="small" onClick={() => openEditDialog(emp)}
                                sx={{ color: "#9ca3af", border: "1px solid #374151", borderRadius: "8px", p: 0.75, "&:hover": { color: "#f59e0b", borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.08)" }, transition: "all 0.15s" }}>
                                <Edit sx={{ fontSize: 15 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete" arrow>
                              <IconButton size="small" onClick={() => { setDeletingId(emp.id); setDeleteDialogOpen(true); }}
                                sx={{ color: "#9ca3af", border: "1px solid #374151", borderRadius: "8px", p: 0.75, "&:hover": { color: "#ef4444", borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.08)" }, transition: "all 0.15s" }}>
                                <Delete sx={{ fontSize: 15 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        ) : (
                          <Typography sx={{ fontSize: "0.72rem", color: "#6b7280", fontFamily: FONT }}>Via invitation</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} sx={{ textAlign: "center", py: 6, color: "#6b7280", fontFamily: FONT }}>
                        No employees found matching your search.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          )}
        </>
      )}

      {/* ══════════════════════════════════════
          DIALOG 1 — ADD EMPLOYEE
          ══════════════════════════════════════ */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: "#1f2937",
            border:          "1px solid #374151",
            borderRadius:    "16px",
            color:           "#f9fafb",
          }
        }}
      >
        <DialogTitle sx={{
          fontFamily:   FONT,
          fontWeight:   800,
          fontSize:     "1.1rem",
          color:        "#f9fafb",
          borderBottom: "1px solid #374151",
          pb:           2,
        }}>
          Add New Employee
        </DialogTitle>

        <DialogContent sx={{ pt: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField fullWidth required size="small" label="Full Name"
                value={form.full_name}
                onChange={(e) => updateForm("full_name", e.target.value)}
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Email" type="email"
                value={form.email}
                onChange={(e) => updateForm("email", e.target.value)}
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Phone"
                value={form.phone}
                onChange={(e) => updateForm("phone", e.target.value)}
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required size="small" label="Role"
                value={form.role}
                onChange={(e) => updateForm("role", e.target.value)}
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" type="date" label="Joining Date"
                value={form.joining_date}
                InputLabelProps={{ shrink: true }}
                onChange={(e) => updateForm("joining_date", e.target.value)}
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField select fullWidth size="small" label="Status"
                value={form.status}
                onChange={(e) => updateForm("status", e.target.value)}
                sx={inputSx}
              >
                <MenuItem value="active">
                  <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>Active</Typography>
                </MenuItem>
                <MenuItem value="inactive">
                  <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>Inactive</Typography>
                </MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ borderTop: "1px solid #374151", px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setAddDialogOpen(false)}
            sx={{ color: "#9ca3af", fontFamily: FONT, textTransform: "none", fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={saveEmployee}
            disabled={saving || !form.full_name || !form.role}
            sx={primaryBtnSx}
          >
            {saving ? "Saving…" : "Add Employee"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══════════════════════════════════════
          DIALOG 2 — EDIT EMPLOYEE
          ══════════════════════════════════════ */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: "#1f2937",
            border:          "1px solid #374151",
            borderRadius:    "16px",
            color:           "#f9fafb",
          }
        }}
      >
        <DialogTitle sx={{
          fontFamily:   FONT,
          fontWeight:   800,
          fontSize:     "1.1rem",
          color:        "#f9fafb",
          borderBottom: "1px solid #374151",
          pb:           2,
        }}>
          Edit Employee
        </DialogTitle>

        <DialogContent sx={{ pt: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField fullWidth required size="small" label="Full Name"
                value={form.full_name}
                onChange={(e) => updateForm("full_name", e.target.value)}
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Email" type="email"
                value={form.email}
                onChange={(e) => updateForm("email", e.target.value)}
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Phone"
                value={form.phone}
                onChange={(e) => updateForm("phone", e.target.value)}
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required size="small" label="Role"
                value={form.role}
                onChange={(e) => updateForm("role", e.target.value)}
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" type="date" label="Joining Date"
                value={form.joining_date}
                InputLabelProps={{ shrink: true }}
                onChange={(e) => updateForm("joining_date", e.target.value)}
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField select fullWidth size="small" label="Status"
                value={form.status}
                onChange={(e) => updateForm("status", e.target.value)}
                sx={inputSx}
              >
                <MenuItem value="active">
                  <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>Active</Typography>
                </MenuItem>
                <MenuItem value="inactive">
                  <Typography sx={{ fontFamily: FONT, fontSize: "0.875rem" }}>Inactive</Typography>
                </MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ borderTop: "1px solid #374151", px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setEditDialogOpen(false)}
            sx={{ color: "#9ca3af", fontFamily: FONT, textTransform: "none", fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={saveEdit}
            disabled={savingEdit || !form.full_name || !form.role}
            sx={primaryBtnSx}
          >
            {savingEdit ? "Saving…" : "Save Changes"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══════════════════════════════════════
          DIALOG 3 — DELETE CONFIRM
          ══════════════════════════════════════ */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: "#1f2937",
            border:          "1px solid #374151",
            borderRadius:    "16px",
          }
        }}
      >
        <DialogTitle sx={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize:   "1.1rem",
          color:      "#f9fafb",
        }}>
          Delete Employee?
        </DialogTitle>

        <DialogContent>
          <Typography sx={{ fontFamily: FONT, fontSize: "0.9rem", color: "#9ca3af" }}>
            Are you sure you want to delete{" "}
            <span style={{ color: "#f9fafb", fontWeight: 700 }}>
              {employees.find((e) => e.id === deletingId)?.full_name}
            </span>
            ? This cannot be undone.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ borderTop: "1px solid #374151", px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            sx={{ color: "#9ca3af", fontFamily: FONT, textTransform: "none", fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={deleteEmployee}
            sx={{
              backgroundColor: "#ef4444",
              color:           "#fff",
              fontFamily:      FONT,
              fontWeight:      700,
              textTransform:   "none",
              borderRadius:    "10px",
              "&:hover":       { backgroundColor: "#dc2626" },
            }}
          >
            Yes, Delete
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}