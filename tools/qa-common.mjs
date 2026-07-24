// tools/qa-common.mjs — QA 스크립트 공용 헬퍼
// 스토리지 키·payload가 바뀌어도 여기 한 곳만 고치면 되도록 모아둔다.

/**
 * "게임 방법" 안내를 끈 상태로 페이지를 띄운다.
 * 안 끄면 첫 화면을 모달이 덮어 학년 선택 버튼 클릭이 막힌다.
 * ⚠️ goto() 전에 호출해야 한다(evaluateOnNewDocument는 다음 문서 로드부터 적용).
 */
export async function seedSkipHowTo(page) {
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("mathcastle:howto", JSON.stringify({ never: true }));
    } catch {
      /* 저장 실패해도 테스트는 계속 */
    }
  });
}
