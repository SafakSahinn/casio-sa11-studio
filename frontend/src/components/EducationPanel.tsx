import React, { useMemo, useState } from 'react';
import {
  MUSIC_LESSONS,
  MusicLesson,
  SA11_KEYS,
  SA11_TONES,
  SA11Tone,
  ToneCategory,
} from '../data/sa11Data';
import { audioEngine } from '../audio/audioEngine';
import { BookOpen, CheckCircle2, Music, Play, RotateCcw, Search, Sparkles } from 'lucide-react';

interface EducationPanelProps {
  selectedToneCode: string;
  onSelectTone: (code: string) => void;
  activeLessonId: string | null;
  lessonStepIndex: number;
  onStartLesson: (lesson: MusicLesson | null, customSequence?: number[], label?: string) => void;
  onResetLessonStep: () => void;
  customExerciseLabel: string | null;
  customSequence: number[] | null;
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
  activeLessonId,
  lessonStepIndex,
  onStartLesson,
  onResetLessonStep,
  customExerciseLabel,
  customSequence,
}) => {
  const [subTab, setSubTab] = useState<'theory' | 'tones'>('theory');
  const [selectedLesson, setSelectedLesson] = useState<MusicLesson>(MUSIC_LESSONS[0]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'Tümü' | ToneCategory>('Tümü');

  const selectedTone = useMemo(
    () => SA11_TONES.find((t) => t.code === selectedToneCode) ?? SA11_TONES[0],
    [selectedToneCode]
  );

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

  const playSequencePreview = (seq: number[], tone: SA11Tone) => {
    seq.forEach((midi, idx) => {
      window.setTimeout(() => {
        audioEngine.playShortNote(midi, tone, 280);
      }, idx * 340);
    });
  };

  const activeSeq =
    customSequence ??
    (activeLessonId ? MUSIC_LESSONS.find((l) => l.id === activeLessonId)?.targetMidiSequence ?? null : null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sub-navigation bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn ${subTab === 'theory' ? 'btn-primary' : ''}`}
            onClick={() => setSubTab('theory')}
          >
            <BookOpen size={15} /> Temel Müzik Dersleri (Notalardan İtibaren)
          </button>
          <button
            className={`btn ${subTab === 'tones' ? 'btn-primary' : ''}`}
            onClick={() => setSubTab('tones')}
          >
            <Music size={15} /> 100 Ton Rehberi & Eğitimi (00–99)
          </button>
        </div>

        {activeSeq && (
          <div className="chip accent">
            <Sparkles size={13} />
            <span>
              Aktif Pratik: <strong>{customExerciseLabel ?? MUSIC_LESSONS.find((l) => l.id === activeLessonId)?.title}</strong>
              {' '}({Math.min(lessonStepIndex, activeSeq.length)}/{activeSeq.length})
            </span>
            <button
              className="btn btn-sm"
              style={{ marginLeft: 6, padding: '2px 7px' }}
              onClick={onResetLessonStep}
            >
              <RotateCcw size={12} />
            </button>
          </div>
        )}
      </div>

      {subTab === 'theory' ? (
        <div className="grid-asymmetric">
          {/* Left: Lesson List */}
          <div className="card" style={{ padding: 14 }}>
            <div className="card-header" style={{ marginBottom: 10 }}>
              <span className="card-title">Müfredat (8 Ders)</span>
              <span className="chip">Sıfırdan</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {MUSIC_LESSONS.map((lesson) => {
                const isSelected = selectedLesson.id === lesson.id;
                const isPracticing = activeLessonId === lesson.id && !customSequence;
                return (
                  <div
                    key={lesson.id}
                    onClick={() => {
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
                      {isPracticing && <span className="chip danger">Pratik Açık</span>}
                    </div>
                    <div style={{ fontWeight: 650, fontSize: 13.2, color: 'var(--text-h)' }}>{lesson.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{lesson.subtitle}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Active Lesson Content & Interactive Exercise */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="chip accent">{selectedLesson.level}</span>
                  <span className="chip mono">Önerilen SA-11 Tonu: #{selectedLesson.recommendedToneCode}</span>
                </div>
                <h2 style={{ fontSize: 19, fontWeight: 750, color: 'var(--text-h)' }}>{selectedLesson.title}</h2>
                <p style={{ color: 'var(--muted)', marginTop: 4 }}>{selectedLesson.summary}</p>
              </div>
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

            {/* Interactive Exercise Strip */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-h)' }}>Etkileşimli Klavye Pratiği</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{selectedLesson.exerciseTitle}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      const t = SA11_TONES.find((x) => x.code === selectedLesson.recommendedToneCode) ?? SA11_TONES[0];
                      playSequencePreview(selectedLesson.targetMidiSequence, t);
                    }}
                  >
                    <Play size={13} /> Örneği Dinle
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onStartLesson(selectedLesson)}
                  >
                    <Sparkles size={13} /> 3D Klavyede Pratiği Başlat
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {selectedLesson.targetMidiSequence.map((midi, idx) => {
                  const k = SA11_KEYS.find((x) => x.midi === midi);
                  const isThisLesson = activeLessonId === selectedLesson.id && !customSequence;
                  const isDone = isThisLesson && idx < lessonStepIndex;
                  const isCurrent = isThisLesson && idx === lessonStepIndex;
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
                        border: `1.5px solid ${
                          isDone ? 'var(--ok)' : isCurrent ? 'var(--accent)' : 'var(--border)'
                        }`,
                        background: isDone
                          ? 'var(--ok-soft)'
                          : isCurrent
                          ? 'var(--accent-soft)'
                          : 'var(--panel)',
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

              {activeLessonId === selectedLesson.id && !customSequence && lessonStepIndex >= selectedLesson.targetMidiSequence.length && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: 'var(--ok-soft)',
                    color: 'var(--ok)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 size={16} /> Harika! Bu dersin tüm notalarını başarıyla tamamladınız.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* 100 Tones Guide & Interactive Education */
        <div className="grid-asymmetric">
          {/* Left: Selected Tone Detail Card */}
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
              <button
                className="btn btn-sm"
                style={{ flex: 1 }}
                onClick={() => playSequencePreview(selectedTone.practiceMidi, selectedTone)}
              >
                <Play size={13} /> Etüdü Dinle
              </button>
              <button
                className="btn btn-sm btn-ok"
                style={{ flex: 1 }}
                onClick={() =>
                  onStartLesson(null, selectedTone.practiceMidi, `Ton #${selectedTone.code} ${selectedTone.name}`)
                }
              >
                <Sparkles size={13} /> 3D Pratik Yap
              </button>
            </div>
          </div>

          {/* Right: Searchable 100-Tone Grid */}
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
                      onSelectTone(tone.code);
                      audioEngine.playShortNote(tone.practiceMidi[0] ?? 60, tone, 240);
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
                      <span
                        className="mono"
                        style={{
                          fontWeight: 700,
                          fontSize: 12,
                          color: isSel ? 'var(--accent)' : 'var(--muted)',
                        }}
                      >
                        {tone.code}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                        {tone.category.split(' ')[0]}
                      </span>
                    </div>
                    <div
                      style={{
                        fontWeight: 650,
                        fontSize: 12.8,
                        color: 'var(--text-h)',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
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
