import React from "react";
import { Brain, CheckCircle2, Info, LockKeyhole } from "lucide-react";
import { CONDITIONS } from "../experiment";
import { CONDITION_KEYS, predictTrial } from "../personalModel.js";
const percent = (value) => `${Math.round(value * 100)}%`;

export function ForecastCard({ prediction, result, locked }) {
  if (!prediction)
    return (
      <div className="information-box personal-forecast">
        <span>SEPARATE LAYOUT PROBE</span>
        <p>
          No personal forecast is issued for a different layout. This trial will
          not train the learner.
        </p>
      </div>
    );
  return (
    <div
      className="information-box personal-forecast"
      aria-label="Personal model forecast"
    >
      <span>
        {locked ? (
          <>
            <LockKeyhole size={13} /> Forecast recorded before this trial
          </>
        ) : (
          "Estimated recall"
        )}
      </span>
      <strong>
        {percent(prediction.probability)} <small>per object</small>
      </strong>
      <p>
        Expected recall:{" "}
        <b>
          {prediction.expectedCorrect.toFixed(1)} of{" "}
          {prediction.objectCount ?? 3}
        </b>
        . Model interval: {percent(prediction.interval.low)}–
        {percent(prediction.interval.high)}.
      </p>
      <p>
        {prediction.conditionTrials} prior trials in this condition;{" "}
        {prediction.trainingTrials} total training trials.
      </p>
      {result && (
        <div className="forecast-outcome">
          <CheckCircle2 size={16} />
          <span>
            {result.valid
              ? `Observed ${result.correct} of ${result.placements.length}. Learner updated after scoring.`
              : "Excluded result. Learner not updated."}
          </span>
        </div>
      )}
      {!locked && (
        <small>
          The forecast is frozen when the trial starts. It can change after
          other completed trials.
        </small>
      )}
    </div>
  );
}

export default function PersonalLearner({ state, evaluation, onMethods }) {
  const rows = CONDITION_KEYS.map((condition) => ({
    condition,
    ...predictTrial(state, condition),
  }));
  const comparison =
    evaluation.liveTrials < 10
      ? "Early evaluation: collect more live predictions before drawing a performance conclusion."
      : evaluation.brier < evaluation.baselineBrier
        ? "The personal learner has lower error on these live trials. This is not independent validation."
        : "The pooled baseline is matching or outperforming the personal learner on these live trials.";
  return (
    <section
      className="lab-card learner-card"
      aria-labelledby="personal-learner-title"
    >
      <div className="lab-card-head">
        <div>
          <h2 id="personal-learner-title">Recall by condition</h2>
          <p className="learner-intro">
            Level {state.difficultyLevel} estimates only. Wider intervals mean
            more uncertainty.
          </p>
        </div>
        <span className="lab-tag">
          <Brain size={14} />
          {state.trainingTrials} completed rounds
        </span>
      </div>
      <div className="learned-condition-grid">
        {rows.map((row) => (
          <article key={row.condition}>
            <h3>{CONDITIONS[row.condition].name}</h3>
            <strong>{percent(row.probability)}</strong>
            <span>Estimated recall per object</span>
            <div className="learned-interval" aria-hidden="true">
              <i
                style={{
                  left: `${row.interval.low * 100}%`,
                  width: `${(row.interval.high - row.interval.low) * 100}%`,
                }}
              />
              <b style={{ left: `${row.probability * 100}%` }} />
            </div>
            <p>
              {percent(row.interval.low)}–{percent(row.interval.high)} model
              interval
            </p>
            <small>
              {row.conditionTrials
                ? `${row.conditionTrials} valid training trials`
                : "Prior only · no observations"}
            </small>
          </article>
        ))}
      </div>
      <div className="learner-evaluation">
        <div>
          <h3>Does it predict better than a simple baseline?</h3>
          <p>
            Every live forecast is scored against the subsequent answers before
            training on that trial. The baseline learns one recall rate across
            conditions at the same difficulty.
          </p>
        </div>
        <div className="learner-score-grid">
          <div>
            <span>Personal model · Brier error</span>
            <strong>
              {evaluation.brier === null ? "—" : evaluation.brier.toFixed(3)}
            </strong>
          </div>
          <div>
            <span>Pooled baseline · Brier error</span>
            <strong>
              {evaluation.baselineBrier === null
                ? "—"
                : evaluation.baselineBrier.toFixed(3)}
            </strong>
          </div>
          <div>
            <span>Live forecasts evaluated</span>
            <strong>{evaluation.liveTrials}</strong>
          </div>
        </div>
        <p className="evaluation-explanation">
          Lower error is better; zero is perfect. {comparison}
        </p>
        <p className="learner-provenance">
          {evaluation.reconstructedTrials} historical trials reconstructed from
          ordered session history. They train the learner but are not included
          in the live error scores.
        </p>
        <details className="forecast-history">
          <summary>Inspect predictions and answers</summary>
          <div className="journal-scroll">
            <table className="journal-table">
              <thead>
                <tr>
                  <th>Trial</th>
                  <th>Condition</th>
                  <th>Forecast</th>
                  <th>Observed</th>
                  <th>Model error</th>
                  <th>Prediction provenance</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.rows.slice(-12).map((row) => (
                  <tr key={row.trialIndex}>
                    <td>{row.trialIndex + 1}</td>
                    <td>{CONDITIONS[row.condition].short}</td>
                    <td>
                      {row.expectedCorrect.toFixed(1)}/{row.objectCount}
                      <small>{percent(row.probability)} per object</small>
                    </td>
                    <td>
                      {row.correct}/{row.objectCount}
                    </td>
                    <td>{row.brier.toFixed(3)}</td>
                    <td>
                      {row.provenance === "live"
                        ? "Recorded before trial"
                        : "Reconstructed history"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!evaluation.rows.length && (
              <p className="empty-copy">
                Complete a valid trial to record the first prediction and
                outcome.
              </p>
            )}
          </div>
          <p>
            Last 12 eligible trials. Live log loss:{" "}
            {evaluation.logLoss === null ? "—" : evaluation.logLoss.toFixed(3)};
            pooled baseline:{" "}
            {evaluation.baselineLogLoss === null
              ? "—"
              : evaluation.baselineLogLoss.toFixed(3)}
            . Lower is better.
          </p>
        </details>
      </div>
      <p className="lab-card-note">
        <Info size={15} />
        <span>
          Beta-binomial learner · equal Beta(2,2) priors · approximate 95% model
          intervals. Dependent items, practice effects and adaptive selection
          limit interpretation.{" "}
          <button className="lab-text" onClick={onMethods}>
            Read the model assumptions
          </button>
        </span>
      </p>
    </section>
  );
}
