"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Employee, formatDate } from "./types";
import { RoleBadge, SourceBadge, StatusBadge } from "./Badges";
import EmployeeCard from "./Employeecard";

const TABLE_HEADINGS = [
  "Name",
  "Role",
  "Phone",
  "Email",
  "Joined",
  "Status",
  "Source",
  "Actions",
];

export default function EmployeeTable({
  employees,
  loading,
  onEdit,
  onDelete,
}: {
  employees: Employee[];
  loading: boolean;
  onEdit: (emp: Employee) => void;
  onDelete: (id: number) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#8B6DF2]/20 border-t-[#8B6DF2]" />
      </div>
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="sm:hidden">
        {employees.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
            No employees found matching your search.
          </p>
        ) : (
          employees.map((emp) => (
            <EmployeeCard
              key={emp.id}
              emp={emp}
              onEdit={() => onEdit(emp)}
              onDelete={() => onDelete(emp.id)}
            />
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 sm:block">
        <table className="w-full min-w-[1000px] border-collapse text-left">
          <thead className="bg-slate-50 dark:bg-white/[0.03]">
            <tr>
              {TABLE_HEADINGS.map((heading) => (
                <th
                  key={heading}
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr
                key={emp.id}
                className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {emp.full_name}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {emp.email || "—"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <RoleBadge role={emp.role} />
                </td>
                <td className="px-4 py-3 font-mono text-sm text-slate-600 dark:text-slate-300">
                  {emp.phone || "—"}
                </td>
                <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                  {emp.email || "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(emp.joining_date)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={emp.status} />
                </td>
                <td className="px-4 py-3">
                  <SourceBadge source={emp.source} />
                </td>
                <td className="px-4 py-3">
                  {emp.source === "employee" ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        title="Edit employee"
                        onClick={() => onEdit(emp)}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-500"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        title="Delete employee"
                        onClick={() => onDelete(emp.id)}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-slate-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      Via invitation
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-16 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  No employees found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}