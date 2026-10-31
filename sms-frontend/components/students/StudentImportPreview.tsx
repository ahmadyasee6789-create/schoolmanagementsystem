"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Upload, X } from "lucide-react";
import { api } from "@/app/lib/api";
import { inputClass, secondaryButtonClass } from "./types";
import { importError, STUDENT_IMPORT_FIELDS, type ImportPreviewData, type ImportResult, type ImportValidation, type SheetMapping } from "./importTypes";

export type { ImportPreviewData } from "./importTypes";

const primaryButton = "inline-flex items-center justify-center gap-2 rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40";
const box = "rounded-xl border border-slate-200 dark:border-white/10";
const muted = "text-sm text-slate-500 dark:text-slate-400";
const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}_]/gu, "");
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function StudentImportPreview({ data, onClose, onImported }: {
  data: ImportPreviewData; onClose: () => void; onImported: () => void;
}) {
  const [step, setStep] = useState(2);
  const [mappings, setMappings] = useState<SheetMapping[]>(() => data.sheets.map((sheet) => ({
    sheet_index: sheet.index, header_row: sheet.header_row, fields: sheet.suggested_fields,
    classroom_id: sheet.suggested_classroom_id, selected: sheet.selected,
  })));
  const [activeSheet, setActiveSheet] = useState(() => data.sheets.find((sheet) => sheet.selected)?.index ?? 0);
  const [enrollmentDate, setEnrollmentDate] = useState(today);
  const [dateFormat, setDateFormat] = useState("iso");
  const [validation, setValidation] = useState<ImportValidation | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [page, setPage] = useState(1);
  const [onlyIssues, setOnlyIssues] = useState(false);

  const sheet = data.sheets[activeSheet];
  const mapping = mappings[activeSheet];
  const headers = sheet.sample_rows[mapping.header_row - 1] ?? [];
  const width = Math.max(headers.length, ...sheet.sample_rows.slice(mapping.header_row, mapping.header_row + 5).map((row) => row.length));
  const chosenSheets = mappings.filter((item) => item.selected);
  const mappingReady = chosenSheets.length > 0 && !!enrollmentDate && chosenSheets.every((item) => {
    const fields = Object.values(item.fields);
    return (fields.includes("full_name") || fields.includes("first_name")) && (item.classroom_id !== null || fields.includes("grade"));
  });
  const rows = validation?.rows ?? [];
  const visibleRows = onlyIssues ? rows.filter((row) => row.errors.length || row.warnings.length) : rows;
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / 50));
  const pageRows = visibleRows.slice((page - 1) * 50, page * 50);
  const selected = rows.filter((row) => selectedRows.has(row.id));
  const selectedWarningCount = selected.filter((row) => row.warnings.length).length;

  function invalidate() {
    setValidation(null);
    setSelectedRows(new Set());
    setError("");
    setNotice("");
  }

  function updateSheet(index: number, patch: Partial<SheetMapping>) {
    invalidate();
    setMappings((previous) => previous.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function changeHeader(headerRow: number) {
    const fields: Record<string, string> = {};
    const used = new Set<string>();
    (sheet.sample_rows[headerRow - 1] ?? []).forEach((label, index) => {
      let field = data.field_aliases[normalize(label)] ?? "ignore";
      if (used.has(field)) field = "ignore";
      if (field !== "ignore") used.add(field);
      fields[String(index)] = field;
    });
    updateSheet(activeSheet, { header_row: headerRow, fields });
  }

  function changeField(column: string, field: string) {
    const fields = { ...mapping.fields };
    Object.keys(fields).forEach((key) => {
      if (key !== column && field !== "ignore" && fields[key] === field) fields[key] = "ignore";
    });
    fields[column] = field;
    updateSheet(activeSheet, { fields });
  }

  function applyToMatchingSheets() {
    invalidate();
    const signature = JSON.stringify(headers.map(normalize));
    let changed = 0;
    setMappings(mappings.map((item, index) => {
      const otherHeaders = data.sheets[index].sample_rows[item.header_row - 1] ?? [];
      if (index !== activeSheet && JSON.stringify(otherHeaders.map(normalize)) === signature) {
        changed++;
        return { ...item, fields: { ...mapping.fields } };
      }
      return item;
    }));
    setNotice(`Column mapping applied to ${changed} other matching sheet${changed === 1 ? "" : "s"}.`);
  }

  async function validate() {
    if (!mappingReady || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    invalidate();
    try {
      const response = await api.post<ImportValidation>("/students/import/validate", {
        batch_id: data.batch_id,
        sheets: chosenSheets.map((item) => ({ sheet_index: item.sheet_index, header_row: item.header_row, fields: item.fields, classroom_id: item.classroom_id })),
        enrollment_date: enrollmentDate, date_format: dateFormat,
      });
      setValidation(response.data);
      setSelectedRows(new Set(response.data.rows.filter((row) => row.status === "ready").map((row) => row.id)));
      setPage(1);
      setOnlyIssues(false);
      setStep(3);
    } catch (cause) {
      setError(importError(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function confirm() {
    if (!validation || !selectedRows.size || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await api.post<ImportResult>("/students/import/confirm", {
        batch_id: data.batch_id, validation_id: validation.validation_id, row_ids: [...selectedRows],
      });
      setResult(response.data);
      onImported();
    } catch (cause) {
      setError(importError(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="student-import-title" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#1a2233] dark:text-slate-100">
        <div className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-white/10">
          <div className="min-w-0">
            <h2 id="student-import-title" className="text-lg font-bold">Import students</h2>
            <p className={`${muted} mt-1 break-words`}>{data.filename} · Session: {data.session.name}</p>
          </div>
          <button type="button" aria-label="Close student import" disabled={busy} onClick={onClose} className="rounded-lg p-2 disabled:opacity-40"><X size={20} /></button>
        </div>

        <ol className="grid grid-cols-4 gap-2 border-b border-slate-200 px-5 py-4 dark:border-white/10" aria-label="Import progress">
          {["Upload", "Map", "Validate", "Confirm & import"].map((label, index) => (
            <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={`flex items-center gap-2 text-xs sm:text-sm ${step >= index + 1 ? "font-semibold text-violet-600 dark:text-violet-300" : "text-slate-400"}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${step >= index + 1 ? "bg-violet-100 dark:bg-violet-500/20" : "bg-slate-100 dark:bg-white/5"}`}>{step > index + 1 || result ? <CheckCircle2 size={16} /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <div role="alert" className="m-5 flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"><AlertCircle className="shrink-0" size={18} />{error}</div>}
          {step === 2 && (
            <fieldset disabled={busy} className="min-w-0 p-5">
              <p className={muted}>Choose student sheets, check the header row, and map your columns. Fields you do not map are ignored. Suggestions can be changed.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">Enrollment date<input type="date" value={enrollmentDate} onChange={(event) => { invalidate(); setEnrollmentDate(event.target.value); }} className={`${inputClass} mt-1`} /></label>
                <label className="text-sm font-medium">Dates in your file<select value={dateFormat} onChange={(event) => { invalidate(); setDateFormat(event.target.value); }} className={`${inputClass} mt-1`}>
                  <option value="iso">Year-month-day (2020-12-31)</option><option value="dmy">Day/month/year (31/12/2020)</option><option value="mdy">Month/day/year (12/31/2020)</option>
                </select></label>
              </div>
              <div className="mt-5 grid gap-5 md:grid-cols-[220px_1fr]">
                <div className={`${box} self-start overflow-hidden`}>
                  <div className="border-b border-slate-200 p-3 text-sm font-semibold dark:border-white/10">{chosenSheets.length} sheets selected</div>
                  <div className="max-h-80 overflow-y-auto">
                    {data.sheets.map((item, index) => (
                      <div key={item.index} className={`flex items-center gap-2 px-3 py-2 ${activeSheet === index ? "bg-violet-50 dark:bg-violet-500/10" : ""}`}>
                        <input aria-label={`Include sheet ${item.name}`} type="checkbox" checked={mappings[index].selected} disabled={item.row_count === 0} onChange={(event) => updateSheet(index, { selected: event.target.checked })} />
                        <button type="button" onClick={() => setActiveSheet(index)} className="min-w-0 flex-1 text-left text-sm">
                          <span className="block truncate font-medium">{item.name}</span><span className="text-xs text-slate-500">{item.hidden ? "Hidden sheet · " : ""}{item.row_count} source rows</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold">{sheet.name}{!mapping.selected && <span className="ml-2 text-xs font-normal text-slate-500">Not selected</span>}</h3>
                  {sheet.heading && <p className={`${muted} mt-1 break-words`}>File heading: {sheet.heading}</p>}
                  <div className="my-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-medium">Header row<select value={mapping.header_row} onChange={(event) => changeHeader(Number(event.target.value))} className={`${inputClass} mt-1`}>
                      {sheet.sample_rows.slice(0, 20).map((row, index) => <option key={index} value={index + 1}>Row {index + 1}: {row.filter(Boolean).slice(0, 3).join(" / ").slice(0, 90) || "(empty)"}</option>)}
                    </select></label>
                    <label className="text-sm font-medium">Classroom for this sheet<select value={mapping.classroom_id ?? ""} onChange={(event) => updateSheet(activeSheet, { classroom_id: event.target.value ? Number(event.target.value) : null })} className={`${inputClass} mt-1`}>
                      <option value="">Use mapped Grade / Section columns</option>
                      {data.classrooms.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select></label>
                  </div>
                  {!data.classrooms.length && <p className="mb-3 text-sm text-amber-700 dark:text-amber-300">Create classrooms in the active session before importing.</p>}
                  <p className={`${muted} mb-3`}>Map Full name or First name. Choose a classroom above, or map Grade and Section. Other student fields are optional.</p>
                  <div className={`${box} overflow-x-auto`}>
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 dark:bg-white/5"><tr><th className="p-3">File column / sample</th><th className="p-3">Student field</th></tr></thead>
                      <tbody>{Array.from({ length: width }, (_, index) => (
                        <tr key={index} className="border-t border-slate-100 dark:border-white/5">
                          <td className="max-w-60 p-3"><div className="font-medium">{headers[index] || `Column ${index + 1}`}</div><div className="mt-1 truncate text-xs text-slate-500">{sheet.sample_rows.slice(mapping.header_row, mapping.header_row + 3).map((row) => row[index]).filter(Boolean).join(" · ") || "No sample value"}</div></td>
                          <td className="min-w-48 p-3"><select aria-label={`Map ${headers[index] || `column ${index + 1}`}`} value={mapping.fields[String(index)] ?? "ignore"} onChange={(event) => changeField(String(index), event.target.value)} className={inputClass}>{STUDENT_IMPORT_FIELDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <button type="button" onClick={applyToMatchingSheets} className={`${secondaryButtonClass} mt-3`}>Apply column mapping to matching sheets</button>
                  {notice && <p role="status" className={`${muted} mt-2`}>{notice}</p>}
                </div>
              </div>
            </fieldset>
          )}

          {step === 3 && validation && (
            <div className="p-5">
              <div className="grid grid-cols-3 gap-3">
                {[[validation.ready, "Ready"], [validation.review, "Possible duplicates"], [validation.invalid, "Rows with errors"]].map(([count, label]) => <div key={label} className={`${box} p-3`}><div className="text-xl font-bold">{count}</div><div className={muted}>{label}</div></div>)}
              </div>
              <p className={`${muted} my-4`}>Review the students below. Rows with errors cannot be imported. Possible duplicates are unchecked; select one only if you intend to create another student. {validation.ignored_rows} blank, header or summary rows ignored.</p>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <button type="button" className={secondaryButtonClass} onClick={() => setSelectedRows(new Set(rows.filter((row) => row.status === "ready").map((row) => row.id)))}>Select ready rows</button>
                <button type="button" className={secondaryButtonClass} onClick={() => setSelectedRows(new Set())}>Clear selection</button>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyIssues} onChange={(event) => { setOnlyIssues(event.target.checked); setPage(1); }} />Show issues only</label>
                <span className="ml-auto text-sm font-semibold">{selectedRows.size} selected</span>
              </div>
              <div className={`${box} overflow-x-auto`}>
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-white/5"><tr>{["Import", "Source", "Student", "Father / contact", "Classroom", "Validation"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
                  <tbody>{pageRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 align-top dark:border-white/5">
                      <td className="p-3"><input type="checkbox" aria-label={`Import ${row.sheet} row ${row.row}`} disabled={row.status === "invalid"} checked={selectedRows.has(row.id)} onChange={(event) => setSelectedRows((previous) => { const next = new Set(previous); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} /></td>
                      <td className="p-3"><div>{row.sheet}</div><div className="text-xs text-slate-500">Row {row.row}</div></td>
                      <td className="p-3"><div className="font-medium">{row.student.first_name} {row.student.last_name}</div>
                        <details className="mt-2 text-xs"><summary className="cursor-pointer text-violet-600 dark:text-violet-300">Student details</summary><dl className="mt-2 space-y-1">
                          {STUDENT_IMPORT_FIELDS.filter(([field]) => !["ignore", "full_name", "grade", "section", "first_name", "last_name"].includes(field)).map(([field, label]) => <div key={field}><dt className="inline text-slate-500">{label}: </dt><dd className="inline break-words">{row.student[field] || "—"}</dd></div>)}
                        </dl></details>
                      </td>
                      <td className="p-3"><div>{row.student.father_name || "—"}</div><div className="mt-1 text-xs">{row.student.phone || row.student.father_phone || row.student.guardian_phone || "—"}</div></td>
                      <td className="p-3">{row.classroom || "—"}</td>
                      <td className="max-w-80 p-3">{!row.errors.length && !row.warnings.length && <span className="text-emerald-700 dark:text-emerald-300">Ready</span>}
                        {row.errors.map((message) => <p key={message} className="mb-1 text-xs text-red-700 dark:text-red-300">{message}</p>)}
                        {row.warnings.map((message) => <p key={message} className="mb-1 text-xs text-amber-700 dark:text-amber-300">{message}</p>)}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
                {!pageRows.length && <p className={`${muted} p-5`}>No rows match this view.</p>}
              </div>
              <div className="mt-3 flex items-center justify-end gap-3 text-sm"><button type="button" disabled={page === 1} className={secondaryButtonClass} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={page === pageCount} className={secondaryButtonClass} onClick={() => setPage(page + 1)}>Next</button></div>
            </div>
          )}

          {step === 4 && (
            <div className="p-6">
              {result ? <div role="status" className="py-8 text-center"><CheckCircle2 size={44} className="mx-auto mb-4 text-emerald-500" /><h3 className="text-xl font-bold">{result.imported} students imported</h3><p className={`${muted} mt-2`}>{result.skipped} unselected or invalid rows skipped. Students are enrolled in {data.session.name}.</p></div> : <>
                <h3 className="text-lg font-bold">Confirm your import</h3>
                <p className={`${muted} mt-2`}>Create {selectedRows.size} students and their enrollments in {data.session.name}. Admission and roll numbers will be generated automatically.</p>
                <dl className={`${box} mt-5 grid grid-cols-2 gap-4 p-4 text-sm`}><dt>Enrollment date</dt><dd>{enrollmentDate}</dd><dt>Students selected</dt><dd>{selectedRows.size}</dd><dt>Rows excluded</dt><dd>{rows.length - selectedRows.size}</dd><dt>Selected rows with warnings</dt><dd>{selectedWarningCount}</dd></dl>
                {selectedWarningCount > 0 && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Your selection includes {selectedWarningCount} rows with warnings. Use Back to review their details before confirming.</p>}
                <div className={`${box} mt-5 p-4 text-sm`}>{[...new Set(selected.map((row) => row.classroom))].map((label) => <div key={label} className="flex justify-between py-1"><span>{label}</span><span>{selected.filter((row) => row.classroom === label).length} students</span></div>)}</div>
              </>}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-5 dark:border-white/10">
          <p className="text-xs text-slate-500">{busy ? "Please wait…" : result ? "Import complete" : step === 2 ? (mappingReady ? "Ready to validate" : "Select sheets and complete their name and classroom mappings") : "Students are saved only after confirmation."}</p>
          <div className="flex gap-2">
            {!result && <button type="button" disabled={busy} onClick={() => { setError(""); if (step === 2) onClose(); else setStep(step - 1); }} className={secondaryButtonClass}>{step === 2 ? "Cancel" : <span className="flex items-center gap-1"><ChevronLeft size={16} />Back</span>}</button>}
            {step === 2 && <button type="button" disabled={!mappingReady || busy} onClick={validate} className={primaryButton}>{busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}Validate students</button>}
            {step === 3 && <button type="button" disabled={!selectedRows.size || busy} onClick={() => { setError(""); setStep(4); }} className={primaryButton}>Continue to confirmation<ChevronRight size={16} /></button>}
            {step === 4 && !result && <button type="button" disabled={!selectedRows.size || busy} onClick={confirm} className={primaryButton}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}Confirm and import {selectedRows.size} students</button>}
            {result && <button type="button" onClick={onClose} className={primaryButton}>Done</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
