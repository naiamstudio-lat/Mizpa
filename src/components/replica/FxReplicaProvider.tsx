import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { prepareFxAgent, type FxAgentOutcome, type FxAgentReady } from '../../lib/fx/agent';
import type { FxAgentVerdict } from '../../lib/fx/agent';
import {
  REPLICA_INSTRUCTIONS,
  idleReplica,
  producedReplica,
  readReplicaHtml,
  replicaInProgress,
  requestedReplica,
  runningReplica,
  unavailableReplica,
  type ReplicaState,
} from '../../app/replica';

/**
 * One agent probe, shared by every surface that needs to know the truth.
 *
 * ## Why the probe lives here and not in the chat column
 *
 * The replica request needs the agent's verdict, and the chat column already
 * runs it. Two components each calling `prepareFxAgent` would be two real 2.25 MB
 * wasm loads, two gateway round-trips and — worse — **two different answers
 * printed on one screen**: the chat saying "no key" while the replica flow was
 * simultaneously reporting success from a second probe that behaved differently.
 * A screen that contradicts itself about the environment is the failure this
 * whole change is about. So the probe is lifted here and *both* surfaces read
 * the one measurement.
 *
 * `AgentChat` still renders the verdict. Only the `await` moved.
 *
 * ## Why the click re-probes instead of trusting the verdict on screen
 *
 * Two cases, and they need opposite answers:
 *
 * - **The verdict is `ready`.** The real agent object already exists, and a
 *   second `prepareFxAgent` would download and compile the wasm a second time to
 *   arrive at an identical agent. The click uses that agent. There is no
 *   optimism in it: the object being reused is the one the chat already measured.
 * - **The verdict is not `ready`.** This is today's case. A stale verdict is not
 *   good enough for a terminal state, so the click calls `prepareFxAgent` again
 *   and reports what *that* call measured, at the moment the user asked. It costs
 *   one unauthenticated-ish request to the edge function — cheap, because the
 *   wasm is only reached *after* the gateway answers, so a gateway that does not
 *   exist never triggers a download.
 *
 * The result is that `unavailable` is always a fresh measurement, and `produced`
 * is always a real turn on a real agent. Neither is reachable by assertion.
 */

export interface FxReplicaContextValue {
  /**
   * `null` while the probe has not answered. `no_session` when nobody is signed
   * in, because that is measured too and it must not render as "we have not
   * asked yet" — the two mean opposite things to a reader.
   *
   * `FxAgentVerdict` is the blocked set by construction (`FxAgentOutcome` adds
   * `'ready'` in a separate arm), so `'ready'` is spelled out here to keep the
   * type honest if that union ever widens.
   */
  verdict: FxAgentVerdict | 'ready' | null;
  /** The measured sentence behind a blocked verdict, verbatim. */
  detail: string | null;
  /** The replica machine. One object, read by the action and the preview column. */
  state: ReplicaState;
  /** `true` only while an attempt is really in flight. */
  inProgress: boolean;
  requestReplica: () => void;
}

const FxReplicaContext = createContext<FxReplicaContextValue | null>(null);

export function FxReplicaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [outcome, setOutcome] = useState<FxAgentOutcome | null>(null);
  const [state, setState] = useState<ReplicaState>(idleReplica);

  /**
   * One attempt at a time, as a ref rather than as state.
   *
   * State would work for the guard and be wrong for the rest: the click handler
   * below closes over the value it was created with, so a state-based guard can
   * admit a second click in the same tick that the first one set it. The ref is
   * synchronous, which is what "one attempt at a time" actually means.
   */
  const inFlight = useRef(false);
  /** Cleared on unmount so a late resolution cannot call `setState` on nothing. */
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The single real probe. Nothing else in the app calls `prepareFxAgent` for
  // its verdict.
  useEffect(() => {
    if (user === null) {
      setOutcome(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await prepareFxAgent({
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
      });
      if (!cancelled && mounted.current) setOutcome(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const requestReplica = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState(requestedReplica());
    const startedAt = Date.now();

    void (async () => {
      // Only set when this call is the one that built it. If the probe's agent
      // is reused, that owner closes it when its own turn ends and closing it
      // twice would throw out of an `await` nobody is holding.
      let owned: FxAgentReady['agent'] | null = null;

      try {
        const ready = outcome?.verdict === 'ready' ? outcome : await prepareFxAgent({
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
          getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
        });

        // Every one of these is a measured refusal, carried through untouched.
        if (ready.verdict !== 'ready') {
          setState(unavailableReplica(ready.verdict, ready.detail, Date.now() - startedAt));
          return;
        }
        owned = ready.agent;
        setState(runningReplica(null));

        const turn = owned.prompt(REPLICA_INSTRUCTIONS);
        let step: string | null = null;
        // The events must be consumed while the turn runs: awaiting only
        // `turn.result` on a stream nobody reads can wait for the drain. The
        // loop is also the progress signal — it is a tool call the SDK really
        // emitted, never a clock.
        for await (const event of turn) {
          if (event.type !== 'tool_start') continue;
          step = event.name;
          if (mounted.current) setState(runningReplica(step));
        }
        const turnResult = await turn.result;

        // The only path to `produced`, and the only source of the bytes.
        const html = readReplicaHtml(ready.workspace);
        if (!mounted.current) return;
        setState(
          html === null
            ? unavailableReplica('no_artifact', turnResult.stopReason, Date.now() - startedAt, step)
            : producedReplica(html, Date.now() - startedAt),
        );
      } catch (error) {
        if (mounted.current) {
          setState(
            unavailableReplica(
              'turn_failed',
              error instanceof Error ? error.message : String(error),
              Date.now() - startedAt,
            ),
          );
        }
      } finally {
        inFlight.current = false;
        if (owned !== null) void owned.close().catch(() => undefined);
      }
    })();
  }, [outcome]);

  const value = useMemo<FxReplicaContextValue>(
    () => ({
      // Nobody signed in is a verdict, not a missing one: `AgentChat` used to
      // say so itself before it probed anything, and that was right.
      verdict: user === null ? 'no_session' : (outcome?.verdict ?? null),
      detail: outcome?.verdict === 'ready' ? null : (outcome?.detail ?? null),
      state,
      inProgress: replicaInProgress(state),
      requestReplica,
    }),
    [outcome, state, user, requestReplica],
  );

  return <FxReplicaContext.Provider value={value}>{children}</FxReplicaContext.Provider>;
}

/**
 * Read the agent's real verdict and the replica machine.
 *
 * Throws outside the provider rather than returning a default: a fallback
 * `verdict: null` here would render "we have not asked yet" in a column that is
 * supposed to be showing an answer, which is the one reading this change exists
 * to make impossible.
 */
export function useFxReplica(): FxReplicaContextValue {
  const value = useContext(FxReplicaContext);
  if (value === null) throw new Error('useFxReplica must be used inside <FxReplicaProvider>');
  return value;
}