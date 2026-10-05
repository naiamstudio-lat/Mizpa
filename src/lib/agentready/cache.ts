/**
 * The report cache.
 *
 * Not an optimisation. The upstream is unauthenticated and rate-limited per IP
 * (`ratelimit-policy: hourly;q=100;w=3600`, measured 2026-10-02), and every
 * visitor of a deployed Mizpa behind one office, one mobile carrier or one NAT
 * shares that budget. Without a cache, a hundred page loads an hour exhaust it
 * and the next visitor gets an error for something that is a *shared* resource,
 * not something they did. The cache is what makes the feature survivable.
 *
 * ## The one rule this file will not bend
 *
 * **A cached report is never presented as fresh, and never compared against a
 * report from a different methodology.** Three things follow from it:
 *
 *  1. Every entry carries the `methodology_version` it was measured under, and
 *     the UI renders it. The scanner versions its weights and grade bands, so a
 *     number from `2026-09-02` and one from a later version are not the same
 *     measurement and their difference means nothing.
 *  2. A fresh scan whose version differs from the cached one **replaces** the
 *     entry and the UI is told the version moved, rather than two numbers being
 *     shown side by side as if they were comparable.
 *  3. `cachedAt` is stored and displayed as an age. "Measured 4 hours ago" and
 *     "measured just now" are different claims and the panel says which.
 *
 * ## Why `sessionStorage` and not `localStorage`
 *
 * The report is 4 KB after normalisation and is scoped to one analysis session.
 * `localStorage` would keep it for weeks, which is exactly long enough for a site
 * to have changed and short enough that nobody would notice. `sessionStorage`
 * dies with the tab, so the worst case is one re-scan per tab — and a re-scan on
 * a domain the scanner already has costs **one** request and no crawl.
 */

import type { ReadinessReport } from './report';

/** Key prefix. One entry per domain. */
const KEY_PREFIX = 'mizpa.scan.';

/**
 * How long a cached report is shown without asking again.
 *
 * 6 hours: long enough that a visitor who reloads, or comes back after a coffee,
 * is not made to wait on a crawl; short enough that the "measured N ago" label
 * is never more than a working day out of date.
 */
export const SCAN_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface CachedScan {
  report: ReadinessReport;
  /** `Date.now()` when the report was received, not when it was first scanned. */
  cachedAt: number;
}

export interface CacheLookup {
  /** The stored report, or `null` when there is nothing usable. */
  entry: CachedScan | null;
  /**
   * `true` when an entry exists but is past its TTL. The caller shows it
   * immediately, labelled with its real age, and starts a rescan behind it.
   */
  stale: boolean;
}

/** The parts of the Web Storage API this module needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function scanCacheKey(domain: string): string {
  return `${KEY_PREFIX}${domain}`;
}

/**
 * Read the entry for a domain.
 *
 * An unreadable store, a truncated value or a value from an older build of this
 * normaliser all return no entry. A cache that cannot be trusted is not a cache;
 * every one of those paths ends in a fresh scan, which is the correct behaviour.
 */
export function readScanCache(storage: StorageLike, domain: string, now: number): CacheLookup {
  let raw: string | null;
  try {
    raw = storage.getItem(scanCacheKey(domain));
  } catch {
    return { entry: null, stale: false };
  }
  if (raw === null) return { entry: null, stale: false };

  const entry = parseEntry(raw);
  if (entry === null) {
    // Poisoned by an older schema. Dropping it is not optional: leaving it would
    // mean re-parsing the same untrusted value on every single load.
    try {
      storage.removeItem(scanCacheKey(domain));
    } catch {
      // Nothing to do — the next read will fail the same way and cost the same.
    }
    return { entry: null, stale: false };
  }
  return { entry, stale: now - entry.cachedAt > SCAN_CACHE_TTL_MS };
}

/**
 * Store a report.
 *
 * Replaces unconditionally, including across a methodology change. Two reports of
 * different versions must never coexist for one domain, because the only way to
 * pick between them later would be to guess which one the user saw.
 */
export function writeScanCache(storage: StorageLike, domain: string, report: ReadinessReport, now: number): void {
  const entry: CachedScan = { report, cachedAt: now };
  try {
    storage.setItem(scanCacheKey(domain), JSON.stringify(entry));
  } catch {
    // Quota or private mode. The scan still succeeded and is still shown; only
    // the next visit pays for it again, which is the correct degradation.
  }
}

/**
 * Did the methodology move between two reports?
 *
 * Compared before rendering, so the panel can say "the scanner changed its
 * methodology since this was measured" instead of showing two numbers that look
 * comparable and are not. The scanner's own wording is that weights and grade
 * bands are versioned policy choices.
 */
export function methodologyMoved(previous: string, next: string): boolean {
  return previous !== next;
}

/** `true` when an entry is old enough that the UI should label it as history. */
export function isStale(entry: CachedScan, now: number): boolean {
  return now - entry.cachedAt > SCAN_CACHE_TTL_MS;
}

/** A short, honest age for the panel: `just now`, `4 min ago`, `6 h ago`. */
export function describeAge(cachedAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - cachedAt) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/**
 * Validate a stored entry.
 *
 * Structural, not exhaustive: enough to refuse anything this build did not
 * write. A report is only trusted if the fields the UI reads as facts are the
 * right types — a `letterGrade` of `undefined` would render as a blank card that
 * looks like a scan of a site with no grade.
 */
function parseEntry(raw: string): CachedScan | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const row = parsed as Record<string, unknown>;
  const report = row.report;
  if (typeof row.cachedAt !== 'number' || !Number.isFinite(row.cachedAt)) return null;
  if (typeof report !== 'object' || report === null) return null;

  const candidate = report as Record<string, unknown>;
  if (
    typeof candidate.domain !== 'string' ||
    typeof candidate.letterGrade !== 'string' ||
    typeof candidate.methodologyVersion !== 'string' ||
    typeof candidate.overallScore !== 'number' ||
    !Array.isArray(candidate.issues) ||
    !Array.isArray(candidate.categories)
  ) {
    return null;
  }
  return { report: report as ReadinessReport, cachedAt: row.cachedAt };
}
