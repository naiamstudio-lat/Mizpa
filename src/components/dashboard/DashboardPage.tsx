import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { cleanupVms } from '../../lib/api';
import { SKILLS } from '../playground/skills';

export function DashboardPage() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleCleanup = async () => {
    setCleaning(true);
    setCleanupMsg(null);
    try {
      const result = await cleanupVms(false);
      setCleanupMsg(result.message);
    } catch (err) {
      setCleanupMsg(err instanceof Error ? err.message : 'Error cleaning VMs');
    } finally {
      setCleaning(false);
    }
  };

  const cards = SKILLS.map(s => ({
    skill: s.id,
    icon: s.icon,
    title: s.name,
    desc: s.description,
  }));

  return (
    <div className="min-h-screen bg-background">
      {/* Dashboard nav */}
      <header className="border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <nav className="flex justify-between items-center px-margin-mobile md:px-margin-desktop py-grid-unit w-full max-w-container-max mx-auto h-20">
          <div className="flex items-center gap-4">
            <span className="font-display-lg text-headline-sm tracking-tighter text-on-surface uppercase font-extrabold">
              Mizpa
            </span>
            <span className="hidden md:inline font-label-mono text-label-mono text-primary/60 border border-primary/20 px-2 py-0.5">
              {t('dashboard.badge')}
            </span>
          </div>
          <div className="flex items-center gap-6">
            <span className="hidden md:inline font-label-mono text-label-mono text-tertiary">
              {user?.email}
            </span>
            <button
              onClick={handleSignOut}
              className="font-label-mono text-label-mono text-tertiary hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
            >
              {t('nav.signOut')}
            </button>
          </div>
        </nav>
      </header>

      {/* Dashboard content */}
      <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-section-gap">
        <div className="mb-12">
          <h1 className="font-headline-sm text-headline-sm text-on-surface mb-2">{t('dashboard.title')}</h1>
          <p className="font-label-mono text-label-mono text-tertiary">
            {t('dashboard.welcome')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-16">
          {cards.map((card) => (
            <button
              key={card.skill}
              onClick={() => navigate(`/playground?skill=${card.skill}`)}
              className="bg-surface-container/20 border border-white/5 p-8 hover:border-primary/30 transition-all duration-300 text-left cursor-pointer group"
            >
              <span className="text-2xl mb-4 block">{card.icon}</span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface mb-3">{card.title}</h3>
              <p className="font-body-md text-body-md text-tertiary leading-relaxed">{card.desc}</p>
            </button>
          ))}
        </div>

        {/* Admin section */}
        <div className="border-t border-white/5 pt-12">
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-2">{t('dashboard.admin')}</h2>
          <p className="font-label-mono text-label-mono text-tertiary mb-6">
            {t('dashboard.adminDesc')}
          </p>

          {cleanupMsg && (
            <div className="bg-surface-container border border-white/5 px-5 py-4 mb-4">
              <span className="font-label-mono text-label-mono text-on-surface">{cleanupMsg}</span>
            </div>
          )}

          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="border border-primary/30 text-primary px-6 py-3 font-label-mono text-label-mono uppercase tracking-widest hover:bg-primary/5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-transparent"
          >
            {cleaning ? t('dashboard.cleaning') : t('dashboard.cleanVms')}
          </button>
        </div>
      </div>
    </div>
  );
}
