import React, { useRef, useState } from "react";
import { Download, Upload, Brain, Info, X } from "lucide-react";
import { CONDITIONS } from "../experiment.js";
import { trainingExport, validateTaskModel } from "../taskPerformance";

function download(name, value) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function TrainingDataExport({
  trials,
  active,
  participant,
  setParticipant,
  permission,
  setPermission,
  sessionKey,
}) {
  const [message, setMessage] = useState("");
  function save() {
    try {
      const data = trainingExport(
        trials,
        participant.trim(),
        sessionKey,
        permission,
      );
      download(`recall-fieldnotes-training-${participant.trim()}.json`, data);
      setMessage("Training export downloaded. Nothing was uploaded.");
    } catch (error) {
      setMessage(error.message);
    }
  }
  return (
    <section className="lab-card training-export-card">
      <div className="lab-card-head">
        <h2>Prepare data for supervised training</h2>
      </div>
      <div className="training-export-body">
        <p>
          Export task answers and prior response times for offline model
          fitting. Reuse the same anonymous key for every session from one
          participant; use different keys for different people.
        </p>
        <label>
          Anonymous participant key
          <input
            value={participant}
            onChange={(e) => setParticipant(e.target.value)}
            maxLength={40}
            placeholder="e.g. volunteer-001"
            autoComplete="off"
            disabled={active}
          />
        </label>
        <small>
          Use a pseudonymous code, not a name, email, diagnosis or identifier
          from another service.
        </small>
        <label className="training-permission">
          <input
            type="checkbox"
            checked={permission}
            onChange={(e) => setPermission(e.target.checked)}
            disabled={active}
          />
          <span>
            I have permission to include these task responses and timings in a
            file for model training.
          </span>
        </label>
        <button
          className="lab-secondary"
          onClick={save}
          disabled={
            active ||
            !trials.some((t) => t.valid && !t.transfer) ||
            !permission ||
            !participant.trim()
          }
        >
          <Download size={16} /> Export training data
        </button>
        <p className="training-message" role="status">
          {message}
        </p>
        <p>
          Ordinary session exports restore your personal Bayesian learner. This
          separate training export records a participant key and permission for
          the supervised pipeline.
        </p>
      </div>
    </section>
  );
}
export default function SupervisedTaskModel({
  model,
  onLoad,
  onRemove,
  active,
}) {
  const ref = useRef(null),
    [message, setMessage] = useState("");
  async function load(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 500000)
        throw Error("Use a model JSON file smaller than 500 KB.");
      const artifact = validateTaskModel(JSON.parse(await file.text()));
      onLoad(artifact);
      setMessage(
        "Model loaded locally. Its fitted weights are fixed until a new artifact is loaded.",
      );
    } catch (error) {
      setMessage(error.message);
    }
  }
  return (
    <section className="lab-card supervised-model-card">
      <div className="lab-card-head">
        <div>
          <h2>Supervised task-performance model</h2>
          <p className="learner-intro">
            A separate model fitted offline to a participant dataset. Target:
            recall at least two of three objects.
          </p>
        </div>
        <span className="lab-tag">
          <Brain size={14} />
          {model ? "Fitted artifact loaded" : "No trained artifact loaded"}
        </span>
      </div>
      <div className="supervised-model-body">
        {model ? (
          <>
            <div className="supervised-model-summary">
              <div>
                <span>Model</span>
                <strong>{model.modelId}</strong>
                <small>Regularized logistic regression</small>
              </div>
              <div>
                <span>Participants held out</span>
                <strong>{model.evaluation.testParticipants}</strong>
                <small>
                  {model.evaluation.testTrials} unseen-participant trials
                </small>
              </div>
              <div>
                <span>Held-out Brier error</span>
                <strong>{model.evaluation.modelBrier.toFixed(3)}</strong>
                <small>
                  Baseline {model.evaluation.baselineBrier.toFixed(3)} · lower
                  is better
                </small>
              </div>
            </div>
            <p>
              Pilot evaluation supplied with this artifact.{" "}
              {model.evaluation.modelBrier >= model.evaluation.baselineBrier
                ? "The model does not outperform its baseline on Brier error."
                : "Lower Brier error on this holdout does not establish generalization."}{" "}
              Model reports and participant provenance are self-attested.
            </p>
            <p>
              Supported conditions:{" "}
              {model.conditions.map((c) => CONDITIONS[c].short).join(", ")}.
            </p>
            <p>
              Fitted {new Date(model.trainedAt).toLocaleDateString()}. AUC{" "}
              {model.evaluation.auc.toFixed(3)}; log loss{" "}
              {model.evaluation.modelLogLoss.toFixed(3)} versus baseline{" "}
              {model.evaluation.baselineLogLoss.toFixed(3)}.
            </p>
          </>
        ) : (
          <>
            <p>
              The training pipeline is ready. No participant-trained weights are
              bundled: the app has no suitable real training dataset yet.
            </p>
            <ol>
              <li>
                Collect permission-recorded task exports from multiple
                participants in the session journal.
              </li>
              <li>
                Run the local Python training pipeline to fit weights and
                evaluate unseen participants.
              </li>
              <li>
                Load its <code>task-model.json</code> artifact here to make
                pre-trial predictions in your browser.
              </li>
            </ol>
            <p>
              The pipeline starts at five participants and 50 valid trials, with
              outcome-diversity checks. These are engineering guards for a
              pilot, not evidence that a model is reliable.
            </p>
          </>
        )}
        <div className="model-load-actions">
          <button
            className="lab-secondary"
            onClick={() => ref.current.click()}
            disabled={active}
          >
            <Upload size={16} />
            {model ? "Replace model JSON" : "Load model JSON"}
          </button>
          {model && (
            <button
              className="lab-text"
              onClick={() => {
                onRemove();
                setMessage("Supervised model removed from this tab.");
              }}
              disabled={active}
            >
              <X size={15} /> Remove model
            </button>
          )}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            ref={ref}
            onChange={load}
          />
        </div>
        <p role="status" className="training-message">
          {message}
        </p>
      </div>
      <p className="lab-card-note">
        <Info size={15} />
        <span>
          Loading a file never executes serialized Python code. Inference stays
          local. Synthetic smoke-test models are rejected. The personal Bayesian
          learner below remains a separate model.
        </span>
      </p>
    </section>
  );
}
export function SupervisedForecast({
  model,
  prediction,
  result,
  active,
  onManage,
}) {
  return (
    <div className="supervised-forecast">
      <strong>Supervised task forecast</strong>
      {prediction ? (
        <>
          <p className="supervised-probability">
            {Math.round(prediction.probability * 100)}%{" "}
            <span>chance of recalling ≥2/3</span>
          </p>
          <p>
            Model {prediction.modelId}. Forecast recorded before this trial.
          </p>
          {prediction.outsideTrainingRange && (
            <p>
              Some prior-history features are outside this model's training
              range. Treat this forecast cautiously.
            </p>
          )}
          {result && (
            <p>
              {result.valid
                ? `Observed task ${result.correct >= 2 ? "success" : "failure"} (${result.correct}/3). Fitted weights were not changed.`
                : "Excluded result; not used for evaluation."}
            </p>
          )}
        </>
      ) : (
        <p>
          {model
            ? "A supervised forecast will be recorded at the next supported apartment trial."
            : "No fitted artifact loaded. The recall-rate forecast above is the Bayesian learner."}
        </p>
      )}
      <button className="lab-text" onClick={onManage} disabled={active}>
        About this model
      </button>
    </div>
  );
}
