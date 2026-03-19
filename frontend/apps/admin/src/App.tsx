import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AppBackground } from '@congregation/ui';
import axios from 'axios';
import Login          from './pages/Login';
import Events         from './pages/Events';
import AdminLayout    from './layouts/AdminLayout';
import Dashboard      from './pages/Dashboard';
import Graduates      from './pages/Graduates';
import VehicleRequests from './pages/VehicleRequests';
import EventConfig    from './pages/EventConfig';
import Users          from './pages/Users';

// Decode JWT payload without verifying signature — just to check expiry client-side
function tokenIsValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!));
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('admin_token');
  if (!tokenIsValid(token)) {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

// Registers a global axios interceptor; any 401 from the API kicks the user
// back to login so they don't see a silent cascade of 401 errors.
function AuthInterceptor() {
  const navigate = useNavigate();
  useEffect(() => {
    const id = axios.interceptors.response.use(
      res => res,
      err => {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_user');
          navigate('/', { replace: true });
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <AppBackground>
      <AuthInterceptor />
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<Login />} />

          {/* Event selector — post-login landing */}
          <Route path="/events" element={
            <PrivateRoute><Events /></PrivateRoute>
          } />

          {/* Per-event management (sidebar layout) */}
          <Route path="/events/:eventId" element={
            <PrivateRoute><AdminLayout /></PrivateRoute>
          }>
            <Route index                element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard"     element={<Dashboard />} />
            <Route path="graduates"     element={<Graduates />} />
            <Route path="vehicles"      element={<VehicleRequests />} />
            <Route path="config"        element={<EventConfig />} />
            <Route path="users"         element={<Users />} />
          </Route>
        </Routes>
      </AnimatePresence>
    </AppBackground>
  );
}
