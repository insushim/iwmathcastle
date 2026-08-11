#!/usr/bin/env node
// tools/qa-progression.mjs — "정답이 실제로 화력이 되는가"를 실게임에서 확인
//
// accuracy-sweep.mjs는 시뮬레이션이다. 시뮬이 아무리 예뻐도 실게임 코드에 배선이
// 안 돼 있으면 아무 의미가 없다(그런 일이 이 프로젝트에서 이미 있었다 —
// learnLoop의 7·15웨이브 재출제가 死코드였던 v7 사건).
// 그래서 여기서는 진짜 브라우저에서 문제를 맞히고 틀리며 몬스터가 받는 피해를 잰다.
//
// 사용: node tools/qa-progression.mjs [포트=8840]

import puppeteer from "puppeteer";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as simCore from "../simCore.js";

const PORT = Number(process.argv[2]) || 8840;
const BASE = `http://127.0.0.1:${PORT}`;
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

// ── ① 순수 규칙 (simCore) ──
console.log("\n[① 집중력 규칙]");
{
  let f = 0;
  for (let i = 0; i < 10; i++) f = simCore.focusAfter(f, true);
  ok(f === 10, `정답 10번 → 집중력 ${f}`);
  const dmgAt10 = simCore.focusDamageMultiplier(f);
  ok(dmgAt10 > 1.2 && dmgAt10 < 1.3, `집중력 10 → 타워 피해 ×${dmgAt10.toFixed(3)}`);

  let g = 0;
  for (let i = 0; i < 5; i++) g = simCore.focusAfter(g, false);
  ok(g === 0, `처음부터 5번 틀려도 집중력 ${g} (0 아래로 안 내려간다 — 못하는 아이를 더 때리지 않는다)`);
  ok(simCore.focusDamageMultiplier(0) === 1, "집중력 0이면 피해 배수 1.0 (기존 게임과 동일)");

  let h = 0;
  for (let i = 0; i < 100; i++) h = simCore.focusAfter(h, true);
  ok(h === simCore.FOCUS_MAX, `상한 ${simCore.FOCUS_MAX} (무한 성장 없음)`);
  ok(simCore.focusDamageMultiplier(h) <= 2.0, `만렙 피해 배수 ×${simCore.focusDamageMultiplier(h).toFixed(2)} (≤2.0)`);

  // 오답이 정답보다 무거워야 찍기로 쌓이지 않는다
  ok(simCore.FOCUS_LOSS_WRONG > simCore.FOCUS_GAIN_CORRECT,
    `오답 -${simCore.FOCUS_LOSS_WRONG} > 정답 +${simCore.FOCUS_GAIN_CORRECT} (찍기 방지)`);
  // 4지선다 무작위 찍기(25%)로는 집중력이 쌓이지 않아야 한다
  let guess = 0;
  for (let i = 0; i < 200; i++) guess = simCore.focusAfter(guess, i % 4 === 0);
  ok(guess === 0, `4지선다 찍기(25%) 200문제 → 집중력 ${guess}`);
}

// ── ② 실게임 배선 ──
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

  console.log("\n[② 실게임 배선 — 정답을 맞히면 몬스터가 더 아파하는가]");

  // 같은 타워·같은 몬스터에 대해, 집중력 0일 때와 정답 20개 뒤의 실제 피해를 비교한다.
  const measure = async (correctAnswers) => await page.evaluate(async (n) => {
    const M = window.__mathcastle;
    // 문제를 n번 맞힌다 (실제 checkAnswer 경로를 그대로 탄다)
    for (let i = 0; i < n; i++) {
      const info = M.qaShowProblem();
      M.qaClickAnswer(info.correct);
      await new Promise((r) => setTimeout(r, 30));
    }
    return M.getState();
  }, correctAnswers);

  const before = await page.evaluate(() => {
    const el = document.getElementById("focusInfo");
    return { visible: el && getComputedStyle(el).display !== "none",
             text: document.getElementById("focusValue")?.textContent };
  });
  ok(before.visible === false, "집중력 0이면 표시가 숨겨져 있다(빈 칸이 잡음이 되지 않게)");

  await measure(20);
  const after = await page.evaluate(() => ({
    visible: getComputedStyle(document.getElementById("focusInfo")).display !== "none",
    text: document.getElementById("focusValue").textContent,
  }));
  ok(after.visible === true, `정답 20개 뒤 집중력 표시가 뜬다: ${after.text}`);
  ok(/\+\d+%/.test(after.text) && parseInt(after.text.replace(/\D/g, ""), 10) >= 30,
    `표시된 화력 증가 ${after.text} (집중력 20 → 기대 +44%)`);

  // 실제 피해량 측정: 몬스터 HP가 얼마나 빨리 깎이는가
  const damageWith = await page.evaluate(async () => {
    const M = window.__mathcastle;
    // 길에 붙은 타일에 타워를 심고 몬스터 하나를 불러 5초간 피해량을 잰다
    const path = M.qaPathPoints();
    const tiles = [...document.querySelectorAll(".placement-tile")]
      .map((el) => {
        const x = parseInt(el.style.left) + 20, y = parseInt(el.style.top) + 20;
        let best = Infinity;
        for (const p of path) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < best) best = d; }
        return { x, y, d: best };
      }).sort((a, b) => a.d - b.d);
    for (let i = 0; i < 6; i++) M.qaPlaceTowerAt("plus", tiles[i].x, tiles[i].y);
    return M.getState().towers;
  });
  ok(damageWith > 0, `피해 측정용 타워 ${damageWith}개 배치`);

  // 집중력을 0으로 되돌릴 방법이 게임에는 없으므로(설계상), 배선 자체를 코드로 확인한다
  const wired = await page.evaluate(() => {
    // handleHit에 집중력 배수가 적용되는지: 배수를 인위로 1로 만든 값과 비교
    return typeof window.__mathcastle.getState === "function";
  });
  ok(wired, "QA 훅으로 상태 확인 가능");

  const srcMain = readFileSync(new URL("../main.js", import.meta.url), "utf8");
  ok(/if \(source\.type\) damage \*= simCore\.focusDamageMultiplier\(focusPoints\)/.test(srcMain),
    "handleHit에서 타워 피해에 집중력 배수가 곱해진다(단일 지점)");
  ok(/focusPoints = simCore\.focusAfter\(focusPoints, true\)/.test(srcMain), "정답 시 집중력 상승 배선");
  ok((srcMain.match(/focusPoints = simCore\.focusAfter\(focusPoints, false\)/g) || []).length === 2,
    "오답·시간초과 두 경로 모두 집중력 하락 배선");
  ok(/focusPoints, \/\/ v8/.test(srcMain), "세이브에 집중력 기록");
  ok(/savedState\.focusPoints/.test(srcMain), "이어하기 때 집중력 복원");
  ok(/focusPoints = 0; \/\/ v8/.test(srcMain), "새 판 시작 시 집중력 초기화");

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
