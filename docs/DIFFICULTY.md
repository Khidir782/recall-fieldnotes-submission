# Progressive recall protocol

Protocol: `recall-progressive-v1`. All four levels are part of the same practice and learning flow, not an isolated game.

| Level | Objects | Study | Base retention | Retention task |
| --- | --- | --- | --- | --- |
| 1 · Foundation | 3 | 8 seconds | 3 seconds | None |
| 2 · Association | 4 | 8 seconds | 6 seconds | None |
| 3 · Extended recall | 5 | 8 seconds | 9 seconds | None |
| 4 · Divided attention | 5 | 8 seconds | 12 seconds | Even/odd number every 3 seconds |

Each pair compares quiet recall with interruptions during study, a delay six seconds longer than the base, or three candidate locations at recall. Both trials use the same difficulty and object count, and their order is randomized. At level four, even the quiet condition includes the retention task; “quiet” means no added study notifications, delay contrast or location cues at that level. Results should only be compared within the same level. Level settings change several factors together and do not isolate the cause of differences across levels.

## Progression and reference trials

Automatic progression begins at level one. Two consecutive qualifying automatic comparisons with at least 80% aggregate item accuracy raise the level by one, capped at four. A qualifying comparison with at most 40% lowers it by one, floored at one. Intermediate performance resets the promotion streak. Each comparison must contain two valid trials at the planned level, different conditions including quiet, and both order positions. Abandoned, excluded and manually selected comparisons do not count.

Every fourth completed automatic comparison uses the original level-one task as a reference. Its result trains the level-one learner but cannot promote or demote the progressive level. This is a repeatable reference task, not a standardized clinical assessment. Manual selection allows all levels immediately; those results train their difficulty's learner and can enter permissioned supervised exports without changing automatic progression. Restoring a session reconstructs progression from its completed pairs. A new session restarts progression.

## Learning and data

The Bayesian learner maintains separate Beta(2,2) recall-rate estimates by condition and level. A valid trial contributes its actual correct and incorrect item counts. Predictions, count distributions, Brier error and log loss support three, four and five items. The comparison scheduler considers only history at the chosen level. The simpler pooled baseline also stays within that level. Results have a difficulty filter; the overall progress accuracy is explicitly labeled as mixed levels.

The fixed illustrative research hypotheses continue to use level-one apartment observations only. Courtyard probes remain level one and do not train either task model. They do not establish real-world transfer.

Session records include protocol version, difficulty, canonical settings, automatic/manual selection, reference status, answers, timings and level-four distraction answers. Import and server scoring regenerate placements/settings from the seed and level, recompute scores and parity correctness, and reject malformed responses. The server stores these fields in the existing round JSON; no database migration is needed. Old three-object files import as level one. Imports and restored sessions reconstruct forecasts; they never manufacture live prediction metrics.

The offline supervised target is `recall_at_least_two_thirds`, rounded up to an integer count. Features include prescribed load and delay plus normalized past performance. Current answers and timings, including distraction responses, are excluded from current-trial features. Participant-separated evaluation and explicit research permission still apply. Old fitted artifacts are incompatible with v2 features and require retraining. No observed-data model is supplied by this change.

Even/odd responses are descriptive secondary-task observations. A missed number is the absence of a response at its index; total presented is derived from the prescribed retention duration. Missing responses do not invalidate the recall trial. Researchers must inspect engagement before making claims about divided attention. The task does not prevent rehearsing or independently verify compliance.

## Reviewer walkthrough and release

1. Select level four from Practice difficulty and start a comparison.
2. Study five objects, answer even/odd questions during retention, then place all five objects.
3. Complete the second round. Inspect five-object feedback, secondary-task summary, and Results filtered to level four.
4. Expand prediction checks to see level-specific forecasts and baseline error. In History, inspect the level, object count, wait duration and recorded route.
5. Refresh and verify history restores. Automatic progression is exercised by completing qualifying automatic comparisons; manual demonstration does not advance it.

Deploy the frontend and Pages Functions together using the production instructions. The previous server version only accepts three-object records. No live deployment or automatic retraining is performed by building this source. Update the public submission snapshot after review, keeping account-specific configuration and participant files excluded.

The levels and progression thresholds are engineering choices requiring usability and reliability evaluation. Greater complexity and more data do not by themselves demonstrate better predictions, improved memory or clinical utility.
