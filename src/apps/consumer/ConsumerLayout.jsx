import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BottomNav } from '@/components/nav/BottomNav';
import TopNav from '@/components/TopNav';
import { variants, safeMotion } from '@/lib/design/motion';

export default function ConsumerLayout() {
  const location = useLocation();

  const hideBottomNav = location.pathname.startsWith('/book-service/') ||
                        location.pathname.startsWith('/payment') ||
                        location.pathname.startsWith('/chat');

  return (
    <div className="font-inter min-h-screen bg-background">
      <TopNav />

      <div className="pt-[72px]">
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

      {!hideBottomNav && (
        <div className="lg:hidden">
          <BottomNav />
        </div>
      )}
    </div>
  );
}
