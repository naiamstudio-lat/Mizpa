/**
 * fx-gateway proxy policy tests — work unit U4 (task 2.3).
 *
 * Run: npx tsx --test supabase/functions/fx-gateway/*.test.ts
 *
 * `proxy.ts` holds the whole decision surface of this function — which paths may
 * be proxied, which headers the upstream may see, what one request costs — with
 * no Deno, no network and no database. That is what makes the anti-leak control
 * provable here instead of hopeful: the upstream header set is asserted as a
 * closed set, so no incoming client header can survive by accident.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BOOTSTRAP_COST_UNITS,
  BROWSER_HEADER_NAMES,
  DEFAULT_DAILY_UNITS,
  EXPOSE_HEADERS,
  GATEWAY_ORIGIN,
  GATEWAY_PROTOCOL_VERSION,
  MODELS_LIST_COST_UNITS,
  RESERVATION_UNITS,
  UNITS_PER_TOKEN,
  UPSTREAM_HEADER_NAMES,
  UPSTREAM_TIMEOUT_MS,
  ProxyError,
  assertProxyPath,
  buildBootstrapPayload,
  buildBrowserHeaders,
  buildGatewayResponse,
  buildUpstreamRequest,
  createUsageScanner,
  extractUsage,
  planSettlement,
  providerOf,
  quotaDenied,
  reconcileRequestBody,
  reserveUnitsFor,
  resolveGatewayBaseUrl,
} from './proxy.ts'

/** The code a refusal must carry, so the browser can tell 403-quota from
 *  403-path without parsing prose. */
function refuses(fn: () => unknown, code: string, status: number) {
  assert.throws(fn, (thrown: unknown) => {
    if (!(thrown instanceof ProxyError)) {
      throw new Error(`expected a ProxyError, got ${String(thrown)}`)
    }
    assert.equal(thrown.code, code)
    assert.equal(thrown.status, status)
    return true
  })
}

/** Both allow-listed routes. Every escape below is probed against each of them:
 *  a corpus exercised through one route alone is blind to a broken anchor on the
 *  other, which is exactly what the first mutation run found. */
const ROUTES = [['POST', '/v4/ai/language-model'], ['GET', '/coding-agent/v1/models']] as const

/** `path` is refused by every route, under every method. */
function refusedEverywhere(path: unknown) {
  for (const [method, allowed] of ROUTES) {
    // The positive control first: proving a corpus is refused means nothing if
    // the very same assertion would reject the legitimate path.
    assert.equal(assertProxyPath(method, allowed), allowed)
    refuses(() => assertProxyPath(method, path), 'path_not_allowed', 403)
  }
}

// --- the allow-list ---------------------------------------------------------

test('every version of the generation route is proxied; the list is version-agnostic', () => {
  // libfx 0.0.12 calls /v4; its README still documents /v3. Pinning one of them
  // turns a libfx upgrade into a silent 403 for every user.
  for (const v of ['v1', 'v3', 'v4', 'v12', 'v999']) {
    assert.equal(assertProxyPath('POST', `/${v}/ai/language-model`), `/${v}/ai/language-model`)
  }
})

test('every version of the models route is proxied', () => {
  for (const v of ['v1', 'v2', 'v4']) {
    assert.equal(assertProxyPath('GET', `/coding-agent/${v}/models`), `/coding-agent/${v}/models`)
  }
})

test('the method is part of the rule, not just the path', () => {
  refuses(() => assertProxyPath('POST', '/coding-agent/v1/models'), 'path_not_allowed', 403)
  refuses(() => assertProxyPath('GET', '/v4/ai/language-model'), 'path_not_allowed', 403)
  for (const method of ['PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
    refuses(() => assertProxyPath(method, '/v4/ai/language-model'), 'path_not_allowed', 403)
  }
})

test('a real gateway path that is not on the list is refused', () => {
  for (const path of ['/v4/ai/embedding', '/v4/ai/images/generations', '/coding-agent/v1/models/1',
    '/v4', '/ai/language-model', '/coding-agent/models', '/', '/v4/ai/language-model-extra']) {
    refuses(() => assertProxyPath('POST', path), 'path_not_allowed', 403)
  }
})

test('traversal, protocol-relative, absolute and newline-padded forms are refused by every route', () => {
  const escapes = [
    '/v4/ai/../../admin',
    '/v4/ai/language-model/../../../v4/ai/language-model',
    '//ai-gateway.vercel.sh.attacker.test/v4/ai/language-model',
    '//attacker.test/v4/ai/language-model',
    'http://ai-gateway.vercel.sh/v4/ai/language-model',
    'https://attacker.test/v4/ai/language-model',
    '/v4/ai/language-model/',              // trailing slash is a different resource
    ' /v4/ai/language-model',              // leading space
    '/v4/ai/language-model\n',             // a trailing newline must not satisfy `$`
    '/coding-agent/v1/models/',
    '/coding-agent/v1/models/../admin',
    '\n/coding-agent/v1/models',           // a leading newline must not satisfy `^`
    '/coding-agent/v1/models\n',
    '/coding-agent/v1/models?limit=0',
  ]
  for (const path of escapes) refusedEverywhere(path)
})

test('a path carrying a search or a fragment is refused', () => {
  // `?path=` is the only place query data can arrive; letting it through would
  // hand the upstream a second set of parameters the caller invented.
  refusedEverywhere('/v4/ai/language-model?x=1')
  refusedEverywhere('/v4/ai/language-model#f')
  refusedEverywhere('/v4/ai/language%2dmodel')
})

test('a missing or non-string path is a bad request, not a refusal', () => {
  for (const bad of [null, undefined, '', 42, {}, ['/v4/ai/language-model']]) {
    refuses(() => assertProxyPath('POST', bad), 'missing_path', 400)
  }
})

test('the validated path is returned unchanged — the function never rewrites it', () => {
  const path = '/v4/ai/language-model'
  assert.equal(assertProxyPath('POST', path), path)
})

// --- header reconstruction: the anti-leak control ----------------------------

/** What a browser caller actually sends. Every value here is a secret or an
 *  impostor; none of it may reach the gateway. */
function poisonedClientRequest() {
  return new Request(`${GATEWAY_ORIGIN}/v4/ai/language-model?path=%2Fv4%2Fai%2Flanguage-model`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer PLACEHOLDER-KEY-FROM-THE-TAB',
      cookie: 'sb-access-token=SECRET-SESSION',
      apikey: 'PUBLIC-PUBLISHABLE-KEY',
      'x-client-info': 'supabase-js/2.108.2',
      'ai-language-model-id': 'attacker-chosen-model',
      'x-forwarded-for': '203.0.113.9',
      'user-agent': 'Mozilla/5.0 (attacker)',
      'x-vercel-set-cookie': 'vercel=jwt',
      'content-type': 'text/plain',
    },
    body: '{"model":"attacker-chosen-model"}',
  })
}

test('the upstream header set is closed: no client header can survive by accident', async () => {
  const client = poisonedClientRequest()
  const { headers } = buildUpstreamRequest({
    method: client.method,
    path: assertProxyPath(client.method, new URL(client.url).searchParams.get('path')),
    body: await client.text(),
    apiKey: 'REAL-SERVER-KEY',
    modelId: 'openai/gpt-5',
  })

  assert.deepEqual(Object.keys(headers).sort(), [...UPSTREAM_HEADER_NAMES].sort())
  const dump = JSON.stringify(headers)
  for (const leak of ['PLACEHOLDER-KEY-FROM-THE-TAB', 'SECRET-SESSION', 'PUBLIC-PUBLISHABLE-KEY',
    'attacker-chosen-model', '203.0.113.9', 'attacker', 'vercel=jwt']) {
    assert.equal(dump.includes(leak), false, `upstream headers leaked ${leak}`)
  }
  assert.equal(headers.authorization, 'Bearer REAL-SERVER-KEY')
  assert.equal(headers['content-type'], 'application/json')
})

test('the protocol version header is sent, because the gateway 400s without it', () => {
  // Regression guard for C5. Verified against the live gateway: /v1, /v3 and /v4
  // all answer 400 "Unsupported gateway protocol version" without this header,
  // and that failure arrives *before* auth — so a credential-only test never sees
  // it and the proxy looks healthy while every real request fails.
  const { headers } = buildUpstreamRequest({
    method: 'POST',
    path: '/v4/ai/language-model',
    body: '{"prompt":[]}',
    apiKey: 'REAL-SERVER-KEY',
    modelId: 'openai/gpt-5',
  })

  assert.equal(headers['ai-gateway-protocol-version'], GATEWAY_PROTOCOL_VERSION)
  assert.ok(UPSTREAM_HEADER_NAMES.includes('ai-gateway-protocol-version' as never))
})

test('the content-type is ours, not the caller\'s', async () => {
  const client = poisonedClientRequest()
  const { headers } = buildUpstreamRequest({
    method: client.method,
    path: '/v4/ai/language-model',
    body: await client.text(),
    apiKey: 'REAL-SERVER-KEY',
    modelId: 'openai/gpt-5',
  })
  // The caller asked for text/plain; a gateway that answers on the wrong type is
  // a gateway that silently drops the JSON body.
  assert.notEqual(headers['content-type'], 'text/plain')
})

test('a GET carries no content-type at all', () => {
  const { headers } = buildUpstreamRequest({
    method: 'GET',
    path: '/coding-agent/v1/models',
    body: null,
    apiKey: 'REAL-SERVER-KEY',
    modelId: 'openai/gpt-5',
  })
  // Only content-type is method-dependent. The protocol header is unconditional
  // because the gateway rejects the version before it looks at anything else, so
  // dropping it on GET would break model listing the same way it broke inference.
  assert.deepEqual(Object.keys(headers).sort(),
    ['ai-gateway-protocol-version', 'ai-language-model-id', 'authorization'])
})

test('a missing credential is a server fault (500), never a 403 that looks like quota', () => {
  refuses(() => buildUpstreamRequest({ method: 'POST', path: '/v4/ai/language-model', body: '{}', apiKey: '', modelId: 'm' }),
    'missing_api_key', 500)
  refuses(() => buildUpstreamRequest({ method: 'POST', path: '/v4/ai/language-model', body: '{}', apiKey: 'k', modelId: '' }),
    'missing_model_id', 500)
})

test('the upstream request is pinned to one origin and never redirects', () => {
  const { url, redirect } = buildUpstreamRequest({
    method: 'POST', path: '/v4/ai/language-model', body: '{}', apiKey: 'k', modelId: 'm',
  })
  assert.equal(url, `${GATEWAY_ORIGIN}/v4/ai/language-model`)
  assert.equal(redirect, 'error')
})

test('every upstream request carries an armed deadline, not a signal that never fires', async () => {
  const { signal } = buildUpstreamRequest({
    method: 'POST', path: '/v4/ai/language-model', body: '{}', apiKey: 'k', modelId: 'm', timeoutMs: 1,
  })
  assert.ok(signal instanceof AbortSignal)
  // An inert `new AbortController().signal` also passes `instanceof`, so
  // existence is not the assertion — firing is.
  assert.equal(signal.aborted, false)
  await new Promise((r) => setTimeout(r, 25))
  assert.equal(signal.aborted, true, 'the deadline must actually abort the upstream request')
  assert.equal(UPSTREAM_TIMEOUT_MS, 30_000)
})

// --- what comes back --------------------------------------------------------

test('only content-type is passed back to the browser', () => {
  const upstream = new Response('{}', {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'set-cookie': 'vercel=jwt; Path=/',
      'www-authenticate': 'Bearer realm="gateway"',
      'x-vercel-id': 'iad1::abc',
      'x-ratelimit-remaining': '0',
    },
  })
  const out = buildGatewayResponse(upstream)
  assert.equal(out.status, 429)
  assert.deepEqual(out.headers, { 'content-type': 'application/json' })
})

test('the upstream body is forwarded by identity — a stream is never buffered', () => {
  const stream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(new TextEncoder().encode('a')); c.close() },
  })
  const out = buildGatewayResponse(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }))
  assert.equal(out.body, stream, 'buffering a streaming completion would defeat the deadline')
})

// --- the reservation and the settlement -------------------------------------

test('the budget is denominated in tokens, and one reservation is a real turn', () => {
  // The unit is a token, not a request. The charge before the call is a
  // *reservation* — an estimate — because the real number only exists once the
  // answer is back. It has to be big enough that an ordinary agent turn is never
  // refused mid-flight, or the product breaks; small enough that a runaway loop
  // still runs out inside the deadline.
  assert.equal(UNITS_PER_TOKEN, 1)
  assert.equal(RESERVATION_UNITS, 200_000)
  assert.equal(MODELS_LIST_COST_UNITS, 1)
  assert.ok(Number.isInteger(RESERVATION_UNITS) && RESERVATION_UNITS > 0)
  assert.ok(DEFAULT_DAILY_UNITS >= RESERVATION_UNITS,
    'a budget below one reservation would refuse every call with no way to tell why')
  // A full day has to hold many reservations, or the proxy is a demo.
  assert.ok(DEFAULT_DAILY_UNITS / RESERVATION_UNITS >= 50)
})

test('a generation is reserved in full; a model listing is charged one token', () => {
  // U4 charged a flat unit for both, so a model catalogue listing could be the
  // call that locks a user out. The listing is not free — it still needs the
  // ledger to be the single choke point — but it is not a fifth of a turn.
  assert.equal(reserveUnitsFor('POST'), RESERVATION_UNITS)
  assert.equal(reserveUnitsFor('GET'), MODELS_LIST_COST_UNITS)
  // An unknown method is treated as the expensive case: fail toward spending.
  assert.equal(reserveUnitsFor('DELETE'), RESERVATION_UNITS)
})

test('settlement refunds the unused part of a reservation', () => {
  const plan = planSettlement(RESERVATION_UNITS, { inputTokens: 30_000, outputTokens: 4_000, totalTokens: 34_000 })
  assert.equal(plan.settles, true)
  assert.equal(plan.actual, 34_000)
  assert.equal(plan.heldUnits, 34_000, 'the ledger must end up holding the real usage, not the estimate')
  assert.equal(plan.refund, 166_000)
})

test('settlement charges an overrun instead of ignoring it', () => {
  const plan = planSettlement(RESERVATION_UNITS, { inputTokens: 240_000, outputTokens: 60_000, totalTokens: 300_000 })
  assert.equal(plan.settles, true)
  assert.equal(plan.actual, 300_000)
  assert.equal(plan.refund, -100_000, 'an overrun is a debit, not a clamped zero')
  assert.equal(plan.heldUnits, 300_000)
})

test('a crash between reserve and settle leaves the reservation as the cost', () => {
  // The failure mode of the whole rule, stated as an assertion: when the
  // isolate dies before the upstream answers — or the stream is abandoned
  // mid-generation — the ledger keeps the reservation and is charged for work
  // that may never have happened. Bounded, and bounded in the direction that
  // cannot leak spend.
  const plan = planSettlement(RESERVATION_UNITS, null)
  assert.equal(plan.settles, false)
  assert.equal(plan.actual, null)
  assert.equal(plan.heldUnits, RESERVATION_UNITS)
  assert.equal(plan.refund, 0, 'no usage means no settlement, so no refund either')
})

test('a zero-token answer refunds the whole reservation', () => {
  const plan = planSettlement(RESERVATION_UNITS, { inputTokens: 0, outputTokens: 0, totalTokens: 0 })
  assert.equal(plan.settles, true)
  assert.equal(plan.actual, 0)
  assert.equal(plan.heldUnits, 0)
})

test('quota is denied for 0 and for anything that is not a positive number', () => {
  assert.equal(quotaDenied(0), true)          // the RPC's documented denial signal
  assert.equal(quotaDenied(1), false)
  assert.equal(quotaDenied(19_999_999), false)
  assert.equal(quotaDenied(null), true)       // fail closed, not open
  assert.equal(quotaDenied(undefined), true)
  assert.equal(quotaDenied(Number.NaN), true)
})

// --- who owns the model ------------------------------------------------------
// Product owner's decision: the function owns the model, the tab does not, and
// the tab is *told*. The alternative — letting the tab believe it chose — is the
// silent lie U4 shipped, so the header is the only channel and the body's
// `model` is removed rather than merely ignored.

test('the header owns the model: a caller body model is stripped before forwarding', () => {
  const body = JSON.stringify({
    model: 'attacker/chosen-model',
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    maxOutputTokens: 4096,
  })
  const r = reconcileRequestBody(body, 'anthropic/claude-sonnet-4.5')

  // The forwarded body must not carry a model at all. Not "overwritten with the
  // server's" — removed, so there is no second source of truth to disagree with
  // the header if the gateway ever starts honouring it.
  const forwarded = JSON.parse(r.body) as Record<string, unknown>
  assert.equal('model' in forwarded, false)
  assert.equal(JSON.stringify(forwarded).includes('attacker'), false)
  // Everything else survives untouched: this is the tab's prompt, not ours.
  assert.equal(forwarded.maxOutputTokens, 4096)
  assert.equal((forwarded.prompt as unknown[]).length, 1)
  // And what the caller asked for is remembered, so it can be reported.
  assert.equal(r.requestedModel, 'attacker/chosen-model')
  assert.equal(r.model, 'anthropic/claude-sonnet-4.5')
})

test('a body with no model is forwarded semantically unchanged', () => {
  const body = JSON.stringify({ prompt: [], temperature: 0.2 })
  const r = reconcileRequestBody(body, 'openai/gpt-5')
  assert.equal(r.requestedModel, null)
  assert.deepEqual(JSON.parse(r.body), { prompt: [], temperature: 0.2 })
})

test('a body model that already agrees is still stripped — one channel, no exceptions', () => {
  // The invariant is structural, not conditional. A rule that only fires on a
  // mismatch has to be right about what "matches" means, and a tab that agrees
  // today will not agree after a model is swapped server-side.
  const r = reconcileRequestBody(JSON.stringify({ model: 'openai/gpt-5', prompt: [] }), 'openai/gpt-5')
  assert.equal(JSON.parse(r.body).model, undefined)
  assert.equal(r.requestedModel, 'openai/gpt-5')
  assert.equal(r.modelMatchesRequest, true)
  assert.equal(r.modelWasOverridden, false)
})

test('a disagreeing body model is reported as overridden, not silently dropped', () => {
  const r = reconcileRequestBody(JSON.stringify({ model: 'openai/gpt-5', prompt: [] }), 'anthropic/claude-sonnet-4.5')
  assert.equal(r.modelMatchesRequest, false)
  assert.equal(r.modelWasOverridden, true)
})

test('the upstream request carries the reconciled body, not the raw one', () => {
  const r = reconcileRequestBody(JSON.stringify({ model: 'attacker/chosen', prompt: [] }), 'anthropic/claude-sonnet-4.5')
  const built = buildUpstreamRequest({
    method: 'POST',
    path: '/v4/ai/language-model',
    body: r.body,
    apiKey: 'REAL-SERVER-KEY',
    modelId: r.model,
  })
  assert.equal(built.body, r.body)
  assert.equal(built.headers['ai-language-model-id'], 'anthropic/claude-sonnet-4.5')
})

test('a body that is not a JSON object is refused before the upstream is contacted', () => {
  // The proxy now owns the body — it has to be able to read it to honour the
  // ownership invariant. A body it cannot parse is a body it cannot vouch for.
  for (const bad of ['', 'not json', '"a string"', '42', 'null', '[]']) {
    refuses(() => reconcileRequestBody(bad, 'openai/gpt-5'), 'invalid_body', 400)
  }
})

test('a non-string model in the body is not mistaken for the model id', () => {
  const r = reconcileRequestBody(JSON.stringify({ model: { nested: true }, prompt: [] }), 'openai/gpt-5')
  assert.equal(r.requestedModel, null)
  assert.equal('model' in (JSON.parse(r.body) as Record<string, unknown>), false)
})

test('the provider is the prefix of the model id the server chose', () => {
  assert.equal(providerOf('anthropic/claude-sonnet-4.5'), 'anthropic')
  assert.equal(providerOf('openai/gpt-5'), 'openai')
  assert.equal(providerOf('bedrock/amazon.nova-pro-v1:0'), 'bedrock')
  // A malformed id must not produce a provider that reads like a real one.
  assert.equal(providerOf('gpt-5'), 'unknown')
  assert.equal(providerOf(''), 'unknown')
})

// --- reading the model's token usage -----------------------------------------
// Verified field path, not a guess. `/v4/ai/language-model` serves Language
// Model Specification **v4** (AI SDK 7), whose `LanguageModelV4Usage` is
// `{ inputTokens: { total, noCache, cacheRead, cacheWrite },
//    outputTokens: { total, text, reasoning }, raw? }`:
//   - non-streaming: the top-level `usage` object, a sibling of `content`.
//   - streaming:     the terminal `{ "type": "finish", "usage": { … } }` part.

test('usage is read from the Language Model V4 path', () => {
  const usage = extractUsage({
    content: [{ type: 'text', text: 'hi' }],
    finishReason: 'stop',
    usage: { inputTokens: { total: 30_000 }, outputTokens: { total: 4_000 } },
    warnings: [],
  })
  assert.deepEqual(usage, { inputTokens: 30_000, outputTokens: 4_000, totalTokens: 34_000 })
})

test('the v3 prompt/completion spelling is accepted too, without being preferred', () => {
  // libfx pins a protocol version but the gateway answers other versions on the
  // version-agnostic route, so a v3-shaped payload must not read as "no usage"
  // and silently keep the whole reservation.
  assert.deepEqual(
    extractUsage({ usage: { inputTokens: { total: 10 }, outputTokens: { total: 5 } } }),
    { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  )
  assert.deepEqual(
    extractUsage({ usage: { promptTokens: 7, completionTokens: 3 } }),
    { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
  )
})

test('a missing, partial or non-numeric usage is no usage, not a guess', () => {
  // Every one of these fails toward *keeping* the reservation, which is the
  // direction that cannot leak spend. Guessing zero here would hand out free
  // generations to anyone who could shape the response.
  const noUsage = [
    null,
    undefined,
    {},
    'a string',
    { usage: null },
    { usage: {} },
    { usage: { inputTokens: { total: 10 } } },              // output missing
    { usage: { outputTokens: { total: 10 } } },              // input missing
    { usage: { inputTokens: { total: '10' }, outputTokens: { total: 1 } } }, // stringly typed
    { usage: { inputTokens: { total: -5 }, outputTokens: { total: 1 } } },    // negative
    { usage: { inputTokens: { total: Number.NaN }, outputTokens: { total: 1 } } },
    { usage: { inputTokens: { total: null }, outputTokens: { total: null } } },
  ]
  for (const payload of noUsage) {
    assert.equal(extractUsage(payload), null, `expected no usage from ${JSON.stringify(payload)}`)
  }
})

test('the SSE scanner finds the finish part even when it straddles chunks', () => {
  // A generation is relayed by reference, so the usage has to be recovered from
  // a stream the proxy never buffered. That means a JSON object can arrive split
  // across any number of chunks, which is the case a naive `split('\n\n')`
  // scanner gets wrong on real token boundaries.
  const sse =
    'data: {"type":"stream-start","warnings":[]}\n\n' +
    'data: {"type":"text-delta","id":"0","delta":"Hel"}\n\n' +
    'data: {"type":"text-delta","id":"0","delta":"lo"}\n\n' +
    'data: {"type":"finish","finishReason":"stop","usage":{"inputTokens":{"total":1234},"outputTokens":{"total":56}}}\n\n' +
    'data: [DONE]\n\n'
  const expected = { inputTokens: 1234, outputTokens: 56, totalTokens: 1290 }

  // Every possible split point must produce the same answer.
  for (let cut = 1; cut < sse.length; cut++) {
    const scanner = createUsageScanner('sse')
    let found = scanner.push(sse.slice(0, cut))
    found = found ?? scanner.push(sse.slice(cut))
    found = found ?? scanner.end()
    assert.deepEqual(found, expected, `usage lost when the stream was cut at ${cut}`)
  }
})

test('a stream that never sends a finish part reports no usage', () => {
  const scanner = createUsageScanner('sse')
  assert.equal(scanner.push('data: {"type":"stream-start","warnings":[]}\n\n'), null)
  assert.equal(scanner.push('data: {"type":"text-delta","id":"0","delta":"partial"}\n\n'), null)
  // The connection died mid-generation. The reservation stands.
  assert.equal(scanner.end(), null)
})

test('the SSE scanner ignores keep-alives, comments and non-JSON payloads', () => {
  const scanner = createUsageScanner('sse')
  scanner.push(': ping\n\n')
  scanner.push('event: message\n')
  scanner.push('data: not json at all\n\n')
  scanner.push('data: {"type":"text-delta","id":"0","delta":"x"}\n\n')
  assert.equal(scanner.end(), null)
})

test('a finish part with no usage is not a usage of zero', () => {
  const scanner = createUsageScanner('sse')
  const found = scanner.push('data: {"type":"finish","finishReason":"stop"}\n\n')
  assert.equal(found, null)
})

test('the JSON scanner reports nothing on push, and everything on end', () => {
  // The contrast with the SSE scanner is the point. A stream reports the moment
  // the finish part lands, because there is more after it that matters. A JSON
  // body has nothing to report until it is whole — and re-parsing the whole
  // accumulated body on every chunk would make reading a large answer quadratic,
  // so `push` is deliberately answerless and `end` does the single parse.
  const body = JSON.stringify({
    content: [],
    usage: { inputTokens: { total: 900 }, outputTokens: { total: 100 } },
  })
  const scanner = createUsageScanner('json')
  assert.equal(scanner.push(body.slice(0, 20)), null)
  // The *entire* body, pushed, still reports nothing: completeness is decided by
  // `end`, not by "we happen to hold all the bytes".
  assert.equal(scanner.push(body.slice(20)), null)
  assert.deepEqual(scanner.end(), { inputTokens: 900, outputTokens: 100, totalTokens: 1000 })
})

test('a JSON body with no usage settles on the reservation, not on zero', () => {
  const scanner = createUsageScanner('json')
  scanner.push('{"content":[],"finishReason":"stop"}')
  assert.equal(scanner.end(), null)
  assert.equal(createUsageScanner('json').end(), null)
})

// --- what the tab is told ----------------------------------------------------

test('the gateway base URL comes from configuration, because the runtime eats the path', () => {
  // Verified against a real supabase/edge-runtime: the function is invoked with
  // its own path already stripped, so `req.url` inside the worker is
  // `http://host:9111/` — deriving the base URL from the request hands the tab a
  // URL with no function segment, which is not a URL it can call. The function
  // therefore cannot know its own public address and must be told.
  assert.equal(
    resolveGatewayBaseUrl('https://project.supabase.co/functions/v1/fx-gateway/', 'http://127.0.0.1:9111/'),
    'https://project.supabase.co/functions/v1/fx-gateway',
  )
  // With nothing configured, fall back to the request URL — right when the
  // function really is served from the root, wrong when it is not, which is why
  // it is the fallback and not the default.
  assert.equal(resolveGatewayBaseUrl('', 'http://127.0.0.1:9111/'), 'http://127.0.0.1:9111')
  assert.equal(resolveGatewayBaseUrl('', 'http://127.0.0.1:9111/fx-gateway'), 'http://127.0.0.1:9111/fx-gateway')
})

test('the reported base URL never ends in a slash', () => {
  // A trailing slash turns `base + path` into a double slash, and a tab that
  // builds URLs by concatenation would ship `?path=` onto the wrong segment.
  for (const [configured, request, expected] of [
    ['https://x.test/a/', 'http://y/', 'https://x.test/a'],
    ['https://x.test/a///', 'http://y/', 'https://x.test/a'],
    ['https://x.test', 'http://y/', 'https://x.test'],
    ['', 'http://y.test/fx-gateway/', 'http://y.test/fx-gateway'],
    ['', 'http://y.test/', 'http://y.test'],
  ] as const) {
    assert.equal(resolveGatewayBaseUrl(configured, request), expected)
  }
})

test('the browser headers are a closed set that carries no secret', () => {
  const headers = buildBrowserHeaders(
    {},
    {
      model: 'anthropic/claude-sonnet-4.5',
      provider: 'anthropic',
      gatewayBaseUrl: 'https://project.supabase.co/functions/v1/fx-gateway',
      units: 34_000,
      remaining: 19_966_000,
      apiKey: 'REAL-SERVER-KEY',
    },
  )
  assert.deepEqual(Object.keys(headers).sort(), [...BROWSER_HEADER_NAMES].sort())
  assert.equal(headers['x-fx-model'], 'anthropic/claude-sonnet-4.5')
  assert.equal(headers['x-fx-provider'], 'anthropic')
  assert.equal(headers['x-fx-units'], '34000')
  assert.equal(headers['x-fx-quota-remaining'], '19966000')
  assert.equal(headers['x-fx-gateway-base'], 'https://project.supabase.co/functions/v1/fx-gateway')
})

test('only content-type crosses from the upstream, however many headers it had', () => {
  const headers = buildBrowserHeaders(
    {
      'content-type': 'text/event-stream',
      'set-cookie': 'vercel=jwt; Path=/',
      'x-vercel-id': 'iad1::abc',
      authorization: 'Bearer REAL-SERVER-KEY',
    },
    {
      model: 'anthropic/claude-sonnet-4.5',
      provider: 'anthropic',
      gatewayBaseUrl: 'https://x.test/fx-gateway',
      units: 1,
      remaining: 1,
      apiKey: 'REAL-SERVER-KEY',
    },
  )
  assert.equal(headers['content-type'], 'text/event-stream')
  assert.equal(headers['set-cookie'], undefined)
  assert.equal(headers['x-vercel-id'], undefined)
  assert.equal(JSON.stringify(headers).includes('REAL-SERVER-KEY'), false)
})

test('a header value that embeds the credential is refused, not emitted', () => {
  // These values come from server config rather than from the caller, so this is
  // not the primary anti-leak control — it turns "the config is trusted" into a
  // check that fails loudly instead of leaking quietly.
  for (const poisoned of [
    { model: 'sk-live-REAL-SERVER-KEY' },
    { provider: 'Bearer REAL-SERVER-KEY' },
    { gatewayBaseUrl: 'https://x.test/?k=REAL-SERVER-KEY' },
  ]) {
    refuses(
      () => buildBrowserHeaders({}, {
        model: 'anthropic/claude-sonnet-4.5',
        provider: 'anthropic',
        gatewayBaseUrl: 'https://x.test/fx-gateway',
        units: 1,
        remaining: 1,
        apiKey: 'REAL-SERVER-KEY',
        ...poisoned,
      }),
      'credential_in_response',
      500,
    )
  }
})

test('the exposed CORS list covers every header the proxy adds', () => {
  // A header the browser is not allowed to read is a header the tab does not
  // have — the whole transparency half of the ownership decision would be
  // invisible to the UI that is supposed to display it.
  for (const name of BROWSER_HEADER_NAMES) {
    assert.ok(EXPOSE_HEADERS.includes(name), `${name} is set but not exposed to the browser`)
  }
  assert.equal(EXPOSE_HEADERS, [...BROWSER_HEADER_NAMES].join(', '))
})

test('the bootstrap payload gives the tab everything before its first call', () => {
  const payload = buildBootstrapPayload({
    model: 'anthropic/claude-sonnet-4.5',
    gatewayBaseUrl: 'https://project.supabase.co/functions/v1/fx-gateway',
    used: 120_000,
    limit: DEFAULT_DAILY_UNITS,
    unitsCharged: BOOTSTRAP_COST_UNITS,
  })
  assert.equal(payload.model, 'anthropic/claude-sonnet-4.5')
  assert.equal(payload.provider, 'anthropic')
  assert.equal(payload.gateway.baseUrl, 'https://project.supabase.co/functions/v1/fx-gateway')
  assert.equal(payload.gateway.protocolVersion, GATEWAY_PROTOCOL_VERSION)
  assert.equal(payload.gateway.modelHeader, 'ai-language-model-id')
  assert.deepEqual(payload.quota, { used: 120_000, limit: DEFAULT_DAILY_UNITS, remaining: DEFAULT_DAILY_UNITS - 120_000 })
  assert.equal(payload.quota.remaining > 0, true)
})

test('the bootstrap payload reports the model that was actually used, not the one requested', () => {
  // The tab asked for openai/gpt-5. It gets anthropic back. If this field ever
  // echoed the request, the UI would display a model the gateway never ran —
  // which is the exact failure the ownership rule exists to prevent.
  const r = reconcileRequestBody(JSON.stringify({ model: 'openai/gpt-5' }), 'anthropic/claude-sonnet-4.5')
  const payload = buildBootstrapPayload({
    model: r.model,
    gatewayBaseUrl: 'https://x.test/fx-gateway',
    used: 0,
    limit: DEFAULT_DAILY_UNITS,
    unitsCharged: BOOTSTRAP_COST_UNITS,
  })
  assert.equal(payload.model, 'anthropic/claude-sonnet-4.5')
  assert.equal(JSON.stringify(payload).includes('openai'), false)
})

test('bootstrap is not free: it is charged through the same ledger as a call', () => {
  // The prompt's "must not be a quota-free hole". One token is enough to make
  // the ledger the single choke point while staying invisible to a user.
  assert.equal(BOOTSTRAP_COST_UNITS, 1)
  assert.ok(Number.isInteger(BOOTSTRAP_COST_UNITS) && BOOTSTRAP_COST_UNITS > 0)
  assert.ok(DEFAULT_DAILY_UNITS > BOOTSTRAP_COST_UNITS)
})

test('the bootstrap payload never contains a credential', () => {
  const payload = buildBootstrapPayload({
    model: 'anthropic/claude-sonnet-4.5',
    gatewayBaseUrl: 'https://x.test/fx-gateway',
    used: 0,
    limit: DEFAULT_DAILY_UNITS,
    unitsCharged: BOOTSTRAP_COST_UNITS,
  })
  const dump = JSON.stringify(payload)
  for (const secret of ['AI_GATEWAY_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'authorization', 'Bearer']) {
    assert.equal(dump.includes(secret), false, `bootstrap leaked ${secret}`)
  }
})