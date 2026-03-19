import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, TextField, Button, Typography, CircularProgress,
  Alert, InputAdornment, IconButton,
} from '@mui/material';
import { QrCodeScannerOutlined, Visibility, VisibilityOff } from '@mui/icons-material';
import { motion } from 'framer-motion';
import { GlassCard, tokens } from '@congregation/ui';
import axios from 'axios';
import { db } from '../db/gate.db';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
// A stable, per-device identifier (persisted across sessions)
function getDeviceId(): string {
  let id = localStorage.getItem('gate_device_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('gate_device_id', id); }
  return id;
}

// Humanise server error messages for gate officers
function friendlyError(err: unknown): { msg: string; retryable: boolean } {
  if (err instanceof Error && !axios.isAxiosError(err)) {
    return { msg: err.message, retryable: false };
  }
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const serverMsg: string = err.response?.data?.error ?? '';
    if (status === 401) return { msg: 'Incorrect username or password.', retryable: false };
    if (status === 403) return { msg: 'This account is not assigned to a gate. Contact your administrator.', retryable: false };
    if (status === 409) return { msg: serverMsg || 'The event is not ready for scanning yet. Ask your administrator to advance the event status, then tap "Retry Sync".', retryable: true };
    if (status === 404) return { msg: 'Gate or event not found. Contact your administrator.', retryable: false };
    if (status && status >= 500) return { msg: 'Server error. Please try again in a moment.', retryable: true };
    if (serverMsg) return { msg: serverMsg, retryable: false };
  }
  return { msg: 'Network error — check your connection and try again.', retryable: true };
}

export default function Login() {
  const navigate = useNavigate();
  const [username,   setUsername]  = useState('');
  const [password,   setPassword]  = useState('');
  const [showPwd,    setShowPwd]   = useState(false);
  const [loading,    setLoading]   = useState(false);
  const [syncing,    setSyncing]   = useState(false);
  const [loginError, setLoginError]= useState('');
  const [syncError,  setSyncError] = useState('');
  const [syncRetryable, setSyncRetryable] = useState(false);
  // Saved token for sync retry (login succeeded, only sync failed)
  const [pendingToken, setPendingToken]   = useState('');
  const [pendingGateId, setPendingGateId] = useState('');

  async function runSync(token: string, gateId: string) {
    setSyncing(true);
    setSyncError('');
    try {
      const { data: sync } = await axios.get(`${API}/api/sync/dataset`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dataset = sync.data;

      await db.meta.put({
        key: 'active',
        eventId:         dataset.eventId,
        eventName:       dataset.eventName,
        gateCode:        dataset.gateCode,
        gateType:        dataset.gateType,
        gateId:          gateId,
        allowedFaculties: dataset.allowedFaculties,
        gateOpenTime:    dataset.gateOpenTime,
        eventEndTime:    dataset.eventEndTime,
        syncedAt:        dataset.generatedAt,
        signingPublicKey: dataset.signingPublicKey,
        encryptionKey:    dataset.encryptionKey,
      });

      await db.passes.clear();
      await db.passes.bulkPut(dataset.passes.map((p: any) => ({
        passId:       p.passId,
        qrCodeHash:   p.qrCodeHash,
        passType:     p.passType,
        status:       p.status,
        gateCode:     p.gateCode,
        gateType:     p.gateType,
        facultyCode:  p.facultyCode,
        guestName:    p.guestName,
        graduateName: p.graduateName,
        isCheckedIn:  p.isCheckedIn,
        checkedInAt:  p.checkedInAt,
        expiresAt:    p.expiresAt,
      })));

      navigate('/scan');
    } catch (err: unknown) {
      const { msg, retryable } = friendlyError(err);
      setSyncError(msg);
      setSyncRetryable(retryable);
      // On auth errors, clear everything so officer re-enters credentials
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        localStorage.removeItem('gate_token');
        setPendingToken('');
        setPendingGateId('');
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    setSyncError('');
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/auth/admin/login`, { username, password });
      if (data.data.role !== 'GATE_OFFICER') {
        setLoginError('This app is for gate officers only. Use the Admin panel instead.');
        return;
      }
      localStorage.setItem('gate_token',   data.data.token);
      localStorage.setItem('gate_officer', JSON.stringify(data.data));
      setPendingToken(data.data.token);
      setPendingGateId(data.data.gateId ?? '');
      setLoading(false);
      await runSync(data.data.token, data.data.gateId ?? '');
    } catch (err: unknown) {
      const { msg } = friendlyError(err);
      setLoginError(msg);
      localStorage.removeItem('gate_token');
    } finally {
      setLoading(false);
    }
  }

  const deviceId = getDeviceId();

  return (
    <Box sx={{
      minHeight: '100dvh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0d0221 0%, #1a0533 50%, #0d1b4b 100%)',
      p: 3,
    }}>
      {/* App icon */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      >
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Box sx={{
            width: 88, height: 88, borderRadius: '26px',
            background: `linear-gradient(135deg, ${tokens.primary}, ${tokens.secondary})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            mx: 'auto', mb: 3,
            boxShadow: `0 0 60px ${tokens.primary}60, 0 20px 40px rgba(0,0,0,0.4)`,
          }}>
            <QrCodeScannerOutlined sx={{ fontSize: 44, color: '#fff' }} />
          </Box>
          <Typography variant="h4" fontWeight={800} color="white">Gate Scanner</Typography>
          <Typography variant="body2" sx={{ color: tokens.onSurfaceMedium, mt: 0.5 }}>
            Congregation Entry Validation
          </Typography>
        </Box>
      </motion.div>

      {/* Login card */}
      <GlassCard variant="elevated" sx={{ width: '100%', maxWidth: 380, p: 4 }} delay={0.1}>
        {syncing ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress sx={{ color: tokens.primary, mb: 2 }} size={48} />
            <Typography variant="subtitle1" fontWeight={600} color="white">
              Downloading pass dataset…
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.onSurfaceMedium, mt: 0.5 }}>
              Loading all passes into offline storage
            </Typography>
          </Box>
        ) : syncError ? (
          /* Sync failed — show message with optional retry (no need to re-enter credentials) */
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Alert
              severity={syncRetryable ? 'warning' : 'error'}
              sx={{ mb: 2.5, borderRadius: 2, textAlign: 'left' }}
            >
              {syncError}
            </Alert>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {syncRetryable && pendingToken && (
                <Button
                  variant="contained" fullWidth size="large"
                  onClick={() => runSync(pendingToken, pendingGateId)}
                  sx={{ py: 1.8, fontSize: '1.05rem' }}
                >
                  Retry Sync
                </Button>
              )}
              <Button
                variant="outlined" fullWidth
                onClick={() => { setSyncError(''); setPendingToken(''); setPendingGateId(''); localStorage.removeItem('gate_token'); }}
                sx={{ color: tokens.onSurfaceMedium, borderColor: tokens.border }}
              >
                Sign in with different account
              </Button>
            </Box>
          </Box>
        ) : (
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {loginError && (
              <Alert severity="error" sx={{ borderRadius: 2 }} onClose={() => setLoginError('')}>
                {loginError}
              </Alert>
            )}
            <TextField
              label="Username" value={username}
              onChange={e => setUsername(e.target.value)}
              required fullWidth autoComplete="username"
            />
            <TextField
              label="Password" type={showPwd ? 'text' : 'password'}
              value={password} onChange={e => setPassword(e.target.value)}
              required fullWidth autoComplete="current-password"
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
            <Button
              type="submit" variant="contained" fullWidth size="large"
              disabled={loading} sx={{ py: 1.8, fontSize: '1.05rem', mt: 0.5 }}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : 'Sign In & Sync'}
            </Button>
          </Box>
        )}
      </GlassCard>

      <Typography variant="caption" sx={{ color: tokens.onSurfaceDisabled, mt: 3, textAlign: 'center' }}>
        Device ID: {deviceId.slice(0, 8)}…
      </Typography>
    </Box>
  );
}
