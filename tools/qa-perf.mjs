#!/usr/bin/env node
// tools/qa-perf.mjs — 웨일북 성능 실측
//
// ⚠️ 이 게이트는 한 번 헛돌았다(2026-08-21). 예전 판정 기준이 "프레임 간격 중앙값"이었는데,
//    rAF 간격은 vsync에 스냅돼서 **16.7ms 아니면 33.3ms 둘 중 하나로만** 나온다. 프레임 작업이
//    16.7ms 경계 근처면 같은 코드가 판마다 54fps↔30fps로 튀고(실측: bak 18.3/33.0/33.1,
//    fix 32.2/32.5/18.4), 개선도 악화도 이 지표로는 못 가른다. 그래서 아이들이 렉을 겪는
//    동안에도 게이트는 계속 "✅ 59.9fps"를 찍고 있었다.
//    → 그렇다고 "프레임당 JS 작업시간"만으로 갈라도 부족했다. 이 장면은 결정적이지 않다 —
//      같은 설정에서 몬스터가 17~22마리로 흔들리고, 작업량이 거기 비례해서 절대 수치가
//      함께 흔들린다(수정 전 코드가 3.40ms로 통과해 버린 실측이 있다).
//    → 그래서 **원인 상태를 직접 단언**한다. 이번 렉의 원인이었던
//      "프레임마다 getBoundingClientRect(강제 동기 레이아웃)를 부른다"는
//      장면 크기와 무관하게 0이거나 4다 — 흔들릴 여지가 없다.
//      시간 수치는 참고로 찍고, 파국(20fps 미만·JS 6ms 초과)일 때만 별도로 잡는다.
//
// 최악 장면 재현: 웨이브 25 + 타워 14기 + 몬스터 대량 스폰 → 8초 측정
// 하드웨어도 웨일북으로 신고한다(deviceMemory 4GB · 코어 2) — 안 그러면 저사양 모드가
// 켜지지 않아 실제 아이들이 도는 코드 경로를 측정하지 않게 된다.
// 사용: node tools/qa-perf.mjs [throttle=12]
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const THROTTLE = Number(process.argv[2]) || 12;
const JS_CATASTROPHE_MS = 6.0; // 파국 감지용 상한(장면이 비결정적이라 정밀 판정엔 못 씀)
const GBCR_PER_FRAME_MAX = 1.0; // 프레임당 강제 레이아웃 허용치 (수정 전 4.0 / 수정 후 ~0)
const PORT = 8934;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp" };
const server = createServer((req, res) => {
  let p = req.url.split("?")[0]; if (p === "/") p = "/index.html";
  const fp = join(ROOT, p);
  if (!fp.startsWith(ROOT) || !existsSync(fp)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(fp)] || "application/octet-stream" });
  res.end(readFileSync(fp));
});
await new Promise((r) => server.listen(PORT, r));

const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });
  await seedSkipHowTo(page);
// 웨일북 하드웨어 신고값 + 프레임당 JS 작업 계측기
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, "deviceMemory", { get: () => 4 });
  Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2 });
  const raw = window.requestAnimationFrame.bind(window);
  window.__rawRaf = raw;
  window.__frameJs = [];
  window.requestAnimationFrame = function (cb) {
    return raw(function (ts) {
      const t0 = performance.now();
      try { cb(ts); } finally { window.__frameJs.push(performance.now() - t0); }
    });
  };
  // 강제 동기 레이아웃 호출 계수기 — 이번 렉의 실제 원인을 직접 센다
  window.__gbcr = 0;
  const origRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (...a) {
    window.__gbcr++;
    return origRect.apply(this, a);
  };
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });
await page.click('.difficulty-btn[data-difficulty="4-1"]');
await new Promise((r) => setTimeout(r, 1500));

// 최악 장면 셋업: 웨이브 25, 타워 14기
await page.evaluate(() => {
  const h = window.__mathcastle;
  h.qaSetWave(25);
  h.qaPlaceTowers("multiply", 10);
  h.qaPlaceTowers("ice", 2);
  h.qaPlaceTowers("meteor", 2);
});
await page.click("#startWaveBtn");
await new Promise((r) => setTimeout(r, 6000)); // 몬스터 다수 스폰 대기

// CPU 스로틀 적용 후 FPS 측정
const cdp = await page.createCDPSession();
await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
const result = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const raf = window.__rawRaf;      // 계측기가 자기 자신을 재지 않게 원본 rAF로 돈다
      window.__frameJs.length = 0;      // 측정 구간만 남긴다
      window.__gbcr = 0;
      const frames = [];
      let last = performance.now();
      function tick(now) {
        frames.push(now - last);
        last = now;
        if (now - start > 8000) {
          frames.sort((a, b) => a - b);
          const js = window.__frameJs.slice().sort((a, b) => a - b);
          const med = frames[Math.floor(frames.length / 2)];
          resolve({
            frames: frames.length,
            medianMs: med.toFixed(1),
            p95Ms: frames[Math.floor(frames.length * 0.95)].toFixed(1),
            medianFps: (1000 / med).toFixed(1),
            jsMedian: js[Math.floor(js.length / 2)],
            jsP95: js[Math.floor(js.length * 0.95)],
            gbcrPerFrame: window.__gbcr / Math.max(1, frames.length),
            monsters: window.__mathcastle.getState().monsters,
            towers: window.__mathcastle.getState().towers,
          });
          return;
        }
        raf(tick);
      }
      const start = performance.now();
      raf(tick);
    }),
);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

console.log(`\n[성능 실측 — 웨일북 에뮬(4GB·2코어) · CPU ${THROTTLE}배 스로틀 · 웨이브 25 최악 장면]`);
console.log(`  몬스터 ${result.monsters} · 타워 ${result.towers}`);
console.log(`  참고: 프레임 간격 중앙값 ${result.medianMs}ms (${result.medianFps}fps) · p95 ${result.p95Ms}ms  ← vsync에 스냅되므로 판정에 쓰지 않는다`);
console.log(`  참고: 프레임당 JS 작업 중앙값 ${result.jsMedian.toFixed(2)}ms · p95 ${result.jsP95.toFixed(2)}ms`);
console.log(`  판정: 프레임당 강제 동기 레이아웃(getBoundingClientRect) ${result.gbcrPerFrame.toFixed(2)}회 (상한 ${GBCR_PER_FRAME_MAX})`);

const layoutOk = result.gbcrPerFrame < GBCR_PER_FRAME_MAX;
const jsOk = result.jsMedian < JS_CATASTROPHE_MS;
const fpsOk = Number(result.medianFps) >= 20;
if (!layoutOk)
  console.log(`\n❌ PERF FAIL — 렌더 루프가 프레임마다 레이아웃을 강제하고 있다 (${result.gbcrPerFrame.toFixed(2)}회/프레임).`);
if (!jsOk) console.log(`\n❌ PERF FAIL — 프레임당 JS ${result.jsMedian.toFixed(2)}ms ≥ ${JS_CATASTROPHE_MS}ms (파국)`);
if (!fpsOk) console.log(`\n❌ PERF FAIL — ${result.medianFps}fps < 20fps (파국)`);
const passed = layoutOk && jsOk && fpsOk;
if (passed)
  console.log(`\n✅ PERF PASS — 강제 레이아웃 ${result.gbcrPerFrame.toFixed(2)}회/프레임 · JS ${result.jsMedian.toFixed(2)}ms · ${result.medianFps}fps`);
await browser.close(); server.close();
process.exit(passed ? 0 : 1);
