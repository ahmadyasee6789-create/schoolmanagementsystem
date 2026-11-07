import toast from 'react-hot-toast';
import { api } from '@/app/lib/api';

export function escapeHtml(value: unknown): string {
  return String(value ?? '—').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

export async function printReport(title: string, style: string, body: string) {
  const win = window.open('', '_blank');
  if (!win) { toast.error('Allow popups to print this report'); return; }
  win.opener = null;
  const filters = Array.from(document.querySelectorAll('section[aria-label="Report filters"] select')).map(select => {
    const element = select as HTMLSelectElement;
    return element.selectedOptions[0]?.textContent ?? '';
  }).join(' · ');
  try {
    const { data } = await api.get('/organization/profile');
    if (win.closed) return;
    const logo = typeof data.logo === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.logo)
      ? `<img alt="School logo" src="${data.logo}" style="max-width:100px;max-height:70px;object-fit:contain">` : '';
    win.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>${style}<style>@media print{thead{display:table-header-group}tr{break-inside:avoid}}table{overflow-wrap:anywhere}</style></head><body>${logo}<h2>${escapeHtml(data.name)}</h2><p>${escapeHtml(filters)}</p>${body}</body></html>`);
    win.document.close();
    await Promise.all(Array.from(win.document.images).map(image => image.decode().catch(() => undefined)));
    if (!win.closed) { win.focus(); win.print(); }
  } catch { win.close(); toast.error('Could not prepare the school report. Please retry.'); }
}
