// problems/units.js — 단원 코드 → 한글 이름표
//
// 문항 파일(grade*.js)에는 짧은 코드만 넣는다(`u:"frac"`). 8학기 × 2400문항에
// 한글 단원명을 그대로 박으면 파일이 통째로 커지고, 이름을 다듬을 때마다 문항
// 20,000개를 다시 생성해야 한다.
//
// 코드 네임스페이스는 **학기별로 독립**이다. 같은 "frac"이 3-1에서는 "분수와 소수",
// 5-1에서는 "분수의 덧셈과 뺄셈"을 가리킨다 — 교육과정 단원명이 학기마다 다르므로
// 그게 맞다.
//
// 이름은 2022 개정 교육과정 단원명(docs/curriculum-map.md)을 따른다.
export const UNIT_NAMES = {
  "3-1": {
    add: "덧셈과 뺄셈", mul: "곱셈", div: "나눗셈",
    frac: "분수와 소수", meas: "길이와 시간", word: "문장제",
  },
  "3-2": {
    mul: "곱셈", div: "나눗셈", frac: "분수",
    meas: "들이와 무게", num: "수 감각", word: "문장제",
  },
  "4-1": {
    big: "큰 수", angle: "각도", mul: "곱셈", div: "나눗셈",
    rule: "규칙 찾기", word: "문장제",
  },
  "4-2": {
    frac: "분수의 덧셈과 뺄셈", dec: "소수의 덧셈과 뺄셈",
    poly: "다각형", blank: "□ 구하기", word: "문장제",
  },
  "5-1": {
    mixed: "자연수의 혼합 계산", divisor: "약수와 배수", reduce: "약분과 통분",
    frac: "분수의 덧셈과 뺄셈", area: "다각형의 둘레와 넓이",
    rule: "규칙과 대응", word: "문장제",
  },
  "5-2": {
    round: "수의 범위와 어림하기", fracmul: "분수의 곱셈", decmul: "소수의 곱셈",
    solid: "직육면체", mean: "평균과 가능성", word: "문장제",
  },
  "6-1": {
    fracdiv: "분수의 나눗셈", decdiv: "소수의 나눗셈", ratio: "비와 비율",
    prism: "각기둥과 각뿔", solid: "직육면체의 부피와 겉넓이",
    mixed: "혼합 계산", word: "문장제",
  },
  "6-2": {
    decdiv: "소수의 나눗셈", prop: "비례식과 비례배분", percent: "백분율의 활용",
    circle: "원의 넓이", cyl: "원기둥과 원뿔", speed: "속력", word: "문장제",
  },
};

/** 단원 코드 → 사람이 읽을 이름. 모르는 코드는 그대로 돌려준다. */
export function unitName(difficulty, code) {
  const table = UNIT_NAMES[String(difficulty)] || {};
  return table[code] || code || "기타";
}

/** 그 학기의 단원 코드 목록 */
export function unitsOf(difficulty) {
  return Object.keys(UNIT_NAMES[String(difficulty)] || {});
}
