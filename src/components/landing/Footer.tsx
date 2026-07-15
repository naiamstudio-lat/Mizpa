import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="bg-surface border-t border-white/5 py-section-gap">
      <div className="grid grid-cols-12 gap-gutter px-margin-mobile md:px-margin-desktop w-full max-w-container-max mx-auto">
        {/* Brand */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="font-headline-sm text-headline-sm text-on-surface font-extrabold uppercase tracking-tighter">
            {t('footer.brand')}
          </div>
          <p className="font-label-mono text-label-mono text-tertiary max-w-[280px] leading-relaxed">
            {t('footer.tagline')}
          </p>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-secondary-container rounded-full animate-pulse" />
            <span className="font-label-mono text-[10px] text-on-surface-variant">{t('footer.nodeStatus')}</span>
          </div>
        </div>

        {/* Resources */}
        <div className="col-span-6 lg:col-span-2 space-y-4">
          <h4 className="font-label-mono text-label-mono text-primary font-bold">
            {t('footer.resources')}
          </h4>
          <div className="flex flex-col gap-3">
            <a href="#" className="font-label-mono text-label-mono text-tertiary hover:text-on-surface transition-colors duration-200">
              {t('footer.apiDocs')}
            </a>
            <a href="#" className="font-label-mono text-label-mono text-tertiary hover:text-on-surface transition-colors duration-200">
              {t('footer.systemStatus')}
            </a>
            <a href="#" className="font-label-mono text-label-mono text-tertiary hover:text-on-surface transition-colors duration-200">
              {t('footer.whitepaper')}
            </a>
          </div>
        </div>

        {/* Legal */}
        <div className="col-span-6 lg:col-span-2 space-y-4">
          <h4 className="font-label-mono text-label-mono text-primary font-bold">
            {t('footer.legal')}
          </h4>
          <div className="flex flex-col gap-3">
            <a href="#" className="font-label-mono text-label-mono text-tertiary hover:text-on-surface transition-colors duration-200">
              {t('footer.privacy')}
            </a>
            <a href="#" className="font-label-mono text-label-mono text-tertiary hover:text-on-surface transition-colors duration-200">
              {t('footer.terms')}
            </a>
          </div>
        </div>

        {/* Social + copyright */}
        <div className="col-span-12 lg:col-span-4 space-y-8 flex flex-col items-start lg:items-end">
          <div className="flex gap-6">
            <span className="material-symbols-outlined text-tertiary hover:text-primary transition-all cursor-pointer">alternate_email</span>
            <span className="material-symbols-outlined text-tertiary hover:text-primary transition-all cursor-pointer">terminal</span>
            <span className="material-symbols-outlined text-tertiary hover:text-primary transition-all cursor-pointer">hub</span>
          </div>
          <div className="font-label-mono text-label-mono text-tertiary text-left lg:text-right">
            {t('footer.copyright')}
          </div>
        </div>
      </div>
    </footer>
  );
}
