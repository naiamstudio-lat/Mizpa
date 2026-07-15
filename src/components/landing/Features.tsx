import { useTranslation } from 'react-i18next';

interface FeatureItem {
  number: string;
  title: string;
  description: string;
  image: string;
}

export function Features() {
  const { t } = useTranslation();
  const items = t('features.items', { returnObjects: true }) as FeatureItem[];

  return (
    <section className="py-section-gap px-margin-mobile md:px-margin-desktop w-full max-w-container-max mx-auto">
      <div className="flex flex-col gap-12 mb-24">
        <span className="font-label-mono text-label-mono text-primary">
          {t('features.label')}
        </span>
        <h2 className="font-headline-lg text-headline-lg text-on-surface">
          {t('features.title')}
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        {items.map((item: FeatureItem, i: number) => (
          <div
            key={i}
            className="group relative bg-surface-container/20 border border-white/5 p-12 hover:border-primary/30 transition-all duration-500 overflow-hidden"
          >
            <div className="absolute -right-4 -top-4 font-label-mono text-[120px] opacity-[0.03] select-none group-hover:opacity-[0.08] transition-opacity">
              {item.number}
            </div>
            <div className="mb-12">
              <span className="font-label-mono text-label-mono text-primary px-3 py-1 border border-primary/20">
                {item.number}
              </span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-6">
              {item.title}
            </h3>
            <p className="text-tertiary mb-8 leading-relaxed">
              {item.description}
            </p>
            <div className="w-full h-48 relative overflow-hidden border border-white/5">
              <img
                className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                src={item.image}
                alt=""
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
