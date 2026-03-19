import { Routes, Route, Navigate } from 'react-router-dom';
import Login      from './pages/Login';
import Scanner    from './pages/Scanner';
import ScanResult from './pages/ScanResult';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return localStorage.getItem('gate_token') ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/scan" element={<PrivateRoute><Scanner /></PrivateRoute>} />
      <Route path="/result" element={<PrivateRoute><ScanResult /></PrivateRoute>} />
    </Routes>
  );
}
