// netlify/edge-functions/i18n.js
// Ejecuta en Edge (Deno). No uses require/fs/etc.

const SUPPORTED = new Set(["en", "fr"]);
const ONE_YEAR = 365 * 24 * 60 * 60;
const TRANSLATE_ENABLED = true;
const DEFAULT_TTL = parseInt(Deno.env.get("I18N_CACHE_TTL") || "86400", 10);

// Pon I18N_NOCACHE=1 en variables de entorno para desactivar caché en pruebas
const NOCACHE = Deno.env.get("I18N_NOCACHE") === "1";

// Marcador para evitar recursión cuando pedimos al origen la versión ES
const INTERNAL_QS = "_i18n";

// ---------------------------------------------
// Utilidades
function isHtmlRequest(req, path) {
  const accept = req.headers.get("accept") || "";
  const looksHtmlPath =
    path.endsWith("/") || /\.html?$/i.test(path) || !/\.[a-z0-9]+$/i.test(path);
  return accept.includes("text/html") && looksHtmlPath;
}
function normalizeBasePath(p) {
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
    const base = lang.split("-")[0];
    if (supported.includes(base)) return base;
  }
  return "es";
}
function patchSeo(html, lang, url) {
  const rest = url.pathname.split("/").slice(2).join("/");
  const basePath = "/" + rest;
  const esHref = url.origin + (basePath === "/" ? "/" : basePath);
  const enHref = url.origin + "/en" + (basePath === "/" ? "/" : basePath);
  const frHref = url.origin + "/fr" + (basePath === "/" ? "/" : basePath);

  let out = html.replace(
    /<html([^>]*)\blang="[^"]*"([^>]*)>/i,
    `<html$1 lang="${lang}"$2>`
  );
  if (!/rel=["']alternate["'][^>]+hreflang=/i.test(out)) {
    out = out.replace(
      /(<head[^>]*>)/i,
      `$1
      <link rel="alternate" hreflang="es" href="${esHref}"/>
      <link rel="alternate" hreflang="en" href="${enHref}"/>
      <link rel="alternate" hreflang="fr" href="${frHref}"/>
      <link rel="alternate" hreflang="x-default" href="${esHref}"/>
    `
    );
  }
  return out;
}

// DeepL: devuelve { text, ok } donde ok=true si hubo traducción real
async function translateHtml(html, lang, url) {
  const key = Deno.env.get("DEEPL_KEY");
  if (!key || !TRANSLATE_ENABLED) {
    return { text: patchSeo(html, lang, url), ok: false };
  }
  const target = lang.toUpperCase(); // 'EN' | 'FR'

  try {
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
        preserve_formatting: "1",
      }),
    });

    if (!resp.ok) {
      // rate limit u otro error → fallback
      return { text: patchSeo(html, lang, url), ok: false };
    }
    const data = await resp.json();
    const translated = data?.translations?.[0]?.text;
    if (!translated) {
      return { text: patchSeo(html, lang, url), ok: false };
    }
    // Reaplicar SEO/language por si DeepL tocó el <head>
    return { text: patchSeo(translated, lang, url), ok: true };
  } catch {
    return { text: patchSeo(html, lang, url), ok: false };
  }
}

// ---------------------------------------------
// Handler principal
export default async (request, context) => {
  const url = new URL(request.url);

  // Si el fetch viene marcado como interno, no aplicar i18n
  if (url.searchParams.has(INTERNAL_QS)) {
    return context.next();
  }

  const path = url.pathname;
  const hasPrefix = /^\/(en|fr)(\/|$)/.test(path);
  const prefix = hasPrefix ? path.split("/")[1] : null; // 'en' | 'fr' | null
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const wantsHtml = isHtmlRequest(request, path);

  // 0) Forzar idioma con ?lang=...
  const qlang = url.searchParams.get("lang");
  if (!hasPrefix && wantsHtml && qlang && /^(en|fr|es)$/i.test(qlang)) {
    const forced = qlang.toLowerCase();
    if (forced === "en" || forced === "fr") {
      return Response.redirect(
        url.origin + `/${forced}` + (path === "/" ? "/" : path) + url.search,
        302
      );
    } else {
      return Response.redirect(
        url.origin + (path === "/" ? "/" : path) + url.search,
        302
      );
    }
  }

  // 1) Autodetección si no hay cookie ni prefijo (solo HTML)
  if (!hasPrefix && wantsHtml && !cookies.lang) {
    const pick = bestMatch(
      request.headers.get("accept-language") || "",
      ["es", "en", "fr"]
    );
    if (pick === "en")
      return Response.redirect(url.origin + "/en" + path + url.search, 302);
    if (pick === "fr")
      return Response.redirect(url.origin + "/fr" + path + url.search, 302);
    // 'es' => seguimos en /
  }

  // 1bis) Pegajosidad: si venías de /en o /fr y entras sin prefijo
  const ref = request.headers.get("referer") || "";
  const wanted = cookies.lang; // 'en' | 'fr' | 'es'
  if (!hasPrefix && wantsHtml && (wanted === "en" || wanted === "fr") && ref.includes(`/${wanted}/`)) {
    return Response.redirect(
      url.origin + `/${wanted}` + (path === "/" ? "/" : path) + url.search,
      302
    );
  }

  // 2) Obtener HTML de origen (ES). Para assets (no-HTML) devolver tal cual.
  let originRes;
  if (hasPrefix) {
    // quitar el prefijo en/en o fr/
    const rest = path.split("/").slice(2).join("/"); // 'entorno' | ''
    let basePath = normalizeBasePath(`/${rest}`);    // '/entorno' | '/'
    // si parece carpeta, añade slash final para evitar 301 del origen
    if (!/\.[a-z0-9]+$/i.test(basePath) && !basePath.endsWith("/")) basePath += "/";

    const originUrl = new URL(request.url);
    originUrl.pathname = basePath;
    originUrl.searchParams.set(INTERNAL_QS, "1"); // ← evita recursión

    if (!isHtmlRequest(request, originUrl.pathname)) {
      // archivo estático: JS/CSS/IMG → no tocar
      return fetch(new Request(originUrl.toString(), request));
    }
    originRes = await fetch(new Request(originUrl.toString(), request));
  } else {
    originRes = await context.next(); // /ES tal cual
  }

  // 3) Si no es HTML, entregar tal cual (no traducir)
  const ct = originRes.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return originRes;

  // 4) Si no hay prefijo, servir ES sin tocar
  if (!hasPrefix) return originRes;

  // 5) Con prefijo: traducir (DeepL) o parchear SEO; setear cookie y caché
  const html = await originRes.text();
  const { text: translated, ok: translatedOk } = await translateHtml(html, prefix, url);

  const headers = new Headers(originRes.headers);
  headers.set("content-type", "text/html; charset=utf-8");

  // Variantes por idioma/cookie
  headers.set("Vary", "Accept-Language, Cookie");

  // Caché: en pruebas o si no hubo traducción real → no-store
  if (NOCACHE || !translatedOk) {
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("CDN-Cache-Control", "no-store");
    headers.set("Surrogate-Control", "no-store");
  } else {
    headers.set("Cache-Control", `public, max-age=${DEFAULT_TTL}`);
    headers.set("CDN-Cache-Control", `public, max-age=${DEFAULT_TTL}`);
  }

  // Cookie de idioma
  const existing = headers.get("set-cookie");
  const langCookie = cookie("lang", prefix, ONE_YEAR);
  headers.set("set-cookie", existing ? `${existing}, ${langCookie}` : langCookie);

  return new Response(translated, { status: 200, headers });
};
