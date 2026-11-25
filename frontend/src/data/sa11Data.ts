// Casio SA-11 Authentic Specifications, 32-Key Map (F3–C6), 100-Tone Bank & Music Theory Curriculum

export interface SA11Key {
  index: number;       // 0..31
  midi: number;        // 53 (F3) .. 84 (C6)
  note: string;        // e.g. "F3", "F#3", "C4"
  solfege: string;     // e.g. "Fa", "Fa♯", "Do"
  freq: number;        // Hz
  isBlack: boolean;
  whiteIndex: number;  // 0..18 for white keys, or preceding white key index for black keys
  rhythmOrAccomp: string; // Authentic SA-11 printed label above key
  pcKey?: string;      // Optional PC keyboard shortcut for quick testing
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SOLFEGE_TR = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];

// Authentic 19 Auto-Rhythms (white keys) & 13 Super Accompaniment Patterns (black keys) from Casio SA-11 Manual p.4
export const SA11_AUTO_RHYTHMS = [
  'ROCK 1', 'ROCK 2', '16 BEAT 1', '16 BEAT 2', 'DISCO 1', 'DISCO 2', 'DISCO 3',
  'POPS 1', 'POPS 2', 'POPS 3', 'SLOW ROCK', 'SWING', 'MARCH', 'REGGAE',
  'TANGO', 'SAMBA', 'BOSSA NOVA', 'BEGUINE', 'WALTZ',
];

export const SA11_SUPER_ACCOMP = [
  'ROCK', 'POPS', 'FUNK', 'SLOW ROCK', 'LATIN', 'JUNGLE', 'ORIENT',
  'BAGPIPER', 'FANFARE', "CHILD'S PLAY", 'CLASSICAL', 'COMPUTER', 'NEW AGE MUSIC',
];

const PC_SHORTCUTS: Record<number, string> = {
  53: 'z', 55: 'x', 57: 'c', 59: 'v',
  60: 'a', 61: 'w', 62: 's', 63: 'e', 64: 'd', 65: 'f', 66: 't',
  67: 'g', 68: 'y', 69: 'h', 70: 'u', 71: 'j', 72: 'k', 73: 'o', 74: 'l',
};

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const SA11_KEYS: SA11Key[] = (() => {
  const keys: SA11Key[] = [];
  let whiteIdx = -1;
  let blackCount = 0;

  for (let i = 0; i < 32; i++) {
    const midi = 53 + i; // F3 (53) to C6 (84)
    const pc = midi % 12;
    const octave = Math.floor(midi / 12) - 1;
    const name = NOTE_NAMES[pc];
    const isBlack = name.includes('#');

    if (!isBlack) {
      whiteIdx += 1;
    }

    const label = isBlack
      ? SA11_SUPER_ACCOMP[blackCount++] ?? ''
      : SA11_AUTO_RHYTHMS[whiteIdx] ?? '';

    keys.push({
      index: i,
      midi,
      note: `${name}${octave}`,
      solfege: `${SOLFEGE_TR[pc]}${octave}`,
      freq: Number(midiToFreq(midi).toFixed(2)),
      isBlack,
      whiteIndex: whiteIdx,
      rhythmOrAccomp: label,
      pcKey: PC_SHORTCUTS[midi],
    });
  }
  return keys;
})();

export function findClosestSA11Key(freqHz: number): { key: SA11Key; cents: number } | null {
  if (freqHz < 160 || freqHz > 1120) return null;
  const exactMidi = 69 + 12 * Math.log2(freqHz / 440);
  const roundedMidi = Math.round(exactMidi);
  if (roundedMidi < 53 || roundedMidi > 84) return null;
  const cents = Math.round((exactMidi - roundedMidi) * 100);
  const key = SA11_KEYS[roundedMidi - 53];
  return key ? { key, cents } : null;
}

// =========================================================================
// Authentic 100-Tone Bank (Casio SA-10 / SA-11)
// =========================================================================

export type ToneCategory =
  | 'Piyano & Org'
  | 'Bakır & Üflemeli'
  | 'Yaylı & Gitar'
  | 'Bas & Etnik'
  | 'Synth & Pad'
  | 'Efekt & SFX'
  | 'Perküsyon & Davul'
  | 'Split & Kombine';

export interface SA11Tone {
  code: string; // "00".."99"
  name: string;
  category: ToneCategory;
  description: string;
  playingTip: string;
  recommendedFilter: {
    approx: 'butterworth' | 'cheby1' | 'bessel' | 'ellip';
    ftype: 'lowpass' | 'highpass' | 'bandpass';
    fc: number;
    fcHigh?: number;
    reason: string;
  };
  practiceMidi: number[];
  synthWave: OscillatorType;
  synthDecay: number;
}

const RAW_TONE_NAMES: string[] = [
  // 00-09
  'Piano', 'Elec Piano', 'Honky-Tonk Piano', 'Harpsichord', 'Jazz Organ',
  'Elec Organ', 'Pipe Organ', 'Church Organ', 'Street Organ', 'Accordion',
  // 10-19
  'Brass Ens', 'Warm Brass', 'Trumpet', 'Tuba', 'Brass Hit',
  'Wind Ens', 'English Horn', 'Oboe', 'Bassoon', 'Clarinet',
  // 20-29
  'Samba Whistle', 'Whistle', 'Quena', 'Flute', 'Flute-Vib',
  'Ocarina', 'Bagpipe', 'Harmonica', 'Chorus', 'Brass-Strings',
  // 30-39
  'Strings', 'Warm Strings', 'Violin', 'Violin-Piano', 'Cello',
  'Elec Guitar', 'Jazz Guitar', 'Mute Guitar', 'Metal Guitar', 'Slap Bass',
  // 40-49
  'Elec Bass', 'Wood Bass', 'Snare Bass', 'Ukulele', 'Banjo',
  'Sitar', 'Mandolin', 'Harp', 'Taishokoto', 'Shamisen',
  // 50-59
  'Synth-Piano', 'Synth-Celesta', 'Synth-Clavi', 'Synth-Accordion', 'Synth-Brass',
  'Synth-Reed', 'Synth-Lead', 'Synth-Strings', 'Synth-Guitar', 'Synth-Bass',
  // 60-69
  'Glass Harmonica', 'Fantasy', 'Waw Voice', 'Twinkle Echo', 'Metal Lead',
  'Cathedral', 'Cosmic Dance', 'Plunk Extend', 'Pop Lead', 'Pearl Drop',
  // 70-79
  'Airplane', 'Ambulance', 'Insect', 'Emergency Alarm', 'Laser Beam',
  'Cosmic Sound', 'Telephone', 'Car Horn', 'Computer Sound', 'Typewriter',
  // 80-89
  'Vibraphone', 'Marimba', 'Church Bells', 'Bells', 'Gamelan',
  'Afro Percussion', 'Ethnic Percussion', 'Sample Percussion', 'Matsuri', 'Wadaiko',
  // 90-99
  'Triangle', 'Conga/Agogo', 'Cowbell/Clave', 'Tom', 'Rock Drum',
  'Swing Drum', 'Bass/Piano (Split)', 'Bass/Trumpet (Split)', 'Piano/Flute (Split)', 'Strings/Oboe (Split)',
];

function classifyTone(idx: number): {
  category: ToneCategory;
  description: string;
  playingTip: string;
  recommendedFilter: SA11Tone['recommendedFilter'];
  practiceMidi: number[];
  synthWave: OscillatorType;
  synthDecay: number;
} {
  if (idx <= 9) {
    return {
      category: 'Piyano & Org',
      description: 'Klasik tuşlu çalgı PCM tonu. Akor eşlikleri ve temel melodi eğitimi için dengeli harmonik yapı sunar.',
      playingTip: 'SA-11 4 nota polifoniktir; sol elde 1 bas nota + sağ elde 3 sesli akor (triad) ile temiz sonuç alırsınız.',
      recommendedFilter: { approx: 'bessel', ftype: 'lowpass', fc: 6200, reason: '8-bit piyano/org ataklarını bozmadan üst frekans tıslamasını yumuşatır.' },
      practiceMidi: [60, 64, 67, 72, 67, 64, 60],
      synthWave: idx >= 4 ? 'sawtooth' : 'triangle',
      synthDecay: idx >= 4 ? 0.65 : 0.45,
    };
  }
  if (idx <= 29) {
    return {
      category: 'Bakır & Üflemeli',
      description: 'Nefesli ve bakır üflemeli karakterli ton. Belirgin orta-yüksek harmoniklere sahiptir.',
      playingTip: 'Legato (notaları birbirine bağlayarak) çalmak nefesli hissiyatını güçlendirir; kısa nefes boşlukları bırakın.',
      recommendedFilter: { approx: 'butterworth', ftype: 'bandpass', fc: 150, fcHigh: 4800, reason: 'Üflemeli formant bandını korurken 50 Hz uğultuyu ve dijital parlaklığı dengeler.' },
      practiceMidi: [65, 67, 69, 72, 74, 72, 69, 65],
      synthWave: idx <= 14 ? 'sawtooth' : 'sine',
      synthDecay: 0.55,
    };
  }
  if (idx <= 38) {
    return {
      category: 'Yaylı & Gitar',
      description: 'Yaylı enstrüman veya elektro/caz gitar PCM tınısı. Melodik solo ve arka plan padleri için uygundur.',
      playingTip: 'Yaylılarda uzun basılı notalar, gitarlarda ise staccato (kısa vuruşlu) ritmik kalıplar deneyin.',
      recommendedFilter: { approx: 'cheby1', ftype: 'lowpass', fc: 5200, reason: 'Yaylı ve gitar gövdesine sıcak analog karakter kazandırır.' },
      practiceMidi: [60, 62, 64, 67, 69, 67, 64, 62],
      synthWave: 'sawtooth',
      synthDecay: 0.5,
    };
  }
  if (idx <= 49) {
    return {
      category: 'Bas & Etnik',
      description: 'Alt frekans basları ve geleneksel telli/etnik enstrümanlar (Sitar, Shamisen, Banjo, Harp).',
      playingTip: 'Bas tonlarını klavyenin sol yarısında (F3–C4), etnik tellileri orta-üst oktavlarda arpej şeklinde çalın.',
      recommendedFilter: { approx: 'butterworth', ftype: 'lowpass', fc: idx <= 42 ? 1800 : 5800, reason: idx <= 42 ? 'Bas temel frekansını güçlendirir, üst parazitleri temizler.' : 'Telli tınısının parlaklığını koruyarak gürültüyü azaltır.' },
      practiceMidi: idx <= 42 ? [53, 55, 57, 60, 57, 55, 53] : [62, 65, 67, 69, 74, 69, 67],
      synthWave: 'triangle',
      synthDecay: 0.35,
    };
  }
  if (idx <= 69) {
    return {
      category: 'Synth & Pad',
      description: '1990 dönemi Casio lo-fi dijital sentezleyici, atmosferik pad ve retro lead tonları.',
      playingTip: 'Kayıt Stüdyosu ve Music Maker modlarında davul ritmi üzerine melodi/arpej katmanı olarak harika çalışır.',
      recommendedFilter: { approx: 'cheby1', ftype: 'lowpass', fc: 4200, reason: 'Klasik analog synth filtresi gibi keskin geçiş ve sıcak rezonans etkisi verir.' },
      practiceMidi: [60, 67, 72, 71, 67, 64, 60],
      synthWave: 'square',
      synthDecay: 0.55,
    };
  }
  if (idx <= 79) {
    return {
      category: 'Efekt & SFX',
      description: 'Ses efektleri ve deneysel 8-bit sesler (79 Typewriter, SA-11 düğme tık sesidir!).',
      playingTip: 'Music Maker projelerinde geçiş efekti (transition) veya lo-fi beat içinde vurgu olarak kullanabilirsiniz.',
      recommendedFilter: { approx: 'butterworth', ftype: 'highpass', fc: 120, reason: 'Efekt kayıtlarındaki alt frekans gürültüsünü ve DC ofseti temizler.' },
      practiceMidi: [60, 64, 67, 70, 72],
      synthWave: 'square',
      synthDecay: 0.25,
    };
  }
  if (idx <= 95) {
    return {
      category: 'Perküsyon & Davul',
      description: 'Tonal perküsyon (Vibraphone, Marimba, Gamelan) ve davul kitleri (Rock/Swing Drum).',
      playingTip: 'Kısa ve net vuruşlarla ritim kalıpları çalın; Bessel filtre vuruş keskinliğini (transient) en iyi koruyan filtredir.',
      recommendedFilter: { approx: 'bessel', ftype: 'lowpass', fc: 7800, reason: 'Doğrusal faz karakteri ile davul/perküsyon vuruşlarının netliğini bozmaz.' },
      practiceMidi: [60, 62, 64, 67, 69, 72],
      synthWave: 'triangle',
      synthDecay: 0.22,
    };
  }
  return {
    category: 'Split & Kombine',
    description: 'Klavyeyi sol ve sağ bölgelere ayıran çift enstrümanlı (Split) performans tonu (Kılavuz s.1).',
    playingTip: 'Sol elinizle bas/eşlik bölgesini (F3–B3), sağ elinizle melodi bölgesini (C4–C6) aynı anda çalın.',
    recommendedFilter: { approx: 'butterworth', ftype: 'bandpass', fc: 80, fcHigh: 7200, reason: 'Hem sol el bas hem sağ el melodi bandını temiz şekilde geçirir.' },
    practiceMidi: [53, 60, 64, 67, 55, 62, 67, 71],
    synthWave: 'triangle',
    synthDecay: 0.45,
  };
}

export const SA11_TONES: SA11Tone[] = RAW_TONE_NAMES.map((name, idx) => {
  const code = String(idx).padStart(2, '0');
  const meta = classifyTone(idx);
  return {
    code,
    name,
    ...meta,
  };
});

// =========================================================================
// Basic Music Theory Curriculum (Notalardan İtibaren — From Scratch)
// =========================================================================

export interface MusicLesson {
  id: string;
  level: 'Başlangıç' | 'Temel' | 'Orta';
  title: string;
  subtitle: string;
  summary: string;
  theoryPoints: string[];
  recommendedToneCode: string;
  exerciseTitle: string;
  targetMidiSequence: number[];
}

export const MUSIC_LESSONS: MusicLesson[] = [
  {
    id: 'lesson-1-notes',
    level: 'Başlangıç',
    title: '1. Notaları Tanıyalım (Do–Re–Mi–Fa–Sol–La–Si)',
    subtitle: 'Casio SA-11 üzerindeki 32 tuşun haritası',
    summary: 'Müzikte 7 temel doğal nota vardır: Do (C), Re (D), Mi (E), Fa (F), Sol (G), La (A), Si (B). Casio SA-11 klavyesi en solda Fa (F3) tuşuyla başlar ve en sağda Do (C6) ile biter.',
    theoryPoints: [
      'İkili siyah tuş grubunun hemen solundaki beyaz tuş her zaman DO (C) notasıdır.',
      'Üçlü siyah tuş grubunun hemen solundaki beyaz tuş her zaman FA (F) notasıdır.',
      'Orta Do (C4 = 261.63 Hz), SA-11 klavyesinde soldan 5. beyaz tuştur.',
    ],
    recommendedToneCode: '00',
    exerciseTitle: 'Orta Do (C4) notasından başlayarak C–D–E–F–G–A–B–C dizisini çalın:',
    targetMidiSequence: [60, 62, 64, 65, 67, 69, 71, 72],
  },
  {
    id: 'lesson-2-sharps',
    level: 'Başlangıç',
    title: '2. Siyah Tuşlar: Diyez (♯) ve Bemol (♭)',
    subtitle: 'Yarım ses (semitone) kavramı',
    summary: 'Siyah tuşlar, komşu iki beyaz tuş arasındaki yarım seslik basamakları temsil eder. Bir notayı yarım ses inceltmek Diyez (♯), kalınlaştırmak Bemol (♭) olarak adlandırılır.',
    theoryPoints: [
      'Do (C) ile Re (D) arasındaki siyah tuş: Do♯ (C#) veya Re♭ (Db).',
      'Mi–Fa (E–F) ve Si–Do (B–C) arasında siyah tuş yoktur; araları doğal olarak yarım sestir.',
      'Bir oktavda 7 beyaz + 5 siyah = 12 yarım ses vardır.',
    ],
    recommendedToneCode: '01',
    exerciseTitle: 'Kromatik geçiş alıştırması (C – C♯ – D – D♯ – E – F – F♯ – G):',
    targetMidiSequence: [60, 61, 62, 63, 64, 65, 66, 67],
  },
  {
    id: 'lesson-3-octaves',
    level: 'Başlangıç',
    title: '3. Oktav ve Frekans Matematiği',
    subtitle: 'Her oktavda frekans tam 2 katına çıkar',
    summary: 'Mühendislik gözüyle müzik logaritmiktir: Bir notadan bir oktav yukarı çıktığınızda frekans tam olarak 2 katına çıkar. La4 (A4) referans frekansı 440 Hz kabul edilir.',
    theoryPoints: [
      'Eşit tamperaman formülü: f(n) = 440 × 2^((n - 69) / 12) Hz.',
      'Örnek: C4 = 261.63 Hz, C5 = 523.25 Hz, C6 = 1046.50 Hz.',
      'Aktif filtre tasarımında bu yüzden Bode grafikleri logaritmik frekans ekseninde çizilir!',
    ],
    recommendedToneCode: '06',
    exerciseTitle: 'Oktav sıçramalarını çalın (F3 → F4 → C4 → C5 → F4 → F5):',
    targetMidiSequence: [53, 65, 60, 72, 65, 77],
  },
  {
    id: 'lesson-4-intervals',
    level: 'Temel',
    title: '4. Aralıklar (İkili, Üçlü, Beşli)',
    subtitle: 'Melodilerin yapı taşları',
    summary: 'İki nota arasındaki mesafeye aralık (interval) denir. Tam Beşli (C → G) ve Büyük Üçlü (C → E) kulağa en uyumlu (konsonant) gelen temel aralıklardır.',
    theoryPoints: [
      'Büyük Üçlü (Major 3rd): 4 yarım ses (C4 → E4).',
      'Tam Dörtlü (Perfect 4th): 5 yarım ses (C4 → F4).',
      'Tam Beşli (Perfect 5th): 7 yarım ses (C4 → G4) — frekans oranı yaklaşık 3:2.',
    ],
    recommendedToneCode: '23',
    exerciseTitle: 'C4 referansından aralıkları çalın (C–E, C–F, C–G, C–C5):',
    targetMidiSequence: [60, 64, 60, 65, 60, 67, 60, 72],
  },
  {
    id: 'lesson-5-scales',
    level: 'Temel',
    title: '5. Majör & Minör Gamlar',
    subtitle: 'Mutlu (Majör) ve Hüzünlü (Minör) tınılar',
    summary: 'Majör gam "Tam–Tam–Yarım–Tam–Tam–Tam–Yarım" (T-T-Y-T-T-T-Y) kalıbıyla kurulur. Doğal Minör gam ise "T-Y-T-T-Y-T-T" kalıbını izler.',
    theoryPoints: [
      'Do Majör (C Major): Hiç siyah tuş kullanmaz (C-D-E-F-G-A-B-C).',
      'La Minör (A Minor): Do Majör ile aynı tuşları kullanır ama La (A) notasından başlar.',
      'Fa Majör (F Major): SA-11\'in en sol tuşu F3\'ten başlar ve Si♭ (A♯3) siyah tuşunu içerir!',
    ],
    recommendedToneCode: '30',
    exerciseTitle: 'Fa Majör (F Major) gamını çalın (F3 – G3 – A3 – A♯3 – C4 – D4 – E4 – F4):',
    targetMidiSequence: [53, 55, 57, 58, 60, 62, 64, 65],
  },
  {
    id: 'lesson-6-chords',
    level: 'Temel',
    title: '6. Temel Akorlar & Arpejler',
    subtitle: 'SA-11\'in 4 nota polifonisiyle eşlik kurma',
    summary: 'Bir akor, en az üç notanın birlikte (veya arpej olarak sırayla) çalınmasıyla oluşur. C Majör (Do–Mi–Sol), F Majör (Fa–La–Do) ve G Majör (Sol–Si–Re) yüzlerce şarkının temelidir.',
    theoryPoints: [
      'C Majör arpeji: C4 – E4 – G4.',
      'F Majör arpeji: F4 – A4 – C5.',
      'G Majör arpeji: G4 – B4 – D5.',
    ],
    recommendedToneCode: '36',
    exerciseTitle: 'C – F – G – C akor arpejlerini sırayla çalın:',
    targetMidiSequence: [60, 64, 67, 65, 69, 72, 67, 71, 74, 60, 64, 67],
  },
  {
    id: 'lesson-7-melody',
    level: 'Orta',
    title: '7. İlk Melodimiz: Neşeye Övgü (Ode to Joy)',
    subtitle: 'Beethoven 9. Senfoni ana teması',
    summary: 'Sadece 5 komşu beyaz tuş (C4, D4, E4, F4, G4) kullanarak dünyanın en ünlü melodilerinden birini çalabilirsiniz.',
    theoryPoints: [
      'Tempo sabit kalsın: her notayı eşit sürede (dörtlük nota gibi) çalmaya çalışın.',
      'SA-11 üzerinden 00 Piano veya 06 Pipe Organ tonunu seçebilirsiniz.',
      'Gerçek klavyede bastığınız her tuş 3D modelde anında kırmızı yanacaktır!',
    ],
    recommendedToneCode: '00',
    exerciseTitle: 'Ode to Joy ana temasını takip edin (E-E-F-G-G-F-E-D-C-C-D-E-E-D-D):',
    targetMidiSequence: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62],
  },
  {
    id: 'lesson-8-twinkle',
    level: 'Orta',
    title: '8. Tam Beşli Melodi: Twinkle Twinkle',
    subtitle: 'Sıçramalı melodi ve ritim kontrolü',
    summary: 'Do–Sol (Tam Beşli) sıçramasını ve temiz nota geçişlerini pekiştiren klasik etüt.',
    theoryPoints: [
      'C4 → G4 sıçramasında parmak pozisyonunuzu sabit tutun.',
      'Ton 80 (Vibraphone) veya Ton 51 (Synth-Celesta) ile harika tınlar.',
    ],
    recommendedToneCode: '80',
    exerciseTitle: 'Melodiyi çalın (C-C-G-G-A-A-G – F-F-E-E-D-D-C):',
    targetMidiSequence: [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60],
  },
];

// =========================================================================
// Famous Piano Education Repertoire (All arranged for Casio SA-11: F3–C6)
// =========================================================================

export interface FamousSong {
  id: string;
  composer: string;
  title: string;
  era: string;
  difficulty: 'Kolay' | 'Orta' | 'İleri';
  bpm: number;
  recommendedToneCode: string;
  description: string;
  tip: string;
  midiSequence: number[];
}

export const FAMOUS_SONGS: FamousSong[] = [
  {
    id: 'beethoven-fur-elise',
    composer: 'Ludwig van Beethoven',
    title: 'Für Elise (Bagatelle No. 25)',
    era: 'Klasik / Romantik',
    difficulty: 'Kolay',
    bpm: 112,
    recommendedToneCode: '00',
    description: 'Dünya genelinde piyano eğitiminde en çok öğretilen klasik başyapıt. Mi5–Re♯5 yarım ses salınımıyla tanınır.',
    tip: 'E5–D♯5 geçişinde 4. ve 5. parmaklarınızı hafif ve eşit tempoda kullanın.',
    midiSequence: [76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 68, 71, 72],
  },
  {
    id: 'beethoven-ode-to-joy',
    composer: 'Ludwig van Beethoven',
    title: 'Neşeye Övgü (9. Senfoni)',
    era: 'Klasik',
    difficulty: 'Kolay',
    bpm: 118,
    recommendedToneCode: '00',
    description: 'Sadece 5 beyaz tuşla (C4–G4) çalınabilen, başlangıç piyano metodlarının vazgeçilmez teması.',
    tip: 'Sağ elinizi C4–G4 üzerine yerleştirip elinizi kaydırmadan tüm melodiyi çalabilirsiniz.',
    midiSequence: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62],
  },
  {
    id: 'mozart-turkish-march',
    composer: 'Wolfgang Amadeus Mozart',
    title: 'Türk Marşı (Rondo Alla Turca)',
    era: 'Klasik',
    difficulty: 'İleri',
    bpm: 132,
    recommendedToneCode: '00',
    description: 'Mehter ritimlerinden esinlenen, çevik parmak tekniği kazandıran efsanevi Mozart sonatı.',
    tip: 'Önce yavaş tempoda B4–A4–G♯4–A4 dörtlü gruplarını netleştirip sonra hızlanın.',
    midiSequence: [71, 69, 68, 69, 72, 74, 72, 71, 72, 76, 77, 76, 75, 76, 83, 81, 80, 81, 83, 81, 80, 81, 84],
  },
  {
    id: 'mozart-eine-kleine',
    composer: 'Wolfgang Amadeus Mozart',
    title: 'Küçük Bir Gece Müziği (Eine Kleine Nachtmusik)',
    era: 'Klasik',
    difficulty: 'Orta',
    bpm: 126,
    recommendedToneCode: '30',
    description: 'Canlı arpej sıçramalarıyla ritim duygusunu geliştiren en bilinen Mozart serenadı.',
    tip: 'G4–D4 sıçramalarını kısa ve enerjik (staccato) çalın; Ton 30 Strings ile orkestra hissi verir.',
    midiSequence: [67, 62, 67, 62, 67, 62, 67, 71, 74, 72, 69, 72, 69, 72, 69, 66, 69, 62],
  },
  {
    id: 'bach-minuet-in-g',
    composer: 'Johann Sebastian Bach',
    title: 'Sol Majör Minuet (BWV Anh. 114)',
    era: 'Barok',
    difficulty: 'Orta',
    bpm: 114,
    recommendedToneCode: '03',
    description: 'Anna Magdalena Bach Defteri’nden 3/4 vals ölçüsünde, tüm konservatuvarların temel piyano parçası.',
    tip: 'Üçlü ölçü (1-2-3) hissini koruyun; Ton 03 Harpsichord (Klavsen) ile Barok tını yakalayabilirsiniz.',
    midiSequence: [74, 67, 69, 71, 72, 74, 67, 67, 76, 72, 74, 76, 78, 79, 67, 67],
  },
  {
    id: 'pachelbel-canon',
    composer: 'Johann Pachelbel',
    title: 'Canon in D (Piyano Düzenlemesi)',
    era: 'Barok',
    difficulty: 'Kolay',
    bpm: 92,
    recommendedToneCode: '00',
    description: 'İnen bas yürüyüşü ve akıcı melodisiyle sakin, duygusal piyano çalışması için ideal eser.',
    tip: 'Notaları birbirine bağlayarak (legato) yumuşak geçişlerle çalın.',
    midiSequence: [76, 74, 72, 71, 69, 67, 69, 71, 72, 71, 69, 67, 65, 64, 65, 67],
  },
  {
    id: 'chopin-nocturne',
    composer: 'Frédéric Chopin',
    title: 'Nocturne Op. 9 No. 2 (Ana Tema)',
    era: 'Romantik',
    difficulty: 'Orta',
    bpm: 84,
    recommendedToneCode: '00',
    description: 'Romantik dönemin en zarif gece müziği. İfade gücü ve yumuşak tuş kontrolü kazandırır.',
    tip: 'Acele etmeyin; uzun notalarda melodinin nefes almasına izin verin.',
    midiSequence: [67, 76, 74, 76, 74, 72, 67, 72, 69, 67, 65, 64, 62, 64, 65, 67],
  },
  {
    id: 'tchaikovsky-swan-lake',
    composer: 'Pyotr Ilyich Tchaikovsky',
    title: 'Kuğu Gölü (Swan Lake Ana Tema)',
    era: 'Romantik',
    difficulty: 'Orta',
    bpm: 96,
    recommendedToneCode: '32',
    description: 'Dramatik minör tınısıyla ünlü bale teması. La Minör gamını pekiştirmek için mükemmeldir.',
    tip: 'E5 notasını güçlü başlatıp A4–B4–C5–D5 yükselişini akıcı şekilde bağlayın.',
    midiSequence: [76, 69, 71, 72, 74, 76, 72, 76, 72, 76, 69, 72, 69, 65, 72, 69],
  },
  {
    id: 'satie-gymnopedie-1',
    composer: 'Erik Satie',
    title: 'Gymnopédie No. 1',
    era: 'Modern Klasik',
    difficulty: 'Kolay',
    bpm: 78,
    recommendedToneCode: '01',
    description: 'Minimalist, dingin ve modern piyano eğitiminin en sevilen atmosferik parçası.',
    tip: 'Ton 01 Elec Piano veya 00 Piano ile yavaş ve meditatif bir tempoda çalın.',
    midiSequence: [78, 81, 79, 78, 73, 71, 73, 74, 69, 66],
  },
  {
    id: 'traditional-greensleeves',
    composer: 'Geleneksel (Rönesans)',
    title: 'Greensleeves',
    era: 'Rönesans / Klasik Etüt',
    difficulty: 'Orta',
    bpm: 100,
    recommendedToneCode: '47',
    description: '6/8 ölçüde, diyezli (G♯) armonik minör geçişi öğreten klasik piyano ve arp eseri.',
    tip: 'Sondaki G♯4 siyah tuşuna dikkat edin; Ton 47 Harp ile harika tınlar.',
    midiSequence: [69, 72, 74, 76, 77, 76, 74, 71, 67, 69, 71, 72, 69, 69, 68, 69, 71, 68, 64],
  },
];
