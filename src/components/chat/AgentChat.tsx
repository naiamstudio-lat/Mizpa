import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { readSelection } from '../../app/workspace';

interface SiteOption {
  id: string;
  name: string;
}

/**
 * The workspace's centre column: the agent chat.
 *
 * This component owns the conversation and the site it is about: `?site=` names
 * the site, and the select in the header writes it. It does not own a route — the
 * chat is a column of the same screen as the site list and the preview, so the
 * selection reaches it as a selection rather than as a destination.
 *
 * It does not yet own a turn. The in-browser `libfx` runtime is the next unit
 * of this change, so there is no agent to talk to yet and the surface says so
 * instead of pretending otherwise — the composer is disabled rather than
 * accepting a message that would be silently dropped. Wiring the runtime means
 * replacing `AGENT_STATUS` and the disabled submit, not this component's shape.
 */
const AGENT_STATUS: 'not-connected' | 'connected' = 'not-connected';

export function AgentChat() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sites, setSites] = useState<SiteOption[]>([]);

  const { siteId } = readSelection(searchParams);

  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase.from('sites').select('id, name').order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error('Failed to load sites:', error);
        return;
      }
      setSites(data ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const selectSite = (nextSiteId: string) => {
    const next = new URLSearchParams(searchParams);
    if (nextSiteId) {
      next.set('site', nextSiteId);
    } else {
      next.delete('site');
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-2 border-b border-white/5 flex items-center gap-3 shrink-0">
        <span className="w-2 h-2 rounded-full bg-tertiary/40 shrink-0" />
        <h2 className="font-label-mono text-label-mono text-tertiary">{t('surfaces.chat.title')}</h2>

        {sites.length > 0 && (
          <label className="ml-auto flex items-center gap-2">
            <span className="font-label-mono text-[10px] text-tertiary/60">{t('surfaces.chat.site')}</span>
            <select
              value={siteId ?? ''}
              onChange={(event) => selectSite(event.target.value)}
              className="bg-surface-container border border-white/10 rounded-md px-2 py-1 font-label-mono text-[11px] text-on-surface outline-none focus:border-primary"
            >
              <option value="">{t('surfaces.chat.noSiteSelected')}</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {AGENT_STATUS === 'not-connected' && (
            <div className="bg-surface-container border border-white/5 px-5 py-4 mb-6">
              <p className="font-label-mono text-label-mono text-on-surface mb-1">{t('surfaces.chat.notConnected')}</p>
              <p className="font-label-mono text-[10px] text-tertiary/60">{t('surfaces.chat.notConnectedHint')}</p>
            </div>
          )}

          {/* No link here: the site list is the column to the left, not a route. */}
          {!siteId && (
            <p className="font-label-mono text-label-mono text-tertiary mb-4">{t('surfaces.chat.pickSiteHint')}</p>
          )}

          <p className="font-label-mono text-[10px] text-tertiary/40">{t('surfaces.chat.historyEmpty')}</p>
        </div>
      </div>

      <div className="border-t border-white/5 p-4 shrink-0">
        <div className="max-w-3xl mx-auto">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) event.preventDefault();
            }}
            placeholder={t('surfaces.chat.placeholder')}
            rows={2}
            disabled={AGENT_STATUS !== 'connected'}
            className="w-full bg-surface-container border border-white/10 rounded-2xl px-4 py-2 font-body-md text-body-md text-on-surface outline-none resize-none transition-all focus:border-primary/50 placeholder:text-tertiary/40 disabled:opacity-60"
          />
          <div className="mt-2 text-center">
            <span className="font-label-mono text-[10px] text-tertiary/30">{t('surfaces.chat.footer')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
