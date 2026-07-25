#!/usr/bin/env node
// tools/qa-play-shot.mjs — "실제로 플레이 중인" 화면 캡처
// 빈 판이 아니라 타워를 짓고 웨이브를 돌린 상태를 봐야 몬스터·타워가
// 좁아진 길·타일에 맞는지 알 수 있다. 사용: node tools/qa-play-shot.mjs <w> <h> [라벨] [포트]

import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "screenshots");
const W = Number(process.argv[2]) || 905;
const H = Number(process.argv[3]) || 360;
const LABEL = process.argv[4] || `play-${W}x${H}`;
const PORT = Number(process.argv[5]) || 8991;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

const server = createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  const fp = join(ROOT, decodeURIComponent(p));
  if (!fp.startsWith(ROOT) || !existsSync(fp)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(fp)] || "application/octet-stream" });
  res.end(readFileSync(fp));
});
await new Promise((r, j) => { server.on("error", j); server.listen(PORT, r); });
mkdirSync(SHOTS, { recursive: true });

const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio"],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.setUserAgent("Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36");
  await page.setViewport({ width: W, height: H, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await seedSkipHowTo(page);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 });
  await wait(800);
  await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="4-1"]')?.click());
  await wait(3200);

  // 타워를 실제로 짓고 웨이브를 돌린다
  await page.evaluate(() => {
    const h = window.__mathcastle;
    h.qaAddGold(5000);
    h.qaPlaceTowers("copper", 6);
    h.qaPlaceTowers("ice", 3);
    h.qaSetWave(8);
  });
  await page.click("#startWaveBtn");
  await wait(6000); // 몬스터가 길 위로 올라올 때까지

  const m = await page.evaluate(() => {
    const st = window.__mathcastle.getState();
    const L = window.__mathcastle.qaLayout();
    // 몬스터가 길 위에 제대로 올라가 있는지 — 길 중심에서 얼마나 벗어났나
    return { state: st, roads: L.roads, roadWidth: L.roadWidth, play: L.play };
  });
  console.log(JSON.stringify(m));
  console.log("콘솔 에러:", errors.length ? errors.slice(0, 5) : "0건");
  const out = join(SHOTS, `${LABEL}.png`);
  await page.screenshot({ path: out });
  console.log("→", out);
} finally {
  await browser.close();
  server.close();
}
