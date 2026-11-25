# SA-11 Studio — Casio SA-11 3D Müzik, Eğitim & Aktif Filtre DSP Platformu

**Canlı Site (GitHub Pages):** https://safaksahinn.github.io/casio-sa11-studio/

Casio **SA-11** (32 mini tuş, `F3–C6`, 100 Sound Tone Bank) klavyesi için geliştirilmiş; **TypeScript + React + Three.js** tabanlı interaktif 3D web uygulaması ve **Python + FastAPI + SciPy** aktif filtre tasarım / ses işleme (DSP) motoru.

## Özellikler
- **İnteraktif 3D Casio SA-11 Modeli:** Gerçek boyut oranlarına (`470 × 165 × 50 mm`) uygun 32 tuşlu 3D model. Line-In üzerinden bastığınız tuş anında algılanır ve 3D modelde **kırmızı** yanar.
- **Line-In Bağlantısı (Anakart Mavi Jak):** SA-11 `OUTPUT` (`100 Ω`, `2.0 V RMS MAX`) → PC Mavi `Line-In` bağlantısı için ham ses yakalama ve YIN temel frekans algılayıcı.
- **Eğitim Merkezi (Sıfırdan Müzik + 100 Ton Rehberi):** Notalardan itibaren 8 derslik müfredat ve Casio SA-11'deki tüm 100 ton (`00 Piano` – `99 Strings/Oboe Split`) için özel etüt ve aktif filtre önerileri.
- **Aktif Filtre Tasarımı Laboratuvarı:** Butterworth, Chebyshev I/II, Bessel ve Elliptic yaklaşımları; Sallen-Key / MFB devre bileşeni sentezi ($R, C, Q, f_0$), Bode diyagramı ve canlı Web Audio `IIRFilterNode` uygulaması.
- **Kayıt Stüdyosu & Sıfır-Fazlı Temizleme:** Line-In kaydı, 50/100/150 Hz şebeke uğultusu notch, DC ofset giderme, Bessel LPF ile 8-bit PCM hiss temizleme ve Önce/Sonra FFT spektrum analizi.
- **Music Maker:** 16 adımlı davul/ritim sekanseri, SA-11 klavyeden canlı melodi kaydı ve temizlenmiş WAV klipleriyle aranjman.
- **Resmi Kullanım Kılavuzu:** [docs/Casio_SA-11_Manual.pdf](docs/Casio_SA-11_Manual.pdf) ve [docs/HARDWARE_SETUP.md](docs/HARDWARE_SETUP.md).

## Yerel Çalıştırma (Python SciPy Backend ile)
```powershell
.\start.ps1
```
- Web Arayüzü: `http://localhost:5173`
- Python DSP API: `http://127.0.0.1:8000/docs`

> **Not:** GitHub Pages (`github.io`) üzerinde açıldığında uygulama dahili **Tarayıcı DSP Motoru** ile sunucuya ihtiyaç duymadan tüm aktif filtre ve WAV temizleme özelliklerini doğrudan çalıştırır.
