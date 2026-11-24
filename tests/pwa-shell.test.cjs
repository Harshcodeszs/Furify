const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const frontend = join(__dirname, "../frontend");
const pageNames = ["index", "identifyfur", "history", "about", "login", "profile"];
const read = (path) => readFileSync(join(frontend, path), "utf8");

test("installed launches go to the real scanner and precache it", () => {
  assert.equal(JSON.parse(read("manifest.json")).start_url, "/identifyfur.html");
  assert.match(read("sw.js"), /cache\.add\(["']\/identifyfur\.html["']\)/);
});

test("all existing routes load the same shell without removing their website navbar", () => {
  for (const name of pageNames) {
    const html = read(`${name}.html`);
    assert.match(html, /class="navbar"/, name);
    assert.match(html, /css\/pwa-shell\.css/, name);
    assert.match(html, /js\/pwa-shell\.js/, name);
  }
  assert.match(read("index.html"), /viewport-fit=cover/);
});

test("shell CSS is isolated to installed mode and accommodates safe areas", () => {
  const css = read("css/pwa-shell.css");
  assert.match(css, /@media\s*\(display-mode:\s*standalone\)/);
  assert.match(css, /html\.pwa-standalone/);
  assert.match(css, /min-height:\s*100vh/);
  assert.match(css, /min-height:\s*100dvh/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /padding-bottom:\s*max\(12px,\s*env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /user-select:\s*none/);
  assert.match(css, /\.modal-card,\s*html\.pwa-standalone \.result-dialog\s*\{[^}]*max-height:\s*calc\(100dvh/);
  assert.match(css, /html\.pwa-standalone \.pwa-app-bar \.logo\s*\{[^}]*background:\s*transparent/);
  assert.match(css, /html\.pwa-standalone \.pwa-app-bar \.logo-tagline\s*\{[^}]*color:\s*var\(--ink\)/);
  assert.match(css, /html\.pwa-standalone \.pwa-app-bar \.logo-name\s*\{[^}]*color:\s*var\(--white\)/);
  assert.match(css, /html\.pwa-standalone \.pwa-app-bar \.logo-fy\s*\{[^}]*color:\s*var\(--yellow\)/);
  assert.match(css, /html\.pwa-standalone \.auth-overlay\s*\{[^}]*z-index:\s*200/);
});

test("shell does nothing in an ordinary browser and detects iOS home-screen mode", () => {
  const source = read("js/pwa-shell.js");
  for (const installed of [false, true]) {
    let callbacks = 0;
    const classes = [];
    vm.runInNewContext(source, {
      window: { navigator: { standalone: installed }, matchMedia: () => ({ matches: false }) },
      document: {
        documentElement: { classList: { add(value) { classes.push(value); } } },
        addEventListener() { callbacks++; },
      },
    });
    assert.deepEqual(classes, installed ? ["pwa-standalone"] : []);
    assert.equal(callbacks, installed ? 1 : 0);
  }
});

test("shell uses the existing navigation routes, never demo history or a fifth tab", () => {
  const source = read("js/pwa-shell.js");
  for (const path of ["index.html", "identifyfur.html", "history.html", "about.html"]) {
    assert.ok(source.includes(path), path);
  }
  assert.doesNotMatch(source, /#demo|Recent scans|\/api\/predict/);
});

test("standalone Home keeps its real sections without desktop page-snap gestures", () => {
  const css = read("css/pwa-shell.css");
  const script = read("js/pages/home.js");
  assert.match(css, /html\.pwa-standalone \.tips-section/);
  assert.match(css, /html\.pwa-standalone \.how-it-works/);
  assert.match(css, /html\.pwa-standalone \.cta-section/);
  assert.match(script, /addEventListener\("wheel", \(e\) => \{\s*if \(installedApp\) return;/);
  assert.match(script, /addEventListener\("touchmove", \(e\) => \{\s*if \(installedApp\) return;/);
  assert.match(script, /if \(installedApp\) heroVideo\.pause\(\)/);
});

test("installed Home places its existing scan CTA before the photo tips", () => {
  let onReady;
  let moved = false;
  let bottom;
  const cta = {};
  const tips = { before(node) { moved = node === cta; } };
  const navbar = {
    querySelector(selector) {
      if (selector === ".logo") return { cloneNode() { return { className: "logo" }; } };
      if (selector === ".nav-auth") return { className: "nav-auth" };
    },
  };
  const createElement = () => ({
    children: [],
    append(node) { this.children.push(node); },
    setAttribute() {},
    addEventListener() {},
  });
  vm.runInNewContext(read("js/pwa-shell.js"), {
    window: { navigator: { standalone: true }, matchMedia: () => ({ matches: false }), FurifyAuth: { isLoggedIn: () => true } },
    document: {
      documentElement: { classList: { add() {} } },
      addEventListener(name, callback) { if (name === "DOMContentLoaded") onReady = callback; },
      querySelector(selector) {
        return { ".navbar": navbar, ".cta-section": cta, ".tips-section": tips }[selector];
      },
      createElement,
      body: { prepend() {}, append(node) { bottom = node; } },
    },
    location: { pathname: "/index.html" },
    history: { length: 1 },
  });
  onReady();
  assert.equal(moved, true);
  assert.equal(bottom.children.length, 4);
  assert.deepEqual(bottom.children.map((item) => item.href), [
    "index.html", "identifyfur.html", "history.html", "about.html",
  ]);
});

test("installed Home presents all six original photo tips as one accessible list", () => {
  const html = read("index.html");
  const tips = html.split('class="tips-section"')[1].split('class="how-it-works"')[0];
  const css = read("css/pwa-shell.css");
  assert.match(tips, /<h2 class="pwa-tips-title">Photo tips<\/h2>/);
  assert.equal((tips.match(/class="tip-card"/g) || []).length, 6);
  assert.equal((tips.match(/class="pwa-tip-icon" aria-hidden="true"/g) || []).length, 6);
  assert.match(tips, /Clear, Well-Lit Photos/);
  assert.match(tips, /Simple Background/);
  assert.match(css, /html\.pwa-standalone \.tips-grid\s*\{[^}]*background:\s*var\(--white\)/);
  assert.match(css, /html\.pwa-standalone \.tip-card:not\(:last-child\)/);
  assert.match(css, /html\.pwa-standalone \.tips-image\s*\{[^}]*display:\s*none/);
});

test("installed Home shows the existing scan CTA as a compact side-by-side card", () => {
  const html = read("index.html");
  const css = read("css/pwa-shell.css");
  const cta = html.split('class="cta-section"')[1].split('class="footer"')[0];
  assert.match(cta, /Ready to Identify Your Fur's Breed\?/);
  assert.match(cta, /href="identifyfur\.html">Get Started<\/a>/);
  assert.match(css, /html\.pwa-standalone \.cta-card\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(css, /html\.pwa-standalone \.cta-card\s*\{[^}]*background:\s*var\(--blue\)/);
  assert.match(css, /html\.pwa-standalone \.cta-card \.btn\s*\{[^}]*border-radius:\s*999px/);
  assert.match(css, /html\.pwa-standalone \.cta-card \.cta-note\s*\{[^}]*display:\s*none/);
  assert.match(css, /html\.pwa-standalone\.js \.cta-card\.reveal,[\s\S]*?html\.pwa-standalone\.js \.cta-card \.reveal\s*\{[^}]*opacity:\s*1/);
  assert.match(css, /html\.pwa-standalone \.paw-trail\s*\{[^}]*display:\s*none/);
});

test("installed Scan moves its existing photo buttons beneath verification without cloning them", () => {
  let onReady;
  let moved;
  const controls = { id: "original-photo-controls" };
  const identify = { before(node) { moved = node; } };
  const navbar = {
    querySelector(selector) {
      if (selector === ".logo") return { cloneNode() { return { className: "logo" }; } };
      if (selector === ".nav-auth") return { className: "nav-auth" };
    },
  };
  vm.runInNewContext(read("js/pwa-shell.js"), {
    window: { navigator: { standalone: true }, matchMedia: () => ({ matches: false }), FurifyAuth: { isLoggedIn: () => true } },
    document: {
      documentElement: { classList: { add() {} } },
      addEventListener(name, callback) { if (name === "DOMContentLoaded") onReady = callback; },
      querySelector(selector) {
        return { ".navbar": navbar, ".dropzone-actions": controls, ".identify-action": identify }[selector];
      },
      createElement() {
        return { className: "", append() {}, setAttribute() {}, addEventListener() {} };
      },
      body: { prepend() {}, append() {} },
    },
    location: { pathname: "/identifyfur.html" },
    history: { length: 1 },
  });
  onReady();
  assert.equal(moved, controls);
  const html = read("identifyfur.html");
  assert.equal((html.match(/class="cf-turnstile"/g) || []).length, 1);
  assert.equal((html.match(/id="cameraBtn"/g) || []).length, 1);
  assert.equal((html.match(/id="uploadBtn"/g) || []).length, 1);
});

test("installed Scan preserves photo selection and result actions while styling the frame", () => {
  const html = read("identifyfur.html");
  const css = read("css/pwa-shell.css");
  assert.match(html, /<h1 class="pwa-scan-title">Identify Fur<\/h1>/);
  assert.match(html, /id="dropzoneEmpty"/);
  assert.match(html, /id="previewImg"[^>]*hidden/);
  assert.match(html, /id="identifyBtn"[^>]*hidden/);
  assert.match(html, /id="removeBtn"[^>]*hidden/);
  assert.match(css, /html\.pwa-standalone \.dropzone\.has-photo ~ \.dropzone-actions\s*\{[^}]*display:\s*none/);
  assert.match(css, /html\.pwa-standalone \.identify \.dropzone\s*\{[^}]*border-radius:\s*2[0-9]px/);
  assert.match(css, /html\.pwa-standalone \.identify \.dropzone-actions\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /html\.pwa-standalone \.identify \.dropzone-actions #cameraBtn img\s*\{[^}]*filter:\s*brightness\(0\) invert\(1\)/);
});
