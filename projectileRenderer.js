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

    ctx.restore();
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

    const p = pulse(timestamp, 100);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    // Outer glow
    ctx.globalAlpha = 0.25 + p * 0.1;
    ctx.strokeStyle = "#FF4444";
    ctx.lineWidth = 8 + p * 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Mid beam
    ctx.globalAlpha = 0.6 + p * 0.2;
    ctx.strokeStyle = "#FF6666";
    ctx.lineWidth = 3 + p * 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Core beam
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1.5 + p;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

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
    const impactGrad = ctx.createRadialGradient(x2, y2, 0, x2, y2, 10 + p * 5);
    impactGrad.addColorStop(0, "#FFFFFF");
    impactGrad.addColorStop(0.4, "#FF6666");
    impactGrad.addColorStop(1, "rgba(255,0,0,0)");
    ctx.fillStyle = impactGrad;
    ctx.beginPath();
    ctx.arc(x2, y2, 10 + p * 5, 0, TWO_PI);
    ctx.fill();

    ctx.restore();
  }

  // ==========================================================
  // MATH TOWER PROJECTILES
  // ==========================================================

  /** Generic glowing energy bolt with gradient sphere + sparkle ring */
  _drawEnergyBolt(ctx, x, y, r, angle, ts, color, lightColor, darkColor) {
    // Glow aura
    ctx.globalAlpha = 0.35;
    const auraGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
    auraGrad.addColorStop(0, lightColor);
    auraGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.5, 0, TWO_PI);
    ctx.fill();

    // Main sphere
    ctx.globalAlpha = 1;
    const mainGrad = ctx.createRadialGradient(
      x - r * 0.3,
      y - r * 0.3,
      0,
      x,
      y,
      r,
    );
    mainGrad.addColorStop(0, "#FFFFFF");
    mainGrad.addColorStop(0.3, lightColor);
    mainGrad.addColorStop(0.7, color);
    mainGrad.addColorStop(1, darkColor);
    ctx.fillStyle = mainGrad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
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
      const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, fSize);
      grad.addColorStop(0, "#FFD700");
      grad.addColorStop(0.5, color);
      grad.addColorStop(1, "rgba(255,109,0,0)");
      ctx.fillStyle = grad;
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
    const auraGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    auraGrad.addColorStop(0, lightColor);
    auraGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = auraGrad;
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

    const starGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, outerR);
    starGrad.addColorStop(0, "#FFFFFF");
    starGrad.addColorStop(0.3, lightColor);
    starGrad.addColorStop(1, darkColor);
    ctx.fillStyle = starGrad;
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

    const crescGrad = ctx.createLinearGradient(-r, 0, r, 0);
    crescGrad.addColorStop(0, darkColor);
    crescGrad.addColorStop(0.5, "#FFFFFF");
    crescGrad.addColorStop(1, lightColor);
    ctx.fillStyle = crescGrad;
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
    // Glow
    ctx.globalAlpha = 0.3;
    const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    glowGrad.addColorStop(0, "#82AAFF");
    glowGrad.addColorStop(1, "rgba(0,229,255,0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, TWO_PI);
    ctx.fill();

    // Core
    ctx.globalAlpha = 1;
    const coreGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
    coreGrad.addColorStop(0, "#FFFFFF");
    coreGrad.addColorStop(0.5, "#82AAFF");
    coreGrad.addColorStop(1, "#4488CC");
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();

    // Magical trail
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 0; i < 3; i++) {
      const dist = r * (1.0 + i * 0.8);
      const tx = x + nx * dist;
      const ty = y + ny * dist;
      ctx.globalAlpha = 0.4 - i * 0.12;
      ctx.fillStyle = "#82AAFF";
      ctx.beginPath();
      ctx.arc(tx, ty, r * (0.6 - i * 0.12), 0, TWO_PI);
      ctx.fill();
    }
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
    const bodyGrad = ctx.createRadialGradient(
      x - r * 0.3,
      y - r * 0.3,
      0,
      x,
      y,
      r,
    );
    bodyGrad.addColorStop(0, "#5A5A5A");
    bodyGrad.addColorStop(0.5, "#333333");
    bodyGrad.addColorStop(1, "#1A1A1A");
    ctx.fillStyle = bodyGrad;
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
    const flameGrad = ctx.createLinearGradient(
      ex,
      ey,
      ex + nx * flameLen,
      ey + ny * flameLen,
    );
    flameGrad.addColorStop(0, "#FFFFFF");
    flameGrad.addColorStop(0.2, "#FFDD00");
    flameGrad.addColorStop(0.5, "#FF6600");
    flameGrad.addColorStop(1, "rgba(255,0,0,0)");
    ctx.strokeStyle = flameGrad;
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
    const bodyGrad = ctx.createLinearGradient(-r, -r, r, r);
    bodyGrad.addColorStop(0, "rgba(200,240,255,0.9)");
    bodyGrad.addColorStop(0.3, "rgba(100,200,255,0.8)");
    bodyGrad.addColorStop(0.6, "rgba(0,191,255,0.7)");
    bodyGrad.addColorStop(1, "rgba(0,100,200,0.6)");
    ctx.fillStyle = bodyGrad;

    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.5, -r * 0.3);
    ctx.lineTo(r * 0.5, r * 0.3);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.5, r * 0.3);
    ctx.lineTo(-r * 0.5, -r * 0.3);
    ctx.closePath();
    ctx.fill();

    // Internal refraction highlight
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, -r * 0.6);
    ctx.lineTo(r * 0.2, -r * 0.1);
    ctx.lineTo(-r * 0.1, r * 0.1);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Flaming rock with molten trail */
  _drawMeteor(ctx, x, y, r, angle, ts) {
    // Ember particle trail
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 0; i < 6; i++) {
      const dist = r * (1.0 + i * 1.0);
      const jx = Math.sin(ts * 0.009 + i * 2.7) * r * 0.6;
      const jy = Math.cos(ts * 0.008 + i * 1.9) * r * 0.6;
      const ex = x + nx * dist + jx;
      const ey = y + ny * dist + jy;
      const eSize = r * (0.4 - i * 0.05);
      ctx.globalAlpha = 0.5 - i * 0.07;
      ctx.fillStyle = i < 3 ? "#FF6600" : "#FF3300";
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(0.5, eSize), 0, TWO_PI);
      ctx.fill();
    }

    // Molten trail streak
    ctx.globalAlpha = 0.4;
    const trailGrad = ctx.createLinearGradient(
      x,
      y,
      x + nx * r * 4,
      y + ny * r * 4,
    );
    trailGrad.addColorStop(0, "#FF8800");
    trailGrad.addColorStop(1, "rgba(255,68,0,0)");
    ctx.strokeStyle = trailGrad;
    ctx.lineWidth = r * 1.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + nx * r * 4, y + ny * r * 4);
    ctx.stroke();

    // Rock body
    ctx.globalAlpha = 1;
    const rockGrad = ctx.createRadialGradient(
      x - r * 0.2,
      y - r * 0.2,
      0,
      x,
      y,
      r,
    );
    rockGrad.addColorStop(0, "#FFB366");
    rockGrad.addColorStop(0.4, "#CC4400");
    rockGrad.addColorStop(0.8, "#662200");
    rockGrad.addColorStop(1, "#331100");
    ctx.fillStyle = rockGrad;

    // Irregular rock shape
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ts * 0.003);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TWO_PI;
      const rr = r * (0.8 + seededValue(i * 13) * 0.4);
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();

    // Molten cracks on surface
    ctx.strokeStyle = "#FF8800";
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.4);
    ctx.lineTo(r * 0.2, r * 0.1);
    ctx.lineTo(r * 0.5, r * 0.4);
    ctx.stroke();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Green bubbling toxic sphere with dripping trail */
  _drawToxicGlob(ctx, x, y, r, angle, ts) {
    // Dripping trail
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 0; i < 4; i++) {
      const dist = r * (1.2 + i * 1.0);
      const dx = x + nx * dist;
      const dy = y + ny * dist + i * r * 0.3; // drips downward
      const dropR = r * (0.35 - i * 0.06);
      ctx.globalAlpha = 0.4 - i * 0.08;
      ctx.fillStyle = "#8BC34A";
      ctx.beginPath();
      ctx.arc(dx, dy, Math.max(0.5, dropR), 0, TWO_PI);
      ctx.fill();
    }

    // Gas wisps
    for (let i = 0; i < 3; i++) {
      const wAngle = ts * 0.004 + i * 2.1;
      const wd = r * 1.8;
      const wx = x + Math.cos(wAngle) * wd;
      const wy = y + Math.sin(wAngle) * wd - r * 0.5;
      ctx.globalAlpha = 0.15 + 0.1 * Math.sin(ts * 0.006 + i);
      ctx.fillStyle = "#CDDC39";
      ctx.beginPath();
      ctx.arc(wx, wy, r * 0.5, 0, TWO_PI);
      ctx.fill();
    }

    // Main glob
    ctx.globalAlpha = 0.9;
    const globGrad = ctx.createRadialGradient(
      x - r * 0.2,
      y - r * 0.2,
      0,
      x,
      y,
      r,
    );
    globGrad.addColorStop(0, "#DCEDC8");
    globGrad.addColorStop(0.3, "#8BC34A");
    globGrad.addColorStop(0.7, "#558B2F");
    globGrad.addColorStop(1, "#33691E");
    ctx.fillStyle = globGrad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();

    // Bubbles on surface
    ctx.globalAlpha = 0.6;
    const bubblePhase = ts * 0.008;
    for (let i = 0; i < 4; i++) {
      const ba = bubblePhase + i * 1.5;
      const br = r * 0.6;
      const bx = x + Math.cos(ba) * br;
      const by = y + Math.sin(ba) * br;
      const bSize = r * 0.15 + Math.sin(ts * 0.012 + i) * r * 0.05;
      ctx.fillStyle = "#DCEDC8";
      ctx.beginPath();
      ctx.arc(bx, by, bSize, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Branching electric bolt with flash */
  _drawLightningBolt(ctx, x, y, r, angle, ts) {
    // Bright flash aura
    ctx.globalAlpha = 0.3 + 0.2 * Math.sin(ts * 0.03);
    const flashGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
    flashGrad.addColorStop(0, "#FFFFFF");
    flashGrad.addColorStop(0.5, "#FFFF88");
    flashGrad.addColorStop(1, "rgba(255,255,0,0)");
    ctx.fillStyle = flashGrad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.5, 0, TWO_PI);
    ctx.fill();

    // Lightning bolt shape
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = "#FFEB3B";
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    // Zig-zag bolt shape
    ctx.moveTo(r * 1.0, 0);
    ctx.lineTo(r * 0.2, -r * 0.4);
    ctx.lineTo(r * 0.4, -r * 0.1);
    ctx.lineTo(-r * 0.6, -r * 0.3);
    ctx.lineTo(-r * 0.1, 0);
    ctx.lineTo(-r * 0.6, r * 0.3);
    ctx.lineTo(r * 0.4, r * 0.1);
    ctx.lineTo(r * 0.2, r * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Spark particles
    for (let i = 0; i < 4; i++) {
      const sa = ts * 0.015 + i * 1.8;
      const sd = r * 1.5;
      const sx = x + Math.cos(sa) * sd;
      const sy = y + Math.sin(sa) * sd;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(ts * 0.025 + i);
      ctx.fillStyle = "#FFFF88";
      ctx.beginPath();
      ctx.arc(sx, sy, r * 0.15, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Spinning silk ball with web strand trail */
  _drawWebBall(ctx, x, y, r, angle, ts) {
    // Trailing web strands
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    ctx.strokeStyle = "rgba(200,200,200,0.4)";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) {
      const dist = r * (1.5 + i * 1.2);
      const tx = x + nx * dist;
      const ty = y + ny * dist;
      const wave = Math.sin(ts * 0.006 + i * 2) * r * 0.5;
      ctx.globalAlpha = 0.35 - i * 0.08;
      ctx.beginPath();
      ctx.moveTo(x + nx * r, y + ny * r);
      ctx.quadraticCurveTo(tx + ny * wave, ty + -nx * wave, tx, ty);
      ctx.stroke();
    }

    // Main web ball
    ctx.globalAlpha = 0.9;
    const webGrad = ctx.createRadialGradient(
      x - r * 0.2,
      y - r * 0.2,
      0,
      x,
      y,
      r,
    );
    webGrad.addColorStop(0, "#FFFFFF");
    webGrad.addColorStop(0.5, "#DDDDDD");
    webGrad.addColorStop(1, "#AAAAAA");
    ctx.fillStyle = webGrad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();

    // Web cross-hatch pattern on surface
    ctx.strokeStyle = "rgba(150,150,150,0.5)";
    ctx.lineWidth = 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ts * 0.004);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
      ctx.lineTo(
        Math.cos(a + Math.PI) * r * 0.8,
        Math.sin(a + Math.PI) * r * 0.8,
      );
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ==========================================================
  // SPECIAL PROJECTILES
  // ==========================================================

  /** Blue energy arrow */
  _drawBlueArrow(ctx, x, y, r, angle, ts) {
    // Energy trail
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 0; i < 3; i++) {
      const dist = r * (1.2 + i * 1.0);
      const tx = x + nx * dist;
      const ty = y + ny * dist;
      ctx.globalAlpha = 0.35 - i * 0.1;
      const tGrad = ctx.createRadialGradient(tx, ty, 0, tx, ty, r * 0.5);
      tGrad.addColorStop(0, "#64B5F6");
      tGrad.addColorStop(1, "rgba(100,181,246,0)");
      ctx.fillStyle = tGrad;
      ctx.beginPath();
      ctx.arc(tx, ty, r * 0.5, 0, TWO_PI);
      ctx.fill();
    }

    // Arrow body
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Shaft
    ctx.fillStyle = "#1565C0";
    ctx.fillRect(-r * 0.8, -r * 0.12, r * 1.4, r * 0.24);

    // Arrowhead
    const headGrad = ctx.createLinearGradient(r * 0.5, 0, r * 1.3, 0);
    headGrad.addColorStop(0, "#2196F3");
    headGrad.addColorStop(1, "#E3F2FD");
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.moveTo(r * 1.3, 0);
    ctx.lineTo(r * 0.5, -r * 0.45);
    ctx.lineTo(r * 0.5, r * 0.45);
    ctx.closePath();
    ctx.fill();

    // Fletching
    ctx.fillStyle = "#0D47A1";
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, 0);
    ctx.lineTo(-r * 1.1, -r * 0.3);
    ctx.lineTo(-r * 0.6, 0);
    ctx.lineTo(-r * 1.1, r * 0.3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Spinning gold coin with sparkles */
  _drawGoldCoin(ctx, x, y, r, angle, ts) {
    // Sparkle trail
    for (let i = 0; i < 5; i++) {
      const a = ts * 0.004 + i * 1.3;
      const dist = r * (1.5 + i * 0.6);
      const sx = x - Math.cos(angle) * dist + Math.sin(a) * r * 0.3;
      const sy = y - Math.sin(angle) * dist + Math.cos(a) * r * 0.3;
      ctx.globalAlpha = 0.5 - i * 0.09;
      ctx.fillStyle = "#FFD700";
      ctx.beginPath();
      ctx.arc(sx, sy, r * 0.12, 0, TWO_PI);
      ctx.fill();
    }

    // Coin body (simulated 3D spin by varying width)
    ctx.globalAlpha = 1;
    const spinPhase = Math.cos(ts * 0.008);
    const coinWidth = r * Math.abs(spinPhase);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(Math.max(0.15, Math.abs(spinPhase)), 1);

    const coinGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
    coinGrad.addColorStop(0, "#FFF8DC");
    coinGrad.addColorStop(0.3, "#FFD700");
    coinGrad.addColorStop(0.7, "#DAA520");
    coinGrad.addColorStop(1, "#B8860B");
    ctx.fillStyle = coinGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TWO_PI);
    ctx.fill();

    // Dollar sign / emblem
    if (Math.abs(spinPhase) > 0.3) {
      ctx.fillStyle = "#B8860B";
      ctx.font = `bold ${Math.round(r * 1.2)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", 0, 0);
    }

    // Rim
    ctx.strokeStyle = "#DAA520";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.85, 0, TWO_PI);
    ctx.stroke();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Spinning circular sawblade with metal sparks */
  _drawSawblade(ctx, x, y, r, angle, ts) {
    // Metal spark trail
    for (let i = 0; i < 4; i++) {
      const a = ts * 0.012 + i * 1.5;
      const sd = r * 1.3;
      const sx = x + Math.cos(a) * sd;
      const sy = y + Math.sin(a) * sd;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(ts * 0.02 + i);
      ctx.fillStyle = "#FFD700";
      ctx.beginPath();
      ctx.arc(sx, sy, r * 0.1, 0, TWO_PI);
      ctx.fill();
    }

    // Main sawblade
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ts * 0.015);

    // Blade teeth
    const teeth = 10;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a1 = (i / teeth) * TWO_PI;
      const a2 = ((i + 0.5) / teeth) * TWO_PI;
      const outerR = r;
      const innerR = r * 0.7;
      if (i === 0) ctx.moveTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
      else ctx.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
      ctx.lineTo(Math.cos(a2) * innerR, Math.sin(a2) * innerR);
    }
    ctx.closePath();

    const bladeGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    bladeGrad.addColorStop(0, "#E0E0E0");
    bladeGrad.addColorStop(0.6, "#9E9E9E");
    bladeGrad.addColorStop(1, "#616161");
    ctx.fillStyle = bladeGrad;
    ctx.fill();

    // Center hub
    ctx.fillStyle = "#424242";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.25, 0, TWO_PI);
    ctx.fill();

    // Hub hole
    ctx.fillStyle = "#212121";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.1, 0, TWO_PI);
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ==========================================================
  // EPIC / LEGENDARY PROJECTILES
  // ==========================================================

  /** Prismatic rainbow orb with multi-color trail and lens flare */
  _drawRainbowOrb(ctx, x, y, r, angle, ts) {
    // Multi-color particle trail
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 0; i < 6; i++) {
      const dist = r * (1.0 + i * 0.8);
      const jx = Math.sin(ts * 0.007 + i * 1.5) * r * 0.5;
      const jy = Math.cos(ts * 0.006 + i * 1.2) * r * 0.5;
      const tx = x + nx * dist + jx;
      const ty = y + ny * dist + jy;
      ctx.globalAlpha = 0.5 - i * 0.07;
      ctx.fillStyle = RAINBOW[i % RAINBOW.length];
      ctx.beginPath();
      ctx.arc(tx, ty, r * (0.35 - i * 0.03), 0, TWO_PI);
      ctx.fill();
    }

    // Glow aura (rainbow gradient)
    ctx.globalAlpha = 0.3;
    const auraGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
    auraGrad.addColorStop(0, "#FFFFFF");
    auraGrad.addColorStop(0.3, "#FF88FF");
    auraGrad.addColorStop(0.6, "#8888FF");
    auraGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.5, 0, TWO_PI);
    ctx.fill();

    // Main prismatic sphere (cycling hue via conic segments)
    ctx.globalAlpha = 1;
    const segments = RAINBOW.length;
    const rotOffset = ts * 0.003;
    for (let i = 0; i < segments; i++) {
      const startA = rotOffset + (i / segments) * TWO_PI;
      const endA = rotOffset + ((i + 1) / segments) * TWO_PI;
      ctx.fillStyle = RAINBOW[i];
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, startA, endA);
      ctx.closePath();
      ctx.fill();
    }

    // White core highlight
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.4, 0, TWO_PI);
    ctx.fill();

    // Lens flare cross
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = r * 0.15;
    ctx.lineCap = "round";
    const flareLen = r * 2;
    const flareAngle = ts * 0.002;
    ctx.beginPath();
    ctx.moveTo(
      x - Math.cos(flareAngle) * flareLen,
      y - Math.sin(flareAngle) * flareLen,
    );
    ctx.lineTo(
      x + Math.cos(flareAngle) * flareLen,
      y + Math.sin(flareAngle) * flareLen,
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(
      x - Math.cos(flareAngle + HALF_PI) * flareLen * 0.6,
      y - Math.sin(flareAngle + HALF_PI) * flareLen * 0.6,
    );
    ctx.lineTo(
      x + Math.cos(flareAngle + HALF_PI) * flareLen * 0.6,
      y + Math.sin(flareAngle + HALF_PI) * flareLen * 0.6,
    );
    ctx.stroke();

    ctx.globalAlpha = 1;
  }

  /** Ornate golden bolt with golden sparkle trail */
  _drawGoldenBolt(ctx, x, y, r, angle, ts) {
    // Golden sparkle trail
    const nx = -Math.cos(angle);
    const ny = -Math.sin(angle);
    for (let i = 0; i < 5; i++) {
      const dist = r * (1.0 + i * 0.9);
      const jx = Math.sin(ts * 0.008 + i * 2) * r * 0.3;
      const jy = Math.cos(ts * 0.007 + i * 1.5) * r * 0.3;
      const tx = x + nx * dist + jx;
      const ty = y + ny * dist + jy;
      ctx.globalAlpha = 0.55 - i * 0.09;
      ctx.fillStyle = "#FFD700";
      // Star-shaped sparkle
      this._drawTinyStar(ctx, tx, ty, r * 0.25, ts * 0.01 + i);
    }

    // Glow
    ctx.globalAlpha = 0.3;
    const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    glowGrad.addColorStop(0, "#FFF8DC");
    glowGrad.addColorStop(1, "rgba(255,215,0,0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, TWO_PI);
    ctx.fill();

    // Main bolt body
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Ornate elongated shape
    const bodyGrad = ctx.createLinearGradient(-r, 0, r, 0);
    bodyGrad.addColorStop(0, "#B8860B");
    bodyGrad.addColorStop(0.3, "#FFD700");
    bodyGrad.addColorStop(0.5, "#FFF8DC");
    bodyGrad.addColorStop(0.7, "#FFD700");
    bodyGrad.addColorStop(1, "#B8860B");
    ctx.fillStyle = bodyGrad;
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
    const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    glowGrad.addColorStop(0, "#FFFFFF");
    glowGrad.addColorStop(1, "rgba(192,192,192,0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, TWO_PI);
    ctx.fill();

    // Silver crescent
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + HALF_PI);

    const crescGrad = ctx.createLinearGradient(-r, -r, r, r);
    crescGrad.addColorStop(0, "#F5F5F5");
    crescGrad.addColorStop(0.5, "#C0C0C0");
    crescGrad.addColorStop(1, "#808080");
    ctx.fillStyle = crescGrad;

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
    const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    glowGrad.addColorStop(0, "#DEB887");
    glowGrad.addColorStop(1, "rgba(184,115,51,0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, TWO_PI);
    ctx.fill();

    // Main copper sphere
    ctx.globalAlpha = 1;
    const bodyGrad = ctx.createRadialGradient(
      x - r * 0.3,
      y - r * 0.3,
      0,
      x,
      y,
      r,
    );
    bodyGrad.addColorStop(0, "#FFD4A0");
    bodyGrad.addColorStop(0.3, "#DEB887");
    bodyGrad.addColorStop(0.6, "#B87333");
    bodyGrad.addColorStop(1, "#8B4513");
    ctx.fillStyle = bodyGrad;
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
    const auraGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
    auraGrad.addColorStop(0, "#FFFFFF");
    auraGrad.addColorStop(0.3, "#00FFFF");
    auraGrad.addColorStop(0.6, "#8B00FF");
    auraGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.5, 0, TWO_PI);
    ctx.fill();

    // Swirling galaxy sphere body
    ctx.globalAlpha = 1;

    // Base dark sphere
    const baseGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
    baseGrad.addColorStop(0, "#1A0040");
    baseGrad.addColorStop(0.5, "#0D0020");
    baseGrad.addColorStop(1, "#000010");
    ctx.fillStyle = baseGrad;
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
    const coreGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 0.3);
    coreGrad.addColorStop(0, "#FFFFFF");
    coreGrad.addColorStop(1, "rgba(0,255,255,0)");
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.3, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** Fallback simple glowing projectile */
  _drawDefaultProjectile(ctx, x, y, r, ts) {
    ctx.globalAlpha = 0.3;
    const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    glowGrad.addColorStop(0, "#FFFFFF");
    glowGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glowGrad;
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
    const fireGrad = ctx.createRadialGradient(x, y, 0, x, y, currentR);
    fireGrad.addColorStop(0, "#FFFFFF");
    fireGrad.addColorStop(0.2, "#FFD700");
    fireGrad.addColorStop(0.5, "#FF6600");
    fireGrad.addColorStop(0.8, "#FF2200");
    fireGrad.addColorStop(1, "rgba(255,0,0,0)");
    ctx.fillStyle = fireGrad;
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
      const flashGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 15);
      flashGrad.addColorStop(0, "#FFFFFF");
      flashGrad.addColorStop(0.5, "#FFFF88");
      flashGrad.addColorStop(1, "rgba(255,255,0,0)");
      ctx.fillStyle = flashGrad;
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
    const portalGrad = ctx.createRadialGradient(x, y, 0, x, y, currentR * 0.6);
    portalGrad.addColorStop(0, "#FFFFFF");
    portalGrad.addColorStop(0.3, "#CC88FF");
    portalGrad.addColorStop(1, "rgba(75,0,130,0)");
    ctx.fillStyle = portalGrad;
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
    const darkGrad = ctx.createRadialGradient(x, y, 0, x, y, currentR * 0.4);
    darkGrad.addColorStop(0, "rgba(0,0,0,1)");
    darkGrad.addColorStop(0.6, "rgba(10,0,20,0.9)");
    darkGrad.addColorStop(1, "rgba(20,0,40,0)");
    ctx.fillStyle = darkGrad;
    ctx.beginPath();
    ctx.arc(x, y, currentR * 0.4, 0, TWO_PI);
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
    const grad = ctx.createRadialGradient(x, y, 0, x, y, currentR);
    grad.addColorStop(0, "#FFFFFF");
    grad.addColorStop(0.3, "#FF8800");
    grad.addColorStop(0.7, "#FF4400");
    grad.addColorStop(1, "rgba(255,0,0,0)");
    ctx.fillStyle = grad;
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
    const healGrad = ctx.createRadialGradient(x, y, 0, x, y, currentR);
    healGrad.addColorStop(0, "#A5D6A7");
    healGrad.addColorStop(1, "rgba(102,187,106,0)");
    ctx.fillStyle = healGrad;
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
