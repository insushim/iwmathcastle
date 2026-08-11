// projectileRenderer.js - Canvas 2D Projectile & Spell Effect Renderer
// Tower defense game "Math Castle Guardian" - projectile visuals
// Pure Canvas 2D primitives, timestamp-driven animations, self-contained ES module

// ============================================================
// Constants
// ============================================================
const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;

// Pre-computed rainbow colors for ultimate/transcendent effects
const RAINBOW = [
  "#FF0000",
  "#FF7F00",
  "#FFFF00",
  "#00FF00",
  "#0000FF",
  "#4B0082",
  "#9400D3",
];

// ============================================================
// Utility
// ============================================================

/** Angle from (x,y) toward (tx,ty) */
function angleTo(x, y, tx, ty) {
  return Math.atan2(ty - y, tx - x);
}

/** Ease-out cubic */
function easeOut(t) {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

/** Ease-in cubic */
function easeIn(t) {
  return t * t * t;
}

/** Smooth pulse 0..1..0 based on timestamp and period (ms) */
function pulse(timestamp, period) {
  return 0.5 + 0.5 * Math.sin((timestamp / period) * TWO_PI);
}

/** Random float in [min, max) - only used for particle-like per-frame jitter */
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

// Seeded deterministic random for consistent per-frame sparkle positions
function seededValue(seed) {
  let s = (seed * 16807 + 7) % 2147483647;
  return (s - 1) / 2147483646;
}

// ============================================================

// Cached hex-to-rgba conversion for glow effects
const _rgbaCache = {};
function hexToRgba(hex, alpha) {
  const key = hex + alpha;
  if (_rgbaCache[key]) return _rgbaCache[key];
  let r, g, b;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  const result = `rgba(${r},${g},${b},${alpha})`;
  _rgbaCache[key] = result;
  return result;
}
// ProjectileRenderer Class
// ============================================================
export class ProjectileRenderer {
  // 같은 타입의 렌더 실패를 매 프레임 로그로 도배하지 않기 위한 1회 경고 집합
  static _warned = new Set();

  constructor() {
    // Reusable arrays to avoid per-frame allocations
    this._trailPoints = [];
  }

  // Performance: fake glow using layered semi-transparent circles
  _glow(ctx, x, y, radius, color, alpha) {
    if (alpha === undefined) alpha = 0.15;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * alpha;
    ctx.fillStyle = hexToRgba(color, 0.3);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = prevAlpha * alpha * 1.5;
    ctx.fillStyle = hexToRgba(color, 0.5);
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.6, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = prevAlpha;
  }

  // ==========================================================
  // Main API: renderProjectile
  // ==========================================================

  /**
   * Draw a single projectile on the canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} type - Projectile type key
   * @param {number} x - Current X position
   * @param {number} y - Current Y position
   * @param {number} size - Base size (radius-like)
   * @param {number} targetX - Target X (for direction/angle)
   * @param {number} targetY - Target Y
   * @param {number} timestamp - performance.now()
   */
  renderProjectile(ctx, type, x, y, size, targetX, targetY, timestamp) {
    const angle = angleTo(x, y, targetX, targetY);
    const r = size * 0.5;

    ctx.save();
    try {
      this._dispatchProjectile(ctx, type, x, y, r, angle, timestamp);
    } catch (err) {
      // 한 발사체의 그리기 실패가 그 프레임의 나머지 렌더를 통째로 죽이면 안 된다.
      // (v8 이전에는 미구현 메서드 9종이 여기서 throw해 화면이 프레임 단위로 깜빡였다)
      if (!ProjectileRenderer._warned.has(type)) {
        ProjectileRenderer._warned.add(type);
        console.warn(`[projectile] '${type}' 렌더 실패 — 기본 모양으로 대체:`, err);
      }
      try {
        this._drawDefaultProjectile(ctx, x, y, r, timestamp);
      } catch { /* 기본 모양마저 실패하면 이 발사체만 건너뛴다 */ }
    }
    ctx.restore();
  }

  _dispatchProjectile(ctx, type, x, y, r, angle, timestamp) {
    switch (type) {
      // ----- Math Tower Projectiles (Energy Bolts) -----
      case "plus":
        this._drawEnergyBolt(
          ctx,
          x,
          y,
          r,
          angle,
          timestamp,
          "#4CAF50",
          "#81C784",
          "#2E7D32",
        );
        this._drawLeafTrail(ctx, x, y, r, angle, timestamp);
        break;

      case "minus":
        this._drawEnergyBolt(
          ctx,
          x,
          y,
          r,
          angle,
          timestamp,
          "#FF9800",
          "#FFB74D",
          "#E65100",
        );
        this._drawFireTrail(
          ctx,
          x,
          y,
          r,
          angle,
          timestamp,
          "#FF9800",
          "#FF6D00",
        );
        break;

      case "multiply":
        this._drawSpinningStar(
          ctx,
          x,
          y,
          r,
          angle,
          timestamp,
          "#9C27B0",
          "#CE93D8",
          "#6A1B9A",
        );
        this._drawArcaneTrail(ctx, x, y, r, angle, timestamp, "#9C27B0");
        break;

      case "divide":
        this._drawCrescentSlash(
          ctx,
          x,
          y,
          r,
          angle,
          timestamp,
          "#F44336",
          "#EF5350",
          "#B71C1C",
        );
        break;

      case "wizard-auto":
        this._drawMagicMissile(ctx, x, y, r, angle, timestamp);
        break;

      // ----- Military Projectiles -----
      case "cannon":
        this._drawCannonball(ctx, x, y, r, angle, timestamp);
        break;

      case "skyDestroyer":
        this._drawHomingMissile(ctx, x, y, r, angle, timestamp);
        break;

      case "ice":
        this._drawIceShard(ctx, x, y, r, angle, timestamp);
        break;

      case "meteor":
        this._drawMeteor(ctx, x, y, r, angle, timestamp);
        break;

      case "poison":
        this._drawToxicGlob(ctx, x, y, r, angle, timestamp);
        break;

      case "stun":
        this._drawLightningBolt(ctx, x, y, r, angle, timestamp);
        break;

      case "net":
        this._drawWebBall(ctx, x, y, r, angle, timestamp);
        break;

      // ----- Special Projectiles -----
      case "multi-shot":
        this._drawBlueArrow(ctx, x, y, r, angle, timestamp);
        break;

      case "goldMine":
        this._drawGoldCoin(ctx, x, y, r, angle, timestamp);
        break;

      case "shredder":
        this._drawSawblade(ctx, x, y, r, angle, timestamp);
        break;

      // ----- Epic/Legendary Projectiles -----
      case "ultimate":
        this._drawRainbowOrb(ctx, x, y, r, angle, timestamp);
        break;

      case "golden":
        this._drawGoldenBolt(ctx, x, y, r, angle, timestamp);
        break;

      case "silver":
        this._drawMoonbeam(ctx, x, y, r, angle, timestamp);
        break;

      case "copper":
        this._drawCopperFlame(ctx, x, y, r, angle, timestamp);
        break;

      case "transcendent":
        this._drawCosmicBlast(ctx, x, y, r, angle, timestamp);
        break;

      // Fallback: simple glowing circle
      default:
        this._drawDefaultProjectile(ctx, x, y, r, timestamp);
        break;
    }
  }

  // ==========================================================
  // Main API: renderSpellEffect
  // ==========================================================

  /**
   * Draw a spell area effect.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} spellType
   * @param {number} x - Center X
   * @param {number} y - Center Y
   * @param {number} radius - Effect radius
   * @param {number} timestamp
   * @param {number} progress - 0 (start) to 1 (end)
   * @param {Array} [extra] - Extra data (e.g., chain points for chainLightning)
   */
  renderSpellEffect(ctx, spellType, x, y, radius, timestamp, progress, extra) {
    ctx.save();

    switch (spellType) {
      case "fireball":
        this._spellFireball(ctx, x, y, radius, timestamp, progress);
        break;
      case "frostNova":
        this._spellFrostNova(ctx, x, y, radius, timestamp, progress);
        break;
      case "chainLightning":
        this._spellChainLightning(
          ctx,
          x,
          y,
          radius,
          timestamp,
          progress,
          extra,
        );
        break;
      case "teleport":
        this._spellTeleport(ctx, x, y, radius, timestamp, progress);
        break;
      case "blackHole":
        this._spellBlackHole(ctx, x, y, radius, timestamp, progress);
        break;
      case "explosion":
        this._spellExplosion(ctx, x, y, radius, timestamp, progress);
        break;
      case "heal":
        this._spellHeal(ctx, x, y, radius, timestamp, progress);
        break;
      case "damage-reflect":
        this._spellDamageReflect(ctx, x, y, radius, timestamp, progress);
        break;
      default:
        // Generic expanding ring
        this._spellExplosion(ctx, x, y, radius, timestamp, progress);
        break;
    }

    ctx.restore();
  }

  // ==========================================================
  // Main API: renderBeam (for laser tower)
  // ==========================================================

  /**
   * Draw a sustained laser beam between two points.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x1 - Start X
   * @param {number} y1 - Start Y
   * @param {number} x2 - End X
   * @param {number} y2 - End Y
   * @param {number} timestamp
   */
  renderBeam(ctx, x1, y1, x2, y2, timestamp) {
    ctx.save();

    // v5.2: 어두운 배경에서 얇은 선으로만 보이던 문제 — 굵기·알파 대폭 강화 + 양끝 플레어
    const p = pulse(timestamp, 100);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    // Outer glow
    ctx.globalAlpha = 0.5 + p * 0.15;
    ctx.strokeStyle = "#FF3355";
    ctx.lineWidth = 16 + p * 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Mid beam
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#FF7788";
    ctx.lineWidth = 7 + p * 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Core beam
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 3 + p * 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // 발사구 머즐 글로우 + 명중점 플레어 (지지직 튀는 원)
    const flare = 7 + p * 5;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#FFD0D8";
    ctx.beginPath();
    ctx.arc(x1, y1, flare * 0.6, 0, TWO_PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x2, y2, flare, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#FF3355";
    ctx.beginPath();
    ctx.arc(x2, y2, flare * 2.2, 0, TWO_PI);
    ctx.fill();

    // Periodic sparks along beam
    const numSparks = Math.floor(len / 20);
    for (let i = 0; i < numSparks; i++) {
      const t = (i + ((timestamp * 0.003) % 1)) / numSparks;
      if (t > 1) continue;
      const sx = x1 + dx * t;
      const sy = y1 + dy * t;
      const sparkSize = 1.5 + seededValue(i + Math.floor(timestamp * 0.01)) * 2;
      ctx.globalAlpha =
        0.5 + seededValue(i * 7 + Math.floor(timestamp * 0.02)) * 0.5;
      ctx.fillStyle = "#FFCCCC";
      ctx.beginPath();
      ctx.arc(
        sx + (seededValue(i * 3 + Math.floor(timestamp * 0.005)) - 0.5) * 6,
        sy + (seededValue(i * 5 + Math.floor(timestamp * 0.005)) - 0.5) * 6,
        sparkSize,
        0,
        TWO_PI,
      );
      ctx.fill();
    }

    // Impact flash at target
    ctx.globalAlpha = 0.5 + p * 0.3;
    const impactR = 10 + p * 5;
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = hexToRgba("#FF0000", 0.3);
    ctx.beginPath();
    ctx.arc(x2, y2, impactR, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#FF6666";
    ctx.beginPath();
    ctx.arc(x2, y2, impactR * 0.5, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 0.6 + p * 0.3;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x2, y2, impactR * 0.25, 0, TWO_PI);
    ctx.fill();

    ctx.restore();
  }

  // ==========================================================
  // MATH TOWER PROJECTILES
  // ==========================================================

  /** Generic glowing energy bolt with solid sphere + sparkle ring */
  _drawEnergyBolt(ctx, x, y, r, angle, ts, color, lightColor, darkColor) {
    // Glow aura - layered circles instead of gradient
    this._glow(ctx, x, y, r * 2.5, color, 0.25);

    // Main sphere - solid 2-tone instead of radial gradient
    ctx.globalAlpha = 1;
    ctx.fillStyle = darkColor;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = lightColor;
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.7, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TWO_PI);
    ctx.fill();

    // Sparkle ring
    const sparkCount = 4;
    const sparkAngleBase = ts * 0.005;
    for (let i = 0; i < sparkCount; i++) {
      const a = sparkAngleBase + (i / sparkCount) * TWO_PI;
      const sr = r * 1.4;
      const sx = x + Math.cos(a) * sr;
      const sy = y + Math.sin(a) * sr;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(ts * 0.01 + i);
      ctx.fillStyle = lightColor;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 0.2, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Leaf-like particles trailing behind the plus bolt */
  _drawLeafTrail(ctx, x, y, r, angle, ts) {
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);

    for (let i = 0; i < 3; i++) {
      const dist = r * (1.5 + i * 1.2);
      const jitterX = Math.sin(ts * 0.008 + i * 2.3) * r * 0.5;
      const jitterY = Math.cos(ts * 0.007 + i * 1.7) * r * 0.5;
      const lx = x + nx * dist + jitterX;
      const ly = y + ny * dist + jitterY;
      const leafSize = r * (0.5 - i * 0.1);
      const alpha = 0.6 - i * 0.18;

      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(angle + ts * 0.003 + i);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#81C784";
      // Leaf shape: two arcs
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(leafSize, -leafSize * 0.5, leafSize * 1.5, 0);
      ctx.quadraticCurveTo(leafSize, leafSize * 0.5, 0, 0);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Fire trail for minus bolt */
  _drawFireTrail(ctx, x, y, r, angle, ts, color, darkColor) {
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);

    for (let i = 0; i < 4; i++) {
      const dist = r * (1.2 + i * 1.0);
      const jx = Math.sin(ts * 0.012 + i * 1.8) * r * 0.4;
      const jy = Math.cos(ts * 0.01 + i * 2.1) * r * 0.4;
      const fx = x + nx * dist + jx;
      const fy = y + ny * dist + jy;
      const fSize = r * (0.7 - i * 0.13);
      const alpha = 0.5 - i * 0.12;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#FFD700";
      ctx.beginPath();
      ctx.arc(fx, fy, fSize, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Spinning violet star for multiply */
  _drawSpinningStar(ctx, x, y, r, angle, ts, color, lightColor, darkColor) {
    // Aura
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, TWO_PI);
    ctx.fill();

    // Spinning star body
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ts * 0.006);

    const spikes = 5;
    const outerR = r;
    const innerR = r * 0.4;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * TWO_PI - HALF_PI;
      const rad = i % 2 === 0 ? outerR : innerR;
      if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();

    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();
  }

  /** Arcane trail for multiply */
  _drawArcaneTrail(ctx, x, y, r, angle, ts, color) {
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);

    for (let i = 0; i < 3; i++) {
      const dist = r * (1.5 + i * 1.1);
      const tx = x + nx * dist;
      const ty = y + ny * dist;
      const alpha = 0.45 - i * 0.13;

      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(-ts * 0.008 + i * 1.2);
      const sz = r * (0.5 - i * 0.08);
      // Small diamond
      ctx.beginPath();
      ctx.moveTo(0, -sz);
      ctx.lineTo(sz * 0.6, 0);
      ctx.lineTo(0, sz);
      ctx.lineTo(-sz * 0.6, 0);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Crimson crescent slash for divide */
  _drawCrescentSlash(ctx, x, y, r, angle, ts, color, lightColor, darkColor) {
    // Trail afterimages
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 1; i <= 3; i++) {
      const dist = r * i * 0.8;
      const tx = x + nx * dist;
      const ty = y + ny * dist;
      ctx.globalAlpha = 0.3 - i * 0.08;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.0 - i * 0.15), -0.7, 0.7);
      ctx.quadraticCurveTo(r * 0.3, 0, 0, 0);
      ctx.fill();
      ctx.restore();
    }

    // Main crescent
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Crescent shape: outer arc minus inner arc
    ctx.beginPath();
    ctx.arc(0, 0, r, -0.8, 0.8);
    ctx.quadraticCurveTo(r * 0.6, 0, 0, 0);
    ctx.closePath();

    ctx.fillStyle = "#FFFFFF";
    ctx.fill();

    // Edge highlight
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, r, -0.8, 0.8);
    ctx.stroke();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Cyan magic missile for wizard auto-attack */
  _drawMagicMissile(ctx, x, y, r, angle, ts) {
    // v5.1: 혜성형 매직 미사일 — 펄스 글로우 + 회전 스타 코어 + 긴 꼬리
    const pulse = 1 + Math.sin(ts / 60) * 0.18;

    // 긴 혜성 꼬리 (진행 반대 방향)
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 0; i < 6; i++) {
      const dist = r * (1.0 + i * 0.9);
      ctx.globalAlpha = 0.45 - i * 0.07;
      ctx.fillStyle = i < 2 ? "#C3DBFF" : "#82AAFF";
      ctx.beginPath();
      ctx.arc(x + nx * dist, y + ny * dist, r * (0.75 - i * 0.1) * pulse, 0, TWO_PI);
      ctx.fill();
    }

    // 외곽 글로우
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#82AAFF";
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4 * pulse, 0, TWO_PI);
    ctx.fill();

    // 회전 4방 스타 코어
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ts / 120);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#FFFFFF";
    const sr = r * 1.5 * pulse;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.lineTo(Math.cos(a) * sr, Math.sin(a) * sr);
      ctx.lineTo(Math.cos(a + Math.PI / 4) * sr * 0.35, Math.sin(a + Math.PI / 4) * sr * 0.35);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 중심 코어
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#E3F0FF";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ==========================================================
  // MILITARY PROJECTILES
  // ==========================================================

  /** Dark iron cannonball with smoke trail */
  _drawCannonball(ctx, x, y, r, angle, ts) {
    // Smoke trail
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 0; i < 4; i++) {
      const dist = r * (1.5 + i * 1.3);
      const sx = x + nx * dist + Math.sin(ts * 0.005 + i) * r * 0.3;
      const sy = y + ny * dist + Math.cos(ts * 0.004 + i) * r * 0.3;
      const smokeSize = r * (0.6 + i * 0.3);
      ctx.globalAlpha = 0.2 - i * 0.04;
      ctx.fillStyle = "#666666";
      ctx.beginPath();
      ctx.arc(sx, sy, smokeSize, 0, TWO_PI);
      ctx.fill();
    }

    // Main cannonball body
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#333333";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();

    // Metal highlight
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#999999";
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TWO_PI);
    ctx.fill();

    // Edge sparks
    ctx.globalAlpha = 0.7;
    const sparkAngle = ts * 0.01;
    for (let i = 0; i < 3; i++) {
      const a = sparkAngle + i * 2.1;
      const sx = x + Math.cos(a) * r;
      const sy = y + Math.sin(a) * r;
      ctx.fillStyle = "#FF8800";
      ctx.beginPath();
      ctx.arc(sx, sy, r * 0.15, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Homing missile with exhaust flame */
  _drawHomingMissile(ctx, x, y, r, angle, ts) {
    // White smoke trail
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 0; i < 5; i++) {
      const dist = r * (2.0 + i * 1.5);
      const sx = x + nx * dist + Math.sin(ts * 0.006 + i * 1.3) * r * 0.5;
      const sy = y + ny * dist + Math.cos(ts * 0.005 + i * 0.9) * r * 0.5;
      const smokeR = r * (0.4 + i * 0.25);
      ctx.globalAlpha = 0.25 - i * 0.04;
      ctx.fillStyle = "#CCCCCC";
      ctx.beginPath();
      ctx.arc(sx, sy, smokeR, 0, TWO_PI);
      ctx.fill();
    }

    // Exhaust flame (right behind missile)
    const exDist = r * 1.2;
    const ex = x + nx * exDist;
    const ey = y + ny * exDist;
    const flameLen = r * 2 + Math.sin(ts * 0.02) * r * 0.5;

    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = "#FF6600";
    ctx.lineWidth = r * 0.8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex + nx * flameLen, ey + ny * flameLen);
    ctx.stroke();

    // Missile body
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Sleek body
    ctx.fillStyle = "#4A4A5A";
    ctx.beginPath();
    ctx.moveTo(r * 1.2, 0);
    ctx.lineTo(-r * 0.6, -r * 0.5);
    ctx.lineTo(-r * 0.8, 0);
    ctx.lineTo(-r * 0.6, r * 0.5);
    ctx.closePath();
    ctx.fill();

    // Nose cone
    ctx.fillStyle = "#FF4444";
    ctx.beginPath();
    ctx.moveTo(r * 1.2, 0);
    ctx.lineTo(r * 0.6, -r * 0.3);
    ctx.lineTo(r * 0.6, r * 0.3);
    ctx.closePath();
    ctx.fill();

    // Fins
    ctx.fillStyle = "#666666";
    ctx.fillRect(-r * 0.7, -r * 0.7, r * 0.3, r * 0.2);
    ctx.fillRect(-r * 0.7, r * 0.5, r * 0.3, r * 0.2);

    ctx.restore();
  }

  /** Translucent blue crystal spinning with frost particles */
  _drawIceShard(ctx, x, y, r, angle, ts) {
    // Frost particle trail
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 0; i < 5; i++) {
      const dist = r * (1.0 + i * 0.9);
      const px = x + nx * dist + Math.sin(ts * 0.007 + i * 2) * r * 0.4;
      const py = y + ny * dist + Math.cos(ts * 0.006 + i * 1.5) * r * 0.4;
      ctx.globalAlpha = 0.4 - i * 0.07;
      ctx.fillStyle = "#B0E0FF";
      ctx.beginPath();
      ctx.arc(px, py, r * 0.2, 0, TWO_PI);
      ctx.fill();
    }

    // Ice shard body (rotating crystal shape)
    ctx.globalAlpha = 0.85;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ts * 0.005);

    // Crystal shape: elongated hexagon
    ctx.fillStyle = "#CC4400";
    ctx.beginPath();
    ctx.moveTo(r * 1.2, 0);
    ctx.quadraticCurveTo(r * 0.5, -r * 0.6, -r * 0.8, -r * 0.2);
    ctx.lineTo(-r * 0.8, r * 0.2);
    ctx.quadraticCurveTo(r * 0.5, r * 0.6, r * 1.2, 0);
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Silver crescent with stardust trail */
  _drawMoonbeam(ctx, x, y, r, angle, ts) {
    // Stardust trail
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 0; i < 5; i++) {
      const dist = r * (1.2 + i * 0.8);
      const jx = Math.sin(ts * 0.006 + i * 2.3) * r * 0.4;
      const jy = Math.cos(ts * 0.005 + i * 1.7) * r * 0.4;
      const tx = x + nx * dist + jx;
      const ty = y + ny * dist + jy;
      ctx.globalAlpha = 0.4 - i * 0.07;
      ctx.fillStyle = "#E0E0E0";
      ctx.beginPath();
      ctx.arc(tx, ty, r * 0.15, 0, TWO_PI);
      ctx.fill();
      // Tiny cross sparkle
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(tx - r * 0.15, ty);
      ctx.lineTo(tx + r * 0.15, ty);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tx, ty - r * 0.15);
      ctx.lineTo(tx, ty + r * 0.15);
      ctx.stroke();
    }

    // Glow
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, TWO_PI);
    ctx.fill();

    // Silver crescent
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + HALF_PI);

    ctx.fillStyle = "#C0C0C0";

    // Crescent: outer circle minus shifted inner circle
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TWO_PI);
    ctx.fill();

    // Cut out inner to form crescent
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(r * 0.35, -r * 0.15, r * 0.75, 0, TWO_PI);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Burning copper sphere with flame trail */
  _drawCopperFlame(ctx, x, y, r, angle, ts) {
    // Flame trail
    this._drawFireTrail(ctx, x, y, r, angle, ts, "#B87333", "#8B4513");

    // Glow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#DEB887";
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, TWO_PI);
    ctx.fill();

    // Main copper sphere
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#DEB887";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();

    // Flame flickering around the sphere
    const flameCount = 4;
    for (let i = 0; i < flameCount; i++) {
      const fa = ts * 0.008 + i * 1.6;
      const fd = r * 1.1;
      const fx = x + Math.cos(fa) * fd;
      const fy = y + Math.sin(fa) * fd;
      const fSize = r * 0.3 + Math.sin(ts * 0.015 + i) * r * 0.1;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(ts * 0.012 + i);
      ctx.fillStyle = "#FF8C00";
      ctx.beginPath();
      ctx.arc(fx, fy, fSize, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Swirling galaxy mini-sphere with star particles and aurora trail */
  _drawCosmicBlast(ctx, x, y, r, angle, ts) {
    // Aurora trail
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    const auroraColors = ["#00FFFF", "#8B00FF", "#FF00FF", "#00FF88"];
    for (let i = 0; i < 6; i++) {
      const dist = r * (1.0 + i * 0.9);
      const wave = Math.sin(ts * 0.005 + i * 1.4) * r * 0.7;
      const tx = x + nx * dist + ny * wave;
      const ty = y + ny * dist - nx * wave;
      const tSize = r * (0.4 - i * 0.04);
      ctx.globalAlpha = 0.45 - i * 0.06;
      ctx.fillStyle = auroraColors[i % auroraColors.length];
      ctx.beginPath();
      ctx.arc(tx, ty, tSize, 0, TWO_PI);
      ctx.fill();
    }

    // Star particles scattered around
    for (let i = 0; i < 5; i++) {
      const sa = ts * 0.003 + i * 1.3;
      const sd = r * 2 + Math.sin(ts * 0.005 + i) * r * 0.5;
      const sx = x + Math.cos(sa) * sd;
      const sy = y + Math.sin(sa) * sd;
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(ts * 0.01 + i * 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(sx, sy, r * 0.1, 0, TWO_PI);
      ctx.fill();
    }

    // Glow aura
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#00FFFF";
    ctx.beginPath();
    ctx.arc(x, y, r * 2.5, 0, TWO_PI);
    ctx.fill();

    // Swirling galaxy sphere body
    ctx.globalAlpha = 1;

    // Base dark sphere
    ctx.fillStyle = "#0D0020";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();

    // Swirl arms
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ts * 0.004);
    const armColors = ["#00FFFF", "#8B00FF"];
    for (let arm = 0; arm < 2; arm++) {
      ctx.strokeStyle = armColors[arm];
      ctx.lineWidth = r * 0.15;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      const baseA = arm * Math.PI;
      for (let t = 0; t < 1; t += 0.05) {
        const spiralR = t * r * 0.9;
        const spiralA = baseA + t * Math.PI * 2;
        const px = Math.cos(spiralA) * spiralR;
        const py = Math.sin(spiralA) * spiralR;
        if (t === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Bright core
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.3, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ==========================================================
  // v8 복구: 호출만 되고 정의가 없던 9종
  //
  // 2026-08-12 실측 — 메테오·독·기절·그물·멀티샷·금광·파쇄기·궁극·황금 타워는
  // 발사체를 그릴 때마다 `TypeError: this._drawX is not a function`을 던졌다.
  // 이 throw가 renderProjectile의 ctx.save()와 ctx.restore() 사이에서 터지는 바람에
  //  ① 그 발사체가 안 보이고
  //  ② 같은 프레임의 그 뒤 렌더(다른 발사체·몬스터·이펙트)가 통째로 중단되며
  //  ③ save/restore 짝이 깨져 컨텍스트 상태가 다음 프레임으로 샜다.
  // 20종 타워 중 9종 = 절반 가까이가 이 상태였다. qa-projectiles.mjs가 감시한다.
  // ==========================================================

  /** 메테오 — 불타는 암석 + 잔염 꼬리 */
  _drawMeteor(ctx, x, y, r, angle, ts) {
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 0; i < 6; i++) {
      const dist = r * (1.2 + i * 1.1);
      const px = x + nx * dist + Math.sin(ts * 0.008 + i * 1.7) * r * 0.5;
      const py = y + ny * dist + Math.cos(ts * 0.007 + i * 1.3) * r * 0.5;
      ctx.globalAlpha = 0.45 - i * 0.06;
      ctx.fillStyle = i < 3 ? "#FF9800" : "#B71C1C";
      ctx.beginPath();
      ctx.arc(px, py, r * (0.75 - i * 0.08), 0, TWO_PI);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    this._glow(ctx, x, y, r * 2.2, "#FF5722", 0.5);

    // 암석 본체 — 울퉁불퉁한 다각형
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ts * 0.004);
    ctx.fillStyle = "#4E342E";
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TWO_PI;
      const rad = r * (0.85 + ((i * 37) % 10) / 40);
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // 균열 사이로 새어 나오는 용암
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#FF7043";
    ctx.beginPath();
    ctx.arc(-r * 0.25, -r * 0.2, r * 0.28, 0, TWO_PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.3, r * 0.15, r * 0.2, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 독 — 방울방울 떨어지는 산성 액체 */
  _drawToxicGlob(ctx, x, y, r, angle, ts) {
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 0; i < 4; i++) {
      const dist = r * (1.3 + i * 1.0);
      const px = x + nx * dist + Math.sin(ts * 0.006 + i * 2.1) * r * 0.45;
      const py = y + ny * dist + Math.cos(ts * 0.005 + i * 1.6) * r * 0.45;
      ctx.globalAlpha = 0.35 - i * 0.07;
      ctx.fillStyle = "#7CB342";
      ctx.beginPath();
      ctx.arc(px, py, r * (0.45 - i * 0.07), 0, TWO_PI);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    this._glow(ctx, x, y, r * 1.8, "#8BC34A", 0.4);

    // 물방울 본체 (진행 방향으로 살짝 늘어남)
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "#558B2F";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.15, r * 0.85, 0, 0, TWO_PI);
    ctx.fill();

    // 표면에서 터지는 기포
    ctx.fillStyle = "#AED581";
    for (let i = 0; i < 3; i++) {
      const ph = ts * 0.004 + i * 2.0;
      const bx = Math.cos(ph) * r * 0.4;
      const by = Math.sin(ph * 1.3) * r * 0.35;
      ctx.globalAlpha = 0.5 + 0.4 * Math.abs(Math.sin(ph));
      ctx.beginPath();
      ctx.arc(bx, by, r * 0.18, 0, TWO_PI);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 기절 — 지그재그 번개 화살 */
  _drawLightningBolt(ctx, x, y, r, angle, ts) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    this._glow(ctx, 0, 0, r * 2.0, "#FFEB3B", 0.55);

    // 뒤로 뻗는 지그재그
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "#FFF59D";
    ctx.lineWidth = Math.max(1.5, r * 0.35);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(r * 1.1, 0);
    const jitter = Math.sin(ts * 0.03) * r * 0.35;
    ctx.lineTo(-r * 0.2, jitter);
    ctx.lineTo(-r * 1.1, -jitter * 0.7);
    ctx.lineTo(-r * 2.1, jitter * 0.4);
    ctx.stroke();

    // 밝은 코어
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.stroke();

    // 앞머리 스파크
    ctx.fillStyle = "#FFEE58";
    ctx.beginPath();
    ctx.arc(r * 1.1, 0, r * 0.35, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 그물 — 회전하는 거미줄 뭉치 */
  _drawWebBall(ctx, x, y, r, _angle, ts) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ts * 0.003);

    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#ECEFF1";
    ctx.lineWidth = Math.max(1, r * 0.12);

    // 방사선 8줄
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TWO_PI;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
      ctx.stroke();
    }
    // 동심 거미줄 3겹
    for (let ring = 1; ring <= 3; ring++) {
      const rad = (r * 1.15 * ring) / 3;
      ctx.globalAlpha = 0.5 + ring * 0.12;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * TWO_PI;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 멀티샷 — 푸른 화살 */
  _drawBlueArrow(ctx, x, y, r, angle, _ts) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    this._glow(ctx, 0, 0, r * 1.6, "#2196F3", 0.45);

    // 화살대
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#1565C0";
    ctx.fillRect(-r * 1.4, -r * 0.16, r * 2.2, r * 0.32);

    // 촉
    ctx.fillStyle = "#64B5F6";
    ctx.beginPath();
    ctx.moveTo(r * 1.5, 0);
    ctx.lineTo(r * 0.7, -r * 0.55);
    ctx.lineTo(r * 0.7, r * 0.55);
    ctx.closePath();
    ctx.fill();

    // 깃
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#90CAF9";
    ctx.beginPath();
    ctx.moveTo(-r * 1.4, 0);
    ctx.lineTo(-r * 2.0, -r * 0.45);
    ctx.lineTo(-r * 1.1, 0);
    ctx.lineTo(-r * 2.0, r * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 금광 — 회전하는 금화 */
  _drawGoldCoin(ctx, x, y, r, _angle, ts) {
    this._glow(ctx, x, y, r * 1.8, "#FFC107", 0.5);

    // 회전으로 폭이 줄었다 늘었다 (동전이 도는 느낌)
    const w = Math.abs(Math.cos(ts * 0.006)) * r + r * 0.15;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#FFB300";
    ctx.beginPath();
    ctx.ellipse(0, 0, w, r, 0, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = "#FFE082";
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.6, r * 0.6, 0, 0, TWO_PI);
    ctx.fill();

    // 각인 (폭이 충분할 때만 — 얇을 땐 옆면이라 안 보이는 게 맞다)
    if (w > r * 0.45) {
      ctx.fillStyle = "#F57F17";
      ctx.fillRect(-w * 0.28, -r * 0.42, w * 0.56, r * 0.16);
      ctx.fillRect(-w * 0.28, r * 0.26, w * 0.56, r * 0.16);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 파쇄기 — 고속 회전 톱날 */
  _drawSawblade(ctx, x, y, r, _angle, ts) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ts * 0.02);

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#B0BEC5";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.95, 0, TWO_PI);
    ctx.fill();

    // 톱니 8개
    ctx.fillStyle = "#ECEFF1";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TWO_PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      ctx.lineTo(Math.cos(a + 0.22) * r * 1.45, Math.sin(a + 0.22) * r * 1.45);
      ctx.lineTo(Math.cos(a + 0.44) * r * 0.9, Math.sin(a + 0.44) * r * 0.9);
      ctx.closePath();
      ctx.fill();
    }

    // 중심 축
    ctx.fillStyle = "#455A64";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, TWO_PI);
    ctx.fill();
    ctx.restore();

    // 잔상
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#CFD8DC";
    ctx.lineWidth = Math.max(1, r * 0.2);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.3, 0, TWO_PI);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** 궁극 수호자 — 무지개 구슬 */
  _drawRainbowOrb(ctx, x, y, r, _angle, ts) {
    const hues = ["#FF5252", "#FFB300", "#FFEE58", "#66BB6A", "#42A5F5", "#AB47BC"];

    // 궤도를 도는 색 고리들
    for (let i = 0; i < hues.length; i++) {
      const a = ts * 0.005 + (i / hues.length) * TWO_PI;
      const ox = x + Math.cos(a) * r * 1.25;
      const oy = y + Math.sin(a) * r * 1.25;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = hues[i];
      ctx.beginPath();
      ctx.arc(ox, oy, r * 0.4, 0, TWO_PI);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    this._glow(ctx, x, y, r * 2.4, "#E1BEE7", 0.6);

    // 흰 코어
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, 0, TWO_PI);
    ctx.fill();

    ctx.globalAlpha = 0.6;
    ctx.fillStyle = hues[Math.floor(ts * 0.01) % hues.length];
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** 황금 왕관 — 금빛 화살 */
  _drawGoldenBolt(ctx, x, y, r, angle, _ts) {
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 0; i < 4; i++) {
      const dist = r * (1.2 + i * 1.1);
      ctx.globalAlpha = 0.4 - i * 0.08;
      ctx.fillStyle = "#FFD54F";
      ctx.beginPath();
      ctx.arc(x + nx * dist, y + ny * dist, r * (0.55 - i * 0.1), 0, TWO_PI);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    this._glow(ctx, x, y, r * 2.0, "#FFC107", 0.6);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // 마름모 본체
    ctx.fillStyle = "#FFA000";
    ctx.beginPath();
    ctx.moveTo(r * 1.5, 0);
    ctx.lineTo(0, -r * 0.7);
    ctx.lineTo(-r * 1.0, 0);
    ctx.lineTo(0, r * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#FFF8E1";
    ctx.beginPath();
    ctx.moveTo(r * 0.9, 0);
    ctx.lineTo(0, -r * 0.32);
    ctx.lineTo(-r * 0.5, 0);
    ctx.lineTo(0, r * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Fallback simple glowing projectile */
  _drawDefaultProjectile(ctx, x, y, r, ts) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, TWO_PI);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();
  }

  // ==========================================================
  // SPELL AREA EFFECTS
  // ==========================================================

  /** Fireball: expanding flame ring with shockwave and rising embers */
  _spellFireball(ctx, x, y, radius, ts, progress) {
    const currentR = radius * easeOut(progress);
    const alpha = 1 - easeIn(progress);

    // Shockwave ring
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = "#FF6600";
    ctx.lineWidth = 3 + (1 - progress) * 4;
    ctx.beginPath();
    ctx.arc(x, y, currentR, 0, TWO_PI);
    ctx.stroke();

    // Inner fire fill
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillStyle = "#FF6600";
    ctx.beginPath();
    ctx.arc(x, y, currentR, 0, TWO_PI);
    ctx.fill();

    // Rising embers
    const emberCount = 10;
    for (let i = 0; i < emberCount; i++) {
      const a = (i / emberCount) * TWO_PI + ts * 0.002;
      const ed = currentR * (0.3 + seededValue(i * 7) * 0.7);
      const ex = x + Math.cos(a) * ed;
      const ey = y + Math.sin(a) * ed - progress * 20 * seededValue(i * 3 + 5);
      const eSize = 2 + seededValue(i * 11) * 3;
      ctx.globalAlpha = alpha * (0.5 + 0.5 * seededValue(i * 13));
      ctx.fillStyle = seededValue(i * 17) > 0.5 ? "#FF8800" : "#FFDD00";
      ctx.beginPath();
      ctx.arc(ex, ey, eSize * (1 - progress * 0.5), 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Frost Nova: expanding ice ring with crystal patterns and snowflakes */
  _spellFrostNova(ctx, x, y, radius, ts, progress) {
    const currentR = radius * easeOut(progress);
    const alpha = 1 - easeIn(progress);

    // Frozen mist fill
    ctx.globalAlpha = alpha * 0.25;
    const mistGrad = ctx.createRadialGradient(x, y, 0, x, y, currentR);
    mistGrad.addColorStop(0, "rgba(200,240,255,0.6)");
    mistGrad.addColorStop(0.6, "rgba(100,200,255,0.3)");
    mistGrad.addColorStop(1, "rgba(0,191,255,0)");
    ctx.fillStyle = mistGrad;
    ctx.beginPath();
    ctx.arc(x, y, currentR, 0, TWO_PI);
    ctx.fill();

    // Ice ring
    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = "#80DFFF";
    ctx.lineWidth = 2 + (1 - progress) * 3;
    ctx.beginPath();
    ctx.arc(x, y, currentR, 0, TWO_PI);
    ctx.stroke();

    // Crystal pattern on ground (radial lines)
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = "#B0E0FF";
    ctx.lineWidth = 1;
    const crystalArms = 6;
    for (let i = 0; i < crystalArms; i++) {
      const a = (i / crystalArms) * TWO_PI + ts * 0.001;
      const armLen = currentR * 0.9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * armLen, y + Math.sin(a) * armLen);
      ctx.stroke();

      // Branch off each arm
      const branchD = armLen * 0.6;
      const bx = x + Math.cos(a) * branchD;
      const by = y + Math.sin(a) * branchD;
      const branchLen = armLen * 0.3;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(
        bx + Math.cos(a + 0.5) * branchLen,
        by + Math.sin(a + 0.5) * branchLen,
      );
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(
        bx + Math.cos(a - 0.5) * branchLen,
        by + Math.sin(a - 0.5) * branchLen,
      );
      ctx.stroke();
    }

    // Snowflake particles
    const snowCount = 8;
    for (let i = 0; i < snowCount; i++) {
      const sa = (i / snowCount) * TWO_PI + ts * 0.002;
      const sd = currentR * (0.2 + seededValue(i * 9) * 0.7);
      const sx = x + Math.cos(sa) * sd;
      const sy = y + Math.sin(sa) * sd;
      ctx.globalAlpha = alpha * (0.4 + 0.4 * seededValue(i * 11));
      ctx.fillStyle = "#FFFFFF";
      this._drawTinyStar(
        ctx,
        sx,
        sy,
        2 + seededValue(i * 5) * 2,
        ts * 0.003 + i,
      );
    }
    ctx.globalAlpha = 1;
  }

  /** Chain Lightning: electric arcs connecting points */
  _spellChainLightning(ctx, x, y, radius, ts, progress, chainPoints) {
    const alpha = 1 - easeIn(progress);
    const points =
      chainPoints && chainPoints.length > 0 ? chainPoints : [{ x, y }];

    // Bright flash at each point
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      ctx.globalAlpha = alpha * (0.4 + 0.3 * Math.sin(ts * 0.02 + i));
      ctx.fillStyle = "#FFFF88";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 15, 0, TWO_PI);
      ctx.fill();
    }

    // Lightning arcs between consecutive points
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const segments = Math.max(3, Math.floor(dist / 15));
      const perpX = -dy / (dist || 1);
      const perpY = dx / (dist || 1);

      // Main bolt
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = "#FFEB3B";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      for (let s = 1; s < segments; s++) {
        const t = s / segments;
        const mx = p1.x + dx * t;
        const my = p1.y + dy * t;
        const jitter =
          (seededValue(i * 31 + s * 7 + Math.floor(ts * 0.02)) - 0.5) * 20;
        ctx.lineTo(mx + perpX * jitter, my + perpY * jitter);
      }
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Bright core
      ctx.globalAlpha = alpha * 0.6;
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      for (let s = 1; s < segments; s++) {
        const t = s / segments;
        const mx = p1.x + dx * t;
        const my = p1.y + dy * t;
        const jitter =
          (seededValue(i * 31 + s * 7 + Math.floor(ts * 0.02)) - 0.5) * 20;
        ctx.lineTo(mx + perpX * jitter, my + perpY * jitter);
      }
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Branch lightning (smaller fork from midpoint)
      if (dist > 30) {
        const midT = 0.4 + seededValue(i * 17) * 0.2;
        const midX = p1.x + dx * midT;
        const midY = p1.y + dy * midT;
        const branchLen = dist * 0.3;
        const branchAngle =
          Math.atan2(dy, dx) + (seededValue(i * 23) - 0.5) * 2;

        ctx.globalAlpha = alpha * 0.4;
        ctx.strokeStyle = "#FFFF88";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        const bSegs = 3;
        for (let bs = 1; bs <= bSegs; bs++) {
          const bt = bs / bSegs;
          const bx = midX + Math.cos(branchAngle) * branchLen * bt;
          const by = midY + Math.sin(branchAngle) * branchLen * bt;
          const bJitter =
            (seededValue(i * 41 + bs * 11 + Math.floor(ts * 0.015)) - 0.5) * 10;
          ctx.lineTo(bx + perpX * bJitter, by + perpY * bJitter);
        }
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }

  /** Teleport: swirling portal spiral converging/dispersing */
  _spellTeleport(ctx, x, y, radius, ts, progress) {
    const alpha =
      progress < 0.5 ? easeOut(progress * 2) : 1 - easeIn((progress - 0.5) * 2);
    const currentR =
      radius *
      (progress < 0.5
        ? easeOut(progress * 2)
        : 1 - easeIn((progress - 0.5) * 2));

    // Spiral particles converging or dispersing
    const particleCount = 16;
    const direction = progress < 0.5 ? 1 : -1; // converge then disperse
    for (let i = 0; i < particleCount; i++) {
      const baseAngle = (i / particleCount) * TWO_PI;
      const spiralAngle = baseAngle + ts * 0.008 * direction;
      const spiralR = currentR * (0.3 + 0.7 * ((i % 3) / 3));
      const px = x + Math.cos(spiralAngle) * spiralR;
      const py = y + Math.sin(spiralAngle) * spiralR;
      const pSize = 2 + seededValue(i * 7) * 3;

      ctx.globalAlpha = alpha * (0.4 + 0.4 * Math.sin(ts * 0.01 + i));
      const colors = ["#8B00FF", "#4B0082", "#00BFFF", "#FF00FF"];
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(px, py, pSize, 0, TWO_PI);
      ctx.fill();
    }

    // Central portal glow
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = "#CC88FF";
    ctx.beginPath();
    ctx.arc(x, y, currentR * 0.6, 0, TWO_PI);
    ctx.fill();

    // Outer ring
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = "#8B00FF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, currentR, 0, TWO_PI);
    ctx.stroke();

    ctx.globalAlpha = 1;
  }

  /** Black Hole: rotating dark vortex with gravitational lensing effect */
  _spellBlackHole(ctx, x, y, radius, ts, progress) {
    const alpha =
      progress < 0.1
        ? easeOut(progress * 10)
        : progress > 0.8
          ? 1 - easeIn((progress - 0.8) * 5)
          : 1;
    const currentR = radius * (progress < 0.1 ? easeOut(progress * 10) : 1);

    // Matter being pulled inward (particles spiraling)
    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
      const baseA = (i / particleCount) * TWO_PI;
      const spiralT = (ts * 0.005 + i * 0.3) % TWO_PI;
      const dist = currentR * (0.5 + 0.5 * (spiralT / TWO_PI));
      const angle = baseA + spiralT * 2;
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;
      const pAlpha = alpha * (1 - dist / (currentR * 1.2));

      ctx.globalAlpha = Math.max(0, pAlpha * 0.6);
      ctx.fillStyle = seededValue(i * 13) > 0.5 ? "#9900CC" : "#330066";
      ctx.beginPath();
      ctx.arc(px, py, 1.5 + seededValue(i * 7) * 2, 0, TWO_PI);
      ctx.fill();
    }

    // Gravitational lensing ring (bright distortion edge)
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = "#CC66FF";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, currentR * 0.7, 0, TWO_PI);
    ctx.stroke();

    // Outer accretion disc glow
    ctx.globalAlpha = alpha * 0.2;
    const discGrad = ctx.createRadialGradient(
      x,
      y,
      currentR * 0.3,
      x,
      y,
      currentR,
    );
    discGrad.addColorStop(0, "rgba(0,0,0,0)");
    discGrad.addColorStop(0.5, "rgba(100,0,200,0.3)");
    discGrad.addColorStop(0.8, "rgba(150,0,255,0.2)");
    discGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = discGrad;
    ctx.beginPath();
    ctx.arc(x, y, currentR, 0, TWO_PI);
    ctx.fill();

    // Central darkness
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = "rgba(10,0,20,0.8)";
    ctx.beginPath();
    ctx.arc(x, y, currentR * 0.35, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.95;
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.beginPath();
    ctx.arc(x, y, currentR * 0.25, 0, TWO_PI);
    ctx.fill();

    // Purple-black swirl overlay
    ctx.globalAlpha = alpha * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ts * 0.003);
    ctx.strokeStyle = "#6600AA";
    ctx.lineWidth = 1.5;
    for (let arm = 0; arm < 3; arm++) {
      ctx.beginPath();
      const armBase = (arm / 3) * TWO_PI;
      for (let t = 0; t < 1; t += 0.04) {
        const spiralR = t * currentR * 0.6;
        const spiralA = armBase + t * TWO_PI * 1.5;
        const sx = Math.cos(spiralA) * spiralR;
        const sy = Math.sin(spiralA) * spiralR;
        if (t === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.globalAlpha = 1;
  }

  /** General explosion effect */
  _spellExplosion(ctx, x, y, radius, ts, progress) {
    const currentR = radius * easeOut(progress);
    const alpha = 1 - easeIn(progress);

    // Shockwave ring
    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = "#FF6B00";
    ctx.lineWidth = 2 + (1 - progress) * 4;
    ctx.beginPath();
    ctx.arc(x, y, currentR, 0, TWO_PI);
    ctx.stroke();

    // Inner explosion fill
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = "#FF8800";
    ctx.beginPath();
    ctx.arc(x, y, currentR, 0, TWO_PI);
    ctx.fill();

    // Scattered particles
    const count = 8;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TWO_PI;
      const d = currentR * (0.4 + seededValue(i * 7) * 0.5);
      const ex = x + Math.cos(a) * d;
      const ey = y + Math.sin(a) * d;
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillStyle = seededValue(i * 13) > 0.5 ? "#FF8800" : "#FFCC00";
      ctx.beginPath();
      ctx.arc(ex, ey, 2 + seededValue(i * 11) * 2, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Healing wave with ascending particles and cross shape */
  _spellHeal(ctx, x, y, radius, ts, progress) {
    const currentR = radius * easeOut(progress);
    const alpha =
      progress < 0.3
        ? easeOut(progress / 0.3)
        : 1 - easeIn((progress - 0.3) / 0.7);

    // Green expanding ring
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = "#66BB6A";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, currentR, 0, TWO_PI);
    ctx.stroke();

    // Inner green fill
    ctx.globalAlpha = alpha * 0.15;
    ctx.fillStyle = "#A5D6A7";
    ctx.beginPath();
    ctx.arc(x, y, currentR, 0, TWO_PI);
    ctx.fill();

    // Cross shape at center
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = "#81C784";
    const crossW = radius * 0.15;
    const crossH = radius * 0.5 * (1 - progress * 0.3);
    ctx.fillRect(x - crossW / 2, y - crossH, crossW, crossH * 2);
    ctx.fillRect(x - crossH, y - crossW / 2, crossH * 2, crossW);

    // Ascending green + particles
    const pCount = 8;
    for (let i = 0; i < pCount; i++) {
      const a = (i / pCount) * TWO_PI;
      const d = currentR * 0.5 * seededValue(i * 9);
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d - progress * 25 * (1 + seededValue(i * 3));
      const pSize = 2 + seededValue(i * 7) * 2;
      ctx.globalAlpha = alpha * (0.4 + 0.4 * seededValue(i * 11));
      ctx.fillStyle = seededValue(i * 17) > 0.5 ? "#A5D6A7" : "#66BB6A";
      // Plus-shaped particle
      ctx.fillRect(px - pSize * 0.15, py - pSize * 0.5, pSize * 0.3, pSize);
      ctx.fillRect(px - pSize * 0.5, py - pSize * 0.15, pSize, pSize * 0.3);
    }
    ctx.globalAlpha = 1;
  }

  /** Damage reflect: red shield flash */
  _spellDamageReflect(ctx, x, y, radius, ts, progress) {
    const alpha =
      progress < 0.2
        ? easeOut(progress * 5)
        : 1 - easeIn((progress - 0.2) / 0.8);
    const currentR = radius * (0.8 + easeOut(progress) * 0.2);

    // Red flash fill
    ctx.globalAlpha = alpha * 0.3;
    const flashGrad = ctx.createRadialGradient(
      x,
      y,
      currentR * 0.5,
      x,
      y,
      currentR,
    );
    flashGrad.addColorStop(0, "rgba(255,0,0,0.3)");
    flashGrad.addColorStop(1, "rgba(255,0,0,0)");
    ctx.fillStyle = flashGrad;
    ctx.beginPath();
    ctx.arc(x, y, currentR, 0, TWO_PI);
    ctx.fill();

    // Shield outline (hexagonal)
    ctx.globalAlpha = alpha * 0.7;
    ctx.strokeStyle = "#FF4444";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const sides = 6;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * TWO_PI - HALF_PI;
      const px = x + Math.cos(a) * currentR;
      const py = y + Math.sin(a) * currentR;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Inner shield ring
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = "#FF8888";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * TWO_PI - HALF_PI;
      const px = x + Math.cos(a) * currentR * 0.6;
      const py = y + Math.sin(a) * currentR * 0.6;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Flash sparkles on edges
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TWO_PI + ts * 0.005;
      const sx = x + Math.cos(a) * currentR;
      const sy = y + Math.sin(a) * currentR;
      ctx.globalAlpha = alpha * (0.5 + 0.5 * Math.sin(ts * 0.02 + i * 1.5));
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ==========================================================
  // Helper draw routines
  // ==========================================================

  /** Draw a tiny 4-point star at (x,y) with given size and rotation */
  _drawTinyStar(ctx, x, y, size, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.beginPath();
    const spikes = 4;
    const outerR = size;
    const innerR = size * 0.35;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * TWO_PI - HALF_PI;
      const r = i % 2 === 0 ? outerR : innerR;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
