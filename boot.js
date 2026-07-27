// boot.js — main.js(모듈)보다 먼저 동기 실행되어야 하는 최소 부팅 코드.
// 인라인 <script>였으나 CSP에서 'unsafe-inline'을 빼기 위해 외부 파일로 분리했다
// (2026-07-27, 불특정 다수 초등학생 공개 대비).
(function () {
  // 구 배포 주소(GitHub Pages)는 랭킹 API가 없음 — 정식 주소로 자동 이동
  if (location.hostname.endsWith("github.io")) {
    location.replace("https://mathcastle.pages.dev" + location.search);
  }
})();
