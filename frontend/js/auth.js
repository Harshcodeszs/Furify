/* ==========================================================
   auth.js
   - floating login / signup popup that works on ANY page
     (any link to login.html or signup.html opens it in place)
   - FurifyAuth: shared login state + usage counter
   - navbar user menu (avatar, identifications left, log out)

   Add this ONE line to every page (before </body>):
     <script src="js/auth.js" defer></script>
   The popup's CSS (css/pages/login.css) loads itself.

   NOTE: front-end only. Accounts are NOT really created or checked
   yet. Everything marked "BACKEND HOOK" is for your friend.
   ========================================================== */
(() => {
  const $ = (id) => document.getElementById(id);

  /* ---------- paths (relative to the HTML pages) ---------- */
  const CSS_FILE  = "css/pages/login.css";
  const FUR_IMAGE = "assets/image/fur.jpg";

  /* ---------- storage ---------- */
  const USER_KEY  = "furify_user";   // logged-in user  { name, email }
  const USAGE_KEY = "furify_usage";  // identifications left, per email
  const MAX_USES  = 50;              // free uses after login / signup

  const DEFAULT_TEXT = "Log in or sign up to unlock 50 identifications.";
  const LIMIT_TEXT   = "You've used all your free identifications. Log in or sign up to continue.";

  /* ---------- load the popup's stylesheet if the page didn't ---------- */
  if (!document.querySelector('link[href*="login.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS_FILE;
    document.head.appendChild(link);
  }

  /* ---------- tiny localStorage helpers ---------- */
  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  /* ==========================================================
     FurifyAuth: shared API (also used by identifyfur.js)
     ========================================================== */
  const FurifyAuth = {
    MAX_USES,

    getUser() {
      return read(USER_KEY, null);
    },

    isLoggedIn() {
      return !!FurifyAuth.getUser();
    },

    login(user) {
      write(USER_KEY, user);
      const usage = read(USAGE_KEY, {});
      if (usage[user.email] === undefined) {   // first time: give 50 uses
        usage[user.email] = MAX_USES;
        write(USAGE_KEY, usage);
      }
    },

    logout() {
      try { localStorage.removeItem(USER_KEY); } catch {}
      window.location.reload();
    },

    getLeft() {
      const user = FurifyAuth.getUser();
      if (!user) return 0;
      const usage = read(USAGE_KEY, {});
      return usage[user.email] ?? MAX_USES;
    },

    setLeft(n) {
      const user = FurifyAuth.getUser();
      if (!user) return;
      const usage = read(USAGE_KEY, {});
      usage[user.email] = Math.max(0, n);
      write(USAGE_KEY, usage);
      FurifyAuth.refreshNav();
    },

    refreshNav() {
      const count = document.querySelector(".user-left-count");
      if (count) count.textContent = FurifyAuth.getLeft();
    },

    open: (mode, opts) => openModal(mode, opts),
    close: () => closeModal(),
  };

  window.FurifyAuth = FurifyAuth;

  /* ==========================================================
     NAVBAR: swap "Log in | Sign up" for the user menu
     ========================================================== */
  function renderNav() {
    const box = document.querySelector(".nav-auth");
    const user = FurifyAuth.getUser();
    if (!box || !user) return;

    box.innerHTML = `
      <div class="user-menu">
        <button type="button" class="user-avatar" aria-haspopup="true" aria-expanded="false"></button>
        <div class="user-dropdown" hidden>
          <p class="user-name"></p>
          <p class="user-left"><span class="user-left-count"></span> identifications left</p>
          <hr>
          <button type="button" class="user-logout">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Log out
          </button>
        </div>
      </div>`;

    const avatar   = box.querySelector(".user-avatar");
    const dropdown = box.querySelector(".user-dropdown");

    avatar.textContent = (user.name || user.email || "?").trim().charAt(0);
    box.querySelector(".user-name").textContent = user.name || user.email;
    FurifyAuth.refreshNav();

    function setOpen(open) {
      dropdown.hidden = !open;
      avatar.setAttribute("aria-expanded", String(open));
    }

    avatar.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(dropdown.hidden);
    });
    document.addEventListener("click", (e) => {
      if (!box.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
    box.querySelector(".user-logout").addEventListener("click", FurifyAuth.logout);
  }

  renderNav();

  /* ==========================================================
     THE POPUP
     ========================================================== */
  const COVER_MS = 700; // keep in sync with --cover-time in login.css
  const isMobile = window.matchMedia("(max-width: 760px)");
  const standalone = document.body.classList.contains("page-login"); // login.html opened directly

  let overlay = null;
  let card = null;
  let busy = false;
  let closing = false;
  let anims = [];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- scroll lock: nothing behind the popup can move ----------
     body overflow alone isn't enough (the home page scrolls itself with scripts),
     so wheel / touch / scroll keys are also stopped before any page script sees them. */
  const rootEl = document.documentElement;
  const SCROLL_KEYS = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
  let locked = false;
  let savedPad = "";

  // something inside the popup that can really scroll (tiny phone screens)
  function scrollsInside(el) {
    if (!overlay) return false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (!overlay.contains(n)) return false;
      const oy = getComputedStyle(n).overflowY;
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return true;
    }
    return false;
  }

  function lockScroll() {
    if (locked) return;
    locked = true;
    const gap = window.innerWidth - rootEl.clientWidth;   // scrollbar width: stops the page jumping sideways
    savedPad = rootEl.style.paddingRight;
    if (gap > 0) rootEl.style.paddingRight = gap + "px";
    rootEl.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    rootEl.classList.add("modal-open");
  }

  function unlockScroll() {
    if (!locked) return;
    locked = false;
    rootEl.style.paddingRight = savedPad;
    rootEl.style.overflow = "";
    document.body.style.overflow = "";
    rootEl.classList.remove("modal-open");
  }

  const swallow = (e) => {
    e.stopImmediatePropagation();                         // page scripts never see it
    if (!scrollsInside(e.target)) e.preventDefault();
  };
  window.addEventListener("wheel", (e) => { if (locked && !e.ctrlKey) swallow(e); }, { capture: true, passive: false });
  window.addEventListener("touchmove", (e) => { if (locked) swallow(e); }, { capture: true, passive: false });
  window.addEventListener("keydown", (e) => {
    if (!locked || !SCROLL_KEYS.includes(e.key)) return;
    if (e.target.closest && e.target.closest("input, textarea, select, button, a, [contenteditable]")) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);

  /* ---------- pop in / pop out ---------- */
  function playOpen() {
    anims.forEach((a) => a.cancel());
    anims = [];
    if (reduceMotion.matches || !card.animate) return;
    anims.push(
      overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: "ease-out", fill: "backwards" }),
      card.animate(
        [
          { opacity: 0, scale: 0.86, translate: "0 28px", filter: "blur(8px)" },
          { opacity: 1, scale: 1, translate: "0 0", filter: "blur(0px)" },
        ],
        { duration: 540, easing: "cubic-bezier(0.34, 1.45, 0.64, 1)", fill: "backwards" }   // slight overshoot = the "pop"
      )
    );
  }

  function playClose() {
    if (reduceMotion.matches || !card.animate) return Promise.resolve();
    anims.forEach((a) => a.cancel());
    const out = card.animate(
      [
        { opacity: 1, scale: 1, translate: "0 0" },
        { opacity: 0, scale: 0.92, translate: "0 16px" },
      ],
      { duration: 240, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }
    );
    const fade = overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: "ease-in", fill: "forwards" });
    anims = [out, fade];
    return out.finished.catch(() => {});
  }

  const GOOGLE_ICON = `
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/>
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
    </svg>`;

  const PHONE_ICON = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>
    </svg>`;

  const SOCIAL = `
    <div class="auth-or"><span>or</span></div>
    <button type="button" class="btn-social" data-provider="Google">${GOOGLE_ICON} Continue with Google</button>
    <button type="button" class="btn-social" data-provider="Phone">${PHONE_ICON} Continue with phone</button>`;

  const MODAL_HTML = `
    <div class="auth-card" id="authCard" role="dialog" aria-modal="true"
         aria-label="Log in or sign up" data-mode="login" data-phase="idle">

      <form class="auth-form" id="loginForm" novalidate>
        <h1 class="auth-title">Log in to Furify</h1>
        <p class="auth-sub">Log in with email and password</p>
        <input class="auth-input" type="email" name="email" placeholder="Email Address" autocomplete="email" required>
        <input class="auth-input" type="password" name="password" placeholder="Password" autocomplete="current-password" required>
        <button type="button" class="auth-link" id="forgotBtn">Forgot Password?</button>
        <p class="auth-msg" role="alert"></p>
        <button type="submit" class="btn-yellow">Log in</button>
        ${SOCIAL}
        <p class="auth-switch">Don't have an account? <button type="button" data-switch="signup">Sign up</button></p>
      </form>

      <form class="auth-form" id="signupForm" novalidate>
        <h1 class="auth-title">Sign up to Furify</h1>
        <p class="auth-sub">Fill up information or use email</p>
        <input class="auth-input" type="text" name="name" placeholder="Name" autocomplete="name" required>
        <input class="auth-input" type="email" name="email" placeholder="Email Address" autocomplete="email" required>
        <input class="auth-input" type="password" name="password" placeholder="Password" autocomplete="new-password" required>
        <p class="auth-msg" role="alert"></p>
        <button type="submit" class="btn-yellow">Sign up</button>
        ${SOCIAL}
        <p class="auth-switch">Already have an account? <button type="button" data-switch="login">Log in</button></p>
      </form>

      <div class="auth-cover" id="authCover">
        <div class="cover-text for-login">
          <h2>Hello Friend!</h2>
          <p id="loginCoverText">${DEFAULT_TEXT}</p>
          <p class="cover-prompt">Don't have an account yet?</p>
          <button type="button" class="btn-yellow" data-switch="signup">Sign up</button>
        </div>
        <div class="cover-text for-signup">
          <h2>Welcome Back!</h2>
          <p>To keep connected with us please log in with your personal info.</p>
          <button type="button" class="btn-yellow" data-switch="login">Log in</button>
          <p class="cover-prompt">Already have an account?</p>
        </div>
      </div>
    </div>`;

  /* ---------- BACKEND HOOK: replace this with the real request ----------
     mode: "login" or "signup"
     data: { email, password } or { name, email, password }
     Must resolve to { user: { name, email } } or throw an Error whose
     message is shown to the user (e.g. "Wrong email or password").

     Example:
       const res = await fetch(`/api/${mode}`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(data),
       });
       if (!res.ok) throw new Error((await res.json()).message);
       return await res.json();
  ------------------------------------------------------------------------ */
  async function authRequest(mode, data) {
    // DEMO ONLY: accepts any valid-looking details
    await new Promise((resolve) => setTimeout(resolve, 700));
    const email = data.email.trim().toLowerCase();
    const name = (data.name || "").trim() || email.split("@")[0];
    return { user: { name, email } };
  }

  /* ---------- build the popup once, the first time it is needed ---------- */
  function build() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.className = "auth-overlay";
    overlay.id = "authOverlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = MODAL_HTML;
    document.body.appendChild(overlay);

    card = $("authCard");
    $("authCover").style.backgroundImage =
      `linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.2)), url("${FUR_IMAGE}")`;

    // close: click the blurred background
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    // switch between log in / sign up
    overlay.querySelectorAll("[data-switch]").forEach((btn) =>
      btn.addEventListener("click", () => switchTo(btn.dataset.switch))
    );

    handleForm($("loginForm"), "login");
    handleForm($("signupForm"), "signup");

    // BACKEND HOOK: connect Google / phone sign-in here.
    overlay.querySelectorAll(".btn-social").forEach((btn) =>
      btn.addEventListener("click", () =>
        showMessage(btn.closest("form"), `${btn.dataset.provider} sign-in isn't connected yet.`)
      )
    );

    $("forgotBtn").addEventListener("click", () =>
      showMessage($("loginForm"), "Password reset isn't available yet.")
    );
  }

  /* ---------- open / close ---------- */
  function openModal(mode = "login", opts = {}) {
    if (FurifyAuth.isLoggedIn()) return;
    build();

    // if the Identify page's "no identifications left" popup is open, hide it
    const limitModal = $("limitModal");
    if (limitModal) limitModal.hidden = true;

    $("loginCoverText").textContent = opts.limit ? LIMIT_TEXT : DEFAULT_TEXT;
    clearMessages();

    // set the starting side without animating
    card.classList.add("no-anim");
    card.dataset.mode = mode === "signup" ? "signup" : "login";
    card.dataset.phase = "idle";
    void card.offsetWidth;
    card.classList.remove("no-anim");

    closing = false;
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    lockScroll();
    playOpen();

    setTimeout(() => {
      const first = card.querySelector(`#${card.dataset.mode}Form .auth-input`);
      if (first && overlay.classList.contains("is-open")) first.focus({ preventScroll: true });
    }, 400);
  }

  function closeModal() {
    if (!overlay || closing || !overlay.classList.contains("is-open")) return;
    closing = true;

    playClose().then(() => {
      overlay.classList.remove("is-open");
      overlay.setAttribute("aria-hidden", "true");
      unlockScroll();
      closing = false;

      // login.html opened on its own has nothing behind it: go back
      if (standalone) {
        if (history.length > 1) history.back();
        else window.location.href = "index.html";
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay && overlay.classList.contains("is-open")) closeModal();
  });

  /* ---------- the slide transition ----------
     1. fur expands to cover the whole card (forms fade out)
     2. content is swapped while it is covered
     3. fur slides to the other half and the new form fades in */
  function switchTo(mode) {
    if (busy || card.dataset.mode === mode) return;
    clearMessages();

    if (isMobile.matches) {            // no slide on phones
      card.dataset.mode = mode;
      return;
    }

    busy = true;
    card.dataset.phase = "cover";

    setTimeout(() => {
      card.dataset.mode = mode;
      // wait two frames so the browser registers the swap first
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          card.dataset.phase = "idle";
        })
      );
      setTimeout(() => { busy = false; }, COVER_MS + 500);
    }, COVER_MS);
  }

  /* ---------- messages ---------- */
  function showMessage(form, text) {
    form.querySelector(".auth-msg").textContent = text;
  }

  function clearMessages() {
    if (!card) return;
    card.querySelectorAll(".auth-msg").forEach((el) => (el.textContent = ""));
  }

  /* ---------- validation ---------- */
  function validate(mode, data) {
    if (mode === "signup" && !data.name.trim()) return "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(data.email.trim())) return "Please enter a valid email address.";
    if (data.password.length < 6) return "Password must be at least 6 characters.";
    return "";
  }

  /* ---------- submit ---------- */
  function handleForm(form, mode) {
    const submitBtn = form.querySelector('button[type="submit"]');
    const label = submitBtn.textContent;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMessage(form, "");

      const data = Object.fromEntries(new FormData(form));
      const problem = validate(mode, data);
      if (problem) {
        showMessage(form, problem);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Please wait...";

      try {
        const { user } = await authRequest(mode, data);
        FurifyAuth.login(user);
        submitBtn.textContent = mode === "signup" ? "Account created!" : "Welcome back!";

        setTimeout(() => {
          if (standalone) {
            window.location.assign("identifyfur.html");
            return;
          }
          // stay on the same page: close, show the user menu, tell the page
          closeModal();
          renderNav();
          document.dispatchEvent(new CustomEvent("furify:auth-change"));
          form.reset();
          submitBtn.disabled = false;
          submitBtn.textContent = label;
        }, 700);
      } catch (err) {
        showMessage(form, err.message || "Something went wrong. Please try again.");
        submitBtn.disabled = false;
        submitBtn.textContent = label;
      }
    });
  }

  /* ==========================================================
     Any link to login.html / signup.html opens the popup instead
     (capture phase, so it also beats the page-transition script)
       login.html                     -> log in
       signup.html / login.html?mode=signup -> sign up
       ...?from=limit                 -> "you've used all your free ..."
     ========================================================== */
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const link = e.target.closest && e.target.closest("a[href]");
      if (!link) return;

      let url;
      try { url = new URL(link.getAttribute("href"), window.location.href); }
      catch { return; }

      const match = url.pathname.match(/\/(login|signup)\.html$/i);
      if (!match) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const wantsSignup =
        match[1].toLowerCase() === "signup" || url.searchParams.get("mode") === "signup";
      openModal(wantsSignup ? "signup" : "login", { limit: url.searchParams.get("from") === "limit" });
    },
    true
  );

  /* ---------- login.html opened directly: show the popup right away ---------- */
  if (standalone) {
    const params = new URLSearchParams(window.location.search);
    openModal(params.get("mode") === "signup" ? "signup" : "login", {
      limit: params.get("from") === "limit",
    });
  }
})();