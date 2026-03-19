import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Chip, LinearProgress, Divider,
  Table, TableBody, TableCell, TableHead, TableRow,
  Paper, Alert,
} from '@mui/material';
import {
  PeopleOutlined, DirectionsCarOutlined, SpeedOutlined,
  DevicesOutlined, WarningAmberOutlined, CheckCircleOutlined,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { GlassCard, StatCard, PageHeader, tokens } from '@congregation/ui';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
function authHeader() { return { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }; }

interface GateCheckin { gate_code: string; gate_type: string; count: string }
interface DeviceStatus { device_id: string; gate_code: string | null; last_scan: string; scan_count: string }
interface Rejection    { result: string; gate_code: string; scanned_at: string; raw_code_prefix: string | null }
interface ScanRate     { gate_code: string; scans_per_min: string }

interface DashboardData {
  checkinsPerGate: GateCheckin[];
  admission: { admitted: string; total_issued: string };
  vehicleOccupancy: { approved: string; quota: string };
  deviceStatus: DeviceStatus[];
  recentRejections: Rejection[];
  scanRate: ScanRate[];
}

// ── Live checkin feed item ────────────────────────────────────────────────────

interface FeedItem {
  id: string;
  guestName: string | null;
  passType: string;
  gateCode: string;
  facultyCode: string;
  checkedInAt: string;
}

function resultColor(result: string) {
  if (result === 'VALID') return tokens.success;
  if (result === 'WRONG_GATE') return tokens.warning;
  return tokens.error;
}

export default function Dashboard() {
  const { eventId } = useParams();
  const socketRef   = useRef<Socket | null>(null);

  const [data,    setData]    = useState<DashboardData | null>(null);
  const [feed,    setFeed]    = useState<FeedItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [error,   setError]   = useState('');

  // ── Fetch static snapshot ─────────────────────────────────────────────────
  async function fetchDashboard() {
    try {
      const { data: res } = await axios.get(`${API}/api/admin/events/${eventId}/dashboard`, { headers: authHeader() });
      setData(res.data);
    } catch {
      setError('Failed to load dashboard data');
    }
  }

  // ── Socket.io live updates ────────────────────────────────────────────────
  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30_000);

    const token = localStorage.getItem('admin_token');
    const socket = io(API, { auth: { token } });
    socketRef.current = socket;

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('checkin', (event: FeedItem) => {
      setFeed(f => [{ ...event, id: crypto.randomUUID() }, ...f].slice(0, 50));
      // Increment the relevant gate counter without a full refetch
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          admission: {
            ...prev.admission,
            admitted: String(parseInt(prev.admission.admitted) + 1),
          },
          checkinsPerGate: prev.checkinsPerGate.map(g =>
            g.gate_code === event.gateCode
              ? { ...g, count: String(parseInt(g.count) + 1) }
              : g
          ),
        };
      });
    });

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, [eventId]);

  if (!data) return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Box sx={{ textAlign: 'center' }}>
        <SpeedOutlined sx={{ fontSize: 48, color: tokens.onSurfaceMedium, mb: 1 }} />
        <Typography sx={{ color: tokens.onSurfaceMedium }}>Loading dashboard…</Typography>
      </Box>
    </Box>
  );

  const admittedPct = data.admission.total_issued !== '0'
    ? Math.round(parseInt(data.admission.admitted) / parseInt(data.admission.total_issued) * 100)
    : 0;
  const parkingPct  = data.vehicleOccupancy.quota !== '0'
    ? Math.round(parseInt(data.vehicleOccupancy.approved) / parseInt(data.vehicleOccupancy.quota) * 100)
    : 0;

  return (
    <Box>
      <PageHeader
        title="Live Dashboard"
        subtitle="Real-time event monitoring"
        action={
          <Chip
            size="small"
            icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', background: connected ? tokens.success : tokens.error, ml: '8px !important' }} />}
            label={connected ? 'Live' : 'Reconnecting'}
            sx={{ fontWeight: 600, background: connected ? tokens.successBg : tokens.errorBg, borderColor: 'transparent' }}
          />
        }
      />

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Top stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        <StatCard label="Admitted"    value={data.admission.admitted}             icon={<PeopleOutlined />}        color={tokens.success}   delay={0.05} sub={`of ${data.admission.total_issued} passes`} />
        <StatCard label="Vehicles"    value={data.vehicleOccupancy.approved}       icon={<DirectionsCarOutlined />} color={tokens.tertiary}  delay={0.10} sub={`/ ${data.vehicleOccupancy.quota} quota`} />
        <StatCard label="Gates Live"  value={data.checkinsPerGate.length}          icon={<SpeedOutlined />}         color={tokens.primary}   delay={0.15} />
        <StatCard label="Devices"     value={data.deviceStatus.length}             icon={<DevicesOutlined />}       color={tokens.secondary} delay={0.20} />
      </Box>

      {/* Admission + Parking progress */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 3 }}>
        <GlassCard sx={{ p: 3 }} delay={0.25}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle2" fontWeight={600}>Guest Admission</Typography>
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: tokens.success }}>{admittedPct}%</Typography>
          </Box>
          <LinearProgress variant="determinate" value={admittedPct} color="success" sx={{ mb: 1 }} />
          <Typography variant="caption" sx={{ color: tokens.onSurfaceMedium }}>
            {data.admission.admitted} admitted · {parseInt(data.admission.total_issued) - parseInt(data.admission.admitted)} pending
          </Typography>
        </GlassCard>

        <GlassCard sx={{ p: 3 }} delay={0.3}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle2" fontWeight={600}>Parking Occupancy</Typography>
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: parkingPct >= 90 ? tokens.error : tokens.tertiary }}>
              {parkingPct}%
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={parkingPct} color={parkingPct >= 90 ? 'error' : 'info'} sx={{ mb: 1 }} />
          <Typography variant="caption" sx={{ color: tokens.onSurfaceMedium }}>
            {data.vehicleOccupancy.approved} used · {parseInt(data.vehicleOccupancy.quota) - parseInt(data.vehicleOccupancy.approved)} remaining
          </Typography>
        </GlassCard>
      </Box>

      {/* Gate breakdown + Live feed */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, mb: 3 }}>
        {/* Gate check-ins */}
        <GlassCard sx={{ p: 3 }} delay={0.35}>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>Check-ins by Gate</Typography>
          {data.checkinsPerGate.map((g, i) => {
            const rate = data.scanRate.find(r => r.gate_code === g.gate_code);
            return (
              <Box key={g.gate_code}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{
                      width: 32, height: 32, borderRadius: '8px',
                      background: tokens.primaryContainer, color: tokens.primaryLight,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 800,
                    }}>
                      {g.gate_code}
                    </Box>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{parseInt(g.count)} admitted</Typography>
                      <Typography variant="caption" sx={{ color: tokens.onSurfaceMedium }}>
                        {rate?.scans_per_min ?? '0'} scans/min
                      </Typography>
                    </Box>
                  </Box>
                  <Chip label={g.gate_type} size="small" sx={{ fontSize: '0.7rem', background: tokens.glass02 }} />
                </Box>
                {i < data.checkinsPerGate.length - 1 && <Divider />}
              </Box>
            );
          })}
        </GlassCard>

        {/* Live checkin feed */}
        <GlassCard sx={{ p: 3 }} delay={0.4}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={700}>Live Admissions</Typography>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: connected ? tokens.success : tokens.onSurfaceMedium, animation: connected ? 'pulse 2s infinite' : 'none', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
          </Box>
          <Box sx={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <AnimatePresence>
              {feed.length === 0 ? (
                <Typography variant="body2" sx={{ color: tokens.onSurfaceMedium, textAlign: 'center', py: 4 }}>
                  Waiting for admissions…
                </Typography>
              ) : feed.map(item => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: 20, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: 'auto' }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Box sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    p: 1.2, borderRadius: '10px', background: tokens.glass01,
                  }}>
                    <CheckCircleOutlined sx={{ fontSize: 18, color: tokens.success, flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" fontWeight={600} noWrap>
                        {item.guestName ?? 'Anonymous Guest'} · Gate {item.gateCode}
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block', color: tokens.onSurfaceMedium }}>
                        {new Date(item.checkedInAt).toLocaleTimeString()}
                      </Typography>
                    </Box>
                    <Chip label={item.facultyCode} size="small" sx={{ fontSize: '0.65rem' }} />
                  </Box>
                </motion.div>
              ))}
            </AnimatePresence>
          </Box>
        </GlassCard>
      </Box>

      {/* Recent rejections */}
      {data.recentRejections.length > 0 && (
        <GlassCard sx={{ p: 3 }} delay={0.45}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <WarningAmberOutlined sx={{ color: tokens.warning }} />
            <Typography variant="subtitle1" fontWeight={700}>Recent Rejections</Typography>
          </Box>
          <Paper elevation={0} sx={{ overflow: 'hidden', background: 'transparent' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Reason</TableCell>
                  <TableCell>Gate</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell>Code Prefix</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.recentRejections.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Chip
                        label={r.result.replace(/_/g, ' ')}
                        size="small"
                        sx={{ background: `${resultColor(r.result)}15`, color: resultColor(r.result), fontWeight: 600, fontSize: '0.7rem' }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{r.gate_code ?? '—'}</TableCell>
                    <TableCell sx={{ color: tokens.onSurfaceMedium, fontSize: '0.8rem' }}>
                      {new Date(r.scanned_at).toLocaleTimeString()}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', color: tokens.onSurfaceMedium }}>
                      {r.raw_code_prefix ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </GlassCard>
      )}
    </Box>
  );
}
