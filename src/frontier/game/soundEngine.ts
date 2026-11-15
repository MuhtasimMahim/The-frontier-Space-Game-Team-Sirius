// Web Audio API procedural & synthesized sound engine
// High-fidelity sound effects + NASA-style radio squelches, alarms, engine loops, and voice comms

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;

  // Continuous sound sources
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  // Speech synthesis
  private voice: SpeechSynthesisVoice | null = null;
  private speechQueue: string[] = [];
  private isSpeaking: boolean = false;

  constructor() {
    if (typeof window === "undefined") return;
    // AudioContext will be initialized on first user interaction
    window.addEventListener("click", () => this.initContext(), { once: true });
    window.addEventListener("keydown", () => this.initContext(), { once: true });

    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        const voices = window.speechSynthesis.getVoices();
        // Prefer US English female or robotic voice (e.g. Samantha, Google US English, Zira)
        this.voice =
          voices.find(
            (v) =>
              v.lang.startsWith("en") &&
              (v.name.includes("Samantha") ||
                v.name.includes("Natural") ||
                v.name.includes("Google") ||
                v.name.includes("US") ||
                v.name.includes("Zira")),
          ) ||
          voices.find((v) => v.lang.startsWith("en")) ||
          null;
      };
    }
  }

  private initContext() {
    if (this.ctx || typeof window === "undefined") return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.startCosmicAmbience();
  }

  public getContext(): AudioContext | null {
    if (!this.ctx) this.initContext();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Radio squelch burst (like Apollo / Artemis radio transmitter click)
  public playRadioSquelch() {
    const ctx = this.getContext();
    if (!ctx || this.isMuted) return;

    const bufferSize = ctx.sampleRate * 0.06;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(2400, ctx.currentTime);
    filter.Q.setValueAtTime(3.5, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);

    noise.start();
  }

  // NASA Mission Control Comms Text-to-Speech
  public speak(message: string, priority: boolean = false) {
    if (!("speechSynthesis" in window) || this.isMuted) return;

    if (priority) {
      window.speechSynthesis.cancel();
      this.speechQueue = [];
      this.isSpeaking = false;
    }

    this.speechQueue.push(message);
    this.processSpeechQueue();
  }

  private processSpeechQueue() {
    if (this.isSpeaking || this.speechQueue.length === 0) return;

    this.isSpeaking = true;
    const text = this.speechQueue.shift()!;

    // Play radio squelch before speaking
    this.playRadioSquelch();

    const utterance = new SpeechSynthesisUtterance(text);
    if (this.voice) utterance.voice = this.voice;
    utterance.lang = "en-US";
    utterance.rate = 1.05; // crisp military/flight controller cadence
    utterance.pitch = 1.0;
    utterance.volume = 0.9;

    utterance.onend = () => {
      this.playRadioSquelch();
      this.isSpeaking = false;
      setTimeout(() => this.processSpeechQueue(), 300);
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      this.processSpeechQueue();
    };

    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 80);
  }

  // Continuous deep cosmic ambience
  private startCosmicAmbience() {
    const ctx = this.ctx;
    if (!ctx) return;

    // Pink / Brown noise filter for cosmic wind
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      const sample = (lastOut + 0.02 * white) / 1.02;
      lastOut = sample;
      data[i] = sample * 3.5;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(140, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);

    noise.start();
  }

  // UI Click sound
  /** Low chassis thud for bumps and hard landings (felt through the suit, no air). */
  public playThud(strength: number) {
    const ctx = this.getContext();
    if (!ctx || this.isMuted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(90, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.15 + strength * 0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    osc.stop(ctx.currentTime + 0.32);
  }

  public playClick() {
    const ctx = this.getContext();
    if (!ctx || this.isMuted) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  // Mission milestone chime (build complete, stage advance)
  public playMilestone() {
    const ctx = this.getContext();
    if (!ctx || this.isMuted) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 0.45);
    });
  }

  // Warning alarm sound (low oxygen, shortage)
  public playWarning() {
    const ctx = this.getContext();
    if (!ctx || this.isMuted) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    osc.stop(ctx.currentTime + 0.32);
  }

  /**
   * Muffled interior helmet alarm for critical oxygen / suffocation (at 15 seconds remaining).
   * Low sound (low volume + low-pass muffled tone) to sound like a suit interior caution chime.
   */
  public playHelmetAlarm() {
    const ctx = this.getContext();
    if (!ctx || this.isMuted) return;

    const t0 = ctx.currentTime;
    // Dual subtle low-frequency pips: 260Hz -> 200Hz
    [0, 0.12].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = "sine";
      osc.frequency.setValueAtTime(260, t0 + offset);
      osc.frequency.exponentialRampToValueAtTime(200, t0 + offset + 0.08);

      // Lowpass filter to muffle the sound inside helmet padding
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(450, t0 + offset);

      gain.gain.setValueAtTime(0.001, t0 + offset);
      gain.gain.linearRampToValueAtTime(0.06, t0 + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + offset + 0.09);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.1);
    });
  }

  // Ice drilling / extraction sound
  public playIceDrill() {
    const ctx = this.getContext();
    if (!ctx || this.isMuted) return;

    // Crystalline chime + mechanical frequency
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(2200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(3400, ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  }

  // Solar panel install / mechanical servo
  public playServo() {
    const ctx = this.getContext();
    if (!ctx || this.isMuted) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(680, ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  }

  // Rover motor loop dynamic modulation
  public setRoverEngineSpeed(speedRatio: number, isBoosting: boolean) {
    const ctx = this.getContext();
    if (!ctx || this.isMuted) return;

    if (!this.engineOsc) {
      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineGain = ctx.createGain();
      this.engineGain.gain.setValueAtTime(0, ctx.currentTime);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(450, ctx.currentTime);

      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain!);
      this.engineOsc.start();
    }

    if (this.engineOsc && this.engineGain) {
      if (Math.abs(speedRatio) > 0.05) {
        const targetFreq = isBoosting ? 260 + speedRatio * 180 : 90 + speedRatio * 120;
        const targetGain = isBoosting ? 0.18 : 0.09;
        this.engineOsc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.08);
        this.engineGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.08);
      } else {
        this.engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
      }
    }
  }

  // Stop rover engine when dismounted
  public stopRoverEngine() {
    const ctx = this.ctx;
    if (this.engineGain && ctx) {
      this.engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    }
  }

  // Astronaut helmet breathing sound effect
  public playBreathing(isLowOxygen: boolean) {
    const ctx = this.getContext();
    if (!ctx || this.isMuted) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(isLowOxygen ? 95 : 75, ctx.currentTime);

    const dur = isLowOxygen ? 0.8 : 1.4;
    gain.gain.setValueAtTime(0.01, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(isLowOxygen ? 0.08 : 0.04, ctx.currentTime + dur * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.05);
  }

  private tone(
    freqs: number[],
    step: number,
    len: number,
    type: OscillatorType = "triangle",
    vol = 0.16,
  ) {
    const ctx = this.getContext();
    if (!ctx || this.isMuted) return;
    freqs.forEach((f, idx) => {
      const t0 = ctx.currentTime + idx * step;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t0);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + len);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t0);
      osc.stop(t0 + len + 0.05);
    });
  }
  /** Ratchet clicks while fixing hardware. */
  public playRepair() {
    this.tone([300, 360, 300, 420, 520], 0.09, 0.08, "square", 0.08);
  }
  public playChargeStart() {
    this.tone([220, 330], 0.12, 0.2, "sine", 0.1);
  }
  public playChargeFull() {
    this.tone([660, 880, 1320], 0.1, 0.25, "sine", 0.12);
  }
  /** Pressure hiss + clunk when the airlock cycles. */
  public playAirlock() {
    this.playThud(0.6);
    this.tone([140, 120, 100], 0.6, 0.9, "sawtooth", 0.04);
  }
  /** Engine roar for a cargo hopper liftoff (felt through the ground, there is no air). */
  public playLaunch() {
    this.playThud(1);
    this.tone([70, 62, 55, 50, 46, 42], 0.35, 0.8, "sawtooth", 0.09);
    this.tone([140, 180, 240, 320], 0.5, 0.6, "triangle", 0.05);
  }
  public playConstruction() {
    this.tone([180, 180, 240, 180], 0.15, 0.12, "square", 0.07);
  }
  public playVictory() {
    this.tone([523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98], 0.14, 0.7, "triangle", 0.18);
  }
  public playDefeat() {
    this.tone([392, 349.23, 311.13, 233.08], 0.35, 0.9, "sine", 0.16);
  }
}

export const sound = new SoundEngine();
