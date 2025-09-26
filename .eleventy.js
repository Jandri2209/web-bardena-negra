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