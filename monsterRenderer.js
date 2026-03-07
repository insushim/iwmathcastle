// monsterRenderer.js - Canvas 2D Monster Sprite Renderer
// Pixel-art style sprites using canvas primitives (fillRect, arc, lineTo)
// Self-contained, no external dependencies

// ---------------------------------------------------------------------------
// Color Palettes
// ---------------------------------------------------------------------------
const PAL = {
  outline: "#1A1A2E",
  shadow: "rgba(0,0,0,0.22)",

  // Ground melee
  goblinGreen: "#4CAF50",
  goblinDark: "#2E7D32",
  goblinLight: "#81C784",
  goblinSkin: "#A5D6A7",
  goblinEye: "#FFEB3B",

  speedBlue: "#00BCD4",
  speedDark: "#00838F",
  speedLight: "#4DD0E1",
  speedAccent: "#B2EBF2",

  tankBrown: "#795548",
  tankDark: "#4E342E",
  tankLight: "#A1887F",
  tankArmor: "#9E9E9E",
  tankArmorDark: "#616161",

  shielderOrange: "#FF9800",
  shielderDark: "#E65100",
  shielderLight: "#FFB74D",
  shieldGlow: "rgba(255,235,59,0.35)",

  generalRed: "#F44336",
  generalDark: "#B71C1C",
  generalLight: "#EF5350",
  generalArmor: "#C62828",
  generalGold: "#FFD700",

  // Flying
  batPurple: "#9C27B0",
  batDark: "#6A1B9A",
  batLight: "#CE93D8",
  batWing: "#7B1FA2",

  dragonRed: "#D32F2F",
  dragonDark: "#B71C1C",
  dragonGold: "#FFD700",
  dragonBelly: "#FFCC80",
  dragonWing: "#E53935",

  // Special
  healerWhite: "#E8F5E9",
  healerGreen: "#66BB6A",
  healerGlow: "rgba(102,187,106,0.3)",

  collectorGold: "#FFC107",
  collectorDark: "#FF8F00",
  collectorLight: "#FFE082",

  leechPurple: "#4A148C",
  leechRed: "#C62828",
  leechDark: "#311B92",

  teleporterCyan: "#00E5FF",
  teleporterDark: "#006064",
  teleporterGlitch: "#76FF03",

  splitterGreen: "#8BC34A",
  splitterDark: "#558B2F",
  splitterLight: "#C5E1A5",
  splitterBubble: "#CDDC39",

  plagueSickly: "#9E9D24",
  plagueDark: "#33691E",
  plagueGlow: "rgba(158,157,36,0.3)",
  plagueToxic: "#AEEA00",

  ghostBlue: "#B0BEC5",
  ghostDark: "#78909C",
  ghostLight: "#ECEFF1",

  assassinDark: "#263238",
  assassinRed: "#FF1744",
  assassinBlade: "#CFD8DC",

  disruptorMagenta: "#E040FB",
  disruptorDark: "#AA00FF",

  chronomancerBlue: "#1A237E",
  chronomancerGold: "#FFD54F",
  chronomancerGlow: "rgba(255,213,79,0.3)",

  golemStone: "#78909C",
  golemDark: "#455A64",
  golemLight: "#B0BEC5",
  golemCrack: "#37474F",

  mirageBlue: "#42A5F5",
  mirageFade: "rgba(66,165,245,0.4)",

  mimicGold: "#FFD700",
  mimicDark: "#5D4037",
  mimicTeeth: "#FAFAFA",

  summonerPurple: "#7E57C2",
  summonerDark: "#4527A0",
  summonerOrb: "#B388FF",

  // Boss
  bossRed: "#D50000",
  bossDark: "#8B0000",
  bossHorn: "#4A0000",
  bossGlow: "rgba(213,0,0,0.25)",

  archfiendPurple: "#4A148C",
  archfiendDark: "#1A0033",
  archfiendGlow: "rgba(74,20,140,0.3)",
  archfiendHorn: "#EA80FC",

  ancientGold: "#FFD700",
  ancientDark: "#BF8F00",
  ancientScale: "#FFF176",
  ancientGlow: "rgba(255,215,0,0.25)",

  voidDark: "#0D0D0D",
  voidPurple: "#6200EA",
  voidGlow: "rgba(98,0,234,0.35)",
  voidCosmic: "#B388FF",

  titanGray: "#607D8B",
  titanDark: "#37474F",
  titanLight: "#90A4AE",
  titanRust: "#8D6E63",
  titanGlow: "rgba(96,125,139,0.25)",

  finalBossBlack: "#1A1A1A",
  finalBossRed: "#FF1744",
  finalBossGold: "#FFD700",
  finalBossGlow: "rgba(255,23,68,0.3)",

  // Status effects
  poisonGreen: "#76FF03",
  frostBlue: "#80D8FF",
  stunYellow: "#FFFF00",
  shieldYellow: "rgba(255,235,59,0.25)",

  // HP bar
  hpGreen: "#4CAF50",
  hpYellow: "#FFEB3B",
  hpRed: "#F44336",
  hpBg: "rgba(0,0,0,0.5)",
  hpBorder: "#1A1A2E",

  // Skin tones
  skin: "#FFCCBC",
  skinDark: "#FFAB91",

  white: "#FFFFFF",
  eye: "#FFFFFF",
  pupil: "#1A1A2E",
};

// ---------------------------------------------------------------------------
// Helper: body bob per frame (4-frame walk cycle)
// ---------------------------------------------------------------------------
const BODY_BOB = [0, -1, 0, 1];
const LEG_PHASE = [
  { left: -2, right: 2 },
  { left: -1, right: 1 },
  { left: 2, right: -2 },
  { left: 1, right: -1 },
];
const WING_ANGLE = [15, 5, -10, 5]; // degrees offset for wing flap

// ---------------------------------------------------------------------------
// MonsterRenderer
// ---------------------------------------------------------------------------
export class MonsterRenderer {
  constructor() {
    // Cache nothing for now; pure draw calls
  }

  /**
   * Draw a monster on the canvas context.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} monsterKey - e.g. 'normal', 'speed', 'boss'
   * @param {number} x - center X
   * @param {number} y - center Y
   * @param {number} size - base size (default ~32)
   * @param {number} hp - current HP
   * @param {number} maxHp - max HP
   * @param {number} direction - movement direction in radians
   * @param {number} frame - animation frame 0-3
   * @param {object} options - { isFlying, isBoss, isShielded, isPoisoned, isSlowed, isStunned }
   */
  render(
    ctx,
    monsterKey,
    x,
    y,
    size,
    hp,
    maxHp,
    direction,
    frame,
    options = {},
  ) {
    ctx.save();

    const s = size || 32;
    const f = frame % 4;
    const facingLeft = direction != null ? Math.cos(direction) < -0.1 : false;
    const bob = BODY_BOB[f];
    const isBoss = options.isBoss || false;
    const scale = isBoss ? 1.6 : 1.0;
    const drawSize = s * scale;

    // Translate to center, apply horizontal flip if facing left
    ctx.translate(x, y);
    if (facingLeft) {
      ctx.scale(-1, 1);
    }

    // --- Shadow ---
    this._drawShadow(ctx, drawSize, options.isFlying);

    // Vertical offset for flying monsters (hover effect)
    const flyOffset = options.isFlying
      ? -6 - Math.sin((f * Math.PI) / 2) * 3
      : 0;
    ctx.translate(0, bob + flyOffset);

    // --- Boss glow ---
    if (isBoss) {
      this._drawBossGlow(ctx, drawSize, monsterKey);
    }

    // --- Draw monster body based on key ---
    const half = drawSize / 2;
    ctx.translate(-half, -half); // top-left origin for drawing

    switch (monsterKey) {
      case "normal":
        this._drawNormal(ctx, drawSize, f);
        break;
      case "speed":
        this._drawSpeed(ctx, drawSize, f);
        break;
      case "tank":
        this._drawTank(ctx, drawSize, f);
        break;
      case "shielder":
        this._drawShielder(ctx, drawSize, f);
        break;
      case "general":
        this._drawGeneral(ctx, drawSize, f);
        break;
      case "bat":
        this._drawBat(ctx, drawSize, f);
        break;
      case "dragon":
        this._drawDragon(ctx, drawSize, f);
        break;
      case "healer":
        this._drawHealer(ctx, drawSize, f);
        break;
      case "collector":
        this._drawCollector(ctx, drawSize, f);
        break;
      case "leech":
        this._drawLeech(ctx, drawSize, f);
        break;
      case "teleporter":
        this._drawTeleporter(ctx, drawSize, f);
        break;
      case "splitter":
        this._drawSplitter(ctx, drawSize, f);
        break;
      case "mini-splitter":
        this._drawSplitter(ctx, drawSize, f);
        break;
      case "plaguebearer":
        this._drawPlaguebearer(ctx, drawSize, f);
        break;
      case "ghost":
        this._drawGhost(ctx, drawSize, f);
        break;
      case "assassin":
        this._drawAssassin(ctx, drawSize, f);
        break;
      case "disruptor":
        this._drawDisruptor(ctx, drawSize, f);
        break;
      case "chronomancer":
        this._drawChronomancer(ctx, drawSize, f);
        break;
      case "golem":
        this._drawGolem(ctx, drawSize, f);
        break;
      case "mirage":
        this._drawMirage(ctx, drawSize, f);
        break;
      case "mimic":
        this._drawMimic(ctx, drawSize, f);
        break;
      case "summoner":
        this._drawSummoner(ctx, drawSize, f);
        break;
      case "boss":
        this._drawBoss(ctx, drawSize, f);
        break;
      case "archfiend":
        this._drawArchfiend(ctx, drawSize, f);
        break;
      case "ancientDragon":
        this._drawAncientDragon(ctx, drawSize, f);
        break;
      case "voidLord":
        this._drawVoidLord(ctx, drawSize, f);
        break;
      case "titanGolem":
        this._drawTitanGolem(ctx, drawSize, f);
        break;
      case "finalBoss":
        this._drawFinalBoss(ctx, drawSize, f);
        break;
      default:
        this._drawNormal(ctx, drawSize, f);
        break;
    }

    ctx.translate(half, half); // back to center

    // --- Status effects ---
    if (options.isShielded) this._drawShieldEffect(ctx, drawSize);
    if (options.isPoisoned) this._drawPoisonEffect(ctx, drawSize, f);
    if (options.isSlowed) this._drawFrostEffect(ctx, drawSize, f);
    if (options.isStunned) this._drawStunEffect(ctx, drawSize, f);

    ctx.restore();

    // --- Health bar (drawn without flip) ---
    if (hp != null && maxHp != null && hp < maxHp) {
      this._drawHealthBar(
        ctx,
        x,
        y - drawSize / 2 + bob + flyOffset - 6,
        drawSize,
        hp,
        maxHp,
      );
    }
  }

  // =========================================================================
  // SHADOWS & EFFECTS
  // =========================================================================

  _drawShadow(ctx, size, isFlying) {
    ctx.fillStyle = PAL.shadow;
    const ry = isFlying ? size * 0.12 : size * 0.15;
    const rx = size * 0.35;
    ctx.beginPath();
    ctx.ellipse(0, size * 0.42, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawBossGlow(ctx, size, key) {
    let color;
    switch (key) {
      case "boss":
        color = PAL.bossGlow;
        break;
      case "archfiend":
        color = PAL.archfiendGlow;
        break;
      case "ancientDragon":
        color = PAL.ancientGlow;
        break;
      case "voidLord":
        color = PAL.voidGlow;
        break;
      case "titanGolem":
        color = PAL.titanGlow;
        break;
      case "finalBoss":
        color = PAL.finalBossGlow;
        break;
      default:
        color = PAL.bossGlow;
        break;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawShieldEffect(ctx, size) {
    ctx.strokeStyle = "rgba(255,235,59,0.5)";
    ctx.fillStyle = PAL.shieldYellow;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  _drawPoisonEffect(ctx, size, frame) {
    // Green tint overlay
    ctx.fillStyle = "rgba(118,255,3,0.12)";
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
    ctx.fill();
    // Small bubbles
    const bubbleCount = 3;
    ctx.fillStyle = PAL.poisonGreen;
    for (let i = 0; i < bubbleCount; i++) {
      const angle = (i / bubbleCount) * Math.PI * 2 + frame * 0.5;
      const dist = size * 0.3;
      const bx = Math.cos(angle) * dist;
      const by = Math.sin(angle) * dist - size * 0.1;
      const r = 1.5 + (i % 2);
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawFrostEffect(ctx, size, frame) {
    const particleCount = 4;
    ctx.fillStyle = PAL.frostBlue;
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + frame * 0.7;
      const dist = size * 0.35;
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Frost tint
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = PAL.frostBlue;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  _drawStunEffect(ctx, size, frame) {
    // Spinning stars above head
    const starCount = 3;
    ctx.fillStyle = PAL.stunYellow;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < starCount; i++) {
      const angle = (i / starCount) * Math.PI * 2 + frame * 1.2;
      const dist = size * 0.25;
      const sx = Math.cos(angle) * dist;
      const sy = -size * 0.5 + Math.sin(angle) * 3;
      this._drawStar(ctx, sx, sy, 3, 5);
    }
  }

  _drawStar(ctx, cx, cy, r, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const dist = i % 2 === 0 ? r : r * 0.4;
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // =========================================================================
  // HEALTH BAR
  // =========================================================================

  _drawHealthBar(ctx, x, y, size, hp, maxHp) {
    const barW = size * 0.8;
    const barH = 3;
    const bx = x - barW / 2;
    const by = y;
    const ratio = Math.max(0, Math.min(1, hp / maxHp));

    // Background
    ctx.fillStyle = PAL.hpBg;
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);

    // Fill color based on ratio
    let color;
    if (ratio > 0.6) color = PAL.hpGreen;
    else if (ratio > 0.3) color = PAL.hpYellow;
    else color = PAL.hpRed;

    ctx.fillStyle = color;
    ctx.fillRect(bx, by, barW * ratio, barH);

    // Border
    ctx.strokeStyle = PAL.hpBorder;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(bx - 1, by - 1, barW + 2, barH + 2);
  }

  // =========================================================================
  // COMMON DRAWING HELPERS
  // =========================================================================

  // Outlined rectangle
  _oRect(ctx, x, y, w, h, fill, outlineColor) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    if (outlineColor !== false) {
      ctx.strokeStyle = outlineColor || PAL.outline;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    }
  }

  // Outlined circle
  _oCircle(ctx, cx, cy, r, fill, outlineColor) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    if (outlineColor !== false) {
      ctx.strokeStyle = outlineColor || PAL.outline;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Outlined ellipse
  _oEllipse(ctx, cx, cy, rx, ry, fill, outlineColor) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    if (outlineColor !== false) {
      ctx.strokeStyle = outlineColor || PAL.outline;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Simple eyes on a head
  _drawEyes(ctx, cx, cy, size, eyeColor, pupilColor) {
    const gap = size * 0.12;
    const er = size * 0.06;
    // Left eye
    this._oCircle(ctx, cx - gap, cy, er, eyeColor || PAL.eye, false);
    this._oCircle(ctx, cx - gap, cy, er * 0.5, pupilColor || PAL.pupil, false);
    // Right eye
    this._oCircle(ctx, cx + gap, cy, er, eyeColor || PAL.eye, false);
    this._oCircle(ctx, cx + gap, cy, er * 0.5, pupilColor || PAL.pupil, false);
  }

  // Angry eyes (slanted)
  _drawAngryEyes(ctx, cx, cy, size, eyeColor, pupilColor) {
    const gap = size * 0.12;
    const er = size * 0.07;
    // Left eye
    this._oCircle(ctx, cx - gap, cy, er, eyeColor || PAL.eye, false);
    this._oCircle(
      ctx,
      cx - gap,
      cy + 0.5,
      er * 0.55,
      pupilColor || PAL.pupil,
      false,
    );
    // Right eye
    this._oCircle(ctx, cx + gap, cy, er, eyeColor || PAL.eye, false);
    this._oCircle(
      ctx,
      cx + gap,
      cy + 0.5,
      er * 0.55,
      pupilColor || PAL.pupil,
      false,
    );
    // Angry brows
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - gap - er, cy - er * 1.2);
    ctx.lineTo(cx - gap + er * 0.5, cy - er * 1.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + gap + er, cy - er * 1.2);
    ctx.lineTo(cx + gap - er * 0.5, cy - er * 1.8);
    ctx.stroke();
  }

  // Draw two legs with walk animation
  _drawLegs(ctx, cx, bottomY, size, frame, color, darkColor) {
    const legW = size * 0.14;
    const legH = size * 0.22;
    const gap = size * 0.1;
    const phase = LEG_PHASE[frame];

    // Left leg
    this._oRect(
      ctx,
      cx - gap - legW / 2,
      bottomY - legH + phase.left,
      legW,
      legH,
      color,
    );
    // Foot
    this._oRect(
      ctx,
      cx - gap - legW / 2 - 1,
      bottomY - 2 + phase.left,
      legW + 2,
      2,
      darkColor,
    );

    // Right leg
    this._oRect(
      ctx,
      cx + gap - legW / 2,
      bottomY - legH + phase.right,
      legW,
      legH,
      color,
    );
    // Foot
    this._oRect(
      ctx,
      cx + gap - legW / 2 - 1,
      bottomY - 2 + phase.right,
      legW + 2,
      2,
      darkColor,
    );
  }

  // Simple arms
  _drawArms(ctx, cx, armY, size, frame, color) {
    const armW = size * 0.1;
    const armH = size * 0.2;
    const halfBody = size * 0.2;
    const swing = LEG_PHASE[frame];

    // Left arm
    this._oRect(
      ctx,
      cx - halfBody - armW,
      armY + swing.right,
      armW,
      armH,
      color,
    );
    // Right arm
    this._oRect(ctx, cx + halfBody, armY + swing.left, armW, armH, color);
  }

  // Horns
  _drawHorns(ctx, cx, headTop, size, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    const hw = size * 0.08;
    const hh = size * 0.15;
    // Left horn
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.12, headTop + 2);
    ctx.lineTo(cx - size * 0.18, headTop - hh);
    ctx.lineTo(cx - size * 0.06, headTop + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Right horn
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.12, headTop + 2);
    ctx.lineTo(cx + size * 0.18, headTop - hh);
    ctx.lineTo(cx + size * 0.06, headTop + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Wings (for flying creatures)
  _drawWings(ctx, cx, wingY, size, frame, color, darkColor) {
    const wingW = size * 0.35;
    const wingH = size * 0.2;
    const flapAngle = (WING_ANGLE[frame] * Math.PI) / 180;

    ctx.fillStyle = color;
    ctx.strokeStyle = darkColor || PAL.outline;
    ctx.lineWidth = 1;

    // Left wing
    ctx.save();
    ctx.translate(cx - size * 0.15, wingY);
    ctx.rotate(-0.3 + flapAngle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-wingW, -wingH * 0.5);
    ctx.quadraticCurveTo(-wingW * 0.8, wingH * 0.3, 0, wingH * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Right wing
    ctx.save();
    ctx.translate(cx + size * 0.15, wingY);
    ctx.rotate(0.3 - flapAngle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(wingW, -wingH * 0.5);
    ctx.quadraticCurveTo(wingW * 0.8, wingH * 0.3, 0, wingH * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Dragon-style large wings
  _drawDragonWings(ctx, cx, wingY, size, frame, color, membraneColor) {
    const wingW = size * 0.5;
    const wingH = size * 0.35;
    const flapAngle = (WING_ANGLE[frame] * Math.PI) / 180;

    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1.5;

    // Left wing
    ctx.save();
    ctx.translate(cx - size * 0.18, wingY);
    ctx.rotate(-0.2 + flapAngle);
    // Membrane
    ctx.fillStyle = membraneColor || color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-wingW * 0.4, -wingH);
    ctx.lineTo(-wingW, -wingH * 0.6);
    ctx.lineTo(-wingW * 0.9, -wingH * 0.1);
    ctx.lineTo(-wingW * 0.5, wingH * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Wing bones
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-wingW * 0.4, -wingH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-wingW * 0.9, -wingH * 0.1);
    ctx.stroke();
    ctx.restore();

    // Right wing
    ctx.save();
    ctx.translate(cx + size * 0.18, wingY);
    ctx.rotate(0.2 - flapAngle);
    ctx.fillStyle = membraneColor || color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(wingW * 0.4, -wingH);
    ctx.lineTo(wingW, -wingH * 0.6);
    ctx.lineTo(wingW * 0.9, -wingH * 0.1);
    ctx.lineTo(wingW * 0.5, wingH * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(wingW * 0.4, -wingH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(wingW * 0.9, -wingH * 0.1);
    ctx.stroke();
    ctx.restore();
  }

  // =========================================================================
  // GROUND MELEE MONSTERS
  // =========================================================================

  // --- Normal Goblin ---
  _drawNormal(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Legs
    this._drawLegs(ctx, cx, bottom, s, f, PAL.goblinGreen, PAL.goblinDark);

    // Body (rounded rectangle-ish)
    const bodyW = s * 0.4;
    const bodyH = s * 0.3;
    const bodyY = s * 0.38;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.goblinGreen);
    // Belly
    this._oRect(
      ctx,
      cx - bodyW / 2 + 2,
      bodyY + bodyH * 0.4,
      bodyW - 4,
      bodyH * 0.4,
      PAL.goblinLight,
      false,
    );

    // Arms
    this._drawArms(ctx, cx, bodyY + bodyH * 0.1, s, f, PAL.goblinGreen);

    // Head
    const headR = s * 0.16;
    const headY = bodyY - headR * 0.3;
    this._oCircle(ctx, cx, headY, headR, PAL.goblinGreen);

    // Ears (pointed)
    ctx.fillStyle = PAL.goblinGreen;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    // Left ear
    ctx.beginPath();
    ctx.moveTo(cx - headR, headY - 1);
    ctx.lineTo(cx - headR - s * 0.08, headY - s * 0.08);
    ctx.lineTo(cx - headR + 2, headY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Right ear
    ctx.beginPath();
    ctx.moveTo(cx + headR, headY - 1);
    ctx.lineTo(cx + headR + s * 0.08, headY - s * 0.08);
    ctx.lineTo(cx + headR - 2, headY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Eyes
    this._drawEyes(ctx, cx, headY - 1, s, PAL.goblinEye);

    // Mouth (grin)
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, headY + headR * 0.35, headR * 0.35, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }

  // --- Speed Runner ---
  _drawSpeed(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Speed lines behind
    ctx.strokeStyle = PAL.speedAccent;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 3; i++) {
      const ly = s * 0.35 + i * s * 0.1;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.35, ly);
      ctx.lineTo(cx - s * 0.2 - (f % 2) * 2, ly);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // Legs (longer stride)
    const legW = s * 0.11;
    const legH = s * 0.26;
    const gap = s * 0.06;
    const phase = LEG_PHASE[f];
    this._oRect(
      ctx,
      cx - gap - legW / 2,
      bottom - legH + phase.left * 1.3,
      legW,
      legH,
      PAL.speedBlue,
    );
    this._oRect(
      ctx,
      cx + gap - legW / 2,
      bottom - legH + phase.right * 1.3,
      legW,
      legH,
      PAL.speedBlue,
    );

    // Body (thinner)
    const bodyW = s * 0.3;
    const bodyH = s * 0.28;
    const bodyY = s * 0.36;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.speedBlue);
    // Chest stripe
    this._oRect(
      ctx,
      cx - bodyW / 2 + 2,
      bodyY + 2,
      bodyW - 4,
      3,
      PAL.speedLight,
      false,
    );

    // Arms (thin)
    const armW = s * 0.08;
    const armH = s * 0.18;
    this._oRect(
      ctx,
      cx - bodyW / 2 - armW,
      bodyY + phase.right,
      armW,
      armH,
      PAL.speedBlue,
    );
    this._oRect(
      ctx,
      cx + bodyW / 2,
      bodyY + phase.left,
      armW,
      armH,
      PAL.speedBlue,
    );

    // Head (streamlined)
    const headRx = s * 0.13;
    const headRy = s * 0.11;
    const headY = bodyY - headRy * 0.4;
    this._oEllipse(ctx, cx, headY, headRx, headRy, PAL.speedBlue);

    // Eyes
    this._drawEyes(ctx, cx, headY - 1, s, PAL.white, PAL.speedDark);

    // Wind swept hair/crest
    ctx.fillStyle = PAL.speedLight;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, headY - headRy);
    ctx.lineTo(cx - s * 0.12, headY - headRy - s * 0.06);
    ctx.lineTo(cx + s * 0.05, headY - headRy + 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // --- Tank ---
  _drawTank(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.94;

    // Legs (thick, armored)
    const legW = s * 0.16;
    const legH = s * 0.22;
    const gap = s * 0.12;
    const phase = LEG_PHASE[f];
    this._oRect(
      ctx,
      cx - gap - legW / 2,
      bottom - legH + phase.left * 0.5,
      legW,
      legH,
      PAL.tankBrown,
    );
    this._oRect(
      ctx,
      cx - gap - legW / 2,
      bottom - 3 + phase.left * 0.5,
      legW,
      3,
      PAL.tankArmorDark,
      false,
    );
    this._oRect(
      ctx,
      cx + gap - legW / 2,
      bottom - legH + phase.right * 0.5,
      legW,
      legH,
      PAL.tankBrown,
    );
    this._oRect(
      ctx,
      cx + gap - legW / 2,
      bottom - 3 + phase.right * 0.5,
      legW,
      3,
      PAL.tankArmorDark,
      false,
    );

    // Body (large, armored)
    const bodyW = s * 0.55;
    const bodyH = s * 0.35;
    const bodyY = s * 0.3;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.tankBrown);

    // Armor plates
    this._oRect(
      ctx,
      cx - bodyW / 2 + 2,
      bodyY + 2,
      bodyW - 4,
      bodyH * 0.3,
      PAL.tankArmor,
    );
    this._oRect(
      ctx,
      cx - bodyW / 2 + 2,
      bodyY + bodyH * 0.5,
      bodyW - 4,
      bodyH * 0.3,
      PAL.tankArmor,
    );

    // Belt
    this._oRect(
      ctx,
      cx - bodyW / 2,
      bodyY + bodyH - 3,
      bodyW,
      3,
      PAL.tankArmorDark,
    );

    // Arms (big)
    const armW = s * 0.13;
    const armH = s * 0.22;
    this._oRect(
      ctx,
      cx - bodyW / 2 - armW + 1,
      bodyY + 2 + phase.right * 0.3,
      armW,
      armH,
      PAL.tankBrown,
    );
    this._oRect(
      ctx,
      cx + bodyW / 2 - 1,
      bodyY + 2 + phase.left * 0.3,
      armW,
      armH,
      PAL.tankBrown,
    );

    // Head (small relative to body, helmeted)
    const headR = s * 0.13;
    const headY = bodyY - headR * 0.4;
    this._oCircle(ctx, cx, headY, headR, PAL.tankArmor);
    // Helmet visor
    this._oRect(
      ctx,
      cx - headR * 0.8,
      headY - headR * 0.15,
      headR * 1.6,
      headR * 0.6,
      PAL.tankArmorDark,
    );
    // Eyes through visor
    ctx.fillStyle = PAL.white;
    ctx.fillRect(cx - s * 0.08, headY - 1, 3, 2);
    ctx.fillRect(cx + s * 0.04, headY - 1, 3, 2);
  }

  // --- Shielder ---
  _drawShielder(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Legs
    this._drawLegs(ctx, cx, bottom, s, f, PAL.shielderOrange, PAL.shielderDark);

    // Body
    const bodyW = s * 0.4;
    const bodyH = s * 0.32;
    const bodyY = s * 0.35;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.shielderOrange);

    // Shield (prominent, on the left side)
    const shieldX = cx - bodyW / 2 - s * 0.12;
    const shieldY = bodyY + bodyH * 0.1;
    const shieldW = s * 0.16;
    const shieldH = s * 0.28;
    this._oRect(ctx, shieldX, shieldY, shieldW, shieldH, PAL.generalGold);
    // Shield boss
    this._oCircle(
      ctx,
      shieldX + shieldW / 2,
      shieldY + shieldH / 2,
      s * 0.04,
      PAL.shielderDark,
    );
    // Shield glow
    ctx.fillStyle = PAL.shieldGlow;
    ctx.beginPath();
    ctx.arc(
      shieldX + shieldW / 2,
      shieldY + shieldH / 2,
      s * 0.18,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Right arm
    const armW = s * 0.1;
    const armH = s * 0.2;
    this._oRect(ctx, cx + bodyW / 2, bodyY + 2, armW, armH, PAL.shielderOrange);

    // Head
    const headR = s * 0.14;
    const headY = bodyY - headR * 0.3;
    this._oCircle(ctx, cx, headY, headR, PAL.shielderLight);

    // Eyes
    this._drawEyes(ctx, cx, headY - 1, s);

    // Helmet top
    ctx.fillStyle = PAL.shielderOrange;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, headY, headR, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }

  // --- General (Commander) ---
  _drawGeneral(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Cape (behind body)
    ctx.fillStyle = PAL.generalDark;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.18, s * 0.32);
    ctx.lineTo(cx - s * 0.22, bottom - 2 + LEG_PHASE[f].left);
    ctx.lineTo(cx + s * 0.22, bottom - 2 + LEG_PHASE[f].right);
    ctx.lineTo(cx + s * 0.18, s * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Legs
    this._drawLegs(ctx, cx, bottom, s, f, PAL.generalRed, PAL.generalDark);

    // Body (armored)
    const bodyW = s * 0.44;
    const bodyH = s * 0.32;
    const bodyY = s * 0.34;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.generalRed);
    // Armor detail
    this._oRect(
      ctx,
      cx - bodyW / 2 + 2,
      bodyY + 3,
      bodyW - 4,
      3,
      PAL.generalGold,
      false,
    );
    this._oRect(
      ctx,
      cx - bodyW / 2 + 2,
      bodyY + bodyH - 5,
      bodyW - 4,
      3,
      PAL.generalGold,
      false,
    );
    // Center emblem
    this._oCircle(ctx, cx, bodyY + bodyH / 2, s * 0.04, PAL.generalGold, false);

    // Arms
    this._drawArms(ctx, cx, bodyY + bodyH * 0.1, s, f, PAL.generalRed);

    // Sword (right hand)
    const swordX = cx + bodyW / 2 + s * 0.08;
    const swordY = bodyY + s * 0.05;
    ctx.fillStyle = PAL.tankArmor;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    ctx.fillRect(swordX - 1, swordY, 2, s * 0.22);
    ctx.strokeRect(swordX - 1, swordY, 2, s * 0.22);
    // Crossguard
    ctx.fillStyle = PAL.generalGold;
    ctx.fillRect(swordX - 3, swordY + s * 0.18, 6, 2);

    // Head
    const headR = s * 0.14;
    const headY = bodyY - headR * 0.3;
    this._oCircle(ctx, cx, headY, headR, PAL.skin);

    // Crown/helmet
    ctx.fillStyle = PAL.generalGold;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.9, headY - headR * 0.5);
    ctx.lineTo(cx - headR * 0.7, headY - headR * 1.2);
    ctx.lineTo(cx - headR * 0.3, headY - headR * 0.7);
    ctx.lineTo(cx, headY - headR * 1.3);
    ctx.lineTo(cx + headR * 0.3, headY - headR * 0.7);
    ctx.lineTo(cx + headR * 0.7, headY - headR * 1.2);
    ctx.lineTo(cx + headR * 0.9, headY - headR * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Eyes
    this._drawAngryEyes(ctx, cx, headY, s, PAL.white, PAL.generalDark);
  }

  // =========================================================================
  // FLYING MONSTERS
  // =========================================================================

  // --- Bat ---
  _drawBat(ctx, s, f) {
    const cx = s / 2;

    // Wings
    this._drawWings(ctx, cx, s * 0.4, s, f, PAL.batWing, PAL.batDark);

    // Body (small oval)
    const bodyRx = s * 0.12;
    const bodyRy = s * 0.16;
    this._oEllipse(ctx, cx, s * 0.45, bodyRx, bodyRy, PAL.batPurple);

    // Head
    const headR = s * 0.1;
    const headY = s * 0.28;
    this._oCircle(ctx, cx, headY, headR, PAL.batPurple);

    // Ears
    ctx.fillStyle = PAL.batDark;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.6, headY - headR * 0.6);
    ctx.lineTo(cx - headR * 0.9, headY - headR * 1.6);
    ctx.lineTo(cx - headR * 0.1, headY - headR * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + headR * 0.6, headY - headR * 0.6);
    ctx.lineTo(cx + headR * 0.9, headY - headR * 1.6);
    ctx.lineTo(cx + headR * 0.1, headY - headR * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Eyes (red, glowing)
    const eyeR = s * 0.04;
    this._oCircle(ctx, cx - s * 0.05, headY, eyeR, "#FF1744", false);
    this._oCircle(ctx, cx + s * 0.05, headY, eyeR, "#FF1744", false);

    // Fangs
    ctx.fillStyle = PAL.white;
    ctx.beginPath();
    ctx.moveTo(cx - 2, headY + headR * 0.5);
    ctx.lineTo(cx - 1, headY + headR * 1.1);
    ctx.lineTo(cx, headY + headR * 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 1, headY + headR * 0.5);
    ctx.lineTo(cx + 2, headY + headR * 1.1);
    ctx.lineTo(cx + 3, headY + headR * 0.5);
    ctx.fill();

    // Small feet
    ctx.fillStyle = PAL.batDark;
    ctx.fillRect(cx - 3, s * 0.62, 2, 3);
    ctx.fillRect(cx + 1, s * 0.62, 2, 3);
  }

  // --- Dragon ---
  _drawDragon(ctx, s, f) {
    const cx = s / 2;

    // Wings
    this._drawDragonWings(
      ctx,
      cx,
      s * 0.35,
      s,
      f,
      PAL.dragonRed,
      PAL.dragonBelly,
    );

    // Tail
    ctx.strokeStyle = PAL.dragonDark;
    ctx.lineWidth = s * 0.06;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, s * 0.6);
    ctx.quadraticCurveTo(cx + s * 0.2, s * 0.7, cx + s * 0.3, s * 0.55);
    ctx.stroke();
    // Tail tip
    ctx.fillStyle = PAL.dragonRed;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.28, s * 0.5);
    ctx.lineTo(cx + s * 0.35, s * 0.55);
    ctx.lineTo(cx + s * 0.28, s * 0.6);
    ctx.closePath();
    ctx.fill();

    // Body
    const bodyRx = s * 0.18;
    const bodyRy = s * 0.14;
    this._oEllipse(ctx, cx, s * 0.48, bodyRx, bodyRy, PAL.dragonRed);
    // Belly
    this._oEllipse(
      ctx,
      cx,
      s * 0.52,
      bodyRx * 0.7,
      bodyRy * 0.6,
      PAL.dragonBelly,
      false,
    );

    // Neck
    this._oRect(
      ctx,
      cx - s * 0.06,
      s * 0.28,
      s * 0.12,
      s * 0.1,
      PAL.dragonRed,
      false,
    );

    // Head
    const headRx = s * 0.12;
    const headRy = s * 0.1;
    const headY = s * 0.25;
    this._oEllipse(ctx, cx, headY, headRx, headRy, PAL.dragonRed);

    // Horns
    this._drawHorns(ctx, cx, headY - headRy, s * 0.7, PAL.dragonGold);

    // Eyes
    const eyeR = s * 0.04;
    this._oCircle(ctx, cx - s * 0.06, headY - 1, eyeR, PAL.dragonGold, false);
    this._oCircle(ctx, cx - s * 0.06, headY - 1, eyeR * 0.4, PAL.pupil, false);
    this._oCircle(ctx, cx + s * 0.06, headY - 1, eyeR, PAL.dragonGold, false);
    this._oCircle(ctx, cx + s * 0.06, headY - 1, eyeR * 0.4, PAL.pupil, false);

    // Snout
    ctx.fillStyle = PAL.dragonDark;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      headY + headRy * 0.5,
      headRx * 0.4,
      headRy * 0.3,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    // Nostrils
    ctx.fillStyle = "#FF6F00";
    ctx.fillRect(cx - 2, headY + headRy * 0.3, 1.5, 1.5);
    ctx.fillRect(cx + 1, headY + headRy * 0.3, 1.5, 1.5);

    // Claws
    ctx.fillStyle = PAL.dragonDark;
    ctx.fillRect(cx - s * 0.1, s * 0.6, 3, 4);
    ctx.fillRect(cx + s * 0.07, s * 0.6, 3, 4);
  }

  // =========================================================================
  // SPECIAL MONSTERS
  // =========================================================================

  // --- Healer ---
  _drawHealer(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Healing aura (pulsing)
    const auraR = s * 0.4 + (f % 2) * 2;
    ctx.fillStyle = PAL.healerGlow;
    ctx.beginPath();
    ctx.arc(cx, s * 0.5, auraR, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    this._drawLegs(ctx, cx, bottom, s, f, PAL.healerWhite, PAL.healerGreen);

    // Robe body
    const bodyW = s * 0.38;
    const bodyH = s * 0.34;
    const bodyY = s * 0.34;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.healerWhite);
    // Cross on robe
    ctx.fillStyle = PAL.healerGreen;
    ctx.fillRect(cx - 1, bodyY + 4, 3, bodyH * 0.5);
    ctx.fillRect(cx - 4, bodyY + bodyH * 0.25, 9, 3);

    // Arms
    this._drawArms(ctx, cx, bodyY + bodyH * 0.1, s, f, PAL.healerWhite);

    // Staff (left hand)
    const staffX = cx - bodyW / 2 - s * 0.1;
    ctx.fillStyle = "#8D6E63";
    ctx.fillRect(staffX, bodyY - s * 0.08, 2, s * 0.4);
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(staffX, bodyY - s * 0.08, 2, s * 0.4);
    // Staff orb
    this._oCircle(
      ctx,
      staffX + 1,
      bodyY - s * 0.1,
      s * 0.04,
      PAL.healerGreen,
      false,
    );
    // Staff glow
    ctx.fillStyle = "rgba(102,187,106,0.4)";
    ctx.beginPath();
    ctx.arc(staffX + 1, bodyY - s * 0.1, s * 0.07, 0, Math.PI * 2);
    ctx.fill();

    // Head
    const headR = s * 0.13;
    const headY = bodyY - headR * 0.4;
    this._oCircle(ctx, cx, headY, headR, PAL.skin);

    // Hood
    ctx.fillStyle = PAL.healerWhite;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, headY - 1, headR * 1.1, Math.PI + 0.3, -0.3);
    ctx.fill();
    ctx.stroke();

    // Eyes
    this._drawEyes(ctx, cx, headY, s);

    // Particles (healing sparkles)
    ctx.fillStyle = PAL.healerGreen;
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + f * 0.8;
      const dist = s * 0.32;
      const px = cx + Math.cos(angle) * dist;
      const py = s * 0.45 + Math.sin(angle) * dist * 0.5;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
    ctx.globalAlpha = 1.0;
  }

  // --- Collector ---
  _drawCollector(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Legs (quick)
    this._drawLegs(ctx, cx, bottom, s, f, PAL.collectorDark, "#5D4037");

    // Body
    const bodyW = s * 0.36;
    const bodyH = s * 0.3;
    const bodyY = s * 0.38;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.collectorDark);

    // Bag on back
    this._oRect(
      ctx,
      cx + bodyW / 2 - 2,
      bodyY + 2,
      s * 0.14,
      bodyH * 0.7,
      "#8D6E63",
    );
    // Gold coins peeking from bag
    this._oCircle(
      ctx,
      cx + bodyW / 2 + s * 0.04,
      bodyY + 4,
      2,
      PAL.collectorGold,
      false,
    );
    this._oCircle(
      ctx,
      cx + bodyW / 2 + s * 0.08,
      bodyY + 6,
      2,
      PAL.collectorGold,
      false,
    );

    // Arms
    this._drawArms(ctx, cx, bodyY + bodyH * 0.1, s, f, PAL.collectorDark);

    // Head
    const headR = s * 0.13;
    const headY = bodyY - headR * 0.3;
    this._oCircle(ctx, cx, headY, headR, PAL.skin);

    // Mask/bandana
    this._oRect(
      ctx,
      cx - headR,
      headY - headR * 0.3,
      headR * 2,
      headR * 0.6,
      "#424242",
    );

    // Eyes (through mask)
    ctx.fillStyle = PAL.collectorGold;
    ctx.fillRect(cx - s * 0.07, headY - 1, 3, 2);
    ctx.fillRect(cx + s * 0.04, headY - 1, 3, 2);

    // Gold shimmer
    ctx.fillStyle = PAL.collectorGold;
    ctx.globalAlpha = 0.4 + (f % 2) * 0.2;
    for (let i = 0; i < 2; i++) {
      const sx = cx + (i - 0.5) * s * 0.3;
      const sy = s * 0.3 + i * s * 0.15;
      this._drawStar(ctx, sx, sy, 2, 4);
    }
    ctx.globalAlpha = 1.0;
  }

  // --- Leech ---
  _drawLeech(ctx, s, f) {
    const cx = s / 2;

    // Wings (small, bat-like since it is air type)
    this._drawWings(
      ctx,
      cx,
      s * 0.38,
      s * 0.9,
      f,
      PAL.leechPurple,
      PAL.leechDark,
    );

    // Body (elongated, dark)
    const bodyRx = s * 0.14;
    const bodyRy = s * 0.2;
    this._oEllipse(ctx, cx, s * 0.48, bodyRx, bodyRy, PAL.leechPurple);

    // Veins/details
    ctx.strokeStyle = PAL.leechRed;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - bodyRx * 0.5, s * 0.4);
    ctx.lineTo(cx - bodyRx * 0.3, s * 0.5);
    ctx.lineTo(cx - bodyRx * 0.5, s * 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + bodyRx * 0.5, s * 0.38);
    ctx.lineTo(cx + bodyRx * 0.3, s * 0.48);
    ctx.lineTo(cx + bodyRx * 0.5, s * 0.53);
    ctx.stroke();

    // Head
    const headR = s * 0.1;
    const headY = s * 0.28;
    this._oCircle(ctx, cx, headY, headR, PAL.leechDark);

    // Eyes (red, vampiric)
    this._oCircle(ctx, cx - s * 0.04, headY - 1, s * 0.035, "#FF1744", false);
    this._oCircle(ctx, cx + s * 0.04, headY - 1, s * 0.035, "#FF1744", false);

    // Fangs
    ctx.fillStyle = PAL.white;
    ctx.beginPath();
    ctx.moveTo(cx - 2, headY + headR * 0.4);
    ctx.lineTo(cx - 1, headY + headR * 1.2);
    ctx.lineTo(cx, headY + headR * 0.4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 1, headY + headR * 0.4);
    ctx.lineTo(cx + 2, headY + headR * 1.2);
    ctx.lineTo(cx + 3, headY + headR * 0.4);
    ctx.fill();

    // Blood drip
    ctx.fillStyle = PAL.leechRed;
    ctx.globalAlpha = 0.7;
    const dripY = headY + headR * 1.3 + f * 1.5;
    ctx.beginPath();
    ctx.arc(cx, dripY, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  // --- Teleporter ---
  _drawTeleporter(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Glitch effect (offset copies)
    ctx.globalAlpha = 0.25;
    ctx.save();
    ctx.translate((f % 2) * 3 - 1.5, 0);
    this._drawTeleporterBody(ctx, cx, bottom, s, f, PAL.teleporterGlitch);
    ctx.restore();
    ctx.globalAlpha = 1.0;

    // Main body
    this._drawTeleporterBody(ctx, cx, bottom, s, f, PAL.teleporterCyan);

    // Phase particles
    ctx.fillStyle = PAL.teleporterGlitch;
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + f * 1.0;
      const dist = s * 0.3;
      const px = cx + Math.cos(angle) * dist;
      const py = s * 0.5 + Math.sin(angle) * s * 0.15;
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
    ctx.globalAlpha = 1.0;
  }

  _drawTeleporterBody(ctx, cx, bottom, s, f, bodyColor) {
    // Legs
    this._drawLegs(ctx, cx, bottom, s, f, bodyColor, PAL.teleporterDark);

    // Body
    const bodyW = s * 0.34;
    const bodyH = s * 0.3;
    const bodyY = s * 0.38;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, bodyColor);

    // Circuitry lines
    ctx.strokeStyle = PAL.teleporterGlitch;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW / 2 + 3, bodyY + 4);
    ctx.lineTo(cx, bodyY + bodyH / 2);
    ctx.lineTo(cx + bodyW / 2 - 3, bodyY + 4);
    ctx.stroke();

    // Arms
    this._drawArms(ctx, cx, bodyY + bodyH * 0.1, s, f, bodyColor);

    // Head
    const headR = s * 0.12;
    const headY = bodyY - headR * 0.3;
    this._oCircle(ctx, cx, headY, headR, bodyColor);

    // Eyes (digital looking)
    ctx.fillStyle = PAL.teleporterGlitch;
    ctx.fillRect(cx - s * 0.07, headY - 2, 4, 3);
    ctx.fillRect(cx + s * 0.03, headY - 2, 4, 3);
  }

  // --- Splitter ---
  _drawSplitter(ctx, s, f) {
    const cx = s / 2;
    const cy = s * 0.5;

    // Main blob body
    const blobR = s * 0.28;
    const wobble = (f % 2) * 1.5;

    // Body (amorphous blob)
    ctx.fillStyle = PAL.splitterGreen;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - blobR, cy + wobble);
    ctx.quadraticCurveTo(
      cx - blobR - 2,
      cy - blobR * 0.8,
      cx,
      cy - blobR + wobble,
    );
    ctx.quadraticCurveTo(
      cx + blobR + 2,
      cy - blobR * 0.8,
      cx + blobR,
      cy - wobble,
    );
    ctx.quadraticCurveTo(cx + blobR, cy + blobR * 0.6, cx, cy + blobR * 0.7);
    ctx.quadraticCurveTo(cx - blobR, cy + blobR * 0.6, cx - blobR, cy + wobble);
    ctx.fill();
    ctx.stroke();

    // Inner lighter area
    ctx.fillStyle = PAL.splitterLight;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy - blobR * 0.1,
      blobR * 0.5,
      blobR * 0.4,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Division line (shows it can split)
    ctx.strokeStyle = PAL.splitterDark;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(cx, cy - blobR * 0.6);
    ctx.lineTo(cx, cy + blobR * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    // Eyes
    this._drawEyes(ctx, cx, cy - blobR * 0.2, s * 0.9);

    // Small bump protrusions (looks divisible)
    this._oCircle(
      ctx,
      cx - blobR * 0.7,
      cy - blobR * 0.2,
      s * 0.05,
      PAL.splitterGreen,
      false,
    );
    this._oCircle(
      ctx,
      cx + blobR * 0.7,
      cy - blobR * 0.2,
      s * 0.05,
      PAL.splitterGreen,
      false,
    );

    // Bubbles
    ctx.fillStyle = PAL.splitterBubble;
    ctx.globalAlpha = 0.5;
    this._oCircle(
      ctx,
      cx - blobR * 0.3,
      cy + blobR * 0.2,
      2,
      PAL.splitterBubble,
      false,
    );
    this._oCircle(
      ctx,
      cx + blobR * 0.2,
      cy - blobR * 0.4,
      1.5,
      PAL.splitterBubble,
      false,
    );
    ctx.globalAlpha = 1.0;
  }

  // --- Plaguebearer ---
  _drawPlaguebearer(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Toxic aura
    ctx.fillStyle = PAL.plagueGlow;
    ctx.beginPath();
    ctx.arc(cx, s * 0.5, s * 0.4 + f, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    this._drawLegs(ctx, cx, bottom, s, f, PAL.plagueSickly, PAL.plagueDark);

    // Body (hunched)
    const bodyW = s * 0.42;
    const bodyH = s * 0.32;
    const bodyY = s * 0.36;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.plagueSickly);
    // Boils
    this._oCircle(
      ctx,
      cx - s * 0.08,
      bodyY + bodyH * 0.3,
      2,
      PAL.plagueToxic,
      false,
    );
    this._oCircle(
      ctx,
      cx + s * 0.1,
      bodyY + bodyH * 0.5,
      1.5,
      PAL.plagueToxic,
      false,
    );

    // Arms (droopy)
    const armW = s * 0.1;
    const armH = s * 0.22;
    this._oRect(
      ctx,
      cx - bodyW / 2 - armW,
      bodyY + 4,
      armW,
      armH,
      PAL.plagueSickly,
    );
    this._oRect(ctx, cx + bodyW / 2, bodyY + 4, armW, armH, PAL.plagueSickly);

    // Head
    const headR = s * 0.14;
    const headY = bodyY - headR * 0.2;
    this._oCircle(ctx, cx, headY, headR, PAL.plagueSickly);

    // Sickly eyes
    this._oCircle(ctx, cx - s * 0.07, headY - 1, s * 0.05, "#CDDC39", false);
    this._oCircle(ctx, cx - s * 0.07, headY - 1, s * 0.025, PAL.pupil, false);
    this._oCircle(ctx, cx + s * 0.07, headY - 1, s * 0.05, "#CDDC39", false);
    this._oCircle(ctx, cx + s * 0.07, headY - 1, s * 0.025, PAL.pupil, false);

    // Drool
    ctx.fillStyle = PAL.plagueToxic;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - 1, headY + headR * 0.6);
    ctx.lineTo(cx, headY + headR + 2 + f);
    ctx.lineTo(cx + 1, headY + headR * 0.6);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Toxic particles
    ctx.fillStyle = PAL.plagueToxic;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + f * 0.6;
      const dist = s * 0.35;
      const px = cx + Math.cos(angle) * dist;
      const py = s * 0.5 + Math.sin(angle) * s * 0.2;
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }

  // --- Ghost ---
  _drawGhost(ctx, s, f) {
    const cx = s / 2;
    const floatY = (f % 2) * 2;

    // Semi-transparent body
    ctx.globalAlpha = 0.7;

    // Body (ghost shape)
    ctx.fillStyle = PAL.ghostBlue;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, s * 0.7 + floatY);
    // Wavy bottom
    ctx.lineTo(cx - s * 0.15, s * 0.65 + floatY);
    ctx.lineTo(cx - s * 0.05, s * 0.72 + floatY);
    ctx.lineTo(cx + s * 0.05, s * 0.65 + floatY);
    ctx.lineTo(cx + s * 0.15, s * 0.72 + floatY);
    ctx.lineTo(cx + s * 0.2, s * 0.65 + floatY);
    // Right side up to top
    ctx.lineTo(cx + s * 0.2, s * 0.35);
    ctx.quadraticCurveTo(cx + s * 0.2, s * 0.18, cx, s * 0.18);
    ctx.quadraticCurveTo(cx - s * 0.2, s * 0.18, cx - s * 0.2, s * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Eyes (hollow, spooky)
    ctx.fillStyle = PAL.pupil;
    ctx.beginPath();
    ctx.ellipse(
      cx - s * 0.08,
      s * 0.32,
      s * 0.04,
      s * 0.055,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(
      cx + s * 0.08,
      s * 0.32,
      s * 0.04,
      s * 0.055,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Mouth (O shape)
    ctx.beginPath();
    ctx.ellipse(cx, s * 0.43, s * 0.04, s * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1.0;
  }

  // --- Assassin ---
  _drawAssassin(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Legs (quick, thin)
    const legW = s * 0.1;
    const legH = s * 0.24;
    const gap = s * 0.06;
    const phase = LEG_PHASE[f];
    this._oRect(
      ctx,
      cx - gap - legW / 2,
      bottom - legH + phase.left * 1.5,
      legW,
      legH,
      PAL.assassinDark,
    );
    this._oRect(
      ctx,
      cx + gap - legW / 2,
      bottom - legH + phase.right * 1.5,
      legW,
      legH,
      PAL.assassinDark,
    );

    // Body (slim, dark)
    const bodyW = s * 0.3;
    const bodyH = s * 0.28;
    const bodyY = s * 0.38;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.assassinDark);
    // Red sash
    ctx.fillStyle = PAL.assassinRed;
    ctx.fillRect(cx - bodyW / 2 + 1, bodyY + bodyH * 0.6, bodyW - 2, 2);

    // Arms
    this._drawArms(ctx, cx, bodyY + bodyH * 0.05, s, f, PAL.assassinDark);

    // Daggers (both hands)
    ctx.fillStyle = PAL.assassinBlade;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 0.8;
    // Left dagger
    ctx.fillRect(cx - bodyW / 2 - s * 0.1, bodyY + s * 0.15, 1.5, s * 0.12);
    ctx.strokeRect(cx - bodyW / 2 - s * 0.1, bodyY + s * 0.15, 1.5, s * 0.12);
    // Right dagger
    ctx.fillRect(cx + bodyW / 2 + s * 0.08, bodyY + s * 0.15, 1.5, s * 0.12);
    ctx.strokeRect(cx + bodyW / 2 + s * 0.08, bodyY + s * 0.15, 1.5, s * 0.12);

    // Head
    const headR = s * 0.11;
    const headY = bodyY - headR * 0.3;
    this._oCircle(ctx, cx, headY, headR, PAL.assassinDark);

    // Eyes only (masked face)
    ctx.fillStyle = PAL.assassinRed;
    ctx.fillRect(cx - s * 0.06, headY - 1, 3, 2);
    ctx.fillRect(cx + s * 0.03, headY - 1, 3, 2);
  }

  // --- Disruptor ---
  _drawDisruptor(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Disruption waves
    ctx.strokeStyle = PAL.disruptorMagenta;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3 + (f % 2) * 0.15;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(cx, s * 0.5, s * (0.3 + i * 0.1) + f * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // Legs
    this._drawLegs(ctx, cx, bottom, s, f, PAL.disruptorDark, "#1A0033");

    // Body
    const bodyW = s * 0.42;
    const bodyH = s * 0.32;
    const bodyY = s * 0.34;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.disruptorDark);
    // Magical runes
    ctx.fillStyle = PAL.disruptorMagenta;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(cx - 3, bodyY + 4, 6, 2);
    ctx.fillRect(cx - 1, bodyY + 2, 2, 6);
    ctx.globalAlpha = 1.0;

    // Arms
    this._drawArms(ctx, cx, bodyY + bodyH * 0.1, s, f, PAL.disruptorDark);

    // Head (with horns)
    const headR = s * 0.13;
    const headY = bodyY - headR * 0.3;
    this._oCircle(ctx, cx, headY, headR, PAL.disruptorDark);
    this._drawHorns(ctx, cx, headY - headR, s * 0.6, PAL.disruptorMagenta);

    // Eyes (glowing magenta)
    this._oCircle(
      ctx,
      cx - s * 0.06,
      headY - 1,
      s * 0.04,
      PAL.disruptorMagenta,
      false,
    );
    this._oCircle(
      ctx,
      cx + s * 0.06,
      headY - 1,
      s * 0.04,
      PAL.disruptorMagenta,
      false,
    );
  }

  // --- Chronomancer ---
  _drawChronomancer(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Time distortion rings
    ctx.strokeStyle = PAL.chronomancerGold;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.save();
    ctx.translate(cx, s * 0.5);
    ctx.rotate(f * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.35, s * 0.15, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1.0;

    // Legs
    this._drawLegs(ctx, cx, bottom, s, f, PAL.chronomancerBlue, "#0D1642");

    // Robe body
    const bodyW = s * 0.38;
    const bodyH = s * 0.34;
    const bodyY = s * 0.34;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.chronomancerBlue);
    // Clock symbol on chest
    ctx.strokeStyle = PAL.chronomancerGold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, bodyY + bodyH * 0.4, s * 0.05, 0, Math.PI * 2);
    ctx.stroke();
    // Clock hands
    ctx.beginPath();
    ctx.moveTo(cx, bodyY + bodyH * 0.4);
    ctx.lineTo(cx, bodyY + bodyH * 0.4 - 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, bodyY + bodyH * 0.4);
    ctx.lineTo(cx + 2, bodyY + bodyH * 0.4);
    ctx.stroke();

    // Arms
    this._drawArms(ctx, cx, bodyY + bodyH * 0.1, s, f, PAL.chronomancerBlue);

    // Hourglass (held)
    const hgX = cx + bodyW / 2 + s * 0.06;
    const hgY = bodyY + s * 0.08;
    ctx.fillStyle = PAL.chronomancerGold;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(hgX - 2, hgY);
    ctx.lineTo(hgX + 2, hgY);
    ctx.lineTo(hgX, hgY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hgX - 2, hgY + 10);
    ctx.lineTo(hgX + 2, hgY + 10);
    ctx.lineTo(hgX, hgY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Head
    const headR = s * 0.13;
    const headY = bodyY - headR * 0.3;
    this._oCircle(ctx, cx, headY, headR, PAL.skin);

    // Wizard hat
    ctx.fillStyle = PAL.chronomancerBlue;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - headR * 1.1, headY - headR * 0.2);
    ctx.lineTo(cx, headY - headR * 2.2);
    ctx.lineTo(cx + headR * 1.1, headY - headR * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Hat band
    ctx.fillStyle = PAL.chronomancerGold;
    ctx.fillRect(cx - headR * 1.0, headY - headR * 0.3, headR * 2.0, 2);

    // Eyes
    this._drawEyes(ctx, cx, headY, s);
  }

  // --- Golem ---
  _drawGolem(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.94;

    // Legs (thick stone pillars)
    const legW = s * 0.18;
    const legH = s * 0.2;
    const gap = s * 0.1;
    const phase = LEG_PHASE[f];
    this._oRect(
      ctx,
      cx - gap - legW / 2,
      bottom - legH + phase.left * 0.3,
      legW,
      legH,
      PAL.golemStone,
    );
    this._oRect(
      ctx,
      cx + gap - legW / 2,
      bottom - legH + phase.right * 0.3,
      legW,
      legH,
      PAL.golemStone,
    );

    // Body (massive, blocky)
    const bodyW = s * 0.56;
    const bodyH = s * 0.36;
    const bodyY = s * 0.28;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.golemStone);
    // Cracks
    ctx.strokeStyle = PAL.golemCrack;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.3, bodyY + 4);
    ctx.lineTo(cx - bodyW * 0.1, bodyY + bodyH * 0.5);
    ctx.lineTo(cx - bodyW * 0.25, bodyY + bodyH - 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + bodyW * 0.2, bodyY + 3);
    ctx.lineTo(cx + bodyW * 0.15, bodyY + bodyH * 0.4);
    ctx.stroke();

    // Rune glow on chest
    ctx.fillStyle = "#FF6D00";
    ctx.globalAlpha = 0.5 + (f % 2) * 0.2;
    ctx.beginPath();
    ctx.arc(cx, bodyY + bodyH * 0.4, s * 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Arms (massive)
    const armW = s * 0.15;
    const armH = s * 0.28;
    this._oRect(
      ctx,
      cx - bodyW / 2 - armW + 2,
      bodyY + 2 + phase.right * 0.2,
      armW,
      armH,
      PAL.golemStone,
    );
    this._oRect(
      ctx,
      cx + bodyW / 2 - 2,
      bodyY + 2 + phase.left * 0.2,
      armW,
      armH,
      PAL.golemStone,
    );
    // Fists (larger)
    this._oRect(
      ctx,
      cx - bodyW / 2 - armW,
      bodyY + armH - 2,
      armW + 4,
      s * 0.08,
      PAL.golemDark,
    );
    this._oRect(
      ctx,
      cx + bodyW / 2 - 4,
      bodyY + armH - 2,
      armW + 4,
      s * 0.08,
      PAL.golemDark,
    );

    // Head (small, embedded)
    const headR = s * 0.1;
    const headY = bodyY - headR * 0.2;
    this._oCircle(ctx, cx, headY, headR, PAL.golemDark);

    // Eyes (glowing)
    ctx.fillStyle = "#FF6D00";
    ctx.fillRect(cx - s * 0.06, headY - 1, 3, 3);
    ctx.fillRect(cx + s * 0.03, headY - 1, 3, 3);
  }

  // --- Mirage ---
  _drawMirage(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Fade copies (illusion effect)
    ctx.globalAlpha = 0.15;
    ctx.save();
    ctx.translate(-4, 0);
    this._drawMirageBody(ctx, cx, bottom, s, f);
    ctx.restore();
    ctx.save();
    ctx.translate(4, 0);
    this._drawMirageBody(ctx, cx, bottom, s, f);
    ctx.restore();
    ctx.globalAlpha = 1.0;

    // Main body
    this._drawMirageBody(ctx, cx, bottom, s, f);
  }

  _drawMirageBody(ctx, cx, bottom, s, f) {
    // Legs
    this._drawLegs(ctx, cx, bottom, s, f, PAL.mirageBlue, "#1565C0");

    // Body
    const bodyW = s * 0.36;
    const bodyH = s * 0.3;
    const bodyY = s * 0.38;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.mirageBlue);

    // Arms
    this._drawArms(ctx, cx, bodyY + bodyH * 0.1, s, f, PAL.mirageBlue);

    // Head
    const headR = s * 0.12;
    const headY = bodyY - headR * 0.3;
    this._oCircle(ctx, cx, headY, headR, PAL.mirageBlue);

    // Eyes
    this._drawEyes(ctx, cx, headY, s);
  }

  // --- Mimic ---
  _drawMimic(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.85;

    // Chest body
    const chestW = s * 0.5;
    const chestH = s * 0.3;
    const chestY = s * 0.4;

    // Lid (open and close based on frame)
    const lidOpen = f % 2 === 0 ? 0.2 : 0.4;
    ctx.fillStyle = PAL.mimicDark;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - chestW / 2, chestY);
    ctx.lineTo(cx - chestW / 2, chestY - chestH * lidOpen);
    ctx.lineTo(cx + chestW / 2, chestY - chestH * lidOpen);
    ctx.lineTo(cx + chestW / 2, chestY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Lid gold trim
    ctx.fillStyle = PAL.mimicGold;
    ctx.fillRect(cx - chestW / 2, chestY - 2, chestW, 2);

    // Chest body
    this._oRect(ctx, cx - chestW / 2, chestY, chestW, chestH, PAL.mimicDark);
    // Gold bands
    ctx.fillStyle = PAL.mimicGold;
    ctx.fillRect(cx - chestW / 2, chestY, chestW, 2);
    ctx.fillRect(cx - chestW / 2, chestY + chestH - 2, chestW, 2);
    // Lock
    this._oCircle(ctx, cx, chestY + chestH / 2, s * 0.04, PAL.mimicGold);

    // Eyes (peeking from lid gap)
    ctx.fillStyle = "#FF1744";
    ctx.fillRect(cx - s * 0.1, chestY - chestH * lidOpen * 0.5, 3, 2);
    ctx.fillRect(cx + s * 0.06, chestY - chestH * lidOpen * 0.5, 3, 2);

    // Teeth (jagged, inside lid opening)
    ctx.fillStyle = PAL.mimicTeeth;
    for (let i = 0; i < 5; i++) {
      const tx = cx - chestW / 2 + 3 + i * (chestW / 5);
      ctx.beginPath();
      ctx.moveTo(tx, chestY);
      ctx.lineTo(tx + 2, chestY - chestH * lidOpen * 0.3);
      ctx.lineTo(tx + 4, chestY);
      ctx.fill();
    }

    // Small legs underneath
    ctx.fillStyle = PAL.mimicDark;
    ctx.fillRect(cx - s * 0.15, bottom, 3, 4);
    ctx.fillRect(cx + s * 0.12, bottom, 3, 4);
  }

  // --- Summoner ---
  _drawSummoner(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Summoning orbs orbiting
    ctx.fillStyle = PAL.summonerOrb;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + f * 0.8;
      const dist = s * 0.35;
      const ox = cx + Math.cos(angle) * dist;
      const oy = s * 0.4 + Math.sin(angle) * s * 0.12;
      ctx.beginPath();
      ctx.arc(ox, oy, s * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Legs
    this._drawLegs(ctx, cx, bottom, s, f, PAL.summonerDark, "#1A0033");

    // Robe body
    const bodyW = s * 0.4;
    const bodyH = s * 0.34;
    const bodyY = s * 0.34;
    // Robe flares at bottom
    ctx.fillStyle = PAL.summonerPurple;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW / 2, bodyY);
    ctx.lineTo(cx - bodyW / 2 - 3, bodyY + bodyH);
    ctx.lineTo(cx + bodyW / 2 + 3, bodyY + bodyH);
    ctx.lineTo(cx + bodyW / 2, bodyY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Magical symbols on robe
    ctx.strokeStyle = PAL.summonerOrb;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx, bodyY + bodyH * 0.5, s * 0.04, 0, Math.PI * 2);
    ctx.stroke();

    // Arms
    this._drawArms(ctx, cx, bodyY + bodyH * 0.1, s, f, PAL.summonerPurple);

    // Staff
    const staffX = cx - bodyW / 2 - s * 0.1;
    ctx.fillStyle = "#5D4037";
    ctx.fillRect(staffX, bodyY - s * 0.12, 2, s * 0.45);
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(staffX, bodyY - s * 0.12, 2, s * 0.45);
    // Staff crystal
    ctx.fillStyle = PAL.summonerOrb;
    ctx.beginPath();
    ctx.moveTo(staffX + 1, bodyY - s * 0.12);
    ctx.lineTo(staffX - 2, bodyY - s * 0.16);
    ctx.lineTo(staffX + 1, bodyY - s * 0.2);
    ctx.lineTo(staffX + 4, bodyY - s * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PAL.outline;
    ctx.stroke();

    // Head
    const headR = s * 0.13;
    const headY = bodyY - headR * 0.4;
    this._oCircle(ctx, cx, headY, headR, PAL.skin);

    // Hood
    ctx.fillStyle = PAL.summonerDark;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, headY - 1, headR * 1.15, Math.PI + 0.4, -0.4);
    ctx.fill();
    ctx.stroke();

    // Eyes (glowing)
    this._oCircle(ctx, cx - s * 0.06, headY, s * 0.035, PAL.summonerOrb, false);
    this._oCircle(ctx, cx + s * 0.06, headY, s * 0.035, PAL.summonerOrb, false);
  }

  // =========================================================================
  // BOSS MONSTERS
  // =========================================================================

  // --- Boss (Red Demon) ---
  _drawBoss(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Legs (thick, demon)
    const legW = s * 0.14;
    const legH = s * 0.22;
    const gap = s * 0.1;
    const phase = LEG_PHASE[f];
    this._oRect(
      ctx,
      cx - gap - legW / 2,
      bottom - legH + phase.left * 0.5,
      legW,
      legH,
      PAL.bossDark,
    );
    this._oRect(
      ctx,
      cx + gap - legW / 2,
      bottom - legH + phase.right * 0.5,
      legW,
      legH,
      PAL.bossDark,
    );
    // Hooves
    this._oRect(
      ctx,
      cx - gap - legW / 2 - 1,
      bottom - 3 + phase.left * 0.5,
      legW + 2,
      3,
      "#2E0000",
    );
    this._oRect(
      ctx,
      cx + gap - legW / 2 - 1,
      bottom - 3 + phase.right * 0.5,
      legW + 2,
      3,
      "#2E0000",
    );

    // Tail
    ctx.strokeStyle = PAL.bossDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.05, s * 0.6);
    ctx.quadraticCurveTo(cx + s * 0.2, s * 0.7, cx + s * 0.25, s * 0.55);
    ctx.stroke();
    // Tail tip (arrowhead)
    ctx.fillStyle = PAL.bossRed;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.23, s * 0.5);
    ctx.lineTo(cx + s * 0.28, s * 0.55);
    ctx.lineTo(cx + s * 0.23, s * 0.6);
    ctx.closePath();
    ctx.fill();

    // Body
    const bodyW = s * 0.46;
    const bodyH = s * 0.34;
    const bodyY = s * 0.32;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.bossRed);
    // Chest scar
    ctx.strokeStyle = PAL.bossDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 3, bodyY + 4);
    ctx.lineTo(cx + 3, bodyY + bodyH * 0.6);
    ctx.stroke();

    // Arms (muscular)
    const armW = s * 0.12;
    const armH = s * 0.24;
    this._oRect(
      ctx,
      cx - bodyW / 2 - armW + 1,
      bodyY + phase.right * 0.3,
      armW,
      armH,
      PAL.bossRed,
    );
    this._oRect(
      ctx,
      cx + bodyW / 2 - 1,
      bodyY + phase.left * 0.3,
      armW,
      armH,
      PAL.bossRed,
    );

    // Head
    const headR = s * 0.14;
    const headY = bodyY - headR * 0.3;
    this._oCircle(ctx, cx, headY, headR, PAL.bossRed);

    // Horns
    this._drawHorns(ctx, cx, headY - headR, s, PAL.bossHorn);

    // Eyes
    this._drawAngryEyes(ctx, cx, headY, s, PAL.goblinEye, PAL.bossHorn);
  }

  // --- Archfiend ---
  _drawArchfiend(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Dark aura
    ctx.fillStyle = PAL.archfiendGlow;
    ctx.beginPath();
    ctx.arc(cx, s * 0.5, s * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    const legW = s * 0.13;
    const legH = s * 0.22;
    const gap = s * 0.1;
    const phase = LEG_PHASE[f];
    this._oRect(
      ctx,
      cx - gap - legW / 2,
      bottom - legH + phase.left * 0.5,
      legW,
      legH,
      PAL.archfiendDark,
    );
    this._oRect(
      ctx,
      cx + gap - legW / 2,
      bottom - legH + phase.right * 0.5,
      legW,
      legH,
      PAL.archfiendDark,
    );

    // Cape
    ctx.fillStyle = PAL.archfiendDark;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.22, s * 0.3);
    ctx.lineTo(cx - s * 0.25, bottom - 3);
    ctx.lineTo(cx + s * 0.25, bottom - 3);
    ctx.lineTo(cx + s * 0.22, s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Body
    const bodyW = s * 0.44;
    const bodyH = s * 0.32;
    const bodyY = s * 0.32;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.archfiendPurple);
    // Demonic runes
    ctx.strokeStyle = PAL.archfiendHorn;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(cx, bodyY + bodyH * 0.5, s * 0.05, 0, Math.PI * 2);
    ctx.stroke();
    // Pentagram-like lines
    ctx.beginPath();
    ctx.moveTo(cx, bodyY + bodyH * 0.25);
    ctx.lineTo(cx - s * 0.05, bodyY + bodyH * 0.65);
    ctx.lineTo(cx + s * 0.05, bodyY + bodyH * 0.35);
    ctx.lineTo(cx - s * 0.05, bodyY + bodyH * 0.35);
    ctx.lineTo(cx + s * 0.05, bodyY + bodyH * 0.65);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Arms
    this._drawArms(ctx, cx, bodyY + bodyH * 0.1, s, f, PAL.archfiendPurple);

    // Head
    const headR = s * 0.14;
    const headY = bodyY - headR * 0.3;
    this._oCircle(ctx, cx, headY, headR, PAL.archfiendPurple);

    // Large horns (curved)
    ctx.fillStyle = PAL.archfiendHorn;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    // Left horn
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.7, headY - headR * 0.4);
    ctx.quadraticCurveTo(
      cx - headR * 1.5,
      headY - headR * 1.8,
      cx - headR * 0.3,
      headY - headR * 2.0,
    );
    ctx.lineTo(cx - headR * 0.3, headY - headR * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Right horn
    ctx.beginPath();
    ctx.moveTo(cx + headR * 0.7, headY - headR * 0.4);
    ctx.quadraticCurveTo(
      cx + headR * 1.5,
      headY - headR * 1.8,
      cx + headR * 0.3,
      headY - headR * 2.0,
    );
    ctx.lineTo(cx + headR * 0.3, headY - headR * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Eyes (burning)
    this._drawAngryEyes(
      ctx,
      cx,
      headY,
      s,
      PAL.archfiendHorn,
      PAL.archfiendDark,
    );
  }

  // --- Ancient Dragon ---
  _drawAncientDragon(ctx, s, f) {
    const cx = s / 2;

    // Golden aura
    ctx.fillStyle = PAL.ancientGlow;
    ctx.beginPath();
    ctx.arc(cx, s * 0.45, s * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Grand wings
    this._drawDragonWings(
      ctx,
      cx,
      s * 0.3,
      s * 1.1,
      f,
      PAL.ancientGold,
      PAL.ancientScale,
    );

    // Tail (longer, grander)
    ctx.strokeStyle = PAL.ancientDark;
    ctx.lineWidth = s * 0.06;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, s * 0.6);
    ctx.quadraticCurveTo(cx + s * 0.25, s * 0.75, cx + s * 0.35, s * 0.55);
    ctx.stroke();
    ctx.fillStyle = PAL.ancientGold;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.33, s * 0.48);
    ctx.lineTo(cx + s * 0.4, s * 0.55);
    ctx.lineTo(cx + s * 0.33, s * 0.62);
    ctx.closePath();
    ctx.fill();

    // Body (larger)
    const bodyRx = s * 0.22;
    const bodyRy = s * 0.16;
    this._oEllipse(ctx, cx, s * 0.48, bodyRx, bodyRy, PAL.ancientGold);
    // Belly scales
    this._oEllipse(
      ctx,
      cx,
      s * 0.52,
      bodyRx * 0.7,
      bodyRy * 0.55,
      PAL.ancientScale,
      false,
    );
    // Scale pattern
    ctx.strokeStyle = PAL.ancientDark;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, s * 0.52 + i * 3, bodyRx * 0.5 - i * 2, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }

    // Neck
    this._oRect(
      ctx,
      cx - s * 0.07,
      s * 0.26,
      s * 0.14,
      s * 0.12,
      PAL.ancientGold,
      false,
    );

    // Head
    const headRx = s * 0.14;
    const headRy = s * 0.11;
    const headY = s * 0.22;
    this._oEllipse(ctx, cx, headY, headRx, headRy, PAL.ancientGold);

    // Crown horns (3 pairs)
    ctx.fillStyle = PAL.ancientDark;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * s * 0.08;
      const hornH = s * (0.1 + (1 - Math.abs(i - 1)) * 0.06);
      ctx.beginPath();
      ctx.moveTo(cx + offset - 2, headY - headRy);
      ctx.lineTo(cx + offset, headY - headRy - hornH);
      ctx.lineTo(cx + offset + 2, headY - headRy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Eyes
    const eyeR = s * 0.045;
    this._oCircle(ctx, cx - s * 0.07, headY - 1, eyeR, PAL.ancientScale, false);
    this._oCircle(ctx, cx - s * 0.07, headY - 1, eyeR * 0.4, PAL.pupil, false);
    this._oCircle(ctx, cx + s * 0.07, headY - 1, eyeR, PAL.ancientScale, false);
    this._oCircle(ctx, cx + s * 0.07, headY - 1, eyeR * 0.4, PAL.pupil, false);

    // Snout + fire breath hint
    ctx.fillStyle = PAL.ancientDark;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      headY + headRy * 0.5,
      headRx * 0.35,
      headRy * 0.3,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Claws
    ctx.fillStyle = PAL.ancientDark;
    ctx.fillRect(cx - s * 0.12, s * 0.62, 3, 5);
    ctx.fillRect(cx + s * 0.09, s * 0.62, 3, 5);
  }

  // --- Void Lord ---
  _drawVoidLord(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.92;

    // Cosmic void background
    ctx.fillStyle = PAL.voidGlow;
    ctx.beginPath();
    ctx.arc(cx, s * 0.48, s * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // Cosmic particles
    ctx.fillStyle = PAL.voidCosmic;
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + f * 0.5;
      const dist = s * 0.35 + Math.sin(angle * 2) * s * 0.05;
      const px = cx + Math.cos(angle) * dist;
      const py = s * 0.48 + Math.sin(angle) * dist * 0.7;
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Legs (shadowy)
    const legW = s * 0.12;
    const legH = s * 0.2;
    const gap = s * 0.08;
    const phase = LEG_PHASE[f];
    // Fading legs
    ctx.globalAlpha = 0.7;
    this._oRect(
      ctx,
      cx - gap - legW / 2,
      bottom - legH + phase.left * 0.4,
      legW,
      legH,
      PAL.voidDark,
    );
    this._oRect(
      ctx,
      cx + gap - legW / 2,
      bottom - legH + phase.right * 0.4,
      legW,
      legH,
      PAL.voidDark,
    );
    ctx.globalAlpha = 1.0;

    // Body (dark void)
    const bodyW = s * 0.44;
    const bodyH = s * 0.34;
    const bodyY = s * 0.32;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.voidDark);
    // Void rift on chest
    ctx.fillStyle = PAL.voidPurple;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      bodyY + bodyH * 0.45,
      s * 0.06,
      s * 0.04,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    // Inner glow
    ctx.fillStyle = PAL.voidCosmic;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      bodyY + bodyH * 0.45,
      s * 0.03,
      s * 0.02,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Arms (ethereal)
    ctx.globalAlpha = 0.8;
    this._drawArms(ctx, cx, bodyY + bodyH * 0.1, s, f, PAL.voidDark);
    ctx.globalAlpha = 1.0;

    // Floating fragments around arms
    ctx.fillStyle = PAL.voidPurple;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(cx - bodyW / 2 - s * 0.14, bodyY + s * 0.08 + f, 3, 3);
    ctx.fillRect(cx + bodyW / 2 + s * 0.1, bodyY + s * 0.12 - f, 2, 2);
    ctx.globalAlpha = 1.0;

    // Head (with void crown)
    const headR = s * 0.14;
    const headY = bodyY - headR * 0.3;
    this._oCircle(ctx, cx, headY, headR, PAL.voidDark);

    // Crown (floating void shards)
    ctx.fillStyle = PAL.voidPurple;
    ctx.strokeStyle = PAL.voidCosmic;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 5; i++) {
      const angle = Math.PI + (i / 4) * Math.PI;
      const dist = headR * 1.3;
      const sx = cx + Math.cos(angle) * dist;
      const sy = headY + Math.sin(angle) * dist;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - 2, sy - 4 - (i === 2 ? 3 : 0));
      ctx.lineTo(sx + 2, sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Eyes (void purple glow) - simulated with larger semi-transparent shape behind
    ctx.fillStyle = "rgba(179,136,255,0.35)";
    ctx.fillRect(cx - s * 0.08 - 2, headY - 4, 8, 7);
    ctx.fillRect(cx + s * 0.04 - 2, headY - 4, 8, 7);
    ctx.fillStyle = PAL.voidCosmic;
    ctx.fillRect(cx - s * 0.08, headY - 2, 4, 3);
    ctx.fillRect(cx + s * 0.04, headY - 2, 4, 3);
  }

  // --- Titan Golem ---
  _drawTitanGolem(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.94;

    // Legs (massive pillars)
    const legW = s * 0.18;
    const legH = s * 0.22;
    const gap = s * 0.12;
    const phase = LEG_PHASE[f];
    this._oRect(
      ctx,
      cx - gap - legW / 2,
      bottom - legH + phase.left * 0.3,
      legW,
      legH,
      PAL.titanGray,
    );
    // Leg armor plates
    this._oRect(
      ctx,
      cx - gap - legW / 2,
      bottom - legH + phase.left * 0.3,
      legW,
      3,
      PAL.titanRust,
      false,
    );
    this._oRect(
      ctx,
      cx + gap - legW / 2,
      bottom - legH + phase.right * 0.3,
      legW,
      legH,
      PAL.titanGray,
    );
    this._oRect(
      ctx,
      cx + gap - legW / 2,
      bottom - legH + phase.right * 0.3,
      legW,
      3,
      PAL.titanRust,
      false,
    );

    // Body (enormous, blocky)
    const bodyW = s * 0.58;
    const bodyH = s * 0.36;
    const bodyY = s * 0.26;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.titanGray);

    // Armor plating
    this._oRect(
      ctx,
      cx - bodyW / 2 + 2,
      bodyY + 2,
      bodyW - 4,
      bodyH * 0.2,
      PAL.titanLight,
    );
    this._oRect(
      ctx,
      cx - bodyW / 2 + 2,
      bodyY + bodyH * 0.4,
      bodyW - 4,
      bodyH * 0.2,
      PAL.titanLight,
    );
    this._oRect(
      ctx,
      cx - bodyW / 2 + 2,
      bodyY + bodyH * 0.75,
      bodyW - 4,
      bodyH * 0.2,
      PAL.titanLight,
    );

    // Cracks and rust
    ctx.strokeStyle = PAL.titanRust;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.25, bodyY + 5);
    ctx.lineTo(cx - bodyW * 0.1, bodyY + bodyH * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + bodyW * 0.2, bodyY + bodyH * 0.5);
    ctx.lineTo(cx + bodyW * 0.1, bodyY + bodyH - 3);
    ctx.stroke();

    // Rune core (center)
    ctx.fillStyle = "#FF6D00";
    ctx.globalAlpha = 0.6 + (f % 2) * 0.2;
    ctx.beginPath();
    ctx.arc(cx, bodyY + bodyH * 0.45, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
    // Core ring
    ctx.strokeStyle = "#BF360C";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, bodyY + bodyH * 0.45, s * 0.07, 0, Math.PI * 2);
    ctx.stroke();

    // Arms (massive rock/metal)
    const armW = s * 0.16;
    const armH = s * 0.3;
    this._oRect(
      ctx,
      cx - bodyW / 2 - armW + 2,
      bodyY + phase.right * 0.2,
      armW,
      armH,
      PAL.titanGray,
    );
    this._oRect(
      ctx,
      cx + bodyW / 2 - 2,
      bodyY + phase.left * 0.2,
      armW,
      armH,
      PAL.titanGray,
    );
    // Giant fists
    this._oRect(
      ctx,
      cx - bodyW / 2 - armW - 1,
      bodyY + armH - 4,
      armW + 6,
      s * 0.1,
      PAL.titanDark,
    );
    this._oRect(
      ctx,
      cx + bodyW / 2 - 5,
      bodyY + armH - 4,
      armW + 6,
      s * 0.1,
      PAL.titanDark,
    );

    // Head (small, sunken into body)
    const headR = s * 0.1;
    const headY = bodyY - headR * 0.1;
    this._oCircle(ctx, cx, headY, headR, PAL.titanDark);

    // Eyes (glowing orange) - simulated with larger semi-transparent shape behind
    ctx.fillStyle = "rgba(255,109,0,0.3)";
    ctx.fillRect(cx - s * 0.06 - 2, headY - 4, 7, 7);
    ctx.fillRect(cx + s * 0.03 - 2, headY - 4, 7, 7);
    ctx.fillStyle = "#FF6D00";
    ctx.fillRect(cx - s * 0.06, headY - 2, 3, 3);
    ctx.fillRect(cx + s * 0.03, headY - 2, 3, 3);
  }

  // --- Final Boss ---
  _drawFinalBoss(ctx, s, f) {
    const cx = s / 2;
    const bottom = s * 0.93;

    // Phase-based coloring
    const pulseAlpha = 0.3 + Math.sin((f * Math.PI) / 2) * 0.15;

    // Massive aura
    ctx.fillStyle = PAL.finalBossGlow;
    ctx.beginPath();
    ctx.arc(cx, s * 0.48, s * 0.48, 0, Math.PI * 2);
    ctx.fill();

    // Energy waves
    ctx.strokeStyle = PAL.finalBossRed;
    ctx.lineWidth = 1;
    ctx.globalAlpha = pulseAlpha;
    ctx.beginPath();
    ctx.arc(cx, s * 0.48, s * 0.35 + f * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, s * 0.48, s * 0.42 + f * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Wings (demonic, dark)
    this._drawDragonWings(
      ctx,
      cx,
      s * 0.3,
      s,
      f,
      PAL.finalBossBlack,
      "#330000",
    );

    // Legs
    const legW = s * 0.14;
    const legH = s * 0.2;
    const gap = s * 0.1;
    const phase = LEG_PHASE[f];
    this._oRect(
      ctx,
      cx - gap - legW / 2,
      bottom - legH + phase.left * 0.4,
      legW,
      legH,
      PAL.finalBossBlack,
    );
    this._oRect(
      ctx,
      cx + gap - legW / 2,
      bottom - legH + phase.right * 0.4,
      legW,
      legH,
      PAL.finalBossBlack,
    );

    // Tail
    ctx.strokeStyle = PAL.finalBossBlack;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.05, s * 0.6);
    ctx.quadraticCurveTo(cx + s * 0.25, s * 0.75, cx + s * 0.32, s * 0.5);
    ctx.stroke();

    // Body (massive armored torso)
    const bodyW = s * 0.5;
    const bodyH = s * 0.36;
    const bodyY = s * 0.3;
    this._oRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, PAL.finalBossBlack);

    // Armor highlights
    ctx.fillStyle = PAL.finalBossRed;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(cx - bodyW / 2 + 2, bodyY + 2, bodyW - 4, 2);
    ctx.fillRect(cx - bodyW / 2 + 2, bodyY + bodyH - 4, bodyW - 4, 2);
    ctx.globalAlpha = 1.0;

    // Core gem - glow simulated with larger semi-transparent diamond behind
    ctx.fillStyle = "rgba(255,23,68,0.3)";
    ctx.beginPath();
    ctx.moveTo(cx, bodyY + bodyH * 0.2 - 3);
    ctx.lineTo(cx - s * 0.05 - 3, bodyY + bodyH * 0.45);
    ctx.lineTo(cx, bodyY + bodyH * 0.7 + 3);
    ctx.lineTo(cx + s * 0.05 + 3, bodyY + bodyH * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PAL.finalBossRed;
    ctx.beginPath();
    ctx.moveTo(cx, bodyY + bodyH * 0.2);
    ctx.lineTo(cx - s * 0.05, bodyY + bodyH * 0.45);
    ctx.lineTo(cx, bodyY + bodyH * 0.7);
    ctx.lineTo(cx + s * 0.05, bodyY + bodyH * 0.45);
    ctx.closePath();
    ctx.fill();

    // Gold trim
    ctx.strokeStyle = PAL.finalBossGold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, bodyY + bodyH * 0.2);
    ctx.lineTo(cx - s * 0.05, bodyY + bodyH * 0.45);
    ctx.lineTo(cx, bodyY + bodyH * 0.7);
    ctx.lineTo(cx + s * 0.05, bodyY + bodyH * 0.45);
    ctx.closePath();
    ctx.stroke();

    // Arms (massive)
    const armW = s * 0.14;
    const armH = s * 0.26;
    this._oRect(
      ctx,
      cx - bodyW / 2 - armW + 1,
      bodyY + phase.right * 0.3,
      armW,
      armH,
      PAL.finalBossBlack,
    );
    this._oRect(
      ctx,
      cx + bodyW / 2 - 1,
      bodyY + phase.left * 0.3,
      armW,
      armH,
      PAL.finalBossBlack,
    );
    // Gauntlets
    this._oRect(
      ctx,
      cx - bodyW / 2 - armW - 1,
      bodyY + armH - 4,
      armW + 4,
      s * 0.08,
      "#330000",
    );
    this._oRect(
      ctx,
      cx + bodyW / 2 - 3,
      bodyY + armH - 4,
      armW + 4,
      s * 0.08,
      "#330000",
    );

    // Head (dark, crowned)
    const headR = s * 0.14;
    const headY = bodyY - headR * 0.3;
    this._oCircle(ctx, cx, headY, headR, PAL.finalBossBlack);

    // Grand horns (large, curved, with gold tips)
    ctx.fillStyle = "#1A1A1A";
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1.5;
    // Left horn
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.7, headY - headR * 0.3);
    ctx.quadraticCurveTo(
      cx - headR * 2,
      headY - headR * 1.5,
      cx - headR * 0.5,
      headY - headR * 2.2,
    );
    ctx.lineTo(cx - headR * 0.2, headY - headR * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Gold tip
    ctx.fillStyle = PAL.finalBossGold;
    ctx.beginPath();
    ctx.arc(cx - headR * 0.5, headY - headR * 2.2, 2, 0, Math.PI * 2);
    ctx.fill();
    // Right horn
    ctx.fillStyle = "#1A1A1A";
    ctx.beginPath();
    ctx.moveTo(cx + headR * 0.7, headY - headR * 0.3);
    ctx.quadraticCurveTo(
      cx + headR * 2,
      headY - headR * 1.5,
      cx + headR * 0.5,
      headY - headR * 2.2,
    );
    ctx.lineTo(cx + headR * 0.2, headY - headR * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Gold tip
    ctx.fillStyle = PAL.finalBossGold;
    ctx.beginPath();
    ctx.arc(cx + headR * 0.5, headY - headR * 2.2, 2, 0, Math.PI * 2);
    ctx.fill();

    // Crown centerpiece
    ctx.fillStyle = PAL.finalBossGold;
    ctx.beginPath();
    ctx.moveTo(cx, headY - headR - 2);
    ctx.lineTo(cx - 3, headY - headR - 8);
    ctx.lineTo(cx + 3, headY - headR - 8);
    ctx.closePath();
    ctx.fill();
    // Gem on crown
    ctx.fillStyle = PAL.finalBossRed;
    ctx.beginPath();
    ctx.arc(cx, headY - headR - 5, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Eyes (burning red/gold) - simulated with larger semi-transparent shape behind
    ctx.fillStyle = "rgba(255,23,68,0.35)";
    ctx.fillRect(cx - s * 0.09 - 2, headY - 4, 8, 7);
    ctx.fillRect(cx + s * 0.05 - 2, headY - 4, 8, 7);
    ctx.fillStyle = PAL.finalBossRed;
    ctx.fillRect(cx - s * 0.09, headY - 2, 4, 3);
    ctx.fillRect(cx + s * 0.05, headY - 2, 4, 3);

    // Floating energy particles
    ctx.fillStyle = PAL.finalBossGold;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + f * 0.6;
      const dist = s * 0.4;
      const px = cx + Math.cos(angle) * dist;
      const py = s * 0.48 + Math.sin(angle) * dist * 0.6;
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }
}
