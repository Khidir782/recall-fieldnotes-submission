# Supervised task-performance training

This pipeline fits a regularized **logistic regression** model with scikit-learn. It is separate from the in-browser Bayesian recall estimator. No fitted participant model is shipped until an observed dataset is supplied.

## Target and features

The binary target is **recall at least two of three objects on the upcoming apartment trial**. The browser and dataset builder share `src/taskPerformance.js` and the versioned feature list:

- Four task-condition indicators.
- Log count of prior valid trials and prior same-condition trials.
- Overall, same-condition, latest and last-five-trial recall accuracy.
- Upper median response time (seconds, capped at 60) from preceding valid trials, or zero before any observations.

Accuracy features default to 0.5 at cold start. The current trial's answers, correct count and response times are never inputs. Participant identifiers and session identifiers are not features. Invalid trials and courtyard probes do not become training examples or history. Feature history is scoped to the ordered trials included in each export; held-out participants' past answers can be available sequentially at prediction time.

## Collect observed data

1. Participants sign in to a configured Cloudflare deployment and opt selected sessions into research in **History**. Permission is separate from cloud saving and off by default. A server-generated participant key is stable across that account's sessions.
2. In Access-protected **/admin**, select up to ten currently permissioned sessions and export a private `recall-training-bundle-v1` file. Expired rounds and withdrawn sessions are excluded. Browser observations are client-reported, not independently verified.
3. Save bundles locally under ignored `data/`. The shared builder accepts both bundles and legacy individual exports, deduplicates repeated/incremental records, and rejects conflicting participant labels. Do not mix participants in one session. Follow an appropriate research process before collecting data.

## Train and evaluate

From the repository root:

```sh
.venv/bin/pip install -r ml/requirements.txt
.venv/bin/python ml/train.py data/*.json --output artifacts/pilot
```

The app already requires Node; the Python CLI invokes the shared Node dataset builder. Minimum guards are five participants and 50 valid trials, at least 30 training/10 test trials, at least five training examples per outcome and two test examples per outcome. These are engineering guards for running a small pilot, **not** validated sample-size or quality requirements.

The pipeline reserves 25% of participants (at least two) with a fixed seed of 42. Every session from a participant stays on one side. It does not reroll the holdout to improve results. On training participants only, grouped cross-validation selects C from 0.1, 1, and 10 using log loss. `StandardScaler` is fitted inside each training fold; the final scaler and classifier are fitted only to the training partition. The test set is evaluated once after this selection. Class imbalance or insufficient fold diversity stops training with an actionable error.

Reports compare held-out Brier error, log loss and AUROC with a training-prior `DummyClassifier`. No automatic promotion based on a single metric occurs. Small holdouts, adaptive task selection, sample bias and shared histories limit interpretation; assess participant/subgroup behavior and independent sessions before relying on predictions.

Outputs:

- `artifacts/pilot/task-model.json`: portable weights, training-only scaling/ranges, ordered feature schema, condition coverage, model identity, dataset hash, and pilot holdout metrics. No participant keys or raw answers are included.
- `artifacts/pilot/evaluation.json`: local audit report with split participant keys and held-out predictions. Keep this report private.

`data/` and `artifacts/` are Git-ignored. No model file is automatically uploaded or published.

## Load the fitted model

Use the artifact inspection card in **/admin** to validate `task-model.json` without publishing it. Review the private evaluation report and participant/subgroup behavior, then explicitly prepare a release:

```sh
node scripts/release-model.mjs artifacts/pilot/task-model.json --reviewed
```

The release gate rejects synthetic artifacts and requires lower held-out Brier error and log loss than the baseline; it does not establish generalization or scientific validity. Commit only the resulting `public/models/current.json` and deploy the reviewed source. The participant app automatically loads compatible weights and freezes each forecast before study; raw datasets and private evaluation reports are not bundled. No model is published automatically and no participant-trained artifact is included yet. Restored history reconstructs forecasts; weights stay fixed until a reviewed replacement is deployed. See [production handoff](../docs/PRODUCTION.md).

## Synthetic pipeline smoke test

This verifies parameter fitting, grouped evaluation, CLI output and Python/browser parity. It is not evidence about humans:

```sh
node ml/smoke-fixture.mjs data/smoke
.venv/bin/python ml/train.py data/smoke/*.json --output artifacts/smoke --allow-synthetic-smoke-test
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

Synthetic training is refused without the explicit flag. Its artifact stays labeled `synthetic_smoke_test` and **cannot be activated in the app**. Do not change that label to make it load.

Technical references: [grouped folds](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.GroupKFold.html), [logistic regression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html), and [preprocessing/data-leakage guidance](https://scikit-learn.org/stable/common_pitfalls.html).
