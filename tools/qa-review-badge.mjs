#!/usr/bin/env node
// tools/qa-review-badge.mjs — v9 복습 진행도가 **진짜 마스터리**를 말하는가
//
// 사용자 질문: "한번 틀렸던 문제가 맞췄는데 3번째 나오기도 하던데 원래 그런가?"
// → 원래 그렇다(라이트너 간격 반복). 결함은 그 사실을 화면이 말해 주지 않은 것.
//
// ⚠️ 이 게이트가 지키는 진짜 불변식: 배지가 **세션 큐(stage, 상한 3)**가 아니라
//    **오답노트 상자(box, 상한 4 · 1·3·7·16일)**를 읽어야 한다.
//    세션 stage로 축하하면, 세션에서 3번 맞힌 문제에 "완전히 내 거!"를 띄워 놓고
//    box는 3이라 16일 뒤 그 문제가 복습으로 다시 나온다 — 앱이 아이에게 거짓말을 한다.
//
// 사용: node tools/qa-review-badge.mjs [포트=8844]

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}`)); };

console.log("\n[① 두 카운터가 섞이지 않았는가]");
{
  const src = readFileSync(join(ROOT, "learnLoop.js"), "utf8");
  ok(/export const BOX_DAYS = \[1, 3, 7, 16\]/.test(src), "영속 노트 간격 [1,3,7,16] 유지");
  ok(/const REVIEW_INTERVALS = \[3, 7, 15\]/.test(src), "세션 큐 간격 [3,7,15] 유지(설계 불변)");
  ok(/export function noteProgress\(/.test(src), "노트 상자 진행도 조회 API 존재");
  ok(/sessionCleared/.test(src) && /graduated/.test(src),
    "recordCorrect가 세션 졸업과 노트 졸업을 구분해 돌려준다");

  const m = readFileSync(join(ROOT, "main.js"), "utf8");
  ok(/learnLoop\.noteProgress\(problem, selectedDifficulty\)/.test(m),
    "복습 배지가 노트 상자(noteProgress)를 읽는다");
  ok(/mastery\.graduated/.test(m) && /이제 완전히 내 거/.test(m),
    "'완전히 내 거' 축하는 노트 졸업(graduated)에서만 나온다");
  ok(/mastery\.sessionCleared/.test(m) && /오늘은 이 문제 통과/.test(m),
    "세션 졸업은 '오늘은 통과'로 문구를 분리");
  ok(/아쉬워요! 기본기부터 한 번 더/.test(m), "되돌아갈 때 회복 문구 존재(좌절 완충)");
  ok(!/복습 1\/3|복습 2\/3|복습 3\/3/.test(m), "세션 stage 기반 'N/3' 표기 없음");
}

console.log("\n[② 진행도 계산이 실제로 맞는가 — 순수 로직 시뮬]");
{
  // localStorage 없이 learnLoop를 돌린다(노드 환경). 상자 승급/강등만 본다.
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const L = await import("../learnLoop.js");
  L.startSession("5-1");
  const prob = { q: "3 + 4 = ?", a: "7", d: ["6", "8", "5"], t: 1, u: "u1" };

  L.recordWrong(prob, 1);
  let p0 = L.noteProgress(prob, "5-1");
  ok(p0 && p0.box === 0 && p0.max === 4, `오답 직후 진행도 ${p0?.box}/${p0?.max} (0/4이어야 한다)`);

  const r1 = L.recordCorrect(prob, 4, true);
  ok(r1.box === 1 && !r1.graduated, `1회 정답 → ${r1.box}/${r1.max}, 졸업=${r1.graduated}`);
  const r2 = L.recordCorrect(prob, 11, true);
  const r3 = L.recordCorrect(prob, 26, true);
  ok(r3.sessionCleared === true, "3회 정답에서 **세션** 큐 졸업(오늘은 그만)");
  ok(r3.graduated === false, "3회 정답에서는 아직 노트 졸업이 아니다 — 여기서 축하하면 거짓말");
  const r4 = L.recordCorrect(prob, 40, true);
  ok(r4.graduated === true, `4회 정답에서 노트 졸업(box ${r2.box}→${r3.box}→${r4.box}/4)`);
  ok(L.noteProgress(prob, "5-1") === null, "졸업 후 노트에서 제거됨");

  // 틀리면 1번 상자로 되돌아간다(라이트너)
  L.recordWrong(prob, 50);
  const back = L.noteProgress(prob, "5-1");
  ok(back && back.box === 0, `되돌아간 진행도 ${back?.box}/4 (라이트너 — 틀리면 처음부터)`);
}

console.log(`\n결과: ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
