#!/usr/bin/env node
// tools/qa-projectiles.mjs — 전 타워의 발사체가 실제로 그려지는가
//
// 왜 필요한가 (2026-08-12 실측):
//   projectileRenderer.js의 switch가 정의되지 않은 메서드 9개를 호출하고 있었다.
//   메테오·독·기절·그물·멀티샷·금광·파쇄기·궁극·황금 — 살 수 있는 타워 20종 중 9종.
//   throw가 ctx.save()와 ctx.restore() 사이에서 터져 그 프레임의 나머지 렌더까지
//   통째로 중단됐는데, 게임 루프가 예외를 삼키고 계속 돌아 아무도 눈치채지 못했다.
//   기존 게이트 어디에도 "발사체가 그려지는가"를 보는 항목이 없었다.
//
// 검사 방법: 정적 분석(호출 vs 정의) + 실제 브라우저에서 타워를 전부 지어 발사시키고
//           콘솔 예외를 센다. 정적 분석만으로는 런타임 인자 오류를 못 잡는다.
//
// 사용: node tools/qa-projectiles.mjs [포트=8830]   (정적 서버는 스스로 띄운다)

import puppeteer from "puppeteer";
import { TOWER_STATS } from "../gameData.js";

const PORT = Number(process.argv[2]) || 8830;
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

// ── ① 정적 분석: 호출되는 this._drawX 가 전부 정의돼 있는가 ──
console.log("\n[① 정적 분석 — 호출 vs 정의]");
{
  const src = readFileSync(new URL("../projectileRenderer.js", import.meta.url), "utf8");
  const called = new Set([...src.matchAll(/this\.(_draw[A-Za-z0-9_]+)\s*\(/g)].map((m) => m[1]));
  const defined = new Set([...src.matchAll(/^ {2}(_draw[A-Za-z0-9_]+)\s*\(/gm)].map((m) => m[1]));
  const missing = [...called].filter((k) => !defined.has(k));
  ok(missing.length === 0, `호출되지만 정의 없는 메서드 ${missing.length}개${missing.length ? " → " + missing.join(", ") : ""}`);
  ok(called.size >= 20, `발사체 그리기 분기 ${called.size}종`);
}

// ── ② 런타임: 실제로 타워를 짓고 쏘게 해서 예외를 센다 ──
// ⚠️ v9: 상위 등급(특수·궁극·전설) 타워를 함께 지으면 그들이 몬스터를 **먼저 다 지워서**
//    나머지 타워는 사거리에 표적이 들어오기 전에 웨이브가 끝난다. 그러면 "관측된 발사체
//    종류"가 실행마다 2~7종으로 요동쳐 게이트가 운을 재게 된다(v9 이전에도 4~5종으로 흔들렸다).
//    런타임 검사의 목적은 "여러 타워가 실제로 쏘는가"이므로 과잉 화력을 빼고 잰다 —
//    빠진 상위 등급은 아래 ③ 결정적 전수 렌더가 어차피 100% 덮는다.
const OVERKILL = new Set(["ultimate", "transcendent", "golden", "silver", "copper"]);
const BUYABLE = Object.entries(TOWER_STATS)
  .filter(([k, s]) => !s.isRandom && s.targetType && s.targetType !== "none" && !OVERKILL.has(k))
  .map(([k]) => k);

const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

const errors = [];
page.on("console", (m) => {
  const t = m.text();
  if (/is not a function|TypeError|프레임 예외/.test(t)) errors.push(t.slice(0, 160));
});
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 160)));

try {
  // ⚠️ howto 키는 {never:true} 여야 한다. {hide:true}는 무시돼 모달이 뜬 채로 남고,
  //    그러면 page.click 이 모달에 막혀 게임이 시작조차 안 된 화면을 재는 헛게이트가 된다.
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem("mathcastle:howto", JSON.stringify({ never: true })); } catch {}
  });
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 40000 });
  await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="5-1"]').click());
  await page.waitForFunction(() => window.__mathcastle?.getState().gameRunning === true, { timeout: 60000 });

  console.log(`\n[② 런타임 — 타워 ${BUYABLE.length}종 전수 발사]`);

  // 타워를 종류별로 하나씩 짓는다 (경로 인접 타일에)
  // ⚠️ 아무 타일에나 지으면 안 된다. 배치 타일 197개 중 대부분은 길에서 멀어
  //    사거리 안에 몬스터가 안 들어오고, 그러면 "발사체 0개"인 헛검사가 된다(실측).
  //    길에 가장 가까운 타일부터 채운다.
  const built = await page.evaluate((types) => {
    const M = window.__mathcastle;
    const path = M.qaPathPoints();
    const tiles = [...document.querySelectorAll(".placement-tile")]
      .map((el) => {
        const x = parseInt(el.style.left) + 20, y = parseInt(el.style.top) + 20;
        let best = Infinity;
        for (const p of path) {
          const d = (p.x - x) ** 2 + (p.y - y) ** 2;
          if (d < best) best = d;
        }
        return { x, y, d: best };
      })
      .sort((a, b) => a.d - b.d);
    const out = [];
    types.forEach((t, i) => {
      const tile = tiles[i];
      if (!tile) return;
      M.qaPlaceTowerAt(t, tile.x, tile.y);
      out.push(t);
    });
    return { requested: types.length, towers: M.getState().towers, out };
  }, BUYABLE);
  ok(built.towers >= BUYABLE.length * 0.8,
    `타워 ${built.towers}/${BUYABLE.length}종 배치 (배치 실패는 타일 부족)`);

  // 몬스터를 불러 실제로 발사시킨다
  await page.evaluate(() => {
    window.__mathcastle.qaSetWave(12);
    document.getElementById("startWaveBtn").click();
  });

  // 발사체는 수백 ms 만에 날아가 사라진다 — 1초 간격 폴링으로는 대부분 놓친다.
  // 페이지 안에서 매 프레임 표본을 뜬다.
  await page.evaluate(() => {
    window.__seen = new Set();
    window.__maxP = 0;
    const raf = window.requestAnimationFrame.bind(window);
    const tick = () => {
      const p = window.__mathcastle.qaGetProjectiles();
      window.__maxP = Math.max(window.__maxP, p.length);
      p.forEach((x) => window.__seen.add(x.type));
      raf(tick);
    };
    raf(tick);
  });
  await new Promise((r) => setTimeout(r, 15000));
  const { maxProjectiles, types } = await page.evaluate(() => ({
    maxProjectiles: window.__maxP,
    types: [...window.__seen],
  }));

  ok(maxProjectiles > 0, `동시 발사체 최대 ${maxProjectiles}개 (0이면 아무도 쏘지 않은 헛검사)`);
  ok(types.length >= 5,
    `실제 플레이에서 관측된 발사체 ${types.length}종: ${types.slice(0, 12).join(", ")} ` +
    `(과잉 화력 타워 ${[...OVERKILL].length}종 제외 — 기준 ≥5)`);

  const renderErrors = errors.filter((e) => /is not a function|프레임 예외/.test(e));
  ok(renderErrors.length === 0,
    `실제 플레이 20초 중 렌더 예외 ${renderErrors.length}건${renderErrors.length ? " → " + renderErrors[0] : ""}`);

  // ── ③ 결정적 전수 검사 ──
  // 어떤 타워가 언제 쏘는지는 운에 달려 있어 실플레이만으로는 분기 전수를 못 태운다.
  // 렌더러를 직접 호출해 24개 분기를 전부 그려 본다. 실패하면 폴백 경고가 남는다.
  console.log("\n[③ 결정적 전수 — 발사체 분기 24종 직접 렌더]");
  const src = readFileSync(new URL("../projectileRenderer.js", import.meta.url), "utf8");
  const dispatch = src.slice(src.indexOf("_dispatchProjectile"), src.indexOf("renderSpellEffect("));
  const caseTypes = [...dispatch.matchAll(/case "([^"]+)":/g)].map((m) => m[1]);
  ok(caseTypes.length >= 20, `switch에서 추출한 발사체 타입 ${caseTypes.length}종`);

  const sweep = await page.evaluate((t) => window.__mathcastle.qaRenderAllProjectiles(t), caseTypes);
  ok(sweep.failures.length === 0,
    `전수 렌더 실패 ${sweep.failures.length}건 / ${sweep.tested}종${sweep.failures.length ? " → " + sweep.failures[0].slice(0, 100) : ""}`);

  const state = await page.evaluate(() => window.__mathcastle.getState());
  ok(state.gameRunning === true, `20초 뒤에도 게임 실행 중 (웨이브 ${state.currentWave}, 몬스터 ${state.monsters})`);

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
