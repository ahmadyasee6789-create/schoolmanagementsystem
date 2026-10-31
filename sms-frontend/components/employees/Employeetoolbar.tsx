"use client";

import { Plus, Search } from "lucide-react";
import { inputClass } from "./types.ts";

export default function EmployeeToolbar({
  count,
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  roles,
  onAdd,
}: {
  count: number;
  search: string;
  onSearchChange: (value: string) => void;
  roleFilter: string;
  onRoleFilterChange: (value: string) => void;
  roles: string[];
  onAdd: () => void;
}) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.45rem] font-bold text-slate-900 dark:text-slate-50">
            Employees
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Manage your organization&apos;s employees
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
        >
          <Plus size={16} />
          Add Employee
        </button>
      </div>

      <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        {count} employee{count !== 1 ? "s" : ""} found
      </p>

      <div className="mb-6 grid gap-3 md:grid-cols-12">
        <div className="relative md:col-span-8">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by name or email…"
            className={`${inputClass} pl-9`}
          />
        </div>
        <select
          value={roleFilter}
          onChange={(event) => onRoleFilterChange(event.target.value)}
          className={`${inputClass} md:col-span-4`}
        >
          <option value="all">All Roles</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}