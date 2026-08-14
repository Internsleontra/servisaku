import { Link } from 'react-router-dom';
import { Instagram, Facebook, Linkedin } from 'lucide-react';

/**
 * Navy site footer — ports WebFooter from the design system's consumer website
 * kit (ui_kits/consumer_web/WebShell.jsx).
 *
 * This closes the longest-standing gap in the consumer app: there was no footer
 * at all, and therefore no route to Terms, Privacy, refunds or contact from any
 * page — on a product that takes payments.
 *
 * Link targets are wired to real routes where they exist. The four that don't
 * (About / Careers / Press, and the per-category shortcuts) point at the closest
 * live destination rather than "#", so nothing here is a dead control.
 */
const SOCIALS = [
  { Icon: Instagram, label: 'Instagram' },
  { Icon: Facebook, label: 'Facebook' },
  { Icon: Linkedin, label: 'LinkedIn' },
];

const COLUMNS = [
  {
    head: 'Services',
    items: [
      { label: 'Cleaning', to: '/catalog/cleaning' },
      { label: 'AC Services', to: '/catalog/ac-services' },
      { label: 'Beauty & Wellness', to: '/catalog/beauty-wellness-women' },
      { label: 'Plumbing', to: '/catalog/plumbing' },
      { label: 'Pest Control', to: '/catalog/pest-control' },
      { label: 'All 71 services', to: '/catalog' },
    ],
  },
  {
    head: 'Company',
    items: [
      { label: 'About ServisAku', to: '/how-it-works' },
      { label: 'Partner with us', to: '/business' },
      { label: 'Promotions', to: '/promos' },
    ],
  },
  {
    head: 'Support',
    items: [
      { label: 'Help centre', to: '/help' },
      { label: 'Refunds & disputes', to: '/refunds' },
      { label: 'Terms of service', to: '/legal' },
      { label: 'Privacy notice', to: '/legal' },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="bg-navy-ink text-white/70">
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-14 md:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <img
              src="/img/brand/logo-wordmark-white.png"
              alt="ServisAku"
              className="h-5 w-auto"
            />
            <p className="mt-3.5 max-w-[260px] text-caption font-normal">
              Verified home-service professionals across Malaysia. 11 categories,
              71 services, escrow-protected payments.
            </p>
            <div className="mt-[18px] flex gap-2.5">
              {SOCIALS.map(({ Icon, label }) => (
                <span
                  key={label}
                  aria-label={label}
                  className="grid size-[34px] place-items-center rounded-full bg-white/10 text-white"
                >
                  <Icon className="size-4" />
                </span>
              ))}
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.head}>
              <div className="sa-caps mb-3 text-white/45">{col.head}</div>
              <div className="flex flex-col gap-2">
                {col.items.map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    className="flex min-h-11 items-center text-caption font-normal text-white/70 transition-colors hover:text-white md:min-h-0 md:py-0.5"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-9 flex flex-col gap-2 border-t border-white/15 px-0 py-[18px] text-xs sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} ServisAku Sdn Bhd</span>
          <span className="sm:ml-auto">
            Available in KL · PJ · JB · Penang · Shah Alam
          </span>
        </div>
      </div>
    </footer>
  );
}
