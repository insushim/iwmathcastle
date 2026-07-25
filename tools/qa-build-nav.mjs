#!/usr/bin/env node
// tools/qa-build-nav.mjs — 건설창 방향키 내비게이션 + 비행체 날갯짓 회귀 테스트
// ① 방향키로 커서가 생기고 이동  ② 숫자키(1~9)로 못 닿는 10번째 이후 타워까지 도달
// ③ Enter로 그 타워가 실제로 지어짐  ④ 건설창에서 방향키가 마법사를 움직이지 않음
// ⑤ 마우스 클릭·숫자키 건설이 그대로 동작  ⑥ 비행체(박쥐)가 walk 4프레임을 실제로 그림
// 사용: node tools/qa-build-nav.mjs [포트=8939]

import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8939;
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
  if (ok) { pass++; console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shown = (sel) => page.evaluate((s) => document.querySelector(s)?.classList.contains("show") === true, sel);
const cursorIdx = () => page.evaluate(() => {
  const opts = [...document.querySelectorAll("#towerSelector .tower-option")];
  const i = opts.findIndex((o) => o.classList.contains("kb-cursor"));
  return { i, type: opts[i]?.dataset.towerType || null, n: opts.length };
});

/** 비어 있는 배치 타일 위로 마법사를 옮기고 E로 건설창을 연다. */
async function openBuildPanel() {
  const tile = await page.evaluate(() => {
    const t = [...document.querySelectorAll(".placement-tile")].find((e) => e.style.display !== "none");
    return t ? { x: parseInt(t.style.left), y: parseInt(t.style.top) } : null;
  });
  if (!tile) return false;
  await page.evaluate((t) => window.__mathcastle.qaMoveWizard(t.x + 20 - 24, t.y + 20 - 28), tile);
  await wait(400);
  await page.keyboard.press("e");
  await wait(500);
  return shown("#towerSelector");
}

try {
  console.log("[건설창 방향키 · 날갯짓]");

  await seedSkipHowTo(page);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 });
  await wait(1000);
  await page.click('.difficulty-btn[data-difficulty="4-1"]');
  await wait(3000);

  // ⑥ 날갯짓 — 게임과 같은 렌더러로 박쥐를 여러 시각에 그리고,
  //    drawImage를 후킹해 "실제로 캔버스에 올라간 파일"을 실측한다.
  const flap = await page.evaluate(async () => {
    const { MonsterRenderer } = await import("/monsterRenderer.js");
    const drawn = new Set();
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    proto.drawImage = function (img, ...rest) {
      if (img && img.src) drawn.add(img.src.split("/").pop());
      return orig.call(this, img, ...rest);
    };
    try {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 200;
      const ctx = cv.getContext("2d");
      const r = new MonsterRenderer();
      for (let i = 0; i < 80; i++) {
        r.render(ctx, "bat", 100, 100, 38, 60, 60, 0, i % 4, {
          isFlying: true, isBoss: false, now: i * 20, phase: 0,
        });
      }
      return [...drawn].filter((f) => f.startsWith("monster-bat"));
    } finally {
      proto.drawImage = orig;
    }
  });
  const walkFrames = flap.filter((f) => /monster-bat-walk-\d\.webp/.test(f)).sort();
  check("박쥐 날갯짓 4프레임 전부 그려짐", walkFrames.length === 4, walkFrames.join(", ") || "없음");

  // ① 건설창 열기
  check("E로 건설창 열림", await openBuildPanel());
  const meta = await page.evaluate(() => ({
    total: document.querySelectorAll("#towerSelector .tower-option").length,
    badges: document.querySelectorAll("#towerSelector .tower-option-key").length,
  }));
  check("타워 개수 > 숫자 배지 개수(방향키가 꼭 필요한 상황)", meta.total > meta.badges,
    `타워 ${meta.total}개 · 숫자키 배지 ${meta.badges}개`);

  // ② 첫 방향키 → 커서 생성, 이동
  await page.keyboard.press("ArrowRight");
  await wait(150);
  let c = await cursorIdx();
  check("첫 방향키 입력에 커서 생성(0번)", c.i === 0, `index=${c.i}`);

  await page.keyboard.press("ArrowRight");
  await wait(120);
  c = await cursorIdx();
  check("→로 다음 칸 이동", c.i === 1, `index=${c.i}`);

  const cols = await page.evaluate(() => {
    const opts = [...document.querySelectorAll("#towerSelector .tower-option")];
    const top = opts[0].offsetTop;
    return opts.filter((o) => o.offsetTop === top).length;
  });
  await page.keyboard.press("ArrowDown");
  await wait(120);
  c = await cursorIdx();
  check("↓로 아랫줄 같은 열 이동", c.i === 1 + cols, `index=${c.i} (열 ${cols}개)`);

  await page.keyboard.press("ArrowUp");
  await wait(120);
  c = await cursorIdx();
  check("↑로 되돌아옴", c.i === 1, `index=${c.i}`);

  // ③ 숫자키(1~9)로 못 닿는 첫 타워 = 10번째. 여기까지 방향키로 가서 Enter 건설.
  const wizBefore = await page.evaluate(() => document.getElementById("wizard").style.transform);
  const targetIdx = Math.min(9, meta.total - 1);
  const steps = (targetIdx - c.i + meta.total) % meta.total;
  for (let i = 0; i < steps; i++) await page.keyboard.press("ArrowRight");
  await wait(200);
  c = await cursorIdx();
  check(`숫자키 밖(${targetIdx + 1}번째) 타워까지 방향키로 도달`, c.i === targetIdx,
    `커서 ${c.i + 1}번째 · ${c.type}`);
  const targetType = c.type;

  // 마법사는 transform으로 움직인다 — 방향키를 22번 눌렀는데 그대로여야 한다
  const wizAfter = await page.evaluate(() => document.getElementById("wizard").style.transform);
  check("건설창에서 방향키가 마법사를 움직이지 않음", wizBefore === wizAfter,
    `${wizBefore} → ${wizAfter}`);

  await page.evaluate(() => window.__mathcastle.qaAddGold(9999));
  const before = await page.evaluate(() => window.__mathcastle.getState().towers);
  const monBefore = await page.evaluate(() => window.__mathcastle.getState().monsters);
  await page.keyboard.press("Enter");
  await wait(1000);
  const after = await page.evaluate(() => window.__mathcastle.getState().towers);
  check("Enter로 커서 타워가 실제 건설됨", after === before + 1, `타워 수 ${before} → ${after} (${targetType})`);
  check("건설 후 선택창 닫힘", !(await shown("#towerSelector")));
  const monAfter = await page.evaluate(() => window.__mathcastle.getState().monsters);
  check("Enter가 웨이브 시작으로 새지 않음", monAfter === monBefore, `몬스터 ${monBefore} → ${monAfter}`);

  // ④ 마우스 클릭 경로 회귀
  if (await openBuildPanel()) {
    await page.evaluate(() => window.__mathcastle.qaAddGold(9999));
    const b2 = await page.evaluate(() => window.__mathcastle.getState().towers);
    await page.evaluate(() => document.querySelector("#towerSelector .tower-option")?.click());
    await wait(500);
    const a2 = await page.evaluate(() => window.__mathcastle.getState().towers);
    check("마우스 클릭 건설 그대로 동작", a2 === b2 + 1, `${b2} → ${a2}`);
  } else check("마우스 클릭 건설 그대로 동작", false, "건설창을 다시 열지 못함");

  // ⑤ 숫자키 경로 회귀
  if (await openBuildPanel()) {
    await page.evaluate(() => window.__mathcastle.qaAddGold(9999));
    const b3 = await page.evaluate(() => window.__mathcastle.getState().towers);
    await page.keyboard.press("3");
    await wait(500);
    const a3 = await page.evaluate(() => window.__mathcastle.getState().towers);
    check("숫자키 건설 그대로 동작", a3 === b3 + 1, `${b3} → ${a3}`);
  } else check("숫자키 건설 그대로 동작", false, "건설창을 다시 열지 못함");

  // ⑥ Esc 취소 회귀
  if (await openBuildPanel()) {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await wait(300);
    check("Esc 취소 그대로 동작", !(await shown("#towerSelector")));
  } else check("Esc 취소 그대로 동작", false, "건설창을 다시 열지 못함");

  const realErrors = errors.filter((e) => !/404|favicon|firebase|api\//i.test(e));
  check("콘솔 에러 0건", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
} catch (e) {
  fail++;
  console.log("  ❌ 예외:", e.message);
} finally {
  console.log(`\n결과: ${pass} PASS · ${fail} FAIL`);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
}
