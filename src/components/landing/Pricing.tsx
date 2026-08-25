import { useTranslation } from 'react-i18next';

export function Pricing() {
  const { t } = useTranslation();
  const features = t('pricing.features', { returnObjects: true }) as string[];

  return (
    <section id="pricing" className="py-section-gap px-margin-mobile md:px-margin-desktop w-full max-w-container-max mx-auto text-center relative overflow-hidden">
      {/* Glow background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 space-y-8">
        <span className="font-label-mono text-label-mono text-primary">
          {t('pricing.label')}
        </span>
        <h2 className="font-headline-lg text-3xl md:text-headline-lg text-on-surface">
          {t('pricing.title')}
        </h2>

        <div className="inline-block relative">
          <div className="flex items-baseline justify-center gap-2 mb-12">
            <span className="font-display-lg text-display-lg text-on-surface">
              {t('pricing.price')}
            </span>
            <span className="font-headline-sm text-headline-sm text-tertiary">
              {t('pricing.period')}
            </span>
          </div>
        </div>

        <div className="max-w-[400px] mx-auto text-left space-y-4 mb-16">
          {features.map((feature: string, i: number) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-white/5">
              <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
              <span className="font-label-mono text-label-mono uppercase">{feature}</span>
            </div>
          ))}
        </div>

        <button className="bg-primary text-on-primary px-12 py-5 font-display-lg text-body-md font-bold rounded-lg hover:glow-primary transition-all duration-300">
          {t('pricing.cta')}
        </button>
      </div>
    </section>
  );
}
