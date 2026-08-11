// boot.js — main.js(모듈)보다 먼저 동기 실행되어야 하는 최소 부팅 코드.
// 인라인 <script>였으나 CSP에서 'unsafe-inline'을 빼기 위해 외부 파일로 분리했다
// (2026-07-27, 불특정 다수 초등학생 공개 대비).
(function () {
  // 구 배포 주소(GitHub Pages)는 랭킹 API가 없음 — 정식 주소로 자동 이동
  if (location.hostname.endsWith("github.io")) {
    location.replace("https://mathcastle.pages.dev" + location.search);
    return;
  }

  // ---------- v8: 전역 오류 안전망 ----------
  // 그동안 예외 처리는 개별 함수의 국소 try/catch뿐이었다. 그 밖에서 터진 예외는
  // 콘솔에만 남고, 아이 화면에는 아무 설명 없이 멈춘 게임만 남았다.
  // 여기서 하는 일은 두 가지뿐이다: ① 아이에게 무슨 일인지 한 줄로 알려주고
  // ② 새로고침이라는 탈출구를 준다. 오류를 삼켜서 감추지는 않는다(콘솔엔 그대로 남는다).
  var shown = false;
  function showFatalNotice(what) {
    if (shown) return;
    shown = true;
    try {
      var box = document.createElement("div");
      box.id = "fatalNotice";
      box.setAttribute("role", "alert");
      var msg = document.createElement("div");
      msg.className = "fatal-msg";
      msg.textContent = "앗, 문제가 생겼어요 😥 새로고침하면 이어서 할 수 있어요.";
      var sub = document.createElement("div");
      sub.className = "fatal-sub";
      sub.textContent = String(what || "").slice(0, 120);
      var btn = document.createElement("button");
      btn.className = "fatal-btn";
      btn.type = "button";
      btn.textContent = "🔄 새로고침";
      btn.addEventListener("click", function () { location.reload(); });
      box.appendChild(msg);
      box.appendChild(sub);
      box.appendChild(btn);
      (document.body || document.documentElement).appendChild(box);
    } catch (e) {
      /* 안내조차 못 띄우는 상황이면 더 할 수 있는 게 없다 */
    }
  }

  window.addEventListener("error", function (e) {
    // 이미지·오디오 로드 실패(스프라이트 한 장 없음 등)로 게임을 멈춰 세우지는 않는다
    if (e && e.target && e.target !== window && e.target.tagName) return;
    showFatalNotice(e && e.message);
  });
  window.addEventListener("unhandledrejection", function (e) {
    showFatalNotice(e && e.reason && (e.reason.message || e.reason));
  });
  window.__mathcastleFatalShown = function () { return shown; };
})();
