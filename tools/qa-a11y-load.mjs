#!/usr/bin/env node
// tools/qa-a11y-load.mjs — 초등 접근성과 첫 로딩
//
// v7 실측:
//   · 폰 가로에서 컨트롤 버튼 8개 중 6개가 높이 35px (터치 기준 44px 미달).
//     `@media (pointer: coarse) { .ctrl-btn { min-height: 44px } }` 규칙이 있었지만
//     `#control-bar .ctrl-btn { min-height: 34px }`(ID 포함 = 더 강함)에 밀려 죽어 있었다.
//   · --text-dim(#475569)의 --bg-primary(#0a0e1a) 위 명도대비 2.54:1 (WCAG AA의 절반).
//     마법 이름·업적 설명처럼 실제로 읽어야 하는 글자에 쓰였다.
//   · 학년 선택 전에 스프라이트 207장(2.5MB)을 전부 받았다.
//
// 사용: node tools/qa-a11y-load.mjs [포트=8860]

import puppeteer from "puppeteer";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.argv[2]) || 8860;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const fp = join(ROOT, p);
  if (!fp.startsWith(ROOT) || !existsSync(fp)) { res.writeHead(404); res.end(); return; }
  const body = readFileSync(fp);
  res.writeHead(200, { "Content-Type": MIME[extname(fp)] || "application/octet-stream", "Content-Length": body.length });
  res.end(body);
});
await new Promise((r, j) => { server.on("error", j); server.listen(PORT, r); });

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}`)); };

// 상대휘도 → 명도대비 (WCAG 2.1 공식)
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

// ── ① 색 대비 (CSS 변수 정적 검사) ──
console.log("\n[① 명도대비]");
{
  const css = readFileSync(join(ROOT, "style.css"), "utf8");
  const varOf = (name) => (css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1];
  const bg = varOf("bg-primary");
  for (const name of ["text-primary", "text-secondary", "text-dim"]) {
    const c = varOf(name);
    if (!c) continue;
    const r = contrast(c, bg);
    ok(r >= 4.5, `--${name} (${c}) vs --bg-primary (${bg}) = ${r.toFixed(2)}:1 (AA 기준 4.5)`);
  }
  // 아이가 읽어야 하는 작은 글자에 9~11px가 남아 있지 않은가
  for (const cls of ["tower-option-name", "spell-option-name", "achievement-desc"]) {
    const m = css.match(new RegExp(`\\.${cls}[^{]*\\{[^}]*font-size:\\s*([\\d.]+)px`));
    const px = m ? Number(m[1]) : null;
    ok(px !== null && px >= 12, `.${cls} 글자 크기 ${px}px (기준 ≥12)`);
  }
}

const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio"],
});

try {
  // ── ② 터치 타깃 ──
  console.log("\n[② 터치 타깃 44px — 폰 가로]");
  for (const [name, w, h] of [["작은 폰 가로", 640, 360], ["아이폰 가로", 844, 390], ["태블릿 세로", 768, 1024]]) {
    const p = await browser.newPage();
    // 실제 폰처럼 coarse pointer로 인식되게 한다 — 안 그러면 44px 규칙이 적용되지 않아
    // "데스크톱에서만 통과하는" 헛검사가 된다.
    await p.emulate({
      viewport: { width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      userAgent: "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
    });
    await p.evaluateOnNewDocument(() => {
      try { localStorage.setItem("mathcastle:howto", JSON.stringify({ never: true })); } catch {}
    });
    await p.goto(BASE, { waitUntil: "networkidle0", timeout: 40000 });
    await p.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="4-1"]').click());
    await p.waitForFunction(() => window.__mathcastle?.getState().gameRunning === true, { timeout: 60000 });
    const btns = await p.evaluate(() =>
      [...document.querySelectorAll("#control-bar .ctrl-btn")].map((b) => ({
        id: b.id, h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width),
      })),
    );
    const small = btns.filter((b) => b.h < 44 || b.w < 44);
    ok(small.length === 0,
      `${name} ${w}×${h}: 컨트롤 버튼 ${btns.length}개 중 44px 미달 ${small.length}개${small.length ? " → " + small.map((b) => `${b.id} ${b.w}×${b.h}`).join(", ") : ""}`);
    await p.close();
  }

  // ── ③ 첫 로딩 무게 ──
  console.log("\n[③ 학년 선택 전 로딩 무게]");
  {
    const p = await browser.newPage();
    await p.setViewport({ width: 1366, height: 768 });
    let bytes = 0, reqs = 0, imgs = 0;
    p.on("response", async (r) => {
      reqs++;
      if (/\.(webp|png|jpg)$/i.test(r.url())) imgs++;
      try { const b = await r.buffer(); bytes += b.length; } catch { /* 캐시·리다이렉트 */ }
    });
    await p.evaluateOnNewDocument(() => {
      try { localStorage.setItem("mathcastle:howto", JSON.stringify({ never: true })); } catch {}
    });
    await p.goto(BASE, { waitUntil: "networkidle0", timeout: 40000 });
    const mb = bytes / 1048576;
    console.log(`     요청 ${reqs}건 · 이미지 ${imgs}장 · ${mb.toFixed(2)}MB`);
    ok(imgs < 40, `학년 선택 전 이미지 ${imgs}장 (v7 기준선 114장)`);
    ok(mb < 1.6, `학년 선택 전 전송량 ${mb.toFixed(2)}MB (v7 기준선 2.5MB+)`);

    // 게임에 들어가면 필요한 스프라이트는 실제로 온다
    await p.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="4-1"]').click());
    await p.waitForFunction(() => window.__mathcastle?.getState().gameRunning === true, { timeout: 60000 });
    const n = await p.evaluate(async () => (await import("./spriteAssets.js")).spriteCount());
    ok(n >= 40, `게임 시작 시점에 로드된 스프라이트 ${n}장 (필수분은 다 왔는가)`);
    await p.close();
  }

  // ── ④ 느린 회선에서 첫 화면 ──
  console.log("\n[④ 느린 회선(3G 급)에서 첫 화면]");
  {
    const p = await browser.newPage();
    await p.setViewport({ width: 1366, height: 768 });
    const cdp = await p.createCDPSession();
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: 300, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
    });
    await p.evaluateOnNewDocument(() => {
      try { localStorage.setItem("mathcastle:howto", JSON.stringify({ never: true })); } catch {}
    });
    const t0 = Date.now();
    await p.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });
    await p.waitForFunction(() => !!document.querySelector('.difficulty-btn'), { timeout: 90000 });
    const menuMs = Date.now() - t0;
    console.log(`     학년 선택 버튼이 보이기까지 ${(menuMs / 1000).toFixed(1)}초`);
    ok(menuMs < 6000, `3G에서 첫 화면 ${(menuMs / 1000).toFixed(1)}초 (v7 기준선 6.1초, 기준 <6초)`);
    await p.close();
  }

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
