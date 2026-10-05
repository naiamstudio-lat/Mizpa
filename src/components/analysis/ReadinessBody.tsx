import { useTranslation } from 'react-i18next';
import { SCAN_BUDGET_MS, SCAN_POLL_INTERVAL_MS, type ScanFailureCode } from '../../lib/agentready/scan';
import { describeAge } from '../../lib/agentready/cache';
import type { ReadinessCategory, ReadinessReport } from '../../lib/agentready/report';
import type { ScanProgress } from '../../lib/agentready/scan';

/** The most polls a scan can make, for the `check N of M` counter. */
export const MAX_POLLS = Math.ceil(SCAN_BUDGET_MS / SCAN_POLL_INTERVAL_MS);

/**
 * What `SiteReadiness` hands down: the resolved report, or the reason there is
 * none. Two props and no state of its own — this module renders, the sibling owns
 * the lifecycle, and keeping them apart is what lets the report be read without
 * reading the polling loop.
 */
export interface ReadinessBodyProps {
  report: ReadinessReport | null;
  /** Milliseconds since this scan started, ticked locally so the clock moves. */
  elapsedMs: number;
  progress: ScanProgress | null;
  domain: string;
  /** A scan is running behind an already-shown report. */
  rescanning: boolean;
  cachedAt: number | null;
  now: number;
  fromCache: boolean;
  failure: ScanFailureCode | null;
  failureDetail: string | null;
  retryAfterSeconds: number | null;
  expanded: ReadonlySet<string>;
  onToggle: (categoryId: string) => void;
  onRetry: () => void;
}

/**
 * The body of the analysis panel: progress, then the report, then the failure.
 *
 * ## The rule this file exists to enforce
 *
 * The scanner's own `llms.txt` states that it "does not run agent tasks or
 * predict task success" and that "static scores do not predict agent task
 * success", and every report carries
 * `score_context.outcome_validation: "not_a_prediction_of_agent_task_success"`.
 *
 * So there is no "verdict", no "ready / not ready" badge, and no copy that treats
 * the grade as an outcome. What is rendered is a **measured coverage figure over
 * the signals a site publishes** and that figure's grade band — and the disclaimer
 * sits immediately under the number, in the same weight as the labels, because
 * the whole failure mode of showing a static score is that it gets read as a
 * verdict. A product that calls it one is making a claim its own data source
 * refuses to make, and the visitor cannot check which of the two is lying.
 */
export function ReadinessBody(props: ReadinessBodyProps) {
  const { report, progress, domain, elapsedMs, rescanning, failure, onRetry } = props;

  if (report === null) {
    return (
      <>
        <ProgressBody progress={progress} domain={domain} elapsedMs={elapsedMs} />
        {failure !== null && (
          <FailureBody
            code={failure}
            detail={props.failureDetail}
            retryAfterSeconds={props.retryAfterSeconds}
            onRetry={onRetry}
          />
        )}
      </>
    );
  }

  return (
    <>
      {rescanning && (
        <p className="font-label-mono text-[10px] text-primary mb-4" data-testid="readiness-rescanning">
          <RescanningLabel />
        </p>
      )}
      <ReportBody
        report={report}
        cachedAt={props.cachedAt}
        now={props.now}
        fromCache={props.fromCache}
        expanded={props.expanded}
        onToggle={props.onToggle}
      />
      {failure !== null && (
        <FailureBody
          code={failure}
          detail={props.failureDetail}
          retryAfterSeconds={props.retryAfterSeconds}
          onRetry={onRetry}
        />
      )}
    </>
  );
}

function RescanningLabel() {
  const { t } = useTranslation();
  return <>{t('analysis.rescanning')}</>;
}

/**
 * The 15-30 seconds, reported honestly.
 *
 * Three things and no percentage: the phase in words, a clock that ticks every
 * second, and the poll count against the maximum. A determinate bar would need a
 * total the protocol does not have; a percentage of an unknown total is a lie
 * with a decimal point, and an indefinite spinner was ruled out for the same
 * reason this panel exists.
 */
function ProgressBody({
  progress,
  domain,
  elapsedMs,
}: {
  progress: ScanProgress | null;
  domain: string;
  elapsedMs: number;
}) {
  const { t } = useTranslation();

  if (progress === null) {
    return (
      <div data-testid="readiness-progress">
        <p className="font-label-mono text-label-mono text-tertiary mb-3">
          {t('analysis.progress.connecting')}
        </p>
        <Elapsed elapsedMs={elapsedMs} />
      </div>
    );
  }

  const key =
    progress.phase === 'waiting'
      ? 'analysis.progress.waiting'
      : progress.phase === 'scanning'
        ? 'analysis.progress.scanning'
        : progress.phase === 'starting'
          ? 'analysis.progress.starting'
          : 'analysis.progress.connecting';

  return (
    <div data-testid="readiness-progress">
      <p className="font-label-mono text-label-mono text-on-surface mb-3">
        {t(key, { domain: progress.domain ?? domain, polls: progress.polls, maxPolls: MAX_POLLS })}
      </p>
      <div className="flex items-center gap-3">
        {/* Determinate over the polls that can still happen. The unit is real —
            one poll is one request — so this is not a decorative placeholder that
            jumps from 10% to 100%. */}
        <div className="flex-1 h-1 bg-white/5 overflow-hidden" role="presentation">
          <div
            className="h-full bg-primary transition-[width] duration-500"
            style={{ width: `${Math.min(100, Math.round((progress.polls / MAX_POLLS) * 100))}%` }}
          />
        </div>
        <Elapsed elapsedMs={elapsedMs} />
      </div>
    </div>
  );
}

function Elapsed({ elapsedMs }: { elapsedMs: number }) {
  return (
    <span
      className="font-label-mono text-[10px] text-tertiary tabular-nums shrink-0"
      data-testid="readiness-elapsed"
    >
      {Math.round(elapsedMs / 1000)}s
    </span>
  );
}

function ReportBody({
  report,
  cachedAt,
  now,
  fromCache,
  expanded,
  onToggle,
}: {
  report: ReadinessReport;
  cachedAt: number | null;
  now: number;
  fromCache: boolean;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const actionable = report.issues.filter((issue) => issue.status === 'fail' || issue.status === 'partial');

  return (
    <div>
      {/* --- grade and score, and the three facts that make them trustworthy --- */}
      <div className="flex items-start gap-6 flex-wrap mb-4">
        <div>
          <p className="font-label-mono text-[10px] text-tertiary/60 uppercase tracking-widest">
            {t('analysis.grade')}
          </p>
          <p
            className="font-display-lg text-display-lg leading-none text-primary"
            data-testid="readiness-grade"
          >
            {report.letterGrade}
          </p>
        </div>
        <div>
          <p className="font-label-mono text-[10px] text-tertiary/60 uppercase tracking-widest">
            {t('analysis.score')}
          </p>
          <p className="font-display-lg text-display-lg leading-none text-on-surface" data-testid="readiness-score">
            {t('analysis.scoreOf', { score: report.overallScore })}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="font-label-mono text-[10px] text-tertiary/60">
            {t('analysis.methodology', { version: report.methodologyVersion })}
          </p>
          {cachedAt !== null && (
            <p className="font-label-mono text-[10px] text-tertiary/40">
              {t('analysis.measuredAgo', { age: describeAge(cachedAt, now) })}
            </p>
          )}
          {fromCache && <p className="font-label-mono text-[10px] text-tertiary/40">{t('analysis.fromCache')}</p>}
        </div>
      </div>

      {/* The disclaimer is not a footnote. It sits immediately after the number
          it qualifies, in the same visual weight as the labels. */}
      <p
        className="font-label-mono text-[10px] text-tertiary/60 leading-relaxed border-l-2 border-primary/30 pl-3 mb-5"
        data-testid="readiness-disclaimer"
      >
        {t('analysis.notAVerdict')}
      </p>

      {report.accessBlockers.length > 0 && (
        <div className="border border-primary/40 bg-primary/5 px-4 py-3 mb-5">
          <p className="font-label-mono text-label-mono text-primary mb-1">{t('analysis.blockersTitle')}</p>
          <p className="font-label-mono text-[10px] text-tertiary mb-2">
            {t('analysis.blockersFound', { count: report.accessBlockers.length })}
          </p>
          <ul className="space-y-2">
            {report.accessBlockers.map((issue) => (
              <li key={issue.id} className="font-label-mono text-[10px] text-on-surface/90">
                <span className="text-primary">{issue.name}</span> — {issue.evidence}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="font-label-mono text-[10px] text-tertiary/60 mb-3">
        {t('analysis.issuesFound', { count: actionable.length })}
      </p>

      {/* --- the failing signals, grouped by the scanner's own categories --- */}
      <div className="space-y-4">
        {report.categories.map((category) => (
          <CategoryBlock
            key={category.id}
            category={category}
            expanded={expanded.has(category.id)}
            onToggle={() => onToggle(category.id)}
          />
        ))}
      </div>

      {report.reportUrl !== null && (
        <a
          href={report.reportUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-block mt-5 font-label-mono text-[10px] text-primary hover:underline"
        >
          {t('analysis.fullReport')} ↗
        </a>
      )}
    </div>
  );
}

function CategoryBlock({
  category,
  expanded,
  onToggle,
}: {
  category: ReadinessCategory;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const hasIssues = category.issues.length > 0;

  return (
    <div className="border border-white/5" data-testid={`readiness-category-${category.id}`}>
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasIssues}
        aria-expanded={hasIssues ? expanded : undefined}
        className="w-full px-4 py-3 flex items-center gap-3 text-left bg-transparent border-none cursor-pointer disabled:cursor-default"
      >
        <span className="font-label-mono text-label-mono text-on-surface flex-1 min-w-0 truncate">
          {category.label}
        </span>
        {category.applicable ? (
          <span className="font-label-mono text-[10px] text-tertiary tabular-nums shrink-0">
            {category.grade ?? '—'} · {category.score}/{category.maxScore}
          </span>
        ) : (
          <span className="font-label-mono text-[10px] text-tertiary/40 shrink-0">
            {t('analysis.notApplicable')}
          </span>
        )}
        {hasIssues && (
          <span className="font-label-mono text-[10px] text-primary tabular-nums shrink-0">
            {category.issues.length}
          </span>
        )}
      </button>

      {hasIssues && expanded && (
        <ul className="border-t border-white/5 divide-y divide-white/5">
          {category.issues.map((issue) => (
            <li key={`${category.id}-${issue.id}`} className="px-4 py-3">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-label-mono text-[10px] text-tertiary/50 shrink-0">{issue.id}</span>
                <span className="font-label-mono text-label-mono text-on-surface flex-1 min-w-0">{issue.name}</span>
                {issue.scoreDelta !== null && issue.scoreDelta > 0 && (
                  <span className="font-label-mono text-[10px] text-primary shrink-0">
                    {t('analysis.scoreDelta', { delta: issue.scoreDelta })}
                  </span>
                )}
              </div>
              {issue.evidence !== '' && (
                <p className="font-label-mono text-[10px] text-tertiary/70 mt-1 leading-relaxed">
                  {issue.evidence}
                </p>
              )}
              {issue.recommendation !== null && (
                <p className="font-label-mono text-[10px] text-on-surface/80 mt-2 leading-relaxed">
                  <span className="text-tertiary/50">{t('analysis.recommendation')}: </span>
                  {issue.recommendation}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The failure state.
 *
 * Never blank, and never a single "something went wrong". Each code gets its own
 * sentence, because `unreachable` (Mizpa's relay is down) and `invalid_target`
 * (the address is not a website) ask completely different things of the reader,
 * and the scanner's own words are shown underneath when it gave any.
 */
function FailureBody({
  code,
  detail,
  retryAfterSeconds,
  onRetry,
}: {
  code: ScanFailureCode;
  detail: string | null;
  retryAfterSeconds: number | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="border border-primary/40 bg-primary/5 px-4 py-4 mt-4"
      data-testid="readiness-error"
      role="alert"
    >
      <p className="font-label-mono text-label-mono text-primary mb-1">{t('analysis.error.heading')}</p>
      <p className="font-label-mono text-[10px] text-on-surface/90 leading-relaxed">
        {/* `defaultValue` is the safety net for a code this build has no copy for:
            an unmapped key renders as the raw key string, which is the one outcome
            this component exists to make impossible. */}
        {t(`analysis.error.${code}`, { defaultValue: t('analysis.error.unknown') })}
      </p>
      {/* The scanner's own `Retry-After`, in minutes. "Too many requests" with no
          wait time is the least actionable error a service can hand out, and a
          visitor told to try again and then refused again has been told something
          false — this number is what makes the advice true. */}
      {retryAfterSeconds !== null && (
        <p className="font-label-mono text-[10px] text-primary mt-2">
          {t('analysis.error.retryAfter', { minutes: Math.max(1, Math.round(retryAfterSeconds / 60)) })}
        </p>
      )}
      {detail !== null && detail !== '' && (
        <p className="font-label-mono text-[10px] text-tertiary/60 mt-2 break-words">
          {t('analysis.error.detail', { detail })}
        </p>
      )}
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 font-label-mono text-[10px] text-primary hover:underline bg-transparent border border-primary/40 rounded px-3 py-1 cursor-pointer"
      >
        {t('analysis.error.retry')}
      </button>
    </div>
  );
}
