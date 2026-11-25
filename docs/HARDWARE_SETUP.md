# Casio SA-11 → PC Bağlantı & Donanım Rehberi

## 1. Doğru Anakart Girişi: Mavi Jak (Line-In)

Evet, tahmininiz **tamamen doğru!** Casio SA-11'in arkasındaki **OUTPUT** çıkışını bilgisayarın anakartındaki **MAVİ (Line-In)** girişine bağlamalısınız.

### Neden Mavi (Line-In), Pembe (Mic-In) Değil?
Casio SA-11 resmi kullanım kılavuzundaki (`docs/Casio_SA-11_Manual.pdf`, Sayfa 4) elektriksel özelliklere göre:
- **Çıkış Empedansı ($Z_{\text{out}}$):** `100 Ω`
- **Maksimum Çıkış Gerilimi ($V_{\text{out,max}}$):** `2.0 V (RMS)`

| Anakart Jak Rengi | Görevi | Giriş Hassasiyeti | Casio SA-11 İçin Uygunluk |
| :--- | :--- | :--- | :--- |
| **Mavi (Line-In)** | Hat Seviyesi Giriş | ~0.3 V – 2.0 V RMS | **DOĞRU SEÇİM** — Düşük gürültülü, ön-yükselteçsiz temiz giriş |
| **Pembe (Mic-In)** | Mikrofon Girişi | ~5 mV – 50 mV RMS (+20–30 dB kazanç & bias gerilimi) | **UYGUN DEĞİL** — 2.0 V RMS sinyal anında kırpılır (clipping) ve bozulur |
| **Yeşil (Line-Out)** | Hoparlör / Kulaklık Çıkışı | Çıkış portu | Giriş değildir |

---

## 2. Gerekli Kablo
- **3.5 mm TRS Erkek → 3.5 mm TRS Erkek Stereo AUX Kablosu** (standart kulaklık/AUX kablosu).
- Casio SA-11 mono çıkış üretse de TRS stereo jakı her iki kanala (L+R) aynı sinyali iletir.
- Kabloyu SA-11'in **OUTPUT** jakına taktığınızda dahili hoparlör otomatik olarak kesilir (kılavuz sayfa 2).

---

## 3. Windows Ses Ayarları (Temiz Veri Okuma İçin Kritik)
1. **Ayarlar → Sistem → Ses → Daha fazla ses ayarı** (veya `mmsys.cpl`) penceresini açın.
2. **Kayıt (Recording)** sekmesinde **Hat Girişi (Line In)** aygıtını seçip **Özellikler** deyin:
   - **Düzeyler (Levels):** Başlangıç için `%60–%75` yapın. Casio SA-11 üzerindeki ses düğmesini 5 kademeden **3. veya 4. kademede** tutun (2.0 V RMS tam seste ADC clipping yapabilir).
   - **Gelişmiş (Advanced):** `48000 Hz, 16-bit veya 24-bit` seçin.
   - **Ses Geliştirmeleri (Audio Enhancements):** **KAPATIN**. Windows'un gürültü bastırma / yankı iptali algoritmaları müzik notalarını ve armonikleri bozar; filtrelemeyi kendi **Aktif Filtre DSP** zincirimizle yapacağız.
   - *(Opsiyonel)* Çalarken bilgisayar hoparlöründen gecikmesiz duymak isterseniz **Dinle (Listen)** sekmesinden "Bu aygıtı dinle" açılabilir, ancak SA-11 Studio içindeki canlı monitör de kullanılabilir.

---

## 4. Aktif Filtre Tasarımı Neden Hem Okumada Hem Müzik Üretiminde Gerekli?

1. **Veri Okuma & Nota Algılama Ön-Filtresi (Pitch Detection Pre-Filter):**
   - Casio SA-11'in 32 tuşu **F3 (174.61 Hz) – C6 (1046.50 Hz)** aralığındadır.
   - Anakart Line-In hattında **50 Hz şebeke uğultusu** (ve 100/150 Hz harmonikleri) ile **DC ofset** bulunur.
   - Ayrıca 1990 model 8-bit PCM ses motoru yüksek frekanslı kuantalama tıslaması (aliasing hiss) ve keskin üst harmonikler üretir; bunlar filtrelenmezse temel frekans ($f_0$) algılayıcı (YIN) oktav hatası yapabilir.
   - **Çözüm:** Python (`scipy.signal`) ile tasarlanan **50 Hz Notch + 4. Derece Butterworth Band-Pass (145 Hz – 2200 Hz)** aktif filtre zinciri.
2. **Kayıt Temizleme & Müzik İyileştirme (Post-Processing Mastering):**
   - Kayıt sonrası **Bessel Alçak Geçiren Filtre** (doğrusal faz / sabit grup gecikmesi sayesinde piyano/vuruş transient'larını bozmadan 8-bit tıslamayı temizler) + **Sıfır Fazlı (`sosfiltfilt`) 50 Hz Hum Eliminasyonu** uygulanır.
