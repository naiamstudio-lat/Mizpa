import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { previewFrame } from '../../app/preview';
import { readSelection } from '../../app/workspace';
import { MizpaButterflies } from '../onboarding/MizpaButterflies';
import { useFxReplica } from '../replica/FxReplicaProvider';

interface SitePreviewProps {
  /**
   * The generated `index.html`, or nothing when the agent has not written one.
   * A prop and not a query parameter on purpose: generated HTML must never be
   * something a URL can hand the sandbox.
   */
  html?: string | null;
  /** Name shown in the frame header, so the preview says which site it is. */
  siteName?: string | null;
}

/**
 * The workspace's right column: the preview of a generated site.
 *
 * This replaced `LivePreview`, which pointed an iframe at
 * `sites.cloudflare_pages_url` — a column nothing ever wrote, so it rendered
 * `https://pending.pages.dev` forever. This renders the agent's own output
 * instead: `index.html` inside a sandboxed frame with an opaque origin, so a
 * generated page cannot reach this app's storage or cookies.
 *
 * There are now two honest sources for `html`, and they are kept apart on
 * purpose: the `html` prop (nothing supplies it yet) and the replica machine's
 * artifact, which is only ever the bytes read out of the agent's own workspace.
 *
 * ## The butterflies are not decoration, and they are not a loading state
 *
 * They appear while `replicaInProgress` is true and at no other time — not while
 * the panel is idle, and never over a terminal state. Two failures this avoids,
 * both of which would be lies:
 *
 * - Animating during `unavailable` would show motion over a message that says
 *   nothing was produced. The animation would contradict the text.
 * - Animating whenever there is no frame would make "no site selected" and "the
 *   agent is working" look identical, which is exactly the two things a visitor
 *   most needs to tell apart.
 *
 * The empty state stays. It is not replaced by the field — it is the reason the
 * field is showing — so `no-site` and `no-entrypoint` still say so, in words,
 * above the butterflies.
 *
 * ## Why nothing moves when the field appears
 *
 * All three layers are `absolute inset-0` inside one `flex-1 relative` box, so
 * the field contributes **zero** height. Before, during and after the attempt the
 * box is exactly as tall as the column, and the only thing that changes is what
 * is painted inside it. A spinner that is laid out normally shifts the text
 * below it; this cannot, because it was never in the layout.
 */
export function SitePreview({ html, siteName }: SitePreviewProps) {
  const { t } = useTranslation();
  const { state, inProgress } = useFxReplica();
  // Which site is being previewed is a selection, so it travels in the URL. The
  // page being previewed is content, so it travels as a prop.
  const [searchParams] = useSearchParams();
  const siteSelected = readSelection(searchParams).siteId !== null;

  // The replica's artifact wins over the prop, and only because it is the only
  // one that can be non-null today.
  const artifact = state.html ?? html ?? null;
  /**
   * `previewFrame`'s second argument means "is there a subject to show", not
   * "is a row selected": a replica produces a page for a site that has no row,
   * and that page is real. A replica in flight is **not** a subject — it has
   * written nothing — so `inProgress` is deliberately absent from this line.
   */
  const frame = previewFrame(artifact, siteSelected || state.html !== null);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="h-10 border-b border-white/5 bg-surface-container/30 flex items-center px-3 gap-2 shrink-0">
        <h2 className="font-label-mono text-label-mono text-on-surface truncate">{t('surfaces.preview.title')}</h2>
        {siteName && <span className="font-label-mono text-[10px] text-tertiary/60 truncate">{siteName}</span>}
        <span className="ml-auto font-label-mono text-[10px] text-tertiary/40 shrink-0">
          {t('surfaces.preview.staticNotice')}
        </span>
      </div>

      <div className="flex-1 relative bg-white">
        {frame.kind === 'render' ? (
          <iframe
            srcDoc={frame.srcdoc}
            sandbox={frame.sandbox}
            title={t('surfaces.preview.frameTitle')}
            className="w-full h-full border-0"
          />
        ) : (
          <>
            {/* White is the paper a generated page renders on, so the empty state
                gets the app background instead: `text-tertiary` is #c6c6c7 and
                was effectively invisible on white. */}
            <div className="absolute inset-0 bg-background" />

            {/* Between the background and the words. Absolutely positioned in all
                three layers, so the field adds no height and the text keeps the
                exact position it has with no attempt running. */}
            {inProgress && <MizpaButterflies className="absolute inset-0 h-full w-full opacity-70" />}

            <div className="absolute inset-0 flex items-center justify-center px-6">
              <div className="text-center">
                <p className="font-label-mono text-label-mono text-tertiary mb-2">
                  {frame.reason === 'no-site' ? t('surfaces.preview.noSite') : t('surfaces.preview.noEntrypoint')}
                </p>
                <p className="font-label-mono text-[10px] text-tertiary/60">
                  {frame.reason === 'no-site'
                    ? t('surfaces.preview.noSiteHint')
                    : t('surfaces.preview.noEntrypointHint')}
                </p>
                {/* The reason the field is on screen, in words, so a reduced-motion
                    reader and a screenshot both get the same information. */}
                {inProgress && (
                  <p
                    className="font-label-mono text-[10px] text-primary mt-4"
                    data-testid="preview-working"
                  >
                    {state.phase === 'requested' ? t('replica.requested') : t('replica.runningPreview')}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}