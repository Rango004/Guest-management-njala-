import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Tabs, Tab, Button, TextField, Grid, Chip,
  Table, TableHead, TableRow, TableCell, TableBody, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
  Alert, Select, MenuItem, FormControl, InputLabel, Tooltip,
} from '@mui/material';
import {
  AddOutlined, DeleteOutlineOutlined, SaveOutlined, ArrowForwardOutlined, ContentCopyOutlined,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import { GlassCard, PageHeader, tokens } from '@congregation/ui';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
function authHeader() { return { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }; }

// ── Types ──────────────────────────────────────────────────────────────────────

interface EventData {
  id: string; name: string; event_date: string;
  event_start_time: string; event_end_time: string;
  gate_open_time: string | null; venue: string | null;
  parking_quota: number; guest_limit_per_grad: number;
  vehicle_auto_threshold: number; status: string;
}
interface Gate { id: string; code: string; type: 'PEDESTRIAN' | 'VEHICLE' | 'GRADUATE'; label: string | null; }
interface Faculty { id: string; name: string; code: string; gate_id: string; gate_code: string; gate_type: string; }

const GATE_TYPES = ['PEDESTRIAN', 'VEHICLE', 'GRADUATE'] as const;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:               { label: 'Draft',               color: tokens.onSurfaceMedium, bg: tokens.glass02 },
  REGISTRATION_OPEN:   { label: 'Registration Open',   color: '#60A5FA',              bg: 'rgba(96,165,250,0.12)' },
  REGISTRATION_CLOSED: { label: 'Registration Closed', color: '#FBBF24',              bg: 'rgba(251,191,36,0.12)' },
  LIVE:                { label: 'Live',                 color: '#4ADE80',              bg: 'rgba(74,222,128,0.12)' },
  CLOSED:              { label: 'Closed',               color: '#F87171',              bg: 'rgba(248,113,113,0.12)' },
  ARCHIVED:            { label: 'Archived',             color: tokens.onSurfaceDisabled, bg: tokens.glass01 },
};

const NEXT_TRANSITION: Record<string, { status: string; label: string; color: 'primary' | 'success' | 'warning' | 'error' | 'inherit' }[]> = {
  DRAFT:               [{ status: 'REGISTRATION_OPEN',   label: 'Open Registration',   color: 'primary'  }],
  REGISTRATION_OPEN:   [{ status: 'REGISTRATION_CLOSED', label: 'Close Registration',  color: 'warning'  }],
  REGISTRATION_CLOSED: [
    { status: 'LIVE',              label: 'Go Live',             color: 'success' },
    { status: 'REGISTRATION_OPEN', label: 'Reopen Registration', color: 'primary' },
  ],
  LIVE:     [{ status: 'CLOSED',   label: 'Close Event', color: 'error'   }],
  CLOSED:   [
    { status: 'REGISTRATION_OPEN',   label: 'Extend Registration',  color: 'primary' },
    { status: 'REGISTRATION_CLOSED', label: 'Reopen Review Window', color: 'warning' },
    { status: 'ARCHIVED',            label: 'Archive',              color: 'inherit' },
  ],
  ARCHIVED: [],
};

// ── Tab panel helper ───────────────────────────────────────────────────────────

function TabPanel({ value, index, children }: { value: number; index: number; children: React.ReactNode }) {
  return value === index ? (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Box sx={{ pt: 3 }}>{children}</Box>
    </motion.div>
  ) : null;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EventConfig() {
  const { eventId } = useParams<{ eventId: string }>();
  const [tab, setTab]           = useState(0);
  const [event, setEvent]       = useState<EventData | null>(null);
  const [gates, setGates]       = useState<Gate[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  // Settings form
  const [settingsForm, setSettingsForm] = useState<Partial<EventData>>({});
  const [savingSettings, setSavingSettings] = useState(false);

  // Add Gate dialog
  const [addingGate, setAddingGate] = useState(false);
  const [gateForm, setGateForm]     = useState({ code: '', type: 'PEDESTRIAN' as typeof GATE_TYPES[number], label: '' });
  const [savingGate, setSavingGate] = useState(false);

  // Add Faculty dialog
  const [addingFaculty, setAddingFaculty]   = useState(false);
  const [facultyForm, setFacultyForm]       = useState({ name: '', code: '', gate_id: '' });
  const [savingFaculty, setSavingFaculty]   = useState(false);

  const loadAll = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [evRes, gRes, fRes] = await Promise.all([
        axios.get(`${API}/api/events/${eventId}`,            { headers: authHeader() }),
        axios.get(`${API}/api/events/${eventId}/gates`,      { headers: authHeader() }),
        axios.get(`${API}/api/events/${eventId}/faculties`,  { headers: authHeader() }),
      ]);
      setEvent(evRes.data.data);
      setSettingsForm(evRes.data.data);
      setGates(gRes.data.data);
      setFaculties(fRes.data.data);
    } catch {
      setError('Failed to load event configuration');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Settings save ──────────────────────────────────────────────────────────

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setError(''); setSuccess('');
    try {
      const payload: Record<string, unknown> = {
        name:                   settingsForm.name,
        // event_date is derived server-side from event_start_time — not sent
        event_start_time:       settingsForm.event_start_time ? new Date(settingsForm.event_start_time).toISOString() : undefined,
        event_end_time:         settingsForm.event_end_time   ? new Date(settingsForm.event_end_time).toISOString()   : undefined,
        parking_quota:          Number(settingsForm.parking_quota),
        guest_limit_per_grad:   Number(settingsForm.guest_limit_per_grad),
        vehicle_auto_threshold: Number(settingsForm.vehicle_auto_threshold),
      };
      if (settingsForm.gate_open_time) payload.gate_open_time = new Date(settingsForm.gate_open_time).toISOString();
      if (settingsForm.venue !== undefined) payload.venue = settingsForm.venue;

      await axios.patch(`${API}/api/events/${eventId}`, payload, { headers: authHeader() });
      setSuccess('Settings saved');
      await loadAll();
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error ?? 'Save failed' : 'Network error');
    } finally {
      setSavingSettings(false);
    }
  }

  // ── Gate CRUD ──────────────────────────────────────────────────────────────

  async function addGate(e: React.FormEvent) {
    e.preventDefault();
    setSavingGate(true);
    setError('');
    try {
      await axios.post(`${API}/api/events/${eventId}/gates`, {
        code: gateForm.code, type: gateForm.type,
        label: gateForm.label || undefined,
      }, { headers: authHeader() });
      setAddingGate(false);
      setGateForm({ code: '', type: 'PEDESTRIAN', label: '' });
      await loadAll();
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error ?? 'Add gate failed' : 'Network error');
    } finally {
      setSavingGate(false);
    }
  }

  async function deleteGate(gateId: string) {
    setError('');
    try {
      await axios.delete(`${API}/api/events/${eventId}/gates/${gateId}`, { headers: authHeader() });
      await loadAll();
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error ?? 'Delete failed' : 'Network error');
    }
  }

  // ── Faculty CRUD ───────────────────────────────────────────────────────────

  async function addFaculty(e: React.FormEvent) {
    e.preventDefault();
    setSavingFaculty(true);
    setError('');
    try {
      await axios.post(`${API}/api/events/${eventId}/faculties`, {
        name: facultyForm.name, code: facultyForm.code, gate_id: facultyForm.gate_id,
      }, { headers: authHeader() });
      setAddingFaculty(false);
      setFacultyForm({ name: '', code: '', gate_id: '' });
      await loadAll();
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error ?? 'Add faculty failed' : 'Network error');
    } finally {
      setSavingFaculty(false);
    }
  }

  async function deleteFaculty(facultyId: string) {
    setError('');
    try {
      await axios.delete(`${API}/api/events/${eventId}/faculties/${facultyId}`, { headers: authHeader() });
      await loadAll();
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error ?? 'Delete failed' : 'Network error');
    }
  }

  // ── Status transition ───────────────────────────────────────────────────────

  async function transition(newStatus: string) {
    setError(''); setSuccess('');
    try {
      await axios.patch(`${API}/api/events/${eventId}/status`, { status: newStatus }, { headers: authHeader() });
      setSuccess(`Status updated to "${STATUS_CONFIG[newStatus]?.label ?? newStatus}"`);
      await loadAll();
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error ?? 'Status change failed' : 'Network error');
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <CircularProgress sx={{ color: tokens.primary }} />
      </Box>
    );
  }

  const gateTypeChip = (type: string) => {
    const colors: Record<string, string> = {
      PEDESTRIAN: tokens.primary, VEHICLE: tokens.warning, GRADUATE: tokens.secondary,
    };
    return (
      <Chip
        label={type}
        size="small"
        sx={{ fontWeight: 600, fontSize: '0.7rem', color: colors[type], background: `${colors[type]}18`, border: 'none' }}
      />
    );
  };

  return (
    <Box>
      <PageHeader
        title={event?.name ?? 'Event Configuration'}
        subtitle="Configure gates, faculties, and event settings"
      />

      {/* Status bar */}
      {event && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
          mb: 3, p: 2, borderRadius: '14px',
          background: tokens.glass01, border: `1px solid ${tokens.border}`,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ color: tokens.onSurfaceDisabled, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              Status
            </Typography>
            <Chip
              label={STATUS_CONFIG[event.status]?.label ?? event.status}
              size="small"
              sx={{
                fontWeight: 700, fontSize: '0.75rem',
                color: STATUS_CONFIG[event.status]?.color,
                background: STATUS_CONFIG[event.status]?.bg,
                border: 'none',
              }}
            />
          </Box>

          {(NEXT_TRANSITION[event.status] ?? []).length > 0 && (
            <>
              <Box sx={{ width: 1, height: 20, borderLeft: `1px solid ${tokens.border}` }} />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {(NEXT_TRANSITION[event.status] ?? []).map(t => (
                  <Button
                    key={t.status}
                    size="small"
                    variant={t.color === 'success' ? 'contained' : 'outlined'}
                    color={t.color}
                    endIcon={<ArrowForwardOutlined fontSize="small" />}
                    onClick={() => transition(t.status)}
                    sx={{ borderRadius: '20px', px: 2 }}
                  >
                    {t.label}
                  </Button>
                ))}
              </Box>
            </>
          )}

          {event.status === 'ARCHIVED' && (
            <Typography variant="caption" sx={{ color: tokens.onSurfaceDisabled }}>
              This event is archived and read-only.
            </Typography>
          )}

          {/* Spacer pushes event ID to the right */}
          <Box sx={{ flex: 1 }} />

          <Tooltip title="Copy Event ID (for support use)">
            <Box
              onClick={() => { navigator.clipboard.writeText(event.id); }}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer',
                color: tokens.onSurfaceDisabled,
                '&:hover': { color: tokens.onSurfaceMedium },
              }}
            >
              <Typography variant="caption" sx={{ fontFamily: 'monospace', letterSpacing: '0.02em' }}>
                {event.id.slice(0, 8)}…
              </Typography>
              <ContentCopyOutlined sx={{ fontSize: 13 }} />
            </Box>
          </Tooltip>
        </Box>
      )}

      {error   && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <GlassCard variant="elevated" sx={{ p: 0, overflow: 'hidden' }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            px: 2,
            borderBottom: `1px solid ${tokens.border}`,
            '& .MuiTab-root': { fontWeight: 600, fontSize: '0.85rem', minHeight: 52 },
          }}
        >
          <Tab label="Settings" />
          <Tab label={`Gates (${gates.length})`} />
          <Tab label={`Faculties (${faculties.length})`} />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {/* ── Settings tab ── */}
          <TabPanel value={tab} index={0}>
            <Box component="form" onSubmit={saveSettings} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 600 }}>
              <TextField
                label="Event Name" value={settingsForm.name ?? ''} required fullWidth
                onChange={e => setSettingsForm(f => ({ ...f, name: e.target.value }))}
              />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Start Time" type="datetime-local" fullWidth required
                    InputLabelProps={{ shrink: true }}
                    value={settingsForm.event_start_time ? settingsForm.event_start_time.slice(0, 16) : ''}
                    onChange={e => setSettingsForm(f => ({ ...f, event_start_time: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="End Time" type="datetime-local" fullWidth required
                    InputLabelProps={{ shrink: true }}
                    value={settingsForm.event_end_time ? settingsForm.event_end_time.slice(0, 16) : ''}
                    onChange={e => setSettingsForm(f => ({ ...f, event_end_time: e.target.value }))}
                  />
                </Grid>
              </Grid>
              <TextField
                label="Gate Open Time (optional)" type="datetime-local" fullWidth
                helperText="QR scans before this time will be rejected"
                InputLabelProps={{ shrink: true }}
                value={settingsForm.gate_open_time ? settingsForm.gate_open_time.slice(0, 16) : ''}
                onChange={e => setSettingsForm(f => ({ ...f, gate_open_time: e.target.value || null }))}
              />
              <TextField
                label="Venue" value={settingsForm.venue ?? ''} fullWidth
                onChange={e => setSettingsForm(f => ({ ...f, venue: e.target.value }))}
              />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Parking Quota" type="number" fullWidth required
                    value={settingsForm.parking_quota ?? 200}
                    inputProps={{ min: 0 }}
                    onChange={e => setSettingsForm(f => ({ ...f, parking_quota: Number(e.target.value) }))}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Guest Limit / Grad" type="number" fullWidth required
                    value={settingsForm.guest_limit_per_grad ?? 2}
                    inputProps={{ min: 1 }}
                    onChange={e => setSettingsForm(f => ({ ...f, guest_limit_per_grad: Number(e.target.value) }))}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Auto-Approve Threshold" type="number" fullWidth required
                    value={settingsForm.vehicle_auto_threshold ?? 0.9}
                    helperText="0 – 1"
                    inputProps={{ min: 0, max: 1, step: 0.05 }}
                    onChange={e => setSettingsForm(f => ({ ...f, vehicle_auto_threshold: Number(e.target.value) }))}
                  />
                </Grid>
              </Grid>

              <Box>
                <Button
                  type="submit" variant="contained"
                  startIcon={savingSettings ? <CircularProgress size={16} color="inherit" /> : <SaveOutlined />}
                  disabled={savingSettings || ['LIVE','CLOSED','ARCHIVED'].includes(event?.status ?? '')}
                >
                  Save Settings
                </Button>
                {['LIVE','CLOSED','ARCHIVED'].includes(event?.status ?? '') && (
                  <Typography variant="caption" sx={{ ml: 2, color: tokens.onSurfaceDisabled }}>
                    Settings locked — event is {event?.status}
                  </Typography>
                )}
              </Box>
            </Box>
          </TabPanel>

          {/* ── Gates tab ── */}
          <TabPanel value={tab} index={1}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setAddingGate(true)}>
                Add Gate
              </Button>
            </Box>

            {gates.length === 0 ? (
              <Typography sx={{ color: tokens.onSurfaceDisabled, textAlign: 'center', py: 4 }}>
                No gates configured yet
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Label</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Faculties</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {gates.map(g => (
                    <TableRow key={g.id} hover>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight={700}>{g.code}</Typography>
                      </TableCell>
                      <TableCell>{gateTypeChip(g.type)}</TableCell>
                      <TableCell sx={{ color: tokens.onSurfaceMedium }}>{g.label ?? '—'}</TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ color: tokens.onSurfaceDisabled }}>
                          {faculties.filter(f => f.gate_id === g.id).length} assigned
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Delete gate">
                          <IconButton size="small" onClick={() => deleteGate(g.id)} sx={{ color: tokens.error }}>
                            <DeleteOutlineOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabPanel>

          {/* ── Faculties tab ── */}
          <TabPanel value={tab} index={2}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              <Button
                variant="contained" size="small" startIcon={<AddOutlined />}
                onClick={() => setAddingFaculty(true)}
                disabled={gates.length === 0}
              >
                Add Faculty
              </Button>
            </Box>
            {gates.length === 0 && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Create at least one gate before adding faculties
              </Alert>
            )}

            {faculties.length === 0 ? (
              <Typography sx={{ color: tokens.onSurfaceDisabled, textAlign: 'center', py: 4 }}>
                No faculties configured yet
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Faculty Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Assigned Gate</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {faculties.map(f => (
                    <TableRow key={f.id} hover>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight={700}>{f.code}</Typography>
                      </TableCell>
                      <TableCell>{f.name}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" fontWeight={600}>{f.gate_code}</Typography>
                          {gateTypeChip(f.gate_type)}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Delete faculty">
                          <IconButton size="small" onClick={() => deleteFaculty(f.id)} sx={{ color: tokens.error }}>
                            <DeleteOutlineOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabPanel>
        </Box>
      </GlassCard>

      {/* Add Gate Dialog */}
      <Dialog open={addingGate} onClose={() => setAddingGate(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}>
        <Box component="form" onSubmit={addGate}>
          <DialogTitle sx={{ fontWeight: 700 }}>Add Gate</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
            <TextField
              label="Gate Code" value={gateForm.code} required fullWidth
              helperText="Short identifier e.g. A1, EAST, VG1"
              onChange={e => setGateForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            />
            <FormControl fullWidth required>
              <InputLabel>Type</InputLabel>
              <Select value={gateForm.type} label="Type" onChange={e => setGateForm(f => ({ ...f, type: e.target.value as typeof GATE_TYPES[number] }))}>
                {GATE_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label="Label (optional)" value={gateForm.label} fullWidth
              helperText="Human-friendly name e.g. East Entrance"
              onChange={e => setGateForm(f => ({ ...f, label: e.target.value }))}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setAddingGate(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={savingGate}>
              {savingGate ? <CircularProgress size={18} color="inherit" /> : 'Add Gate'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* Add Faculty Dialog */}
      <Dialog open={addingFaculty} onClose={() => setAddingFaculty(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}>
        <Box component="form" onSubmit={addFaculty}>
          <DialogTitle sx={{ fontWeight: 700 }}>Add Faculty</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
            <TextField
              label="Faculty Code" value={facultyForm.code} required fullWidth
              helperText="Short code e.g. ENG, MED, LAW"
              onChange={e => setFacultyForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            />
            <TextField
              label="Faculty Name" value={facultyForm.name} required fullWidth
              onChange={e => setFacultyForm(f => ({ ...f, name: e.target.value }))}
            />
            <FormControl fullWidth required>
              <InputLabel>Assigned Gate</InputLabel>
              <Select
                value={facultyForm.gate_id} label="Assigned Gate"
                onChange={e => setFacultyForm(f => ({ ...f, gate_id: e.target.value }))}
              >
                {gates.filter(g => g.type !== 'VEHICLE').map(g => (
                  <MenuItem key={g.id} value={g.id}>
                    {g.code} — {g.label ?? g.type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setAddingFaculty(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={savingFaculty || !facultyForm.gate_id}>
              {savingFaculty ? <CircularProgress size={18} color="inherit" /> : 'Add Faculty'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
