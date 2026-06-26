import { useTranslation } from 'react-i18next';

export function Navbar() {
  const { t } = useTranslation();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-10 py-[18px] bg-navy/85 backdrop-blur-[12px] border-b border-white/5">
      <a href="#" className="flex items-center gap-2.5 no-underline">
        <div className="w-9 h-9 bg-navy-mid rounded-lg flex items-center justify-center border border-mint/30">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="8" r="5.5" stroke="#6EE7B7" stroke-width="1.2" />
            <path d="M7 8l2 2 4-4" stroke="#6EE7B7" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M6 15l4-2.5 4 2.5" stroke="#94A3B8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" />
            <line x1="10" y1="12.5" x2="10" y2="17" stroke="#94A3B8" stroke-width="1" stroke-linecap="round" />
          </svg>
        </div>
        <span className="font-display text-xl font-bold text-cream">
          Miz<span className="text-mint">pa</span>
        </span>
      </a>
      <div className="flex gap-8 items-center">
        <a href="#como-funciona" className="text-slate text-sm no-underline transition-colors hover:text-cream">
          {t('nav.howItWorks')}
        </a>
        <a href="#precios" className="text-slate text-sm no-underline transition-colors hover:text-cream">
          {t('nav.pricing')}
        </a>
        <a href="#faq" className="text-slate text-sm no-underline transition-colors hover:text-cream">
          {t('nav.faq')}
        </a>
        <a href="/login" className="bg-mint text-navy px-5 py-2 rounded-lg text-sm font-semibold no-underline transition-opacity hover:opacity-90">
          {t('nav.cta')}
        </a>
      </div>
    </nav>
  );
}