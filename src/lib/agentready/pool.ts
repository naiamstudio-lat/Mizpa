/**
 * One scan per domain per page, shared by every caller.
 *
 * ## Why a pool and not a direct `scanSite` call
 *
 * Two callers want the same scan in normal use, and a third appears the moment
 * anything is tested:
 *
 *  1. The onboarding column, the moment `/app` mounts with a pending URL.
 *  2. The agent's `analyze_site_readiness` tool, on the same domain.
 *  3. **React 19's `StrictMode`**, which is on in `main.tsx` and deliberately
 *     mounts, unmounts and remounts every effect in development. An effect that
 *     scans fires twice, the first run is aborted a frame later, and the upstream
 *     has been asked for two scans of one site.
 *
 * That last one is not a development-only nuisance: the scanner is unauthenticated
 * and capped at 100 requests an hour **per IP**, so a double-fire is 2% of a shared
 * budget spent before the first pixel of the report. And a pool is the honest fix
 * rather than a `useRef` guard, because it also collapses the two real callers
 * onto one scan — the agent and the chat can then never disagree about a grade.
 *
 * ## What a subscriber sees
 *
 * Late subscribers get the progress already recorded, so a component that mounts
 * half a second into a 20 s scan renders the elapsed time that has actually
 * passed rather than restarting at zero. A subscriber that unmounts is dropped
 * without cancelling the scan, because somebody else is probably still waiting.
 * The scan is aborted only when the **last** subscriber leaves.
 */

import { IsAgentReadyClient, type McpTransport } from './mcp';
import { SCAN_BUDGET_MS, ScanError, scanSite, scanTarget, type ScanProgress, type ScanResult } from './scan';
import { readScanCache, writeScanCache, type StorageLike } from './cache';
import type { ReadinessReport } from './report';

type Subscriber = (progress: ScanProgress | null) => void;

interface InFlight {
  promise: Promise<ScanResult>;
  controller: AbortController;
  subscribers: Set<Subscriber>;
  last: ScanProgress | null;
}

/**
 * Keyed by domain, not by the URL as typed.
 *
 * `https://Example.com/docs` and `example.com` are one scan, and the scanner
 * keys its own cache by domain too. Keying on the raw string would give the same
 * site two scans and two cache entries.
 */
const IN_FLIGHT = new Map<string, InFlight>();

export interface RunScanOptions {
  url: string;
  transport: McpTransport;
  /** Where the report is remembered. Omit to disable caching entirely. */
  storage?: StorageLike;
  signal?: AbortSignal;
  onProgress?: Subscriber;
  /** Overridable so the budget and poll interval are drivable without seconds. */
  pollIntervalMs?: number;
  budgetMs?: number;
  /** Injected so "just now" / "4 min ago" is one clock rather than many. */
  now?: () => number;
}

/**
 * The cached report for a target, if there is one, resolved without any I/O
 * beyond the store itself.
 *
 * Exposed separately so the component can render a cached report in the **first**
 * paint instead of after an effect has run and a promise has settled. On a domain
 * the scanner already knows, that is the difference between the analysis being
 * the first thing on screen and appearing a frame later.
 */
export function peekCachedScan(
  url: string,
  storage: StorageLike,
  now: number,
): { report: ReadinessReport; cachedAt: number; stale: boolean } | null {
  let domain: string;
  try {
    domain = scanTarget(url).domain;
  } catch {
    // An unusable target has no cache entry, and `scanSite` will report the real
    // reason. Swallowing it here keeps a bad URL from throwing during render.
    return null;
  }
  const { entry, stale } = readScanCache(storage, domain, now);
  return entry === null ? null : { report: entry.report, cachedAt: entry.cachedAt, stale };
}

/**
 * Scan a target, joining an in-flight scan of the same domain if there is one.
 *
 * Rejects with {@link ScanError}. Every rejection is a `ScanError` rather than a
 * raw transport error, so the UI has exactly one failure type to render and
 * cannot fall through to a blank panel on an unexpected value.
 */
export function runScan(options: RunScanOptions): Promise<ScanResult> {
  let domain: string;
  try {
    domain = scanTarget(options.url).domain;
  } catch (error) {
    return Promise.reject(error instanceof ScanError ? error : new ScanError('invalid_target', String(error)));
  }

  const existing = IN_FLIGHT.get(domain);
  if (existing !== undefined) {
    if (options.onProgress !== undefined) {
      existing.subscribers.add(options.onProgress);
      // Hand over what is already known, so a late subscriber does not render a
      // scan that looks like it just started.
      if (existing.last !== null) options.onProgress(existing.last);
    }
    options.signal?.addEventListener('abort', () => detach(domain, options.onProgress), { once: true });
    return existing.promise;
  }

  const controller = new AbortController();
  const subscribers = new Set<Subscriber>();
  if (options.onProgress !== undefined) subscribers.add(options.onProgress);
  const entry: InFlight = { promise: Promise.resolve(null as never), controller, subscribers, last: null };
  entry.promise = execute(domain, options, entry).finally(() => {
    IN_FLIGHT.delete(domain);
  });
  IN_FLIGHT.set(domain, entry);
  options.signal?.addEventListener('abort', () => detach(domain, options.onProgress), { once: true });
  return entry.promise;
}

/** Stop listening. The scan itself ends only when nobody is left. */
function detach(domain: string, subscriber: Subscriber | undefined): void {
  const entry = IN_FLIGHT.get(domain);
  if (entry === undefined || subscriber === undefined) return;
  entry.subscribers.delete(subscriber);
  if (entry.subscribers.size === 0) entry.controller.abort();
}

async function execute(domain: string, options: RunScanOptions, entry: InFlight): Promise<ScanResult> {
  const now = options.now ?? Date.now;
  const client = new IsAgentReadyClient({ transport: options.transport, timeoutMs: options.budgetMs ?? SCAN_BUDGET_MS + 30_000 });

  const result = await scanSite({
    // The bare domain: `scan_website` takes a full URL and this is one, and using
    // the *pool's* domain rather than the caller's spelling is what guarantees a
    // joined scan is a scan of the same thing.
    url: `https://${domain}`,
    client,
    signal: entry.controller.signal,
    pollIntervalMs: options.pollIntervalMs,
    budgetMs: options.budgetMs,
    onProgress: (progress) => {
      entry.last = progress;
      for (const subscriber of entry.subscribers) {
        try {
          subscriber(progress);
        } catch {
          // One broken render must not stop the others from being told.
        }
      }
    },
  });

  if (options.storage !== undefined) writeScanCache(options.storage, domain, result.report, now());
  return result;
}

/** Drop every in-flight scan. For a page teardown, not for normal use. */
export function abortAllScans(): void {
  for (const entry of IN_FLIGHT.values()) entry.controller.abort();
  IN_FLIGHT.clear();
}

/** How many scans are in flight. Diagnostics only. */
export function inFlightScanCount(): number {
  return IN_FLIGHT.size;
}
