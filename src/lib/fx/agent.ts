/**
 * Composing the in-browser agent: gateway, tools, workspace, and the verdict.
 *
 * ## Why this file exists
 *
 * The three things an fx agent needs from its host — a `fetch` that routes model
 * traffic through `fx-gateway`, a set of host tools, and a workspace adapter — are
 * each built in their own module and each is useless alone. This is the one place
 * that assembles them, and it is also the one place that decides whether the agent
 * can run at all.
 *
 * That decision used to be a hardcoded `'not-connected'` constant in the chat
 * column, which is a constant that cannot be wrong and therefore cannot be right
 * either: it says the same thing whether the browser lacks JSPI, the gateway
 * function is not deployed, the gateway has no `AI_GATEWAY_API_KEY`, or the whole
 * thing works. Each of those is a different bug for a different person to fix, so
 * each gets its own verdict here and its own sentence in the UI.
 *
 * ## The order is load-bearing
 *
 *   1. **JSPI gate.** No wasm is downloaded in a browser without it.
 *   2. **Session.** There is no point loading a 2.25 MB binary to discover there
 *      is nobody to charge.
 *   3. **Gateway bootstrap.** `GET /` on fx-gateway is what publishes the proxy's
 *      own public base URL and the model catalogue, and both are needed to build
 *      a correct `fetch` override. Reading it *after* the wasm is why the first
 *      turn used to be the thing that discovered the configuration.
 *   4. **Workspace, tools, then the agent.** All three are host objects handed to
 *      `createFxAgent`, so they must exist before it is called — and a tool that
 *      threw at call time would fail the turn, not the handshake.
 *
 * ## What this deliberately does not do
 *
 * It does not start a turn, and it does not pretend to. `createFxAgent` compiles
 * the wasm and completes the ACP handshake — that is real and it is verified — but
 * the first `prompt()` needs a model response, and a model response needs a
 * gateway that has a key. When the verdict is anything other than `ready` there
 * is no agent object at all, so there is nothing a caller could accidentally
 * prompt.
 */

import { gateForJspi, type FxGateReport } from './gate';
import { bootstrapFxAgent, loadFxRuntime, type FxRuntimeInfo } from './runtime';
import {
  FX_GATEWAY_PLACEHOLDER_KEY,
  createGatewayFetch,
  readGatewayBootstrap,
  selectProxyModel,
  type CatalogEntry,
  type GatewayBootstrap,
  type TokenReader,
} from './gateway';
import { createBrowserWorkspace, type VirtualWorkspace } from './workspace';
import { createHostTools } from './tools';
import { browserScanTransport } from '../agentready/transport';
import { ScanProgress } from '../agentready/scan';
import type { FxAgent } from 'libfx/browser';

/** Why the agent can or cannot run. Each one is a different fix. */
export type FxAgentVerdict =
  /** JSPI is missing. No browser-side agent is possible, full stop. */
  | 'unsupported'
  /** No signed-in user, so fx-gateway would charge nobody. */
  | 'no_session'
  /** `GET /` on fx-gateway did not answer — not deployed, or unreachable. */
  | 'gateway_unreachable'
  /** The gateway answered, and refused: no `AI_GATEWAY_API_KEY` server-side. */
  | 'gateway_unconfigured'
  /** The gateway refused this user's budget. */
  | 'quota_exhausted'
  /** JSPI said yes but the runtime or the wasm could not start. */
  | 'runtime_unavailable';

export interface FxAgentReady {
  verdict: 'ready';
  agent: FxAgent;
  workspace: VirtualWorkspace;
  bootstrap: GatewayBootstrap;
  runtime: FxRuntimeInfo;
}

export interface FxAgentBlocked {
  verdict: Exclude<FxAgentVerdict, 'ready'>;
  /** The SDK's own gate report, kept so the UI can show what it measured. */
  gate: FxGateReport;
  /** One sentence, safe to show a user verbatim. */
  detail: string;
  /** Present when the gateway answered with a structured refusal. */
  code: string | null;
}

export type FxAgentOutcome = FxAgentReady | FxAgentBlocked;

export interface PrepareAgentOptions {
  /** `import.meta.env.VITE_SUPABASE_URL`. Read at call time, not at module load. */
  supabaseUrl: string;
  /** `null` when nobody is signed in. */
  getToken: TokenReader;
  /** A model from the published catalogue, or `null` for the server default. */
  modelId?: string | null;
  onProgress?: (progress: ScanProgress) => void;
  onEvent?: (event: { type: string; [detail: string]: unknown }) => void;
  /** Observability for the `fetch` rewrite. Never control flow. */
  onRewrite?: (from: string, to: string) => void;
}

/**
 * Build the agent, or explain precisely why it cannot be built.
 *
 * Never throws. Every failure is a verdict, because every failure here is a
 * configuration or environment fact that somebody has to go and fix, and a thrown
 * `TypeError` from inside the SDK does not tell them which.
 */
export async function prepareFxAgent(options: PrepareAgentOptions): Promise<FxAgentOutcome> {
  const gate = gateForJspi();
  if (gate.state !== 'ready') {
    return { verdict: 'unsupported', gate, detail: gate.detail, code: null };
  }

  // The session is read before the wasm. `readGatewayBootstrap` is what proves
  // the token works, and finding out that first costs one request instead of a
  // 2.25 MB download.
  let bootstrap: GatewayBootstrap;
  try {
    bootstrap = await readGatewayBootstrap({ supabaseUrl: options.supabaseUrl, getToken: options.getToken });
  } catch (error) {
    return blockedFromGatewayError(error, gate);
  }

  const { adapter: workspace, store } = createBrowserWorkspace();
  const catalogue: readonly CatalogEntry[] = bootstrap.models;
  const modelId = selectProxyModel(options.modelId ?? null, catalogue);

  const override = createGatewayFetch({
    baseUrl: bootstrap.gateway.baseUrl,
    modelQueryParam: bootstrap.gateway.modelQueryParam,
    modelId,
    getToken: options.getToken,
    onRewrite: options.onRewrite,
  });

  const tools = createHostTools({
    transport: browserScanTransport(),
    store,
    onProgress: options.onProgress,
  });

  // Loaded before the agent so the two API versions are the real ones from the
  // package, not zeros filled in after the fact. `loadFxRuntime` is a separate
  // call from `bootstrapFxAgent` precisely so a module-graph failure and a wasm
  // failure stay distinguishable.
  let runtime: FxRuntimeInfo;
  try {
    runtime = await loadFxRuntime();
  } catch (error) {
    return {
      verdict: 'runtime_unavailable',
      gate,
      detail: `The fx runtime could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
      code: null,
    };
  }

  const result = await bootstrapFxAgent({
    // Never the real gateway key: this value is placed in `AI_GATEWAY_API_KEY`
    // inside the wasm environment and from there into an `authorization` header
    // on every request — and the override above drops that header. A readable
    // fake is deliberate: a real one would be a key in the bundle, and a random
    // one would be indistinguishable from a real one in a grep.
    apiKey: FX_GATEWAY_PLACEHOLDER_KEY,
    model: bootstrap.model,
    instructions: [
      'You are the Mizpa agent, working inside a web browser on a technical-SEO project.',
      '',
      'Your workspace is a virtual filesystem at /workspace. There is no shell, no git and no',
      'process: read_file, write_file, list_files and search_files are the only ways to work on',
      'files, and everything is lost when the tab closes. Do not try to run commands.',
      '',
      'analyze_site_readiness measures the technical signals a site publishes for AI agents. Its',
      'score is a measurement, not a verdict, and the scanner states that static scores do not',
      'predict whether an agent task will succeed. Report it as evidence and never as a',
      'prediction of the outcome.',
    ].join('\n'),
    tools,
    workspace,
    fetch: override,
    onEvent: options.onEvent,
  });

  if (result.state !== 'ready') {
    return {
      verdict: 'runtime_unavailable',
      gate: result.report,
      detail: result.report.detail,
      code: null,
    };
  }

  return {
    verdict: 'ready',
    agent: result.agent,
    workspace: store,
    bootstrap,
    runtime,
  };
}

/**
 * Read the gateway's refusal.
 *
 * The three answers are kept apart because they are three different
 * conversations: "the function is not deployed" is a deploy task, "it has no key"
 * is a secrets task, and "your budget is gone" is a product decision the visitor
 * can do something about. Flattening them into "the agent is not connected" is
 * what made the old constant useless.
 */
function blockedFromGatewayError(error: unknown, gate: FxGateReport): FxAgentBlocked {
  const detail = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | null)?.code ?? null;
  const status = (error as { status?: number } | null)?.status ?? null;

  if (code === 'quota_exhausted') {
    return { verdict: 'quota_exhausted', gate, detail, code };
  }
  if (code === 'auth_not_configured' || code === 'missing_api_key' || status === 500) {
    return { verdict: 'gateway_unconfigured', gate, detail, code };
  }
  return { verdict: 'gateway_unreachable', gate, detail, code };
}
