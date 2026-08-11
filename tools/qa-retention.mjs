#!/usr/bin/env node
// tools/qa-retention.mjs — "내일 또 올 이유"가 코드 안에 실제로 있는가
//
// v7 실측:
//   · "오늘의 시드"(전국 공통 웨이브 조성)는 있었지만 화면에 한 글자도 안 나왔다 —
//     가장 값싼 재방문 훅을 절반쯤 만들어 놓고 아이에게 안 보여주고 있었다.
//   · 업적 진행이 판마다 0으로 리셋됐다. 웨이브 8~10에서 자주 죽는 아이는
//     "타워 30개 건설"에 조금씩 가까워지는 감각을 전혀 못 느꼈다.
//   · 학습 피드백(정답률·취약유형·오답노트)이 게임오버 화면에만 있었다.
//     잘하는 아이는 30분을 해도 자기가 뭘 틀렸는지 볼 기회가 없었다.
//   · 랜덤 상자 확률이 코드에만 있고 아이에겐 안 보였다.
//
// 사용: node tools/qa-retention.mjs [포트=8850]

import puppeteer from "puppeteer";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as daily from "../dailyQuest.js";

const PORT = Number(process.argv[2]) || 8850;
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

// ── ① 오늘의 도전 규칙 ──
console.log("\n[① 오늘의 도전]");
{
  const a = daily.todayQuests("2026-08-12");
  const b = daily.todayQuests("2026-08-12");
  const c = daily.todayQuests("2026-08-13");
  ok(a.length === 3, `하루 도전 ${a.length}개`);
  ok(JSON.stringify(a.map((q) => q.id)) === JSON.stringify(b.map((q) => q.id)),
    "같은 날이면 항상 같은 도전 (새로고침해도 안 바뀐다)");
  ok(JSON.stringify(a.map((q) => q.id)) !== JSON.stringify(c.map((q) => q.id)),
    "날이 바뀌면 다른 도전");
  ok(new Set(a.map((q) => q.id)).size === 3, "같은 도전이 중복되지 않는다");

  // 여러 날을 돌려 도전 풀이 골고루 쓰이는지
  const seen = new Set();
  for (let d = 1; d <= 28; d++) daily.todayQuests(`2026-09-${String(d).padStart(2, "0")}`).forEach((q) => seen.add(q.id));
  ok(seen.size >= 6, `28일간 등장한 서로 다른 도전 ${seen.size}종 (같은 것만 반복되지 않는다)`);

  // 압박형 장치가 없어야 한다
  const src = readFileSync(new URL("../dailyQuest.js", import.meta.url), "utf8");
  ok(!/연속.*끊기|streak.*reset|초기화됩니다/.test(src),
    "연속 출석 압박(못 오면 초기화) 장치 없음 — 아동 대상 가드레일");
}

// ── ② 브라우저: 실제로 화면에 뜨는가 ──
const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });
const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(String(e).slice(0, 160)));

try {
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem("mathcastle:howto", JSON.stringify({ never: true })); } catch {}
  });
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 40000 });

  console.log("\n[② 메인 메뉴에 오늘의 도전이 보이는가]");
  const panel = await page.evaluate(() => {
    const p = document.getElementById("dailyPanel");
    if (!p) return null;
    return {
      visible: !p.hidden && getComputedStyle(p).display !== "none",
      items: [...p.querySelectorAll(".daily-item")].map((li) => li.textContent.trim()),
      count: document.getElementById("dailyCount")?.textContent,
      note: document.getElementById("dailyNote")?.textContent,
      inViewport: p.getBoundingClientRect().top < innerHeight,
    };
  });
  ok(panel !== null, "오늘의 도전 패널이 DOM에 있다");
  ok(panel?.visible, "패널이 화면에 보인다");
  ok(panel?.items.length === 3, `도전 항목 ${panel?.items.length}개: ${panel?.items.join(" / ")}`);
  ok(/0\/3/.test(panel?.count || ""), `달성 표시 "${panel?.count}"`);
  ok((panel?.note || "").length > 5, `안내 문구: "${panel?.note}"`);

  console.log("\n[③ 학습 기록 화면 — 게임오버 없이 접근 가능한가]");
  const report = await page.evaluate(() => {
    document.getElementById("showReportBtn").click();
    const m = document.getElementById("reportModal");
    return {
      open: m.classList.contains("show"),
      summary: document.getElementById("reportSummary")?.textContent,
      units: [...document.querySelectorAll("#reportUnits .unit-row")].map((r) => r.textContent.trim()),
      review: document.getElementById("reportReview")?.textContent.slice(0, 40),
    };
  });
  ok(report.open, "메인 메뉴에서 학습 기록이 열린다(게임을 지지 않아도)");
  ok(report.units.length >= 5, `단원별 성취도 ${report.units.length}줄 — 예: ${report.units[0]}`);
  ok((report.summary || "").length > 5, `요약: "${report.summary}"`);

  console.log("\n[④ 업적 진행률]");
  await page.evaluate(() => { document.getElementById("closeReportBtn").click(); });
  const ach = await page.evaluate(() => {
    // 진행 기록을 심고 업적 목록을 다시 그린다
    localStorage.setItem("mathcastle:achbest", JSON.stringify({ wave: 7, towers: 12, bossKills: 2 }));
    location.reload();
  });
  void ach;
  await page.waitForFunction(() => !!document.getElementById("showAchievementsBtn"), { timeout: 20000 });
  const achRows = await page.evaluate(() => {
    document.getElementById("showAchievementsBtn").click();
    return [...document.querySelectorAll(".achievement-item")].map((el) => ({
      name: el.querySelector(".achievement-name")?.textContent,
      prog: el.querySelector(".ach-num")?.textContent || null,
      unlocked: el.classList.contains("unlocked"),
    }));
  });
  const withProg = achRows.filter((r) => r.prog);
  ok(achRows.length >= 15, `업적 ${achRows.length}개 표시`);
  ok(withProg.length >= 10, `진행 수치가 보이는 미해금 업적 ${withProg.length}개 — 예: ${withProg[0]?.name} ${withProg[0]?.prog}`);
  ok(withProg.some((r) => /^(?!0 \/)/.test(r.prog || "")), `실제 진행이 반영된다 (예: ${withProg.map((r) => r.prog).find((p) => !p.startsWith("0 /"))})`);

  console.log("\n[⑤ 랜덤 상자 확률 공개]");
  const probs = await page.evaluate(async () => {
    const g = await import("./gameData.js");
    const ui = await import("./ui.js");
    ui.showTowerInfoTooltip(g.TOWER_STATS.random_medium, 100, 100);
    const t = document.getElementById("tower-info-tooltip");
    return { text: t.textContent, visible: getComputedStyle(t).display !== "none" };
  });
  ok(probs.visible, "랜덤 상자 툴팁이 뜬다");
  ok(/\d+\.\d%/.test(probs.text), `확률이 숫자로 보인다: "${probs.text.slice(0, 80)}"`);
  ok(/전설/.test(probs.text), "가장 낮은 등급(전설) 확률까지 공개된다");

  console.log("\n[⑥ 자바스크립트 오류]");
  ok(jsErrors.length === 0, `오류 ${jsErrors.length}건${jsErrors.length ? " → " + jsErrors[0] : ""}`);

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
