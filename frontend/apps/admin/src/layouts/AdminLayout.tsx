import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useParams } from 'react-router-dom';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, IconButton, Tooltip, Divider, useMediaQuery, useTheme,
  AppBar, Toolbar,
} from '@mui/material';
import {
  DashboardOutlined, PeopleOutlined, DirectionsCarOutlined,
  MenuOutlined, LogoutOutlined, LightModeOutlined, DarkModeOutlined,
  SchoolOutlined, ChevronLeftOutlined, SettingsOutlined, ManageAccountsOutlined,
  ArrowBackOutlined,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import { tokens, useColorMode } from '@congregation/ui';

const DRAWER_WIDTH = 260;

const navItems = [
  { label: 'Dashboard',      icon: <DashboardOutlined />,       path: 'dashboard'  },
  { label: 'Graduates',      icon: <PeopleOutlined />,          path: 'graduates'  },
  { label: 'Vehicle Passes', icon: <DirectionsCarOutlined />,   path: 'vehicles'   },
  { label: 'Event Config',   icon: <SettingsOutlined />,        path: 'config'     },
  { label: 'Users',          icon: <ManageAccountsOutlined />,  path: 'users'      },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { eventId } = useParams();
  const navigate    = useNavigate();
  const { mode, toggle } = useColorMode();

  function logout() {
    localStorage.removeItem('admin_token');
    navigate('/');
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      {/* Logo */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1, py: 2, mb: 1 }}>
        <Box sx={{
          width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
          background: `linear-gradient(135deg, ${tokens.primary}, ${tokens.secondary})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <SchoolOutlined sx={{ fontSize: 18, color: '#fff' }} />
        </Box>
        <Box>
          <Typography variant="subtitle2" fontWeight={700} lineHeight={1.2}>
            Congregation
          </Typography>
          <Typography variant="caption" sx={{ color: tokens.onSurfaceMedium }}>
            Admin Console
          </Typography>
        </Box>
        {onClose && (
          <IconButton size="small" onClick={onClose} sx={{ ml: 'auto' }}>
            <ChevronLeftOutlined fontSize="small" />
          </IconButton>
        )}
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Nav */}
      <List disablePadding sx={{ flex: 1 }}>
        {navItems.map((item, i) => (
          <motion.div
            key={item.path}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07, ease: [0.23, 1, 0.32, 1] }}
          >
            <ListItemButton
              component={NavLink}
              to={`/events/${eventId}/${item.path}`}
              onClick={onClose}
              sx={{
                borderRadius: '12px',
                mb: 0.5,
                py: 1.2,
                color: tokens.onSurfaceMedium,
                '&.active': {
                  background: tokens.primaryContainer,
                  color: tokens.primaryLight,
                  '& .MuiListItemIcon-root': { color: tokens.primary },
                },
                '&:hover': { background: tokens.glass02, color: tokens.onSurface },
              }}
            >
              <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: 500 }}
              />
            </ListItemButton>
          </motion.div>
        ))}
      </List>

      <Divider sx={{ my: 1 }} />

      {/* Bottom actions */}
      <Box sx={{ display: 'flex', gap: 1, px: 1 }}>
        <Tooltip title="All events">
          <IconButton onClick={() => navigate('/events')} size="small" sx={{ flex: 1, borderRadius: '10px', py: 1, color: tokens.onSurfaceMedium }}>
            <ArrowBackOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
          <IconButton onClick={toggle} size="small" sx={{ flex: 1, borderRadius: '10px', py: 1 }}>
            {mode === 'dark' ? <LightModeOutlined fontSize="small" /> : <DarkModeOutlined fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Sign out">
          <IconButton onClick={logout} size="small" sx={{
            flex: 1, borderRadius: '10px', py: 1, color: tokens.error,
            '&:hover': { background: tokens.errorBg },
          }}>
            <LogoutOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

export default function AdminLayout() {
  const muiTheme    = useTheme();
  const isMobile    = useMediaQuery(muiTheme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Desktop sidebar */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, border: 'none' },
          }}
        >
          <SidebarContent />
        </Drawer>
      )}

      {/* Mobile drawer */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
        >
          <SidebarContent onClose={() => setMobileOpen(false)} />
        </Drawer>
      )}

      {/* Main area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {isMobile && (
          <AppBar position="sticky">
            <Toolbar variant="dense">
              <IconButton edge="start" onClick={() => setMobileOpen(true)} color="inherit">
                <MenuOutlined />
              </IconButton>
              <Typography variant="subtitle1" fontWeight={700} sx={{ ml: 1 }}>
                Admin Console
              </Typography>
            </Toolbar>
          </AppBar>
        )}
        <Box sx={{ flex: 1, p: { xs: 2, sm: 3, md: 4 }, overflowY: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
