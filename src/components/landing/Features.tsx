import { useTranslation } from 'react-i18next';

export function Features() {
  const { t } = useTranslation();

  const items = t('features.items', { returnObjects: true }) as Array<{icon: string; title: string; description: string; note?: string}>;

  return (
    <section className="py-24 px-10 max-w-[1100px] mx-auto">
      <p className="text-[11px] font-medium tracking-[2px] uppercase text-mint mb-3">{t('features.label')}</p>
      <h2 className="font-display text-[clamp(28px,4vw,44px)] font-extrabold tracking-tight leading-[1.1] mb-4">{t('features.title')}</h2>

      <div className="grid grid-cols-2 gap-4 mt-14">
        {/* Featured card */}
        <div className="col-span-2 p-7 bg-gradient-to-br from-emerald/10 to-mint/[0.04] rounded-[14px] border border-mint/[0.15] grid grid-cols-2 gap-8 items-center transition-colors hover:border-mint/20">
          <div>
            <div className="text-[28px] mb-3.5">{items[0].icon}</div>
            <h3 className="text-lg font-semibold mb-2">{items[0].title}</h3>
            <p className="text-sm text-slate leading-relaxed" dangerouslySetInnerHTML={{ __html: items[0].description }} />
            {items[0].note && <p className="text-[13px] text-slate mt-3">{items[0].note}</p>}
          </div>
          <div className="bg-navy rounded-[10px] p-5 border border-white/[0.06]">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-2 h-2 rounded-full bg-mint shrink-0" />
              <span className="text-xs text-slate flex-1">Agente de auditoría</span>
              <div className="h-1.5 rounded-sm bg-emerald w-full" />
            </div>
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span className="text-xs text-slate flex-1">Agente de contenido</span>
              <div className="h-1.5 rounded-sm bg-amber-500 w-[75%]" />
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-slate shrink-0" />
              <span className="text-xs text-slate flex-1">Agente de réplica</span>
              <div className="h-1.5 rounded-sm bg-slate-light w-[45%]" />
            </div>
            <div className="mt-3.5 pt-3.5 border-t border-white/[0.06]">
              <span className="text-[11px] text-mint">● Procesando tudominio.com...</span>
            </div>
          </div>
        </div>

        {/* Regular cards */}
        {items.slice(1).map((item, i) => (
          <div
            key={i}
            className="p-7 bg-navy-mid rounded-[14px] border border-white/[0.06] transition-colors hover:border-mint/20"
          >
            <div className="text-[28px] mb-3.5">{item.icon}</div>
            <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
            <p className="text-sm text-slate leading-relaxed">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}