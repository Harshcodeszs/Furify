/* ==========================================================
   pages/home.js — home page animations, scrolling, bulldog + magnifier, paw trail
   (moved here from the <script> block that was at the bottom of index.html)
   ========================================================== */
(() => {
  // turns on the "hidden until animated" styles (was the separate home-init.js)
  document.documentElement.classList.add("js");

  const $ = (s) => document.querySelector(s);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;

  const hero = $(".hero");
  const stage = $("#dogStage");
  const tips = $(".tips-section");
  const nav = $(".navbar");
  const how = $(".how-it-works");
  const cta = $(".cta-section");
  const footer = $(".footer");
  const pages = [hero, stage, tips, how, cta];
  const dogWrap = $("#dogWrap");
  const dogImg = $("#dogImg");

  /* ---------- 1. Title: split into letters for the reveal ---------- */
  const title = $("#stageTitle");
  const titleText = title.textContent.trim();
  title.setAttribute("aria-label", titleText);
  title.textContent = "";
  let n = 0;
  titleText.split(" ").forEach((w) => {
    const word = document.createElement("span");
    word.className = "word";
    word.setAttribute("aria-hidden", "true");
    [...w].forEach((c) => {
      const ch = document.createElement("span");
      ch.className = "ch";
      ch.textContent = c;
      ch.style.setProperty("--i", n++);
      word.appendChild(ch);
    });
    title.appendChild(word);
  });

  /* ---------- 2. Slide-in for tips / steps / call-to-action ---------- */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.classList.add("in-view");
      revealIO.unobserve(el);

      // Once it has slid in, remove the reveal classes so the page's own CSS
      // (like the .tip-card hover lift in transitions.css) works normally again.
      const delay = parseFloat(el.style.getPropertyValue("--d") || 0) * 90;
      setTimeout(() => {
        el.classList.remove("reveal", "in-view");
        el.style.removeProperty("--d");
      }, 1100 + delay);
    });
  }, { threshold: 0.15 });

  // the call-to-action animates in order: card, heading, text, button, note
  const ctaDelay = {
    ".cta-card": 0, ".cta-card h2": 2, ".cta-card > p:not(.cta-note)": 3,
    ".cta-card .btn": 4, ".cta-card .cta-note": 5,
  };

  [".tips-grid .tip-card", ".tips-notice", ".tips-image", ".how-it-works h2",
   ".how-it-works .section-subtitle", ".step-item", ".how-image", ...Object.keys(ctaDelay)
  ].forEach((sel) =>
    document.querySelectorAll(sel).forEach((el, i) => {
      el.classList.add("reveal");
      const d = sel in ctaDelay ? ctaDelay[sel] : /tip-card|step-item/.test(sel) ? i : 0;
      el.style.setProperty("--d", d);
      revealIO.observe(el);
    })
  );

  /* ---------- 3. Page-to-page scrolling (the 5 parts of the home page) ---------- */
  const navH = () => nav.offsetHeight;
  // keep the CSS in step with the real navbar / footer size on any screen
  const syncSizes = () => {
    root.style.setProperty("--nav-h", navH() + "px");
    root.style.setProperty("--footer-h", footer.offsetHeight + "px");
  };
  syncSizes();
  addEventListener("resize", syncSizes);
  addEventListener("load", syncSizes);
  new ResizeObserver(syncSizes).observe(nav);
  new ResizeObserver(syncSizes).observe(footer);

  const topOf = (el) => el.getBoundingClientRect().top + scrollY - navH();
  const maxScroll = () => Math.max(0, root.scrollHeight - innerHeight);
  const pos = (el) => clamp(topOf(el), 0, maxScroll());   // where a part really rests (never past the page end)
  const current = () => {
    let idx = 0;
    pages.forEach((p, i) => { if (pos(p) <= scrollY + 90) idx = i; });
    return idx;
  };
  const nearTop = (i) => Math.abs(scrollY - pos(pages[i])) < 90;
  // a part taller than the screen (very small windows) is scrolled normally, never skipped
  const fits = (p) => p.offsetHeight <= innerHeight - navH() + 6;

  let busy = false;
  let lockUntil = 0;

  // CSS snap only on touch screens, and only if every part fits the window.
  // Mouse/trackpad get the glide + settle below instead (no tug-of-war = no stuck parts).
  const finePointer = () => matchMedia("(pointer: fine)").matches;
  function updateSnap() {
    const cssSnap = !reduce && !finePointer() && pages.every(fits);
    root.classList.toggle("no-snap", busy || !cssSnap);
  }
  updateSnap();
  addEventListener("resize", updateSnap);
  addEventListener("load", updateSnap);
  async function idle() { while (busy) await wait(60); }   // wait for a page glide to end

  function goTo(el, ms = 1250) {
    const from = scrollY;
    const to = pos(el);
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2); // easeInOutQuart
    busy = true;
    updateSnap();
    (function step(now) {
      const t = Math.min(1, (now - t0) / ms);
      scrollTo({ top: from + (to - from) * ease(t), behavior: "instant" });
      if (t < 1) requestAnimationFrame(step);
      else {
        busy = false;
        lockUntil = performance.now() + 250;
        updateSnap();
      }
    })(t0);
  }

  addEventListener("wheel", (e) => {
    if (reduce || e.ctrlKey) return;
    if (introRunning) { e.preventDefault(); skipIntro(); return; }
    const now = performance.now();
    if (busy || now < lockUntil) {
      e.preventDefault();
      lockUntil = Math.max(lockUntil, now + 120);   // wait for trackpad momentum to stop
      return;
    }
    if (Math.abs(e.deltaY) < 8) return;
    const i = current();
    if (e.deltaY > 0 && i < pages.length - 1 && nearTop(i) && fits(pages[i])) { e.preventDefault(); goTo(pages[i + 1]); }
    else if (e.deltaY < 0 && i > 0 && nearTop(i) && fits(pages[i - 1])) { e.preventDefault(); goTo(pages[i - 1]); }
  }, { passive: false });

  addEventListener("keydown", (e) => {
    if (busy && ["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"].includes(e.key)) { e.preventDefault(); return; }
    if (introRunning && ["ArrowDown", "PageDown", " ", "End"].includes(e.key)) {
      e.preventDefault();
      skipIntro();
    }
  });
  addEventListener("touchmove", (e) => {
    if (introRunning) { e.preventDefault(); skipIntro(); }
  }, { passive: false });

  $("#scrollHint").addEventListener("click", () => goTo(tips));

  // If the person stops between two parts (scrollbar drag, arrow keys, big flick),
  // ease to the nearest part so you never rest on the bottom of one and the top of the next.
  let settleT = 0;
  function settle() {
    if (busy || introRunning || reduce || !finePointer()) return;
    let best = 0, bd = Infinity;
    pages.forEach((p, i) => { const d = Math.abs(scrollY - pos(p)); if (d < bd) { bd = d; best = i; } });
    if (bd > 2 && bd < innerHeight * 0.5 && fits(pages[best])) goTo(pages[best], 650);
  }

  /* ---------- 4. Parallax: hero and dog section drift away as you leave ---------- */
  let ticking = false;
  function onScroll() {
    clearTimeout(settleT);
    settleT = setTimeout(settle, 170);
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      hero.style.setProperty("--hp", clamp(scrollY / hero.offsetHeight, 0, 1).toFixed(3));
      stage.style.setProperty("--p", clamp((scrollY - topOf(stage)) / stage.offsetHeight, 0, 1).toFixed(3));
    });
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- 5. The intro: dog swoops in > title > "scroll down" ----------
     Only starts when the section is really on screen, and plays again
     every time the person comes back to it. */
  let anims = [];
  let introStarted = false, introRunning = false, skipFlag = false, runId = 0;

  function resetIntro() {          // called once the section is fully off screen
    runId++;
    anims.forEach((a) => a.cancel());
    anims = [];
    stage.classList.remove("is-in", "is-ready");
    introStarted = introRunning = skipFlag = false;
  }

  function skipIntro() {
    skipFlag = true;
    anims.forEach((a) => a.finish());
    stage.classList.add("is-in");
  }

  // waits, but returns early if skipped; false means this run was cancelled
  async function nap(ms, id) {
    const end = performance.now() + ms;
    while (performance.now() < end && !skipFlag && id === runId) await wait(40);
    return id === runId;
  }

  async function startIntro() {
    introStarted = true;
    skipFlag = false;
    const id = ++runId;

    try { await dogImg.decode(); } catch (e) { /* already loaded or failed: carry on */ }
    while (busy) await wait(60);           // let the page glide finish first
    if (id !== runId) return;

    if (reduce) {
      dogWrap.style.opacity = 1;
      dogWrap.style.transform = "none";
      stage.classList.add("is-in", "is-ready");
      return;
    }

    introRunning = true;
    if (!(await nap(150, id))) return;

    // the dog: swift slide in from the left, a little leap, soft landing in the middle
    anims = [
      dogWrap.animate([
        { transform: "translateX(-115vw)", filter: "blur(14px)", opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.12 },
        { transform: "translateX(3vw)", filter: "blur(0px)", opacity: 1, offset: 0.78 },
        { transform: "translateX(0)", filter: "blur(0px)", opacity: 1, offset: 1 },
      ], { duration: 1500, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" }),

      dogImg.animate([
        { transform: "translateY(7%) rotate(-8deg) scale(0.95)", offset: 0 },
        { transform: "translateY(-6%) rotate(-3deg) scale(1)", offset: 0.4 },
        { transform: "translateY(1.5%) rotate(1.5deg) scale(1)", offset: 0.78 },
        { transform: "translateY(0) rotate(0deg) scale(1)", offset: 1 },
      ], { duration: 1500, easing: "cubic-bezier(0.45, 0.05, 0.2, 1)", fill: "forwards" }),
    ];

    if (!(await nap(900, id))) return;      // dog is landing
    stage.classList.add("is-in");           // title letters, then the subtitle
    if (!(await nap(2200, id))) return;

    introRunning = false;
    stage.classList.add("is-ready");        // "Scroll down"
  }

  new IntersectionObserver(([e]) => {
    if (e.intersectionRatio === 0) { resetIntro(); return; }
    const needed = Math.min(stage.offsetHeight * 0.8, innerHeight * 0.7);
    if (!introStarted && e.intersectionRect.height >= needed) startIntro();
  }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) }).observe(stage);

  /* Runs `cb` once, the first time `el` is really on screen (never again) */
  function onceInView(el, cb) {
    const io = new IntersectionObserver(([e]) => {
      const needed = Math.min(el.offsetHeight * 0.6, innerHeight * 0.55);
      if (e.intersectionRect.height < needed) return;
      io.disconnect();
      cb();
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    io.observe(el);
  }

  /* ---------- 6. PART 4: bulldog rises, then the magnifying glass sweeps in ----------
     These numbers are the ONLY thing to tune so the lens lines up with your PNGs
     (fractions, 0 to 1). Open index.html#lens-debug to see the glass circle in red. */
  /* All sizes are measured against the VISIBLE dog (the PNG's transparent margins are ignored),
     using the proportions from your Figma. */
  const LENS = {
    width: 0.80,    // magnifier width = this x the dog's visible width        (Figma: 190 / 194)
    glassX: 0.28,   // glass centre inside the magnifier, across its visible width
    glassY: 0.284,  // ...and down its visible height
    glassR: 0.26,   // glass radius, as a fraction of the magnifier's visible width
    onDogX: 0.62,  // glass centre across the dog's visible width
    onDogY: 0.58,   // glass centre DOWN from the top of the dog, in dog-widths   (Figma: 120 / 194)
    zoom: 1.7,      // magnification inside the glass
  };
  const howStage = $("#howStage"), howDog = $("#howDogImg"), lens = $("#howLens");
  const glass = $("#howGlass"), zoomImg = $("#howZoom"), lensImg = $("#howLensImg");
  if (location.hash === "#lens-debug") howStage.classList.add("lens-debug");

  // finds the part of a PNG that is really there (ignores faint halos and stray pixels)
  function visibleBox(img) {
    try {
      const w = 240, h = Math.round(w * img.naturalHeight / img.naturalWidth) || w;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      const cols = new Array(w).fill(0), rows = new Array(h).fill(0);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 110) { cols[x]++; rows[y]++; }
      }
      const first = (arr) => arr.findIndex((n) => n >= 3);
      const last = (arr) => arr.length - 1 - [...arr].reverse().findIndex((n) => n >= 3);
      const l = first(cols), r = last(cols), t = first(rows), b = last(rows);
      if (l < 0 || t < 0) throw new Error("empty");
      return { l: l / w, t: t / h, r: (r + 1) / w, b: (b + 1) / h };
    } catch (e) {
      console.warn("[furify lens] could not read the PNG pixels, using the whole image:", e.message);
      return { l: 0, t: 0, r: 1, b: 1 };   // e.g. opened as file:// instead of through Live Server
    }
  }
  let dogBox = null, lensBox = null;

  function placeLens() {
    const W = howDog.offsetWidth, H = howDog.offsetHeight;
    if (!W || !dogBox || !lensBox) return;
    const visW = (dogBox.r - dogBox.l) * W;                          // the dog's visible width, in px
    const cx = dogBox.l * W + LENS.onDogX * visW;                    // glass centre, in dog-image px
    const cy = dogBox.t * H + LENS.onDogY * visW;

    const bw = lensBox.r - lensBox.l, bh = lensBox.b - lensBox.t;
    const lw = (LENS.width * visW) / bw;                             // whole magnifier image width
    const lh = lw * (lensImg.naturalHeight / lensImg.naturalWidth);
    const gx = (lensBox.l + LENS.glassX * bw) * lw;                  // glass centre inside the magnifier image
    const gy = (lensBox.t + LENS.glassY * bh) * lh;
    const r = LENS.glassR * bw * lw;

    lens.style.cssText =
      `left:${cx - gx}px;top:${cy - gy}px;width:${lw}px;height:${lh}px;transform-origin:${gx}px ${gy}px;`;
    glass.style.cssText = `left:${gx - r}px;top:${gy - r}px;width:${2 * r}px;height:${2 * r}px;`;
    // same dog photo, lined up with the real one and enlarged around the glass centre
    zoomImg.style.cssText =
      `left:${r - cx}px;top:${r - cy}px;width:${W}px;height:${H}px;` +
      `transform-origin:${cx}px ${cy}px;transform:scale(${LENS.zoom});`;
  }

  function measureAndPlace() {
    dogBox = visibleBox(howDog);
    lensBox = visibleBox(lensImg);
    console.info("[furify lens] v3", { dogBox, lensBox });
    placeLens();
  }
  Promise.all([howDog, lensImg].map((im) => im.decode().catch(() => {}))).then(measureAndPlace);
  new ResizeObserver(placeLens).observe(howDog);
  addEventListener("load", placeLens);

  onceInView(how, async () => {
    if (reduce) { howStage.classList.add("dog-in", "lens-in"); return; }
    await idle();
    howStage.classList.add("dog-in");                              // dog: blur > sharp
    setTimeout(() => howStage.classList.add("lens-in"), 1150);     // then the magnifier
  });

  /* ---------- 7. PART 5: paw prints walk across the background, one by one ---------- */
  const trail = $("#pawTrail");
  let walked = false;

  function buildPaws() {
    const w = cta.clientWidth, h = cta.clientHeight;
    if (!w || !h) return 0;
    trail.textContent = "";
    trail.classList.remove("walk");
    trail.classList.toggle("walked", walked);

    const size = Math.round(clamp(w * 0.036, 30, 60));
    const count = clamp(Math.round(w / 85), 9, 24);
    const step = Math.min(0.3, 4.2 / count);                       // seconds between footsteps
    const wave = (t) => t * Math.PI * 2.2 + 0.6;

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const px = (0.03 + 0.94 * t) * w;                            // the dog's path: left to right, lazy S-curve
      const py = h * (0.5 + 0.3 * Math.sin(wave(t)));
      const heading = Math.atan2(h * 0.3 * Math.PI * 2.2 * Math.cos(wave(t)), 0.94 * w);
      const side = i % 2 ? 1 : -1;                                 // left / right feet alternate
      const off = size * 0.55 * side;
      const x = px - Math.sin(heading) * off;
      const y = py + Math.cos(heading) * off;
      const jitter = ((i * 37) % 11) - 5;

      const paw = new Image();
      paw.className = "paw";
      paw.alt = "";
      paw.decoding = "async";
      paw.src = trail.dataset.src;
      paw.style.cssText =
        `width:${size}px;--x:${x.toFixed(1)}px;--y:${y.toFixed(1)}px;` +
        `--r:${(heading * 180 / Math.PI + 90 + jitter).toFixed(1)}deg;--s:${-side};` +
        `--delay:${(i * step).toFixed(2)}s`;
      trail.appendChild(paw);
    }
    return count * step + 0.7;
  }

  let rebuildT = 0;
  new ResizeObserver(() => {
    clearTimeout(rebuildT);
    rebuildT = setTimeout(() => {
      if (trail.classList.contains("walk")) return;                // don't cancel a walk in progress
      buildPaws();
    }, 150);
  }).observe(cta);

  onceInView(cta, async () => {
    await idle();
    const total = buildPaws();
    if (reduce) { walked = true; trail.classList.add("walked"); return; }
    trail.classList.add("walk");
    setTimeout(() => { walked = true; trail.classList.remove("walk"); trail.classList.add("walked"); }, total * 1000);
  });

  /* ---------- 8. "Scroll down" hint on parts 3 and 4 (like part 2's) ---------- */
  function hintFor(section, next, delay) {
    const btn = section.querySelector("[data-hint]");
    let t = 0;
    btn.addEventListener("click", () => goTo(next));
    new IntersectionObserver(([e]) => {
      clearTimeout(t);
      const needed = Math.min(section.offsetHeight * 0.8, innerHeight * 0.7);
      if (e.intersectionRect.height >= needed) t = setTimeout(() => section.classList.add("is-ready"), reduce ? 0 : delay);
      else if (e.intersectionRatio < 0.5) section.classList.remove("is-ready");
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) }).observe(section);
  }
  hintFor(tips, how, 2000);   // after the tip cards have slid in
  hintFor(how, cta, 2800);    // after the bulldog and magnifier have finished
})();