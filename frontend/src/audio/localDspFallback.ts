// Client-side TypeScript Active Filter & Zero-Phase WAV DSP Fallback
// Enables full Active Filter Lab & Record Studio functionality on static GitHub Pages (github.io)
// while automatically deferring to Python SciPy backend when running locally.

import type {
  ActiveRCStage,
  ApproximationType,
  CircuitTopology,
  FilterDesignParams,
  FilterDesignResult,
  FilterPreset,
  FilterResponseType,
  WavProcessResult,
} from './dspClient';

export const LOCAL_SA11_PRESETS: FilterPreset[] = [
  {
    id: 'sa11-pitch-prefilter',
    name: 'SA-11 Nota Algılama Ön-Filtresi (BPF)',
    purpose: 'pitch_detection',
    description:
      "Casio SA-11'in 32 tuş aralığı (F3=174.6 Hz – C6=1046.5 Hz) için 50 Hz şebeke gürültüsünü ve üst harmonik parazitlerini bastıran 4. derece Butterworth Band-Pass.",
    approx: 'butterworth',
    ftype: 'bandpass',
    order: 4,
    fc: 145.0,
    fc_high: 2200.0,
    rp: 0.5,
    rs: 40.0,
    topology: 'sallen-key',
  },
  {
    id: 'sa11-lofi-hiss-cleaner',
    name: '8-Bit PCM Tıslama Temizleyici (Bessel LPF)',
    purpose: 'audio_cleanup',
    description:
      "SA-11'in 1990 model 8-bit PCM kuantalama gürültüsünü doğrusal fazlı 4. derece Bessel Alçak Geçiren filtre ile transient'ları bozmadan temizler.",
    approx: 'bessel',
    ftype: 'lowpass',
    order: 4,
    fc: 5500.0,
    fc_high: null,
    rp: 0.5,
    rs: 40.0,
    topology: 'sallen-key',
  },
  {
    id: 'sa11-mains-hum-hpf',
    name: 'DC Ofset & 50 Hz Uğultu Kesici (HPF)',
    purpose: 'audio_cleanup',
    description:
      'Anakart Line-In girişinden gelen DC ofseti, masa titreşimlerini ve 50 Hz şebeke uğultusunu kesen 4. derece Butterworth Yüksek Geçiren filtre.',
    approx: 'butterworth',
    ftype: 'highpass',
    order: 4,
    fc: 85.0,
    fc_high: null,
    rp: 0.5,
    rs: 40.0,
    topology: 'mfb',
  },
  {
    id: 'sa11-warm-piano',
    name: 'Sıcak Piyano & Org Parlatıcı (Chebyshev I)',
    purpose: 'music_maker',
    description:
      '0.5 dB geçirme bandı dalgalanması ile SA-11 piyano ve org tonlarına sıcak analog karakter kazandırır.',
    approx: 'cheby1',
    ftype: 'lowpass',
    order: 4,
    fc: 7500.0,
    fc_high: null,
    rp: 0.5,
    rs: 40.0,
    topology: 'sallen-key',
  },
  {
    id: 'sa11-notch-50hz',
    name: '50 Hz Şebeke Çentik Filtresi (Notch)',
    purpose: 'audio_cleanup',
    description:
      'Türkiye 50 Hz elektrik şebekesinden kaynaklanan hum gürültüsünü nokta atışı bastıran Band-Stop (Notch) filtre.',
    approx: 'butterworth',
    ftype: 'bandstop',
    order: 2,
    fc: 47.0,
    fc_high: 53.0,
    rp: 0.5,
    rs: 40.0,
    topology: 'mfb',
  },
];

// Normalized Q values per biquad stage for classical approximations
function getStageQs(approx: ApproximationType, order: number, rp: number): number[] {
  const nPairs = Math.max(1, Math.floor(order / 2));
  const qs: number[] = [];
  if (approx === 'bessel') {
    const besselQ: Record<number, number[]> = {
      1: [0.577],
      2: [0.5774],
      3: [0.691],
      4: [0.5219, 0.8055],
      5: [0.5635, 0.9165],
      6: [0.5103, 0.6112, 1.0233],
      7: [0.5324, 0.6608, 1.1262],
      8: [0.506, 0.5596, 0.7109, 1.2257],
    };
    return besselQ[order] ?? [0.5774];
  }
  const eps = Math.sqrt(Math.max(0.01, Math.pow(10, rp / 10) - 1));
  const mu = (1 / Math.max(1, order)) * Math.asinh(1 / eps);
  for (let k = 0; k < nPairs; k++) {
    const theta = ((2 * k + 1) * Math.PI) / (2 * Math.max(2, order));
    if (approx === 'butterworth') {
      qs.push(1 / (2 * Math.cos(theta)));
    } else if (approx === 'cheby1' || approx === 'ellip') {
      const sigma = Math.sinh(mu) * Math.cos(theta);
      const omega = Math.cosh(mu) * Math.sin(theta);
      const w0 = Math.hypot(sigma, omega);
      qs.push(w0 / (2 * Math.max(1e-4, sigma)));
    } else {
      // cheby2 gentle Q scaling
      qs.push((1 / (2 * Math.cos(theta))) * 1.15);
    }
  }
  return qs;
}

function makeBiquadSOS(
  type: FilterResponseType,
  fc: number,
  fcHigh: number | null | undefined,
  q: number,
  fs: number
): number[] {
  const nyq = fs / 2;
  const f1 = Math.max(10, Math.min(fc, nyq * 0.94));
  const f2 = Math.max(f1 + 5, Math.min(fcHigh ?? f1 * 2, nyq * 0.96));

  let w0 = (2 * Math.PI * f1) / fs;
  let alpha = Math.sin(w0) / (2 * Math.max(0.25, q));

  if (type === 'bandpass' || type === 'bandstop') {
    const f0 = Math.sqrt(f1 * f2);
    const bw = Math.max(4, f2 - f1);
    const qBand = Math.max(0.35, f0 / bw);
    w0 = (2 * Math.PI * f0) / fs;
    alpha = Math.sin(w0) / (2 * qBand);
  }

  const cosw = Math.cos(w0);
  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

  if (type === 'lowpass') {
    b0 = (1 - cosw) / 2;
    b1 = 1 - cosw;
    b2 = (1 - cosw) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosw;
    a2 = 1 - alpha;
  } else if (type === 'highpass') {
    b0 = (1 + cosw) / 2;
    b1 = -(1 + cosw);
    b2 = (1 + cosw) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosw;
    a2 = 1 - alpha;
  } else if (type === 'bandpass') {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
    a0 = 1 + alpha;
    a1 = -2 * cosw;
    a2 = 1 - alpha;
  } else {
    // bandstop / notch
    b0 = 1;
    b1 = -2 * cosw;
    b2 = 1;
    a0 = 1 + alpha;
    a1 = -2 * cosw;
    a2 = 1 - alpha;
  }

  return [b0 / a0, b1 / a0, b2 / a0, 1.0, a1 / a0, a2 / a0];
}

function evalSosFreqResponse(sos: number[][], freqHz: number, fs: number): { magDb: number; phaseDeg: number } {
  const w = (2 * Math.PI * freqHz) / fs;
  const c1 = Math.cos(-w), s1 = Math.sin(-w);
  const c2 = Math.cos(-2 * w), s2 = Math.sin(-2 * w);

  let reTot = 1;
  let imTot = 0;

  for (const sec of sos) {
    const [b0, b1, b2, a0, a1, a2] = sec;
    const numRe = b0 + b1 * c1 + b2 * c2;
    const numIm = b1 * s1 + b2 * s2;
    const denRe = a0 + a1 * c1 + a2 * c2;
    const denIm = a1 * s1 + a2 * s2;
    const denMag2 = denRe * denRe + denIm * denIm + 1e-18;
    const hRe = (numRe * denRe + numIm * denIm) / denMag2;
    const hIm = (numIm * denRe - numRe * denIm) / denMag2;
    const nextRe = reTot * hRe - imTot * hIm;
    const nextIm = reTot * hIm + imTot * hRe;
    reTot = nextRe;
    imTot = nextIm;
  }

  const mag = Math.hypot(reTot, imTot);
  return {
    magDb: 20 * Math.log10(Math.max(mag, 1e-6)),
    phaseDeg: (Math.atan2(imTot, reTot) * 180) / Math.PI,
  };
}

export function designActiveFilterLocal(params: FilterDesignParams): FilterDesignResult {
  const approx = params.approx ?? 'butterworth';
  const ftype = params.ftype ?? 'lowpass';
  const order = Math.max(1, Math.min(8, Math.round(params.order ?? 4)));
  const fc = params.fc ?? 2200;
  const fcHigh = params.fc_high ?? null;
  const rp = params.rp ?? 0.5;
  const fs = params.fs ?? 48000;
  const topology: CircuitTopology = params.topology ?? 'sallen-key';
  const cBaseNf = params.c_base_nf ?? 10;
  const cBase = cBaseNf * 1e-9;

  const qs = getStageQs(approx, order, rp);
  const sos: number[][] = [];
  const stages: ActiveRCStage[] = [];
  const poles: Array<{ re: number; im: number }> = [];

  if (ftype === 'bandpass' && fcHigh && fcHigh > fc) {
    // Cascade HPF @ fc + LPF @ fcHigh for flat, wide musical band-pass (like SA-11 145–2200 Hz)
    for (const q of qs) {
      sos.push(makeBiquadSOS('highpass', fc, null, q, fs));
      sos.push(makeBiquadSOS('lowpass', fcHigh, null, q, fs));
    }
  } else {
    for (const q of qs) {
      sos.push(makeBiquadSOS(ftype, fc, fcHigh, q, fs));
    }
  }

  const f0Ref =
    (ftype === 'bandpass' || ftype === 'bandstop') && fcHigh && fcHigh > fc
      ? Math.sqrt(fc * fcHigh)
      : fc;
  const w0Ref = 2 * Math.PI * f0Ref;

  qs.forEach((q, idx) => {
    const sigma = -w0Ref / (2 * q);
    const omega = w0Ref * Math.sqrt(Math.max(0, 1 - 1 / (4 * q * q)));
    poles.push({ re: Number(sigma.toFixed(2)), im: Number(omega.toFixed(2)) });
    poles.push({ re: Number(sigma.toFixed(2)), im: Number((-omega).toFixed(2)) });

    if (topology === 'sallen-key') {
      const rVal = 1 / (w0Ref * cBase);
      const gainK = Math.max(1, 3 - 1 / q);
      const ra = 10000;
      const rb = Math.max(0, (gainK - 1) * ra);
      stages.push({
        stage: idx + 1,
        order: 2,
        topology: 'Sallen-Key (Equal-R/C)',
        f0_hz: Number(f0Ref.toFixed(2)),
        q: Number(q.toFixed(4)),
        gain_k: Number(gainK.toFixed(4)),
        components: {
          R1_ohm: Number(rVal.toFixed(1)),
          R2_ohm: Number(rVal.toFixed(1)),
          C1_nF: Number(cBaseNf.toFixed(2)),
          C2_nF: Number(cBaseNf.toFixed(2)),
          Ra_ohm: ra,
          Rb_ohm: Number(rb.toFixed(1)),
        },
      });
    } else {
      const m = Math.max(4 * q * q * 2.1, 4);
      const c2 = cBase;
      const c1 = m * c2;
      const rEq = 1 / (w0Ref * Math.sqrt(c1 * c2));
      stages.push({
        stage: idx + 1,
        order: 2,
        topology: 'Multiple Feedback (MFB)',
        f0_hz: Number(f0Ref.toFixed(2)),
        q: Number(q.toFixed(4)),
        gain_k: 1.0,
        components: {
          R1_ohm: Number(rEq.toFixed(1)),
          R2_ohm: Number(rEq.toFixed(1)),
          R3_ohm: Number(rEq.toFixed(1)),
          C1_nF: Number((c1 * 1e9).toFixed(2)),
          C2_nF: Number((c2 * 1e9).toFixed(2)),
        },
      });
    }
  });

  // 220 log-spaced Bode points (20 Hz .. 20 kHz)
  const freqs: number[] = [];
  const mag_db: number[] = [];
  const phase_deg: number[] = [];
  const group_delay_ms: number[] = [];
  const logMin = Math.log10(20);
  const logMax = Math.log10(Math.min(20000, fs * 0.49));
  for (let i = 0; i < 220; i++) {
    const f = Math.pow(10, logMin + (i / 219) * (logMax - logMin));
    const { magDb, phaseDeg } = evalSosFreqResponse(sos, f, fs);
    freqs.push(Number(f.toFixed(2)));
    mag_db.push(Number(magDb.toFixed(3)));
    phase_deg.push(Number(phaseDeg.toFixed(2)));
    group_delay_ms.push(0);
  }

  return {
    params: { approx, ftype, order, fc, fc_high: fcHigh, rp, rs: params.rs ?? 40, fs, topology },
    sos,
    bode: { freqs, mag_db, phase_deg, group_delay_ms },
    s_plane: { poles, zeros: [], gain: 1 },
    stages,
  };
}

// =========================================================================
// Client-side Zero-Phase SOS Filtering & WAV Processing (GitHub Pages mode)
// =========================================================================

function applySosForward(x: Float64Array, sos: number[][]): Float64Array {
  let buf = Float64Array.from(x);
  for (const sec of sos) {
    const [b0, b1, b2, , a1, a2] = sec;
    const out = new Float64Array(buf.length);
    let z1 = 0;
    let z2 = 0;
    for (let i = 0; i < buf.length; i++) {
      const xi = buf[i];
      const yi = b0 * xi + z1;
      z1 = b1 * xi - a1 * yi + z2;
      z2 = b2 * xi - a2 * yi;
      out[i] = yi;
    }
    buf = out;
  }
  return buf;
}

function sosFiltFilt(x: Float64Array, sos: number[][]): Float64Array {
  const fwd = applySosForward(x, sos);
  fwd.reverse();
  const bwd = applySosForward(fwd, sos);
  bwd.reverse();
  return bwd;
}

function computeSimpleSpectrum(samples: Float64Array, fs: number, nBins = 72): { freqs: number[]; mag_db: number[] } {
  const freqs: number[] = [];
  const mag_db: number[] = [];
  const N = Math.min(samples.length, 4096);
  const start = Math.floor(Math.max(0, (samples.length - N) / 2));
  const logMin = Math.log10(25);
  const logMax = Math.log10(Math.min(18000, fs * 0.48));

  for (let b = 0; b < nBins; b++) {
    const f = Math.pow(10, logMin + (b / (nBins - 1)) * (logMax - logMin));
    const w = (2 * Math.PI * f) / fs;
    let re = 0;
    let im = 0;
    // Goertzel-style DFT at log-spaced frequencies
    for (let i = 0; i < N; i += 2) {
      const win = 0.5 * (1 - Math.cos((2 * Math.PI * i) / N));
      const v = samples[start + i] * win;
      const ang = w * i;
      re += v * Math.cos(ang);
      im -= v * Math.sin(ang);
    }
    const mag = Math.hypot(re, im) / (N / 4);
    freqs.push(Number(f.toFixed(1)));
    mag_db.push(Number((20 * Math.log10(Math.max(mag, 1e-6))).toFixed(2)));
  }
  return { freqs, mag_db };
}

export async function processWavLocal(
  wavBlob: Blob,
  opts: {
    approx: ApproximationType;
    ftype: FilterResponseType;
    order: number;
    fc: number;
    fc_high?: number | null;
    rp?: number;
    rs?: number;
    remove_50hz_hum: boolean;
    remove_dc_offset: boolean;
    noise_gate_db: number;
    normalize_peak: boolean;
  }
): Promise<WavProcessResult> {
  const arr = await wavBlob.arrayBuffer();
  const view = new DataView(arr);
  const fs = view.getUint32(24, true) || 48000;
  const nSamples = Math.floor((arr.byteLength - 44) / 2);
  const data = new Float64Array(nSamples);
  for (let i = 0; i < nSamples; i++) {
    data[i] = view.getInt16(44 + i * 2, true) / 32768;
  }

  let beforeSq = 0;
  let beforePk = 1e-12;
  for (let i = 0; i < data.length; i++) {
    beforeSq += data[i] * data[i];
    beforePk = Math.max(beforePk, Math.abs(data[i]));
  }
  const beforeRms = Math.sqrt(beforeSq / Math.max(1, data.length) + 1e-12);
  const beforeSpec = computeSimpleSpectrum(data, fs);

  let y: Float64Array<ArrayBufferLike> = Float64Array.from(data);

  if (opts.remove_dc_offset) {
    let mean = 0;
    for (let i = 0; i < y.length; i++) mean += y[i];
    mean /= Math.max(1, y.length);
    for (let i = 0; i < y.length; i++) y[i] -= mean;
    y = sosFiltFilt(y, [makeBiquadSOS('highpass', 30, null, 0.707, fs)]);
  }

  if (opts.remove_50hz_hum) {
    const notches = [
      makeBiquadSOS('bandstop', 48, 52, 25, fs),
      makeBiquadSOS('bandstop', 98, 102, 30, fs),
      makeBiquadSOS('bandstop', 148, 152, 30, fs),
    ];
    y = sosFiltFilt(y, notches);
  }

  const mainDesign = designActiveFilterLocal({
    approx: opts.approx,
    ftype: opts.ftype,
    order: opts.order,
    fc: opts.fc,
    fc_high: opts.fc_high,
    rp: opts.rp,
    fs,
  });
  y = sosFiltFilt(y, mainDesign.sos);

  if (opts.noise_gate_db > -90) {
    const thresh = Math.pow(10, opts.noise_gate_db / 20);
    for (let i = 0; i < y.length; i++) {
      const a = Math.abs(y[i]);
      if (a < thresh * 0.6) y[i] = 0;
    }
  }

  if (opts.normalize_peak) {
    let pk = 0;
    for (let i = 0; i < y.length; i++) pk = Math.max(pk, Math.abs(y[i]));
    if (pk > 1e-6) {
      const g = 0.891 / pk;
      for (let i = 0; i < y.length; i++) y[i] = Math.max(-1, Math.min(1, y[i] * g));
    }
  }

  let afterSq = 0;
  let afterPk = 1e-12;
  for (let i = 0; i < y.length; i++) {
    afterSq += y[i] * y[i];
    afterPk = Math.max(afterPk, Math.abs(y[i]));
  }
  const afterRms = Math.sqrt(afterSq / Math.max(1, y.length) + 1e-12);
  const afterSpec = computeSimpleSpectrum(y, fs);

  // Encode cleaned 16-bit PCM WAV to base64
  const outBuf = new ArrayBuffer(44 + y.length * 2);
  const outView = new DataView(outBuf);
  const wStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) outView.setUint8(off + i, s.charCodeAt(i));
  };
  wStr(0, 'RIFF');
  outView.setUint32(4, 36 + y.length * 2, true);
  wStr(8, 'WAVE');
  wStr(12, 'fmt ');
  outView.setUint32(16, 16, true);
  outView.setUint16(20, 1, true);
  outView.setUint16(22, 1, true);
  outView.setUint32(24, fs, true);
  outView.setUint32(28, fs * 2, true);
  outView.setUint16(32, 2, true);
  outView.setUint16(34, 16, true);
  wStr(36, 'data');
  outView.setUint32(40, y.length * 2, true);
  for (let i = 0; i < y.length; i++) {
    const s = Math.max(-1, Math.min(1, y[i]));
    outView.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(outBuf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);

  return {
    sample_rate: fs,
    duration_sec: Number((y.length / fs).toFixed(3)),
    metrics: {
      before_rms_db: Number((20 * Math.log10(beforeRms)).toFixed(2)),
      after_rms_db: Number((20 * Math.log10(afterRms)).toFixed(2)),
      before_peak_db: Number((20 * Math.log10(beforePk)).toFixed(2)),
      after_peak_db: Number((20 * Math.log10(afterPk)).toFixed(2)),
    },
    spectrum_before: beforeSpec,
    spectrum_after: afterSpec,
    cleaned_wav_base64: btoa(bin),
  };
}
