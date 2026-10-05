/**
 * Running one scan to a report, with progress the UI can actually show.
 *
 * ## The two facts that shape this file
 *
 * **1. The scan is asynchronous and the scan that needs polling is the rare
 * one.** Measured against the live server on 2026-10-02:
 *
 *   - `scan_website { url }` on an **already-scanned** domain returns the
 *     complete report immediately (146 KB, `status: "completed"`). No polling.
 *   - `scan_website { url }` on a **new** domain returns
 *     `{ state: "started", domain, report_url, message }` and the message says
 *     "typically takes 15-30 seconds".
 *   - `get_scan_results { domain }` during that window returns
 *     `{ state: "not_found", message: "No scan found for …" }`.
 *
 * That last one is the trap. `not_found` is *also* what the tool returns for a
 * domain nobody ever scanned, so a poll loop that treats it as terminal gives up
 * in 2.5 s on every uncached domain and a loop that treats it as in-flight waits
 * forever on a typo. The resolution is that **only this module knows whether a
 * scan was started**, so it is the only place that can tell those apart. See
 * `readScanState` in `report.ts` and the `notFoundIsTerminal` flag below.
 *
 * **2. The upstream is unauthenticated and rate-limited per IP.**
 * `ratelimit-policy: hourly;q=100;w=3600`, measured. Every user of a deployed
 * Mizpa behind one office NAT shares those 100 requests. That is why
 * `SCAN_POLL_INTERVAL_MS` is 5 s and not 2 s, why the budget is 60 s and not
 * 30 s (a slow scan costs *fewer* polls, not more), and why `cache.ts` exists
 * and is mandatory rather than an optimisation. An uncached scan costs 1 + 12
 * requests worst case; a cached one costs 0.
 *
 * ## Why there is one function and not two
 *
 * The agent's tool and the onboarding both need this, and the agent cannot
 * complete a turn in this environment. Duplicating the flow for the UI would mean
 * two poll loops to keep correct and a bug fixed in one. `scanSite` is the whole
 * flow; `src/lib/fx/tools.ts` wraps it in a libfx tool result and the chat
 * column subscribes to `onProgress`. Same code, same failure modes, same report.
 */

import { IsAgentReadyClient, McpError, isArgumentFailure, parseArgumentViolations } from './mcp';
import { ReportError, type ReadinessReport, readScanState } from './report';

/**
 * Between polls. 5 s, not 2 s, because of the hourly rate limit above: a
 * 15-30 s scan costs 3-6 requests instead of 8-15, and the progress the user
 * sees is a countdown either way.
 */
export const SCAN_POLL_INTERVAL_MS = 5_000;

/**
 * The whole budget for an uncached scan. The scanner says 15-30 s; 60 s is
 * double its own worst case, so a scan that has not landed by then is treated as
 * failed rather than left spinning. The failure names the domain and offers a
 * retry, which is recoverable; an indefinite spinner is not.
 */
export const SCAN_BUDGET_MS = 60_000;

/** Why a scan did not produce a report. Each renders a different panel. */
export type ScanFailureCode =
  /** The URL is not something the scanner can be asked about. */
  | 'invalid_target'
  /** A domain the scanner has never seen and would not start a scan for. */
  | 'not_found'
  /** Never left the page: offline, DNS, TLS, or blocked by CORS. */
  | 'unreachable'
  /** A response arrived but was not a report. */
  | 'protocol'
  /** Our own call was wrong — the wrong argument name, or a dropped session. */
  | 'bad_request'
  /** The scanner's per-IP budget is spent. Carries a real wait time. */
  | 'rate_limited'
  /** The budget ran out mid-scan. */
  | 'timeout'
  /** The caller aborted. */
  | 'cancelled';

export class ScanError extends Error {
  constructor(
    readonly code: ScanFailureCode,
    message: string,
    /** The scanner's own words, when it gave any. Shown under the message. */
    readonly detail: string | null = null,
    /** Seconds the scanner asked us to wait, from `Retry-After`. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ScanError';
  }
}

/** Where a scan is, for the progress panel. Every value is renderable as-is. */
export type ScanPhase =
  /** Handshaking with the scanner. */
  | 'connecting'
  /** Asked for a scan; the scanner is deciding between cache and crawl. */
  | 'starting'
  /** Crawling. This is the 15-30 s the scanner warns about. */
  | 'scanning'
  /** One poll returned, not the report yet. */
  | 'waiting'
  /** A report is in hand. */
  | 'ready'
  /** It failed, and `ScanError.code` says how. */
  | 'failed';

export interface ScanProgress {
  phase: ScanPhase;
  /** The domain being scanned, known from the first response onwards. */
  domain: string | null;
  /** Wall-clock milliseconds since the scan began. Drives the countdown. */
  elapsedMs: number;
  /** How many `get_scan_results` polls have come back empty. */
  polls: number;
  /** Did the scanner answer from cache, so there was nothing to wait for? */
  cached: boolean;
  /** The scanner's own `message`, when it sent one. */
  detail: string | null;
}

export interface ScanResult {
  report: ReadinessReport;
  /** `true` when the scanner already had this domain and no crawl ran. */
  cached: boolean;
  elapsedMs: number;
}

export interface ScanOptions {
  /** A full URL, or a bare domain. Normalised by `scanTarget`. */
  url: string;
  client: IsAgentReadyClient;
  signal?: AbortSignal;
  onProgress?: (progress: ScanProgress) => void;
  /** Overridable so the budget and the interval are testable without seconds. */
  pollIntervalMs?: number;
  budgetMs?: number;
}

/**
 * The subject of a scan, as the scanner names it.
 *
 * `scan_website` takes a **full URL** and `get_scan_results` takes a **bare
 * domain**, and the two do not accept each other's value — sending the wrong one
 * is a structured `invalid_arguments` failure, not a no-op. Everything else in
 * this module therefore works in terms of the domain and only the very first
 * call sees a URL.
 *
 * Refused rather than repaired: a string that is not a hostname is a typo, and
 * quietly scanning `https://example` or `example .com` would produce a confident
 * panel about a site the user never named.
 */
export function scanTarget(input: string): { domain: string; url: string } {
  const trimmed = input.trim();
  if (trimmed === '') throw new ScanError('invalid_target', 'no URL was given');

  // A bare host: `example.com`, `example.com/path`, `localhost:3000`.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ScanError('invalid_target', `"${trimmed}" is not a URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ScanError('invalid_target', `"${trimmed}" must be an http or https URL`);
  }

  // `hostname` is already punycoded and lowercased by the URL parser, and
  // carries no port, no path, no credentials and no userinfo.
  const domain = parsed.hostname;
  if (domain === '' || /[^a-z0-9.-]/.test(domain)) {
    throw new ScanError('invalid_target', `"${trimmed}" does not contain a hostname`);
  }
  return { domain, url: `https://${domain}` };
}

/**
 * Scan a site and resolve to its report.
 *
 * Rejects with {@link ScanError}; every rejection carries a `code` the UI
 * branches on, because "the scan failed" and "that is not a website" and "the
 * scanner is unreachable" are three different things to tell someone and none of
 * them is an excuse for an empty panel.
 */
export async function scanSite(options: ScanOptions): Promise<ScanResult> {
  const { domain, url } = scanTarget(options.url);
  const interval = options.pollIntervalMs ?? SCAN_POLL_INTERVAL_MS;
  const budget = options.budgetMs ?? SCAN_BUDGET_MS;
  const startedAt = Date.now();
  let polls = 0;

  const emit = (phase: ScanPhase, extra: Partial<ScanProgress> = {}): void => {
    options.onProgress?.({
      phase,
      domain,
      elapsedMs: Date.now() - startedAt,
      polls,
      cached: false,
      detail: null,
      ...extra,
    });
  };

  emit('connecting');
  abortIfCancelled(options.signal);

  // --- 1. ask for the scan, which is also the cache lookup -----------------
  //
  // `scan_website` is called before `get_scan_results` on purpose, even though
  // the scanner's own docs suggest "prefer `get_scan_results` before starting a
  // new scan". Two reasons, both measured: `scan_website` on a cached domain
  // returns the report directly, so the happy path costs **one** request instead
  // of two; and the polling domain is then the scanner's own answer rather than
  // a domain this module derived, so a `www.` or punycode surprise cannot send
  // the poll somewhere the scan was never started.
  let first: ReturnType<typeof readScanState>;
  try {
    const value = await options.client.callTool('scan_website', { url }, options.signal);
    first = readScanState(value);
  } catch (error) {
    throw toScanError(error, 'scan_website');
  }

  abortIfCancelled(options.signal);
  if (first.kind === 'report') {
    emit('ready', { cached: true });
    return { report: first.report, cached: true, elapsedMs: Date.now() - startedAt };
  }
  if (first.kind === 'not_found') {
    // `scan_website` refusing to start is terminal. There is nothing to poll.
    throw new ScanError('not_found', first.message || `${domain} could not be scanned`, first.message);
  }

  const scanDomain = first.domain || domain;
  emit('scanning', { domain: scanDomain, detail: first.message });

  // --- 2. poll until the report lands or the budget does -------------------
  //
  // The budget is checked once, at the top, and it is the only authority on when
  // to give up — an exit code that is also computed from a stale deadline is how
  // a poll loop ends up giving up early on a slow scan or late on a fast one.
  //
  // A `not_found` answer here is *not* terminal. It means "no row yet": measured,
  // the scanner answers exactly that for the whole 15-30 s crawl even though this
  // module is the thing that started it. It would be the same answer for a
  // domain nobody ever scanned, and the difference between the two cases is
  // precisely that this function started one.
  const deadline = startedAt + budget;
  for (;;) {
    if (Date.now() >= deadline) {
      throw new ScanError('timeout', `${scanDomain} was still being scanned after ${Math.round(budget / 1000)}s`);
    }
    await sleep(interval, options.signal);
    abortIfCancelled(options.signal);
    polls += 1;
    emit('waiting', { detail: first.message });

    let polled: ReturnType<typeof readScanState>;
    try {
      const value = await options.client.callTool('get_scan_results', { domain: scanDomain }, options.signal);
      polled = readScanState(value);
    } catch (error) {
      throw toScanError(error, 'get_scan_results');
    }

    // `started` from a poll means the scanner queued the work again; keep going.
    if (polled.kind === 'report') {
      emit('ready', { polls });
      return { report: polled.report, cached: false, elapsedMs: Date.now() - startedAt };
    }
  }
}

/**
 * Map whatever the client threw onto a `ScanError`.
 *
 * The distinction that matters: `invalid_arguments` is **our** bug — the wrong
 * argument name for the tool — and it is reported as `bad_request` with the
 * server's violation list, because that is what makes it fixable. Everything
 * else about a tool failure is a domain the scanner will not touch.
 */
function toScanError(error: unknown, tool: string): ScanError {
  if (error instanceof ScanError) return error;
  if (error instanceof ReportError) return new ScanError('protocol', error.message, error.received);
  if (error instanceof McpError) {
    if (error.failure === 'aborted') return new ScanError('cancelled', 'the scan was cancelled');
    if (error.failure === 'unreachable') return new ScanError('unreachable', error.message, error.detail);
    if (error.failure === 'protocol') return new ScanError('protocol', error.message, error.detail);
    if (error.failure === 'rate_limited') {
      return new ScanError('rate_limited', error.message, error.detail, error.retryAfterSeconds);
    }
    if (error.failure === 'tool') {
      const text = error.detail ?? '';
      if (isArgumentFailure(text)) {
        const violations = parseArgumentViolations(text)
          .map((violation) => `${violation.path || '(root)'} ${violation.message}`)
          .join('; ');
        return new ScanError('bad_request', `${tool} was called with the wrong arguments`, violations || text);
      }
      if (/no scan found/i.test(text)) {
        return new ScanError('not_found', text);
      }
      return new ScanError('protocol', `${tool} failed`, text);
    }
    return new ScanError('protocol', error.message, error.detail);
  }
  return new ScanError('protocol', 'the scan failed', error instanceof Error ? error.message : String(error));
}

function abortIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new ScanError('cancelled', 'the scan was cancelled');
}

/**
 * Cancellable sleep.
 *
 * `setTimeout` alone would keep a scan's timer alive after the user navigated
 * away, and the next tick would then fire a request for a component that no
 * longer exists. The signal's own reject is the cancellation.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal === undefined) {
      setTimeout(resolve, ms);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(new ScanError('cancelled', 'the scan was cancelled'));
    }
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
