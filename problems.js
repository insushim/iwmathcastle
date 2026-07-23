// problems.js — 학년별 문제 동적 로더
// 문제 데이터는 problems/grade{3,4,5,6}.js로 분할 (초기 번들 1MB 절감 — 웨일북 성능 예산)
// 데이터 생성: node tools/generate-problems.mjs / 검증: node tools/problem-validator.mjs
export const mathProblems = {};

export async function loadGradeProblems(grade) {
  const g = String(grade);
  if (mathProblems[g]) return mathProblems[g];
  const mod = await import(`./problems/grade${g}.js`);
  mathProblems[g] = mod.default;
  return mod.default;
}
