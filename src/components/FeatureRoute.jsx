import { Navigate } from 'react-router-dom';
import { isEnabled } from '@/lib/features';

/**
 * Route guard for feature-flagged surfaces.
 *
 * When the flag is off the route resolves to 404 rather than rendering the
 * page — so a flagged screen cannot be reached by URL, link or bookmark, and
 * leaks nothing about its existence. Turning the flag on in `.env.local`
 * restores it for development and testing.
 *
 * A redirect (rather than an inline "coming soon") is deliberate: these pages
 * render mock data, and a half-shown wallet balance is worse than a 404.
 */
export default function FeatureRoute({ flag, children }) {
  if (!isEnabled(flag)) return <Navigate to="/404" replace />;
  return children;
}
