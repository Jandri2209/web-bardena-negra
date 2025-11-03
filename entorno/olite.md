---
layout: base.njk
title: "Olite: castillo, vino y paseo medieval"
description: "Visita al Palacio Real de Olite, bodegas D.O. Navarra y paseo por el casco histórico. Consejos y enlaces oficiales."
permalink: "/entorno/olite/"
breadcrumbs:
  - { name: "Inicio",  url: "/" }
  - { name: "Entorno", url: "/entorno/" }
  - { name: "Olite", url: "/entorno/olite/" }
---

<section class="page-hero full-bleed tierra sm center-mobile" aria-label="Castillo de Olite">
  <picture>
    <source type="image/webp"
      srcset="/images/olite-castillo-960.webp 960w,
              /images/olite-castillo-1280.webp 1280w,
              /images/olite-castillo-1920.webp 1920w"
      sizes="(max-width: 900px) 100vw, 1200px">
    <img class="hero-bg"
      src="/images/olite-castillo-1280.jpg"
      srcset="/images/olite-castillo-960.jpg 960w,
              /images/olite-castillo-1280.jpg 1280w,
              /images/olite-castillo-1920.jpg 1920w"
      sizes="(max-width: 900px) 100vw, 1200px"
      alt="Torres y murallas del Palacio Real de Olite"
      width="1920" height="1280" decoding="async" fetchpriority="high">
  </picture>
  <div class="overlay" aria-hidden="true"></div>
  <div class="inner container">
    <p class="kicker">Entorno</p>
    <h1>Olite</h1>
    <p class="page-lead">Palacio Real, vino D.O. Navarra y casco medieval. ≈40–45 min.</p>
  </div>
</section>

<section class="container prose">
  <div class="card">
    <h1>Olite</h1>
    <p>Una de las postales de Navarra: el Palacio Real, calles medievales y bodegas con visita y cata.</p>

    <h2>Imprescindibles</h2>
    <ul>
      <li><strong>Palacio Real de Olite</strong> (entradas y horarios en la web oficial).</li>
      <li><strong>Casco histórico</strong>: plazas, galerías y muralla.</li>
      <li><strong>Bodegas</strong> D.O. Navarra (consulta visitas y catas).</li>
    </ul>

    <p class="mt-2">
      <a class="btn"
         href="https://www.google.com/maps/search/?api=1&query=Palacio%20Real%20de%20Olite"
         target="_blank" rel="noopener"
         aria-label="Cómo llegar al Palacio Real de Olite en Google Maps">
        Cómo llegar (Google Maps)
      </a>
      <a class="btn alt"
         href="https://maps.apple.com/?q=Palacio%20Real%20de%20Olite"
         target="_blank" rel="noopener">
        Abrir en Apple Maps
      </a>
    </p>

    <h2>Consejos</h2>
    <ul>
      <li>Compra la entrada al Palacio con antelación en temporada alta.</li>
      <li>Sube a las torres para vistas 360º (escaleras estrechas).</li>
    </ul>

    <h2>Enlaces útiles</h2>
    <p>
      <a href="https://guias.castillodeolite.com/" target="_blank" rel="noopener">Palacio Real</a> ·
      <a href="https://www.olite.es/" target="_blank" rel="noopener">Ayto. de Olite</a> ·
      <a href="https://www.visitnavarra.es/es/olite" target="_blank" rel="noopener">Visit Navarra</a>
    </p>

    <p class="mt-6">
      <a class="btn" href="/reservas/">¿Te alojas con nosotros?</a>
      <a class="btn alt" href="/entorno/">← Volver a Entorno</a>
    </p>
  </div>
</section>

<!-- JSON-LD: atracción (Palacio Real de Olite) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TouristAttraction",
  "@id": "{{ site.url }}/entorno/olite/#palacio-real-olite",
  "name": "Palacio Real de Olite",
  "description": "Conjunto palaciego medieval, emblema de la Navarra histórica.",
  "image": "{{ site.url }}/images/olite-castillo-1280.jpg",
  "hasMap": "https://www.google.com/maps/search/?api=1&query=Palacio%20Real%20de%20Olite",
  "sameAs": [
    "https://guias.castillodeolite.com/",
    "https://www.visitnavarra.es/es/olite"
  ],
  "url": "{{ site.url }}/entorno/olite/"
}
</script>
