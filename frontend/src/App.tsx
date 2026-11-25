import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CasioSA11_3D } from './components/CasioSA11_3D';
import { EducationPanel } from './components/EducationPanel';
import { FilterLabPanel } from './components/FilterLabPanel';
import { RecordedTake, RecordStudioPanel } from './components/RecordStudioPanel';
import { MusicMakerPanel } from './components/MusicMakerPanel';
import { HardwareGuidePanel } from './components/HardwareGuidePanel';
import { MUSIC_LESSONS, MusicLesson, SA11_KEYS, SA11_TONES, SA11Key, SA11Tone } from './data/sa11Data';
import { audioEngine } from './audio/audioEngine';
import { checkBackendHealth, FilterDesignResult, requestFilterDesign } from './audio/dspClient';
import {
  BookOpen,
  Cable,
  Disc3,
  Headphones,
  Mic,
  PlugZap,
  Sliders,
  Volume2,
  VolumeX,
} from 'lucide-react';

type ActiveTab = 'education' | 'filter' | 'record' | 'maker' | 'hardware';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('education');
  const [selectedToneCode, setSelectedToneCode] = useState<string>('00');

  // Audio / Line-In state
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isLineInConnected, setIsLineInConnected] = useState(false);
  const [monitorOutput, setMonitorOutput] = useState(false);
  const [liveFilterEnabled, setLiveFilterEnabled] = useState(true);
  const [notch50Hz, setNotch50Hz] = useState(true);

  // Real-time pitch detection & active keys (RED on 3D keyboard!)
  const [detectedMidi, setDetectedMidi] = useState<number | null>(null);
  const [detectedNoteLabel, setDetectedNoteLabel] = useState<string | null>(null);
  const [detectedFreqHz, setDetectedFreqHz] = useState<number | null>(null);
  const [detectedCents, setDetectedCents] = useState<number | null>(null);
  const [rmsLevelPct, setRmsLevelPct] = useState(0);

  // Virtual clicks / PC keyboard / Sequencer active notes
  const [virtualMidiNotes, setVirtualMidiNotes] = useState<number[]>([]);
  const [seqMidiNote, setSeqMidiNote] = useState<number | null>(null);

  // Python DSP backend state
  const [backendOnline, setBackendOnline] = useState(false);
  const [activeFilterResult, setActiveFilterResult] = useState<FilterDesignResult | null>(null);

  // Education interactive practice state
  const [activeLessonId, setActiveLessonId] = useState<string | null>(MUSIC_LESSONS[0].id);
  const [customSequence, setCustomSequence] = useState<number[] | null>(null);
  const [customExerciseLabel, setCustomExerciseLabel] = useState<string | null>(null);
  const [lessonStepIndex, setLessonStepIndex] = useState<number>(0);

  // Recorded takes shared between Record Studio & Music Maker
  const [takes, setTakes] = useState<RecordedTake[]>([]);

  const lastMatchedNoteRef = useRef<number | null>(null);
  const selectedTone = useMemo(
    () => SA11_TONES.find((t) => t.code === selectedToneCode) ?? SA11_TONES[0],
    [selectedToneCode]
  );

  // Target sequence for Education mode
  const activeSequence = useMemo(() => {
    if (customSequence) return customSequence;
    if (!activeLessonId) return null;
    return MUSIC_LESSONS.find((l) => l.id === activeLessonId)?.targetMidiSequence ?? null;
  }, [activeLessonId, customSequence]);

  const targetMidiNote =
    activeTab === 'education' && activeSequence && lessonStepIndex < activeSequence.length
      ? activeSequence[lessonStepIndex]
      : null;

  // Check Python DSP Backend health on mount & periodically
  useEffect(() => {
    const check = () => checkBackendHealth().then(setBackendOnline);
    void check();
    const t = window.setInterval(check, 8000);
    return () => window.clearInterval(t);
  }, []);

  // Load initial input device list
  const refreshDevices = async () => {
    try {
      const list = await audioEngine.listInputDevices();
      setDevices(list);
      const lineIn = list.find((d) => /line|hat/i.test(d.label));
      if (lineIn && !selectedDeviceId) {
        setSelectedDeviceId(lineIn.deviceId);
      }
    } catch {}
  };

  useEffect(() => {
    void refreshDevices();
  }, []);

  // Real-time Pitch Detection loop (~30 FPS) when Line-In is connected
  useEffect(() => {
    if (!isLineInConnected) {
      setDetectedMidi(null);
      setRmsLevelPct(0);
      return;
    }
    const timer = window.setInterval(() => {
      const reading = audioEngine.analyzeLivePitch();
      const pct = Math.max(0, Math.min(100, ((reading.rmsDb + 60) / 60) * 100));
      setRmsLevelPct(pct);

      if (reading.key && reading.freqHz) {
        setDetectedMidi(reading.key.midi);
        setDetectedNoteLabel(`${reading.key.note} (${reading.key.solfege.replace(/\d/, '')})`);
        setDetectedFreqHz(reading.freqHz);
        setDetectedCents(reading.cents);
      } else {
        setDetectedMidi(null);
      }
    }, 33);

    return () => window.clearInterval(timer);
  }, [isLineInConnected]);

  // Advance Education exercise automatically when user hits the target note (via real SA-11 OR 3D click!)
  const combinedActiveMidis = useMemo(() => {
    const set = new Set<number>(virtualMidiNotes);
    if (detectedMidi !== null) set.add(detectedMidi);
    if (seqMidiNote !== null) set.add(seqMidiNote);
    return Array.from(set);
  }, [virtualMidiNotes, detectedMidi, seqMidiNote]);

  useEffect(() => {
    if (targetMidiNote === null) {
      lastMatchedNoteRef.current = null;
      return;
    }
    if (combinedActiveMidis.includes(targetMidiNote)) {
      if (lastMatchedNoteRef.current !== targetMidiNote) {
        lastMatchedNoteRef.current = targetMidiNote;
        setLessonStepIndex((prev) => prev + 1);
      }
    } else if (lastMatchedNoteRef.current !== null && !combinedActiveMidis.includes(lastMatchedNoteRef.current)) {
      lastMatchedNoteRef.current = null;
    }
  }, [combinedActiveMidis, targetMidiNote]);

  // PC Keyboard shortcuts for quick testing (A-S-D-F-G-H-J-K etc.)
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.repeat || ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
      const keyObj = SA11_KEYS.find((k) => k.pcKey === ev.key.toLowerCase());
      if (keyObj) handleVirtualKeyPress(keyObj);
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      const keyObj = SA11_KEYS.find((k) => k.pcKey === ev.key.toLowerCase());
      if (keyObj) handleVirtualKeyRelease(keyObj);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [selectedTone]);

  const handleConnectLineIn = async () => {
    try {
      await audioEngine.connectLineIn(selectedDeviceId || undefined);
      setIsLineInConnected(true);
      await refreshDevices();
    } catch (e) {
      alert('Line-In ses girişine erişilemedi. Tarayıcı mikrofon/ses iznini onaylayın.\n' + String(e));
    }
  };

  const handleDisconnectLineIn = () => {
    audioEngine.disconnectLineIn();
    setIsLineInConnected(false);
    setDetectedMidi(null);
    setDetectedNoteLabel(null);
    setDetectedFreqHz(null);
    setDetectedCents(null);
  };

  const handleVirtualKeyPress = (k: SA11Key) => {
    audioEngine.noteOn(k.midi, selectedTone);
    setVirtualMidiNotes((prev) => (prev.includes(k.midi) ? prev : [...prev, k.midi]));
    setDetectedNoteLabel(`${k.note} (${k.solfege.replace(/\d/, '')})`);
    setDetectedFreqHz(k.freq);
    setDetectedCents(0);
  };

  const handleVirtualKeyRelease = (k: SA11Key) => {
    audioEngine.noteOff(k.midi);
    setVirtualMidiNotes((prev) => prev.filter((m) => m !== k.midi));
  };

  const handleApplyFilterResult = (res: FilterDesignResult) => {
    setActiveFilterResult(res);
    audioEngine.updateFilterConfig({ sos: res.sos, enabled: liveFilterEnabled, notch50Hz });
  };

  const handleApplyToneFilter = async (tone: SA11Tone) => {
    try {
      const res = await requestFilterDesign({
        approx: tone.recommendedFilter.approx,
        ftype: tone.recommendedFilter.ftype,
        order: 4,
        fc: tone.recommendedFilter.fc,
        fc_high: tone.recommendedFilter.fcHigh ?? null,
        fs: audioEngine.getSampleRate(),
        topology: 'sallen-key',
      });
      handleApplyFilterResult(res);
      setActiveTab('filter');
    } catch (e) {
      alert(String(e));
    }
  };

  const tabMeta: Record<ActiveTab, { title: string; sub: string }> = {
    education: {
      title: 'Eğitim Merkezi — Temel Müzik & 100 Ton Rehberi',
      sub: 'Notalardan itibaren interaktif dersler ve Casio SA-11 üzerindeki tüm 100 tonun eğitimi',
    },
    filter: {
      title: 'Aktif Filtre Tasarımı & Canlı DSP Laboratuvarı',
      sub: 'Python SciPy ile Sallen-Key / MFB tasarımı, Bode analizi ve gerçek zamanlı Line-In filtreleme',
    },
    record: {
      title: 'Kayıt Stüdyosu & Sıfır-Fazlı Sinyal Temizleme',
      sub: 'Casio SA-11 Line-In kaydı, 50 Hz hum eliminasyonu ve Python sosfiltfilt iyileştirme',
    },
    maker: {
      title: 'Music Maker — 16-Adım Ritim & Melodi Stüdyosu',
      sub: 'SA-11 ritimleri, klavyeden canlı melodi yazımı ve temizlenmiş kayıt klipleriyle beste yapın',
    },
    hardware: {
      title: 'Donanım Bağlantısı & Casio SA-11 Kılavuzu',
      sub: 'Anakart Mavi Line-In bağlantısı, Windows ses ayarları ve resmi kullanım kılavuzu',
    },
  };

  return (
    <div className="app-shell">
      {/* Left Sidebar (FilterDesign Studio light minimalist aesthetic) */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-mark">SA11</div>
            <span>SA-11 Studio</span>
          </div>
          <span className="chip mono" style={{ fontSize: 10.5 }}>v1.0</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">Müzik & Eğitim</div>
          <div
            className={`nav-item ${activeTab === 'education' ? 'active' : ''}`}
            onClick={() => setActiveTab('education')}
          >
            <BookOpen size={16} />
            <span>Eğitim & 100 Ton</span>
            <span className="nav-badge">00–99</span>
          </div>
          <div
            className={`nav-item ${activeTab === 'record' ? 'active' : ''}`}
            onClick={() => setActiveTab('record')}
          >
            <Mic size={16} />
            <span>Kayıt Stüdyosu</span>
            {takes.length > 0 && <span className="nav-badge ok">{takes.length}</span>}
          </div>
          <div
            className={`nav-item ${activeTab === 'maker' ? 'active' : ''}`}
            onClick={() => setActiveTab('maker')}
          >
            <Disc3 size={16} />
            <span>Music Maker</span>
            <span className="nav-badge">16-Step</span>
          </div>

          <div className="nav-section" style={{ marginTop: 12 }}>Mühendislik & DSP</div>
          <div
            className={`nav-item ${activeTab === 'filter' ? 'active' : ''}`}
            onClick={() => setActiveTab('filter')}
          >
            <Sliders size={16} />
            <span>Aktif Filtre Lab</span>
            <span className={`nav-badge ${backendOnline ? 'ok' : ''}`}>{backendOnline ? 'SciPy' : 'DSP'}</span>
          </div>
          <div
            className={`nav-item ${activeTab === 'hardware' ? 'active' : ''}`}
            onClick={() => setActiveTab('hardware')}
          >
            <Cable size={16} />
            <span>Line-In & Kılavuz</span>
            <span className="nav-badge">Mavi Jak</span>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="status-pill">
            <span className={`dot ${isLineInConnected ? 'ok' : ''}`} />
            <span>Line-In: {isLineInConnected ? 'Bağlı (48 kHz)' : 'Bağlı Değil'}</span>
          </div>
          <div className="status-pill">
            <span className={`dot ${backendOnline ? 'ok' : 'accent'}`} />
            <span>DSP Motoru: {backendOnline ? 'Python SciPy' : 'Tarayıcı DSP (Aktif)'}</span>
          </div>
          <div className="status-pill">
            <span className="dot accent" />
            <span className="mono">Ton #{selectedTone.code} {selectedTone.name}</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <div>
              <div className="topbar-title">{tabMeta[activeTab].title}</div>
              <div className="topbar-sub">{tabMeta[activeTab].sub}</div>
            </div>
          </div>

          <div className="topbar-controls">
            {isLineInConnected && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>GİRİŞ</span>
                <div className="meter-track">
                  <div className="meter-fill" style={{ width: `${rmsLevelPct}%` }} />
                </div>
              </div>
            )}

            <button
              className="btn btn-sm"
              title="Line-In sesini bilgisayar hoparlöründen canlı dinle"
              onClick={() => {
                const next = !monitorOutput;
                setMonitorOutput(next);
                audioEngine.updateFilterConfig({ monitorOutput: next });
              }}
            >
              {monitorOutput ? <Volume2 size={14} color="var(--ok)" /> : <VolumeX size={14} />}
              Monitör
            </button>

            {!isLineInConnected ? (
              <button className="btn btn-sm btn-primary" onClick={() => void handleConnectLineIn()}>
                <PlugZap size={14} /> Line-In Bağlan
              </button>
            ) : (
              <button className="btn btn-sm btn-danger" onClick={handleDisconnectLineIn}>
                <Headphones size={14} /> Bağlantıyı Kes
              </button>
            )}
          </div>
        </header>

        <main className="scroll-content">
          {/* Persistent Interactive 3D Casio SA-11 Keyboard */}
          <CasioSA11_3D
            activeMidiNotes={combinedActiveMidis}
            targetMidiNote={targetMidiNote}
            selectedToneCode={selectedToneCode}
            detectedNoteLabel={detectedNoteLabel}
            detectedFreqHz={detectedFreqHz}
            detectedCents={detectedCents}
            isLineInConnected={isLineInConnected}
            onVirtualKeyPress={handleVirtualKeyPress}
            onVirtualKeyRelease={handleVirtualKeyRelease}
          />

          {/* Active Module */}
          {activeTab === 'education' && (
            <EducationPanel
              selectedToneCode={selectedToneCode}
              onSelectTone={setSelectedToneCode}
              activeLessonId={activeLessonId}
              lessonStepIndex={lessonStepIndex}
              customExerciseLabel={customExerciseLabel}
              customSequence={customSequence}
              onStartLesson={(lesson: MusicLesson | null, customSeq?: number[], label?: string) => {
                if (customSeq) {
                  setCustomSequence(customSeq);
                  setCustomExerciseLabel(label ?? 'Ton Etüdü');
                  setActiveLessonId(null);
                } else if (lesson) {
                  setCustomSequence(null);
                  setCustomExerciseLabel(null);
                  setActiveLessonId(lesson.id);
                  setSelectedToneCode(lesson.recommendedToneCode);
                }
                setLessonStepIndex(0);
              }}
              onResetLessonStep={() => setLessonStepIndex(0)}
              onApplyToneFilter={(t) => void handleApplyToneFilter(t)}
            />
          )}

          {activeTab === 'filter' && (
            <FilterLabPanel
              backendOnline={backendOnline}
              liveFilterEnabled={liveFilterEnabled}
              notch50Hz={notch50Hz}
              activeFilterResult={activeFilterResult}
              onToggleLiveFilter={(v) => {
                setLiveFilterEnabled(v);
                audioEngine.updateFilterConfig({ enabled: v });
              }}
              onToggleNotch50Hz={(v) => {
                setNotch50Hz(v);
                audioEngine.updateFilterConfig({ notch50Hz: v });
              }}
              onFilterDesigned={handleApplyFilterResult}
            />
          )}

          {activeTab === 'record' && (
            <RecordStudioPanel
              isLineInConnected={isLineInConnected}
              backendOnline={backendOnline}
              takes={takes}
              onAddTake={(t) => setTakes((prev) => [t, ...prev])}
              onUpdateTake={(id, patch) =>
                setTakes((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
              }
            />
          )}

          {activeTab === 'maker' && (
            <MusicMakerPanel
              selectedToneCode={selectedToneCode}
              lastDetectedMidi={detectedMidi}
              takes={takes}
              onSequencerStepNote={setSeqMidiNote}
            />
          )}

          {activeTab === 'hardware' && (
            <HardwareGuidePanel
              devices={devices}
              selectedDeviceId={selectedDeviceId}
              isLineInConnected={isLineInConnected}
              onSelectDevice={setSelectedDeviceId}
              onRefreshDevices={() => void refreshDevices()}
              onConnect={() => void handleConnectLineIn()}
              onDisconnect={handleDisconnectLineIn}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
