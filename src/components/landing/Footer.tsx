import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-white/[0.06] py-10 px-10 flex items-center justify-between flex-wrap gap-4 max-w-[1100px] mx-auto">
      <div className="font-display text-lg font-bold">
        Miz<span className="text-mint">pa</span>
      </div>
      <p className="text-[13px] text-slate">{t('footer.copyright')}</p>
      <div className="flex gap-5">
        <a href="#" className="text-[13px] text-slate no-underline hover:text-cream">{t('footer.privacy')}</a>
        <a href="#" className="text-[13px] text-slate no-underline hover:text-cream">{t('footer.terms')}</a>
        <a href="#" className="text-[13px] text-slate no-underline hover:text-cream">{t('footer.contact')}</a>
      </div>
    </footer>
  );
}