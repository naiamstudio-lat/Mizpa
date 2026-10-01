/**
 * fetch-source guard tests — work unit U3 (task 2.1).
 *
 * Run: npx tsx --test supabase/functions/fetch-source/*.test.ts
 *
 * These exercise the pure logic in `guard.ts`; `index.ts` is only the Deno
 * wiring. `fetch` and DNS are injected, so every refusal here is provable
 * without touching the network — which is the point of the guard.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  GuardError,
  FetchError,
  MAX_BYTES,
  assertPublic,
  blockedRange,
  extractTitle,
  fetchSource,
  htmlToText,
  readCapped,
  stripScripts,
} from './guard.ts'

// --- helpers ---------------------------------------------------------------

/** A resolver that only knows the hosts in `map`; unknown hosts fail DNS. */
function resolver(map: Record<string, string[]> = {}) {
  const calls: string[] = []
  const fn = async (hostname: string) => {
    calls.push(hostname)
    const ips = map[hostname]
    if (!ips) throw new Error(`dns: no A/AAAA record for ${hostname}`)
    return ips
  }
  return { fn, calls }
}

/** A fetch stub serving `routes`, recording every URL actually requested. */
function transport(routes: Record<string, { status?: number; body?: string; headers?: Record<string, string> } | (() => never)>) {
  const calls: string[] = []
  const signals: Array<AbortSignal | undefined> = []
  const fn = async (url: string, init?: { redirect?: string; signal?: AbortSignal }) => {
    calls.push(url)
    signals.push(init?.signal)
    if (init?.redirect !== 'manual') throw new Error(`fetch without redirect:'manual' to ${url}`)
    const route = routes[url]
    if (route === undefined) throw new Error(`fetch stub has no route for ${url}`)
    if (typeof route === 'function') return route()
    return new Response(route.body ?? '', {
      status: route.status ?? 200,
      headers: { 'content-type': 'text/plain', ...(route.headers ?? {}) },
    })
  }
  return { fn, calls, signals }
}

const PUBLIC = { 'docs.example.com': ['93.184.216.34'] }

/** Build a chunked body that streams `size` bytes in 64 KiB slices. */
function bigBody(size: number, contentLength?: string) {
  const chunk = new TextEncoder().encode('a'.repeat(64 * 1024))
  let sent = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= size) { controller.close(); return }
      const size0 = Math.min(chunk.length, size - sent)
      sent += size0
      controller.enqueue(chunk.slice(0, size0))
    },
  })
  return { body, headers: contentLength ? { 'content-length': contentLength } : {} }
}

// --- address classification -----------------------------------------------

test('blockedRange covers every range the design lists, and stops at the edge', () => {
  const blocked = [
    ['127.0.0.1', 'loopback'], ['127.255.255.254', 'loopback'],
    ['10.0.0.0', 'private'], ['10.255.255.255', 'private'],
    ['172.16.0.0', 'private'], ['172.31.255.255', 'private'],
    ['192.168.0.1', 'private'], ['192.168.255.255', 'private'],
    ['169.254.169.254', 'link-local'], ['169.254.0.0', 'link-local'],
    ['100.64.0.0', 'carrier-grade NAT'], ['100.127.255.255', 'carrier-grade NAT'],
    ['::1', 'loopback'], ['::', 'unspecified'],
    ['fc00::', 'unique local'], ['fd12:3456::1', 'unique local'],
    ['fe80::', 'link-local'], ['fe80::1', 'link-local'],
    ['::ffff:7f00:1', 'loopback'], // IPv4-mapped, as WHATWG URL hands it back
    ['::7f00:1', 'loopback'],       // IPv4-compatible (deprecated form)
    ['0.0.0.0', 'this network'],    // INADDR_ANY binds loopback on Linux
  ]
  for (const [ip, label] of blocked) {
    assert.equal(blockedRange(ip), label, `${ip} must be refused as ${label}`)
  }
  // One address outside every listed range on each side of a boundary.
  for (const ip of ['9.255.255.255', '11.0.0.0', '100.63.255.255', '100.128.0.0',
                    '172.15.255.255', '172.32.0.0', '192.167.255.255', '192.169.0.0',
                    '169.253.255.255', '126.255.255.255', '128.0.0.1', '1.1.1.1',
                    '2001:4860:4860::8888', 'fbff::', 'fec0::']) {
    assert.equal(blockedRange(ip), null, `${ip} is public and must be allowed`)
  }
})

test('obfuscated IPv4 literals are normalized by the URL parser before the guard sees them', async () => {
  for (const url of ['https://2130706433/', 'https://0x7f000001/', 'https://0177.0.0.1/', 'https://[::ffff:7f00:1]/']) {
    await assert.rejects(
      () => assertPublic(url, resolver().fn),
      (err: GuardError) => err.code === 'blocked_address',
      `${url} is 127.0.0.1 in disguise and must be refused`,
    )
  }
})

test('internal hostnames are refused before DNS is even consulted', async () => {
  const dns = resolver()
  for (const url of ['https://localhost/', 'https://api.localhost/', 'https://vault.internal/', 'https://printer.local/']) {
    await assert.rejects(
      () => assertPublic(url, dns.fn),
      (err: GuardError) => err.code === 'blocked_hostname',
      `${url} must be refused on the hostname alone`,
    )
  }
  assert.deepEqual(dns.calls, [], 'the guard must not spend a DNS lookup on a name it already knows')
})

test('only https is allowed', async () => {
  const dns = resolver({ 'example.com': ['93.184.216.34'] })
  for (const url of ['http://example.com/', 'ftp://example.com/x', 'javascript:alert(1)', 'file:///etc/passwd']) {
    await assert.rejects(
      () => assertPublic(url, dns.fn),
      (err: GuardError) => err.code === 'scheme_not_allowed',
      `${url} must be refused`,
    )
  }
  assert.equal((await assertPublic('https://example.com/x', dns.fn)).href, 'https://example.com/x')
})

test('every resolved address must be public, not just the first', async () => {
  const clean = resolver({ 'rebind.example.com': ['93.184.216.34'] })
  assert.equal((await assertPublic('https://rebind.example.com/', clean.fn)).hostname, 'rebind.example.com')

  const dirty = resolver({ 'rebind.example.com': ['93.184.216.34', '169.254.169.254'] })
  await assert.rejects(
    () => assertPublic('https://rebind.example.com/', dirty.fn),
    (err: GuardError) => err.code === 'blocked_address' && err.message.includes('169.254.169.254'),
  )
  await assert.rejects(
    () => assertPublic('https://nx.example.com/', resolver().fn),
    (err: GuardError) => err.code === 'dns_failure',
  )
})

// --- script stripping / text ----------------------------------------------

test('scripts, inline handlers and javascript: URLs are stripped; visible text survives', () => {
  const html = [
    '<html><head><title>  Docs  |  Example </title>',
    '<script src="/app.js"></script>',
    '<script>window.__NEXT_DATA__ = {"secret":1}</script>',
    '</head><body onload="stealCookies()">',
    '<h1>Getting started</h1>',
    '<a href="javascript:fetch(\'//evil\')">docs link</a>',
    '<p>Install &amp; run.</p>',
    '</body></html>',
  ].join('')
  const clean = stripScripts(html)
  assert.equal(clean.includes('<script'), false)
  assert.equal(clean.includes('app.js'), false)
  assert.equal(clean.includes('__NEXT_DATA__'), false)
  assert.equal(clean.includes('onload'), false)
  assert.equal(clean.includes('javascript:'), false)
  assert.equal(clean.includes('<h1>Getting started</h1>'), true)
  assert.equal(extractTitle(clean), 'Docs  |  Example')
  // `text` is what an agent reads, so it must be the visible body only: the
  // <title> is already reported separately and <head> is not visible at all.
  assert.equal(htmlToText(clean), 'Getting started docs link Install & run.')
  assert.equal(
    htmlToText('<head><title>T</title><style>a{b:c}</style></head><body><p>visible</p><script>leak()</script></body>'),
    'visible',
  )
})

test('an unterminated script tag is removed too, and a missing title is absent, not empty', () => {
  assert.equal(stripScripts('<p>keep</p><script src="/x.js">').includes('<script'), false)
  assert.equal(stripScripts('<p>keep</p><script src="/x.js">').includes('<p>keep</p>'), true)
  assert.equal(extractTitle('<html><body>no title here</body></html>'), null)
  assert.equal(extractTitle('<title></title>'), '')
})

// --- byte cap --------------------------------------------------------------

test('streams are cut at 256 KiB, and a lying content-length changes nothing', async () => {
  assert.equal(MAX_BYTES, 256 * 1024)
  // Two shapes, because servers differ: one chunk with a content-length, and a
  // chunked body arriving in pieces. Both must cut at the same place and hand
  // back the *real* bytes, not just the right number of them.
  const one = await readCapped(new Response('a'.repeat(300 * 1024)))
  const many = await readCapped(new Response(bigBody(300 * 1024, String(1024 * 1024 * 1024)).body))
  for (const out of [one, many]) {
    assert.equal(out.size, 262144)
    assert.equal(out.truncated, true)
    assert.equal(new TextDecoder().decode(out.bytes), 'a'.repeat(262144), 'the bytes returned must be the bytes read')
  }
  const exact = await readCapped(new Response('x'.repeat(1024)))
  assert.deepEqual([exact.size, new TextDecoder().decode(exact.bytes), exact.truncated], [1024, 'x'.repeat(1024), false])
})

test('the budget is counted in bytes, not in decoded characters', async () => {
  // 65537 astral-plane chars = 262148 UTF-8 bytes. Counting characters would
  // report `truncated: false` on a document that was demonstrably cut.
  const doc = '\u{1F642}'.repeat(65_537)
  assert.equal(new TextEncoder().encode(doc).length, MAX_BYTES + 4)
  const t = transport({ 'https://docs.example.com/llms.txt': { body: doc } })
  const out = await fetchSource('https://docs.example.com/x', { resolve: resolver(PUBLIC).fn, fetch: t.fn })
  assert.equal(out.bytes, MAX_BYTES)
  assert.equal(out.truncated, true)
  assert.equal([...out.text].length, MAX_BYTES / 4) // code points, not UTF-16 units
  assert.equal(new TextEncoder().encode(out.text).length <= MAX_BYTES, true)
})

test('text is the real document, not a buffer of the right size', async () => {
  const t = transport({
    'https://docs.example.com/llms.txt': { body: 'a'.repeat(300 * 1024) },
  })
  const out = await fetchSource('https://docs.example.com/x', { resolve: resolver(PUBLIC).fn, fetch: t.fn })
  assert.equal(out.text, 'a'.repeat(262144))
  assert.deepEqual([out.bytes, out.truncated], [262144, true])
})

// --- redirects -------------------------------------------------------------

test('follows at most 3 manual redirects, revalidating every hop', async () => {
  const hops = ['https://a.example.com/', 'https://b.example.com/', 'https://c.example.com/']
  const dns = resolver(Object.fromEntries([...hops, 'https://d.example.com/'].map((u) => [new URL(u).hostname, ['93.184.216.34']])))
  const t = transport({
    // No llms.txt/robots.txt here, so the chain resolves to raw HTML.
    [`${hops[0]}llms.txt`]: { status: 404 },
    [`${hops[0]}robots.txt`]: { status: 404 },
    [hops[0]]: { status: 301, headers: { location: `${hops[1]}page` } },
    [hops[1] + 'page']: { status: 302, headers: { location: hops[2] } },
    [hops[2]]: { status: 307, headers: { location: 'https://d.example.com/docs/' } },
    'https://d.example.com/docs/': { body: '<title>Docs</title><h1>hi</h1>' },
  })
  const out = await fetchSource(hops[0], { resolve: dns.fn, fetch: t.fn })
  assert.equal(out.url, 'https://d.example.com/docs/')
  assert.equal(out.source, 'html')
  assert.deepEqual(t.calls, [
    `${hops[0]}llms.txt`,
    `${hops[0]}robots.txt`,
    hops[0],
    `${hops[1]}page`, // relative Location resolved against the previous hop
    hops[2],
    'https://d.example.com/docs/',
  ])
})

test('a 4th redirect is refused, and a redirect to a private address never leaves the isolate', async () => {
  const chain = ['https://a.example.com/', 'https://b.example.com/', 'https://c.example.com/', 'https://d.example.com/']
  const dns = resolver(Object.fromEntries(chain.concat(['https://e.example.com/']).map((u) => [new URL(u).hostname, ['93.184.216.34']])))
  const deep = transport({
    [`${chain[0]}llms.txt`]: { status: 404 },
    [`${chain[0]}robots.txt`]: { status: 404 },
    [chain[0]]: { status: 302, headers: { location: chain[1] } },
    [chain[1]]: { status: 302, headers: { location: chain[2] } },
    [chain[2]]: { status: 302, headers: { location: chain[3] } },
    [chain[3]]: { status: 302, headers: { location: 'https://e.example.com/' } },
  })
  await assert.rejects(
    () => fetchSource(chain[0], { resolve: dns.fn, fetch: deep.fn }),
    (err: GuardError) => err.code === 'too_many_redirects',
  )
  // 3 redirects are followed (a->b->c->d); the 4th target is refused unseen.
  assert.deepEqual(deep.calls, [`${chain[0]}llms.txt`, `${chain[0]}robots.txt`, ...chain.slice(0, 4)])

  // https, so what refuses it is the address check and not the scheme check.
  const meta = transport({
    [`${chain[0]}llms.txt`]: { status: 404 },
    [`${chain[0]}robots.txt`]: { status: 404 },
    [chain[0]]: { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data/' } },
  })
  await assert.rejects(
    () => fetchSource(chain[0], { resolve: dns.fn, fetch: meta.fn }),
    (err: GuardError) => err.code === 'blocked_address' && err.message.includes('169.254.169.254'),
  )
  assert.deepEqual(meta.calls, [`${chain[0]}llms.txt`, `${chain[0]}robots.txt`, chain[0]], 'the metadata endpoint must never be contacted')
})

test('a blocked entry URL is refused before any request leaves', async () => {
  const t = transport({})
  await assert.rejects(
    () => fetchSource('https://127.0.0.1/', { resolve: resolver().fn, fetch: t.fn }),
    (err: GuardError) => err.code === 'blocked_address',
  )
  await assert.rejects(
    () => fetchSource('http://localhost:5432/', { resolve: resolver().fn, fetch: t.fn }),
    (err: GuardError) => err.code === 'scheme_not_allowed',
  )
  assert.deepEqual(t.calls, [], 'spec: refused before any request leaves')
})

// --- precedence ------------------------------------------------------------

test('llms.txt wins over robots.txt wins over raw HTML', async () => {
  const base = 'https://docs.example.com'
  const dns = resolver(PUBLIC)

  const all = transport({
    [`${base}/llms.txt`]: { body: '# Example\n\n- [Guides](/guides)\n' },
    [`${base}/robots.txt`]: { body: 'User-agent: *\nDisallow: /private\n' },
    [`${base}/guide`]: { body: '<title>Guide</title><h1>Guide</h1>' },
  })
  const llms = await fetchSource(`${base}/guide`, { resolve: dns.fn, fetch: all.fn })
  assert.deepEqual(
    [llms.source, llms.url, llms.text, llms.html, llms.title],
    ['llms.txt', `${base}/llms.txt`, '# Example\n\n- [Guides](/guides)\n', '', 'Example'],
  )
  assert.deepEqual(all.calls, [`${base}/llms.txt`], 'robots.txt must not be fetched once llms.txt answered')

  const noLlms = transport({
    [`${base}/llms.txt`]: { status: 404, body: 'not found' },
    [`${base}/robots.txt`]: { body: 'User-agent: *\nAllow: /\n' },
    [`${base}/guide`]: { body: '<title>Guide</title><h1>Guide</h1>' },
  })
  const robots = await fetchSource(`${base}/guide`, { resolve: dns.fn, fetch: noLlms.fn })
  assert.deepEqual([robots.source, robots.text], ['robots.txt', 'User-agent: *\nAllow: /\n'])

  const htmlOnly = transport({
    [`${base}/llms.txt`]: { status: 404 },
    [`${base}/robots.txt`]: { status: 404 },
    [`${base}/guide`]: { body: '<html><head><script>x()</script><title>Guide</title></head><body><h1>Guide</h1></body></html>' },
  })
  const page = await fetchSource(`${base}/guide`, { resolve: dns.fn, fetch: htmlOnly.fn })
  assert.deepEqual([page.source, page.url, page.title, page.text], ['html', `${base}/guide`, 'Guide', 'Guide'])
  assert.equal(page.html.includes('<script'), false)
  assert.equal(page.html.includes('<h1>Guide</h1>'), true)
  assert.equal(page.truncated, false)
})

test('a precedence hop is guarded like the entry URL', async () => {
  const t = transport({
    'https://docs.example.com/llms.txt': { status: 302, headers: { location: 'https://169.254.169.254/' } },
  })
  await assert.rejects(
    () => fetchSource('https://docs.example.com/x', { resolve: resolver(PUBLIC).fn, fetch: t.fn }),
    (err: GuardError) => err.code === 'blocked_address',
  )
  assert.deepEqual(t.calls, ['https://docs.example.com/llms.txt'])
})

test('404/410 falls through, any other upstream failure is terminal', async () => {
  const base = 'https://docs.example.com'
  const forUpstream = transport({ [`${base}/llms.txt`]: { status: 403 } })
  await assert.rejects(
    () => fetchSource(`${base}/x`, { resolve: resolver(PUBLIC).fn, fetch: forUpstream.fn }),
    (err: FetchError) => err.code === 'upstream_status' && err.status === 403,
  )
  assert.deepEqual(forUpstream.calls, [`${base}/llms.txt`], 'a refusal must not be retried on another path')

  const gone = transport({ [`${base}/llms.txt`]: { status: 410 }, [`${base}/robots.txt`]: { status: 404 }, [`${base}/x`]: { body: '<p>ok</p>' } })
  assert.equal((await fetchSource(`${base}/x`, { resolve: resolver(PUBLIC).fn, fetch: gone.fn })).source, 'html')

  const slow = transport({ [`${base}/llms.txt`]: () => { throw new DOMException('aborted', 'AbortError') } })
  await assert.rejects(
    () => fetchSource(`${base}/x`, { resolve: resolver(PUBLIC).fn, fetch: slow.fn }),
    (err: FetchError) => err.code === 'timeout',
  )
})

test('every request carries a deadline and never follows redirects implicitly', async () => {
  const base = 'https://docs.example.com'
  const t = transport({ [`${base}/llms.txt`]: { body: '# ok' } })
  await fetchSource(`${base}/x`, { resolve: resolver(PUBLIC).fn, fetch: t.fn })
  assert.equal(t.signals.length, 1)
  assert.equal(t.signals[0] instanceof AbortSignal, true)
})