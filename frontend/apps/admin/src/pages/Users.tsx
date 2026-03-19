import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Button, Table, TableHead, TableRow, TableCell,
  TableBody, Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, FormControl, InputLabel, Select, MenuItem,
  CircularProgress, Alert, Tooltip, InputAdornment,
} from '@mui/material';
import {
  AddOutlined, Visibility, VisibilityOff, PersonOutlined, LockResetOutlined,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, PageHeader, tokens } from '@congregation/ui';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
function authHeader() { return { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }; }

interface AdminUser {
  id: string;
  username: string;
  role: 'SUPER_ADMIN' | 'GATE_OFFICER';
  assigned_gate_id: string | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}
interface Gate { id: string; code: string; type: string; label: string | null; }

const ROLE_CONFIG = {
  SUPER_ADMIN:  { label: 'Super Admin',  color: tokens.secondary, bg: `${tokens.secondary}18` },
  GATE_OFFICER: { label: 'Gate Officer', color: tokens.primary,   bg: `${tokens.primary}18`   },
};

const BLANK = { username: '', password: '', role: 'GATE_OFFICER' as 'SUPER_ADMIN' | 'GATE_OFFICER', assigned_gate_id: '' };
const BLANK_RESET = { userId: '', username: '', newPassword: '' };

export default function Users() {
  const { eventId } = useParams<{ eventId: string }>();
  const [users,    setUsers]    = useState<AdminUser[]>([]);
  const [gates,    setGates]    = useState<Gate[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [adding,       setAdding]      = useState(false);
  const [saving,       setSaving]      = useState(false);
  const [showPwd,      setShowPwd]     = useState(false);
  const [form,         setForm]        = useState(BLANK);
  const [formErr,      setFormErr]     = useState('');

  const [resetTarget,  setResetTarget] = useState(BLANK_RESET);
  const [resetSaving,  setResetSaving] = useState(false);
  const [resetShowPwd, setResetShowPwd]= useState(false);
  const [resetErr,     setResetErr]    = useState('');
  const [resetSuccess, setResetSuccess]= useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, gRes] = await Promise.all([
        axios.get(`${API}/api/admin/users`,                    { headers: authHeader() }),
        axios.get(`${API}/api/events/${eventId}/gates`,         { headers: authHeader() }),
      ]);
      setUsers(uRes.data.data);
      setGates(gRes.data.data);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormErr('');
    if (form.role === 'GATE_OFFICER' && !form.assigned_gate_id) {
      setFormErr('Please assign a gate for gate officers');
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/api/admin/users`, {
        username:         form.username,
        password:         form.password,
        role:             form.role,
        assigned_gate_id: form.role === 'GATE_OFFICER' ? form.assigned_gate_id : undefined,
      }, { headers: authHeader() });
      setAdding(false);
      setForm(BLANK);
      await load();
    } catch (err) {
      setFormErr(axios.isAxiosError(err) ? err.response?.data?.error ?? 'Create failed' : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetErr('');
    setResetSuccess('');
    if (resetTarget.newPassword.length < 8) { setResetErr('Password must be at least 8 characters'); return; }
    setResetSaving(true);
    try {
      await axios.patch(`${API}/api/admin/users/${resetTarget.userId}/password`, {
        new_password: resetTarget.newPassword,
      }, { headers: authHeader() });
      setResetSuccess(`Password for "${resetTarget.username}" reset successfully.`);
      setResetTarget(BLANK_RESET);
    } catch (err) {
      setResetErr(axios.isAxiosError(err) ? err.response?.data?.error ?? 'Reset failed' : 'Network error');
    } finally {
      setResetSaving(false);
    }
  }

  const gateForId = (id: string | null) => gates.find(g => g.id === id);

  return (
    <Box>
      <PageHeader
        title="Users"
        subtitle="Manage admin accounts and gate officer credentials"
        action={
          <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setAdding(true)}>
            Add User
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <GlassCard variant="elevated" sx={{ overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress sx={{ color: tokens.primary }} />
          </Box>
        ) : users.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <PersonOutlined sx={{ fontSize: 48, color: tokens.onSurfaceDisabled, mb: 1 }} />
            <Typography color="text.secondary">No users found</Typography>
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Username</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Assigned Gate</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Last Login</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <AnimatePresence>
                {users.map((u, i) => {
                  const rc   = ROLE_CONFIG[u.role];
                  const gate = gateForId(u.assigned_gate_id);
                  return (
                    <motion.tr
                      key={u.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04, ease: [0.23, 1, 0.32, 1] }}
                      style={{ display: 'table-row' }}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{
                            width: 32, height: 32, borderRadius: '8px',
                            background: `linear-gradient(135deg, ${tokens.primary}40, ${tokens.secondary}40)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <PersonOutlined sx={{ fontSize: 16, color: tokens.primary }} />
                          </Box>
                          <Typography variant="subtitle2" fontWeight={600}>{u.username}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={rc.label}
                          size="small"
                          sx={{ fontWeight: 700, fontSize: '0.7rem', color: rc.color, background: rc.bg, border: 'none' }}
                        />
                      </TableCell>
                      <TableCell>
                        {gate ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" fontWeight={600}>{gate.code}</Typography>
                            <Typography variant="caption" sx={{ color: tokens.onSurfaceDisabled }}>
                              {gate.label ?? gate.type}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: tokens.onSurfaceDisabled }}>—</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={u.is_active ? 'Active' : 'Inactive'}
                          size="small"
                          sx={{
                            fontSize: '0.68rem', fontWeight: 600,
                            color:      u.is_active ? tokens.success : tokens.onSurfaceDisabled,
                            background: u.is_active ? tokens.successBg : tokens.glass01,
                            border: 'none',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: tokens.onSurfaceMedium }}>
                        {u.last_login_at
                          ? new Date(u.last_login_at).toLocaleString()
                          : <Typography variant="caption" sx={{ color: tokens.onSurfaceDisabled }}>Never</Typography>
                        }
                      </TableCell>
                      <TableCell sx={{ color: tokens.onSurfaceMedium }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Reset password">
                          <IconButton
                            size="small"
                            onClick={() => { setResetTarget({ userId: u.id, username: u.username, newPassword: '' }); setResetErr(''); setResetSuccess(''); setResetShowPwd(false); }}
                          >
                            <LockResetOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </TableBody>
          </Table>
        )}
      </GlassCard>

      {/* Reset Password Dialog */}
      <Dialog
        open={!!resetTarget.userId}
        onClose={() => { setResetTarget(BLANK_RESET); setResetErr(''); setResetSuccess(''); }}
        maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <Box component="form" onSubmit={handleResetPassword}>
          <DialogTitle sx={{ fontWeight: 700 }}>
            Reset Password
            {resetTarget.username && (
              <Typography variant="body2" sx={{ color: tokens.onSurfaceMedium, fontWeight: 400 }}>
                {resetTarget.username}
              </Typography>
            )}
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
            {resetErr     && <Alert severity="error"   onClose={() => setResetErr('')}>{resetErr}</Alert>}
            {resetSuccess && <Alert severity="success" onClose={() => setResetSuccess('')}>{resetSuccess}</Alert>}
            {!resetSuccess && (
              <TextField
                label="New Password"
                type={resetShowPwd ? 'text' : 'password'}
                value={resetTarget.newPassword}
                required fullWidth autoComplete="new-password"
                inputProps={{ minLength: 8 }}
                helperText="Minimum 8 characters"
                onChange={e => setResetTarget(r => ({ ...r, newPassword: e.target.value }))}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setResetShowPwd(v => !v)} edge="end">
                        {resetShowPwd ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => { setResetTarget(BLANK_RESET); setResetErr(''); setResetSuccess(''); }}>
              {resetSuccess ? 'Close' : 'Cancel'}
            </Button>
            {!resetSuccess && (
              <Button type="submit" variant="contained" disabled={resetSaving}>
                {resetSaving ? <CircularProgress size={18} color="inherit" /> : 'Reset Password'}
              </Button>
            )}
          </DialogActions>
        </Box>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog
        open={adding}
        onClose={() => { setAdding(false); setForm(BLANK); setFormErr(''); setShowPwd(false); }}
        maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <Box component="form" onSubmit={handleCreate}>
          <DialogTitle sx={{ fontWeight: 700 }}>Add User</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
            {formErr && <Alert severity="error" onClose={() => setFormErr('')}>{formErr}</Alert>}

            <TextField
              label="Username" value={form.username} required fullWidth autoComplete="off"
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            />
            <TextField
              label="Password" type={showPwd ? 'text' : 'password'}
              value={form.password} required fullWidth autoComplete="new-password"
              inputProps={{ minLength: 8 }}
              helperText="Minimum 8 characters"
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowPwd(v => !v)} edge="end">
                      {showPwd ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <FormControl fullWidth required>
              <InputLabel>Role</InputLabel>
              <Select
                value={form.role} label="Role"
                onChange={e => setForm(f => ({ ...f, role: e.target.value as typeof BLANK.role, assigned_gate_id: '' }))}
              >
                <MenuItem value="SUPER_ADMIN">Super Admin</MenuItem>
                <MenuItem value="GATE_OFFICER">Gate Officer</MenuItem>
              </Select>
            </FormControl>

            {form.role === 'GATE_OFFICER' && (
              <FormControl fullWidth required>
                <InputLabel>Assigned Gate</InputLabel>
                <Select
                  value={form.assigned_gate_id} label="Assigned Gate"
                  onChange={e => setForm(f => ({ ...f, assigned_gate_id: e.target.value }))}
                >
                  {gates.length === 0 ? (
                    <MenuItem disabled>No gates — configure event first</MenuItem>
                  ) : (
                    gates.map(g => (
                      <MenuItem key={g.id} value={g.id}>
                        {g.code} — {g.label ?? g.type}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => { setAdding(false); setForm(BLANK); setFormErr(''); }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? <CircularProgress size={18} color="inherit" /> : 'Create User'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
