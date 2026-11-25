import React, { useEffect, useRef, useState } from 'react';
import { SA11_KEYS, SA11_TONES } from '../data/sa11Data';
import { audioEngine } from '../audio/audioEngine';
import { RecordedTake } from './RecordStudioPanel';
import { Disc3, Play, Plus, Square, Trash2 } from 'lucide-react';

interface MusicMakerPanelProps {
  selectedToneCode: string;
  lastDetectedMidi: number | null;
  takes: RecordedTake[];
  onSequencerStepNote: (midi: number | null) => void;
}

type DrumRow = 'kick' | 'snare' | 'hihat' | 'clap';

const DRUM_ROWS: Array<{ id: DrumRow; label: string; color: string }> = [
  { id: 'kick', label: 'Kick (Bas Davul)', color: '#3d5afe' },
  { id: 'snare', label: 'Snare (Trampet)', color: '#eb5757' },
  { id: 'hihat', label: 'Hi-Hat (Zil)', color: '#2f9e6e' },
  { id: 'clap', label: 'Clap / Rim', color: '#d97706' },
];

const DEFAULT_DRUMS: Record<DrumRow, boolean[]> = {
  kick:  [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
  snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
  hihat: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, true],
  clap:  [false, false, false, false, false, false, false, false, false, false, false, false, true, false, false, false],
};

const DEFAULT_MELODY: Array<number | null> = [
  60, null, 64, null, 67, null, 72, null, 71, null, 67, null, 64, null, 62, null,
];

export const MusicMakerPanel: React.FC<MusicMakerPanelProps> = ({
  selectedToneCode,
  lastDetectedMidi,
  takes,
  onSequencerStepNote,
}) => {
  const [bpm, setBpm] = useState(112);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [drums, setDrums] = useState<Record<DrumRow, boolean[]>>(DEFAULT_DRUMS);
  const [melody, setMelody] = useState<Array<number | null>>(DEFAULT_MELODY);
  const [liveCaptureStep, setLiveCaptureStep] = useState<number | null>(null);

  const stepRef = useRef(0);
  const drumsRef = useRef(drums);
  const melodyRef = useRef(melody);
  const toneRef = useRef(selectedToneCode);

  drumsRef.current = drums;
  melodyRef.current = melody;
  toneRef.current = selectedToneCode;

  // When liveCaptureStep is armed and user hits a key on Casio SA-11, record it into that step!
  useEffect(() => {
    if (liveCaptureStep !== null && lastDetectedMidi !== null) {
      setMelody((prev) => {
        const next = [...prev];
        next[liveCaptureStep] = lastDetectedMidi;
        return next;
      });
      setLiveCaptureStep((prev) => (prev !== null ? (prev + 1) % 16 : null));
    }
  }, [lastDetectedMidi]);

  useEffect(() => {
    if (!isPlaying) {
      setCurrentStep(-1);
      onSequencerStepNote(null);
      return;
    }

    const stepMs = (60 / bpm / 4) * 1000;
    const timer = window.setInterval(() => {
      const s = stepRef.current;
      setCurrentStep(s);

      // Trigger drums
      for (const row of DRUM_ROWS) {
        if (drumsRef.current[row.id][s]) {
          audioEngine.playDrumHit(row.id);
        }
      }

      // Trigger melody note & flash 3D key
      const midi = melodyRef.current[s];
      if (midi !== null) {
        const tone = SA11_TONES.find((t) => t.code === toneRef.current) ?? SA11_TONES[0];
        audioEngine.playShortNote(midi, tone, Math.max(120, stepMs * 0.85));
        onSequencerStepNote(midi);
      } else {
        onSequencerStepNote(null);
      }

      stepRef.current = (s + 1) % 16;
    }, stepMs);

    return () => {
      window.clearInterval(timer);
      onSequencerStepNote(null);
    };
  }, [isPlaying, bpm]);

  const toggleDrum = (row: DrumRow, idx: number) => {
    setDrums((prev) => ({
      ...prev,
      [row]: prev[row].map((v, i) => (i === idx ? !v : v)),
    }));
  };

  const applyRhythmPreset = (preset: 'rock' | 'disco' | 'bossa') => {
    if (preset === 'rock') {
      setBpm(116);
      setDrums(DEFAULT_DRUMS);
    } else if (preset === 'disco') {
      setBpm(124);
      setDrums({
        kick:  [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
        snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
        hihat: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
        clap:  [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      });
    } else {
      setBpm(104);
      setDrums({
        kick:  [true, false, false, true, false, false, true, false, false, false, true, false, false, true, false, false],
        snare: [false, false, true, false, false, true, false, false, true, false, false, true, false, false, true, false],
        hihat: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
        clap:  [false, false, false, false, false, false, true, false, false, false, false, false, false, false, false, false],
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Transport Bar */}
      <div className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              if (!isPlaying) stepRef.current = 0;
              setIsPlaying(!isPlaying);
            }}
          >
            {isPlaying ? <><Square size={14} /> Durdur</> : <><Play size={14} /> Sekanseri Çal</>}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Tempo (BPM):</span>
            <input
              type="range"
              min={70}
              max={160}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
            />
            <span className="chip mono">{bpm} BPM</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => applyRhythmPreset('rock')}>SA-11 Rock</button>
          <button className="btn btn-sm" onClick={() => applyRhythmPreset('disco')}>SA-11 Disco</button>
          <button className="btn btn-sm" onClick={() => applyRhythmPreset('bossa')}>SA-11 Bossa Nova</button>
          <button
            className={`btn btn-sm ${liveCaptureStep !== null ? 'btn-danger' : 'btn-ok'}`}
            onClick={() => setLiveCaptureStep(liveCaptureStep !== null ? null : 0)}
          >
            <Plus size={13} /> {liveCaptureStep !== null ? `Klavyeden Adım #${liveCaptureStep + 1} Dinleniyor...` : 'SA-11 Klavyeden Melodi Yaz'}
          </button>
        </div>
      </div>

      {/* 16-Step Drum Grid */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Disc3 size={15} /> 16-Adım Ritim & Davul Kanalı</span>
          <span className="card-sub">Her kutucuğa tıklayarak ritim kalıbını düzenleyin</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowX: 'auto' }}>
          {DRUM_ROWS.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '140px repeat(16, minmax(26px, 1fr))', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-h)' }}>{row.label}</span>
              {drums[row.id].map((active, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleDrum(row.id, idx)}
                  style={{
                    height: 30,
                    borderRadius: 6,
                    border: `1.5px solid ${currentStep === idx ? '#191919' : active ? row.color : 'var(--border)'}`,
                    background: active ? row.color : idx % 4 === 0 ? '#f1f0ec' : '#ffffff',
                    opacity: currentStep === idx ? 1 : active ? 0.88 : 1,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 16-Step Melody Track */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Melodi Kanalı (Aktif SA-11 Tonu: #{selectedToneCode})</span>
          <button
            className="btn btn-sm"
            onClick={() => setMelody(Array(16).fill(null))}
          >
            <Trash2 size={13} /> Melodiyi Temizle
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16, minmax(42px, 1fr))', gap: 5, overflowX: 'auto' }}>
          {melody.map((midi, idx) => {
            const isArmed = liveCaptureStep === idx;
            const isNow = currentStep === idx;
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: 4,
                  borderRadius: 7,
                  border: `1.5px solid ${isArmed ? 'var(--danger)' : isNow ? 'var(--accent)' : 'var(--border)'}`,
                  background: isNow ? 'var(--active-bg)' : '#fff',
                }}
              >
                <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>
                  {idx + 1}
                </div>
                <select
                  className="select mono"
                  style={{ padding: '3px 2px', fontSize: 11 }}
                  value={midi ?? ''}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setMelody((prev) => prev.map((m, i) => (i === idx ? val : m)));
                  }}
                >
                  <option value="">—</option>
                  {SA11_KEYS.map((k) => (
                    <option key={k.midi} value={k.midi}>{k.note}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recorded Casio SA-11 Clips */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Kayıt Stüdyosundan Gelen Temizlenmiş SA-11 Klipleri</span>
          <span className="chip mono">{takes.length} Klip</span>
        </div>
        {takes.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Kayıt Stüdyosu sekmesinde kaydettiğiniz ve Python Aktif Filtre ile temizlediğiniz klipler burada düzenleme ve eşlik için otomatik listelenir.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {takes.map((t) => (
              <div key={t.id} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong style={{ fontSize: 13 }}>{t.name}</strong>
                  <span className={`chip ${t.cleanedUrl ? 'ok' : ''}`}>
                    {t.cleanedUrl ? 'Filtrelenmiş' : 'Ham'}
                  </span>
                </div>
                <audio controls src={t.cleanedUrl ?? t.rawUrl} style={{ width: '100%', height: 30 }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
