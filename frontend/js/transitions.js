/* ==========================================================
   js/transitions.js — slide left/right between pages
   Load in <head>, NOT deferred, on every page:
     <script src="js/transitions.js"></script>

   Two modes, picked automatically:
   1. NATIVE  (Chrome, Edge, Safari 18.2+): the browser keeps the old page on screen
      until the new one is ready, then slides them. No white gap, no lag.
      This file only tells the CSS which direction to slide.
   2. FALLBACK (other browsers): slides the page out, navigates, slides the new one in.

   To add a page to the slide order, add its filename to ORDER
   (left-to-right, same order as the navbar).
   ========================================================== */
(() => {
  const ORDER = ["index.html", "identifyfur.html", "history.html", "about.html"];
  const KEY = "furify_nav";
  const EXIT_MS = 280;

  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NATIVE = "onpagereveal" in window;            // cross-document view transitions

  const pageName = (url) => {
    const name = new URL(url, location.href).pathname.split("/").pop();
    return name === "" ? "index.html" : name;
  };
  const here = pageName(location.href);

  /* "right" = going forward in the navbar order, "left" = going back, null = not in the order */
  const directionBetween = (fromUrl, toUrl) => {
    const from = ORDER.indexOf(pageName(fromUrl));
    const to = ORDER.indexOf(pageName(toUrl));
    if (from < 0 || to < 0 || from === to) return null;
    return to > from ? "right" : "left";
  };

  /* ---- Navbar underline: start exactly where it was on the previous page ----
     (main.js then glides it to the new link) */
  try {
    const bar = JSON.parse(sessionStorage.getItem("furify_bar2") || "null");
    if (bar && Date.now() - bar.t < 6000) {
      root.style.setProperty("--bar-x", bar.x + "px");
      root.style.setProperty("--bar-y", bar.y + "px");
      root.style.setProperty("--bar-w", bar.w + "px");
      root.style.setProperty("--bar-o", "1");
    }
  } catch (e) { /* storage blocked: the line just appears under the current page */ }

  /* ==========================================================
     1. NATIVE MODE
     ========================================================== */
  if (NATIVE) {
    root.classList.add("vt");                         // CSS turns off the old per-page fade

    addEventListener("pagereveal", (e) => {
      if (!e.viewTransition) return;                  // first load / reload: nothing to slide
      let dir = null;
      try {
        const from = navigation.activation && navigation.activation.from;
        if (from) dir = directionBetween(from.url, location.href);
      } catch (err) { /* old API: plain crossfade */ }
      if (dir) root.dataset.slide = dir;              // CSS picks the slide from this
      e.viewTransition.finished.finally(() => { delete root.dataset.slide; });
    });
    return;
  }

  /* ==========================================================
     2. FALLBACK MODE (browsers without cross-page view transitions)
     ========================================================== */

  /* Entering: the previous page told us which way we came from */
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    sessionStorage.removeItem(KEY);
    if (saved && Date.now() - saved.t < 4000 && !reduce) {
      const cls = "nav-enter-" + saved.dir;
      // "nav-slid" is never removed: it keeps the page's old fade-in from replaying (that was the white blink)
      root.classList.add("nav-slid", cls);
      setTimeout(() => root.classList.remove(cls), 900);
    }
  } catch (e) { /* storage blocked: just skip the slide */ }

  /* Leaving: slide out, then go */
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const a = e.target.closest("a[href]");
    if (!a || a.target || a.hasAttribute("download")) return;

    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;

    const dir = directionBetween(location.href, url.href);
    if (reduce || !dir) return;                       // not in the order: normal navigation

    e.preventDefault();
    try { sessionStorage.setItem(KEY, JSON.stringify({ dir, t: Date.now() })); } catch (err) {}
    root.classList.add("nav-exit-" + dir);
    setTimeout(() => { location.href = url.href; }, EXIT_MS);
  });

  addEventListener("pageshow", (e) => {               // back/forward cache: undo the exit slide
    if (e.persisted) root.classList.remove("nav-exit-left", "nav-exit-right");
  });
})();