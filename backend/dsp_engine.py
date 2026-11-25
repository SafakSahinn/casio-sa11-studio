"""
SA-11 Studio — Active Filter Design & Audio DSP Engine (Python + SciPy)
Implements classical analog active filter approximations (Butterworth, Chebyshev I/II,
Bessel, Elliptic), Sallen-Key / MFB circuit synthesis, Bilinear Transform to Web Audio
biquad/SOS coefficients, Bode plot generation, and zero-phase WAV audio cleaning.
"""

from __future__ import annotations

import base64
import io
import math
import wave
from typing import Any, Dict, List, Literal, Optional, Tuple

import numpy as np
from scipy import signal

ApproximationType = Literal["butterworth", "cheby1", "cheby2", "bessel", "ellip"]
FilterResponseType = Literal["lowpass", "highpass", "bandpass", "bandstop"]
CircuitTopology = Literal["sallen-key", "mfb"]


def _design_analog_zpk(
    approx: ApproximationType,
    ftype: FilterResponseType,
    order: int,
    fc: float,
    fc_high: Optional[float],
    rp: float,
    rs: float,
) -> Tuple[np.ndarray, np.ndarray, float]:
    """Design analog prototype in rad/s and return (z, p, k)."""
    w1 = 2.0 * math.pi * fc
    if ftype in ("bandpass", "bandstop"):
        if fc_high is None or fc_high <= fc:
            fc_high = fc * 2.0
        wn: Any = [w1, 2.0 * math.pi * fc_high]
    else:
        wn = w1

    if approx == "butterworth":
        return signal.butter(order, wn, btype=ftype, analog=True, output="zpk")
    if approx == "cheby1":
        return signal.cheby1(order, rp, wn, btype=ftype, analog=True, output="zpk")
    if approx == "cheby2":
        return signal.cheby2(order, rs, wn, btype=ftype, analog=True, output="zpk")
    if approx == "bessel":
        return signal.bessel(order, wn, btype=ftype, analog=True, output="zpk", norm="phase")
    if approx == "ellip":
        return signal.ellip(order, rp, rs, wn, btype=ftype, analog=True, output="zpk")
    raise ValueError(f"Unsupported approximation: {approx}")


def _design_digital_sos(
    approx: ApproximationType,
    ftype: FilterResponseType,
    order: int,
    fc: float,
    fc_high: Optional[float],
    rp: float,
    rs: float,
    fs: float,
) -> np.ndarray:
    """Design digital SOS via Bilinear Transform at sampling rate fs."""
    nyq = fs / 2.0
    f1 = max(1.0, min(fc, nyq * 0.96))
    if ftype in ("bandpass", "bandstop"):
        f2 = max(f1 + 5.0, min(fc_high or (f1 * 2.0), nyq * 0.97))
        wn: Any = [f1 / nyq, f2 / nyq]
    else:
        wn = f1 / nyq

    if approx == "butterworth":
        return signal.butter(order, wn, btype=ftype, analog=False, output="sos")
    if approx == "cheby1":
        return signal.cheby1(order, rp, wn, btype=ftype, analog=False, output="sos")
    if approx == "cheby2":
        return signal.cheby2(order, rs, wn, btype=ftype, analog=False, output="sos")
    if approx == "bessel":
        return signal.bessel(order, wn, btype=ftype, analog=False, output="sos", norm="phase")
    if approx == "ellip":
        return signal.ellip(order, rp, rs, wn, btype=ftype, analog=False, output="sos")
    raise ValueError(f"Unsupported approximation: {approx}")


def _synthesize_active_stages(
    poles: np.ndarray,
    topology: CircuitTopology = "sallen-key",
    c_base_nf: float = 10.0,
) -> List[Dict[str, Any]]:
    """
    Extract 2nd-order (and optional 1st-order) active RC stages from analog s-plane poles
    and compute practical Sallen-Key or Multiple Feedback (MFB) component values.
    """
    stages: List[Dict[str, Any]] = []
    used = np.zeros(len(poles), dtype=bool)
    c_base = c_base_nf * 1e-9  # Farads

    for i in range(len(poles)):
        if used[i]:
            continue
        p = poles[i]
        if abs(p.imag) > 1e-3:
            # Find conjugate partner
            partner = -1
            for j in range(i + 1, len(poles)):
                if not used[j] and abs(poles[j] - np.conj(p)) < max(1.0, abs(p) * 1e-3):
                    partner = j
                    break
            used[i] = True
            if partner != -1:
                used[partner] = True

            w0 = float(abs(p))
            f0 = w0 / (2.0 * math.pi)
            sigma = float(abs(p.real))
            q = w0 / (2.0 * max(sigma, 1e-9))

            if topology == "sallen-key":
                # Equal-R, Equal-C Sallen-Key LPF prototype:
                # w0 = 1 / (R * C), Q = 1 / (3 - K) => K = 3 - 1/Q
                r_val = 1.0 / (w0 * c_base)
                gain_k = max(1.0, 3.0 - (1.0 / q))
                ra = 10_000.0
                rb = max(0.0, (gain_k - 1.0) * ra)
                stages.append(
                    {
                        "stage": len(stages) + 1,
                        "order": 2,
                        "topology": "Sallen-Key (Equal-R/C)",
                        "f0_hz": round(f0, 2),
                        "q": round(q, 4),
                        "gain_k": round(gain_k, 4),
                        "components": {
                            "R1_ohm": round(r_val, 1),
                            "R2_ohm": round(r_val, 1),
                            "C1_nF": round(c_base_nf, 2),
                            "C2_nF": round(c_base_nf, 2),
                            "Ra_ohm": round(ra, 1),
                            "Rb_ohm": round(rb, 1),
                        },
                    }
                )
            else:
                # Multiple Feedback (MFB) Unity-Gain LPF:
                # Choose C2 = c_base, C1 = m * C2 where m >= 4*Q^2 * (1 + |H0|)
                m = max(4.0 * q * q * 2.1, 4.0)
                c2 = c_base
                c1 = m * c2
                # R1 = R2 = R3 approximation for unity gain:
                # w0 = 1 / (R * sqrt(C1*C2)) -> R = 1 / (w0 * sqrt(C1*C2))
                r_eq = 1.0 / (w0 * math.sqrt(c1 * c2))
                stages.append(
                    {
                        "stage": len(stages) + 1,
                        "order": 2,
                        "topology": "Multiple Feedback (MFB)",
                        "f0_hz": round(f0, 2),
                        "q": round(q, 4),
                        "gain_k": 1.0,
                        "components": {
                            "R1_ohm": round(r_eq, 1),
                            "R2_ohm": round(r_eq, 1),
                            "R3_ohm": round(r_eq, 1),
                            "C1_nF": round(c1 * 1e9, 2),
                            "C2_nF": round(c2 * 1e9, 2),
                        },
                    }
                )
        else:
            used[i] = True
            w0 = float(abs(p.real))
            f0 = w0 / (2.0 * math.pi)
            r_val = 1.0 / (max(w0, 1e-6) * c_base)
            stages.append(
                {
                    "stage": len(stages) + 1,
                    "order": 1,
                    "topology": "1st-Order Active RC Buffer",
                    "f0_hz": round(f0, 2),
                    "q": 0.5,
                    "gain_k": 1.0,
                    "components": {
                        "R1_ohm": round(r_val, 1),
                        "C1_nF": round(c_base_nf, 2),
                    },
                }
            )

    return stages


def design_active_filter(
    approx: ApproximationType = "butterworth",
    ftype: FilterResponseType = "lowpass",
    order: int = 4,
    fc: float = 2200.0,
    fc_high: Optional[float] = None,
    rp: float = 0.5,
    rs: float = 40.0,
    fs: float = 48000.0,
    topology: CircuitTopology = "sallen-key",
    c_base_nf: float = 10.0,
) -> Dict[str, Any]:
    """Full active filter design: analog poles/zeros, RC circuit values, digital SOS & Bode plot."""
    order = max(1, min(int(order), 8))
    z, p, k = _design_analog_zpk(approx, ftype, order, fc, fc_high, rp, rs)
    sos = _design_digital_sos(approx, ftype, order, fc, fc_high, rp, rs, fs)

    # Bode response on 220 log-spaced points from 20 Hz to 20 kHz
    freqs = np.logspace(math.log10(20.0), math.log10(min(20000.0, fs * 0.49)), 220)
    w_dig, h_dig = signal.sosfreqz(sos, worN=freqs, fs=fs)
    mag_db = 20.0 * np.log10(np.maximum(np.abs(h_dig), 1e-6))
    phase_deg = np.degrees(np.unwrap(np.angle(h_dig)))

    # Group delay (in ms) from digital response derivative
    w_rad = 2.0 * np.pi * w_dig
    dphase = np.gradient(np.unwrap(np.angle(h_dig)), w_rad)
    group_delay_ms = np.clip(-dphase * 1000.0, -50.0, 200.0)

    stages = _synthesize_active_stages(p, topology=topology, c_base_nf=c_base_nf)

    return {
        "params": {
            "approx": approx,
            "ftype": ftype,
            "order": order,
            "fc": fc,
            "fc_high": fc_high,
            "rp": rp,
            "rs": rs,
            "fs": fs,
            "topology": topology,
        },
        "sos": [[float(x) for x in row] for row in sos],
        "bode": {
            "freqs": [round(float(x), 2) for x in w_dig],
            "mag_db": [round(float(x), 3) for x in mag_db],
            "phase_deg": [round(float(x), 2) for x in phase_deg],
            "group_delay_ms": [round(float(x), 3) for x in group_delay_ms],
        },
        "s_plane": {
            "poles": [{"re": round(float(val.real), 3), "im": round(float(val.imag), 3)} for val in p],
            "zeros": [{"re": round(float(val.real), 3), "im": round(float(val.imag), 3)} for val in z],
            "gain": float(k),
        },
        "stages": stages,
    }


def get_sa11_presets() -> List[Dict[str, Any]]:
    """Curated active filter presets engineered specifically for Casio SA-11."""
    return [
        {
            "id": "sa11-pitch-prefilter",
            "name": "SA-11 Nota Algılama Ön-Filtresi (BPF)",
            "purpose": "pitch_detection",
            "description": "Casio SA-11'in 32 tuş aralığı (F3=174.6 Hz – C6=1046.5 Hz) için 50 Hz şebeke gürültüsünü ve üst harmonik parazitlerini bastıran 4. derece Butterworth Band-Pass.",
            "approx": "butterworth",
            "ftype": "bandpass",
            "order": 4,
            "fc": 145.0,
            "fc_high": 2200.0,
            "rp": 0.5,
            "rs": 40.0,
            "topology": "sallen-key",
        },
        {
            "id": "sa11-lofi-hiss-cleaner",
            "name": "8-Bit PCM Tıslama Temizleyici (Bessel LPF)",
            "purpose": "audio_cleanup",
            "description": "SA-11'in 1990 model 8-bit PCM kuantalama gürültüsünü doğrusal fazlı 4. derece Bessel Alçak Geçiren filtre ile transient'ları bozmadan temizler.",
            "approx": "bessel",
            "ftype": "lowpass",
            "order": 4,
            "fc": 5500.0,
            "fc_high": None,
            "rp": 0.5,
            "rs": 40.0,
            "topology": "sallen-key",
        },
        {
            "id": "sa11-mains-hum-hpf",
            "name": "DC Ofset & 50 Hz Uğultu Kesici (HPF)",
            "purpose": "audio_cleanup",
            "description": "Anakart Line-In girişinden gelen DC ofseti, masa titreşimlerini ve 50 Hz şebeke uğultusunu kesen 4. derece Butterworth Yüksek Geçiren filtre.",
            "approx": "butterworth",
            "ftype": "highpass",
            "order": 4,
            "fc": 85.0,
            "fc_high": None,
            "rp": 0.5,
            "rs": 40.0,
            "topology": "mfb",
        },
        {
            "id": "sa11-warm-piano",
            "name": "Sıcak Piyano & Org Parlatıcı (Chebyshev I)",
            "purpose": "music_maker",
            "description": "0.5 dB geçirme bandı dalgalanması ile SA-11 piyano ve org tonlarına sıcak analog karakter kazandırır.",
            "approx": "cheby1",
            "ftype": "lowpass",
            "order": 4,
            "fc": 7500.0,
            "fc_high": None,
            "rp": 0.5,
            "rs": 40.0,
            "topology": "sallen-key",
        },
        {
            "id": "sa11-notch-50hz",
            "name": "50 Hz Şebeke Çentik Filtresi (Notch)",
            "purpose": "audio_cleanup",
            "description": "Türkiye 50 Hz elektrik şebekesinden kaynaklanan hum gürültüsünü nokta atışı bastıran Band-Stop (Notch) filtre.",
            "approx": "butterworth",
            "ftype": "bandstop",
            "order": 2,
            "fc": 47.0,
            "fc_high": 53.0,
            "rp": 0.5,
            "rs": 40.0,
            "topology": "mfb",
        },
    ]


def _compute_spectrum_bins(samples: np.ndarray, fs: int, n_bins: int = 96) -> Dict[str, List[float]]:
    """Compute log-spaced FFT magnitude spectrum in dB."""
    if len(samples) < 64:
        return {"freqs": [], "mag_db": []}
    n_fft = min(16384, 1 << int(math.ceil(math.log2(min(len(samples), 16384)))))
    window = np.hanning(n_fft)
    # Average over up to 8 overlapping windows for smooth spectrum
    hop = max(1, (len(samples) - n_fft) // 8) if len(samples) > n_fft else n_fft
    acc = np.zeros(n_fft // 2 + 1, dtype=np.float64)
    count = 0
    for start in range(0, max(1, len(samples) - n_fft + 1), hop):
        seg = samples[start : start + n_fft]
        if len(seg) < n_fft:
            seg = np.pad(seg, (0, n_fft - len(seg)))
        spec = np.abs(np.fft.rfft(seg * window)) / (n_fft / 2.0)
        acc += spec
        count += 1
        if count >= 8:
            break
    acc /= max(1, count)
    freqs_all = np.fft.rfftfreq(n_fft, 1.0 / fs)
    target_freqs = np.logspace(math.log10(25.0), math.log10(min(18000.0, fs * 0.48)), n_bins)
    interp_mag = np.interp(target_freqs, freqs_all, acc)
    mag_db = 20.0 * np.log10(np.maximum(interp_mag, 1e-6))
    return {
        "freqs": [round(float(f), 1) for f in target_freqs],
        "mag_db": [round(float(m), 2) for m in mag_db],
    }


def process_wav_audio(
    wav_bytes: bytes,
    approx: ApproximationType = "bessel",
    ftype: FilterResponseType = "lowpass",
    order: int = 4,
    fc: float = 5500.0,
    fc_high: Optional[float] = None,
    rp: float = 0.5,
    rs: float = 40.0,
    remove_50hz_hum: bool = True,
    remove_dc_offset: bool = True,
    noise_gate_db: float = -48.0,
    normalize_peak: bool = True,
) -> Dict[str, Any]:
    """
    Clean and enhance a recorded Casio SA-11 WAV file using zero-phase SciPy SOS filtering.
    Returns base64-encoded cleaned WAV + before/after spectrum and audio metrics.
    """
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        fs = wf.getframerate()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    if sampwidth == 2:
        data = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
    elif sampwidth == 4:
        data = np.frombuffer(raw, dtype=np.int32).astype(np.float64) / 2147483648.0
    else:
        raise ValueError(f"Unsupported WAV sample width: {sampwidth} bytes (use 16-bit PCM)")

    if n_channels > 1:
        data = data.reshape(-1, n_channels).mean(axis=1)

    before_rms = float(np.sqrt(np.mean(data**2) + 1e-12))
    before_peak = float(np.max(np.abs(data)) + 1e-12)
    before_spec = _compute_spectrum_bins(data, fs)

    y = data.copy()

    # 1. DC Offset & Subsonic Rumble Removal (2nd-order Butterworth HPF @ 30 Hz)
    if remove_dc_offset and len(y) > 32:
        y = y - np.mean(y)
        sos_dc = signal.butter(2, 30.0 / (fs / 2.0), btype="highpass", output="sos")
        y = signal.sosfiltfilt(sos_dc, y)

    # 2. 50 Hz Mains Hum + 100 Hz & 150 Hz Harmonics Notch Cascade
    if remove_50hz_hum and len(y) > 64:
        for hum_freq, q_val in ((50.0, 30.0), (100.0, 35.0), (150.0, 35.0)):
            if hum_freq < fs * 0.45:
                b_n, a_n = signal.iirnotch(hum_freq, q_val, fs)
                y = signal.filtfilt(b_n, a_n, y)

    # 3. User-Designed Active Filter (Zero-Phase SOS)
    if len(y) > 64:
        sos_main = _design_digital_sos(approx, ftype, order, fc, fc_high, rp, rs, float(fs))
        y = signal.sosfiltfilt(sos_main, y)

    # 4. Soft Noise Gate (envelope follower)
    if noise_gate_db > -90.0:
        thresh = 10.0 ** (noise_gate_db / 20.0)
        win = max(1, int(fs * 0.015))
        env = np.sqrt(np.convolve(y**2, np.ones(win) / win, mode="same") + 1e-12)
        gate_gain = np.clip((env - thresh * 0.6) / (thresh * 0.4 + 1e-9), 0.0, 1.0)
        y = y * gate_gain

    # 5. Peak Normalization to -1.0 dBFS (~0.891)
    if normalize_peak:
        pk = float(np.max(np.abs(y)))
        if pk > 1e-6:
            y = y * (0.891 / pk)

    y = np.clip(y, -1.0, 1.0)
    after_rms = float(np.sqrt(np.mean(y**2) + 1e-12))
    after_peak = float(np.max(np.abs(y)) + 1e-12)
    after_spec = _compute_spectrum_bins(y, fs)

    # Encode cleaned mono 16-bit PCM WAV
    out_buf = io.BytesIO()
    with wave.open(out_buf, "wb") as wf_out:
        wf_out.setnchannels(1)
        wf_out.setsampwidth(2)
        wf_out.setframerate(fs)
        pcm16 = (y * 32767.0).astype(np.int16)
        wf_out.writeframes(pcm16.tobytes())

    wav_b64 = base64.b64encode(out_buf.getvalue()).decode("ascii")

    return {
        "sample_rate": fs,
        "duration_sec": round(len(y) / fs, 3),
        "metrics": {
            "before_rms_db": round(20.0 * math.log10(before_rms), 2),
            "after_rms_db": round(20.0 * math.log10(after_rms), 2),
            "before_peak_db": round(20.0 * math.log10(before_peak), 2),
            "after_peak_db": round(20.0 * math.log10(after_peak), 2),
        },
        "spectrum_before": before_spec,
        "spectrum_after": after_spec,
        "cleaned_wav_base64": wav_b64,
    }
