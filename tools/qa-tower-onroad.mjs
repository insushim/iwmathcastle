#!/usr/bin/env node
// tools/qa-tower-onroad.mjs — 타워가 길 위에 걸터앉지 않는지 실측
// ① 새로 지은 타워가 길과 겹치지 않는가
// ② 창 크기가 바뀌어 길이 옮겨가도(=예전 세이브 불러오기와 같은 상황)
//    타워가 길 한복판에 남지 않고 빈 칸으로 이사하는가
// 사용: node tools/qa-tower-onroad.mjs [포트]

import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "screenshots");
const PORT = Number(process.argv[2]) || 8957;
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
let pass = 0, fail = 0;
const check = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`    ✅ ${n}${d ? " — " + d : ""}`); }
  else { fail++; console.log(`    ❌ ${n}${d ? " — " + d : ""}`); }
};

// 페이지 안에서 "길 위에 있는 타워" 수를 센다.
// 기준 = 길이 보이는 폭의 절반 + 타워 스프라이트 절반의 60%.
// (스프라이트가 길 테두리에 살짝 걸치는 것까지 잡으면 과검출이라 60%로 완화)
const countOnRoad = (page) =>
  page.evaluate(() => {
    const h = window.__mathcastle;
    const L = h.qaLayout();
    const half = (L.roadWidth + Math.round(18 * L.scale)) / 2;
    const limit = half + 20 * 0.6 * L.scale;
    const pts = h.qaPathPoints();
    const bad = [];
    for (const t of h.qaTowers()) {
      let minD = Infinity;
      for (const p of pts) {
        const dx = t.x - p.x, dy = t.y - p.y;
        const d = dx * dx + dy * dy;
        if (d < minD) minD = d;
      }
      if (Math.sqrt(minD) < limit) bad.push({ x: t.x, y: t.y, d: Math.round(Math.sqrt(minD)) });
    }
    return { total: h.qaTowers().length, bad, limit: Math.round(limit) };
  });

try {
  console.log("[타워가 길 위에 앉지 않는가]");

  for (const [w, h, name] of [[1440, 900, "desktop"], [905, 360, "galaxy-real"], [844, 390, "phone-land"]]) {
    console.log(`\n  ▸ ${name} (${w}×${h})`);
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    await seedSkipHowTo(page);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 });
    await wait(700);
    await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="4-1"]')?.click());
    await wait(3200);
    await page.evaluate(() => {
      const h = window.__mathcastle;
      h.qaAddGold(9000);
      h.qaPlaceTowers("copper", 10);
      h.qaPlaceTowers("ice", 6);
    });
    await wait(600);

    const fresh = await countOnRoad(page);
    check("새로 지은 타워가 길과 안 겹침", fresh.bad.length === 0,
      `${fresh.total}기 중 ${fresh.bad.length}기 겹침 (기준 ${fresh.limit}px)`);

    // 창 크기 변경 → 길이 옮겨간다 (= 예전 세이브를 새 레이아웃에서 여는 상황)
    await page.setViewport({ width: Math.round(w * 0.78), height: Math.round(h * 0.8) });
    await wait(1400);
    const after = await countOnRoad(page);
    check("길이 옮겨가도 타워가 길에 안 남음", after.bad.length === 0,
      `${after.total}기 중 ${after.bad.length}기 겹침${after.bad.length ? " " + JSON.stringify(after.bad.slice(0, 3)) : ""}`);
    check("리사이즈로 타워가 사라지지 않음", after.total === fresh.total,
      `${fresh.total} → ${after.total}기`);

    await page.screenshot({ path: join(SHOTS, `onroad-${name}.png`) });
    await page.close();
  }
} catch (e) {
  fail++;
  console.log("  ❌ 예외:", e.message);
} finally {
  console.log(`\n결과: ${pass} PASS · ${fail} FAIL`);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
}
