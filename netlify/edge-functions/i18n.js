// netlify/edge-functions/i18n.js
const SUPPORTED = new Set(['en', 'fr']);
const ONE_YEAR = 365 * 24 * 60 * 60;
const TRANSLATE_ENABLED = false;

// Helper: ¿parece una página HTML?
const isHtmlPath = (p) => {
  // no extensión (/, /entorno) o .html
  return p.endsWith('/') || !/\.[a-z0-9]+$/i.test(p) || /\.html?$/i.test(p);
};

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;
  const hasPrefix = /^\/(en|fr)(\/|$)/.test(path);
  const prefix = hasPrefix ? path.split('/')[1] : null;

  const cookies = parseCookies(request.headers.get('cookie') || '');
  const wantsHtml = isHtmlPath(path);

  // 1) Autodetección por Accept-Language SOLO para páginas HTML sin prefijo
  if (!hasPrefix && wantsHtml && !cookies.lang) {
    const pick = bestMatch(request.headers.get('accept-language') || '', ['es','en','fr']);
    if (pick === 'en') return Response.redirect(url.origin + '/en' + path + url.search, 302);
    if (pick === 'fr') return Response.redirect(url.origin + '/fr' + path + url.search, 302);
  }

  // 1bis) “pegajosidad” del idioma SOLO para páginas HTML
  const ref = request.headers.get('referer') || '';
  const wanted = cookies.lang; // 'en' | 'fr' | 'es'
  if (!hasPrefix && wantsHtml && (wanted === 'en' || wanted === 'fr') && ref.includes(`/${wanted}/`)) {
    return Response.redirect(url.origin + `/${wanted}` + (url.pathname === '/' ? '/' : url.pathname) + url.search, 302);
  }

  // 2) Reescribe peticiones CON prefijo al path base (ES) y pide al origen
  let originRes;
  if (hasPrefix) {
    const rest = path.split('/').slice(2).join('/');
    const basePath = `/${rest}` || '/';
    const originUrl = new URL(request.url);
    originUrl.pathname = basePath === '//' ? '/' : basePath;

    // Para estáticos (no HTML), no hagas nada más: ni SEO ni cookies
    if (!isHtmlPath(originUrl.pathname)) {
      return fetch(new Request(originUrl.toString(), request));
    }
    originRes = await fetch(new Request(originUrl.toString(), request));
  } else {
    originRes = await context.next();
  }

  // 3) Si no es HTML, devuelve tal cual (y listo)
  const ct = originRes.headers.get('content-type') || '';
  if (!ct.includes('text/html')) return originRes;

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

  // Sirve 200 porque ya resolvimos al HTML base
  return new Response(translated, { status: 200, headers });
};

// ===== utilidades (igual que tenías) =====
function parseCookies(cookieHeader){ const out={}; cookieHeader.split(';').forEach(p=>{ const [k,v]=p.split('='); if(!k)return; out[decodeURIComponent(k.trim())]=v?decodeURIComponent(v.trim()):''; }); return out; }
function cookie(name,value,maxAgeSec){ return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`; }
function bestMatch(al, supported){ const prefs=al.split(',').map(s=>{ const [tag,qStr]=s.trim().split(';'); const q=qStr?.startsWith('q=')?parseFloat(qStr.slice(2)):1; return {tag:(tag||'').toLowerCase(),q:isNaN(q)?0:q}; }).sort((a,b)=>b.q-a.q).map(x=>x.tag); for(const lang of prefs){ const base=lang.split('-')[0]; if(supported.includes(base)) return base; } return 'es'; }
function patchSeo(html, lang, url){
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
async function translateHtml(html, lang, url){ return patchSeo(html, lang, url); }
