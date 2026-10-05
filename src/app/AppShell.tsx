import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import {
  isHistoryOpen,
  isWelcomeSeen,
  persistHistory,
  persistWelcomeSeen,
  SHOW_WELCOME_EVERY_TIME,
  takePendingUrl,
} from './workspace';
import { ActiveSites } from '../components/sites/ActiveSites';
import { AgentChat } from '../components/chat/AgentChat';
import { SitePreview } from '../components/preview/SitePreview';
import { WelcomeModal } from '../components/onboarding/WelcomeModal';

/** DOM id the collapse toggle controls, and the test hook for the column. */
const HISTORY_COLUMN_ID = 'workspace-history';

/**
 * The workspace: the one screen of the authenticated app.
 *
 * Three columns, always the same screen — the user's sites on the left, the
 * agent chat in the middle, the preview of the selected site on the right.
 * There is no surface navigation because there is nothing to navigate between:
 * the site list and the chat and the preview are visible together, and what the
 * URL carries is a selection (`?site=`), not a destination.
 *
 * ## The landing handoff
 *
 * This component is where the URL typed on the landing is consumed, and it is the
 * **only** place. That matters more than it looks: the old flow read the same
 * `sessionStorage` key from `ActiveSites` to prefill a "name your site" field, so
 * the address a visitor had already typed was turned into a form to fill in. The
 * handoff is read once, here, and becomes the subject of the analysis the chat
 * column shows. No name, no form, nothing to confirm — the thing they typed is
 * the thing being worked on.
 *
 * A visitor with **no** pending URL (typed `/app` directly, or came back later)
 * gets the normal workspace: the create-site form in the left column and the
 * empty chat. That path is deliberately kept rather than deleted, because it is
 * the only way in for someone who has not started from the landing, and removing
 * the sole entry point to fix a flow for people who *did* would be a bad trade.
 *
 * The site list column can be hidden, and the choice is stored rather than kept
 * in component state, because it survives a reload and because this is a
 * preference about how someone likes to work. The other two columns are always
 * mounted: hiding one column is not hiding the workspace.
 *
 * The welcome dialog lives here rather than inside a column because the whole
 * screen is what needs explaining. Its visibility is state seeded once from
 * storage, and every exit writes the flag, so a store that refuses writes costs
 * one repeat visit and never a dialog nobody can dismiss.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();

  const [historyOpen, setHistoryOpen] = useState(() => isHistoryOpen(window.localStorage));
  /**
   * Read in the initializer, not in an effect. `takePendingUrl` clears the key as
   * it reads, so a second read would find nothing — and an effect would let the
   * chat column mount once without a subject and then again with one, which
   * flashes the empty state at exactly the visitor who should never see it.
   */
  const [pendingUrl] = useState(() => takePendingUrl(window.sessionStorage));
  // `SHOW_WELCOME_EVERY_TIME` is a development flag, not a design decision: it
  // forces the dialog on every visit so the onboarding can be reviewed. Flip it
  // in `workspace.ts` to restore the once-per-user behaviour — the flag is still
  // written on dismissal, so `isWelcomeSeen` resumes gating it immediately.
  const [welcomeOpen, setWelcomeOpen] = useState(
    () => SHOW_WELCOME_EVERY_TIME || !isWelcomeSeen(window.localStorage),
  );

  const toggleHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    persistHistory(window.localStorage, next);
  };

  // One exit for Escape, the backdrop, the close button and the primary action:
  // the flag is written on dismissal, not on completion, so no way out reopens it.
  const closeWelcome = () => {
    setWelcomeOpen(false);
    persistWelcomeSeen(window.localStorage);
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <header className="h-12 border-b border-white/5 bg-background/80 backdrop-blur-xl flex items-center justify-between px-4 gap-4 shrink-0">
        {/* The page's one `h1`; every column below it is an `h2`. */}
        <h1 className="font-display-lg text-sm tracking-tighter text-on-surface uppercase font-extrabold shrink-0">
          Mizpa
        </h1>

        <button
          type="button"
          onClick={toggleHistory}
          data-testid="workspace-history-toggle"
          aria-expanded={historyOpen}
          aria-controls={HISTORY_COLUMN_ID}
          className="font-label-mono text-[11px] text-tertiary hover:text-on-surface transition-colors bg-transparent border border-white/10 rounded-md px-3 py-1 cursor-pointer"
        >
          {historyOpen ? t('surfaces.workspace.hideHistory') : t('surfaces.workspace.showHistory')}
        </button>

        <div className="flex items-center gap-4 shrink-0">
          {user?.email && (
            <span className="hidden md:inline font-label-mono text-[11px] text-tertiary">{user.email}</span>
          )}
          {/* Development affordance: reopen the onboarding without a reload.
              It renders only while the dialog is forced on every visit, so it
              disappears on its own when `SHOW_WELCOME_EVERY_TIME` goes back to
              `false` — nothing to clean up at launch. */}
          {SHOW_WELCOME_EVERY_TIME && (
            <button
              type="button"
              onClick={() => setWelcomeOpen(true)}
              data-testid="workspace-reopen-welcome"
              className="font-label-mono text-[11px] text-tertiary hover:text-primary transition-colors bg-transparent border border-white/10 rounded-md px-3 py-1 cursor-pointer"
            >
              {t('onboarding.reopen')}
            </button>
          )}
          <button
            onClick={() => signOut()}
            className="font-label-mono text-[11px] text-tertiary hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
          >
            {t('nav.signOut')}
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden min-h-0">
        {historyOpen && (
          <section
            id={HISTORY_COLUMN_ID}
            data-testid={HISTORY_COLUMN_ID}
            aria-label={t('surfaces.sites.title')}
            className="w-80 shrink-0 border-r border-white/5 flex flex-col overflow-hidden"
          >
            <ActiveSites />
          </section>
        )}

        <section
          data-testid="workspace-chat"
          aria-label={t('surfaces.chat.title')}
          className="flex-1 min-w-0 flex flex-col overflow-hidden"
        >
          <AgentChat pendingUrl={pendingUrl} />
        </section>

        <section
          data-testid="workspace-preview"
          aria-label={t('surfaces.preview.title')}
          className="w-[42%] shrink-0 border-l border-white/5 flex flex-col overflow-hidden"
        >
          <SitePreview />
        </section>
      </main>

      <WelcomeModal isOpen={welcomeOpen} onClose={closeWelcome} pendingUrl={pendingUrl} />
    </div>
  );
}