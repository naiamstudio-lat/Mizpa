/**
 * The IsAgentReady report, narrowed to what Mizpa renders.
 *
 * ## Why this file exists at all
 *
 * The measured report for `example.com` is **146 KB** of JSON. It carries
 * `browser_journeys` with per-journey visual hashes and accessibility trees,
 * `training_exposure` checks, `surfaces` classification, per-checkpoint
 * `references` arrays and `code_example` blobs. The chat column needs a grade,
 * a score, a methodology version and the failing issues with their evidence —
 * about 4 KB of it.
 *
 * Normalising here rather than in the component is what keeps the two honest
 * together: there is exactly one place that knows which upstream fields the
 * product is willing to present, and a field the normaliser drops is a field the
 * UI cannot accidentally start implying something about. It also means a
 * methodology bump that renames a field fails in one readable place instead of
 * as a blank panel.
 *
 * ## What the score is, and what it is not
 *
 * The source says so itself, twice, and the two statements are preserved in the
 * payload rather than paraphrased away:
 *
 *   - `score_context.outcome_validation: "not_a_prediction_of_agent_task_success"`
 *     (measured on the live report) — carried through as
 *     {@link ReadinessReport.outcomeValidation}.
 *   - `llms.txt`: "The scanner does not run agent tasks or predict task
 *     success" and "static scores do not predict agent task success."
 *
 * So the number is a **measured coverage figure over published technical
 * signals** — how much of the applicable, stable-core web surface this site
 * actually publishes — and the UI must present it that way. A card that called
 * it a "readiness verdict", or a "will the agent succeed" badge, would be
 * asserting something the source explicitly disclaims.
 *
 * `methodology_version` (`2026-09-02` measured) travels with every report and is
 * displayed. Scores are not comparable across versions, so a cached report from
 * an older methodology is never silently re-used — see `cache.ts`.
 */

/** The five category ids the scanner publishes, in its own order. */
export const REPORT_CATEGORY_IDS = [
  'discovery',
  'structured_data',
  'semantics',
  'agent_protocols',
  'security',
] as const;

export type ReportCategoryId = (typeof REPORT_CATEGORY_IDS)[number] | 'unknown';

export type IssueStatus = 'fail' | 'partial' | 'pass' | 'skip';

export interface ReadinessIssue {
  id: string;
  name: string;
  category: ReportCategoryId;
  status: IssueStatus;
  /** The scanner's own sentence describing what it measured. Rendered verbatim. */
  evidence: string;
  recommendation: string | null;
  /** `essential`, `recommended` or `emerging`, per the scanner's policy. */
  maturity: string | null;
  /** Points the scanner says this checkpoint is worth at most. */
  potentialGain: number | null;
  /** Whole points this issue is worth *right now*, per the scanner's own maths. */
  scoreDelta: number | null;
  /** Does this issue stop an agent reading the site at all? */
  accessBlocker: boolean;
}

export interface ReadinessCategory {
  id: ReportCategoryId;
  /** The scanner's label, e.g. `AI Search Signals`. */
  label: string;
  /** Points earned over the checkpoints in this category. */
  score: number;
  maxScore: number;
  /** The scanner's letter for this category, or `null` when not applicable. */
  grade: string | null;
  /** A category with no applicable checkpoints is reported, not hidden. */
  applicable: boolean;
  issues: ReadinessIssue[];
}

export interface ReadinessReport {
  domain: string;
  letterGrade: string;
  /** 0-100 over the applicable stable-core surface, per the scanner. */
  overallScore: number;
  /** e.g. `2026-09-02`. Scores are only comparable within one version. */
  methodologyVersion: string;
  scannedAt: string | null;
  /** The scanner's own scope statement. Rendered, not replaced. */
  outcomeValidation: string;
  /** What the score covered, in the scanner's words. */
  scope: string;
  categories: ReadinessCategory[];
  /**
   * Every failing or partial checkpoint, in one list.
   *
   * Kept alongside the per-category grouping because the two answer different
   * questions: "how am I doing on security" and "what is the single thing worth
   * fixing first". The `accessBlockers` are lifted out of this list on purpose —
   * a blocker is a different kind of finding and burying it in a flat list of 20
   * is how a site that agents cannot read at all still looks like a D.
   */
  issues: ReadinessIssue[];
  accessBlockers: ReadinessIssue[];
  /** Public report link, resolved against the scanner's origin. */
  reportUrl: string | null;
  snapshotUrl: string | null;
}

const SCANNER_ORIGIN = 'https://isagentready.com';

export class ReportError extends Error {
  constructor(message: string, readonly received: string) {
    super(message);
    this.name = 'ReportError';
  }
}

/**
 * What the scanner answered instead of a report.
 *
 * Two states, and they mean opposite things. `started` is a scan in flight and
 * the caller should keep polling. `not_found` is "I have never seen this
 * domain" — the terminal failure for a `get_scan_results` that was not preceded
 * by a `scan_website`, and a *transient* state for one that was.
 */
export type ScanState =
  | { kind: 'report'; report: ReadinessReport }
  | { kind: 'started'; domain: string; reportUrl: string | null; message: string }
  | { kind: 'not_found'; domain: string; message: string };

const IN_FLIGHT_STATES = new Set(['started', 'running', 'pending', 'queued', 'scanning']);

/**
 * Read a tool payload as a scan state.
 *
 * A payload is a report when it carries a `methodology_version` **and** a
 * `status`. Testing for `status` alone is not enough — a `get_scan_results` on
 * an unknown domain also answers, with neither — and testing for
 * `methodology_version` alone is not enough either, because a future
 * partial result could carry one without being finished. Both, plus the absence
 * of an in-flight `state`, is what makes this a report rather than a guess.
 *
 * The two in-flight-looking states are **opposite** outcomes and conflating them
 * is the bug this function exists to prevent: `started` means keep polling, and
 * `not_found` means there is nothing to poll for. Measured, both from the live
 * server on the same tool.
 */
export function readScanState(value: unknown): ScanState {
  if (typeof value !== 'object' || value === null) {
    throw new ReportError('the scanner returned something that is not a report', describe(value));
  }
  const row = value as Record<string, unknown>;
  const state = typeof row.state === 'string' ? row.state : '';
  const isReport =
    typeof row.methodology_version === 'string' &&
    typeof row.status === 'string' &&
    IN_FLIGHT_STATES.has(state) === false &&
    state !== 'not_found';

  if (isReport) return { kind: 'report', report: normalizeReport(row) };

  if (IN_FLIGHT_STATES.has(state)) {
    return {
      kind: 'started',
      domain: text(row.domain),
      reportUrl: absoluteLink(row.report_url),
      message: text(row.message),
    };
  }
  // Measured quirk: an in-flight scan polls as `not_found`, not as `running` —
  // the scanner has no row to return until the crawl finishes. So `not_found` is
  // the terminal answer only when nothing was started; the caller knows which,
  // because it is the one that called `scan_website`.
  if (state === 'not_found' || /no scan found/i.test(text(row.message))) {
    return { kind: 'not_found', domain: text(row.domain), message: text(row.message) || 'no scan found' };
  }
  throw new ReportError('the scanner returned a report shape this app does not understand', describe(value));
}

function normalizeReport(row: Record<string, unknown>): ReadinessReport {
  const issues = readIssues(row.issues);
  const categories = readCategories(row.categories, issues);
  const blockers = issues.filter((issue) => issue.accessBlocker);
  const context = object(row.score_context);

  return {
    domain: text(row.domain),
    letterGrade: text(row.letter_grade) || '?',
    overallScore: number(row.overall_score) ?? 0,
    methodologyVersion: text(row.methodology_version) || 'unknown',
    scannedAt: text(row.scanned_at) || null,
    // Kept even when absent, so a future report cannot quietly lose the
    // disclaimer the copy depends on: an empty string renders as a warning
    // rather than as a clean bill of health.
    outcomeValidation: text(context?.outcome_validation),
    scope: text(context?.scope),
    categories,
    issues,
    accessBlockers: blockers,
    reportUrl: absoluteLink(row.report_url),
    snapshotUrl: absoluteLink(row.snapshot_url),
  };
}

function readCategories(value: unknown, issues: ReadinessIssue[]): ReadinessCategory[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = object(entry);
    if (row === null) return [];
    const id = categoryId(row.id ?? row.category);
    return [
      {
        id,
        label: text(row.label) || id,
        score: number(row.score) ?? number(row.applicable_score) ?? 0,
        maxScore: number(row.max_score) ?? number(row.applicable_max_score) ?? 0,
        grade: text(row.grade) || null,
        applicable: row.applicable !== false,
        // Grouped from the flat issue list rather than from each category's own
        // `checkpoints`: those carry `details` and `references` the chat column
        // does not render, and joining them would mean two sources for one
        // issue. The scanner's `issues[]` is the deduplicated failing set.
        issues: issues.filter((issue) => issue.category === id),
      },
    ];
  });
}

function readIssues(value: unknown): ReadinessIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = object(entry);
    if (row === null) return [];
    const impact = object(row.score_impact);
    return [
      {
        id: text(row.id),
        name: text(row.name) || text(row.id),
        category: categoryId(row.category),
        status: status(row.status),
        evidence: text(row.details) || text(row.evidence),
        recommendation: text(row.recommendation) || null,
        maturity: text(row.maturity) || null,
        potentialGain: number(row.potential_gain),
        scoreDelta: number(impact?.score_delta),
        accessBlocker: row.access_blocker === true,
      },
    ];
  });
}

function categoryId(value: unknown): ReportCategoryId {
  const id = text(value);
  return (REPORT_CATEGORY_IDS as readonly string[]).includes(id) ? (id as ReportCategoryId) : 'unknown';
}

function status(value: unknown): IssueStatus {
  const id = text(value);
  return id === 'pass' || id === 'skip' || id === 'partial' ? id : 'fail';
}

/**
 * The scanner's `report_url` is a **path**, not a URL (`/en/scan/example.com`).
 * Rendering it raw would produce a dead link, so it is resolved here — against
 * the scanner's own origin, never against the app's, because these are links
 * out to a third party and not routes of ours.
 */
function absoluteLink(value: unknown): string | null {
  const href = text(value);
  if (href === '') return null;
  if (/^https?:\/\//i.test(href)) return href;
  return `${SCANNER_ORIGIN}${href.startsWith('/') ? '' : '/'}${href}`;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A bounded description of an unusable payload, for the failure panel. */
function describe(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  const json = JSON.stringify(value);
  return json.length > 200 ? `${json.slice(0, 200)}…` : json;
}
