#!/usr/bin/env node
// tools/qa-ime.mjs — 한글 입력 상태에서 단축키가 먹는지 회귀 검증
// 한글 자판이면 keydown의 e.key는 "ㄷ"/"ㅈ"으로 오고 e.code만 KeyE/KeyW로 유지된다.
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import puppeteer from "puppeteer";

const ROOT = "/Users/sim-insu/Documents/dev/iwmathsung/iwmathcastle";
const PORT = 8947;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg" };
const server = createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  const fp = join(ROOT, decodeURIComponent(p));
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
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem("mathcastle:howto", JSON.stringify({ never: true })); } catch {}
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });
await page.click('.difficulty-btn[data-difficulty="4-1"]');
await new Promise((r) => setTimeout(r, 3200));

const tile = await page.evaluate(() => {
  const t = [...document.querySelectorAll(".placement-tile")].find((e) => e.style.display !== "none");
  return t ? { x: parseInt(t.style.left), y: parseInt(t.style.top) } : null;
});
await page.evaluate((t) => window.__mathcastle.qaMoveWizard(t.x + 20 - 24, t.y + 20 - 28), tile);
await new Promise((r) => setTimeout(r, 400));

const fire = (key, code) => page.evaluate((k, c) => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: c, bubbles: true }));
}, key, code);

const shown = () => page.evaluate(() => document.getElementById("towerSelector")?.classList.contains("show") === true);

console.log("[한글 IME 단축키]");
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { if (ok) { pass++; console.log(`  \u2705 ${n}${d ? " \u2014 " + d : ""}`); } else { fail++; console.log(`  \u274c ${n}${d ? " \u2014 " + d : ""}`); } };

// 1) 영문 상태 E — 정상 동작해야 함(대조군)
await fire("e", "KeyE");
await new Promise((r) => setTimeout(r, 400));
check("영문 E로 건설창 열림(대조군)", await shown());
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })));
await new Promise((r) => setTimeout(r, 300));

// 2) 한글 상태 E — 사용자가 겪는 상황
await fire("ㄷ", "KeyE");
await new Promise((r) => setTimeout(r, 400));
check('한글 상태 E(key="ㄷ")로 건설창 열림', await shown());

// 3) 이동키도 같은 문제인지
const move = await page.evaluate(async () => {
  const before = { ...window.__mathcastle.getState() };
  const w = document.getElementById("wizard");
  const t0 = w.style.transform;
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ㅈ", code: "KeyW", bubbles: true }));
  await new Promise(r => setTimeout(r, 600));
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "ㅈ", code: "KeyW", bubbles: true }));
  return { moved: w.style.transform !== t0, t0, t1: w.style.transform };
});
check('한글 상태 W(key="ㅈ")로 마법사 이동', move.moved, `${move.t0} → ${move.t1}`);

// 4) IME 조합 중 key="Process"로 오는 경우 (일부 브라우저/OS)
// ⚠️ 3)에서 마법사를 실제로 움직였으므로 타일 위로 되돌려 놓고 검사한다.
//    안 그러면 "포커스된 타일이 없어서" 안 열리는 걸 IME 실패로 오독한다.
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })));
await page.evaluate((t) => window.__mathcastle.qaMoveWizard(t.x + 20 - 24, t.y + 20 - 28), tile);
await new Promise((r) => setTimeout(r, 500));
await fire("Process", "KeyE");
await new Promise((r) => setTimeout(r, 400));
check('IME 조합중(key="Process")에도 건설창 열림', await shown());

console.log(`\n결과: ${pass} PASS \u00b7 ${fail} FAIL`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
