// netlify/edge-functions/i18n.js
// Deno (Edge). Nada de require/fs.

const SUPPORTED = new Set(["en", "fr"]);
const ONE_YEAR = 365 * 24 * 60 * 60;
const TRANSLATE_ENABLED = true;
const DEFAULT_TTL = parseInt(Deno.env.get("I18N_CACHE_TTL") || "86400", 10);

// Pruebas sin caché (p.ej. I18N_NOCACHE=1)
const NOCACHE = Deno.env.get("I18N_NOCACHE") === "1";

// Credenciales / endpoint DeepL
const DEEPL_KEY = Deno.env.get("DEEPL_KEY") || ""; // ← pon esta env var en Netlify
const DEEPL_ENDPOINT =
  Deno.env.get("DEEPL_ENDPOINT") || "https://api-free.deepl.com/v2/translate";

// Marcador anti-recursión
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
  return n;
}

function patchSeo(html, lang, url) {
  const rest = url.pathname.split("/").slice(2).join("/"); // quita /en o /fr
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
<link rel="alternate" hreflang="es" href="${esHref}">
<link rel="alternate" hreflang="en" href="${enHref}">
<link rel="alternate" hreflang="fr" href="${frHref}">
<link rel="alternate" hreflang="x-default" href="${esHref}">
`
    );
  }

  // (Opcional) si no hay canonical, autorreferencial a la URL traducida:
  const selfHref = url.origin + url.pathname + url.search;
  if (!/rel=["']canonical["']/i.test(out)) {
    out = out.replace(
      /(<head[^>]*>)/i,
      `$1
<link rel="canonical" href="${selfHref}">
`
    );
  }

  return out;
}

function tidyTypography(lang, html) {
  // Mayúscula inicial en títulos/listas/párrafos
  html = html.replace(
    /(<(?:h[1-4]|li|p)[^>]*>\s*)([a-z])/g,
    (_, open, first) => open + first.toUpperCase()
  );

  // Afinado francés: espacio duro antes de ; : ? ! » y después de «
  if (lang === "fr") {
    html = html
      .replace(/\s+([;:?!»])/g, "\u00A0$1")
      .replace(/«\s+/g, "«\u00A0");
  }
  return html;
}

// -------------------- DeepL (con chunking) --------------------
async function translateHtml(html, lang, url) {
  if (!TRANSLATE_ENABLED || !DEEPL_KEY) {
    console.warn("[i18n] DeepL desactivado o DEEPL_KEY ausente");
    return { ok: false, text: patchSeo(html, lang, url), dbg: "NO_KEY_OR_OFF" };
  }

  const target = lang.toUpperCase(); // 'EN' | 'FR'
  const MAX_CHUNK = 80000; // margen seguro < 128k de DeepL
  const SEP = "</section>";

  // Troceo intentando cortar por </section>
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
      // Ignora bloques donde no queremos tocar nada
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
  const path = url.pathname;
  const accept = request.headers.get("accept") || "";

  // 0) Salidas rápidas: solo HTML y no estáticos
  if (!accept.includes("text/html")) return context.next();
  if (
    /\.(css|js|mjs|map|png|jpe?g|webp|avif|svg|ico|gif|json|xml|txt|pdf|woff2?|ttf)$/i.test(
      path
    ) ||
    /^\/(assets|images|reports|admin|\.netlify)\//.test(path)
  ) {
    return context.next();
  }

  // Evitar recursión
  if (url.searchParams.has(INTERNAL_QS)) return context.next();

  const hasPrefix = /^\/(en|fr)(\/|$)/.test(path);
  const prefix = hasPrefix ? path.split("/")[1] : null;
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const wantsHtml = isHtmlRequest(request, path);

  // 1) Selector manual: ?lang=en|fr|es → redirección limpia
  const qlang = url.searchParams.get("lang");
  if (!hasPrefix && wantsHtml && qlang && /^(en|fr|es)$/i.test(qlang)) {
    const forced = qlang.toLowerCase();
    const dest =
      forced === "en" || forced === "fr"
        ? `${url.origin}/${forced}${path === "/" ? "/" : path}${url.search}`
        : `${url.origin}${path === "/" ? "/" : path}${url.search}`;
    return Response.redirect(stripLangParam(new URL(dest)), 302);
  }

  // 2) Autodetección si no hay cookie/lang
  if (!hasPrefix && wantsHtml && !cookies.lang) {
    const pick = bestMatch(request.headers.get("accept-language") || "", SUPPORTED);
    if (pick === "en")
      return Response.redirect(stripLangParam(new URL(url.origin + "/en" + path + url.search)), 302);
    if (pick === "fr")
      return Response.redirect(stripLangParam(new URL(url.origin + "/fr" + path + url.search)), 302);
  }

  // 3) Pegajosidad por cookie (si vienes desde EN/FR y entras sin prefijo)
  const ref = request.headers.get("referer") || "";
  const wanted = cookies.lang;
  if (!hasPrefix && wantsHtml && (wanted === "en" || wanted === "fr") && ref.includes(`/${wanted}/`)) {
    const dest = `${url.origin}/${wanted}${path === "/" ? "/" : path}${url.search}`;
    return Response.redirect(stripLangParam(new URL(dest)), 302);
  }

  // 4) Pide ES al origen (si estás en /en|/fr/, reescribe a base ES)
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
    // ES normal
    originRes = await context.next();
  }

  const ct = originRes.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return originRes;

  // Si vienes en ES, devolvemos tal cual
  if (!hasPrefix) return originRes;

  // 5) Traducir
  const html = await originRes.text();
  const { ok, text: translatedRaw, dbg } = await translateHtml(html, prefix, url);
  const text = tidyTypography(prefix, translatedRaw);

  // 6) Headers y caché
  const status = originRes.status || 200;
  const headers = new Headers(originRes.headers);
  headers.delete("content-length");
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("Vary", "Accept-Language, Cookie");
  headers.set("X-I18N-DeepL", dbg);

  if (NOCACHE || !ok || status >= 400) {
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("CDN-Cache-Control", "no-store");
    headers.set("Surrogate-Control", "no-store");
  } else {
    headers.set("Cache-Control", `public, max-age=${DEFAULT_TTL}`);
    headers.set("CDN-Cache-Control", `public, max-age=${DEFAULT_TTL}`);
  }

  // Cookie lang persistente
  headers.append("set-cookie", cookie("lang", prefix, ONE_YEAR));

  return new Response(text, { status, headers });
};
