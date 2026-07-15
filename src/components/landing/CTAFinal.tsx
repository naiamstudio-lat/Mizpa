import { useTranslation } from 'react-i18next';

export function CTAFinal() {
  const { t } = useTranslation();

  return (
    <>
      {/* Mobile CTA form */}
      <section className="py-section-gap flex flex-col items-center justify-center text-center px-margin-mobile md:hidden">
        <div>
          <span className="font-label-mono text-label-mono text-primary mb-6 block tracking-widest">
            {t('cta.badge')}
          </span>
          <h2 className="font-display-lg text-display-lg-mobile md:text-headline-lg text-on-surface mb-12">
            {t('cta.title')}
          </h2>
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <input
              className="bg-black border border-white/10 px-6 py-4 w-full md:w-96 font-label-mono text-label-mono focus:border-primary focus:ring-0 focus:outline-none transition-all placeholder:text-white/20"
              placeholder={t('cta.placeholder')}
              type="email"
            />
            <button className="w-full md:w-auto bg-primary text-on-primary px-12 py-4 font-label-mono text-label-mono uppercase tracking-[0.2em] hover:scale-105 transition-all bloom-primary">
              {t('cta.button')}
            </button>
          </div>
          <p className="mt-8 font-label-mono text-[10px] text-white/20 uppercase tracking-widest">
            {t('cta.terms')}
          </p>
        </div>
      </section>

      {/* Desktop neural link section */}
      <section className="py-section-gap px-margin-desktop border-t border-white/5 hidden md:block">
        <div className="grid grid-cols-12 gap-gutter items-center">
          <div className="col-span-12 md:col-span-6">
            <h3 className="font-headline-lg text-headline-lg text-on-surface mb-6 italic">
              {t('cta.desktopTitle')}
            </h3>
            <p className="text-tertiary max-w-[400px] leading-relaxed">
              {t('cta.desktopDescription')}
            </p>
          </div>
          <div className="col-span-12 md:col-span-6 flex justify-end">
            <div className="relative w-full max-w-[300px] h-[300px] bg-surface-container-low rounded-full border border-primary/20 flex items-center justify-center group cursor-pointer">
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative font-label-mono text-label-mono text-primary text-center whitespace-pre-line">
                {t('cta.neuralLink')}
              </span>
              <div className="absolute w-full h-full border border-dashed border-primary/40 rounded-full animate-[spin_20s_linear_infinite]" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
