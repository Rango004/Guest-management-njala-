import React from 'react';
import { Box, BoxProps } from '@mui/material';
import { motion, MotionProps } from 'framer-motion';
import { tokens } from './theme';

// ── GlassCard ─────────────────────────────────────────────────────────────────

interface GlassCardProps extends Omit<BoxProps, keyof MotionProps> {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'filled' | 'outlined';
  glow?: 'primary' | 'success' | 'error' | 'warning' | false;
  animate?: boolean;
  delay?: number;
}

const glowColors = {
  primary: tokens.primary,
  success: tokens.success,
  error:   tokens.error,
  warning: tokens.warning,
};

const variantStyles = {
  default: {
    background: tokens.glass02,
    border: `1px solid ${tokens.border}`,
  },
  elevated: {
    background: tokens.glass03,
    border: `1px solid ${tokens.borderHover}`,
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
  },
  filled: {
    background: tokens.primaryContainer,
    border: `1px solid rgba(124, 111, 255, 0.25)`,
  },
  outlined: {
    background: 'transparent',
    border: `1px solid ${tokens.border}`,
  },
};

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ children, variant = 'default', glow = false, animate = true, delay = 0, sx, ...rest }, ref) => {
    const glowColor = glow ? glowColors[glow] : null;

    const content = (
      <Box
        ref={ref}
        sx={{
          ...variantStyles[variant],
          borderRadius: '20px',
          backdropFilter: tokens.blur,
          WebkitBackdropFilter: tokens.blur,
          transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
          position: 'relative',
          overflow: 'hidden',
          ...(glowColor ? {
            boxShadow: `0 0 40px ${glowColor}30, 0 0 80px ${glowColor}15`,
            borderColor: `${glowColor}40`,
          } : {}),
          // Subtle shimmer sheen at the top
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            background: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, transparent 50%)',
            pointerEvents: 'none',
          },
          ...sx,
        }}
        {...rest}
      >
        {children}
      </Box>
    );

    if (!animate) return content;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay, ease: [0.23, 1, 0.32, 1] }}
        style={{ display: 'contents' }}
      >
        {content}
      </motion.div>
    );
  }
);
GlassCard.displayName = 'GlassCard';

// ── StatCard — metric display card ────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  delay?: number;
  sub?: string;
}

export function StatCard({ label, value, icon, color = tokens.primary, delay = 0, sub }: StatCardProps) {
  return (
    <GlassCard delay={delay} sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Box sx={{
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: tokens.onSurfaceMedium,
            mb: 1,
          }}>
            {label}
          </Box>
          <Box sx={{ fontSize: '2.4rem', fontWeight: 800, lineHeight: 1, color: tokens.onSurface }}>
            {value}
          </Box>
          {sub && (
            <Box sx={{ fontSize: '0.8rem', color: tokens.onSurfaceMedium, mt: 0.5 }}>
              {sub}
            </Box>
          )}
        </Box>
        <Box sx={{
          width: 48,
          height: 48,
          borderRadius: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${color}22`,
          color,
          border: `1px solid ${color}30`,
          flexShrink: 0,
        }}>
          {icon}
        </Box>
      </Box>
    </GlassCard>
  );
}

// ── PageHeader — consistent page title block ──────────────────────────────────

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Box>
          <Box sx={{ fontSize: '1.75rem', fontWeight: 800, color: tokens.onSurface, lineHeight: 1.2 }}>
            {title}
          </Box>
          {subtitle && (
            <Box sx={{ color: tokens.onSurfaceMedium, mt: 0.5, fontSize: '0.95rem' }}>
              {subtitle}
            </Box>
          )}
        </Box>
        {action}
      </Box>
    </motion.div>
  );
}
