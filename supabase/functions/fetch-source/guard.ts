/**
 * fetch-source guard — the retrievable-source policy, with no runtime deps.
 *
 * Split from `index.ts` on purpose: everything here is a pure function or a
 * function of an injected `fetch`/resolver, so the SSRF policy can be tested
 * exhaustively without a network, a Deno runtime or a database. `index.ts` only
 * supplies Deno's DNS and the real `fetch`.
 *
 * Policy (spec capability `source-fetch-guard`, design decision 3):
 *   1. scheme must be https; internal hostnames and non-public addresses are
 *      refused *before* any request leaves the isolate;
 *   2. redirects are never followed implicitly — each hop is re-validated and at
 *      most 3 hops are followed;
 *   3. bodies are read through a hard 256 KiB budget, so `content-length` is
 *      never trusted;
 *   4. scripts are stripped and the precedence chain is
 *      `/llms.txt` -> `/robots.txt` -> the raw HTML page.
 *
 * Fallback semantics: only 404 and 410 mean "not published here" and continue
 * the chain. Any other non-2xx is terminal and surfaces to the caller — a 403
 * must be reported, not silently retried against a different path.
 */

// --- contract --------------------------------------------------------------

export const MAX_BYTES = 256 * 1024
export const MAX_REDIRECTS = 3
export const FETCH_TIMEOUT_MS = 10_000

export type SourceKind = 'llms.txt' | 'robots.txt' | 'html'

export interface FetchedSource {
  url: string
  title: string
  text: string
  html: string
  source: SourceKind
  bytes: number
  truncated: boolean
}

export type ResolveHost = (hostname: string) => Promise<string[]>

export interface GuardDeps {
  resolve: ResolveHost
  fetch: (input: string, init: { redirect: 'manual'; signal: AbortSignal }) => Promise<Response>
  maxBytes?: number
}

/** The caller gave us something we will not fetch. Refused before any I/O. */
export class GuardError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'GuardError'
  }
}

/** The guard allowed the destination; the upstream or the network failed. */
export class FetchError extends Error {
  constructor(readonly code: string, message: string, readonly status = 0) {
    super(message)
    this.name = 'FetchError'
  }
}

// --- address classification ------------------------------------------------

/** Design decision 3's denylist. `0.0.0.0/8` is added: Linux binds INADDR_ANY
 *  to loopback, so it is the same hole wearing a different mask. */
const IPV4_BLOCKED: ReadonlyArray<readonly [string, number, string]> = [
  ['0.0.0.0', 8, 'this network'],
  ['10.0.0.0', 8, 'private'],
  ['100.64.0.0', 10, 'carrier-grade NAT'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.0.0', 16, 'link-local'],
  ['172.16.0.0', 12, 'private'],
  ['192.168.0.0', 16, 'private'],
]

/** Name classes that are internal by definition (design decision 3). */
const INTERNAL_HOST_SUFFIXES = ['.localhost', '.internal', '.local']

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function parseIpv4(ip: string): number | null {
  const m = IPV4_RE.exec(ip)
  if (!m) return null
  let value = 0
  for (let i = 1; i <= 4; i++) {
    const octet = Number(m[i])
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

/** Expand `::` and validate; returns 8 hextets or null. */
function parseIpv6(raw: string): number[] | null {
  const s = raw.trim().replace(/^\[/, '').replace(/\]$/, '')
  if (!s.includes(':')) return null
  const halves = s.split('::')
  if (halves.length > 2) return null
  const hextets = (part: string) =>
    part === '' ? [] : part.split(':').map((h) => (/^[0-9a-fA-F]{1,4}$/.test(h) ? parseInt(h, 16) : NaN))
  const head = hextets(halves[0])
  const tail = halves.length === 2 ? hextets(halves[1]) : []
  if ([...head, ...tail].some((h) => Number.isNaN(h))) return null
  if (halves.length === 1) return head.length === 8 ? head : null
  const fill = 8 - head.length - tail.length
  if (fill < 0) return null
  return [...head, ...Array<number>(fill).fill(0), ...tail]
}

function blockedIpv4(ip: number): string | null {
  for (const [network, prefix, label] of IPV4_BLOCKED) {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
    if (((ip & mask) >>> 0) === ((parseIpv4(network)! & mask) >>> 0)) return label
  }
  return null
}

function blockedIpv6(h: number[]): string | null {
  const zeroThrough = (n: number) => h.slice(0, n).every((x) => x === 0)
  if (h.every((x) => x === 0)) return 'unspecified' // ::
  if (zeroThrough(7) && h[7] === 1) return 'loopback' // ::1
  if ((h[0] & 0xfe00) === 0xfc00) return 'unique local' // fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80) return 'link-local' // fe80::/10
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible) carry an IPv4 address in
  // the low 32 bits; judging it as IPv6 would wave 127.0.0.1 through.
  if (zeroThrough(5)) return blockedIpv4((((h[6] << 16) | h[7]) >>> 0))
  return null
}

/** The label of the range `ip` belongs to, or null when it is public. */
export function blockedRange(ip: string): string | null {
  const v4 = parseIpv4(ip)
  if (v4 !== null) return blockedIpv4(v4)
  const v6 = parseIpv6(ip)
  return v6 ? blockedIpv6(v6) : null
}

/** Validate a URL end to end. Throws GuardError; resolves the URL otherwise. */
export async function assertPublic(rawUrl: string, resolve: ResolveHost): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new GuardError('invalid_url', `not a URL: ${rawUrl}`)
  }
  if (url.protocol !== 'https:') {
    throw new GuardError('scheme_not_allowed', `refusing ${url.protocol}//${url.host}`)
  }

  // The URL parser already normalized obfuscated IPv4 (`0x7f000001`, `2130706433`,
  // `0177.0.0.1`) and mapped v6 literals, so a literal reaching here is honest.
  const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase()
  if (host === 'localhost' || INTERNAL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new GuardError('blocked_hostname', `refusing internal hostname ${host}`)
  }
  if (parseIpv4(host) !== null || parseIpv6(host) !== null) {
    const label = blockedRange(host)
    if (label) throw new GuardError('blocked_address', `${host} is a blocked address (${label})`)
    return url
  }

  let addresses: string[]
  try {
    addresses = await resolve(host)
  } catch (err) {
    throw new GuardError('dns_failure', `cannot resolve ${host}: ${String(err)}`)
  }
  if (addresses.length === 0) throw new GuardError('dns_failure', `${host} resolved to no address`)
  for (const address of addresses) {
    // Every answer is checked: a resolver that returns one public and one
    // metadata address must not be trusted for the public one.
    const label = blockedRange(address)
    if (label) throw new GuardError('blocked_address', `${host} resolves to blocked address ${address} (${label})`)
  }
  return url
}

// --- body handling ---------------------------------------------------------

export interface ByteSource {
  body: ReadableStream<Uint8Array> | null
}

/** Read at most `maxBytes`, then stop. `content-length` is never consulted.
 *  `size` is the byte count read, which is not the length of the decoded
 *  string for any multi-byte document. */
export async function readCapped(res: ByteSource, maxBytes = MAX_BYTES) {
  if (!res.body) return { bytes: new Uint8Array(0), size: 0, truncated: false }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      chunks.push(value)
      if (total > maxBytes) { truncated = true; break }
    }
  } finally {
    try { await reader.cancel() } catch { /* stream already closed */ }
  }
  const bytes = new Uint8Array(Math.min(total, maxBytes))
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk.subarray(0, bytes.length - at), at)
    at += chunk.length
    if (at >= bytes.length) break
  }
  return { bytes, size: bytes.length, truncated }
}

const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi
const SCRIPT_OPEN = /<script\b[^>]*>/gi
const INLINE_HANDLER = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi
const JS_URL = /(href|src|xlink:href)\s*=\s*(?:"|')?\s*javascript:[^"'\s>]*(?:"|')?/gi

/** Defence in depth: the returned HTML is inert text for a model to read. */
export function stripScripts(html: string): string {
  return html
    .replace(SCRIPT_BLOCK, '')
    .replace(SCRIPT_OPEN, '')
    .replace(INLINE_HANDLER, '')
    .replace(JS_URL, '')
}

export function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)
  return m ? m[1].trim() : null
}

const HEAD = /<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const ENTITY = [
  [/&nbsp;/gi, ' '], [/&lt;/gi, '<'], [/&gt;/gi, '>'],
  [/&quot;/gi, '"'], [/&#0*39;/g, "'"], [/&amp;/gi, '&'], // amp last: one decode only
]

/** Visible text. <head>, <script> and <style> bodies are not visible. */
export function htmlToText(html: string): string {
  let text = html.replace(HEAD, ' ').replace(/<[^>]+>/g, ' ')
  for (const [pattern, replacement] of ENTITY) text = text.replace(pattern, replacement)
  return text.replace(/\s+/g, ' ').trim()
}

function markdownTitle(text: string): string {
  const heading = /^#{1,6}[ \t]+(.+)$/m.exec(text)
  return heading ? heading[1].trim() : ''
}

// --- retrieval -------------------------------------------------------------

const REDIRECTS = new Set([301, 302, 303, 307, 308])

async function request(url: string, deps: GuardDeps): Promise<Response> {
  try {
    return await deps.fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  } catch (err) {
    const name = (err as { name?: string } | null)?.name
    if (name === 'AbortError' || name === 'TimeoutError') {
      throw new FetchError('timeout', `no response within ${FETCH_TIMEOUT_MS}ms: ${url}`)
    }
    if (err instanceof GuardError || err instanceof FetchError) throw err
    throw new FetchError('network', `${url}: ${String(err)}`)
  }
}

/** Fetch `start`, validating the URL and every redirect target before use. */
async function guardedGet(start: string, deps: GuardDeps): Promise<{ url: string; res: Response }> {
  let current = await assertPublic(start, deps.resolve)
  for (let hop = 0; ; hop++) {
    const res = await request(current.href, deps)
    if (!REDIRECTS.has(res.status)) return { url: current.href, res }
    const location = res.headers.get('location')
    if (!location) throw new FetchError('upstream_status', `${current.href} answered ${res.status} with no Location`, res.status)
    if (hop >= MAX_REDIRECTS) throw new GuardError('too_many_redirects', `over ${MAX_REDIRECTS} redirects from ${start}`)
    current = await assertPublic(new URL(location, current.href).href, deps.resolve)
  }
}

async function probe(url: string, deps: GuardDeps): Promise<Response | null> {
  const { res } = await guardedGet(url, deps)
  if (res.ok) return res
  if (res.status === 404 || res.status === 410) return null
  throw new FetchError('upstream_status', `${url} answered ${res.status}`, res.status)
}

/** Assemble the response. `bytes` is the raw byte count read off the wire —
 *  the decoded string is shorter for any multi-byte document, and reporting its
 *  length would claim a truncated body was complete. */
function shape(kind: SourceKind, url: string, body: string, read: { size: number; truncated: boolean }): FetchedSource {
  const common = { url, source: kind, bytes: read.size, truncated: read.truncated }
  if (kind === 'html') {
    const html = stripScripts(body)
    return { ...common, title: extractTitle(html) ?? '', text: htmlToText(html), html }
  }
  return {
    ...common,
    title: kind === 'llms.txt' ? markdownTitle(body) : `${new URL(url).hostname}/robots.txt`,
    text: body, html: '',
  }
}

/** Resolve the documented precedence chain for `rawUrl`. */
export async function fetchSource(rawUrl: string, deps: GuardDeps): Promise<FetchedSource> {
  const cap = deps.maxBytes ?? MAX_BYTES
  const base = await assertPublic(rawUrl, deps.resolve)
  const origin = base.origin

  for (const [kind, path] of [['llms.txt', '/llms.txt'], ['robots.txt', '/robots.txt']] as const) {
    const res = await probe(`${origin}${path}`, deps)
    if (!res) continue
    const read = await readCapped(res, cap)
    return shape(kind, `${origin}${path}`, new TextDecoder().decode(read.bytes), read)
  }

  const page = await guardedGet(base.href, deps)
  const read = await readCapped(page.res, cap)
  return shape('html', page.url, new TextDecoder().decode(read.bytes), read)
}