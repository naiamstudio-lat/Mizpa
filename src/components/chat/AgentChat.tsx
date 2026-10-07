import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { readSelection } from '../../app/workspace';
import { useFxReplica } from '../replica/FxReplicaProvider';
import { SiteReadiness } from '../analysis/SiteReadiness';

interface SiteOption {
  id: string;
  name: string;
}

interface AgentChatProps {
  /**
   * The URL the visitor typed on the landing, consumed once by `AppShell`.
   *
   * A prop and not something this component reads from storage: the handoff is
   * cleared as it is read, so a second reader would race this one for the key and
   * one of the two would come up empty. Whoever takes it is the screen that shows
   * the analysis, and that is the chat column.
   */
  pendingUrl?: string;
}

/**
 * The workspace's centre column: the analysis and the agent chat.
 *
 * The column now opens with what Mizpa **measured**, not with a form. Someone
 * who typed an address on the landing arrives here and the first thing in the
 * column is that address being measured — grade, score, and the failing signals
 * grouped by category — with the conversation available underneath it. The
 * "name your site" step that used to sit between the URL and any output is gone
 * from this path; it remains in the left column for someone who arrived without
 * a URL, which is the only reason it is still there.
 *
 * ## Why the agent's state is probed rather than declared
 *
 * This used to read `const AGENT_STATUS = 'not-connected'`. A constant cannot be
 * wrong, which means it cannot be right either: it said the same thing whether
 * this browser lacks JSPI, whether `fx-gateway` is not deployed, whether it is
 * deployed without an `AI_GATEWAY_API_KEY`, or whether the whole path works. Those
 * are four different problems for four different people, and the only one this
 * screen can act on is knowing which.
 *
 * So `prepareFxAgent` is called for real, once, and its verdict is rendered. In
 * this environment the answer is measured, not assumed: the browser has JSPI, and
 * `GET /` on `fx-gateway` returns **404 `NOT_FOUND`**, because no edge function is
 * deployed. That is the sentence the visitor reads, and it is the true one.
 *
 * The `await` now lives in `FxReplicaProvider` rather than here. The replica
 * request underneath the report needs the same verdict, and two components each
 * probing would mean two wasm loads and — worse — the chance of this column and
 * the replica flow printing different answers about the same environment. The
 * measurement is shared; **the rendering is not**, and it is rendered here
 * exactly as before.
 *
 * The report above is **not** the agent's output, and the copy says so. It comes
 * from Mizpa's own call to the public IsAgentReady scanner — no key, no model, no
 * agent involved. A panel that looked like agent output while the agent cannot
 * answer would be the most misleading thing on this screen.
 */
export function AgentChat({ pendingUrl = '' }: AgentChatProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sites, setSites] = useState<SiteOption[]>([]);
  /**
   * `null` while the probe is in flight, which is a third state and not a fourth
   * verdict: "we have not asked yet" must not render as "we asked and it failed".
   */
  const { verdict, detail: verdictDetail } = useFxReplica();

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
          {/* The analysis, and the conversation, in that order. The report is
              first because it is the answer to the only question the visitor
              actually arrived with: "what did you find about my site?"

              Rendered only when there is a URL. A visitor who came straight to
              `/app` has nothing to measure, and an empty panel with a header
              would be a dead control in the column; the create-site form in the
              left column is their way in, and the hint below says so. */}
          {pendingUrl !== '' && <SiteReadiness url={pendingUrl} />}

          {pendingUrl !== '' && (
            <p className="font-label-mono text-[10px] text-tertiary/60 mb-4" data-testid="chat-handoff-note">
              {t('onboarding.body')}
            </p>
          )}

          {verdict !== 'ready' && (
            <div className="bg-surface-container border border-white/5 px-5 py-4 mb-6" data-testid="agent-verdict">
              <p className="font-label-mono text-label-mono text-on-surface mb-1">
                {verdict === null
                  ? t('surfaces.chat.agentChecking')
                  : t(`surfaces.chat.agent.${verdict}`, { defaultValue: t('surfaces.chat.notConnected') })}
              </p>
              <p className="font-label-mono text-[10px] text-tertiary/60">
                {verdictDetail ?? t('surfaces.chat.notConnectedHint')}
              </p>
            </div>
          )}

          {/* No link here: the site list is the column to the left, not a route. */}
          {!siteId && pendingUrl === '' && (
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
            disabled={verdict !== 'ready'}
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
