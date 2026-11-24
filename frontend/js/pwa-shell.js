/* Installed-only navigation. Leave the website and its page scripts intact. */
(() => {
  if (!window.matchMedia("(display-mode: standalone)").matches && window.navigator.standalone !== true) return;
  document.documentElement.classList.add("pwa-standalone");

  document.addEventListener("DOMContentLoaded", () => {
    const navbar = document.querySelector(".navbar");
    if (!navbar) return;

    const page = location.pathname.split("/").pop() || "index.html";
    const tabs = [
      ["index.html", "Home", "home", "M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3z"],
      ["identifyfur.html", "Scan", "scan", "M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"],
      ["history.html", "History", "history", "M12 3a9 9 0 1 1-9 9m0-6v6h6m3-5v5l3 2"],
      ["about.html", "About", "about", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-10v6m0-10h.01"],
    ];
    const icon = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;

    const bar = document.createElement("header");
    bar.className = "pwa-app-bar";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "pwa-back";
    back.setAttribute("aria-label", "Go back");
    back.innerHTML = icon("M19 12H5m7-7-7 7 7 7");
    back.addEventListener("click", () => {
      if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) {
        history.back();
      } else {
        location.href = page === "identifyfur.html" ? "index.html" : "identifyfur.html";
      }
    });
    bar.append(back);

    const originalLogo = navbar.querySelector(".logo");
    if (originalLogo) {
      const logo = originalLogo.cloneNode(true);
      logo.className += " pwa-brand";
      bar.append(logo);
    }

    // Keep the same auth container so FurifyAuth.renderNav and its dropdown
    // continue to work after sign-in without duplicating authentication state.
    const account = navbar.querySelector(".nav-auth");
    if (account) {
      if (!window.FurifyAuth?.isLoggedIn()) {
        account.innerHTML = `<a href="login.html" class="pwa-account-link" aria-label="Log in or sign up">${icon("M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m8-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8z")}</a>`;
      }
      bar.append(account);
    }
    document.body.prepend(bar);

    const bottom = document.createElement("nav");
    bottom.className = "pwa-tabs";
    bottom.setAttribute("aria-label", "App navigation");
    for (const [href, label, id, path] of tabs) {
      const link = document.createElement("a");
      link.href = href;
      link.className = "pwa-tab pwa-tab-" + id;
      if (page === href) link.setAttribute("aria-current", "page");
      link.innerHTML = `${icon(path)}<span>${label}</span>`;
      bottom.append(link);
    }
    document.body.append(bottom);

    // Reuse the site's real CTA instead of inventing a standalone Home card.
    if (page === "index.html") {
      const tips = document.querySelector(".tips-section");
      const cta = document.querySelector(".cta-section");
      if (tips && cta) tips.before(cta);
    }
    if (page === "identifyfur.html") {
      const photoActions = document.querySelector(".dropzone-actions");
      const identifyActions = document.querySelector(".identify-action");
      if (photoActions && identifyActions) identifyActions.before(photoActions);
    }
  });
})();
