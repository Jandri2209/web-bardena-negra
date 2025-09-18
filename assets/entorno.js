(function () {
  const mapWrap = document.querySelector('.map-embed');
  if (!mapWrap) return;

  // Ajusta a tu sistema real de consentimiento:
  const hasFunctional =
    (window.CONSENT?.functional === true) ||
    (localStorage.getItem('consent:functional') === '1');

  const map = mapWrap.querySelector('#leaflet-map');
  const placeholder = mapWrap.querySelector('.embed-placeholder');

  if (hasFunctional && map) {
    placeholder.hidden = true;
    // Inicializa Leaflet aquí si lo usas:
    // L.map('leaflet-map').setView([42.0129, -1.5319], 12);
  } else {
    placeholder.hidden = false;
    if (map) map.style.display = 'none';
  }

  // Botón "Configurar cookies"
  mapWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-cookie-prefs]');
    if (!btn) return;
    if (typeof window.openCookiePreferences === 'function') {
      window.openCookiePreferences();
    } else {
      location.href = '/cookies/';
    }
  });
})();
