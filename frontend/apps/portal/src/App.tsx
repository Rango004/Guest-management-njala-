import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Login     from './pages/Login';
import Dashboard from './pages/Dashboard';
import { AppBackground } from '@congregation/ui';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('portal_token');
  return token ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <AppBackground>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={
            <PrivateRoute><Dashboard /></PrivateRoute>
          } />
        </Routes>
      </AnimatePresence>
    </AppBackground>
  );
}
