import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BottomNav } from '@/components/nav/BottomNav';
import TopNav from '@/components/TopNav';
import { variants, safeMotion } from '@/lib/design/motion';
import { ChatbotWidget } from '@/components/chatbot/ChatbotWidget';
import SiteFooter from '@/components/site/SiteFooter';

export default function ConsumerLayout() {
  const location = useLocation();

  const hideBottomNav = location.pathname.startsWith('/book-service/') ||
                        location.pathname.startsWith('/payment') ||
                        location.pathname.startsWith('/chat');

  return (
    <div className="font-inter min-h-screen bg-bg">
      <TopNav />

      <div className="pt-[76px]">
        <div
          className="mx-auto w-full"
          style={{ paddingBottom: hideBottomNav ? '0' : 'var(--nav-height, 4rem)' }}
        >
          {/* Animate every route change (respects prefers-reduced-motion). */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} {...safeMotion(variants.fadeUp)}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Site footer — omitted on the focused flows that own the bottom edge
          with a sticky action bar (booking wizard, payment, chat). */}
      {!hideBottomNav && <SiteFooter />}

      {!hideBottomNav && (
        <div className="lg:hidden">
          <BottomNav />
        </div>
      )}

      {/* Available on every consumer page. The conversation is created lazily on
          the first message, so an unopened bubble costs nothing. */}
      <ChatbotWidget role="consumer" />
    </div>
  );
}
