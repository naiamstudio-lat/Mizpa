import { useTranslation } from 'react-i18next';

export function HowItWorks() {
  const { t } = useTranslation();
  const icons = ['🔍', '📋', '⚡'];

  const steps = t('howItWorks.steps', { returnObjects: true }) as Array<{num: string, title: string, description: string}>;

  return (
    <section className="py-24 px-10 max-w-[1100px] mx-auto border-t border-white/5" id="como-funciona">
      <p className="text-[11px] font-medium tracking-[2px] uppercase text-mint mb-3">{t('howItWorks.label')}</p>
      <h2 className="font-display text-[clamp(28px,4vw,44px)] font-extrabold tracking-tight leading-[1.1] mb-4">{t('howItWorks.title')}</h2>
      <p className="text-[17px] text-slate max-w-[520px] leading-relaxed">{t('howItWorks.subtitle')}</p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-8 mt-14">
        {steps.map((step, i) => (
          <div
            key={i}
            className="p-7 bg-navy-mid rounded-[14px] border border-white/[0.06] relative transition-colors hover:border-mint/20"
          >
            <span className="font-display text-[11px] font-bold tracking-[2px] text-mint mb-4 block">{step.num}</span>
            <div className="w-10 h-10 rounded-[10px] bg-emerald/10 border border-emerald/20 flex items-center justify-center text-xl mb-4">{icons[i]}</div>
            <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
            <p className="text-sm text-slate leading-relaxed">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}