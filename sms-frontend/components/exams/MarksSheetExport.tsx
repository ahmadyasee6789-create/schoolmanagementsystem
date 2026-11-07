'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/app/lib/api';
import { inputClass, secondaryButtonClass } from './ExamUi';

type Format = 'xlsx' | 'csv' | 'pdf';
export default function MarksSheetExport({ endpoint, params, disabled, unsaved = false, report = false }: {
  endpoint: string; params: Record<string, string | number>; disabled?: boolean; unsaved?: boolean; report?: boolean;
}) {
  const [format, setFormat] = useState<Format>('xlsx');
  const [loading, setLoading] = useState(false);
  async function download() {
    if (disabled || loading) return;
    if (unsaved && !window.confirm('You have unsaved mark changes. They will NOT be included. Export saved database marks only?')) return;
    setLoading(true);
    try {
      const { data } = await api.get(endpoint, { params: { ...params, format }, responseType: 'blob', timeout: 60000 });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Exam_${params.exam_id}_${report ? 'Results' : `Class_${params.classroom_id}_Marks`}.${format}`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error('Could not export saved results. Check your permissions and filters, then retry.'); }
    finally { setLoading(false); }
  }
  return <div className="inline-flex items-center gap-2">
    <select aria-label={report ? 'Report export format' : 'Marks sheet format'} value={format} disabled={disabled || loading}
      onChange={event => setFormat(event.target.value as Format)} className={`${inputClass} w-auto`}>
      <option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option>{report && <option value="pdf">PDF</option>}
    </select>
    <button type="button" disabled={disabled || loading} onClick={() => void download()} className={`${secondaryButtonClass} inline-flex items-center gap-2`}>
      <Download size={16} aria-hidden="true" />{loading ? 'Exporting…' : report ? 'Export Results' : 'Export Marks Sheet'}
    </button>
  </div>;
}
