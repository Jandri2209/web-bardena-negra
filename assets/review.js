(function () {
  function setupCol(col) {
    const items = Array.from(col.querySelectorAll('.slides .review-card'));
    if (!items.length) return;

    const prev = col.querySelector('.prev');
    const next = col.querySelector('.next');
    const dotsWrap = col.querySelector('.dots');
    const controls = col.querySelector('.controls');

    if (items.length === 1 && controls) controls.style.display = 'none';

    const autoplayMs = Number(col.dataset.autoplay || 0);
    const wrap = col.dataset.wrap === 'true';
    const wantPauseBtn = col.dataset.pause === 'true' && autoplayMs > 0;

    let i = 0, timer = null, hovering = false, inView = true, paused = false;

    // Dots
    const dots = items.map((_, idx) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dot';
      b.setAttribute('aria-label', `Ir a reseña ${idx + 1}`);
      b.addEventListener('click', () => go(idx, true));
      dotsWrap.appendChild(b);
      return b;
    });

    function render() {
      items.forEach((el, idx) => el.hidden = idx !== i);
      if (prev) prev.hidden = !wrap && (i === 0);
      if (next) next.hidden = !wrap && (i === items.length - 1);
      dots.forEach((d, idx) => d.classList.toggle('is-active', idx === i));
    }

    function clampOrWrap(idx) {
      if (wrap) {
        if (idx < 0) return items.length - 1;
        if (idx >= items.length) return 0;
      }
      return Math.min(Math.max(idx, 0), items.length - 1);
    }

    function go(idx, user = false) {
      i = clampOrWrap(idx);
      render();
      if (user && autoplayMs && !paused) restart();
    }

    function step() { go(i + 1); }
    function start() { if (!autoplayMs || timer || hovering || !inView || paused) return; timer = setInterval(step, autoplayMs); }
    function stop()  { if (timer) { clearInterval(timer); timer = null; } }
    function restart(){ stop(); start(); }

    prev && prev.addEventListener('click', () => go(i - 1, true));
    next && next.addEventListener('click', () => go(i + 1, true));

    col.addEventListener('mouseenter', () => { hovering = true; stop(); });
    col.addEventListener('mouseleave', () => { hovering = false; start(); });
    col.addEventListener('focusin', stop);
    col.addEventListener('focusout', start);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        inView = entries.some(en => en.isIntersecting);
        inView ? start() : stop();
      }, { threshold: 0.25 });
      io.observe(col);
    }

    // Play/Pause bajo los dots
    if (wantPauseBtn) {
      const row = document.createElement('div');
      row.className = 'play-row';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'play-btn';
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = 'Pausar';
      btn.addEventListener('click', () => {
        paused = !paused;
        btn.classList.toggle('is-paused', paused);
        btn.setAttribute('aria-pressed', String(paused));
        btn.textContent = paused ? 'Reanudar' : 'Pausar';
        paused ? stop() : start();
      });
      row.appendChild(btn);
      controls.after(row);
    }

    render();
    start();
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#reviewsByPlatform .platform-col').forEach(setupCol);

    // Toggle traducciones
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
