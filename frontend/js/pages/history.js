/* ==========================================================
   pages/history.js — list, search and result popup
   Needs js/api.js (loaded first in history.html).
   Tip: open history.html#demo to preview with sample entries.
   ========================================================== */
(() => {
  const $ = (s) => document.querySelector(s);
  const api = window.FurifyAPI;

  const listEl = $("#historyList");
  const emptyEl = $("#historyEmpty");
  const searchEl = $("#historySearch");

  const MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };
  const fmtTime = (iso) =>
    new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  /* ---------- Sample data for #demo (never saved) ---------- */
  const daysAgo = (n, h = 15) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 42, 0, 0); return d.toISOString(); };
  const SAMPLE = [
    { id: "demo1", breed: "Golden Retriever", confidence: 97, date: daysAgo(0),
      image: "assets/image/goldenNoBG.png",
      matches: [{ breed: "Golden Retriever", confidence: 97 }, { breed: "Labrador Retriever", confidence: 1 }, { breed: "Flat-Coated Retriever", confidence: 1 }],
      reason: "Golden Retriever is strongly supported by the dog's golden coat, feathered ears, friendly facial features, and overall body shape. These traits closely match the characteristics commonly seen in Golden Retrievers." },
    { id: "demo2", breed: "French Bulldog", confidence: 88, date: daysAgo(3, 11),
      image: "assets/image/bulldog.png",
      matches: [{ breed: "French Bulldog", confidence: 88 }, { breed: "Boston Terrier", confidence: 8 }, { breed: "Pug", confidence: 3 }],
      reason: "" },
  ];

  /* ---------- Data (comes from FurifyAPI: mock now, backend later) ---------- */
  let entries = [];
  let isDemo = false;

  /* ---------- Render the list ---------- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function card(entry, i) {
    const li = el("li");
    li.style.setProperty("--i", i);

    const btn = el("button", "history-card");
    btn.type = "button";
    btn.dataset.id = entry.id;
    btn.setAttribute("aria-label", `${entry.breed}, ${entry.confidence} percent, ${fmtDate(entry.date)}. View result`);

    const photo = el("span", "history-photo");
    const img = new Image();
    img.src = entry.image || "";
    img.alt = "";
    img.loading = "lazy";
    photo.appendChild(img);

    const breed = el("span", "history-breed");
    breed.append(el("small", "", "Identified Breed"), el("strong", "", entry.breed));

    const conf = el("span", "history-conf");
    conf.append(el("small", "", "Confidence Rate"), el("strong", "", `${Math.round(entry.confidence)}%`));

    const date = el("span", "history-date");
    date.append(el("strong", "", fmtDate(entry.date)), el("em", "", "View Result →"));

    btn.append(photo, breed, conf, date);
    li.appendChild(btn);
    return li;
  }

  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const shown = entries.filter((e) =>
      !q || e.breed.toLowerCase().includes(q) || fmtDate(e.date).toLowerCase().includes(q));

    listEl.textContent = "";
    shown.forEach((e, i) => listEl.appendChild(card(e, i)));

    emptyEl.hidden = shown.length > 0;
    if (!shown.length) {
      emptyEl.textContent = entries.length ? `No results for "${searchEl.value.trim()}"` : "No Identification History Yet";
    }
  }

  async function load() {
    // Safely grab the API object at runtime instead of top-level scope
    const api = window.FurifyAPI;
    
    emptyEl.hidden = false;

    // If api.js hasn't loaded or isn't defined, fall back to demo mode gracefully
    if (!api || !api.history) {
      entries = SAMPLE;
      isDemo = true;
      render();
      return;
    }

    emptyEl.textContent = "Loading your history…";
    try {
      entries = await api.history.list();
    } catch (err) {
      console.error(err);
      emptyEl.textContent = "Couldn't load your history. Please try again later.";
      return;
    }
    if (!entries.length && location.hash === "#demo") { entries = SAMPLE; isDemo = true; }
    render();
  }

  searchEl.addEventListener("input", render);
  load();

  /* ==========================================================
     Result popup
     ========================================================== */
  const modal = $("#resultModal");
  const dialog = modal.querySelector(".result-dialog");
  const closeBtn = modal.querySelector(".result-close");
  const photoEl = $("#resultPhoto");
  const chipsEl = $("#resultChips");
  const titleEl = $("#resultTitle");
  const subEl = $("#resultSub");
  const whenEl = $("#resultWhen");
  const whyEl = $("#resultWhy");
  const shareBtn = $("#shareBtn");
  const deleteBtn = $("#deleteBtn");
  const toastEl = $("#resultToast");

  let current = null;
  let lastFocus = null;
  let toastT = 0, confirmT = 0, closeT = 0;

  const toast = (msg) => {
    toastEl.textContent = msg;
    clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.textContent = ""; }, 2600);
  };

  function resetDelete() {
    clearTimeout(confirmT);
    deleteBtn.classList.remove("confirm");
    deleteBtn.textContent = "Remove from history";
  }

  async function openResult(entry, trigger) {
    current = entry;
    lastFocus = trigger;
    clearTimeout(closeT);
    resetDelete();
    toastEl.textContent = "";

    const matches = (entry.matches && entry.matches.length)
      ? entry.matches.slice(0, 3)
      : [{ breed: entry.breed, confidence: entry.confidence }];

    photoEl.src = entry.image || "";
    photoEl.alt = `Photo of your dog, identified as ${entry.breed}`;

    chipsEl.textContent = "";
    matches.forEach((m) => {
      const li = el("li", "", `${m.breed} `);
      li.appendChild(el("b", "", `${Math.round(m.confidence)}%`));
      chipsEl.appendChild(li);
    });

    const c = entry.confidence;
    const strength = c >= 80 ? "strong" : c >= 50 ? "likely" : "possible";
    titleEl.textContent = `Top Match: ${entry.breed}`;
    subEl.textContent = `Furify found a ${strength} match based on the visible features of your dog.`;
    whenEl.textContent = `Identified ${fmtDate(entry.date)} at ${fmtTime(entry.date)}`;
    whyEl.textContent = entry.reason ||
      `${entry.breed} was the closest match based on visible features such as the coat, ears, face, and body shape.`;

    // 🛡️ Hide delete button if it's demo mode OR if it's an unauthenticated guest
    const supabase = window.supabase;
    let isGuest = false;
    if (supabase && supabase.auth) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user && localStorage.getItem('furify_guest_id')) {
          isGuest = true;
        }
      } catch (e) {
        isGuest = true;
      }
    }

    deleteBtn.hidden = isDemo || isGuest;

    modal.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add("open")));
    closeBtn.focus({ preventScroll: true });
  }
  function closeResult() {
    if (modal.hidden) return;
    modal.classList.remove("open");
    document.body.style.overflow = "";
    closeT = setTimeout(() => { modal.hidden = true; }, 260);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    current = null;
  }

  listEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".history-card");
    if (!btn) return;
    const entry = entries.find((x) => x.id === btn.dataset.id);
    if (entry) openResult(entry, btn);
  });

  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeResult(); });

  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "Escape") { closeResult(); return; }
    if (e.key !== "Tab") return;                       // keep focus inside the popup
    const items = [...dialog.querySelectorAll("button:not([hidden]), a[href]")];
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ---------- Share ---------- */
  shareBtn.addEventListener("click", async () => {
    if (!current) return;
    const text = `Furify identified my dog as a ${current.breed} (${Math.round(current.confidence)}% match)!`;
    const url = new URL("index.html", location.href).href;
    try {
      if (navigator.share) { await navigator.share({ title: "Furify", text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast("Copied to your clipboard");
    } catch (err) {
      if (err && err.name !== "AbortError") toast("Couldn't share. Try copying it manually.");
    }
  });

  /* ---------- Remove (asks twice, no ugly browser popup) ---------- */
  deleteBtn.addEventListener("click", async () => {
    if (!current) return;
    if (!deleteBtn.classList.contains("confirm")) {
      deleteBtn.classList.add("confirm");
      deleteBtn.textContent = "Click again to remove";
      confirmT = setTimeout(resetDelete, 3000);
      return;
    }
    const id = current.id;
    try {
      await api.history.remove(id);
    } catch (err) {
      resetDelete();
      toast("Couldn't remove it. Please try again.");
      return;
    }
    entries = entries.filter((x) => x.id !== id);
    closeResult();
    render();
  });
})();