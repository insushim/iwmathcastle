#!/usr/bin/env node
// tools/qa-spells.mjs — 마법 10종 실동작 E2E (헤드리스)
// 게임 시작 → 웨이브 가동 → 마법사 Lv10 설정 → 10종 전부 시전 → 콘솔 에러 0건 확인
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8933;
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
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("Failed to load resource") && !m.text().toLowerCase().includes("firebase")) errors.push(m.text()); });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });
await page.click('.difficulty-btn[data-difficulty="5-1"]');
await new Promise((r) => setTimeout(r, 1500));
await page.click("#startWaveBtn");
await new Promise((r) => setTimeout(r, 3000)); // 몬스터 스폰 대기

const SPELLS = ["fireball", "frostNova", "chainLightning", "teleport", "blackHole", "meteorShower", "timeStop", "guardianLight", "tornado", "judgment"];
const results = await page.evaluate(async (spells) => {
  const h = window.__mathcastle;
  if (!h) return { error: "QA 훅 없음" };
  h.qaSetWizardLevel(10);
  const out = [];
  for (const key of spells) {
    const before = h.getState();
    try {
      await h.qaCastSpell(key);
      await new Promise((r) => setTimeout(r, 350));
      const after = h.getState();
      out.push({ key, ok: true, monstersBefore: before.monsters, monstersAfter: after.monsters, castleHp: after.castleHealth });
    } catch (e) {
      out.push({ key, ok: false, err: String(e) });
    }
  }
  return { out, state: h.getState() };
}, SPELLS);

let fail = 0;
if (results.error) { console.log("❌", results.error); fail++; }
else {
  for (const r of results.out) {
    if (r.ok) console.log(`  ✅ ${r.key} 시전 OK (몬스터 ${r.monstersBefore}→${r.monstersAfter}, 성HP ${r.castleHp})`);
    else { console.log(`  ❌ ${r.key}: ${r.err}`); fail++; }
  }
}
if (errors.length) { console.log("콘솔/페이지 에러:", errors.slice(0, 5)); fail++; }
console.log(fail === 0 ? "\n✅ SPELLS E2E PASS (10/10, 에러 0)" : `\n❌ FAIL (${fail})`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
