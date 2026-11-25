// Realistic, Accurately Tuned Multi-Instrument Web Audio Synthesizer for Casio SA-11 (100 Tones)
// Uses equal-temperament A4 = 440.00 Hz, master compressor (no clipping on 4-note chords),
// and distinct acoustic/FM/additive/plucked synthesis per instrument family.

import { midiToFreq, SA11Tone } from '../data/sa11Data';

interface ActiveVoice {
  stop: (immediate?: boolean) => void;
}

export class SA11SynthEngine {
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private voices = new Map<number, ActiveVoice>();
  private noiseBuffer: AudioBuffer | null = null;

  private ensureMaster(ctx: AudioContext): AudioNode {
    if (!this.compressor || !this.masterGain) {
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.15;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = 0.45;

      this.masterGain.connect(this.compressor);
      this.compressor.connect(ctx.destination);
    }
    return this.masterGain;
  }

  public setMasterVolume(vol: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1.5, vol));
    }
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer || this.noiseBuffer.sampleRate !== ctx.sampleRate) {
      const len = ctx.sampleRate * 1;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  public noteOn(ctx: AudioContext, midi: number, tone?: SA11Tone, velocity = 0.55): void {
    this.noteOff(midi, true);
    const out = this.ensureMaster(ctx);
    const freq = midiToFreq(midi);
    const code = tone ? parseInt(tone.code, 10) : 0;

    let voice: ActiveVoice;
    if (code === 0 || code === 2 || code === 50 || code === 96 || code === 98) {
      // Acoustic Piano / Honky-Tonk / Synth-Piano / Piano Split
      voice = this.playPiano(ctx, out, freq, velocity, code === 2);
    } else if (code === 1 || code === 51 || code === 60) {
      // Electric Piano / Celesta / Glass Harmonica (FM Tine)
      voice = this.playElectricPiano(ctx, out, freq, velocity);
    } else if (code === 3 || code === 52) {
      // Harpsichord / Synth-Clavi
      voice = this.playPlucked(ctx, out, freq, velocity, 4200, 0.55, 'sawtooth');
    } else if (code >= 4 && code <= 9) {
      // Organs & Accordion (Additive drawbars)
      voice = this.playOrgan(ctx, out, freq, velocity, code === 6 || code === 7);
    } else if (code >= 10 && code <= 14 || code === 54 || code === 97) {
      // Brass & Trumpet
      voice = this.playBrass(ctx, out, freq, velocity);
    } else if (code >= 15 && code <= 28) {
      // Woodwinds, Flute, Clarinet, Ocarina, Harmonica
      voice = this.playWoodwind(ctx, out, freq, velocity, code >= 20 && code <= 25);
    } else if ((code >= 29 && code <= 34) || code === 57 || code === 99) {
      // Strings, Violin, Cello
      voice = this.playStrings(ctx, out, freq, velocity);
    } else if (code >= 35 && code <= 49) {
      // Guitars, Bass, Ukulele, Banjo, Sitar, Harp
      const isBass = code >= 39 && code <= 42;
      voice = this.playPlucked(ctx, out, freq, velocity, isBass ? 1100 : 3200, isBass ? 0.65 : 0.85, isBass ? 'triangle' : 'sawtooth');
    } else if (code >= 70 && code <= 79) {
      // Retro SFX
      voice = this.playSfx(ctx, out, freq, velocity, code);
    } else if (code >= 80 && code <= 84) {
      // Vibraphone, Marimba, Church Bells, Gamelan (Metallic FM partials)
      voice = this.playBellMallet(ctx, out, freq, velocity, code === 81);
    } else if (code >= 85 && code <= 95) {
      // Percussion & Drums
      voice = this.playPercussion(ctx, out, freq, velocity, midi);
    } else {
      // Classic 90s Casio Synth Leads & Pads (53–69)
      voice = this.playSynthLead(ctx, out, freq, velocity);
    }

    this.voices.set(midi, voice);
  }

  public noteOff(midi: number, immediate = false): void {
    const v = this.voices.get(midi);
    if (v) {
      v.stop(immediate);
      this.voices.delete(midi);
    }
  }

  // --- 1. Acoustic Piano (Additive harmonics + dynamic hammer filter + natural decay) ---
  private playPiano(ctx: AudioContext, out: AudioNode, freq: number, vel: number, honkyTonk: boolean): ActiveVoice {
    const now = ctx.currentTime;
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(9000, freq * 12), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(550, freq * 2.4), now + 0.85);
    filter.Q.value = 0.8;

    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(vel * 0.65, now + 0.007);
    env.gain.exponentialRampToValueAtTime(vel * 0.24, now + 0.35);
    env.gain.exponentialRampToValueAtTime(0.0008, now + 2.4);

    filter.connect(env);
    env.connect(out);

    const oscs: OscillatorNode[] = [];
    const harmonics: Array<{ mult: number; gain: number; type: OscillatorType; detune: number }> = [
      { mult: 1, gain: 0.68, type: 'triangle', detune: honkyTonk ? -7 : -1.5 },
      { mult: 1, gain: 0.42, type: 'sine', detune: honkyTonk ? 8 : 1.5 },
      { mult: 2, gain: 0.22, type: 'sine', detune: 0 },
      { mult: 3, gain: 0.08, type: 'sine', detune: 0 },
    ];

    for (const h of harmonics) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = h.type;
      o.frequency.setValueAtTime(freq * h.mult, now);
      o.detune.setValueAtTime(h.detune, now);
      g.gain.value = h.gain;
      o.connect(g);
      g.connect(filter);
      o.start(now);
      oscs.push(o);
    }

    return {
      stop: (immediate) => {
        const t = ctx.currentTime;
        const rel = immediate ? 0.025 : 0.22;
        try {
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + rel);
          oscs.forEach((o) => o.stop(t + rel + 0.02));
        } catch {}
      },
    };
  }

  // --- 2. Electric Piano (Warm sine body + FM bell tine attack) ---
  private playElectricPiano(ctx: AudioContext, out: AudioNode, freq: number, vel: number): ActiveVoice {
    const now = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(vel * 0.6, now + 0.006);
    env.gain.exponentialRampToValueAtTime(vel * 0.28, now + 0.45);
    env.gain.exponentialRampToValueAtTime(0.0008, now + 2.6);
    env.connect(out);

    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, now);

    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(freq * 4, now); // Bright Rhodes/DX tine harmonic

    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 1.35, now);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, now + 0.28);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(env);

    carrier.start(now);
    mod.start(now);

    return {
      stop: (immediate) => {
        const t = ctx.currentTime;
        const rel = immediate ? 0.025 : 0.25;
        try {
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + rel);
          carrier.stop(t + rel + 0.02);
          mod.stop(t + rel + 0.02);
        } catch {}
      },
    };
  }

  // --- 3. Organ (Additive Sine Drawbars — warm, clean, zero harsh buzz) ---
  private playOrgan(ctx: AudioContext, out: AudioNode, freq: number, vel: number, pipeStyle: boolean): ActiveVoice {
    const now = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(vel * 0.5, now + 0.018);
    env.connect(out);

    const drawbars = pipeStyle
      ? [{ m: 0.5, g: 0.35 }, { m: 1, g: 0.55 }, { m: 2, g: 0.32 }, { m: 3, g: 0.16 }, { m: 4, g: 0.12 }]
      : [{ m: 1, g: 0.6 }, { m: 2, g: 0.35 }, { m: 3, g: 0.22 }, { m: 4, g: 0.1 }];

    const oscs: OscillatorNode[] = [];
    for (const d of drawbars) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * d.m, now);
      g.gain.value = d.g;
      o.connect(g);
      g.connect(env);
      o.start(now);
      oscs.push(o);
    }

    return {
      stop: (immediate) => {
        const t = ctx.currentTime;
        const rel = immediate ? 0.02 : 0.14;
        try {
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + rel);
          oscs.forEach((o) => o.stop(t + rel + 0.02));
        } catch {}
      },
    };
  }

  // --- 4. Brass (Warm dual-sawtooth with brassy filter swell) ---
  private playBrass(ctx: AudioContext, out: AudioNode, freq: number, vel: number): ActiveVoice {
    const now = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.exponentialRampToValueAtTime(Math.min(4200, freq * 7), now + 0.09);
    filter.frequency.exponentialRampToValueAtTime(Math.min(2600, freq * 4.5), now + 0.35);
    filter.Q.value = 1.4;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(vel * 0.45, now + 0.045);
    filter.connect(env);
    env.connect(out);

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'sawtooth';
    o1.frequency.setValueAtTime(freq, now);
    o2.frequency.setValueAtTime(freq, now);
    o1.detune.value = -5;
    o2.detune.value = 5;
    o1.connect(filter);
    o2.connect(filter);
    o1.start(now);
    o2.start(now);

    return {
      stop: (immediate) => {
        const t = ctx.currentTime;
        const rel = immediate ? 0.02 : 0.14;
        try {
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + rel);
          o1.stop(t + rel + 0.02);
          o2.stop(t + rel + 0.02);
        } catch {}
      },
    };
  }

  // --- 5. Woodwind / Flute / Clarinet (Pure tone + gentle vibrato) ---
  private playWoodwind(ctx: AudioContext, out: AudioNode, freq: number, vel: number, isFlute: boolean): ActiveVoice {
    const now = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(vel * 0.55, now + 0.065);
    env.connect(out);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = isFlute ? 2800 : 1900;
    filter.connect(env);

    const osc = ctx.createOscillator();
    osc.type = isFlute ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    // Subtle 5.2 Hz vibrato
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5.2;
    lfoGain.gain.value = freq * 0.006;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    osc.connect(filter);
    osc.start(now);
    lfo.start(now);

    return {
      stop: (immediate) => {
        const t = ctx.currentTime;
        const rel = immediate ? 0.02 : 0.16;
        try {
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + rel);
          osc.stop(t + rel + 0.02);
          lfo.stop(t + rel + 0.02);
        } catch {}
      },
    };
  }

  // --- 6. Strings Ensemble (Slow lush bow attack + detuned pair) ---
  private playStrings(ctx: AudioContext, out: AudioNode, freq: number, vel: number): ActiveVoice {
    const now = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2600;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(vel * 0.42, now + 0.16);
    filter.connect(env);
    env.connect(out);

    const oscs = [-8, 0, 8].map((det) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, now);
      o.detune.value = det;
      o.connect(filter);
      o.start(now);
      return o;
    });

    return {
      stop: (immediate) => {
        const t = ctx.currentTime;
        const rel = immediate ? 0.03 : 0.32;
        try {
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + rel);
          oscs.forEach((o) => o.stop(t + rel + 0.02));
        } catch {}
      },
    };
  }

  // --- 7. Plucked Guitar / Bass / Harp / Harpsichord ---
  private playPlucked(
    ctx: AudioContext,
    out: AudioNode,
    freq: number,
    vel: number,
    cutoffStart: number,
    decaySec: number,
    wave: OscillatorType
  ): ActiveVoice {
    const now = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffStart, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(240, freq * 1.4), now + decaySec * 0.7);
    filter.Q.value = 1.2;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(vel * 0.6, now + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0008, now + decaySec * 1.4);

    filter.connect(env);
    env.connect(out);

    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, now);
    osc.connect(filter);
    osc.start(now);

    return {
      stop: (immediate) => {
        const t = ctx.currentTime;
        const rel = immediate ? 0.02 : 0.14;
        try {
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + rel);
          osc.stop(t + rel + 0.02);
        } catch {}
      },
    };
  }

  // --- 8. Vibraphone / Marimba / Church Bells (Metallic FM partials) ---
  private playBellMallet(ctx: AudioContext, out: AudioNode, freq: number, vel: number, isWood: boolean): ActiveVoice {
    const now = ctx.currentTime;
    const env = ctx.createGain();
    const decay = isWood ? 0.45 : 1.8;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(vel * 0.6, now + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0008, now + decay);
    env.connect(out);

    const partials = isWood
      ? [{ m: 1, g: 0.75 }, { m: 4, g: 0.25 }]
      : [{ m: 1, g: 0.65 }, { m: 2.756, g: 0.25 }, { m: 5.404, g: 0.12 }];

    const oscs = partials.map((p) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * p.m, now);
      g.gain.value = p.g;
      o.connect(g);
      g.connect(env);
      o.start(now);
      return o;
    });

    return {
      stop: (immediate) => {
        const t = ctx.currentTime;
        const rel = immediate ? 0.02 : 0.22;
        try {
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + rel);
          oscs.forEach((o) => o.stop(t + rel + 0.02));
        } catch {}
      },
    };
  }

  // --- 9. Synth Lead & Pads ---
  private playSynthLead(ctx: AudioContext, out: AudioNode, freq: number, vel: number): ActiveVoice {
    const now = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3400, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 0.35);
    filter.Q.value = 2.2;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(vel * 0.45, now + 0.015);
    filter.connect(env);
    env.connect(out);

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'square';
    o2.type = 'triangle';
    o1.frequency.setValueAtTime(freq, now);
    o2.frequency.setValueAtTime(freq * 1.003, now);
    o1.connect(filter);
    o2.connect(filter);
    o1.start(now);
    o2.start(now);

    return {
      stop: (immediate) => {
        const t = ctx.currentTime;
        const rel = immediate ? 0.02 : 0.18;
        try {
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + rel);
          o1.stop(t + rel + 0.02);
          o2.stop(t + rel + 0.02);
        } catch {}
      },
    };
  }

  // --- 10. Percussion & Drums ---
  private playPercussion(ctx: AudioContext, out: AudioNode, freq: number, vel: number, midi: number): ActiveVoice {
    const now = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.setValueAtTime(vel * 0.65, now);
    env.gain.exponentialRampToValueAtTime(0.0008, now + 0.22);
    env.connect(out);

    if (midi % 3 === 0) {
      // Tuned Tom / Conga
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(Math.min(260, freq * 0.6), now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(55, freq * 0.22), now + 0.16);
      osc.connect(env);
      osc.start(now);
      osc.stop(now + 0.24);
      return { stop: () => {} };
    }
    // Crisp Snare / Shaker burst
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(5000, freq * 3);
    bp.Q.value = 1.5;
    src.connect(bp);
    bp.connect(env);
    src.start(now);
    src.stop(now + 0.16);
    return { stop: () => {} };
  }

  // --- 11. Retro Casio SFX (Laser, Typewriter, Cosmic) ---
  private playSfx(ctx: AudioContext, out: AudioNode, freq: number, vel: number, code: number): ActiveVoice {
    const now = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.setValueAtTime(vel * 0.45, now);
    env.gain.exponentialRampToValueAtTime(0.0008, now + (code === 79 ? 0.04 : 0.45));
    env.connect(out);

    const osc = ctx.createOscillator();
    osc.type = code === 74 ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(code === 74 ? freq * 2.5 : freq, now);
    if (code === 74 || code === 75) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.35), now + 0.35);
    }
    osc.connect(env);
    osc.start(now);
    osc.stop(now + 0.5);
    return { stop: () => {} };
  }
}

export const synthEngine = new SA11SynthEngine();
