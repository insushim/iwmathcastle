// sfx.js - 효과음 (CC0 실물 샘플 우선 · Web Audio 절차 합성 폴백)
//
// v6.1: 소리를 전부 오실레이터로 합성하던 것을 CC0 실물 샘플(Kenney, 상업 사용 가능)로 교체했다.
//       다층 합성으로도 "기계음"을 못 벗어난다는 실측 피드백 반영. 아래 절차 합성 코드는
//       샘플 로드 실패 시 폴백으로 남겨 둔다(오프라인·파일 누락에서도 무음이 되지 않게).
//       조달 스크립트 = tools/fetch-audio.sh · 라이선스 = assets/audio/CREDITS.md

// 실물 샘플이 있는 키 (tools/fetch-audio.sh의 매핑과 1:1 — 여기만 고치면 로드 대상이 바뀐다)
const SAMPLE_KEYS = [
  "hit", "castle_hit", "explosion", "laser", "skyDestroyer", "shredder",
  "frost", "lightning", "plague", "disrupt", "stealth", "wizard_cast",
  "wizard-auto", "wizard_levelup", "powerup", "blip", "button_click",
  "menu_hover", "math_correct", "math_wrong", "tower_place", "tower_upgrade",
  "tower_sell", "goldMine", "repair", "combo_hit", "wave_start",
  "wave_clear", "game_start",
];

// 키별 음량 보정 — 전부 -16 LUFS로 정규화했지만 게임 안에서의 비중은 다르다.
// 자주 울리는 소리(타격·클릭)는 낮추고, 순간 이벤트(징글)는 존재감을 준다.
const SAMPLE_GAIN = {
  hit: 0.45, blip: 0.5, "wizard-auto": 0.5, laser: 0.55, combo_hit: 0.5,
  menu_hover: 0.35, button_click: 0.6, goldMine: 0.6,
  wave_start: 0.8, wave_clear: 0.9, game_start: 0.8, castle_hit: 0.9,
};

export const sfx = {
  isReady: false,
  audioContext: null,
  masterGain: null,
  volume: 0.5,
  samples: new Map(),
  _preloadStarted: false,
  lastPlayTimes: {},
  cooldowns: {
    "wizard-auto": 0.08,
    laser: 0.08,
    hit: 0.06,
    explosion: 0.1,
    blip: 0.05,
    frost: 0.15,
    lightning: 0.08,
    shredder: 0.08,
    button_click: 0.05,
    menu_hover: 0.03,
    math_correct: 0.1,
    math_wrong: 0.1,
    combo_hit: 0.08,
  },

  init() {
    if (this.isReady) return Promise.resolve();
    try {
      this.audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.audioContext.destination);

      if (this.audioContext.state === "suspended") {
        return this.audioContext.resume().then(() => {
          this.isReady = true;
          this.preloadSamples();
        });
      }
      this.isReady = true;
      this.preloadSamples();
      return Promise.resolve();
    } catch (error) {
      console.warn("Audio not supported:", error);
      this.isReady = false;
      return Promise.resolve();
    }
  },

  /**
   * v6.1: CC0 실물 효과음(Kenney, assets/audio/sfx/*.mp3)을 미리 디코드해 둔다.
   * ⚠️ 여기서 실패해도 게임은 그대로 돌아간다 — play()가 아래 절차 합성으로 폴백한다.
   *    (오프라인·파일 누락에서도 무음이 되지 않게 하는 안전망. 합성음은 지우지 말 것.)
   * 파일 조달·라이선스: tools/fetch-audio.sh, assets/audio/CREDITS.md
   */
  preloadSamples() {
    if (this._preloadStarted) return;
    this._preloadStarted = true;

    const load = async (key) => {
      try {
        const res = await fetch(`assets/audio/sfx/${key}.mp3`);
        if (!res.ok) return;
        const buf = await this.audioContext.decodeAudioData(
          await res.arrayBuffer(),
        );
        this.samples.set(key, buf);
      } catch {
        /* 개별 실패는 합성 폴백이 흡수한다 */
      }
    };
    // 총 244KB — 병렬로 받아도 첫 화면을 막지 않는다
    Promise.all(SAMPLE_KEYS.map(load)).then(() => {
      if (this.samples.size)
        console.info(`[sfx] CC0 샘플 ${this.samples.size}/${SAMPLE_KEYS.length}개 로드`);
    });
  },

  /** 디코드된 샘플을 masterGain 경유로 재생 — 볼륨 설정이 그대로 적용된다. */
  _playSample(buf, gain) {
    const src = this.audioContext.createBufferSource();
    src.buffer = buf;
    if (gain != null && gain !== 1) {
      const g = this.audioContext.createGain();
      g.gain.value = gain;
      src.connect(g);
      g.connect(this.masterGain);
    } else {
      src.connect(this.masterGain);
    }
    src.start();
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.audioContext) {
      this.masterGain.gain.setTargetAtTime(
        this.volume,
        this.audioContext.currentTime,
        0.05,
      );
    }
  },

  // --- Low-level building blocks ---

  _osc(type, freq, duration, gain, detune = 0) {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect(this.masterGain);
    o.start(t);
    o.stop(t + duration + 0.05);
    return { osc: o, gain: g };
  },

  _oscAt(type, freq, duration, gain, startOffset, detune = 0) {
    const ctx = this.audioContext;
    const t = ctx.currentTime + startOffset;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect(this.masterGain);
    o.start(t);
    o.stop(t + duration + 0.05);
  },

  _sweep(type, freqStart, freqEnd, duration, gain) {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freqStart, t);
    o.frequency.exponentialRampToValueAtTime(
      Math.max(freqEnd, 20),
      t + duration,
    );
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect(this.masterGain);
    o.start(t);
    o.stop(t + duration + 0.05);
  },

  _noise(duration, filterFreq, gain, filterType = "lowpass", Q = 1) {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = filterFreq;
    f.Q.value = Q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f);
    f.connect(g);
    g.connect(this.masterGain);
    src.start(t);
    src.stop(t + duration + 0.05);
  },

  _noiseAt(
    duration,
    filterFreq,
    gain,
    startOffset,
    filterType = "lowpass",
    Q = 1,
  ) {
    const ctx = this.audioContext;
    const t = ctx.currentTime + startOffset;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = filterFreq;
    f.Q.value = Q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f);
    f.connect(g);
    g.connect(this.masterGain);
    src.start(t);
    src.stop(t + duration + 0.05);
  },

  // Filtered oscillator with ADSR
  _filteredOsc(
    type,
    freq,
    duration,
    gain,
    filterFreq,
    filterType = "lowpass",
    Q = 1,
    detune = 0,
  ) {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    f.type = filterType;
    f.frequency.setValueAtTime(filterFreq, t);
    f.Q.value = Q;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.setValueAtTime(gain * 0.8, t + duration * 0.5);
    g.gain.linearRampToValueAtTime(0, t + duration);
    o.connect(f);
    f.connect(g);
    g.connect(this.masterGain);
    o.start(t);
    o.stop(t + duration + 0.05);
  },

  // Simple delay for reverb-like tail
  _withDelay(fn, delayTime = 0.12, feedback = 0.25) {
    fn();
    const origVol = this.volume;
    // Simulate reverb with quieter delayed repeats
    setTimeout(() => {
      const saved = this.volume;
      this.masterGain.gain.value *= feedback;
      fn();
      this.masterGain.gain.value = saved;
    }, delayTime * 1000);
  },

  // --- Sound Effect Definitions ---

  _laser() {
    this._sweep("sawtooth", 1200, 400, 0.12, 0.15);
    this._osc("square", 800, 0.08, 0.06, 5);
    this._noise(0.05, 3000, 0.04);
  },

  _hit() {
    this._sweep("square", 200, 60, 0.12, 0.2);
    this._noise(0.08, 800, 0.12);
    this._osc("sine", 100, 0.06, 0.15);
  },

  _explosion() {
    // Layered: low boom + mid crunch + high crackle
    this._sweep("sine", 120, 30, 0.5, 0.25);
    this._noise(0.4, 1500, 0.2, "lowpass", 2);
    this._noise(0.25, 4000, 0.08, "bandpass", 3);
    this._noiseAt(0.3, 800, 0.1, 0.05);
    this._osc("square", 80, 0.15, 0.1);
  },

  _powerup() {
    // Rising arpeggio with shimmer
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      this._oscAt("sine", f, 0.35, 0.1, i * 0.07);
      this._oscAt("triangle", f * 2, 0.2, 0.04, i * 0.07 + 0.02);
    });
    this._noiseAt(0.3, 6000, 0.03, 0.1, "highpass");
  },

  _blip() {
    this._osc("square", 880, 0.07, 0.1);
    this._osc("sine", 1320, 0.05, 0.05);
  },

  _frost() {
    // Icy crystalline sound
    this._filteredOsc("sine", 800, 0.5, 0.1, 2000);
    this._filteredOsc("sine", 1200, 0.4, 0.06, 3000, "lowpass", 1, 7);
    this._filteredOsc("triangle", 600, 0.45, 0.05, 1500);
    this._noise(0.3, 8000, 0.04, "highpass", 5);
    // Shimmer
    this._oscAt("sine", 2400, 0.2, 0.03, 0.1, 12);
    this._oscAt("sine", 2600, 0.15, 0.02, 0.15, -12);
  },

  _lightning() {
    this._sweep("sawtooth", 2000, 200, 0.12, 0.15);
    this._noise(0.08, 6000, 0.12, "highpass", 3);
    this._osc("square", 1500, 0.04, 0.08, 20);
    this._noiseAt(0.06, 4000, 0.06, 0.04, "bandpass", 8);
  },

  _wizardAuto() {
    this._osc("triangle", 880, 0.1, 0.08);
    this._osc("sine", 1320, 0.06, 0.04, 5);
    this._noise(0.04, 5000, 0.02, "highpass");
  },

  _skyDestroyer() {
    // Massive orbital strike
    this._sweep("sawtooth", 200, 40, 1.2, 0.2);
    this._noise(1.0, 600, 0.18, "lowpass", 3);
    this._noise(0.6, 3000, 0.08, "bandpass", 5);
    this._oscAt("sine", 60, 0.8, 0.15, 0.2);
    this._noiseAt(0.5, 1200, 0.1, 0.3);
  },

  _plague() {
    // Sickly bubbling
    this._filteredOsc("sawtooth", 100, 0.8, 0.12, 400, "lowpass", 5);
    this._filteredOsc("sawtooth", 133, 0.7, 0.08, 350, "lowpass", 3);
    this._noise(0.6, 300, 0.06, "lowpass", 8);
    for (let i = 0; i < 4; i++) {
      this._oscAt("sine", 80 + Math.random() * 60, 0.15, 0.06, i * 0.18);
    }
  },

  _stealth() {
    // Phasing whoosh
    this._sweep("sine", 800, 300, 0.35, 0.08);
    this._sweep("sine", 600, 200, 0.3, 0.06);
    this._noise(0.25, 2000, 0.05, "bandpass", 6);
    this._oscAt("sine", 400, 0.2, 0.04, 0.15);
  },

  _disrupt() {
    this._filteredOsc("sawtooth", 250, 0.2, 0.12, 800, "lowpass", 4);
    this._osc("square", 200, 0.12, 0.08, 15);
    this._noise(0.1, 1500, 0.06);
  },

  _goldMine() {
    // Coin clink
    const freqs = [1400, 1800, 2200];
    freqs.forEach((f, i) => {
      this._oscAt("square", f, 0.04, 0.08, i * 0.04);
      this._oscAt("sine", f * 1.5, 0.03, 0.03, i * 0.04 + 0.01);
    });
    this._noise(0.06, 8000, 0.04, "highpass", 2);
  },

  _shredder() {
    this._noise(0.15, 5000, 0.15, "lowpass", 3);
    this._noise(0.1, 8000, 0.06, "bandpass", 6);
    this._osc("sawtooth", 400, 0.08, 0.06, 25);
  },

  // --- New sound types ---

  _towerPlace() {
    // Satisfying thud + confirmation tone
    this._sweep("sine", 300, 80, 0.2, 0.2);
    this._noise(0.12, 600, 0.1);
    this._oscAt("triangle", 523, 0.2, 0.1, 0.08);
    this._oscAt("triangle", 659, 0.18, 0.07, 0.12);
  },

  _towerUpgrade() {
    // Ascending sparkle
    const notes = [440, 554, 659, 880, 1047];
    notes.forEach((f, i) => {
      this._oscAt("sine", f, 0.25, 0.08, i * 0.06);
      this._oscAt("triangle", f * 2, 0.12, 0.03, i * 0.06 + 0.02);
    });
    this._noiseAt(0.4, 6000, 0.04, 0.1, "highpass");
    this._noiseAt(0.2, 8000, 0.03, 0.25, "highpass", 3);
  },

  _towerSell() {
    // Descending with coin sounds
    this._sweep("triangle", 800, 200, 0.25, 0.1);
    this._oscAt("square", 2000, 0.03, 0.06, 0.05);
    this._oscAt("square", 2400, 0.03, 0.05, 0.1);
    this._oscAt("square", 1800, 0.03, 0.04, 0.15);
    this._noise(0.15, 3000, 0.04, "highpass");
  },

  _waveStart() {
    // War horn / alarm
    this._filteredOsc("sawtooth", 220, 0.8, 0.12, 600, "lowpass", 2);
    this._filteredOsc("sawtooth", 221, 0.75, 0.1, 550, "lowpass", 2);
    this._filteredOsc("triangle", 110, 0.6, 0.08, 400);
    this._oscAt("sine", 330, 0.5, 0.06, 0.2);
    this._noiseAt(0.3, 500, 0.04, 0.1);
  },

  _waveClear() {
    // Triumphant fanfare
    const melody = [523, 659, 784, 1047];
    melody.forEach((f, i) => {
      this._oscAt("triangle", f, 0.35, 0.12, i * 0.12);
      this._oscAt("sine", f, 0.3, 0.08, i * 0.12 + 0.02);
    });
    // Final chord
    this._oscAt("sine", 1047, 0.8, 0.1, 0.5);
    this._oscAt("sine", 784, 0.8, 0.07, 0.5);
    this._oscAt("sine", 659, 0.8, 0.06, 0.5);
    this._noiseAt(0.5, 6000, 0.03, 0.5, "highpass");
  },

  _mathCorrect() {
    // Happy bright ding
    this._osc("sine", 880, 0.2, 0.12);
    this._osc("sine", 1320, 0.15, 0.06, 3);
    this._oscAt("triangle", 1760, 0.12, 0.05, 0.05);
    this._noiseAt(0.08, 8000, 0.02, 0.02, "highpass");
  },

  _mathWrong() {
    // Buzzer
    this._filteredOsc("sawtooth", 150, 0.3, 0.15, 400, "lowpass", 3);
    this._filteredOsc("square", 148, 0.25, 0.08, 350, "lowpass", 2);
    this._noise(0.15, 300, 0.06, "lowpass", 4);
  },

  _buttonClick() {
    this._osc("sine", 1000, 0.05, 0.1);
    this._osc("square", 1500, 0.03, 0.04);
    this._noise(0.02, 4000, 0.03);
  },

  _comboHit() {
    // Energetic impact + rising tone
    this._sweep("sine", 400, 1200, 0.2, 0.12);
    this._noise(0.1, 2000, 0.1);
    this._osc("square", 800, 0.08, 0.06, 10);
    this._oscAt("triangle", 1600, 0.1, 0.05, 0.05);
  },

  _achievementUnlock() {
    // Grand ascending with sparkle
    const notes = [523, 659, 784, 1047, 1319, 1568];
    notes.forEach((f, i) => {
      this._oscAt("sine", f, 0.4, 0.09, i * 0.1);
      this._oscAt("triangle", f * 1.5, 0.2, 0.03, i * 0.1 + 0.03);
    });
    // Sustained chord
    this._oscAt("sine", 1047, 1.0, 0.08, 0.6);
    this._oscAt("sine", 1319, 1.0, 0.06, 0.6);
    this._oscAt("sine", 1568, 1.0, 0.06, 0.6);
    this._noiseAt(0.6, 6000, 0.03, 0.6, "highpass");
    this._noiseAt(0.3, 10000, 0.02, 0.9, "highpass", 3);
  },

  _castleHit() {
    // Heavy impact + alarm
    this._sweep("sine", 150, 30, 0.4, 0.25);
    this._noise(0.3, 1000, 0.18, "lowpass", 2);
    this._osc("square", 60, 0.25, 0.12);
    this._noiseAt(0.15, 2000, 0.08, 0.1, "bandpass", 4);
    // Warning tone
    this._oscAt("square", 440, 0.15, 0.06, 0.15);
    this._oscAt("square", 440, 0.15, 0.05, 0.35);
  },

  _wizardCast() {
    // Magical channeling
    this._sweep("sine", 400, 1200, 0.4, 0.1);
    this._filteredOsc("triangle", 600, 0.35, 0.08, 2000, "lowpass", 2, 5);
    this._filteredOsc("sine", 800, 0.3, 0.06, 2500, "lowpass", 1, -5);
    this._noise(0.25, 5000, 0.04, "highpass", 3);
    this._noiseAt(0.15, 3000, 0.03, 0.1, "bandpass", 6);
  },

  _wizardLevelup() {
    // Power surge + ascending
    const notes = [330, 440, 554, 659, 880, 1047, 1319];
    notes.forEach((f, i) => {
      this._oscAt("sine", f, 0.3, 0.07, i * 0.08);
      this._oscAt("triangle", f * 2, 0.15, 0.03, i * 0.08 + 0.02);
    });
    // Power burst
    this._noiseAt(0.5, 4000, 0.06, 0.4, "highpass");
    // Sustain chord
    this._oscAt("sine", 1047, 1.2, 0.1, 0.6);
    this._oscAt("sine", 1319, 1.2, 0.07, 0.6);
    this._oscAt("sine", 1568, 1.2, 0.07, 0.6);
    this._oscAt("triangle", 523, 1.0, 0.05, 0.65);
  },

  _gameStart() {
    // Epic intro
    this._filteredOsc("sawtooth", 130, 0.6, 0.1, 400, "lowpass", 2);
    this._filteredOsc("sawtooth", 131, 0.55, 0.08, 380, "lowpass", 2);
    this._oscAt("triangle", 261, 0.4, 0.08, 0.2);
    this._oscAt("sine", 523, 0.3, 0.06, 0.35);
    this._oscAt("triangle", 659, 0.25, 0.07, 0.45);
    this._oscAt("sine", 784, 0.5, 0.1, 0.55);
    this._noiseAt(0.3, 4000, 0.04, 0.5, "highpass");
  },

  _menuHover() {
    this._osc("sine", 1200, 0.04, 0.06);
    this._osc("triangle", 1800, 0.03, 0.02);
  },

  // --- Main play method ---

  play(sound) {
    if (!this.isReady || !this.audioContext) return;

    try {
      const now = this.audioContext.currentTime;
      if (
        this.cooldowns[sound] &&
        now < (this.lastPlayTimes[sound] || 0) + this.cooldowns[sound]
      )
        return;
      this.lastPlayTimes[sound] = now;

      // CC0 실물 샘플이 준비돼 있으면 그걸 쓴다. 없으면 아래 절차 합성으로 떨어진다.
      const sample = this.samples.get(sound);
      if (sample) {
        this._playSample(sample, SAMPLE_GAIN[sound]);
        return;
      }

      switch (sound) {
        case "laser":
          this._laser();
          break;
        case "hit":
          this._hit();
          break;
        case "explosion":
          this._explosion();
          break;
        case "powerup":
          this._powerup();
          break;
        case "blip":
          this._blip();
          break;
        case "frost":
          this._frost();
          break;
        case "lightning":
          this._lightning();
          break;
        case "wizard-auto":
          this._wizardAuto();
          break;
        case "skyDestroyer":
          this._skyDestroyer();
          break;
        case "plague":
          this._plague();
          break;
        case "stealth":
          this._stealth();
          break;
        case "disrupt":
          this._disrupt();
          break;
        case "goldMine":
          this._goldMine();
          break;
        case "shredder":
          this._shredder();
          break;
        case "repair":
          this._powerup();
          break;

        // New sounds
        case "tower_place":
          this._towerPlace();
          break;
        case "tower_upgrade":
          this._towerUpgrade();
          break;
        case "tower_sell":
          this._towerSell();
          break;
        case "wave_start":
          this._waveStart();
          break;
        case "wave_clear":
          this._waveClear();
          break;
        case "math_correct":
          this._mathCorrect();
          break;
        case "math_wrong":
          this._mathWrong();
          break;
        case "button_click":
          this._buttonClick();
          break;
        case "combo_hit":
          this._comboHit();
          break;
        case "achievement_unlock":
          this._achievementUnlock();
          break;
        case "castle_hit":
          this._castleHit();
          break;
        case "wizard_cast":
          this._wizardCast();
          break;
        case "wizard_levelup":
          this._wizardLevelup();
          break;
        case "game_start":
          this._gameStart();
          break;
        case "menu_hover":
          this._menuHover();
          break;

        default:
          this._blip();
          break;
      }
    } catch (error) {
      console.warn("SFX Error:", error);
    }
  },
};
