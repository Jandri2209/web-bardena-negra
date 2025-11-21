// netlify/edge-functions/i18n.js
// Deno (Edge). Nada de require/fs.

const SUPPORTED = new Set(["en", "fr"]);
const ONE_YEAR = 365 * 24 * 60 * 60;
const TRANSLATE_ENABLED = true;
const DEFAULT_TTL = parseInt(Deno.env.get("I18N_CACHE_TTL") || "86400", 10);

// Flags de entorno
const NOCACHE = Deno.env.get("I18N_NOCACHE") === "1";
const FORCE_OFF = Deno.env.get("I18N_FORCE_OFF") === "1";

// DeepL
const DEEPL_KEY = Deno.env.get("DEEPL_KEY") || "";
const DEEPL_ENDPOINT =
  Deno.env.get("DEEPL_ENDPOINT") || "https://api-free.deepl.com/v2/translate";

// Marcador anti-recursión
const INTERNAL_QS = "_i18n";

// Bots/auditorías (no redirigir ni traducir)
const BOT_UA_RX = /(lighthouse|chrome-lighthouse|headless|googlebot|pagespeed|netlifybot)/i;

// -------------------- utils --------------------
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
  (cookieHeader || "").split(";").forEach((pair) => {
    const [k, v] = pair.split("=");
    if (!k) return;
    out[decodeURIComponent(k.trim())] = v ? decodeURIComponent(v.trim()) : "";
  });
  return out;
}
function cookie(name, value, maxAgeSec) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax; Secure`;
}
function bestMatch(acceptLanguage, supportedSet) {
  const prefs = (acceptLanguage || "")
    .split(",")
    .map((s) => {
      const [tag, qStr] = s.trim().split(";");
      const q = qStr?.startsWith("q=") ? parseFloat(qStr.slice(2)) : 1;
      return { tag: (tag || "").toLowerCase(), q: isNaN(q) ? 0 : q };
    })
    .sort((a, b) => b.q - a.q)
    .map((x) => x.tag);
  for (const lang of prefs) {
    const base = lang.split("-")[0];
    if (supportedSet.has(base)) return base;
  }
  return "es";
}
function stripLangParam(u) {
  const n = new URL(u.toString());
  n.searchParams.delete("lang");
  n.searchParams.delete(INTERNAL_QS);
  n.searchParams.delete("_nolang");
  return n;
}

// setLangTag = true → cambia <html lang="...">
// setLangTag = false → solo hreflang + canonical (deja lang original)
function patchSeo(html, lang, url, setLangTag = true) {
  const rest = url.pathname.split("/").slice(2).join("/"); // quita /en|/fr
  const basePath = "/" + rest;
  const esHref = url.origin + (basePath === "/" ? "/" : basePath);
  const enHref = url.origin + "/en" + (basePath === "/" ? "/" : basePath);
  const frHref = url.origin + "/fr" + (basePath === "/" ? "/" : basePath);

  let out = html;
  if (setLangTag) {
    out = out.replace(
      /<html([^>]*)\blang="[^"]*"([^>]*)>/i,
      `<html$1 lang="${lang}"$2>`
    );
  }
  if (!/rel=["']alternate["'][^>]+hreflang=/i.test(out)) {
    out = out.replace(
      /(<head[^>]*>)/i,
      `$1
<link rel="alternate" hreflang="es" href="${esHref}">
<link rel="alternate" hreflang="en" href="${enHref}">
<link rel="alternate" hreflang="fr" href="${frHref}">
<link rel="alternate" hreflang="x-default" href="${esHref}">
`
    );
  }
  const selfHref = url.origin + url.pathname + url.search;
  if (!/rel=["']canonical["']/i.test(out)) {
    out = out.replace(/(<head[^>]*>)/i, `$1
<link rel="canonical" href="${selfHref}">
`);
  }
  return out;
}
function tidyTypography(lang, html) {
  html = html.replace(
    /(<(?:h[1-4]|li|p)[^>]*>\s*)([a-z])/g,
    (_, open, first) => open + first.toUpperCase()
  );
  if (lang === "fr") {
    html = html.replace(/\s+([;:?!»])/g, "\u00A0$1").replace(/«\s+/g, "«\u00A0");
  }
  return html;
}

// -------------------- DeepL (con chunking) --------------------
async function translateHtml(html, lang, url) {
  if (FORCE_OFF || !TRANSLATE_ENABLED || !DEEPL_KEY) {
    console.warn("[i18n] DeepL desactivado (FORCE_OFF) o clave ausente");
    // sin traducción: no tocamos <html lang>, solo hreflang/canonical
    return {
      ok: false,
      text: patchSeo(html, lang, url, false),
      dbg: FORCE_OFF ? "FORCED_OFF" : "NO_KEY_OR_OFF",
    };
  }

  const target = lang.toUpperCase(); // 'EN' | 'FR'
  const MAX_CHUNK = 80000;
  const SEP = "</section>";

  const chunks = [];
  let rest = html;
  while (rest.length > MAX_CHUNK) {
    const cut = rest.lastIndexOf(SEP, MAX_CHUNK);
    const idx = cut > 0 ? cut + SEP.length : MAX_CHUNK;
    chunks.push(rest.slice(0, idx));
    rest = rest.slice(idx);
  }
  chunks.push(rest);

  const translatedParts = [];
  let allOk = true;

  for (let i = 0; i < chunks.length; i++) {
    const piece = chunks[i];
    const params = new URLSearchParams({
      auth_key: DEEPL_KEY,
      text: piece,
      target_lang: target,
      source_lang: "ES",
      tag_handling: "html",
      ignore_tags: "script,style,noscript,code,pre,svg,notranslate",
      split_sentences: "nonewlines",
      preserve_formatting: "1",
    });

    try {
      const resp = await fetch(DEEPL_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params,
      });

      if (!resp.ok) {
        const why = await resp.text().catch(() => "");
        console.error("[i18n] DeepL ERROR", resp.status, why.slice(0, 200));
        translatedParts.push(piece);
        allOk = false;
        continue;
      }

      const data = await resp.json();
      const translated = data?.translations?.[0]?.text;
      if (!translated) {
        console.error("[i18n] DeepL EMPTY on chunk", i);
        translatedParts.push(piece);
        allOk = false;
        continue;
      }

      translatedParts.push(translated);
    } catch (e) {
      console.error("[i18n] DeepL EXC on chunk", i, e && e.message);
      translatedParts.push(piece);
      allOk = false;
    }
  }

  const out = translatedParts.join("");
  // traducido: sí cambiamos <html lang="en|fr">
  return { ok: allOk, text: patchSeo(out, lang, url, true), dbg: allOk ? "OK" : "PARTIAL" };
}

// -------------------- handler --------------------
export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;
  const accept = request.headers.get("accept") || "";
  const ua = request.headers.get("user-agent") || "";

  // Solo HTML y no estáticos
  if (!accept.includes("text/html")) return context.next();
  if (
    /\.(css|js|mjs|map|png|jpe?g|webp|avif|svg|ico|gif|json|xml|txt|pdf|woff2?|ttf)$/i.test(path) ||
    /^\/(assets|images|reports|admin|\.netlify)\//.test(path)
  ) {
    return context.next();
  }

  // Bypass manual y anti-recursión
  if (url.searchParams.has("_nolang")) return context.next();
  if (url.searchParams.has(INTERNAL_QS)) return context.next();

  // Bots/auditorías: servir ES sin redirecciones ni traducción
  if (BOT_UA_RX.test(ua)) {
    if (/^\/(en|fr)(\/|$)/.test(path)) {
      const rest = path.split("/").slice(2).join("/");
      let basePath = normalizeBasePath(`/${rest}`);
      if (!/\.[a-z0-9]+$/i.test(basePath) && !basePath.endsWith("/")) basePath += "/";
      const originUrl = new URL(request.url);
      originUrl.pathname = basePath;
      originUrl.searchParams.delete("lang");
      originUrl.searchParams.delete(INTERNAL_QS);
      originUrl.searchParams.delete("_nolang");
      return fetch(new Request(originUrl.toString(), request));
    }
    return context.next();
  }

  const hasPrefix = /^\/(en|fr)(\/|$)/.test(path);
  const prefix = hasPrefix ? path.split("/")[1] : null;
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const wantsHtml = isHtmlRequest(request, path);

  // 1) Selector manual ?lang=en|fr|es → set-cookie + redirect limpio (sin duplicar prefijos)
  const qlang = url.searchParams.get("lang");
  if (wantsHtml && qlang && /^(en|fr|es)$/i.test(qlang)) {
    const forced = qlang.toLowerCase();

    // Quita prefijo actual si lo hay para construir una "base" neutra
    const m = path.match(/^\/(en|fr)(\/|$)/);
    let base = m ? path.slice(m[0].length) : path; // después de /en/ o /fr/
    if (!/\.[a-z0-9]+$/i.test(base) && !base.endsWith("/")) base += "/";
    if (!base.startsWith("/")) base = "/" + base;
    if (base === "") base = "/";

    // Destino final según idioma forzado
    const destPath = (forced === "es")
      ? base                           // sin prefijo
      : `/${forced}${base === "/" ? "/" : base}`; // con /en o /fr

    // Redirección “limpia” (quitamos ?lang, marcadores internos, etc.)
    const destUrl = stripLangParam(new URL(url.origin + destPath + url.search));

    // Cookie lang (también para ES → ‘es’, desactiva pegajosidad)
    const headers = new Headers({ Location: destUrl.toString() });
    headers.append("set-cookie", cookie("lang", forced, ONE_YEAR));

    return new Response(null, { status: 302, headers });
  }
  // 2) Autodetección siempre (también con FORCE_OFF)
  if (!hasPrefix && wantsHtml && !cookies.lang) {
    const pick = bestMatch(request.headers.get("accept-language") || "", SUPPORTED);
    if (pick === "en")
      return Response.redirect(stripLangParam(new URL(url.origin + "/en" + path + url.search)), 302);
    if (pick === "fr")
      return Response.redirect(stripLangParam(new URL(url.origin + "/fr" + path + url.search)), 302);
  }

  // 3) Persistencia cookie: desactivada si FORCE_OFF
  const wanted = cookies.lang;
  if (!FORCE_OFF && !hasPrefix && wantsHtml && (wanted === "en" || wanted === "fr")) {
    const dest = `${url.origin}/${wanted}${path === "/" ? "/" : path}${url.search}`;
    return Response.redirect(stripLangParam(new URL(dest)), 302);
  }

  // 4) Pedimos ES al origen cuando nos piden /en|/fr/
  let originRes;
  if (hasPrefix) {
    const rest = path.split("/").slice(2).join("/");
    let basePath = normalizeBasePath(`/${rest}`);
    if (!/\.[a-z0-9]+$/i.test(basePath) && !basePath.endsWith("/")) basePath += "/";

    const originUrl = new URL(request.url);
    originUrl.pathname = basePath;
    originUrl.searchParams.set(INTERNAL_QS, "1");

    if (!isHtmlRequest(request, originUrl.pathname)) {
      return fetch(new Request(originUrl.toString(), request));
    }
    originRes = await fetch(new Request(originUrl.toString(), request));
  } else {
    originRes = await context.next();
  }

  const ct = originRes.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return originRes;

  // En ES, devolvemos tal cual
  if (!hasPrefix) return originRes;

  // 5) Traducimos (o solo parcheamos SEO si está OFF/NO_KEY)
  const html = await originRes.text();
  const { ok, text: translatedRaw, dbg } = await translateHtml(html, prefix, url);
  const text = tidyTypography(prefix, translatedRaw);

  // 6) Headers y caché
  const status = originRes.status || 200;
  const headers = new Headers(originRes.headers);
  headers.delete("content-length");
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("X-I18N-DeepL", dbg);
  headers.set("X-I18N-Debug", hasPrefix ? `translate:${prefix}` : "pass:es");

  if (NOCACHE || !ok || status >= 400) {
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("Netlify-CDN-Cache-Control", "no-store");
  } else {
    headers.set("Cache-Control", `public, max-age=${DEFAULT_TTL}`);
    headers.set("Netlify-CDN-Cache-Control", `public, max-age=${DEFAULT_TTL}`);
  }

  // Cookie lang: solo cuando NO está FORCE_OFF
  // if (!FORCE_OFF && hasPrefix) {
  //   headers.append("set-cookie", cookie("lang", prefix, ONE_YEAR));
  // }

  return new Response(text, { status, headers });
};

export const config = { path: "/*" };
