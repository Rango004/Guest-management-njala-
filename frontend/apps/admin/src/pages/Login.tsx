import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, TextField, Button, Typography, Alert,
  CircularProgress, IconButton, InputAdornment,
} from '@mui/material';
import {
  AdminPanelSettingsOutlined, Visibility, VisibilityOff,
  LightModeOutlined, DarkModeOutlined,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import { GlassCard, tokens, useColorMode } from '@congregation/ui';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export default function Login() {
  const navigate = useNavigate();
  const { mode, toggle } = useColorMode();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/auth/admin/login`, { username, password });
      if (data.data.role === 'GATE_OFFICER') {
        throw new Error('Gate officers should use the Gate Scanner app, not Admin Console');
      }
      localStorage.setItem('admin_token', data.data.token);
      localStorage.setItem('admin_user',  JSON.stringify(data.data));
      navigate('/events');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message
        : axios.isAxiosError(err) ? err.response?.data?.error ?? 'Login failed'
        : 'Network error';
      setError(msg);
      localStorage.removeItem('admin_token');
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
      <Box sx={{ position: 'fixed', top: 20, right: 20 }}>
        <IconButton onClick={toggle} size="small" sx={{
          background: tokens.glass02, backdropFilter: tokens.blur, border: `1px solid ${tokens.border}`,
        }}>
          {mode === 'dark' ? <LightModeOutlined fontSize="small" /> : <DarkModeOutlined fontSize="small" />}
        </IconButton>
      </Box>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      >
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Box sx={{
            width: 72, height: 72, borderRadius: '22px',
            background: `linear-gradient(135deg, ${tokens.secondary}, ${tokens.primary})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            mx: 'auto', mb: 2.5,
            boxShadow: `0 0 40px ${tokens.secondary}55, 0 12px 32px rgba(0,0,0,0.3)`,
          }}>
            <AdminPanelSettingsOutlined sx={{ fontSize: 36, color: '#fff' }} />
          </Box>
          <Typography variant="h4" fontWeight={800}>Admin Console</Typography>
          <Typography variant="body2" sx={{ color: tokens.onSurfaceMedium, mt: 0.5 }}>
            Congregation Event Management
          </Typography>
        </Box>
      </motion.div>

      <GlassCard variant="elevated" sx={{ width: '100%', maxWidth: 400, p: { xs: 3, sm: 4 } }}>
        <Typography variant="h6" fontWeight={700} mb={0.5}>Administrator Sign In</Typography>
        <Typography variant="body2" sx={{ color: tokens.onSurfaceMedium, mb: 3 }}>
          Super admin access
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required fullWidth size="small" autoComplete="username"
          />
          <TextField
            label="Password"
            type={showPwd ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required fullWidth size="small" autoComplete="current-password"
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
          <Button type="submit" variant="contained" fullWidth size="large" disabled={loading} sx={{ mt: 1, py: 1.5 }}>
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Sign In'}
          </Button>
        </Box>
      </GlassCard>
    </Box>
  );
}
