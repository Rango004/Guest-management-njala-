import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, TextField, Button, Typography, Table, TableBody, TableCell,
  TableHead, TableRow, Paper, Chip, InputAdornment, IconButton,
  Tooltip, CircularProgress, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, DialogContentText,
} from '@mui/material';
import {
  SearchOutlined, UploadFileOutlined, RefreshOutlined,
  DeleteOutlined, EmailOutlined, DownloadOutlined, KeyOutlined,
  ContentCopyOutlined,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import axios from 'axios';
import { GlassCard, PageHeader, tokens } from '@congregation/ui';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
function authHeader() { return { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }; }

interface Graduate {
  id: string; full_name: string; student_id: string; email: string;
  faculty_code: string; gate_code: string;
  credentials_sent_at: string | null; last_login_at: string | null;
}

interface PinRow { student_id: string; full_name: string; pin: string; }

function downloadPinsCsv(pins: PinRow[], filename = 'access_pins.csv') {
  const rows = ['full_name,student_id,access_pin', ...pins.map(p => `"${p.full_name}",${p.student_id},${p.pin}`)];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function Graduates() {
  const { eventId } = useParams();
  const [graduates, setGraduates] = useState<Graduate[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [search,    setSearch]    = useState('');
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [error,     setError]     = useState('');

  // Post-import PIN download dialog
  const [generatedPins, setGeneratedPins] = useState<PinRow[]>([]);
  const [showPinsDialog, setShowPinsDialog] = useState(false);

  // Per-row reset PIN
  const [resetPinTarget, setResetPinTarget]   = useState<Graduate | null>(null);
  const [resetPinResult, setResetPinResult]   = useState<PinRow | null>(null);
  const [resetPinLoading, setResetPinLoading] = useState(false);

  // Bulk export PINs
  const [bulkResetting, setBulkResetting] = useState(false);

  async function fetchGraduates() {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/events/${eventId}/graduates`, {
        headers: authHeader(), params: { page, limit: 50 },
      });
      setGraduates(data.data.graduates);
      setTotal(data.data.total);
    } catch { setError('Failed to load graduates'); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchGraduates(); }, [eventId, page]);

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setImportMsg('');
    const form = new FormData();
    form.append('file', file);
    try {
      const { data } = await axios.post(`${API}/api/events/${eventId}/graduates/import`, form, {
        headers: { ...authHeader(), 'Content-Type': 'multipart/form-data' },
      });
      const s = data.data;
      setImportMsg(`Import complete: ${s.imported} imported · ${s.duplicates} duplicates · ${s.failed} failed`);
      if (s.generatedPins?.length > 0) {
        setGeneratedPins(s.generatedPins);
        setShowPinsDialog(true);
      }
      fetchGraduates();
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error ?? 'Import failed' : 'Upload failed');
    } finally { setUploading(false); e.target.value = ''; }
  }

  function downloadTemplate() {
    // receipt_number column is optional — system auto-generates Access PIN when absent
    const csv = [
      'full_name,student_id,email,faculty_code',
      'Jane Smith,2024001,jane.smith@university.edu,ENG',
      'John Doe,2024002,john.doe@university.edu,SCI',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'graduates_template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function resend(graduateId: string) {
    try {
      await axios.post(`${API}/api/events/${eventId}/graduates/${graduateId}/resend-credentials`, {}, { headers: authHeader() });
    } catch { setError('Failed to resend credentials'); }
  }

  async function handleResetPin(grad: Graduate) {
    setResetPinTarget(grad);
    setResetPinResult(null);
  }

  async function confirmResetPin() {
    if (!resetPinTarget) return;
    setResetPinLoading(true);
    try {
      const { data } = await axios.post(
        `${API}/api/events/${eventId}/graduates/${resetPinTarget.id}/reset-pin`,
        {}, { headers: authHeader() }
      );
      setResetPinResult(data.data);
    } catch { setError('Failed to reset PIN'); setResetPinTarget(null); }
    finally { setResetPinLoading(false); }
  }

  async function handleBulkExportPins() {
    if (!confirm('This will regenerate Access PINs for all graduates who have never logged in. Their old PINs will no longer work. Continue?')) return;
    setBulkResetting(true);
    try {
      const { data } = await axios.post(
        `${API}/api/events/${eventId}/graduates/bulk-reset-pins`,
        {}, { headers: authHeader() }
      );
      if (data.data.pins?.length > 0) {
        downloadPinsCsv(data.data.pins, 'access_pins_bulk.csv');
        setImportMsg(`${data.data.count} PINs regenerated and downloaded.`);
      } else {
        setImportMsg('No unredeemed graduates found — nothing to regenerate.');
      }
    } catch { setError('Failed to generate PINs'); }
    finally { setBulkResetting(false); }
  }

  async function deleteGraduate(graduateId: string, name: string) {
    if (!confirm(`Delete ${name}? This will also remove their passes.`)) return;
    try {
      await axios.delete(`${API}/api/events/${eventId}/graduates/${graduateId}`, { headers: authHeader() });
      setGraduates(g => g.filter(x => x.id !== graduateId));
    } catch { setError('Failed to delete graduate'); }
  }

  const filtered = graduates.filter(g =>
    search === '' ||
    g.full_name.toLowerCase().includes(search.toLowerCase()) ||
    g.student_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box>
      <PageHeader
        title="Graduates"
        subtitle={`${total} total`}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" startIcon={<DownloadOutlined />} onClick={downloadTemplate}>
              Sample CSV
            </Button>
            <Button
              variant="outlined"
              startIcon={bulkResetting ? <CircularProgress size={16} color="inherit" /> : <KeyOutlined />}
              onClick={handleBulkExportPins}
              disabled={bulkResetting}
            >
              Export PINs
            </Button>
            <Button
              component="label"
              variant="contained"
              startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <UploadFileOutlined />}
              disabled={uploading}
            >
              Import CSV
              <input type="file" accept=".csv,.txt" hidden onChange={handleCsvUpload} />
            </Button>
          </Box>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {importMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setImportMsg('')}>{importMsg}</Alert>}

      {/* Search bar */}
      <GlassCard sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            size="small" fullWidth
            placeholder="Search by name or student ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined sx={{ fontSize: 18, color: tokens.onSurfaceMedium }} />
                </InputAdornment>
              ),
            }}
          />
          <Tooltip title="Refresh">
            <IconButton onClick={fetchGraduates} disabled={loading}>
              <RefreshOutlined />
            </IconButton>
          </Tooltip>
        </Box>
      </GlassCard>

      {/* Post-import PIN download dialog */}
      <Dialog open={showPinsDialog} onClose={() => setShowPinsDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Access PINs Generated</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {generatedPins.length} Access PIN{generatedPins.length !== 1 ? 's were' : ' was'} auto-generated
            for graduates with no receipt number in the CSV. <strong>Download the PIN sheet now — these
            PINs cannot be recovered after you close this dialog.</strong>
          </DialogContentText>
          <Button
            variant="contained" fullWidth startIcon={<DownloadOutlined />}
            onClick={() => downloadPinsCsv(generatedPins, 'access_pins_import.csv')}
          >
            Download PIN Sheet ({generatedPins.length} PINs)
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setShowPinsDialog(false); setGeneratedPins([]); }}>
            I have downloaded the PINs
          </Button>
        </DialogActions>
      </Dialog>

      {/* Per-student Reset PIN dialog */}
      <Dialog open={!!resetPinTarget} onClose={() => { setResetPinTarget(null); setResetPinResult(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>Reset Access PIN</DialogTitle>
        <DialogContent>
          {!resetPinResult ? (
            <DialogContentText>
              Generate a new Access PIN for <strong>{resetPinTarget?.full_name}</strong>?
              Their current PIN will stop working immediately.
            </DialogContentText>
          ) : (
            <Box>
              <DialogContentText sx={{ mb: 2 }}>New PIN for <strong>{resetPinResult.full_name}</strong>:</DialogContentText>
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                background: tokens.glass02, border: `1px solid ${tokens.border}`,
                borderRadius: 2, px: 2, py: 1.5,
              }}>
                <Typography fontFamily="monospace" fontSize="1.25rem" letterSpacing="0.1em" flexGrow={1}>
                  {resetPinResult.pin}
                </Typography>
                <Tooltip title="Copy">
                  <IconButton size="small" onClick={() => navigator.clipboard.writeText(resetPinResult.pin)}>
                    <ContentCopyOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <DialogContentText sx={{ mt: 1.5, fontSize: '0.8rem' }}>
                Share this PIN with the student. It will not be shown again.
              </DialogContentText>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {!resetPinResult ? (
            <>
              <Button onClick={() => setResetPinTarget(null)}>Cancel</Button>
              <Button variant="contained" onClick={confirmResetPin} disabled={resetPinLoading}>
                {resetPinLoading ? <CircularProgress size={18} color="inherit" /> : 'Reset PIN'}
              </Button>
            </>
          ) : (
            <Button onClick={() => { setResetPinTarget(null); setResetPinResult(null); }}>Close</Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Table */}
      <GlassCard sx={{ overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress sx={{ color: tokens.primary }} />
          </Box>
        ) : (
          <Paper elevation={0} sx={{ background: 'transparent', overflow: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Student ID</TableCell>
                  <TableCell>Faculty / Gate</TableCell>
                  <TableCell>Last Login</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((g, i) => (
                  <motion.tr
                    key={g.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03, ease: [0.23, 1, 0.32, 1] }}
                    style={{ display: 'table-row' }}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{g.full_name}</Typography>
                      <Typography variant="caption" sx={{ color: tokens.onSurfaceMedium }}>{g.email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">{g.student_id}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.75 }}>
                        <Chip label={g.faculty_code} size="small" sx={{ fontSize: '0.7rem' }} />
                        <Chip label={`Gate ${g.gate_code}`} size="small" sx={{ fontSize: '0.7rem', background: tokens.primaryContainer, color: tokens.primaryLight }} />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ color: tokens.onSurfaceMedium }}>
                        {g.last_login_at ? new Date(g.last_login_at).toLocaleDateString() : 'Never'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title="Resend credentials (resets PIN)">
                          <IconButton size="small" onClick={() => resend(g.id)}>
                            <EmailOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Reset Access PIN">
                          <IconButton size="small" onClick={() => handleResetPin(g)}
                            sx={{ color: tokens.warning, '&:hover': { background: tokens.warningBg } }}>
                            <KeyOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete graduate">
                          <IconButton size="small" onClick={() => deleteGraduate(g.id, g.full_name)}
                            sx={{ color: tokens.error, '&:hover': { background: tokens.errorBg } }}>
                            <DeleteOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </GlassCard>
    </Box>
  );
}
