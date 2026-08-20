import { motion } from 'framer-motion';
import { Briefcase, TrendingUp, ShieldCheck, Wallet, ArrowRight } from 'lucide-react';
import { safeMotion, variants } from '@/lib/design/motion';
import { useTranslation } from '@/lib/useTranslation';

export default function ForBusiness() {
  const { t } = useTranslation();
  const benefits = [
    {
      title: 'Expand Your Reach',
      desc: 'Connect with thousands of customers actively looking for home services in your area.',
      icon: TrendingUp,
      color: 'text-info',
      bg: 'bg-info-tint',
    },
    {
      title: 'Guaranteed Payments',
      desc: 'Our secure escrow system ensures you get paid automatically and on time upon job completion.',
      icon: Wallet,
      color: 'text-success',
      bg: 'bg-success-tint',
    },
    {
      title: 'Built-in Trust',
      desc: 'Leverage our platform\'s reputation. Background checks and reviews build trust with new clients.',
      icon: ShieldCheck,
      color: 'text-star',
      bg: 'bg-warning-tint',
    },
    {
      title: 'Manage Everything',
      desc: 'Use our Partner Dashboard to track jobs, manage your schedule, and view earnings in one place.',
      icon: Briefcase,
      color: 'text-chat',
      bg: 'bg-chat-tint',
    }
  ];

  return (
    <motion.div className="min-h-screen bg-bg pt-24 pb-16 font-inter" {...safeMotion(variants.fadeUp)}>
      <div className="max-w-6xl mx-auto px-6">
        
        {/* Hero Section */}
        <div className="flex flex-col lg:flex-row items-center gap-12 mb-20">
          <div className="flex-1 text-center lg:text-left">
            <h1 className="text-4xl md:text-5xl font-semibold text-ink tracking-tight mb-6">
              {t('Grow Your Business with')} <span className="text-brand">ServisAku</span>
            </h1>
            <p className="text-lg text-ink-secondary mb-8 font-medium max-w-xl mx-auto lg:mx-0">
              {t("Join Malaysia's fastest-growing home services platform. We provide the customers, the tools, and the secure payments—you provide the expertise.")}
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
              <a href="/partner/onboarding" className="bg-brand text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-brand/90 transition-colors shadow-e1 flex items-center gap-2">
                {t('Become a Partner')} <ArrowRight className="w-5 h-5" />
              </a>
              <a href="/login" className="bg-surface border border-hairline/20 text-ink px-8 py-4 rounded-xl font-semibold text-lg hover:bg-raised transition-colors shadow-sm">{t('Login')}</a>
            </div>
          </div>
          <div className="flex-1 w-full relative">
            <div className="w-full aspect-square md:aspect-[4/3] bg-brand-tint rounded-3xl overflow-hidden relative">
              <img src="/img/hero-tech.jpg" alt={t('Partner Worker')} className="w-full h-full object-cover object-top mix-blend-multiply opacity-90" />
            </div>
          </div>
        </div>

        {/* Benefits Section */}
        <div className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-semibold text-ink mb-4">{t('Why Partner With Us?')}</h2>
            <p className="text-ink-secondary font-medium max-w-2xl mx-auto">{t('We handle the heavy lifting of marketing and payments so you can focus on what you do best—delivering great service.')}</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, idx) => (
              <div key={idx} className="bg-surface border border-hairline/10 p-6 rounded-2xl shadow-e1 hover:shadow-e2 transition-all">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${benefit.bg} ${benefit.color} mb-4`}>
                  <benefit.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold text-ink mb-2">{t(benefit.title)}</h3>
                <p className="text-sm font-medium text-ink-secondary leading-relaxed">{t(benefit.desc)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="bg-ink dark:bg-raised text-white rounded-3xl p-12 text-center shadow-float">
          <h2 className="text-3xl font-semibold mb-4">{t('Ready to boost your earnings?')}</h2>
          <p className="text-ink-tertiary mb-8 max-w-xl mx-auto font-medium">{t("Signing up is free and only takes a few minutes. We'll review your application and get you on board.")}</p>
          <a href="/partner/onboarding" className="inline-block bg-brand text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-brand/90 transition-colors shadow-lg">{t('Apply Now')}</a>
        </div>

      </div>
    </motion.div>
  );
}
