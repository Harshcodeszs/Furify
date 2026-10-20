/* ==========================================================
   pages/about.js — fade the text blocks in as you scroll to them
   Blocks already on screen are left alone (no flash on load);
   only the ones below the fold are hidden, then revealed once.
   ========================================================== */
(() => {
  if (!("IntersectionObserver" in window)) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in-view");
      io.unobserve(e.target);
    });
  }, { threshold: 0.15 });

  document.querySelectorAll(".about-block").forEach((block) => {
    if (block.getBoundingClientRect().top < innerHeight * 0.9) return;   // already visible
    block.classList.add("reveal");
    io.observe(block);
  });
})();