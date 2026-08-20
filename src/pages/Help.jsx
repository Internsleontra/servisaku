import { motion } from 'framer-motion';
import { HelpCircle, MessageCircle, FileText, ChevronDown } from 'lucide-react';
import { safeMotion, variants } from '@/lib/design/motion';
import { useState } from 'react';
import { useTranslation } from '@/lib/useTranslation';

export default function Help() {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState(0);

  const faqs = [
    {
      q: "How do I book a service?",
      a: "Simply browse our service categories on the Explore page, select the service you need, choose a date and time, and proceed to secure checkout. A verified professional will be assigned to your booking."
    },
    {
      q: "Is my payment secure?",
      a: "Yes, absolutely. We use an escrow system meaning your payment is held securely by us and is only released to the service partner once the job is completed to your satisfaction."
    },
    {
      q: "What if I'm not satisfied with the service?",
      a: "We offer a 100% Satisfaction Guarantee. If you're unhappy with the work, you can file a dispute before releasing the escrow payment, and our support team will help resolve the issue or process a refund."
    },
    {
      q: "Are the service professionals verified?",
      a: "All our partners go through a strict vetting process including background checks, identity verification, and skill assessments before they are allowed to accept bookings on our platform."
    },
    {
      q: "Can I reschedule or cancel my booking?",
      a: "Yes, you can manage your bookings from your Profile > Bookings. Cancellations made 24 hours before the scheduled time are fully refunded."
    }
  ];

  return (
    <motion.div className="min-h-screen bg-bg pt-24 pb-16 font-inter" {...safeMotion(variants.fadeUp)}>
      <div className="max-w-4xl mx-auto px-6">
        
        <div className="text-center mb-16">
          <div className="w-16 h-16 bg-info-tint rounded-full flex items-center justify-center mx-auto mb-6">
            <HelpCircle className="w-8 h-8 text-info" />
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold text-ink tracking-tight mb-4">{t('Help &')}<span className="text-brand">{t('Support')}</span>
          </h1>
          <p className="text-lg text-ink-secondary max-w-xl mx-auto font-medium">{t('Find answers to common questions or reach out to our team for assistance.')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          <div className="bg-surface rounded-2xl p-6 border border-hairline/20 shadow-sm flex items-start gap-4">
            <div className="w-12 h-12 bg-success-tint text-success rounded-xl flex items-center justify-center shrink-0">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-ink mb-1">{t('Live chat support')}</h3>
              <p className="text-sm text-ink-secondary mb-3 font-medium">{t('Chat with our customer service team in real-time for immediate help.')}</p>
              <button className="text-brand text-sm font-semibold hover:underline">{t('Start chat')}</button>
            </div>
          </div>
          <div className="bg-surface rounded-2xl p-6 border border-hairline/20 shadow-sm flex items-start gap-4">
            <div className="w-12 h-12 bg-warning-tint text-warning rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-ink mb-1">{t('Detailed guides')}</h3>
              <p className="text-sm text-ink-secondary mb-3 font-medium">{t('Read our step-by-step guides on how to use all features of ServisAku.')}</p>
              <button className="text-brand text-sm font-semibold hover:underline">{t('Browse articles')}</button>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-ink mb-6">{t('Frequently asked questions')}</h2>
          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div 
                key={idx} 
                className={`bg-surface rounded-2xl border transition-colors overflow-hidden ${openFaq === idx ? 'border-brand/30 shadow-sm' : 'border-hairline/20'}`}
              >
                <button 
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left"
                >
                  <span className="font-semibold text-ink pr-4">{t(faq.q)}</span>
                  <ChevronDown className={`w-5 h-5 text-ink-tertiary transition-transform duration-300 ${openFaq === idx ? 'rotate-180 text-brand' : ''}`} />
                </button>
                <div 
                  className={`px-6 overflow-hidden transition-all duration-300 ease-in-out ${openFaq === idx ? 'max-h-40 pb-5 opacity-100' : 'max-h-0 opacity-0'}`}
                >
                  <p className="text-ink-secondary text-sm font-medium leading-relaxed">{t(faq.a)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </motion.div>
  );
}
