import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CasioSA11_3D } from './components/CasioSA11_3D';
import { EducationPanel } from './components/EducationPanel';
import { RecordedTake, RecordStudioPanel } from './components/RecordStudioPanel';
import { MusicMakerPanel } from './components/MusicMakerPanel';
import { HardwareGuidePanel } from './components/HardwareGuidePanel';
import { MUSIC_LESSONS, MusicLesson, SA11_KEYS, SA11_TONES, SA11Key } from './data/sa11Data';
import { audioEngine } from './audio/audioEngine';
import { checkBackendHealth, requestFilterDesign } from './audio/dspClient';
import {
  BookOpen,
  Cable,
  Disc3,
  Headphones,
  Mic,
  PlugZap,
  Volume2,
  VolumeX,
} from 'lucide-react';

type ActiveTab = 'education' | 'record' | 'maker' | 'hardware';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('education');
  const [selectedToneCode, setSelectedToneCode] = useState<string>('00');
  const [octaveShift, setOctaveShift] = useState<number>(0);

  // Audio / Line-In state
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isLineInConnected, setIsLineInConnected] = useState(false);
  const [monitorOutput, setMonitorOutput] = useState(false);

  // Real-time pitch detection & active keys (RED on 3D keyboard!)
  const [detectedMidi, setDetectedMidi] = useState<number | null>(null);
  const [detectedNoteLabel, setDetectedNoteLabel] = useState<string | null>(null);
  const [detectedFreqHz, setDetectedFreqHz] = useState<number | null>(null);
  const [detectedCents, setDetectedCents] = useState<number | null>(null);
  const [rmsLevelPct, setRmsLevelPct] = useState(0);

  // Virtual clicks / PC keyboard / Sequencer active notes
  const [virtualMidiNotes, setVirtualMidiNotes] = useState<number[]>([]);
  const [seqMidiNote, setSeqMidiNote] = useState<number | null>(null);

  // Background Active Filter DSP backend status
  const [backendOnline, setBackendOnline] = useState(false);

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

  // Automatically configure SA-11 Active Band-Pass + 50Hz Notch pre-filter behind the scenes for clean key reading
  useEffect(() => {
    const initDsp = async () => {
      const online = await checkBackendHealth();
      setBackendOnline(online);
      try {
        const res = await requestFilterDesign({
          approx: 'butterworth',
          ftype: 'bandpass',
          order: 4,
          fc: 80,
          fc_high: 2600,
          fs: audioEngine.getSampleRate(),
          topology: 'sallen-key',
        });
        audioEngine.updateFilterConfig({ sos: res.sos, enabled: true, notch50Hz: true });
      } catch {
        // Default built-in Web Audio filter remains active
      }
    };
    void initDsp();
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
      const reading = audioEngine.analyzeLivePitch(octaveShift);
      const pct = Math.max(0, Math.min(100, ((reading.rmsDb + 60) / 60) * 100));
      setRmsLevelPct(pct);

      if (reading.key && reading.freqHz) {
        setDetectedMidi(reading.key.midi);
        setDetectedNoteLabel(`${reading.key.note} (${reading.key.solfege.replace(/\d/, '')})`);
        setDetectedFreqHz(reading.freqHz);
        setDetectedCents(reading.cents);
      } else if (reading.freqHz) {
        setDetectedMidi(null);
        setDetectedNoteLabel('Aralık Dışı');
        setDetectedFreqHz(reading.freqHz);
        setDetectedCents(null);
      } else {
        setDetectedMidi(null);
      }
    }, 33);

    return () => window.clearInterval(timer);
  }, [isLineInConnected, octaveShift]);

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
    const shiftedMidi = k.midi + octaveShift * 12;
    const shiftedFreq = k.freq * Math.pow(2, octaveShift);
    audioEngine.noteOn(shiftedMidi, selectedTone);
    setVirtualMidiNotes((prev) => (prev.includes(k.midi) ? prev : [...prev, k.midi]));
    setDetectedNoteLabel(`${k.note} (${k.solfege.replace(/\d/, '')})`);
    setDetectedFreqHz(shiftedFreq);
    setDetectedCents(0);
  };

  const handleVirtualKeyRelease = (k: SA11Key) => {
    audioEngine.noteOff(k.midi + octaveShift * 12);
    setVirtualMidiNotes((prev) => prev.filter((m) => m !== k.midi));
  };

  const tabMeta: Record<ActiveTab, { title: string; sub: string }> = {
    education: {
      title: 'Eğitim Merkezi — Temel Müzik & 100 Ton Rehberi',
      sub: 'Notalardan itibaren interaktif dersler ve Casio SA-11 üzerindeki tüm 100 tonun eğitimi',
    },
    record: {
      title: 'Kayıt Stüdyosu & Otomatik Ses Temizleme',
      sub: 'Casio SA-11 Line-In kaydı, arka planda aktif filtre temizleme ve WAV dışa aktarma',
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
      {/* Left Sidebar (Ferah, aydınlık tasarım) */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-mark">SA11</div>
            <span>SA-11 Studio</span>
          </div>
          <span className="chip mono" style={{ fontSize: 10.5 }}>v1.1</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">Müzik & Stüdyo</div>
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

          <div className="nav-section" style={{ marginTop: 12 }}>Klavye & Kurulum</div>
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
            <span>Line-In: {isLineInConnected ? 'Bağlı' : 'Bağlı Değil'}</span>
          </div>
          <div className="status-pill">
            <span className="dot ok" />
            <span>Ses İşleme: Aktif ({backendOnline ? 'Python' : 'Otomatik'})</span>
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
            octaveShift={octaveShift}
            onOctaveShiftChange={setOctaveShift}
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
              onPreviewNote={(midi) => setSeqMidiNote(midi)}
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
