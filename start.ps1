# SA-11 Studio — Tek Komutla Başlatıcı (Python Active Filter DSP + TypeScript Web Arayüzü)
Write-Host "SA-11 Studio baslatiliyor..." -ForegroundColor Cyan

# 1. Python FastAPI DSP Backend (Port 8000)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

# 2. TypeScript Vite Frontend (Port 5173)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"

Start-Sleep -Seconds 2
Write-Host "Python DSP API: http://127.0.0.1:8000/docs" -ForegroundColor Green
Write-Host "SA-11 Studio Web: http://localhost:5173" -ForegroundColor Green
