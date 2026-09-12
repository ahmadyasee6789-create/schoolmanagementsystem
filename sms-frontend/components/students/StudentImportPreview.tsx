"use client";

import { useMemo, useState } from "react";
import { X, Upload, AlertCircle, CheckCircle2 } from "lucide-react";

export type ImportPreviewData = {
  message: string;
  total_rows: number;
  columns: string[];
  preview: Record<string, string | number | null>[];
};

type Props = {
  data: ImportPreviewData;
  onClose: () => void;
  onImport: (mapping: Record<string, string>) => void;
};

const SCHOOL_FIELDS = [
  { value: "ignore", label: "Don't import" },

  { value: "full_name", label: "Full Name" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },

  { value: "gender", label: "Gender" },

  { value: "father_name", label: "Father Name" },
  { value: "father_phone", label: "Father Phone" },

  { value: "mother_name", label: "Mother Name" },

  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "date_of_birth", label: "Date of Birth" },
  { value: "address", label: "Address" },

  { value: "guardian_name", label: "Guardian Name" },
  { value: "guardian_phone", label: "Guardian Phone" },

  { value: "grade", label: "Grade" },
  { value: "section", label: "Section" },
];

const REQUIRED_FIELDS = [
  "full_name",
  "first_name",
  "gender",
  "grade",
  "section",
];

export default function StudentImportPreview({
  data,
  onClose,
  onImport,
}: Props) {
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};

    data.columns.forEach((column) => {
      initial[column] = "ignore";
    });

    return initial;
  });

  const updateMapping = (column: string, field: string) => {
    setMapping((prev) => {
      const next = { ...prev };

      // Prevent the same Schoolify field from being mapped
      // to multiple Excel columns.
      Object.keys(next).forEach((key) => {
        if (key !== column && next[key] === field && field !== "ignore") {
          next[key] = "ignore";
        }
      });

      next[column] = field;

      return next;
    });
  };

  const mappedFields = useMemo(
    () => Object.values(mapping),
    [mapping]
  );

  const hasFullName =
    mappedFields.includes("full_name");

  const hasFirstName =
    mappedFields.includes("first_name");

  const hasRequiredFields =
    mappedFields.includes("gender") &&
    mappedFields.includes("grade") &&
    mappedFields.includes("section") &&
    (hasFullName || hasFirstName);

  const handleImport = () => {
    if (!hasRequiredFields) return;

    onImport(mapping);
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#1a2233]">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
              Student Import
            </h2>

            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {data.total_rows} students found in the uploaded file
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto">

          {/* Mapping */}
          <div className="border-b border-slate-100 p-5 dark:border-white/10">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Map your Excel columns
              </h3>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Match each column from your file with a Schoolify student field.
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">

              {/* Mapping header */}
              <div className="grid grid-cols-[1fr_40px_1fr] bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
                <span>Excel Column</span>
                <span />
                <span>Schoolify Field</span>
              </div>

              {/* Mapping rows */}
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {data.columns.map((column) => (
                  <div
                    key={column}
                    className="grid grid-cols-[1fr_40px_1fr] items-center px-4 py-3"
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                        {column.replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className="text-center text-slate-400">
                      →
                    </div>

                    <select
                      value={mapping[column] || "ignore"}
                      onChange={(e) =>
                        updateMapping(column, e.target.value)
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#8B6DF2] focus:ring-2 focus:ring-[#8B6DF2]/20 dark:border-white/10 dark:bg-[#111827] dark:text-slate-200"
                    >
                      {SCHOOL_FIELDS.map((field) => (
                        <option
                          key={field.value}
                          value={field.value}
                        >
                          {field.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Mapping status */}
            <div className="mt-4">
              {hasRequiredFields ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <CheckCircle2 size={15} />
                  Required fields are mapped
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                  <AlertCircle
                    size={15}
                    className="mt-0.5 shrink-0"
                  />

                  <span>
                    Map Full Name (or First Name), Gender, Grade and
                    Section before importing.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Data Preview
                </h3>

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Showing first {data.preview.length} rows
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full min-w-[700px] border-collapse text-left">

                <thead className="bg-slate-50 dark:bg-white/[0.03]">
                  <tr>
                    {data.columns.map((column) => (
                      <th
                        key={column}
                        className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:text-slate-400"
                      >
                        {column.replaceAll("_", " ")}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {data.preview.map((row, index) => (
                    <tr
                      key={index}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"
                    >
                      {data.columns.map((column) => (
                        <td
                          key={column}
                          className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300"
                        >
                          {row[column] === null || row[column] === ""
                            ? "—"
                            : String(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-5 py-4 dark:border-white/10">

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {hasRequiredFields
              ? "Ready to import"
              : "Complete the required mapping"}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={!hasRequiredFields}
              onClick={handleImport}
              className="flex items-center gap-1.5 rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload size={16} />
              Import Students
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}