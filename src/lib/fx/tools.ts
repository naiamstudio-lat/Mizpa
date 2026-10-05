/**
 * The agent's host tools.
 *
 * libfx ships with **no** tools: `createFxAgent({ tools })` defaults to an empty
 * array, so an agent created the way U5 created it has nothing to call. Every
 * tool here is hand-written JavaScript in the browser, which is the only place it
 * can be.
 *
 * ## The shape, read out of the shipped code
 *
 * `fx-sdk.js#normalizeHostTools` (line 1410) is the authority, because the README
 * does not state it and `libfx` ships no types:
 *
 *   - `tools` is an array, **max 64**.
 *   - `name` must match `/^[A-Za-z0-9_-]{1,64}$/` and be unique.
 *   - `description` is **required** (a string; an absent one is a TypeError).
 *   - `inputSchema` is **required** and must be an object — not an array, not
 *     `undefined` — and must survive `JSON.parse(JSON.stringify(...))`.
 *   - `execute(input, { signal })` is **required**, and may return anything
 *     `hostToolContent` accepts: the typed envelope, a bare string, or any
 *     JSON-serializable value.
 *
 * `providerExecuted: true` is the one escape hatch (gateway-side `web_search`
 * only) and is deliberately unused: it requires omitting `execute()`, which would
 * make a tool Mizpa cannot implement here look implemented.
 *
 * ## Honesty as a constraint on the tool set
 *
 * Five tools, and the list is short on purpose. There is no `run_command`
 * (the workspace refuses it — see `workspace.ts`), no `git_*` (`gitAvailable` is
 * `false` and the SDK's own validator requires it), and no `fetch_url`: a browser
 * tool that fetched arbitrary URLs would be an SSRF vector pointed at the visitor's
 * own network with the user's session attached, and the product already has an
 * SSRF-guarded fetcher on the server for that job.
 *
 * `analyze_site_readiness` is the same {@link scanSite} the onboarding column
 * calls. Not a re-implementation: the agent and the chat must not be able to
 * disagree about what a grade means, and a second poll loop would be a second
 * thing to keep correct against a 15-30 s asynchronous scan.
 */

import type { FxHostTool, FxToolResult } from 'libfx/browser';
import { IsAgentReadyClient, type McpTransport } from '../agentready/mcp';
import { ScanError, scanSite, type ScanProgress } from '../agentready/scan';
import type { ReadinessReport } from '../agentready/report';
import { VirtualWorkspace, resolvePath, PathError, StoreFullError } from './workspace';

/** The scanner, shared with the onboarding so both use one handshake code path. */
export function createReadinessClient(transport: McpTransport): IsAgentReadyClient {
  return new IsAgentReadyClient({ transport, timeoutMs: 90_000 });
}

/**
 * What the agent is told to expect from the scanner.
 *
 * Written into the tool description because the description is the only thing the
 * model sees before it decides to call. It repeats the source's own limits —
 * measured technical signals, not a verdict on whether the agent will succeed —
 * because a tool description that oversells the output produces tool calls and
 * then chat copy that oversells it too, and the overselling ends up in the user's
 * face rather than in a log.
 */
const READINESS_DESCRIPTION = [
  'Measure the published technical signals of a website for AI agents, using the public',
  'IsAgentReady scanner. Takes a URL or a bare domain.',
  '',
  'The result is a measured coverage score over the site\'s applicable stable web signals,',
  'grouped into five categories, with a failing checkpoint and its measured evidence for',
  'each. It is NOT a verdict and NOT a prediction of whether an agent task will succeed on',
  'that site: the scanner states that static scores do not predict agent task success.',
  'Report it as evidence, and do not tell the user the site is or is not "ready".',
  '',
  'A scan of a site the scanner has never seen takes 15-30 seconds; this tool waits for it',
  'and returns the finished report. A site it has already scanned returns immediately.',
].join('\n');

export interface ReadinessToolOptions {
  transport: McpTransport;
  /** Called on every phase change. The chat column subscribes to the same source. */
  onProgress?: (progress: ScanProgress) => void;
}

/**
 * The scan, as a libfx tool.
 *
 * The result is a **trimmed** report, not the full one: the agent does not need
 * `score_breakdown` internals, `training_exposure` or `browser_journeys`, and
 * dumping the 4 KB normalised report into a context window on every turn is how a
 * tool starts costing more than the turn it was called for. The grade, the score,
 * the methodology version and every issue with its evidence and recommendation
 * are all kept — that is the part the agent acts on.
 */
export function createReadinessTool(options: ReadinessToolOptions): FxHostTool {
  return {
    name: 'analyze_site_readiness',
    description: READINESS_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full URL or bare domain to scan, e.g. "https://example.com" or "example.com".',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    async execute(input: unknown, context: { signal: AbortSignal }): Promise<FxToolResult> {
      const target = readString((input as Record<string, unknown> | null)?.url);
      if (target === null) {
        return failure('a `url` string is required, e.g. {"url": "https://example.com"}');
      }
      try {
        const result = await scanSite({
          url: target,
          client: createReadinessClient(options.transport),
          signal: context.signal,
          onProgress: options.onProgress,
        });
        return { type: 'libfx.tool-result', text: renderReportForModel(result.report, result.cached) };
      } catch (error) {
        // A tool error is information, not a dead end: the model needs the reason
        // to decide whether to try a different domain or to tell the user what
        // happened. `ScanError.detail` is the scanner's own words.
        if (error instanceof ScanError) {
          return failure(
            `${error.message}${error.detail === null ? '' : ` (${error.detail})`}`,
            `scan failed: ${error.code}`,
          );
        }
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

/** The whole normalised report, minus the parts no action follows from. */
function renderReportForModel(report: ReadinessReport, cached: boolean): string {
  const lines: string[] = [
    `Site: ${report.domain}`,
    `Measured coverage: ${report.overallScore}/100 (grade ${report.letterGrade})`,
    `Methodology: ${report.methodologyVersion}${cached ? ' (from the scanner cache; no new crawl)' : ''}`,
    `Scope: ${report.scope || 'applicable stable web signals'}`,
    `Validation: ${report.outcomeValidation || 'not stated by the scanner'}`,
  ];

  if (report.accessBlockers.length > 0) {
    lines.push('', `ACCESS BLOCKERS (${report.accessBlockers.length}) — an agent may not be able to read this site at all:`);
    for (const issue of report.accessBlockers) lines.push(`  - ${issue.name}: ${issue.evidence}`);
  }

  for (const category of report.categories) {
    const grade = category.applicable ? `${category.grade ?? '?'} ${category.score}/${category.maxScore}` : 'not applicable';
    lines.push('', `${category.label} (${category.id}): ${grade}`);
    if (category.issues.length === 0) {
      lines.push('  no failing checkpoints');
      continue;
    }
    for (const issue of category.issues) {
      const gain = issue.scoreDelta === null ? '' : ` [+${issue.scoreDelta}]`;
      lines.push(`  - [${issue.status}] ${issue.name} (${issue.id})${gain}`);
      if (issue.evidence !== '') lines.push(`      evidence: ${issue.evidence}`);
      if (issue.recommendation !== null) lines.push(`      fix: ${issue.recommendation}`);
    }
  }

  if (report.reportUrl !== null) lines.push('', `Full report: ${report.reportUrl}`);
  return lines.join('\n');
}

const FILE_DESCRIPTION =
  'Work on files in Mizpa\'s browser virtual filesystem. There is no shell and no git: these ' +
  'tools are the only way to read or write anything, and everything is lost when the tab closes.';

/** The four filesystem tools, over one shared store. */
export function createFileTools(store: VirtualWorkspace): FxHostTool[] {
  return [
    {
      name: 'read_file',
      description: `${FILE_DESCRIPTION} Reads one file. Paths are relative to /workspace.`,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path, e.g. "index.html" or "/workspace/index.html".' },
        },
        required: ['path'],
        additionalProperties: false,
      },
      execute: (input) => {
        const raw = (input as Record<string, unknown> | null)?.path;
        if (typeof raw !== 'string') return failure('a `path` string is required');
        try {
          const file = store.read(resolvePath(raw));
          return ok(`${file.path} (${file.bytes} bytes)\n\n${file.content}`);
        } catch (error) {
          return failure(message(error));
        }
      },
    },
    {
      name: 'write_file',
      description: `${FILE_DESCRIPTION} Creates or replaces one file, creating parent directories implicitly.`,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path, e.g. "index.html".' },
          content: { type: 'string', description: 'The full file content. Replaces any existing content.' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
      execute: (input) => {
        const row = (input as Record<string, unknown> | null) ?? {};
        if (typeof row.path !== 'string') return failure('a `path` string is required');
        if (typeof row.content !== 'string') return failure('a `content` string is required');
        try {
          const file = store.write(resolvePath(row.path), row.content, Date.now());
          return ok(`wrote ${file.path} (${file.bytes} bytes); the workspace now holds ${store.size} file(s)`);
        } catch (error) {
          return failure(message(error));
        }
      },
    },
    {
      name: 'list_files',
      description: `${FILE_DESCRIPTION} Lists every file with its size, newest path order.`,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => {
        const files = store.list();
        if (files.length === 0) return ok('the workspace is empty');
        return ok(files.map((file) => `${file.path}\t${file.bytes} B`).join('\n'));
      },
    },
    {
      name: 'search_files',
      description: `${FILE_DESCRIPTION} Case-insensitive substring search across every file. Not a regular expression.`,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Literal text to look for, case-insensitive.' },
          limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Maximum hits. Default 50.' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      execute: (input) => {
        const row = (input as Record<string, unknown> | null) ?? {};
        const query = readString(row.query);
        if (query === null) return failure('a `query` string is required');
        const limit = typeof row.limit === 'number' && Number.isFinite(row.limit) ? Math.min(200, Math.max(1, Math.floor(row.limit))) : 50;
        const hits = store.search(query, limit);
        if (hits.length === 0) return ok(`no file contains "${query}"`);
        return ok(hits.map((hit) => `${hit.path}:${hit.line}: ${hit.text}`).join('\n'));
      },
    },
  ];
}

/** Every tool, in the order they are advertised to the model. */
export function createHostTools(options: ReadinessToolOptions & { store: VirtualWorkspace }): FxHostTool[] {
  return [createReadinessTool(options), ...createFileTools(options.store)];
}

function ok(text: string): FxToolResult {
  return { type: 'libfx.tool-result', text };
}

/**
 * A tool failure the model can read.
 *
 * `isError: true` is the signal the SDK turns into an error result for the model,
 * so a refused path or a full store is something it can react to rather than a
 * silent empty string it would read as "the file is empty".
 */
function failure(text: string, heading = 'tool error'): FxToolResult {
  return { type: 'libfx.tool-result', text: `${heading}: ${text}`, isError: true };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function message(error: unknown): string {
  if (error instanceof PathError || error instanceof StoreFullError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
