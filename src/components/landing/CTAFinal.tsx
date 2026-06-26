import { useTranslation } from 'react-i18next';

export function CTAFinal() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-[1100px] px-10 pb-24">
      <div className="bg-gradient-to-br from-emerald/[0.12] to-mint/[0.05] border border-mint/20 rounded-3xl py-[72px] px-12 text-center">
        <h2 className="font-display text-[clamp(28px,4vw,48px)] font-extrabold tracking-tight mb-4 whitespace-pre-line">{t('ctaFinal.title')}</h2>
        <p className="text-[17px] text-slate mb-9">{t('ctaFinal.subtitle')}</p>
        <div className="flex gap-3 justify-center flex-wrap">
          <a href="/login" className="bg-mint text-navy px-9 py-4 rounded-xl text-base font-semibold no-underline transition-opacity hover:opacity-90">{t('ctaFinal.primary')}</a>
          <a href="#precios" className="bg-transparent border border-white/20 text-cream px-9 py-4 rounded-xl text-base font-medium no-underline transition-colors hover:border-white/40">{t('ctaFinal.secondary')}</a>
        </div>
      </div>
    </div>
  );
}