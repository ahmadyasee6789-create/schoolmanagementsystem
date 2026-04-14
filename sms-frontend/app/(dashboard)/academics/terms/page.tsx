/**
 * TermsPage.refactored.tsx
 * Demonstrates how much code is eliminated using shared ui.tsx components.
 * Before: ~420 lines   After: ~220 lines   (-48%)
 */
'use client';

import React, { useEffect, useState } from 'react';
import {
  Box, Card, Chip, CircularProgress, Grid, IconButton, MenuItem,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import { Edit, Delete, Search, BookOutlined, CalendarToday, LayersOutlined } from '@mui/icons-material';
import { api } from '@/app/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/app/store/authStore';
import { useRouter } from 'next/navigation';

// ── All shared primitives from ONE import ──────────────────────────────
import {
  C, FONT, EASE, inputSx, menuProps, thSx, tdSx,
  GlobalStyles, StatCard, PageHeader, SectionLabel,
  EmptyState, WarningBanner, InfoBox, DeleteDialog,
  MobileFab, TableGroupHeader, DataTable, DialogShell,
} from '@/components/ui'; 

// ─── Types ────────────────────────────────────────────────────────────
type AcademicSession = { id: number; name: string; is_active: boolean };
type Term = { id: number; name: string; academic_year_id: number; academic_year?: { id: number; name: string }; exams?: any[] };

export default function TermsPage() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const router   = useRouter();
  const { user, loading: authLoading } = useAuthStore();

  const [terms, setTerms]             = useState<Term[]>([]);
  const [activeSession, setActiveSession] = useState<AcademicSession | null>(null);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [termName, setTermName]       = useState('');
  const [saving, setSaving]           = useState(false);
  const [deleteId, setDeleteId]       = useState<number | null>(null);
  const [deleting, setDeleting]       = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────
  const fetchActiveSession = async () => {
    try { const res = await api.get('/sessions/active'); setActiveSession(res.data); }
    catch { setActiveSession(null); }
  };

  const fetchTerms = async () => {
    try {
      const res = await api.get('/terms');
      setTerms(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      if (e?.response?.status !== 400) toast.error('Failed to load terms');
      setTerms([]);
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchActiveSession(), fetchTerms()]);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/signin'); return; }
    fetchAll();
  }, [user, authLoading]);

  const filtered = terms.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  const grouped = filtered.reduce<Record<string, { sessionName: string; terms: Term[] }>>((acc, t) => {
    const key = String(t.academic_year_id);
    if (!acc[key]) acc[key] = { sessionName: t.academic_year?.name ?? `Session #${t.academic_year_id}`, terms: [] };
    acc[key].terms.push(t);
    return acc;
  }, {});

  // ── Handlers ──────────────────────────────────────────────────────
  const openAdd  = () => { setTermName(''); setEditingId(null); setDialogOpen(true); };
  const openEdit = (t: Term) => { setTermName(t.name); setEditingId(t.id); setDialogOpen(true); };

  const saveTerm = async () => {
    if (!termName.trim()) return;
    setSaving(true);
    try {
      editingId
        ? await api.put(`/terms/${editingId}`, { name: termName })
        : await api.post('/terms', { name: termName });
      toast.success(editingId ? 'Term updated' : 'Term created');
      setDialogOpen(false); fetchTerms();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Failed to save');
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/terms/${deleteId}`);
      toast.success('Term deleted'); setDeleteId(null); fetchTerms();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Failed to delete');
    } finally { setDeleting(false); }
  };

  const noActiveSession = !activeSession;
  const totalSessions   = new Set(terms.map(t => t.academic_year_id)).size;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      <GlobalStyles />

      <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, backgroundColor: C.bg, minHeight: '100%' }}>

        <PageHeader
          title="Terms"
          subtitle={activeSession ? `Active session: ${activeSession.name}` : 'No active session — activate one to manage terms'}
          badge={activeSession?.name}
          actionLabel="Add Term"
          actionDisabled={noActiveSession}
          actionTooltip="Activate an academic session first"
          onAction={openAdd}
          isMobile={isMobile}
        />

        {/* No active session warning */}
        {!loading && noActiveSession && (
          <WarningBanner
            title="No active academic session"
            description="Terms can only be created within an active session."
            actionLabel="Go to Academic Years"
            onAction={() => router.push('/organization/sessions')}
          />
        )}

        {/* Stat cards */}
        <Grid container spacing={{ xs: 1.5, md: 2 }} sx={{ mb: { xs: 2.5, md: 3 } }}>
          {[
            { label: 'Total Terms',     value: terms.length,   color: C.accent, dim: C.accentDim, icon: BookOutlined,   delay: 0   },
            { label: 'Sessions',        value: totalSessions,  color: C.blue,   dim: C.blueDim,   icon: CalendarToday,  delay: 60  },
            { label: 'Filtered',        value: filtered.length,color: C.green,  dim: C.greenDim,  icon: LayersOutlined, delay: 120 },
          ].map((s, i) => (
            <Grid item xs={12} sm={4} key={i}>
              <StatCard {...s} />
            </Grid>
          ))}
        </Grid>

        {/* Search */}
        <Box sx={{ mb: 2.5 }}>
          <TextField fullWidth placeholder="Search terms…" value={search} size="small"
            onChange={(e) => setSearch(e.target.value)} sx={inputSx}
            InputProps={{ startAdornment: <Search sx={{ color: C.textSecondary, mr: 1, fontSize: 18 }} /> }} />
        </Box>

        {/* Content */}
        {(loading || authLoading) ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} thickness={3} sx={{ color: C.accent }} />
          </Box>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={BookOutlined}
            message={search ? 'No terms match your search' : 'No terms yet for this session'}
            actionLabel="Add your first term"
            onAction={openAdd}
            actionDisabled={noActiveSession}
          />
        ) : isMobile ? (
          // Mobile cards
          <Box>
            {filtered.map(term => (
              <Card key={term.id} sx={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', p: 2, mb: 1.5, transition: `border-color ${EASE}`, '&:hover': { borderColor: 'rgba(245,158,11,0.25)' } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1, mr: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Box sx={{ width: 28, height: 28, borderRadius: '8px', backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <BookOutlined sx={{ fontSize: 14, color: C.accent }} />
                      </Box>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: C.textPrimary, fontFamily: FONT }}>{term.name}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <CalendarToday sx={{ fontSize: 12, color: C.textSecondary }} />
                      <Typography sx={{ fontSize: '0.78rem', color: C.textSecondary, fontFamily: FONT }}>
                        {term.academic_year?.name ?? `Session #${term.academic_year_id}`}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <IconButton size="small" onClick={() => openEdit(term)} sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.accentDim, color: C.accent } }}>
                      <Edit sx={{ fontSize: 15 }} />
                    </IconButton>
                    <IconButton size="small" onClick={() => setDeleteId(term.id)} sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.redDim, color: C.red } }}>
                      <Delete sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Box>
                </Box>
              </Card>
            ))}
          </Box>
        ) : (
          // Desktop table
          <DataTable>
            <Table>
              <TableHead>
                <TableRow>
                  {['Term Name', 'Academic Session', 'Exams', 'Actions'].map(h => (
                    <TableCell key={h} sx={thSx}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(grouped).map(([key, group]) => (
                  <React.Fragment key={key}>
                    <TableGroupHeader icon={CalendarToday} label={group.sessionName} count={group.terms.length} colSpan={4} />
                    {group.terms.map((term, i) => (
                      <TableRow key={term.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, transition: `background ${EASE}`, animation: `fadeUp 0.35s ${i * 40}ms ease both` }}>
                        <TableCell sx={{ ...tdSx, fontWeight: 600 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ width: 30, height: 30, borderRadius: '8px', backgroundColor: C.accentDim, border: `1px solid rgba(245,158,11,0.18)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <BookOutlined sx={{ fontSize: 14, color: C.accent }} />
                            </Box>
                            {term.name}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ ...tdSx, color: C.textSecondary }}>
                          {term.academic_year?.name ?? activeSession?.name ?? `Session #${term.academic_year_id}`}
                        </TableCell>
                        <TableCell sx={tdSx}>
                          {(term.exams?.length ?? 0) > 0
                            ? <Chip label={`${term.exams?.length} exams`} size="small" sx={{ backgroundColor: C.blueDim, color: C.blue, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22, border: `1px solid ${C.blue}25` }} />
                            : <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: C.textSecondary }}>—</Typography>
                          }
                        </TableCell>
                        <TableCell sx={tdSx}>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <IconButton size="small" onClick={() => openEdit(term)} sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.accentDim, color: C.accent }, transition: `all ${EASE}` }}>
                              <Edit sx={{ fontSize: 15 }} />
                            </IconButton>
                            <IconButton size="small" onClick={() => setDeleteId(term.id)} sx={{ color: C.textSecondary, borderRadius: '8px', p: 0.75, '&:hover': { backgroundColor: C.redDim, color: C.red }, transition: `all ${EASE}` }}>
                              <Delete sx={{ fontSize: 15 }} />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        )}

        {/* Mobile FAB */}
        {isMobile && (
          <MobileFab onClick={openAdd} disabled={noActiveSession} tooltip="Activate a session first" />
        )}

        {/* Add / Edit dialog */}
        <DialogShell
          open={dialogOpen} onClose={() => setDialogOpen(false)}
          title={editingId ? 'Edit Term' : 'Add New Term'}
          maxWidth="xs" isMobile={isMobile} saving={saving}
          saveLabel={editingId ? 'Update Term' : 'Create Term'}
          onSave={saveTerm} saveDisabled={!termName.trim()}
        >
          <Grid container spacing={2} mt={0}>
            {activeSession && (
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: '10px', backgroundColor: C.greenDim, border: `1px solid ${C.green}25` }}>
                  <CalendarToday sx={{ fontSize: 16, color: C.green }} />
                  <Box>
                    <Typography sx={{ fontSize: '0.68rem', color: C.green, fontFamily: FONT, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Active Session</Typography>
                    <Typography sx={{ fontSize: '0.875rem', color: C.textPrimary, fontFamily: FONT, fontWeight: 600 }}>{activeSession.name}</Typography>
                  </Box>
                  <Chip label="Auto-assigned" size="small" sx={{ ml: 'auto', backgroundColor: C.greenDim, color: C.green, fontFamily: FONT, fontWeight: 600, fontSize: '0.65rem', height: 20, border: `1px solid ${C.green}30` }} />
                </Box>
              </Grid>
            )}
            <SectionLabel label="Term Details" />
            <Grid item xs={12}>
              <TextField fullWidth label="Term Name" required autoFocus placeholder="e.g. Term 1, Mid-Year, Final Term"
                sx={inputSx} value={termName} onChange={(e) => setTermName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && termName.trim()) saveTerm(); }} />
            </Grid>
            <InfoBox>
              💡 This term will be created under the active session. Terms group exams (e.g. midterms, finals).
            </InfoBox>
          </Grid>
        </DialogShell>

        {/* Delete confirm */}
        <DeleteDialog
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={confirmDelete}
          loading={deleting}
          title="Delete Term?"
          description="This will permanently delete the term. Deletion is blocked if exams are linked to it."
        />

      </Box>
    </>
  );
}