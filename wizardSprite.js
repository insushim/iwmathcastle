// wizardSprite.js - Pixel-art Wizard on Horseback sprite system
// Canvas 2D primitives only (fillRect, arc, lineTo, etc.)
// 8 directional sprites with walk and idle animation

// Direction constants
const DIR = {
  S: 0, // down (toward viewer)
  SE: 1,
  E: 2, // right
  NE: 3,
  N: 4, // up (away from viewer)
  NW: 5,
  W: 6, // left
  SW: 7,
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
};

// Leg animation offsets for 4-frame walk cycle
// Each frame: [frontLeft, frontRight, backLeft, backRight] as Y offsets
const LEG_OFFSETS = [
  // Frame 0: left legs forward, right legs back
  { fl: -7, fr: 5, bl: -5, br: 7 },
  // Frame 1: transition
  { fl: -2, fr: 1, bl: 1, br: 2 },
  // Frame 2: right legs forward, left legs back
  { fl: 5, fr: -7, bl: 7, br: -5 },
  // Frame 3: transition back
  { fl: 1, fr: -2, bl: 2, br: -1 },
];

export class WizardSprite {
  constructor() {
    this._width = 48;
    this._height = 56;
    this._direction = DIR.S;
    this._frame = 0;
    this._frameTimer = 0;
    this._walking = false;
    this._idleTimer = 0;
    this._idleBob = 0;

    // Animation timing
    this._walkFrameMs = 150;
    this._idleCycleMs = 400;

    // Staff glow pulse
    this._glowTimer = 0;
    this._glowCycleMs = 1200;
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
      return;
    }
    this._walking = true;

    // Map dx,dy to 8 directions
    if (dx === 0 && dy > 0) this._direction = DIR.S;
    else if (dx > 0 && dy > 0) this._direction = DIR.SE;
    else if (dx > 0 && dy === 0) this._direction = DIR.E;
    else if (dx > 0 && dy < 0) this._direction = DIR.NE;
    else if (dx === 0 && dy < 0) this._direction = DIR.N;
    else if (dx < 0 && dy < 0) this._direction = DIR.NW;
    else if (dx < 0 && dy === 0) this._direction = DIR.W;
    else if (dx < 0 && dy > 0) this._direction = DIR.SW;
  }

  /**
   * Update animation state.
   * @param {number} deltaTime - milliseconds since last frame
   */
  update(deltaTime) {
    this._glowTimer = (this._glowTimer + deltaTime) % this._glowCycleMs;

    if (this._walking) {
      this._frameTimer += deltaTime;
      if (this._frameTimer >= this._walkFrameMs) {
        this._frameTimer -= this._walkFrameMs;
        this._frame = (this._frame + 1) % 4;
      }
      this._idleTimer = 0;
      this._idleBob = 0;
    } else {
      this._frame = 0;
      this._frameTimer = 0;
      this._idleTimer += deltaTime;
      // Gentle bobbing using sine wave
      const t = (this._idleTimer % this._idleCycleMs) / this._idleCycleMs;
      this._idleBob = Math.sin(t * Math.PI * 2) * 1.5;
    }
  }

  /**
   * Draw the wizard on horseback at position (x, y) on context ctx.
   * (x, y) is the center-bottom of the sprite.
   */
  render(ctx, x, y) {
    ctx.save();

    // Move origin to center-bottom of sprite
    const ox = Math.round(x - this._width / 2);
    const oy = Math.round(y - this._height + this._idleBob);

    const dir = this._direction;
    const frame = this._frame;
    const legOff = this._walking
      ? LEG_OFFSETS[frame]
      : { fl: 0, fr: 0, bl: 0, br: 0 };

    // Glow intensity for staff tip (0..1 pulsing)
    const glowT =
      (Math.sin((this._glowTimer / this._glowCycleMs) * Math.PI * 2) + 1) / 2;

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
      ctx.translate(0, 0);
    } else {
      ctx.save();
      ctx.translate(ox, oy);
    }

    // Dispatch based on canonical direction
    switch (drawDir) {
      case DIR.E:
        this._drawSide(ctx, legOff, glowT);
        break;
      case DIR.S:
        this._drawFront(ctx, legOff, glowT);
        break;
      case DIR.N:
        this._drawBack(ctx, legOff, glowT);
        break;
      case DIR.SE:
        this._drawDiagonalFront(ctx, legOff, glowT);
        break;
      case DIR.NE:
        this._drawDiagonalBack(ctx, legOff, glowT);
        break;
    }

    ctx.restore();
    ctx.restore();
  }

  // ========================================================
  // SIDE VIEW (E direction) - Full horse profile
  // ========================================================
  _drawSide(ctx, leg, glow) {
    const W = this._width; // 48
    const H = this._height; // 56

    // --- Shadow on ground ---
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    this._ellipse(ctx, W / 2, H - 1, 20, 4);

    // --- Horse legs (behind) ---
    ctx.fillStyle = COLORS.horseDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    // Back-left leg (far)
    this._drawLeg(ctx, 12, H - 18, leg.bl, false);
    // Front-left leg (far)
    this._drawLeg(ctx, 28, H - 18, leg.fl, false);

    // --- Horse body ---
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(20, H - 24, 16, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belly highlight
    ctx.fillStyle = COLORS.horseBelly;
    ctx.beginPath();
    ctx.ellipse(20, H - 21, 12, 4, 0, 0, Math.PI);
    ctx.fill();

    // --- Horse legs (front, nearer to viewer) ---
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    // Back-right leg (near)
    this._drawLeg(ctx, 10, H - 18, leg.br, true);
    // Front-right leg (near)
    this._drawLeg(ctx, 30, H - 18, leg.fr, true);

    // --- Tail ---
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, H - 28);
    ctx.quadraticCurveTo(0, H - 20, 2, H - 14);
    ctx.stroke();

    // --- Horse neck ---
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

    // --- Horse head ---
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(40, H - 40, 6, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Horse ear
    ctx.fillStyle = COLORS.horsebody;
    ctx.beginPath();
    ctx.moveTo(39, H - 45);
    ctx.lineTo(41, H - 48);
    ctx.lineTo(43, H - 44);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Horse eye
    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.arc(42, H - 41, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(42.5, H - 41, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Mane
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(36, H - 39);
    ctx.quadraticCurveTo(32, H - 36, 30, H - 30);
    ctx.stroke();

    // --- Saddle ---
    ctx.fillStyle = "#8B0000";
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.fillRect(16, H - 34, 12, 4);
    ctx.strokeRect(16, H - 34, 12, 4);

    // --- Wizard body (sitting on saddle) ---
    ctx.fillStyle = COLORS.robe;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    // Torso
    ctx.beginPath();
    ctx.moveTo(17, H - 34);
    ctx.lineTo(15, H - 44);
    ctx.lineTo(28, H - 44);
    ctx.lineTo(27, H - 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Robe drape (over horse side)
    ctx.fillStyle = COLORS.robeDark;
    ctx.beginPath();
    ctx.moveTo(17, H - 34);
    ctx.lineTo(14, H - 28);
    ctx.lineTo(20, H - 28);
    ctx.lineTo(20, H - 34);
    ctx.closePath();
    ctx.fill();

    // --- Wizard head ---
    ctx.fillStyle = COLORS.skin;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(22, H - 48, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Face detail
    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.arc(24, H - 49, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(24.5, H - 49, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // --- Wizard hat ---
    ctx.fillStyle = COLORS.hat;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, H - 52);
    ctx.lineTo(22, H - 66); // tip of hat
    ctx.lineTo(29, H - 52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hat band
    ctx.fillStyle = COLORS.hatBand;
    ctx.fillRect(15, H - 53, 14, 2);

    // Hat brim
    ctx.fillStyle = COLORS.hatDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(22, H - 52, 9, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // --- Staff ---
    this._drawStaff(ctx, 10, H - 32, 10, H - 60, glow);

    // --- Wizard arm holding staff ---
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
  _drawFront(ctx, leg, glow) {
    const W = this._width;
    const H = this._height;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    this._ellipse(ctx, W / 2, H - 1, 18, 4);

    // --- Horse legs (back pair, further from viewer) ---
    ctx.fillStyle = COLORS.horseDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLegFront(ctx, 16, H - 16, leg.bl);
    this._drawLegFront(ctx, 32, H - 16, leg.br);

    // --- Horse body (front-facing, foreshortened) ---
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 22, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belly
    ctx.fillStyle = COLORS.horseBelly;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 18, 8, 4, 0, 0, Math.PI);
    ctx.fill();

    // --- Horse legs (front pair, closer to viewer) ---
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLegFront(ctx, 18, H - 16, leg.fl);
    this._drawLegFront(ctx, 30, H - 16, leg.fr);

    // --- Horse chest/neck (front facing) ---
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 32, 8, 7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // --- Horse head (front facing) ---
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 38, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Horse ears
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    // Left ear
    ctx.beginPath();
    ctx.moveTo(18, H - 41);
    ctx.lineTo(16, H - 46);
    ctx.lineTo(20, H - 42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Right ear
    ctx.beginPath();
    ctx.moveTo(30, H - 41);
    ctx.lineTo(32, H - 46);
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

    // Nostril
    ctx.fillStyle = COLORS.horseDark;
    ctx.fillRect(22, H - 35, 2, 1);
    ctx.fillRect(26, H - 35, 2, 1);

    // Mane (center tuft)
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 43);
    ctx.lineTo(W / 2 - 1, H - 46);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 43);
    ctx.lineTo(W / 2 + 1, H - 47);
    ctx.stroke();

    // --- Saddle ---
    ctx.fillStyle = "#8B0000";
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.fillRect(17, H - 32, 14, 3);
    ctx.strokeRect(17, H - 32, 14, 3);

    // --- Wizard body (front facing, centered) ---
    ctx.fillStyle = COLORS.robe;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(17, H - 32);
    ctx.lineTo(16, H - 44);
    ctx.lineTo(32, H - 44);
    ctx.lineTo(31, H - 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Robe detail / belt
    ctx.fillStyle = COLORS.hatBand;
    ctx.fillRect(18, H - 36, 12, 2);

    // --- Wizard head ---
    ctx.fillStyle = COLORS.skin;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(W / 2, H - 48, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eyes
    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.arc(21, H - 49, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(27, H - 49, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(21, H - 48.5, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(27, H - 48.5, 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Beard hint
    ctx.fillStyle = COLORS.skinDark;
    ctx.beginPath();
    ctx.arc(W / 2, H - 44, 3, 0, Math.PI);
    ctx.fill();

    // --- Wizard hat ---
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

    // --- Staff (on left side) ---
    this._drawStaff(ctx, 10, H - 30, 8, H - 60, glow);

    // --- Wizard arm holding staff ---
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
  _drawBack(ctx, leg, glow) {
    const W = this._width;
    const H = this._height;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    this._ellipse(ctx, W / 2, H - 1, 18, 4);

    // --- Horse legs (front pair, further from viewer) ---
    ctx.fillStyle = COLORS.horseDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLegFront(ctx, 18, H - 16, leg.fl);
    this._drawLegFront(ctx, 30, H - 16, leg.fr);

    // --- Horse body ---
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 22, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // --- Horse legs (back pair, closer to viewer) ---
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLegFront(ctx, 16, H - 16, leg.bl);
    this._drawLegFront(ctx, 32, H - 16, leg.br);

    // --- Tail (visible from back) ---
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 14);
    ctx.quadraticCurveTo(W / 2 - 3, H - 8, W / 2 - 2, H - 4);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 14);
    ctx.quadraticCurveTo(W / 2 + 3, H - 9, W / 2 + 1, H - 5);
    ctx.stroke();

    // --- Horse back of neck ---
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 32, 7, 6, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // --- Horse ears (from behind) ---
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(19, H - 36);
    ctx.lineTo(17, H - 42);
    ctx.lineTo(21, H - 37);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(29, H - 36);
    ctx.lineTo(31, H - 42);
    ctx.lineTo(27, H - 37);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Mane
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 38);
    ctx.lineTo(W / 2, H - 34);
    ctx.stroke();

    // --- Saddle ---
    ctx.fillStyle = "#8B0000";
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.fillRect(17, H - 32, 14, 3);
    ctx.strokeRect(17, H - 32, 14, 3);

    // --- Wizard body (back view) ---
    ctx.fillStyle = COLORS.robe;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(17, H - 32);
    ctx.lineTo(16, H - 44);
    ctx.lineTo(32, H - 44);
    ctx.lineTo(31, H - 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Robe back detail
    ctx.strokeStyle = COLORS.robeDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 44);
    ctx.lineTo(W / 2, H - 32);
    ctx.stroke();

    // --- Wizard head (back) ---
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

    // --- Wizard hat ---
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

    // --- Staff (on left side from behind, so appears on right) ---
    this._drawStaff(ctx, 36, H - 30, 38, H - 60, glow);

    // --- Wizard arm ---
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
  // DIAGONAL FRONT VIEW (SE direction) - 3/4 front-right view
  // ========================================================
  _drawDiagonalFront(ctx, leg, glow) {
    const W = this._width;
    const H = this._height;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    this._ellipse(ctx, W / 2, H - 1, 19, 4);

    // --- Horse legs (far side) ---
    ctx.fillStyle = COLORS.horseDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    // Far back leg
    this._drawLegAngled(ctx, 14, H - 17, leg.bl, -2);
    // Far front leg
    this._drawLegAngled(ctx, 26, H - 17, leg.fl, -2);

    // --- Horse body (slightly angled ellipse) ---
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(W / 2 + 1, H - 23, 14, 9, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belly
    ctx.fillStyle = COLORS.horseBelly;
    ctx.beginPath();
    ctx.ellipse(W / 2 + 1, H - 20, 10, 4, 0.2, 0, Math.PI);
    ctx.fill();

    // --- Horse legs (near side) ---
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    // Near back leg
    this._drawLegAngled(ctx, 18, H - 17, leg.br, 2);
    // Near front leg
    this._drawLegAngled(ctx, 32, H - 17, leg.fr, 2);

    // --- Horse neck (angled) ---
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

    // --- Horse head (3/4 view) ---
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(38, H - 39, 6, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ear
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36, H - 43);
    ctx.lineTo(35, H - 47);
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

    // Mane
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(35, H - 38);
    ctx.quadraticCurveTo(31, H - 35, 29, H - 29);
    ctx.stroke();

    // --- Tail ---
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, H - 26);
    ctx.quadraticCurveTo(2, H - 20, 4, H - 14);
    ctx.stroke();

    // --- Saddle ---
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

    // --- Wizard body ---
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

    // Robe side drape
    ctx.fillStyle = COLORS.robeDark;
    ctx.beginPath();
    ctx.moveTo(17, H - 32);
    ctx.lineTo(14, H - 26);
    ctx.lineTo(19, H - 26);
    ctx.lineTo(19, H - 32);
    ctx.closePath();
    ctx.fill();

    // Belt
    ctx.fillStyle = COLORS.hatBand;
    ctx.fillRect(17, H - 35, 12, 2);

    // --- Wizard head ---
    ctx.fillStyle = COLORS.skin;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(23, H - 47, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eye (3/4 view - one eye visible, one partially)
    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.arc(25, H - 48, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(25.5, H - 47.5, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Partial far eye
    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.arc(20, H - 48, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(20.3, H - 47.5, 0.5, 0, Math.PI * 2);
    ctx.fill();

    // --- Wizard hat ---
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

    // --- Staff ---
    this._drawStaff(ctx, 9, H - 30, 7, H - 58, glow);

    // --- Wizard arm ---
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
  // DIAGONAL BACK VIEW (NE direction) - 3/4 back-right view
  // ========================================================
  _drawDiagonalBack(ctx, leg, glow) {
    const W = this._width;
    const H = this._height;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    this._ellipse(ctx, W / 2, H - 1, 19, 4);

    // --- Horse legs (far side, front) ---
    ctx.fillStyle = COLORS.horseDark;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLegAngled(ctx, 26, H - 17, leg.fl, -2);
    this._drawLegAngled(ctx, 14, H - 17, leg.bl, -2);

    // --- Horse body ---
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(W / 2 + 1, H - 23, 14, 9, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belly
    ctx.fillStyle = COLORS.horseBelly;
    ctx.beginPath();
    ctx.ellipse(W / 2 + 1, H - 20, 10, 4, 0.2, 0, Math.PI);
    ctx.fill();

    // --- Horse legs (near side) ---
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    this._drawLegAngled(ctx, 32, H - 17, leg.fr, 2);
    this._drawLegAngled(ctx, 18, H - 17, leg.br, 2);

    // --- Tail (visible going away from viewer to the left-back) ---
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, H - 26);
    ctx.quadraticCurveTo(2, H - 18, 4, H - 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6, H - 26);
    ctx.quadraticCurveTo(0, H - 20, 3, H - 14);
    ctx.stroke();

    // --- Horse neck ---
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

    // --- Horse head (3/4 back, mostly the back of the head) ---
    ctx.fillStyle = COLORS.horseLight;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(38, H - 39, 6, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ear
    ctx.fillStyle = COLORS.horsebody;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36, H - 43);
    ctx.lineTo(35, H - 47);
    ctx.lineTo(39, H - 43);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Second ear partially visible
    ctx.beginPath();
    ctx.moveTo(40, H - 43);
    ctx.lineTo(41, H - 47);
    ctx.lineTo(42, H - 43);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Mane
    ctx.strokeStyle = COLORS.mane;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(36, H - 38);
    ctx.quadraticCurveTo(32, H - 35, 30, H - 29);
    ctx.stroke();

    // --- Saddle ---
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

    // --- Wizard body (back 3/4 view) ---
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

    // --- Wizard head (back 3/4) ---
    ctx.fillStyle = COLORS.skin;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(23, H - 47, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hair on back of head
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(23, H - 47, 5, 0.3, Math.PI + 0.8);
    ctx.fill();

    // Slight cheek visible
    ctx.fillStyle = COLORS.skin;
    ctx.beginPath();
    ctx.arc(27, H - 47, 2, -0.5, 0.5);
    ctx.fill();

    // --- Wizard hat ---
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

    // --- Staff ---
    this._drawStaff(ctx, 9, H - 30, 7, H - 58, glow);

    // --- Wizard arm ---
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
  // Helper: draw a single horse leg (side view)
  // ========================================================
  _drawLeg(ctx, x, y, offset, isNear) {
    const color = isNear ? COLORS.horseLight : COLORS.horseDark;
    ctx.fillStyle = color;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;

    // Upper leg
    ctx.beginPath();
    ctx.moveTo(x - 2, y);
    ctx.lineTo(x - 1 + offset * 0.5, y + 8);
    ctx.lineTo(x + 2 + offset * 0.5, y + 8);
    ctx.lineTo(x + 2, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Lower leg
    ctx.beginPath();
    ctx.moveTo(x - 1 + offset * 0.5, y + 8);
    ctx.lineTo(x + offset, y + 14);
    ctx.lineTo(x + 3 + offset, y + 14);
    ctx.lineTo(x + 2 + offset * 0.5, y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hoof
    ctx.fillStyle = COLORS.hoof;
    ctx.fillRect(x - 1 + offset, y + 13, 5, 2);
    ctx.strokeRect(x - 1 + offset, y + 13, 5, 2);
  }

  // ========================================================
  // Helper: draw a horse leg (front/back view - shorter, straight)
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
  // Helper: draw the wizard staff with glowing tip
  // ========================================================
  _drawStaff(ctx, bx, by, tx, ty, glowIntensity) {
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

    // Glowing orb at tip
    const glowRadius = 3 + glowIntensity * 1.5;

    // Outer glow
    ctx.fillStyle = COLORS.staffGlowOuter;
    ctx.beginPath();
    ctx.arc(tx, ty, glowRadius + 5, 0, Math.PI * 2);
    ctx.fill();

    // Mid glow
    ctx.fillStyle = COLORS.staffGlow;
    ctx.beginPath();
    ctx.arc(tx, ty, glowRadius + 2, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = COLORS.staffTip;
    ctx.beginPath();
    ctx.arc(tx, ty, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Bright center
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(tx, ty, glowRadius * 0.4, 0, Math.PI * 2);
    ctx.fill();
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
