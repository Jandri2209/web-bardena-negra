// netlify/edge-functions/i18n.js
const SUPPORTED = new Set(['en', 'fr']);
const ONE_YEAR = 365 * 24 * 60 * 60;
const TRANSLATE_ENABLED = false;

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;
  const hasPrefix = /^\/(en|fr)(\/|$)/.test(path);
  const prefix = hasPrefix ? path.split('/')[1] : null;

  const cookies = parseCookies(request.headers.get('cookie') || '');

  // 1) Primera visita: sugerencia por Accept-Language (sin cookie lang)
  if (!hasPrefix && !cookies.lang) {
    const pick = bestMatch(request.headers.get('accept-language') || '', ['es','en','fr']);
    if (pick === 'en') return Response.redirect(url.origin + '/en' + path + url.search, 302);
    if (pick === 'fr') return Response.redirect(url.origin + '/fr' + path + url.search, 302);
  }

  // 1bis) "Pegajosidad" de idioma si vienes de /en o /fr y haces clic sin prefijo
  const ref = request.headers.get('referer') || '';
  const wanted = cookies.lang; // 'en' | 'fr' | 'es'
  if (!hasPrefix && (wanted === 'en' || wanted === 'fr') && ref.includes(`/${wanted}/`)) {
    return Response.redirect(url.origin + `/${wanted}` + (url.pathname === '/' ? '/' : url.pathname) + url.search, 302);
  }

  // 2) Trae la página base ES reescribiendo el pathname
  let originRes;
  if (hasPrefix) {
    const rest = path.split('/').slice(2).join('/');
    const basePath = `/${rest}` || '/';
    const originUrl = new URL(request.url);
    originUrl.pathname = basePath === '//' ? '/' : basePath;
    originRes = await fetch(new Request(originUrl.toString(), request));
  } else {
    originRes = await context.next();
  }

  // 3) Si no es HTML, devuelve tal cual (pero guarda lang si venía con prefijo)
  const ct = originRes.headers.get('content-type') || '';
  if (!ct.includes('text/html')) {
    return hasPrefix ? withLangCookie(originRes, prefix) : originRes;
  }

  // 4) Sin prefijo => ES tal cual
  if (!hasPrefix) return originRes;

  // 5) Con prefijo: traducir (o parchear SEO) + fijar cookie lang
  const html = await originRes.text();
  const translated = TRANSLATE_ENABLED
    ? await translateHtml(html, prefix, url)
    : patchSeo(html, prefix, url);

  const headers = new Headers(originRes.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  const existing = headers.get('set-cookie');
  const langCookie = cookie('lang', prefix, ONE_YEAR);
  headers.set('set-cookie', existing ? `${existing}, ${langCookie}` : langCookie);

  // Si por algún motivo el origen devolvió 404, aquí ya servimos 200 porque hemos resuelto a la página base
  return new Response(translated, { status: 200, headers });
};

// ===================== utilidades =====================
function parseCookies(cookieHeader) {
  const out = {};
  cookieHeader.split(';').forEach(pair => {
    const [k, v] = pair.split('=');
    if (!k) return;
    out[decodeURIComponent(k.trim())] = v ? decodeURIComponent(v.trim()) : '';
  });
  return out;
}
function cookie(name, value, maxAgeSec) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
}
function bestMatch(acceptLanguage, supported) {
  const prefs = acceptLanguage
    .split(',')
    .map(s => {
      const [tag, qStr] = s.trim().split(';');
      const q = qStr?.startsWith('q=') ? parseFloat(qStr.slice(2)) : 1;
      return { tag: (tag || '').toLowerCase(), q: isNaN(q) ? 0 : q };
    })
    .sort((a,b) => b.q - a.q)
    .map(x => x.tag);
  for (const lang of prefs) {
    const base = lang.split('-')[0];
    if (supported.includes(base)) return base;
  }
  return 'es';
}
function patchSeo(html, lang, url) {
  const basePath = '/' + url.pathname.split('/').slice(2).join('/');
  const esHref = url.origin + (basePath === '//' ? '/' : basePath);
  const enHref = url.origin + '/en' + (basePath === '//' ? '/' : basePath);
  const frHref = url.origin + '/fr' + (basePath === '//' ? '/' : basePath);
  let out = html.replace(/<html([^>]*)\blang="[^"]*"([^>]*)>/i, `<html$1 lang="${lang}"$2>`);
  if (!/rel=["']alternate["'][^>]+hreflang=/i.test(out)) {
    out = out.replace(/(<head[^>]*>)/i, `$1
      <link rel="alternate" hreflang="es" href="${esHref}"/>
      <link rel="alternate" hreflang="en" href="${enHref}"/>
      <link rel="alternate" hreflang="fr" href="${frHref}"/>
      <link rel="alternate" hreflang="x-default" href="${esHref}"/>
    `);
  }
  return out;
}
async function translateHtml(html, lang, url) {
  return patchSeo(html, lang, url);
}
function withLangCookie(res, lang) {
  const headers = new Headers(res.headers);
  const existing = headers.get('set-cookie');
  const langCookie = cookie('lang', SUPPORTED.has(lang) ? lang : 'es', ONE_YEAR);
  headers.set('set-cookie', existing ? `${existing}, ${langCookie}` : langCookie);
  return new Response(res.body, { status: res.status, headers });
}
