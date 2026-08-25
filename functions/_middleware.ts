const SPANISH_COUNTRIES = new Set([
  'ES', 'MX', 'AR', 'CO', 'PE', 'VE', 'CL', 'EC', 'GT', 'CU',
  'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'GQ',
]);

export async function onRequest(context: {
  request: Request;
  next: () => Promise<Response>;
}) {
  const { request, next } = context;

  // Don't waste cycles on asset files
  const url = new URL(request.url);
  if (url.pathname.startsWith('/assets/')) {
    return next();
  }

  const lang = detectLanguage(request);

  const response = await next();

  // Only set cookie on first visit (no cookie yet)
  const cookie = request.headers.get('Cookie') || '';
  if (!cookie.includes('mizpa_lang=')) {
    response.headers.append(
      'Set-Cookie',
      `mizpa_lang=${lang}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`,
    );
  }

  return response;
}

function detectLanguage(request: Request): string {
  // 1. Already has a preference cookie
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)mizpa_lang=(\w+)/);
  if (match) return match[1];

  // 2. Geolocation via Cloudflare cf-ipcountry
  const country = (request as any)?.cf?.country as string | undefined;
  if (country && SPANISH_COUNTRIES.has(country)) return 'es';

  // 3. Everything else → English
  return 'en';
}
