import { useTranslation } from 'react-i18next';

interface Step {
  number: string;
  title: string;
  description: string;
}

export function Process() {
  const { t } = useTranslation();
  const steps = t('process.steps', { returnObjects: true }) as Step[];

  return (
    <section id="process" className="py-section-gap max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop">
      <div className="flex flex-col items-center text-center mb-24">
        <span className="font-label-mono text-label-mono text-primary mb-4 block">
          {t('process.label')}
        </span>
        <h2 className="font-headline-lg text-3xl md:text-headline-lg text-on-surface mb-6">
          {t('process.title')}
        </h2>
        <p className="text-on-surface-variant max-w-2xl leading-relaxed">
          {t('process.description')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        {steps.map((step: Step, i: number) => (
          <div
            key={i}
            className="p-8 border border-white/5 bg-surface-container-low"
          >
            <div className="mb-6 font-data-lg text-data-lg text-white/10">
              {step.number}
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-4">
              {step.title}
            </h3>
            <p className="text-on-surface-variant text-sm leading-relaxed">
              {step.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
