from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict
from .engine import assess, simulate, roi_correlations, PRESETS

app = FastAPI(title="Recall Fieldnotes research demo", version="0.1.0", description="Synthetic model only. No clinical inference.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
class Assessment(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    values: list[float] = Field(min_length=5, max_length=5)
class Simulation(Assessment):
    adherence: float = Field(default=80, ge=0, le=100)
    minutes: float = Field(default=15, ge=5, le=30)
class ROISeries(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    rows: list[list[float]] = Field(min_length=3, max_length=2000)
@app.get("/health")
def health():
    return {"status": "ok", "mode": "synthetic"}
@app.get("/cohort-presets")
def presets():
    return {"source": "synthetic", "subjects": PRESETS}
@app.post("/assess")
def assessment(body: Assessment):
    try: return assess(body.values)
    except ValueError as e: raise HTTPException(422, str(e))
@app.post("/simulate-intervention")
def intervention(body: Simulation):
    try: return simulate(body.values, body.adherence, body.minutes)
    except ValueError as e: raise HTTPException(422, str(e))
@app.post("/roi-correlations")
def correlations(body: ROISeries):
    try: return {"matrix": roi_correlations(body.rows), "note": "Correlations only; no validated mapping to clinical scores or demo network sliders."}
    except ValueError as e: raise HTTPException(422, str(e))
