import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { workspacePath } from '../../app/workspace';

interface Site {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

/**
 * The workspace's left column: the user's sites.
 *
 * This is where a site comes from and where one goes — the list, the creation
 * form and the delete. A site name selects that site for the whole workspace:
 * the chat and the preview columns both read the selection, so one row is one
 * link and there is no per-column navigation to do.
 *
 * Nothing here navigates: `workspacePath` can only change what this one screen
 * shows, never where it lives.
 *
 * ## Why the form no longer prefills from the landing
 *
 * It used to: `AppShell` now consumes the pending URL and the chat column turns
 * it into a measured report, which removed the "name your site" step from the
 * path a visitor who typed an address actually takes. Prefilling here as well
 * would have been worse than leaving it out — it would put the same URL in two
 * places at once, so the report and the form would show different subjects and
 * the visitor would have to work out which one was real.
 *
 * The form is kept, unchanged in purpose, for the other way in: someone who
 * navigates to `/app` directly has no URL to be measured from and needs somewhere
 * to name the thing they are about to build. Deleting it would have left that
 * visitor with no way in at all.
 */
export function ActiveSites() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSites = useCallback(async () => {
    try {
      // RLS scopes this to the signed-in user's own rows.
      const { data, error: queryError } = await supabase
        .from('sites')
        .select('id, name, status, created_at')
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;
      setSites(data ?? []);
    } catch (loadError) {
      console.error('Failed to load sites:', loadError);
      setError(loadError instanceof Error ? loadError.message : t('surfaces.sites.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || !user) return;

    setIsCreating(true);
    setError(null);

    try {
      const { error: insertError } = await supabase.from('sites').insert({
        name: trimmed,
        user_id: user.id,
        organization_id: user.id,
        status: 'pending',
      });

      if (insertError) throw insertError;

      setName('');
      await loadSites();
    } catch (createError) {
      console.error('Failed to create site:', createError);
      setError(createError instanceof Error ? createError.message : t('surfaces.sites.createError'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (site: Site) => {
    if (!confirm(t('surfaces.sites.deleteConfirm', { name: site.name }))) return;

    setError(null);

    try {
      const { error: deleteError } = await supabase.from('sites').delete().eq('id', site.id);
      if (deleteError) throw deleteError;
      setSites((previous) => previous.filter((candidate) => candidate.id !== site.id));
    } catch (deleteError) {
      console.error('Failed to delete site:', deleteError);
      setError(deleteError instanceof Error ? deleteError.message : t('surfaces.sites.deleteError'));
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      {/*
        This column is a fixed 320px wide, so no viewport breakpoint may drive
        its layout: `sm:flex-row` or `md:grid-cols-3` fire on the window's width
        while the available width stays 320px, which clipped the create button
        off the edge. Every layout here is therefore unconditional.
      */}
      <div className="px-4 py-6">
        <div className="mb-6">
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-2">{t('surfaces.sites.title')}</h2>
          <p className="font-label-mono text-label-mono text-tertiary">{t('surfaces.sites.welcome')}</p>
        </div>

        {error && (
          <div className="bg-surface-container border border-primary/30 px-5 py-4 mb-6">
            <span className="font-label-mono text-label-mono text-primary">{error}</span>
          </div>
        )}

        {/* Create a site */}
        <form
          className="flex flex-col gap-3 mb-8"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <label className="sr-only" htmlFor="new-site-name">
            {t('surfaces.sites.siteName')}
          </label>
          <input
            id="new-site-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('surfaces.sites.siteNamePlaceholder')}
            className="flex-1 bg-surface-container border border-white/10 rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface outline-none transition-colors focus:border-primary placeholder:text-tertiary/50"
          />
          <button
            type="submit"
            disabled={!name.trim() || isCreating}
            className="bg-primary text-on-primary px-6 py-3 font-label-mono text-label-mono uppercase tracking-widest hover:opacity-90 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-none whitespace-nowrap"
          >
            {isCreating ? t('surfaces.sites.creating') : t('surfaces.sites.create')}
          </button>
        </form>

        {/* Sites */}
        {isLoading ? (
          <p className="font-label-mono text-label-mono text-tertiary mb-8">{t('surfaces.sites.loading')}</p>
        ) : sites.length === 0 ? (
          <p className="font-label-mono text-label-mono text-tertiary mb-8">{t('surfaces.sites.empty')}</p>
        ) : (
          <ul className="space-y-3 mb-8">
            {sites.map((site) => (
              <li
                key={site.id}
                className="bg-surface-container/20 border border-white/5 p-5 flex flex-row items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-headline-sm text-headline-sm truncate">
                    {/* Selects the site for the whole workspace. It is the only
                        link a row needs: the chat and preview columns react to
                        this selection rather than to a route. */}
                    <Link
                      to={workspacePath({ site: site.id }, searchParams)}
                      className="text-on-surface hover:text-primary no-underline transition-colors"
                    >
                      {site.name}
                    </Link>
                  </h3>
                  <p className="font-label-mono text-[10px] text-tertiary/60 mt-1">
                    {t(`surfaces.sites.status.${site.status || 'pending'}`)}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleDelete(site)}
                    title={t('surfaces.sites.deleteTitle')}
                    className="w-8 h-8 flex items-center justify-center text-tertiary/50 hover:text-primary transition-all cursor-pointer bg-transparent border-none shrink-0"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
