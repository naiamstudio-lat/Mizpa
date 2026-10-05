/**
 * The browser's virtual filesystem, as a libfx workspace adapter.
 *
 * ## What the browser actually is, stated plainly
 *
 * A tab has no shell, no process table, no `git` and no network filesystem. It
 * has a `Map`. So this adapter is **completion-only**: the agent can read, write,
 * list, search and delete files in memory, and it can run **nothing**. `exec`
 * exists because `fx-sdk.js#prepareWorkspaceAdapter` rejects an adapter without
 * one, and it returns exit code 127 with the reason rather than pretending to have
 * run something. An adapter that answered `exitCode: 0` for a build would produce
 * a confident agent that believes in files nobody wrote.
 *
 * That honesty has a cost the product has to accept: the agent cannot build or
 * verify its own output here. This file is where that limit is expressed, once,
 * in code — not spread through the tools as a series of "sorry, not yet".
 *
 * ## The validator, which is not documented in the README
 *
 * `prepareWorkspaceAdapter` (fx-sdk.js:233) refuses the adapter **outright** — no
 * agent, no error message to the caller, just a workspace the core does not know
 * about — unless every one of these holds:
 *
 *   info.version      === 1                      (exactly)
 *   info.cwd          === info.root              (the SDK compares, not the shape)
 *   info.gitAvailable === false                  (exactly false, not falsy)
 *   info.ephemeral    === true                   (exactly true)
 *   info.permission   is 'allow-sandboxed' or 'prompt'
 *   root/cwd/home     each pass `validWorkspacePath` (fx-sdk.js:225):
 *                      - starts with '/'
 *                      - contains no NUL
 *                      - survives a strict UTF-8 encode/decode round trip
 *                      - is not '/' with anything appended, and does not end in '/'
 *                      - has no empty, '.' or '..' segment
 *   JSON.stringify(info) + permission <= 4096 bytes
 *
 * `ROOT` below is validated by {@link assertValidWorkspacePaths} at module load,
 * so a bad constant is an import that refuses rather than a silently ignored
 * workspace discovered three units later.
 *
 * ## Root confinement
 *
 * The core hands us whatever path it likes, including `../../etc/passwd` and
 * `/workspace/../..`. `resolvePath` is the only way into the store and it refuses
 * anything that leaves {@link ROOT}, so a path traversal in a model-authored tool
 * call is a rejected argument rather than a read. Normalisation happens *before*
 * the confinement check, so `a/../b` is legal (it is `b`) while `../b` is not.
 */

import type { FxWorkspaceAdapter, FxWorkspaceExecRequest, FxWorkspaceExecResult } from 'libfx/browser';

/** The one root. Must satisfy `validWorkspacePath`, which the load check proves. */
export const ROOT = '/workspace';

/**
 * `home` is separate from `root` in the SDK's shape and must be a valid path, but
 * `cwd === root` is the only equality it checks. Pointing `home` at the root too
 * is the honest answer: there is no other directory in a browser, and a `home`
 * that implied one would be a path the tools cannot read.
 */
export const HOME = ROOT;

/** `allow-sandboxed`, because there is nothing outside the sandbox to reach. */
const PERMISSION = 'allow-sandboxed' as const;

/** The largest file the store will hold. Bounds a tab, not a disk. */
export const MAX_FILE_BYTES = 512 * 1024;

/** The most files the store will hold. Same reason. */
export const MAX_FILE_COUNT = 500;

export interface VirtualFile {
  /** Always `${ROOT}/${path}` — the absolute form, never the caller's. */
  path: string;
  content: string;
  bytes: number;
  /** `Date.now()` at the last write. The store's only clock. */
  updatedAt: number;
}

export class PathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathError';
  }
}

export class StoreFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreFullError';
  }
}

/**
 * Mirror of `fx-sdk.js#validWorkspacePath`.
 *
 * Duplicated rather than imported because `fx-sdk.js` does not export it — the
 * whole reason `libfx.d.ts` is hand-written. It is re-implemented here so the
 * adapter's own constants can be checked against the rule the SDK will apply,
 * rather than against a comment describing it.
 */
export function isValidWorkspacePath(path: string): boolean {
  if (!path.startsWith('/') || path.includes('\0')) return false;
  if (new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(path)) !== path) return false;
  if (path === '/') return true;
  if (path.endsWith('/')) return false;
  return path.slice(1).split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/**
 * Refuse to load with paths the SDK would reject.
 *
 * A module-load throw rather than a runtime check: an adapter whose `root` the
 * SDK silently discards produces an agent that believes it has a workspace and
 * cannot find it, which is far harder to diagnose than a stack trace at import.
 */
export function assertValidWorkspacePaths(info: {
  version: number;
  root: string;
  cwd: string;
  home: string;
  gitAvailable: boolean;
  ephemeral: boolean;
}): void {
  if (info.version !== 1) throw new Error(`fx workspace: version must be 1, got ${String(info.version)}`);
  if (info.cwd !== info.root) throw new Error('fx workspace: cwd must equal root');
  if (info.gitAvailable !== false) throw new Error('fx workspace: gitAvailable must be false');
  if (info.ephemeral !== true) throw new Error('fx workspace: ephemeral must be true');
  for (const [name, path] of [
    ['root', info.root],
    ['cwd', info.cwd],
    ['home', info.home],
  ] as const) {
    if (!isValidWorkspacePath(path)) {
      throw new Error(`fx workspace: ${name} '${path}' is not a path the libfx validator accepts`);
    }
  }
}

/**
 * Resolve a caller-supplied path into the store, or refuse.
 *
 * Accepts a path relative to the root, an absolute path inside the root, or an
 * absolute path equal to the root (which names the directory, not a file). Every
 * result is the canonical `${ROOT}/${relative}` form, so two spellings of the
 * same file cannot become two entries.
 *
 * The confinement check is on the *normalised* result, and it is a prefix test on
 * a segment boundary — `${ROOT}/` — so `/workspace-evil` is not inside
 * `/workspace`. A `startsWith(ROOT)` test would accept it, and that is the bug
 * this shape exists to prevent.
 */
export function resolvePath(input: string): string {
  const raw = input.trim();
  if (raw === '') throw new PathError('a path is required');

  // A NUL is the one character that could truncate the path inside the core's
  // own C string handling, and it is never legitimate in a filename.
  if (raw.includes('\0')) throw new PathError('a path cannot contain a NUL');

  // The root prefix is only a prefix **at a segment boundary**. `startsWith(ROOT)`
  // alone would treat `/workspace-evil/x` as inside the root and silently resolve
  // it to the root directory — so a write aimed at a sibling of the workspace
  // would land in the workspace instead, which is the exact confusion the
  // confinement check exists to prevent. Anything else is a relative path.
  const withoutRoot =
    raw === ROOT ? '' : raw.startsWith(`${ROOT}/`) ? raw.slice(ROOT.length + 1) : raw;
  const segments: string[] = [];
  for (const segment of withoutRoot.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      // Popping past the root is the escape this whole file is about.
      if (segments.length === 0) throw new PathError(`'${input}' is outside ${ROOT}`);
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (segments.length === 0) return ROOT;
  const path = `${ROOT}/${segments.join('/')}`;
  // The resolved path came out of this function's own segment loop, so it is
  // canonical by construction — no `.`, no `..`, no empty segment. Asserting it
  // anyway is cheap and turns a future refactor of that loop into a loud failure
  // here rather than a silently rejected adapter inside the SDK.
  if (!isValidWorkspacePath(path)) throw new PathError(`'${path}' is not a path the libfx validator accepts`);
  return path;
}

/**
 * The store.
 *
 * A `Map` and nothing else: no `localStorage`, no IndexedDB, no origin isolation
 * to reason about. The trade is explicit — a reload loses the agent's output, so
 * the preview column reads from a site row rather than from here, and a tab that
 * is closed mid-turn loses the turn. `ephemeral: true` in the adapter's `info` is
 * the SDK's word for exactly this, so the manifest and the behaviour agree.
 */
export class VirtualWorkspace {
  readonly #files = new Map<string, VirtualFile>();

  list(): VirtualFile[] {
    return [...this.#files.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  has(path: string): boolean {
    return this.#files.has(path);
  }

  read(path: string): VirtualFile {
    const file = this.#files.get(path);
    if (file === undefined) throw new PathError(`'${path}' does not exist`);
    return file;
  }

  write(path: string, content: string, now: number): VirtualFile {
    const bytes = new TextEncoder().encode(content).byteLength;
    if (bytes > MAX_FILE_BYTES) {
      throw new StoreFullError(`'${path}' is ${bytes} bytes; the limit is ${MAX_FILE_BYTES}`);
    }
    if (!this.#files.has(path) && this.#files.size >= MAX_FILE_COUNT) {
      throw new StoreFullError(`the workspace already holds ${MAX_FILE_COUNT} files`);
    }
    const file: VirtualFile = { path, content, bytes, updatedAt: now };
    this.#files.set(path, file);
    return file;
  }

  delete(path: string): boolean {
    return this.#files.delete(path);
  }

  get size(): number {
    return this.#files.size;
  }

  /**
   * Substring search across the store.
   *
   * A plain case-insensitive substring, deliberately: no regex, because a model
   * that passes a pattern with an invalid quantifier would get a thrown
   * `SyntaxError` instead of results, and no index, because at `MAX_FILE_COUNT`
   * the difference is not worth a second data structure to keep coherent. The
   * result is a line number and the line, which is what a tool call needs to be
   * actionable.
   */
  search(query: string, limit: number): Array<{ path: string; line: number; text: string }> {
    const needle = query.toLowerCase();
    if (needle === '') return [];
    const hits: Array<{ path: string; line: number; text: string }> = [];
    for (const file of this.list()) {
      const lines = file.content.split('\n');
      for (const [index, line] of lines.entries()) {
        if (!line.toLowerCase().includes(needle)) continue;
        hits.push({ path: file.path, line: index + 1, text: line.trim().slice(0, 200) });
        if (hits.length >= limit) return hits;
      }
    }
    return hits;
  }
}

/**
 * Build the adapter `createFxAgent({ workspace })` accepts.
 *
 * One workspace per agent, created here rather than shared, so two agents in two
 * tabs cannot see each other's files. The `info` object is frozen: the SDK
 * serialises it once at handshake, and an adapter that mutated `root` afterwards
 * would be describing a filesystem that does not exist.
 */
export function createBrowserWorkspace(): { adapter: FxWorkspaceAdapter; store: VirtualWorkspace } {
  const store = new VirtualWorkspace();
  const info = Object.freeze({
    version: 1 as const,
    root: ROOT,
    cwd: ROOT,
    home: HOME,
    gitAvailable: false as const,
    ephemeral: true as const,
  });
  assertValidWorkspacePaths(info);

  return {
    store,
    adapter: {
      info,
      permission: PERMISSION,
      /**
       * Refuses, and says why.
       *
       * Exit 127 is the shell's "command not found", which is the closest honest
       * answer: there is no interpreter here to run it with. The message names
       * the workspace tools that *do* exist, so a turn that tried to shell out
       * has somewhere to go next instead of retrying `bash`.
       */
      exec(request: FxWorkspaceExecRequest): Promise<FxWorkspaceExecResult> {
        return Promise.resolve({
          exitCode: 127,
          stdout: '',
          stderr:
            `Mizpa's workspace is a browser virtual filesystem: '${request.command}' cannot be run. ` +
            'There is no shell, no process and no git in this environment. Use the read_file, ' +
            'write_file, list_files and search_files tools to work on files directly.\n',
        });
      },
    },
  };
}
