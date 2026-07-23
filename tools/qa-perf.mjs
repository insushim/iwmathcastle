#!/usr/bin/env node
// tools/qa-perf.mjs — 웨일북 성능 실측 (DoD: CPU 4배 스로틀에서 최악 장면 30fps+)
// 최악 장면 재현: 웨이브 25 + 타워 14기 + 몬스터 대량 스폰 → 10초 FPS 측정
// 사용: node tools/qa-perf.mjs [throttle=4]
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const THROTTLE = Number(process.argv[2]) || 4;
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
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });
await page.click('.difficulty-btn[data-difficulty="4"]');
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
      const frames = [];
      let last = performance.now();
      let count = 0;
      const MAX = 600; // 최대 10초 상당
      function tick(now) {
        frames.push(now - last);
        last = now;
        if (++count >= MAX || now - start > 10000) {
          frames.sort((a, b) => a - b);
          const med = frames[Math.floor(frames.length / 2)];
          const p95 = frames[Math.floor(frames.length * 0.95)];
          resolve({
            frames: frames.length,
            medianMs: med.toFixed(1),
            p95Ms: p95.toFixed(1),
            medianFps: (1000 / med).toFixed(1),
            monsters: window.__mathcastle.getState().monsters,
            towers: window.__mathcastle.getState().towers,
          });
          return;
        }
        requestAnimationFrame(tick);
      }
      const start = performance.now();
      requestAnimationFrame(tick);
    }),
);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

console.log(`\n[성능 실측 — CPU ${THROTTLE}배 스로틀, 웨이브 25 최악 장면]`);
console.log(`  몬스터 ${result.monsters} · 타워 ${result.towers}`);
console.log(`  프레임 중앙값 ${result.medianMs}ms (${result.medianFps}fps) · p95 ${result.p95Ms}ms`);
const passed = Number(result.medianFps) >= 30;
console.log(passed ? `\n✅ PERF PASS — 30fps 이상 (${result.medianFps}fps)` : `\n❌ PERF FAIL — ${result.medianFps}fps < 30fps`);
await browser.close(); server.close();
process.exit(passed ? 0 : 1);
