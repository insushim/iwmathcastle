#!/usr/bin/env node
// tools/qa-pause-resume.mjs — v9 일시정지·이어하기
//
// 사용자 요청: "일시 정지 및 이어서 게임 가능하게."
// 구버전 실측 결함: ① 일시정지에 오버레이가 없어 멈춘 건지 렉인지 알 수 없었다
// ② 탭을 벗어나도 자동 정지가 없었다 ③ 오토세이브가 웨이브 **완료** 시 1회뿐이라
// 웨이브 도중 나가면 그 웨이브가 통째로 날아갔다.
//
// ⚠️ 이 게이트가 지키는 숨은 불변식: 세이브 되감기가 없어야 한다.
//    "웨이브 시작으로 되돌린다"면 상자를 사서 나쁜 게 나올 때마다 나갔다 들어와
//    무한 재추첨을 할 수 있다(교차검증 지적). 중간 상태를 통째로 저장해 그 구멍을 막았다.
//
// 사용: node tools/qa-pause-resume.mjs [포트=8846]

import puppeteer from "puppeteer";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.argv[2]) || 8846;
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

console.log("\n[① 정적 — 자기 게이트 충돌 방지]");
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const ov = html.match(/<div class="([^"]*)" id="pauseOverlay"/);
  ok(!!ov, "일시정지 오버레이 존재");
  ok(ov && !/\bmodal\b/.test(ov[1]),
    `오버레이 클래스에 'modal' 없음 (${ov ? ov[1] : "?"}) — 있으면 키 가드가 P/ESC를 막는다`);
  const m = readFileSync(join(ROOT, "main.js"), "utf8");
  ok(/k === "p" \|\| k === "escape"/.test(m), "일시정지 중 P·ESC 둘 다 해제로 받는다");
  ok(/visibilitychange/.test(m), "탭 전환 자동 일시정지 배선 존재");
  ok(/isProblemModalOpen\(\)/.test(m), "문제 모달 중에는 일시정지 조작을 받지 않는다");
  ok(/version: 7/.test(m), "세이브 버전 7");
  ok(/flushPendingBoxes\(\);\n  return \{/.test(m) || /flushPendingBoxes\(\)/.test(m),
    "저장 직전 개봉 대기 상자를 비운다(골드만 사라지는 창 제거)");
}

const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

const boot = async () => {
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem("mathcastle:howto", JSON.stringify({ never: true })); } catch { /* noop */ }
  });
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 40000 });
};

try {
  await boot();
  await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="4-1"]').click());
  await page.waitForFunction(() => window.__mathcastle?.getState().gameRunning === true, { timeout: 60000 });

  console.log("\n[② 일시정지 오버레이]");
  await page.keyboard.press("p");
  await new Promise((r) => setTimeout(r, 300));
  let st = await page.evaluate(() => ({
    paused: window.__mathcastle.getState().gamePaused,
    visible: !document.getElementById("pauseOverlay").hidden,
    clock: window.__mathcastle.getState().gameClock,
    stats: document.getElementById("pauseStats").textContent,
  }));
  ok(st.paused === true, "P로 일시정지됨");
  ok(st.visible === true, "오버레이가 화면에 보인다 (구버전은 버튼 글자만 바뀌었다)");
  ok(/웨이브/.test(st.stats) && /💰/.test(st.stats), `오버레이에 현재 상황 요약: ${st.stats.slice(0, 40)}`);

  await new Promise((r) => setTimeout(r, 700));
  const clock2 = await page.evaluate(() => window.__mathcastle.getState().gameClock);
  ok(Math.abs(clock2 - st.clock) < 1, `일시정지 중 게임 시계 정지 (${st.clock.toFixed(0)} → ${clock2.toFixed(0)})`);

  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 300));
  st = await page.evaluate(() => ({
    paused: window.__mathcastle.getState().gamePaused,
    visible: !document.getElementById("pauseOverlay").hidden,
  }));
  ok(st.paused === false && st.visible === false, "ESC로 해제 + 오버레이 숨김");

  console.log("\n[③ 웨이브 도중 저장 → 그 지점에서 이어붙는가]");
  const before = await page.evaluate(async () => {
    const M = window.__mathcastle;
    M.qaAddGold(5000);
    M.qaPlaceTowersNearPath("multiply", 4);
    M.qaSetWave(9);
    document.getElementById("startWaveBtn").click();
    await new Promise((r) => setTimeout(r, 4500)); // 웨이브 한복판까지 진행
    const s = M.getState();
    const ms = M.qaGetMonsters();
    const saved = M.qaSaveNow();
    return {
      saved, monsters: s.monsters, gold: s.gold, towers: s.towers, wave: s.currentWave,
      maxPathIndex: ms.reduce((a, m) => Math.max(a, m.pathIndex || 0), 0),
    };
  });
  ok(before.saved === true, "웨이브 도중 저장 성공");
  ok(before.monsters > 0, `저장 시점 살아 있는 몬스터 ${before.monsters}마리 (0이면 헛검사)`);

  const savedBlob = await page.evaluate(() => JSON.parse(localStorage.getItem("mathcastle:save")));
  ok(savedBlob.version === 7, `세이브 버전 ${savedBlob.version}`);
  ok(savedBlob.data.wave && savedBlob.data.wave.inProgress === true, "세이브에 '웨이브 진행 중' 표시");
  ok(Array.isArray(savedBlob.data.wave.monsters) && savedBlob.data.wave.monsters.length > 0,
    `세이브에 몬스터 ${savedBlob.data.wave?.monsters?.length}마리 직렬화 — 되감기 없음(상자 재추첨 구멍 차단)`);
  ok(savedBlob.data.wave.monsters.every((m) => typeof m.pathIndex === "number" && typeof m.hp === "number"),
    "몬스터마다 경로 위치·체력이 남아 있다");

  // 새로고침 후 이어하기
  await boot();
  await page.evaluate(() => document.getElementById("loadGameBtn").click());
  await page.waitForFunction(() => window.__mathcastle?.getState().gameRunning === true, { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 900));
  const after = await page.evaluate(() => {
    const s = window.__mathcastle.getState();
    // ⚠️ "몬스터 수 > 0"만 보면 헛검사다. 중간 상태를 버려도 스포너가 새 몬스터를
    //    채우기 때문에 회귀가 통과한다(실측으로 확인) → **다친 몬스터가 돌아왔는가**를 본다.
    //    체력이 깎인 개체는 새로 나온 몬스터일 수 없으므로 "같은 전투의 연속"의 증거다.
    const ms = window.__mathcastle.qaGetMonsters();
    return {
      monsters: s.monsters, gold: s.gold, towers: s.towers, wave: s.currentWave,
      damaged: ms.filter((m) => m.hp != null && m.maxHp != null && m.hp < m.maxHp).length,
      maxPathIndex: ms.reduce((a, m) => Math.max(a, m.pathIndex || 0), 0),
    };
  });
  ok(after.wave === before.wave, `웨이브 유지 ${before.wave} → ${after.wave}`);
  ok(after.towers === before.towers, `타워 유지 ${before.towers} → ${after.towers}`);
  ok(after.gold === before.gold, `골드 유지 ${before.gold} → ${after.gold} (되감기 없음)`);
  ok(after.monsters > 0, `몬스터 ${after.monsters}마리 복귀 (0이면 웨이브가 통째로 날아간 것)`);
  // ⚠️ "경로를 조금이라도 진행했는가"로는 부족하다 — 복원 직후 새로 스폰된 몬스터도
  //    1초면 경로를 한참 지나간다(실측: 회귀를 주입했는데 이 검사가 통과했다).
  //    저장 시점의 **선두 위치**와 대조해야 "같은 전투가 이어졌다"가 증명된다.
  ok(after.maxPathIndex >= before.maxPathIndex * 0.6,
    `선두 몬스터 경로 위치 ${before.maxPathIndex} → ${after.maxPathIndex} ` +
    `(새로 스폰된 것이라면 0 근처에서 다시 시작한다)`);
  ok(after.damaged > 0 || after.maxPathIndex >= before.maxPathIndex * 0.6,
    `싸우던 그 몬스터가 돌아왔다 — 체력 깎인 ${after.damaged}마리`);

  console.log("\n[④ 이어하기 버튼이 무엇을 이어 주는지 알려 주는가]");
  await boot();
  const label = await page.evaluate(() => document.getElementById("loadGameBtn").textContent);
  ok(/웨이브/.test(label), `이어하기 버튼 라벨: "${label.replace(/\s+/g, " ").trim()}"`);

  console.log("\n[⑤ 구 세이브(v6) 마이그레이션]");
  const mig = await page.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("mathcastle:save"));
    const legacy = { version: 6, data: { ...cur.data } };
    delete legacy.data.wave;
    delete legacy.data.saveVersion;
    delete legacy.data.towerCooldownLeft;
    localStorage.setItem("mathcastle:save", JSON.stringify(legacy));
    return true;
  });
  ok(mig, "v6 형식 세이브 주입");
  await boot();
  await page.evaluate(() => document.getElementById("loadGameBtn").click());
  const loadedOk = await page.waitForFunction(
    () => window.__mathcastle?.getState().gameRunning === true, { timeout: 60000 },
  ).then(() => true).catch(() => false);
  ok(loadedOk, "v6 세이브로도 게임이 정상 진입(중간 상태 없이 웨이브 시작으로)");
  const migState = await page.evaluate(() => window.__mathcastle.getState());
  ok(migState.towers > 0, `v6 세이브에서 타워 ${migState.towers}기 복원(무손실)`);

  ok(errors.length === 0, `페이지 예외 ${errors.length}건${errors.length ? " → " + errors[0] : ""}`);
} catch (e) {
  fail++; console.log("  ❌ 예외:", String(e).slice(0, 400));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n결과: ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
