import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from '@/components/nav/BottomNav';
import PartnerTopNav from './PartnerTopNav';
import PartnerSidebar from './PartnerSidebar';
import { ChatbotWidget } from '@/components/chatbot/ChatbotWidget';
import { PartnerNotificationsProvider } from './PartnerNotifications';

export default function PartnerLayout() {
  const location = useLocation();

  const hideBottomNav = location.pathname.startsWith('/partner/job/') ||
                        location.pathname.startsWith('/chat') ||
                        location.pathname.startsWith('/partner/onboarding');

  return (
    // The unread count is fetched ONCE here and shared by the sidebar, the top
    // nav and any page bell, instead of each mounting its own copy of the hook.
    <PartnerNotificationsProvider>
    <div className="font-inter min-h-screen bg-bg">
      {/* Desktop: persistent sidebar rail */}
      <PartnerSidebar />

      {/* Mobile: top bar (sidebar is hidden below lg) */}
      <div className="lg:hidden">
        <PartnerTopNav />
      </div>

      {/* Main content — offset by the top bar on mobile, by the sidebar on desktop */}
      {/* Desktop content column — 1240px, matching the kit's content column and
          the consumer WebSection. Centering only: pages still own their own
          padding (they set `min-h-screen bg-bg` plus inner px-*), so adding it
          here too would double-pad every page. Padding consolidates into the
          shell as each page is migrated. */}
      <div className="pt-[72px] lg:pt-0 lg:pl-64">
        <div
          className="mx-auto w-full max-w-[1240px]"
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

      {/* Partner-audience assistant: own schedule, earnings, commission and the
          message drafter. Same engine, different corpus and tools. */}
      <ChatbotWidget role="partner" title="Partner Assistant" />
    </div>
    </PartnerNotificationsProvider>
  );
}
