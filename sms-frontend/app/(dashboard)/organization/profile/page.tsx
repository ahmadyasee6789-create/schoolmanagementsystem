"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { isAxiosError } from "axios";
import { api } from "@/app/lib/api";
import { useAuthStore } from "@/app/store/authStore";
import { LoadingState, PageHeader, primaryButtonClass, secondaryButtonClass } from "@/components/exams/ExamUi";
import { LabeledField } from "@/components/finance/FinanceUi";

type SchoolProfile = { id: number; name: string; logo: string | null };
const message = (error: unknown, fallback: string) =>
  isAxiosError(error) && typeof error.response?.data?.detail === "string" ? error.response.data.detail : fallback;

export default function SchoolProfilePage() {
  const isAdmin = useAuthStore((state) => state.user?.org_role === "admin");
  const [profile, setProfile] = useState<SchoolProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.get<SchoolProfile>("/organization/profile", { signal: controller.signal })
      .then((response) => setProfile(response.data))
      .catch((cause) => { if (!controller.signal.aborted) setError(message(cause, "Could not load the school profile.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const clearSelection = () => {
    setFile(null);
    setPreview(null);
    if (input.current) input.current.value = "";
  };
  const saveLogo = async (remove = false) => {
    if (!isAdmin || saving || (!remove && !file)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const form = new FormData();
      if (file) form.append("logo", file);
      const response = remove ? await api.delete<SchoolProfile>("/organization/logo")
        : await api.put<SchoolProfile>("/organization/logo", form);
      setProfile(response.data);
      clearSelection();
      setSuccess(remove ? "School logo removed." : "School logo saved. New vouchers will use it automatically.");
    } catch (cause) {
      setError(message(cause, "Could not save the school logo. Please try again."));
    } finally {
      setSaving(false);
    }
  };
  const logo = preview ?? profile?.logo;

  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      <PageHeader title="School Profile" subtitle="Your school details and logo used on fee vouchers" />
      {loading && <LoadingState />}
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      {success && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">{success}</p>}
      {profile && (
        <section className="max-w-2xl space-y-5 rounded-xl border border-slate-200 p-5 dark:border-white/10">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">School name</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-50">{profile.name}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {logo ? <Image src={logo} alt="School logo" width={96} height={96} unoptimized className="h-24 w-24 rounded-lg border border-slate-200 bg-white object-contain p-2" />
              : <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-500">No logo saved</div>}
            <p className="min-w-48 flex-1 text-sm text-slate-500 dark:text-slate-400">The saved logo appears on the left of every voucher. Your school name stays centered. This applies to both single and bulk vouchers.</p>
          </div>
          {isAdmin ? (
            <>
              <LabeledField label="School logo">
                <input ref={input} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={saving}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold dark:text-slate-300 dark:file:bg-white/10 dark:file:text-slate-200"
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (!selected) return;
                    setError("");
                    setSuccess("");
                    if (!["image/png", "image/jpeg"].includes(selected.type) || selected.size > 2 * 1024 * 1024) {
                      clearSelection();
                      setError("Choose a PNG or JPG school logo, up to 2 MB.");
                      return;
                    }
                    setFile(selected);
                    setPreview(URL.createObjectURL(selected));
                  }} />
              </LabeledField>
              <p className="text-xs text-slate-500 dark:text-slate-400">PNG or JPG, up to 2 MB and 4000 × 4000 pixels.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!file || saving} onClick={() => void saveLogo()} className={primaryButtonClass}>{saving ? "Saving…" : "Save school logo"}</button>
                {file && <button type="button" disabled={saving} onClick={clearSelection} className={secondaryButtonClass}>Cancel selection</button>}
                {profile.logo && <button type="button" disabled={saving} onClick={() => void saveLogo(true)} className={secondaryButtonClass}>Remove saved logo</button>}
              </div>
            </>
          ) : <p className="text-sm text-slate-500 dark:text-slate-400">A school administrator can update the logo.</p>}
        </section>
      )}
    </div>
  );
}
