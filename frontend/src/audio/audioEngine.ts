// Real-Time Web Audio Engine: Line-In Capture, Python-Computed Active Filter Cascade,
// YIN Pitch Detection (F3–C6), PCM WAV Recording, and Built-in Synth Preview

import { findClosestSA11Key, SA11_KEYS, SA11Key, SA11Tone } from '../data/sa11Data';
import { synthEngine } from './synthEngine';

export interface PitchReading {
  freqHz: number | null;
  key: SA11Key | null;
  cents: number | null;
  rmsDb: number;
  confidence: number;
}

export interface LiveFilterConfig {
  enabled: boolean;
  notch50Hz: boolean;
  sos: number[][] | null; // From Python scipy.signal.butter/cheby/bessel/ellip
  monitorOutput: boolean; // Listen to filtered Line-In through PC speakers
  gateThresholdDb: number;
}

// Precomputed right-emphasized Hann window (4096 samples) that prioritizes the newest 35-50ms
// so rapid consecutive key presses switch cleanly without overlapping-note glitches.
const SPECTRAL_WIN_4096 = (() => {
  const N = 4096;
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    const rightWeight = Math.exp(-1.2 * (1 - i / N));
    w[i] = hann * rightWeight;
  }
  return w;
})();

function goertzelMag(x: Float32Array, freqHz: number, sampleRate: number): number {
  const N = x.length;
  const w = (2 * Math.PI * freqHz) / sampleRate;
  const coeff = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < N; i++) {
    const s0 = x[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return Math.sqrt(Math.max(0, power)) / N;
}

/**
 * Rapid-Play 32-Key Spectral Harmonic Comb Detector.
 * Immune to polyphonic note overlap and fast key strikes (unlike time-domain YIN).
 */
export function detectKeySpectralComb(
  buffer: Float32Array,
  sampleRate: number,
  octaveShift = 0,
  tuningCents = 0
): { key: SA11Key | null; freqHz: number | null; confidence: number } {
  const N = buffer.length;
  const xw = new Float32Array(N);
  const win = N === 4096 ? SPECTRAL_WIN_4096 : null;
  let rmsSq = 0;
  for (let i = 0; i < N; i++) {
    const v = buffer[i] * (win ? win[i] : 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1))));
    xw[i] = v;
    rmsSq += v * v;
  }
  const winRms = Math.sqrt(rmsSq / N);
  if (winRms < 1e-4) {
    return { key: null, freqHz: null, confidence: 0 };
  }

  const pitchScale = Math.pow(2, octaveShift) * Math.pow(2, tuningCents / 1200);
  let bestScore = 0;
  let secondScore = 0;
  let bestKey: SA11Key | null = null;
  let bestFreq = 0;

  for (let k = 0; k < SA11_KEYS.length; k++) {
    const keyObj = SA11_KEYS[k];
    const f = keyObj.freq * pitchScale;
    if (f < 65 || f > sampleRate * 0.44) continue;

    const m1 = goertzelMag(xw, f, sampleRate);
    const m2 = 2 * f < sampleRate * 0.45 ? goertzelMag(xw, 2 * f, sampleRate) : 0;
    const m3 = 3 * f < sampleRate * 0.45 ? goertzelMag(xw, 3 * f, sampleRate) : 0;

    // Harmonic comb gated by fundamental energy m1 (prevents octave false-triggers)
    const score = m1 + 0.55 * Math.min(m2, m1 * 1.6) + 0.30 * Math.min(m3, m1 * 1.4);

    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestKey = keyObj;
      bestFreq = f;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  // Normalize spectral prominence against overall windowed RMS
  const prominence = bestScore / (winRms + 1e-6);
  const separation = bestScore / (secondScore + 1e-6);

  if (!bestKey || prominence < 0.22 || separation < 1.18) {
    return { key: null, freqHz: null, confidence: 0 };
  }

  const confidence = Math.min(1, prominence * 1.1);
  return { key: bestKey, freqHz: bestFreq, confidence };
}

/**
 * YIN Fundamental Frequency Estimator (used for free-frequency hardware calibration)
 */
export function detectPitchYIN(
  buffer: Float32Array,
  sampleRate: number,
  threshold = 0.12
): { freq: number | null; confidence: number } {
  const halfLen = Math.floor(buffer.length / 2);
  // Wide range covering F2 (87 Hz) to C7 (2093 Hz) with margin
  const minTau = Math.max(2, Math.floor(sampleRate / 2300));
  const maxTau = Math.min(halfLen - 1, Math.ceil(sampleRate / 80));

  const yin = new Float32Array(maxTau + 1);
  let runningSum = 0;
  yin[0] = 1;

  for (let tau = 1; tau <= maxTau; tau++) {
    let diff = 0;
    for (let i = 0; i < halfLen; i++) {
      const d = buffer[i] - buffer[i + tau];
      diff += d * d;
    }
    runningSum += diff;
    yin[tau] = runningSum > 0 ? (diff * tau) / runningSum : 1;
  }

  // Standard YIN: pick the FIRST local minimum below threshold (true fundamental period T, never 2T)
  let tauEstimate = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (yin[tau] < threshold) {
      while (tau + 1 <= maxTau && yin[tau + 1] < yin[tau]) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) {
    return { freq: null, confidence: 0 };
  }

  // Parabolic interpolation for sub-sample accuracy
  let betterTau = tauEstimate;
  if (tauEstimate > minTau && tauEstimate < maxTau) {
    const s0 = yin[tauEstimate - 1];
    const s1 = yin[tauEstimate];
    const s2 = yin[tauEstimate + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denom) > 1e-9) {
      betterTau = tauEstimate + (s2 - s0) / denom;
    }
  }

  const confidence = Math.max(0, Math.min(1, 1 - yin[tauEstimate]));
  return { freq: sampleRate / betterTau, confidence };
}

/**
 * Encode Float32 mono PCM chunks into a standard 16-bit PCM WAV Blob
 */
export function encodeWavPCM16(chunks: Float32Array[], sampleRate: number): Blob {
  const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, 1, true);  // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export class SA11AudioEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private rawAnalyser: AnalyserNode | null = null;
  private filteredAnalyser: AnalyserNode | null = null;
  private filterNodes: AudioNode[] = [];
  private monitorGain: GainNode | null = null;
  private recorderNode: ScriptProcessorNode | null = null;

  private isRecording = false;
  private recordedChunks: Float32Array[] = [];
  private timeBuf = new Float32Array(4096);

  private filterConfig: LiveFilterConfig = {
    enabled: true,
    notch50Hz: true,
    sos: null,
    monitorOutput: false,
    gateThresholdDb: -38,
  };

  public ensureContext(): AudioContext {
    if (!this.ctx) {
      // Match OS hardware sample rate natively (44.1 kHz or 48 kHz) for exact A4=440 Hz pitch
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public getSampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  public isConnected(): boolean {
    return this.stream !== null;
  }

  public async listInputDevices(): Promise<MediaDeviceInfo[]> {
    // Request brief permission if labels are empty
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  public async connectLineIn(deviceId?: string): Promise<void> {
    this.disconnectLineIn();
    const ctx = this.ensureContext();

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        // CRITICAL: Disable browser voice processing so raw Casio SA-11 audio arrives clean
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.sourceNode = ctx.createMediaStreamSource(this.stream);

    this.rawAnalyser = ctx.createAnalyser();
    this.rawAnalyser.fftSize = 2048;
    this.rawAnalyser.smoothingTimeConstant = 0.72;

    this.filteredAnalyser = ctx.createAnalyser();
    this.filteredAnalyser.fftSize = 4096;
    this.filteredAnalyser.smoothingTimeConstant = 0.72;

    this.monitorGain = ctx.createGain();
    this.monitorGain.gain.value = this.filterConfig.monitorOutput ? 0.75 : 0.0;

    // PCM Recorder tap (captures clean audio post-filter or raw)
    this.recorderNode = ctx.createScriptProcessor(2048, 1, 1);
    this.recorderNode.onaudioprocess = (ev) => {
      if (this.isRecording) {
        const input = ev.inputBuffer.getChannelData(0);
        this.recordedChunks.push(new Float32Array(input));
      }
    };

    this.rebuildFilterGraph();
  }

  public disconnectLineIn(): void {
    this.isRecording = false;
    this.teardownGraph();
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.sourceNode = null;
  }

  private teardownGraph(): void {
    try { this.sourceNode?.disconnect(); } catch {}
    try { this.rawAnalyser?.disconnect(); } catch {}
    try { this.filteredAnalyser?.disconnect(); } catch {}
    try { this.monitorGain?.disconnect(); } catch {}
    try { this.recorderNode?.disconnect(); } catch {}
    for (const n of this.filterNodes) {
      try { n.disconnect(); } catch {}
    }
    this.filterNodes = [];
  }

  public updateFilterConfig(partial: Partial<LiveFilterConfig>): void {
    this.filterConfig = { ...this.filterConfig, ...partial };
    if (this.sourceNode) {
      this.rebuildFilterGraph();
    }
  }

  private rebuildFilterGraph(): void {
    if (!this.ctx || !this.sourceNode || !this.rawAnalyser || !this.filteredAnalyser || !this.monitorGain || !this.recorderNode) {
      return;
    }
    this.teardownGraph();

    // Branch 1: Raw input analyzer
    this.sourceNode.connect(this.rawAnalyser);

    // Common clean input conditioning (50 Hz hum notch + 30 Hz DC block)
    let cleanBus: AudioNode = this.sourceNode;
    if (this.filterConfig.enabled) {
      if (this.filterConfig.notch50Hz) {
        const notch = this.ctx.createBiquadFilter();
        notch.type = 'notch';
        notch.frequency.value = 50;
        notch.Q.value = 25;
        cleanBus.connect(notch);
        cleanBus = notch;
        this.filterNodes.push(notch);
      }
      const dcBlock = this.ctx.createBiquadFilter();
      dcBlock.type = 'highpass';
      dcBlock.frequency.value = 30;
      dcBlock.Q.value = 0.7071;
      cleanBus.connect(dcBlock);
      cleanBus = dcBlock;
      this.filterNodes.push(dcBlock);
    }

    // Branch 2 (Pitch & Spectral Detection): 60 Hz – 4800 Hz (preserves 2nd/3rd harmonics for spectral comb)
    let pitchTail: AudioNode = cleanBus;
    if (this.filterConfig.enabled) {
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 65;
      hp.Q.value = 0.7071;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4800;
      lp.Q.value = 0.7071;
      pitchTail.connect(hp);
      hp.connect(lp);
      pitchTail = lp;
      this.filterNodes.push(hp, lp);
    }
    pitchTail.connect(this.filteredAnalyser);

    // Branch 3 (Monitor & Recording): Full-bandwidth crisp audio (up to 14 kHz, NOT muffled!)
    let audioTail: AudioNode = cleanBus;
    if (this.filterConfig.enabled) {
      const antiAliasLp = this.ctx.createBiquadFilter();
      antiAliasLp.type = 'lowpass';
      antiAliasLp.frequency.value = 14000;
      antiAliasLp.Q.value = 0.7071;
      audioTail.connect(antiAliasLp);
      audioTail = antiAliasLp;
      this.filterNodes.push(antiAliasLp);
    }

    // Connect recorder (silent sink to destination so ScriptProcessor runs)
    audioTail.connect(this.recorderNode);
    const silentGain = this.ctx.createGain();
    silentGain.gain.value = 0;
    this.recorderNode.connect(silentGain);
    silentGain.connect(this.ctx.destination);
    this.filterNodes.push(silentGain);

    // Optional live monitoring (crisp full-range sound!)
    this.monitorGain.gain.value = this.filterConfig.monitorOutput ? 0.85 : 0.0;
    audioTail.connect(this.monitorGain);
    this.monitorGain.connect(this.ctx.destination);
  }

  public analyzeLivePitch(octaveShift = 0, tuningCents = 0, calibrationMode = false): PitchReading {
    if (!this.filteredAnalyser || !this.ctx) {
      return { freqHz: null, key: null, cents: null, rmsDb: -96, confidence: 0 };
    }
    this.filteredAnalyser.getFloatTimeDomainData(this.timeBuf);

    // Compute RMS over the MOST RECENT 1024 samples (~21 ms) so key release is instant!
    const recentStart = Math.max(0, this.timeBuf.length - 1024);
    let sumSq = 0;
    for (let i = recentStart; i < this.timeBuf.length; i++) {
      sumSq += this.timeBuf[i] * this.timeBuf[i];
    }
    const rms = Math.sqrt(sumSq / (this.timeBuf.length - recentStart));
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-5));

    if (rmsDb < this.filterConfig.gateThresholdDb) {
      return { freqHz: null, key: null, cents: null, rmsDb, confidence: 0 };
    }

    if (calibrationMode) {
      // Free-frequency YIN for calibration (when holding leftmost F key steadily)
      const { freq, confidence } = detectPitchYIN(this.timeBuf, this.ctx.sampleRate);
      if (!freq || confidence < 0.8) {
        return { freqHz: null, key: null, cents: null, rmsDb, confidence };
      }
      const adjustedFreq = freq / (Math.pow(2, octaveShift) * Math.pow(2, tuningCents / 1200));
      const match = findClosestSA11Key(adjustedFreq);
      return {
        freqHz: freq,
        key: match?.key ?? null,
        cents: match?.cents ?? null,
        rmsDb,
        confidence,
      };
    }

    // Normal fast playing: 32-Key Right-Weighted Spectral Comb (handles rapid strikes & ringing overlaps!)
    const { key, freqHz, confidence } = detectKeySpectralComb(
      this.timeBuf,
      this.ctx.sampleRate,
      octaveShift,
      tuningCents
    );
    return {
      freqHz,
      key,
      cents: key ? 0 : null,
      rmsDb,
      confidence,
    };
  }

  public getAnalyserData(): {
    rawTime: Float32Array;
    filteredTime: Float32Array;
    rawFreq: Uint8Array;
    filteredFreq: Uint8Array;
  } | null {
    if (!this.rawAnalyser || !this.filteredAnalyser) return null;
    const rawTime = new Float32Array(this.rawAnalyser.fftSize);
    const filteredTime = new Float32Array(this.filteredAnalyser.fftSize);
    const rawFreq = new Uint8Array(this.rawAnalyser.frequencyBinCount);
    const filteredFreq = new Uint8Array(this.filteredAnalyser.frequencyBinCount);
    this.rawAnalyser.getFloatTimeDomainData(rawTime);
    this.filteredAnalyser.getFloatTimeDomainData(filteredTime);
    this.rawAnalyser.getByteFrequencyData(rawFreq);
    this.filteredAnalyser.getByteFrequencyData(filteredFreq);
    return { rawTime, filteredTime, rawFreq, filteredFreq };
  }

  public startRecording(): void {
    this.recordedChunks = [];
    this.isRecording = true;
  }

  public stopRecording(): { blob: Blob; durationSec: number } {
    this.isRecording = false;
    const sr = this.getSampleRate();
    const total = this.recordedChunks.reduce((acc, c) => acc + c.length, 0);
    const blob = encodeWavPCM16(this.recordedChunks, sr);
    this.recordedChunks = [];
    return { blob, durationSec: total / sr };
  }

  // =========================================================================
  // Built-in Realistic Multi-Instrument Synth (virtual clicks, lessons, maker)
  // =========================================================================
  public noteOn(midi: number, tone?: SA11Tone, velocity = 0.58): void {
    const ctx = this.ensureContext();
    synthEngine.noteOn(ctx, midi, tone, velocity);
  }

  public noteOff(midi: number): void {
    synthEngine.noteOff(midi);
  }

  public playShortNote(midi: number, tone?: SA11Tone, durationMs = 360): void {
    this.noteOn(midi, tone, 0.55);
    window.setTimeout(() => this.noteOff(midi), durationMs);
  }

  public playDrumHit(kind: 'kick' | 'snare' | 'hihat' | 'clap'): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    if (kind === 'kick') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.12);
      g.gain.setValueAtTime(0.45, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (kind === 'snare' || kind === 'clap') {
      const bufSize = Math.floor(ctx.sampleRate * 0.12);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = kind === 'snare' ? 1800 : 1200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.28, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      src.connect(hp);
      hp.connect(g);
      g.connect(ctx.destination);
      src.start(now);
    } else {
      // hihat
      const bufSize = Math.floor(ctx.sampleRate * 0.045);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      src.connect(hp);
      hp.connect(g);
      g.connect(ctx.destination);
      src.start(now);
    }
  }
}

export const audioEngine = new SA11AudioEngine();
