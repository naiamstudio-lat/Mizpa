import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        await signUp(email, password);
        setMessage('Check your email to confirm your account.');
      } else {
        await signIn(email, password);
        onClose();
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError('');
    setMessage('');
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

        {/* Header */}
        <div className="mb-8 text-center">
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-2">
            {mode === 'signup' ? 'Create your account' : 'Sign in'}
          </h2>
          <p className="font-label-mono text-label-mono text-tertiary">
            {mode === 'signup'
              ? 'Start auditing and improving your websites'
              : 'Access your Mizpa dashboard'}
          </p>
        </div>

        {/* Messages */}
        {error && (
          <div className="border border-primary/30 bg-primary/5 px-4 py-3 mb-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[18px]">error_outline</span>
            <span className="font-body-md text-body-md text-on-surface">{error}</span>
          </div>
        )}

        {message && (
          <div className="border border-primary/30 bg-primary/5 px-4 py-3 mb-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
            <span className="font-body-md text-body-md text-on-surface">{message}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="font-label-mono text-label-mono text-tertiary mb-2 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-background border border-white/10 px-4 py-3 font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-outline-variant"
              placeholder="you@email.com"
            />
          </div>

          <div>
            <label className="font-label-mono text-label-mono text-tertiary mb-2 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-background border border-white/10 px-4 py-3 font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-outline-variant"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary py-3 font-body-md font-bold rounded-lg hover:glow-primary transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {/* Toggle mode */}
        <div className="mt-6 text-center">
          <button
            onClick={switchMode}
            className="font-label-mono text-label-mono text-tertiary hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
          >
            {mode === 'signup'
              ? 'Already have an account? Sign in'
              : "Don't have an account? Create one"}
          </button>
        </div>
      </div>
    </div>
  );
}
