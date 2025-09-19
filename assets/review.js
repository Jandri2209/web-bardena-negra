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
    // ===== Modal de reseñas (filtrado por estrellas) =====
    const modalBg = document.getElementById('reviewsModal');
    const modal    = modalBg?.querySelector('.rev-modal');
    const listBox  = modalBg?.querySelector('.drawer-list');
    const chips    = modalBg?.querySelectorAll('.drawer-filters .chip') || [];
    const btnOpen  = document.getElementById('open-all-reviews');
    const btnClose = modalBg?.querySelector('.rev-modal-close');
    let currentFilter = 'all';
    let lastFocus = null;

    function getAllCards() {
    return Array.from(document.querySelectorAll('#reviewsByPlatform .review-card'));
    }
    function renderList() {
    if (!modalBg || !listBox) return;
    listBox.innerHTML = '';
    const cards = getAllCards().filter(c => {
        if (currentFilter === 'all') return true;
        return String(c.dataset.stars || '') === String(currentFilter);
    });
    cards.forEach(c => {
        const clone = c.cloneNode(true);
        clone.hidden = false;
        listBox.appendChild(clone);
    });
    }

    function openModal(filter = 'all') {
    currentFilter = filter;
    chips.forEach(ch => ch.classList.toggle('is-active', ch.dataset.filter === filter));
    modalBg.hidden = false;
    document.body.classList.add('modal-open');
    renderList();
    lastFocus = document.activeElement;
    // Foco inicial
    (btnClose || modal)?.focus();
    // Pausar autoplay de columnas
    document.dispatchEvent(new Event('reviews:modal-open'));
    }

    function closeModal() {
    modalBg.hidden = true;
    document.body.classList.remove('modal-open');
    document.dispatchEvent(new Event('reviews:modal-close'));
    if (lastFocus) lastFocus.focus();
    }

    // Abrir / Cerrar
    btnOpen && btnOpen.addEventListener('click', () => openModal('all'));
    btnClose && btnClose.addEventListener('click', closeModal);
    // Cerrar clic fuera
    modalBg && modalBg.addEventListener('click', e => { if (e.target === modalBg) closeModal(); });
    // Esc
    document.addEventListener('keydown', e => {
    if (!modalBg || modalBg.hidden) return;
    if (e.key === 'Escape') closeModal();
    // Trap de tab
    if (e.key === 'Tab') {
        const f = modal.querySelectorAll('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    });

    // Chips de filtro dentro del modal
    modalBg?.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-filter]');
    if (!chip) return;
    currentFilter = chip.dataset.filter || 'all';
    chips.forEach(ch => ch.classList.toggle('is-active', ch === chip));
    renderList();
    });

    // Click en barras del panel => abrir filtrado
    document.querySelector('.rating-bars')?.addEventListener('click', (e) => {
    const row = e.target.closest('.row[data-stars]');
    if (row) openModal(row.dataset.stars);
    });
    // Acceso teclado en barras
    document.querySelector('.rating-bars')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.row[data-stars]');
    if (row) { e.preventDefault(); openModal(row.dataset.stars); }
    });

    // Click en estrellas de cualquier tarjeta => abrir filtrado por ese nº
    document.getElementById('reviewsByPlatform')?.addEventListener('click', (e) => {
    const stars = e.target.closest('.review-stars');
    if (!stars) return;
    const card = stars.closest('.review-card');
    const n = card?.dataset.stars;
    if (n) openModal(String(n));
    });

    // Señales para pausar/reanudar autoplay desde el modal
    document.querySelectorAll('#reviewsByPlatform .platform-col').forEach(col => {
    // Busca el setup de esa columna (parche simple: simulamos hover para pausar)
    document.addEventListener('reviews:modal-open', () => col.dispatchEvent(new Event('mouseenter')));
    document.addEventListener('reviews:modal-close', () => col.dispatchEvent(new Event('mouseleave')));
    });
  });
})();
