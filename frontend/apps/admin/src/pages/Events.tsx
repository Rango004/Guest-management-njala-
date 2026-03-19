import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Grid, CircularProgress,
  Tooltip, Divider, MenuItem, Select, FormControl, InputLabel,
  LinearProgress, Alert,
} from '@mui/material';
import {
  AddOutlined, ArrowForwardOutlined, LogoutOutlined,
  LightModeOutlined, DarkModeOutlined, EventOutlined,
  SettingsOutlined, RefreshOutlined,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { AppBackground, GlassCard, PageHeader, tokens, useColorMode } from '@congregation/ui';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
function authHeader() { return { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }; }

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:               { label: 'Draft',               color: tokens.onSurfaceMedium, bg: tokens.glass02 },
  REGISTRATION_OPEN:   { label: 'Registration Open',   color: '#60A5FA',              bg: 'rgba(96,165,250,0.12)' },
  REGISTRATION_CLOSED: { label: 'Registration Closed', color: '#FBBF24',              bg: 'rgba(251,191,36,0.12)' },
  LIVE:                { label: 'Live',                 color: '#4ADE80',              bg: 'rgba(74,222,128,0.12)' },
  CLOSED:              { label: 'Closed',               color: '#F87171',              bg: 'rgba(248,113,113,0.12)' },
  ARCHIVED:            { label: 'Archived',             color: tokens.onSurfaceDisabled, bg: tokens.glass01 },
};

const NEXT_TRANSITION: Record<string, { status: string; label: string; color: 'primary' | 'success' | 'warning' | 'error' | 'inherit' }[]> = {
  DRAFT:               [{ status: 'REGISTRATION_OPEN',   label: 'Open Registration', color: 'primary' }],
  REGISTRATION_OPEN:   [{ status: 'REGISTRATION_CLOSED', label: 'Close Registration', color: 'warning' }],
  REGISTRATION_CLOSED: [
    { status: 'LIVE',              label: 'Go Live',            color: 'success' },
    { status: 'REGISTRATION_OPEN', label: 'Reopen Registration', color: 'primary' },
  ],
  LIVE:     [{ status: 'CLOSED',   label: 'Close Event', color: 'error' }],
  CLOSED:   [{ status: 'ARCHIVED', label: 'Archive',     color: 'inherit' }],
  ARCHIVED: [],
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  name: string;
  event_date: string;
  event_start_time: string;
  event_end_time: string;
  gate_open_time: string | null;
  venue: string | null;
  status: string;
  parking_quota: number;
  guest_limit_per_grad: number;
  vehicle_auto_threshold: number;
}

const BLANK_FORM = {
  name: '', event_date: '', event_start_time: '', event_end_time: '',
  gate_open_time: '', venue: '', parking_quota: 200, guest_limit_per_grad: 2,
  vehicle_auto_threshold: 0.9,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Events() {
  const navigate = useNavigate();
  const { mode, toggle } = useColorMode();

  const [events,   setEvents]   = useState<EventRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [creating, setCreating] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState(BLANK_FORM);
  const [formErr,  setFormErr]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/events`, { headers: authHeader() });
      setEvents(data.data);
    } catch {
      setError('Failed to load events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    navigate('/');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormErr('');
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name:                   form.name,
        // event_date derived server-side from event_start_time UTC date
        event_start_time:       new Date(form.event_start_time).toISOString(),
        event_end_time:         new Date(form.event_end_time).toISOString(),
        parking_quota:          Number(form.parking_quota),
        guest_limit_per_grad:   Number(form.guest_limit_per_grad),
        vehicle_auto_threshold: Number(form.vehicle_auto_threshold),
      };
      if (form.gate_open_time) payload.gate_open_time = new Date(form.gate_open_time).toISOString();
      if (form.venue)          payload.venue = form.venue;

      await axios.post(`${API}/api/events`, payload, { headers: authHeader() });
      setCreating(false);
      setForm(BLANK_FORM);
      await load();
    } catch (err) {
      setFormErr(axios.isAxiosError(err) ? err.response?.data?.error ?? 'Create failed' : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  async function transition(eventId: string, status: string) {
    try {
      await axios.patch(`${API}/api/events/${eventId}/status`, { status }, { headers: authHeader() });
      await load();
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error ?? 'Status change failed' : 'Network error');
    }
  }

  return (
    <AppBackground>
      <Box sx={{ minHeight: '100vh', px: { xs: 2, sm: 4, md: 6 }, py: 4 }}>
        {/* Top bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '10px',
              background: `linear-gradient(135deg, ${tokens.primary}, ${tokens.secondary})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <EventOutlined sx={{ fontSize: 18, color: '#fff' }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>Congregation</Typography>
              <Typography variant="caption" sx={{ color: tokens.onSurfaceMedium }}>Admin Console</Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={load} sx={{ color: tokens.onSurfaceMedium }}>
                <RefreshOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
              <IconButton size="small" onClick={toggle} sx={{ color: tokens.onSurfaceMedium }}>
                {mode === 'dark' ? <LightModeOutlined fontSize="small" /> : <DarkModeOutlined fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Sign out">
              <IconButton size="small" onClick={logout} sx={{ color: tokens.error }}>
                <LogoutOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <PageHeader
          title="Events"
          subtitle="Select an event to manage, or create a new one"
          action={
            <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setCreating(true)}>
              Create Event
            </Button>
          }
        />

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
            <CircularProgress sx={{ color: tokens.primary }} />
          </Box>
        ) : events.length === 0 ? (
          <GlassCard sx={{ p: 6, textAlign: 'center', mt: 4 }}>
            <EventOutlined sx={{ fontSize: 48, color: tokens.onSurfaceDisabled, mb: 2 }} />
            <Typography variant="h6" color="text.secondary">No events yet</Typography>
            <Typography variant="body2" sx={{ color: tokens.onSurfaceDisabled, mt: 0.5 }}>
              Create your first event to get started
            </Typography>
            <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setCreating(true)} sx={{ mt: 3 }}>
              Create Event
            </Button>
          </GlassCard>
        ) : (
          <Grid container spacing={3} sx={{ mt: 0 }}>
            <AnimatePresence>
              {events.map((ev, i) => {
                const sc = STATUS_CONFIG[ev.status] ?? STATUS_CONFIG.DRAFT;
                const transitions = NEXT_TRANSITION[ev.status] ?? [];
                return (
                  <Grid item xs={12} md={6} xl={4} key={ev.id}>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, ease: [0.23, 1, 0.32, 1] }}
                    >
                      <GlassCard variant={ev.status === 'LIVE' ? 'elevated' : 'default'}
                        glow={ev.status === 'LIVE' ? 'success' : undefined}
                        sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}
                      >
                        {/* Header */}
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="h6" fontWeight={700} noWrap>{ev.name}</Typography>
                            <Typography variant="caption" sx={{ color: tokens.onSurfaceMedium }}>
                              {new Date(ev.event_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                              {ev.venue ? ` · ${ev.venue}` : ''}
                            </Typography>
                          </Box>
                          <Chip
                            label={sc.label}
                            size="small"
                            sx={{ fontWeight: 700, fontSize: '0.7rem', color: sc.color, background: sc.bg, border: 'none', flexShrink: 0 }}
                          />
                        </Box>

                        {/* Time range */}
                        <Box sx={{ display: 'flex', gap: 2, fontSize: '0.8rem', color: tokens.onSurfaceMedium }}>
                          <span>Starts: {new Date(ev.event_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span>·</span>
                          <span>Ends: {new Date(ev.event_end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </Box>

                        {/* Quotas */}
                        <Box sx={{ display: 'flex', gap: 2 }}>
                          <Box>
                            <Typography variant="caption" sx={{ color: tokens.onSurfaceDisabled, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              Parking
                            </Typography>
                            <Typography variant="subtitle2" fontWeight={700}>{ev.parking_quota} spots</Typography>
                          </Box>
                          <Divider orientation="vertical" flexItem />
                          <Box>
                            <Typography variant="caption" sx={{ color: tokens.onSurfaceDisabled, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              Guest Limit
                            </Typography>
                            <Typography variant="subtitle2" fontWeight={700}>{ev.guest_limit_per_grad} per grad</Typography>
                          </Box>
                        </Box>

                        {/* Actions */}
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 'auto' }}>
                          <Button
                            size="small" variant="contained"
                            endIcon={<ArrowForwardOutlined />}
                            onClick={() => navigate(`/events/${ev.id}/dashboard`)}
                          >
                            Manage
                          </Button>
                          <Button
                            size="small" variant="outlined"
                            startIcon={<SettingsOutlined />}
                            onClick={() => navigate(`/events/${ev.id}/config`)}
                          >
                            Config
                          </Button>
                          {transitions.map(t => (
                            <Button
                              key={t.status}
                              size="small"
                              variant="outlined"
                              color={t.color}
                              onClick={() => transition(ev.id, t.status)}
                            >
                              {t.label}
                            </Button>
                          ))}
                        </Box>
                      </GlassCard>
                    </motion.div>
                  </Grid>
                );
              })}
            </AnimatePresence>
          </Grid>
        )}
      </Box>

      {/* Create Event Dialog */}
      <Dialog
        open={creating}
        onClose={() => { setCreating(false); setFormErr(''); setForm(BLANK_FORM); }}
        maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '20px' } }}
      >
        <Box component="form" onSubmit={handleCreate}>
          <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Create Event</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
            {formErr && <Alert severity="error" onClose={() => setFormErr('')}>{formErr}</Alert>}

            <TextField
              label="Event Name" value={form.name} required fullWidth
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Start Time" type="datetime-local" value={form.event_start_time} required fullWidth
                  InputLabelProps={{ shrink: true }}
                  helperText="Event date is derived from this"
                  onChange={e => setForm(f => ({ ...f, event_start_time: e.target.value }))}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="End Time" type="datetime-local" value={form.event_end_time} required fullWidth
                  InputLabelProps={{ shrink: true }}
                  onChange={e => setForm(f => ({ ...f, event_end_time: e.target.value }))}
                />
              </Grid>
            </Grid>
            <TextField
              label="Gate Open Time (optional)" type="datetime-local" value={form.gate_open_time} fullWidth
              helperText="Gates will reject scans before this time"
              InputLabelProps={{ shrink: true }}
              onChange={e => setForm(f => ({ ...f, gate_open_time: e.target.value }))}
            />
            <TextField
              label="Venue (optional)" value={form.venue} fullWidth
              onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
            />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Parking Quota" type="number" value={form.parking_quota} required fullWidth
                  inputProps={{ min: 0 }}
                  onChange={e => setForm(f => ({ ...f, parking_quota: Number(e.target.value) }))}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Guest Limit / Graduate" type="number" value={form.guest_limit_per_grad} required fullWidth
                  inputProps={{ min: 1, max: 10 }}
                  onChange={e => setForm(f => ({ ...f, guest_limit_per_grad: Number(e.target.value) }))}
                />
              </Grid>
            </Grid>
            <TextField
              label="Vehicle Auto-Approve Threshold"
              type="number" value={form.vehicle_auto_threshold} fullWidth
              helperText="Auto-approve vehicle passes below this fraction of quota (0–1)"
              inputProps={{ min: 0, max: 1, step: 0.05 }}
              onChange={e => setForm(f => ({ ...f, vehicle_auto_threshold: Number(e.target.value) }))}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => { setCreating(false); setForm(BLANK_FORM); setFormErr(''); }}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? <CircularProgress size={18} color="inherit" /> : 'Create'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </AppBackground>
  );
}
