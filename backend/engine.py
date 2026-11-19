"""Transparent toy model. No trained weights, published connectome-model replication, or clinical claims."""
from math import isfinite, sqrt
NETWORKS = ["Default mode", "Frontoparietal", "Salience", "Dorsal attention", "Limbic"]
WEIGHTS = [0.30, 0.25, 0.20, 0.15, 0.10]
PRESETS = [
    {"id": "SYN-001", "label": "Balanced pattern", "age": 64, "values": [28, 35, 38, 30, 42]},
    {"id": "SYN-002", "label": "Mixed pattern", "age": 68, "values": [68, 58, 44, 62, 40]},
    {"id": "SYN-003", "label": "Elevated pattern", "age": 72, "values": [82, 74, 68, 60, 65]},
]
DISCLAIMER = "Synthetic educational model. Not a diagnosis, probability, validated clinical score, or prediction of treatment benefit."

def assess(values):
    if len(values) != 5 or any(not isfinite(v) or not 0 <= v <= 100 for v in values):
        raise ValueError("Provide five finite network values between 0 and 100.")
    contributions = [round((v - 50) * w, 6) for v, w in zip(values, WEIGHTS)]
    score = round(50 + sum(contributions), 2)
    return {"score": score, "band": "Lower synthetic vulnerability" if score < 40 else "Intermediate synthetic pattern" if score < 65 else "Elevated synthetic vulnerability", "baseline": 50, "contributions": [{"network": n, "value": v} for n, v in zip(NETWORKS, contributions)], "attribution_method": "Exact additive contributions relative to a 50/100 feature reference; no trained SHAP explainer.", "data_source": "synthetic", "disclaimer": DISCLAIMER}

def simulate(values, adherence=80, minutes=15):
    base = assess(values)["score"]
    dose = adherence / 100 * minutes / 20
    points = [{"month": m, "baseline": round(min(100, base + 6*m/12), 2), "practice": round(max(0, min(100, base + 6*m/12 - 12*dose*m/12)), 2)} for m in range(13)]
    return {"points": points, "difference": round(points[-1]["baseline"] - points[-1]["practice"], 2), "assumptions": "Arbitrary +6 point/year drift and up to 12 dose-adjusted points/year offset; not fitted to clinical evidence.", "disclaimer": DISCLAIMER}

def roi_correlations(rows):
    """Pearson matrix for locally supplied deidentified time x ROI arrays; not a validated clinical score."""
    if len(rows) < 3 or not rows[0] or len(rows[0]) > 200 or any(len(r) != len(rows[0]) for r in rows):
        raise ValueError("Use a rectangular array with at least 3 timepoints and 1–200 ROIs.")
    if any(not isfinite(x) for r in rows for x in r):
        raise ValueError("All values must be finite.")
    cols = list(zip(*rows))
    centered = [[x - sum(c)/len(c) for x in c] for c in cols]
    norms = [sqrt(sum(x*x for x in c)) for c in centered]
    if any(n == 0 for n in norms):
        raise ValueError("Constant ROI series cannot be correlated.")
    return [[round(max(-1, min(1, sum(a*b for a,b in zip(x,y))/(norms[i]*norms[j]))), 6) for j,y in enumerate(centered)] for i,x in enumerate(centered)]
