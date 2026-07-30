import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

/**
 * Guards the partner console.
 *
 * Every /api/partners/* endpoint answers 403 "Partners only" to a consumer, so
 * letting a non-partner into these pages just produced empty screens (and, before
 * the loaders were hardened, permanent spinners). Send them to onboarding
 * instead — that is the one partner surface an applicant is allowed to use.
 *
 * Admins keep access so they can support a partner. /partner/onboarding must
 * stay outside this guard or the redirect would loop.
 */
export default function PartnerOnly({ children }) {
  const { user } = useAuth();
  const role = user?.role;

  if (role && !['partner', 'admin', 'super_admin'].includes(role)) {
    return <Navigate to="/partner/onboarding" replace />;
  }

  return children;
}
