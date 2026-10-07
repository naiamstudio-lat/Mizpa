import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { describeAge } from '../../lib/agentready/cache';
import type { ReadinessReport } from '../../lib/agentready/report';

/**
 * The readiness report as a document, for `window.print()`.
 *
 * ## What this is for
 *
 * A visitor who just read a grade and twenty findings has to be able to send the
 * measurement to somebody else — a developer, a client, themselves in a month.
 * The only honest output of that is the report **with its evidence, its
 * methodology version and its timestamp**, because a grade without the version
 * is not a fact anyone can check, and a grade without the timestamp is not a
 * measurement of the site as it is now.
 *
 * So this renders every field the screen shows, plus three the screen shows in
 * compact form, and adds nothing: no summary, no score delta chart, no "overall
 * assessment" paragraph. A PDF that reads better than the report is a document
 * with claims in it that the scanner never made.
 *
 * ## Why it is a portal and why it is always mounted
 *
 * See `styles/print.css`. The portal puts this element on `document.body`, as a
 * sibling of `#root`, which is the only way the print stylesheet can remove the
 * whole app shell without removing the document with it. And it is mounted from
 * the first render rather than on click, because the print job snapshots the
 * layout that exists at the moment `window.print()` runs.
 *
 * ## Absolute timestamps, deliberately
 *
 * On screen the panel says "measured 4 min ago", which is the right tense for a
 * live page and useless on paper: a sheet in a folder six weeks later has no
 * "now". So every time here is absolute and spelled with its zone, and the
 * relative age is added *next to* it rather than instead of it — the age is what
 * tells the reader whether a cached number is still worth anything, and it only
 * means something next to a real clock.
 */

export interface ReadinessPrintDocumentProps {
  report: ReadinessReport;
  /** `Date.now()` when this report was received, for the cache note. */
  cachedAt: number | null;
  /**
   * When the sheet was produced, refreshed by the `beforeprint` listener in
   * `SiteReadiness` so the age on paper is the age at the moment of printing and
   * not the age at mount. Null until that listener has fired.
   */
  printedAt: number | null;
  fromCache: boolean;
  /** The locale to stamp timestamps in. Not the host's. */
  locale: string;
}

/** ISO-8601 with the offset, so a sheet is unambiguous without a legend. */
function stamp(iso: string | null, locale: string): string {
  if (iso === null || iso === '') return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${at.toLocaleString(locale)} (${at.toISOString()})`;
}

function fact(label: string, value: string) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ReadinessPrintDocument({
  report,
  cachedAt,
  printedAt,
  fromCache,
  locale,
}: ReadinessPrintDocumentProps) {
  const { t } = useTranslation();
  const asOf = printedAt ?? cachedAt ?? null;

  return createPortal(
    <div className="mizpa-print-root" aria-hidden="true" data-testid="readiness-print-document">
      <h1>{t('analysis.print.title')}</h1>
      <p className="mizpa-print-subtitle">{report.domain}</p>

      {/* Everything a reader needs to decide whether this number still applies.
          A grade is not checkable without its version and its time, so all of
          them travel together, and the group is delimited by rules rather than by
          a panel of colour that a printer would drop.

          Every timestamp is absolute. "4 min ago" is the right tense for a live
          page and meaningless on a sheet in a folder six weeks later, so the
          relative age appears as one more labelled fact next to the clock it is
          measured against — never instead of it. */}
      <dl className="mizpa-print-facts">
        {fact(t('analysis.print.grade'), report.letterGrade)}
        {fact(t('analysis.print.score'), t('analysis.scoreOf', { score: report.overallScore }))}
        {fact(t('analysis.print.methodology'), report.methodologyVersion)}
        {fact(
          t('analysis.print.scannedAt'),
          report.scannedAt === null || report.scannedAt === ''
            ? t('analysis.print.scannedAtUnknown')
            : stamp(report.scannedAt, locale),
        )}
        {cachedAt !== null && fact(t('analysis.print.receivedAt'), stamp(new Date(cachedAt).toISOString(), locale))}
        {asOf !== null && cachedAt !== null && fact(t('analysis.print.age'), describeAge(cachedAt, asOf))}
        {asOf !== null && fact(t('analysis.print.copyAt'), stamp(new Date(asOf).toISOString(), locale))}
      </dl>

      {fromCache && <p className="mizpa-print-disclaimer">{t('analysis.fromCache')}</p>}

      {/* The disclaimer is reproduced, not summarised away. A printed sheet is
          the copy most likely to outlive the app that could have explained the
          number, so it is the one that must still carry the caveat. */}
      <p className="mizpa-print-disclaimer">{t('analysis.notAVerdict')}</p>

      {report.accessBlockers.length > 0 && (
        <div className="mizpa-print-blocker">
          <h3>{t('analysis.blockersTitle')}</h3>
          {report.accessBlockers.map((issue) => (
            <p key={issue.id} className="mizpa-print-evidence">
              <strong>{issue.name}</strong> — {issue.evidence}
            </p>
          ))}
        </div>
      )}

      {/* Every finding, in the scanner's own categories, expanded. The screen
          collapses them behind a toggle for space; paper has pages. */}
      <h2>{t('analysis.print.findings')}</h2>
      {report.categories.map((category) => (
        <section key={category.id}>
          <h3>
            {category.label}
            {category.applicable
              ? ` · ${category.grade ?? '—'} · ${t('analysis.print.categoryScore', {
                  score: category.score,
                  max: category.maxScore,
                })}`
              : ` · ${t('analysis.notApplicable')}`}
          </h3>
          {category.issues.length === 0 && <p className="mizpa-print-evidence">{t('analysis.noIssues')}</p>}
          {category.issues.map((issue) => (
            <div key={`${category.id}-${issue.id}`} className="mizpa-print-issue">
              <p className="mizpa-print-issue-head">
                <span className="mizpa-print-issue-id">{issue.id}</span> — {issue.name}{' '}
                <span className="mizpa-print-issue-status">{issue.status}</span>
              </p>
              {issue.evidence !== '' && <p className="mizpa-print-evidence">{issue.evidence}</p>}
              {issue.recommendation !== null && (
                <p className="mizpa-print-recommendation">
                  <strong>{t('analysis.recommendation')}: </strong>
                  {issue.recommendation}
                </p>
              )}
            </div>
          ))}
        </section>
      ))}

      <p className="mizpa-print-footer">
        {t('analysis.sourceNote')}
        {report.reportUrl !== null && (
          <>
            {' '}
            <span className="mizpa-print-url">
              {t('analysis.print.fullReport')}: {report.reportUrl}
            </span>
          </>
        )}
      </p>
    </div>,
    document.body,
  );
}