const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const root = join(__dirname, "../frontend");
function worker(network, write) {
  const handlers = {};
  const stored = new Map();
  const calls = [];
  const context = vm.createContext({
    self: {
      location: { origin: "https://furify.example" },
      addEventListener(type, fn) { handlers[type] = fn; },
    },
    caches: {
      async open() {
        return {
          async match(request) { return stored.get(request.url); },
          async put(request, response) {
            if (write) return write(request, response);
            stored.set(request.url, response);
          },
          async add(url) {
            const address = new URL(url, "https://furify.example").href;
            const response = await network({ url: address, method: "GET" });
            if (!response.ok) throw Error("cannot precache");
            stored.set(address, response);
          },
        };
      },
    },
    fetch(request) { calls.push(request.url); return network(request); },
    URL,
    Response,
  });
  vm.runInContext(readFileSync(join(root, "sw.js"), "utf8"), context);
  function request(path, method = "GET") {
    const url = new URL(path, "https://furify.example");
    const req = { url: url.href, method, mode: "navigate" };
    let result;
    const lifetime = [];
    handlers.fetch({ request: req, respondWith(p) { result = p; }, waitUntil(p) { lifetime.push(p); } });
    return result && Promise.resolve(result);
  }
  async function install() {
    const tasks = [];
    handlers.install({ waitUntil(promise) { tasks.push(promise); } });
    await Promise.all(tasks);
  }
  return { request, install, stored, calls };
}

test("first installation saves the landing page for an offline launch", async () => {
  let online = true;
  const app = worker(() => online ? Promise.resolve(new Response("home")) : Promise.reject(Error("offline")));
  await app.install();
  online = false;
  assert.equal(await (await app.request("/")).text(), "home");
});

test("network-first refreshes an existing page and serves it offline", async () => {
  let online = true;
  const app = worker(() => online ? Promise.resolve(new Response("fresh", { status: 200 })) : Promise.reject(Error("offline")));
  assert.equal(await (await app.request("/index.html")).text(), "fresh");
  assert.equal(app.stored.size, 1);
  online = false;
  assert.equal(await (await app.request("/index.html")).text(), "fresh");
});

test("API, Turnstile, Supabase, and non-GET requests never enter the cache", async () => {
  const app = worker(() => Promise.resolve(new Response("private")));
  for (const url of [
    "/api/predict", "/api/guest-history", "/api/guest-history?user=1",
    "/cdn-cgi/challenge-platform/scripts/jsd/main.js",
    "https://challenges.cloudflare.com/turnstile/v0/api.js",
    "https://dcxhatflnbpfoiijomts.supabase.co/auth/v1/user",
  ]) {
    assert.equal(app.request(url), undefined);
  }
  assert.equal(app.request("/index.html", "POST"), undefined);
  assert.equal(app.stored.size, 0);
});

test("unsuccessful responses are not cached", async () => {
  const app = worker(() => Promise.resolve(new Response("missing", { status: 404 })));
  assert.equal((await app.request("/missing.html")).status, 404);
  assert.equal(app.stored.size, 0);
});

test("network response is not delayed by caching large assets", async () => {
  const app = worker(() => Promise.resolve(new Response("video")), () => new Promise(() => {}));
  const result = await Promise.race([
    app.request("/assets/video/indexBackground.sharp.mp4").then(() => "served"),
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 50)),
  ]);
  assert.equal(result, "served");
});
