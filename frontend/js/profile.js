/* ==========================================================
   pages/profile.js — fills the profile page from the logged-in user

   The user comes from FurifyAuth.getUser() (js/auth.js). Fields used:
     name      full name
     email     email address
     photo     (optional) profile picture URL, e.g. from Google sign-in
     provider  (optional) "Google" if they signed in with Google
   For Google sign-in, the backend/login code just needs to call:
     FurifyAuth.login({ name, email, photo, provider: "Google" })
   ========================================================== */
(() => {
  const $ = (id) => document.getElementById(id);
  const auth = window.FurifyAuth;

  const view = $("profileView");
  const locked = $("profileLocked");

  const GOOGLE_G = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>`;
  const MAIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`;

  const initials = (user) => {
    const parts = (user.name || user.email || "?").trim().split(/\s+/).filter(Boolean);
    const first = (parts[0] || "?")[0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  };

  // photo if there is one (and it loads), otherwise the initials
  function fillAvatar(el, user) {
    el.textContent = "";
    const photo = user.photo || user.picture;
    if (!photo) { el.textContent = initials(user); return; }
    const img = new Image();
    img.alt = "";
    img.referrerPolicy = "no-referrer";                // Google photos need this
    img.onerror = () => { img.remove(); el.textContent = initials(user); };
    img.src = photo;
    el.appendChild(img);
  }

  function render() {
    const user = auth && auth.getUser();
    view.hidden = !user;
    locked.hidden = !!user;
    if (!user) return;

    const name = user.name || "Not set";
    const isGoogle = String(user.provider || "").toLowerCase() === "google";
    const hasPhoto = !!(user.photo || user.picture);

    $("profileSub").textContent = isGoogle
      ? "Your name, email and photo come from your Google account."
      : "Your name and email come from your Furify account.";

    fillAvatar($("profileAvatar"), user);
    fillAvatar($("profileMini"), user);
    $("profileName").textContent = name;
    $("profileEmail").textContent = user.email || "";
    $("rowName").textContent = name;
    $("rowEmail").textContent = user.email || "Not set";
    $("rowPhoto").textContent = hasPhoto ? (isGoogle ? "Google profile picture" : "Profile picture") : "Initials avatar";

    $("profileChip").innerHTML = isGoogle ? `${GOOGLE_G} Signed in with Google` : `${MAIL} Signed in with email`;
    $("profileNote").textContent = isGoogle
      ? "Changes you make in your Google account show up here automatically."
      : "This is the name and email you signed up with.";

    // identifications left
    const left = auth.getLeft();
    const max = auth.MAX_USES || 30;
    $("rowTokens").textContent = `${left} of ${max}`;
    requestAnimationFrame(() => {
      $("tokenFill").style.width = Math.max(0, Math.min(100, (left / max) * 100)) + "%";
    });
  }

  if (!auth) {                      // auth.js didn't load: show the safe "not logged in" state
    view.hidden = true;
    locked.hidden = false;
    return;
  }

  $("logoutBtn").addEventListener("click", () => auth.logout());
  $("lockedLogin").addEventListener("click", () => auth.open("login"));
  $("lockedSignup").addEventListener("click", () => auth.open("signup"));
  document.addEventListener("furify:auth-change", render);   // they logged in from the popup on this page

  render();
})();