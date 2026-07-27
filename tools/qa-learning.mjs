#!/usr/bin/env node
// tools/qa-learning.mjs — 학습 시스템 실동작 검증 (헤드리스, 실제 브라우저 컨텍스트)
//
// 2026-07-27 감사에서 드러난 결함이 실제 게임에서 고쳐졌는지 확인한다.
//   ① 학기 격리 — 고른 학기의 문제만 나오는가
//   ② 찍기 취약성 — 계산 없이 "가운데 찍기"로 몇 %를 맞히는가 (기준선 25%)
//   ③ 세션 내 확장 간격 — 맞히면 3 → 7 → 15, 틀리면 3으로 복귀
//   ④ 날짜 단위 간격 반복 — 1일 → 3일 → 7일 → 16일 → 졸업
//   ⑤ 오답노트 라운드로빈 — 오래된 오답이 굶지 않는가
//   ⑥ 구버전 노트(v1) 마이그레이션
//   ⑦ 시간 초과가 오답으로 기록되는가
//   ⑧ 최장 문항이 작은 화면에서 보기를 밀어내지 않는가
//   ⑨ 유형별 제한시간 (길이 비례 보정 포함)
//
// 사용: node tools/qa-learning.mjs [포트=8937] [학기=5-1]

import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8937;
const SEM = process.argv[3] || "5-1";

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
  args: ["--disable-gpu", "--disable-gpu-compositing", "--disable-accelerated-2d-canvas", "--no-sandbox", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`); } else { fail++; console.log(`  ❌ ${m}`); } };
const cleanup = async (code) => { await browser.close(); server.close(); process.exit(code); };

try {
  await seedSkipHowTo(page);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 20000 });
  await page.click(`.difficulty-btn[data-difficulty="${SEM}"]`);
  await new Promise((r) => setTimeout(r, 1500));

  // ── ① 학기 격리 ──
  console.log(`\n[① 학기 격리 — ${SEM}]`);
  const iso = await page.evaluate(async (sem) => {
    const mod = await import(`./problems/grade${sem}.js`);
    const own = new Set(mod.default.map((p) => p.q));
    const others = ["3-1", "3-2", "4-1", "4-2", "5-1", "5-2", "6-1", "6-2"].filter((s) => s !== sem);
    let leak = 0;
    for (const s of others) {
      const m = await import(`./problems/grade${s}.js`);
      for (const p of m.default) if (own.has(p.q)) leak++;
    }
    const t4 = mod.default.filter((p) => p.t === 4).length;
    return { size: mod.default.length, leak, t4 };
  }, SEM);
  ok(iso.size > 2000, `문제 ${iso.size}개 (2000+ 기대)`);
  ok(iso.leak < iso.size * 0.02, `타 학기와 겹치는 문항 ${iso.leak}개 (2% 미만 = 나선형 복습 허용치)`);
  ok(iso.t4 >= 100, `문장제 ${iso.t4}문항 (100+ 기대 — 구버전 1학기는 0이었다)`);

  // ── ② 찍기 취약성 (main.js와 동일한 옵션 구성) ──
  console.log(`\n[② 찍기 취약성]`);
  const guess = await page.evaluate(async (sem) => {
    const list = (await import(`./problems/grade${sem}.js`)).default;
    const sh = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    let midHit = 0, n = 0, rand = 0, over3 = 0;
    for (let r = 0; r < 3; r++) {
      for (const p of list) {
        if (r === 0 && new Set((p.d || []).filter((x) => String(x) !== String(p.a))).size > 3) over3++;
        let w = [...(p.d || [])];
        sh(w);
        w = w.filter((x) => String(x) !== String(p.a)).slice(0, 3);
        if (w.length < 3) continue;
        const opts = sh([String(p.a), ...w]);
        const ns = opts.map((o) => (/^\d+(\.\d+)?$/.test(o) ? Number(o) : null));
        if (ns.some((v) => v === null)) continue;
        const sorted = [...ns].sort((a, b) => a - b);
        n++;
        if (sorted[Math.random() < 0.5 ? 1 : 2] === Number(p.a)) midHit++;
        if (opts[Math.floor(Math.random() * 4)] === String(p.a)) rand++;
      }
    }
    return { midPct: (midHit / n) * 100, randPct: (rand / n) * 100, n, over3 };
  }, SEM);
  console.log(`  무작위 찍기(대조군): ${guess.randPct.toFixed(1)}%  · 가운데 찍기: ${guess.midPct.toFixed(1)}%  (n=${guess.n})`);
  ok(guess.midPct < 32, `가운데 찍기 승률 < 32% (실측 ${guess.midPct.toFixed(1)}% · 구버전 45.6%)`);
  ok(guess.over3 === 0, `오답을 4개 이상 담은 문항 0개 (실측 ${guess.over3} — 4개면 런타임이 무작위 추출)`);

  // ── ③ 세션 내 확장 간격 ──
  console.log(`\n[③ 세션 내 확장 간격]`);
  const srs = await page.evaluate(async () => {
    const LL = await import("./learnLoop.js");
    const run = (correctSeq) => {
      localStorage.removeItem("mathcastle:wrongnote");
      LL.startSession("__qa__");
      const p = { q: "__qa__ 1 + 1", a: "2", d: ["1", "3", "4"], t: 1 };
      LL.recordWrong(p, 1);
      let wave = 1; const gaps = [];
      for (let i = 0; i < correctSeq.length; i++) {
        let w = wave, got = null;
        while (!got && w < wave + 80) { got = LL.popDueReview(w); if (!got) w++; }
        if (!got) break;
        gaps.push(w - wave); wave = w;
        if (correctSeq[i]) LL.recordCorrect(got.problem, wave, true);
        else LL.recordWrong(got.problem, wave, true);
      }
      return gaps;
    };
    const allCorrect = run([true, true, true]);
    const graduated = LL.pendingReviewCount();
    const thenWrong = run([true, false, false]);
    localStorage.removeItem("mathcastle:wrongnote");
    return { allCorrect, graduated, thenWrong };
  });
  console.log(`  계속 맞힘: ${srs.allCorrect.join(" → ")} 웨이브 · 맞힘→틀림: ${srs.thenWrong.join(" → ")}`);
  ok(JSON.stringify(srs.allCorrect) === JSON.stringify([3, 7, 15]), "정답 시 3 → 7 → 15로 확장 (구버전 3→3→3)");
  ok(srs.graduated === 0, "3단계 통과 후 세션 큐에서 졸업");
  ok(JSON.stringify(srs.thenWrong) === JSON.stringify([3, 7, 3]), "오답 시 간격이 처음으로 복귀 (라이트너)");

  // ── ④ 날짜 단위 간격 반복 ──
  console.log(`\n[④ 날짜 단위 간격 반복]`);
  const box = await page.evaluate(async () => {
    const LL = await import("./learnLoop.js");
    localStorage.removeItem("mathcastle:wrongnote");
    LL.startSession("__qa__");
    const p = { q: "__qa__ 7 + 7", a: "14", d: ["13", "15", "16"], t: 1 };
    LL.recordWrong(p, 1);
    const today = LL.todayIndex();
    const seq = [LL.getWrongNote("__qa__")[0].due - today];
    for (let i = 0; i < 4; i++) {
      LL.recordCorrect(p, 1, true);
      const l = LL.getWrongNote("__qa__");
      if (!l.length) { seq.push("졸업"); break; }
      seq.push(l[0].due - today);
    }
    localStorage.removeItem("mathcastle:wrongnote");
    return seq;
  });
  console.log(`  맞힐 때마다 예정일: ${box.join("일 → ")}`);
  ok(JSON.stringify(box) === JSON.stringify([1, 3, 7, 16, "졸업"]), "1일 → 3일 → 7일 → 16일 → 졸업");

  // ── ⑤ 오답노트 라운드로빈 (tail starvation) ──
  console.log(`\n[⑤ 오답노트 라운드로빈]`);
  const rr = await page.evaluate(async () => {
    const LL = await import("./learnLoop.js");
    localStorage.removeItem("mathcastle:wrongnote");
    const seen = new Set();
    let id = 0, slots = 0;
    for (let s = 1; s <= 10; s++) {
      const seeded = LL.startSession("__qa__");
      slots += seeded;
      for (let w = 1; w <= 10; w++) {
        const r = LL.popDueReview(w);
        if (r) { seen.add(r.problem.q); LL.recordWrong(r.problem, w, true); }
      }
      for (let k = 0; k < 5; k++)
        LL.recordWrong({ q: `__qa__ p${id++}`, a: String(id + 10), d: ["1", "2", "3"], t: 1 }, 20 + k);
    }
    const note = LL.getWrongNote("__qa__").length;
    localStorage.removeItem("mathcastle:wrongnote");
    return { distinct: seen.size, slots, note };
  });
  console.log(`  10판 · 노트 ${rr.note}문항 · 복습 슬롯 ${rr.slots}개 → 서로 다른 ${rr.distinct}문항`);
  ok(rr.distinct >= rr.slots * 0.85, `슬롯의 85%+를 서로 다른 문항에 배분 (실측 ${rr.distinct}/${rr.slots})`);

  // ── ⑥ v1 마이그레이션 ──
  console.log(`\n[⑥ 구버전 오답노트(v1) 마이그레이션]`);
  const mig = await page.evaluate(async () => {
    const LL = await import("./learnLoop.js");
    localStorage.setItem("mathcastle:wrongnote", JSON.stringify({
      version: 1,
      data: {
        "5-1": [{ q: "936 ÷ 39", a: "24", d: ["25", "23", "26", "22"], t: 1 }],
        "6": [{ q: "12 × 12", a: "144", d: ["145", "143"], t: 1 }],
      },
    }));
    const a = LL.getWrongNote("5-1");
    const b = LL.getWrongNote("6-1");
    const raw = JSON.parse(localStorage.getItem("mathcastle:wrongnote"));
    localStorage.removeItem("mathcastle:wrongnote");
    return { n51: a.length, n61: b.length, ver: raw.version, d: a[0]?.d || [], hasBox: typeof a[0]?.box === "number" };
  });
  console.log(`  5-1 ${mig.n51}문항 · 구 학년키 6→6-1 ${mig.n61}문항 · 오답 [25,23,26,22] → [${mig.d.join(", ")}]`);
  ok(mig.n51 === 1 && mig.n61 === 1, "v1 항목 유실 없이 이관 (구 학년 키 승계 포함)");
  ok(mig.hasBox, "스케줄 필드(box/due) 부여");
  ok(mig.d.length === 3, "오답 3개로 정규화 (구 대칭 오답 폐기)");
  ok(mig.ver === 2, "저장소가 v2로 굳혀짐");

  // ── ⑦ 시간 초과 = 오답 기록 ──
  console.log(`\n[⑦ 시간 초과 처리]`);
  const src = await page.evaluate(async () => (await fetch("./main.js")).text());
  const toBody = src.slice(src.indexOf("function handleTimeOut()"), src.indexOf("function handleTimeOut()") + 1600);
  ok(/learnLoop\.recordWrong/.test(toBody), "handleTimeOut이 recordWrong 호출 (구버전은 기록 없이 넘어감)");
  ok(/getSolutionHint/.test(toBody), "시간 초과에도 풀이 힌트 표시");

  // ── ⑧ 최장 문항이 작은 화면에서 보기를 밀어내지 않는가 ──
  // 실측(2026-07-27): 740×300에서 66자 문항이 보기 4개를 전부 뷰포트 밖으로 밀어냈다.
  // modal-content가 overflow-y:auto라 "스크롤하면 보이긴" 했지만, 제한시간이 도는 중에
  // 초등학생이 모달을 스크롤할 거라 기대하면 안 된다 → 무조건 시간 초과.
  console.log(`\n[⑧ 최장 문항 가독성 — 작은 가로화면]`);
  for (const [w, h, label] of [[740, 300, "phone-small"], [905, 360, "galaxy-real"]]) {
    await page.setViewport({ width: w, height: h });
    await new Promise((r) => setTimeout(r, 500));
    const r = await page.evaluate(async (sem) => {
      const list = (await import(`./problems/grade${sem}.js`)).default;
      const longest = list.reduce((a, c) => (c.q.length > a.q.length ? c : a));
      const ui = await import("./ui.js");
      ui.showMathProblemUI(longest, [longest.a, ...longest.d], () => {});
      await new Promise((r) => setTimeout(r, 300));
      const box = document.getElementById("mathOptions");
      const br = box.getBoundingClientRect();
      const qr = document.getElementById("mathQuestion").getBoundingClientRect();
      document.getElementById("mathModal").classList.remove("show");
      return {
        len: longest.q.length,
        optsVisible: br.bottom <= window.innerHeight + 1 && br.top >= -1,
        optCount: box.querySelectorAll(".math-option").length,
        overflowPx: Math.round(Math.max(0, br.bottom - window.innerHeight)),
        qVisible: qr.top >= -1 && qr.height > 10,
      };
    }, SEM);
    ok(r.optsVisible && r.optCount === 4,
      `${label} ${w}×${h} — 최장 ${r.len}자 문항에서 보기 4개 모두 화면 안 (넘침 ${r.overflowPx}px)`);
    ok(r.qVisible, `${label} — 질문도 화면 안에 표시`);
  }
  await page.setViewport({ width: 1366, height: 768 });

  // ── ⑨ 유형별 제한시간 ──
  console.log(`\n[⑧ 유형(t) 분포]`);
  const times = await page.evaluate(async (sem) => {
    const list = (await import(`./problems/grade${sem}.js`)).default;
    const byT = {};
    for (const p of list) byT[p.t] = (byT[p.t] || 0) + 1;
    return byT;
  }, SEM);
  console.log(`  ${JSON.stringify(times)}`);
  ok(Object.keys(times).length >= 3, "시간등급 3종류 이상 (유형별 차등 제한시간)");
  // v7: 같은 유형 안에서도 문장이 길면 읽는 시간을 더 준다
  const src2 = await page.evaluate(async () => (await fetch("./main.js")).text());
  ok(/READ_MS_PER_CHAR_LOW/.test(src2) && /problemTimeLimit/.test(src2),
    "제한시간이 문항 길이에 비례해 늘어남 (긴 문장제가 '못 읽어서' 틀리지 않게)");

  console.log(`\n${"=".repeat(52)}\n통과 ${pass} · 실패 ${fail}`);
  await cleanup(fail > 0 ? 1 : 0);
} catch (e) {
  console.error("오류:", e.stack || e.message);
  await cleanup(2);
}
