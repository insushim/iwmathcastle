#!/usr/bin/env node
// tools/qa-shot.mjs — 임의 뷰포트 1장 캡처 + 레이아웃 실측 (반복 검증용)
// 사용: node tools/qa-shot.mjs <w> <h> [라벨] [포트]

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
const LABEL = process.argv[4] || `${W}x${H}`;
const PORT = Number(process.argv[5]) || 8961;
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

try {
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36");
  await page.setViewport({ width: W, height: H, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await seedSkipHowTo(page);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="4-1"]')?.click());
  await new Promise((r) => setTimeout(r, 3500));

  const m = await page.evaluate(() => {
    const info = document.getElementById("info-bar")?.getBoundingClientRect() ?? null;
    const bar = document.getElementById("control-bar")?.getBoundingClientRect() ?? null;
    const tiles = [...document.querySelectorAll(".placement-tile")];
    const rows = {};
    for (const t of tiles) {
      const y = Math.round(parseFloat(t.style.top));
      rows[y] = (rows[y] || 0) + 1;
    }
    const castle = document.getElementById("castle") || document.querySelector(".castle");
    const cr = castle?.getBoundingClientRect() ?? null;
    const hb = document.querySelector(".castle-health")?.getBoundingClientRect() ?? null;
    const barT = bar ? bar.top : window.innerHeight;
    return {
      hp: hb ? `${Math.round(hb.top)}~${Math.round(hb.bottom)}` : "없음",
      hpUnderBar: hb ? Math.round(hb.bottom - barT) : null,
      layout: window.__mathcastle?.qaLayout?.() ?? null,
      win: [window.innerWidth, window.innerHeight],
      infoBottom: info ? Math.round(info.bottom) : null,
      barTop: bar ? Math.round(bar.top) : null,
      playH: info && bar ? Math.round(bar.top - info.bottom) : null,
      tiles: tiles.length,
      rows: Object.entries(rows).map(([y, n]) => `y${y}:${n}`).join(" "),
      castleBox: cr ? `${Math.round(cr.left)},${Math.round(cr.top)} ${Math.round(cr.width)}×${Math.round(cr.height)}` : "없음",
      road: window.__mathcastle?.qaPathInfo?.() ?? null,
    };
  });
  console.log(JSON.stringify(m, null, 1));
  const out = join(SHOTS, `shot-${LABEL}.png`);
  await page.screenshot({ path: out });
  console.log("→", out);
} finally {
  await browser.close();
  server.close();
}
