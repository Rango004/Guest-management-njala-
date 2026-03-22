import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Tooltip,
  IconButton, CircularProgress, Divider, Alert,
} from '@mui/material';
import {
  QrCode2Outlined, DirectionsCarOutlined, CheckCircleOutlined,
  DownloadOutlined, EmailOutlined, CancelOutlined, AddOutlined,
  LogoutOutlined, LightModeOutlined, DarkModeOutlined, SchoolOutlined,
  HourglassEmptyOutlined,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, StatCard, PageHeader, tokens, useColorMode } from '@congregation/ui';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface Pass {
  id: string;
  pass_type: 'GUEST' | 'VEHICLE';
  status: 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED' | 'REVOKED';
  guest_name: string | null;
  gate_code: string;
  is_checked_in: boolean;
  checked_in_at: string | null;
  qrDataUrl?: string;
}

interface Entitlements { guestRemaining: number; vehicleRemaining: number }

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('portal_token')}` };
}

// ── Pass Card ─────────────────────────────────────────────────────────────────

function PassCard({ pass, onRevoke }: { pass: Pass; onRevoke: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isVehicle = pass.pass_type === 'VEHICLE';

  const statusConfig = {
    APPROVED:       { label: 'Active',          color: tokens.success,  bg: tokens.successBg },
    PENDING_REVIEW: { label: 'Pending Review',  color: tokens.warning,  bg: tokens.warningBg },
    REJECTED:       { label: 'Rejected',        color: tokens.error,    bg: tokens.errorBg   },
    REVOKED:        { label: 'Cancelled',       color: tokens.onSurfaceMedium, bg: tokens.glass01 },
  };
  const s = statusConfig[pass.status];

  const glow = pass.is_checked_in ? 'success' : (pass.status === 'APPROVED' ? false : false);

  return (
    <GlassCard
      glow={glow as any}
      sx={{
        p: 2.5,
        opacity: pass.status === 'REVOKED' ? 0.55 : 1,
        transition: 'opacity 0.3s ease',
      }}
    >
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        {/* Pass type icon */}
        <Box sx={{
          width: 52, height: 52, borderRadius: '14px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isVehicle ? tokens.tertiaryContainer : tokens.primaryContainer,
          color: isVehicle ? tokens.tertiary : tokens.primary,
          border: `1px solid ${isVehicle ? tokens.tertiary : tokens.primary}30`,
        }}>
          {isVehicle
            ? <DirectionsCarOutlined />
            : <QrCode2Outlined />}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" fontWeight={700} noWrap>
              {pass.pass_type === 'GUEST' ? (pass.guest_name ?? 'Anonymous Guest') : 'Vehicle Pass'}
            </Typography>
            <Chip
              label={s.label}
              size="small"
              sx={{
                background: s.bg, color: s.color,
                borderColor: `${s.color}33`, border: '1px solid',
                fontWeight: 600, fontSize: '0.72rem',
              }}
            />
            {pass.is_checked_in && (
              <Chip
                icon={<CheckCircleOutlined sx={{ fontSize: '14px !important' }} />}
                label="Checked In"
                size="small"
                sx={{ background: tokens.successBg, color: tokens.success, fontSize: '0.72rem' }}
              />
            )}
          </Box>

          <Typography variant="caption" sx={{ color: tokens.onSurfaceMedium }}>
            Gate {pass.gate_code}
          </Typography>
        </Box>

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {pass.qrDataUrl && pass.status === 'APPROVED' && (
            <Tooltip title="View QR code">
              <IconButton size="small" onClick={() => setExpanded(v => !v)}>
                <QrCode2Outlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {pass.qrDataUrl && (
            <Tooltip title="Download">
              <IconButton
                size="small"
                component="a"
                download={`pass-gate-${pass.gate_code}.png`}
                href={pass.qrDataUrl}
              >
                <DownloadOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {pass.status === 'APPROVED' && !pass.is_checked_in && (
            <Tooltip title="Cancel pass">
              <IconButton size="small" onClick={onRevoke} sx={{ color: tokens.error }}>
                <CancelOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* QR expandable */}
      <AnimatePresence>
        {expanded && pass.qrDataUrl && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          >
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <Box sx={{
                p: 2, borderRadius: '16px',
                background: '#fff',
                display: 'inline-block',
                boxShadow: `0 8px 32px rgba(0,0,0,0.25)`,
              }}>
                <img src={pass.qrDataUrl} alt="QR Code" width={200} height={200} />
              </Box>
              <Typography variant="caption" sx={{ color: tokens.onSurfaceMedium, textAlign: 'center' }}>
                Present this QR code at <strong>Gate {pass.gate_code}</strong> on event day.
                <br />Each pass is single-use and non-transferable.
              </Typography>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const { mode, toggle } = useColorMode();
  const grad = JSON.parse(localStorage.getItem('portal_graduate') ?? '{}');

  const [passes,       setPasses]       = useState<Pass[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlements>({ guestRemaining: 2, vehicleRemaining: 1 });
  const [loading,      setLoading]      = useState(true);
  const [guestDialog,  setGuestDialog]  = useState(false);
  const [guestName,    setGuestName]    = useState('');
  const [requesting,   setRequesting]   = useState(false);
  const [error,        setError]        = useState('');

  async function fetchPasses() {
    try {
      const { data } = await axios.get(`${API}/api/portal/passes`, { headers: authHeader() });
      // Backend now returns qrDataUrl (regenerated from stored encrypted payload)
      setPasses(data.data.passes.map((p: Pass & { qrDataUrl?: string }) => ({
        ...p,
        qrDataUrl: p.qrDataUrl ?? undefined,
      })));
      setEntitlements(data.data.entitlements);
    } catch {
      /* handled below */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPasses(); }, []);

  async function requestGuestPass() {
    setRequesting(true);
    setError('');
    try {
      const { data } = await axios.post(
        `${API}/api/portal/passes/guest`,
        { guest_name: guestName || undefined },
        { headers: authHeader() }
      );
      const newPass: Pass = { ...data.data.pass, gate_code: data.data.gateCode, qrDataUrl: data.data.qrDataUrl };
      setPasses(p => [newPass, ...p]);
      setEntitlements(e => ({ ...e, guestRemaining: e.guestRemaining - 1 }));
      setGuestDialog(false);
      setGuestName('');
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error ?? 'Failed' : 'Request failed');
    } finally {
      setRequesting(false);
    }
  }

  async function requestVehiclePass() {
    setRequesting(true);
    try {
      const { data } = await axios.post(`${API}/api/portal/passes/vehicle`, {}, { headers: authHeader() });
      const newPass: Pass = { ...data.data.pass, gate_code: data.data.gateCode, qrDataUrl: data.data.qrDataUrl };
      setPasses(p => [newPass, ...p]);
      setEntitlements(e => ({ ...e, vehicleRemaining: 0 }));
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error ?? 'Failed' : 'Request failed');
    } finally {
      setRequesting(false);
    }
  }

  async function cancelPass(passId: string) {
    await axios.delete(`${API}/api/portal/passes/${passId}`, { headers: authHeader() });
    setPasses(p => p.map(x => x.id === passId ? { ...x, status: 'REVOKED' } : x));
  }

  function logout() {
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_graduate');
    navigate('/');
  }

  const guestPasses   = passes.filter(p => p.pass_type === 'GUEST');
  const vehiclePasses = passes.filter(p => p.pass_type === 'VEHICLE');

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, py: 4 }}>
      {/* Top bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '12px',
            background: `linear-gradient(135deg, ${tokens.primary}, ${tokens.secondary})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <SchoolOutlined sx={{ fontSize: 20, color: '#fff' }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
              {grad.graduateName ?? 'Graduate'}
            </Typography>
            <Typography variant="caption" sx={{ color: tokens.onSurfaceMedium }}>
              {grad.studentId}  •  Gate {grad.gateCode}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton size="small" onClick={toggle} sx={{
            background: tokens.glass02, border: `1px solid ${tokens.border}`,
          }}>
            {mode === 'dark' ? <LightModeOutlined fontSize="small" /> : <DarkModeOutlined fontSize="small" />}
          </IconButton>
          <Tooltip title="Sign out">
            <IconButton size="small" onClick={logout} sx={{
              background: tokens.glass02, border: `1px solid ${tokens.border}`,
            }}>
              <LogoutOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Entitlement stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 4 }}>
        <StatCard
          label="Guest Passes Left"
          value={entitlements.guestRemaining}
          icon={<QrCode2Outlined />}
          color={tokens.primary}
          delay={0.05}
        />
        <StatCard
          label="Vehicle Pass"
          value={entitlements.vehicleRemaining > 0 ? 'Available' : vehiclePasses[0]?.status === 'PENDING_REVIEW' ? 'Pending' : 'Issued'}
          icon={<DirectionsCarOutlined />}
          color={tokens.tertiary}
          delay={0.1}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Action buttons */}
      <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={<AddOutlined />}
          onClick={() => setGuestDialog(true)}
          disabled={entitlements.guestRemaining === 0}
        >
          Add Guest Pass
        </Button>
        <Button
          variant="outlined"
          startIcon={<DirectionsCarOutlined />}
          onClick={requestVehiclePass}
          disabled={entitlements.vehicleRemaining === 0 || requesting}
        >
          Request Vehicle Pass
        </Button>
      </Box>

      {/* Guest Passes */}
      <PageHeader
        title="Guest Passes"
        subtitle={`${guestPasses.length} issued`}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress sx={{ color: tokens.primary }} />
        </Box>
      ) : guestPasses.length === 0 ? (
        <GlassCard sx={{ p: 4, textAlign: 'center' }}>
          <QrCode2Outlined sx={{ fontSize: 48, color: tokens.onSurfaceMedium, mb: 1 }} />
          <Typography sx={{ color: tokens.onSurfaceMedium }}>
            No guest passes yet. Add your first guest above.
          </Typography>
        </GlassCard>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
          <AnimatePresence>
            {guestPasses.map((pass, i) => (
              <motion.div
                key={pass.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: i * 0.06, ease: [0.23, 1, 0.32, 1] }}
              >
                <PassCard pass={pass} onRevoke={() => cancelPass(pass.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </Box>
      )}

      {/* Vehicle Passes */}
      {vehiclePasses.length > 0 && (
        <>
          <PageHeader title="Vehicle Pass" subtitle="Parking access" />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {vehiclePasses.map(pass => (
              <PassCard key={pass.id} pass={pass} onRevoke={() => cancelPass(pass.id)} />
            ))}
          </Box>
        </>
      )}

      {/* Add Guest Dialog */}
      <Dialog open={guestDialog} onClose={() => setGuestDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add Guest Pass</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: tokens.onSurfaceMedium, mb: 2 }}>
            Optionally enter your guest's name. Anonymous passes are also valid.
          </Typography>
          <TextField
            label="Guest Name (optional)"
            value={guestName}
            onChange={e => setGuestName(e.target.value)}
            fullWidth
            autoFocus
            placeholder="e.g. Mrs. Amina Johnson"
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button onClick={() => setGuestDialog(false)} disabled={requesting}>Cancel</Button>
          <Button variant="contained" onClick={requestGuestPass} disabled={requesting}>
            {requesting ? <CircularProgress size={18} color="inherit" /> : 'Generate Pass'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
