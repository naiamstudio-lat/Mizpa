/**
 * Hand-written type declarations for `libfx@0.0.12`.
 *
 * The published package ships **no** `.d.ts` file and no `types`/`typings`
 * field — `find node_modules/libfx -name '*.d.ts'` returns nothing. This file
 * exists because of that, and everything in it was read out of the shipped
 * JavaScript (`browser.js`, `fx-sdk.js`, `wasm-module.js`, `core-output.js`)
 * and the shipped `README.md`, not from documentation or recollection.
 *
 * Scope is deliberately narrow: only `libfx/browser`, which is the entrypoint a
 * browser bundle must use. The Node entry (`libfx/node`) exposes a different
 * surface (`getBackendInfo`, the `backend`/`nativeAddon` options) that a browser
 * bundle never reaches, and declaring it here would be claiming an API this app
 * cannot call.
 */

declare module 'libfx/browser' {
  /** Anything `wasm-module.js#compileModule` accepts. Note: a string, never a `URL`. */
  export type FxWasmSource =
    | string
    | Response
    | Promise<Response>
    | ArrayBuffer
    | ArrayBufferView
    | WebAssembly.Module;

  export const fxSdkApiVersion: number;
  export const libfxApiVersion: number;

  /**
   * The exact probe `fx-sdk.js#supportsJspi` performs, mirrored in `gate.ts` so the
   * gate can run without importing the 84 KB SDK into an unsupported browser.
   */
  export function supportsJspi(): boolean;

  export function listModels(options: {
    apiKey: string;
    fetch?: typeof fetch;
  }): Promise<string[]>;

  /** The canonical grouped model form. Top-level `effort`/`fast` still work but are deprecated. */
  export interface FxModelOptions {
    id: string;
    effort?: string;
    fast?: boolean;
  }

  export type FxModel = string | FxModelOptions;

  export interface FxToolImage {
    type: 'image';
    data: string;
    mimeType: string;
  }

  export interface FxTypedToolResult {
    type: 'libfx.tool-result';
    text: string;
    images?: FxToolImage[];
    isError?: boolean;
  }

  /**
   * Every branch `fx-sdk.js#hostToolContent` accepts: the typed envelope, a bare
   * string, nothing, or anything JSON-serializable.
   */
  export type FxToolResult =
    | string
    | FxTypedToolResult
    | number
    | boolean
    | null
    | undefined
    | Record<string, unknown>;

  export interface FxToolContext {
    readonly signal: AbortSignal;
  }

  export interface FxHostTool {
    /** Must match `/^[A-Za-z0-9_-]{1,64}$/` and be unique. At most 64 tools. */
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    execute?: (input: unknown, context: FxToolContext) => FxToolResult | Promise<FxToolResult>;
    /** Gateway-side execution. `web_search` only; must omit `execute()`. */
    providerExecuted?: boolean;
  }

  /**
   * The host-owned workspace adapter. Present in the shipped code
   * (`fx-sdk.js#prepareWorkspaceAdapter`, `#workspaceExec`) but **not documented
   * in the shipped README** — this shape is read from the validator, which
   * rejects the adapter outright when any of it is wrong:
   *
   * - `info.version` must be exactly `1`
   * - `info.cwd` must equal `info.root`
   * - `info.gitAvailable` must be exactly `false`
   * - `info.ephemeral` must be exactly `true`
   * - all three paths must be absolute, must not end in `/` (except `/` itself)
   *   and must not contain `.`/`..`/empty segments
   * - `permission` must be `allow-sandboxed` or `prompt`
   */
  export interface FxWorkspaceInfo {
    version: 1;
    root: string;
    cwd: string;
    home: string;
    gitAvailable: false;
    ephemeral: true;
  }

  export type FxWorkspacePermission = 'allow-sandboxed' | 'prompt';

  export interface FxWorkspaceExecRequest {
    command: string;
    cwd: string;
    signal: AbortSignal;
    /** Integer, 1..30000. The SDK aborts the host call itself at this deadline. */
    timeoutMs: number;
    /** Always 65536 for `createFxAgent`. */
    outputLimitBytes: number;
  }

  export interface FxWorkspaceExecResult {
    /** Signed 32-bit range; the SDK writes it into the wasm result frame. */
    exitCode: number;
    stdout: string;
    stderr: string;
  }

  export interface FxWorkspaceAdapter {
    info: FxWorkspaceInfo;
    permission: FxWorkspacePermission;
    exec(request: FxWorkspaceExecRequest): Promise<FxWorkspaceExecResult>;
  }

  /**
   * A diagnostic event. `fx-sdk.js` always emits `{ type, timestamp, ...detail }`
   * with `timestamp` from `performance.now()`; the detail keys differ per type.
   */
  export interface FxEvent {
    type: string;
    timestamp: number;
    [detail: string]: unknown;
  }

  export interface FxAgentOptions {
    /** Required, non-empty. Never the real Gateway key: it goes to the host `fetch` override. */
    apiKey: string;
    model?: FxModel;
    /** @deprecated Use `model.effort`. Rejected when `model` is an object. */
    effort?: string;
    /** @deprecated Use `model.fast`. Rejected when `model` is an object. */
    fast?: boolean;
    /**
     * Must be the canonical Vercel AI Gateway v3/v4 URL or an explicit
     * loopback `http` URL with a port. The key injection path in Mizpa is the
     * `fetch` override, not this option.
     */
    gatewayChatUrl?: string;
    /** Up to 64 KiB of UTF-8. The complete host-owned system context. */
    instructions?: string | string[];
    tools?: FxHostTool[];
    checkpoint?: ArrayBuffer | ArrayBufferView;
    workspace?: FxWorkspaceAdapter;
    /** Replaces `globalThis.fetch` for every request the core makes. */
    fetch?: typeof fetch;
    onEvent?: (event: FxEvent) => void;
    /** Returns the option id to approve, or `null`/undefined to cancel. */
    onPermission?: (request: Record<string, unknown>) => Promise<string | null | undefined>;
    /**
     * Opaque, versioned, ≤4 MiB. Restore it by passing it to a *fresh* agent
     * along with the key, model, instructions and tools again — the host owns
     * durable storage and must resupply all of them.
     */
    wasm?: FxWasmSource;
  }

  export interface FxUsage {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
  }

  export interface FxTextDeltaEvent {
    type: 'text_delta';
    delta: string;
  }

  export interface FxReasoningDeltaEvent {
    type: 'reasoning_delta';
    delta: string;
  }

  export interface FxToolStartEvent {
    type: 'tool_start';
    id: string;
    name: string;
    /** Present unless the input exceeded 64 KiB of JSON. */
    input?: unknown;
    inputPreview?: string;
    inputTruncated?: boolean;
  }

  export interface FxToolEndEvent {
    type: 'tool_end';
    id: string;
    name: string;
    content?: string;
    isError?: boolean;
  }

  export interface FxUserMessageEvent {
    type: 'user_message';
    text: string;
  }

  export type FxTurnEvent =
    | FxTextDeltaEvent
    | FxReasoningDeltaEvent
    | FxToolStartEvent
    | FxToolEndEvent
    | FxUserMessageEvent;

  export interface FxTurnResult {
    stopReason: string;
    usage?: FxUsage;
  }

  export interface FxTurn extends AsyncIterable<FxTurnEvent> {
    cancel(): void;
    steer(input: string): Promise<void>;
    /**
     * Must be consumed while the turn runs. Awaiting only `result` on a turn whose
     * events were never read can wait for the stream to drain.
     */
    result: Promise<FxTurnResult>;
  }

  export interface FxAgent {
    prompt(input: FxPromptInput, options?: { signal?: AbortSignal }): FxTurn;
    checkpoint(): Promise<Uint8Array>;
    close(): Promise<void>;
  }

  export type FxPromptImageBlock =
    | { type: 'image'; data: Blob; mimeType?: string }
    | { type: 'image'; data: string; mimeType: string };

  export type FxPromptBlock =
    | { type: 'text'; text: string }
    | FxPromptImageBlock
    | { type: 'resource'; resource: { uri: string; text?: string } };

  export type FxPromptInput = string | FxPromptBlock[];

  /**
   * Resolves once the ACP handshake is done: `initialize` then `libfx/new`. It
   * compiles `options.wasm` and starts `fx-core` in `acp` mode, so the wasm
   * bytes are already downloaded by the time this settles.
   */
  export function createFxAgent(options?: FxAgentOptions): Promise<FxAgent>;

  export function encodeXtermKeyEvent(event: {
    type: string;
    key: string;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
  }): string | null;

  export interface FxTerminalAdapter {
    write(bytes: Uint8Array): void;
    drain?(): Promise<void>;
    onData(handler: (data: string) => void): () => void;
    onKeyData?(handler: (data: string) => void): () => void;
    onResize(handler: () => void): () => void;
    cols: number;
    rows: number;
    element?: unknown;
  }

  export function xtermAdapter(terminal: FxTerminalAdapter): FxTerminalAdapter;

  export interface FxTerminalRuntime {
    interactive: Promise<void>;
    exited: Promise<number>;
    write(data: string): void;
    resize(): void;
    abort(): void;
  }

  /**
   * The terminal surface needs `fx-term.wasm` (4.98 MB), not `fx-core.wasm`, and
   * Mizpa has no terminal. Declared so the import is typed, unused by this app.
   */
  export function createFxTerminal(options: {
    terminal: FxTerminalAdapter;
    wasm?: FxWasmSource;
    onEvent?: (event: FxEvent) => void;
    interruptKey?: string;
  }): Promise<FxTerminalRuntime>;
}
