import { useTranslation } from 'react-i18next';

export function Testimonials() {
  const { t } = useTranslation();

  const items = t('testimonials.items', { returnObjects: true }) as Array<{quote: string; name: string; role: string; initials: string}>;

  return (
    <section className="py-24 px-10 max-w-[1100px] mx-auto">
      <p className="text-[11px] font-medium tracking-[2px] uppercase text-mint mb-3">{t('testimonials.label')}</p>
      <h2 className="font-display text-[clamp(28px,4vw,44px)] font-extrabold tracking-tight leading-[1.1] mb-4">{t('testimonials.title')}</h2>

      <div className="grid grid-cols-3 gap-4 mt-14">
        {items.map((item, i) => (
          <div key={i} className="bg-navy-mid border border-white/[0.06] rounded-[14px] p-6">
            <p className="text-[15px] text-slate-light leading-[1.65] mb-5 italic">
              <span className="text-mint text-2xl not-italic\">"</span>
              {item.quote}
            </p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-navy flex items-center justify-center text-sm font-semibold text-mint border border-mint/30">{item.initials}</div>
              <div>
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="text-xs text-slate mt-0.5">{item.role}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}