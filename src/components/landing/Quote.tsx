import { useTranslation } from 'react-i18next';

export function Quote() {
  const { t } = useTranslation();

  return (
    <section className="h-[60vh] relative border-y border-white/10 overflow-hidden flex items-center justify-center bg-surface-container-lowest">
      <div className="absolute inset-0 ethereal-gradient" />
      <div className="max-w-2xl text-center relative z-20 px-margin-mobile">
        <h2 className="font-headline-lg text-3xl md:text-headline-lg text-on-surface mb-8 italic">
          &ldquo;{t('quote.text')}&rdquo;
        </h2>
        <div className="w-24 h-px bg-primary mx-auto mb-8" />
        <p className="font-label-mono text-label-mono uppercase tracking-[0.2em] text-white/30">
          {t('quote.author')}
        </p>
      </div>
    </section>
  );
}
