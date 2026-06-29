import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { cleanupVms } from '../../lib/api';

export function DashboardPage() {
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
      setCleanupMsg(err instanceof Error ? err.message : 'Error al limpiar VMs');
    } finally {
      setCleaning(false);
    }
  };

  const cards = [
    { skill: 'audit', icon: '🔍', title: 'Auditoría', desc: 'Analizá cualquier sitio web en segundos' },
    { skill: 'replica', icon: '⚡', title: 'Réplica', desc: 'Generá una versión optimizada en React' },
    { skill: 'generate', icon: '📊', title: 'Generar', desc: 'Combiná auditoría + réplica + deploy' },
  ];

  return (
    <div className="min-h-screen bg-navy">
      {/* Dashboard nav */}
      <nav className="border-b border-white/[0.06] px-10 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-navy-mid rounded-lg flex items-center justify-center border border-mint/30">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="8" r="5.5" stroke="#6EE7B7" strokeWidth="1.2" />
              <path d="M7 8l2 2 4-4" stroke="#6EE7B7" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-display text-lg font-bold text-cream">
            Miz<span className="text-mint">pa</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate">{user?.email}</span>
          <button
            onClick={handleSignOut}
            className="text-sm text-slate hover:text-cream transition-colors bg-transparent border-none cursor-pointer"
          >
            Cerrar sesión
          </button>
        </div>
      </nav>

      {/* Dashboard content */}
      <div className="max-w-[1100px] mx-auto px-10 py-16">
        <h1 className="font-display text-3xl font-bold text-cream mb-2">Dashboard</h1>
        <p className="text-slate mb-8">Bienvenido a Mizpa. Acá vas a poder auditar y mejorar tus sitios web.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {cards.map((card) => (
            <button
              key={card.skill}
              onClick={() => navigate(`/playground?skill=${card.skill}`)}
              className="bg-navy-mid border border-white/[0.08] rounded-xl p-6 hover:border-mint/20 transition-colors text-left cursor-pointer"
            >
              <div className="text-2xl mb-3">{card.icon}</div>
              <h3 className="text-lg font-semibold text-cream mb-1">{card.title}</h3>
              <p className="text-sm text-slate">{card.desc}</p>
            </button>
          ))}
        </div>

        {/* Admin section */}
        <div className="border-t border-white/[0.06] pt-8 mt-8">
          <h2 className="font-display text-lg font-semibold text-cream mb-3">Administración</h2>
          <p className="text-sm text-slate mb-4">
            Gestioná los recursos de infraestructura activos.
          </p>

          {cleanupMsg && (
            <div className="bg-navy-mid border border-mint/20 rounded-xl px-5 py-3 mb-4 text-sm text-cream">
              {cleanupMsg}
            </div>
          )}

          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-5 py-3 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {cleaning ? 'Limpiando...' : 'Limpiar VMs inactivas'}
          </button>
        </div>
      </div>
    </div>
  );
}
