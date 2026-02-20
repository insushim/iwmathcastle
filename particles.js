// particles.js
// 프리미엄 캔버스 파티클 시스템 모듈
// 타워 디펜스 게임 "수학 성 수호자"용 시각 효과 엔진

// ============================================================
// 상수 정의
// ============================================================

/** 파티클 풀 최대 크기 (미리 할당) */
const POOL_SIZE = 500;

/** 파티클 알파가 이 값 미만이면 렌더링 건너뜀 (성능 최적화) */
const ALPHA_THRESHOLD = 0.01;

/** 축하 효과에 사용할 무지개 색상 배열 */
const RAINBOW_COLORS = [
  "#FF0000",
  "#FF7F00",
  "#FFFF00",
  "#00FF00",
  "#0000FF",
  "#4B0082",
  "#9400D3",
  "#FF1493",
  "#00CED1",
  "#FFD700",
];

/** 앰비언트 반딧불 색상 */
const FIREFLY_COLORS = ["#FFFF88", "#FFEE55", "#FFD700", "#AAFFAA", "#88FFCC"];

// ============================================================
// 유틸리티 함수
// ============================================================

/** 주어진 범위의 랜덤 실수 반환 */
function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

/** 각도를 라디안으로 변환 */
function degToRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * 부드러운 이징 함수 (ease-out cubic)
 * 알파 페이드아웃에 사용하여 자연스러운 소멸 효과 생성
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 부드러운 이징 함수 (ease-in cubic)
 * 가속 효과에 사용
 */
function easeInCubic(t) {
  return t * t * t;
}

// ============================================================
// 파티클 시스템 클래스
// ============================================================

export class ParticleSystem {
  /**
   * @param {CanvasRenderingContext2D} ctx - 공유 캔버스 컨텍스트
   */
  constructor(ctx) {
    /** @type {CanvasRenderingContext2D} 렌더링 대상 캔버스 컨텍스트 */
    this.ctx = ctx;

    /**
     * 오브젝트 풀: 미리 할당된 파티클 배열
     * GC 부하를 줄이기 위해 재사용 방식 적용
     * @type {Array<Object>}
     */
    this.pool = [];

    /**
     * 현재 활성화된(화면에 표시 중인) 파티클 목록
     * @type {Array<Object>}
     */
    this.activeParticles = [];

    /**
     * 화면 플래시 효과 상태
     * @type {{ active: boolean, color: string, alpha: number, duration: number, elapsed: number }}
     */
    this.screenFlashState = {
      active: false,
      color: "#FFFFFF",
      alpha: 0,
      duration: 0,
      elapsed: 0,
    };

    /**
     * 충격파(쇼크웨이브) 효과 목록
     * 파티클과 별도 관리 (원형 링 렌더링)
     * @type {Array<Object>}
     */
    this.shockwaves = [];

    /**
     * 앰비언트 반딧불 타이머 (자동 생성 간격 제어)
     * @type {number}
     */
    this.ambientTimer = 0;

    // 풀 초기화: POOL_SIZE 개의 파티클 객체를 미리 생성
    this._initPool();
  }

  // --------------------------------------------------------
  // 오브젝트 풀 관리
  // --------------------------------------------------------

  /** 파티클 풀을 미리 할당하여 초기화 */
  _initPool() {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool.push(this._createParticleObject());
    }
  }

  /** 빈 파티클 객체 생성 (풀 초기화용) */
  _createParticleObject() {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0,
      size: 0,
      color: "#FFFFFF",
      alpha: 1,
      type: "default", // 파티클 유형: default, explosion, trail, sparkle, celebration, ambient, text
      active: false,
      // 추가 속성 (유형별로 다르게 사용)
      gravity: 0, // 중력 가속도
      friction: 1, // 마찰 계수 (1=마찰 없음, 0.9=약간 감속)
      rotation: 0, // 회전 각도 (라디안)
      rotationSpeed: 0, // 회전 속도
      scaleDecay: false, // 크기 감소 여부
      glowSize: 0, // 발광 효과 크기 (shadowBlur)
      glowColor: "", // 발광 색상
      text: "", // 텍스트 파티클용 문자열
      fontSize: 16, // 텍스트 폰트 크기
      useGradient: false, // 그라디언트 채우기 사용 여부
      gradientInner: "", // 그라디언트 내부 색상
      gradientOuter: "", // 그라디언트 외부 색상
      shape: "circle", // 모양: circle, rect, star, diamond
    };
  }

  /**
   * 풀에서 비활성 파티클을 가져와 활성화
   * 풀이 비어있으면 새로 생성 (드문 경우)
   * @returns {Object|null} 활성화된 파티클 또는 null (풀 소진 시)
   */
  _acquire() {
    let particle = this.pool.pop();
    if (!particle) {
      // 풀 소진 시 새로 생성 (경고: 성능 저하 가능)
      particle = this._createParticleObject();
    }
    particle.active = true;
    this.activeParticles.push(particle);
    return particle;
  }

  /**
   * 파티클을 비활성화하고 풀에 반환
   * @param {Object} particle - 반환할 파티클
   */
  _release(particle) {
    particle.active = false;
    this.pool.push(particle);
  }

  /**
   * 파티클 속성을 설정하는 헬퍼
   * @param {Object} p - 파티클 객체
   * @param {Object} props - 설정할 속성들
   */
  _setup(p, props) {
    // 기본값 리셋
    p.gravity = 0;
    p.friction = 1;
    p.rotation = 0;
    p.rotationSpeed = 0;
    p.scaleDecay = false;
    p.glowSize = 0;
    p.glowColor = "";
    p.text = "";
    p.fontSize = 16;
    p.useGradient = false;
    p.gradientInner = "";
    p.gradientOuter = "";
    p.shape = "circle";

    // 전달된 속성 적용
    Object.assign(p, props);
  }

  // --------------------------------------------------------
  // 파티클 효과 생성 메서드
  // --------------------------------------------------------

  /**
   * 폭발 효과: 몬스터 사망 시 방사형으로 퍼지는 파티클
   * 중력 영향을 받으며 서서히 사라짐. 그라디언트 채우기로 프리미엄 품질.
   * @param {number} x - 중심 X 좌표
   * @param {number} y - 중심 Y 좌표
   * @param {string} color - 기본 색상 (예: '#FF4444')
   * @param {number} [count=20] - 생성할 파티클 수
   */
  explosion(x, y, color, count = 20) {
    for (let i = 0; i < count; i++) {
      const p = this._acquire();
      if (!p) return;

      const angle = randomRange(0, Math.PI * 2);
      const speed = randomRange(80, 250);
      const life = randomRange(600, 1200);
      const size = randomRange(3, 8);

      this._setup(p, {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size,
        color,
        alpha: 1,
        type: "explosion",
        gravity: 120, // 아래로 당기는 중력
        friction: 0.96, // 약간의 공기 저항
        scaleDecay: true, // 크기 점차 감소
        glowSize: 12, // 발광 효과
        glowColor: color,
        useGradient: true, // 그라디언트 채우기
        gradientInner: "#FFFFFF",
        gradientOuter: color,
        shape: Math.random() > 0.6 ? "diamond" : "circle",
      });
    }
  }

  /**
   * 트레일 효과: 발사체 뒤에 따라오는 작은 파티클
   * 빠르게 사라지며 작은 크기로 궤적 표현
   * @param {number} x - X 좌표
   * @param {number} y - Y 좌표
   * @param {string} color - 트레일 색상
   */
  trail(x, y, color) {
    const count = 2; // 프레임당 소수의 파티클 생성 (성능 고려)
    for (let i = 0; i < count; i++) {
      const p = this._acquire();
      if (!p) return;

      const life = randomRange(150, 350);

      this._setup(p, {
        x: x + randomRange(-3, 3),
        y: y + randomRange(-3, 3),
        vx: randomRange(-15, 15),
        vy: randomRange(-15, 15),
        life,
        maxLife: life,
        size: randomRange(1.5, 3.5),
        color,
        alpha: 0.8,
        type: "trail",
        friction: 0.92,
        glowSize: 6,
        glowColor: color,
      });
    }
  }

  /**
   * 반짝임 효과: 타워 공격 시 반짝이는 파티클
   * 위로 천천히 떠오르며 깜빡이는 느낌
   * @param {number} x - X 좌표
   * @param {number} y - Y 좌표
   * @param {string} color - 반짝임 색상
   */
  sparkle(x, y, color) {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const p = this._acquire();
      if (!p) return;

      const life = randomRange(400, 800);
      const angle = randomRange(0, Math.PI * 2);

      this._setup(p, {
        x: x + randomRange(-15, 15),
        y: y + randomRange(-15, 15),
        vx: Math.cos(angle) * randomRange(10, 40),
        vy: -randomRange(20, 60), // 위로 떠오름
        life,
        maxLife: life,
        size: randomRange(2, 5),
        color,
        alpha: 1,
        type: "sparkle",
        friction: 0.95,
        rotation: randomRange(0, Math.PI * 2),
        rotationSpeed: randomRange(-3, 3),
        glowSize: 8,
        glowColor: color,
        shape: "star",
      });
    }
  }

  /**
   * 축하 효과: 수학 문제 정답 시 무지개 색 컨페티 폭발
   * 다양한 색상과 모양으로 화려한 축하 연출
   * @param {number} x - 중심 X 좌표
   * @param {number} y - 중심 Y 좌표
   */
  celebration(x, y) {
    const count = 40;
    for (let i = 0; i < count; i++) {
      const p = this._acquire();
      if (!p) return;

      const color =
        RAINBOW_COLORS[Math.floor(Math.random() * RAINBOW_COLORS.length)];
      const angle = randomRange(0, Math.PI * 2);
      const speed = randomRange(100, 350);
      const life = randomRange(800, 1800);

      // 다양한 모양을 랜덤 배정
      const shapes = ["circle", "rect", "star", "diamond"];
      const shape = shapes[Math.floor(Math.random() * shapes.length)];

      this._setup(p, {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - randomRange(50, 150), // 위쪽으로 편향
        life,
        maxLife: life,
        size: randomRange(3, 9),
        color,
        alpha: 1,
        type: "celebration",
        gravity: 180, // 무거운 중력 (컨페티가 떨어지는 느낌)
        friction: 0.97,
        rotation: randomRange(0, Math.PI * 2),
        rotationSpeed: randomRange(-5, 5),
        scaleDecay: false, // 크기 유지 (컨페티는 줄어들지 않음)
        glowSize: 4,
        glowColor: color,
        shape,
      });
    }
  }

  /**
   * 앰비언트 효과: 배경에 천천히 떠다니는 반딧불 파티클
   * update()에서 자동으로 호출 가능. 수동 호출도 지원.
   */
  ambient() {
    const canvas = this.ctx.canvas;
    const count = 2;
    for (let i = 0; i < count; i++) {
      const p = this._acquire();
      if (!p) return;

      const color =
        FIREFLY_COLORS[Math.floor(Math.random() * FIREFLY_COLORS.length)];
      const life = randomRange(3000, 6000);

      this._setup(p, {
        x: randomRange(0, canvas.width),
        y: randomRange(0, canvas.height),
        vx: randomRange(-8, 8),
        vy: randomRange(-12, -3), // 천천히 위로 상승
        life,
        maxLife: life,
        size: randomRange(1.5, 3.5),
        color,
        alpha: 0, // 서서히 나타남 (update에서 처리)
        type: "ambient",
        friction: 1, // 일정한 속도 유지
        glowSize: 15, // 강한 발광 (반딧불 느낌)
        glowColor: color,
      });
    }
  }

  /**
   * 화면 플래시 효과: 짧은 화면 전체 오버레이
   * 강력한 공격이나 피격 시 사용
   * @param {string} [color='#FFFFFF'] - 플래시 색상
   * @param {number} [duration=200] - 지속 시간 (ms)
   * @param {number} [maxAlpha=0.3] - 최대 불투명도
   */
  screenFlash(color = "#FFFFFF", duration = 200, maxAlpha = 0.3) {
    this.screenFlashState = {
      active: true,
      color,
      alpha: maxAlpha,
      duration,
      elapsed: 0,
    };
  }

  /**
   * 충격파 효과: 확장되는 원형 링
   * 범위 공격이나 폭발 시 시각적 충격 표현
   * @param {number} x - 중심 X 좌표
   * @param {number} y - 중심 Y 좌표
   * @param {number} [maxRadius=80] - 최종 반지름
   * @param {string} [color='#FFFFFF'] - 링 색상
   * @param {number} [duration=500] - 확장 시간 (ms)
   * @param {number} [lineWidth=3] - 링 두께
   */
  shockwave(
    x,
    y,
    maxRadius = 80,
    color = "#FFFFFF",
    duration = 500,
    lineWidth = 3,
  ) {
    this.shockwaves.push({
      x,
      y,
      currentRadius: 0,
      maxRadius,
      color,
      alpha: 1,
      duration,
      elapsed: 0,
      lineWidth,
    });
  }

  /**
   * 플로팅 텍스트 효과: 위로 떠오르며 사라지는 텍스트
   * 데미지 표시, 보너스 점수, 상태 메시지 등에 활용
   * @param {number} x - X 좌표
   * @param {number} y - Y 좌표
   * @param {string} displayText - 표시할 문자열
   * @param {string} [color='#FFFFFF'] - 텍스트 색상
   * @param {number} [fontSize=18] - 폰트 크기
   */
  text(x, y, displayText, color = "#FFFFFF", fontSize = 18) {
    const p = this._acquire();
    if (!p) return;

    const life = 1200;

    this._setup(p, {
      x,
      y,
      vx: randomRange(-10, 10),
      vy: -randomRange(40, 70), // 위로 떠오름
      life,
      maxLife: life,
      size: 0, // 텍스트는 size 대신 fontSize 사용
      color,
      alpha: 1,
      type: "text",
      friction: 0.97,
      text: displayText,
      fontSize,
      glowSize: 4,
      glowColor: color,
    });
  }

  // --------------------------------------------------------
  // 업데이트 루프
  // --------------------------------------------------------

  /**
   * 모든 활성 파티클과 효과를 업데이트
   * 매 프레임 게임 루프에서 호출
   * @param {number} deltaTime - 이전 프레임 이후 경과 시간 (ms)
   */
  update(deltaTime) {
    // deltaTime을 초 단위로 변환 (물리 계산용)
    const dt = deltaTime / 1000;

    // --- 앰비언트 파티클 자동 생성 ---
    this.ambientTimer += deltaTime;
    if (this.ambientTimer >= 800) {
      this.ambientTimer = 0;
      // 활성 앰비언트 파티클이 너무 많으면 생성 건너뜀
      const ambientCount = this.activeParticles.filter(
        (p) => p.type === "ambient",
      ).length;
      if (ambientCount < 25) {
        this.ambient();
      }
    }

    // --- 파티클 업데이트 (역순 순회로 안전한 삭제) ---
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];

      // 수명 감소
      p.life -= deltaTime;

      // 수명 만료 시 풀에 반환
      if (p.life <= 0) {
        this._release(p);
        this.activeParticles.splice(i, 1);
        continue;
      }

      // 수명 진행률 (0=생성 직후, 1=소멸 직전)
      const lifeProgress = 1 - p.life / p.maxLife;

      // --- 물리 업데이트 ---
      // 중력 적용
      p.vy += p.gravity * dt;

      // 마찰 적용
      p.vx *= p.friction;
      p.vy *= p.friction;

      // 위치 업데이트
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // 회전 업데이트
      p.rotation += p.rotationSpeed * dt;

      // --- 알파(투명도) 업데이트 ---
      switch (p.type) {
        case "explosion":
          // 부드러운 페이드아웃 (easeOutCubic)
          p.alpha = 1 - easeOutCubic(lifeProgress);
          break;

        case "trail":
          // 빠른 페이드아웃
          p.alpha = 0.8 * (1 - lifeProgress * lifeProgress);
          break;

        case "sparkle":
          // 깜빡이는 효과: 사인파로 알파 변조
          p.alpha =
            (1 - lifeProgress) *
            (0.5 + 0.5 * Math.sin(lifeProgress * Math.PI * 6));
          break;

        case "celebration":
          // 후반부에만 서서히 사라짐
          p.alpha =
            lifeProgress < 0.6
              ? 1
              : 1 - easeInCubic((lifeProgress - 0.6) / 0.4);
          break;

        case "ambient":
          // 반딧불: 서서히 나타났다가 서서히 사라짐 (벨 커브)
          if (lifeProgress < 0.2) {
            p.alpha = easeOutCubic(lifeProgress / 0.2) * 0.6;
          } else if (lifeProgress > 0.7) {
            p.alpha = (1 - easeInCubic((lifeProgress - 0.7) / 0.3)) * 0.6;
          } else {
            // 중간 구간: 미세한 밝기 변동 (호흡 효과)
            p.alpha = 0.6 * (0.8 + 0.2 * Math.sin(lifeProgress * Math.PI * 4));
          }
          // 앰비언트 파티클에 약간의 수평 흔들림 추가
          p.vx += Math.sin(lifeProgress * Math.PI * 3) * 0.5;
          break;

        case "text":
          // 처음 20%는 불투명, 이후 서서히 사라짐
          if (lifeProgress < 0.2) {
            p.alpha = 1;
          } else {
            p.alpha = 1 - easeOutCubic((lifeProgress - 0.2) / 0.8);
          }
          // 텍스트 크기 살짝 커지는 효과
          p.fontSize = p.fontSize * (1 + lifeProgress * 0.1);
          break;

        default:
          p.alpha = 1 - lifeProgress;
      }

      // 크기 감소 처리
      if (p.scaleDecay) {
        p.size *= 1 - lifeProgress * 0.3 * dt * 60;
        if (p.size < 0.3) p.size = 0.3;
      }
    }

    // --- 화면 플래시 업데이트 ---
    if (this.screenFlashState.active) {
      this.screenFlashState.elapsed += deltaTime;
      const flashProgress =
        this.screenFlashState.elapsed / this.screenFlashState.duration;
      if (flashProgress >= 1) {
        this.screenFlashState.active = false;
        this.screenFlashState.alpha = 0;
      } else {
        // 즉시 최대 밝기 → 부드럽게 사라짐
        this.screenFlashState.alpha =
          this.screenFlashState.alpha * (1 - easeInCubic(flashProgress));
      }
    }

    // --- 충격파 업데이트 ---
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.elapsed += deltaTime;
      const progress = sw.elapsed / sw.duration;

      if (progress >= 1) {
        this.shockwaves.splice(i, 1);
        continue;
      }

      // 빠르게 확장 후 감속 (easeOutCubic)
      sw.currentRadius = sw.maxRadius * easeOutCubic(progress);
      // 서서히 사라짐
      sw.alpha = 1 - easeOutCubic(progress);
      // 두께도 서서히 얇아짐
      sw.lineWidth = sw.lineWidth * (1 - progress * 0.5);
    }
  }

  // --------------------------------------------------------
  // 렌더링
  // --------------------------------------------------------

  /**
   * 모든 활성 파티클과 효과를 캔버스에 렌더링
   * @param {CanvasRenderingContext2D} [ctx] - 렌더링할 컨텍스트 (미지정 시 생성자에서 받은 ctx 사용)
   */
  render(ctx) {
    const c = ctx || this.ctx;
    if (!c) return;

    // 이전 상태 저장
    c.save();

    // --- 앰비언트 파티클 먼저 렌더링 (배경 레이어) ---
    for (const p of this.activeParticles) {
      if (p.type !== "ambient") continue;
      if (p.alpha < ALPHA_THRESHOLD) continue;
      this._renderParticle(c, p);
    }

    // --- 일반 파티클 렌더링 ---
    for (const p of this.activeParticles) {
      if (p.type === "ambient" || p.type === "text") continue;
      if (p.alpha < ALPHA_THRESHOLD) continue;
      this._renderParticle(c, p);
    }

    // --- 충격파 렌더링 ---
    for (const sw of this.shockwaves) {
      if (sw.alpha < ALPHA_THRESHOLD) continue;
      this._renderShockwave(c, sw);
    }

    // --- 텍스트 파티클 렌더링 (최상위 레이어) ---
    for (const p of this.activeParticles) {
      if (p.type !== "text") continue;
      if (p.alpha < ALPHA_THRESHOLD) continue;
      this._renderTextParticle(c, p);
    }

    // --- 화면 플래시 렌더링 (가장 위) ---
    if (
      this.screenFlashState.active &&
      this.screenFlashState.alpha >= ALPHA_THRESHOLD
    ) {
      c.globalAlpha = this.screenFlashState.alpha;
      c.fillStyle = this.screenFlashState.color;
      c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    }

    // 상태 복원
    c.restore();
  }

  /**
   * 개별 파티클 렌더링 (텍스트 제외)
   * @param {CanvasRenderingContext2D} c - 캔버스 컨텍스트
   * @param {Object} p - 파티클 객체
   */
  _renderParticle(c, p) {
    c.save();
    c.globalAlpha = p.alpha;

    // 발광 효과 (shadowBlur)
    if (p.glowSize > 0) {
      c.shadowBlur = p.glowSize * p.alpha; // 알파에 비례하여 발광도 감소
      c.shadowColor = p.glowColor || p.color;
    }

    // 위치로 이동 및 회전 적용
    c.translate(p.x, p.y);
    if (p.rotation !== 0) {
      c.rotate(p.rotation);
    }

    // 채우기 스타일 결정 (그라디언트 또는 단색)
    let fillStyle;
    if (p.useGradient && p.size > 1) {
      const gradient = c.createRadialGradient(0, 0, 0, 0, 0, p.size);
      gradient.addColorStop(0, p.gradientInner);
      gradient.addColorStop(0.4, p.color);
      gradient.addColorStop(1, p.gradientOuter + "00"); // 외곽 투명
      fillStyle = gradient;
    } else {
      fillStyle = p.color;
    }

    c.fillStyle = fillStyle;

    // 모양별 렌더링
    switch (p.shape) {
      case "circle":
        c.beginPath();
        c.arc(0, 0, p.size, 0, Math.PI * 2);
        c.fill();
        break;

      case "rect":
        c.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
        break;

      case "star":
        this._drawStar(c, 0, 0, 4, p.size, p.size * 0.4);
        c.fill();
        break;

      case "diamond":
        c.beginPath();
        c.moveTo(0, -p.size);
        c.lineTo(p.size * 0.6, 0);
        c.lineTo(0, p.size);
        c.lineTo(-p.size * 0.6, 0);
        c.closePath();
        c.fill();
        break;

      default:
        c.beginPath();
        c.arc(0, 0, p.size, 0, Math.PI * 2);
        c.fill();
    }

    c.restore();
  }

  /**
   * 텍스트 파티클 렌더링
   * @param {CanvasRenderingContext2D} c - 캔버스 컨텍스트
   * @param {Object} p - 텍스트 파티클 객체
   */
  _renderTextParticle(c, p) {
    c.save();
    c.globalAlpha = p.alpha;

    // 발광 효과
    if (p.glowSize > 0) {
      c.shadowBlur = p.glowSize * p.alpha;
      c.shadowColor = p.glowColor || p.color;
    }

    const size = Math.round(p.fontSize);
    c.font = `bold ${size}px "Do Hyeon", sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";

    // 외곽선 (가독성 향상)
    c.strokeStyle = "rgba(0, 0, 0, 0.7)";
    c.lineWidth = 3;
    c.strokeText(p.text, p.x, p.y);

    // 본문
    c.fillStyle = p.color;
    c.fillText(p.text, p.x, p.y);

    c.restore();
  }

  /**
   * 충격파(원형 링) 렌더링
   * @param {CanvasRenderingContext2D} c - 캔버스 컨텍스트
   * @param {Object} sw - 충격파 객체
   */
  _renderShockwave(c, sw) {
    c.save();
    c.globalAlpha = sw.alpha;
    c.strokeStyle = sw.color;
    c.lineWidth = sw.lineWidth;

    // 이중 링으로 두께감 표현
    c.shadowBlur = 10 * sw.alpha;
    c.shadowColor = sw.color;

    c.beginPath();
    c.arc(sw.x, sw.y, sw.currentRadius, 0, Math.PI * 2);
    c.stroke();

    // 안쪽에 희미한 보조 링 추가
    if (sw.currentRadius > 5) {
      c.globalAlpha = sw.alpha * 0.3;
      c.lineWidth = sw.lineWidth * 0.5;
      c.beginPath();
      c.arc(sw.x, sw.y, sw.currentRadius * 0.7, 0, Math.PI * 2);
      c.stroke();
    }

    c.restore();
  }

  /**
   * 별 모양 경로 그리기
   * @param {CanvasRenderingContext2D} c - 캔버스 컨텍스트
   * @param {number} cx - 중심 X
   * @param {number} cy - 중심 Y
   * @param {number} spikes - 꼭짓점 수
   * @param {number} outerRadius - 외부 반지름
   * @param {number} innerRadius - 내부 반지름
   */
  _drawStar(c, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;

    c.beginPath();
    c.moveTo(cx, cy - outerRadius);

    for (let i = 0; i < spikes; i++) {
      c.lineTo(
        cx + Math.cos(rot) * outerRadius,
        cy + Math.sin(rot) * outerRadius,
      );
      rot += step;
      c.lineTo(
        cx + Math.cos(rot) * innerRadius,
        cy + Math.sin(rot) * innerRadius,
      );
      rot += step;
    }

    c.lineTo(cx, cy - outerRadius);
    c.closePath();
  }

  // --------------------------------------------------------
  // 유틸리티
  // --------------------------------------------------------

  /**
   * 모든 활성 파티클과 효과를 즉시 제거
   * 게임 리셋이나 씬 전환 시 호출
   */
  clear() {
    // 모든 활성 파티클을 풀에 반환
    for (const p of this.activeParticles) {
      this._release(p);
    }
    this.activeParticles.length = 0;
    this.shockwaves.length = 0;
    this.screenFlashState.active = false;
    this.screenFlashState.alpha = 0;
    this.ambientTimer = 0;
  }

  /**
   * 현재 활성 파티클 수 반환 (디버그/모니터링용)
   * @returns {number}
   */
  get activeCount() {
    return this.activeParticles.length;
  }

  /**
   * 풀에 남은 여유 파티클 수 반환
   * @returns {number}
   */
  get poolAvailable() {
    return this.pool.length;
  }
}
