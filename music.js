// music.js - Professional procedural music system (Web Audio API)
// 5 tracks: menu, gameplay, boss, victory, defeat
// Dynamic layering based on intensity, smooth crossfades, rich instrumentation

const NOTE = {
  C2: 65.41,
  D2: 73.42,
  E2: 82.41,
  F2: 87.31,
  G2: 98.0,
  A2: 110.0,
  Bb2: 116.54,
  B2: 123.47,
  C3: 130.81,
  D3: 146.83,
  Eb3: 155.56,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  Ab3: 207.65,
  A3: 220.0,
  Bb3: 233.08,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  Eb4: 311.13,
  E4: 329.63,
  F4: 349.23,
  Gb4: 369.99,
  G4: 392.0,
  Ab4: 415.3,
  A4: 440.0,
  Bb4: 466.16,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  Eb5: 622.25,
  E5: 659.25,
  F5: 698.46,
  Gb5: 739.99,
  G5: 783.99,
  Ab5: 830.61,
  A5: 880.0,
  Bb5: 932.33,
  B5: 987.77,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
};

// --- Track Definitions ---

const TRACKS = {
  menu: {
    bpm: 72,
    swing: 0.05,
    sections: [
      {
        // Section A - Ethereal
        chords: [
          [NOTE.A3, NOTE.C4, NOTE.E4], // Am
          [NOTE.F3, NOTE.A3, NOTE.C4], // F
          [NOTE.C4, NOTE.E4, NOTE.G4], // C
          [NOTE.G3, NOTE.B3, NOTE.D4], // G
        ],
        bass: [NOTE.A2, NOTE.F2, NOTE.C3, NOTE.G2],
        melody: [
          NOTE.E5,
          0,
          NOTE.C5,
          NOTE.D5,
          NOTE.E5,
          0,
          NOTE.A4,
          0,
          NOTE.F5,
          0,
          NOTE.C5,
          NOTE.D5,
          NOTE.C5,
          0,
          NOTE.A4,
          0,
          NOTE.G5,
          0,
          NOTE.E5,
          NOTE.F5,
          NOTE.G5,
          0,
          NOTE.E5,
          0,
          NOTE.D5,
          0,
          NOTE.B4,
          NOTE.C5,
          NOTE.D5,
          0,
          NOTE.G4,
          0,
        ],
      },
      {
        // Section B - Contemplative
        chords: [
          [NOTE.D4, NOTE.F4, NOTE.A4], // Dm
          [NOTE.Bb3, NOTE.D4, NOTE.F4], // Bb
          [NOTE.A3, NOTE.C4, NOTE.E4], // Am
          [NOTE.E3, NOTE.G3, NOTE.B3], // Em
        ],
        bass: [NOTE.D3, NOTE.Bb2, NOTE.A2, NOTE.E2],
        melody: [
          NOTE.A5,
          0,
          NOTE.F5,
          NOTE.E5,
          NOTE.D5,
          0,
          NOTE.A4,
          0,
          NOTE.F5,
          0,
          NOTE.D5,
          NOTE.C5,
          NOTE.Bb4,
          0,
          NOTE.F4,
          0,
          NOTE.E5,
          0,
          NOTE.C5,
          NOTE.B4,
          NOTE.A4,
          0,
          NOTE.E4,
          0,
          NOTE.B4,
          0,
          NOTE.G4,
          NOTE.A4,
          NOTE.B4,
          0,
          NOTE.E4,
          0,
        ],
      },
    ],
    padWave: "sine",
    padFilterFreq: 800,
    melodyWave: "triangle",
    melodyFilterFreq: 2500,
    arpWave: "sine",
  },

  gameplay: {
    bpm: 108,
    swing: 0,
    sections: [
      {
        // Section A - Driving
        chords: [
          [NOTE.C4, NOTE.Eb4, NOTE.G4], // Cm
          [NOTE.Eb4, NOTE.G4, NOTE.Bb4], // Eb
          [NOTE.Bb3, NOTE.D4, NOTE.F4], // Bb
          [NOTE.F3, NOTE.A3, NOTE.C4], // F
        ],
        bass: [NOTE.C3, NOTE.Eb3, NOTE.Bb2, NOTE.F2],
        melody: [
          NOTE.G5,
          NOTE.Eb5,
          NOTE.C5,
          0,
          NOTE.G4,
          0,
          NOTE.C5,
          NOTE.Eb5,
          NOTE.Bb5,
          NOTE.G5,
          NOTE.Eb5,
          0,
          NOTE.Bb4,
          0,
          NOTE.Eb5,
          NOTE.G5,
          NOTE.F5,
          NOTE.D5,
          NOTE.Bb4,
          0,
          NOTE.F4,
          0,
          NOTE.Bb4,
          NOTE.D5,
          NOTE.C5,
          NOTE.A4,
          NOTE.F4,
          0,
          NOTE.C4,
          0,
          NOTE.F4,
          NOTE.A4,
        ],
      },
      {
        // Section B - Tense
        chords: [
          [NOTE.Ab3, NOTE.C4, NOTE.Eb4], // Ab
          [NOTE.Eb4, NOTE.G4, NOTE.Bb4], // Eb
          [NOTE.F3, NOTE.Ab3, NOTE.C4], // Fm
          [NOTE.G3, NOTE.B3, NOTE.D4], // G
        ],
        bass: [NOTE.Ab3, NOTE.Eb3, NOTE.F2, NOTE.G2],
        melody: [
          NOTE.Eb5,
          NOTE.C5,
          NOTE.Ab4,
          0,
          NOTE.Eb5,
          NOTE.C5,
          NOTE.Ab4,
          0,
          NOTE.Bb5,
          NOTE.G5,
          NOTE.Eb5,
          0,
          NOTE.G5,
          0,
          NOTE.Eb5,
          0,
          NOTE.C5,
          NOTE.Ab4,
          NOTE.F4,
          0,
          NOTE.C5,
          NOTE.Ab4,
          NOTE.F4,
          0,
          NOTE.D5,
          NOTE.B4,
          NOTE.G4,
          0,
          NOTE.D5,
          0,
          NOTE.B4,
          0,
        ],
      },
    ],
    padWave: "sawtooth",
    padFilterFreq: 600,
    melodyWave: "square",
    melodyFilterFreq: 2000,
    arpWave: "triangle",
  },

  boss: {
    bpm: 140,
    swing: 0,
    sections: [
      {
        // Section A - Aggressive
        chords: [
          [NOTE.D4, NOTE.F4, NOTE.A4], // Dm
          [NOTE.Bb3, NOTE.D4, NOTE.F4], // Bb
          [NOTE.G3, NOTE.Bb3, NOTE.D4], // Gm
          [NOTE.A3, NOTE.C4, NOTE.E4], // A
        ],
        bass: [NOTE.D2, NOTE.Bb2, NOTE.G2, NOTE.A2],
        melody: [
          NOTE.A5,
          NOTE.F5,
          NOTE.D5,
          NOTE.A4,
          NOTE.F5,
          NOTE.D5,
          NOTE.A4,
          NOTE.F4,
          NOTE.F5,
          NOTE.D5,
          NOTE.Bb4,
          NOTE.F4,
          NOTE.D5,
          NOTE.Bb4,
          NOTE.F4,
          NOTE.D4,
          NOTE.D5,
          NOTE.Bb4,
          NOTE.G4,
          NOTE.D4,
          NOTE.Bb4,
          NOTE.G4,
          NOTE.D4,
          NOTE.Bb3,
          NOTE.E5,
          NOTE.C5,
          NOTE.A4,
          NOTE.E4,
          NOTE.C5,
          NOTE.A4,
          NOTE.E4,
          NOTE.C4,
        ],
      },
      {
        // Section B - Chaotic
        chords: [
          [NOTE.E3, NOTE.G3, NOTE.B3], // Em
          [NOTE.C4, NOTE.E4, NOTE.G4], // C
          [NOTE.D4, NOTE.F4, NOTE.A4], // Dm
          [NOTE.Bb3, NOTE.D4, NOTE.Gb4], // Bdim-ish
        ],
        bass: [NOTE.E2, NOTE.C3, NOTE.D3, NOTE.Bb2],
        melody: [
          NOTE.B5,
          NOTE.G5,
          NOTE.E5,
          NOTE.B4,
          NOTE.G5,
          NOTE.E5,
          NOTE.B4,
          NOTE.G4,
          NOTE.G5,
          NOTE.E5,
          NOTE.C5,
          NOTE.G4,
          NOTE.E5,
          NOTE.C5,
          NOTE.G4,
          NOTE.E4,
          NOTE.A5,
          NOTE.F5,
          NOTE.D5,
          NOTE.A4,
          NOTE.F5,
          NOTE.D5,
          NOTE.A4,
          NOTE.F4,
          NOTE.Gb5,
          NOTE.D5,
          NOTE.Bb4,
          NOTE.Gb4,
          NOTE.D5,
          NOTE.Bb4,
          NOTE.Gb4,
          NOTE.D4,
        ],
      },
      {
        // Section C - Relentless
        chords: [
          [NOTE.F3, NOTE.Ab3, NOTE.C4], // Fm
          [NOTE.Eb3, NOTE.G3, NOTE.Bb3], // Eb
          [NOTE.D3, NOTE.F3, NOTE.Ab3], // Dm(b5) / dim feel
          [NOTE.C3, NOTE.Eb3, NOTE.G3], // Cm
        ],
        bass: [NOTE.F2, NOTE.Eb3, NOTE.D2, NOTE.C2],
        melody: [
          NOTE.C6,
          NOTE.Ab5,
          NOTE.F5,
          NOTE.C5,
          NOTE.Ab5,
          NOTE.F5,
          NOTE.C5,
          NOTE.Ab4,
          NOTE.Bb5,
          NOTE.G5,
          NOTE.Eb5,
          NOTE.Bb4,
          NOTE.G5,
          NOTE.Eb5,
          NOTE.Bb4,
          NOTE.G4,
          NOTE.Ab5,
          NOTE.F5,
          NOTE.D5,
          NOTE.Ab4,
          NOTE.F5,
          NOTE.D5,
          NOTE.Ab4,
          NOTE.F4,
          NOTE.G5,
          NOTE.Eb5,
          NOTE.C5,
          NOTE.G4,
          NOTE.Eb5,
          NOTE.C5,
          NOTE.G4,
          NOTE.Eb4,
        ],
      },
    ],
    padWave: "sawtooth",
    padFilterFreq: 500,
    melodyWave: "sawtooth",
    melodyFilterFreq: 1800,
    arpWave: "square",
  },
};

// --- Victory / Defeat one-shot definitions (not looping) ---

const VICTORY_MELODY = [
  { note: NOTE.C5, dur: 0.2 },
  { note: NOTE.E5, dur: 0.2 },
  { note: NOTE.G5, dur: 0.2 },
  { note: NOTE.C6, dur: 0.4 },
  { note: 0, dur: 0.15 },
  { note: NOTE.B5, dur: 0.15 },
  { note: NOTE.C6, dur: 0.6 },
  { note: NOTE.G5, dur: 0.3 },
  { note: NOTE.E5, dur: 0.3 },
  { note: NOTE.C5, dur: 0.8 },
];

const VICTORY_CHORDS = [
  { notes: [NOTE.C4, NOTE.E4, NOTE.G4], dur: 0.8 },
  { notes: [NOTE.C4, NOTE.E4, NOTE.G4], dur: 0.8 },
  { notes: [NOTE.F4, NOTE.A4, NOTE.C5], dur: 0.6 },
  { notes: [NOTE.G4, NOTE.B4, NOTE.D5], dur: 0.6 },
  { notes: [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5], dur: 1.5 },
];

const DEFEAT_MELODY = [
  { note: NOTE.E5, dur: 0.4 },
  { note: NOTE.D5, dur: 0.4 },
  { note: NOTE.C5, dur: 0.4 },
  { note: NOTE.B4, dur: 0.3 },
  { note: NOTE.A4, dur: 0.5 },
  { note: 0, dur: 0.2 },
  { note: NOTE.G4, dur: 0.4 },
  { note: NOTE.E4, dur: 1.0 },
];

const DEFEAT_CHORDS = [
  { notes: [NOTE.A3, NOTE.C4, NOTE.E4], dur: 1.2 },
  { notes: [NOTE.F3, NOTE.A3, NOTE.C4], dur: 0.8 },
  { notes: [NOTE.D3, NOTE.F3, NOTE.A3], dur: 0.8 },
  { notes: [NOTE.A3, NOTE.C4, NOTE.E4], dur: 1.5 },
];

// --- Wave Clear Celebration ---

const WAVE_CLEAR_MELODY = [
  { note: NOTE.G5, dur: 0.12 },
  { note: NOTE.A5, dur: 0.12 },
  { note: NOTE.B5, dur: 0.12 },
  { note: NOTE.C6, dur: 0.35 },
  { note: NOTE.E6, dur: 0.5 },
];

const WAVE_CLEAR_CHORDS = [
  { notes: [NOTE.C4, NOTE.E4, NOTE.G4], dur: 0.5 },
  { notes: [NOTE.F4, NOTE.A4, NOTE.C5], dur: 0.5 },
  { notes: [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5], dur: 0.8 },
];

export class MusicSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.volume = 0.3;
    this.intensity = 0.5;
    this.currentTrack = null;
    this.isPlaying = false;
    this.schedulerTimer = null;
    this.stepIndex = 0;
    this.sectionIndex = 0;
    this.sectionLength = 128; // steps per section before advancing
    this.stepsInSection = 0;

    // Sub-layer gain nodes for fine control
    this.bassGain = null;
    this.padGain = null;
    this.arpGain = null;
    this.melodyGain = null;
    this.percGain = null;
    this.hihatGain = null;

    // Reverb convolver
    this.reverbNode = null;
    this.reverbGain = null;
    this.dryGain = null;

    // v6.1: CC0 실물 BGM (assets/audio/bgm/*.mp3) — 아래 절차 합성은 로드 실패 시 폴백으로 남는다.
    //
    // v9(웨일북): 예전엔 mp3를 통째로 decodeAudioData 해서 AudioBuffer로 들고 있었다.
    //   그 대가가 실측으로 확인됐다 — 원본 2.98MB → **PCM 92MB**
    //   (gameplay.mp3 한 곡이 186초·2ch·48kHz = **68.2MB**, 디코드에 M맥에서도 686ms).
    //   4GB짜리 웨일북에서는 이 한 방이 메모리를 밀어내고, 디코드 자체가 게임 시작
    //   직후를 수 초 얼린다. 그래서 <audio> 스트리밍으로 바꿨다 — 재생 중 메모리는
    //   버퍼 몇 MB, 디코드는 재생하면서 조금씩. 볼륨·페이드는 masterGain 경유라 그대로다.
    this._trackEls = new Map(); // name → HTMLAudioElement (MediaElementSource 연결 완료)
    this._trackFailed = new Set();
    this._trackEl = null; // 지금 울리고 있는 element
  }

  /**
   * 트랙용 <audio>를 만들어 Web Audio 그래프에 물린다(트랙당 한 번만).
   * ⚠️ createMediaElementSource는 element당 1회만 부를 수 있다 — 그래서 캐시한다.
   */
  _getTrackEl(name) {
    const cached = this._trackEls.get(name);
    if (cached) return cached;

    const el = new Audio(`assets/audio/bgm/${name}.mp3`);
    el.loop = true;
    el.preload = "auto";
    // 파일이 없거나 디코드 못 하면(Pages는 없는 경로에 index.html을 200으로 준다)
    // 이 트랙은 앞으로 절차 합성으로 간다 — 예전 decodeAudioData 실패 경로와 같은 처리.
    el.addEventListener("error", () => {
      this._trackFailed.add(name);
      this._trackEls.delete(name);
      if (this.currentTrack === name && this.isPlaying) {
        this.setIntensity(this.intensity);
        this._startScheduler();
      }
    });

    try {
      this.ctx.createMediaElementSource(el).connect(this.masterGain);
    } catch {
      // ⚠️ 여기서 실패 마킹을 빼면 play()를 부를 때마다 새 <audio>와 error 리스너가
      //    쌓이고, 그 각각이 나중에 _startScheduler를 불러 setInterval이 고아로 남는다
      //    (구 _loadTrack은 _trackFailed로 이 재진입을 막고 있었다 — 그 보장을 복원).
      this._trackFailed.add(name);
      return null; // 그래프 연결 실패 → 절차 합성으로
    }
    this._trackEls.set(name, el);
    return el;
  }

  /** 파일 BGM을 루프 재생한다. 절차 스케줄러와 달리 element 하나로 끝난다. */
  _playTrackStream(name) {
    this._stopTrackNode();
    const el = this._getTrackEl(name);
    if (!el) return false;
    try {
      el.currentTime = 0;
    } catch {
      /* 아직 메타데이터 전이면 무시 — 어차피 처음부터 난다 */
    }
    this._trackEl = el;
    // 자동재생 정책 등으로 거절될 수 있다. 이걸 조용히 삼키면 **완전 무음**이 된다 —
    // 파일도 안 나고, play()는 이미 성공으로 알고 절차 합성도 안 켰기 때문이다.
    // (게다가 currentTrack이 세팅돼 있어 같은 트랙 재요청은 dedup에 걸려 재시도도 없다.)
    // 그래서 거절되면 절차 합성으로 떨어뜨린다. _trackFailed에는 넣지 않는다 —
    // 파일이 없는 게 아니라 "지금은 못 트는 것"이라 다음 전환에선 다시 시도해야 한다.
    const pr = el.play();
    if (pr && pr.catch) {
      pr.catch((err) => {
        console.warn(
          `[music] ${name} 파일 재생 거절 — 절차 합성으로 대체:`,
          (err && err.name) || err,
        );
        if (this.currentTrack === name && this.isPlaying && this._trackEl === el) {
          this._stopTrackNode();
          this.setIntensity(this.intensity);
          this._startScheduler();
        }
      });
    }
    // 절차 재생과 동일하게 페이드 인 — 트랙 전환이 뚝 끊기지 않게
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      this.masterGain.gain.setTargetAtTime(
        this.volume,
        this.ctx.currentTime + 0.05,
        0.4,
      );
    }
    return true;
  }

  _stopTrackNode() {
    if (!this._trackEl) return;
    try {
      this._trackEl.pause();
    } catch {
      /* 이미 멈춘 element */
    }
    this._trackEl = null;
  }

  init() {
    // v5 버그픽스: Promise 반환 (미반환 시 main.js .then() 크래시 → BGM 영구 무음이던 버그)
    if (this.ctx) return Promise.resolve();
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;

      // Create dry/wet routing for reverb
      this.dryGain = this.ctx.createGain();
      this.dryGain.gain.value = 0.85;
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.value = 0.15;

      // Simple reverb using delay + feedback
      this._createReverb();

      this.dryGain.connect(this.masterGain);
      this.reverbGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Sub-layer gain nodes
      this.bassGain = this._createLayerGain(0.12);
      this.padGain = this._createLayerGain(0.06);
      this.arpGain = this._createLayerGain(0.04);
      this.melodyGain = this._createLayerGain(0.06);
      this.percGain = this._createLayerGain(0.08);
      this.hihatGain = this._createLayerGain(0.03);

      if (this.ctx.state === "suspended") return this.ctx.resume();
      return Promise.resolve();
    } catch (e) {
      console.warn("MusicSystem: AudioContext init failed", e);
      return Promise.resolve();
    }
  }

  _createLayerGain(vol) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(this.dryGain);
    g.connect(this.reverbGain);
    return g;
  }

  _createReverb() {
    // Algorithmic reverb via multiple delay lines
    const delays = [0.037, 0.061, 0.089, 0.113];
    const feedbacks = [0.3, 0.25, 0.2, 0.15];
    this._reverbDelays = delays.map((time, i) => {
      const delay = this.ctx.createDelay(0.2);
      delay.delayTime.value = time;
      const fb = this.ctx.createGain();
      fb.gain.value = feedbacks[i];
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 2000 - i * 300;
      delay.connect(filter);
      filter.connect(fb);
      fb.connect(delay); // feedback loop
      return { delay, fb, filter };
    });
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.volume,
        this.ctx.currentTime,
        0.05,
      );
    }
  }

  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Dynamically adjust layer volumes based on intensity
    if (this.padGain)
      this.padGain.gain.setTargetAtTime(0.04 + this.intensity * 0.06, t, 0.3);
    if (this.arpGain)
      this.arpGain.gain.setTargetAtTime(
        this.intensity > 0.35 ? 0.03 + this.intensity * 0.04 : 0,
        t,
        0.3,
      );
    if (this.melodyGain)
      this.melodyGain.gain.setTargetAtTime(
        this.intensity > 0.55 ? 0.04 + this.intensity * 0.05 : 0,
        t,
        0.3,
      );
    if (this.percGain)
      this.percGain.gain.setTargetAtTime(
        this.intensity > 0.7 ? 0.06 + this.intensity * 0.06 : 0,
        t,
        0.3,
      );
    if (this.hihatGain)
      this.hihatGain.gain.setTargetAtTime(
        this.intensity > 0.5 ? 0.02 + this.intensity * 0.03 : 0,
        t,
        0.3,
      );
    // More reverb at lower intensity for atmosphere
    if (this.reverbGain)
      this.reverbGain.gain.setTargetAtTime(
        0.25 - this.intensity * 0.15,
        t,
        0.3,
      );
  }

  play(trackName) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;

    if (this.currentTrack === trackName && this.isPlaying) return;

    // One-shot tracks
    if (trackName === "victory") {
      this._playOneShot(VICTORY_MELODY, VICTORY_CHORDS, 130);
      return;
    }
    if (trackName === "defeat") {
      this._playOneShot(DEFEAT_MELODY, DEFEAT_CHORDS, 70);
      return;
    }
    if (trackName === "wave_clear") {
      this._playOneShot(WAVE_CLEAR_MELODY, WAVE_CLEAR_CHORDS, 140);
      return;
    }

    // Looping tracks
    if (this.isPlaying) this._stopScheduler();
    this._stopTrackNode();

    this.currentTrack = trackName;
    this.isPlaying = true;
    this.stepIndex = 0;
    this.sectionIndex = 0;
    this.stepsInSection = 0;

    // CC0 실물 곡을 스트리밍으로 튼다. 통째로 디코드하지 않으므로 기다릴 것도,
    // 미리 받아둘 것도 없다 — element가 알아서 버퍼링하며 난다.
    if (!this._trackFailed.has(trackName) && this._playTrackStream(trackName)) {
      return;
    }

    // Fade in
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      this.masterGain.gain.setTargetAtTime(
        this.volume,
        this.ctx.currentTime + 0.05,
        0.4,
      );
    }

    // Apply current intensity levels
    this.setIntensity(this.intensity);
    this._startScheduler();
  }

  stop() {
    if (!this.ctx || !this.isPlaying) return;
    this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
    setTimeout(() => {
      this._stopScheduler();
      this._stopTrackNode(); // 파일 트랙도 같이 멈춘다(안 그러면 페이드만 되고 계속 돈다)
    }, 800);
  }

  // --- Scheduler ---

  _startScheduler() {
    const track = TRACKS[this.currentTrack];
    if (!track) return;
    // 이미 돌고 있으면 그 타이머를 먼저 거둔다. 안 그러면 참조를 잃은 setInterval이
    // 영원히 남아(_stopScheduler는 "지금 아는" 타이머만 끈다) 저사양 기기에서
    // 쓸데없이 CPU를 먹는다 — 고치려던 것과 정반대가 된다.
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    const beatMs = 60000 / track.bpm;
    this.schedulerTimer = setInterval(() => this._onBeat(track), beatMs);
  }

  _stopScheduler() {
    this.isPlaying = false;
    this.currentTrack = null;
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  _onBeat(track) {
    if (!this.ctx || !this.isPlaying) return;

    const section = track.sections[this.sectionIndex % track.sections.length];
    const t = this.ctx.currentTime;
    const beatDur = 60 / track.bpm;
    const chordIdx = Math.floor(this.stepIndex / 4) % section.chords.length;
    const melodyIdx = this.stepIndex % section.melody.length;

    // Apply swing
    const swingOffset =
      this.stepIndex % 2 === 1 ? (track.swing || 0) * beatDur : 0;

    // --- Layer 1: Bass (always plays) ---
    if (this.stepIndex % 4 === 0) {
      this._playBass(section.bass[chordIdx], beatDur * 3.5);
    }
    // Sub-bass octave on beat 1
    if (this.stepIndex % 16 === 0) {
      this._playSubBass(section.bass[chordIdx] / 2, beatDur * 7);
    }

    // --- Layer 2: Pad / Chords (intensity >= 0.15) ---
    if (this.intensity >= 0.15 && this.stepIndex % 4 === 0) {
      const chord = section.chords[chordIdx];
      this._playPad(chord, beatDur * 3.8, track.padWave, track.padFilterFreq);
    }

    // --- Layer 3: Arpeggios (intensity >= 0.35) ---
    if (this.intensity >= 0.35) {
      const chord = section.chords[chordIdx];
      const arpNote = chord[this.stepIndex % chord.length];
      this._playArp(arpNote * 2, beatDur * 0.7, track.arpWave, swingOffset);
    }

    // --- Layer 4: Melody (intensity >= 0.55) ---
    if (this.intensity >= 0.55 && this.stepIndex % 2 === 0) {
      const melNote = section.melody[melodyIdx];
      if (melNote > 0) {
        this._playMelody(
          melNote,
          beatDur * 1.4,
          track.melodyWave,
          track.melodyFilterFreq,
        );
      }
    }

    // --- Layer 5: Kick drum (intensity >= 0.7) ---
    if (this.intensity >= 0.7 && this.stepIndex % 4 === 0) {
      this._playKick(t, beatDur * 0.25);
    }

    // --- Layer 6: Hi-hat (intensity >= 0.5) ---
    if (this.intensity >= 0.5) {
      this._playHihat(t + swingOffset, beatDur * 0.08);
      // Open hi-hat on off-beats
      if (this.stepIndex % 2 === 1 && this.intensity >= 0.65) {
        this._playOpenHihat(t + swingOffset, beatDur * 0.2);
      }
    }

    // --- Layer 7: Snare (intensity >= 0.8) ---
    if (this.intensity >= 0.8 && this.stepIndex % 8 === 4) {
      this._playSnare(t, beatDur * 0.2);
    }

    // Advance section periodically
    this.stepsInSection++;
    if (this.stepsInSection >= this.sectionLength) {
      this.stepsInSection = 0;
      this.sectionIndex++;
    }

    this.stepIndex++;
  }

  // --- Instrument renderers ---

  _playBass(freq, dur) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();

    osc.type = "triangle";
    osc.frequency.value = freq;
    osc2.type = "sine";
    osc2.frequency.value = freq;

    f.type = "lowpass";
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(120, t + dur);
    f.Q.value = 1.5;

    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.02);
    g.gain.setValueAtTime(0.8, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);

    osc.connect(f);
    osc2.connect(f);
    f.connect(g);
    g.connect(this.bassGain);

    osc.start(t);
    osc.stop(t + dur + 0.05);
    osc2.start(t);
    osc2.stop(t + dur + 0.05);
  }

  _playSubBass(freq, dur) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = Math.max(freq, 30);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.05);
    g.gain.setValueAtTime(0.4, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g);
    g.connect(this.bassGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _playPad(chord, dur, waveType, filterFreq) {
    const t = this.ctx.currentTime;
    chord.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();

      osc.type = waveType || "sine";
      osc.frequency.value = freq;
      osc.detune.value = 5; // slight detuning for width
      osc2.type = "sine";
      osc2.frequency.value = freq;
      osc2.detune.value = -5;

      f.type = "lowpass";
      f.frequency.value = filterFreq || 800;
      f.Q.value = 0.5;

      // Slow attack for pad feel
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.6, t + 0.15);
      g.gain.setValueAtTime(0.5, t + dur * 0.7);
      g.gain.linearRampToValueAtTime(0, t + dur);

      osc.connect(f);
      osc2.connect(f);
      f.connect(g);
      g.connect(this.padGain);

      osc.start(t);
      osc.stop(t + dur + 0.05);
      osc2.start(t);
      osc2.stop(t + dur + 0.05);
    });
  }

  _playArp(freq, dur, waveType, swingOffset = 0) {
    const t = this.ctx.currentTime + swingOffset;
    const osc = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = waveType || "sine";
    osc.frequency.value = freq;

    f.type = "lowpass";
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(600, t + dur);
    f.Q.value = 2;

    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.7, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.01, t + dur);

    osc.connect(f);
    f.connect(g);
    g.connect(this.arpGain);

    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _playMelody(freq, dur, waveType, filterFreq) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = waveType || "triangle";
    osc.frequency.value = freq;
    osc2.type = "sine";
    osc2.frequency.value = freq;
    osc2.detune.value = 3;

    f.type = "lowpass";
    f.frequency.value = filterFreq || 2000;
    f.Q.value = 1;

    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.8, t + 0.03);
    g.gain.setValueAtTime(0.6, t + dur * 0.5);
    g.gain.linearRampToValueAtTime(0, t + dur);

    osc.connect(f);
    osc2.connect(f);
    f.connect(g);
    g.connect(this.melodyGain);

    osc.start(t);
    osc.stop(t + dur + 0.05);
    osc2.start(t);
    osc2.stop(t + dur + 0.05);
  }

  _playKick(t, dur) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + dur);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + dur);
    osc.connect(g);
    g.connect(this.percGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);

    // Click transient
    const click = this.ctx.createOscillator();
    const cg = this.ctx.createGain();
    click.type = "square";
    click.frequency.value = 800;
    cg.gain.setValueAtTime(0.3, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    click.connect(cg);
    cg.connect(this.percGain);
    click.start(t);
    click.stop(t + 0.02);
  }

  _playSnare(t, dur) {
    // Tone body
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 200;
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + dur * 0.6);
    osc.connect(g);
    g.connect(this.percGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);

    // Noise burst
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 1500;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.01, t + dur);
    src.connect(f);
    f.connect(ng);
    ng.connect(this.percGain);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  _playHihat(t, dur) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    f.Q.value = 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.hihatGain);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  _playOpenHihat(t, dur) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 8000;
    f.Q.value = 2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.linearRampToValueAtTime(0.15, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.01, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.hihatGain);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // --- One-shot tracks (victory, defeat, wave_clear) ---

  _playOneShot(melody, chords, bpm) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;

    // Stop current loop if any
    if (this.isPlaying) this._stopScheduler();
    // ⚠️ 스케줄러(절차 합성)만 끄고 파일 트랙을 안 끄면, 게임오버 징글이 울리는 동안
    //    전투 BGM이 계속 난다(실측: play("defeat") 후 1.2초 뒤에도 gameplay.mp3가
    //    2.67초 지점을 재생 중). 이 게임에서 실제로 도달하는 원샷은 defeat 하나뿐이라
    //    "게임오버인데 전투 음악이 안 꺼진다"로 그대로 드러난다.
    this._stopTrackNode();

    const beatDur = 60 / bpm;
    const t = this.ctx.currentTime;

    // Play chords
    let chordTime = 0;
    chords.forEach(({ notes, dur }) => {
      notes.forEach((freq) => {
        this._playShotNote(
          "sine",
          freq,
          dur * beatDur * 4,
          0.08,
          t + chordTime,
        );
        this._playShotNote(
          "triangle",
          freq,
          dur * beatDur * 3,
          0.03,
          t + chordTime,
          5,
        );
      });
      chordTime += dur;
    });

    // Play melody
    let melTime = 0;
    melody.forEach(({ note, dur }) => {
      if (note > 0) {
        this._playShotNote(
          "triangle",
          note,
          dur * beatDur * 3,
          0.14,
          t + melTime,
        );
        this._playShotNote(
          "sine",
          note,
          dur * beatDur * 2.5,
          0.06,
          t + melTime,
          3,
        );
      }
      melTime += dur;
    });
  }

  _playShotNote(type, freq, dur, gain, startTime, detune = 0) {
    const osc = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq;
    if (detune) osc.detune.value = detune;

    f.type = "lowpass";
    f.frequency.value = 3000;
    f.Q.value = 0.5;

    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(gain, startTime + 0.02);
    g.gain.setValueAtTime(gain * 0.7, startTime + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, startTime + dur);

    osc.connect(f);
    f.connect(g);
    g.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + dur + 0.05);
  }
}
