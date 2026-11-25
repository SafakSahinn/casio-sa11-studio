import React, { useState } from 'react';
import { audioEngine, encodeWavPCM16 } from '../audio/audioEngine';
import {
  ApproximationType,
  FilterResponseType,
  WavProcessResult,
  base64ToBlob,
  requestWavProcessing,
} from '../audio/dspClient';
import { Download, Mic, Sparkles, Square, Wand2 } from 'lucide-react';

export interface RecordedTake {
  id: string;
  name: string;
  createdAt: string;
  durationSec: number;
  rawBlob: Blob;
  rawUrl: string;
  cleanedBlob?: Blob;
  cleanedUrl?: string;
  dspResult?: WavProcessResult;
}

interface RecordStudioPanelProps {
  isLineInConnected: boolean;
  backendOnline: boolean;
  takes: RecordedTake[];
  onAddTake: (take: RecordedTake) => void;
  onUpdateTake: (id: string, patch: Partial<RecordedTake>) => void;
}

export const RecordStudioPanel: React.FC<RecordStudioPanelProps> = ({
  isLineInConnected,
  backendOnline,
  takes,
  onAddTake,
  onUpdateTake,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);

  // Cleaning pipeline controls
  const [approx, setApprox] = useState<ApproximationType>('bessel');
  const [ftype, setFtype] = useState<FilterResponseType>('lowpass');
  const [order, setOrder] = useState(4);
  const [fc, setFc] = useState(5500);
  const [remove50Hz, setRemove50Hz] = useState(true);
  const [removeDc, setRemoveDc] = useState(true);
  const [gateDb, setGateDb] = useState(-48);
  const [normalize, setNormalize] = useState(true);

  const handleStartStop = () => {
    if (!isRecording) {
      audioEngine.startRecording();
      setIsRecording(true);
    } else {
      const { blob, durationSec } = audioEngine.stopRecording();
      setIsRecording(false);
      const id = `take-${Date.now()}`;
      const take: RecordedTake = {
        id,
        name: `SA-11 Kayıt #${takes.length + 1}`,
        createdAt: new Date().toLocaleTimeString('tr-TR'),
        durationSec,
        rawBlob: blob,
        rawUrl: URL.createObjectURL(blob),
      };
      onAddTake(take);
      setSelectedTakeId(id);
    }
  };

  // Generate a realistic synthetic noisy SA-11 test WAV (note + 50 Hz hum + 8-bit hiss) so user can test Python DSP even before plugging in the cable!
  const handleCreateDemoTake = () => {
    const sr = 48000;
    const dur = 2.4;
    const n = Math.floor(sr * dur);
    const pcm = new Float32Array(n);
    const notes = [261.63, 329.63, 392.0, 523.25];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const noteFreq = notes[Math.min(notes.length - 1, Math.floor(t / 0.6))];
      const localT = t % 0.6;
      const env = Math.exp(-localT * 3.5);
      // Fundamental + harmonics + 50Hz mains hum + high-freq 8-bit hiss
      const tone =
        (Math.sin(2 * Math.PI * noteFreq * t) +
          0.35 * Math.sin(2 * Math.PI * noteFreq * 2 * t) +
          0.18 * Math.sin(2 * Math.PI * noteFreq * 3 * t)) *
        0.35 *
        env;
      const hum50 = 0.09 * Math.sin(2 * Math.PI * 50 * t) + 0.04 * Math.sin(2 * Math.PI * 100 * t);
      const hiss = (Math.random() * 2 - 1) * 0.035;
      pcm[i] = Math.max(-1, Math.min(1, tone + hum50 + hiss));
    }
    const blob = encodeWavPCM16([pcm], sr);
    const id = `demo-${Date.now()}`;
    const take: RecordedTake = {
      id,
      name: `Demo Test Kaydı (50Hz Hum + Hiss)`,
      createdAt: new Date().toLocaleTimeString('tr-TR'),
      durationSec: dur,
      rawBlob: blob,
      rawUrl: URL.createObjectURL(blob),
    };
    onAddTake(take);
    setSelectedTakeId(id);
  };

  const handleCleanWithPython = async (take: RecordedTake) => {
    setProcessingId(take.id);
    try {
      const result = await requestWavProcessing(take.rawBlob, {
        approx,
        ftype,
        order,
        fc,
        remove_50hz_hum: remove50Hz,
        remove_dc_offset: removeDc,
        noise_gate_db: gateDb,
        normalize_peak: normalize,
      });
      const cleanedBlob = base64ToBlob(result.cleaned_wav_base64, 'audio/wav');
      const cleanedUrl = URL.createObjectURL(cleanedBlob);
      onUpdateTake(take.id, { cleanedBlob, cleanedUrl, dspResult: result });
      setSelectedTakeId(take.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Python DSP işlemi başarısız');
    } finally {
      setProcessingId(null);
    }
  };

  const activeTake = takes.find((t) => t.id === selectedTakeId) ?? takes[0] ?? null;

  const renderSpectrumComparison = (res: WavProcessResult) => {
    const W = 640;
    const H = 190;
    const padL = 44;
    const padR = 14;
    const padT = 16;
    const padB = 26;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const logMin = Math.log10(25);
    const logMax = Math.log10(18000);
    const xOf = (f: number) => padL + ((Math.log10(Math.max(25, f)) - logMin) / (logMax - logMin)) * plotW;
    const yOf = (db: number) => padT + ((0 - Math.max(-95, Math.min(0, db))) / 95) * plotH;

    const pathBefore = res.spectrum_before.freqs
      .map((f, i) => `${i === 0 ? 'M' : 'L'}${xOf(f).toFixed(1)},${yOf(res.spectrum_before.mag_db[i]).toFixed(1)}`)
      .join(' ');
    const pathAfter = res.spectrum_after.freqs
      .map((f, i) => `${i === 0 ? 'M' : 'L'}${xOf(f).toFixed(1)},${yOf(res.spectrum_after.mag_db[i]).toFixed(1)}`)
      .join(' ');

    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 190 }}>
        {[50, 100, 250, 500, 1000, 2500, 5000, 10000].map((gf) => {
          const x = xOf(gf);
          return (
            <g key={gf}>
              <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="rgba(55,53,47,0.08)" />
              <text x={x} y={H - 6} textAnchor="middle" fontSize="10" fill="#787774" fontFamily="JetBrains Mono">
                {gf >= 1000 ? `${gf / 1000}k` : gf}
              </text>
            </g>
          );
        })}
        <path d={pathBefore} fill="none" stroke="rgba(235,87,87,0.65)" strokeWidth="1.7" strokeDasharray="3 2" />
        <path d={pathAfter} fill="none" stroke="#2f9e6e" strokeWidth="2.3" />
      </svg>
    );
  };

  return (
    <div className="grid-asymmetric">
      {/* Left: Recorder & Python Cleaning Pipeline Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Mic size={15} /> Kayıt Kontrolü</span>
            <span className={`chip ${isRecording ? 'danger' : isLineInConnected ? 'ok' : ''}`}>
              {isRecording ? 'KAYITTA' : isLineInConnected ? 'Line-In Hazır' : 'Bağlı Değil'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'}`}
              disabled={!isLineInConnected && !isRecording}
              onClick={handleStartStop}
            >
              {isRecording ? <><Square size={14} /> Kaydı Durdur</> : <><Mic size={14} /> Line-In Kaydını Başlat</>}
            </button>

            <button className="btn btn-sm" onClick={handleCreateDemoTake}>
              <Sparkles size={13} /> Gürültülü Demo SA-11 Kaydı Üret (Test)
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title"><Wand2 size={15} /> Python Sıfır-Fazlı Temizleme</span>
            <span className="chip mono">sosfiltfilt</span>
          </div>

          <div className="field">
            <label className="field-label">Aktif Filtre Yaklaşımı</label>
            <select className="select" value={approx} onChange={(e) => setApprox(e.target.value as ApproximationType)}>
              <option value="bessel">Bessel (Transient Koruyucu — Önerilen)</option>
              <option value="butterworth">Butterworth (Düz Geçiş)</option>
              <option value="cheby1">Chebyshev I (Keskin Kesim)</option>
              <option value="ellip">Elliptic (Maksimum Bastırma)</option>
            </select>
          </div>

          <div className="grid-2" style={{ gap: 8 }}>
            <div className="field">
              <label className="field-label">Tip</label>
              <select className="select" value={ftype} onChange={(e) => setFtype(e.target.value as FilterResponseType)}>
                <option value="lowpass">Low-Pass</option>
                <option value="highpass">High-Pass</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">Kesim f_c (Hz)</label>
              <input className="input mono" type="number" value={fc} onChange={(e) => setFc(Number(e.target.value))} />
            </div>
          </div>

          <div className="grid-2" style={{ gap: 8 }}>
            <div className="field">
              <label className="field-label">Derece (N)</label>
              <input className="input mono" type="number" min={2} max={8} value={order} onChange={(e) => setOrder(Number(e.target.value))} />
            </div>
            <div className="field">
              <label className="field-label">Noise Gate (dB)</label>
              <input className="input mono" type="number" min={-90} max={-20} value={gateDb} onChange={(e) => setGateDb(Number(e.target.value))} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, fontSize: 12.8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <input type="checkbox" checked={remove50Hz} onChange={(e) => setRemove50Hz(e.target.checked)} />
              50 / 100 / 150 Hz Şebeke Uğultusu Notch
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <input type="checkbox" checked={removeDc} onChange={(e) => setRemoveDc(e.target.checked)} />
              DC Ofset & 30 Hz Subsonic Temizleyici
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />
              Peak Normalizasyon (-1.0 dBFS)
            </label>
          </div>
        </div>
      </div>

      {/* Right: Recorded Takes & Before/After Spectrum */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Kayıt Listesi ({takes.length})</span>
            <span className="card-sub">Kayıtlarınızı A/B karşılaştırın ve WAV olarak indirin</span>
          </div>

          {takes.length === 0 ? (
            <div style={{ padding: '26px 12px', textAlign: 'center', color: 'var(--muted)' }}>
              Henüz kayıt yok. Line-In bağlayıp kayıt alabilir veya sol taraftaki <strong>"Gürültülü Demo SA-11 Kaydı Üret"</strong> düğmesiyle Python DSP temizlemesini hemen deneyebilirsiniz.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {takes.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTakeId(t.id)}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border: `1px solid ${activeTake?.id === t.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: activeTake?.id === t.id ? 'var(--active-bg)' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-h)' }}>{t.name}</div>
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {t.createdAt} • {t.durationSec.toFixed(2)} sn
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={processingId === t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleCleanWithPython(t);
                        }}
                      >
                        <Wand2 size={13} /> {processingId === t.id ? 'İşleniyor...' : backendOnline ? 'Python DSP ile Temizle' : 'Aktif Filtre ile Temizle'}
                      </button>
                      <a
                        className="btn btn-sm"
                        href={t.cleanedUrl ?? t.rawUrl}
                        download={`${t.name.replace(/\s+/g, '_')}.wav`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download size={13} /> WAV
                      </a>
                    </div>
                  </div>

                  <div className="grid-2" style={{ marginTop: 10, gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>Ham Kayıt</div>
                      <audio controls src={t.rawUrl} style={{ width: '100%', height: 32 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ok)', marginBottom: 4 }}>
                        Temizlenmiş (Aktif Filtreli)
                      </div>
                      {t.cleanedUrl ? (
                        <audio controls src={t.cleanedUrl} style={{ width: '100%', height: 32 }} />
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--muted)', paddingTop: 6 }}>
                          Henüz filtrelenmedi
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {activeTake?.dspResult && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Önce / Sonra FFT Spektrum Karşılaştırması</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="chip danger">Kesikli Kırmızı: Ham</span>
                <span className="chip ok">Yeşil: Temizlenmiş</span>
              </div>
            </div>
            {renderSpectrumComparison(activeTake.dspResult)}
            <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              <span className="chip mono">Ham RMS: {activeTake.dspResult.metrics.before_rms_db} dB</span>
              <span className="chip ok mono">Temiz RMS: {activeTake.dspResult.metrics.after_rms_db} dB</span>
              <span className="chip mono">Ham Peak: {activeTake.dspResult.metrics.before_peak_db} dB</span>
              <span className="chip ok mono">Temiz Peak: {activeTake.dspResult.metrics.after_peak_db} dB</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
