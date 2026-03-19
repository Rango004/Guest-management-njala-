import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Typography, LinearProgress } from '@mui/material';
import {
  CheckCircleOutlined, CancelOutlined, SwapHorizOutlined,
  ReplayOutlined, AccessTimeOutlined,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import { tokens } from '@congregation/ui';

interface ResultState {
  result:      'VALID' | 'INVALID' | 'ALREADY_USED' | 'WRONG_GATE' | 'EXPIRED' | 'REVOKED' | 'NOT_APPROVED';
  reason?:     string;
  correctGate?: string;
  checkedInAt?: string;
  pass?: {
    guestName:    string | null;
    graduateName: string;
    passType:     string;
    facultyCode:  string;
    gateCode:     string;
  };
  code?: string;
}

const AUTO_DISMISS_MS = 4000; // Return to scanner after 4s

// ── Result configuration ──────────────────────────────────────────────────────

const resultConfig = {
  VALID: {
    bg:       'linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)',
    accent:   '#4ADE80',
    glow:     'rgba(74, 222, 128, 0.3)',
    Icon:     CheckCircleOutlined,
    headline: 'VALID',
  },
  INVALID: {
    bg:       'linear-gradient(135deg, #450a0a 0%, #7f1d1d 50%, #991b1b 100%)',
    accent:   '#F87171',
    glow:     'rgba(248, 113, 113, 0.3)',
    Icon:     CancelOutlined,
    headline: 'INVALID',
  },
  ALREADY_USED: {
    bg:       'linear-gradient(135deg, #450a0a 0%, #7f1d1d 50%, #991b1b 100%)',
    accent:   '#F87171',
    glow:     'rgba(248, 113, 113, 0.3)',
    Icon:     ReplayOutlined,
    headline: 'ALREADY USED',
  },
  WRONG_GATE: {
    bg:       'linear-gradient(135deg, #422006 0%, #78350f 50%, #92400e 100%)',
    accent:   '#FBBF24',
    glow:     'rgba(251, 191, 36, 0.3)',
    Icon:     SwapHorizOutlined,
    headline: 'WRONG GATE',
  },
  EXPIRED: {
    bg:       'linear-gradient(135deg, #0c1a35 0%, #1e3a6e 50%, #1d4ed8 100%)',
    accent:   '#60A5FA',
    glow:     'rgba(96, 165, 250, 0.3)',
    Icon:     AccessTimeOutlined,
    headline: 'EXPIRED',
  },
  REVOKED: {
    bg:       'linear-gradient(135deg, #450a0a 0%, #7f1d1d 50%, #991b1b 100%)',
    accent:   '#F87171',
    glow:     'rgba(248, 113, 113, 0.3)',
    Icon:     CancelOutlined,
    headline: 'REVOKED',
  },
  NOT_APPROVED: {
    bg:       'linear-gradient(135deg, #1c1003 0%, #44330e 50%, #713f12 100%)',
    accent:   '#FBBF24',
    glow:     'rgba(251, 191, 36, 0.3)',
    Icon:     CancelOutlined,
    headline: 'NOT APPROVED',
  },
};

export default function ScanResult() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const state     = (location.state ?? {}) as ResultState;
  const [progress, setProgress] = useState(100);

  const cfg = resultConfig[state.result ?? 'INVALID'];
  const { bg, accent, glow, Icon, headline } = cfg;

  // Auto-dismiss timer
  useEffect(() => {
    const start = Date.now();
    const tick  = setInterval(() => {
      const elapsed  = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
      setProgress(remaining);
      if (remaining === 0) { clearInterval(tick); navigate('/scan'); }
    }, 50);
    return () => clearInterval(tick);
  }, [navigate]);

  return (
    <Box
      onClick={() => navigate('/scan')}
      sx={{
        position: 'relative',
        width: '100%', height: '100dvh',
        background: bg,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Glow orb behind icon */}
      <Box sx={{
        position: 'absolute',
        width: 400, height: 400,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
        filter: 'blur(40px)',
        pointerEvents: 'none',
      }} />

      {/* Icon */}
      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 350, damping: 20 }}
      >
        <Icon sx={{ fontSize: 120, color: accent, mb: 3, filter: `drop-shadow(0 0 24px ${accent})` }} />
      </motion.div>

      {/* Result text */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      >
        <Typography
          sx={{
            fontSize: 'clamp(3rem, 12vw, 5.5rem)',
            fontWeight: 900,
            color: accent,
            letterSpacing: '0.05em',
            textAlign: 'center',
            lineHeight: 1,
            textShadow: `0 0 40px ${accent}80`,
            mb: 3,
          }}
        >
          {headline}
        </Typography>
      </motion.div>

      {/* Pass details */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      >
        <Box sx={{
          textAlign: 'center',
          backdropFilter: 'blur(16px)',
          background: 'rgba(0,0,0,0.25)',
          borderRadius: '20px',
          border: `1px solid rgba(255,255,255,0.12)`,
          px: 5, py: 3, maxWidth: 360,
        }}>
          {state.result === 'VALID' && state.pass ? (
            <>
              <Typography variant="h5" fontWeight={800} color="white" mb={0.5}>
                {state.pass.guestName ?? 'Anonymous Guest'}
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '1.1rem' }}>
                {state.pass.graduateName}'s {state.pass.passType.toLowerCase()} guest
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Faculty</Typography>
                  <Typography variant="subtitle1" fontWeight={700} color="white">{state.pass.facultyCode}</Typography>
                </Box>
                <Box sx={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Gate</Typography>
                  <Typography variant="subtitle1" fontWeight={700} color="white">{state.pass.gateCode}</Typography>
                </Box>
              </Box>
            </>
          ) : (
            <>
              <Typography variant="h6" fontWeight={700} color="white" mb={0.75}>
                {state.reason ?? 'This pass cannot be accepted'}
              </Typography>
              {state.correctGate && (
                <Typography sx={{ color: accent, fontWeight: 600 }}>
                  Direct guest to Gate {state.correctGate}
                </Typography>
              )}
              {state.checkedInAt && (
                <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', mt: 0.5 }}>
                  Admitted at {new Date(state.checkedInAt).toLocaleTimeString()}
                </Typography>
              )}
            </>
          )}
        </Box>
      </motion.div>

      {/* Dismiss hint */}
      <Typography variant="caption" sx={{ position: 'absolute', bottom: 60, color: 'rgba(255,255,255,0.4)' }}>
        Tap anywhere to scan next
      </Typography>

      {/* Auto-dismiss progress bar */}
      <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 4,
            borderRadius: 0,
            backgroundColor: 'rgba(255,255,255,0.1)',
            '& .MuiLinearProgress-bar': {
              backgroundColor: accent,
              transition: 'none',
            },
          }}
        />
      </Box>
    </Box>
  );
}
