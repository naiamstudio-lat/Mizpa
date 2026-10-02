/**
 * The preview contract for generated HTML.
 *
 * Generated HTML is untrusted output written by an agent, so it renders inside
 * a sandboxed frame with an opaque origin. Kept free of React imports so the
 * unit layer can assert the contract without a DOM.
 */

export type PreviewEmptyReason = 'no-site' | 'no-entrypoint';

export const EMPTY_REASONS: readonly PreviewEmptyReason[] = ['no-site', 'no-entrypoint'];

/**
 * Sandbox for a rendered frame.
 *
 * `allow-scripts` so a generated site actually runs. Never `allow-same-origin`:
 * with both grants the frame would share this origin and the generated page
 * could read our storage and cookies.
 */
export const PREVIEW_SANDBOX = 'allow-scripts';

export type PreviewFrame =
  | { kind: 'render'; srcdoc: string; sandbox: string }
  | { kind: 'empty'; reason: PreviewEmptyReason };

/**
 * Decide what the preview shows. Whitespace is not an entrypoint — an agent that
 * wrote only newlines has produced no page, and rendering a blank frame would
 * hide that.
 */
export function previewFrame(html: string | null | undefined, siteSelected = true): PreviewFrame {
  if (!siteSelected) return { kind: 'empty', reason: 'no-site' };
  if (!html || html.trim() === '') return { kind: 'empty', reason: 'no-entrypoint' };
  return { kind: 'render', srcdoc: html, sandbox: PREVIEW_SANDBOX };
}
