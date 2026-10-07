import { useTranslation } from 'react-i18next';
import { useFxReplica } from '../replica/FxReplicaProvider';
import { replicaByteLength } from '../../app/replica';

/**
 * The affordance that comes after the analysis, and every state the request can
 * be in afterwards.
 *
 * ## The one thing this component must never do
 *
 * Show a replica that does not exist. Not a preview, not a skeleton shaped like
 * a page, not "almost ready", not a tick. The only confirmation in this file is
 * rendered from `state.phase === 'produced'`, and `produced` can only be reached
 * with the bytes that were read out of the agent's workspace — so the
 * confirmation is a *report* of something that happened, not a claim about what
 * will.
 *
 * ## Why `unavailable` is a panel and not an error
 *
 * It is the outcome today, and it is a legitimate one: the app knows exactly why
 * it cannot build a replica and says so. Dressing that as a red crash would
 * train the reader to ignore the panel, which is precisely how the next real
 * failure gets missed. So it is a neutral surface with a single accent rule, the
 * same weight as the rest of the analysis, and the reason gets its own sentence
 * per cause.
 *
 * And for the two that matter most today it says **which of the two things is
 * missing**, because `fx-gateway` being undeployed and `fx-gateway` having no key
 * are different problems owned by different people:
 *
 * - `gateway_unreachable` — the edge function did not answer. The deploy is
 *   missing. It says so, and says explicitly that a key would not help.
 * - `gateway_unconfigured` — the edge function answered and refused. It is
 *   deployed. What is missing is a secret, and it says that, and says
 *   explicitly that deploying it again would not help.
 *
 * A message that named only "the gateway is unavailable" would leave the reader
 * to guess which of those two they are looking at, which is the guess that costs
 * an afternoon.
 */

export function ReadinessReplicaAction({ domain }: { domain: string }) {
  const { t } = useTranslation();
  const { state, inProgress, requestReplica } = useFxReplica();

  return (
    <div className="border-t border-white/5 pt-4 mt-5" data-testid="replica-action">
      {state.phase === 'idle' && (
        <>
          <button
            type="button"
            onClick={requestReplica}
            data-testid="replica-request"
            className="font-label-mono text-[10px] text-primary border border-primary/40 bg-primary/5 hover:bg-primary/10 rounded px-4 py-2 cursor-pointer"
          >
            {t('replica.request')}
          </button>
          <p className="font-label-mono text-[10px] text-tertiary/60 mt-2 leading-relaxed">
            {t('replica.requestHint')}
          </p>
        </>
      )}

      {/* Progress is words, not a percentage: the agent's turn has no total, so
          a percentage would be a number about nothing. The step is whatever tool
          the SDK last reported, which is why it can be absent for a while. */}
      {inProgress && (
        <div data-testid="replica-progress" role="status">
          <p className="font-label-mono text-[10px] text-primary">
            {state.phase === 'requested' ? t('replica.requested') : t('replica.running', { domain })}
          </p>
          {state.step !== null && (
            <p className="font-label-mono text-[10px] text-tertiary/60 mt-1">
              {t('replica.step', { tool: state.step })}
            </p>
          )}
        </div>
      )}

      {/* Terminal, good, and quantified from the artifact itself. The byte count
          is measured from the bytes that are in the preview, so it cannot
          disagree with what is on screen. */}
      {state.phase === 'produced' && state.html !== null && (
        <div className="border-l-2 border-primary pl-3" data-testid="replica-produced" role="status">
          <p className="font-label-mono text-[10px] text-primary">{t('replica.produced')}</p>
          <p className="font-label-mono text-[10px] text-tertiary/70 mt-1 leading-relaxed">
            {t('replica.producedSize', { bytes: replicaByteLength(state.html) })}
          </p>
          <p className="font-label-mono text-[10px] text-tertiary/60 mt-1 leading-relaxed">
            {t('replica.producedHint')}
          </p>
          {state.durationMs !== null && (
            <p className="font-label-mono text-[10px] text-tertiary/40 mt-1 tabular-nums">
              {t('replica.took', { seconds: (state.durationMs / 1000).toFixed(1) })}
            </p>
          )}
        </div>
      )}

      {/* Terminal, blocked, and it names the cause. See the header.

          `role="status"` on all three async panels, never `role="alert"`: the
          butterflies are `aria-hidden`, so these words are the only thing a screen
          reader learns about the attempt, and `alert` would announce a measured
          outcome as an error — which is the tone this panel exists not to take. */}
      {state.phase === 'unavailable' && state.reason !== null && (
        <div
          className="border border-white/10 bg-surface-container border-l-2 border-l-primary pl-3 pr-3 py-3"
          data-testid="replica-unavailable"
          role="status"
        >
          <p className="font-label-mono text-[10px] text-on-surface">
            {t('replica.unavailable.heading')}
          </p>
          <p className="font-label-mono text-[10px] text-tertiary/90 mt-1 leading-relaxed">
            {/* The `defaultValue` is the safety net for a verdict this build has
                no copy for — an unmapped key renders as the key itself, which is
                the one outcome this panel exists to make impossible. */}
            {t(`replica.unavailable.${state.reason}`, { defaultValue: t('replica.unavailable.unknown') })}
          </p>
          {state.detail !== null && state.detail !== '' && (
            <p className="font-label-mono text-[10px] text-tertiary/60 mt-2 break-words">
              {t('replica.unavailable.detail', { detail: state.detail })}
            </p>
          )}
          <p className="font-label-mono text-[10px] text-tertiary/60 mt-2 leading-relaxed">
            {t('replica.unavailable.nothingWritten')}
          </p>
          <button
            type="button"
            onClick={requestReplica}
            data-testid="replica-retry"
            className="mt-3 font-label-mono text-[10px] text-primary hover:underline bg-transparent border border-primary/40 rounded px-3 py-1 cursor-pointer"
          >
            {t('replica.unavailable.retry')}
          </button>
        </div>
      )}
    </div>
  );
}