import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from '@/components/nav/BottomNav';
import PartnerTopNav from './PartnerTopNav';
import PartnerSidebar from './PartnerSidebar';

export default function PartnerLayout() {
  const location = useLocation();

  const hideBottomNav = location.pathname.startsWith('/partner/job/') ||
                        location.pathname.startsWith('/chat') ||
                        location.pathname.startsWith('/partner/onboarding');

  return (
    <div className="font-inter min-h-screen bg-bg">
      {/* Desktop: persistent sidebar rail */}
      <PartnerSidebar />

      {/* Mobile: top bar (sidebar is hidden below lg) */}
      <div className="lg:hidden">
        <PartnerTopNav />
      </div>

      {/* Main content — offset by the top bar on mobile, by the sidebar on desktop */}
      <div className="pt-[72px] lg:pt-0 lg:pl-64">
        <div
          className="mx-auto w-full"
          style={{ paddingBottom: hideBottomNav ? '0' : 'var(--nav-height, 4rem)' }}
        >
          <Outlet />
        </div>
      </div>

      {!hideBottomNav && (
        <div className="lg:hidden">
          <BottomNav />
        </div>
      )}
    </div>
  );
}
