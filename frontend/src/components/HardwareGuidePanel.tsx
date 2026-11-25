import React from 'react';
import { Cable, CheckCircle2, FileText, Info, ShieldCheck } from 'lucide-react';

interface HardwareGuidePanelProps {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  isLineInConnected: boolean;
  onSelectDevice: (id: string) => void;
  onRefreshDevices: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const HardwareGuidePanel: React.FC<HardwareGuidePanelProps> = ({
  devices,
  selectedDeviceId,
  isLineInConnected,
  onSelectDevice,
  onRefreshDevices,
  onConnect,
  onDisconnect,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="grid-2">
        {/* Left: Motherboard Blue Jack Diagram & Electrical Explanation */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Cable size={16} color="var(--accent)" /> Doğru Bağlantı: Anakart MAVİ Giriş (Line-In)</span>
            <span className="chip ok">Doğrulandı</span>
          </div>

          <p style={{ fontSize: 13.5, marginBottom: 14 }}>
            Tahmininiz <strong>tamamen doğru</strong>! Casio SA-11'in arkasındaki <strong>OUTPUT</strong> çıkışını, bilgisayar anakartının arkasındaki <strong>MAVİ (Line-In)</strong> jakına <strong>3.5 mm TRS → 3.5 mm TRS AUX kablosu</strong> ile bağlamalısınız.
          </p>

          {/* Visual PC Motherboard Audio Jacks SVG */}
          <svg viewBox="0 0 520 120" style={{ width: '100%', height: 120, background: 'var(--panel)', borderRadius: 10, border: '1px solid var(--border)' }}>
            {/* Blue Line-In */}
            <g transform="translate(85, 52)">
              <circle r="24" fill="#3b82f6" stroke="#1d4ed8" strokeWidth="3" />
              <circle r="10" fill="#0f172a" />
              <text y="-32" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1d4ed8">MAVİ — LINE-IN ✓</text>
              <text y="42" textAnchor="middle" fontSize="10.5" fill="#2f2e2b">Casio SA-11 Buraya</text>
            </g>

            {/* Green Line-Out */}
            <g transform="translate(260, 52)">
              <circle r="22" fill="#22c55e" stroke="#15803d" strokeWidth="2.5" opacity="0.7" />
              <circle r="9" fill="#0f172a" />
              <text y="-30" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#787774">YEŞİL — LINE-OUT</text>
              <text y="40" textAnchor="middle" fontSize="10" fill="#787774">Hoparlör / Kulaklık</text>
            </g>

            {/* Pink Mic-In */}
            <g transform="translate(435, 52)">
              <circle r="22" fill="#ec4899" stroke="#be185d" strokeWidth="2.5" opacity="0.65" />
              <circle r="9" fill="#0f172a" />
              <text y="-30" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#eb5757">PEMBE — MIC-IN ✕</text>
              <text y="40" textAnchor="middle" fontSize="10" fill="#eb5757">Kırpma (Clipping) Yapar</text>
            </g>
          </svg>

          <div style={{ marginTop: 14, background: 'var(--side)', padding: 12, borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.8 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Info size={14} color="var(--accent)" /> Resmi Casio SA-11 Kılavuzundan Elektriksel Değerler (Sayfa 4)
            </div>
            <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <li><strong>Output Empedansı:</strong> <span className="mono">100 Ω</span></li>
              <li><strong>Maksimum Çıkış Gerilimi:</strong> <span className="mono">2.0 V (RMS) MAX</span> — Hat seviyesi (Line-Level)</li>
              <li><strong>Pembe Mic-In Neden Kullanılmaz?</strong> Mic-In +20–30 dB ön yükselteç ve bias gerilimi uygular; 2.0 V RMS sinyal anında kırpılır.</li>
              <li><strong>Önerilen SA-11 Ses Seviyesi:</strong> 5 kademeden <strong>3 veya 4</strong> (ADC clipping olmaması için).</li>
            </ul>
          </div>
        </div>

        {/* Right: Audio Device Picker & Windows Checklist */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card-header" style={{ marginBottom: 0 }}>
            <span className="card-title"><ShieldCheck size={16} color="var(--ok)" /> Ses Giriş Aygıtı & Windows Ayarları</span>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">Bilgisayar Giriş Aygıtı (Line-In Seçin)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                className="select"
                value={selectedDeviceId}
                onChange={(e) => onSelectDevice(e.target.value)}
              >
                <option value="">Varsayılan Giriş Aygıtı</option>
                {devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Ses Girişi #${i + 1}`}
                  </option>
                ))}
              </select>
              <button className="btn btn-sm" onClick={onRefreshDevices}>Yenile</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {!isLineInConnected ? (
              <button className="btn btn-primary" onClick={onConnect}>
                Line-In Bağlantısını Başlat (Ham Ses Modu)
              </button>
            ) : (
              <button className="btn btn-danger" onClick={onDisconnect}>
                Bağlantıyı Kes
              </button>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Windows Temiz Sinyal Kontrol Listesi</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.8 }}>
              <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                <CheckCircle2 size={15} color="var(--ok)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span><strong>Kayıt Aygıtları (mmsys.cpl) → Hat Girişi (Line In):</strong> Düzeyler %65–%75 aralığında olsun.</span>
              </div>
              <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                <CheckCircle2 size={15} color="var(--ok)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span><strong>Ses Geliştirmeleri (Audio Enhancements):</strong> KAPALI yapın; gürültü ve 50 Hz filtrelemesini uygulama arka planda otomatik yapar.</span>
              </div>
              <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                <CheckCircle2 size={15} color="var(--ok)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span><strong>Örnekleme Hızı:</strong> <span className="mono">48000 Hz (16-bit / 24-bit)</span> seçili olsun.</span>
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--accent-soft)', padding: 11, borderRadius: 8, fontSize: 12.5, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <FileText size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
              <span>
                Resmi Casio SA-11 Kullanım Kılavuzu (<strong className="mono">PDF, 4 Sayfa</strong>)
              </span>
            </div>
            <a
              className="btn btn-sm btn-primary"
              href="./Casio_SA-11_Manual.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Kılavuzu Aç / İndir
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
