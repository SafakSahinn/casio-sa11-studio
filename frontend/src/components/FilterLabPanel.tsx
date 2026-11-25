import React, { useEffect, useRef, useState } from 'react';
import {
  ApproximationType,
  CircuitTopology,
  FilterDesignParams,
  FilterDesignResult,
  FilterPreset,
  FilterResponseType,
  fetchFilterPresets,
  requestFilterDesign,
} from '../audio/dspClient';
import { audioEngine } from '../audio/audioEngine';
import { Activity, CheckCircle2, Cpu, Sliders, Zap } from 'lucide-react';

interface FilterLabPanelProps {
  backendOnline: boolean;
  liveFilterEnabled: boolean;
  notch50Hz: boolean;
  activeFilterResult: FilterDesignResult | null;
  onToggleLiveFilter: (v: boolean) => void;
  onToggleNotch50Hz: (v: boolean) => void;
  onFilterDesigned: (res: FilterDesignResult) => void;
}

export const FilterLabPanel: React.FC<FilterLabPanelProps> = ({
  backendOnline,
  liveFilterEnabled,
  notch50Hz,
  activeFilterResult,
  onToggleLiveFilter,
  onToggleNotch50Hz,
  onFilterDesigned,
}) => {
  const [approx, setApprox] = useState<ApproximationType>('butterworth');
  const [ftype, setFtype] = useState<FilterResponseType>('bandpass');
  const [order, setOrder] = useState<number>(4);
  const [fc, setFc] = useState<number>(145);
  const [fcHigh, setFcHigh] = useState<number>(2200);
  const [rp, setRp] = useState<number>(0.5);
  const [rs, setRs] = useState<number>(40);
  const [topology, setTopology] = useState<CircuitTopology>('sallen-key');
  const [cBaseNf, setCBaseNf] = useState<number>(10);

  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    fetchFilterPresets().then(setPresets).catch(() => {});
  }, [backendOnline]);

  const runDesign = async (override?: Partial<FilterDesignParams>) => {
    setLoading(true);
    setError(null);
    const params: FilterDesignParams = {
      approx: override?.approx ?? approx,
      ftype: override?.ftype ?? ftype,
      order: override?.order ?? order,
      fc: override?.fc ?? fc,
      fc_high: (override?.ftype ?? ftype) === 'bandpass' || (override?.ftype ?? ftype) === 'bandstop'
        ? (override?.fc_high ?? fcHigh)
        : null,
      rp: override?.rp ?? rp,
      rs: override?.rs ?? rs,
      fs: audioEngine.getSampleRate(),
      topology: override?.topology ?? topology,
      c_base_nf: override?.c_base_nf ?? cBaseNf,
    };
    try {
      const res = await requestFilterDesign(params);
      onFilterDesigned(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Python DSP sunucusuna ulaşılamadı');
    } finally {
      setLoading(false);
    }
  };

  // Auto-design once on mount so Bode plot & SOS are immediately ready (Python or Browser DSP)
  useEffect(() => {
    if (!activeFilterResult) {
      void runDesign();
    }
  }, [backendOnline]);

  // Live Oscilloscope & FFT Spectrum Canvas
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = scopeCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#fbfbfa';
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = 'rgba(55,53,47,0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += w / 8) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

      const data = audioEngine.getAnalyserData();
      if (!data) {
        ctx.fillStyle = '#787774';
        ctx.font = '500 12px Inter, sans-serif';
        ctx.fillText('Canlı Osiloskop — Line-In bağlandığında Ham (Gri) vs Filtrelenmiş (Mavi) sinyal burada görünür', 16, h / 2 + 4);
        return;
      }

      // Raw waveform (light slate)
      ctx.strokeStyle = 'rgba(120, 119, 116, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const step = Math.max(1, Math.floor(data.rawTime.length / w));
      for (let x = 0; x < w; x++) {
        const v = data.rawTime[x * step] ?? 0;
        const y = h / 2 - v * (h * 0.42);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Filtered waveform (vivid accent blue)
      ctx.strokeStyle = '#3d5afe';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const v = data.filteredTime[x * step] ?? 0;
        const y = h / 2 - v * (h * 0.42);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  // Build SVG Bode Plot path
  const renderBodeSvg = () => {
    if (!activeFilterResult) {
      return (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
          {backendOnline ? 'Bode grafiği hesaplanıyor...' : 'Bode ve Sallen-Key hesabı için Python backend (port 8000) çalıştırın.'}
        </div>
      );
    }
    const { freqs, mag_db } = activeFilterResult.bode;
    const W = 680;
    const H = 220;
    const padL = 46;
    const padR = 16;
    const padT = 16;
    const padB = 30;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const logMin = Math.log10(20);
    const logMax = Math.log10(20000);
    const xOf = (f: number) => padL + ((Math.log10(Math.max(20, f)) - logMin) / (logMax - logMin)) * plotW;
    const yOf = (db: number) => {
      const clamped = Math.max(-60, Math.min(6, db));
      return padT + ((6 - clamped) / 66) * plotH;
    };

    const pathD = freqs
      .map((f, i) => `${i === 0 ? 'M' : 'L'}${xOf(f).toFixed(1)},${yOf(mag_db[i]).toFixed(1)}`)
      .join(' ');

    const sa11X1 = xOf(174.61); // F3
    const sa11X2 = xOf(1046.5); // C6

    const gridFreqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const gridDbs = [0, -3, -20, -40, -60];

    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 220, display: 'block' }}>
        {/* SA-11 32-key fundamental band shading */}
        <rect
          x={sa11X1}
          y={padT}
          width={sa11X2 - sa11X1}
          height={plotH}
          fill="rgba(61, 90, 254, 0.07)"
        />
        <text x={(sa11X1 + sa11X2) / 2} y={padT + 13} textAnchor="middle" fontSize="10" fill="#3d5afe" fontWeight="600">
          SA-11 Temel Nota Bandı (F3–C6)
        </text>

        {/* Grid lines */}
        {gridFreqs.map((gf) => {
          const x = xOf(gf);
          return (
            <g key={gf}>
              <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="rgba(55,53,47,0.09)" />
              <text x={x} y={H - 8} textAnchor="middle" fontSize="10" fill="#787774" fontFamily="JetBrains Mono">
                {gf >= 1000 ? `${gf / 1000}k` : gf}
              </text>
            </g>
          );
        })}

        {gridDbs.map((db) => {
          const y = yOf(db);
          return (
            <g key={db}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke={db === -3 ? 'rgba(235,87,87,0.4)' : 'rgba(55,53,47,0.09)'}
                strokeDasharray={db === -3 ? '4 3' : undefined}
              />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" fill={db === -3 ? '#eb5757' : '#787774'} fontFamily="JetBrains Mono">
                {db}dB
              </text>
            </g>
          );
        })}

        {/* Magnitude Curve */}
        <path d={pathD} fill="none" stroke="#3d5afe" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Quick Presets Bar */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          <div className="card-title">
            <Zap size={15} color="var(--accent)" /> Casio SA-11 Hazır Aktif Filtre Profilleri (Python SciPy)
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={liveFilterEnabled}
                onChange={(e) => onToggleLiveFilter(e.target.checked)}
              />
              Canlı Filtre Aktif
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notch50Hz}
                onChange={(e) => onToggleNotch50Hz(e.target.checked)}
              />
              50 Hz Şebeke Notch
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {presets.map((p) => (
            <button
              key={p.id}
              className="btn btn-sm"
              title={p.description}
              onClick={() => {
                setApprox(p.approx);
                setFtype(p.ftype);
                setOrder(p.order);
                setFc(p.fc);
                if (p.fc_high) setFcHigh(p.fc_high);
                setTopology(p.topology);
                void runDesign({
                  approx: p.approx,
                  ftype: p.ftype,
                  order: p.order,
                  fc: p.fc,
                  fc_high: p.fc_high,
                  topology: p.topology,
                });
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-asymmetric">
        {/* Left: Filter Parameters */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Sliders size={15} /> Filtre Tasarım Parametreleri</span>
            <span className={`chip ${backendOnline ? 'ok' : 'accent'}`}>
              {backendOnline ? 'Python SciPy' : 'Tarayıcı DSP'}
            </span>
          </div>

          <div className="field">
            <label className="field-label">Yaklaşım Tipi (Approximation)</label>
            <select className="select" value={approx} onChange={(e) => setApprox(e.target.value as ApproximationType)}>
              <option value="butterworth">Butterworth (Maksimum Düz Geçirme)</option>
              <option value="bessel">Bessel (Doğrusal Faz / Sabit Grup Gecikmesi)</option>
              <option value="cheby1">Chebyshev Tip I (Keskin Geçiş, Passband Ripple)</option>
              <option value="cheby2">Chebyshev Tip II (Stopband Ripple)</option>
              <option value="ellip">Elliptic / Cauer (En Dik Geçiş)</option>
            </select>
          </div>

          <div className="field">
            <label className="field-label">Filtre Karakteristiği</label>
            <select className="select" value={ftype} onChange={(e) => setFtype(e.target.value as FilterResponseType)}>
              <option value="lowpass">Alçak Geçiren (Low-Pass — Hiss Temizleme)</option>
              <option value="highpass">Yüksek Geçiren (High-Pass — DC/Hum Kesme)</option>
              <option value="bandpass">Bant Geçiren (Band-Pass — Nota Okuma)</option>
              <option value="bandstop">Bant Durduran (Notch — 50 Hz Eliminasyon)</option>
            </select>
          </div>

          <div className="grid-2" style={{ gap: 10 }}>
            <div className="field">
              <label className="field-label">
                Derece (N) <span className="mono">{order}</span>
              </label>
              <input
                type="range"
                min={1}
                max={8}
                step={1}
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
              />
            </div>

            <div className="field">
              <label className="field-label">Aktif Devre Topolojisi</label>
              <select className="select" value={topology} onChange={(e) => setTopology(e.target.value as CircuitTopology)}>
                <option value="sallen-key">Sallen-Key (Equal-R/C)</option>
                <option value="mfb">Multiple Feedback (MFB)</option>
              </select>
            </div>
          </div>

          <div className="grid-2" style={{ gap: 10 }}>
            <div className="field">
              <label className="field-label">
                {ftype === 'bandpass' || ftype === 'bandstop' ? 'Alt Kesim f_c1 (Hz)' : 'Kesim Frekansı f_c (Hz)'}
              </label>
              <input
                className="input mono"
                type="number"
                min={20}
                max={18000}
                value={fc}
                onChange={(e) => setFc(Number(e.target.value))}
              />
            </div>

            {(ftype === 'bandpass' || ftype === 'bandstop') && (
              <div className="field">
                <label className="field-label">Üst Kesim f_c2 (Hz)</label>
                <input
                  className="input mono"
                  type="number"
                  min={50}
                  max={20000}
                  value={fcHigh}
                  onChange={(e) => setFcHigh(Number(e.target.value))}
                />
              </div>
            )}
          </div>

          <div className="grid-2" style={{ gap: 10 }}>
            <div className="field">
              <label className="field-label">Baz Kapasite C (nF)</label>
              <input
                className="input mono"
                type="number"
                min={1}
                max={1000}
                value={cBaseNf}
                onChange={(e) => setCBaseNf(Number(e.target.value))}
              />
            </div>
            {(approx === 'cheby1' || approx === 'ellip') && (
              <div className="field">
                <label className="field-label">Passband Ripple Rp (dB)</label>
                <input
                  className="input mono"
                  type="number"
                  step={0.1}
                  min={0.1}
                  max={3}
                  value={rp}
                  onChange={(e) => setRp(Number(e.target.value))}
                />
              </div>
            )}
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 10 }}>{error}</div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={loading}
            onClick={() => void runDesign()}
          >
            <Cpu size={15} /> {loading ? 'Hesaplanıyor...' : backendOnline ? 'Python ile Tasarla & Canlı Uygula' : 'Aktif Filtreyi Tasarla & Canlı Uygula'}
          </button>

          {activeFilterResult && (
            <div
              style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 8,
                background: 'var(--ok-soft)',
                color: 'var(--ok)',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <CheckCircle2 size={14} />
              {activeFilterResult.sos.length} Biquad (SOS) kademesi Web Audio IIR zincirine yüklendi!
            </div>
          )}
        </div>

        {/* Right: Bode Plot, Active RC Stages, Live Oscilloscope */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Bode Genlik Diyagramı |H(jω)| (dB)</span>
              <span className="chip mono">20 Hz – 20 kHz (Log)</span>
            </div>
            {renderBodeSvg()}
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title"><Activity size={15} /> Canlı Osiloskop (Ham vs. Aktif Filtrelenmiş)</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="chip">Gri: Ham Line-In</span>
                <span className="chip accent">Mavi: Filtrelenmiş</span>
              </div>
            </div>
            <canvas
              ref={scopeCanvasRef}
              width={680}
              height={120}
              style={{ width: '100%', height: 120, borderRadius: 8, border: '1px solid var(--border)' }}
            />
          </div>

          {activeFilterResult && activeFilterResult.stages.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Analog Aktif Filtre Devre Kademeleri (Bölüm 4 — Sallen-Key / MFB)</span>
                <span className="chip mono">{activeFilterResult.stages.length} Kademe</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Kademe</th>
                      <th>Topoloji</th>
                      <th>f₀ (Hz)</th>
                      <th>Q Faktörü</th>
                      <th>Kazanç (K)</th>
                      <th>Bileşen Değerleri (R, C)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeFilterResult.stages.map((st) => (
                      <tr key={st.stage}>
                        <td className="mono" style={{ fontWeight: 700 }}>#{st.stage}</td>
                        <td>{st.topology}</td>
                        <td className="mono">{st.f0_hz}</td>
                        <td className="mono">{st.q}</td>
                        <td className="mono">{st.gain_k}</td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {Object.entries(st.components)
                            .map(([k, v]) => `${k.replace('_ohm', '').replace('_nF', '')}=${k.endsWith('_ohm') ? `${(v / 1000).toFixed(2)}kΩ` : `${v}nF`}`)
                            .join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
