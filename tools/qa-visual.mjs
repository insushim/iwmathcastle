#!/usr/bin/env node
// tools/qa-visual.mjs — 학년별 인게임 스크린샷 캡처 (시각 QA용 — Claude가 Read로 직접 검수)
import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8936;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp" };
const server = createServer((req, res) => {
  let p = req.url.split("?")[0]; if (p === "/") p = "/index.html";
  const fp = join(ROOT, p);
  if (!fp.startsWith(ROOT) || !existsSync(fp)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(fp)] || "application/octet-stream" });
  res.end(readFileSync(fp));
});
await new Promise((r) => server.listen(PORT, r));
mkdirSync(join(ROOT, "screenshots"), { recursive: true });

const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio"],
});

for (const grade of ["3-1", "5-1", "6-2"]) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });
  await page.click(`.difficulty-btn[data-difficulty="${grade}"]`);
  await new Promise((r) => setTimeout(r, 2000));
  await page.evaluate((g) => {
    const h = window.__mathcastle;
    h.qaAddGold(5000);
    h.qaPlaceTowers("multiply", 4);
    h.qaPlaceTowers("ice", 2);
    h.qaSetWave(g === 6 ? 20 : g === 5 ? 12 : 3); // 학년별 다른 웨이브 장면
  }, grade);
  await page.click("#startWaveBtn");
  await new Promise((r) => setTimeout(r, 5000));
  await page.screenshot({ path: join(ROOT, "screenshots", `visual-g${grade}.png`) });
  console.log(`  📸 visual-g${grade}.png`);
  await page.close();
}

await browser.close(); server.close();
console.log("✅ 캡처 완료");
