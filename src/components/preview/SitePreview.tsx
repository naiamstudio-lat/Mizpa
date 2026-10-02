import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { previewFrame } from '../../app/preview';
import { readSelection } from '../../app/workspace';

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
 * `html` is not supplied by anything yet. The in-browser `libfx` runtime and
 * its virtual filesystem are the next unit of this change, and they are the
 * only honest source for a generated page. Until then this surface renders the
 * explicit empty state — never a blank frame — and the `srcdoc` path is
 * asserted by `test/unit/preview.test.ts` rather than by a manual click.
 */
export function SitePreview({ html, siteName }: SitePreviewProps) {
  const { t } = useTranslation();
  // Which site is being previewed is a selection, so it travels in the URL. The
  // page being previewed is content, so it travels as a prop.
  const [searchParams] = useSearchParams();
  const frame = previewFrame(html, readSelection(searchParams).siteId !== null);

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
          /* White is the paper a generated page renders on, so the empty state
             gets the app background instead: `text-tertiary` is #c6c6c7 and was
             effectively invisible on white. */
          <div className="absolute inset-0 flex items-center justify-center bg-background px-6">
            <div className="text-center">
              <p className="font-label-mono text-label-mono text-tertiary mb-2">
                {frame.reason === 'no-site' ? t('surfaces.preview.noSite') : t('surfaces.preview.noEntrypoint')}
              </p>
              <p className="font-label-mono text-[10px] text-tertiary/60">
                {frame.reason === 'no-site'
                  ? t('surfaces.preview.noSiteHint')
                  : t('surfaces.preview.noEntrypointHint')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
