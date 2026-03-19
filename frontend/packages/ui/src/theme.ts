import { createTheme, alpha } from '@mui/material/styles';

// ── MD3 Glass Design Tokens ───────────────────────────────────────────────────

export const tokens = {
  // Primary — Indigo Violet
  primary:            '#7C6FFF',
  primaryLight:       '#A89FFF',
  primaryDark:        '#5546E8',
  primaryContainer:   'rgba(124, 111, 255, 0.15)',
  onPrimaryContainer: '#E4E0FF',

  // Secondary — Soft Purple
  secondary:          '#C084FC',
  secondaryContainer: 'rgba(192, 132, 252, 0.12)',

  // Tertiary — Sky Accent
  tertiary:           '#38BDF8',
  tertiaryContainer:  'rgba(56, 189, 248, 0.12)',

  // Semantic
  success:    '#4ADE80',
  successBg:  'rgba(74, 222, 128, 0.12)',
  error:      '#F87171',
  errorBg:    'rgba(248, 113, 113, 0.12)',
  warning:    '#FBBF24',
  warningBg:  'rgba(251, 191, 36, 0.12)',
  info:       '#60A5FA',

  // Glass surfaces
  glass01:    'rgba(255, 255, 255, 0.04)',
  glass02:    'rgba(255, 255, 255, 0.07)',
  glass03:    'rgba(255, 255, 255, 0.10)',
  glassHover: 'rgba(255, 255, 255, 0.13)',
  border:     'rgba(255, 255, 255, 0.12)',
  borderHover:'rgba(255, 255, 255, 0.22)',

  // Text
  onSurface:        'rgba(255, 255, 255, 0.92)',
  onSurfaceMedium:  'rgba(255, 255, 255, 0.62)',
  onSurfaceDisabled:'rgba(255, 255, 255, 0.38)',

  // Blur
  blur: 'blur(24px) saturate(180%)',
  blurLight: 'blur(12px) saturate(160%)',
};

// ── MD3-inspired MUI Theme ────────────────────────────────────────────────────

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary:    { main: tokens.primary, light: tokens.primaryLight, dark: tokens.primaryDark },
    secondary:  { main: tokens.secondary },
    info:       { main: tokens.tertiary },
    success:    { main: tokens.success },
    error:      { main: tokens.error },
    warning:    { main: tokens.warning },
    background: { default: 'transparent', paper: tokens.glass02 },
    text: {
      primary:   tokens.onSurface,
      secondary: tokens.onSurfaceMedium,
      disabled:  tokens.onSurfaceDisabled,
    },
    divider: tokens.border,
  },

  shape: { borderRadius: 16 },

  typography: {
    fontFamily: '"Plus Jakarta Sans", "Roboto", system-ui, sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-1.5px' },
    h2: { fontWeight: 700, letterSpacing: '-1px' },
    h3: { fontWeight: 700, letterSpacing: '-0.5px' },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 500, color: tokens.onSurfaceMedium },
    body1: { lineHeight: 1.7 },
    body2: { lineHeight: 1.6, color: tokens.onSurfaceMedium },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.3px' },
    overline: { letterSpacing: '1.5px', fontWeight: 600, fontSize: '0.7rem' },
  },

  components: {
    // ── Paper / Card — the primary glass surface ──────────────────────────────
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: tokens.glass02,
          backdropFilter: tokens.blur,
          WebkitBackdropFilter: tokens.blur,
          border: `1px solid ${tokens.border}`,
          transition: 'border-color 0.2s ease, background-color 0.2s ease',
          '&:hover': { borderColor: tokens.borderHover },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: tokens.glass02,
          backdropFilter: tokens.blur,
          WebkitBackdropFilter: tokens.blur,
          border: `1px solid ${tokens.border}`,
          borderRadius: 20,
          transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            borderColor: tokens.borderHover,
            boxShadow: `0 16px 48px rgba(0, 0, 0, 0.35)`,
          },
        },
      },
    },
    MuiCardContent: {
      styleOverrides: { root: { '&:last-child': { paddingBottom: 20 } } },
    },

    // ── Buttons — MD3 pill shape ──────────────────────────────────────────────
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 50,
          padding: '10px 28px',
          fontSize: '0.9375rem',
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
          '&:active': { transform: 'scale(0.98)' },
          transition: 'transform 0.1s ease, background-color 0.2s ease',
        },
        contained: {
          background: `linear-gradient(135deg, ${tokens.primary} 0%, ${tokens.primaryDark} 100%)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${tokens.primaryLight} 0%, ${tokens.primary} 100%)`,
          },
        },
        outlined: {
          borderColor: tokens.border,
          backgroundColor: tokens.glass01,
          backdropFilter: tokens.blurLight,
          '&:hover': {
            borderColor: tokens.primary,
            backgroundColor: tokens.primaryContainer,
          },
        },
        text: {
          '&:hover': { backgroundColor: tokens.glass02 },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          transition: 'background-color 0.2s ease, transform 0.1s ease',
          '&:hover': { backgroundColor: tokens.glass02 },
          '&:active': { transform: 'scale(0.92)' },
        },
      },
    },

    // ── Inputs — glass filled style ───────────────────────────────────────────
    MuiTextField: {
      defaultProps: { variant: 'outlined' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: tokens.glass01,
          backdropFilter: tokens.blurLight,
          transition: 'background-color 0.2s ease',
          '&:hover': { backgroundColor: tokens.glass02 },
          '&.Mui-focused': {
            backgroundColor: tokens.glass02,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: tokens.primary,
              borderWidth: 2,
            },
          },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.border,
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.borderHover,
          },
        },
        input: { padding: '14px 16px' },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: tokens.onSurfaceMedium,
          '&.Mui-focused': { color: tokens.primary },
        },
      },
    },

    // ── Chip — MD3 assist chip ────────────────────────────────────────────────
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backdropFilter: tokens.blurLight,
          border: `1px solid ${tokens.border}`,
          backgroundColor: tokens.glass02,
          fontWeight: 500,
        },
      },
    },

    // ── AppBar — glass navigation bar ────────────────────────────────────────
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(13, 2, 33, 0.7)',
          backdropFilter: tokens.blur,
          WebkitBackdropFilter: tokens.blur,
          borderBottom: `1px solid ${tokens.border}`,
        },
      },
    },

    // ── Drawer — glass sidebar ────────────────────────────────────────────────
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(13, 2, 33, 0.8)',
          backdropFilter: tokens.blur,
          WebkitBackdropFilter: tokens.blur,
          borderRight: `1px solid ${tokens.border}`,
        },
      },
    },

    // ── Dialog — elevated glass modal ─────────────────────────────────────────
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(26, 5, 51, 0.85)',
          backdropFilter: 'blur(32px) saturate(200%)',
          border: `1px solid ${tokens.border}`,
          borderRadius: 24,
        },
      },
    },

    // ── Tooltip ───────────────────────────────────────────────────────────────
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: 'rgba(30, 20, 60, 0.95)',
          backdropFilter: tokens.blurLight,
          border: `1px solid ${tokens.border}`,
          borderRadius: 8,
          fontSize: '0.8rem',
        },
      },
    },

    // ── Table ─────────────────────────────────────────────────────────────────
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${tokens.border}`,
          color: tokens.onSurface,
        },
        head: {
          color: tokens.onSurfaceMedium,
          fontWeight: 600,
          fontSize: '0.78rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          backgroundColor: tokens.glass01,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 0.15s ease',
          '&:hover': { backgroundColor: tokens.glass01 },
        },
      },
    },

    // ── LinearProgress ────────────────────────────────────────────────────────
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 50,
          backgroundColor: tokens.glass03,
          height: 6,
        },
        bar: { borderRadius: 50 },
      },
    },

    // ── Divider ───────────────────────────────────────────────────────────────
    MuiDivider: {
      styleOverrides: { root: { borderColor: tokens.border } },
    },
  },
});
