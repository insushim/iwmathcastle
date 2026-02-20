// music.js - 프로시저럴 배경음악 시스템 (Web Audio API)

// 음표 주파수 테이블
const NOTE = {
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
  G5: 783.99,
  A5: 880.0,
  Bb5: 932.33,
};

// 트랙별 코드 진행 정의
const TRACKS = {
  // 메뉴: Am - F - C - G (차분하고 신비로운 분위기)
  menu: {
    bpm: 80,
    chords: [
      [NOTE.A3, NOTE.C4, NOTE.E4], // Am
      [NOTE.F3, NOTE.A3, NOTE.C4], // F
      [NOTE.C4, NOTE.E4, NOTE.G4], // C
      [NOTE.G3, NOTE.B3, NOTE.D4], // G
    ],
    bassNotes: [NOTE.A3, NOTE.F3, NOTE.C3, NOTE.G3],
    melodyNotes: [
      NOTE.E5,
      NOTE.C5,
      NOTE.A4,
      NOTE.E5,
      NOTE.F5,
      NOTE.C5,
      NOTE.A4,
      NOTE.F4,
      NOTE.G5,
      NOTE.E5,
      NOTE.C5,
      NOTE.G4,
      NOTE.D5,
      NOTE.B4,
      NOTE.G4,
      NOTE.D4,
    ],
  },
  // 게임플레이: Cm - Eb - Bb - F (리드미컬하고 적당한 에너지)
  gameplay: {
    bpm: 100,
    chords: [
      [NOTE.C4, NOTE.Eb4, NOTE.G4], // Cm
      [NOTE.Eb4, NOTE.G4, NOTE.Bb4], // Eb
      [NOTE.Bb3, NOTE.D4, NOTE.F4], // Bb
      [NOTE.F3, NOTE.A3, NOTE.C4], // F
    ],
    bassNotes: [NOTE.C3, NOTE.Eb3, NOTE.Bb3, NOTE.F3],
    melodyNotes: [
      NOTE.G5,
      NOTE.Eb5,
      NOTE.C5,
      NOTE.G4,
      NOTE.Bb5,
      NOTE.G5,
      NOTE.Eb5,
      NOTE.Bb4,
      NOTE.F5,
      NOTE.D5,
      NOTE.Bb4,
      NOTE.F4,
      NOTE.C5,
      NOTE.A4,
      NOTE.F4,
      NOTE.C4,
    ],
  },
  // 보스: Dm - Bb - Gm - A (긴박하고 강렬한 분위기)
  boss: {
    bpm: 130,
    chords: [
      [NOTE.D4, NOTE.F4, NOTE.A4], // Dm
      [NOTE.Bb3, NOTE.D4, NOTE.F4], // Bb
      [NOTE.G3, NOTE.Bb3, NOTE.D4], // Gm
      [NOTE.A3, NOTE.C4, NOTE.E4], // A(감7 느낌)
    ],
    bassNotes: [NOTE.D3, NOTE.Bb3, NOTE.G3, NOTE.A3],
    melodyNotes: [
      NOTE.A5,
      NOTE.F5,
      NOTE.D5,
      NOTE.A4,
      NOTE.F5,
      NOTE.D5,
      NOTE.Bb4,
      NOTE.F4,
      NOTE.D5,
      NOTE.Bb4,
      NOTE.G4,
      NOTE.D4,
      NOTE.E5,
      NOTE.C5,
      NOTE.A4,
      NOTE.E4,
    ],
  },
};

export class MusicSystem {
  constructor() {
    this.ctx = null; // AudioContext
    this.masterGain = null; // 마스터 볼륨 노드
    this.volume = 0.35; // 기본 볼륨 (부드러운 배경음)
    this.intensity = 0.5; // 에너지 레벨 (0~1)
    this.currentTrack = null; // 현재 재생 중인 트랙 이름
    this.isPlaying = false;
    this.schedulerTimer = null; // 시퀀서 타이머 ID
    this.activeNodes = []; // 정리 대상 오디오 노드들
    this.stepIndex = 0; // 현재 시퀀서 스텝
  }

  // AudioContext 초기화
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
      if (this.ctx.state === "suspended") this.ctx.resume();
    } catch (e) {
      console.warn("MusicSystem: AudioContext 생성 실패", e);
    }
  }

  // 마스터 볼륨 설정 (0~1)
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.volume,
        this.ctx.currentTime,
        0.05,
      );
    }
  }

  // 에너지 레벨 설정 - 레이어 밀도 결정 (0~1)
  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  // 트랙 재생 (크로스페이드 전환)
  play(trackName) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;

    // 같은 트랙이면 무시
    if (this.currentTrack === trackName && this.isPlaying) return;

    // 단발성 트랙 (fanfare/somber)
    if (trackName === "victory") {
      this._playFanfare();
      return;
    }
    if (trackName === "defeat") {
      this._playDefeat();
      return;
    }

    // 루프 트랙 전환: 기존 트랙 페이드아웃
    if (this.isPlaying) this._stopScheduler();

    this.currentTrack = trackName;
    this.isPlaying = true;
    this.stepIndex = 0;

    // 페이드인
    this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
    this.masterGain.gain.setTargetAtTime(
      this.volume,
      this.ctx.currentTime + 0.05,
      0.3,
    );

    this._startScheduler();
  }

  // 정지 (페이드아웃)
  stop() {
    if (!this.ctx || !this.isPlaying) return;
    this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    setTimeout(() => this._stopScheduler(), 600);
  }

  // ---- 내부: 시퀀서 ----

  _startScheduler() {
    const track = TRACKS[this.currentTrack];
    if (!track) return;
    const beatMs = 60000 / track.bpm; // 1비트 시간 (ms)
    // 시퀀서: 비트마다 노트 스케줄링
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

  // 매 비트마다 호출 - 레이어별 노트 재생
  _onBeat(track) {
    if (!this.ctx || !this.isPlaying) return;
    const t = this.ctx.currentTime;
    const beatDur = 60 / track.bpm;
    const chordIdx = Math.floor(this.stepIndex / 4) % track.chords.length;
    const melodyIdx = this.stepIndex % track.melodyNotes.length;

    // 레이어 1: 베이스 (항상 재생)
    if (this.stepIndex % 4 === 0) {
      this._playNote(
        "triangle",
        track.bassNotes[chordIdx],
        beatDur * 3.5,
        0.12,
        80,
      );
    }

    // 레이어 2: 패드/코드 (intensity >= 0.2)
    if (this.intensity >= 0.2 && this.stepIndex % 4 === 0) {
      const chord = track.chords[chordIdx];
      chord.forEach((freq) => {
        this._playNote("sine", freq, beatDur * 3.8, 0.04 * this.intensity, 600);
      });
    }

    // 레이어 3: 아르페지오 (intensity >= 0.4)
    if (this.intensity >= 0.4) {
      const chord = track.chords[chordIdx];
      const arpNote = chord[this.stepIndex % chord.length];
      this._playNote(
        "sine",
        arpNote * 2,
        beatDur * 0.8,
        0.03 * this.intensity,
        1200,
      );
    }

    // 레이어 4: 멜로디 (intensity >= 0.6)
    if (this.intensity >= 0.6 && this.stepIndex % 2 === 0) {
      this._playNote(
        "triangle",
        track.melodyNotes[melodyIdx],
        beatDur * 1.5,
        0.05 * this.intensity,
        2000,
      );
    }

    // 레이어 5: 리듬 펄스 (intensity >= 0.8) - 킥 느낌
    if (this.intensity >= 0.8 && this.stepIndex % 4 === 0) {
      this._playKick(t, beatDur * 0.3);
    }

    this.stepIndex++;
  }

  // 오실레이터 + 필터로 단일 노트 재생
  _playNote(waveType, freq, duration, gain, filterFreq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gn = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = waveType;
    osc.frequency.value = freq;

    // 로우패스 필터로 부드러운 음색
    filter.type = "lowpass";
    filter.frequency.value = filterFreq || 800;
    filter.Q.value = 0.7;

    // ADSR 엔벨로프 (부드러운 어택/릴리즈)
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(gain, t + 0.05);
    gn.gain.setValueAtTime(gain, t + duration * 0.6);
    gn.gain.linearRampToValueAtTime(0, t + duration);

    osc.connect(filter);
    filter.connect(gn);
    gn.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  // 킥 드럼 효과 (사인파 피치 드롭)
  _playKick(t, dur) {
    const osc = this.ctx.createOscillator();
    const gn = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + dur);
    gn.gain.setValueAtTime(0.1, t);
    gn.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(gn);
    gn.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  // 승리 팡파레 (짧은 상승 멜로디 C-E-G-C)
  _playFanfare() {
    const notes = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C5 * 2];
    const play = (idx) => {
      if (idx >= notes.length) return;
      this._playNote("triangle", notes[idx], 0.4, 0.12, 3000);
      // 마지막 노트는 길게 + 메이저 화음 추가
      if (idx === notes.length - 1) {
        this._playNote("sine", notes[idx], 1.2, 0.08, 2000);
        this._playNote("sine", NOTE.E5, 1.2, 0.05, 2000);
        this._playNote("sine", NOTE.G5, 1.2, 0.05, 2000);
      }
      setTimeout(() => play(idx + 1), 200);
    };
    play(0);
  }

  // 패배 멜로디 (하강하는 슬픈 멜로디)
  _playDefeat() {
    const notes = [NOTE.E5, NOTE.D5, NOTE.C5, NOTE.A4, NOTE.E4];
    const play = (idx) => {
      if (idx >= notes.length) return;
      const dur = idx === notes.length - 1 ? 1.5 : 0.5;
      this._playNote("sine", notes[idx], dur, 0.1, 800);
      // 마지막은 단조 화음
      if (idx === notes.length - 1) {
        this._playNote("sine", NOTE.C4, 1.5, 0.06, 600);
        this._playNote("sine", NOTE.A3, 1.5, 0.06, 600);
      }
      setTimeout(() => play(idx + 1), 350);
    };
    play(0);
  }
}
