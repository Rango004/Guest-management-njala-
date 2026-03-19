import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme as darkTheme, tokens } from './theme';

type ColorMode = 'dark' | 'light';

interface ThemeContextValue {
  mode: ColorMode;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  toggle: () => {},
});

export function useColorMode() {
  return useContext(ThemeContext);
}

// ── Light mode override tokens ────────────────────────────────────────────────

const lightTokens = {
  glass01:    'rgba(255, 255, 255, 0.55)',
  glass02:    'rgba(255, 255, 255, 0.70)',
  glass03:    'rgba(255, 255, 255, 0.85)',
  glassHover: 'rgba(255, 255, 255, 0.90)',
  border:     'rgba(79, 70, 229, 0.15)',
  borderHover:'rgba(79, 70, 229, 0.35)',
  onSurface:        'rgba(15, 12, 41, 0.92)',
  onSurfaceMedium:  'rgba(15, 12, 41, 0.60)',
  onSurfaceDisabled:'rgba(15, 12, 41, 0.38)',
};

function buildLightTheme() {
  return createTheme({
    ...darkTheme,
    palette: {
      mode: 'light',
      primary:    { main: '#4F46E5', light: '#7C6FFF', dark: '#3730A3' },
      secondary:  { main: '#9333EA' },
      info:       { main: '#0284C7' },
      success:    { main: '#16A34A' },
      error:      { main: '#DC2626' },
      warning:    { main: '#D97706' },
      background: { default: 'transparent', paper: lightTokens.glass02 },
      text: {
        primary:   lightTokens.onSurface,
        secondary: lightTokens.onSurfaceMedium,
        disabled:  lightTokens.onSurfaceDisabled,
      },
      divider: lightTokens.border,
    },
    components: {
      ...darkTheme.components,
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: lightTokens.glass02,
            backdropFilter: tokens.blur,
            WebkitBackdropFilter: tokens.blur,
            border: `1px solid ${lightTokens.border}`,
            transition: 'border-color 0.2s ease',
            '&:hover': { borderColor: lightTokens.borderHover },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: lightTokens.glass02,
            backdropFilter: tokens.blur,
            WebkitBackdropFilter: tokens.blur,
            border: `1px solid ${lightTokens.border}`,
            borderRadius: 20,
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              borderColor: lightTokens.borderHover,
              boxShadow: '0 16px 48px rgba(79, 70, 229, 0.12)',
            },
          },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: 'rgba(255, 255, 255, 0.75)',
            backdropFilter: tokens.blur,
            WebkitBackdropFilter: tokens.blur,
            borderBottom: `1px solid ${lightTokens.border}`,
            color: lightTokens.onSurface,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
            backgroundColor: 'rgba(248, 246, 255, 0.90)',
            backdropFilter: tokens.blur,
            WebkitBackdropFilter: tokens.blur,
            borderRight: `1px solid ${lightTokens.border}`,
          },
        },
      },
    },
  });
}

// ── Background gradient per mode ──────────────────────────────────────────────

const backgrounds = {
  dark:  'linear-gradient(135deg, #0d0221 0%, #1a0533 30%, #0d1b4b 60%, #110d2f 100%)',
  light: 'linear-gradient(135deg, #ede9fe 0%, #f5f3ff 40%, #e0f2fe 80%, #f0fdf4 100%)',
};

// ── Provider ──────────────────────────────────────────────────────────────────

interface ThemeProviderProps { children: React.ReactNode }

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [mode, setMode] = useState<ColorMode>(() => {
    const saved = typeof localStorage !== 'undefined'
      ? (localStorage.getItem('congregation-theme') as ColorMode | null)
      : null;
    return saved ?? 'dark';
  });

  useEffect(() => {
    localStorage.setItem('congregation-theme', mode);
    // Apply gradient to body so the background extends under any fixed elements
    document.body.style.background = backgrounds[mode];
    document.body.style.backgroundAttachment = 'fixed';
  }, [mode]);

  const toggle = () => setMode((m) => (m === 'dark' ? 'light' : 'dark'));

  const activeTheme = useMemo(
    () => (mode === 'dark' ? darkTheme : buildLightTheme()),
    [mode]
  );

  return (
    <ThemeContext.Provider value={{ mode, toggle }}>
      <MuiThemeProvider theme={activeTheme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}
