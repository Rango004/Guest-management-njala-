import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, TextField, Button, Typography, Alert,
  InputAdornment, IconButton, CircularProgress, Divider,
} from '@mui/material';
import {
  SchoolOutlined, PinOutlined, Visibility, VisibilityOff,
  LightModeOutlined, DarkModeOutlined, EmailOutlined,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, tokens, useColorMode } from '@congregation/ui';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export default function Login() {
  const navigate = useNavigate();
  const { mode, toggle } = useColorMode();

  const [studentId,  setStudentId]  = useState('');
  const [accessPin,  setAccessPin]  = useState('');
  const [showPin,    setShowPin]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  // Forgot receipt state
  const [showForgot,     setShowForgot]     = useState(false);
  const [forgotStudentId,setForgotStudentId]= useState('');
  const [forgotEmail,    setForgotEmail]    = useState('');
  const [forgotLoading,  setForgotLoading]  = useState(false);
  const [forgotMsg,      setForgotMsg]      = useState('');
  const [forgotError,    setForgotError]    = useState('');

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setForgotError('');
    setForgotMsg('');
    setForgotLoading(true);
    try {
      await axios.post(`${API}/api/auth/graduate/forgot-receipt`, {
        student_id: forgotStudentId,
        email:      forgotEmail,
      });
      setForgotMsg('If your details match our records, a reset email has been sent to your address.');
      setForgotStudentId('');
      setForgotEmail('');
    } catch {
      setForgotError('Something went wrong. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/auth/graduate/login`, {
        student_id: studentId, receipt_number: accessPin,
      });
      localStorage.setItem('portal_token',    data.data.token);
      localStorage.setItem('portal_graduate', JSON.stringify(data.data));
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error ?? 'Login failed'
        : 'Network error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      p: 2,
    }}>
      {/* Dark / Light toggle */}
      <Box sx={{ position: 'fixed', top: 20, right: 20 }}>
        <IconButton onClick={toggle} size="small" sx={{
          background: tokens.glass02,
          backdropFilter: tokens.blur,
          border: `1px solid ${tokens.border}`,
          color: tokens.onSurface,
        }}>
          {mode === 'dark' ? <LightModeOutlined fontSize="small" /> : <DarkModeOutlined fontSize="small" />}
        </IconButton>
      </Box>

      {/* Logo block */}
      <motion.div
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      >
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          {/* Graduation cap icon as a glow orb */}
          <Box sx={{
            width: 72, height: 72,
            borderRadius: '22px',
            background: `linear-gradient(135deg, ${tokens.primary}, ${tokens.secondary})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            mx: 'auto', mb: 2.5,
            boxShadow: `0 0 40px ${tokens.primary}55, 0 12px 32px rgba(0,0,0,0.3)`,
          }}>
            <SchoolOutlined sx={{ fontSize: 36, color: '#fff' }} />
          </Box>
          <Typography variant="h4" fontWeight={800} sx={{ color: tokens.onSurface }}>
            Congregation Portal
          </Typography>
          <Typography variant="body2" sx={{ color: tokens.onSurfaceMedium, mt: 0.5 }}>
            Guest & Vehicle Pass Management
          </Typography>
        </Box>
      </motion.div>

      {/* Login card */}
      <GlassCard
        variant="elevated"
        sx={{ width: '100%', maxWidth: 440, p: { xs: 3, sm: 4 } }}
      >
        <Typography variant="h6" fontWeight={700} mb={0.5}>
          Sign in to your portal
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.onSurfaceMedium, mb: 3 }}>
          Enter your Student ID and the Access PIN from your payment receipt or email
        </Typography>

        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Alert
              severity="error"
              sx={{ mb: 2.5, borderRadius: 2, background: tokens.errorBg, border: `1px solid ${tokens.error}33` }}
            >
              {error}
            </Alert>
          </motion.div>
        )}

        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Student ID"
            value={studentId}
            onChange={e => setStudentId(e.target.value)}
            required
            fullWidth
            placeholder="e.g. STU20230001"
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SchoolOutlined sx={{ fontSize: 18, color: tokens.onSurfaceMedium }} />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="Access PIN"
            type={showPin ? 'text' : 'password'}
            value={accessPin}
            onChange={e => setAccessPin(e.target.value)}
            required
            fullWidth
            placeholder="XXXXX-XXXXX-XXXXX"
            size="small"
            inputProps={{ style: { fontFamily: 'monospace', letterSpacing: '0.08em' } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <PinOutlined sx={{ fontSize: 18, color: tokens.onSurfaceMedium }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowPin(v => !v)} edge="end">
                    {showPin ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={loading}
            sx={{ mt: 1, py: 1.5, fontSize: '1rem' }}
          >
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Access My Portal'}
          </Button>
        </Box>

        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Button
            size="small"
            variant="text"
            onClick={() => { setShowForgot(v => !v); setForgotMsg(''); setForgotError(''); }}
            sx={{ color: tokens.onSurfaceMedium, textTransform: 'none', fontSize: '0.8rem' }}
          >
            {showForgot ? 'Back to login' : 'Forgot your Access PIN?'}
          </Button>
        </Box>

        <AnimatePresence>
          {showForgot && (
            <motion.div
              key="forgot"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Divider sx={{ my: 2, borderColor: tokens.border }} />
              <Typography variant="subtitle2" fontWeight={700} mb={0.5}>
                Reset Access PIN
              </Typography>
              <Typography variant="caption" sx={{ color: tokens.onSurfaceMedium, display: 'block', mb: 2 }}>
                Enter your Student ID and registered email. A new Access PIN will be emailed to you.
              </Typography>

              {forgotError && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setForgotError('')}>{forgotError}</Alert>}
              {forgotMsg   && <Alert severity="success" sx={{ mb: 1.5 }}>{forgotMsg}</Alert>}

              <Box component="form" onSubmit={handleForgotSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <TextField
                  label="Student ID" value={forgotStudentId} required fullWidth size="small"
                  onChange={e => setForgotStudentId(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SchoolOutlined sx={{ fontSize: 16, color: tokens.onSurfaceMedium }} />
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  label="Registered Email" type="email" value={forgotEmail} required fullWidth size="small"
                  onChange={e => setForgotEmail(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailOutlined sx={{ fontSize: 16, color: tokens.onSurfaceMedium }} />
                      </InputAdornment>
                    ),
                  }}
                />
                <Button
                  type="submit" variant="outlined" fullWidth disabled={forgotLoading}
                  sx={{ mt: 0.5 }}
                >
                  {forgotLoading ? <CircularProgress size={18} color="inherit" /> : 'Send Reset Email'}
                </Button>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>

        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 2, color: tokens.onSurfaceMedium }}>
          Your Access PIN was issued at payment — check your bank receipt or university email.
        </Typography>
      </GlassCard>
    </Box>
  );
}
