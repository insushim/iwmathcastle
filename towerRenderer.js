// towerRenderer.js - Canvas 2D Tower Renderer (Isometric / Pseudo-3D)
// Pixel-art style sprites using canvas primitives (fillRect, arc, lineTo, bezierCurveTo)
// Self-contained, no external dependencies
// All animations driven by `timestamp` parameter

// ---------------------------------------------------------------------------
// Color Palette (consistent with project dark cyber theme)
// ---------------------------------------------------------------------------
const O = "#1A1A2E"; // outline
const SHADOW = "rgba(0,0,0,0.22)";

const PAL = {
  // Stone base
  baseTop: "#5A5A6A",
  baseFront: "#4A4A5A",
  baseSide: "#3A3A4A",
  baseDark: "#2E2E3E",

  // Math towers
  plus: {
    main: "#2ECC71",
    dark: "#1A9E50",
    light: "#58D68D",
    glow: "rgba(46,204,113,0.4)",
  },
  minus: {
    main: "#E67E22",
    dark: "#BA5F0A",
    light: "#F0A050",
    glow: "rgba(230,126,34,0.4)",
  },
  multiply: {
    main: "#9B59B6",
    dark: "#7D3C98",
    light: "#BB8FCE",
    glow: "rgba(155,89,182,0.4)",
  },
  divide: {
    main: "#E74C3C",
    dark: "#B83227",
    light: "#F1948A",
    glow: "rgba(231,76,60,0.4)",
  },

  // Military
  cannon: {
    metal: "#3D3D4D",
    metalDark: "#2A2A3A",
    metalLight: "#5A5A6A",
    stone: "#4A4A5A",
  },
  skyDestroyer: {
    body: "#2C3E50",
    accent: "#E74C3C",
    exhaust: "#FF6B35",
    metalLight: "#5D6D7E",
  },
  ice: {
    main: "#AED6F1",
    dark: "#5DADE2",
    light: "#D6EAF8",
    crystal: "#E8F8FF",
    glow: "rgba(93,173,226,0.4)",
  },
  meteor: {
    stone: "#3D2817",
    lava: "#FF4500",
    lavaDark: "#CC3700",
    crack: "#FF6B35",
    glow: "rgba(255,69,0,0.35)",
  },
  poison: {
    liquid: "#27AE60",
    dark: "#1E8449",
    bubble: "#58D68D",
    fume: "rgba(39,174,96,0.3)",
    cauldron: "#4A4A5A",
  },
  stun: {
    metal: "#7F8C8D",
    rod: "#BDC3C7",
    arc: "#FFFF00",
    glow: "rgba(255,255,0,0.4)",
  },
  net: {
    body: "#3D3D4D",
    web: "#BDC3C7",
    webDark: "#95A5A6",
    accent: "#7F8C8D",
  },

  // Special
  laser: {
    body: "#C0392B",
    crystal: "#FFD700",
    glow: "rgba(255,215,0,0.45)",
    beam: "#F1C40F",
  },
  multiShot: {
    body: "#2C3E50",
    barrel: "#5D6D7E",
    accent: "#3498DB",
    bolt: "#AED6F1",
  },
  goldMine: {
    wood: "#8B6914",
    cart: "#6D4C1A",
    gold: "#FFD700",
    goldDark: "#DAA520",
    sparkle: "#FFFACD",
  },
  shredder: {
    pole: "#5A5A6A",
    blade: "#BDC3C7",
    bladeDark: "#7F8C8D",
    accent: "#E74C3C",
  },
  repairStation: {
    wood: "#8B6914",
    anvil: "#5A5A6A",
    anvilDark: "#3A3A4A",
    hammer: "#A0522D",
    glow: "rgba(255,165,0,0.3)",
  },

  // Epic / Legendary
  ultimate: { prism: "#FFFFFF", glow: "rgba(255,255,255,0.3)" },
  golden: {
    main: "#FFD700",
    dark: "#DAA520",
    light: "#FFEC8B",
    glow: "rgba(255,215,0,0.45)",
  },
  silver: {
    main: "#C0C0C0",
    dark: "#A9A9A9",
    light: "#E8E8E8",
    moon: "#F0F0FF",
    glow: "rgba(192,192,192,0.35)",
  },
  copper: {
    main: "#B87333",
    dark: "#8B5A2B",
    light: "#CD853F",
    flame: "#FF6347",
    glow: "rgba(184,115,51,0.35)",
  },
  transcendent: {
    core: "#4B0082",
    nebula1: "#8A2BE2",
    nebula2: "#00CED1",
    nebula3: "#FF1493",
    glow: "rgba(75,0,130,0.4)",
  },

  // Random boxes
  randomCheap: { wood: "#A0724A", woodDark: "#6D4C1A", band: "#8B7355" },
  randomMedium: {
    metal: "#6D6D7D",
    metalDark: "#4A4A5A",
    glow: "rgba(128,0,255,0.35)",
  },
  randomExpensive: {
    gold: "#FFD700",
    goldDark: "#DAA520",
    glow: "rgba(255,215,0,0.5)",
  },
};

// Rainbow colors for ultimate tower
const RAINBOW = [
  "#FF0000",
  "#FF7F00",
  "#FFFF00",
  "#00FF00",
  "#0000FF",
  "#4B0082",
  "#9400D3",
];

// ---------------------------------------------------------------------------
// TowerRenderer class
// ---------------------------------------------------------------------------
export class TowerRenderer {
  constructor() {
    // base area reference: 40x40 but rendered at a slightly larger footprint
    this._baseW = 40;
    this._baseH = 40;
  }

  /**
   * Draw a tower at center position (x, y).
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} towerType - one of the tower type keys
   * @param {number} x - center X on canvas
   * @param {number} y - center Y on canvas
   * @param {number} level - tower level (1+)
   * @param {number} timestamp - performance.now() for animations
   */
  render(ctx, towerType, x, y, level, timestamp) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));

    // Shadow beneath tower
    this._drawShadow(ctx);

    // Level rings (drawn under the base)
    if (level > 0) {
      this._drawLevelRings(ctx, level, timestamp);
    }

    // Draw the stone/metal base
    this._drawBase(ctx, towerType);

    // Dispatch to specific tower drawing
    const drawFn = this._getDrawFunction(towerType);
    if (drawFn) {
      drawFn.call(this, ctx, timestamp, level);
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Dispatch
  // ---------------------------------------------------------------------------
  _getDrawFunction(type) {
    const map = {
      plus: this._drawPlus,
      minus: this._drawMinus,
      multiply: this._drawMultiply,
      divide: this._drawDivide,
      cannon: this._drawCannon,
      skyDestroyer: this._drawSkyDestroyer,
      ice: this._drawIce,
      meteor: this._drawMeteor,
      poison: this._drawPoison,
      stun: this._drawStun,
      net: this._drawNet,
      laser: this._drawLaser,
      "multi-shot": this._drawMultiShot,
      goldMine: this._drawGoldMine,
      shredder: this._drawShredder,
      repairStation: this._drawRepairStation,
      ultimate: this._drawUltimate,
      golden: this._drawGolden,
      silver: this._drawSilver,
      copper: this._drawCopper,
      transcendent: this._drawTranscendent,
      random_cheap: this._drawRandomCheap,
      random_medium: this._drawRandomMedium,
      random_expensive: this._drawRandomExpensive,
    };
    return map[type] || null;
  }

  // ---------------------------------------------------------------------------
  // Common elements
  // ---------------------------------------------------------------------------

  _drawShadow(ctx) {
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.ellipse(0, 8, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawBase(ctx, towerType) {
    // Isometric-ish stone base: top face + front face + side face
    const hw = 18; // half width
    const hd = 6; // half depth (isometric)
    const bh = 8; // base height

    // Top face (lighter)
    ctx.fillStyle = PAL.baseTop;
    ctx.beginPath();
    ctx.moveTo(-hw, -hd);
    ctx.lineTo(0, -hd - 5);
    ctx.lineTo(hw, -hd);
    ctx.lineTo(0, -hd + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Front face
    ctx.fillStyle = PAL.baseFront;
    ctx.beginPath();
    ctx.moveTo(-hw, -hd);
    ctx.lineTo(0, -hd + 5);
    ctx.lineTo(0, -hd + 5 + bh);
    ctx.lineTo(-hw, -hd + bh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Side face (darker)
    ctx.fillStyle = PAL.baseSide;
    ctx.beginPath();
    ctx.moveTo(0, -hd + 5);
    ctx.lineTo(hw, -hd);
    ctx.lineTo(hw, -hd + bh);
    ctx.lineTo(0, -hd + 5 + bh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _drawLevelRings(ctx, level, ts) {
    const pulse = (Math.sin(ts * 0.003) + 1) / 2;
    const maxRings = Math.min(level, 5);
    for (let i = 0; i < maxRings; i++) {
      const ry = 10 + i * 4;
      const alpha = 0.3 + pulse * 0.25;
      const hue = (ts * 0.05 + i * 60) % 360;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = `hsl(${hue}, 70%, 60%)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, ry, 20 + i * 1.5, 6 + i * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Helper utilities
  // ---------------------------------------------------------------------------

  _pulse01(ts, speed) {
    return (Math.sin(ts * speed) + 1) / 2;
  }

  _drawHexPillar(
    ctx,
    cx,
    cy,
    radius,
    height,
    mainColor,
    darkColor,
    lightColor,
  ) {
    // Draw a hexagonal pillar with 3D isometric look
    const sides = 6;
    const topPoints = [];
    const bottomPoints = [];
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      topPoints.push({
        x: cx + Math.cos(angle) * radius,
        y: cy - height + Math.sin(angle) * radius * 0.5,
      });
      bottomPoints.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius * 0.5,
      });
    }

    // Draw visible faces (front 3 faces)
    for (let i = 0; i < 3; i++) {
      const idx = (i + 2) % sides;
      const nextIdx = (idx + 1) % sides;
      const faceColor = i === 1 ? lightColor : i === 0 ? mainColor : darkColor;
      ctx.fillStyle = faceColor;
      ctx.beginPath();
      ctx.moveTo(bottomPoints[idx].x, bottomPoints[idx].y);
      ctx.lineTo(bottomPoints[nextIdx].x, bottomPoints[nextIdx].y);
      ctx.lineTo(topPoints[nextIdx].x, topPoints[nextIdx].y);
      ctx.lineTo(topPoints[idx].x, topPoints[idx].y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = O;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Top face
    ctx.fillStyle = lightColor;
    ctx.beginPath();
    ctx.moveTo(topPoints[0].x, topPoints[0].y);
    for (let i = 1; i < sides; i++) {
      ctx.lineTo(topPoints[i].x, topPoints[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  _drawSymbolOnPillar(ctx, cx, cy, symbol, color) {
    ctx.save();
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillText(symbol, cx + 1, cy + 1);
    ctx.fillStyle = color;
    ctx.fillText(symbol, cx, cy);
    ctx.restore();
  }

  _drawGlow(ctx, cx, cy, radius, color) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawParticles(ctx, ts, cx, cy, count, spread, color, speed) {
    ctx.save();
    for (let i = 0; i < count; i++) {
      const angle = (ts * speed + i * ((Math.PI * 2) / count)) % (Math.PI * 2);
      const dist = spread * (0.5 + 0.5 * Math.sin(ts * 0.002 + i * 1.7));
      const px = cx + Math.cos(angle) * dist;
      const py =
        cy +
        Math.sin(angle) * dist * 0.5 -
        Math.abs(Math.sin(ts * 0.003 + i)) * 5;
      const size = 1 + Math.sin(ts * 0.005 + i) * 0.5;
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(ts * 0.004 + i * 2);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.5, size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // MATH TOWERS - Crystal pillars with symbols
  // ---------------------------------------------------------------------------

  _drawMathCrystal(ctx, ts, pal, symbol) {
    const p = this._pulse01(ts, 0.003);

    // Glow beneath crystal
    this._drawGlow(ctx, 0, -14, 10 + p * 3, pal.glow);

    // Hexagonal crystal pillar
    this._drawHexPillar(ctx, 0, -6, 8, 22, pal.main, pal.dark, pal.light);

    // Symbol etched on front
    this._drawSymbolOnPillar(ctx, 0, -16, symbol, "#FFFFFF");

    // Crystal tip
    ctx.fillStyle = pal.light;
    ctx.beginPath();
    ctx.moveTo(-4, -28);
    ctx.lineTo(0, -36 - p * 2);
    ctx.lineTo(4, -28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Sparkle at tip
    const sparkAlpha = 0.4 + p * 0.6;
    ctx.save();
    ctx.globalAlpha = sparkAlpha;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(0, -36 - p * 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Floating particles
    this._drawParticles(ctx, ts, 0, -20, 4, 12, pal.light, 0.001);
  }

  _drawPlus(ctx, ts) {
    this._drawMathCrystal(ctx, ts, PAL.plus, "+");
  }

  _drawMinus(ctx, ts) {
    this._drawMathCrystal(ctx, ts, PAL.minus, "\u2212");
  }

  _drawMultiply(ctx, ts) {
    this._drawMathCrystal(ctx, ts, PAL.multiply, "\u00D7");
  }

  _drawDivide(ctx, ts) {
    this._drawMathCrystal(ctx, ts, PAL.divide, "\u00F7");
  }

  // ---------------------------------------------------------------------------
  // CANNON - Dark metal cannon on stone base
  // ---------------------------------------------------------------------------
  _drawCannon(ctx, ts) {
    const pal = PAL.cannon;
    const recoil = Math.sin(ts * 0.005) * 0.5;

    // Cannon mount (cylindrical pedestal)
    ctx.fillStyle = pal.stone;
    ctx.fillRect(-8, -14, 16, 8);
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.strokeRect(-8, -14, 16, 8);

    // Cannon barrel pointing right
    ctx.save();
    ctx.translate(recoil, 0);

    // Barrel body
    ctx.fillStyle = pal.metal;
    ctx.beginPath();
    ctx.moveTo(-6, -22);
    ctx.lineTo(16, -20);
    ctx.lineTo(16, -14);
    ctx.lineTo(-6, -12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Barrel highlight
    ctx.fillStyle = pal.metalLight;
    ctx.fillRect(-4, -21, 18, 3);

    // Barrel mouth
    ctx.fillStyle = pal.metalDark;
    ctx.beginPath();
    ctx.ellipse(16, -17, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#0A0A0A";
    ctx.beginPath();
    ctx.ellipse(16, -17, 2.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Smoke wisps
    const smokePhase = (ts * 0.002) % (Math.PI * 2);
    ctx.save();
    ctx.globalAlpha = 0.2 + 0.1 * Math.sin(smokePhase);
    ctx.fillStyle = "#888888";
    for (let i = 0; i < 3; i++) {
      const sx = 18 + i * 4 + Math.sin(smokePhase + i) * 2;
      const sy = -17 - i * 3 - Math.abs(Math.sin(smokePhase + i * 1.5)) * 3;
      const sr = 2 - i * 0.4;
      if (sr > 0) {
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Rivets
    ctx.fillStyle = pal.metalLight;
    ctx.beginPath();
    ctx.arc(-4, -12, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4, -12, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // SKY DESTROYER - Rocket launcher on platform
  // ---------------------------------------------------------------------------
  _drawSkyDestroyer(ctx, ts) {
    const pal = PAL.skyDestroyer;
    const p = this._pulse01(ts, 0.004);

    // Platform
    ctx.fillStyle = pal.body;
    ctx.fillRect(-12, -12, 24, 6);
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.strokeRect(-12, -12, 24, 6);

    // Missile pod body
    ctx.fillStyle = pal.body;
    ctx.beginPath();
    ctx.moveTo(-8, -12);
    ctx.lineTo(-6, -28);
    ctx.lineTo(6, -28);
    ctx.lineTo(8, -12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Highlight strip
    ctx.fillStyle = pal.metalLight;
    ctx.fillRect(-2, -27, 4, 14);

    // Missile tips (3 tubes)
    for (let i = -1; i <= 1; i++) {
      const mx = i * 5;
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.moveTo(mx - 2, -28);
      ctx.lineTo(mx, -33);
      ctx.lineTo(mx + 2, -28);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = O;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Exhaust ports glow
    ctx.save();
    ctx.globalAlpha = 0.5 + p * 0.5;
    ctx.fillStyle = pal.exhaust;
    ctx.beginPath();
    ctx.ellipse(-4, -7, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(4, -7, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Accent lines
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -18);
    ctx.lineTo(8, -18);
    ctx.stroke();
  }

  // ---------------------------------------------------------------------------
  // ICE - Crystal spire with frost particles
  // ---------------------------------------------------------------------------
  _drawIce(ctx, ts) {
    const pal = PAL.ice;
    const p = this._pulse01(ts, 0.003);

    // Frost glow
    this._drawGlow(ctx, 0, -18, 12 + p * 3, pal.glow);

    // Main crystal - large center shard
    ctx.fillStyle = pal.main;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(-3, -32);
    ctx.lineTo(0, -36 - p * 2);
    ctx.lineTo(3, -32);
    ctx.lineTo(6, -6);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Crystal highlight
    ctx.fillStyle = pal.crystal;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(-2, -10);
    ctx.lineTo(-1, -30);
    ctx.lineTo(1, -28);
    ctx.lineTo(2, -10);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Side shards
    ctx.fillStyle = pal.dark;
    ctx.globalAlpha = 0.8;
    // Left shard
    ctx.beginPath();
    ctx.moveTo(-8, -6);
    ctx.lineTo(-10, -20);
    ctx.lineTo(-5, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Right shard
    ctx.beginPath();
    ctx.moveTo(8, -6);
    ctx.lineTo(10, -22);
    ctx.lineTo(5, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Frost particles
    this._drawParticles(ctx, ts, 0, -20, 6, 14, pal.light, 0.0008);

    // Bright tip
    ctx.save();
    ctx.globalAlpha = 0.6 + p * 0.4;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(0, -36 - p * 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // METEOR - Volcanic pillar with lava veins
  // ---------------------------------------------------------------------------
  _drawMeteor(ctx, ts) {
    const pal = PAL.meteor;
    const p = this._pulse01(ts, 0.004);

    // Magma glow from below
    this._drawGlow(ctx, 0, -8, 14 + p * 4, pal.glow);

    // Dark stone pillar
    ctx.fillStyle = pal.stone;
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.lineTo(-7, -28);
    ctx.lineTo(-2, -34);
    ctx.lineTo(3, -32);
    ctx.lineTo(7, -28);
    ctx.lineTo(9, -4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Lava veins (animated glow)
    ctx.save();
    ctx.globalAlpha = 0.6 + p * 0.4;
    ctx.strokeStyle = pal.lava;
    ctx.lineWidth = 1.5;

    // Vein 1
    ctx.beginPath();
    ctx.moveTo(-5, -6);
    ctx.quadraticCurveTo(-6, -16, -3, -24);
    ctx.stroke();

    // Vein 2
    ctx.beginPath();
    ctx.moveTo(3, -8);
    ctx.quadraticCurveTo(5, -18, 2, -28);
    ctx.stroke();

    // Vein 3
    ctx.strokeStyle = pal.crack;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.quadraticCurveTo(-1, -14, 1, -20);
    ctx.stroke();
    ctx.restore();

    // Magma cracks glowing at top
    ctx.save();
    ctx.globalAlpha = 0.5 + p * 0.5;
    ctx.fillStyle = pal.lava;
    ctx.beginPath();
    ctx.arc(-2, -33, 3 + p, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.crack;
    ctx.beginPath();
    ctx.arc(-2, -33, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Ember particles
    this._drawParticles(ctx, ts, 0, -24, 5, 10, pal.crack, 0.0012);
  }

  // ---------------------------------------------------------------------------
  // POISON - Toxic cauldron on stone
  // ---------------------------------------------------------------------------
  _drawPoison(ctx, ts) {
    const pal = PAL.poison;
    const p = this._pulse01(ts, 0.003);
    const bubblePhase = ts * 0.004;

    // Cauldron body
    ctx.fillStyle = pal.cauldron;
    ctx.beginPath();
    ctx.moveTo(-10, -8);
    ctx.quadraticCurveTo(-12, -18, -8, -22);
    ctx.lineTo(8, -22);
    ctx.quadraticCurveTo(12, -18, 10, -8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Cauldron rim
    ctx.fillStyle = "#5A5A6A";
    ctx.beginPath();
    ctx.ellipse(0, -22, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Green liquid surface
    ctx.fillStyle = pal.liquid;
    ctx.beginPath();
    ctx.ellipse(0, -21, 8, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bubbles
    for (let i = 0; i < 4; i++) {
      const bx = -4 + i * 3 + Math.sin(bubblePhase + i * 1.5) * 2;
      const by = -22 - Math.abs(Math.sin(bubblePhase * 0.7 + i * 2)) * 6;
      const br = 1.5 + Math.sin(bubblePhase + i) * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(bubblePhase + i);
      ctx.fillStyle = pal.bubble;
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(0.5, br), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Rising fumes
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const fx = -3 + i * 3 + Math.sin(ts * 0.002 + i * 2) * 3;
      const fy = -26 - ((ts * 0.02 + i * 50) % 18);
      const fa = 0.25 * (1 - ((ts * 0.02 + i * 50) % 18) / 18);
      ctx.globalAlpha = Math.max(0, fa);
      ctx.fillStyle = pal.fume;
      ctx.beginPath();
      ctx.arc(fx, fy, 3 + Math.sin(ts * 0.003 + i) * 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Cauldron legs
    ctx.fillStyle = pal.cauldron;
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.fillRect(-9, -8, 3, 4);
    ctx.strokeRect(-9, -8, 3, 4);
    ctx.fillRect(6, -8, 3, 4);
    ctx.strokeRect(6, -8, 3, 4);
  }

  // ---------------------------------------------------------------------------
  // STUN - Tesla coil with electric arcs
  // ---------------------------------------------------------------------------
  _drawStun(ctx, ts) {
    const pal = PAL.stun;
    const p = this._pulse01(ts, 0.005);

    // Metal base cylinder
    ctx.fillStyle = pal.metal;
    ctx.beginPath();
    ctx.ellipse(0, -8, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-8, -10, 16, 4);
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.strokeRect(-8, -10, 16, 4);

    // Central rod
    ctx.fillStyle = pal.rod;
    ctx.fillRect(-2, -34, 4, 26);
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-2, -34, 4, 26);

    // Metal rings on rod
    ctx.fillStyle = pal.metal;
    ctx.fillRect(-3, -16, 6, 2);
    ctx.fillRect(-3, -24, 6, 2);

    // Sphere at top
    ctx.fillStyle = pal.rod;
    ctx.beginPath();
    ctx.arc(0, -36, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Highlight on sphere
    ctx.fillStyle = "#FFFFFF";
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(-1, -37, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Electric arcs (animated)
    ctx.save();
    ctx.strokeStyle = pal.arc;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5 + p * 0.5;

    for (let i = 0; i < 3; i++) {
      const arcAngle = (ts * 0.008 + (i * Math.PI * 2) / 3) % (Math.PI * 2);
      const endX = Math.cos(arcAngle) * (10 + p * 4);
      const endY = -34 + Math.sin(arcAngle) * 4;
      const midX = endX * 0.5 + Math.sin(ts * 0.02 + i) * 4;
      const midY = -35 + Math.cos(ts * 0.015 + i * 2) * 3;

      ctx.beginPath();
      ctx.moveTo(0, -36);
      ctx.quadraticCurveTo(midX, midY, endX, endY);
      ctx.stroke();
    }
    ctx.restore();

    // Glow
    this._drawGlow(ctx, 0, -36, 6 + p * 3, pal.glow);
  }

  // ---------------------------------------------------------------------------
  // NET - Spider web launcher
  // ---------------------------------------------------------------------------
  _drawNet(ctx, ts) {
    const pal = PAL.net;
    const wobble = Math.sin(ts * 0.003) * 0.5;

    // Dark mechanism body
    ctx.fillStyle = pal.body;
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.lineTo(-6, -24);
    ctx.lineTo(6, -24);
    ctx.lineTo(8, -8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Web strands extending from top
    ctx.save();
    ctx.strokeStyle = pal.web;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.7;

    const cx = 0,
      cy = -24;
    // Radial strands
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4 + wobble * 0.1;
      const len = 10 + Math.sin(ts * 0.002 + i) * 2;
      const ex = cx + Math.cos(angle) * len;
      const ey = cy + Math.sin(angle) * len * 0.6 - 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    // Concentric web rings
    ctx.strokeStyle = pal.webDark;
    ctx.lineWidth = 0.5;
    for (let r = 1; r <= 2; r++) {
      ctx.beginPath();
      const ringR = r * 4;
      ctx.ellipse(cx, cy - 4, ringR, ringR * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Mechanical details
    ctx.fillStyle = pal.accent;
    ctx.fillRect(-4, -14, 8, 3);
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-4, -14, 8, 3);

    // Side nozzles
    ctx.fillStyle = pal.body;
    ctx.fillRect(-10, -20, 4, 4);
    ctx.fillRect(6, -20, 4, 4);
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-10, -20, 4, 4);
    ctx.strokeRect(6, -20, 4, 4);
  }

  // ---------------------------------------------------------------------------
  // LASER - Energy beam emitter with rotating crystal
  // ---------------------------------------------------------------------------
  _drawLaser(ctx, ts) {
    const pal = PAL.laser;
    const rotation = (ts * 0.003) % (Math.PI * 2);
    const p = this._pulse01(ts, 0.004);

    // Device body
    ctx.fillStyle = pal.body;
    ctx.beginPath();
    ctx.moveTo(-7, -8);
    ctx.lineTo(-5, -22);
    ctx.lineTo(5, -22);
    ctx.lineTo(7, -8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Gold accent ring
    ctx.fillStyle = pal.crystal;
    ctx.beginPath();
    ctx.ellipse(0, -22, 6, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Rotating crystal above
    ctx.save();
    ctx.translate(0, -28);
    ctx.rotate(rotation);

    // Diamond-shaped crystal
    ctx.fillStyle = pal.crystal;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 0);
    ctx.lineTo(0, 6);
    ctx.lineTo(-4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Crystal highlight
    ctx.fillStyle = "#FFFFFF";
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(2, 0);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();

    // Golden glow
    this._drawGlow(ctx, 0, -28, 8 + p * 4, pal.glow);

    // Energy particles circling
    this._drawParticles(ctx, ts, 0, -28, 5, 10, pal.beam, 0.002);
  }

  // ---------------------------------------------------------------------------
  // MULTI-SHOT - Crossbow turret with multiple barrels
  // ---------------------------------------------------------------------------
  _drawMultiShot(ctx, ts) {
    const pal = PAL.multiShot;
    const p = this._pulse01(ts, 0.003);

    // Turret base
    ctx.fillStyle = pal.body;
    ctx.fillRect(-9, -12, 18, 6);
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.strokeRect(-9, -12, 18, 6);

    // Main turret body
    ctx.fillStyle = pal.body;
    ctx.beginPath();
    ctx.moveTo(-7, -12);
    ctx.lineTo(-6, -26);
    ctx.lineTo(6, -26);
    ctx.lineTo(7, -12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Multiple barrel slots (crossbow arms)
    ctx.fillStyle = pal.barrel;
    // Left arm
    ctx.beginPath();
    ctx.moveTo(-6, -22);
    ctx.lineTo(-14, -26);
    ctx.lineTo(-14, -24);
    ctx.lineTo(-6, -20);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Right arm
    ctx.beginPath();
    ctx.moveTo(6, -22);
    ctx.lineTo(14, -26);
    ctx.lineTo(14, -24);
    ctx.lineTo(6, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Bolt tips (blue)
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.arc(-14, -25, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(14, -25, 2, 0, Math.PI * 2);
    ctx.fill();

    // Center scope
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.arc(0, -26, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Scope crosshair
    ctx.strokeStyle = pal.bolt;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-2, -26);
    ctx.lineTo(2, -26);
    ctx.moveTo(0, -28);
    ctx.lineTo(0, -24);
    ctx.stroke();

    // Blue accent line
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6, -17);
    ctx.lineTo(6, -17);
    ctx.stroke();
  }

  // ---------------------------------------------------------------------------
  // GOLD MINE - Minecart with gold nuggets
  // ---------------------------------------------------------------------------
  _drawGoldMine(ctx, ts) {
    const pal = PAL.goldMine;
    const p = this._pulse01(ts, 0.002);

    // Wooden frame
    ctx.fillStyle = pal.wood;
    // Left post
    ctx.fillRect(-10, -28, 3, 22);
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-10, -28, 3, 22);
    // Right post
    ctx.fillRect(7, -28, 3, 22);
    ctx.strokeRect(7, -28, 3, 22);
    // Top beam
    ctx.fillRect(-10, -30, 20, 3);
    ctx.strokeRect(-10, -30, 20, 3);

    // Minecart
    ctx.fillStyle = pal.cart;
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.lineTo(-6, -16);
    ctx.lineTo(6, -16);
    ctx.lineTo(8, -8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Cart wheels
    ctx.fillStyle = "#5A5A6A";
    ctx.beginPath();
    ctx.arc(-5, -7, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(5, -7, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(-5, -7, 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(5, -7, 2, 0, Math.PI * 2);
    ctx.stroke();

    // Gold nuggets in cart
    const nuggets = [
      { x: -3, y: -15, s: 3 },
      { x: 2, y: -14, s: 2.5 },
      { x: 0, y: -16, s: 2 },
      { x: -1, y: -13, s: 2.5 },
    ];
    nuggets.forEach((n) => {
      ctx.fillStyle = pal.gold;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.goldDark;
      ctx.beginPath();
      ctx.arc(n.x + 0.5, n.y + 0.5, n.s * 0.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Sparkle on gold
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const sx = -3 + i * 3;
      const sy = -17 - Math.abs(Math.sin(ts * 0.003 + i * 2)) * 4;
      const sa = 0.4 + 0.5 * Math.sin(ts * 0.005 + i * 1.5);
      ctx.globalAlpha = Math.max(0, sa);
      ctx.fillStyle = pal.sparkle;
      ctx.beginPath();
      ctx.arc(sx, sy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Rope/chain from top beam
    ctx.strokeStyle = "#8B7355";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, -27);
    ctx.lineTo(0, -18);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---------------------------------------------------------------------------
  // SHREDDER - Spinning sawblade mechanism
  // ---------------------------------------------------------------------------
  _drawShredder(ctx, ts) {
    const pal = PAL.shredder;
    const rotation = (ts * 0.008) % (Math.PI * 2);

    // Pole
    ctx.fillStyle = pal.pole;
    ctx.fillRect(-2, -28, 4, 22);
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-2, -28, 4, 22);

    // Pole rings
    ctx.fillStyle = pal.bladeDark;
    ctx.fillRect(-3, -12, 6, 2);
    ctx.fillRect(-3, -20, 6, 2);

    // Spinning sawblade
    ctx.save();
    ctx.translate(0, -32);
    ctx.rotate(rotation);

    // Blade disc
    ctx.fillStyle = pal.blade;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Blade teeth
    const teeth = 8;
    ctx.fillStyle = pal.bladeDark;
    for (let i = 0; i < teeth; i++) {
      const tAngle = (i * Math.PI * 2) / teeth;
      const tx = Math.cos(tAngle) * 8;
      const ty = Math.sin(tAngle) * 8;
      const nx = Math.cos(tAngle) * 12;
      const ny = Math.sin(tAngle) * 12;
      ctx.beginPath();
      ctx.moveTo(tx - 1.5, ty - 1.5);
      ctx.lineTo(nx, ny);
      ctx.lineTo(tx + 1.5, ty + 1.5);
      ctx.closePath();
      ctx.fill();
    }

    // Center hub
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Metal sheen (highlight arc)
    ctx.strokeStyle = "#FFFFFF";
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 7, -0.5, 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // REPAIR STATION - Workshop with anvil + hammer
  // ---------------------------------------------------------------------------
  _drawRepairStation(ctx, ts) {
    const pal = PAL.repairStation;
    const hammerSwing = Math.sin(ts * 0.006) * 0.4;
    const p = this._pulse01(ts, 0.003);

    // Warm glow
    this._drawGlow(ctx, 0, -16, 14 + p * 3, pal.glow);

    // Wooden workbench
    ctx.fillStyle = pal.wood;
    ctx.fillRect(-12, -12, 24, 6);
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.strokeRect(-12, -12, 24, 6);

    // Bench legs
    ctx.fillRect(-10, -8, 3, 4);
    ctx.fillRect(7, -8, 3, 4);

    // Anvil
    ctx.fillStyle = pal.anvil;
    // Anvil body
    ctx.beginPath();
    ctx.moveTo(-6, -12);
    ctx.lineTo(-8, -18);
    ctx.lineTo(-3, -20);
    ctx.lineTo(3, -20);
    ctx.lineTo(8, -18);
    ctx.lineTo(6, -12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Anvil top surface
    ctx.fillStyle = pal.anvilDark;
    ctx.beginPath();
    ctx.moveTo(-8, -18);
    ctx.lineTo(-3, -20);
    ctx.lineTo(3, -20);
    ctx.lineTo(8, -18);
    ctx.lineTo(5, -16);
    ctx.lineTo(-5, -16);
    ctx.closePath();
    ctx.fill();

    // Horn
    ctx.fillStyle = pal.anvil;
    ctx.beginPath();
    ctx.moveTo(3, -19);
    ctx.lineTo(10, -17);
    ctx.lineTo(3, -17);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Hammer (animated swing)
    ctx.save();
    ctx.translate(-2, -20);
    ctx.rotate(hammerSwing);

    // Hammer handle
    ctx.fillStyle = pal.hammer;
    ctx.fillRect(-1, -16, 2, 12);
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.6;
    ctx.strokeRect(-1, -16, 2, 12);

    // Hammer head
    ctx.fillStyle = pal.anvil;
    ctx.fillRect(-4, -20, 8, 5);
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-4, -20, 8, 5);

    ctx.restore();

    // Healing particles (green sparkles)
    this._drawParticles(ctx, ts, 0, -22, 5, 16, "#66FF66", 0.001);
  }

  // ---------------------------------------------------------------------------
  // ULTIMATE - Rainbow crystal fortress
  // ---------------------------------------------------------------------------
  _drawUltimate(ctx, ts) {
    const rotation = (ts * 0.002) % (Math.PI * 2);
    const p = this._pulse01(ts, 0.003);

    // Rainbow glow
    const hue = (ts * 0.1) % 360;
    this._drawGlow(ctx, 0, -20, 16 + p * 5, `hsla(${hue}, 80%, 60%, 0.4)`);

    // Multi-color prism body
    ctx.save();
    ctx.translate(0, -20);
    ctx.rotate(rotation);

    // Draw prism (octagonal)
    const sides = 8;
    const radius = 10;
    for (let i = 0; i < sides; i++) {
      const a1 = (i * Math.PI * 2) / sides;
      const a2 = ((i + 1) * Math.PI * 2) / sides;
      const color = RAINBOW[i % RAINBOW.length];

      // Side face
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a1) * radius, Math.sin(a1) * radius * 0.5);
      ctx.lineTo(Math.cos(a2) * radius, Math.sin(a2) * radius * 0.5);
      ctx.lineTo(Math.cos(a2) * radius * 0.6, Math.sin(a2) * radius * 0.3 - 14);
      ctx.lineTo(Math.cos(a1) * radius * 0.6, Math.sin(a1) * radius * 0.3 - 14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = O;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Crystal tip
    ctx.fillStyle = "#FFFFFF";
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    for (let i = 0; i < sides; i++) {
      const a = (i * Math.PI * 2) / sides;
      ctx.lineTo(Math.cos(a) * radius * 0.6, Math.sin(a) * radius * 0.3 - 14);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();

    // Star particles
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const starAngle = (ts * 0.001 + (i * Math.PI) / 4) % (Math.PI * 2);
      const dist = 14 + Math.sin(ts * 0.003 + i * 1.3) * 4;
      const sx = Math.cos(starAngle) * dist;
      const sy = -20 + Math.sin(starAngle) * dist * 0.4;
      const sa = 0.3 + 0.5 * Math.sin(ts * 0.005 + i * 2);
      ctx.globalAlpha = sa;
      ctx.fillStyle = RAINBOW[i % RAINBOW.length];
      this._drawStarShape(ctx, sx, sy, 4, 2, 0.5);
    }
    ctx.restore();
  }

  _drawStarShape(ctx, cx, cy, outerR, innerR, points) {
    const spikes = 4;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / spikes - Math.PI / 2;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // GOLDEN - Golden crown pedestal
  // ---------------------------------------------------------------------------
  _drawGolden(ctx, ts) {
    const pal = PAL.golden;
    const p = this._pulse01(ts, 0.003);

    // Radiant glow
    this._drawGlow(ctx, 0, -20, 14 + p * 5, pal.glow);

    // Ornate pedestal
    ctx.fillStyle = pal.main;
    ctx.beginPath();
    ctx.moveTo(-7, -6);
    ctx.lineTo(-5, -18);
    ctx.lineTo(5, -18);
    ctx.lineTo(7, -6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pedestal ornamentation
    ctx.fillStyle = pal.dark;
    ctx.fillRect(-4, -14, 8, 2);
    ctx.fillRect(-3, -10, 6, 1);

    // Crown
    ctx.fillStyle = pal.main;
    ctx.beginPath();
    ctx.moveTo(-8, -18);
    ctx.lineTo(-9, -28);
    ctx.lineTo(-5, -24);
    ctx.lineTo(-2, -30);
    ctx.lineTo(0, -24);
    ctx.lineTo(2, -32);
    ctx.lineTo(4, -24);
    ctx.lineTo(7, -30);
    ctx.lineTo(9, -24);
    ctx.lineTo(10, -28);
    ctx.lineTo(8, -18);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Crown band
    ctx.fillStyle = pal.dark;
    ctx.fillRect(-8, -20, 16, 3);
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-8, -20, 16, 3);

    // Jewels on crown
    const jewels = [
      { x: -5, y: -25, c: "#FF0000" },
      { x: 0, y: -27, c: "#0000FF" },
      { x: 5, y: -25, c: "#00FF00" },
    ];
    jewels.forEach((j) => {
      ctx.fillStyle = j.c;
      ctx.beginPath();
      ctx.arc(j.x, j.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(j.x - 0.5, j.y - 0.5, 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Radiant sparkles
    this._drawParticles(ctx, ts, 0, -24, 6, 14, pal.light, 0.0008);
  }

  // ---------------------------------------------------------------------------
  // SILVER - Silver moon shrine
  // ---------------------------------------------------------------------------
  _drawSilver(ctx, ts) {
    const pal = PAL.silver;
    const p = this._pulse01(ts, 0.002);

    // Moonlight glow
    this._drawGlow(ctx, 0, -28, 12 + p * 4, pal.glow);

    // Silver column
    ctx.fillStyle = pal.main;
    ctx.fillRect(-4, -6, 8, -20);
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.strokeRect(-4, -26, 8, 20);

    // Column details
    ctx.fillStyle = pal.dark;
    ctx.fillRect(-5, -8, 10, 3);
    ctx.fillRect(-5, -26, 10, 2);
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-5, -8, 10, 3);
    ctx.strokeRect(-5, -26, 10, 2);

    // Column fluting lines
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 0.4;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(-2, -8);
    ctx.lineTo(-2, -24);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, -24);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(2, -8);
    ctx.lineTo(2, -24);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Crescent moon at top
    ctx.fillStyle = pal.moon;
    ctx.beginPath();
    ctx.arc(0, -32, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Moon cutout (to create crescent)
    ctx.fillStyle = PAL.baseDark;
    ctx.beginPath();
    ctx.arc(3, -33, 5.5, 0, Math.PI * 2);
    ctx.fill();

    // Re-stroke the outer moon
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, -32, 7, 0, Math.PI * 2);
    ctx.stroke();

    // Moonlight rays
    ctx.save();
    ctx.globalAlpha = 0.15 + p * 0.15;
    ctx.strokeStyle = pal.light;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + ts * 0.0005;
      const rx = Math.cos(angle) * 14;
      const ry = -32 + Math.sin(angle) * 8;
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(rx, ry);
      ctx.stroke();
    }
    ctx.restore();

    // Silver dust particles
    this._drawParticles(ctx, ts, 0, -30, 4, 12, pal.light, 0.0006);
  }

  // ---------------------------------------------------------------------------
  // COPPER - Copper flame brazier
  // ---------------------------------------------------------------------------
  _drawCopper(ctx, ts) {
    const pal = PAL.copper;
    const p = this._pulse01(ts, 0.004);

    // Warm glow
    this._drawGlow(ctx, 0, -22, 12 + p * 4, pal.glow);

    // Copper bowl / brazier
    ctx.fillStyle = pal.main;
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.quadraticCurveTo(-12, -18, -8, -22);
    ctx.lineTo(8, -22);
    ctx.quadraticCurveTo(12, -18, 10, -10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Copper highlight
    ctx.fillStyle = pal.light;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(-8, -12);
    ctx.quadraticCurveTo(-9, -18, -6, -20);
    ctx.lineTo(-4, -20);
    ctx.quadraticCurveTo(-5, -16, -5, -12);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Bowl rim
    ctx.fillStyle = pal.dark;
    ctx.beginPath();
    ctx.ellipse(0, -22, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Eternal flame
    const flamePhase = ts * 0.006;
    for (let i = 0; i < 5; i++) {
      const fx = Math.sin(flamePhase + i * 1.2) * 3;
      const fy = -24 - i * 3 - Math.abs(Math.sin(flamePhase * 0.8 + i)) * 3;
      const fs = 4 - i * 0.7;
      if (fs <= 0) continue;

      // Outer flame
      ctx.save();
      ctx.globalAlpha = 0.7 - i * 0.1;
      ctx.fillStyle = i < 2 ? pal.flame : "#FF8C00";
      ctx.beginPath();
      ctx.arc(fx, fy, fs, 0, Math.PI * 2);
      ctx.fill();

      // Inner flame
      if (i < 3) {
        ctx.fillStyle = "#FFCC00";
        ctx.beginPath();
        ctx.arc(fx, fy, fs * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Core
      if (i === 0) {
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(fx, fy + 1, fs * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Copper patina/age detail
    ctx.fillStyle = "#5F8F4F";
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.arc(-6, -14, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4, -16, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Brazier legs
    ctx.fillStyle = pal.dark;
    ctx.strokeStyle = O;
    ctx.lineWidth = 0.8;
    // Left leg
    ctx.beginPath();
    ctx.moveTo(-8, -10);
    ctx.lineTo(-10, -4);
    ctx.lineTo(-7, -4);
    ctx.lineTo(-6, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Right leg
    ctx.beginPath();
    ctx.moveTo(6, -10);
    ctx.lineTo(7, -4);
    ctx.lineTo(10, -4);
    ctx.lineTo(8, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ---------------------------------------------------------------------------
  // TRANSCENDENT - Cosmic portal tower
  // ---------------------------------------------------------------------------
  _drawTranscendent(ctx, ts) {
    const pal = PAL.transcendent;
    const rotation = (ts * 0.001) % (Math.PI * 2);
    const p = this._pulse01(ts, 0.002);

    // Cosmic glow (large and pulsing)
    ctx.save();
    const glowR = 18 + p * 8;
    const gradient = ctx.createRadialGradient(0, -22, 0, 0, -22, glowR);
    gradient.addColorStop(0, "rgba(75,0,130,0.5)");
    gradient.addColorStop(0.4, "rgba(138,43,226,0.25)");
    gradient.addColorStop(0.7, "rgba(0,206,209,0.12)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, -22, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Portal ring stand
    ctx.fillStyle = pal.core;
    ctx.fillRect(-3, -6, 6, -10);
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.strokeRect(-3, -16, 6, 10);

    // Swirling galaxy portal
    ctx.save();
    ctx.translate(0, -26);

    // Portal outer ring
    ctx.strokeStyle = pal.nebula1;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();

    // Inner swirl (multiple rotating arcs in nebula colors)
    const nebulaColors = [pal.nebula1, pal.nebula2, pal.nebula3];
    for (let i = 0; i < 6; i++) {
      const startAngle = rotation + (i * Math.PI) / 3;
      const arcLen = Math.PI * 0.5 + Math.sin(ts * 0.003 + i) * 0.3;
      const r = 4 + (i % 3) * 3;

      ctx.save();
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(ts * 0.004 + i * 1.5);
      ctx.strokeStyle = nebulaColors[i % 3];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r, startAngle, startAngle + arcLen);
      ctx.stroke();
      ctx.restore();
    }

    // Central core (bright)
    ctx.fillStyle = "#FFFFFF";
    ctx.globalAlpha = 0.6 + p * 0.4;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();

    // Cosmic particles (stars)
    ctx.save();
    for (let i = 0; i < 10; i++) {
      const starAngle = (ts * 0.0008 + (i * Math.PI) / 5) % (Math.PI * 2);
      const dist = 8 + i * 2 + Math.sin(ts * 0.002 + i * 1.7) * 3;
      const sx = Math.cos(starAngle) * dist;
      const sy = -26 + Math.sin(starAngle) * dist * 0.4;
      const sa = 0.3 + 0.5 * Math.sin(ts * 0.006 + i * 2.3);
      const sc = nebulaColors[i % 3];
      ctx.globalAlpha = Math.max(0.05, sa);
      ctx.fillStyle = sc;
      ctx.beginPath();
      ctx.arc(sx, sy, 1 + Math.sin(ts * 0.004 + i) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // RANDOM BOX towers
  // ---------------------------------------------------------------------------

  _drawRandomBox(
    ctx,
    ts,
    pal,
    symbol,
    hasGlow,
    glowColor,
    boxColor,
    bandColor,
  ) {
    const wobble = Math.sin(ts * 0.005) * 1.5;

    if (hasGlow && glowColor) {
      this._drawGlow(ctx, 0, -16, 12 + this._pulse01(ts, 0.004) * 3, glowColor);
    }

    ctx.save();
    ctx.translate(0, wobble);

    // Box front face
    ctx.fillStyle = boxColor;
    ctx.beginPath();
    ctx.moveTo(-10, -6);
    ctx.lineTo(-10, -24);
    ctx.lineTo(10, -24);
    ctx.lineTo(10, -6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Box top face (isometric)
    const topDark = bandColor;
    ctx.fillStyle = topDark;
    ctx.beginPath();
    ctx.moveTo(-10, -24);
    ctx.lineTo(-5, -28);
    ctx.lineTo(15, -28);
    ctx.lineTo(10, -24);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Box side face
    ctx.fillStyle = pal[Object.keys(pal)[1]] || boxColor;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(10, -24);
    ctx.lineTo(15, -28);
    ctx.lineTo(15, -10);
    ctx.lineTo(10, -6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Metal bands
    ctx.fillStyle = bandColor;
    ctx.fillRect(-10, -18, 20, 2);
    ctx.fillRect(-10, -12, 20, 2);

    // Symbol on front
    ctx.save();
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillText(symbol, 1, -14);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(symbol, 0, -15);
    ctx.restore();

    ctx.restore();
  }

  _drawRandomCheap(ctx, ts) {
    const pal = PAL.randomCheap;
    this._drawRandomBox(ctx, ts, pal, "?", false, null, pal.wood, pal.band);
  }

  _drawRandomMedium(ctx, ts) {
    const pal = PAL.randomMedium;
    this._drawRandomBox(
      ctx,
      ts,
      pal,
      "?",
      true,
      pal.glow,
      pal.metal,
      pal.metalDark,
    );

    // Purple sparkles
    this._drawParticles(ctx, ts, 0, -16, 3, 14, "#8000FF", 0.001);
  }

  _drawRandomExpensive(ctx, ts) {
    const pal = PAL.randomExpensive;
    this._drawRandomBox(
      ctx,
      ts,
      pal,
      "!",
      true,
      pal.glow,
      pal.gold,
      pal.goldDark,
    );

    // Intense sparkle
    this._drawParticles(ctx, ts, 0, -16, 6, 16, "#FFFACD", 0.0015);
  }
}
