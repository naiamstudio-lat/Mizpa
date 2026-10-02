import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MizpaButterflies } from './MizpaButterflies';

/** Id the dialog's title points at, so assistive tech names the dialog. */
const TITLE_ID = 'workspace-welcome-title';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

interface WelcomeModalProps {
  isOpen: boolean;
  /** Every way out lands here: the primary action, Escape and the backdrop. */
  onClose: () => void;
}

/**
 * First-run onboarding.
 *
 * A first visit to `/app` lands on a workspace with three empty columns and no
 * explanation, which reads as broken rather than as new. This dialog is the one
 * screen that says what the thing is, and it offers one way forward: name a
 * site, and the other two columns have something to work on.
 *
 * The visual language is `AuthModal` verbatim — same backdrop, same card, same
 * wordmark, same close affordance — because the product already has a modal and
 * a second one would be a second style. What it adds over `AuthModal` is the
 * keyboard contract that component never had: `aria-modal`, Escape, focus moved
 * in on open and returned on close, and Tab kept inside the dialog while it is
 * open.
 *
 * Whether it shows is decided by the caller, from a stored flag, and dismissed
 * through `onClose` — nothing here touches storage. That split is what makes a
 * storage failure harmless: the flag can be lost, but the dialog's visibility is
 * React state, so it can always be closed.
 */
export function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  // Move focus in, and hand it back on the way out: a dialog that steals focus
  // and never returns it leaves the keyboard user stranded at the top of the
  // document.
  useEffect(() => {
    if (!isOpen) return;

    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    cardRef.current?.querySelector<HTMLElement>('[data-welcome-primary]')?.focus();

    return () => {
      restoreFocusTo.current?.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      // `aria-modal` promises the rest of the page is inert, so Tab has to wrap.
      // Without this the focus ring walks out to the header behind the backdrop.
      if (event.key !== 'Tab' || !cardRef.current) return;

      const focusable = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !cardRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-margin-mobile"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      {/* Backdrop: the butterfly field. It replaces the flat `bg-black/60`
          scrim rather than sitting under it, so the first screen a new user
          sees is the brand and not a grey wash. The scrim is kept as a soft
          darkening layer on top of it, because the card is `bg-surface-container`
          and without something to sit against, a bright wing drifting past the
          edge would fight the text. */}
      <div className="absolute inset-0 overflow-hidden">
        <MizpaButterflies className="w-full h-full" />
        <div className="absolute inset-0 bg-black/45" />
      </div>
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="relative z-10 w-full max-w-md bg-surface-container border border-white/5 p-8 max-h-[90vh] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('onboarding.dismiss')}
          className="absolute top-4 right-4 text-tertiary hover:text-on-surface transition-colors bg-transparent border-none cursor-pointer"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        {/* Wordmark, matching AuthModal */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <svg width="24" height="24" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(2 12)">
              <path d="M30 8c-4-8-14-10-18-6s-2 12 4 18c4 4 10 5.5 14 6-4 .5-10 2-14 6-6 6-6 14-4 18s14 2 18-6c2.5-4 4-10 4.5-16 .5 6 2 12 4.5 16 4 8 14 10 18 6s2-12-4-18c-4-4-10-5.5-14-6 4-.5 10-2 14-6 6-6 6-14 4-18s-14-2-18 6c-2.5 4-4 10-4.5 16-.5-6-2-12-4.5-16z" fill="#ffb1c4"/>
            </g>
          </svg>
          <span className="font-display-lg text-headline-sm tracking-tighter text-on-surface uppercase font-extrabold">
            Mizpa
          </span>
        </div>

        <div className="mb-8 text-center">
          <h2 id={TITLE_ID} className="font-headline-sm text-headline-sm text-on-surface mb-2">
            {t('onboarding.title')}
          </h2>
          <p className="font-label-mono text-label-mono text-tertiary">{t('onboarding.description')}</p>
        </div>

        {/* One message, not a walkthrough. The three-column layout is visible
            behind this card, so naming the columns would be describing what the
            user can already see; a numbered list in front of a live layout just
            slows the first run down. */}
        <p className="font-body-md text-body-md text-on-surface/90 leading-relaxed mb-8 text-center">
          {t('onboarding.body')}
        </p>

        {/* The one way forward: the create-site form in the left column. */}
        <button
          type="button"
          data-welcome-primary
          onClick={onClose}
          className="w-full bg-primary text-on-primary py-3 font-body-md font-bold rounded-lg hover:glow-primary transition-all duration-300 cursor-pointer"
        >
          {t('onboarding.primary')}
        </button>
      </div>
    </div>
  );
}