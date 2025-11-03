---
layout: base.njk
title: "Tudela: imprescindibles, gastronomía y agenda"
description: "Qué ver en Tudela (catedral, Plaza de los Fueros, Ebro), dónde comer verduras de temporada y dónde consultar la agenda oficial."
permalink: "/entorno/tudela/"
breadcrumbs:
  - { name: "Inicio",  url: "/" }
  - { name: "Entorno", url: "/entorno/" }
  - { name: "Tudela",  url: "/entorno/tudela/" }
---

<section class="page-hero full-bleed tierra sm center-mobile" aria-label="Tudela: Plaza de los Fueros, Catedral y Ebro">
  <picture>
    <source type="image/webp"
      srcset="/images/plaza-tudela-960.webp 960w,
              /images/plaza-tudela-1280.webp 1280w,
              /images/plaza-tudela-1920.webp 1920w"
      sizes="(max-width: 900px) 100vw, 1200px">
    <img class="hero-bg"
      src="/images/plaza-tudela-1280.jpg"
      srcset="/images/plaza-tudela-960.jpg 960w,
              /images/plaza-tudela-1280.jpg 1280w,
              /images/plaza-tudela-1920.jpg 1920w"
      sizes="(max-width: 900px) 100vw, 1200px"
      alt="Plaza de los Fueros de Tudela en día despejado"
      width="1920" height="526" decoding="async" fetchpriority="high">
  </picture>

  <div class="overlay" aria-hidden="true"></div>
  <div class="inner container">
    <p class="kicker">Entorno</p>
    <h1>Tudela</h1>
    <p class="page-lead">Plaza de los Fueros, Catedral y verduras de temporada a 15–20 min.</p>
  </div>
</section>

<section class="container prose">
  <div class="card">
    <h1>Tudela</h1>
    <p>
      Capital de la Ribera y segunda ciudad de Navarra: historia, arte mudéjar y la mejor huerta de verduras.
      Perfecta para pasear, comer bien y enlazar con Bardenas.
    </p>

    <h2>Imprescindibles</h2>
    <ul>
      <li><strong>Plaza de los Fueros</strong> y casco histórico: ambiente, pinchos y terrazas.</li>
      <li><strong>Catedral de Santa María</strong> y su claustro (consulta horarios en turismo local).</li>
      <li><strong>Paseo del Ebro</strong> y miradores del entorno.</li>
    </ul>

    <h2>Gastronomía</h2>
    <p>
      Tierra de <em>verduras</em> (alcachofa, espárrago, borraja…). Menestras y tapas de temporada en bares y restaurantes del centro.
      En fines de semana o festivos, mejor reserva.
    </p>

    <h2>Información y agenda</h2>
    <p>
      Rutas guiadas, horarios y eventos en <a href="https://turismotudela.com/" target="_blank" rel="noopener">Turismo Tudela</a> y <a href="https://www.tudela.es/" target="_blank" rel="noopener">tudela.es</a>.
      Inspírate también en <a href="https://www.visitnavarra.es/es/tudela" target="_blank" rel="noopener">Visit Navarra</a>.
    </p>

    <p class="mt-2">
      <a class="btn"
         href="https://www.google.com/maps/search/?api=1&query=Tudela%2C%20Navarra"
         target="_blank" rel="noopener" aria-label="Cómo llegar a Tudela en Google Maps">
        Cómo llegar (Google Maps)
      </a>
      <a class="btn alt" href="https://maps.apple.com/?q=Tudela%2C%20Navarra" target="_blank" rel="noopener">
        Abrir en Apple Maps
      </a>
    </p>

    <p class="mt-6">
      <a class="btn" href="/reservas/">¿Te alojas con nosotros?</a>
      <a class="btn alt" href="/entorno/">← Volver a Entorno</a>
    </p>
  </div>
</section>

<!-- JSON-LD: Tudela (ciudad / destino) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "City",
  "@id": "{{ site.url }}/entorno/tudela/#tudela",
  "name": "Tudela",
  "description": "Qué ver en Tudela: Plaza de los Fueros, Catedral y gastronomía de verduras.",
  "image": "{{ site.url }}/images/plaza-tudela-1280.jpg",
  "hasMap": "https://www.google.com/maps/search/?api=1&query=Tudela%2C%20Navarra",
  "sameAs": [
    "https://turismotudela.com/",
    "https://www.tudela.es/",
    "https://www.visitnavarra.es/es/tudela"
  ],
  "url": "{{ site.url }}/entorno/tudela/"
}
</script>
