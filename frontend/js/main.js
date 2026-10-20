/* ==========================================================
   main.js — navbar behaviour, shared by EVERY page
   - underlines the page you are on (no need to add class="active" in the HTML)
   - the underline glides from the previous page's link to the new one
   - hovering a link: a very small, slow drift toward the cursor
     and the hover line grows from wherever the cursor entered
   - starts loading the next page when you hover its link
   Needs the matching CSS in css/transitions.css
   and the small "navbar underline" block in js/transitions.js (loaded in <head>).
   ========================================================== */
(() => {
  const nav = document.querySelector(".navbar");
  const list = nav && nav.querySelector(".nav-links");
  if (!list) return;

  const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const BAR_KEY = "furify_bar2";
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  const pageName = (url) => {
    const name = new URL(url, location.href).pathname.split("/").pop();
    return name === "" ? "index.html" : name;
  };
  const here = pageName(location.href);
  const links = [...list.querySelectorAll("a")];
  const current = links.find((a) => pageName(a.href) === here) || null;

  /* ---------- 1. which link is the page you are on ---------- */
  links.forEach((a) => {
    const on = a === current;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  list.classList.add("has-bar");

  /* ---------- 2. the underline: a thin bar (css: .nav-links::before) that glides ----------
     Its position lives in 4 CSS variables. js/transitions.js already put them where the bar was
     on the previous page, so it is visible there from the very first paint; here we just
     change them and the CSS transition does the gliding. */
  // exact position ON SCREEN (not relative to the list), so it is right even if two pages'
  // navbars sit a few pixels differently. offsetLeft/Top ignore the hover drift of the links.
  const geo = (a) => {
    const base = list.getBoundingClientRect();
    return {
      x: base.left + a.offsetLeft - list.scrollLeft,
      y: base.top + a.offsetTop + a.offsetHeight - 1,
      w: a.offsetWidth,
    };
  };

  function setBar(g, visible = true) {
    list.style.setProperty("--bar-x", g.x + "px");
    list.style.setProperty("--bar-y", g.y + "px");
    list.style.setProperty("--bar-w", g.w + "px");
    list.style.setProperty("--bar-o", visible ? "1" : "0");
  }

  const remember = (g) => {
    try { sessionStorage.setItem(BAR_KEY, JSON.stringify({ ...g, t: Date.now() })); } catch (e) {}
  };
  const readPrevious = () => {                      // where the last page left the line (if we just came from one)
    try {
      const v = JSON.parse(sessionStorage.getItem(BAR_KEY) || "null");
      return v && Date.now() - v.t < 6000 ? v : null;
    } catch (e) { return null; }
  };

  let gliding = false;

  if (!current) {
    list.style.setProperty("--bar-o", "0");          // e.g. login page: no line
    try { sessionStorage.removeItem(BAR_KEY); } catch (e) {}
  } else {
    const g = geo(current);
    const prev = readPrevious();
    const moved = prev && (Math.abs(prev.x - g.x) > 0.5 || Math.abs(prev.y - g.y) > 0.5 || Math.abs(prev.w - g.w) > 0.5);
    const canAnimatePseudo = typeof KeyframeEffect !== "undefined" && "pseudoElement" in KeyframeEffect.prototype;

    list.classList.add("no-anim");                   // put the line at its final spot first (no CSS transition involved)...
    setBar(g);
    void list.offsetWidth;
    list.classList.remove("no-anim");

    if (moved && !reduce && canAnimatePseudo) {      // ...then play the glide ourselves, from where the last page left it
      gliding = true;
      const at = (b) => `translate3d(${b.x}px, ${b.y}px, 0)`;
      const glide = list.animate(
        [{ transform: at(prev), width: prev.w + "px" }, { transform: at(g), width: g.w + "px" }],
        { duration: 800, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::before" }
      );
      glide.onfinish = glide.oncancel = () => { gliding = false; };
    }
    remember(g);
  }

  // fonts / window size can move the links a little: follow them without interrupting a glide
  function refresh() {
    if (!current) return;
    const g = geo(current);
    if (!gliding) list.classList.add("no-anim");
    setBar(g);
    if (!gliding) { void list.offsetWidth; list.classList.remove("no-anim"); }
    remember(g);
  }
  addEventListener("resize", refresh);
  if (document.fonts) {
    document.fonts.ready.then(refresh);
    document.fonts.addEventListener("loadingdone", refresh);   // web font arrived after the first measure
  }
  if ("ResizeObserver" in window) {                           // any link changing size (font swap, etc.)
    const ro = new ResizeObserver(refresh);
    ro.observe(list);
    links.forEach((a) => ro.observe(a));
  }

  /* ---------- 3. load the next page early ---------- */
  const prefetched = new Set();
  function prefetch(a) {
    if (!a.closest(".nav-links") || a.origin !== location.origin) return;
    if (prefetched.has(a.href) || pageName(a.href) === here) return;
    prefetched.add(a.href);
    const l = document.createElement("link");
    l.rel = "prefetch";
    l.href = a.href;
    document.head.appendChild(l);
  }

  /* ---------- 4. hover: a small, slow drift toward the cursor ---------- */
  if (!canHover || reduce) return;

 const SELECTOR = ".nav-links a, .nav-auth > a";     // not the avatar dropdown: it has its own hover animation
  const target = (e) => e.target.closest && e.target.closest(SELECTOR);

  const MAX_X = 3.5;          // px the text may drift sideways
  const MAX_Y = 2;            // px up / down
  const SCALE = 1.045;        // how much it grows
  const EASE_MS = 150;        // bigger = slower and calmer

  const drift = new Map();    // link -> { x, y, s, tx, ty, ts }
  let raf = 0;
  let last = 0;

  const state = (el) => {
    let p = drift.get(el);
    if (!p) drift.set(el, (p = { x: 0, y: 0, s: 1, tx: 0, ty: 0, ts: 1 }));
    return p;
  };

  function frame(now) {
    const k = 1 - Math.exp(-Math.min(now - (last || now), 50) / EASE_MS);   // smooth easing, never overshoots
    last = now;
    let active = false;

    drift.forEach((p, el) => {
      p.x += (p.tx - p.x) * k;
      p.y += (p.ty - p.y) * k;
      p.s += (p.ts - p.s) * k;

      const done = Math.abs(p.tx - p.x) < 0.01 && Math.abs(p.ty - p.y) < 0.01 && Math.abs(p.ts - p.s) < 0.0005;
      if (done) {
        p.x = p.tx; p.y = p.ty; p.s = p.ts;
        if (p.ts === 1 && p.tx === 0 && p.ty === 0) { el.style.transform = ""; drift.delete(el); return; }
      } else {
        active = true;
      }
      el.style.transform = `translate3d(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px, 0) scale(${p.s.toFixed(4)})`;
    });

    if (active) raf = requestAnimationFrame(frame);
    else { raf = 0; last = 0; }
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  const edge = (a, e) => {    // where along the link the cursor is: the hover line grows from / shrinks to there
    const r = a.getBoundingClientRect();
    a.style.setProperty("--ox", clamp(((e.clientX - r.left) / r.width) * 100, 0, 100).toFixed(0) + "%");
  };

  nav.addEventListener("pointerover", (e) => {
    const a = target(e);
    if (!a || a.contains(e.relatedTarget)) return;
    edge(a, e);
    state(a).ts = SCALE;
    kick();
    prefetch(a);
  });

  nav.addEventListener("pointermove", (e) => {
    const a = target(e);
    if (!a) return;
    const p = state(a);
    const r = a.getBoundingClientRect();
    const cx = r.left + r.width / 2 - p.x;   // the link's resting centre (ignores its current drift)
    const cy = r.top + r.height / 2 - p.y;
    p.tx = clamp((e.clientX - cx) * 0.14, -MAX_X, MAX_X);
    p.ty = clamp((e.clientY - cy) * 0.2, -MAX_Y, MAX_Y);
    kick();
  });

  nav.addEventListener("pointerout", (e) => {
    const a = target(e);
    if (!a || a.contains(e.relatedTarget)) return;
    edge(a, e);
    const p = state(a);
    p.tx = p.ty = 0;
    p.ts = 1;
    kick();
  });
})();