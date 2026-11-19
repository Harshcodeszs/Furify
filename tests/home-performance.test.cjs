const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "../frontend/js/pages/home.js"), "utf8");
const start = source.indexOf("function syncHeroVideoMotion(");
const end = source.indexOf("\n  const heroVideo", start);
const context = vm.createContext({});
if (start !== -1 && end !== -1) {
  vm.runInContext(source.slice(start, end), context);
}

test("reduced motion pauses the background video", () => {
  const video = {
    paused: false,
    pause() { this.paused = true; },
    play() { throw Error("must not play"); },
  };
  context.syncHeroVideoMotion(video, { matches: true });
  assert.equal(video.paused, true);
});

test("normal motion resumes a paused background video", () => {
  let plays = 0;
  const video = { paused: true, play() { plays++; return Promise.resolve(); } };
  context.syncHeroVideoMotion(video, { matches: false });
  assert.equal(plays, 1);
});

test("autoplay rejection does not break the page", async () => {
  const video = { paused: true, play() { return Promise.reject(Error("autoplay denied")); } };
  context.syncHeroVideoMotion(video, { matches: false });
  await new Promise((resolve) => setImmediate(resolve));
});

const stageStart = source.indexOf("function dogStageVisibility(");
const stageEnd = source.indexOf("\n  }\n", stageStart) + "\n  }".length;
const stageContext = vm.createContext({});
if (stageStart !== -1 && stageEnd >= stageStart) {
  vm.runInContext(source.slice(stageStart, stageEnd), stageContext);
}

test("desktop dog stage starts intro when enough of the section enters the viewport", () => {
  // A normal desktop scroll can leave only part of the stage in view.
  assert.equal(stageContext.dogStageVisibility({ top: 90, bottom: 990, height: 900 }, 720), "start");
  assert.equal(stageContext.dogStageVisibility({ top: 510, bottom: 1410, height: 900 }, 720), "start");
});

test("dog stage does not reset during a partial scroll and resets after leaving view", () => {
  assert.equal(stageContext.dogStageVisibility({ top: 600, bottom: 1500, height: 900 }, 720), "wait");
  assert.equal(stageContext.dogStageVisibility({ top: -950, bottom: -50, height: 900 }, 720), "reset");
});

test("the dog image requests eagerly instead of depending on its offscreen animation", () => {
  const html = readFileSync(join(__dirname, "../frontend/index.html"), "utf8");
  const tag = html.match(/<img\b[^>]*\bid="dogImg"[^>]*>/)?.[0];
  assert.ok(tag);
  assert.match(tag, /loading="eager"/);
});
