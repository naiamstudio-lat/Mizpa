import { useCallback, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { peekCachedScan, runScan } from '../../lib/agentready/pool';
import { browserScanTransport } from '../../lib/agentready/transport';
import type { ReadinessReport } from '../../lib/agentready/report';
import type { ScanError, ScanFailureCode, ScanProgress } from '../../lib/agentready/scan';
import { ReadinessBody } from './ReadinessBody';
import { ReadinessPrintDocument } from './ReadinessPrintDocument';
import { ReadinessReplicaAction } from './ReadinessReplicaAction';

type Phase = 'scanning' | 'ready' | 'failed';

interface SiteReadinessProps {
  /**
   * The subject of the analysis: the URL the visitor typed on the landing, or one
   * they typed here. A prop and not a query parameter, for the same reason
   * `SitePreview`'s `html` is — content the agent will act on must not be
   * something a URL can hand the app.
   */
  url: string;
}

/**
 * The analysis panel: what Mizpa measured about a site, before anyone chats.
 *
 * This is the first thing a visitor sees after typing their address, so it has
 * three jobs and no fourth: **show the measurement**, **show that the measurement
 * is real and still running**, and **be honest about what it is not**. The
 * rendering of all three lives in `ReadinessBody`; this file owns the lifecycle.
 *
 * ## Why the state is split from the render
 *
 * The lifecycle has the two things that are easy to get wrong and invisible when
 * they are: a report that must be on screen in the **first paint** when it is
 * cached, and a clock that must tick **every second** rather than every poll.
 * Both belong next to the effect that starts the scan, not next to the JSX.
 *
 * ## Caching, and why it is not optional
 *
 * The scanner is unauthenticated and capped at 100 requests an hour per IP
 * (measured: `ratelimit-policy: hourly;q=100;w=3600`), so every visitor behind one
 * NAT shares that budget. `runScan` collapses duplicate requests for one domain
 * into one scan — which is also what stops React's `StrictMode` double-mount from
 * paying for two — and the panel shows a cached report immediately, labelled with
 * its real age, while a fresh measurement runs behind it. A number is never
 * presented as fresh when it is not, and a failure never blanks a report that is
 * already on screen: an unreachable scanner on a site measured an hour ago still
 * shows that measurement, with the reason added underneath.
 */
export function SiteReadiness({ url }: SiteReadinessProps) {
  const { t } = useTranslation();

  // Seeded during the first render, not in an effect: a cached report must be on
  // screen in the first paint, and an effect would leave the panel empty for a
  // frame on the exact path that is supposed to be instant.
  const seeded = useMemo(() => peekCachedScan(url, window.sessionStorage, Date.now()), [url]);

  const [phase, setPhase] = useState<Phase>(seeded === null ? 'scanning' : 'ready');
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [report, setReport] = useState<ReadinessReport | null>(seeded?.report ?? null);
  const [cachedAt, setCachedAt] = useState<number | null>(seeded?.cachedAt ?? null);
  const [fromCache, setFromCache] = useState<boolean>(seeded !== null);
  const [failure, setFailure] = useState<ScanFailureCode | null>(null);
  const [failureDetail, setFailureDetail] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  /**
   * When the current scan began, for the ticking clock.
   *
   * Not `progress.elapsedMs`: that only changes when a poll returns, and the poll
   * interval is 5 s, so a counter driven by it would read as frozen for four
   * seconds out of five — which is exactly what makes a real 20 s wait look like a
   * hung request. A local start timestamp plus a 1 s tick is honest, and it is
   * still measuring the same wall clock the scanner is on.
   */
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  /**
   * When the print sheet was produced. `null` until `beforeprint` fires.
   *
   * It has to be a real event and not a value computed at mount: the panel's
   * clock stops ticking once the scan is over, so a document that read `now`
   * would put "measured 3 min ago" on a sheet printed an hour later. The
   * `beforeprint` listener also covers the keyboard path (`Ctrl`/`Cmd`+`P`),
   * which never goes near the button, and `flushSync` is what guarantees the
   * re-render lands before the print job snapshots the layout — without it the
   * sheet would carry last visit's age, which is worse than carrying none.
   */
  const [printedAt, setPrintedAt] = useState<number | null>(null);

  const target = url.trim();

  useEffect(() => {
    if (phase !== 'scanning') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    const stamp = () => {
      flushSync(() => setPrintedAt(Date.now()));
    };
    window.addEventListener('beforeprint', stamp);
    return () => window.removeEventListener('beforeprint', stamp);
  }, []);

  const start = useCallback(() => {
    const startedAt = Date.now();
    setPhase('scanning');
    setFailure(null);
    setFailureDetail(null);
    setRetryAfterSeconds(null);
    setProgress(null);
    setScanStartedAt(startedAt);
    setNow(startedAt);

    const controller = new AbortController();
    void runScan({
      url: target,
      transport: browserScanTransport(),
      storage: window.sessionStorage,
      signal: controller.signal,
      onProgress: setProgress,
    })
      .then((result) => {
        setReport(result.report);
        setCachedAt(Date.now());
        setFromCache(result.cached);
        setScanStartedAt(null);
        setPhase('ready');
      })
      .catch((error: unknown) => {
        setFailure((error as ScanError)?.code ?? 'unknown');
        setFailureDetail((error as ScanError)?.detail ?? null);
        setRetryAfterSeconds((error as ScanError)?.retryAfterSeconds ?? null);
        setScanStartedAt(null);
        setPhase('failed');
      });
  }, [target]);

  useEffect(() => {
    start();
  }, [start]);

  return (
    <section
      data-testid="site-readiness"
      aria-label={t('analysis.title')}
      className="bg-surface-container/40 border border-white/5 mb-6"
    >
      {/* --- header: the subject, and the fact that names the source --- */}
      <div className="px-5 pt-5 pb-4 border-b border-white/5">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h3 className="font-headline-sm text-headline-sm text-on-surface">{t('analysis.title')}</h3>
          <span className="font-label-mono text-[10px] text-tertiary/60 truncate">
            {t('analysis.forDomain', { domain: report?.domain ?? target })}
          </span>
          {/* Only with a report. Printing a failure or a progress bar would put a
              document on paper that has no measurement in it. */}
          {report !== null && (
            <button
              type="button"
              onClick={() => window.print()}
              data-testid="readiness-print"
              className="ml-auto font-label-mono text-[10px] text-tertiary hover:text-primary transition-colors bg-transparent border border-white/10 rounded-md px-3 py-1 cursor-pointer"
            >
              {t('analysis.print.button')}
            </button>
          )}
        </div>
        <p className="font-label-mono text-[10px] text-tertiary/50 mt-2 leading-relaxed">
          {t('analysis.sourceNote')}
        </p>
        {/* Visible, not a tooltip. Someone who asked for a PDF is expecting a
            file to arrive, and the honest correction — a dialog opens, and the
            save is your choice in there — has to be on the screen before the
            click, not after the surprise. This is why the button is not labelled
            "Download PDF": it downloads nothing. */}
        {report !== null && (
          <p className="font-label-mono text-[10px] text-tertiary/40 mt-1 leading-relaxed">
            {t('analysis.print.hint')}
          </p>
        )}
      </div>

      <div className="px-5 py-5">
        <ReadinessBody
          report={report}
          elapsedMs={scanStartedAt === null ? 0 : Math.max(0, now - scanStartedAt)}
          progress={progress}
          domain={target}
          rescanning={phase === 'scanning' && report !== null}
          cachedAt={cachedAt}
          now={now}
          fromCache={fromCache}
          failure={failure}
          failureDetail={failureDetail}
          retryAfterSeconds={retryAfterSeconds}
          expanded={expanded}
          onToggle={(id) =>
            setExpanded((previous) => {
              const next = new Set(previous);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onRetry={start}
        />

        {/* The replica ask comes after the measurement, never before it: the
            agent is given the report to work from, and a visitor who has not
            seen the findings has nothing to compare a replica against. */}
        {report !== null && <ReadinessReplicaAction domain={report.domain} />}
      </div>

      {/* Mounted from the first render, not on click — see `print.css`. The
          portal puts it on `document.body` as a sibling of `#root`, which is the
          only structure from which the stylesheet can delete the app shell
          without deleting the document too. */}
      {report !== null && (
        <ReadinessPrintDocument
          report={report}
          cachedAt={cachedAt}
          printedAt={printedAt}
          fromCache={fromCache}
          locale={i18n.language}
        />
      )}
    </section>
  );
}
