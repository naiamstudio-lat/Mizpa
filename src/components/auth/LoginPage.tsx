import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password);
        setMessage('Check your email to confirm your account.');
      } else {
        await signIn(email, password);
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-margin-mobile">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-3 mb-10 no-underline">
          <span className="font-display-lg text-headline-sm tracking-tighter text-on-surface uppercase font-extrabold">
            Mizpa
          </span>
          <span className="font-label-mono text-label-mono text-primary/60">TECHNICAL SEO</span>
        </Link>

        {/* Card */}
        <div className="bg-surface-container border border-white/5 p-8">
          <h1 className="font-headline-sm text-headline-sm text-on-surface mb-2 text-center">
            {isSignUp ? 'Create your account' : 'Sign in'}
          </h1>
          <p className="font-label-mono text-label-mono text-tertiary text-center mb-8">
            {isSignUp
              ? 'Start auditing and improving your websites'
              : 'Access your Mizpa dashboard'}
          </p>

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
              {loading ? 'Processing...' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage(''); }}
              className="font-label-mono text-label-mono text-tertiary hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Create one"}
            </button>
          </div>
        </div>

        {/* Back to home */}
        <div className="mt-6 text-center">
          <Link
            to="/"
            className="font-label-mono text-label-mono text-tertiary hover:text-primary transition-colors no-underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
