(function (global) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let particleState = null;

  function isEnabled() {
    return !reducedMotion && typeof gsap !== 'undefined';
  }

  function isMobileLayout() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function resetMobileSidebarTransform() {
    if (!isMobileLayout() || typeof gsap === 'undefined') return;
    gsap.set('.sidebar', { clearProps: 'transform' });
  }

  /* ── Particle Background ── */
  function initParticles() {
    if (!isEnabled()) return;

    const canvas = document.getElementById('particleCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const particles = [];
    const meteors = [];
    const linkDist = 120;
    const starColors = ['rgba(0, 212, 255, 0.75)', 'rgba(168, 85, 247, 0.65)', 'rgba(255, 255, 255, 0.7)'];
    let meteorTimer = null;
    let introSpawned = 0;
    let introFinished = false;
    let onIntroDone = null;

    function particleCount() {
      return Math.min(240, Math.floor((window.innerWidth * window.innerHeight) / 5500));
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function killParticleTweens() {
      particles.forEach(p => gsap.killTweensOf(p));
    }

    function spawn() {
      killParticleTweens();
      particles.length = 0;
      const count = particleCount();

      for (let i = 0; i < count; i++) {
        const p = {
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          r: Math.random() * 1.2 + 1,
          color: starColors[i % starColors.length]
        };
        particles.push(p);
        gsap.to(p, {
          x: p.x + gsap.utils.random(-160, 160),
          y: p.y + gsap.utils.random(-120, 120),
          duration: gsap.utils.random(5, 16),
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: gsap.utils.random(0, 5)
        });
      }
    }

    function spawnMeteor() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const angle = gsap.utils.random(-0.55, -0.35);
      const speed = gsap.utils.random(10, 18);
      meteors.push({
        x: gsap.utils.random(w * 0.55, w * 1.15),
        y: gsap.utils.random(-40, h * 0.35),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: gsap.utils.random(130, 240),
        life: 1,
        decay: gsap.utils.random(0.01, 0.018),
        hue: Math.random() < 0.6 ? 'cyan' : 'purple',
        intro: false,
        width: gsap.utils.random(1, 1.8)
      });
    }

    function spawnIntroMeteor() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const angle = gsap.utils.random(-0.92, -0.48);
      const speed = gsap.utils.random(36, 52);
      meteors.push({
        x: gsap.utils.random(-60, w * 0.22),
        y: gsap.utils.random(h * 0.58, h * 0.82),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: gsap.utils.random(200, 300),
        life: 1,
        decay: gsap.utils.random(0.008, 0.014),
        hue: Math.random() < 0.55 ? 'cyan' : 'purple',
        intro: true,
        width: gsap.utils.random(1.2, 2)
      });
    }

    function tryFinishIntro(force = false) {
      if (introFinished) return;
      if (force || (introSpawned >= 3 && !meteors.some(m => m.intro))) {
        introFinished = true;
        if (force) {
          for (let i = meteors.length - 1; i >= 0; i--) {
            if (meteors[i].intro) meteors.splice(i, 1);
          }
        }
        scheduleMeteor();
        if (onIntroDone) {
          const cb = onIntroDone;
          onIntroDone = null;
          cb();
        }
      }
    }

    function runIntro(onStart, onComplete) {
      introSpawned = 0;
      introFinished = false;
      onIntroDone = onComplete;
      meteors.length = 0;

      if (onStart) onStart();

      const spawnDelays = [0, 0.08, 0.18];
      spawnDelays.forEach((d) => {
        gsap.delayedCall(d, () => {
          spawnIntroMeteor();
          introSpawned++;
        });
      });

      gsap.delayedCall(1.6, () => tryFinishIntro(true));
    }

    function scheduleMeteor() {
      if (meteorTimer) meteorTimer.kill();
      meteorTimer = gsap.delayedCall(gsap.utils.random(0.8, 2.8), () => {
        if (Math.random() < 0.65) spawnMeteor();
        if (Math.random() < 0.25) spawnMeteor();
        scheduleMeteor();
      });
    }

    function drawStar(x, y, r) {
      const spikes = 4;
      const outer = r * 2.2;
      const inner = r * 0.9;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const rad = (Math.PI / spikes) * i - Math.PI / 2;
        const dist = i % 2 === 0 ? outer : inner;
        const px = x + Math.cos(rad) * dist;
        const py = y + Math.sin(rad) * dist;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    function drawMeteor(m) {
      const speed = Math.hypot(m.vx, m.vy) || 1;
      const nx = m.vx / speed;
      const ny = m.vy / speed;
      const tailLen = m.len;
      const tailX = m.x - nx * tailLen;
      const tailY = m.y - ny * tailLen;
      const midX = m.x - nx * tailLen * 0.45;
      const midY = m.y - ny * tailLen * 0.45;
      const w = m.width || (m.intro ? 1.6 : 1.2);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      const outerGrad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
      if (m.hue === 'cyan') {
        outerGrad.addColorStop(0, `rgba(210, 255, 255, ${m.life * 0.4})`);
        outerGrad.addColorStop(0.2, `rgba(0, 212, 255, ${m.life * 0.28})`);
        outerGrad.addColorStop(0.55, `rgba(0, 140, 200, ${m.life * 0.1})`);
        outerGrad.addColorStop(1, 'rgba(0, 60, 120, 0)');
      } else {
        outerGrad.addColorStop(0, `rgba(240, 210, 255, ${m.life * 0.4})`);
        outerGrad.addColorStop(0.2, `rgba(168, 85, 247, ${m.life * 0.28})`);
        outerGrad.addColorStop(0.55, `rgba(100, 40, 180, ${m.life * 0.1})`);
        outerGrad.addColorStop(1, 'rgba(50, 10, 90, 0)');
      }
      ctx.strokeStyle = outerGrad;
      ctx.lineWidth = w * 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      const coreGrad = ctx.createLinearGradient(m.x, m.y, midX, midY);
      if (m.hue === 'cyan') {
        coreGrad.addColorStop(0, `rgba(255, 255, 255, ${m.life * 0.9})`);
        coreGrad.addColorStop(0.35, `rgba(120, 240, 255, ${m.life * 0.6})`);
        coreGrad.addColorStop(1, `rgba(0, 212, 255, 0)`);
      } else {
        coreGrad.addColorStop(0, `rgba(255, 255, 255, ${m.life * 0.9})`);
        coreGrad.addColorStop(0.35, `rgba(210, 170, 255, ${m.life * 0.6})`);
        coreGrad.addColorStop(1, `rgba(168, 85, 247, 0)`);
      }
      ctx.strokeStyle = coreGrad;
      ctx.lineWidth = w * 0.55;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(midX, midY);
      ctx.stroke();

      const headR = m.intro ? 7 : 5;
      const headGrd = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, headR);
      if (m.hue === 'cyan') {
        headGrd.addColorStop(0, `rgba(255, 255, 255, ${m.life})`);
        headGrd.addColorStop(0.25, `rgba(140, 245, 255, ${m.life * 0.7})`);
        headGrd.addColorStop(0.6, `rgba(0, 180, 255, ${m.life * 0.25})`);
        headGrd.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        headGrd.addColorStop(0, `rgba(255, 255, 255, ${m.life})`);
        headGrd.addColorStop(0.25, `rgba(210, 170, 255, ${m.life * 0.7})`);
        headGrd.addColorStop(0.6, `rgba(140, 60, 220, ${m.life * 0.25})`);
        headGrd.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }
      ctx.fillStyle = headGrd;
      ctx.beginPath();
      ctx.arc(m.x, m.y, headR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255, 255, 255, ${m.life * 0.9})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.intro ? 2 : 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    function draw() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < linkDist) {
            const alpha = (1 - dist / linkDist) * 0.28;
            ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      particles.forEach(p => {
        ctx.fillStyle = p.color;
        drawStar(p.x, p.y, p.r);
      });

      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx;
        m.y += m.vy;
        m.life -= m.decay;
        drawMeteor(m);
        let remove = false;
        if (m.intro) {
          remove = m.x > w + 120 || m.y < -120 || m.life <= 0;
        } else {
          remove = m.life <= 0 || m.x < -200 || m.y > h + 200;
        }
        if (remove) {
          meteors.splice(i, 1);
          if (m.intro) tryFinishIntro();
        }
      }
    }

    resize();
    spawn();
    meteors.length = 0;

    if (particleState?.ticker) gsap.ticker.remove(particleState.ticker);
    if (particleState?.meteorTimer) particleState.meteorTimer.kill();

    const ticker = draw;
    gsap.ticker.add(ticker);

    const onResize = () => {
      resize();
      spawn();
    };
    window.addEventListener('resize', onResize);

    particleState = { ticker, onResize, meteorTimer, runIntro };
  }

  function runIntroSequence(onStart, onComplete) {
    if (!isEnabled() || !particleState) {
      if (onStart) onStart();
      if (onComplete) onComplete();
      return;
    }
    particleState.runIntro(onStart, onComplete);
  }

  function destroyParticles() {
    if (!particleState) return;
    gsap.ticker.remove(particleState.ticker);
    if (particleState.meteorTimer) particleState.meteorTimer.kill();
    window.removeEventListener('resize', particleState.onResize);
    particleState = null;
  }

  /* ── Typewriter ── */
  function typewriter(el, text, opts = {}) {
    if (!el) return gsap.timeline();
    const speed = opts.speed ?? 0.045;
    const showCursor = opts.cursor !== false;

    if (!isEnabled()) {
      el.textContent = text;
      return gsap.timeline();
    }

    el.textContent = '';
    if (showCursor) el.classList.add('typewriter-active');

    const tl = gsap.timeline({
      onComplete: () => {
        if (showCursor) el.classList.remove('typewriter-active');
      }
    });

    const chars = [...text];
    chars.forEach((ch, i) => {
      tl.call(() => { el.textContent += ch; }, null, i * speed);
    });

    return tl;
  }

  /* ── Boot Sequence ── */
  function bootIntroUI() {
    if (!isEnabled()) return;

    const mobile = isMobileLayout();
    if (mobile) {
      resetMobileSidebarTransform();
    } else {
      gsap.set('.sidebar', { x: -48, opacity: 0 });
    }
    gsap.set('.sidebar-header h1', { opacity: 1, y: 0 });
    gsap.set('.tree-label', { x: -18, opacity: 0 });
    gsap.set('.main-header', { opacity: 0, y: -18 });
    gsap.set('.read-only-hint', { opacity: 0, y: -8 });
    gsap.set('#todoItems', { opacity: 0 });

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    if (!mobile) {
      tl.to('.sidebar', { x: 0, opacity: 1, duration: 0.45 });
    }
    tl.to('.tree-label', { x: 0, opacity: 1, duration: 0.22, stagger: 0.015 }, mobile ? undefined : '-=0.3')
      .to('.main-header', { opacity: 1, y: 0, duration: 0.38 }, '-=0.35')
      .to('.read-only-hint', { opacity: 1, y: 0, duration: 0.25 }, '-=0.25');

    if (document.querySelector('.add-todo-bar')) {
      gsap.set('.add-todo-bar', { opacity: 0, y: 20 });
      tl.to('.add-todo-bar', { opacity: 1, y: 0, duration: 0.35 }, '-=0.28');
    }

    const sidebarTitle = document.querySelector('.sidebar-header h1');
    if (sidebarTitle) typewriter(sidebarTitle, '⚡ 日期导航', { speed: 0.04 });

    const mainTitle = document.querySelector('.main-header h2');
    if (mainTitle) {
      const text = mainTitle.textContent;
      typewriter(mainTitle, text, { speed: 0.025 });
    }
  }

  function bootCardsReveal() {
    if (!isEnabled()) return;
    const container = document.getElementById('todoItems');
    if (!container) return;

    gsap.set(container, { opacity: 1 });
    const sections = container.querySelectorAll('.plan-section, .empty-state');
    if (sections.length) {
      gsap.from(sections, {
        opacity: 0,
        y: 14,
        duration: 0.55,
        stagger: 0.07,
        ease: 'sine.out'
      });
    }
    flipInCards(container, { soft: true });
  }

  /* ── Page Entrance (fallback) ── */
  function pageEntrance() {
    bootIntroUI();
  }

  /* ── Main Panel ── */
  function animateMainPanel(panel) {
    if (!panel || !isEnabled()) return gsap.timeline();

    return gsap.from(panel.children, {
      opacity: 0,
      y: 20,
      duration: 0.45,
      stagger: 0.08,
      ease: 'power2.out'
    });
  }

  function typewriterTitle(el, text) {
    return typewriter(el, text, { speed: 0.035 });
  }

  function countUp(el, to, duration = 0.5) {
    if (!el || !isEnabled()) {
      if (el) el.textContent = String(to);
      return;
    }
    const obj = { val: Number(el.textContent) || 0 };
    gsap.to(obj, {
      val: to,
      duration,
      ease: 'power1.out',
      onUpdate: () => { el.textContent = Math.round(obj.val); }
    });
  }

  function animateStats(counts) {
    if (!isEnabled()) return;
    const spans = document.querySelectorAll('.stats > div span');
    if (spans.length < 3) return;
    countUp(spans[0], counts.pending);
    countUp(spans[1], counts.completed);
    countUp(spans[2], counts.on_hold);
  }

  /* ── Card Flip ── */
  function markAnimating(cards, on) {
    cards.forEach(c => c.classList.toggle('gsap-animating', on));
  }

  function resetCard(card) {
    gsap.killTweensOf(card);
    gsap.set(card, { rotationY: 0, scale: 1, opacity: 1, y: 0, clearProps: 'transform' });
    card.classList.remove('gsap-animating');
  }

  function flipInCards(container, opts = {}) {
    if (!container || !isEnabled()) return;
    const cards = [...container.querySelectorAll('.todo-item')];
    if (!cards.length) return;

    const soft = opts.soft === true;
    cards.forEach(resetCard);
    markAnimating(cards, true);

    gsap.fromTo(cards,
      soft
        ? { rotationY: -18, opacity: 0, y: 14, scale: 0.98 }
        : { rotationY: -80, opacity: 0, scale: 0.95 },
      {
        rotationY: 0,
        opacity: 1,
        y: 0,
        scale: 1,
        duration: soft ? 0.78 : 0.48,
        stagger: {
          each: soft ? 0.045 : 0.06,
          onComplete() {
            resetCard(this.targets()[0]);
          }
        },
        ease: soft ? 'sine.out' : 'power2.out',
        transformPerspective: soft ? 1800 : 1200,
        onComplete: () => cards.forEach(resetCard)
      }
    );
  }

  function flipInCard(card) {
    if (!card || !isEnabled()) return;
    resetCard(card);
    markAnimating([card], true);

    gsap.fromTo(card,
      { rotationY: -80, opacity: 0, y: 24, scale: 0.92 },
      {
        rotationY: 0,
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        ease: 'power2.out',
        transformPerspective: 1200,
        onComplete: () => resetCard(card)
      }
    );
  }

  function flipCardStatus(card, onHalf) {
    if (!card || !isEnabled()) {
      if (onHalf) onHalf();
      return Promise.resolve();
    }

    resetCard(card);
    markAnimating([card], true);

    return new Promise(resolve => {
      gsap.to(card, {
        rotationY: 88,
        scale: 0.96,
        duration: 0.2,
        ease: 'power2.in',
        transformPerspective: 1200,
        onComplete: () => {
          if (onHalf) onHalf();
          gsap.to(card, {
            rotationY: 0,
            scale: 1,
            duration: 0.26,
            ease: 'power2.out',
            onComplete: () => {
              resetCard(card);
              resolve();
            }
          });
        }
      });
    });
  }

  function removeCard(card, onComplete) {
    if (!card) {
      if (onComplete) onComplete();
      return;
    }
    if (!isEnabled()) {
      if (onComplete) onComplete();
      return;
    }

    gsap.killTweensOf(card);
    markAnimating([card], true);

    gsap.to(card, {
      rotationY: 60,
      opacity: 0,
      scale: 0.85,
      duration: 0.3,
      ease: 'power2.in',
      transformPerspective: 1200,
      onComplete: () => {
        resetCard(card);
        if (onComplete) onComplete();
      }
    });
  }

  /* ── Modals & Toast ── */
  function showOverlay(overlay) {
    if (!overlay || !isEnabled()) return;
    const dialog = overlay.querySelector('.import-dialog');
    gsap.set(overlay, { display: 'flex', opacity: 0 });
    overlay.classList.add('show');
    gsap.to(overlay, { opacity: 1, duration: 0.25 });
    if (dialog) {
      gsap.from(dialog, { scale: 0.85, opacity: 0, y: 20, duration: 0.4, ease: 'back.out(1.5)' });
    }
  }

  function hideOverlay(overlay) {
    if (!overlay) return;
    if (!isEnabled()) {
      overlay.classList.remove('show');
      return;
    }
    const dialog = overlay.querySelector('.import-dialog');
    const tl = gsap.timeline({
      onComplete: () => {
        overlay.classList.remove('show');
        gsap.set(overlay, { clearProps: 'opacity' });
      }
    });
    if (dialog) {
      tl.to(dialog, { scale: 0.9, opacity: 0, y: 12, duration: 0.2, ease: 'power2.in' });
    }
    tl.to(overlay, { opacity: 0, duration: 0.15 }, '-=0.05');
  }

  function showToast(toast) {
    if (!toast || !isEnabled()) {
      if (toast) toast.classList.add('show');
      return;
    }
    toast.classList.add('show');
    gsap.fromTo(toast,
      { y: 24, opacity: 0, scale: 0.92 },
      { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2)' }
    );
  }

  function hideToast(toast) {
    if (!toast) return;
    if (!isEnabled()) {
      toast.classList.remove('show');
      return;
    }
    gsap.to(toast, {
      y: 16,
      opacity: 0,
      duration: 0.2,
      onComplete: () => toast.classList.remove('show')
    });
  }

  /* ── Date Picker & Sidebar ── */
  function openDatePickerPanel(panel) {
    if (!panel || !isEnabled()) return;
    gsap.from(panel, {
      scale: 0.9,
      opacity: 0,
      y: -8,
      duration: 0.35,
      ease: 'back.out(1.6)'
    });
  }

  function openMobileSidebar(sidebar, backdrop) {
    if (!isEnabled()) return;
    if (backdrop) gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    if (sidebar) gsap.fromTo(sidebar, { x: '-105%' }, { x: '0%', duration: 0.35, ease: 'power3.out' });
  }

  function closeMobileSidebar(sidebar, backdrop) {
    if (!isEnabled()) return;
    if (sidebar) gsap.to(sidebar, { x: '-105%', duration: 0.28, ease: 'power2.in' });
    if (backdrop) gsap.to(backdrop, { opacity: 0, duration: 0.22 });
  }

  /* ── Button hover glow ── */
  function bindButtonHovers() {
    if (!isEnabled()) return;
    document.querySelectorAll('.btn-primary, .btn-sidebar').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        gsap.to(btn, { y: -2, boxShadow: '0 6px 28px rgba(0, 212, 255, 0.35)', duration: 0.2 });
      });
      btn.addEventListener('mouseleave', () => {
        gsap.to(btn, { y: 0, boxShadow: '0 4px 16px rgba(0, 212, 255, 0.25)', duration: 0.2 });
      });
    });
  }

  function scheduleFlipInCards(container) {
    if (!container || !isEnabled()) return;
    gsap.delayedCall(0.12, () => flipInCards(container));
  }

  function init(onIntroStart, onIntroComplete) {
    document.querySelectorAll('.todo-item').forEach(resetCard);
    initParticles();

    if (!isEnabled()) {
      if (onIntroStart) onIntroStart();
      if (onIntroComplete) onIntroComplete();
      bindButtonHovers();
      return;
    }

    document.body.classList.add('booting');
    gsap.set('.app', { opacity: 1 });
    gsap.set('.main', { opacity: 1 });

    runIntroSequence(
      () => {
        if (onIntroStart) onIntroStart();
        bootIntroUI();
      },
      () => {
        document.body.classList.remove('booting');
        resetMobileSidebarTransform();
        if (onIntroComplete) onIntroComplete();
        bootCardsReveal();
        bindButtonHovers();
      }
    );
  }

  global.TodoAnimations = {
    init,
    bootIntroUI,
    bootCardsReveal,
    destroyParticles,
    typewriter,
    typewriterTitle,
    animateMainPanel,
    animateStats,
    flipInCards,
    flipInCard,
    scheduleFlipInCards,
    flipCardStatus,
    removeCard,
    resetCard,
    showOverlay,
    hideOverlay,
    showToast,
    hideToast,
    openDatePickerPanel,
    openMobileSidebar,
    closeMobileSidebar,
    isEnabled
  };
})(window);
