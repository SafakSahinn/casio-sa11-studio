import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FAMOUS_SONGS,
  FamousSong,
  MUSIC_LESSONS,
  MusicLesson,
  SA11_KEYS,
  SA11_TONES,
  SA11Tone,
  SongGenre,
  ToneCategory,
} from '../data/sa11Data';
import { audioEngine } from '../audio/audioEngine';
import { Award, BookOpen, CheckCircle2, Gauge, Music, Play, RotateCcw, Search, Sparkles, Square, Trophy } from 'lucide-react';

interface EducationPanelProps {
  selectedToneCode: string;
  onSelectTone: (code: string) => void;
  activePracticeKey: string | null;
  lessonStepIndex: number;
  progressMap: Record<string, number>;
  onStartLesson: (
    practiceKey: string,
    sequence: number[],
    label: string,
    toneCode?: string,
    restart?: boolean
  ) => void;
  onResetLessonStep: () => void;
  onPreviewNote: (midi: number | null) => void;
  activePracticeLabel: string | null;
  activeSequence: number[] | null;
}

const CATEGORIES: Array<'Tümü' | ToneCategory> = [
  'Tümü',
  'Piyano & Org',
  'Bakır & Üflemeli',
  'Yaylı & Gitar',
  'Bas & Etnik',
  'Synth & Pad',
  'Efekt & SFX',
  'Perküsyon & Davul',
  'Split & Kombine',
];

export const EducationPanel: React.FC<EducationPanelProps> = ({
  selectedToneCode,
  onSelectTone,
  activePracticeKey,
  lessonStepIndex,
  progressMap,
  onStartLesson,
  onResetLessonStep,
  onPreviewNote,
  activePracticeLabel,
  activeSequence,
}) => {
  const [subTab, setSubTab] = useState<'theory' | 'songs' | 'tones'>('theory');
  const [selectedLesson, setSelectedLesson] = useState<MusicLesson>(MUSIC_LESSONS[0]);
  const [selectedSong, setSelectedSong] = useState<FamousSong>(FAMOUS_SONGS[0]);
  const [songGenre, setSongGenre] = useState<'Tümü' | SongGenre>('Tümü');
  const [songDiff, setSongDiff] = useState<'Tümü' | 'Kolay' | 'Orta' | 'İleri'>('Tümü');
  const [songSearch, setSongSearch] = useState('');
  const [previewSpeed, setPreviewSpeed] = useState<number>(1.0);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'Tümü' | ToneCategory>('Tümü');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const previewTimersRef = useRef<number[]>([]);

  const selectedTone = useMemo(
    () => SA11_TONES.find((t) => t.code === selectedToneCode) ?? SA11_TONES[0],
    [selectedToneCode]
  );

  const completedLessonsCount = useMemo(
    () => MUSIC_LESSONS.filter((l) => (progressMap[l.id] ?? 0) >= l.targetMidiSequence.length).length,
    [progressMap]
  );

  const completedSongsCount = useMemo(
    () => FAMOUS_SONGS.filter((s) => (progressMap[s.id] ?? 0) >= s.midiSequence.length).length,
    [progressMap]
  );

  const filteredSongs = useMemo(() => {
    const q = songSearch.trim().toLowerCase();
    return FAMOUS_SONGS.filter((s) => {
      if (songGenre !== 'Tümü' && s.genre !== songGenre) return false;
      if (songDiff !== 'Tümü' && s.difficulty !== songDiff) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.composer.toLowerCase().includes(q) ||
        s.genre.toLowerCase().includes(q)
      );
    });
  }, [songGenre, songDiff, songSearch]);

  const filteredTones = useMemo(() => {
    const q = search.trim().toLowerCase();
    return SA11_TONES.filter((t) => {
      if (category !== 'Tümü' && t.category !== category) return false;
      if (!q) return true;
      return (
        t.code.includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [search, category]);

  const stopPreview = () => {
    previewTimersRef.current.forEach((id) => window.clearTimeout(id));
    previewTimersRef.current = [];
    setIsPreviewing(false);
    onPreviewNote(null);
  };

  // Stop any active song preview cleanly if user switches tabs
  useEffect(() => {
    return () => {
      previewTimersRef.current.forEach((id) => window.clearTimeout(id));
      previewTimersRef.current = [];
      onPreviewNote(null);
    };
  }, []);

  const playSequencePreview = (seq: number[], tone: SA11Tone, bpm = 110) => {
    stopPreview();
    setIsPreviewing(true);
    const effectiveBpm = Math.max(40, bpm * previewSpeed);
    const stepMs = Math.round((60 / effectiveBpm) * 1000 * 0.72);
    const noteMs = Math.max(160, Math.round(stepMs * 0.82));

    seq.forEach((midi, idx) => {
      const startId = window.setTimeout(() => {
        audioEngine.playShortNote(midi, tone, noteMs);
        onPreviewNote(midi);
      }, idx * stepMs);
      const clearId = window.setTimeout(() => {
        onPreviewNote(null);
      }, idx * stepMs + noteMs);
      previewTimersRef.current.push(startId, clearId);
    });

    const endId = window.setTimeout(() => {
      setIsPreviewing(false);
      onPreviewNote(null);
    }, seq.length * stepMs + 80);
    previewTimersRef.current.push(endId);
  };

  const activeSeq = activeSequence;

  const switchSubTab = (tab: 'theory' | 'songs' | 'tones') => {
    stopPreview();
    setSubTab(tab);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sub-navigation bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={`btn ${subTab === 'theory' ? 'btn-primary' : ''}`}
            onClick={() => switchSubTab('theory')}
          >
            <BookOpen size={15} /> Temel Müzik Dersleri (8 Ders)
          </button>
          <button
            className={`btn ${subTab === 'songs' ? 'btn-primary' : ''}`}
            onClick={() => switchSubTab('songs')}
          >
            <Award size={15} /> Meşhur Eserler ({FAMOUS_SONGS.length} Şarkı)
          </button>
          <button
            className={`btn ${subTab === 'tones' ? 'btn-primary' : ''}`}
            onClick={() => switchSubTab('tones')}
          >
            <Music size={15} /> 100 Ton Rehberi (00–99)
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="chip ok">
            <Trophy size={13} />
            <span className="mono">
              {completedLessonsCount}/{MUSIC_LESSONS.length} Ders · {completedSongsCount}/{FAMOUS_SONGS.length} Eser
            </span>
          </div>
          {activeSeq && (
            <div className="chip accent">
              <Sparkles size={13} />
              <span>
                Aktif: <strong>{activePracticeLabel}</strong>{' '}
                ({Math.min(lessonStepIndex, activeSeq.length)}/{activeSeq.length})
              </span>
              {lessonStepIndex < activeSeq.length && (() => {
                const nextKey = SA11_KEYS.find((k) => k.midi === activeSeq[lessonStepIndex]);
                return nextKey ? (
                  <span className="mono" style={{ marginLeft: 4, fontWeight: 800 }}>
                    → Sıradaki: {nextKey.note} ({nextKey.solfege.replace(/\d/, '')})
                  </span>
                ) : null;
              })()}
              <button
                className="btn btn-sm"
                style={{ marginLeft: 6, padding: '2px 7px' }}
                onClick={onResetLessonStep}
                title="Baştan Başla"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: Basic Music Theory Curriculum */}
      {subTab === 'theory' && (
        <div className="grid-asymmetric">
          <div className="card" style={{ padding: 14 }}>
            <div className="card-header" style={{ marginBottom: 10 }}>
              <span className="card-title">Müfredat (8 Ders)</span>
              <span className="chip">Sıfırdan</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {MUSIC_LESSONS.map((lesson) => {
                const isSelected = selectedLesson.id === lesson.id;
                const isPracticing = activePracticeKey === lesson.id;
                const savedStep = progressMap[lesson.id] ?? 0;
                return (
                  <div
                    key={lesson.id}
                    onClick={() => {
                      stopPreview();
                      setSelectedLesson(lesson);
                      onSelectTone(lesson.recommendedToneCode);
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--active-bg)' : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.14s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span className={`chip ${lesson.level === 'Başlangıç' ? 'ok' : lesson.level === 'Temel' ? 'accent' : 'warn'}`}>
                        {lesson.level}
                      </span>
                      {isPracticing ? (
                        <span className="chip danger">Pratik Açık</span>
                      ) : savedStep > 0 ? (
                        <span className="chip ok mono">{savedStep}/{lesson.targetMidiSequence.length}</span>
                      ) : null}
                    </div>
                    <div style={{ fontWeight: 650, fontSize: 13.2, color: 'var(--text-h)' }}>{lesson.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{lesson.subtitle}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="chip accent">{selectedLesson.level}</span>
                <span className="chip mono">Önerilen SA-11 Tonu: #{selectedLesson.recommendedToneCode}</span>
              </div>
              <h2 style={{ fontSize: 19, fontWeight: 750, color: 'var(--text-h)' }}>{selectedLesson.title}</h2>
              <p style={{ color: 'var(--muted)', marginTop: 4 }}>{selectedLesson.summary}</p>
            </div>

            <div style={{ background: 'var(--side)', borderRadius: 10, padding: 14, border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-h)' }}>
                Temel Kurallar & Teori
              </div>
              <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.2 }}>
                {selectedLesson.theoryPoints.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-h)' }}>Etkileşimli Klavye Pratiği</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{selectedLesson.exerciseTitle}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {isPreviewing ? (
                    <button className="btn btn-sm btn-danger" onClick={stopPreview}>
                      <Square size={13} /> Durdur
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        const t = SA11_TONES.find((x) => x.code === selectedLesson.recommendedToneCode) ?? SA11_TONES[0];
                        playSequencePreview(selectedLesson.targetMidiSequence, t);
                      }}
                    >
                      <Play size={13} /> Örneği Dinle (3D İzle)
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      stopPreview();
                      onStartLesson(
                        selectedLesson.id,
                        selectedLesson.targetMidiSequence,
                        selectedLesson.title,
                        selectedLesson.recommendedToneCode
                      );
                    }}
                  >
                    <Sparkles size={13} />{' '}
                    {(progressMap[selectedLesson.id] ?? 0) > 0 &&
                    (progressMap[selectedLesson.id] ?? 0) < selectedLesson.targetMidiSequence.length
                      ? `Kaldığın Yerden Devam Et (${progressMap[selectedLesson.id]}/${selectedLesson.targetMidiSequence.length})`
                      : '3D Klavyede Pratiği Başlat'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {selectedLesson.targetMidiSequence.map((midi, idx) => {
                  const k = SA11_KEYS.find((x) => x.midi === midi);
                  const stepForLesson = progressMap[selectedLesson.id] ?? 0;
                  const isActiveThis = activePracticeKey === selectedLesson.id;
                  const isDone = idx < stepForLesson;
                  const isCurrent = isActiveThis && idx === stepForLesson;
                  return (
                    <div
                      key={`${midi}-${idx}`}
                      onClick={() => audioEngine.playShortNote(midi, selectedTone)}
                      style={{
                        minWidth: 58,
                        padding: '8px 10px',
                        borderRadius: 8,
                        textAlign: 'center',
                        cursor: 'pointer',
                        border: `1.5px solid ${isDone ? 'var(--ok)' : isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                        background: isDone ? 'var(--ok-soft)' : isCurrent ? 'var(--accent-soft)' : 'var(--panel)',
                      }}
                    >
                      <div className="mono" style={{ fontWeight: 700, fontSize: 14, color: isCurrent ? 'var(--accent)' : isDone ? 'var(--ok)' : 'var(--text-h)' }}>
                        {k?.note ?? midi}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{k?.solfege}</div>
                    </div>
                  );
                })}
              </div>

              {(progressMap[selectedLesson.id] ?? 0) >= selectedLesson.targetMidiSequence.length && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--ok-soft)', color: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={16} /> Harika! Bu dersin tüm notalarını başarıyla tamamladınız.
                  </span>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      onStartLesson(
                        selectedLesson.id,
                        selectedLesson.targetMidiSequence,
                        selectedLesson.title,
                        selectedLesson.recommendedToneCode,
                        true
                      )
                    }
                  >
                    <RotateCcw size={12} /> Tekrar Çal
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Famous Piano Songs Repertoire */}
      {subTab === 'songs' && (
        <div className="grid-asymmetric">
          {/* Left: Famous Composers & Songs List with Genre/Difficulty Filter */}
          <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="card-header" style={{ marginBottom: 0 }}>
              <span className="card-title">Repertuvar ({filteredSongs.length}/{FAMOUS_SONGS.length})</span>
              <span className="chip ok">{completedSongsCount} Tamamlandı</span>
            </div>

            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: 10, color: 'var(--muted)' }} />
              <input
                className="input"
                style={{ paddingLeft: 28, fontSize: 12.5 }}
                placeholder="Eser veya besteci ara..."
                value={songSearch}
                onChange={(e) => setSongSearch(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <select
                className="select"
                style={{ fontSize: 12, padding: '5px 8px' }}
                value={songGenre}
                onChange={(e) => setSongGenre(e.target.value as 'Tümü' | SongGenre)}
              >
                <option value="Tümü">Tüm Türler</option>
                <option value="Klasik">Klasik (12)</option>
                <option value="Film & Dizi">Film & Dizi (4)</option>
                <option value="Türk Müziği">Türk Müziği (4)</option>
              </select>
              <select
                className="select"
                style={{ fontSize: 12, padding: '5px 8px', width: 110 }}
                value={songDiff}
                onChange={(e) => setSongDiff(e.target.value as 'Tümü' | 'Kolay' | 'Orta' | 'İleri')}
              >
                <option value="Tümü">Seviye</option>
                <option value="Kolay">Kolay</option>
                <option value="Orta">Orta</option>
                <option value="İleri">İleri</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 440, overflowY: 'auto' }}>
              {filteredSongs.map((song) => {
                const isSel = selectedSong.id === song.id;
                const isPrac = activePracticeKey === song.id;
                const savedStep = progressMap[song.id] ?? 0;
                const isFinished = savedStep >= song.midiSequence.length;
                return (
                  <div
                    key={song.id}
                    onClick={() => {
                      stopPreview();
                      setSelectedSong(song);
                      onSelectTone(song.recommendedToneCode);
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`,
                      background: isSel ? 'var(--active-bg)' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3, gap: 4 }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <span className={`chip ${song.difficulty === 'Kolay' ? 'ok' : song.difficulty === 'Orta' ? 'accent' : 'warn'}`}>
                          {song.difficulty}
                        </span>
                        <span className="chip" style={{ fontSize: 10.5 }}>{song.genre}</span>
                      </div>
                      <span className="mono" style={{ fontSize: 11, color: isFinished ? 'var(--ok)' : isPrac ? 'var(--danger)' : savedStep > 0 ? 'var(--ok)' : 'var(--muted)' }}>
                        {isFinished
                          ? '✓ Bitti'
                          : isPrac
                          ? `Pratik (${savedStep}/${song.midiSequence.length})`
                          : savedStep > 0
                          ? `${savedStep}/${song.midiSequence.length}`
                          : `${song.bpm} BPM`}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13.2, color: 'var(--text-h)' }}>{song.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{song.composer}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Selected Famous Song Interactive Sheet & 3D Practice */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span className="chip accent">{selectedSong.composer}</span>
                <span className="chip ok">{selectedSong.genre}</span>
                <span className="chip">{selectedSong.era}</span>
                <span className="chip mono">Ton #{selectedSong.recommendedToneCode}</span>
                <span className="chip mono">{selectedSong.bpm} BPM</span>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-h)' }}>{selectedSong.title}</h2>
              <p style={{ color: 'var(--muted)', marginTop: 4 }}>{selectedSong.description}</p>
            </div>

            <div style={{ background: 'var(--side)', borderRadius: 10, padding: 13, border: '1px solid var(--border)', fontSize: 13 }}>
              <strong>Eğitmen İpucu:</strong> {selectedSong.tip}
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-h)' }}>Nota Dizilimi ({selectedSong.midiSequence.length} Nota)</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                    Pratiği başlattığınızda sıradaki tuş 3D klavyede mavi yanar; doğru tuşa bastığınızda kırmızıya dönüp ilerler.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--side)', padding: '3px 7px', borderRadius: 7, border: '1px solid var(--border)' }}>
                    <Gauge size={13} color="var(--muted)" />
                    {[0.5, 0.75, 1.0].map((sp) => (
                      <button
                        key={sp}
                        onClick={() => setPreviewSpeed(sp)}
                        style={{
                          border: 'none',
                          borderRadius: 5,
                          padding: '2px 6px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: previewSpeed === sp ? 'var(--accent)' : 'transparent',
                          color: previewSpeed === sp ? '#fff' : 'var(--text)',
                        }}
                      >
                        %{Math.round(sp * 100)}
                      </button>
                    ))}
                  </div>
                  {isPreviewing ? (
                    <button className="btn btn-sm btn-danger" onClick={stopPreview}>
                      <Square size={13} /> Durdur
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        const t = SA11_TONES.find((x) => x.code === selectedSong.recommendedToneCode) ?? SA11_TONES[0];
                        playSequencePreview(selectedSong.midiSequence, t, selectedSong.bpm);
                      }}
                    >
                      <Play size={13} /> Eseri Dinle (3D İzle)
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      stopPreview();
                      onSelectTone(selectedSong.recommendedToneCode);
                      onStartLesson(
                        selectedSong.id,
                        selectedSong.midiSequence,
                        `${selectedSong.composer} — ${selectedSong.title}`,
                        selectedSong.recommendedToneCode
                      );
                    }}
                  >
                    <Sparkles size={13} />{' '}
                    {(progressMap[selectedSong.id] ?? 0) > 0 &&
                    (progressMap[selectedSong.id] ?? 0) < selectedSong.midiSequence.length
                      ? `Kaldığın Yerden Devam Et (${progressMap[selectedSong.id]}/${selectedSong.midiSequence.length})`
                      : '3D Klavyede Çalmayı Öğren'}
                  </button>
                  {(progressMap[selectedSong.id] ?? 0) > 0 && (
                    <button
                      className="btn btn-sm"
                      title="Bu eseri baştan başlat"
                      onClick={() => {
                        stopPreview();
                        onStartLesson(
                          selectedSong.id,
                          selectedSong.midiSequence,
                          `${selectedSong.composer} — ${selectedSong.title}`,
                          selectedSong.recommendedToneCode,
                          true
                        );
                      }}
                    >
                      <RotateCcw size={13} /> Baştan
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {selectedSong.midiSequence.map((midi, idx) => {
                  const k = SA11_KEYS.find((x) => x.midi === midi);
                  const stepForSong = progressMap[selectedSong.id] ?? 0;
                  const isThisSong = activePracticeKey === selectedSong.id;
                  const isDone = idx < stepForSong;
                  const isCurrent = isThisSong && idx === stepForSong;
                  return (
                    <div
                      key={`${midi}-${idx}`}
                      onClick={() => {
                        const t = SA11_TONES.find((x) => x.code === selectedSong.recommendedToneCode) ?? selectedTone;
                        audioEngine.playShortNote(midi, t);
                      }}
                      style={{
                        minWidth: 54,
                        padding: '7px 8px',
                        borderRadius: 8,
                        textAlign: 'center',
                        cursor: 'pointer',
                        border: `1.5px solid ${isDone ? 'var(--ok)' : isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                        background: isDone ? 'var(--ok-soft)' : isCurrent ? 'var(--accent-soft)' : 'var(--panel)',
                      }}
                    >
                      <div className="mono" style={{ fontWeight: 700, fontSize: 13.5, color: isCurrent ? 'var(--accent)' : isDone ? 'var(--ok)' : 'var(--text-h)' }}>
                        {k?.note ?? midi}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{k?.solfege}</div>
                    </div>
                  );
                })}
              </div>

              {(progressMap[selectedSong.id] ?? 0) >= selectedSong.midiSequence.length && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--ok-soft)', color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                  <CheckCircle2 size={16} /> Tebrikler! {selectedSong.title} eserini baştan sona tamamladınız.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: All 100 Tones Guide & Interactive Education */}
      {subTab === 'tones' && (
        <div className="grid-asymmetric">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, height: 'fit-content' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="chip accent mono" style={{ fontSize: 13 }}>TON #{selectedTone.code}</span>
              <span className="chip">{selectedTone.category}</span>
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-h)' }}>{selectedTone.name}</h2>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{selectedTone.description}</p>
            </div>

            <div style={{ background: 'var(--side)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                Casio SA-11'de Seçim Adımı
              </div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)' }}>
                TONE [{selectedTone.code[0]}] → [{selectedTone.code[1]}] tuşlarına basın
              </div>
            </div>

            <div style={{ background: 'var(--panel)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-h)', marginBottom: 4 }}>
                Çalma Tekniği & Eğitim İpucu
              </div>
              <div style={{ fontSize: 12.8, color: 'var(--text)' }}>{selectedTone.playingTip}</div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {isPreviewing ? (
                <button className="btn btn-sm btn-danger" style={{ flex: 1 }} onClick={stopPreview}>
                  <Square size={13} /> Durdur
                </button>
              ) : (
                <button
                  className="btn btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => playSequencePreview(selectedTone.practiceMidi, selectedTone)}
                >
                  <Play size={13} /> Etüdü Dinle
                </button>
              )}
              <button
                className="btn btn-sm btn-ok"
                style={{ flex: 1 }}
                onClick={() => {
                  stopPreview();
                  onStartLesson(
                    `tone-${selectedTone.code}`,
                    selectedTone.practiceMidi,
                    `Ton #${selectedTone.code} ${selectedTone.name}`,
                    selectedTone.code
                  );
                }}
              >
                <Sparkles size={13} /> 3D Pratik Yap
              </button>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 220px' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted)' }} />
                <input
                  className="input"
                  style={{ paddingLeft: 32 }}
                  placeholder="Ton ara (örn: 06, Pipe Organ, Guitar, Synth, Split)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="select"
                style={{ width: 190 }}
                value={category}
                onChange={(e) => setCategory(e.target.value as 'Tümü' | ToneCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <span className="chip mono">{filteredTones.length} / 100 Ton</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(152px, 1fr))',
                gap: 8,
                maxHeight: 460,
                overflowY: 'auto',
                paddingRight: 4,
              }}
            >
              {filteredTones.map((tone) => {
                const isSel = tone.code === selectedToneCode;
                return (
                  <button
                    key={tone.code}
                    onClick={() => {
                      stopPreview();
                      onSelectTone(tone.code);
                      audioEngine.playShortNote(tone.practiceMidi[0] ?? 60, tone, 320);
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '9px 10px',
                      borderRadius: 8,
                      border: `1px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`,
                      background: isSel ? 'var(--active-bg)' : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.12s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="mono" style={{ fontWeight: 700, fontSize: 12, color: isSel ? 'var(--accent)' : 'var(--muted)' }}>
                        {tone.code}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{tone.category.split(' ')[0]}</span>
                    </div>
                    <div style={{ fontWeight: 650, fontSize: 12.8, color: 'var(--text-h)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {tone.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
