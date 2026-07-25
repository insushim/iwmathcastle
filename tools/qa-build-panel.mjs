#!/usr/bin/env node
// tools/qa-build-panel.mjs — 건설창(타워 선택 패널)이 화면 안에 들어오는지 실측
// 지도만 맞춰놓고 건설창을 안 보면 "탭했더니 고를 게 안 보이는" 상태를 놓친다(실측).
// 사용: node tools/qa-build-panel.mjs [포트]

import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "screenshots");
const PORT = Number(process.argv[2]) || 8955;
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

const DEVICES = [
  { name: "galaxy-real",   w: 905,  h: 360,  touch: true },
  { name: "phone-urlbar",  w: 900,  h: 310,  touch: true },
  { name: "phone-land",    w: 844,  h: 390,  touch: true },
  { name: "phone-small",   w: 740,  h: 300,  touch: true },
  { name: "tablet-land",   w: 1180, h: 820,  touch: true },
  { name: "desktop",       w: 1440, h: 900,  touch: false },
];

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

try {
  console.log("[건설창이 화면 안에 들어오는가]");
  for (const d of DEVICES) {
    console.log(`\n  ▸ ${d.name} (${d.w}×${d.h})`);
    const page = await browser.newPage();
    await page.setViewport({ width: d.w, height: d.h, isMobile: d.touch, hasTouch: d.touch, deviceScaleFactor: 2 });
    await seedSkipHowTo(page);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 });
    await wait(700);
    await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="4-1"]')?.click());
    await wait(3200);

    // 여러 타일에서 열어본다 — 맨 윗줄/맨 아랫줄이 최악 케이스다
    for (const which of ["first", "last"]) {
      const opened = await page.evaluate((w) => {
        const tiles = [...document.querySelectorAll(".placement-tile")]
          .filter((t) => t.style.display !== "none")
          .sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
        if (!tiles.length) return null;
        const t = w === "first" ? tiles[0] : tiles[tiles.length - 1];
        t.click();
        return { tileTop: Math.round(parseFloat(t.style.top)) };
      }, which);
      if (!opened) { check(`${which}: 놓을 타일 존재`, false, "타일 0개"); continue; }
      await wait(500);

      const g = await page.evaluate(() => {
        const sel = document.getElementById("towerSelector");
        if (!sel || !sel.classList.contains("show")) return { open: false };
        const r = sel.getBoundingClientRect();
        const opts = [...sel.querySelectorAll(".tower-option")];
        const vis = opts.filter((o) => {
          const b = o.getBoundingClientRect();
          return b.top >= -1 && b.bottom <= window.innerHeight + 1 && b.height > 0;
        }).length;
        // 스크롤 컨테이너 안에서 스크롤로 닿을 수 있으면 '접근 가능'
        const cont = sel.querySelector(".tower-options-container");
        const scrollable = cont ? cont.scrollHeight > cont.clientHeight + 2 : false;
        return {
          open: true,
          box: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`,
          overflowBottom: Math.round(r.bottom - window.innerHeight),
          overflowTop: Math.round(-r.top),
          total: opts.length,
          visible: vis,
          scrollable,
        };
      });

      check(`${which}: 건설창 열림`, g.open);
      if (!g.open) continue;
      check(`${which}: 화면 아래로 안 넘침`, g.overflowBottom <= 0,
        `${g.overflowBottom > 0 ? g.overflowBottom + "px 넘침" : "OK"} · ${g.box}`);
      check(`${which}: 화면 위로 안 넘침`, g.overflowTop <= 0,
        g.overflowTop > 0 ? `${g.overflowTop}px 넘침` : "OK");
      // 스크롤 없이 전부 보이거나, 스크롤로 닿을 수 있어야 한다
      check(`${which}: 타워 ${g.total}종 모두 접근 가능`,
        g.visible === g.total || g.scrollable,
        `보이는 것 ${g.visible}/${g.total}${g.scrollable ? " (스크롤 가능)" : ""}`);

      await page.screenshot({ path: join(SHOTS, `panel-${d.name}-${which}.png`) });
      await page.keyboard.press("Escape");
      await wait(300);
    }
    await page.close();
  }
} catch (e) {
  fail++;
  console.log("  ❌ 예외:", e.message);
} finally {
  console.log(`\n결과: ${pass} PASS · ${fail} FAIL  (screenshots/panel-*.png)`);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
}
