const site = require("./_data/site.json");
const pluginSitemap = require("@quasibit/eleventy-plugin-sitemap");

module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("images");

  eleventyConfig.addPlugin(pluginSitemap, {
    sitemap: { hostname: site.url }
  });

  eleventyConfig.addGlobalData("build", Date.now()); // marca de compilación

  eleventyConfig.addFilter("v", (url, build) => {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${build}`;
  });

  eleventyConfig.addFilter("date", (value, locale = "es-ES", options = {}) => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d)) return "";
    const opts = Object.keys(options).length
      ? options
      : { year: "numeric", month: "long", day: "2-digit" };
    return new Intl.DateTimeFormat(locale, opts).format(d);
  });
  // URL localizada: antepone /en o /fr si la página actual usa ese prefijo
  eleventyConfig.addFilter("lurl", (href, pageUrl = "/") => {
    if (!href || typeof href !== "string") return href;
    if (!href.startsWith("/")) return href; // externas o relativas
    // no prefijar assets/imagenes/admin/reports ni ya-localizadas
    if (/^\/(assets|images|admin|reports|\.netlify)\//.test(href)) return href;
    if (/^\/(en|fr)(\/|$)/.test(href)) return href;

    const m = (pageUrl || "").match(/^\/(en|fr)(\/|$)/);
    const prefix = m ? `/${m[1]}` : "";
    return prefix + href;
  });

  return {
    dir: {
      input: ".",
      includes: "_includes",
      layouts: "_layouts",
      data: "_data",
      output: "_site"
    },
    templateFormats: ["html", "njk", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};