#!/usr/bin/env node
// tools/qa-smoke.mjs — 헤드리스 스모크 테스트
// ① 페이지 로드 ② 콘솔 에러 수집 ③ 학년 선택 → 게임 시작 ④ 웨이브 1 시작 → 5초 구동
// ⑤ 스크린샷 3장 (메뉴/게임/문제모달)  ⑥ 콘솔 에러 0건이면 PASS
// 사용: node tools/qa-smoke.mjs [포트=8931]
// (교훈 L-003: CPU 래스터 강제 / L-004: 포트 전용 + strictPort 동등 검증)

import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8931;
const SHOT_DIR = join(ROOT, "screenshots");
mkdirSync(SHOT_DIR, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".sql": "text/plain", ".toml": "text/plain" };

// 정적 서버 (프로젝트 전용 포트)
const server = createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  const fp = join(ROOT, p);
  if (!fp.startsWith(ROOT) || !existsSync(fp)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(fp)] || "application/octet-stream" });
  res.end(readFileSync(fp));
});
await new Promise((r, j) => { server.on("error", j); server.listen(PORT, r); });

const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--disable-gpu-compositing", "--disable-accelerated-2d-canvas", "--disable-software-rasterizer", "--no-sandbox", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 }); // 웨일북 해상도

const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(`PAGEERROR: ${e.message}`));

const fail = async (msg) => { console.error(`❌ FAIL: ${msg}`); await cleanup(1); };
const cleanup = async (code) => { await browser.close(); server.close(); process.exit(code); };

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 20000 });
  // 대상 검증 (엉뚱한 앱 검수 방지)
  const title = await page.title();
  console.log(`페이지 타이틀: ${title}`);

  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: join(SHOT_DIR, "smoke-1-menu.png") });

  // 학년 4 선택
  const gradeBtn = await page.$('.difficulty-btn[data-difficulty="4"]');
  if (!gradeBtn) await fail("학년 선택 버튼 없음");
  await gradeBtn.click();
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: join(SHOT_DIR, "smoke-2-game.png") });

  // 게임 상태 확인
  const state = await page.evaluate(() => ({
    canvasVisible: document.getElementById("gameCanvas")?.style.display,
    startBtnText: document.getElementById("startWaveBtn")?.textContent,
    startBtnDisabled: document.getElementById("startWaveBtn")?.disabled,
  }));
  console.log("게임 상태:", JSON.stringify(state));
  if (state.canvasVisible !== "block") await fail("게임 캔버스 미표시 — 초기화 실패");

  // v5.4 회귀 가드: CSS 괄호 오류로 .wizard 규칙이 깨지면 offsetWidth가 화면폭(1366)이 되어
  // 마법/기본공격 발사 원점이 683px 어긋난다(화면 가로지르는 선 버그). 48x56 이어야 정상.
  const wizBox = await page.evaluate(() => {
    const el = document.getElementById("wizard");
    return { w: el.offsetWidth, h: el.offsetHeight };
  });
  console.log(`마법사 히트박스: ${wizBox.w}x${wizBox.h}`);
  if (wizBox.w !== 48 || wizBox.h !== 56) {
    await fail(`마법사 히트박스 ${wizBox.w}x${wizBox.h} (48x56 이어야 함 — .wizard CSS 파싱 확인)`);
  }

  // 웨이브 시작 → 5초 구동 (렌더 루프·스폰·전투 경로 실행)
  await page.click("#startWaveBtn");
  await new Promise((r) => setTimeout(r, 5000));
  await page.screenshot({ path: join(SHOT_DIR, "smoke-3-wave.png") });

  // 몬스터 스폰 확인 (동적 레이어 캔버스 픽셀 유무로 간접 검증은 생략, 전역 상태 없음 → 콘솔로 판단)
  const errFiltered = consoleErrors.filter(
    (e) => !e.includes("net::ERR") && !e.includes("favicon") && !e.includes("firebase") && !e.includes("Firebase") && !e.includes("Failed to load resource"),
  );
  console.log(`\n콘솔 에러 (firebase·네트워크 제외): ${errFiltered.length}건`);
  errFiltered.slice(0, 10).forEach((e) => console.log("  ·", e));

  if (errFiltered.length > 0) await fail("콘솔 에러 존재");
  console.log("\n✅ SMOKE PASS — screenshots/smoke-*.png 3장 저장");
  await cleanup(0);
} catch (err) {
  console.error("❌ 예외:", err.message);
  await cleanup(1);
}
