(function () {
  function setupCol(col) {
    const items = Array.from(col.querySelectorAll('.slides .review-card'));
    const prev = col.querySelector('.prev');
    const next = col.querySelector('.next');
    const dotsWrap = col.querySelector('.dots');
    const controls = col.querySelector('.controls');

    if (!items.length) return;
    if (items.length === 1 && controls) { controls.style.display = 'none'; }

    // Autoplay por columna (lee data-autoplay en la columna o 0 si no hay)
    const autoplayMs = Number(col.dataset.autoplay || 0);
    let i = 0, timer = null, hovering = false, inView = true;

    // Dots (una sola vez)
    const dots = items.map((_, idx) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dot';
      b.setAttribute('aria-label', `Ir a reseña ${idx + 1}`);
      b.addEventListener('click', () => go(idx, true));
      dotsWrap && dotsWrap.appendChild(b);
      return b;
    });

    function render() {
      items.forEach((el, idx) => (idx === i ? el.removeAttribute('hidden') : el.setAttribute('hidden', '')));
      if (prev) prev.hidden = (i === 0);
      if (next) next.hidden = (i === items.length - 1);
      dots.forEach((d, idx) => d.classList.toggle('is-active', idx === i));
    }

    function go(idx, user = false) {
      if (idx < 0 || idx >= items.length) return;
      i = idx;
      render();
      if (user && autoplayMs) restart();
    }

    // Autoplay: del último vuelve al primero (como el héroe)
    function step() { i = (i + 1) % items.length; render(); }
    function start() { if (!autoplayMs || timer || hovering || !inView) return; timer = setInterval(step, autoplayMs); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function restart() { stop(); start(); }

    // Controles
    prev && prev.addEventListener('click', () => go(i - 1, true));
    next && next.addEventListener('click', () => go(i + 1, true));

    // Pausas
    col.addEventListener('mouseenter', () => { hovering = true; stop(); });
    col.addEventListener('mouseleave', () => { hovering = false; start(); });
    col.addEventListener('focusin', stop);
    col.addEventListener('focusout', start);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    // Solo autoplay cuando está en viewport
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        inView = entries.some(en => en.isIntersecting);
        inView ? start() : stop();
      }, { threshold: 0.25 });
      io.observe(col);
    }

    render();
    start();
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#reviewsByPlatform .platform-col').forEach(setupCol);

    // Toggle “Mostrar original / Mostrar traducción”
    document.addEventListener('click', (e) => {
      if (!e.target.matches('.toggle-trans')) return;
      const box = e.target.closest('.rev-body');
      const es = box.querySelector('.rev-text.es');
      const orig = box.querySelector('.rev-text.orig');
      const showingEs = es && !es.hidden;
      if (showingEs) {
        if (es) es.hidden = true;
        if (orig) orig.hidden = false;
        e.target.textContent = 'Mostrar traducción';
      } else {
        if (es) es.hidden = false;
        if (orig) orig.hidden = true;
        e.target.textContent = 'Mostrar original';
      }
    });
  });
})();
