#!/usr/bin/env node
// tools/qa-resilience.mjs — 저장·복원·예외 내성
//
// 감시 대상 (2026-08-12 감사에서 실측된 결함들):
//   ① saveGame()이 localStorage 실패를 흡수하는가 (구버전은 유일하게 try/catch가 없어
//      저장공간이 찬 기기에서 스테이지 클리어 처리까지 통째로 날아갔다)
//   ② 타워 레벨업 계산이 단일 진실원인가 — "처음부터 올린 타워"와 "저장→복원한 타워"의
//      능력치가 같은가 (구버전은 main.js와 simCore.js에 각각 구현돼 있었다)
//   ③ 마법사 업그레이드 비용이 실제 차감과 버튼 판정에서 같은가
//   ④ 전역 예외가 아이에게 보이는 안내로 이어지는가 (구버전은 콘솔에만 남았다)
//   ⑤ 체크포인트가 무한히 쌓이지 않는가
//   ⑥ 저장하는 필드 중 복원되지 않는 죽은 필드가 없는가
//
// 사용: node tools/qa-resilience.mjs [포트=8831]   (정적 서버는 스스로 띄운다)

import puppeteer from "puppeteer";
import * as simCore from "../simCore.js";
import { TOWER_STATS } from "../gameData.js";
import { MAX_CHECKPOINTS, recordCheckpoint, getProgress } from "../stageProgress.js";

const PORT = Number(process.argv[2]) || 8831;
const BASE = `http://127.0.0.1:${PORT}`;

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 정적 서버를 스스로 띄운다 — 다른 qa-*.mjs 와 같은 방식이라
// tools/qa-all.sh 가 스크립트마다 포트만 다르게 주면 그대로 돌아간다.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  const fp = join(ROOT, p);
  if (!fp.startsWith(ROOT) || !existsSync(fp)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(fp)] || "application/octet-stream" });
  res.end(readFileSync(fp));
});
await new Promise((r, j) => { server.on("error", j); server.listen(PORT, r); });


let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}`)); };

// ── ② 타워 레벨업 단일 진실원 (순수 로직 — 브라우저 불필요) ──
console.log("\n[② 타워 레벨업 계산의 단일 진실원]");
{
  // main.js recreateTower가 simCore를 쓰도록 바뀌었는지 소스에서 확인
  const { readFileSync } = await import("node:fs");
  const mainSrc = readFileSync(new URL("../main.js", import.meta.url), "utf8");
  const recreate = mainSrc.slice(mainSrc.indexOf("function recreateTower"), mainSrc.indexOf("function gameLoop"));
  ok(!/damage \* 1\.3|dps \* 1\.25/.test(recreate), "recreateTower에 레벨업 배율 리터럴 사본 없음");
  ok(/simCore\.applyTowerUpgrade/.test(recreate), "recreateTower가 simCore.applyTowerUpgrade를 쓴다");

  // 멀티샷 numTargets가 두 경로에서 같은 값이 되는지 실제로 계산
  const mk = () => ({ type: "multi-shot", ...TOWER_STATS["multi-shot"], level: 1 });
  const live = mk();
  for (let i = 1; i < 7; i++) simCore.applyTowerUpgrade(live);
  const restored = mk();
  const target = 7;
  restored.level = 1;
  while (restored.level < target) simCore.applyTowerUpgrade(restored);
  ok(live.damage === restored.damage && live.numTargets === restored.numTargets && live.range === restored.range,
    `레벨7 멀티샷: 실시간 업그레이드 dmg${live.damage}/타겟${live.numTargets} = 복원 dmg${restored.damage}/타겟${restored.numTargets}`);
  // 기본 2명 + 레벨 2·4·6에서 각각 +1 = 5명
  ok(live.numTargets === 5, `멀티샷 레벨7 동시 공격 ${live.numTargets}명 (기본 2 + 2레벨마다 +1 → 기대 5)`);
}

// ── ③ 마법사 비용 단일 진실원 ──
console.log("\n[③ 마법사 업그레이드 비용]");
{
  const { readFileSync } = await import("node:fs");
  const files = ["../main.js", "../ui.js"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8"));
  const literal = files.filter((s) => /150\s*\*\s*\w*[wW]izardLevel/.test(s)).length;
  ok(literal === 0, `main.js·ui.js에 남은 비용 리터럴 ${literal}곳`);
  ok(simCore.wizardUpgradeCost(3) === 450, `simCore.wizardUpgradeCost(3) = ${simCore.wizardUpgradeCost(3)}`);
}

// ── ⑤ 체크포인트 상한 (node에 localStorage 스텁) ──
console.log("\n[⑤ 체크포인트 무한 누적 방지]");
{
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const snap = { towers: Array.from({ length: 16 }, (_, i) => ({ type: "plus", level: 5, tile: { x: i * 40, y: 100 } })) };
  for (let stage = 1; stage <= 60; stage++) recordCheckpoint("5-1", stage, snap);
  const prog = getProgress("5-1");
  const n = Object.keys(prog.checkpoints).length;
  const bytes = JSON.stringify(store.get("mathcastle:stages") || "").length;
  ok(n <= MAX_CHECKPOINTS, `스테이지 60개 클리어 후 보관 ${n}개 (상한 ${MAX_CHECKPOINTS})`);
  ok(prog.checkpoints["60"] && !prog.checkpoints["1"], "최근 것을 남기고 오래된 것을 버린다");
  ok(bytes < 200 * 1024, `mathcastle:stages 크기 ${(bytes / 1024).toFixed(1)}KB (< 200KB)`);
  delete globalThis.localStorage;
}

// ── 브라우저 검사 ──
const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

try {
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem("mathcastle:howto", JSON.stringify({ never: true })); } catch {}
  });
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 40000 });
  await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="5-1"]').click());
  await page.waitForFunction(() => window.__mathcastle?.getState().gameRunning === true, { timeout: 60000 });

  // ── ① 저장 실패 내성 ──
  console.log("\n[① 저장 공간이 가득 찼을 때]");
  const quota = await page.evaluate(() => {
    // setItem이 항상 던지도록 바꿔 quota 초과 상황을 재현한다
    const orig = Storage.prototype.setItem;
    let threw = false;
    Storage.prototype.setItem = function (k) {
      if (String(k).startsWith("mathcastle:save")) { threw = true; throw new DOMException("QuotaExceededError"); }
      return orig.apply(this, arguments);
    };
    let crashed = null;
    try { document.getElementById("saveGameBtn").click(); }
    catch (e) { crashed = String(e); }
    Storage.prototype.setItem = orig;
    // showMessage는 .message-popup 을 body에 붙였다 3초 뒤 지운다
    const msgs = [...document.querySelectorAll(".message-popup")].map((m) => m.textContent);
    return {
      crashed, threw,
      visibleMsg: msgs.join(" | "),
      stillRunning: window.__mathcastle.getState().gameRunning,
    };
  });
  ok(quota.threw, "저장 시도가 실제로 예외를 맞았다(헛검사 방지)");
  ok(quota.crashed === null, `저장 실패가 호출자에게 전파되지 않음${quota.crashed ? " → " + quota.crashed : ""}`);
  ok(/저장 공간|저장하지 못/.test(quota.visibleMsg), `아이에게 보이는 안내: "${quota.visibleMsg.slice(0, 40)}"`);
  ok(quota.stillRunning === true, "저장이 실패해도 게임은 계속 돈다");

  // ── ⑥ 저장 필드 왕복 ──
  console.log("\n[⑥ 저장→복원 왕복]");
  const rt = await page.evaluate(() => {
    const M = window.__mathcastle;
    const tiles = [...document.querySelectorAll(".placement-tile")];
    M.qaPlaceTowerAt("multi-shot", parseInt(tiles[0].style.left) + 20, parseInt(tiles[0].style.top) + 20);
    return { towers: M.getState().towers };
  });
  ok(rt.towers > 0, `왕복 검사용 타워 ${rt.towers}개 배치`);

  const roundtrip = await page.evaluate(() => {
    document.getElementById("saveGameBtn").click();
    const raw = JSON.parse(localStorage.getItem("mathcastle:save"));
    return Object.keys(raw.data);
  });
  // initializeGame(savedState)가 실제로 읽는 키를 소스에서 추출해 대조
  const { readFileSync } = await import("node:fs");
  const mainSrc = readFileSync(new URL("../main.js", import.meta.url), "utf8");
  // ⚠️ 끝 위치를 indexOf로 잡으면 파일 앞쪽(qaMoveWizard)의 같은 문자열에 걸려
  //    시작보다 앞선 인덱스가 나오고, 슬라이스가 빈 문자열이 되어 "전부 죽은 필드"라는
  //    엉터리 통과/실패가 나온다(실측). 시작점 이후에서만 찾는다.
  // savedState는 복원 블록 밖에서도 읽힌다(loadGame이 savedState.difficulty로
  // initializeGame을 호출하고, readSavedState가 마이그레이션한다). 파일 전체에서 모은다.
  const readKeys = new Set([
    ...mainSrc.matchAll(/savedState\.([A-Za-z0-9_]+)/g),
    ...mainSrc.matchAll(/wrapped\.data\.([A-Za-z0-9_]+)/g),
    ...mainSrc.matchAll(/\bst\.([A-Za-z0-9_]+)/g),
  ].map((m) => m[1]));
  const writeOnly = roundtrip.filter((k) => !readKeys.has(k));
  ok(writeOnly.length === 0, `저장만 하고 복원하지 않는 죽은 필드 ${writeOnly.length}개${writeOnly.length ? " → " + writeOnly.join(", ") : ""}`);

  // ── ④ 전역 예외 안내 ──
  console.log("\n[④ 전역 예외 안전망]");
  const fatal = await page.evaluate(async () => {
    window.dispatchEvent(new ErrorEvent("error", { message: "테스트용 강제 오류", error: new Error("boom") }));
    await new Promise((r) => setTimeout(r, 100));
    const box = document.getElementById("fatalNotice");
    return { exists: !!box, text: box ? box.textContent.slice(0, 60) : "", hasBtn: !!box?.querySelector(".fatal-btn") };
  });
  ok(fatal.exists, `처리되지 않은 오류에 안내가 뜬다: "${fatal.text}"`);
  ok(fatal.hasBtn, "새로고침 버튼이 함께 제공된다");

  // 이미지 로드 실패로는 뜨지 않아야 한다(스프라이트 한 장 없다고 게임을 멈추면 안 됨)
  const imgFail = await page.evaluate(async () => {
    document.getElementById("fatalNotice")?.remove();
    window.__mathcastleFatalShownReset = true;
    const img = document.createElement("img");
    img.src = "/no-such-file-xyz.png";
    document.body.appendChild(img);
    await new Promise((r) => setTimeout(r, 400));
    return !!document.getElementById("fatalNotice");
  });
  ok(imgFail === false, "이미지 한 장 로드 실패로는 안내가 뜨지 않는다");

  console.log(`\n${"=".repeat(60)}\n통과 ${pass} · 실패 ${fail}`);
  await browser.close();
  server.close();
  process.exit(fail > 0 ? 1 : 0);
} catch (e) {
  console.error("\n실행 오류:", e);
  await browser.close();
  server.close();
  process.exit(2);
}
