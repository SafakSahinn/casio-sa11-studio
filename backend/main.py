"""
SA-11 Studio — FastAPI Backend for Active Filter Design & Audio DSP
Run: uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from dsp_engine import (
    ApproximationType,
    CircuitTopology,
    FilterResponseType,
    design_active_filter,
    get_sa11_presets,
    process_wav_audio,
)

app = FastAPI(
    title="SA-11 Studio Active Filter & DSP API",
    version="1.0.0",
    description="Python + SciPy Active Filter Design & Audio Signal Processing Engine for Casio SA-11",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class FilterDesignRequest(BaseModel):
    approx: ApproximationType = "butterworth"
    ftype: FilterResponseType = "lowpass"
    order: int = Field(default=4, ge=1, le=8)
    fc: float = Field(default=2200.0, gt=5.0, lt=22000.0)
    fc_high: Optional[float] = Field(default=None, gt=10.0, lt=23000.0)
    rp: float = Field(default=0.5, gt=0.01, le=10.0)
    rs: float = Field(default=40.0, gt=5.0, le=120.0)
    fs: float = Field(default=48000.0, ge=8000.0, le=192000.0)
    topology: CircuitTopology = "sallen-key"
    c_base_nf: float = Field(default=10.0, gt=0.1, le=10000.0)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "engine": "scipy.signal", "keyboard": "Casio SA-11 (32 keys, F3-C6)"}


@app.get("/api/dsp/presets")
def presets() -> dict:
    return {"presets": get_sa11_presets()}


@app.post("/api/dsp/design-filter")
def design_filter(req: FilterDesignRequest) -> dict:
    try:
        return design_active_filter(
            approx=req.approx,
            ftype=req.ftype,
            order=req.order,
            fc=req.fc,
            fc_high=req.fc_high,
            rp=req.rp,
            rs=req.rs,
            fs=req.fs,
            topology=req.topology,
            c_base_nf=req.c_base_nf,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/dsp/process-wav")
async def process_wav(
    file: UploadFile = File(...),
    approx: ApproximationType = Form("bessel"),
    ftype: FilterResponseType = Form("lowpass"),
    order: int = Form(4),
    fc: float = Form(5500.0),
    fc_high: Optional[float] = Form(None),
    rp: float = Form(0.5),
    rs: float = Form(40.0),
    remove_50hz_hum: bool = Form(True),
    remove_dc_offset: bool = Form(True),
    noise_gate_db: float = Form(-48.0),
    normalize_peak: bool = Form(True),
) -> dict:
    try:
        wav_bytes = await file.read()
        return process_wav_audio(
            wav_bytes=wav_bytes,
            approx=approx,
            ftype=ftype,
            order=order,
            fc=fc,
            fc_high=fc_high,
            rp=rp,
            rs=rs,
            remove_50hz_hum=remove_50hz_hum,
            remove_dc_offset=remove_dc_offset,
            noise_gate_db=noise_gate_db,
            normalize_peak=normalize_peak,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
