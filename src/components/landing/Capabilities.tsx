import { useTranslation } from 'react-i18next';

export function Capabilities() {
  const { t } = useTranslation();
  const items = t('capabilities.items', { returnObjects: true }) as string[];

  return (
    <section
      id="capabilities"
      className="py-section-gap max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop grid grid-cols-1 md:grid-cols-2 gap-gutter items-center"
    >
      <div>
        <span className="font-label-mono text-label-mono text-primary mb-4 block">
          {t('capabilities.label')}
        </span>
        <h2 className="font-headline-lg text-3xl md:text-headline-lg text-on-surface mb-6">
          {t('capabilities.title')}
        </h2>
        <p className="text-on-surface-variant max-w-md mb-8 leading-relaxed">
          {t('capabilities.description')}
        </p>
        <ul className="space-y-4 font-label-mono text-label-mono">
          {items.map((item: string, i: number) => (
            <li
              key={i}
              className={`flex items-center gap-3 ${i < items.length - 1 ? 'border-b border-white/5 pb-4' : ''}`}
            >
              <span className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-primary animate-pulse' : 'bg-white/20'}`} />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Scanner terminal visual */}
      <div className="relative">
        <div className="aspect-square bg-surface-container border border-white/5 overflow-hidden flex items-center justify-center">
          <div className="w-3/4 h-3/4 border border-primary/20 relative">
            <div className="absolute inset-0 bg-primary/5" />
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-full bg-white/10" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-px w-full bg-white/10" />
            <div className="p-8 font-label-mono text-[10px] text-primary/60 overflow-hidden leading-relaxed">
              SCANNING_MODULE_ACTIVE...<br />
              &gt; DOM_TREE_REPLICATION: SUCCESS<br />
              &gt; SEMANTIC_MAPPING: 98.4%<br />
              &gt; AI_READINESS_SCORE: OPTIMAL<br />
              &gt; REDUNDANCY_CHECK: NONE<br />
              <span className="animate-pulse">_</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
