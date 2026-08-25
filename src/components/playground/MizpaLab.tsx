import { useState, useEffect } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { DeployChat } from './DeployChat';
import { DeploySiteCreator } from './DeploySiteCreator';
import { LivePreview } from './LivePreview';

interface Site {
  id: string;
  name: string;
  cloudflare_project_name: string | null;
  cloudflare_pages_url: string | null;
  status: string;
  created_at: string;
}

function getPreviewUrl(site: Site | null | undefined): string {
  if (!site) return 'https://pending.pages.dev';
  if (site.cloudflare_pages_url) return site.cloudflare_pages_url;
  if (site.cloudflare_project_name) return `https://${site.cloudflare_project_name}.pages.dev`;
  return `https://pending.pages.dev`;
}

export function MizpaLab() {
  const { user, signOut } = useAuth();
  const { org } = useParams<{ org: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [isLoadingSites, setIsLoadingSites] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  // Load user's sites
  useEffect(() => {
    loadSites();
  }, []);

  // Handle site selection from URL
  useEffect(() => {
    const siteId = searchParams.get('site');
    if (siteId) {
      setSelectedSiteId(siteId);
    }
  }, [searchParams]);

  const loadSites = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Query directly via Supabase client (RLS: users read own sites)
      const { data: sitesList, error } = await supabase
        .from('sites')
        .select('id, name, status, freestyle_vm_id, cloudflare_project_name, cloudflare_pages_url, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSites(sitesList || []);
      
      // Auto-select first site if none selected
      if (!selectedSiteId && sitesList && sitesList.length > 0) {
        setSelectedSiteId(sitesList[0].id);
      }

      // Auto-create default site if user has none → chat works immediately
      if (sitesList && sitesList.length === 0) {
        await createDefaultSite();
      }
    } catch (error) {
      console.error('Failed to load sites:', error);
    } finally {
      setIsLoadingSites(false);
    }
  };

  const createDefaultSite = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: site, error } = await supabase
        .from('sites')
        .insert({
          name: 'Mi Sitio',
          user_id: user.id,
          organization_id: user.id,
          status: 'pending'
        })
        .select('id, name, status, cloudflare_project_name, cloudflare_pages_url, created_at')
        .single();

      if (error) throw error;

      setSites([site]);
      setSelectedSiteId(site.id);
      setSearchParams({ site: site.id });
    } catch (error) {
      console.error('Failed to auto-create site:', error);
    }
  };

  const handleSiteCreated = (site: { id: string; name: string }) => {
    setSites(prev => [...prev, {
      id: site.id,
      name: site.name,
      cloudflare_project_name: null,
      cloudflare_pages_url: null,
      status: 'pending',
      created_at: new Date().toISOString()
    }]);
    setSelectedSiteId(site.id);
    setSearchParams({ site: site.id });
  };

  const handleSiteSelect = (siteId: string) => {
    setSelectedSiteId(siteId);
    setSearchParams({ site: siteId });
  };

  const handleSiteDelete = async (siteId: string, siteName: string) => {
    if (!confirm(`¿Eliminar "${siteName}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('sites')
        .delete()
        .eq('id', siteId);

      if (error) throw error;

      setSites(prev => prev.filter(s => s.id !== siteId));
      if (selectedSiteId === siteId) {
        setSelectedSiteId(null);
        setSearchParams({});
      }
    } catch (error) {
      console.error('Failed to delete site:', error);
      alert('Error al eliminar el sitio');
    }
  };

  const selectedSite = sites.find(s => s.id === selectedSiteId);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-12 border-b border-white/5 bg-background/80 backdrop-blur-xl flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-display-lg text-sm tracking-tighter text-on-surface uppercase font-extrabold">
            Mizpa
          </span>
          <span className="font-label-mono text-[10px] text-primary/60 border border-primary/20 px-1.5 py-0.5">
            LAB
          </span>
          <span className="font-label-mono text-[10px] text-tertiary/40">
            /{org}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedSite && (
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`px-3 py-1 font-label-mono text-[11px] rounded-lg transition-all bg-transparent border cursor-pointer ${
                showPreview ? 'border-primary text-primary' : 'border-white/10 text-tertiary hover:text-on-surface'
              }`}
            >
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </button>
          )}

          {user && (
            <>
              <span className="hidden md:inline font-label-mono text-[11px] text-tertiary">
                {user.email}
              </span>
              <button
                onClick={() => signOut()}
                className="font-label-mono text-[11px] text-tertiary hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Sites */}
        <aside className="w-64 border-r border-white/5 bg-surface-container-low flex flex-col shrink-0">
          <div className="p-3 border-b border-white/5">
            <button
              onClick={() => setSelectedSiteId(null)}
              className="w-full bg-primary text-on-primary px-3 py-2 font-label-mono text-[11px] rounded-lg hover:opacity-90 transition-all cursor-pointer border-none"
            >
              + New Site
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {isLoadingSites ? (
              <div className="p-4 text-center text-tertiary font-label-mono text-[11px]">
                Loading sites...
              </div>
            ) : sites.length === 0 ? (
              <div className="p-4 text-center text-tertiary font-label-mono text-[11px]">
                No sites yet. Create one to get started.
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {sites.map((site) => (
                  <div
                    key={site.id}
                    className={`group flex items-center gap-1 rounded-lg transition-all ${
                      selectedSiteId === site.id
                        ? 'bg-primary/10'
                        : 'bg-transparent hover:bg-surface-container'
                    }`}
                  >
                    <button
                      onClick={() => handleSiteSelect(site.id)}
                      className="flex-1 text-left px-3 py-2 cursor-pointer border-none bg-transparent"
                    >
                      <div className="font-label-mono text-[11px] truncate text-on-surface">{site.name}</div>
                      <div className="font-label-mono text-[10px] text-tertiary/50 mt-0.5">
                        {site.status === 'deployed' ? '🟢 Deployed' : 
                         site.status === 'building' ? '🟡 Building' : 
                         site.status === 'failed' ? '🔴 Failed' : '⚪ Pending'}
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSiteDelete(site.id, site.name);
                      }}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-tertiary/50 hover:text-red-500 transition-all cursor-pointer bg-transparent border-none"
                      title="Eliminar sitio"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Central area - Chat + optional Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedSiteId ? (
            showPreview && selectedSite ? (
              <div className="flex-1 flex overflow-hidden">
                {/* Chat */}
                <div className="flex-1 flex flex-col overflow-hidden border-r border-white/5">
                  <DeployChat 
                    key={selectedSiteId}
                    siteId={selectedSiteId}
                    siteName={selectedSite.name}
                    previewUrl={getPreviewUrl(selectedSite)}
                  />
                </div>
                {/* Preview */}
                <div className="w-1/2 flex flex-col overflow-hidden">
                  <LivePreview 
                    vmUrl={getPreviewUrl(selectedSite)}
                    vmStatus={selectedSite.status === 'deployed' ? 'running' : 'creating'}
                  />
                </div>
              </div>
            ) : (
              <DeployChat 
                key={selectedSiteId}
                siteId={selectedSiteId}
                siteName={selectedSite?.name || 'Mi Sitio'}
                previewUrl={getPreviewUrl(selectedSite)}
              />
            )
          ) : (
            <DeploySiteCreator onSiteCreated={handleSiteCreated} />
          )}
        </div>
      </div>
    </div>
  );
}
