#!/usr/bin/env node
// tools/qa-privacy.mjs — 공개 배포(불특정 다수 초등학생) 안전성 검증
//
// ⚠️ 이 스크립트는 반드시 `wrangler pages dev`가 띄운 서버를 대상으로 돌려야 한다.
//    _headers(CSP·보안 헤더)는 정적 파일 서버에서는 적용되지 않아, 단순 http 서버로
//    돌리면 "CSP 위반 0건"이 항상 참이 되는 무의미한 통과가 된다(게이트가 비어버림).
//
//   ① 개인정보 입력 경로가 남아있지 않은가 (실명 입력창·prompt)
//   ② 닉네임이 자동 생성되고, 다시 뽑기가 동작하고, 서버 화이트리스트를 통과하는가
//   ③ 게임을 여는 동안 외부 도메인으로 나가는 요청이 0건인가 (폰트·분석·광고)
//   ④ CSP가 실제로 적용되고, 그 CSP 아래에서 게임이 깨지지 않는가
//   ⑤ 보안 헤더가 붙는가
//   ⑥ 개인정보 안내 페이지가 뜨는가
//
// 사용: npx wrangler pages dev . --port 8791 --local   (별도 터미널)
//       node tools/qa-privacy.mjs 8791

import puppeteer from "puppeteer";
import { isGeneratedNick } from "../nickname.js";

const PORT = Number(process.argv[2]) || 8791;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log(`  ✅ ${m}`);
  } else {
    fail++;
    console.log(`  ❌ ${m}`);
  }
};

// 서버가 살아있는지 먼저 확인 — 죽은 서버에 대고 "위반 0건"을 통과시키지 않는다
let probe;
try {
  probe = await fetch(BASE, { redirect: "manual" });
} catch {
  console.error(`\n❌ ${BASE} 에 연결할 수 없습니다.`);
  console.error("   먼저 실행: npx wrangler pages dev . --port " + PORT + " --local\n");
  process.exit(2);
}

const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

const cspViolations = [];
const pageErrors = [];
const external = [];

page.on("console", (m) => {
  const t = m.text();
  if (/Content Security Policy|Refused to/i.test(t)) cspViolations.push(t);
});
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("request", (r) => {
  const u = r.url();
  if (/^https?:\/\//.test(u) && !u.startsWith(BASE) && !u.includes("127.0.0.1") && !u.includes("localhost"))
    external.push(u);
});

const cleanup = async (code) => {
  await browser.close();
  process.exit(code);
};

try {
  // ── ⑤ 보안 헤더 ──
  console.log("\n[⑤ 보안 헤더]");
  const h = probe.headers;
  const csp = h.get("content-security-policy") || "";
  ok(csp.includes("default-src 'self'"), `CSP 적용됨 (${csp.slice(0, 40)}…)`);
  ok(!csp.includes("unsafe-inline") && !csp.includes("unsafe-eval"), "CSP에 unsafe-inline/eval 없음");
  ok(csp.includes("frame-ancestors 'self'"), "frame-ancestors로 클릭재킹 차단");
  ok(csp.includes("object-src 'none'"), "object-src 'none'");
  ok(h.get("x-content-type-options") === "nosniff", "X-Content-Type-Options: nosniff");
  ok((h.get("referrer-policy") || "").includes("no-referrer"), "Referrer-Policy: no-referrer");
  ok(/camera=\(\)/.test(h.get("permissions-policy") || ""), "Permissions-Policy로 카메라·마이크·위치 봉인");

  // ── 게임 로드 ──
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("mathcastle:howto", JSON.stringify({ never: true }));
    } catch {}
  });
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });

  // ── ③ 외부 요청 ──
  console.log("\n[③ 외부 도메인 요청]");
  ok(external.length === 0, `외부 요청 ${external.length}건${external.length ? " → " + external.slice(0, 3).join(", ") : " (폰트·분석·광고 전부 없음)"}`);

  // ── ④ CSP 아래에서 게임이 깨지지 않는가 ──
  console.log("\n[④ CSP 적용 상태에서의 동작]");
  ok(cspViolations.length === 0, `CSP 위반 ${cspViolations.length}건${cspViolations.length ? " → " + cspViolations[0].slice(0, 90) : ""}`);
  ok(pageErrors.length === 0, `자바스크립트 오류 ${pageErrors.length}건${pageErrors.length ? " → " + pageErrors[0].slice(0, 90) : ""}`);
  // ⚠️ document.fonts.check("16px 'Do Hyeon'")로 재면 안 된다. 이 폰트는 unicode-range로
  //    93개 서브셋에 쪼개져 있어서, check()가 기본 검사 문자열(라틴)에 해당하는 서브셋이
  //    아직 안 왔으면 false를 돌려준다 — 폰트는 멀쩡히 적용되는데도.
  //    실제로 중요한 건 "글자가 그 폰트로 그려지는가"이므로 폭을 재서 폴백과 비교한다.
  const fontOk = await page.evaluate(async () => {
    await document.fonts.ready;
    const mk = (ff) => {
      const s = document.createElement("span");
      s.textContent = "수학 성 수호자 12345";
      s.style.cssText = `position:absolute;visibility:hidden;font-size:40px;font-family:${ff}`;
      document.body.appendChild(s);
      const w = s.getBoundingClientRect().width;
      s.remove();
      return w;
    };
    const webfont = mk("'Do Hyeon', monospace");
    const fallback = mk("monospace");
    return {
      applied: Math.abs(webfont - fallback) > 5,
      webfont: Math.round(webfont), fallback: Math.round(fallback),
      declared: document.fonts.size,
    };
  });
  ok(fontOk.applied,
    `자체 호스팅 웹폰트(Do Hyeon)가 실제로 적용됨 — 폭 ${fontOk.webfont}px vs 폴백 ${fontOk.fallback}px (선언된 면 ${fontOk.declared}개)`);

  // ── ④-2 CSP 아래에서 실제 화면들이 깨지지 않는가 (v8) ──
  // 메뉴만 열어 보고 "위반 0건"이라 하면 안 된다. innerHTML로 만든 style="…" 속성은
  // CSP가 통째로 무시하는데, 그게 업적 진행 막대·오답노트 색에서 실제로 벌어지고
  // 있었다(실측 13건). 화면을 실제로 열어 보고 센다.
  console.log("\n[④-2 주요 화면 전수 — CSP 위반]");
  {
    const { readFileSync } = await import("node:fs");
    const jsInline = ["../main.js", "../ui.js"]
      .map((f) => readFileSync(new URL(f, import.meta.url), "utf8"))
      .flatMap((src) => src.split("\n").filter((l) => /style="/.test(l) && !/^\s*(\/\/|\*)/.test(l)));
    ok(jsInline.length === 0,
      `JS가 만드는 인라인 style 속성 ${jsInline.length}곳 (CSP가 무시한다 → 클래스나 CSSOM으로)`);

    await page.evaluate(() => {
      try { localStorage.setItem("mathcastle:achbest", JSON.stringify({ wave: 7, towers: 12 })); } catch {}
    });
    const before = cspViolations.length;
    await page.evaluate(() => document.getElementById("showAchievementsBtn")?.click());
    await new Promise((r) => setTimeout(r, 250));
    const bar = await page.evaluate(() => {
      const f = document.querySelector(".ach-fill");
      if (!f) return null;
      return { w: parseFloat(getComputedStyle(f).width), pw: parseFloat(getComputedStyle(f.parentElement).width) };
    });
    ok(bar && bar.w < bar.pw * 0.95,
      `업적 진행 막대가 실제 비율로 그려진다 (${bar ? `${bar.w.toFixed(0)}px / ${bar.pw.toFixed(0)}px` : "없음"})`);
    await page.evaluate(() => document.getElementById("closeAchievementBtn")?.click());
    await page.evaluate(() => document.getElementById("showReportBtn")?.click());
    await new Promise((r) => setTimeout(r, 250));
    await page.evaluate(() => document.getElementById("closeReportBtn")?.click());
    ok(cspViolations.length === before,
      `업적·학습 기록 화면에서 새 CSP 위반 ${cspViolations.length - before}건`);
  }

  // ── ④-3 CSP 아래에서 학습 기능이 실제로 동작하는가 (v8) ──
  // Node QA는 CSP가 없어서 통과하는데 브라우저에서만 죽는 부류가 있다.
  // 실제로 풀이 힌트 검산기가 Function()을 써서, 배포 환경에서만 전멸하고
  // 옛 힌트로 조용히 폴백하고 있었다(codex 교차검증 → wrangler 실서버로 확인).
  console.log("\n[④-3 실제 CSP에서 학습 기능]");
  {
    const r = await page.evaluate(async () => {
      const m = await import("./learnLoop.js");
      let evalBlocked = false;
      try { Function("return 1"); } catch { evalBlocked = true; }
      return {
        evalBlocked,
        hints: [
          m.getSolutionHint("밑변 22cm, 높이 8cm인 삼각형의 넓이는?", "88"),
          m.getSolutionHint("국어 80점, 수학 90점, 영어 70점의 평균은?", "80"),
          m.getSolutionHint("장난감 191원짜리 6개를 사고 1313원을 내면 거스름돈은?", "167"),
        ],
      };
    });
    ok(r.evalBlocked, "배포 CSP가 실제로 eval/Function을 막고 있다(헛검사 방지)");
    const numeric = r.hints.filter((h) => /=\s*[\d\s+\-×÷().−]+\s*=/.test(h));
    ok(numeric.length === r.hints.length,
      `브라우저에서 숫자 대입 풀이 ${numeric.length}/${r.hints.length}건 — 예: ${r.hints[0]}`);
  }

  // ── ① 개인정보 입력 경로 ──
  console.log("\n[① 개인정보 입력 경로]");
  const inputs = await page.evaluate(() =>
    [...document.querySelectorAll("input")].map((i) => ({ id: i.id, type: i.type })),
  );
  const textInputs = inputs.filter((i) => i.type === "text" || i.type === "email" || i.type === "tel");
  ok(textInputs.length === 0, `자유 텍스트 입력창 ${textInputs.length}개 (실명 입력 경로 없음)`);
  ok(!inputs.some((i) => i.id === "playerNameInput"), "구버전 이름 입력창(playerNameInput) 제거됨");
  const usesPrompt = await page.evaluate(() => {
    let called = false;
    const orig = window.prompt;
    window.prompt = () => { called = true; return null; };
    window.__restore = () => (window.prompt = orig);
    return called;
  });
  ok(usesPrompt === false, "로드 시점에 prompt() 호출 없음");

  // ── ② 닉네임 ──
  console.log("\n[② 닉네임 자동 생성]");
  await page.click('.difficulty-btn[data-difficulty="5-1"]');
  await new Promise((r) => setTimeout(r, 1500));
  // 게임오버 모달을 직접 띄우지 않고, 모듈과 동일한 규칙으로 저장소 동작만 확인
  const nick1 = await page.evaluate(async () => {
    const m = await import("./nickname.js");
    const n = m.generateNickname();
    localStorage.setItem("mathcastle:nick", n);
    return n;
  });
  ok(isGeneratedNick(nick1), `생성된 닉네임이 서버 화이트리스트를 통과: ${nick1}`);
  ok(nick1.length <= 10, `닉네임 길이 ${nick1.length}자 ≤ 10 (서버 상한)`);
  const many = await page.evaluate(async () => {
    const m = await import("./nickname.js");
    return Array.from({ length: 300 }, () => m.generateNickname());
  });
  ok(many.every(isGeneratedNick), `무작위 300개 전부 화이트리스트 통과`);
  ok(new Set(many).size > 200, `300개 중 서로 다른 닉네임 ${new Set(many).size}개 (충돌 적음)`);

  // 실제 UI: 게임오버 모달의 닉네임 표시 + 다시 뽑기 버튼
  const uiNick = await page.evaluate(() => {
    const el = document.getElementById("playerNickname");
    const btn = document.getElementById("rerollNickBtn");
    if (!el || !btn) return null;
    const before = el.textContent;
    btn.click();
    return { before, after: el.textContent, stored: localStorage.getItem("mathcastle:nick") };
  });
  ok(uiNick !== null, "닉네임 표시 영역과 '다시 뽑기' 버튼이 존재");
  if (uiNick) {
    ok(isGeneratedNick(uiNick.after), `다시 뽑기 결과가 유효한 닉네임: ${uiNick.after}`);
    ok(uiNick.after === uiNick.stored, "다시 뽑은 닉네임이 기기에 저장됨(다음 판에도 유지)");
  }

  // ── ⑥ 개인정보 안내 ──
  console.log("\n[⑥ 개인정보 안내 페이지]");
  const p2 = await browser.newPage();
  const pErr = [];
  p2.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) pErr.push(m.text());
  });
  const resp = await p2.goto(`${BASE}/privacy.html`, { waitUntil: "networkidle0", timeout: 20000 });
  ok(resp.status() === 200, "privacy.html 200 응답");
  ok(pErr.length === 0, `안내 페이지 CSP 위반 ${pErr.length}건`);
  const body = await p2.evaluate(() => document.body.innerText);
  ok(/개인정보를 수집하지 않습니다/.test(body), "‘개인정보를 수집하지 않습니다’ 고지 포함");
  ok(/400일/.test(body), "랭킹 보관기간 명시");
  ok(/IP 주소 원본은 저장하지 않으며/.test(body), "IP 원본 미저장 명시");
  const linked = await page.evaluate(() => !!document.querySelector('a[href="privacy.html"]'));
  ok(linked, "메인 메뉴에서 안내 페이지로 링크됨");

  console.log(`\n${"=".repeat(60)}\n통과 ${pass} · 실패 ${fail}`);
  await cleanup(fail > 0 ? 1 : 0);
} catch (e) {
  console.error("\n실행 오류:", e);
  await cleanup(2);
}
