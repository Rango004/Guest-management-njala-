import React from 'react';
import { Box } from '@mui/material';

// Animated aurora orbs floating in the background — gives depth to the glass cards
const orbs = [
  { size: 600, x: '-10%', y: '-20%', color: 'rgba(124, 111, 255, 0.18)', delay: 0 },
  { size: 500, x: '60%',  y: '10%',  color: 'rgba(192, 132, 252, 0.14)', delay: 4 },
  { size: 450, x: '20%',  y: '55%',  color: 'rgba(56, 189, 248, 0.10)',  delay: 8 },
  { size: 350, x: '75%',  y: '65%',  color: 'rgba(124, 111, 255, 0.12)', delay: 2 },
];

interface AppBackgroundProps {
  children: React.ReactNode;
}

export function AppBackground({ children }: AppBackgroundProps) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        position: 'relative',
        background: 'linear-gradient(135deg, #0d0221 0%, #1a0533 30%, #0d1b4b 60%, #110d2f 100%)',
        backgroundAttachment: 'fixed',
        overflow: 'hidden',
      }}
    >
      {/* Noise texture overlay */}
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          opacity: 0.025,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Aurora orbs */}
      {orbs.map((orb, i) => (
        <Box
          key={i}
          sx={{
            position: 'fixed',
            width:  orb.size,
            height: orb.size,
            left: orb.x,
            top:  orb.y,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            filter: 'blur(60px)',
            pointerEvents: 'none',
            zIndex: 0,
            animation: `float ${16 + orb.delay}s ease-in-out infinite alternate`,
            animationDelay: `${orb.delay}s`,
            '@keyframes float': {
              '0%':   { transform: 'translateY(0px) scale(1)' },
              '100%': { transform: 'translateY(-40px) scale(1.08)' },
            },
          }}
        />
      ))}

      {/* Content */}
      <Box sx={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
        {children}
      </Box>
    </Box>
  );
}
