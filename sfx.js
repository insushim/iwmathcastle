// 간단한 Web Audio API 기반 사운드 시스템
export const sfx = {
    isReady: false,
    audioContext: null,
    lastPlayTimes: {},
    cooldowns: {
        'wizard-auto': 0.1, 'laser': 0.1, 'hit': 0.1, 'explosion': 0.1
    },

    init: function() {
        if (this.isReady) return Promise.resolve();
        
        try {
            // AudioContext 생성
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 사용자 인터랙션 후에 오디오 컨텍스트 재개
            if (this.audioContext.state === 'suspended') {
                return this.audioContext.resume().then(() => {
                    this.isReady = true;
                    console.log('Audio context resumed');
                });
            } else {
                this.isReady = true;
                return Promise.resolve();
            }
        } catch (error) {
            console.warn('Audio not supported:', error);
            this.isReady = false;
            return Promise.resolve();
        }
    },

    createOscillator: function(type, frequency, duration) {
        if (!this.isReady || !this.audioContext) return;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            
            // 엔벨로프 설정
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
            
        } catch (error) {
            console.warn('Error creating oscillator:', error);
        }
    },

    createNoise: function(duration, filterFreq = 1000) {
        if (!this.isReady || !this.audioContext) return;
        
        try {
            const bufferSize = this.audioContext.sampleRate * duration;
            const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
            const output = buffer.getChannelData(0);
            
            // 화이트 노이즈 생성
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
            
            const whiteNoise = this.audioContext.createBufferSource();
            whiteNoise.buffer = buffer;
            
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = filterFreq;
            
            const gainNode = this.audioContext.createGain();
            
            whiteNoise.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // 엔벨로프
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            whiteNoise.start(this.audioContext.currentTime);
            whiteNoise.stop(this.audioContext.currentTime + duration);
            
        } catch (error) {
            console.warn('Error creating noise:', error);
        }
    },

    createChord: function(frequencies, duration) {
        if (!this.isReady || !this.audioContext) return;
        
        frequencies.forEach(freq => {
            this.createOscillator('sine', freq, duration);
        });
    },
    
    play: function(sound) {
        if (!this.isReady || !this.audioContext) return;
        
        try {
            const now = this.audioContext.currentTime;
            if (this.cooldowns[sound] && now < (this.lastPlayTimes[sound] || 0) + this.cooldowns[sound]) return;
            this.lastPlayTimes[sound] = now;
            
            switch(sound) {
                case 'laser': 
                    this.createOscillator('sawtooth', 800, 0.15);
                    break;
                case 'hit': 
                    this.createOscillator('square', 150, 0.1);
                    break;
                case 'explosion': 
                    this.createNoise(0.3, 2000);
                    break;
                case 'powerup': 
                    this.createChord([523, 659, 784], 0.5); // C-E-G 코드
                    break;
                case 'blip': 
                    this.createOscillator('square', 800, 0.1);
                    break;
                case 'frost': 
                    this.createChord([523, 659, 784], 0.4);
                    setTimeout(() => this.createOscillator('sine', 400, 0.3), 100);
                    break;
                case 'lightning': 
                    this.createOscillator('sawtooth', 1200, 0.08);
                    break;
                case 'wizard-auto': 
                    this.createOscillator('triangle', 880, 0.1);
                    break;
                
                // 신규 효과음
                case 'skyDestroyer': 
                    this.createNoise(1.0, 800);
                    break;
                case 'plague': 
                    this.createOscillator('sawtooth', 100, 1.0);
                    break;
                case 'stealth': 
                    this.createOscillator('sine', 600, 0.4);
                    setTimeout(() => this.createOscillator('sine', 400, 0.2), 200);
                    break;
                case 'disrupt': 
                    this.createOscillator('sawtooth', 200, 0.2);
                    break;
                    
                // [추가] 신규 타워 3종 효과음
                case 'goldMine':
                    this.createOscillator('square', 1200, 0.05);
                    setTimeout(() => this.createOscillator('square', 1500, 0.05), 50);
                    break;
                case 'shredder':
                    this.createNoise(0.15, 4000);
                    break;
                case 'repair': // 수리소는 직접 소리를 내지 않고, powerup 효과음을 사용합니다.
                    break;

                default:
                    this.createOscillator('sine', 440, 0.1);
                    break;
            }
        } catch (error) {
            console.warn("SFX Error:", error);
        }
    }
};