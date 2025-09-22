// netlify/edge-functions/i18n.js
// Edge (Deno): no uses "require", "fs", etc.

const SUPPORTED = new Set(["en", "fr"]);
const ONE_YEAR = 365 * 24 * 60 * 60;
const TRANSLATE_ENABLED = true; // ✅ activado
const DEFAULT_TTL = parseInt(Deno.env.get("I18N_CACHE_TTL") || "86400", 10);

// ¿Es una petición "página HTML"?
const isHtmlRequest = (req, path) => {
  const accept = req.headers.get("accept") || "";
  const looksHtmlPath = path.endsWith("/") || /\.html?$/i.test(path) || !/\.[a-z0-9]+$/i.test(path);
  return accept.includes("text/html") && looksHtmlPath;
};

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;
  const hasPrefix = /^\/(en|fr)(\/|$)/.test(path);
  const prefix = hasPrefix ? path.split("/")[1] : null; // 'en' | 'fr' | null
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const wantsHtml = isHtmlRequest(request, path);

  // ---- 0) Forzar idioma por query (?lang=en|fr|es)
  const qlang = url.searchParams.get("lang");
  if (!hasPrefix && wantsHtml && qlang && /^(en|fr|es)$/i.test(qlang)) {
    const forced = qlang.toLowerCase();
    if (forced === "en" || forced === "fr") {
      return Response.redirect(url.origin + `/${forced}` + (path === "/" ? "/" : path) + url.search, 302);
    } else {
      // forzado a ES: limpiar prefijo si hubiera
      return Response.redirect(url.origin + (path === "/" ? "/" : path) + url.search, 302);
    }
  }

  // ---- 1) Autodetección SOLO HTML, solo si NO hay cookie lang
  if (!hasPrefix && wantsHtml && !cookies.lang) {
    const pick = bestMatch(request.headers.get("accept-language") || "", ["es", "en", "fr"]);
    if (pick === "en") return Response.redirect(url.origin + "/en" + path + url.search, 302);
    if (pick === "fr") return Response.redirect(url.origin + "/fr" + path + url.search, 302);
    // es -> seguimos en /
  }

  // ---- 1bis) Pegajosidad SOLO HTML: si vienes de /en o /fr y haces clic sin prefijo
  const ref = request.headers.get("referer") || "";
  const wanted = cookies.lang; // 'en' | 'fr' | 'es'
  if (!hasPrefix && wantsHtml && (wanted === "en" || wanted === "fr") && ref.includes(`/${wanted}/`)) {
    return Response.redirect(url.origin + `/${wanted}` + (path === "/" ? "/" : path) + url.search, 302);
  }

  // ---- 2) Reescribe cualquier petición CON prefijo al path base ES y pide al origen
  let originRes;
  if (hasPrefix) {
    const rest = path.split("/").slice(2).join("/");
    const basePath = normalizeBasePath(`/${rest}`); // p.ej. /en/ -> /
    const originUrl = new URL(request.url);
    originUrl.pathname = basePath;

    // Si NO es HTML (estático), devolvemos tal cual SIN tocar cookies ni SEO (evita bucles 508)
    if (!isHtmlRequest(request, originUrl.pathname)) {
      return fetch(new Request(originUrl.toString(), request));
    }

    originRes = await fetch(new Request(originUrl.toString(), request));
  } else {
    originRes = await context.next(); // pide / tal cual
  }

  // ---- 3) Si no es HTML, devuelve tal cual
  const ct = originRes.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return originRes;

  // ---- 4) Si no hay prefijo, sirve ES sin tocar
  if (!hasPrefix) return originRes;

  // ---- 5) Con prefijo: traducir (DeepL) o parchear SEO, fijar cookie lang y cachear
  const html = await originRes.text();
  const translated = TRANSLATE_ENABLED
    ? await translateHtml(html, prefix, url)  // DeepL
    : patchSeo(html, prefix, url);            // solo SEO

  const headers = new Headers(originRes.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("Cache-Control", `public, max-age=${DEFAULT_TTL}`); // CDN cache
  const existing = headers.get("set-cookie");
  const langCookie = cookie("lang", prefix, ONE_YEAR);
  headers.set("set-cookie", existing ? `${existing}, ${langCookie}` : langCookie);

  // Aunque el origen fuese 404 por /en/*, ya devolvemos 200 con el HTML base traducido.
  return new Response(translated, { status: 200, headers });
};

// ===================== Utilidades =====================
function normalizeBasePath(p) {
  // evita '//' y asegúrate de que "/" queda bien
  if (p === "" || p === "//") return "/";
  return p.startsWith("//") ? p.slice(1) : p;
}

function parseCookies(cookieHeader) {
  const out = {};
  cookieHeader.split(";").forEach(pair => {
    const [k, v] = pair.split("=");
    if (!k) return;
    out[decodeURIComponent(k.trim())] = v ? decodeURIComponent(v.trim()) : "";
  });
  return out;
}

function cookie(name, value, maxAgeSec) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
}

function bestMatch(acceptLanguage, supported) {
  const prefs = acceptLanguage
    .split(",")
    .map(s => {
      const [tag, qStr] = s.trim().split(";");
      const q = qStr?.startsWith("q=") ? parseFloat(qStr.slice(2)) : 1;
      return { tag: (tag || "").toLowerCase(), q: isNaN(q) ? 0 : q };
    })
    .sort((a, b) => b.q - a.q)
    .map(x => x.tag);

  for (const lang of prefs) {
    const base = lang.split("-")[0]; // en-US -> en
    if (supported.includes(base)) return base;
  }
  return "es";
}

function patchSeo(html, lang, url) {
  const basePath = "/" + url.pathname.split("/").slice(2).join("/"); // ruta sin prefijo
  const esHref = url.origin + (basePath === "//" ? "/" : basePath);
  const enHref = url.origin + "/en" + (basePath === "//" ? "/" : basePath);
  const frHref = url.origin + "/fr" + (basePath === "//" ? "/" : basePath);

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

// ======= DeepL =======
async function translateHtml(html, lang, url) {
  const key = Deno.env.get("DEEPL_KEY");
  if (!key) return patchSeo(html, lang, url);

  // EN / FR (puedes cambiar a EN-GB, EN-US si quieres matiz)
  const target = lang.toUpperCase(); // 'EN' | 'FR'

  const resp = await fetch("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      auth_key: key,
      text: html,
      target_lang: target,
      tag_handling: "html",
      ignore_tags: "script,style,noscript",
      split_sentences: "nonewlines",
      preserve_formatting: "1"
    })
  });

  if (!resp.ok) {
    // Fallback silencioso en caso de rate limit o similar
    return patchSeo(html, lang, url);
  }

  const data = await resp.json();
  const translated = data?.translations?.[0]?.text || html;

  // Reinyecta SEO por si DeepL tocó <head>
  return patchSeo(translated, lang, url);
}
