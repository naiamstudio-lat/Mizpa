import { useTranslation } from 'react-i18next';

export function Pricing() {
  const { t } = useTranslation();

  const plans = t('pricing.plans', { returnObjects: true }) as Array<{name: string; price: string; period: string; description: string; badge?: string; features: string[]; cta: string; featured: boolean}>;

  return (
    <section className="py-24 px-10 max-w-[1100px] mx-auto" id="precios">
      <p className="text-[11px] font-medium tracking-[2px] uppercase text-mint mb-3">{t('pricing.label')}</p>
      <h2 className="font-display text-[clamp(28px,4vw,44px)] font-extrabold tracking-tight leading-[1.1] mb-4">{t('pricing.title')}</h2>
      <p className="text-[17px] text-slate max-w-[520px] leading-relaxed">{t('pricing.subtitle')}</p>

      <div className="grid grid-cols-3 gap-4 mt-14">
        {plans.map((plan, i) => (
          <div
            key={i}
            className={`bg-navy-mid border rounded-2xl p-8 relative transition-colors hover:border-mint/20 ${
              plan.featured
                ? 'border-mint bg-gradient-to-br from-emerald/10 to-navy-mid'
                : 'border-white/[0.08]'
            }`}
          >
            {plan.badge && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-mint text-navy text-[11px] font-semibold px-3.5 py-1 rounded-full tracking-wide whitespace-nowrap">
                {plan.badge}
              </div>
            )}
            <p className="text-sm font-medium text-slate mb-2">{plan.name}</p>
            <div className="font-display text-[42px] font-extrabold mb-1">
              {plan.price}
              <span className="text-lg font-medium text-slate">{plan.period}</span>
            </div>
            <p className="text-[13px] text-slate mb-6">{plan.description}</p>
            <ul className="list-none mb-7">
              {plan.features.map((feature, j) => (
                <li
                  key={j}
                  className="text-sm text-slate-light py-1.5 border-b border-white/[0.04] flex gap-2.5 items-start"
                >
                  <span className="text-mint shrink-0 font-semibold">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            <a
              href="/login"
              className={`block w-full text-center py-3 rounded-[10px] text-sm font-semibold no-underline transition-opacity hover:opacity-85 ${
                plan.featured
                  ? 'bg-mint text-navy'
                  : 'border border-white/15 text-cream'
              }`}
            >
              {plan.cta}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}