/**
 * The replica request: what a replica is, and the five states it can be in.
 *
 * ## The rule this module is built to keep
 *
 * **`produced` is the only state that shows a replica, and it carries the bytes
 * that were actually read out of the agent's workspace.** There is no fixture, no
 * template, no placeholder document and no optimistic preview: `producedReplica`
 * takes a `html` string and nothing else can construct one. Every other state
 * carries `html: null`, so "the preview shows a page" and "a page was written"
 * are the same statement — which is the only way to keep them from drifting.
 *
 * That matters because the other four states are reachable **today**. `fx-gateway`
 * is not deployed and there is no `AI_GATEWAY_API_KEY` in this environment, so
 * the honest answer to "build me a replica" is a terminal state that names which
 * of those two things is missing. Those are different problems with different
 * owners — one is a deploy, the other is a secret — and a product that merges
 * them into "not available yet" has told the reader nothing.
 *
 * ## The phases, and what moves them
 *
 *   idle        nothing has been asked for. Nothing is claimed.
 *   requested   a click happened and the real attempt has started. This is the
 *               only phase where a duration is being accumulated, and it is
 *               entered by a click, never by a timer.
 *   running     a real `FxAgent` object exists and its turn is being consumed.
 *               Reachable only when `prepareFxAgent` measured `'ready'`.
 *   produced    `index.html` was read out of the workspace store. Terminal, good.
 *   unavailable Terminal, and it always names a reason. `reason` is never null
 *               in this state, and the reason is either a measured
 *               {@link FxAgentVerdict} or one of the two states that are about
 *               the turn rather than about the environment.
 *
 * `replicaInProgress` is the single predicate the preview column uses to decide
 * whether to animate. It is deliberately true for `requested` as well as
 * `running`: during `requested` the app is genuinely doing something — it is
 * waiting on a real network round-trip to the edge function — and an animation
 * that switches off while a real request is still in flight is the exact
 * dishonesty this feature is meant not to have.
 *
 * ## Why the two non-verdict reasons exist
 *
 * `no_artifact` and `turn_failed` are not {@link FxAgentVerdict}s, and pretending
 * they are would be a lie in the type as well as on screen. Both mean the
 * environment was fine: the gateway answered, the wasm started, the agent ran —
 * and then it either finished a turn without writing `index.html`, or the turn
 * threw. Folding either into `runtime_unavailable` would blame the browser for
 * something the browser did.
 *
 * Kept free of React imports, like `preview.ts` beside it, so the contract can be
 * read and asserted without a DOM.
 */

import type { FxAgentVerdict } from '../lib/fx/agent';
import { resolvePath, type VirtualWorkspace } from '../lib/fx/workspace';

/**
 * The one file that counts as a replica.
 *
 * Not `index.html` as a bare string written twice in two places: `preview.ts`
 * already tells the user "the agent has not written an index.html for this site",
 * so the path this module looks for is the path that sentence is about. If the
 * entrypoint ever moves, that empty state is wrong until it moves with it — which
 * is the correct coupling, because both are the same claim.
 */
export const REPLICA_ENTRYPOINT = 'index.html';

/**
 * What the agent is asked for, verbatim.
 *
 * Deliberately a request for a **file**, not for a page: the only thing this app
 * can do with the result is read it out of the workspace and hand the bytes to
 * `previewFrame`, so the agent is asked to write exactly the artifact that read
 * looks for. A replica that is "in the agent's head" is a replica nobody can
 * look at, and the terminal state would then have to be `no_artifact` on every
 * successful run.
 */
export const REPLICA_INSTRUCTIONS = [
  `Write an optimised replica of the site you have just measured to ${REPLICA_ENTRYPOINT}.`,
  '',
  'Use write_file for that exact path and nothing else. The output must be one',
  'self-contained HTML document: no build step, no external assets, no network',
  'requests, inline CSS and inline script only.',
  '',
  'Optimise it for the signals the readiness report just measured, and for machine',
  'readers rather than for people: keep the content and the structure, add the',
  'structured data and machine-readable metadata the report says are missing, and',
  'drop anything that only carries visual weight. Do not invent facts about the',
  'site that the measurement did not show you.',
  '',
  `Do not call ${REPLICA_ENTRYPOINT} done until the file is written. If you cannot`,
  'write it, say why in your reply instead of describing what you would have written.',
].join('\n');

/** Where the request is. `produced` and `unavailable` are both terminal. */
export type ReplicaPhase = 'idle' | 'requested' | 'running' | 'produced' | 'unavailable';

/**
 * Why there is no replica.
 *
 * The first six are `prepareFxAgent`'s own verdicts, reused by type rather than
 * restated: the reader must not have to wonder whether this list and that one
 * agree. The last two are about the turn, not the environment — see the header.
 */
export type ReplicaUnavailableReason =
  | Exclude<FxAgentVerdict, 'ready'>
  | 'no_artifact'
  | 'turn_failed';

export interface ReplicaState {
  phase: ReplicaPhase;
  /** Non-null exactly when `phase === 'unavailable'`. */
  reason: ReplicaUnavailableReason | null;
  /** The measured sentence behind the reason, verbatim. Never invented. */
  detail: string | null;
  /** The last tool the agent was actually on, when there was one. */
  step: string | null;
  /** The bytes read out of the workspace. Non-null exactly when produced. */
  html: string | null;
  /**
   * Wall clock of the attempt, in ms. `null` until an attempt has really run, so
   * no duration is ever shown for work that did not happen.
   */
  durationMs: number | null;
}

const NOTHING: ReplicaState = {
  phase: 'idle',
  reason: null,
  detail: null,
  step: null,
  html: null,
  durationMs: null,
};

/** Nothing asked for, nothing claimed. A fresh object each call, never shared. */
export function idleReplica(): ReplicaState {
  return { ...NOTHING };
}

/**
 * A click landed and the real attempt is starting.
 *
 * The progress UI must be able to tell "the user pressed the button" from "Mizpa
 * got an agent and it is working", because the second is the only one that
 * implies a model is generating something. Merging them would let the app show
 * "the agent is writing your replica" during a request that was about to 404.
 */
export function requestedReplica(): ReplicaState {
  return { ...NOTHING, phase: 'requested' };
}

/**
 * A real agent object exists and its turn is being consumed.
 *
 * `step` is the tool name from the last `tool_start` event actually observed.
 * It is `null` before the first tool call, which is honest: the model may still
 * be reading, and saying which tool it is on before it has called one would be
 * a guess rendered as a fact.
 */
export function runningReplica(step: string | null): ReplicaState {
  return { ...NOTHING, phase: 'running', step };
}

/**
 * The only constructor that can carry HTML.
 *
 * An empty or whitespace-only document is rejected here rather than in the
 * preview, because `previewFrame` would render it as a blank frame and a blank
 * frame reads as a site that produced nothing visible — which is a different
 * failure from a site that produced no page, and both are failures.
 */
export function producedReplica(html: string, durationMs: number): ReplicaState {
  const body = html.trim();
  if (body === '') throw new Error('producedReplica: an empty document is not a replica');
  return {
    phase: 'produced',
    reason: null,
    detail: null,
    step: null,
    html: body,
    durationMs,
  };
}

/** Terminal, and it always says why. */
export function unavailableReplica(
  reason: ReplicaUnavailableReason,
  detail: string | null,
  durationMs: number,
  step: string | null = null,
): ReplicaState {
  return { phase: 'unavailable', reason, detail, step, html: null, durationMs };
}

/**
 * Is something genuinely in flight?
 *
 * The one predicate the animation is allowed to read. It is `false` for both
 * terminal states, which is the whole point: butterflies drift while Mizpa is
 * really working and are gone the moment the answer is known, so the animation
 * cannot outlive the attempt or cover a result.
 */
export function replicaInProgress(state: ReplicaState): boolean {
  return state.phase === 'requested' || state.phase === 'running';
}

/**
 * Read the replica out of the workspace, or report that there is none.
 *
 * `null` for a missing file *and* for an empty one, because both mean the same
 * thing to the user and `previewFrame` would otherwise draw a blank frame. The
 * check is against the resolved absolute path, not the caller's spelling, so
 * `index.html` and `/workspace/index.html` cannot be two different answers.
 */
export function readReplicaHtml(store: VirtualWorkspace): string | null {
  const path = resolvePath(REPLICA_ENTRYPOINT);
  if (!store.has(path)) return null;
  const file = store.read(path);
  return file.content.trim() === '' ? null : file.content;
}

/**
 * How big the produced document is, in bytes, counted the way a file system
 * counts. Not `html.length`: that is UTF-16 code units, and calling a Cyrillic
 * or emoji document "smaller than it is" is the kind of quiet wrong number this
 * project does not ship.
 */
export function replicaByteLength(html: string): number {
  return new TextEncoder().encode(html).byteLength;
}