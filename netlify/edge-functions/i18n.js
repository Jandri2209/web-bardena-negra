// netlify/edge-functions/i18n.js
// Deno (Edge). Nada de require/fs.

const SUPPORTED = new Set(["en", "fr"]);
const ONE_YEAR = 365 * 24 * 60 * 60;
const TRANSLATE_ENABLED = true;
const DEFAULT_TTL = parseInt(Deno.env.get("I18N_CACHE_TTL") || "86400", 10);

// 👉 pruebas sin caché
const NOCACHE = Deno.env.get("I18N_NOCACHE") === "1";

// 👉 credenciales / endpoint
const DEEPL_KEY = Deno.env.get("DEEPL_KEY") || ""; // pon esta env var en Netlify
const DEEPL_ENDPOINT =
  Deno.env.get("DEEPL_ENDPOINT") || "https://api-free.deepl.com/v2/translate";

// marcador anti-recursión
const INTERNAL_QS = "_i18n";

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
  return `${name}=${encodeURIComponent(
    value
  )}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
}
function bestMatch(acceptLanguage, supported) {
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
function tidyTypography(lang, html){
  // 2.1) Capitaliza el primer carácter de títulos, listas y párrafos si quedó en minúscula
  html = html.replace(/(<(?:h1|h2|h3|h4|li|p)[^>]*>\s*)([a-z])/g,
    (_, open, first) => open + first.toUpperCase()
  );

  // 2.2) Afinado francés: espacio duro antes de ; : ? ! » y después de «
  if (lang === 'fr'){
    html = html
      .replace(/\s+([;:?!»])/g, '\u00A0$1')   // NBSP antes de ;:?!»
      .replace(/«\s+/g, '«\u00A0');           // NBSP después de «
  }
  return html;
}

// -------------------- DeepL --------------------
// -------------------- DeepL con chunking --------------------
async function translateHtml(html, lang, url) {
  if (!TRANSLATE_ENABLED || !DEEPL_KEY) {
    console.warn("[i18n] DeepL desactivado o DEEPL_KEY ausente");
    return { ok: false, text: patchSeo(html, lang, url), dbg: "NO_KEY_OR_OFF" };
  }

  const target = lang.toUpperCase(); // 'EN' | 'FR'
  const MAX_CHUNK = 80000;           // margen seguro < 128k de DeepL
  const SEP = "</section>";          // punto de corte “natural” en muchas páginas

  // 1) Trocear intentando cortar por </section> (si no, por tamaño bruto)
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

  // 2) Traducir cada trozo
  for (let i = 0; i < chunks.length; i++) {
    const piece = chunks[i];

    const params = new URLSearchParams({
      auth_key: DEEPL_KEY,
      text: piece,
      target_lang: target,
      source_lang: "ES",
      tag_handling: "html",
      // Ignorar bloques donde no queremos que toque nada
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
        translatedParts.push(piece); // fallback: trozo sin traducir
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
  return { ok: allOk, text: patchSeo(out, lang, url), dbg: allOk ? "OK" : "PARTIAL" };
}

// -------------------- handler --------------------
export default async (request, context) => {
  const url = new URL(request.url);

  // evitar recursión
  if (url.searchParams.has(INTERNAL_QS)) return context.next();

  const path = url.pathname;
  const hasPrefix = /^\/(en|fr)(\/|$)/.test(path);
  const prefix = hasPrefix ? path.split("/")[1] : null;
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const wantsHtml = isHtmlRequest(request, path);

  // ?lang=...
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

  // autodetección si no hay cookie
  if (!hasPrefix && wantsHtml && !cookies.lang) {
    const pick = bestMatch(request.headers.get("accept-language") || "", [
      "es",
      "en",
      "fr",
    ]);
    if (pick === "en")
      return Response.redirect(url.origin + "/en" + path + url.search, 302);
    if (pick === "fr")
      return Response.redirect(url.origin + "/fr" + path + url.search, 302);
  }

  // pegajosidad
  const ref = request.headers.get("referer") || "";
  const wanted = cookies.lang;
  if (
    !hasPrefix &&
    wantsHtml &&
    (wanted === "en" || wanted === "fr") &&
    ref.includes(`/${wanted}/`)
  ) {
    return Response.redirect(
      url.origin + `/${wanted}` + (path === "/" ? "/" : path) + url.search,
      302
    );
  }

  // pedir ES al origen
  let originRes;
  if (hasPrefix) {
    const rest = path.split("/").slice(2).join("/");
    let basePath = normalizeBasePath(`/${rest}`);
    if (!/\.[a-z0-9]+$/i.test(basePath) && !basePath.endsWith("/"))
      basePath += "/";

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
  if (!hasPrefix) return originRes;

  // traducir
  const html = await originRes.text();

  // 1) traducimos
  const { ok, text: translatedRaw, dbg } = await translateHtml(html, prefix, url);

  // 2) afinado tipográfico (mayúscula inicial, espacios FR, etc.)
  const text = tidyTypography(prefix, translatedRaw);

  const headers = new Headers(originRes.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("Vary", "Accept-Language, Cookie");
  headers.set("X-I18N-DeepL", dbg); // 👈 ayuda a depurar desde DevTools

  if (NOCACHE || !ok) {
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("CDN-Cache-Control", "no-store");
    headers.set("Surrogate-Control", "no-store");
  } else {
    headers.set("Cache-Control", `public, max-age=${DEFAULT_TTL}`);
    headers.set("CDN-Cache-Control", `public, max-age=${DEFAULT_TTL}`);
  }

  // cookie lang
  const existing = headers.get("set-cookie");
  const langCookie = cookie("lang", prefix, ONE_YEAR);
  headers.set("set-cookie", existing ? `${existing}, ${langCookie}` : langCookie);

  return new Response(text, { status: 200, headers });
};
