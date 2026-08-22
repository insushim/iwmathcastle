#!/usr/bin/env node
// tools/qa-rarity.mjs — v9 등급(레어도)이 아이 눈에 실제로 보이는가
//
// 사용자 보고: "황금왕관타워 이런 친구들이 좋은 건데 구분이 잘 안 감."
// 실측한 원인: 등급 판정이 **비용** 기준이었는데 특수 타워는 cost:0 이라 최하급으로
// 떨어졌고, 그걸 막으려 5종을 이름으로 하드코딩해 예외 처리하고 있었다.
// 그 결과 툴팁이 황금 왕관에게 "비용: 0G"를 보여줬다.
//
// 이 게이트가 지키는 것:
//  ① 등급의 진실원이 하나다 — 상자 확률표(RANDOM_TOWER_TIERS)와 화면 등급이 일치
//  ② 등급 미분류 타워 0 (표에 없는 타워가 조용히 1등급으로 뭉개지지 않는가)
//  ③ ui.js에 비용 기반 하드코딩 예외가 남아 있지 않다
//  ④ 색만으로 구분하지 않는다 — 별(★)과 한글 라벨이 항상 동반
//  ⑤ 상자 전용 타워 툴팁에 "0G"가 나오지 않는다
//  ⑥ 필드에 놓인 타워에 등급 링이 그려진다
//
// 사용: node tools/qa-rarity.mjs [포트=8842]

import puppeteer from "puppeteer";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TOWER_STATS, RANDOM_TOWER_TIERS, RANDOM_TIER_LABEL } from "../gameData.js";
import * as rarity from "../rarity.js";

const PORT = Number(process.argv[2]) || 8842;
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

console.log("\n[① 등급의 진실원이 하나인가]");
{
  ok(rarity.untieredTowerKeys().length === 0,
    `등급 미분류 타워 ${rarity.untieredTowerKeys().length}종 (상자 확률표에 없는 타워)`);

  // 확률표가 말하는 등급과 화면이 말하는 등급이 같아야 한다
  let mismatch = 0;
  for (const [tier, keys] of Object.entries(RANDOM_TOWER_TIERS)) {
    for (const k of keys) {
      const r = rarity.towerRarity(k);
      if (r.tier !== Number(tier) || r.label !== RANDOM_TIER_LABEL[tier]) mismatch++;
    }
  }
  ok(mismatch === 0, `상자 확률표 등급과 화면 등급 불일치 ${mismatch}건`);

  // 별 개수 = 등급 번호 (색 없이도 등급이 읽혀야 한다)
  const starsOk = Object.keys(TOWER_STATS)
    .filter((k) => !TOWER_STATS[k].isRandom)
    .every((k) => rarity.towerRarity(k).stars.length === rarity.towerRarity(k).tier);
  ok(starsOk, "별 개수가 등급 번호와 일치(색 없이도 등급 판독 가능)");

  const golden = rarity.towerRarity("golden");
  ok(golden.tier === 4 && golden.boxOnly,
    `황금 왕관 = ${golden.stars} ${golden.label} · 상자 전용=${golden.boxOnly}`);
  const gRank = rarity.attackRank("golden");
  ok(gRank && gRank.rank <= 3, `황금 왕관 공격력 순위 ${gRank?.rank}/${gRank?.total} (상위권이어야 한다)`);

  // 지원 타워를 화력으로 꼴찌 취급하지 않는가
  ok(rarity.attackRank("repairStation") === null, "수리소는 공격력 순위에서 제외(지원 타워)");
  ok(rarity.powerInfo("ice").role === "지원", "얼음 = 지원 역할로 분류");
}

console.log("\n[② 구 하드코딩 예외가 제거됐는가]");
{
  const src = readFileSync(join(ROOT, "ui.js"), "utf8");
  ok(!/if \(key === "ultimate" \|\| key === "transcendent"\) return "legendary"/.test(src),
    "ui.js의 타워 이름 하드코딩 등급 예외 제거됨");
  ok(!/if \(cost <= 100\) return "common"/.test(src),
    "ui.js의 비용 기반 등급 판정 제거됨");
  ok(/rarity\.tierAttr\(/.test(src), "ui.js가 rarity.js를 등급 진실원으로 쓴다");
}

const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

try {
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem("mathcastle:howto", JSON.stringify({ never: true })); } catch { /* noop */ }
  });
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 40000 });
  await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="5-1"]').click());
  await page.waitForFunction(() => window.__mathcastle?.getState().gameRunning === true, { timeout: 60000 });

  console.log("\n[③ 화면 — 건설창의 등급 표시]");
  const menu = await page.evaluate(() => {
    const M = window.__mathcastle;
    M.qaAddGold(99999);
    // 건설창을 연다
    const tile = document.querySelector(".placement-tile");
    tile?.click();
    return new Promise((res) => setTimeout(() => {
      const opts = [...document.querySelectorAll(".tower-option")];
      res({
        count: opts.length,
        tiers: opts.map((o) => o.dataset.tier),
        labels: opts.map((o) => o.querySelector(".tower-option-tier-label")?.textContent || ""),
      });
    }, 400));
  });
  ok(menu.count > 0, `건설창 타워 ${menu.count}종 표시`);
  const tierFmt = menu.tiers.filter((t) => /^t[1-6]$/.test(t) || t === "random").length;
  ok(tierFmt === menu.count, `등급 속성이 전부 t1~t6/random 형식 (${tierFmt}/${menu.count})`);
  const labeled = menu.labels.filter((l) => /★/.test(l)).length;
  const nonRandom = menu.tiers.filter((t) => t !== "random").length;
  ok(labeled === nonRandom,
    `등급 라벨(★+한글)이 붙은 옵션 ${labeled}/${nonRandom} — 색 단독 구분 금지`);

  console.log("\n[④ 화면 — 상자 전용 타워의 툴팁·필드 링]");
  const tip = await page.evaluate(() => {
    const M = window.__mathcastle;
    M.qaPlaceTowersNearPath("golden", 1);
    const t = M.qaTowers().find((x) => x.type === "golden");
    return { placed: !!t, rarity: M.qaRarity("golden") };
  });
  ok(tip.placed, "황금 왕관 타워를 필드에 배치");
  ok(tip.rarity.boxOnly === true, "황금 왕관은 상자 전용으로 표시(비용 0G 문구 금지)");
  ok(tip.rarity.stars === "★★★★" && tip.rarity.label === "특수",
    `필드 타워 등급 = ${tip.rarity.stars} ${tip.rarity.label}`);

  // 툴팁 DOM 실검사 — hover 흉내는 조용히 실패해 헛검사가 되기 쉬워 훅으로 직접 띄운다
  const tipHtml = await page.evaluate(() => window.__mathcastle.qaTowerTooltipHtml("golden"));
  ok(typeof tipHtml === "string" && tipHtml.length > 0, "황금 왕관 툴팁 DOM 생성됨");
  // ⚠️ 태그를 벗기고 본다. `비용:</span> 0G` 처럼 사이에 태그가 끼면 원문 정규식이
  //    조용히 안 맞아 **회귀를 놓친다**(실제로 회귀 주입 때 이 검사만 통과했다).
  const tipText = (tipHtml || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  ok(!/비용:\s*0G/.test(tipText), `툴팁에 '비용: 0G' 표기 없음`);
  ok(/보물상자에서만/.test(tipText), "툴팁이 '보물상자에서만 나와요'로 획득처를 안내");
  ok(/특수 등급/.test(tipText) && /★★★★/.test(tipText),
    "툴팁에 별+한글 등급 동반(색 단독 구분 금지)");
  ok(/공격력:/.test(tipText) && /\d+위/.test(tipText), "툴팁에 공격력 순위 표기");

  // 일반 구매 타워는 여전히 비용을 보여줘야 한다(과교정 방지)
  const plusTip = ((await page.evaluate(() => window.__mathcastle.qaBuildMenuTooltipHtml("plus"))) || "")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  ok(/비용:/.test(plusTip) && /50G/.test(plusTip),
    "일반 타워 툴팁은 비용을 그대로 표시(과교정 아님)");

  ok(errors.length === 0, `페이지 예외 ${errors.length}건${errors.length ? " → " + errors[0] : ""}`);
} catch (e) {
  fail++; console.log("  ❌ 예외:", String(e).slice(0, 300));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n결과: ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
