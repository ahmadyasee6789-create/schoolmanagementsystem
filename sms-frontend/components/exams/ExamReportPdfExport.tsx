'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/app/lib/api';
import { secondaryButtonClass } from './ExamUi';

export default function ExamReportPdfExport({ params, disabled }: {
  params: Record<string, string | number>; disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  async function download() {
    if (disabled || loading) return;
    setLoading(true);
    try {
      const { data } = await api.get('/reports/exam-summary/export', {
        params: { ...params, format: 'pdf' }, responseType: 'blob', timeout: 60000,
      });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Exam_${params.exam_id}_Results.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error('Could not export the PDF. Check your permissions and filters, then retry.');
    } finally {
      setLoading(false);
    }
  }
  return <button type="button" disabled={disabled || loading} onClick={() => void download()}
    className={`${secondaryButtonClass} inline-flex items-center gap-2`}>
    <Download size={16} aria-hidden="true" />{loading ? 'Exporting…' : 'Export PDF'}
  </button>;
}
