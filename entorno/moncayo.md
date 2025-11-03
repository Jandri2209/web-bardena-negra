---
layout: base.njk
title: "Moncayo: rutas sencillas, miradores y consejos"
description: "Hayedos y miradores del Parque Natural del Moncayo: cómo llegar (Agramonte), rutas fáciles y avisos oficiales."
permalink: "/entorno/moncayo/"
breadcrumbs:
  - { name: "Inicio",  url: "/" }
  - { name: "Entorno", url: "/entorno/" }
  - { name: "Moncayo", url: "/entorno/moncayo/" }
---

<section class="page-hero full-bleed tierra sm center-mobile" aria-label="Parque Natural del Moncayo">
  <picture>
    <source type="image/webp"
      srcset="/images/moncayo-hayedo-960.webp 960w,
              /images/moncayo-hayedo-1280.webp 1280w,
              /images/moncayo-hayedo-1920.webp 1920w"
      sizes="(max-width: 900px) 100vw, 1200px">
    <img class="hero-bg"
      src="/images/moncayo-hayedo-1280.jpg"
      srcset="/images/moncayo-hayedo-960.jpg 960w,
              /images/moncayo-hayedo-1280.jpg 1280w,
              /images/moncayo-hayedo-1920.jpg 1920w"
      sizes="(max-width: 900px) 100vw, 1200px"
      alt="Hayedo en la vertiente norte del Moncayo"
      width="1920" height="1280" decoding="async" fetchpriority="high">
  </picture>
  <div class="overlay" aria-hidden="true"></div>
  <div class="inner container">
    <p class="kicker">Entorno</p>
    <h1>Moncayo</h1>
    <p class="page-lead">Bosques y miradores en la “montaña mágica”. ≈50–60 min.</p>
  </div>
</section>

<section class="container prose">
  <div class="card">
    <h1>Moncayo</h1>
    <p>
      La cumbre más alta del Sistema Ibérico y un parque natural con <em>hayedos</em>, robledales y buenas vistas del valle del Ebro.
      Ideal para rutas sencillas en familia saliendo desde el <strong>Centro de Interpretación de Agramonte</strong>.
    </p>

    <h2>Lo esencial</h2>
    <ul>
      <li><strong>Punto de partida recomendado:</strong> Agramonte (aparcamiento, paneles y rutas señalizadas).</li>
      <li><strong>Rutas fáciles:</strong> Hayedo (otoño espectacular) y Sendero botánico de Agramonte.</li>
      <li><strong>Miradores:</strong> varios puntos señalizados en la vertiente norte con vistas del valle.</li>
      <li><strong>Preparación:</strong> agua, gorra, abrigo en capas y calzado cerrado; en invierno la cumbre puede ser técnica.</li>
    </ul>

    <p class="mt-2">
      <a class="btn"
         href="https://www.google.com/maps/search/?api=1&query=41.81694%2C-1.82259"
         target="_blank" rel="noopener"
         aria-label="Cómo llegar al Centro de Interpretación de Agramonte (Google Maps)">
        Cómo llegar (Agramonte)
      </a>
      <a class="btn alt"
         href="https://maps.apple.com/?q=41.81694,-1.82259"
         target="_blank" rel="noopener">
        Abrir en Apple Maps
      </a>
    </p>

    <h2>Itinerario sugerido (½ día)</h2>
    <ol>
      <li>Llegada a Agramonte y paseo por el hayedo (circuito sencillo).</li>
      <li>Picnic/merienda en zona de sombra y subida corta a un mirador cercano.</li>
      <li>Vuelta tranquila por el sendero botánico.</li>
    </ol>

    <h2>Antes de ir: avisos y normas</h2>
    <p>
      Revisa los <a href="https://www.rednaturaldearagon.com/parque-natural-del-moncayo/" target="_blank" rel="noopener">avisos del Parque Natural</a> y, si quieres información actualizada, el <a href="https://www.rednaturaldearagon.com/centro-de-interpretacion-agramonte/" target="_blank" rel="noopener">Centro de Agramonte</a>.
      En invierno/primavera la zona alta puede ser peligrosa: si tu plan es solo paseo familiar, quédate en las rutas señalizadas de la parte baja.
    </p>

    <p class="mt-6">
      <a class="btn" href="/reservas/">¿Te alojas con nosotros?</a>
      <a class="btn alt" href="/entorno/">← Volver a Entorno</a>
    </p>
  </div>
</section>

<!-- JSON-LD: montaña (Moncayo) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Mountain",
  "@id": "{{ site.url }}/entorno/moncayo/#moncayo",
  "name": "Moncayo",
  "description": "Montaña del Sistema Ibérico y Parque Natural con hayedos y miradores.",
  "image": "{{ site.url }}/images/moncayo-hayedo-1280.jpg",
  "geo": { "@type": "GeoCoordinates", "latitude": 41.78805556, "longitude": -1.83833333 },
  "hasMap": "https://www.google.com/maps/search/?api=1&query=41.78805556%2C-1.83833333",
  "sameAs": [
    "https://www.aragon.es/-/parque-natural-del-moncayo",
    "https://www.rednaturaldearagon.com/parque-natural-del-moncayo/"
  ],
  "url": "{{ site.url }}/entorno/moncayo/"
}
</script>
