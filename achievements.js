// achievements.js - 업적 및 콤보 시스템

/**
 * 업적 시스템 클래스
 * 게임 내 마일스톤/업적을 관리하고 localStorage에 저장한다.
 */
export class AchievementSystem {
  constructor() {
    // 업적 정의 목록
    this.achievements = {
      first_blood: {
        id: "first_blood",
        name: "첫 처치",
        description: "첫 번째 몬스터를 처치하세요",
        condition: (eventType, data) =>
          eventType === "monster_kill" && data.totalKills >= 1,
      },
      wave_5: {
        id: "wave_5",
        name: "초보 수호자",
        description: "웨이브 5를 클리어하세요",
        condition: (eventType, data) =>
          eventType === "wave_clear" && data.wave >= 5,
      },
      wave_10: {
        id: "wave_10",
        name: "숙련 수호자",
        description: "웨이브 10을 클리어하세요",
        condition: (eventType, data) =>
          eventType === "wave_clear" && data.wave >= 10,
      },
      wave_20: {
        id: "wave_20",
        name: "베테랑 수호자",
        description: "웨이브 20을 클리어하세요",
        condition: (eventType, data) =>
          eventType === "wave_clear" && data.wave >= 20,
      },
      wave_50: {
        id: "wave_50",
        name: "전설의 수호자",
        description: "웨이브 50을 클리어하세요",
        condition: (eventType, data) =>
          eventType === "wave_clear" && data.wave >= 50,
      },
      tower_builder: {
        id: "tower_builder",
        name: "건축가",
        description: "타워를 10개 건설하세요",
        condition: (eventType, data) =>
          eventType === "tower_build" && data.totalTowers >= 10,
      },
      tower_master: {
        id: "tower_master",
        name: "건축 대가",
        description: "타워를 30개 건설하세요",
        condition: (eventType, data) =>
          eventType === "tower_build" && data.totalTowers >= 30,
      },
      gold_rush: {
        id: "gold_rush",
        name: "금광 발견",
        description: "골드를 5000 이상 보유하세요",
        condition: (eventType, data) =>
          eventType === "gold_change" && data.gold >= 5000,
      },
      perfect_math: {
        id: "perfect_math",
        name: "수학 천재",
        description: "수학 문제를 10회 연속 정답하세요",
        condition: (eventType, data) =>
          eventType === "math_correct" && data.streak >= 10,
      },
      math_master: {
        id: "math_master",
        name: "수학 박사",
        description: "수학 문제를 30회 연속 정답하세요",
        condition: (eventType, data) =>
          eventType === "math_correct" && data.streak >= 30,
      },
      ultimate_tower: {
        id: "ultimate_tower",
        name: "궁극의 힘",
        description: "궁극 타워를 획득하세요",
        condition: (eventType, data) =>
          eventType === "tower_build" && data.towerType === "ultimate",
      },
      transcendent: {
        id: "transcendent",
        name: "초월자",
        description: "초월 타워를 획득하세요",
        condition: (eventType, data) =>
          eventType === "tower_build" && data.towerType === "transcendent",
      },
      boss_slayer: {
        id: "boss_slayer",
        name: "보스 사냥꾼",
        description: "보스 몬스터를 5마리 처치하세요",
        condition: (eventType, data) =>
          eventType === "boss_kill" && data.totalBossKills >= 5,
      },
      speed_demon: {
        id: "speed_demon",
        name: "스피드 러너",
        description: "웨이브를 15초 이내에 클리어하세요",
        condition: (eventType, data) =>
          eventType === "wave_clear" && data.clearTime <= 15,
      },
      no_damage: {
        id: "no_damage",
        name: "무적 방어",
        description: "웨이브를 성 피해 없이 클리어하세요",
        condition: (eventType, data) =>
          eventType === "wave_clear" && data.damageTaken === 0,
      },
      full_combo: {
        id: "full_combo",
        name: "풀 콤보",
        description: "5배 콤보에 도달하세요",
        condition: (eventType, data) =>
          eventType === "combo_update" && data.multiplier >= 5,
      },
    };

    // localStorage에서 해금된 업적 목록 불러오기
    this.unlocked = this._load();
  }

  /**
   * localStorage에서 해금 상태를 불러온다.
   * @returns {Object} 해금된 업적 ID를 키로, 해금 시각을 값으로 가지는 객체
   */
  _load() {
    try {
      const saved = localStorage.getItem("mathcastle_achievements");
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.warn("업적 데이터 로드 실패:", e);
      return {};
    }
  }

  /**
   * 현재 해금 상태를 localStorage에 저장한다.
   */
  _save() {
    try {
      localStorage.setItem(
        "mathcastle_achievements",
        JSON.stringify(this.unlocked),
      );
    } catch (e) {
      console.warn("업적 데이터 저장 실패:", e);
    }
  }

  /**
   * 이벤트 발생 시 모든 업적 조건을 검사하여 해금 가능한 업적을 해금한다.
   * @param {string} eventType - 이벤트 유형 (monster_kill, wave_clear, tower_build 등)
   * @param {Object} data - 이벤트 데이터
   * @returns {Array} 새로 해금된 업적 정보 배열
   */
  check(eventType, data) {
    const newlyUnlocked = [];

    for (const [id, achievement] of Object.entries(this.achievements)) {
      // 이미 해금된 업적은 건너뛴다
      if (this.unlocked[id]) continue;

      // 조건 충족 여부 확인
      try {
        if (achievement.condition(eventType, data)) {
          const result = this.unlock(id);
          if (result) {
            newlyUnlocked.push(result);
          }
        }
      } catch (e) {
        // 조건 검사 중 에러 발생 시 무시 (부가 기능이 핵심 기능을 방해하지 않도록)
        console.warn(`업적 조건 검사 실패 (${id}):`, e);
      }
    }

    return newlyUnlocked;
  }

  /**
   * 특정 업적을 해금한다.
   * @param {string} achievementId - 해금할 업적 ID
   * @returns {Object|null} 해금된 업적 정보 또는 이미 해금된 경우 null
   */
  unlock(achievementId) {
    // 유효하지 않은 업적 ID
    if (!this.achievements[achievementId]) return null;

    // 이미 해금됨
    if (this.unlocked[achievementId]) return null;

    // 해금 처리
    const unlockedAt = Date.now();
    this.unlocked[achievementId] = unlockedAt;
    this._save();

    const achievement = this.achievements[achievementId];
    return {
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      unlockedAt,
    };
  }

  /**
   * 모든 업적의 목록과 해금 상태를 반환한다.
   * @returns {Array} 업적 정보 배열 (해금 여부 포함)
   */
  getAll() {
    return Object.entries(this.achievements).map(([id, achievement]) => ({
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      unlocked: !!this.unlocked[id],
      unlockedAt: this.unlocked[id] || null,
    }));
  }

  /**
   * 해금된 업적만 반환한다.
   * @returns {Array} 해금된 업적 정보 배열
   */
  getUnlocked() {
    return this.getAll().filter((a) => a.unlocked);
  }

  /**
   * 특정 업적의 해금 여부를 확인한다.
   * @param {string} id - 업적 ID
   * @returns {boolean} 해금 여부
   */
  isUnlocked(id) {
    return !!this.unlocked[id];
  }
}

/**
 * 콤보 시스템 클래스
 * 연속 정답 시 콤보를 누적하여 골드 배율 보너스를 제공한다.
 */
export class ComboSystem {
  constructor() {
    // 현재 콤보 수
    this.currentCombo = 0;
    // 최대 콤보 기록
    this.maxCombo = 0;
    // 현재 골드 배율
    this.multiplier = 1;

    // 콤보 구간별 배율 및 보너스 골드 정의
    this.tiers = [
      { minCombo: 10, multiplier: 5, bonusGold: 500 },
      { minCombo: 8, multiplier: 3, bonusGold: 200 },
      { minCombo: 5, multiplier: 2, bonusGold: 100 },
      { minCombo: 3, multiplier: 1.5, bonusGold: 50 },
      { minCombo: 0, multiplier: 1, bonusGold: 0 },
    ];
  }

  /**
   * 정답 시 콤보를 증가시키고 현재 콤보 상태를 반환한다.
   * @returns {Object} { combo, multiplier, bonusGold }
   */
  addCorrect() {
    this.currentCombo++;

    // 최대 콤보 갱신
    if (this.currentCombo > this.maxCombo) {
      this.maxCombo = this.currentCombo;
    }

    // 현재 콤보에 해당하는 구간 찾기
    const tier = this._getCurrentTier();
    this.multiplier = tier.multiplier;

    return {
      combo: this.currentCombo,
      multiplier: tier.multiplier,
      bonusGold: tier.bonusGold,
    };
  }

  /**
   * 오답 시 콤보를 초기화한다.
   */
  break() {
    this.currentCombo = 0;
    this.multiplier = 1;
  }

  /**
   * 현재 콤보에 따른 골드 배율을 반환한다.
   * @returns {number} 골드 배율 (1, 1.5, 2, 3, 5)
   */
  getMultiplier() {
    return this._getCurrentTier().multiplier;
  }

  /**
   * 현재 콤보 수를 반환한다.
   * @returns {number} 현재 콤보 수
   */
  getCombo() {
    return this.currentCombo;
  }

  /**
   * 현재 콤보에 해당하는 구간 정보를 반환한다.
   * tiers 배열은 높은 콤보부터 정렬되어 있으므로 첫 번째 일치 구간을 반환한다.
   * @returns {Object} { minCombo, multiplier, bonusGold }
   */
  _getCurrentTier() {
    for (const tier of this.tiers) {
      if (this.currentCombo >= tier.minCombo) {
        return tier;
      }
    }
    // 폴백 (도달할 수 없으나 안전장치)
    return { minCombo: 0, multiplier: 1, bonusGold: 0 };
  }
}
