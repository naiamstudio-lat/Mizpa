import { useTranslation } from 'react-i18next';
import { Trans } from 'react-i18next';

export function Hero() {
  const { t } = useTranslation();

  return (
    <section
      className="relative min-h-[95vh] flex flex-col justify-center overflow-hidden"
      style={{ backgroundColor: '#000000' }}
    >
      {/* Background image */}
      <div className="absolute inset-0 w-full h-full pointer-events-none z-0 max-md:scale-[0.85]" style={{ clipPath: 'inset(0 4% 0 0)' }}>
        <img
          className="w-full h-full object-cover object-right opacity-60 md:opacity-80 mix-blend-screen md:mix-blend-normal hero-parallax-img"
          src="https://lh3.googleusercontent.com/aida/AP1WRLviGQbl6JkUEZz6WL-UCeZVt7yQJsW7qcfd6airLtFV9xs81Qfe_JyQKV3xxnSfgug1J4RGnwTqinCUjVB2USWX1HXkAHa_6ZJbJegUad9Rrik_etx1Q9Z7QrgP0lY5ce3k7ME-l3cp3u1pwrXj2_PKt5_Aq3NdkoG3CJpo0YVfy6-PgQZG52AHVoj_YEPi2u4_xmv_7jJTh_NTtAGzfQNlMTOLjZxqEAdYXLnBlXrNcSYG9eQeicmZp50q=s0"
          alt=""
          style={{ objectPosition: 'right center' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent md:hidden" />
      </div>

      {/* Content */}
      <div className="relative z-20 w-full max-w-container-max mx-auto">
        {/* Mobile layout */}
        <div className="flex flex-col items-center text-center md:hidden px-margin-mobile min-h-[95vh] justify-center">
          <div className="mb-6">
            <span className="font-label-mono text-label-mono text-primary tracking-[0.3em] uppercase">
              {t('hero.badge')}
            </span>
          </div>

          <h1 className="font-display-lg text-display-lg-mobile text-on-surface leading-tight mb-8">
            <Trans
              i18nKey="hero.title"
              components={{ italic: <span className="text-primary italic" /> }}
            />
          </h1>

          <div className="flex flex-col gap-6 justify-center items-center w-full max-w-md">
            <button className="bg-white text-black px-10 py-4 font-label-mono text-label-mono uppercase tracking-widest hover:scale-105 transition-all bloom-primary w-full">
              {t('hero.button')}
            </button>
            <div className="relative w-full group">
              <div className="absolute inset-y-0 left-4 flex items-center">
                <span className="material-symbols-outlined text-white/40">language</span>
              </div>
              <input
                className="w-full bg-white/5 border border-white/10 font-label-mono text-white px-12 py-4 focus:border-primary focus:ring-0 focus:outline-none placeholder:text-white/20 transition-all"
                placeholder={t('hero.placeholder')}
                type="text"
              />
              <div className="absolute inset-y-0 right-4 flex items-center">
                <span className="text-white/20 font-label-mono text-[10px]">[0x001]</span>
              </div>
            </div>
          </div>

          {/* Mobile stats */}
          <div className="flex gap-4 sm:gap-8 justify-center pt-12 mt-12 border-t border-white/5 w-full">
            <div className="text-center min-w-0">
              <div className="font-label-mono text-xl sm:text-data-lg text-on-surface">{t('hero.stats1Value')}</div>
              <div className="font-label-mono text-[10px] text-tertiary uppercase tracking-widest mt-2 whitespace-nowrap">{t('hero.stats1Label')}</div>
            </div>
            <div className="text-center min-w-0">
              <div className="font-label-mono text-xl sm:text-data-lg text-on-surface">{t('hero.stats2Value')}</div>
              <div className="font-label-mono text-[10px] text-tertiary uppercase tracking-widest mt-2 whitespace-nowrap">{t('hero.stats2Label')}</div>
            </div>
            <div className="text-center min-w-0">
              <div className="font-label-mono text-xl sm:text-data-lg text-on-surface">{t('hero.stats3Value')}</div>
              <div className="font-label-mono text-[10px] text-tertiary uppercase tracking-widest mt-2 whitespace-nowrap">{t('hero.stats3Label')}</div>
            </div>
          </div>

          {/* Scroll indicator (mobile only) */}
          <div className="flex flex-col items-center gap-4 opacity-50 mt-16">
            <span className="font-label-mono text-[10px] tracking-widest uppercase">{t('hero.scroll')}</span>
            <div className="w-[1px] h-12 bg-gradient-to-b from-primary to-transparent"></div>
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden md:flex flex-col justify-center items-start max-w-[800px] space-y-10 px-margin-desktop min-h-[95vh]">
          <div className="flex items-center gap-3">
            <span className="w-8 h-[1px] bg-primary" />
            <span className="font-label-mono text-label-mono tracking-widest text-primary uppercase">
              {t('hero.badge')}
            </span>
          </div>

          <h1 className="font-display-lg text-display-lg text-on-surface leading-tight">
            <Trans
              i18nKey="hero.title"
              components={{ italic: <span className="text-primary italic" /> }}
            />
          </h1>

          <p className="font-body-md text-headline-sm text-tertiary max-w-[600px] leading-relaxed">
            {t('hero.description')}
          </p>

          <div className="flex flex-col md:flex-row gap-4 w-full max-w-[640px]">
            <div className="relative flex-grow group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline-variant group-focus-within:text-primary transition-colors">
                public
              </span>
              <input
                className="w-full bg-surface-container-low border border-white/10 px-12 py-5 font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all rounded-lg placeholder:text-outline-variant"
                placeholder={t('hero.placeholder')}
                type="text"
              />
            </div>
            <button className="bg-on-surface text-background px-10 py-5 font-display-lg text-body-md font-bold rounded-lg hover:glow-neon-pink transition-all duration-300 transform hover:-translate-y-1">
              {t('hero.buttonDesktop')}
            </button>
          </div>

          {/* Desktop stats */}
          <div className="flex gap-12 pt-12 border-t border-white/5 w-full">
            <div>
              <div className="font-label-mono text-data-lg text-on-surface">{t('hero.stats1Value')}</div>
              <div className="font-label-mono text-[10px] text-tertiary uppercase tracking-widest mt-2">{t('hero.stats1Label')}</div>
            </div>
            <div>
              <div className="font-label-mono text-data-lg text-on-surface">{t('hero.stats2Value')}</div>
              <div className="font-label-mono text-[10px] text-tertiary uppercase tracking-widest mt-2">{t('hero.stats2Label')}</div>
            </div>
            <div>
              <div className="font-label-mono text-data-lg text-on-surface">{t('hero.stats3Value')}</div>
              <div className="font-label-mono text-[10px] text-tertiary uppercase tracking-widest mt-2">{t('hero.stats3Label')}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
