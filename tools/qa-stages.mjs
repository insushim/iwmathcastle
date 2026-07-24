#!/usr/bin/env node
// tools/qa-stages.mjs — 스테이지 시스템 E2E (헤드리스)
// ① 첫 플레이: 난이도 클릭 → 스테이지 모달 없이 바로 시작
// ② 웨이브 5(스테이지 1 마지막) 클리어 → 체크포인트 기록 (currentWave=6, 타워 포함)
// ③ 재접속 → 난이도 클릭 → 스테이지 선택 모달 표시
// ④ 스테이지 2 선택 → 웨이브 6부터, 타워·골드 그대로 복원
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8935;
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

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
};

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });

// ① 첫 플레이 — 스테이지 모달 없이 바로 시작
await page.click('.difficulty-btn[data-difficulty="4-1"]');
await new Promise((r) => setTimeout(r, 1500));
const firstPlay = await page.evaluate(() => ({
  stageModalVisible: getComputedStyle(document.getElementById("stageSelectModal")).display !== "none",
  gameStarted: !!window.__mathcastle,
}));
check("첫 플레이: 스테이지 모달 없이 바로 시작", firstPlay.gameStarted && !firstPlay.stageModalVisible);

// ② 웨이브 5 셋업 → 클리어 → 체크포인트 기록
await page.evaluate(() => {
  const h = window.__mathcastle;
  h.qaAddGold(5000);
  h.qaPlaceTowers("multiply", 8);
  h.qaPlaceTowers("ice", 2);
  h.qaSetWave(5);
});
await page.click("#startWaveBtn");

// 웨이브 완료(체크포인트 기록)까지 폴링 — 최대 90초
let checkpoint = null;
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  checkpoint = await page.evaluate(() => {
    try {
      const j = JSON.parse(localStorage.getItem("mathcastle:stages"));
      return j && j.data && j.data["4-1"] ? j.data["4-1"] : null;
    } catch { return null; }
  });
  if (checkpoint) break;
}
check("스테이지 1 클리어 → 체크포인트 기록", !!checkpoint);
if (checkpoint) {
  check("최고 스테이지 = 2", checkpoint.highest === 2, `실측 ${checkpoint.highest}`);
  const cp2 = checkpoint.checkpoints["2"];
  check("체크포인트 웨이브 = 6 (스테이지 2 시작)", cp2 && cp2.currentWave === 6, `실측 ${cp2 && cp2.currentWave}`);
  check("체크포인트에 타워 10기 보존", cp2 && Array.isArray(cp2.towers) && cp2.towers.length === 10, `실측 ${cp2 && cp2.towers && cp2.towers.length}`);
}

// ③ 재접속 — 난이도 클릭 시 스테이지 선택 모달
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });
await page.click('.difficulty-btn[data-difficulty="4-1"]');
await new Promise((r) => setTimeout(r, 800));
const reopen = await page.evaluate(() => {
  const modal = document.getElementById("stageSelectModal");
  const btns = [...document.querySelectorAll(".stage-btn")].map((b) => b.className);
  return { visible: getComputedStyle(modal).display !== "none", btns };
});
check("재접속: 스테이지 선택 모달 표시", reopen.visible);
await page.screenshot({ path: join(ROOT, "screenshots", "stage-select.png") });
check("스테이지 버튼 2개 (1 클리어 + 2 도전)", reopen.btns.length === 2, `실측 ${reopen.btns.length}`);
check("마지막 버튼 = 도전(frontier)", reopen.btns[1] && reopen.btns[1].includes("frontier"));

// ④ 스테이지 2 선택 → 웨이브 6·타워 복원
await page.evaluate(() => [...document.querySelectorAll(".stage-btn")].pop().click());
await new Promise((r) => setTimeout(r, 2000));
const resumed = await page.evaluate(() => {
  const h = window.__mathcastle;
  const s = h ? h.getState() : null;
  return s ? { wave: s.wave ?? s.currentWave, towers: s.towers, gold: s.gold } : null;
});
check("스테이지 2 시작: 게임 재개", !!resumed);
if (resumed) {
  check("웨이브 6부터 재개", resumed.wave === 6, `실측 ${resumed.wave}`);
  check("타워 10기 그대로 복원 (사라지지 않음)", resumed.towers === 10, `실측 ${resumed.towers}`);
}

// ⑤ 게임오버 → "스테이지부터 다시" — 체크포인트는 살아있고 버튼으로 즉시 재개
await page.evaluate(() => window.__mathcastle.qaForceGameOver());
await new Promise((r) => setTimeout(r, 800));
const overState = await page.evaluate(() => ({
  modalVisible: getComputedStyle(document.getElementById("gameOverModal")).display !== "none",
  retryLabel: document.getElementById("retryStageBtn").textContent,
  stagesKept: !!localStorage.getItem("mathcastle:stages"),
}));
check("게임오버 모달 표시", overState.modalVisible);
check("재도전 버튼 라벨에 현재 스테이지", overState.retryLabel.includes("스테이지 2"), `실측 "${overState.retryLabel}"`);
check("게임오버 후에도 체크포인트 유지", overState.stagesKept);

await page.click("#retryStageBtn");
await new Promise((r) => setTimeout(r, 2500));
const retried = await page.evaluate(() => {
  const s = window.__mathcastle.getState();
  return { wave: s.currentWave, towers: s.towers, castleHp: s.castleHealth, running: s.gameRunning };
});
check("재도전: 웨이브 6·타워 10기·성 체력 복원", retried.wave === 6 && retried.towers === 10 && retried.castleHp > 0, JSON.stringify(retried));

if (errors.length) { console.log("콘솔/페이지 에러:", errors.slice(0, 5)); fail++; }
console.log(`\n${fail === 0 ? "✅ STAGES E2E PASS" : "❌ FAIL"} (${pass} PASS / ${fail} FAIL)`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
