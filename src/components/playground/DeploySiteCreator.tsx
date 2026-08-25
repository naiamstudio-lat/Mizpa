import { useState } from 'react';
import { supabase } from '../../lib/supabase';

interface DeploySiteCreatorProps {
  onSiteCreated: (site: { id: string; name: string }) => void;
}

export function DeploySiteCreator({ onSiteCreated }: DeploySiteCreatorProps) {
  const [siteName, setSiteName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!siteName.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Insert directly via Supabase client (RLS allows authenticated users to create own sites)
      const { data: site, error: insertError } = await supabase
        .from('sites')
        .insert({
          name: siteName.trim(),
          user_id: user.id,
          organization_id: user.id,
          status: 'pending'
        })
        .select('id, name')
        .single();

      if (insertError) throw new Error(insertError.message);

      onSiteCreated({ id: site.id, name: site.name });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating site');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="max-w-md w-full px-6">
        <div className="text-center mb-8">
          <div className="text-4xl mb-4">🚀</div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-2">
            Crear nuevo sitio
          </h2>
          <p className="font-body-md text-body-md text-tertiary">
            Escribe un nombre para tu sitio y el agente generará el código
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block font-label-mono text-[11px] text-tertiary mb-2">
              Nombre del sitio
            </label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="mi-sitio"
              className="w-full bg-surface-container border border-white/10 rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20 placeholder:text-outline-variant"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-500">
              {error}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={!siteName.trim() || isCreating}
            className="w-full bg-primary text-on-primary px-5 py-3 font-body-md font-bold rounded-lg transition-all duration-300 hover:glow-primary disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap border-none cursor-pointer"
          >
            {isCreating ? 'Creando...' : 'Crear sitio'}
          </button>
        </div>
      </div>
    </div>
  );
}
