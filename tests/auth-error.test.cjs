const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "../frontend/js/auth.js"), "utf8");
const start = source.indexOf("  function mapAuthError(msg) {");
const end = source.indexOf("  async function authRequest", start);
assert.ok(start >= 0 && end > start, "auth error mapper must be present");
const functionSource = source.slice(start, end);

function loadMapper() {
  const logged = [];
  const context = vm.createContext({
    console: { error: (...args) => logged.push(args) },
  });
  vm.runInContext(`${functionSource}; globalThis.mapAuthError = mapAuthError;`, context);
  return { mapAuthError: context.mapAuthError, logged };
}

test("auth error mapping logs raw detail and returns unrecognized messages", () => {
  const { mapAuthError, logged } = loadMapper();
  const raw = "Database error saving new user: profile insert denied by RLS";

  assert.equal(mapAuthError(raw), raw);
  assert.deepEqual(logged, [["Supabase authentication error:", raw]]);
});

test("auth error mapping retains friendly login messages without misstating password requirements", () => {
  const { mapAuthError, logged } = loadMapper();

  assert.equal(mapAuthError("Invalid login credentials"), "Incorrect email or password.");
  assert.equal(mapAuthError("Password should be at least 12 characters"), "Password should be at least 12 characters");
  assert.equal(logged.length, 2);
});
