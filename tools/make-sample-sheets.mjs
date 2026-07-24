#!/usr/bin/env node
// tools/make-sample-sheets.mjs — 교사 검수용 학기별 무작위 40문항 샘플 시트
// 출력: docs/problem-sample-{학기}.md (문제·정답·오답 선택지·제한시간)
// 사용: node tools/make-sample-sheets.mjs

import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEMESTERS = ["3-1", "3-2", "4-1", "4-2", "5-1", "5-2", "6-1", "6-2"];
const T_LABEL = { 1: "20초(한 줄 연산)", 2: "35초(복합 연산)", 3: "45초(도형·측정)", 4: "50초(문장제)" };

let seed = 20260724;
function rnd() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

for (const sem of SEMESTERS) {
  const list = (await import(join(ROOT, "problems", `grade${sem}.js`))).default;
  const idx = new Set();
  while (idx.size < 40) idx.add(Math.floor(rnd() * list.length));
  const sample = [...idx].map((i) => list[i]);
  const lines = [
    `# ${sem} 학기 문제 샘플 (무작위 40문항 / 전체 ${list.length}문항)`,
    "",
    "> 생성: tools/make-sample-sheets.mjs · 데이터: problems/grade" + sem + ".js",
    "> 저학년(3~4학년)은 표기된 제한시간에 +5초 보정됩니다.",
    "",
    "| # | 문제 | 정답 | 오답 선택지(이 중 3개 무작위) | 제한시간 |",
    "|---|---|---|---|---|",
  ];
  sample.forEach((p, i) => {
    lines.push(`| ${i + 1} | ${p.q} | **${p.a}** | ${(p.d || []).join(", ")} | ${T_LABEL[p.t] || "30초"} |`);
  });
  lines.push("", "---", "이상 없으면 승인, 수정 필요 문항은 번호로 알려주세요.");
  writeFileSync(join(ROOT, "docs", `problem-sample-${sem}.md`), lines.join("\n") + "\n");
  console.log(`✅ docs/problem-sample-${sem}.md`);
}
