#!/usr/bin/env node
// tools/qa-anticheat.mjs — 치트 방어 E2E (로컬 wrangler pages dev 대상)
// 사전조건: npx wrangler pages dev . --port 8788 실행 중 + 로컬 D1에 schema.sql 적용
// ⚠️ 레이트리밋(이름별 분당 3회 / IP 전체 분당 40회)이 "실패 시도 포함 전 시도"를 집계 → 배치 사이 61초 대기
// 시나리오: ① 점수상한 ② 토큰없음 ③ 즉시제출 ④ 닉네임 화이트리스트 ⑤ 레이트리밋
//          ⑥ 정상제출 ⑦ 토큰재사용 ⑧⑨⑩ 일·주·월 랭킹 반영 ⑪ 학기 화이트리스트 ⑫ NAT 형평성
const BASE = process.env.QA_API_BASE || "http://localhost:8788/api";

// v7: 이름은 자유 입력이 아니라 nickname.js 조합만 허용된다 —
// 정상 제출 시나리오도 실제 생성기가 만든 값을 써야 의미가 있다.
import { generateNickname } from "../nickname.js";
const NICK = Array.from({ length: 9 }, () => generateNickname());
// 같은 이름 레이트리밋 테스트용으로 하나는 고정
const FIXED = NICK[0];

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
};
const wait = (ms, why) => {
  console.log(`  … ${why} (${Math.round(ms / 1000)}초)`);
  return new Promise((r) => setTimeout(r, ms));
};

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

const token = async () => (await post("/session", {})).data.token;

console.log("[치트 방어 E2E]");

// ── 배치 A (제출 시도 3회) ──
{
  const t = await token();
  // v7 ④: 블랙리스트 → 화이트리스트. "금지어를 걸렀는가"가 아니라
  // "nickname.js로 만들 수 없는 문자열은 전부 막았는가"를 본다.
  const blocked = [
    ["실명", "김민준"],
    ["교사 사칭", "김선생님"],
    ["욕설", "시발123"],
    ["전각문자 사칭", "ａｄｍｉｎ"],
    ["제로폭 삽입 사칭", "선​생님"],
    ["마크업 삽입", "<b>x</b>"],
    ["목록에 없는 낱말", "용감한고양이42"],
    ["숫자 자릿수 위반", "용감한호랑이4"],
    ["숫자 없음", "용감한호랑이"],
    ["구버전 기본값", "익명"],
  ];
  for (const [label, nm] of blocked) {
    const r = await post("/submit-score", { name: nm, score: 100, wave: 1, difficulty: "3-1", token: t });
    check(`④ ${label} 차단 (${nm})`, r.status === 400, `status=${r.status} ${JSON.stringify(r.data)}`);
  }
  const r3 = await post("/submit-score", { name: FIXED, score: 1000000, wave: 5, difficulty: "4-1", token: t });
  check("① 웨이브 5 · 100만점 차단 (점수 상한)", r3.status === 400, `status=${r3.status}`);
  const r6 = await post("/submit-score", { name: NICK[1], score: 100, wave: 1, difficulty: "9-9", token: t });
  check("⑪ 학기 화이트리스트 위반 차단", r6.status === 400 && /학기/.test(r6.data.error || ""), `status=${r6.status}`);
}

await wait(61000, "레이트리밋 창 초기화");

// ── 배치 B (제출 시도 2회) ──
{
  const r1 = await post("/submit-score", { name: NICK[2], score: 1000, wave: 3, difficulty: "4-1" });
  check("② 세션 토큰 없는 제출 차단", r1.status === 400, `status=${r1.status}`);
  const t = await token();
  const r2 = await post("/submit-score", { name: NICK[3], score: 1000, wave: 5, difficulty: "4-1", token: t });
  check("③ 즉시 제출 차단 (최소 플레이 시간)", r2.status === 400, `status=${r2.status}`);
}

// ── 배치 C: 정상 제출 + 레이트리밋(이름별) + NAT 형평성 + 토큰 재사용 ──
{
  const tokens = [];
  for (let i = 0; i < 8; i++) tokens.push(await token());
  await wait(61000, "최소 플레이 시간 + 레이트리밋 창 초기화");

  // 같은 이름으로 4회 → 이름별 분당 3회 제한 발동
  const same = [];
  for (let i = 0; i < 4; i++) {
    same.push(await post("/submit-score", { name: FIXED, score: 500 + i, wave: 1, difficulty: "5-1", token: tokens[i] }));
  }
  check("⑥ 정상 제출 성공 (20초+ 플레이)", same[0].status === 200 && same[0].data.success, `status=${same[0].status} ${JSON.stringify(same[0].data)}`);
  check("⑤ 같은 닉네임 분당 4회 → 레이트 리밋", same.filter((r) => r.status === 429).length >= 1, `429 ${same.filter((r) => r.status === 429).length}건`);

  // 서로 다른 이름 4명(같은 IP = 학교 NAT) → 전원 통과해야 한다
  const nat = [];
  for (let i = 0; i < 4; i++) {
    nat.push(await post("/submit-score", { name: NICK[4 + i], score: 600 + i, wave: 1, difficulty: "5-1", token: tokens[4 + i] }));
  }
  check("⑫ 학교 NAT 형평성 — 같은 IP·다른 닉네임 4명 전원 등록", nat.every((r) => r.status === 200), nat.map((r) => r.status).join(","));

  const reuse = await post("/submit-score", { name: NICK[8], score: 500, wave: 1, difficulty: "5-1", token: tokens[4] });
  check("⑦ 토큰 1회용 (재사용 차단)", reuse.status === 400, `status=${reuse.status}`);
}

// ── 랭킹 반영 확인 (일·주·월) ──
{
  // 캐시 키는 쿼리스트링을 무시한다(우회 차단). 제출 시 같은 콜로 캐시를 무효화하므로 즉시 보인다.
  const res = await fetch(`${BASE}/rankings`);
  const data = await res.json();
  const mine = new Set(NICK);
  check("⑧ 일간 랭킹 반영", (data.today || []).some((r) => mine.has(r.name)));
  check("⑨ 주간 랭킹 반영", (data.week || []).some((r) => mine.has(r.name)));
  check("⑩ 월간 랭킹 반영", (data.month || []).some((r) => mine.has(r.name)));
}

console.log(`\n${fail === 0 ? "✅ ANTICHEAT E2E PASS" : "❌ FAIL"} (${pass} PASS / ${fail} FAIL)`);
process.exit(fail ? 1 : 0);
