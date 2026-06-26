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
        setMessage('Revisá tu email para confirmar tu cuenta.');
      } else {
        await signIn(email, password);
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Error al autenticar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-2.5 mb-8 no-underline">
          <div className="w-9 h-9 bg-navy-mid rounded-lg flex items-center justify-center border border-mint/30">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="8" r="5.5" stroke="#6EE7B7" strokeWidth="1.2" />
              <path d="M7 8l2 2 4-4" stroke="#6EE7B7" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6 15l4-2.5 4 2.5" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="10" y1="12.5" x2="10" y2="17" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round" />
            </svg>
          </div>
          <span className="font-display text-2xl font-bold text-cream">
            Miz<span className="text-mint">pa</span>
          </span>
        </Link>

        {/* Card */}
        <div className="bg-navy-mid border border-white/[0.08] rounded-2xl p-8">
          <h1 className="font-display text-2xl font-bold text-cream mb-2 text-center">
            {isSignUp ? 'Creá tu cuenta' : 'Ingresá a tu cuenta'}
          </h1>
          <p className="text-sm text-slate text-center mb-6">
            {isSignUp
              ? 'Empezá a auditar y mejorar tus sitios web'
              : 'Accedé al dashboard de Mizpa'}
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-mint/10 border border-mint/30 text-mint text-sm px-4 py-3 rounded-lg mb-4">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-light mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-navy border border-white/10 text-cream px-4 py-3 rounded-lg text-sm font-sans outline-none transition-colors focus:border-mint placeholder:text-slate"
                placeholder="tu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-light mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-navy border border-white/10 text-cream px-4 py-3 rounded-lg text-sm font-sans outline-none transition-colors focus:border-mint placeholder:text-slate"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-mint text-navy py-3 rounded-lg text-sm font-semibold font-sans transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Procesando...' : isSignUp ? 'Crear cuenta' : 'Ingresar'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage(''); }}
              className="text-sm text-slate hover:text-mint transition-colors bg-transparent border-none cursor-pointer"
            >
              {isSignUp
                ? '¿Ya tenés cuenta? Ingresá'
                : '¿No tenés cuenta? Creá una gratis'}
            </button>
          </div>
        </div>

        {/* Back to home */}
        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-slate hover:text-cream transition-colors no-underline">
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}