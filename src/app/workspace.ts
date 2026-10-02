/**
 * The workspace contract.
 *
 * The authenticated app is ONE screen: `/app` shows the site list, the agent
 * chat and the preview of the selected site as three columns at the same time.
 * There is no per-surface route and no surface navigation, because there is
 * nothing to navigate between — the workspace shows all of it.
 *
 * What travels in the URL is a *selection*, not a destination: which site is
 * being worked on. So the only link builder here never changes the path, and the
 * only reader is `readSelection`.
 *
 * `App.tsx` mounts this screen once, `AppShell` renders the columns, and every
 * site row links through `workspacePath`. That is what makes it impossible for
 * the UI and the router to disagree about where something lives.
 *
 * It also owns the two handoffs that cross the boundary into the app: the welcome
 * flag, which is read once and must never trap someone in a dialog, and the site
 * URL typed on the landing, which is consumed and cleared rather than asked for
 * twice.
 *
 * Kept free of React imports on purpose: it is pure data plus pure functions, so
 * the unit layer can assert it without a DOM (`test/unit/workspace.test.ts`).
 */

export const APP_ROOT = '/app';

export type WorkspaceColumnId = 'history' | 'chat' | 'preview';

/** The columns, left to right. */
export const WORKSPACE_COLUMNS: readonly WorkspaceColumnId[] = ['history', 'chat', 'preview'];

/** The one column the owner can hide, so the chat and preview get the space. */
export const HISTORY_COLUMN = 'history';

/**
 * Where the collapsed state of the site list is stored.
 *
 * React state alone would forget the choice on every reload, and this is a
 * preference about how someone likes to work, not a transient view state.
 */
export const HISTORY_STORAGE_KEY = 'mizpa.workspace.historyOpen';

/**
 * Where the welcome dialog records that it has already been seen.
 *
 * One flag, and it is only ever read once per visit: dismissal is React state
 * rather than storage, so a browser that refuses to store anything still gets a
 * dialog that can be closed — it just shows again next time.
 */
export const WELCOME_STORAGE_KEY = 'mizpa.workspace.welcomeSeen';

/**
 * Where the landing leaves the site URL the visitor typed.
 *
 * `sessionStorage`, not `localStorage`, and that is the point: a URL is a
 * one-shot handoff. `sessionStorage` is scoped to the tab, so two tabs do not
 * fight over the same pending URL, and it dies with the tab instead of ageing
 * into the next session as a stale surprise.
 */
export const PENDING_URL_KEY = 'mizpa.pendingUrl';

/** The parts of the Web Storage API this module needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** What the workspace is currently showing. */
export interface WorkspaceSelection {
  siteId: string | null;
}

/** The query keys the workspace keeps a selection in. */
const SELECTION_KEYS = ['site'] as const;

/**
 * A change to the selection. A key left out is untouched; a key set to `null` is
 * cleared.
 *
 * The difference is the whole contract: `workspacePath({}, current)` and
 * `workspacePath({ site: null }, current)` both start from what is already
 * selected, and they do not produce the same URL. Building the query from
 * `change` alone would drop every parameter the user did not happen to mention.
 */
export type SelectionChange = {
  site?: string | null;
};

/**
 * The only link into the app. A site changes what the workspace shows, never
 * where it lives.
 *
 * `current` is what is selected now, and it is merged rather than replaced —
 * `workspacePath({ site }, searchParams)` keeps whatever else the URL carries.
 * Building the query from `change` alone would silently drop it, so a row click
 * would wipe the selection out from under the chat and the preview. With no
 * `current`, the link starts from an empty selection.
 */
export function workspacePath(change: SelectionChange = {}, current?: string | URLSearchParams): string {
  const params = new URLSearchParams(
    current === undefined ? '' : typeof current === 'string' ? stripSearch(current) : current.toString(),
  );

  for (const key of SELECTION_KEYS) {
    const value = change[key];
    if (value === undefined) continue;
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  }

  const query = params.toString();
  return query ? `${APP_ROOT}?${query}` : APP_ROOT;
}

/**
 * Read the current selection out of a URL. Accepts a search string, a full path
 * or the `URLSearchParams` a router hands out, and never throws on malformed
 * input: a hand-typed URL must not blank the workspace.
 *
 * The `?` and `#` are stripped on purpose. `new URLSearchParams('/app?site=a')`
 * does not fail loudly — it silently reads a parameter named `/app?site`, so
 * every selection comes back empty. Being lenient here is what keeps that from
 * becoming a bug nobody notices.
 */
export function readSelection(source: string | URLSearchParams): WorkspaceSelection {
  const params =
    typeof source === 'string' ? new URLSearchParams(stripSearch(source)) : source;
  return {
    siteId: params.get('site') || null,
  };
}

function stripSearch(value: string): string {
  const withoutHash = value.split('#')[0];
  const questionMark = withoutHash.indexOf('?');
  return questionMark === -1 ? withoutHash : withoutHash.slice(questionMark + 1);
}

/**
 * Take the site URL the visitor typed on the landing, if any.
 *
 * Read and cleared in one step, on purpose. Leaving it behind would prefill the
 * create form from a URL the visitor already dealt with, so the same site would
 * be suggested again on the next visit — which reads as a bug, not as a
 * convenience. An unreadable store yields no URL and leaves the normal path
 * untouched.
 */
export function takePendingUrl(storage: StorageLike): string {
  try {
    const pending = storage.getItem(PENDING_URL_KEY);
    storage.removeItem(PENDING_URL_KEY);
    return pending ? pending.trim() : '';
  } catch {
    return '';
  }
}

/**
 * Has this visitor already been welcomed? Unreadable storage answers `false`,
 * so the dialog shows and can be dismissed rather than being skipped silently —
 * a broken store must not decide what someone is allowed to see.
 */
export function isWelcomeSeen(storage: StorageLike): boolean {
  try {
    return storage.getItem(WELCOME_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Remember that the welcome dialog has been dismissed. Written on every way out
 * — the primary action, Escape and the backdrop all land here — so no exit leaves
 * it to come back. Storage failures are ignored: refusing to store the flag costs
 * one extra dialog next visit, whereas throwing here would cost the dialog itself.
 */
export function persistWelcomeSeen(storage: StorageLike): void {
  try {
    storage.setItem(WELCOME_STORAGE_KEY, 'true');
  } catch {
    // Same reasoning as `persistHistory`: the session still works, only the
    // preference does not survive a reload.
  }
}

/**
 * TEMPORARY: the welcome dialog shows on every visit so it can be reviewed while
 * it is being designed. The owner asked for this explicitly and said the
 * once-per-user behaviour comes back before launch.
 *
 * It is a constant rather than deleted code so re-enabling is a one-line flip
 * instead of a reconstruction: set this to `false` and `isWelcomeSeen` starts
 * gating the dialog again — the storage flag is still being written on every
 * dismissal, so nothing else has to be restored.
 */
export const SHOW_WELCOME_EVERY_TIME = true;

/**
 * Is the site list column open? Open by default — a first visit must show the
 * column the owner asked for. Anything unreadable falls back to open rather than
 * to hidden, so a bad value can never make the column unreachable.
 */
export function isHistoryOpen(storage: StorageLike): boolean {
  try {
    return storage.getItem(HISTORY_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** Remember whether the site list column is open. Storage failures are ignored. */
export function persistHistory(storage: StorageLike, open: boolean): void {
  try {
    storage.setItem(HISTORY_STORAGE_KEY, String(open));
  } catch {
    // A browser that refuses storage (private mode, quota) still gets a workspace
    // that works for this session; only the choice does not survive a reload.
  }
}