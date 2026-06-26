import { useTranslation } from 'react-i18next';

export function ScorePreview({ url }: { url: string }) {
  const { t } = useTranslation();

  const bars = [
    { label: t('score.speed'), width: '28%', colorClass: 'bg-red-500', textColor: 'text-red-500', value: '28%' },
    { label: t('score.structure'), width: '51%', colorClass: 'bg-amber-500', textColor: 'text-amber-500', value: '51%' },
    { label: t('score.metadata'), width: '19%', colorClass: 'bg-red-500', textColor: 'text-red-500', value: '19%' },
    { label: t('score.aiVisibility'), width: '12%', colorClass: 'bg-red-500', textColor: 'text-red-500', value: '12%' },
    { label: t('score.backlinks'), width: '44%', colorClass: 'bg-amber-500', textColor: 'text-amber-500', value: '44%' },
  ];

  return (
    <div id="score-preview" className="mt-16 mx-auto max-w-[640px] bg-navy-mid border border-white/[0.08] rounded-2xl overflow-hidden relative">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.03] border-b border-white/[0.06]">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
        <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
        <span className="text-xs text-slate ml-2">{url || 'analizando...'}</span>
      </div>

      {/* Body */}
      <div className="p-6">
        {bars.map((bar, i) => (
          <div key={i} className="flex items-center gap-4 mb-3.5">
            <span className="text-[13px] text-slate min-w-[160px]">{bar.label}</span>
            <div className="flex-1 h-2 bg-white/[0.06] rounded overflow-hidden">
              <div
                className={`h-full rounded ${bar.colorClass} transition-all duration-1000`}
                style={{ width: bar.width }}
              />
            </div>
            <span className={`text-[13px] font-medium min-w-[36px] text-right ${bar.textColor}`}>{bar.value}</span>
          </div>
        ))}

        {/* CTA row */}
        <div className="mt-5 pt-5 border-t border-white/[0.06] flex items-center justify-between">
          <div>
            <div className="font-display text-[48px] font-extrabold text-amber-500">
              34<span className="text-[22px] text-slate">/100</span>
            </div>
            <div className="text-xs text-slate mt-0.5">{t('score.totalLabel')}</div>
          </div>
          <button
            onClick={() => document.getElementById('audit')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="bg-mint/10 border border-mint/30 text-mint px-5 py-3 rounded-[10px] text-sm font-medium cursor-pointer transition-colors hover:bg-mint/20"
          >
            {t('score.unlock')}
          </button>
        </div>
      </div>
    </div>
  );
}