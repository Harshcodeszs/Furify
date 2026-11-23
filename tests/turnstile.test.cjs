// Run the production request function without starting the page or contacting services.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(
  join(__dirname, "../frontend/js/pages/identifyfur.js"), "utf8"
);
const start = source.indexOf("async function identifyPhoto(file)");
const end = source.indexOf("/* ==========================================================", start);
const requestFunction = source.slice(start, end);

function setup(fetch, token = "fresh-token", guest = false) {
  const resets = [];
  const widget = {};
  const stored = new Map();
  const context = vm.createContext({
    document: {
      querySelector: (selector) => selector === ".cf-turnstile" ? widget : { value: token },
    },
    window: { turnstile: { reset: (element) => resets.push(element) } },
    FormData,
    scanSource: "Upload",
    supabase: { auth: { getSession: async () => ({
      data: { session: guest ? null : { access_token: "offline-access-token" } },
    }) } },
    localStorage: {
      getItem(key) { return stored.get(key) ?? null; },
      setItem(key, value) { stored.set(key, value); },
    },
    crypto: { randomUUID: () => "test-guest-id" },
    fetch,
    MESSAGES: { notDog: "Not a dog", uncertain: "is uncertain" },
  });
  vm.runInContext(requestFunction, context);
  return { identify: context.identifyPhoto, resets, widget };
}

test("successful request sends the token and resets the widget", async () => {
  let submittedToken;
  const page = setup(async (url, options) => {
    submittedToken = options.body.get("cf_turnstile_response");
    return {
      ok: true,
      json: async () => ({
        status: "ok", breed: "Beagle", info: "Breed info",
        top3: [{ breed: "Beagle", confidence: 0.9 }],
      }),
    };
  });
  const result = await page.identify(new Blob(["image"]));
  assert.equal(submittedToken, "fresh-token");
  assert.equal(result.status, "ok");
  assert.deepEqual(page.resets, [page.widget]);
});

test("verification rejection has an actionable error and resets the widget", async () => {
  const page = setup(async () => ({
    ok: false, status: 403,
    json: async () => ({ detail: "Verification failed. Please verify again." }),
  }));
  await assert.rejects(page.identify(new Blob(["image"])), (error) => {
    assert.equal(error.code, "turnstile_missing");
    assert.match(error.message, /verify again/);
    return true;
  });
  assert.deepEqual(page.resets, [page.widget]);
});

test("network failure also resets a potentially consumed token", async () => {
  const page = setup(async () => { throw new Error("Network unavailable"); });
  await assert.rejects(page.identify(new Blob(["image"])), /Network unavailable/);
  assert.deepEqual(page.resets, [page.widget]);
});

test("missing token prevents the API request", async () => {
  let requests = 0;
  const page = setup(async () => { requests++; }, "");
  await assert.rejects(page.identify(new Blob(["image"])), (error) => {
    assert.equal(error.code, "turnstile_missing");
    return true;
  });
  assert.equal(requests, 0);
  assert.deepEqual(page.resets, [page.widget]);
});

test("missing file is rejected before fetch and resets the widget", async () => {
  let requests = 0;
  const page = setup(async () => { requests++; });
  await assert.rejects(page.identify(null), /photo|file/i);
  assert.equal(requests, 0);
  assert.deepEqual(page.resets, [page.widget]);
});

test("guest submission includes guest ID and fresh token, then resets", async () => {
  let headers;
  let submittedToken;
  const page = setup(async (url, options) => {
    headers = options.headers;
    submittedToken = options.body.get("cf_turnstile_response");
    return {
      ok: true,
      json: async () => ({
        status: "ok", breed: "Beagle", info: "Breed info",
        top3: [{ breed: "Beagle", confidence: 0.9 }],
      }),
    };
  }, "fresh-guest-token", true);
  await page.identify(new Blob(["photo"]));
  assert.equal(headers["X-Guest-Device-ID"], "guest_test-guest-id");
  assert.equal(submittedToken, "fresh-guest-token");
  assert.deepEqual(page.resets, [page.widget]);
});
