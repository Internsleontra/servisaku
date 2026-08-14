import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { servisaku } from '@/api/servisakuClient';
import { auditLog } from '@/lib/security';

export default function ProtectedRoute({ children, roles }) {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    servisaku.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg">
        <div className="size-8 animate-spin rounded-full border-4 border-hairline border-t-brand" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/otp-login" replace state={{ from: window.location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    auditLog('ACCESS_DENIED', { required: roles, actual: user.role, path: window.location.pathname });
    return <Navigate to="/" replace />;
  }

  return children;
}