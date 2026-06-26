import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScorePreview } from './ScorePreview';

export function Hero() {
  const { t } = useTranslation();
  const [showScore, setShowScore] = useState(false);
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUrl(url.replace(/^https?:\/\//, '').replace(/\/$/, ''));
    setShowScore(true);
    setTimeout(() => {
      document.getElementById('score-preview')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 pt-[120px] pb-20 relative overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(110,231,183,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(110,231,183,.8) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      {/* Glow */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-[radial-gradient(ellipse,rgba(5,150,105,0.15)_0%,transparent_70%)] pointer-events-none" />

      {/* Badge */}
      <div className="inline-flex items-center gap-1.5 bg-mint/10 border border-mint/30 text-mint px-4 py-1.5 rounded-full text-xs font-medium tracking-widest uppercase mb-7">
        <span className="animate-pulse-dot">●</span>
        {t('hero.badge')}
      </div>

      {/* Title */}
      <h1 className="font-display text-[clamp(38px,6vw,72px)] font-extrabold leading-[1.08] tracking-tight max-w-[820px] mx-auto mb-6">
        {t('hero.titlePart1')}{' '}
        <span className="line-through text-slate decoration-red-500">{t('hero.titleStrikethrough')}</span>,<br />
        {t('hero.titlePart2')}{' '}
        <span className="text-mint">{t('hero.titleAccent')}</span>
      </h1>

      {/* Subtitle */}
      <p className="text-lg text-slate max-w-[560px] mx-auto mb-10 leading-relaxed">
        {t('hero.subtitle')}
      </p>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex gap-2.5 max-w-[520px] mx-auto mb-5 flex-wrap justify-center">
        <input
          type="url"
          className="flex-1 min-w-[260px] bg-navy-mid border border-white/10 text-cream px-[18px] py-3.5 rounded-[10px] text-[15px] font-sans outline-none transition-colors focus:border-mint placeholder:text-slate"
          placeholder={t('hero.inputPlaceholder')}
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="submit"
          className="bg-mint text-navy border-none cursor-pointer px-7 py-3.5 rounded-[10px] text-[15px] font-semibold font-sans transition-opacity hover:opacity-90 active:scale-[0.98] whitespace-nowrap"
        >
          {t('hero.button')}
        </button>
      </form>
      <p className="text-xs text-slate">{t('hero.micro')}</p>

      {/* Score Preview */}
      {showScore && <ScorePreview url={url} />}
    </div>
  );
}