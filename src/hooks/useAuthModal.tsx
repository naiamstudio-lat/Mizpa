import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './useAuth';

interface AuthModalContextValue {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <AuthModalContext.Provider value={{ open, close, isOpen }}>
      {children}
      <AuthModal isOpen={isOpen} onClose={close} />
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used within AuthModalProvider');
  return ctx;
}

/* ─── Auth Modal Component ─── */

function AuthModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      onClose();
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || t('auth.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-margin-mobile"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-md bg-surface-container border border-white/5 p-8">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-tertiary hover:text-on-surface transition-colors bg-transparent border-none cursor-pointer"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <svg width="24" height="24" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(2 12)">
              <path d="M30 8c-4-8-14-10-18-6s-2 12 4 18c4 4 10 5.5 14 6-4 .5-10 2-14 6-6 6-6 14-4 18s14 2 18-6c2.5-4 4-10 4.5-16 .5 6 2 12 4.5 16 4 8 14 10 18 6s2-12-4-18c-4-4-10-5.5-14-6 4-.5 10-2 14-6 6-6 6-14 4-18s-14-2-18 6c-2.5 4-4 10-4.5 16-.5-6-2-12-4.5-16z" fill="#ffb1c4"/>
            </g>
          </svg>
          <span className="font-display-lg text-headline-sm tracking-tighter text-on-surface uppercase font-extrabold">
            Mizpa
          </span>
        </div>

        {/* Header */}
        <div className="mb-8 text-center">
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-2">{t('auth.signIn')}</h2>
          <p className="font-label-mono text-label-mono text-tertiary">{t('auth.signInDesc')}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="border border-primary/30 bg-primary/5 px-4 py-3 mb-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[18px]">error_outline</span>
            <span className="font-body-md text-body-md text-on-surface">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="font-label-mono text-label-mono text-tertiary mb-2 block">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-background border border-white/10 px-4 py-3 font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-outline-variant"
              placeholder={t('auth.emailPlaceholder')}
            />
          </div>

          <div>
            <label className="font-label-mono text-label-mono text-tertiary mb-2 block">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-background border border-white/10 px-4 py-3 font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-outline-variant"
              placeholder={t('auth.passwordPlaceholder')}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary py-3 font-body-md font-bold rounded-lg hover:glow-primary transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('auth.processing') : t('auth.signIn')}
          </button>
        </form>
      </div>
    </div>
  );
}
