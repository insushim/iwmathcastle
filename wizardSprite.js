// wizardSprite.js - Enhanced Pixel-art Wizard on Horseback sprite system
// Canvas 2D primitives only (fillRect, arc, lineTo, bezierCurveTo, etc.)
// 8 directional sprites with walk(8-frame), gallop, casting, idle animations
// Direction interpolation, sparkle particles, aura, damage/levelup effects

// Direction constants
const DIR = {
  S: 0,
  SE: 1,
  E: 2,
  NE: 3,
  N: 4,
  NW: 5,
  W: 6,
  SW: 7,
};

// Direction angles in radians for interpolation
const DIR_ANGLES = {
  [DIR.S]: Math.PI / 2,
  [DIR.SE]: Math.PI / 4,
  [DIR.E]: 0,
  [DIR.NE]: -Math.PI / 4,
  [DIR.N]: -Math.PI / 2,
  [DIR.NW]: (-3 * Math.PI) / 4,
  [DIR.W]: Math.PI,
  [DIR.SW]: (3 * Math.PI) / 4,
};

// Color palette
const COLORS = {
  // Horse
  horsebody: "#8B5E3C",
  horseDark: "#6B3F1F",
  horseLight: "#A97550",
  horseBelly: "#C49A6C",
  mane: "#3B2310",
  tail: "#3B2310",
  hoof: "#2E1A0A",
  // Wizard
  robe: "#4A3B8F",
  robeDark: "#332A6B",
  robeLight: "#6B5BBF",
  skin: "#F5D0A9",
  skinDark: "#D4A87A",
  hat: "#5B3FAF",
  hatDark: "#3E2A7A",
  hatBand: "#FFD700",
  // Staff
  staffWood: "#6B4226",
  staffTip: "#00FFFF",
  staffGlow: "rgba(0,255,255,0.35)",
  staffGlowOuter: "rgba(0,255,255,0.12)",
  // Outline
  outline: "#1A1A2E",
  // Eyes
  eye: "#FFFFFF",
  pupil: "#1A1A2E",
  // Aura
  aura: "rgba(100,80,200,0.08)",
  auraInner: "rgba(120,100,255,0.05)",
};

// 8-frame walk cycle leg offsets
const LEG_OFFSETS_WALK = [
  { fl: -7, fr: 5, bl: -5, br: 7 },
  { fl: -5, fr: 2, bl: -2, br: 5 },
  { fl: -2, fr: -1, bl: 1, br: 2 },
  { fl: 1, fr: -4, bl: 4, br: -1 },
  { fl: 5, fr: -7, bl: 7, br: -5 },
  { fl: 3, fr: -5, bl: 5, br: -3 },
  { fl: 0, fr: -2, bl: 2, br: 0 },
  { fl: -3, fr: 1, bl: -1, br: 3 },
];

// Gallop cycle - more extreme offsets with suspension phases
const LEG_OFFSETS_GALLOP = [
  { fl: -10, fr: -8, bl: 8, br: 10 },
  { fl: -8, fr: -4, bl: 5, br: 8 },
  { fl: -4, fr: 0, bl: 2, br: 4 },
  { fl: 0, fr: 4, bl: -2, br: 0 },
  { fl: 5, fr: 8, bl: -6, br: -4 },
  { fl: 8, fr: 10, bl: -10, br: -8 },
  { fl: 5, fr: 6, bl: -7, br: -5 },
  { fl: 0, fr: 2, bl: -3, br: -1 },
];

// Casting animation staff raise offsets (6 frames)
const CAST_FRAMES = [
  { staffRaise: 0, robeFlutter: 0, glowMult: 1 },
  { staffRaise: -4, robeFlutter: 1, glowMult: 1.5 },
  { staffRaise: -10, robeFlutter: 2, glowMult: 2.5 },
  { staffRaise: -14, robeFlutter: 3, glowMult: 4.0 },
  { staffRaise: -12, robeFlutter: 2, glowMult: 3.0 },
  { staffRaise: -6, robeFlutter: 1, glowMult: 1.8 },
];

export class WizardSprite {
  constructor() {
    this._width = 48;
    this._height = 56;
    this._direction = DIR.S;
    this._targetDirection = DIR.S;
    this._dirAngle = DIR_ANGLES[DIR.S];
    this._targetDirAngle = DIR_ANGLES[DIR.S];
    this._frame = 0;
    this._frameTimer = 0;
    this._walking = false;
    this._idleTimer = 0;
    this._idleBob = 0;
    this._galloping = false;

    // Animation timing
    this._walkFrameMs = 120;
    this._gallopFrameMs = 80;
    this._idleCycleMs = 400;

    // Staff glow pulse
    this._glowTimer = 0;
    this._glowCycleMs = 1200;

    // Direction interpolation
    this._dirLerpSpeed = 0.15;

    // Idle enhancements
    this._idleHeadTimer = 0;
    this._idleHeadTurn = 0;
    this._idleBreathTimer = 0;
    this._idleEarTimer = 0;
    this._idleTailTimer = 0;
    this._idleStaffGlowVar = 0;

    // Casting state
    this._casting = false;
    this._castFrame = 0;
    this._castTimer = 0;
    this._castFrameMs = 100;

    // Damage flash
    this._damaged = false;
    this._damageTimer = 0;
    this._damageFlashMs = 300;

    // Level up glow
    this._levelUp = false;
    this._levelUpTimer = 0;
    this._levelUpDurationMs = 1500;

    // Sparkle particles (drawn as part of sprite)
    this._sparkles = [];
    this._sparkleTimer = 0;
    this._sparkleIntervalMs = 80;

    // Robe flutter
    this._robeFlutterTimer = 0;
    this._robeFlutterCycleMs = 600;

    // Horse detail timers
    this._horseTailTimer = 0;
    this._horseBreathTimer = 0;
    this._horseEarTimer = 0;

    // Mane flow
    this._maneFlowTimer = 0;

    // Aura
    this._auraTimer = 0;
    this._auraCycleMs = 2000;
  }

  get width() {
    return this._width;
  }

  get height() {
    return this._height;
  }

  /**
   * Set movement direction from dx, dy inputs (-1, 0, or 1).
   * If both are 0, sprite goes idle.
   */
  setDirection(dx, dy) {
    if (dx === 0 && dy === 0) {
      this._walking = false;
      this._galloping = false;
      return;
    }
    this._walking = true;

    // Map dx,dy to 8 directions
    let newDir = this._direction;
    if (dx === 0 && dy > 0) newDir = DIR.S;
    else if (dx > 0 && dy > 0) newDir = DIR.SE;
    else if (dx > 0 && dy === 0) newDir = DIR.E;
    else if (dx > 0 && dy < 0) newDir = DIR.NE;
    else if (dx === 0 && dy < 0) newDir = DIR.N;
    else if (dx < 0 && dy < 0) newDir = DIR.NW;
    else if (dx < 0 && dy === 0) newDir = DIR.W;
    else if (dx < 0 && dy > 0) newDir = DIR.SW;

    this._targetDirection = newDir;
    this._targetDirAngle = DIR_ANGLES[newDir];
  }

  /**
   * Enable/disable casting animation.
   */
  setCasting(isCasting) {
    if (isCasting && !this._casting) {
      this._castFrame = 0;
      this._castTimer = 0;
    }
    this._casting = isCasting;
  }

  /**
   * Trigger brief damage red flash.
   */
  setDamaged() {
    this._damaged = true;
    this._damageTimer = 0;
  }

  /**
   * Trigger golden level-up glow effect.
   */
  setLevelUp() {
    this._levelUp = true;
    this._levelUpTimer = 0;
  }

  /**
   * Enable gallop mode (faster horse movement).
   */
  setGalloping(isGalloping) {
    this._galloping = isGalloping;
  }

  /**
   * Update animation state.
   * @param {number} deltaTime - milliseconds since last frame
   */
  update(deltaTime) {
    // Glow pulse
    this._glowTimer = (this._glowTimer + deltaTime) % this._glowCycleMs;

    // Aura pulse
    this._auraTimer = (this._auraTimer + deltaTime) % this._auraCycleMs;

    // Direction interpolation
    this._interpolateDirection();

    // Horse detail timers
    this._horseTailTimer += deltaTime;
    this._horseBreathTimer += deltaTime;
    this._horseEarTimer += deltaTime;
    this._maneFlowTimer += deltaTime;

    // Robe flutter
    this._robeFlutterTimer =
      (this._robeFlutterTimer + deltaTime) % this._robeFlutterCycleMs;

    // Damage flash
    if (this._damaged) {
      this._damageTimer += deltaTime;
      if (this._damageTimer >= this._damageFlashMs) {
        this._damaged = false;
        this._damageTimer = 0;
      }
    }

    // Level up glow
    if (this._levelUp) {
      this._levelUpTimer += deltaTime;
      if (this._levelUpTimer >= this._levelUpDurationMs) {
        this._levelUp = false;
        this._levelUpTimer = 0;
      }
    }

    // Casting animation
    if (this._casting) {
      this._castTimer += deltaTime;
      if (this._castTimer >= this._castFrameMs) {
        this._castTimer -= this._castFrameMs;
        this._castFrame = (this._castFrame + 1) % CAST_FRAMES.length;
      }
    } else {
      this._castFrame = 0;
      this._castTimer = 0;
    }

    // Sparkle particles
    this._sparkleTimer += deltaTime;
    if (this._sparkleTimer >= this._sparkleIntervalMs) {
      this._sparkleTimer -= this._sparkleIntervalMs;
      this._spawnSparkle();
    }
    this._updateSparkles(deltaTime);

    if (this._walking) {
      const frameMs = this._galloping ? this._gallopFrameMs : this._walkFrameMs;
      this._frameTimer += deltaTime;
      if (this._frameTimer >= frameMs) {
        this._frameTimer -= frameMs;
        this._frame = (this._frame + 1) % 8;
      }
      this._idleTimer = 0;
      this._idleBob = 0;
      this._idleHeadTimer = 0;
      this._idleHeadTurn = 0;
    } else {
      this._frame = 0;
      this._frameTimer = 0;
      this._idleTimer += deltaTime;

      // Gentle bobbing (breathing)
      const t = (this._idleTimer % this._idleCycleMs) / this._idleCycleMs;
      this._idleBob = Math.sin(t * Math.PI * 2) * 1.5;

      // Occasional head turn
      this._idleHeadTimer += deltaTime;
      const headCycle = 3000;
      const headT = (this._idleHeadTimer % headCycle) / headCycle;
      this._idleHeadTurn = Math.sin(headT * Math.PI * 2) * 1.5;

      // Breathing (belly movement)
      this._idleBreathTimer += deltaTime;

      // Ear flicker
      this._idleEarTimer += deltaTime;

      // Tail idle sway
      this._idleTailTimer += deltaTime;

      // Staff glow variation in idle
      this._idleStaffGlowVar = Math.sin(this._idleTimer * 0.003) * 0.3;
    }
  }

  _interpolateDirection() {
    // Smoothly interpolate direction angle
    let diff = this._targetDirAngle - this._dirAngle;
    // Normalize to -PI..PI
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    if (Math.abs(diff) < 0.05) {
      this._dirAngle = this._targetDirAngle;
      this._direction = this._targetDirection;
    } else {
      this._dirAngle += diff * this._dirLerpSpeed;
      // Snap to nearest direction for rendering
      this._direction = this._angleToDir(this._dirAngle);
    }
  }

  _angleToDir(angle) {
    // Normalize angle
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;

    // Find closest direction
    let bestDir = DIR.S;
    let bestDist = Infinity;
    for (const [dir, a] of Object.entries(DIR_ANGLES)) {
      let d = Math.abs(angle - a);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d < bestDist) {
        bestDist = d;
        bestDir = parseInt(dir);
      }
    }
    return bestDir;
  }

  _spawnSparkle() {
    // Sparkle near staff tip area
    this._sparkles.push({
      x: (Math.random() - 0.5) * 8,
      y: (Math.random() - 0.5) * 8,
      life: 400 + Math.random() * 300,
      maxLife: 400 + Math.random() * 300,
      size: 1 + Math.random() * 2,
      angle: Math.random() * Math.PI * 2,
      speed: 0.02 + Math.random() * 0.03,
    });
    // Keep sparkle count manageable
    if (this._sparkles.length > 12) {
      this._sparkles.shift();
    }
  }

  _updateSparkles(dt) {
    for (let i = this._sparkles.length - 1; i >= 0; i--) {
      const s = this._sparkles[i];
      s.life -= dt;
      s.x += Math.cos(s.angle) * s.speed * dt;
      s.y += Math.sin(s.angle) * s.speed * dt - 0.01 * dt;
      if (s.life <= 0) {
        this._sparkles.splice(i, 1);
      }
    }
  }

  /**
   * Draw the wizard on horseback at position (x, y) on context ctx.
   * (x, y) is the center-bottom of the sprite.
   */
  render(ctx, x, y) {
    ctx.save();

    const ox = Math.round(x - this._width / 2);
    const oy = Math.round(y - this._height + this._idleBob);

    const dir = this._direction;
    const frame = this._frame;

    // Pick leg offsets based on gallop vs walk
    const legTable = this._galloping ? LEG_OFFSETS_GALLOP : LEG_OFFSETS_WALK;
    const legOff = this._walking
      ? legTable[frame]
      : { fl: 0, fr: 0, bl: 0, br: 0 };

    // Glow intensity for staff tip (0..1 pulsing)
    let glowT =
      (Math.sin((this._glowTimer / this._glowCycleMs) * Math.PI * 2) + 1) / 2;

    // Add idle glow variation
    if (!this._walking) {
      glowT = Math.max(0, Math.min(1, glowT + this._idleStaffGlowVar));
    }

    // Casting glow multiplier
    const castData = this._casting ? CAST_FRAMES[this._castFrame] : null;
    if (castData) {
      glowT *= castData.glowMult;
    }

    // Horse breath (belly) offset
    const breathT = Math.sin(this._horseBreathTimer * 0.004) * 0.8;

    // Ear rotation
    const earT = Math.sin(this._horseEarTimer * 0.007) * 2;

    // Tail sway
    const tailT = Math.sin(this._horseTailTimer * 0.005) * 3;

    // Mane flow
    const maneT = Math.sin(this._maneFlowTimer * 0.004) * 2;

    // Robe flutter
    const robeFlutter =
      Math.sin(
        (this._robeFlutterTimer / this._robeFlutterCycleMs) * Math.PI * 2,
      ) * 1.5;

    // Mirror logic: W, NW, SW are mirrored E, NE, SE
    const mirrored = dir === DIR.W || dir === DIR.NW || dir === DIR.SW;
    let drawDir = dir;
    if (dir === DIR.W) drawDir = DIR.E;
    else if (dir === DIR.NW) drawDir = DIR.NE;
    else if (dir === DIR.SW) drawDir = DIR.SE;

    if (mirrored) {
      ctx.save();
      ctx.translate(ox + this._width, oy);
      ctx.scale(-1, 1);
    } else {
      ctx.save();
      ctx.translate(ox, oy);
    }

    // Extra state for enhanced rendering
    const enhState = {
      breathT,
      earT,
      tailT,
      maneT,
      robeFlutter,
      castData,
      galloping: this._galloping && this._walking,
      frame,
    };

    // Draw aura (behind everything)
    this._drawAura(ctx);

    // Level up golden glow (behind sprite)
    if (this._levelUp) {
      this._drawLevelUpGlow(ctx);
    }

    // Dispatch based on canonical direction
    switch (drawDir) {
      case DIR.E:
        this._drawSide(ctx, legOff, glowT, enhState);
        break;
      case DIR.S:
        this._drawFront(ctx, legOff, glowT, enhState);
        break;
      case DIR.N:
        this._drawBack(ctx, legOff, glowT, enhState);
        break;
      case DIR.SE:
        this._drawDiagonalFront(ctx, legOff, glowT, enhState);
        break;
      case DIR.NE:
        this._drawDiagonalBack(ctx, legOff, glowT, enhState);
        break;
    }

    // Damage red flash overlay
    if (this._damaged) {
      this._drawDamageFlash(ctx);
    }

    ctx.restore();
    ctx.restore();
  }

  // ========================================================
  // AURA - subtle magical glow around wizard
  // ========================================================
  _drawAura(ctx) {
    const W = this._width;
    const H = this._height;
    const auraT =
      (Math.sin((this._auraTimer / this._auraCycleMs) * Math.PI * 2) + 1) / 2;
    const auraRadius = 26 + auraT * 4;

    ctx.fillStyle = COLORS.aura;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 30, auraRadius, auraRadius * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.auraInner;
    ctx.beginPath();
    ctx.ellipse(
      W / 2,
      H - 32,
      auraRadius * 0.7,
      auraRadius * 0.6,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // ========================================================
  // LEVEL UP - golden glow
  // ========================================================
  _drawLevelUpGlow(ctx) {
    const W = this._width;
    const H = this._height;
    const progress = this._levelUpTimer / this._levelUpDurationMs;
    const alpha = Math.sin(progress * Math.PI) * 0.4;
    const pulseAlpha = Math.sin(progress * Math.PI * 6) * 0.15;
    const radius = 20 + progress * 15;

    ctx.fillStyle = `rgba(255,215,0,${Math.max(0, alpha + pulseAlpha)})`;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 28, radius, radius * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright core
    ctx.fillStyle = `rgba(255,255,200,${Math.max(0, alpha * 0.5)})`;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 30, radius * 0.5, radius * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ========================================================
  // DAMAGE FLASH - red overlay
  // ========================================================
  _drawDamageFlash(ctx) {
    const W = this._width;
    const H = this._height;
    const flashProgress = this._damageTimer / this._damageFlashMs;
    const flashAlpha = (1 - flashProgress) * 0.5;
    const flicker = Math.sin(flashProgress * Math.PI * 4) > 0;

    if (flicker) {
      ctx.fillStyle = `rgba(255,0,0,${flashAlpha})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ========================================================
  // SHADOW - direction-aware ground shadow
  // ========================================================
  _drawShadow(ctx, cx, cy, dir) {
    // Shadow shifts slightly based on direction
    let sx = 0;
    let sy = 0;
    if (dir === DIR.E || dir === DIR.SE || dir === DIR.NE) sx = 2;
    if (dir === DIR.S || dir === DIR.SE || dir === DIR.SW) sy = 1;

    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(cx + sx, cy + sy, 20, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Darker core
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.beginPath();
    ctx.ellipse(cx + sx * 0.5, cy + sy * 0.5, 14, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ========================================================
  // SPARKLES - rendered near staff tip
  // ========================================================
  _drawSparkles(ctx, tipX, tipY) {
    for (const s of this._sparkles) {
      const alpha = Math.max(0, s.life / s.maxLife);
      const colors = [
        `rgba(0,255,255,${alpha})`,
        `rgba(150,200,255,${alpha})`,
        `rgba(255,255,200,${alpha})`,
      ];
      const colorIdx = Math.floor((s.x * 100 + s.y * 100) % 3);
      ctx.fillStyle = colors[Math.abs(colorIdx)];

      // Draw small diamond/star shape
      const sx = tipX + s.x;
      const sy = tipY + s.y;
      const sz = s.size * alpha;

      ctx.beginPath();
      ctx.moveTo(sx, sy - sz);
      ctx.lineTo(sx + sz * 0.5, sy);
      ctx.lineTo(sx, sy + sz);
      ctx.lineTo(sx - sz * 0.5, sy);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ========================================================
  // SIDE VIEW (E direction) - Full horse profile
  // ========================================================
  _drawSide(ctx, leg, glow, enh) {
    const W = this._width;
    const H = this._height;

    // Direction-aware shadow
    this._drawShadow(ctx, W / 2, H - 1, DIR.E);

    // Horse legs (behind)
    ctx.fillStyle = COLORS.horseDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLeg(ctx, 12, H - 18, leg.bl, false, enh.breathT);
    this._drawLeg(ctx, 28, H - 18, leg.fl, false, enh.breathT);

    // Horse body
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(
      20,
      H - 24 + enh.breathT * 0.3,
      16,
      9 + enh.breathT * 0.5,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();

    // Belly highlight with breathing
    ctx.fillStyle = COLORS.horseBelly;
    ctx.beginPath();
    ctx.ellipse(
      20,
      H - 21 + enh.breathT * 0.3,
      12,
      4 + enh.breathT * 0.4,
      0,
      0,
      Math.PI,
    );
    ctx.fill();

    // Horse legs (front, nearer)
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLeg(ctx, 10, H - 18, leg.br, true, enh.breathT);
    this._drawLeg(ctx, 30, H - 18, leg.fr, true, enh.breathT);

    // Tail with sway and direction flow
    this._drawTailSide(ctx, W, H, enh.tailT, enh.maneT, this._walking);

    // Horse neck
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(30, H - 30);
    ctx.lineTo(36, H - 38);
    ctx.lineTo(40, H - 38);
    ctx.lineTo(36, H - 26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Horse head
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(40, H - 40, 6, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Horse ear with rotation
    this._drawEarSide(ctx, 39, H - 45, 41, H - 48, 43, H - 44, enh.earT);

    // Horse eye
    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.arc(42, H - 41, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(42.5, H - 41, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Mane with flow
    this._drawManeSide(ctx, W, H, enh.maneT, this._walking);

    // Saddle
    ctx.fillStyle = "#8B0000";
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.fillRect(16, H - 34, 12, 4);
    ctx.strokeRect(16, H - 34, 12, 4);

    // Wizard body
    const staffRaise = enh.castData ? enh.castData.staffRaise : 0;
    const flutter = enh.castData ? enh.castData.robeFlutter : enh.robeFlutter;

    ctx.fillStyle = COLORS.robe;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(17, H - 34);
    ctx.lineTo(15, H - 44);
    ctx.lineTo(28, H - 44);
    ctx.lineTo(27, H - 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Robe drape with flutter
    ctx.fillStyle = COLORS.robeDark;
    ctx.beginPath();
    ctx.moveTo(17, H - 34);
    ctx.quadraticCurveTo(
      14 + flutter * 0.5,
      H - 28,
      14 - flutter * 0.3,
      H - 26,
    );
    ctx.lineTo(20, H - 28);
    ctx.lineTo(20, H - 34);
    ctx.closePath();
    ctx.fill();

    // Wizard head
    const headTurn = this._walking ? 0 : this._idleHeadTurn * 0.3;
    ctx.fillStyle = COLORS.skin;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(22 + headTurn, H - 48, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Face detail
    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.arc(24 + headTurn, H - 49, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(24.5 + headTurn, H - 49, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Wizard hat
    ctx.fillStyle = COLORS.hat;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15 + headTurn, H - 52);
    ctx.lineTo(22 + headTurn, H - 66);
    ctx.lineTo(29 + headTurn, H - 52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hat band
    ctx.fillStyle = COLORS.hatBand;
    ctx.fillRect(15 + headTurn, H - 53, 14, 2);

    // Hat brim
    ctx.fillStyle = COLORS.hatDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(22 + headTurn, H - 52, 9, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Staff with optional raise for casting
    const staffTipY = H - 60 + staffRaise;
    this._drawStaff(ctx, 10, H - 32, 10, staffTipY, glow, enh.castData);

    // Sparkles near staff tip
    this._drawSparkles(ctx, 10, staffTipY);

    // Wizard arm holding staff
    ctx.strokeStyle = COLORS.robe;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(17, H - 40);
    ctx.lineTo(10, H - 34);
    ctx.stroke();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(17, H - 40);
    ctx.lineTo(10, H - 34);
    ctx.stroke();
  }

  // ========================================================
  // FRONT VIEW (S direction) - facing toward viewer
  // ========================================================
  _drawFront(ctx, leg, glow, enh) {
    const W = this._width;
    const H = this._height;

    this._drawShadow(ctx, W / 2, H - 1, DIR.S);

    // Horse legs (back pair, further)
    ctx.fillStyle = COLORS.horseDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLegFront(ctx, 16, H - 16, leg.bl);
    this._drawLegFront(ctx, 32, H - 16, leg.br);

    // Horse body with breathing
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(
      W / 2,
      H - 22 + enh.breathT * 0.3,
      12,
      10 + enh.breathT * 0.4,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();

    // Belly
    ctx.fillStyle = COLORS.horseBelly;
    ctx.beginPath();
    ctx.ellipse(
      W / 2,
      H - 18 + enh.breathT * 0.3,
      8,
      4 + enh.breathT * 0.3,
      0,
      0,
      Math.PI,
    );
    ctx.fill();

    // Horse legs (front pair, closer)
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLegFront(ctx, 18, H - 16, leg.fl);
    this._drawLegFront(ctx, 30, H - 16, leg.fr);

    // Horse chest/neck
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 32, 8, 7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Horse head
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 38, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Horse ears with rotation
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    // Left ear
    ctx.beginPath();
    ctx.moveTo(18, H - 41);
    ctx.lineTo(16 - enh.earT * 0.3, H - 46 + Math.abs(enh.earT) * 0.2);
    ctx.lineTo(20, H - 42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Right ear
    ctx.beginPath();
    ctx.moveTo(30, H - 41);
    ctx.lineTo(32 + enh.earT * 0.3, H - 46 + Math.abs(enh.earT) * 0.2);
    ctx.lineTo(28, H - 42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Horse eyes
    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.arc(20, H - 38, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(20, H - 37.5, 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.arc(28, H - 38, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(28, H - 37.5, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Nostrils
    ctx.fillStyle = COLORS.horseDark;
    ctx.fillRect(22, H - 35, 2, 1);
    ctx.fillRect(26, H - 35, 2, 1);

    // Mane (center tuft) with flow
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 43);
    ctx.lineTo(W / 2 - 1 + enh.maneT * 0.3, H - 46);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 43);
    ctx.lineTo(W / 2 + 1 + enh.maneT * 0.2, H - 47);
    ctx.stroke();

    // Saddle
    ctx.fillStyle = "#8B0000";
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.fillRect(17, H - 32, 14, 3);
    ctx.strokeRect(17, H - 32, 14, 3);

    // Wizard body
    const flutter = enh.castData ? enh.castData.robeFlutter : enh.robeFlutter;
    ctx.fillStyle = COLORS.robe;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(17 - flutter * 0.2, H - 32);
    ctx.lineTo(16, H - 44);
    ctx.lineTo(32, H - 44);
    ctx.lineTo(31 + flutter * 0.2, H - 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Belt
    ctx.fillStyle = COLORS.hatBand;
    ctx.fillRect(18, H - 36, 12, 2);

    // Wizard head
    const headTurn = this._walking ? 0 : this._idleHeadTurn;
    ctx.fillStyle = COLORS.skin;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(W / 2 + headTurn * 0.3, H - 48, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eyes
    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.arc(21 + headTurn * 0.2, H - 49, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(27 + headTurn * 0.2, H - 49, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(21 + headTurn * 0.3, H - 48.5, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(27 + headTurn * 0.3, H - 48.5, 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Beard hint
    ctx.fillStyle = COLORS.skinDark;
    ctx.beginPath();
    ctx.arc(W / 2 + headTurn * 0.2, H - 44, 3, 0, Math.PI);
    ctx.fill();

    // Wizard hat
    ctx.fillStyle = COLORS.hat;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, H - 52);
    ctx.lineTo(W / 2, H - 66);
    ctx.lineTo(33, H - 52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hat band
    ctx.fillStyle = COLORS.hatBand;
    ctx.fillRect(15, H - 53, 18, 2);

    // Hat brim
    ctx.fillStyle = COLORS.hatDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 52, 10, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Staff with casting raise
    const staffRaise = enh.castData ? enh.castData.staffRaise : 0;
    const staffTipY = H - 60 + staffRaise;
    this._drawStaff(ctx, 10, H - 30, 8, staffTipY, glow, enh.castData);

    // Sparkles
    this._drawSparkles(ctx, 8, staffTipY);

    // Wizard arm
    ctx.strokeStyle = COLORS.robe;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(17, H - 40);
    ctx.lineTo(10, H - 32);
    ctx.stroke();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(17, H - 40);
    ctx.lineTo(10, H - 32);
    ctx.stroke();
  }

  // ========================================================
  // BACK VIEW (N direction) - facing away from viewer
  // ========================================================
  _drawBack(ctx, leg, glow, enh) {
    const W = this._width;
    const H = this._height;

    this._drawShadow(ctx, W / 2, H - 1, DIR.N);

    // Horse legs (front pair, further)
    ctx.fillStyle = COLORS.horseDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLegFront(ctx, 18, H - 16, leg.fl);
    this._drawLegFront(ctx, 30, H - 16, leg.fr);

    // Horse body with breathing
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(
      W / 2,
      H - 22 + enh.breathT * 0.3,
      12,
      10 + enh.breathT * 0.4,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();

    // Horse legs (back pair, closer)
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLegFront(ctx, 16, H - 16, leg.bl);
    this._drawLegFront(ctx, 32, H - 16, leg.br);

    // Tail (visible from back) with sway
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 14);
    ctx.quadraticCurveTo(
      W / 2 - 3 + enh.tailT,
      H - 8,
      W / 2 - 2 + enh.tailT * 0.7,
      H - 4,
    );
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 14);
    ctx.quadraticCurveTo(
      W / 2 + 3 + enh.tailT * 0.5,
      H - 9,
      W / 2 + 1 + enh.tailT * 0.3,
      H - 5,
    );
    ctx.stroke();

    // Horse back of neck
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 32, 7, 6, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Horse ears with rotation
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(19, H - 36);
    ctx.lineTo(17 - enh.earT * 0.3, H - 42);
    ctx.lineTo(21, H - 37);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(29, H - 36);
    ctx.lineTo(31 + enh.earT * 0.3, H - 42);
    ctx.lineTo(27, H - 37);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Mane with flow
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 38);
    ctx.lineTo(W / 2 + enh.maneT * 0.3, H - 34);
    ctx.stroke();

    // Saddle
    ctx.fillStyle = "#8B0000";
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.fillRect(17, H - 32, 14, 3);
    ctx.strokeRect(17, H - 32, 14, 3);

    // Wizard body
    const flutter = enh.castData ? enh.castData.robeFlutter : enh.robeFlutter;
    ctx.fillStyle = COLORS.robe;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(17 - flutter * 0.15, H - 32);
    ctx.lineTo(16, H - 44);
    ctx.lineTo(32, H - 44);
    ctx.lineTo(31 + flutter * 0.15, H - 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Robe back seam
    ctx.strokeStyle = COLORS.robeDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 44);
    ctx.lineTo(W / 2, H - 32);
    ctx.stroke();

    // Wizard head
    ctx.fillStyle = COLORS.skin;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(W / 2, H - 48, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hair on back of head
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(W / 2, H - 48, 5, -0.5, Math.PI + 0.5);
    ctx.fill();

    // Wizard hat
    ctx.fillStyle = COLORS.hat;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, H - 52);
    ctx.lineTo(W / 2, H - 66);
    ctx.lineTo(33, H - 52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hat band
    ctx.fillStyle = COLORS.hatBand;
    ctx.fillRect(15, H - 53, 18, 2);

    // Hat brim
    ctx.fillStyle = COLORS.hatDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 52, 10, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Staff
    const staffRaise = enh.castData ? enh.castData.staffRaise : 0;
    const staffTipY = H - 60 + staffRaise;
    this._drawStaff(ctx, 36, H - 30, 38, staffTipY, glow, enh.castData);

    // Sparkles
    this._drawSparkles(ctx, 38, staffTipY);

    // Wizard arm
    ctx.strokeStyle = COLORS.robe;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(31, H - 40);
    ctx.lineTo(36, H - 32);
    ctx.stroke();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(31, H - 40);
    ctx.lineTo(36, H - 32);
    ctx.stroke();
  }

  // ========================================================
  // DIAGONAL FRONT VIEW (SE direction)
  // ========================================================
  _drawDiagonalFront(ctx, leg, glow, enh) {
    const W = this._width;
    const H = this._height;

    this._drawShadow(ctx, W / 2, H - 1, DIR.SE);

    // Horse legs (far side)
    ctx.fillStyle = COLORS.horseDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLegAngled(ctx, 14, H - 17, leg.bl, -2);
    this._drawLegAngled(ctx, 26, H - 17, leg.fl, -2);

    // Horse body with breathing
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(
      W / 2 + 1,
      H - 23 + enh.breathT * 0.3,
      14,
      9 + enh.breathT * 0.4,
      0.2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();

    // Belly
    ctx.fillStyle = COLORS.horseBelly;
    ctx.beginPath();
    ctx.ellipse(
      W / 2 + 1,
      H - 20 + enh.breathT * 0.3,
      10,
      4 + enh.breathT * 0.3,
      0.2,
      0,
      Math.PI,
    );
    ctx.fill();

    // Horse legs (near side)
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLegAngled(ctx, 18, H - 17, leg.br, 2);
    this._drawLegAngled(ctx, 32, H - 17, leg.fr, 2);

    // Horse neck
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(30, H - 29);
    ctx.lineTo(35, H - 37);
    ctx.lineTo(39, H - 36);
    ctx.lineTo(35, H - 26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Horse head
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(38, H - 39, 6, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ear with rotation
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36, H - 43);
    ctx.lineTo(35 - enh.earT * 0.2, H - 47 + Math.abs(enh.earT) * 0.15);
    ctx.lineTo(39, H - 43);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Horse eye
    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.arc(40, H - 39, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(40.5, H - 38.5, 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Nostril
    ctx.fillStyle = COLORS.horseDark;
    ctx.beginPath();
    ctx.arc(42, H - 36, 1, 0, Math.PI * 2);
    ctx.fill();

    // Mane with flow
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(35, H - 38);
    ctx.quadraticCurveTo(
      31 + enh.maneT * 0.3,
      H - 35,
      29 + enh.maneT * 0.2,
      H - 29,
    );
    ctx.stroke();

    // Tail with sway
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, H - 26);
    ctx.quadraticCurveTo(
      2 + enh.tailT * 0.4,
      H - 20,
      4 + enh.tailT * 0.3,
      H - 14,
    );
    ctx.stroke();

    // Saddle
    ctx.fillStyle = "#8B0000";
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(18, H - 32);
    ctx.lineTo(17, H - 29);
    ctx.lineTo(30, H - 29);
    ctx.lineTo(29, H - 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wizard body
    const flutter = enh.castData ? enh.castData.robeFlutter : enh.robeFlutter;
    ctx.fillStyle = COLORS.robe;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(17, H - 32);
    ctx.lineTo(15, H - 43);
    ctx.lineTo(30, H - 43);
    ctx.lineTo(29, H - 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Robe side drape with flutter
    ctx.fillStyle = COLORS.robeDark;
    ctx.beginPath();
    ctx.moveTo(17, H - 32);
    ctx.quadraticCurveTo(
      14 + flutter * 0.3,
      H - 26,
      14 - flutter * 0.2,
      H - 24,
    );
    ctx.lineTo(19, H - 26);
    ctx.lineTo(19, H - 32);
    ctx.closePath();
    ctx.fill();

    // Belt
    ctx.fillStyle = COLORS.hatBand;
    ctx.fillRect(17, H - 35, 12, 2);

    // Wizard head
    const headTurn = this._walking ? 0 : this._idleHeadTurn * 0.2;
    ctx.fillStyle = COLORS.skin;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(23 + headTurn, H - 47, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eye (3/4 view)
    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.arc(25 + headTurn, H - 48, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(25.5 + headTurn, H - 47.5, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Far eye
    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.arc(20 + headTurn, H - 48, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(20.3 + headTurn, H - 47.5, 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Wizard hat
    ctx.fillStyle = COLORS.hat;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, H - 51);
    ctx.lineTo(24, H - 65);
    ctx.lineTo(31, H - 51);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hat band
    ctx.fillStyle = COLORS.hatBand;
    ctx.fillRect(15, H - 52, 16, 2);

    // Hat brim
    ctx.fillStyle = COLORS.hatDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(23, H - 51, 9, 2.5, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Staff
    const staffRaise = enh.castData ? enh.castData.staffRaise : 0;
    const staffTipY = H - 58 + staffRaise;
    this._drawStaff(ctx, 9, H - 30, 7, staffTipY, glow, enh.castData);

    // Sparkles
    this._drawSparkles(ctx, 7, staffTipY);

    // Wizard arm
    ctx.strokeStyle = COLORS.robe;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(17, H - 39);
    ctx.lineTo(9, H - 32);
    ctx.stroke();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(17, H - 39);
    ctx.lineTo(9, H - 32);
    ctx.stroke();
  }

  // ========================================================
  // DIAGONAL BACK VIEW (NE direction)
  // ========================================================
  _drawDiagonalBack(ctx, leg, glow, enh) {
    const W = this._width;
    const H = this._height;

    this._drawShadow(ctx, W / 2, H - 1, DIR.NE);

    // Horse legs (far side)
    ctx.fillStyle = COLORS.horseDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLegAngled(ctx, 26, H - 17, leg.fl, -2);
    this._drawLegAngled(ctx, 14, H - 17, leg.bl, -2);

    // Horse body with breathing
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(
      W / 2 + 1,
      H - 23 + enh.breathT * 0.3,
      14,
      9 + enh.breathT * 0.4,
      0.2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();

    // Belly
    ctx.fillStyle = COLORS.horseBelly;
    ctx.beginPath();
    ctx.ellipse(
      W / 2 + 1,
      H - 20 + enh.breathT * 0.3,
      10,
      4 + enh.breathT * 0.3,
      0.2,
      0,
      Math.PI,
    );
    ctx.fill();

    // Horse legs (near side)
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLegAngled(ctx, 32, H - 17, leg.fr, 2);
    this._drawLegAngled(ctx, 18, H - 17, leg.br, 2);

    // Tail with sway
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, H - 26);
    ctx.quadraticCurveTo(
      2 + enh.tailT * 0.4,
      H - 18,
      4 + enh.tailT * 0.3,
      H - 12,
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6, H - 26);
    ctx.quadraticCurveTo(
      0 + enh.tailT * 0.3,
      H - 20,
      3 + enh.tailT * 0.2,
      H - 14,
    );
    ctx.stroke();

    // Horse neck
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(30, H - 29);
    ctx.lineTo(35, H - 37);
    ctx.lineTo(39, H - 36);
    ctx.lineTo(35, H - 26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Horse head
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(38, H - 39, 6, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ears with rotation
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36, H - 43);
    ctx.lineTo(35 - enh.earT * 0.2, H - 47 + Math.abs(enh.earT) * 0.15);
    ctx.lineTo(39, H - 43);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(40, H - 43);
    ctx.lineTo(41 + enh.earT * 0.15, H - 47 + Math.abs(enh.earT) * 0.1);
    ctx.lineTo(42, H - 43);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Mane with flow
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(36, H - 38);
    ctx.quadraticCurveTo(
      32 + enh.maneT * 0.3,
      H - 35,
      30 + enh.maneT * 0.2,
      H - 29,
    );
    ctx.stroke();

    // Saddle
    ctx.fillStyle = "#8B0000";
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(18, H - 32);
    ctx.lineTo(17, H - 29);
    ctx.lineTo(30, H - 29);
    ctx.lineTo(29, H - 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wizard body
    const flutter = enh.castData ? enh.castData.robeFlutter : enh.robeFlutter;
    ctx.fillStyle = COLORS.robe;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(17, H - 32);
    ctx.lineTo(15, H - 43);
    ctx.lineTo(30, H - 43);
    ctx.lineTo(29, H - 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Robe back seam
    ctx.strokeStyle = COLORS.robeDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(23, H - 43);
    ctx.lineTo(23, H - 32);
    ctx.stroke();

    // Wizard head (back 3/4)
    ctx.fillStyle = COLORS.skin;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(23, H - 47, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hair
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(23, H - 47, 5, 0.3, Math.PI + 0.8);
    ctx.fill();

    // Cheek
    ctx.fillStyle = COLORS.skin;
    ctx.beginPath();
    ctx.arc(27, H - 47, 2, -0.5, 0.5);
    ctx.fill();

    // Wizard hat
    ctx.fillStyle = COLORS.hat;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, H - 51);
    ctx.lineTo(24, H - 65);
    ctx.lineTo(31, H - 51);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hat band
    ctx.fillStyle = COLORS.hatBand;
    ctx.fillRect(15, H - 52, 16, 2);

    // Hat brim
    ctx.fillStyle = COLORS.hatDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(23, H - 51, 9, 2.5, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Staff
    const staffRaise = enh.castData ? enh.castData.staffRaise : 0;
    const staffTipY = H - 58 + staffRaise;
    this._drawStaff(ctx, 9, H - 30, 7, staffTipY, glow, enh.castData);

    // Sparkles
    this._drawSparkles(ctx, 7, staffTipY);

    // Wizard arm
    ctx.strokeStyle = COLORS.robe;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(17, H - 39);
    ctx.lineTo(9, H - 32);
    ctx.stroke();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(17, H - 39);
    ctx.lineTo(9, H - 32);
    ctx.stroke();
  }

  // ========================================================
  // Helper: draw tail (side view) with sway and direction flow
  // ========================================================
  _drawTailSide(ctx, W, H, tailT, maneT, walking) {
    const flowOffset = walking ? maneT * 0.5 : 0;
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, H - 28);
    ctx.bezierCurveTo(
      0 + tailT * 0.4 - flowOffset,
      H - 22,
      -1 + tailT * 0.6 - flowOffset,
      H - 17,
      2 + tailT * 0.3 - flowOffset,
      H - 14,
    );
    ctx.stroke();

    // Second strand
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(4, H - 28);
    ctx.bezierCurveTo(
      1 + tailT * 0.3 - flowOffset,
      H - 23,
      -2 + tailT * 0.5 - flowOffset,
      H - 18,
      1 + tailT * 0.4 - flowOffset,
      H - 12,
    );
    ctx.stroke();
  }

  // ========================================================
  // Helper: draw mane (side view) with flow
  // ========================================================
  _drawManeSide(ctx, W, H, maneT, walking) {
    const flow = walking ? maneT : maneT * 0.3;
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(36, H - 39);
    ctx.bezierCurveTo(
      34 + flow * 0.3,
      H - 37,
      31 + flow * 0.4,
      H - 33,
      30 + flow * 0.3,
      H - 30,
    );
    ctx.stroke();

    // Second strand
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(37, H - 40);
    ctx.bezierCurveTo(
      35 + flow * 0.2,
      H - 38,
      33 + flow * 0.3,
      H - 35,
      32 + flow * 0.2,
      H - 32,
    );
    ctx.stroke();
  }

  // ========================================================
  // Helper: draw ear (side view) with rotation
  // ========================================================
  _drawEarSide(ctx, x1, y1, x2, y2, x3, y3, earT) {
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 + earT * 0.2, y2 + Math.abs(earT) * 0.15);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ========================================================
  // Helper: draw a single horse leg (side view) with knee joint
  // ========================================================
  _drawLeg(ctx, x, y, offset, isNear, breathOffset) {
    const color = isNear ? COLORS.horseLight : COLORS.horseDark;
    ctx.fillStyle = color;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;

    const bOff = breathOffset * 0.15;

    // Upper leg (thigh)
    const kneeX = x - 1 + offset * 0.35;
    const kneeY = y + 6 + bOff;

    ctx.beginPath();
    ctx.moveTo(x - 2, y + bOff);
    ctx.lineTo(kneeX - 1, kneeY);
    ctx.lineTo(kneeX + 2, kneeY);
    ctx.lineTo(x + 2, y + bOff);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Knee joint (small circle)
    ctx.beginPath();
    ctx.arc(kneeX + 0.5, kneeY, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Lower leg (shin)
    const ankleX = x + offset * 0.7;
    const ankleY = y + 12 + bOff;
    ctx.beginPath();
    ctx.moveTo(kneeX - 1, kneeY);
    ctx.lineTo(ankleX - 0.5, ankleY);
    ctx.lineTo(ankleX + 2, ankleY);
    ctx.lineTo(kneeX + 2, kneeY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hoof
    ctx.fillStyle = COLORS.hoof;
    ctx.fillRect(ankleX - 1, ankleY, 4, 2);
    ctx.strokeRect(ankleX - 1, ankleY, 4, 2);
  }

  // ========================================================
  // Helper: draw a horse leg (front/back view)
  // ========================================================
  _drawLegFront(ctx, x, y, offset) {
    ctx.beginPath();
    ctx.moveTo(x - 2, y);
    ctx.lineTo(x - 2, y + 10 + offset);
    ctx.lineTo(x + 2, y + 10 + offset);
    ctx.lineTo(x + 2, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hoof
    ctx.fillStyle = COLORS.hoof;
    ctx.fillRect(x - 2, y + 9 + offset, 5, 2);
    ctx.strokeStyle = COLORS.outline;
    ctx.strokeRect(x - 2, y + 9 + offset, 5, 2);
  }

  // ========================================================
  // Helper: draw a horse leg (angled/diagonal view)
  // ========================================================
  _drawLegAngled(ctx, x, y, offset, xShift) {
    ctx.beginPath();
    ctx.moveTo(x - 2, y);
    ctx.lineTo(x - 2 + xShift * 0.3, y + 10 + offset);
    ctx.lineTo(x + 2 + xShift * 0.3, y + 10 + offset);
    ctx.lineTo(x + 2, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hoof
    const hoofX = x - 2 + xShift * 0.3;
    ctx.fillStyle = COLORS.hoof;
    ctx.fillRect(hoofX, y + 9 + offset, 5, 2);
    ctx.strokeStyle = COLORS.outline;
    ctx.strokeRect(hoofX, y + 9 + offset, 5, 2);
  }

  // ========================================================
  // Helper: draw the wizard staff with enhanced glowing tip
  // ========================================================
  _drawStaff(ctx, bx, by, tx, ty, glowIntensity, castData) {
    // Staff shaft
    ctx.strokeStyle = COLORS.staffWood;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // Outline
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx - 1, by);
    ctx.lineTo(tx - 1, ty);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx + 1, by);
    ctx.lineTo(tx + 1, ty);
    ctx.stroke();

    // Enhanced glowing orb
    const glowMult = castData ? castData.glowMult : 1;
    const baseRadius = 3 + Math.min(glowIntensity, 1) * 1.5;
    const glowRadius = baseRadius * Math.min(glowMult, 4);

    // Color cycling for glow
    const colorPhase = (this._glowTimer / this._glowCycleMs) * Math.PI * 2;
    const r = Math.floor(
      Math.max(0, Math.min(255, 0 + Math.sin(colorPhase) * 30)),
    );
    const g = Math.floor(
      Math.max(0, Math.min(255, 200 + Math.sin(colorPhase * 1.3) * 55)),
    );
    const b = Math.floor(
      Math.max(0, Math.min(255, 255 + Math.sin(colorPhase * 0.7) * 20)),
    );

    // Outer glow
    ctx.fillStyle = `rgba(${r},${g},${b},0.08)`;
    ctx.beginPath();
    ctx.arc(tx, ty, glowRadius + 7, 0, Math.PI * 2);
    ctx.fill();

    // Mid-outer glow
    ctx.fillStyle = `rgba(${r},${g},${b},0.12)`;
    ctx.beginPath();
    ctx.arc(tx, ty, glowRadius + 4, 0, Math.PI * 2);
    ctx.fill();

    // Mid glow
    ctx.fillStyle = `rgba(${r},${g},${b},0.25)`;
    ctx.beginPath();
    ctx.arc(tx, ty, glowRadius + 2, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.arc(tx, ty, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Bright center
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(tx, ty, glowRadius * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Extra ring during casting
    if (castData && castData.glowMult > 2) {
      ctx.strokeStyle = `rgba(${r},${g},${b},0.4)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(tx, ty, glowRadius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ========================================================
  // Helper: draw filled ellipse
  // ========================================================
  _ellipse(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
