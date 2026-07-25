#!/usr/bin/env node
// tools/qa-mobile.mjs — 모바일·태블릿 실사용 검증 (기기별 뷰포트 실측 + 스크린샷)
// 세로/가로 양쪽에서: 게임판이 화면에 들어오는지 · 조작 UI가 닿는지 · 회전 안내가 뜨는지
// 사용: node tools/qa-mobile.mjs [포트=8943]

import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "screenshots");
const PORT = Number(process.argv[2]) || 8943;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

const server = createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  const fp = join(ROOT, decodeURIComponent(p));
  if (!fp.startsWith(ROOT) || !existsSync(fp)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(fp)] || "application/octet-stream" });
  res.end(readFileSync(fp));
});
await new Promise((r, j) => { server.on("error", j); server.listen(PORT, r); });
mkdirSync(SHOTS, { recursive: true });

// 학교에서 실제로 쓰는 기기 폭 기준
const DEVICES = [
  { name: "phone-portrait",  w: 390,  h: 844,  touch: true,  ua: "iPhone" },
  { name: "phone-landscape", w: 844,  h: 390,  touch: true,  ua: "iPhone" },
  // ⚠️ 실기 조건: 안드로이드 가로에서 주소창이 세로를 ~80px 먹는다.
  //    이걸 빼고 테스트하면 "통과했는데 실기에선 눌려 보이는" 상태를 놓친다(실측).
  { name: "android-landscape-urlbar", w: 900, h: 310, touch: true, ua: "android" },
  // 사용자 실기(갤럭시 + 주소창). 사용자 스크린샷에서 역산한 실제 뷰포트 — 회귀의 기준선.
  { name: "galaxy-landscape-real", w: 905, h: 360, touch: true, ua: "android" },
  { name: "phone-landscape-small", w: 740, h: 300, touch: true, ua: "android" },
  { name: "tablet-portrait", w: 820,  h: 1180, touch: true,  ua: "iPad" },
  { name: "tablet-landscape",w: 1180, h: 820,  touch: true,  ua: "iPad" },
];
const UAS = {
  iPhone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  iPad: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
};

const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio"],
});

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`    ✅ ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`    ❌ ${name}${detail ? " — " + detail : ""}`); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  console.log("[모바일·태블릿 실사용]");

  for (const d of DEVICES) {
    console.log(`\n  ▸ ${d.name} (${d.w}×${d.h})`);
    const page = await browser.newPage();
    await page.setUserAgent(UAS[d.ua]);
    await page.setViewport({ width: d.w, height: d.h, isMobile: d.touch, hasTouch: d.touch, deviceScaleFactor: 2 });
    await seedSkipHowTo(page);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 });
    await wait(900);

    // 회전 안내 — 폰 세로에서만 떠야 한다
    const rot = await page.evaluate(() => {
      const el = document.getElementById("rotateNotice");
      if (!el) return { exists: false, visible: false };
      const cs = getComputedStyle(el);
      return { exists: true, visible: cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0 };
    });
    const shouldShow = d.name === "phone-portrait";
    check(`회전 안내 ${shouldShow ? "표시" : "미표시"}`, rot.exists && rot.visible === shouldShow,
      rot.exists ? `visible=${rot.visible}` : "요소 없음");

    await page.screenshot({ path: join(SHOTS, `mobile-${d.name}-menu.png`) });

    // 메뉴에서 학년 선택 → 게임 진입 (회전 안내가 덮고 있으면 못 누른다 = 그것도 정보)
    const entered = await page.evaluate(() => {
      const b = document.querySelector('.difficulty-btn[data-difficulty="4-1"]');
      if (!b) return false;
      b.click();
      return true;
    });
    check("학년 버튼 클릭 가능", entered);
    await wait(3200);

    // 게임판이 화면 안에 들어오는가 — 가로 스크롤/잘림 검사
    const fit = await page.evaluate(() => {
      const el = document.getElementById("gameContainer") || document.getElementById("game-content");
      const r = el.getBoundingClientRect();
      return {
        docW: document.documentElement.scrollWidth,
        winW: window.innerWidth,
        winH: window.innerHeight,
        gameW: Math.round(r.width),
        gameH: Math.round(r.height),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    check("가로 스크롤 없음(화면에 들어옴)", !fit.overflowX,
      `doc ${fit.docW} vs win ${fit.winW}`);

    // ── 월드 기하 실측 ──────────────────────────────────────────────────
    // ⚠️ "줄 개수 ≥ 3" 같은 느슨한 수치는 버그를 통과시킨다(실측): 길에 먹힌 줄도
    //    오른쪽 끝 몇 칸만 살아남으면 '줄'로 세어져 1줄짜리 화면이 3줄로 통과했다.
    //    아래는 (1) 길이 서로 붙지 않았는지 (2) 줄마다 화면을 가로지를 만큼
    //    타일이 있는지 (3) 체력바가 바 밑에 숨지 않았는지를 직접 본다.
    const world = await page.evaluate(() => {
      const L = window.__mathcastle?.qaLayout?.() ?? null;
      const tiles = [...document.querySelectorAll(".placement-tile")];
      const byRow = {};
      for (const t of tiles) {
        const y = Math.round(parseFloat(t.style.top));
        byRow[y] = (byRow[y] || 0) + 1;
      }
      const bar = document.getElementById("control-bar")?.getBoundingClientRect().top ?? window.innerHeight;
      const hb = document.querySelector(".castle-health")?.getBoundingClientRect() ?? null;
      const cols = Math.floor(window.innerWidth / 50);
      return {
        L,
        tiles: tiles.length,
        rows: Object.entries(byRow).map(([y, n]) => ({ y: +y, n })).sort((a, b) => a.y - b.y),
        wideRows: Object.values(byRow).filter((n) => n >= cols * 0.5).length,
        hpUnderBar: hb ? Math.round(hb.bottom - bar) : null,
      };
    });

    // 훅이 없으면 '스킵'이 아니라 FAIL — 셀렉터/훅 부재를 조용히 통과시키면
    // 검사가 안 돈 화면을 통과로 오인한다(실측 교훈).
    check("레이아웃 훅(qaLayout) 노출", !!world.L, world.L ? "" : "없음");
    if (world.L) {
      // 길 두 줄이 붙으면 한 덩어리로 보이고 그 사이 줄이 통째로 사라진다 (원래 버그)
      const gaps = world.L.roads.slice(1).map((y, i) => y - world.L.roads[i]);
      const minGap = gaps.length ? Math.min(...gaps) : Infinity;
      check("길끼리 안 붙음(간격 ≥ 타일 한 칸)", minGap >= 40,
        `간격 ${gaps.join(",") || "길 1줄"} · 길폭 ${world.L.roadWidth}`);
      check("길 사이마다 타워 밴드 확보", world.L.bands.length >= world.L.roads.length,
        `밴드 ${world.L.bands.length} · 길 ${world.L.roads.length}`);
    }
    // 화면을 가로지르는 '진짜' 줄이 2줄 이상 — 오른쪽 끝 자투리는 줄로 안 친다
    check("가로로 이어지는 타워 줄 ≥ 2", world.wideRows >= 2,
      `${world.wideRows}줄 · 타일 ${world.tiles}개 · ${world.rows.map((r) => `y${r.y}:${r.n}`).join(" ")}`);
    check("성 체력바가 컨트롤 바에 안 가림", world.hpUnderBar !== null && world.hpUnderBar <= 0,
      world.hpUnderBar === null ? "체력바 없음" : `${world.hpUnderBar}px 겹침`);

    // 조작 UI가 화면 밖으로 나가지 않았는지 (시작 버튼·컨트롤 바)
    const ui = await page.evaluate(() => {
      const out = [];
      for (const sel of ["#startWaveBtn", "#control-bar", "#info-bar"]) {
        const el = document.querySelector(sel);
        if (!el) { out.push([sel, "없음"]); continue; }
        const r = el.getBoundingClientRect();
        const offscreen = r.right > window.innerWidth + 2 || r.bottom > window.innerHeight + 2 || r.left < -2 || r.top < -2;
        out.push([sel, offscreen ? `밖으로 나감 (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)})` : "OK"]);
      }
      return out;
    });
    for (const [sel, st] of ui) check(`${sel} 화면 안`, st === "OK", st);

    await page.screenshot({ path: join(SHOTS, `mobile-${d.name}-game.png`) });
    await page.close();
  }

  // 파비콘·PWA
  console.log("\n  ▸ 파비콘 · 홈 화면 추가");
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });
  const icons = await page.evaluate(() => ({
    icon: document.querySelector('link[rel~="icon"]')?.getAttribute("href") || null,
    apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") || null,
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href") || null,
    theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || null,
  }));
  for (const [k, v] of Object.entries(icons)) {
    if (!v) { check(`${k} 선언`, false, "없음"); continue; }
    const r = await page.evaluate(async (u) => (await fetch(u)).status, v);
    check(`${k} 선언·서빙`, r === 200, `${v} → HTTP ${r}`);
  }
  await page.close();
} catch (e) {
  fail++;
  console.log("  ❌ 예외:", e.message);
} finally {
  console.log(`\n결과: ${pass} PASS · ${fail} FAIL  (screenshots/mobile-*.png)`);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
}
