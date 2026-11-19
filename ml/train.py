"""Fit supervised task-success weights; export portable JSON, never pickle."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from datetime import datetime, timezone
import numpy as np
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.dummy import DummyClassifier
from sklearn.model_selection import GroupKFold, GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

ROOT = Path(__file__).resolve().parents[1]

def prepare(paths):
    result = subprocess.run(["node", str(ROOT / "ml/prepare-data.mjs"), *map(str, paths)], capture_output=True, text=True, check=False)
    if result.returncode:
        raise ValueError(result.stderr.strip() or "Dataset preparation failed.")
    return json.loads(result.stdout)

def metrics(y, probabilities):
    return {"brier": float(brier_score_loss(y, probabilities)), "logLoss": float(log_loss(y, probabilities, labels=[0,1])), "auc": float(roc_auc_score(y, probabilities))}

def fit_model(dataset, *, allow_synthetic=False):
    if dataset["dataKind"] != "observed" and not allow_synthetic:
        raise ValueError("Synthetic exports are for explicit smoke tests only; pass --allow-synthetic-smoke-test.")
    records = dataset["records"]
    if len(records) < 50:
        raise ValueError("Collect at least 50 valid trials before training. This is an engineering guard, not a validated sample-size requirement.")
    X = np.asarray([r["features"] for r in records], dtype=float)
    y = np.asarray([r["target"] for r in records], dtype=int)
    groups = np.asarray([r["participant"] for r in records])
    participants = np.unique(groups)
    if len(participants) < 5:
        raise ValueError("Collect at least five distinct consenting participants. Sessions from one person must reuse the same anonymous key.")
    if not np.isfinite(X).all() or len(np.unique(y)) != 2:
        raise ValueError("Features must be finite and outcomes must include successes and failures.")
    train, test = next(GroupShuffleSplit(n_splits=1, test_size=max(2, int(np.ceil(len(participants)*.25))), random_state=42).split(X,y,groups))
    if len(train)<30 or len(test)<10 or np.bincount(y[train],minlength=2).min()<5 or np.bincount(y[test],minlength=2).min()<2:
        raise ValueError("The fixed participant holdout needs >=30 training trials, >=10 test trials and both outcomes (>=5/class train, >=2/class test). Collect more varied data; the test split is not rerolled to improve results.")
    train_groups, test_groups = set(groups[train]), set(groups[test])
    assert train_groups.isdisjoint(test_groups)
    folds=list(GroupKFold(n_splits=min(3,len(train_groups))).split(X[train],y[train],groups[train]))
    if any(len(np.unique(y[train][a]))<2 for a,b in folds):
        raise ValueError("Participant-separated training folds need both outcome classes. Collect more varied participant histories.")
    candidates=[]
    for C in [.1,1.,10.]:
        losses=[]
        for a,b in folds:
            model=make_pipeline(StandardScaler(),LogisticRegression(C=C,max_iter=2000,random_state=42))
            model.fit(X[train][a],y[train][a])
            losses.append(float(log_loss(y[train][b],model.predict_proba(X[train][b])[:,1],labels=[0,1])))
        candidates.append({"C":C,"meanGroupCVLogLoss":float(np.mean(losses))})
    selected=min(candidates,key=lambda c:c["meanGroupCVLogLoss"])
    model=make_pipeline(StandardScaler(),LogisticRegression(C=selected["C"],max_iter=2000,random_state=42))
    model.fit(X[train],y[train])
    baseline=DummyClassifier(strategy="prior").fit(X[train],y[train])
    scores=metrics(y[test],model.predict_proba(X[test])[:,1])
    baseline_scores=metrics(y[test],baseline.predict_proba(X[test])[:,1])
    scaler=model.named_steps["standardscaler"]
    classifier=model.named_steps["logisticregression"]
    digest=hashlib.sha256(json.dumps(dataset,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    artifact={"schema":"neuroarc-task-logreg-v2","featureVersion":dataset["featureVersion"],"featureNames":dataset["featureNames"],"algorithm":"standardized_logistic_regression","target":dataset["target"],"dataKind":dataset["dataKind"],"modelId":f"task-{digest[:12]}","trainedAt":datetime.now(timezone.utc).isoformat(),"datasetHash":digest,"conditions":sorted({records[i]["condition"] for i in train}),"difficultyLevels":sorted({records[i]["difficultyLevel"] for i in train}),"supportedTasks":[{"condition":c,"difficultyLevel":level} for c,level in sorted({(records[i]["condition"],records[i]["difficultyLevel"]) for i in train})],"coefficients":classifier.coef_[0].tolist(),"intercept":float(classifier.intercept_[0]),"mean":scaler.mean_.tolist(),"scale":scaler.scale_.tolist(),"minimum":X[train].min(axis=0).tolist(),"maximum":X[train].max(axis=0).tolist(),"evaluation":{"split":"participant_holdout","trainParticipants":len(train_groups),"testParticipants":len(test_groups),"trainTrials":len(train),"testTrials":len(test),"modelBrier":scores["brier"],"baselineBrier":baseline_scores["brier"],"modelLogLoss":scores["logLoss"],"baselineLogLoss":baseline_scores["logLoss"],"auc":scores["auc"],"status":"pilot_only"},"training":{"framework":"scikit-learn","frameworkVersion":sklearn.__version__,"selectedC":selected["C"],"candidates":candidates},"limitations":["Pilot participant holdout, not external validation; minimum sample guards do not establish reliability.","Targets success on this task only (at least two thirds of objects). No clinical or brain-network inference.","Prior history features use only preceding valid trials within each export. Held-out participants' past answers are available sequentially.","Permission and anonymous participant identities are self-attested, not independently authenticated.","No automatic model promotion: compare baseline errors, data quality and subgroup performance before use."]}
    by_level={}
    test_probabilities=model.predict_proba(X[test])[:,1]
    baseline_probabilities=baseline.predict_proba(X[test])[:,1]
    for level in sorted({records[i]["difficultyLevel"] for i in test}):
        positions=[j for j,i in enumerate(test) if records[i]["difficultyLevel"]==level]
        targets=y[test][positions]
        def level_metrics(probabilities):
            values=probabilities[positions]
            return {"brier":float(brier_score_loss(targets,values)),"logLoss":float(log_loss(targets,values,labels=[0,1])),"auc":float(roc_auc_score(targets,values)) if len(np.unique(targets))==2 else None}
        by_level[str(level)]={"trials":len(positions),"successes":int(sum(targets)),"model":level_metrics(test_probabilities),"baseline":level_metrics(baseline_probabilities)}
    report={"byDifficulty":by_level,"datasetHash":digest,"dataKind":dataset["dataKind"],"audit":dataset["audit"],"selectedC":selected["C"],"groupCV":candidates,"evaluation":artifact["evaluation"],"trainParticipantKeys":sorted(train_groups),"testParticipantKeys":sorted(test_groups),"holdoutPredictions":[{"trialKey":records[i]["trialKey"],"target":int(y[i]),"probability":float(p)} for i,p in zip(test,model.predict_proba(X[test])[:,1])]}
    return artifact,report

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs",nargs="+",type=Path,help="Permission-recorded training JSON exports, not ordinary session files")
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--allow-synthetic-smoke-test",action="store_true")
    args=parser.parse_args()
    try:
        artifact,report=fit_model(prepare(args.inputs),allow_synthetic=args.allow_synthetic_smoke_test)
    except (ValueError,OSError,json.JSONDecodeError) as error:
        parser.exit(2,f"Training stopped: {error}\n")
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/"task-model.json").write_text(json.dumps(artifact,indent=2,allow_nan=False)+"\n")
    (args.output/"evaluation.json").write_text(json.dumps(report,indent=2,allow_nan=False)+"\n")
    print(f"Fitted {artifact['algorithm']} on {artifact['evaluation']['trainTrials']} trials; held out {artifact['evaluation']['testParticipants']} participants / {artifact['evaluation']['testTrials']} trials.")
    print(f"Data kind: {artifact['dataKind']}. Pilot evaluation only. No clinical validation.")
    print(f"Model: {args.output/'task-model.json'}")
if __name__=="__main__": main()
