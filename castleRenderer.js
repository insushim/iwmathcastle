// castleRenderer.js - Medieval Castle Renderer
// Canvas 2D primitives only (fillRect, arc, beginPath/lineTo, quadraticCurveTo)
// Tower defense game "Math Castle Guardian" - player's base

// ============================================================
// Color Palette
// ============================================================
const C = {
  // Stone walls
  wallBase: "#4A4A5A",
  wallLight: "#5A5A6A",
  wallDark: "#3A3A4A",
  wallHighlight: "#6A6A7A",
  wallShadow: "#2E2E3E",

  // Roof / top accents
  roof: "#2A2040",
  roofLight: "#3A3060",

  // Banner
  bannerGold: "#FFD700",
  bannerPurple: "#4A3B8F",
  bannerPurpleDark: "#332A6B",
  bannerPole: "#8B7355",

  // Window glow
  windowGlow: "#FFB84D",
  windowGlowBright: "#FFD080",
  windowGlowDim: "#CC8833",
  windowFrame: "#2A2A3A",

  // Gate
  gateDark: "#1A1A2A",
  gateFrame: "#3A3A4A",
  portcullis: "#5A5A6A",

  // Torch / fire
  flameOuter: "#FF6600",
  flameInner: "#FFCC00",
  flameCore: "#FFFFFF",
  emberGlow: "rgba(255,100,0,0.3)",

  // Damage
  crack: "#1A1A2A",
  smoke: "rgba(60,60,60,0.5)",
  fireRed: "#FF3300",
  fireDamage: "rgba(255,50,0,0.15)",

  // Outline
  outline: "#1A1A2E",
};

// ============================================================
// Utility
// ============================================================
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Seeded pseudo-random for consistent crack patterns per HP level
function seededRand(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ============================================================
// CastleRenderer
// ============================================================
export class CastleRenderer {
  constructor() {
    this._width = 120;
    this._height = 140;

    // Pre-generate crack patterns for different damage levels
    this._cracks = this._generateCracks();

    // Debris particles (persistent across frames)
    this._debris = [];
    this._smokeParticles = [];
    this._lastTimestamp = 0;

    // Offscreen canvas cache: one per damage tier (0-3)
    this._cachedTier = new Map();
    this._cacheCanvas = null;
  }

  get width() {
    return this._width;
  }

  get height() {
    return this._height;
  }

  // ----------------------------------------------------------
  // Main render entry point
  // ----------------------------------------------------------
  render(ctx, x, y, hp, maxHp, timestamp) {
    const hpRatio = Math.max(0, Math.min(1, hp / maxHp));
    const dt =
      this._lastTimestamp > 0
        ? (timestamp - this._lastTimestamp) / 1000
        : 0.016;
    this._lastTimestamp = timestamp;

    ctx.save();
    ctx.translate(x, y);

    // Determine damage tier
    // 0 = healthy (100-70%), 1 = damaged (70-40%), 2 = heavy (40-10%), 3 = critical (<10%)
    const tier = hpRatio > 0.7 ? 0 : hpRatio > 0.4 ? 1 : hpRatio > 0.1 ? 2 : 3;

    // Draw cached static castle structure (or build cache on first call / tier change)
    const cached = this._getCachedCastle(tier);
    ctx.drawImage(cached, 0, 0);

    // Draw animated overlays on top of cached structure
    this._drawWindows(ctx, timestamp, tier);
    this._drawTorches(ctx, timestamp, tier);
    this._drawFlag(ctx, timestamp, tier);

    // Animated damage effects
    if (tier >= 2) {
      this._updateAndDrawDebris(ctx, dt, tier);
    }
    if (tier >= 1) {
      this._drawSmoke(ctx, timestamp, tier);
    }
    if (tier === 3) {
      this._drawFireDamage(ctx, timestamp);
    }

    ctx.restore();
  }

  // ----------------------------------------------------------
  // Offscreen canvas cache for static castle structure
  // ----------------------------------------------------------
  _getCachedCastle(tier) {
    if (this._cachedTier.has(tier)) {
      return this._cachedTier.get(tier);
    }

    // Create offscreen canvas and render static parts
    const offscreen = document.createElement("canvas");
    offscreen.width = this._width;
    offscreen.height = this._height;
    const offCtx = offscreen.getContext("2d");

    // Background damage tint for heavy damage
    if (tier >= 2) {
      const intensity = tier === 3 ? 0.18 : 0.08;
      offCtx.fillStyle = `rgba(255,30,0,${intensity})`;
      offCtx.fillRect(0, 0, this._width, this._height);
    }

    // Draw all static castle components
    this._drawBase(offCtx, tier);
    this._drawGate(offCtx, tier);
    this._drawWalls(offCtx, tier);
    this._drawKeep(offCtx, tier);
    this._drawLeftTurret(offCtx, tier);
    this._drawRightTurret(offCtx, tier);
    this._drawCrenellations(offCtx, tier);
    this._drawStoneTexture(offCtx, tier);

    // Cracks are also static (pre-generated patterns)
    if (tier >= 1) {
      this._drawCracks(offCtx, tier);
    }

    this._cachedTier.set(tier, offscreen);
    return offscreen;
  }

  /**
   * Invalidate the cache (call when castle takes damage that changes tier).
   */
  invalidateCache() {
    this._cachedTier.clear();
  }

  // ----------------------------------------------------------
  // Base / foundation
  // ----------------------------------------------------------
  _drawBase(ctx, tier) {
    // Foundation stone
    ctx.fillStyle = C.wallDark;
    ctx.fillRect(8, 125, 104, 15);

    // Outline
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(8, 125, 104, 15);

    // Stone lines on foundation
    ctx.strokeStyle = C.wallShadow;
    ctx.lineWidth = 0.5;
    for (let bx = 12; bx < 108; bx += 14) {
      ctx.beginPath();
      ctx.moveTo(bx, 126);
      ctx.lineTo(bx, 139);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(9, 133);
    ctx.lineTo(111, 133);
    ctx.stroke();
  }

  // ----------------------------------------------------------
  // Gate (arched entrance)
  // ----------------------------------------------------------
  _drawGate(ctx, tier) {
    const gateX = 42;
    const gateY = 100;
    const gateW = 36;
    const gateH = 25;

    // Gate shadow/interior
    ctx.fillStyle = C.gateDark;
    ctx.beginPath();
    ctx.moveTo(gateX, gateY + gateH);
    ctx.lineTo(gateX, gateY + 8);
    ctx.quadraticCurveTo(gateX, gateY, gateX + gateW / 2, gateY - 2);
    ctx.quadraticCurveTo(gateX + gateW, gateY, gateX + gateW, gateY + 8);
    ctx.lineTo(gateX + gateW, gateY + gateH);
    ctx.closePath();
    ctx.fill();

    // Gate frame
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gateX, gateY + gateH);
    ctx.lineTo(gateX, gateY + 8);
    ctx.quadraticCurveTo(gateX, gateY, gateX + gateW / 2, gateY - 2);
    ctx.quadraticCurveTo(gateX + gateW, gateY, gateX + gateW, gateY + 8);
    ctx.lineTo(gateX + gateW, gateY + gateH);
    ctx.stroke();

    // Portcullis lines (vertical bars)
    ctx.strokeStyle = C.portcullis;
    ctx.lineWidth = 1.5;
    for (let px = gateX + 5; px < gateX + gateW - 3; px += 6) {
      ctx.beginPath();
      ctx.moveTo(px, gateY + gateH);
      // Approximate the arch top for each bar
      const t = (px - gateX) / gateW;
      const archY = gateY + 8 - Math.sin(t * Math.PI) * 10;
      ctx.lineTo(px, archY);
      ctx.stroke();
    }
    // Horizontal portcullis bars
    ctx.lineWidth = 1;
    for (let py = gateY + 6; py < gateY + gateH; py += 7) {
      ctx.beginPath();
      ctx.moveTo(gateX + 3, py);
      ctx.lineTo(gateX + gateW - 3, py);
      ctx.stroke();
    }
  }

  // ----------------------------------------------------------
  // Connecting walls
  // ----------------------------------------------------------
  _drawWalls(ctx, tier) {
    // Left wall (between left turret and keep)
    ctx.fillStyle = C.wallBase;
    ctx.fillRect(15, 80, 25, 45);
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(15, 80, 25, 45);

    // Right wall (between keep and right turret)
    ctx.fillStyle = C.wallBase;
    ctx.fillRect(80, 80, 25, 45);
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(80, 80, 25, 45);
  }

  // ----------------------------------------------------------
  // Central Keep (tallest tower)
  // ----------------------------------------------------------
  _drawKeep(ctx, tier) {
    const kx = 32;
    const ky = 25;
    const kw = 56;
    const kh = 100;

    // Main body
    ctx.fillStyle = C.wallBase;
    ctx.fillRect(kx, ky, kw, kh);

    // Slightly lighter center strip for depth
    ctx.fillStyle = C.wallLight;
    ctx.fillRect(kx + 8, ky, kw - 16, kh);

    // Dark edges for depth
    ctx.fillStyle = C.wallDark;
    ctx.fillRect(kx, ky, 4, kh);
    ctx.fillRect(kx + kw - 4, ky, 4, kh);

    // Roof cap (pointed)
    ctx.fillStyle = C.roof;
    ctx.beginPath();
    ctx.moveTo(kx - 2, ky + 2);
    ctx.lineTo(kx + kw / 2, ky - 12);
    ctx.lineTo(kx + kw + 2, ky + 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(kx - 2, ky + 2);
    ctx.lineTo(kx + kw / 2, ky - 12);
    ctx.lineTo(kx + kw + 2, ky + 2);
    ctx.closePath();
    ctx.stroke();

    // Outline main body
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(kx, ky, kw, kh);
  }

  // ----------------------------------------------------------
  // Left turret
  // ----------------------------------------------------------
  _drawLeftTurret(ctx, tier) {
    const tx = 5;
    const ty = 55;
    const tw = 22;
    const th = 70;

    // Body
    ctx.fillStyle = C.wallBase;
    ctx.fillRect(tx, ty, tw, th);
    ctx.fillStyle = C.wallLight;
    ctx.fillRect(tx + 4, ty, tw - 8, th);
    ctx.fillStyle = C.wallDark;
    ctx.fillRect(tx, ty, 3, th);

    // Conical roof
    ctx.fillStyle = C.roof;
    ctx.beginPath();
    ctx.moveTo(tx - 2, ty + 2);
    ctx.lineTo(tx + tw / 2, ty - 10);
    ctx.lineTo(tx + tw + 2, ty + 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx - 2, ty + 2);
    ctx.lineTo(tx + tw / 2, ty - 10);
    ctx.lineTo(tx + tw + 2, ty + 2);
    ctx.closePath();
    ctx.stroke();

    // Outline body
    ctx.strokeRect(tx, ty, tw, th);
  }

  // ----------------------------------------------------------
  // Right turret
  // ----------------------------------------------------------
  _drawRightTurret(ctx, tier) {
    const tx = 93;
    const ty = 55;
    const tw = 22;
    const th = 70;

    // Body
    ctx.fillStyle = C.wallBase;
    ctx.fillRect(tx, ty, tw, th);
    ctx.fillStyle = C.wallLight;
    ctx.fillRect(tx + 4, ty, tw - 8, th);
    ctx.fillStyle = C.wallDark;
    ctx.fillRect(tx + tw - 3, ty, 3, th);

    // Conical roof
    ctx.fillStyle = C.roof;
    ctx.beginPath();
    ctx.moveTo(tx - 2, ty + 2);
    ctx.lineTo(tx + tw / 2, ty - 10);
    ctx.lineTo(tx + tw + 2, ty + 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx - 2, ty + 2);
    ctx.lineTo(tx + tw / 2, ty - 10);
    ctx.lineTo(tx + tw + 2, ty + 2);
    ctx.closePath();
    ctx.stroke();

    ctx.strokeRect(tx, ty, tw, th);
  }

  // ----------------------------------------------------------
  // Crenellations (battlements)
  // ----------------------------------------------------------
  _drawCrenellations(ctx, tier) {
    ctx.fillStyle = C.wallDark;
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1;

    // Keep crenellations
    const keepTop = 23;
    for (let cx = 31; cx < 89; cx += 8) {
      ctx.fillRect(cx, keepTop, 5, 6);
      ctx.strokeRect(cx, keepTop, 5, 6);
    }

    // Left turret crenellations
    const ltTop = 53;
    for (let cx = 4; cx < 28; cx += 7) {
      ctx.fillRect(cx, ltTop, 4, 5);
      ctx.strokeRect(cx, ltTop, 4, 5);
    }

    // Right turret crenellations
    const rtTop = 53;
    for (let cx = 92; cx < 116; cx += 7) {
      ctx.fillRect(cx, rtTop, 4, 5);
      ctx.strokeRect(cx, rtTop, 4, 5);
    }

    // Left wall crenellations
    for (let cx = 16; cx < 39; cx += 7) {
      ctx.fillRect(cx, 78, 4, 5);
      ctx.strokeRect(cx, 78, 4, 5);
    }

    // Right wall crenellations
    for (let cx = 81; cx < 104; cx += 7) {
      ctx.fillRect(cx, 78, 4, 5);
      ctx.strokeRect(cx, 78, 4, 5);
    }
  }

  // ----------------------------------------------------------
  // Stone block texture
  // ----------------------------------------------------------
  _drawStoneTexture(ctx, tier) {
    ctx.strokeStyle = C.wallShadow;
    ctx.lineWidth = 0.4;
    ctx.globalAlpha = 0.35;

    // Keep stone lines
    for (let row = 0; row < 12; row++) {
      const yOff = 28 + row * 8;
      const xStart = 34;
      const xEnd = 86;
      // Horizontal mortar line
      ctx.beginPath();
      ctx.moveTo(xStart, yOff);
      ctx.lineTo(xEnd, yOff);
      ctx.stroke();
      // Vertical mortar lines (offset every other row)
      const offset = row % 2 === 0 ? 0 : 6;
      for (let vx = xStart + offset; vx < xEnd; vx += 12) {
        ctx.beginPath();
        ctx.moveTo(vx, yOff);
        ctx.lineTo(vx, yOff + 8);
        ctx.stroke();
      }
    }

    // Left turret stone lines
    for (let row = 0; row < 8; row++) {
      const yOff = 58 + row * 8;
      ctx.beginPath();
      ctx.moveTo(6, yOff);
      ctx.lineTo(26, yOff);
      ctx.stroke();
      const offset = row % 2 === 0 ? 0 : 5;
      for (let vx = 6 + offset; vx < 26; vx += 10) {
        ctx.beginPath();
        ctx.moveTo(vx, yOff);
        ctx.lineTo(vx, yOff + 8);
        ctx.stroke();
      }
    }

    // Right turret stone lines
    for (let row = 0; row < 8; row++) {
      const yOff = 58 + row * 8;
      ctx.beginPath();
      ctx.moveTo(94, yOff);
      ctx.lineTo(114, yOff);
      ctx.stroke();
      const offset = row % 2 === 0 ? 0 : 5;
      for (let vx = 94 + offset; vx < 114; vx += 10) {
        ctx.beginPath();
        ctx.moveTo(vx, yOff);
        ctx.lineTo(vx, yOff + 8);
        ctx.stroke();
      }
    }

    // Wall stone lines
    for (let row = 0; row < 5; row++) {
      const yOff = 83 + row * 8;
      // Left wall
      ctx.beginPath();
      ctx.moveTo(16, yOff);
      ctx.lineTo(39, yOff);
      ctx.stroke();
      // Right wall
      ctx.beginPath();
      ctx.moveTo(81, yOff);
      ctx.lineTo(104, yOff);
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
  }

  // ----------------------------------------------------------
  // Windows with animated glow
  // ----------------------------------------------------------
  _drawWindows(ctx, timestamp, tier) {
    const windows = [
      { x: 48, y: 45, w: 8, h: 10 }, // Keep upper-left
      { x: 64, y: 45, w: 8, h: 10 }, // Keep upper-right
      { x: 56, y: 68, w: 8, h: 10 }, // Keep middle-center
    ];

    const lightDim = tier >= 2 ? 0.3 : tier >= 1 ? 0.6 : 1.0;

    windows.forEach((win, i) => {
      // Window frame
      ctx.fillStyle = C.windowFrame;
      ctx.fillRect(win.x - 1, win.y - 1, win.w + 2, win.h + 2);

      // Warm glow with flicker
      const flicker =
        Math.sin(timestamp * 0.004 + i * 2.1) * 0.15 +
        Math.sin(timestamp * 0.007 + i * 1.3) * 0.1;
      const brightness =
        Math.max(0.4, Math.min(1.0, 0.75 + flicker)) * lightDim;

      // Glow halo behind window
      if (tier < 3) {
        ctx.save();
        ctx.globalAlpha = brightness * 0.3;
        ctx.fillStyle = C.windowGlow;
        ctx.beginPath();
        ctx.arc(win.x + win.w / 2, win.y + win.h / 2, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Window interior
      ctx.save();
      ctx.globalAlpha = brightness;
      const grad = ctx.createLinearGradient(win.x, win.y, win.x, win.y + win.h);
      grad.addColorStop(0, C.windowGlowBright);
      grad.addColorStop(1, C.windowGlow);
      ctx.fillStyle = grad;
      ctx.fillRect(win.x, win.y, win.w, win.h);
      ctx.restore();

      // Window cross (mullion)
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(win.x + win.w / 2, win.y);
      ctx.lineTo(win.x + win.w / 2, win.y + win.h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(win.x, win.y + win.h / 2);
      ctx.lineTo(win.x + win.w, win.y + win.h / 2);
      ctx.stroke();

      // Window frame outline
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1;
      ctx.strokeRect(win.x - 1, win.y - 1, win.w + 2, win.h + 2);
    });

    // Turret small windows (arrow slits)
    const slits = [
      { x: 14, y: 75 },
      { x: 103, y: 75 },
    ];
    slits.forEach((slit) => {
      ctx.fillStyle = C.gateDark;
      ctx.fillRect(slit.x, slit.y, 3, 8);
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(slit.x, slit.y, 3, 8);
    });
  }

  // ----------------------------------------------------------
  // Torch flames on turret tops
  // ----------------------------------------------------------
  _drawTorches(ctx, timestamp, tier) {
    if (tier === 3) return; // No torches when critical

    const torchPositions = [
      { x: 16, y: 52 }, // Left turret top
      { x: 104, y: 52 }, // Right turret top
    ];

    const intensity = tier >= 2 ? 0.4 : tier >= 1 ? 0.7 : 1.0;

    torchPositions.forEach((torch, i) => {
      ctx.save();
      ctx.globalAlpha = intensity;

      // Draw 3-4 flame particles
      const numFlames = 3 + Math.floor(Math.sin(timestamp * 0.01 + i) + 1);
      for (let f = 0; f < numFlames; f++) {
        const phase = timestamp * 0.008 + i * 3.7 + f * 1.2;
        const fx = torch.x + Math.sin(phase) * 2;
        const fy = torch.y - 2 - f * 2 - Math.abs(Math.sin(phase * 0.7)) * 3;
        const size = 3 - f * 0.6;

        if (size <= 0) continue;

        // Outer flame
        ctx.fillStyle = C.flameOuter;
        ctx.beginPath();
        ctx.arc(fx, fy, size, 0, Math.PI * 2);
        ctx.fill();

        // Inner flame
        if (f < 2) {
          ctx.fillStyle = C.flameInner;
          ctx.beginPath();
          ctx.arc(fx, fy + 0.5, size * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }

        // Core (only first particle)
        if (f === 0) {
          ctx.fillStyle = C.flameCore;
          ctx.beginPath();
          ctx.arc(fx, fy + 1, size * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Ember glow
      ctx.fillStyle = C.emberGlow;
      ctx.beginPath();
      ctx.arc(torch.x, torch.y - 3, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }

  // ----------------------------------------------------------
  // Banner / flag on top of keep
  // ----------------------------------------------------------
  _drawFlag(ctx, timestamp, tier) {
    const poleX = 60;
    const poleTopY = 6;
    const poleBottomY = 25;

    // Flag pole
    ctx.strokeStyle = C.bannerPole;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(poleX, poleBottomY);
    ctx.lineTo(poleX, poleTopY);
    ctx.stroke();

    // Pole tip (gold ball)
    ctx.fillStyle = C.bannerGold;
    ctx.beginPath();
    ctx.arc(poleX, poleTopY - 1, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Banner cloth with sine-wave animation
    const flagW = 18;
    const flagH = 12;
    const flagX = poleX + 1;
    const flagY = poleTopY + 1;
    const waveSpeed = tier === 3 ? 0.006 : 0.003;
    const waveAmp = tier === 3 ? 3 : 1.5;

    // Draw flag as a filled wave shape
    ctx.beginPath();
    ctx.moveTo(flagX, flagY);

    // Top edge (wavy)
    for (let px = 0; px <= flagW; px += 1) {
      const wave =
        Math.sin(timestamp * waveSpeed + px * 0.4) * waveAmp * (px / flagW); // Wave increases toward tip
      ctx.lineTo(flagX + px, flagY + wave);
    }

    // Right edge
    const tipWave = Math.sin(timestamp * waveSpeed + flagW * 0.4) * waveAmp;
    ctx.lineTo(flagX + flagW, flagY + flagH + tipWave);

    // Bottom edge (wavy)
    for (let px = flagW; px >= 0; px -= 1) {
      const wave =
        Math.sin(timestamp * waveSpeed + px * 0.4) * waveAmp * (px / flagW);
      ctx.lineTo(flagX + px, flagY + flagH + wave);
    }

    ctx.closePath();

    // Two-color banner: top half gold, bottom half purple
    // Use a gradient for simplicity
    const flagGrad = ctx.createLinearGradient(
      flagX,
      flagY,
      flagX,
      flagY + flagH,
    );
    flagGrad.addColorStop(0, C.bannerGold);
    flagGrad.addColorStop(0.45, C.bannerGold);
    flagGrad.addColorStop(0.55, C.bannerPurple);
    flagGrad.addColorStop(1, C.bannerPurpleDark);
    ctx.fillStyle = flagGrad;
    ctx.fill();

    // Flag outline
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ----------------------------------------------------------
  // Crack patterns (damage)
  // ----------------------------------------------------------
  _generateCracks() {
    const crackSets = [[], [], []]; // tier 1, tier 2, tier 3

    // Tier 1: light cracks (2-3 small cracks)
    const r1 = seededRand(42);
    for (let i = 0; i < 3; i++) {
      const startX = 35 + r1() * 50;
      const startY = 50 + r1() * 50;
      const segments = [];
      let cx = startX,
        cy = startY;
      const numSeg = 2 + Math.floor(r1() * 2);
      for (let s = 0; s < numSeg; s++) {
        const nx = cx + (r1() - 0.5) * 12;
        const ny = cy + r1() * 8;
        segments.push({ x1: cx, y1: cy, x2: nx, y2: ny });
        cx = nx;
        cy = ny;
      }
      crackSets[0].push(segments);
    }

    // Tier 2: more cracks, longer
    const r2 = seededRand(137);
    for (let i = 0; i < 6; i++) {
      const startX = 15 + r2() * 90;
      const startY = 35 + r2() * 70;
      const segments = [];
      let cx = startX,
        cy = startY;
      const numSeg = 3 + Math.floor(r2() * 3);
      for (let s = 0; s < numSeg; s++) {
        const nx = cx + (r2() - 0.5) * 16;
        const ny = cy + r2() * 10;
        segments.push({ x1: cx, y1: cy, x2: nx, y2: ny });
        cx = nx;
        cy = ny;
      }
      crackSets[1].push(segments);
    }

    // Tier 3: heavy cracks everywhere
    const r3 = seededRand(256);
    for (let i = 0; i < 10; i++) {
      const startX = 10 + r3() * 100;
      const startY = 25 + r3() * 90;
      const segments = [];
      let cx = startX,
        cy = startY;
      const numSeg = 3 + Math.floor(r3() * 4);
      for (let s = 0; s < numSeg; s++) {
        const nx = cx + (r3() - 0.5) * 20;
        const ny = cy + r3() * 12;
        segments.push({ x1: cx, y1: cy, x2: nx, y2: ny });
        cx = nx;
        cy = ny;
      }
      crackSets[2].push(segments);
    }

    return crackSets;
  }

  _drawCracks(ctx, tier) {
    const crackIndex = Math.min(tier - 1, 2);

    ctx.strokeStyle = C.crack;
    ctx.lineWidth = tier >= 2 ? 1.5 : 1;

    // Draw all cracks up to and including the current tier
    for (let t = 0; t <= crackIndex; t++) {
      this._cracks[t].forEach((crack) => {
        ctx.beginPath();
        crack.forEach((seg, i) => {
          if (i === 0) ctx.moveTo(seg.x1, seg.y1);
          ctx.lineTo(seg.x2, seg.y2);
        });
        ctx.stroke();
      });
    }
  }

  // ----------------------------------------------------------
  // Debris particles (heavy damage)
  // ----------------------------------------------------------
  _updateAndDrawDebris(ctx, dt, tier) {
    // Spawn new debris
    const spawnRate = tier === 3 ? 3 : 1;
    for (let i = 0; i < spawnRate; i++) {
      if (this._debris.length < 30 && Math.random() < 0.3) {
        this._debris.push({
          x: 15 + Math.random() * 90,
          y: 30 + Math.random() * 40,
          vx: (Math.random() - 0.5) * 20,
          vy: 10 + Math.random() * 30,
          size: 1 + Math.random() * 2.5,
          life: 1.0,
          decay: 0.4 + Math.random() * 0.6,
        });
      }
    }

    // Update and draw
    ctx.fillStyle = C.wallDark;
    for (let i = this._debris.length - 1; i >= 0; i--) {
      const d = this._debris[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 80 * dt; // gravity
      d.life -= d.decay * dt;

      if (d.life <= 0 || d.y > 145) {
        this._debris.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = d.life;
      ctx.fillRect(d.x - d.size / 2, d.y - d.size / 2, d.size, d.size);
    }
    ctx.globalAlpha = 1.0;
  }

  // ----------------------------------------------------------
  // Smoke wisps
  // ----------------------------------------------------------
  _drawSmoke(ctx, timestamp, tier) {
    const numSmoke = tier === 3 ? 5 : tier === 2 ? 3 : 1;

    ctx.save();
    for (let i = 0; i < numSmoke; i++) {
      const phase = timestamp * 0.001 + i * 2.5;
      const sx = 30 + i * 18 + Math.sin(phase * 0.7) * 5;
      const sy = 20 + Math.sin(phase) * 8 - ((timestamp * 0.01 + i * 100) % 40);
      const adjustedY = 15 + ((sy - 15 + 40) % 40);
      const size = 4 + Math.sin(phase * 0.5) * 2;
      const alpha = tier === 3 ? 0.4 : tier === 2 ? 0.25 : 0.12;

      ctx.globalAlpha = alpha * (1 - (adjustedY - 15) / 40);
      ctx.fillStyle = tier === 3 ? "#2A2A2A" : "#555555";
      ctx.beginPath();
      ctx.arc(sx, adjustedY, size, 0, Math.PI * 2);
      ctx.fill();

      // Second layer for volume
      ctx.globalAlpha = alpha * 0.5 * (1 - (adjustedY - 15) / 40);
      ctx.beginPath();
      ctx.arc(sx + 3, adjustedY - 2, size * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ----------------------------------------------------------
  // Fire damage (critical HP)
  // ----------------------------------------------------------
  _drawFireDamage(ctx, timestamp) {
    const firePositions = [
      { x: 25, y: 70 },
      { x: 55, y: 40 },
      { x: 85, y: 65 },
      { x: 45, y: 85 },
      { x: 70, y: 50 },
    ];

    ctx.save();
    firePositions.forEach((fp, i) => {
      const phase = timestamp * 0.006 + i * 1.7;
      const numFlames = 4;

      for (let f = 0; f < numFlames; f++) {
        const fx = fp.x + Math.sin(phase + f * 0.8) * 3;
        const fy = fp.y - f * 3 - Math.abs(Math.sin(phase * 1.2 + f)) * 4;
        const size = 4 - f * 0.8;

        if (size <= 0) continue;

        // Outer
        ctx.globalAlpha = 0.7 - f * 0.15;
        ctx.fillStyle = f === 0 ? C.fireRed : C.flameOuter;
        ctx.beginPath();
        ctx.arc(fx, fy, size, 0, Math.PI * 2);
        ctx.fill();

        // Inner
        if (f < 2) {
          ctx.globalAlpha = 0.8 - f * 0.2;
          ctx.fillStyle = C.flameInner;
          ctx.beginPath();
          ctx.arc(fx, fy, size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Fire glow on walls
      ctx.globalAlpha = 0.08 + Math.sin(phase) * 0.04;
      ctx.fillStyle = C.fireDamage;
      ctx.beginPath();
      ctx.arc(fp.x, fp.y, 12, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // Overall red tint overlay
    ctx.save();
    ctx.globalAlpha = 0.06 + Math.sin(timestamp * 0.003) * 0.03;
    ctx.fillStyle = "#FF0000";
    ctx.fillRect(0, 0, this._width, this._height);
    ctx.restore();
  }
}
