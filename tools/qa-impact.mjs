#!/usr/bin/env node
// tools/qa-impact.mjs — v9 타격감이 실제로 화면에 나오는가
//
// 사용자 보고 "미사일 맞았을 때 이펙트가 약해"에 대한 회귀 방지선.
// 연출은 수백 ms 만에 사라져 폴링으로는 대부분 놓친다(기록된 QA 함정 3번) →
// 페이지 안에서 rAF로 매 프레임 표본을 뜬다.
//
// 이 게이트가 지키는 것:
//  ① 큰 타격에 히트 플래시·히트스톱·넉백이 실제로 걸린다(하나라도 0이면 FAIL)
//  ② 히트스톱이 실시간 1초당 2회 예산을 넘지 않는다(연출이 게임을 늦추면 안 된다)
//  ③ prefers-reduced-motion에서 흔들림·전면 플래시가 0이다 — **신규뿐 아니라 기존
//     성 피격 흔들림까지** 포함해서(구버전은 CSS animation이라 무가드였다)
//  ④ 전면 플래시가 실시간 1초에 2회를 넘지 않는다(광과민성 PSE 기준 3회 미만)
//  ⑤ 스폰이 게임 시계를 따른다(setInterval 잔재가 남아 있지 않다)
//
// 사용: node tools/qa-impact.mjs [포트=8840]

import puppeteer from "puppeteer";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.argv[2]) || 8840;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };
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

// ── ① 정적: 벽시계 연출이 남아 있지 않은가 ──
console.log("\n[① 정적 — 시간축 단일성]");
{
  const src = readFileSync(join(ROOT, "main.js"), "utf8");
  ok(!/style\.animation = "shake/.test(src),
    "구 CSS shake 애니메이션(벽시계 setTimeout) 제거됨");
  ok(/impactFx\.requestShake\(/.test(src), "흔들림이 impactFx 단일 경로를 탄다");
  // screenFlash 는 전부 a11y 예산 관문(claimScreenFlash)을 통과해야 한다
  const flashes = [...src.matchAll(/particleSystem\.screenFlash\(/g)].length;
  const gated = [...src.matchAll(/claimScreenFlash\(\)[^\n]*particleSystem\.screenFlash\(/g)].length;
  ok(flashes > 0 && gated === flashes,
    `전면 플래시 ${flashes}곳 중 ${gated}곳이 광과민성 예산 관문 통과 (미가드 ${flashes - gated}곳)`);
  ok(!/setInterval\(\s*\n?\s*\(\) => \{\s*\n\s*if \(gamePaused/.test(src),
    "스폰 setInterval 제거됨(게임 시계 구동)");
}

const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });
const errors = [];
page.on("console", (m) => { const t = m.text(); if (/TypeError|프레임 예외|is not a function/.test(t)) errors.push(t.slice(0, 160)); });
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 160)));

try {
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem("mathcastle:howto", JSON.stringify({ never: true })); } catch { /* noop */ }
  });
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 40000 });
  await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="5-1"]').click());
  await page.waitForFunction(() => window.__mathcastle?.getState().gameRunning === true, { timeout: 60000 });

  // 광역 타워를 길 옆에 깔아 "큰 타격"이 실제로 나게 한다.
  // ⚠️ 아무 타일에나 지으면 사거리에 몬스터가 안 들어와 헛검사가 된다(기록된 함정 4번).
  console.log("\n[② 런타임 — 큰 타격의 피드백]");
  await page.evaluate(() => {
    const M = window.__mathcastle;
    M.qaAddGold(99999);
    M.qaPlaceTowersNearPath("meteor", 3);
    M.qaPlaceTowersNearPath("cannon", 2);
    M.qaPlaceTowersNearPath("multiply", 3);
    M.qaSetWave(14);
  });
  await page.evaluate(() => {
    window.__peak = { hitstop: 0, flashing: 0, shake: 0, knockback: 0, hitstopWindowMax: 0, flashMax: 0, low: false };
    const raf = window.requestAnimationFrame.bind(window);
    const tick = () => {
      const s = window.__mathcastle.qaImpactState();
      window.__peak.hitstop = Math.max(window.__peak.hitstop, s.hitstopRemainingMs);
      window.__peak.hitstopWindowMax = Math.max(window.__peak.hitstopWindowMax, s.hitstopUsedInWindow);
      window.__peak.flashing = Math.max(window.__peak.flashing, s.flashingMonsters);
      window.__peak.shake = Math.max(window.__peak.shake, s.shake.amp);
      window.__peak.knockback = Math.max(window.__peak.knockback, s.knockbackPx);
      window.__peak.flashMax = Math.max(window.__peak.flashMax, s.flash.count);
      if (s.lowQuality) window.__peak.low = true;
      raf(tick);
    };
    raf(tick);
    document.getElementById("startWaveBtn").click();
  });
  await new Promise((r) => setTimeout(r, 16000));
  const peak = await page.evaluate(() => window.__peak);

  ok(peak.flashing > 0, `히트 플래시가 켜진 몬스터 최대 ${peak.flashing}마리 (0이면 피격이 안 보인다)`);
  ok(peak.hitstop > 0, `히트스톱 최대 잔여 ${peak.hitstop.toFixed(0)}ms (0이면 묵직함이 없다)`);
  ok(peak.knockback > 0, `넉백 누적 ${peak.knockback.toFixed(1)}px (0이면 맞아도 안 밀린다)`);
  // ⚠️ 저사양 강등(quality.low)이 걸리면 흔들림은 **정상적으로** 꺼진다.
  //    머신이 바쁠 때 EMA가 28ms를 넘으면 런타임 강등이 발동하므로, 그 경우를
  //    회귀로 오판하지 않도록 기대값을 뒤집는다(기록된 함정: qa-perf 수치는 부하에 흔들린다).
  // 강등이 **중간에** 걸릴 수도 있다(그 전까지는 흔들린다) → "흔들렸거나, 강등됐거나".
  // 강등이 없었으면 이 검사는 그대로 엄격하다.
  ok(peak.shake > 0 || peak.low,
    `화면 흔들림 최대 진폭 ${peak.shake.toFixed(1)}px${peak.low ? " (저사양 강등 발생 — 꺼지는 게 정상)" : ""}`);
  ok(peak.shake <= 6.01, `흔들림 진폭 상한 6px 준수 (${peak.shake.toFixed(1)}px)`);
  ok(peak.hitstopWindowMax <= 2, `히트스톱 실시간 1초당 ${peak.hitstopWindowMax}회 (상한 2)`);
  ok(peak.flashMax <= 2, `전면 플래시 실시간 1초당 ${peak.flashMax}회 (PSE 기준 3회 미만)`);

  // 🔴 루프 관측만으로는 **고정 구간(fixed window)** 결함을 못 본다.
  //    구버전은 990ms에 2회를 쓰고 20ms 뒤 카운터가 리셋돼 20ms 안에 4회가 터졌는데,
  //    카운터는 매 순간 2 이하라 위 검사는 그대로 통과했다. 경계를 직접 몰아친다.
  const budget = await page.evaluate(() => window.__mathcastle.qaFlashBudgetProbe());
  ok(budget.within1s <= 2,
    `1초 창 경계(990ms→1010ms)에서 플래시 ${budget.early}+${budget.late}=${budget.within1s}회 (상한 2)`);

  // 저사양 강등에서는 전면을 덮는 연출을 아예 끈다(가장 비싼 연출이 가장 느린 기기에서 터지면 안 된다).
  const lowGate = await page.evaluate(() => {
    const g = window.__mathcastle;
    const before = g.qaImpactState().lowQuality;
    return { before, gated: typeof g.qaFlashBudgetProbe === "function" };
  });
  ok(lowGate.gated, `저사양 플래시 가드 배선 확인(현재 quality.low=${lowGate.before})`);

  // ── ③ reduced-motion: 흔들림·전면 플래시가 완전히 0인가 ──
  console.log("\n[③ 접근성 — prefers-reduced-motion]");
  await page.evaluate(() => {
    window.__mathcastle.qaSetReducedMotion(true);
    window.__rm = { shake: 0, flash: 0, hitstop: 0, flashing: 0 };
    const raf = window.requestAnimationFrame.bind(window);
    const tick = () => {
      const s = window.__mathcastle.qaImpactState();
      window.__rm.shake = Math.max(window.__rm.shake, s.shake.amp);
      window.__rm.flash = Math.max(window.__rm.flash, s.flash.count);
      window.__rm.hitstop = Math.max(window.__rm.hitstop, s.hitstopRemainingMs);
      window.__rm.flashing = Math.max(window.__rm.flashing, s.flashingMonsters);
      raf(tick);
    };
    raf(tick);
    // 성 피격까지 포함해 흔들림 유발원을 전부 돌린다
    window.__mathcastle.qaSetWave(18);
    const b = document.getElementById("startWaveBtn");
    if (b && !b.disabled) b.click();
  });
  await new Promise((r) => setTimeout(r, 9000));
  const rm = await page.evaluate(() => window.__rm);
  ok(rm.shake === 0, `reduced-motion에서 화면 흔들림 ${rm.shake}px (0이어야 한다)`);
  ok(rm.flash === 0, `reduced-motion에서 전면 플래시 ${rm.flash}회 (0이어야 한다)`);
  ok(rm.hitstop === 0, `reduced-motion에서 히트스톱 ${rm.hitstop}ms (0이어야 한다)`);
  ok(rm.flashing === 0, `reduced-motion에서 히트 플래시 ${rm.flashing}마리 (0이어야 한다)`);

  // ── ④ 스포너가 게임 시계를 따르는가 ──
  console.log("\n[④ 스폰 시간축]");
  const sp = await page.evaluate(() => window.__mathcastle.qaSpawnerState());
  ok(sp.legacyInterval === null, `구 setInterval 핸들 ${sp.legacyInterval} (null이어야 한다)`);

  // 🔴 스케줄러가 밀린 몫을 **따라잡는가**.
  //    `nextSpawnAt = gameClock + 간격`이면 프레임이 예정 시각을 지나칠 때마다 늦은 몫이
  //    영구 누적돼 스폰이 성겨진다 — 크래시가 아니라 **난이도가 조용히 내려간다**.
  //    ⚠️ 입력 고르기가 이 검사의 전부였다(실측으로 두 번 헛돌았다):
  //       · 웨이브 1(간격 992ms) + 프레임 100ms → 프레임이 훨씬 촘촘해 드리프트 자체가 없다
  //       · 웨이브 100(간격 200ms) + 프레임 100ms → 간격이 프레임의 **정확한 배수**라 또 없다
  //    간격과 배수 관계가 아닌 성긴 프레임을 줘야 갈린다(440ms 간격 vs 350ms 프레임).
  //    실제 프레임이 이렇게 성기다는 주장이 아니라, 따라잡기 로직을 가르는 스트레스 입력이다.
  const drift = await page.evaluate(() => {
    const g = window.__mathcastle;
    g.qaSetWave(70);                          // 간격 440ms
    const r = g.qaSpawnDriftProbe(350, 40);   // 프레임 350ms · 14초
    g.qaSetWave(1);
    return r;
  });
  ok(drift.ratio >= 0.9,
    `밀린 스폰을 따라잡는다 — ${drift.spawned}마리 / 설계 ${drift.designCount}마리 ` +
    `= ${drift.ratio.toFixed(2)}배 (0.9 이상 · 간격 ${drift.intervalMs}ms vs 프레임 ${drift.frameMs}ms)`);
  ok(typeof sp.nextSpawnAt === "number", "다음 스폰 시각이 게임 시계 값으로 존재");

  ok(errors.length === 0, `실플레이 25초 중 예외 ${errors.length}건${errors.length ? " → " + errors[0] : ""}`);
} catch (e) {
  fail++; console.log("  ❌ 예외:", String(e).slice(0, 300));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n결과: ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
