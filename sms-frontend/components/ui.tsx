/**
 * ui.tsx — Shared UI primitives for the school management system
 *
 * Usage:
 *   import { C, FONT, inputSx, menuProps, thSx, tdSx,
 *            StatCard, PageHeader, SectionLabel, EmptyState,
 *            WarningBanner, DeleteDialog, MobileFab,
 *            StatusChip, PassRateChip, PayBar, MarkBar,
 *            AttBar, ReportFiltersCard, ExportButton,
 *            GradeChip, FeeStatusChip, PayrollStatusChip } from '@/components/ui';
 */

import React from 'react';
import {
  Box, Button, Card, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Fab, Grid, IconButton, LinearProgress, MenuItem,
  Table, TableCell, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Add, Download, FilterList, Refresh, Warning } from '@mui/icons-material';

// ─────────────────────────────────────────────────────────────────────
// 1. Design tokens
// ─────────────────────────────────────────────────────────────────────
export const C = {
  bg:           '#0D1117',
  surface:      '#161B27',
  surfaceHover: '#1C2333',
  border:       'rgba(255,255,255,0.07)',
  accent:       '#F59E0B',
  accentDim:    'rgba(245,158,11,0.12)',
  accentGlow:   'rgba(245,158,11,0.28)',
  textPrimary:  '#F9FAFB',
  textSecondary:'rgba(249,250,251,0.45)',
  green:        '#34D399',
  greenDim:     'rgba(52,211,153,0.1)',
  blue:         '#60A5FA',
  blueDim:      'rgba(96,165,250,0.1)',
  red:          '#F87171',
  redDim:       'rgba(248,113,113,0.1)',
  purple:       '#A78BFA',
  purpleDim:    'rgba(167,139,250,0.1)',
  yellow:       '#FBBF24',
  yellowDim:    'rgba(251,191,36,0.1)',
  inputBg:      '#1C2333',
} as const;

export const FONT = "'DM Sans', sans-serif";
export const EASE = '280ms cubic-bezier(0.4,0,0.2,1)';

// ─────────────────────────────────────────────────────────────────────
// 2. MUI style overrides
// ─────────────────────────────────────────────────────────────────────
export const inputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: C.inputBg, borderRadius: '10px',
    fontFamily: FONT, color: C.textPrimary, fontSize: '0.875rem',
    '& fieldset': { borderColor: C.border },
    '&:hover fieldset': { borderColor: 'rgba(245,158,11,0.35)' },
    '&.Mui-focused fieldset': { borderColor: C.accent },
  },
  '& .MuiInputLabel-root': { color: C.textSecondary, fontFamily: FONT, fontSize: '0.875rem' },
  '& .MuiInputLabel-root.Mui-focused': { color: C.accent },
  '& input': { color: C.textPrimary, fontFamily: FONT },
  '& .MuiSelect-select': { color: C.textPrimary, fontFamily: FONT },
  '& .MuiSvgIcon-root': { color: C.textSecondary },
};

export const menuProps = {
  PaperProps: {
    sx: {
      backgroundColor: C.surfaceHover, border: `1px solid ${C.border}`,
      borderRadius: '10px', boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
      '& .MuiMenuItem-root': {
        fontFamily: FONT, fontSize: '0.875rem', color: C.textPrimary,
        '&:hover': { backgroundColor: C.accentDim },
        '&.Mui-selected': { backgroundColor: C.accentDim, color: C.accent },
      },
    },
  },
};

export const thSx = {
  borderColor: C.border, color: C.textSecondary, fontFamily: FONT,
  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase' as const, py: 1.5, whiteSpace: 'nowrap' as const,
  backgroundColor: C.surfaceHover,
};

export const tdSx = {
  borderColor: C.border, color: C.textPrimary,
  fontFamily: FONT, fontSize: '0.855rem', py: 1.75,
};

export const editIconSx = {
  color: C.textSecondary, borderRadius: '8px', p: 0.75,
  '&:hover': { backgroundColor: C.accentDim, color: C.accent },
  transition: `all ${EASE}`,
};

export const deleteIconSx = {
  color: C.textSecondary, borderRadius: '8px', p: 0.75,
  '&:hover': { backgroundColor: C.redDim, color: C.red },
  transition: `all ${EASE}`,
};

// ─────────────────────────────────────────────────────────────────────
// 3. GlobalStyles
// ─────────────────────────────────────────────────────────────────────
export const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `}</style>
);

// ─────────────────────────────────────────────────────────────────────
// 4. StatCard
// ─────────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  color: string;
  dim: string;
  icon: React.ElementType;
  delay?: number;
  sub?: string;
}

export function StatCard({ label, value, color, dim, icon: Icon, delay = 0, sub }: StatCardProps) {
  return (
    <Card sx={{
      backgroundColor: C.surface, border: `1px solid ${C.border}`,
      borderRadius: '12px', p: 2.5, position: 'relative', overflow: 'hidden',
      transition: `transform ${EASE}, box-shadow ${EASE}`,
      animation: `fadeUp 0.4s ${delay}ms ease both`,
      '&:hover': { transform: 'translateY(-3px)', boxShadow: `0 12px 32px rgba(0,0,0,0.3), 0 0 0 1px ${color}25` },
      '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, ${color}, transparent)` },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontSize: '0.68rem', color: C.textSecondary, fontFamily: FONT, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.75 }}>{label}</Typography>
          <Typography sx={{ fontSize: '1.6rem', fontWeight: 700, color: C.textPrimary, fontFamily: FONT, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</Typography>
          {sub && <Typography sx={{ fontSize: '0.7rem', color: C.textSecondary, fontFamily: FONT, mt: 0.5 }}>{sub}</Typography>}
        </Box>
        <Box sx={{ width: 40, height: 40, borderRadius: '10px', backgroundColor: dim, border: `1px solid ${color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon sx={{ fontSize: 20, color }} />
        </Box>
      </Box>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 5. PageHeader
// ─────────────────────────────────────────────────────────────────────
interface PageHeaderProps {
  title: string;
  subtitle: string;
  badge?: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  actionTooltip?: string;
  onAction?: () => void;
  isMobile?: boolean;
  /** Extra buttons rendered to the right of the main action */
  extraActions?: React.ReactNode;
}

export function PageHeader({
  title, subtitle, badge,
  actionLabel, actionDisabled, actionTooltip, onAction,
  isMobile = false, extraActions,
}: PageHeaderProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', mb: { xs: 3, md: 4 }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <Box sx={{ width: 3, height: 22, borderRadius: 2, backgroundColor: C.accent, boxShadow: `0 0 8px ${C.accent}` }} />
          <Typography sx={{ fontSize: { xs: '1.15rem', md: '1.35rem' }, fontWeight: 700, color: C.textPrimary, fontFamily: FONT, letterSpacing: '-0.02em' }}>{title}</Typography>
          {badge && <Chip label={badge} size="small" sx={{ backgroundColor: C.greenDim, color: C.green, fontFamily: FONT, fontWeight: 600, fontSize: '0.72rem', border: `1px solid ${C.green}25`, height: 24 }} />}
        </Box>
        <Typography sx={{ color: C.textSecondary, fontSize: '0.82rem', fontFamily: FONT, ml: '19px' }}>{subtitle}</Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {extraActions}
        {actionLabel && !isMobile && (
          <Tooltip title={actionDisabled ? (actionTooltip ?? '') : ''} arrow>
            <span>
              <Button onClick={onAction} disabled={actionDisabled} startIcon={<Add sx={{ fontSize: 18 }} />}
                sx={{ backgroundColor: actionDisabled ? 'rgba(255,255,255,0.06)' : C.accent, color: actionDisabled ? C.textSecondary : '#111827', fontFamily: FONT, fontWeight: 600, fontSize: '0.82rem', borderRadius: '10px', px: 2.5, py: 1, textTransform: 'none', whiteSpace: 'nowrap', boxShadow: actionDisabled ? 'none' : `0 4px 16px ${C.accentDim}`, '&:hover': actionDisabled ? {} : { backgroundColor: '#FBBF24' }, '&.Mui-disabled': { backgroundColor: 'rgba(255,255,255,0.05)', color: C.textSecondary } }}>
                {actionLabel}
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 6. SectionLabel
// ─────────────────────────────────────────────────────────────────────
export function SectionLabel({ label }: { label: string }) {
  return (
    <Grid item xs={12}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, mb: 0.5 }}>
        <Box sx={{ width: 3, height: 15, borderRadius: 1, backgroundColor: C.accent }} />
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSecondary, fontFamily: FONT }}>{label}</Typography>
      </Box>
    </Grid>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 7. EmptyState
// ─────────────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon: React.ElementType;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}

export function EmptyState({ icon: Icon, message, actionLabel, onAction, actionDisabled }: EmptyStateProps) {
  return (
    <Box sx={{ textAlign: 'center', py: 10 }}>
      <Icon sx={{ fontSize: 44, color: C.textSecondary, mb: 1.5, opacity: 0.4 }} />
      <Typography sx={{ color: C.textSecondary, fontFamily: FONT, fontSize: '0.9rem' }}>{message}</Typography>
      {actionLabel && !actionDisabled && (
        <Button onClick={onAction} sx={{ mt: 2, color: C.accent, fontFamily: FONT, textTransform: 'none', fontSize: '0.85rem' }}>+ {actionLabel}</Button>
      )}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 8. WarningBanner
// ─────────────────────────────────────────────────────────────────────
interface WarningBannerProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function WarningBanner({ title, description, actionLabel, onAction }: WarningBannerProps) {
  return (
    <Box sx={{ p: 2.5, mb: 3, borderRadius: '12px', backgroundColor: C.redDim, border: `1px solid ${C.red}25`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Warning sx={{ fontSize: 18, color: C.red, mt: 0.1, flexShrink: 0 }} />
        <Box>
          <Typography sx={{ fontSize: '0.875rem', color: C.red, fontFamily: FONT, fontWeight: 600, mb: 0.25 }}>{title}</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: C.textSecondary, fontFamily: FONT }}>{description}</Typography>
        </Box>
      </Box>
      {actionLabel && <Button size="small" onClick={onAction} sx={{ color: C.red, border: `1px solid ${C.red}40`, fontFamily: FONT, fontWeight: 600, fontSize: '0.78rem', textTransform: 'none', borderRadius: '8px', px: 2, flexShrink: 0, '&:hover': { backgroundColor: C.redDim } }}>{actionLabel} →</Button>}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 9. InfoBox
// ─────────────────────────────────────────────────────────────────────
export function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <Grid item xs={12}>
      <Box sx={{ p: 1.5, borderRadius: '10px', backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.18)` }}>
        <Typography sx={{ fontSize: '0.75rem', color: C.accent, fontFamily: FONT }}>{children}</Typography>
      </Box>
    </Grid>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 10. DeleteDialog
// ─────────────────────────────────────────────────────────────────────
interface DeleteDialogProps {
  open: boolean; onClose: () => void; onConfirm: () => void;
  loading?: boolean; title?: string; description?: string;
}

export function DeleteDialog({ open, onClose, onConfirm, loading = false, title = 'Delete this item?', description = 'This action cannot be undone.' }: DeleteDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' } }}>
      <DialogTitle sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '1rem', color: C.textPrimary, pb: 1 }}>{title}</DialogTitle>
      <DialogContent><Typography sx={{ color: C.textSecondary, fontFamily: FONT, fontSize: '0.875rem' }}>{description}</Typography></DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, borderTop: `1px solid ${C.border}` }}>
        <Button onClick={onClose} disabled={loading} sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: 'none', borderRadius: '8px' }}>Cancel</Button>
        <Button variant="contained" onClick={onConfirm} disabled={loading} sx={{ backgroundColor: C.red, color: '#fff', fontFamily: FONT, fontWeight: 600, textTransform: 'none', borderRadius: '10px', px: 3, '&:hover': { backgroundColor: '#ef4444' } }}>{loading ? 'Deleting…' : 'Delete'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 11. MobileFab
// ─────────────────────────────────────────────────────────────────────
interface MobileFabProps { onClick: () => void; disabled?: boolean; tooltip?: string; }

export function MobileFab({ onClick, disabled = false, tooltip = 'Add' }: MobileFabProps) {
  return (
    <Tooltip title={disabled ? tooltip : ''} arrow>
      <span style={{ position: 'fixed', bottom: 24, right: 24 }}>
        <Fab onClick={onClick} disabled={disabled} sx={{ backgroundColor: disabled ? 'rgba(255,255,255,0.08)' : C.accent, color: disabled ? C.textSecondary : '#111827', boxShadow: disabled ? 'none' : `0 8px 24px ${C.accentGlow}`, '&:hover': disabled ? {} : { backgroundColor: '#FBBF24' }, '&.Mui-disabled': { backgroundColor: 'rgba(255,255,255,0.05)', color: C.textSecondary } }}>
          <Add />
        </Fab>
      </span>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 12. StatusChip
// ─────────────────────────────────────────────────────────────────────
interface StatusChipProps { label: string; color: string; dim: string; icon?: React.ElementType; }

export function StatusChip({ label, color, dim, icon: Icon }: StatusChipProps) {
  return (
    <Chip size="small" label={label}
      icon={Icon ? <Icon sx={{ fontSize: '11px !important', color: `${color} !important` }} /> : undefined}
      sx={{ backgroundColor: dim, color, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid ${color}30` }} />
  );
}

// ─────────────────────────────────────────────────────────────────────
// 13. PassRateChip
// ─────────────────────────────────────────────────────────────────────
export function PassRateChip({ total, pass }: { total: number; pass: number }) {
  const pct = total > 0 ? Math.round((pass / total) * 100) : 0;
  const color = pct >= 60 ? C.green : pct >= 40 ? C.accent : C.red;
  const dim   = pct >= 60 ? C.greenDim : pct >= 40 ? C.accentDim : C.redDim;
  return <Chip label={`${pct}%`} size="small" sx={{ backgroundColor: dim, color, fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', height: 22, border: `1px solid ${color}30` }} />;
}

// ─────────────────────────────────────────────────────────────────────
// 14. TableGroupHeader
// ─────────────────────────────────────────────────────────────────────
interface TableGroupHeaderProps { icon: React.ElementType; label: string; count: number; colSpan: number; }

export function TableGroupHeader({ icon: Icon, label, count, colSpan }: TableGroupHeaderProps) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} sx={{ borderColor: C.border, backgroundColor: 'rgba(245,158,11,0.05)', py: 1, px: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Icon sx={{ fontSize: 13, color: C.accent }} />
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: C.accent, fontFamily: FONT, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</Typography>
          <Chip label={`${count} item${count !== 1 ? 's' : ''}`} size="small" sx={{ backgroundColor: C.accentDim, color: C.accent, fontFamily: FONT, fontWeight: 600, fontSize: '0.65rem', height: 18, border: `1px solid rgba(245,158,11,0.2)` }} />
        </Box>
      </TableCell>
    </TableRow>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 15. DataTable
// ─────────────────────────────────────────────────────────────────────
export function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <Card sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', boxShadow: '0 4px 24px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
      <Box sx={{ overflowX: 'auto' }}>{children}</Box>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 16. DialogShell
// ─────────────────────────────────────────────────────────────────────
interface DialogShellProps {
  open: boolean; onClose: () => void; title: string;
  maxWidth?: 'xs' | 'sm' | 'md'; isMobile?: boolean;
  saving?: boolean; saveLabel?: string; onSave?: () => void;
  saveDisabled?: boolean; children: React.ReactNode;
}

export function DialogShell({ open, onClose, title, maxWidth = 'sm', isMobile = false, saving = false, saveLabel = 'Save', onSave, saveDisabled = false, children }: DialogShellProps) {
  const { Close } = require('@mui/icons-material');
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={maxWidth} fullScreen={isMobile}
      PaperProps={{ sx: { backgroundColor: C.surface, border: isMobile ? 'none' : `1px solid ${C.border}`, borderRadius: isMobile ? 0 : '16px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' } }}>
      <DialogTitle sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '1.05rem', color: C.textPrimary, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {title}
        {isMobile && <IconButton onClick={onClose} sx={{ color: C.textSecondary }}><Close /></IconButton>}
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>{children}</DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, borderTop: `1px solid ${C.border}` }}>
        <Button onClick={onClose} disabled={saving} sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: 'none', borderRadius: '8px' }}>Cancel</Button>
        {onSave && (
          <Button variant="contained" onClick={onSave} disabled={saving || saveDisabled}
            sx={{ backgroundColor: C.accent, color: '#111827', fontFamily: FONT, fontWeight: 600, textTransform: 'none', borderRadius: '10px', px: 3, '&:hover': { backgroundColor: '#FBBF24' }, '&.Mui-disabled': { backgroundColor: 'rgba(245,158,11,0.2)', color: 'rgba(17,24,39,0.4)' } }}>
            {saving ? 'Saving…' : saveLabel}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════════════════
// NEW COMPONENTS BELOW
// ═════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────
// 17. PayBar — fee/salary payment progress bar
// ─────────────────────────────────────────────────────────────────────
interface PayBarProps { paid: number; total: number; currency?: string; }

export function PayBar({ paid, total, currency = '₨' }: PayBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const color = pct === 100 ? C.green : pct > 0 ? C.accent : C.red;
  return (
    <Box sx={{ minWidth: 110 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
        <Typography sx={{ fontSize: '0.72rem', fontFamily: FONT, color: C.textPrimary, fontWeight: 600 }}>{currency}{paid.toLocaleString()}</Typography>
        <Typography sx={{ fontSize: '0.68rem', fontFamily: FONT, color, fontWeight: 600 }}>{pct}%</Typography>
      </Box>
      <LinearProgress variant="determinate" value={pct} sx={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.07)', '& .MuiLinearProgress-bar': { backgroundColor: color, borderRadius: 2 } }} />
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 18. MarkBar — exam marks progress bar
// ─────────────────────────────────────────────────────────────────────
interface MarkBarProps { obtained: number; total: number; pass: number; }

export function MarkBar({ obtained, total, pass }: MarkBarProps) {
  const pct = total > 0 ? Math.round((obtained / total) * 100) : 0;
  const color = obtained >= pass ? C.green : C.red;
  return (
    <Box sx={{ minWidth: 110 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
        <Typography sx={{ fontSize: '0.75rem', fontFamily: FONT, color: C.textPrimary, fontWeight: 700 }}>{obtained}/{total}</Typography>
        <Typography sx={{ fontSize: '0.72rem', fontFamily: FONT, color, fontWeight: 600 }}>{pct}%</Typography>
      </Box>
      <LinearProgress variant="determinate" value={pct} sx={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.07)', '& .MuiLinearProgress-bar': { backgroundColor: color, borderRadius: 3 } }} />
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 19. AttBar — attendance percentage bar
// ─────────────────────────────────────────────────────────────────────
export function AttBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? C.green : pct >= 60 ? C.yellow : C.red;
  const label = pct >= 80 ? 'Good' : pct >= 60 ? 'Average' : 'Poor';
  return (
    <Box sx={{ minWidth: 120 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
        <Typography sx={{ fontSize: '0.78rem', fontFamily: FONT, color, fontWeight: 700 }}>{pct}%</Typography>
        <Typography sx={{ fontSize: '0.68rem', fontFamily: FONT, color: C.textSecondary }}>{label}</Typography>
      </Box>
      <LinearProgress variant="determinate" value={pct} sx={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.07)', '& .MuiLinearProgress-bar': { backgroundColor: color, borderRadius: 3 } }} />
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 20. GradeChip — colored chip based on exam grade letter
// ─────────────────────────────────────────────────────────────────────
export function GradeChip({ grade }: { grade: string | null }) {
  if (!grade) return <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: C.textSecondary }}>—</Typography>;
  const u = grade.toUpperCase();
  let color: string = C.red, dim: string = C.redDim;
  if (['A+','A','A1'].includes(u)) { color = C.green;  dim = C.greenDim;  }
  else if (['B+','B','B1'].includes(u)) { color = C.blue;   dim = C.blueDim;   }
  else if (['C+','C','C1'].includes(u)) { color = C.accent; dim = C.accentDim; }
  else if (['D','D1'].includes(u))      { color = C.purple; dim = C.purpleDim; }
  return <Chip label={grade} size="small" sx={{ backgroundColor: dim, color, fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', height: 22, border: `1px solid ${color}30` }} />;
}

// ─────────────────────────────────────────────────────────────────────
// 21. FeeStatusChip — paid / unpaid / partial
// ─────────────────────────────────────────────────────────────────────
export function FeeStatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; dim: string }> = {
    paid:    { label: 'Paid',    color: C.green,  dim: C.greenDim  },
    unpaid:  { label: 'Unpaid',  color: C.red,    dim: C.redDim    },
    partial: { label: 'Partial', color: C.accent, dim: C.accentDim },
  };
  const s = map[status] ?? map.unpaid;
  return <Chip label={s.label} size="small" sx={{ backgroundColor: s.dim, color: s.color, fontFamily: FONT, fontWeight: 700, fontSize: '0.7rem', height: 22, border: `1px solid ${s.color}33` }} />;
}

// ─────────────────────────────────────────────────────────────────────
// 22. PayrollStatusChip — alias of FeeStatusChip with same logic
// ─────────────────────────────────────────────────────────────────────
export const PayrollStatusChip = FeeStatusChip;

// ─────────────────────────────────────────────────────────────────────
// 23. ClassChip — grade + section amber chip
// ─────────────────────────────────────────────────────────────────────
export function ClassChip({ grade, section }: { grade: string | null; section?: string | null }) {
  if (!grade) return <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: C.textSecondary }}>Not enrolled</Typography>;
  return (
    <Chip label={section ? `${grade} – ${section}` : grade} size="small"
      sx={{ backgroundColor: C.accentDim, color: C.accent, fontFamily: FONT, fontWeight: 600, fontSize: '0.72rem', height: 22, border: `1px solid rgba(245,158,11,0.2)` }} />
  );
}

// ─────────────────────────────────────────────────────────────────────
// 24. ActiveChip — active / inactive status
// ─────────────────────────────────────────────────────────────────────
export function ActiveChip({ active }: { active: boolean }) {
  return (
    <Chip label={active ? 'Active' : 'Inactive'} size="small"
      sx={{ backgroundColor: active ? C.greenDim : C.redDim, color: active ? C.green : C.red, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 20 }} />
  );
}

// ─────────────────────────────────────────────────────────────────────
// 25. InitialsAvatar — colored circle with initials
// ─────────────────────────────────────────────────────────────────────
interface InitialsAvatarProps { name: string; color?: string; dim?: string; size?: number; }

export function InitialsAvatar({ name, color = C.accent, dim = C.accentDim, size = 30 }: InitialsAvatarProps) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <Box sx={{ width: size, height: size, borderRadius: '50%', backgroundColor: dim, border: `1px solid ${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Typography sx={{ fontSize: size * 0.28 + 'px', fontWeight: 700, color, fontFamily: FONT }}>{initials}</Typography>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 26. StudentCell — avatar + name + admission no
// ─────────────────────────────────────────────────────────────────────
interface StudentCellProps { name: string; admissionNo?: string | null; color?: string; dim?: string; }

export function StudentCell({ name, admissionNo, color = C.accent, dim = C.accentDim }: StudentCellProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <InitialsAvatar name={name} color={color} dim={dim} />
      <Box>
        <Typography sx={{ fontFamily: FONT, fontWeight: 600, fontSize: '0.855rem', color: C.textPrimary, lineHeight: 1.2 }}>{name}</Typography>
        {admissionNo && <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: C.accent }}>{admissionNo}</Typography>}
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 27. ReportHeader — consistent header for all report pages
// ─────────────────────────────────────────────────────────────────────
interface ReportHeaderProps {
  title: string;
  subtitle: string;
  onRefresh: () => void;
  onExport: () => void;
  refreshing?: boolean;
}

export function ReportHeader({ title, subtitle, onRefresh, onExport, refreshing = false }: ReportHeaderProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 4, flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <Box sx={{ width: 3, height: 22, borderRadius: 2, backgroundColor: C.accent, boxShadow: `0 0 8px ${C.accent}` }} />
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 700, color: C.textPrimary, fontFamily: FONT, letterSpacing: '-0.02em' }}>{title}</Typography>
        </Box>
        <Typography sx={{ color: C.textSecondary, fontSize: '0.82rem', fontFamily: FONT, ml: '19px' }}>{subtitle}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button onClick={onRefresh} disabled={refreshing} startIcon={<Refresh sx={{ fontSize: 16 }} />}
          sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: 'none', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '0.8rem', '&:hover': { backgroundColor: C.accentDim, color: C.accent }, '&.Mui-disabled': { opacity: 0.5 } }}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
        <Button onClick={onExport} startIcon={<Download sx={{ fontSize: 16 }} />}
          sx={{ backgroundColor: C.accent, color: '#111', fontFamily: FONT, fontWeight: 700, textTransform: 'none', borderRadius: '8px', fontSize: '0.8rem', '&:hover': { backgroundColor: '#FBBF24' } }}>
          Export PDF
        </Button>
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 28. ReportFiltersCard — collapsible filters card for report pages
// ─────────────────────────────────────────────────────────────────────
interface ReportFiltersCardProps { children: React.ReactNode; count?: number; }

export function ReportFiltersCard({ children, count }: ReportFiltersCardProps) {
  return (
    <Card sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', p: 2.5, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <FilterList sx={{ fontSize: 16, color: C.accent }} />
        <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.82rem', color: C.textPrimary }}>Filters</Typography>
        {count !== undefined && (
          <Chip label={`${count} result${count !== 1 ? 's' : ''}`} size="small"
            sx={{ backgroundColor: C.accentDim, color: C.accent, fontFamily: FONT, fontWeight: 600, fontSize: '0.65rem', height: 20, ml: 'auto' }} />
        )}
      </Box>
      <Grid container spacing={2}>{children}</Grid>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 29. ReportFilterSelect — single filter dropdown for report pages
// ─────────────────────────────────────────────────────────────────────
interface ReportFilterSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  md?: number;
}

export function ReportFilterSelect({ label, value, onChange, options, md = 4 }: ReportFilterSelectProps) {
  return (
    <Grid item xs={12} md={md}>
      <TextField select fullWidth label={label} value={value} onChange={e => onChange(e.target.value)} sx={inputSx} SelectProps={{ MenuProps: menuProps }}>
        {options.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
      </TextField>
    </Grid>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 30. MiniStatCard — compact stat for report pages (no icon, 4-col grid)
// ─────────────────────────────────────────────────────────────────────
interface MiniStatCardProps { label: string; value: string | number; color: string; dim: string; sub?: string; }

export function MiniStatCard({ label, value, color, dim, sub }: MiniStatCardProps) {
  return (
    <Card sx={{ backgroundColor: dim, border: `1px solid ${color}22`, borderRadius: '14px', p: 2.5 }}>
      <Typography sx={{ fontSize: '0.72rem', color: C.textSecondary, fontFamily: FONT, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', mb: 1 }}>{label}</Typography>
      <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color, fontFamily: FONT, lineHeight: 1 }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: '0.72rem', color: C.textSecondary, fontFamily: FONT, mt: 0.5 }}>{sub}</Typography>}
    </Card>
  );
}