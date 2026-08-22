#!/usr/bin/env node
// tools/qa-blessing.mjs — v9 스테이지 축복이 안전한가
//
// 축복은 v9에서 유일하게 **밸런스를 건드리는** 기능이라 방어선을 따로 둔다.
// 교차검증 3계열이 공통으로 지적한 것 두 가지를 그대로 게이트로 만든다:
//  ① 골드·상자 확률 계열이 후보에 없어야 한다.
//     - 골드 계열은 "수학을 포기해도 돈이 도는" 구조로 되돌린다(v8의 존재 이유를 깬다).
//     - 확률 계열은 ui.js가 아이에게 보여주는 고정 확률표를 거짓말로 만든다.
//  ② 아이용 문구에 백분율(%)·음수 기호·외래어(쿨다운)가 없어야 한다
//     (백분율은 5학년 2학기, 음수는 중학 과정이다).
// 그리고 축복이 **실제로 효과가 있는지**(고르면 사거리가 늘어나는가)까지 본다 —
// 없으면 "골랐는데 아무 일도 안 일어나는" 장식이 된다.
//
// 사용: node tools/qa-blessing.mjs [포트=8852]

import puppeteer from "puppeteer";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as blessing from "../blessing.js";

const PORT = Number(process.argv[2]) || 8852;
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

console.log("\n[① 금지된 축복 계열이 없는가]");
{
  const ids = blessing.BLESSINGS.map((b) => b.id);
  const banned = /gold|골드|money|drop|확률|probab|focus|집중/i;
  const bad = blessing.BLESSINGS.filter(
    (b) => banned.test(b.id) || banned.test(b.title) || banned.test(b.desc),
  );
  ok(bad.length === 0, `골드·확률·집중력 계열 축복 ${bad.length}개 (0이어야 한다)`);
  ok(ids.length >= 3, `축복 후보 ${ids.length}종`);
  const src = readFileSync(join(ROOT, "blessing.js"), "utf8");
  ok(!/RANDOM_TOWER_PROBABILITY|goldPerHit|waveGoldMultiplier|answerReward/.test(src),
    "blessing.js가 경제·확률 함수를 참조하지 않는다");
  ok(!/focusDamageMultiplier|focusAfter/.test(src), "blessing.js가 집중력 계수를 건드리지 않는다");
}

console.log("\n[② 아이용 문구 — 초등 어휘]");
{
  let violations = [];
  for (const b of blessing.BLESSINGS) {
    const text = `${b.title} ${b.desc}`;
    if (/%/.test(text)) violations.push(`${b.id}: 백분율`);
    if (/[−-]\d/.test(text)) violations.push(`${b.id}: 음수 기호`);
    if (/쿨다운|버프|딜|스탯/.test(text)) violations.push(`${b.id}: 외래어/게임용어`);
  }
  ok(violations.length === 0,
    `문구 위반 ${violations.length}건${violations.length ? " → " + violations.join(", ") : ""}`);
  ok(blessing.BLESSINGS.every((b) => b.desc.length <= 30), "설명이 한 줄로 짧다(읽기 부담)");
}

console.log("\n[③ 상한이 있는가 — 무한 성장 방지]");
{
  let st = blessing.initialState();
  for (let i = 0; i < 50; i++) st = blessing.apply(st, "range");
  ok(st.range === 4, `같은 축복 50번 적용해도 ${st.range}단계 (상한 4)`);
  ok(Math.abs(blessing.rangeMult(st) - 1.24) < 1e-9,
    `최대 사거리 배수 ${blessing.rangeMult(st).toFixed(2)}배 (과도하지 않다)`);
  // 최대치에 도달한 축복은 더 이상 제시되지 않는다
  const maxed = { range: 4, wizardSpeed: 4, heal: 4, splash: 4, freeze: 4 };
  ok(blessing.offer(maxed, () => 0.5, 3).length === 0, "전부 최대치면 더 제시하지 않는다");
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

try {
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem("mathcastle:howto", JSON.stringify({ never: true })); } catch { /* noop */ }
  });
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 40000 });
  await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="4-1"]').click());
  await page.waitForFunction(() => window.__mathcastle?.getState().gameRunning === true, { timeout: 60000 });

  console.log("\n[④ 고르면 실제로 효과가 있는가]");
  const before = await page.evaluate(() => {
    window.__mathcastle.qaAddGold(9999);
    window.__mathcastle.qaPlaceTowersNearPath("multiply", 2);
    return window.__mathcastle.qaBlessings();
  });
  ok(before.towerRanges.length >= 2, `타워 ${before.towerRanges.length}기 배치 (사거리 ${before.towerRanges.join(", ")})`);

  const opened = await page.evaluate(() => {
    window.__mathcastle.qaOpenBlessing();
    return new Promise((r) => setTimeout(() => r({
      visible: !document.getElementById("blessingOverlay").hidden,
      cards: document.querySelectorAll(".blessing-card").length,
      paused: window.__mathcastle.getState().gamePaused,
      text: document.getElementById("blessingCards").textContent,
    }), 300));
  });
  ok(opened.visible, "축복 선택 화면이 뜬다");
  ok(opened.cards === 3, `선택지 ${opened.cards}개 (3택 1)`);
  ok(opened.paused === true, "고르는 동안 게임이 멈춘다");
  ok(!/%/.test(opened.text), "화면 문구에도 백분율 없음");

  // 선택 중에는 P가 먹지 않아야 한다(고르지도 않았는데 게임이 흐르면 안 된다)
  await page.keyboard.press("p");
  await new Promise((r) => setTimeout(r, 200));
  const stillPaused = await page.evaluate(() => ({
    paused: window.__mathcastle.getState().gamePaused,
    visible: !document.getElementById("blessingOverlay").hidden,
  }));
  ok(stillPaused.paused && stillPaused.visible, "선택 중 P키로 빠져나갈 수 없다");

  const after = await page.evaluate(() => {
    window.__mathcastle.qaPickBlessing("range");
    return new Promise((r) => setTimeout(() => r(window.__mathcastle.qaBlessings()), 400));
  });
  const gained = Object.entries(after.state).find(([, v]) => v > 0);
  ok(!!gained, `축복 획득: ${gained ? gained[0] + " " + gained[1] + "단계" : "없음"}`);
  ok(after.open === false && (await page.evaluate(() => document.getElementById("blessingOverlay").hidden)),
    "고르면 화면이 닫힌다");

  if (gained && gained[0] === "range") {
    const grew = after.towerRanges.some((r, i) => r > before.towerRanges[i]);
    ok(grew, `'멀리 보는 눈'을 골랐더니 이미 서 있던 타워 사거리도 늘었다 ` +
      `(${before.towerRanges.join(",")} → ${after.towerRanges.join(",")})`);
  } else if (gained && gained[0] === "wizardSpeed") {
    ok(after.wizardCooldown < before.wizardCooldown,
      `마법사 쿨다운 ${before.wizardCooldown} → ${after.wizardCooldown}`);
  } else {
    ok(true, `카드 클릭 경로 확인(무작위로 ${gained ? gained[0] : "?"} 제시) — 효과는 ⑥에서 5종 전수 검사`);
  }

  // ⑥ 축복 5종 전수 — 무작위 offer에 기대지 않고 하나씩 강제로 걸어 실제 수치를 잰다.
  //    구버전은 range/wizardSpeed만 검사하고 나머지 3종은 무조건 통과시켰다.
  console.log("\n[⑥ 축복 5종 전수 — 실제 효과 수치 대조]");
  await page.evaluate(() => {
    const g = window.__mathcastle;
    // 사거리·광역·슬로우를 각각 관측할 수 있는 타워를 심는다.
    const pts = g.qaPathPoints();
    const a = pts[Math.floor(pts.length * 0.3)], b = pts[Math.floor(pts.length * 0.6)];
    g.qaPlaceTowerAt("ice", a.x, a.y);
    g.qaPlaceTowerAt("meteor", b.x, b.y);
  });

  const baseProbe = await page.evaluate(() => ({
    probe: window.__mathcastle.qaBlessingProbe(),
    slow: window.__mathcastle.qaSlowProbe(),
  }));
  ok(baseProbe.slow !== null, `기준 슬로우 지속 ${baseProbe.slow}ms (ice 타워 실제 피격 경로)`);
  ok(!!baseProbe.probe.byType.meteor, "광역 타워(meteor) 배치 확인");

  const CASES = [
    { id: "range", label: "멀리 보는 눈", check: (b, a) =>
        [a.probe.byType.ice.range > b.probe.byType.ice.range,
         `ice 사거리 ${b.probe.byType.ice.range} → ${a.probe.byType.ice.range}`] },
    { id: "splash", label: "넓게 퍼지는 힘", check: (b, a) =>
        [a.probe.byType.meteor.splash > b.probe.byType.meteor.splash,
         `meteor 폭발 반경 ${b.probe.byType.meteor.splash} → ${a.probe.byType.meteor.splash}`] },
    { id: "wizardSpeed", label: "빠른 주문", check: (b, a) =>
        [a.probe.wizardCooldown < b.probe.wizardCooldown,
         `마법사 쿨다운 ${b.probe.wizardCooldown} → ${Math.round(a.probe.wizardCooldown)}`] },
    { id: "freeze", label: "차가운 손길", check: (b, a) =>
        [a.slow > b.slow, `슬로우 지속 ${b.slow}ms → ${a.slow}ms`] },
    { id: "heal", label: "따뜻한 보살핌", check: (b, a) =>
        [a.probe.waveClearHeal > b.probe.waveClearHeal,
         `무피해 클리어 회복량 ${b.probe.waveClearHeal} → ${a.probe.waveClearHeal}`] },
  ];

  for (const c of CASES) {
    const b = await page.evaluate(() => ({
      probe: window.__mathcastle.qaBlessingProbe(),
      slow: window.__mathcastle.qaSlowProbe(),
    }));
    const a = await page.evaluate((id) => {
      window.__mathcastle.qaForceBlessing(id, 4);
      return {
        probe: window.__mathcastle.qaBlessingProbe(),
        slow: window.__mathcastle.qaSlowProbe(),
      };
    }, c.id);
    const [passed, detail] = c.check(b, a);
    ok(passed, `${c.label}(${c.id}) 4단계 — ${detail}`);
    await page.evaluate((id) => window.__mathcastle.qaForceBlessing(id, 0), c.id);
  }

  // 중복 누적 방지: 같은 배수를 두 번 걸어도 수치가 또 곱해지면 안 된다.
  const dup = await page.evaluate(() => {
    const g = window.__mathcastle;
    g.qaForceBlessing("range", 3);
    const once = g.qaBlessingProbe().byType.ice.range;
    g.qaForceBlessing("range", 3);
    const twice = g.qaBlessingProbe().byType.ice.range;
    g.qaForceBlessing("range", 0);
    return { once, twice };
  });
  ok(dup.once === dup.twice, `같은 축복 재적용에도 사거리 불변 ${dup.once} = ${dup.twice}`);

  // 🔴 레벨·각성 투자분이 축복 적용으로 사라지지 않아야 한다.
  //    v9 실측 회귀: TOWER_STATS에서 재계산하는 구현은 레벨10·각성6 대포의 사거리를
  //    590 → 252(42.7%)로 **깎았다** — "멀리 보는 눈"이 사거리를 줄이는 정반대 동작.
  const invest = await page.evaluate(() => {
    const g = window.__mathcastle;
    const grown = g.qaGrowTower("ice", 9, 6);
    if (!grown) return null;
    g.qaForceBlessing("range", 4);
    const blessed = g.qaBlessingProbe().byType.ice.range;
    g.qaForceBlessing("range", 0);
    return { grown: grown.range, blessed, after: g.qaBlessingProbe().byType.ice.range };
  });
  ok(invest !== null, "투자 타워(ice 레벨10·각성6) 준비");
  if (invest) {
    ok(invest.blessed > invest.grown,
      `투자분 유지 — 레벨10·각성6 사거리 ${invest.grown} → 축복 4단계 ${invest.blessed} (늘어야 한다)`);
    ok(invest.after === invest.grown,
      `축복 해제 시 원상복귀 ${invest.grown} → ${invest.after}`);
  }

  // 판 도중 새로 지은 타워에도 축복이 붙는가 (v9 회귀: 다음 스테이지 클리어까지 미적용)
  const lateBuilt = await page.evaluate(() => {
    const g = window.__mathcastle;
    g.qaForceBlessing("range", 0);
    const pts = g.qaPathPoints();
    const p = pts[Math.floor(pts.length * 0.45)];
    g.qaPlaceTowerAt("skyDestroyer", p.x, p.y);
    const plain = g.qaBlessingProbe().byType.skyDestroyer;
    if (!plain) return null;
    return { plain: plain.range, plainSplash: plain.splash };
  });
  ok(lateBuilt !== null, "무축복 기준 타워(skyDestroyer) 배치");

  const lateBlessed = await page.evaluate(() => {
    const g = window.__mathcastle;
    g.qaForceBlessing("range", 4);
    g.qaForceBlessing("splash", 4);
    const pts = g.qaPathPoints();
    const p = pts[Math.floor(pts.length * 0.75)];
    g.qaPlaceTowerAt("skyDestroyer", p.x, p.y);
    // 같은 타입이 둘이므로 byType은 마지막(=방금 지은) 타워를 가리킨다.
    const fresh = g.qaBlessingProbe().byType.skyDestroyer;
    g.qaForceBlessing("range", 0); g.qaForceBlessing("splash", 0);
    return fresh;
  });
  if (lateBuilt && lateBlessed) {
    ok(lateBlessed.range > lateBuilt.plain,
      `판 도중 지은 타워도 사거리 축복 적용 ${lateBuilt.plain} → ${lateBlessed.range}`);
    ok(lateBlessed.splash > lateBuilt.plainSplash,
      `판 도중 지은 타워도 광역 축복 적용 ${lateBuilt.plainSplash} → ${lateBlessed.splash}`);
  }

  console.log("\n[⑤ 세이브에 남는가 — 이어하기 시 축복 유지]");
  const saved = await page.evaluate(() => {
    // ⑥이 축복을 전부 0으로 되돌려 놓으므로 여기서 전제조건을 직접 세운다.
    // 앞 절의 잔여 상태에 기대면 절 순서를 바꾸는 순간 조용히 헛검사가 된다.
    window.__mathcastle.qaForceBlessing("heal", 2);
    window.__mathcastle.qaSaveNow();
    return JSON.parse(localStorage.getItem("mathcastle:save")).data.blessings;
  });
  ok(saved && Object.values(saved).some((v) => v > 0), `세이브에 축복 기록: ${JSON.stringify(saved)}`);

  ok(errors.length === 0, `페이지 예외 ${errors.length}건${errors.length ? " → " + errors[0] : ""}`);
} catch (e) {
  fail++; console.log("  ❌ 예외:", String(e).slice(0, 300));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n결과: ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
