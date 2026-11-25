// Typed API client for Python FastAPI + SciPy Active Filter & DSP Backend
// Automatically falls back to built-in TypeScript DSP on static hosts (GitHub Pages)

import {
  designActiveFilterLocal,
  LOCAL_SA11_PRESETS,
  processWavLocal,
} from './localDspFallback';

export type ApproximationType = 'butterworth' | 'cheby1' | 'cheby2' | 'bessel' | 'ellip';
export type FilterResponseType = 'lowpass' | 'highpass' | 'bandpass' | 'bandstop';
export type CircuitTopology = 'sallen-key' | 'mfb';

export interface FilterDesignParams {
  approx: ApproximationType;
  ftype: FilterResponseType;
  order: number;
  fc: number;
  fc_high?: number | null;
  rp?: number;
  rs?: number;
  fs?: number;
  topology?: CircuitTopology;
  c_base_nf?: number;
}

export interface ActiveRCStage {
  stage: number;
  order: number;
  topology: string;
  f0_hz: number;
  q: number;
  gain_k: number;
  components: Record<string, number>;
}

export interface FilterDesignResult {
  params: FilterDesignParams;
  sos: number[][]; // [b0, b1, b2, a0, a1, a2] per 2nd-order section
  bode: {
    freqs: number[];
    mag_db: number[];
    phase_deg: number[];
    group_delay_ms: number[];
  };
  s_plane: {
    poles: Array<{ re: number; im: number }>;
    zeros: Array<{ re: number; im: number }>;
    gain: number;
  };
  stages: ActiveRCStage[];
}

export interface FilterPreset {
  id: string;
  name: string;
  purpose: 'pitch_detection' | 'audio_cleanup' | 'music_maker';
  description: string;
  approx: ApproximationType;
  ftype: FilterResponseType;
  order: number;
  fc: number;
  fc_high: number | null;
  rp: number;
  rs: number;
  topology: CircuitTopology;
}

export interface WavProcessResult {
  sample_rate: number;
  duration_sec: number;
  metrics: {
    before_rms_db: number;
    after_rms_db: number;
    before_peak_db: number;
    after_peak_db: number;
  };
  spectrum_before: { freqs: number[]; mag_db: number[] };
  spectrum_after: { freqs: number[]; mag_db: number[] };
  cleaned_wav_base64: string;
}

const isLocalHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export async function checkBackendHealth(): Promise<boolean> {
  if (!isLocalHost) return false;
  try {
    const res = await fetch('/api/health');
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchFilterPresets(): Promise<FilterPreset[]> {
  if (isLocalHost) {
    try {
      const res = await fetch('/api/dsp/presets');
      if (res.ok) {
        const json = await res.json();
        return json.presets as FilterPreset[];
      }
    } catch {
      // fall back to local presets
    }
  }
  return LOCAL_SA11_PRESETS;
}

export async function requestFilterDesign(params: FilterDesignParams): Promise<FilterDesignResult> {
  if (isLocalHost) {
    try {
      const res = await fetch('/api/dsp/design-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (res.ok) {
        return (await res.json()) as FilterDesignResult;
      }
    } catch {
      // fall back to browser DSP
    }
  }
  return designActiveFilterLocal(params);
}

export async function requestWavProcessing(
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
  if (isLocalHost) {
    try {
      const form = new FormData();
      form.append('file', wavBlob, 'sa11_recording.wav');
      form.append('approx', opts.approx);
      form.append('ftype', opts.ftype);
      form.append('order', String(opts.order));
      form.append('fc', String(opts.fc));
      if (opts.fc_high) form.append('fc_high', String(opts.fc_high));
      form.append('rp', String(opts.rp ?? 0.5));
      form.append('rs', String(opts.rs ?? 40.0));
      form.append('remove_50hz_hum', String(opts.remove_50hz_hum));
      form.append('remove_dc_offset', String(opts.remove_dc_offset));
      form.append('noise_gate_db', String(opts.noise_gate_db));
      form.append('normalize_peak', String(opts.normalize_peak));

      const res = await fetch('/api/dsp/process-wav', {
        method: 'POST',
        body: form,
      });
      if (res.ok) {
        return (await res.json()) as WavProcessResult;
      }
    } catch {
      // fall back to browser zero-phase DSP
    }
  }
  return processWavLocal(wavBlob, opts);
}

export function base64ToBlob(b64: string, mime = 'audio/wav'): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
