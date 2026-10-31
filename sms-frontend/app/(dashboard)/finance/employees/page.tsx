"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import EmployeeToolbar from "@/components/employees/Employeetoolbar";
import EmployeeTable from "@/components/employees/Employeetable";
import EmployeeFormDialog from "@/components/employees/Employeeformdialog";
import DeleteEmployeeDialog from "@/components/employees/DeleteEmployeeDialog";
import { Employee, EmployeeFormData, emptyEmployeeForm } from "@/components/employees/types";

export default function EmployeePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState<EmployeeFormData>(emptyEmployeeForm);

  const updateForm = (field: keyof EmployeeFormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const res = await api.get("/employees");
      setEmployees(res.data);
    } catch {
      toast.error("Failed to load employees");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const openAddDialog = () => {
    setForm(emptyEmployeeForm);
    setDialogMode("add");
    setDialogOpen(true);
  };

  const openEditDialog = (emp: Employee) => {
    setEditingEmployee(emp);
    setForm({
      full_name: emp.full_name,
      email: emp.email || "",
      phone: emp.phone || "",
      role: emp.role,
      joining_date: emp.joining_date || "",
      status: emp.status,
    });
    setDialogMode("edit");
    setDialogOpen(true);
  };

  const saveEmployee = async () => {
    if (!form.full_name.trim()) {
      toast.error("Full name is required");
      return;
    }
    if (!form.role.trim()) {
      toast.error("Role is required");
      return;
    }

    setSaving(true);
    const payload = {
      full_name: form.full_name,
      email: form.email || null,
      phone: form.phone || null,
      role: form.role,
      joining_date: form.joining_date || null,
      status: form.status,
    };

    try {
      if (dialogMode === "edit" && editingEmployee) {
        await api.put(`/employees/${editingEmployee.id}`, payload);
        toast.success("Employee updated");
      } else {
        await api.post("/employees", payload);
        toast.success("Employee added");
      }
      await loadEmployees();
      setDialogOpen(false);
      setEditingEmployee(null);
      setForm(emptyEmployeeForm);
    } catch {
      toast.error(
        dialogMode === "edit" ? "Failed to save changes" : "Failed to add employee",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteEmployee = async () => {
    if (!deletingId) return;
    setDeleting(true);
    try {
      await api.delete(`/employees/${deletingId}`);
      toast.success("Employee deleted");
      setDeletingId(null);
      await loadEmployees();
    } catch {
      toast.error("Failed to delete employee");
    } finally {
      setDeleting(false);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (emp.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || emp.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const uniqueRoles = [...new Set(employees.map((emp) => emp.role))];
  const deletingEmployeeName = employees.find((e) => e.id === deletingId)?.full_name;

  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      <EmployeeToolbar
        count={filteredEmployees.length}
        search={search}
        onSearchChange={setSearch}
        roleFilter={roleFilter}
        onRoleFilterChange={setRoleFilter}
        roles={uniqueRoles}
        onAdd={openAddDialog}
      />

      <EmployeeTable
        employees={filteredEmployees}
        loading={loading}
        onEdit={openEditDialog}
        onDelete={setDeletingId}
      />

      <EmployeeFormDialog
        open={dialogOpen}
        mode={dialogMode}
        form={form}
        updateForm={updateForm}
        saving={saving}
        onClose={() => setDialogOpen(false)}
        onSave={saveEmployee}
      />

      <DeleteEmployeeDialog
        open={deletingId !== null}
        employeeName={deletingEmployeeName}
        onCancel={() => setDeletingId(null)}
        onConfirm={deleteEmployee}
      />
    </div>
  );
}