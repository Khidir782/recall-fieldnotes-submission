import React from "react";
import { X, ArrowRight, ArrowUpRight } from "lucide-react";
import { useDialog } from "../hooks/useDialog";

export default function Methods({ close }) {
  const ref = useDialog(true, close);
  return (
    <div
      className="lab-overlay"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <section
        className="lab-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="methods-title"
        ref={ref}
        tabIndex={-1}
      >
        <button
          className="lab-icon modal-x"
          onClick={close}
          aria-label="Close methods"
        >
          <X size={20} />
        </button>
        <h2 id="methods-title">About & methods</h2>
        <p>
          This lab measures performance on its own tasks. It does not infer
          brain-network function, diagnose disease, or recommend treatment.
        </p>
        <h3>Experimental design</h3>
        <p>
          Each pair compares quiet recall with one changed factor: irrelevant
          visual notifications during the eight-second study period, a
          nine-second rather than three-second retention interval, or three
          candidate locations rather than six at recall. Load is always three
          objects. Pair order is seeded and randomized. Routes differ between
          trials; unequal route difficulty, practice and carryover remain
          possible confounds.
        </p>
        <h3>Supervised task-performance model</h3>
        <p>
          The separate supervised pipeline fits regularized logistic-regression
          weights offline with scikit-learn. Its target is task success: at
          least two of three objects recalled. Inputs are the task condition and
          preceding valid-trial accuracy, counts and response times.
          Current-trial answers and timings are excluded.
        </p>
        <p>
          Permission-recorded training exports use one anonymous key per
          participant across sessions. The Python pipeline reserves whole
          participants for a fixed holdout, selects regularization with grouped
          cross-validation on training participants only, and fits preprocessing
          inside each fold. It reports held-out Brier error, log loss and AUC
          against a training-prior baseline. Five participants and 50 trials are
          minimum engineering guards, not evidence of reliable performance. No
          observed participant dataset or fitted participant weights are
          bundled.
        </p>
        <p>
          A compatible observed-data JSON artifact can be loaded locally. Its
          weights and preprocessing run in the browser; each supported trial
          records a forecast before study. Unsupported conditions are skipped
          and out-of-range features are flagged. Weights stay fixed until
          retraining offline and loading a replacement. Artifact provenance is
          self-attested, not independently certified. Synthetic smoke-test
          artifacts cannot activate in the app. This model is separate from both
          the Bayesian learner and the fixed hypotheses.
        </p>
        <h3>Personal recall learner</h3>
        <p>
          The personal learner estimates four separate per-object recall rates.
          Each starts with a Beta(2,2) prior: mean 50%, with broad uncertainty.
          After a valid three-object trial, correct answers are added to alpha
          and incorrect answers to beta for that condition. This changes the
          learned parameters; no fixed interruption penalty or cue benefit is
          imposed.
        </p>
        <p>
          The displayed intervals are approximate 95% beta model intervals,
          computed on a 2,000-bin probability grid. They describe uncertainty
          under the item-independence assumption, not a guarantee about future
          outcomes. Within-trial dependence, practice, fatigue, device effects
          and drift are not modeled; intervals can be too narrow.
        </p>
        <h3>Predict, score, then update</h3>
        <p>
          Before study begins, the app records the condition forecast,
          training-history fingerprint, model version, timestamp and a
          pooled-baseline forecast. Those forecasts stay fixed through all three
          answers. Valid live forecasts are scored against the subsequent
          answers with mean per-item Brier error and log loss. Lower is better.
          The pooled baseline uses the same Beta(2,2) prior but learns one rate
          across all conditions.
        </p>
        <p>
          Evaluation is sequential on adaptively selected tasks, not an
          independent cohort test. More observations do not guarantee better
          predictions. Imported or old records are replayed in file order: their
          predictions are reconstructed from earlier records and shown
          separately, not counted as recorded-live forecasts. A fingerprint
          checks consistency, not authenticity. Export preserves the task
          history. Completed rounds restore from device storage; restored
          forecasts are reconstructed, not counted as recorded-live predictions.
        </p>
        <h3>Separate fixed comparison hypotheses</h3>
        <p>
          Each hypothesis is combined with baseline item-success probabilities
          of 45%, 65% and 85%. All twelve states start equally weighted. The
          likelihood assumes three conditionally independent item responses per
          trial. An interruption or delay hypothesis applies a fixed −20
          percentage-point effect; the cue hypothesis applies +15 points. These
          effect sizes and baseline levels are illustrative assumptions, not
          learned or calibrated.
        </p>
        <p>
          Posterior weights compare these four assumed models. They are not
          confidence in a cognitive diagnosis. Shared-trial errors, learning and
          fatigue are not modeled, so the weights can overstate certainty.
          Response times are recorded but do not enter the model.
        </p>
        <h3>How the next pair is chosen</h3>
        <p>
          The personal learner enumerates the four possible correct counts for
          each condition using its beta-binomial predictive distribution. It
          selects the quiet/contrast pair with the greatest expected reduction
          in the sum of recall-rate posterior variances. A coverage constraint
          limits candidates to within one valid trial of the least-tested
          contrast; order is randomized. The old fixed-hypothesis entropy
          scheduler remains in the source for reference and tests but does not
          choose live tasks.
        </p>
        <h3>Checks and separate probes</h3>
        <p>
          Hiding the browser tab or opening methods over an active task excludes
          that trial from analysis. Interrupted or incomplete comparisons should
          be repeated. Alternate-layout probes are displayed separately and
          excluded from both model updates and scheduling. A probe is not proof
          of real-world transfer. Item-level accuracy intervals in the evidence
          view assume independent responses; three items in a trial are not
          truly independent observations.
        </p>
        <h3>Saving, privacy, and research permission</h3>
        <p>
          Completed guest rounds save automatically in IndexedDB on this device.
          Optional Google sign-in enables private cloud history where
          configured. Guest history is copied only after an explicit action.
          Sign-out clears the account workspace cached on this device;
          unfinished rounds are not restored.
        </p>
        <p>
          Cloud rounds expire 365 days after server receipt. You can delete
          sessions or your account earlier. Research permission is separate, off
          by default, and applies only to a selected session. The private admin
          export includes only currently permissioned, unexpired responses under
          pseudonymous keys. Browser responses are client-reported, not
          independently verified. Withdrawn permission excludes future exports
          but cannot recall copies already downloaded or previously released
          models.
        </p>
        <p>
          The host can process ordinary request metadata. Google handles sign-in
          and fonts. See the privacy page for the data stored, backup retention,
          deletion controls, and contact information.
        </p>
        <a href="/privacy">
          Privacy & research permission <ArrowUpRight size={14} />
        </a>
        <h3>Research context</h3>
        <p>
          The task-performance model learns from permission-recorded recall-task
          exports and requires no external imaging dataset. The Stanford report
          below is background reading, not evidence validating this task or its
          predictions. This project is independent and is not affiliated with or
          endorsed by Stanford University. No task-to-connectome mapping or
          cognitive-training benefit is claimed.
        </p>
        <a
          href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.beta.html"
          target="_blank"
          rel="noreferrer"
        >
          Beta distribution reference <ArrowUpRight size={14} />
        </a>
        <a
          href="https://scikit-learn.org/stable/modules/generated/sklearn.metrics.brier_score_loss.html"
          target="_blank"
          rel="noreferrer"
        >
          Brier scoring reference <ArrowUpRight size={14} />
        </a>
        <a
          href="https://med.stanford.edu/news/all-news/2026/11/alzheimers-brain-activity.html"
          target="_blank"
          rel="noreferrer"
        >
          Stanford Medicine · background reading <ArrowUpRight size={14} />
        </a>
        <button className="lab-primary" onClick={close}>
          Back to practice <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
