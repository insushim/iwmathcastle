#!/usr/bin/env node
// tools/qa-ux-controls.mjs — 조작 UX 회귀 테스트
// ① 첫 실행 시 게임 방법 모달 자동 표시  ② "오늘 하루"/"다시 보지 않기" 저장 동작
// ③ 마법사가 타일 위로 가면 하이라이트 + 힌트 문구  ④ E로 건설창 열림(Space는 공격 전용)
// ⑤ 숫자키로 타워 실제 건설  ⑥ 모달·일시정지·조합키 가드  ⑦ Enter로 웨이브 시작  ⑧ 콘솔 에러 0건
// 사용: node tools/qa-ux-controls.mjs [포트=8937]

import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8937;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp" };

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
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shown = (sel) => page.evaluate((s) => document.querySelector(s)?.classList.contains("show") === true, sel);

try {
  console.log("[조작 UX 회귀]");

  // ① 첫 방문 — 게임 방법이 저절로 떠야 한다
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 });
  await wait(1200);
  check("첫 방문 시 게임 방법 자동 표시", await shown("#howToPlayModal"));

  // ② "오늘 하루 보지 않기" → 재방문 시 안 뜸
  await page.click("#howToPlayHideToday");
  await page.click("#closeHowToPlayBtn");
  await wait(300);
  check("닫으면 모달이 사라짐", !(await shown("#howToPlayModal")));
  await page.reload({ waitUntil: "networkidle0" });
  await wait(1200);
  check("'오늘 하루 보지 않기' 재방문 시 미표시", !(await shown("#howToPlayModal")));

  // 메뉴 버튼으로는 언제든 다시 열려야 한다
  await page.click("#howToPlayBtn");
  await wait(300);
  check("메뉴 '게임 방법' 버튼으로 다시 열림", await shown("#howToPlayModal"));

  // ③ "다시 보지 않기" → 저장 후 재방문에도 미표시
  await page.click("#howToPlayNeverBtn");
  await wait(200);
  const neverSaved = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("mathcastle:howto"))?.never === true; } catch { return false; }
  });
  check("'다시 보지 않기' 저장됨", neverSaved);
  await page.reload({ waitUntil: "networkidle0" });
  await wait(1200);
  check("'다시 보지 않기' 재방문 시 미표시", !(await shown("#howToPlayModal")));

  // 게임 진입
  await page.click('.difficulty-btn[data-difficulty="4-1"]');
  await wait(3000);

  // ④ 마법사를 배치 타일 위로 이동 → 하이라이트 + 힌트
  const tile = await page.evaluate(() => {
    const t = [...document.querySelectorAll(".placement-tile")].find((e) => e.style.display !== "none");
    return t ? { x: parseInt(t.style.left), y: parseInt(t.style.top) } : null;
  });
  check("배치 타일 존재", !!tile);
  if (!tile) throw new Error("타일 없음");

  // 마법사 히트박스(48x56) 중심이 타일 중심에 오도록
  await page.evaluate((t) => window.__mathcastle.qaMoveWizard(t.x + 20 - 24, t.y + 20 - 28), tile);
  await wait(400);

  const focus = await page.evaluate(() => {
    const f = document.querySelector(".placement-tile.tile-focus");
    const hint = document.getElementById("action-hint");
    return {
      focused: !!f,
      badge: f?.getAttribute("data-build-hint") || "",
      hintShown: hint?.classList.contains("show") === true,
      hintText: hint?.textContent || "",
    };
  });
  check("타일 위에 서면 타일이 하이라이트됨", focus.focused);
  check("타일에 'E 건설' 안내 뱃지 표시", focus.badge === "E 건설", `badge='${focus.badge}'`);
  check("힌트 바가 건설 안내로 바뀜", focus.hintShown && focus.hintText.includes("건설"), `hint='${focus.hintText}'`);

  // ⑤ E → 건설창 (Space는 공격 전용이라 건설창이 열리면 안 된다)
  await page.keyboard.press("Space");
  await wait(400);
  check("Space는 건설창을 열지 않음(공격 전용)", !(await shown("#towerSelector")));
  await page.keyboard.press("e");
  await wait(500);
  check("E로 타워 선택창 열림", await shown("#towerSelector"));

  // ⑥ 숫자키 1 → 실제 건설 (골드 충분해야 하므로 먼저 지급)
  await page.evaluate(() => window.__mathcastle.qaAddGold(5000));
  const before = await page.evaluate(() => window.__mathcastle.getState().towers);
  await page.keyboard.press("1");
  await wait(600);
  const after = await page.evaluate(() => window.__mathcastle.getState().towers);
  check("숫자키 1로 타워 건설됨", after === before + 1, `${before} → ${after}`);
  check("건설 후 선택창 닫힘", !(await shown("#towerSelector")));

  // Space 토글 취소도 동작해야 한다
  await page.evaluate((t) => window.__mathcastle.qaMoveWizard(t.x + 20 - 24, t.y + 20 - 28), tile);
  await wait(400);
  const stillFocused = await page.evaluate(() => !!document.querySelector(".placement-tile.tile-focus"));
  check("타워가 선 타일은 더 이상 포커스되지 않음", !stillFocused);

  // ⑦ 수학 문제(모달)가 떠 있으면 게임 단축키가 먹으면 안 된다
  // ⚠️ 반드시 '아직 비어 있는' 타일 위에서 검사할 것. 타워가 선 타일은 포커스 자체가 안 잡혀
  //    가드가 없어도 통과해버린다(음성 대조군으로 확인한 실측 함정).
  const tile2 = await page.evaluate(() => {
    const t = [...document.querySelectorAll(".placement-tile")].find((e) => e.style.display !== "none");
    return t ? { x: parseInt(t.style.left), y: parseInt(t.style.top) } : null;
  });
  check("두 번째 빈 타일 존재", !!tile2);
  await page.evaluate((t) => window.__mathcastle.qaMoveWizard(t.x + 20 - 24, t.y + 20 - 28), tile2);
  await wait(400);
  check("빈 타일 위에서 포커스 재확인", await page.evaluate(() => !!document.querySelector(".placement-tile.tile-focus")));
  await page.evaluate(() => window.__mathcastle.qaShowProblem());
  await wait(400);
  check("수학 문제 모달 표시됨", await shown("#mathModal"));
  await page.keyboard.press("e");
  await wait(400);
  check("문제 풀이 중 E가 건설창을 열지 않음", !(await shown("#towerSelector")));
  await page.evaluate(() => document.getElementById("mathModal")?.classList.remove("show"));
  await wait(200);

  // 일시정지하면 타일 하이라이트·힌트가 남으면 안 된다
  await page.evaluate((t) => window.__mathcastle.qaMoveWizard(t.x + 20 - 24, t.y + 20 - 28), tile2);
  await wait(400);
  await page.keyboard.press("p");
  await wait(400);
  const paused = await page.evaluate(() => ({
    focused: !!document.querySelector(".placement-tile.tile-focus"),
    hintShown: document.getElementById("action-hint")?.classList.contains("show") === true,
    gamePaused: window.__mathcastle.getState().gamePaused,
  }));
  check("일시정지 상태 진입", paused.gamePaused === true);
  check("일시정지 시 타일 하이라이트 제거됨", !paused.focused);
  check("일시정지 시 조작 힌트 숨김", !paused.hintShown);
  await page.keyboard.press("p");
  await wait(400);

  // Ctrl 조합키는 게임 단축키를 가로채면 안 된다 (Ctrl+P 인쇄 등)
  const beforeCtrl = await page.evaluate(() => window.__mathcastle.getState().gamePaused);
  await page.keyboard.down("Control");
  await page.keyboard.press("p");
  await page.keyboard.up("Control");
  await wait(400);
  const afterCtrl = await page.evaluate(() => window.__mathcastle.getState().gamePaused);
  check("Ctrl+P가 일시정지를 토글하지 않음", beforeCtrl === afterCtrl);

  // ⑧ Enter → 웨이브 시작
  const waveBefore = await page.evaluate(() => window.__mathcastle.getState().gameRunning);
  await page.keyboard.press("Enter");
  await wait(1500);
  const spawned = await page.evaluate(() => window.__mathcastle.getState().monsters);
  check("Enter로 웨이브 시작됨(몬스터 스폰)", spawned > 0, `monsters=${spawned}, running=${waveBefore}`);

  // ⑨ 2배속 — 게임 시계가 배속을 따라가야 한다.
  //    움직임(deltaTime)만 배속되고 연출 시계가 벽시계에 머물면, 몬스터는 2배로
  //    가는데 다리는 1배로 움직여 "미끄러지는/끊기는" 화면이 된다(사용자 실측 신고).
  //    ⚠️ 판정은 넉넉하게(>1.5) 한다 — 머신이 바쁘면 프레임 상한(MAX_SIM_FRAME_MS)에
  //       걸려 비율이 2.0보다 낮아질 수 있다. 여기서 가르려는 건 "2.0이냐"가 아니라
  //       "1.0에 머무느냐(=배속 미반영)"다.
  const speedBtn = await page.$("#speedBtn");
  check("속도 전환 버튼 존재", !!speedBtn);
  if (speedBtn) {
    const measure = async () => {
      const a = await page.evaluate(() => ({
        c: window.__mathcastle.getState().gameClock, w: performance.now(),
      }));
      await wait(2000);
      const b = await page.evaluate(() => ({
        c: window.__mathcastle.getState().gameClock, w: performance.now(),
      }));
      return (b.c - a.c) / (b.w - a.w);
    };
    const r1 = await measure();
    await speedBtn.click();
    await wait(300);
    const label = await page.evaluate(() => document.getElementById("speedBtn")?.textContent);
    const r2 = await measure();
    check("속도 버튼이 2x로 전환됨", label === "2x", `label='${label}'`);
    check("1배속에서 게임 시계 = 벽시계", r1 > 0.8 && r1 < 1.3, `비율 ${r1.toFixed(2)}`);
    check("2배속에서 게임 시계도 함께 빨라짐(연출-이동 불일치 방지)", r2 > 1.5,
      `비율 ${r2.toFixed(2)} (1.0 근처면 걷기 애니메이션이 안 따라온다)`);
    await speedBtn.click(); // 원복
    await wait(300);
  }

  // ⑩ 배속 배선 소스 가드 — 게임플레이 갱신이 **게임 시계**를 받는지 원문에서 확인한다.
  //    위 ⑨는 gameClock 자체가 배속을 따라가는지만 본다. 누가 updateTowers(gameClock,…)를
  //    다시 updateTowers(timestamp,…)로 돌려놔도 ⑨는 통과한다 — 쿨다운만 조용히 벽시계로
  //    돌아가 2배속 난이도가 달라진다(실측: 2배속 발사율이 1배속의 0.58배였다).
  //    런타임으로 가르려면 발사율 표본이 여러 판 필요해 게이트로는 너무 흔들린다.
  //    그래서 여기서는 **배선 자체**를 결정론적으로 단언한다.
  {
    const src = readFileSync(join(ROOT, "main.js"), "utf8");
    // ⚠️ 종료 표지로 "gameLoop.isRunning = false;"를 쓰면 안 된다 — 함수 **안에도** 있어서
    //    구간이 앞에서 잘린다(이 가드가 처음에 그래서 전부 FAIL을 냈다).
    //    들여쓰기 없는 모듈 레벨 선언(\ngameLoop.isRunning)을 종료 표지로 쓴다.
    const loopStart = src.indexOf("function gameLoop(");
    const loopEnd = src.indexOf("\ngameLoop.isRunning = false;", loopStart);
    const loop = src.slice(loopStart, loopEnd);
    const mustUseGameClock = [
      "updateWizardCooldownVisual",
      "wizardAutoAttack",
      "updateTowers",
      "updateProjectiles",
      "updateMonsters",
      "updateEffects",
      "updateDamageTexts",
    ];
    const offenders = mustUseGameClock.filter((fn) => {
      const m = loop.match(new RegExp(`${fn}\\(([^)]*)\\)`));
      return !m || !m[1].includes("gameClock");
    });
    check("게임플레이 갱신이 벽시계가 아니라 게임 시계를 받는다(배속 공정성)",
      offenders.length === 0,
      offenders.length ? `벽시계로 남은 것: ${offenders.join(", ")}` : "7/7");

    // 위 검사는 gameLoop 진입점만 본다. 실제 쿨다운·상태이상은 그 아래 호출체인에서
    // 설정되므로, 거기서 누가 performance.now()를 다시 꺼내 쓰면 위 검사는 그냥 통과한다
    // (교차검증이 지적한 사각지대). 그래서 게임플레이 함수 본문에 벽시계가 있는지도 본다.
    const GAMEPLAY_FNS = [
      "handleWizardAttack", "handleHit", "handleMonsterDeath",
      "updateMonsters", "updateTowers", "updateProjectiles",
      "updateEffects", "updateDamageTexts", "createDamageText",
      "addCanvasSpellEffect", "wizardAutoAttack", "checkWaveCompletion",
    ];
    const bodyOf = (name) => {
      const m = src.match(new RegExp(`\\n(?:async )?function ${name}\\(`));
      if (!m) return null;
      const start = m.index + 1;
      const next = src.slice(start + 1).search(/\n(?:async )?function [a-zA-Z]/);
      return next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
    };
    // ⚠️ 주석을 먼저 걷어낸다. 안 그러면 "예전 이름은 performance.now()를 뜻했다" 같은
    //    **설명문이 코드로 읽혀** 멀쩡한 함수가 위반으로 잡힌다(실측: v9에서 그렇게 터졌다).
    //    게이트가 세야 하는 건 프로즈가 아니라 실행되는 코드다.
    //    (문자열 리터럴 안의 "//"까지 가리지는 않지만, 그 경우 생기는 건 헛통과가 아니라
    //     기껏해야 놓침 하나이고 이 프로젝트엔 그런 리터럴이 없다.)
    const stripComments = (t) =>
      t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const missing = GAMEPLAY_FNS.filter((f) => bodyOf(f) === null);
    const wallClock = GAMEPLAY_FNS.filter((f) =>
      stripComments(bodyOf(f) || "").includes("performance.now()"));
    // 함수를 못 찾으면 검사가 조용히 통과해 버린다 — 그것도 실패로 잡는다
    check("게임플레이 함수 본문에 벽시계(performance.now)가 남아 있지 않다",
      wallClock.length === 0 && missing.length === 0,
      [wallClock.length ? `벽시계 사용: ${wallClock.join(", ")}` : "",
       missing.length ? `함수 못 찾음(가드 무효): ${missing.join(", ")}` : ""].filter(Boolean).join(" / ")
       || `${GAMEPLAY_FNS.length}/${GAMEPLAY_FNS.length}`);
  }

  // ⑫ 마법사 레벨업이 "있는 줄도 모르는" 상태가 아닌가
  //    신고: "마법사 레벨업도 할 수 있다는 걸 약간 표시해줘. 사실 유저들이 있는지도 모르겠어"
  //    ⬆️ 아이콘 하나로는 ㉠ 값 ㉡ 올리면 뭐가 열리는지 ㉢ 지금 살 수 있는지가 전부 화면 밖이다.
  console.log("\n[⑫ 마법사 레벨업 발견 가능성]");
  const wz = await page.evaluate(() => {
    const g = window.__mathcastle;
    g.qaAddGold(-999999);                 // 일단 못 사는 상태로
    const poor = document.getElementById("upgradeWizardBtn");
    const poorState = { text: poor.textContent.trim(), afford: poor.classList.contains("affordable"),
                        disabled: poor.disabled, title: poor.title };
    g.qaAddGold(999999);                  // 살 수 있는 상태로
    const rich = document.getElementById("upgradeWizardBtn");
    const rect = rich.getBoundingClientRect();
    return { poorState,
             richState: { text: rich.textContent.trim(), afford: rich.classList.contains("affordable"),
                          disabled: rich.disabled, title: rich.title,
                          w: Math.round(rect.width), h: Math.round(rect.height) } };
  });
  check("버튼에 비용이 보인다(못 살 때도 — 얼마를 모으면 되는지가 필요하다)",
    /\d/.test(wz.poorState.text), `표시: "${wz.poorState.text}"`);
  check("올리면 열리는 것이 툴팁에 있다",
    /마법|위력/.test(wz.richState.title), wz.richState.title);

  // 조사(이/가)는 낱말의 받침으로 갈린다. 괄호를 씌운 채로 재면 마지막 글자가 한글이
  // 아니라 늘 같은 조사가 나온다 — 실측으로 9종 전부 "가"가 찍혔다.
  const particles = await page.evaluate(() => {
    const g = window.__mathcastle;
    const out = [];
    for (let lv = 2; lv <= 10; lv++) {
      const sp = g.qaNextSpellAtLevel(lv);
      if (sp) out.push({ name: sp.name, p: g.qaParticleFor(sp.name, "이", "가") });
    }
    return out;
  });
  const wrong = particles.filter((x) => {
    const c = x.name.trim().slice(-1).charCodeAt(0);
    const hangul = c >= 0xac00 && c <= 0xd7a3;
    const expect = hangul && (c - 0xac00) % 28 !== 0 ? "이" : "가";
    return x.p !== expect;
  });
  check(`마법 이름 ${particles.length}종의 조사(이/가)가 전부 맞다`,
    particles.length >= 8 && wrong.length === 0,
    wrong.length ? wrong.map((w) => `${w.name}→${w.p}`).join(", ")
                 : particles.slice(0, 3).map((x) => `${x.name}${x.p}`).join(" · "));
  check("살 수 있게 되면 눈에 띄는 상태로 바뀐다",
    wz.richState.afford && !wz.poorState.afford,
    `못 살 때 affordable=${wz.poorState.afford} → 살 수 있을 때 ${wz.richState.afford}`);
  check("못 살 때는 비활성, 살 수 있으면 활성",
    wz.poorState.disabled === true && wz.richState.disabled === false,
    `disabled ${wz.poorState.disabled} → ${wz.richState.disabled}`);
  check("비용을 넣어도 터치 타깃이 좁아지지 않는다(≥44px)",
    wz.richState.w >= 44 && wz.richState.h >= 30, `${wz.richState.w}×${wz.richState.h}px`);

  // ⑪ 콘솔 에러
  const filtered = errors.filter((e) => !/net::ERR|favicon|[Ff]irebase|Failed to load resource/.test(e));
  check(`콘솔 에러 0건`, filtered.length === 0, filtered.slice(0, 3).join(" | "));

  console.log(`\n결과: ${pass} PASS · ${fail} FAIL`);
} catch (err) {
  console.error("❌ 예외:", err.message);
  fail++;
} finally {
  await browser.close();
  server.close();
  process.exit(fail > 0 ? 1 : 0);
}
