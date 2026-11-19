# Three-minute personal-learner walkthrough

**0:00–0:25 — The model's job**
“Recall Fieldnotes learns to predict recall performance on its own tasks. It estimates four condition-specific recall rates, selects useful comparisons, and evaluates its predictions. It does not infer disease risk or brain-network function.”

**0:25–0:50 — A forecast before the answer**
Show the forecast card before clicking Begin comparison. At the start, each condition has a broad Beta(2,2) prior. Start the first trial and point to the recorded forecast. It remains fixed throughout study, retention and recall.

**0:50–1:30 — Play and learn**
Complete the two randomized trials. The second trial's forecast is recorded when it starts and can use the first valid trial's result. Point to the actual versus expected recall. No interrupted trial or courtyard probe trains the learner.

**1:30–2:05 — Inspect the personal model**
Open Results. Show the learned condition rates and intervals. “These are parameter estimates shaped by answers and a stated prior, not raw accuracy percentages or medical probabilities.” Unobserved conditions remain at the prior. The original fixed hypotheses appear separately below.

**2:05–2:35 — Check whether learning helps**
Show the personal learner and pooled-baseline Brier errors, live prediction count and prediction history. “We score forecasts before updating on each result. The baseline can win. These early, adaptively sampled observations do not establish generalization.”

**2:35–3:00 — Continue and audit**
Inspect the scheduler: it chooses a comparison expected to reduce uncertainty in the learned rates, subject to coverage. Export the session to preserve history and model methodology. Explain that importing restores learning but labels historical predictions as reconstructed rather than live. Open Methods for assumptions and mathematical references.

## Remaining research and submission work

- Collect consented, appropriately governed task sessions before making population-performance claims.
- Evaluate the scheduler against fixed/random policies and assess predictions on independent participants and sessions.
- Validate task difficulty, learning effects, accessibility, device confounds and participant burden. Item independence, stationary rates and prior choice need scrutiny.
- Integrate imaging only after approved access, reproducible preprocessing and a validated scientific model. No task-to-connectome mapping exists here.
- Record the video and confirm competition rules, timezone, deadline and submission destination. No recording or submission has been made.

## Progressive challenge demonstration

Select Level 4 · Divided attention in Practice difficulty to show five objects and the live even/odd retention task. Complete both trials; show Results filtered to level four and explain that these answers update the level-four learner. Manual level selection does not advance automatic progression. For a three-minute video, use a labeled prepared demonstration session to inspect history and uncertainty after the playable segment. Do not present demonstration answers or synthetic smoke metrics as participant-study evidence. See [progression protocol](docs/DIFFICULTY.md).
