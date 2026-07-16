import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthModal } from '../../hooks/useAuthModal';

export function Navbar() {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { open: openAuth } = useAuthModal();

  return (
    <>
      <header className="fixed top-0 w-full z-50 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <nav className="flex justify-between items-center px-margin-mobile md:px-margin-desktop py-grid-unit w-full max-w-container-max mx-auto h-20">
          <div className="flex items-center gap-4">
            <span className="font-display-lg text-headline-sm tracking-tighter text-on-surface uppercase font-extrabold">
              Mizpa
            </span>
            <span className="hidden md:inline font-label-mono text-label-mono text-primary opacity-60">
              {t('nav.badge')}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#capabilities" className="font-body-md text-body-md text-primary font-bold hover:text-primary transition-colors duration-300">
              {t('nav.capabilities')}
            </a>
            <a href="#process" className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors duration-300">
              {t('nav.process')}
            </a>
            <a href="#" className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors duration-300">
              {t('nav.infrastructure')}
            </a>
            <a href="#" className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors duration-300">
              {t('nav.security')}
            </a>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={openAuth}
              className="hidden lg:block font-label-mono text-label-mono text-tertiary hover:text-on-surface transition-colors cursor-pointer bg-transparent border-none"
            >
              {t('nav.signin')}
            </button>
            <button
              onClick={openAuth}
              className="bg-primary text-on-primary px-6 py-2 font-body-md font-bold rounded-lg hover:glow-primary transition-all duration-300 transform hover:-translate-y-0.5 active:scale-95 cursor-pointer border-none"
            >
              {t('nav.cta')}
            </button>
            <button
              className="md:hidden text-primary p-2"
              onClick={() => setDrawerOpen(true)}
              aria-label={t('nav.menu')}
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile drawer */}
      <aside
        className={`h-full w-80 fixed right-0 top-0 z-[60] bg-surface-container-lowest/95 backdrop-blur-2xl border-l border-white/10 transition-all duration-300 ease-in-out flex flex-col px-margin-mobile gap-4 ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex justify-between items-center mb-8 pt-8">
          <span className="font-headline-sm text-xl font-bold text-primary">SYSTEM_MENU</span>
          <button onClick={() => setDrawerOpen(false)}>
            <span className="material-symbols-outlined text-on-surface">close</span>
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <a
            href="#capabilities"
            className="flex items-center gap-4 p-4 font-label-mono text-label-mono text-primary border-r-2 border-primary bg-primary/5"
            onClick={() => setDrawerOpen(false)}
          >
            <span className="material-symbols-outlined">layers</span>
            {t('nav.capabilities')}
          </a>
          <a
            href="#process"
            className="flex items-center gap-4 p-4 font-label-mono text-label-mono text-on-surface-variant hover:bg-white/5"
            onClick={() => setDrawerOpen(false)}
          >
            <span className="material-symbols-outlined">schema</span>
            {t('nav.process')}
          </a>
          <a
            href="#"
            className="flex items-center gap-4 p-4 font-label-mono text-label-mono text-on-surface-variant hover:bg-white/5"
            onClick={() => setDrawerOpen(false)}
          >
            <span className="material-symbols-outlined">dns</span>
            {t('nav.infrastructure')}
          </a>
          <a
            href="#"
            className="flex items-center gap-4 p-4 font-label-mono text-label-mono text-on-surface-variant hover:bg-white/5"
            onClick={() => setDrawerOpen(false)}
          >
            <span className="material-symbols-outlined">security</span>
            {t('nav.security')}
          </a>
        </div>
      </aside>
    </>
  );
}
