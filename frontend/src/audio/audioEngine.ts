// Real-Time Web Audio Engine: Line-In Capture, Python-Computed Active Filter Cascade,
// YIN Pitch Detection (F3–C6), PCM WAV Recording, and Built-in Synth Preview

import { findClosestSA11Key, SA11Key, SA11Tone } from '../data/sa11Data';
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

/**
 * YIN Fundamental Frequency Estimator covering F2 (87 Hz) .. C7 (2093 Hz)
 * so any Casio SA-11 octave register (F2-C5, F3-C6, F4-C7) is accurately measured.
 */
export function detectPitchYIN(
  buffer: Float32Array,
  sampleRate: number,
  threshold = 0.14
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
  private timeBuf = new Float32Array(2048);

  private filterConfig: LiveFilterConfig = {
    enabled: true,
    notch50Hz: true,
    sos: null,
    monitorOutput: false,
    gateThresholdDb: -42,
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
    this.filteredAnalyser.fftSize = 2048;
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

    // Branch 2: Active Filter Chain -> Filtered Analyzer -> Recorder & Optional Monitor
    let tail: AudioNode = this.sourceNode;

    if (this.filterConfig.enabled) {
      // Optional 50 Hz mains hum notch
      if (this.filterConfig.notch50Hz) {
        const notch = this.ctx.createBiquadFilter();
        notch.type = 'notch';
        notch.frequency.value = 50;
        notch.Q.value = 25;
        tail.connect(notch);
        tail = notch;
        this.filterNodes.push(notch);
      }

      // Python-computed SOS (Second-Order Sections) via native Web Audio IIRFilterNode!
      if (this.filterConfig.sos && this.filterConfig.sos.length > 0) {
        for (const sec of this.filterConfig.sos) {
          // sec = [b0, b1, b2, a0, a1, a2]
          const ff = [sec[0], sec[1], sec[2]];
          const fb = [sec[3], sec[4], sec[5]];
          try {
            const iir = this.ctx.createIIRFilter(ff, fb);
            tail.connect(iir);
            tail = iir;
            this.filterNodes.push(iir);
          } catch {
            // Skip unstable section if sample rate mismatch
          }
        }
      } else {
        // Fallback default SA-11 Band-Pass (145 Hz - 2400 Hz) if no custom SOS loaded yet
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 140;
        hp.Q.value = 0.707;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 4500;
        lp.Q.value = 0.707;
        tail.connect(hp);
        hp.connect(lp);
        tail = lp;
        this.filterNodes.push(hp, lp);
      }
    }

    tail.connect(this.filteredAnalyser);

    // Connect recorder (silent sink to destination so ScriptProcessor runs)
    tail.connect(this.recorderNode);
    const silentGain = this.ctx.createGain();
    silentGain.gain.value = 0;
    this.recorderNode.connect(silentGain);
    silentGain.connect(this.ctx.destination);
    this.filterNodes.push(silentGain);

    // Optional live monitoring
    this.monitorGain.gain.value = this.filterConfig.monitorOutput ? 0.75 : 0.0;
    tail.connect(this.monitorGain);
    this.monitorGain.connect(this.ctx.destination);
  }

  public analyzeLivePitch(octaveShift = 0): PitchReading {
    if (!this.filteredAnalyser || !this.ctx) {
      return { freqHz: null, key: null, cents: null, rmsDb: -96, confidence: 0 };
    }
    this.filteredAnalyser.getFloatTimeDomainData(this.timeBuf);
    let sumSq = 0;
    for (let i = 0; i < this.timeBuf.length; i++) {
      sumSq += this.timeBuf[i] * this.timeBuf[i];
    }
    const rms = Math.sqrt(sumSq / this.timeBuf.length);
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-5));

    if (rmsDb < this.filterConfig.gateThresholdDb) {
      return { freqHz: null, key: null, cents: null, rmsDb, confidence: 0 };
    }

    const { freq, confidence } = detectPitchYIN(this.timeBuf, this.ctx.sampleRate);
    if (!freq || confidence < 0.72) {
      return { freqHz: null, key: null, cents: null, rmsDb, confidence };
    }

    // Normalize detected frequency into F3–C6 key index using current octaveShift
    const adjustedFreq = freq / Math.pow(2, octaveShift);
    const match = findClosestSA11Key(adjustedFreq);
    return {
      freqHz: freq,
      key: match?.key ?? null,
      cents: match?.cents ?? null,
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
