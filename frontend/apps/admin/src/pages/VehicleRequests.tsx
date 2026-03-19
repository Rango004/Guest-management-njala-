import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Button, Chip, Alert, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import {
  DirectionsCarOutlined, CheckOutlined, CloseOutlined,
  HourglassEmptyOutlined,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { GlassCard, PageHeader, tokens } from '@congregation/ui';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
function authHeader() { return { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }; }

interface VehicleRequest {
  id: string; graduate_name: string; student_id: string;
  faculty_code: string; requested_at: string;
}

export default function VehicleRequests() {
  const { eventId } = useParams();
  const [requests,  setRequests]  = useState<VehicleRequest[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [rejectId,  setRejectId]  = useState<string | null>(null);
  const [reason,    setReason]    = useState('');
  const [acting,    setActing]    = useState<string | null>(null);

  async function fetchRequests() {
    try {
      const { data } = await axios.get(
        `${API}/api/admin/events/${eventId}/vehicle-requests`, { headers: authHeader() }
      );
      setRequests(data.data);
    } catch { setError('Failed to load requests'); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchRequests(); }, [eventId]);

  async function approve(passId: string) {
    setActing(passId);
    try {
      await axios.post(
        `${API}/api/admin/events/${eventId}/vehicle-requests/${passId}/approve`, {}, { headers: authHeader() }
      );
      setRequests(r => r.filter(x => x.id !== passId));
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error ?? 'Approval failed' : 'Failed');
    } finally { setActing(null); }
  }

  async function rejectConfirm() {
    if (!rejectId) return;
    setActing(rejectId);
    try {
      await axios.post(
        `${API}/api/admin/events/${eventId}/vehicle-requests/${rejectId}/reject`,
        { reason }, { headers: authHeader() }
      );
      setRequests(r => r.filter(x => x.id !== rejectId));
      setRejectId(null);
      setReason('');
    } catch { setError('Rejection failed'); }
    finally { setActing(null); }
  }

  return (
    <Box>
      <PageHeader
        title="Vehicle Pass Requests"
        subtitle={`${requests.length} pending review`}
      />

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: tokens.primary }} />
        </Box>
      ) : requests.length === 0 ? (
        <GlassCard sx={{ p: 6, textAlign: 'center' }}>
          <DirectionsCarOutlined sx={{ fontSize: 56, color: tokens.onSurfaceMedium, mb: 1.5 }} />
          <Typography variant="h6" fontWeight={700} mb={0.5}>All clear</Typography>
          <Typography sx={{ color: tokens.onSurfaceMedium }}>
            No vehicle pass requests awaiting review.
          </Typography>
        </GlassCard>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <AnimatePresence>
            {requests.map((req, i) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 40, height: 0 }}
                transition={{ delay: i * 0.07, ease: [0.23, 1, 0.32, 1] }}
              >
                <GlassCard sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    {/* Icon */}
                    <Box sx={{
                      width: 52, height: 52, borderRadius: '14px', flexShrink: 0,
                      background: tokens.warningBg, color: tokens.warning,
                      border: `1px solid ${tokens.warning}33`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <HourglassEmptyOutlined />
                    </Box>

                    {/* Info */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="subtitle1" fontWeight={700}>{req.graduate_name}</Typography>
                        <Chip label={req.faculty_code} size="small" sx={{ fontSize: '0.7rem' }} />
                        <Chip
                          label="Pending"
                          size="small"
                          sx={{ background: tokens.warningBg, color: tokens.warning, fontSize: '0.7rem', fontWeight: 600 }}
                        />
                      </Box>
                      <Typography variant="caption" sx={{ color: tokens.onSurfaceMedium }}>
                        {req.student_id} · Requested {new Date(req.requested_at).toLocaleString()}
                      </Typography>
                    </Box>

                    {/* Actions */}
                    <Box sx={{ display: 'flex', gap: 1.5 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<CloseOutlined />}
                        onClick={() => setRejectId(req.id)}
                        disabled={acting === req.id}
                        sx={{ borderColor: tokens.error, color: tokens.error, '&:hover': { background: tokens.errorBg, borderColor: tokens.error } }}
                      >
                        Reject
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={acting === req.id ? <CircularProgress size={14} color="inherit" /> : <CheckOutlined />}
                        onClick={() => approve(req.id)}
                        disabled={acting === req.id}
                        sx={{ background: `linear-gradient(135deg, ${tokens.success}, #16a34a)` }}
                      >
                        Approve
                      </Button>
                    </Box>
                  </Box>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
        </Box>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectId} onClose={() => setRejectId(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Reject Vehicle Pass</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: tokens.onSurfaceMedium, mb: 2 }}>
            Optionally provide a reason. This will be included in the notification email to the graduate.
          </Typography>
          <TextField
            label="Reason (optional)"
            value={reason}
            onChange={e => setReason(e.target.value)}
            fullWidth multiline rows={2}
            placeholder="e.g. Parking quota has been reached"
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button onClick={() => setRejectId(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={rejectConfirm}
            disabled={!!acting}
            sx={{ background: `linear-gradient(135deg, ${tokens.error}, #dc2626)` }}
          >
            Confirm Rejection
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
