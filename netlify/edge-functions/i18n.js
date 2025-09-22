// netlify/edge-functions/i18n.js
const SUPPORTED = new Set(['en', 'fr']);
const ONE_YEAR = 365 * 24 * 60 * 60;
const TRANSLATE_ENABLED = false; // cambia a true cuando conectes tu proveedor

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;      // p.ej. /, /en, /fr/entorno
  const hasPrefix = /^\/(en|fr)(\/|$)/.test(path);
  const prefix = hasPrefix ? path.split('/')[1] : null; // 'en' | 'fr' | null

  const cookies = parseCookies(request.headers.get('cookie') || '');

  // 1) Primera visita sin prefijo y sin preferencia: sugerimos idioma por Accept-Language.
  //    Nota: si ya hay cookie 'lang', NO forzamos; dejamos ES en '/'.
  if (!hasPrefix && !cookies.lang) {
    const pick = bestMatch(request.headers.get('accept-language') || '', ['es', 'en', 'fr']);
    if (pick === 'en') return Response.redirect(url.origin + '/en' + path, 302);
    if (pick === 'fr') return Response.redirect(url.origin + '/fr' + path, 302);
  }

  // 2) Obtenemos la respuesta del origen (página en ES)
  const basePath = hasPrefix ? '/' + path.split('/').slice(2).join('/') || '/' : path;
  const originRes = await context.next({ backend: 'origin', path: basePath });
  // Pegajosidad del idioma según cookie + referer
  const ref = request.headers.get('referer') || '';
  const wanted = cookies.lang; // 'en' | 'fr' | 'es'
  if (!hasPrefix && (wanted === 'en' || wanted === 'fr') && ref.includes(`/${wanted}/`)) {
    return Response.redirect(url.origin + `/${wanted}` + (url.pathname === '/' ? '/' : url.pathname) + url.search, 302);
  }

  // Si no es HTML, devolvemos tal cual
  const ct = originRes.headers.get('content-type') || '';
  if (!ct.includes('text/html')) {
    // Aun así, si había prefijo, fijamos cookie 'lang' para recordar preferencia
    if (hasPrefix) return withLangCookie(originRes, prefix);
    return originRes;
  }

  // 3) Si no hay prefijo, servimos ES tal cual
  if (!hasPrefix) return originRes;

  // 4) Prefijo en /en o /fr → (opcional) traducimos al vuelo y fijamos cookie 'lang'
  const html = await originRes.text();
  const translated = TRANSLATE_ENABLED
    ? await translateHtml(html, prefix, url)
    : patchSeo(html, prefix, url); // mientras tanto, solo parcheamos <html lang> y alternates

  const headers = new Headers(originRes.headers);
  headers.set('content-type', 'text/html; charset=utf-8');

  // Set-Cookie lang=<en|fr>
  const existing = headers.get('set-cookie');
  const langCookie = cookie('lang', prefix, ONE_YEAR);
  headers.set('set-cookie', existing ? `${existing}, ${langCookie}` : langCookie);

  return new Response(translated, { status: originRes.status, headers });
};

// =====================
// Utilidades
// =====================
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
  // Añade ; Secure cuando estés en producción HTTPS
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
}

function bestMatch(acceptLanguage, supported) {
  // Muy simple: pondera por q y busca primer match por prefix (en, fr, es)
  const prefs = acceptLanguage
    .split(',')
    .map(s => {
      const [tag, qStr] = s.trim().split(';');
      const q = qStr?.startsWith('q=') ? parseFloat(qStr.slice(2)) : 1;
      return { tag: (tag || '').toLowerCase(), q: isNaN(q) ? 0 : q };
    })
    .sort((a, b) => b.q - a.q)
    .map(x => x.tag);

  for (const lang of prefs) {
    const base = lang.split('-')[0]; // en-US -> en
    if (supported.includes(base)) return base;
  }
  return 'es'; // default
}

function patchSeo(html, lang, url) {
  // Ajusta <html lang=""> y añade alternates canónicos básicos
  const basePath = '/' + url.pathname.split('/').slice(2).join('/'); // ruta sin prefijo
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
  // TODO: conecta tu proveedor de traducción aquí.
  // Debe preservar etiquetas, no traducir atributos críticos, etc.
  // Por ahora, aplicamos el mismo parche SEO y devolvemos el original.
  return patchSeo(html, lang, url);
}

function withLangCookie(res, lang) {
  const headers = new Headers(res.headers);
  const existing = headers.get('set-cookie');
  const langCookie = cookie('lang', SUPPORTED.has(lang) ? lang : 'es', ONE_YEAR);
  headers.set('set-cookie', existing ? `${existing}, ${langCookie}` : langCookie);
  return new Response(res.body, { status: res.status, headers });
}
