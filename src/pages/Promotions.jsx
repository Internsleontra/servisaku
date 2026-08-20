import { motion } from 'framer-motion';
import { Tag, Copy, CheckCircle2, Gift } from 'lucide-react';
import { safeMotion, variants } from '@/lib/design/motion';
import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from '@/lib/useTranslation';

export default function Promotions() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(null);

  const promos = [
    {
      id: 'cp1',
      code: 'WELCOME20',
      title: '20% Off Your First Booking',
      desc: 'New to ServisAku? Enjoy 20% off any home service for your very first booking.',
      valid: 'Valid for new users only. Max discount RM50.',
      color: 'text-brand',
      bg: 'bg-brand',
      lightBg: 'bg-brand-tint'
    },
    {
      id: 'cp2',
      code: 'RM50OFF',
      title: 'Flat RM50 Off',
      desc: 'Got a big job? Get a flat RM50 discount on any service booking over RM200.',
      valid: 'Min spend RM200 required.',
      color: 'text-info',
      bg: 'bg-info',
      lightBg: 'bg-info-tint'
    }
  ];

  const handleCopy = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    toast({
      title: t("Copied!"),
      description: `${code} copied to clipboard.`,
    });
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <motion.div className="min-h-screen bg-bg pt-24 pb-16 font-inter" {...safeMotion(variants.fadeUp)}>
      <div className="max-w-5xl mx-auto px-6">
        
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 bg-brand-tint rounded-full flex items-center justify-center">
            <Gift className="w-8 h-8 text-brand" />
          </div>
        </div>
        
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold text-ink tracking-tight mb-4">
            {t('Active')} <span className="text-brand">{t('Promotions')}</span>
          </h1>
          <p className="text-lg text-ink-secondary max-w-2xl mx-auto font-medium">{t('Save more on your home services with our latest deals and promo codes.')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {promos.map((promo) => (
            <div key={promo.id} className="bg-surface rounded-3xl border border-hairline/20 shadow-sm overflow-hidden flex flex-col">
              <div className={`${promo.lightBg} p-8 flex flex-col items-center text-center relative border-b border-dashed border-hairline/40`}>
                <Tag className={`w-8 h-8 ${promo.color} mb-4`} />
                <h3 className="text-2xl font-semibold text-ink mb-2">{t(promo.title)}</h3>
                <p className="text-ink-secondary text-sm font-medium">{t(promo.desc)}</p>
                
                {/* Cutout circles for coupon effect */}
                <div className="absolute -bottom-3 -left-3 w-6 h-6 bg-surface rounded-full border-t border-r border-hairline/20 transform rotate-45"></div>
                <div className="absolute -bottom-3 -right-3 w-6 h-6 bg-surface rounded-full border-t border-l border-hairline/20 transform -rotate-45"></div>
              </div>
              
              <div className="p-8 flex flex-col items-center bg-surface">
                <div className="text-xs text-ink-tertiary mb-4 font-semibold uppercase tracking-wider">{t(promo.valid)}</div>
                
                <div 
                  onClick={() => handleCopy(promo.code, promo.id)}
                  className="flex items-center gap-4 bg-raised shadow-[inset_0_0_0_1px_rgb(var(--hairline))] border-dashed border-hairline hover:border-brand/50 p-4 rounded-xl cursor-pointer group transition-colors w-full max-w-xs justify-between"
                >
                  <span className="font-mono font-semibold text-lg text-ink tracking-widest">{promo.code}</span>
                  {copied === promo.id ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <Copy className="w-5 h-5 text-ink-tertiary group-hover:text-brand transition-colors" />
                  )}
                </div>
                <p className="text-[10px] text-ink-tertiary mt-3 font-medium">{t('Click to copy code')}</p>
              </div>
            </div>
          ))}
        </div>

        {promos.length === 0 && (
          <div className="text-center py-20 bg-surface rounded-3xl border border-hairline/10 shadow-sm mt-8">
            <Tag className="w-12 h-12 text-ink-tertiary mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-ink mb-2">{t('No active promos')}</h3>
            <p className="text-ink-secondary font-medium">{t('Check back later for new deals and discounts!')}</p>
          </div>
        )}

      </div>
    </motion.div>
  );
}
