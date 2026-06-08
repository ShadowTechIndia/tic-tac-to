class GameAudio {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
  }

  // Initialize context on first user interaction
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  // Helper to play a synth tone
  playTone(frequency, type, duration, slideTo = null) {
    if (this.isMuted) return;
    this.init();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);

    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
    }

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // Placed a mark: high pitch short ping
  playPlace() {
    this.playTone(600, 'sine', 0.12, 1200);
  }

  // Old mark deleted: descending whoosh/sweep
  playRemove() {
    this.playTone(400, 'triangle', 0.25, 80);
  }

  // Error move: low buzz
  playError() {
    this.playTone(150, 'sawtooth', 0.2);
  }

  // Win game: Major arpeggio
  playWin() {
    if (this.isMuted) return;
    this.init();
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    const now = this.ctx.currentTime;
    
    notes.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + index * 0.12);
      
      gain.gain.setValueAtTime(0.15, now + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.12 + 0.4);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now + index * 0.12);
      osc.stop(now + index * 0.12 + 0.4);
    });
  }
}

// Export a single instance
const gameAudio = new GameAudio();
export default gameAudio;
